"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import type { Permission } from "@/modules/auth/rbac";
import { checkStaff, requestMeta, type StaffContext } from "@/modules/auth/session";
import { TAGS } from "./cache-tags";
import { CatalogError, deleteCategory, saveCategory } from "./categories";
import { deleteCollection, saveCollection } from "./collections";
import { adjustStock, recordPurchaseBatch } from "./inventory";
import { deleteProduct, duplicateProduct, saveProduct, setProductStatus, type ProductStatus } from "./products";
import { productTags, refreshTags, scopeOfProducts } from "./store-refresh";
import {
  adjustStockInput,
  categoryInput,
  collectionInput,
  firstError,
  productInput,
  purchaseBatchInput,
} from "./schemas";

/**
 * Admin catalogue actions. Every action: permission check → zod validation → change → audit log →
 * on-demand revalidation of just the store pages the change affects (NFR-SC-02, see store-refresh.ts).
 */

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

const idSchema = z.string().regex(/^[a-f0-9]{24}$/i);

type Guarded = { error: string } | { ctx: StaffContext; meta: { ip: string | null; userAgent: string | null } };

async function guard(permission: Permission): Promise<Guarded> {
  const g = await checkStaff(permission);
  if (!g.ok) return { error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  return { ctx: g.ctx, meta: await requestMeta() };
}

function actor(g: { ctx: StaffContext }) {
  return { id: g.ctx.user.id, email: g.ctx.user.email };
}

/** Runs the change and turns known errors into a message; unknown errors are logged, not shown. */
async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CatalogError) return { ok: false, error: err.message };
    if (err && typeof err === "object" && "code" in err && err.code === 11000)
      return { ok: false, error: "Something with the same slug or SKU already exists." };
    logger.error({ err }, "catalog action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// ---------- Categories ----------

export async function saveCategoryAction(id: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const g = await guard("products.edit");
  if ("error" in g) return { ok: false, error: g.error };
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    const { before, after } = await saveCategory(id, parsed.data);
    await writeAudit({
      actor: actor(g),
      action: id ? "category.update" : "category.create",
      entity: "category",
      entityId: after.id,
      before,
      after,
      ...g.meta,
    });
    // The tree feeds menus, breadcrumbs, filters and which products a parent page lists: navigation.
    refreshTags([TAGS.category(after.slug), ...(before ? [TAGS.category(before.slug)] : []), TAGS.navigation]);
    refresh();
    return { ok: true, message: "Category saved.", data: { id: after.id } };
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const g = await guard("products.delete");
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  return run(async () => {
    const before = await deleteCategory(id);
    await writeAudit({
      actor: actor(g),
      action: "category.delete",
      entity: "category",
      entityId: id,
      before,
      ...g.meta,
    });
    refreshTags([TAGS.category(before.slug), TAGS.navigation]);
    refresh();
    return { ok: true, message: "Category deleted." };
  });
}

// ---------- Collections ----------

export async function saveCollectionAction(id: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const g = await guard("products.edit");
  if ("error" in g) return { ok: false, error: g.error };
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  const parsed = collectionInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    const { before, after } = await saveCollection(id, parsed.data);
    await writeAudit({
      actor: actor(g),
      action: id ? "collection.update" : "collection.create",
      entity: "collection",
      entityId: after.id,
      before,
      after,
      ...g.meta,
    });
    refreshTags([TAGS.collection(after.slug), ...(before ? [TAGS.collection(before.slug)] : []), TAGS.navigation]);
    refresh();
    return { ok: true, message: "Collection saved.", data: { id: after.id } };
  });
}

export async function deleteCollectionAction(id: string): Promise<ActionResult> {
  const g = await guard("products.delete");
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  return run(async () => {
    const before = await deleteCollection(id);
    await writeAudit({
      actor: actor(g),
      action: "collection.delete",
      entity: "collection",
      entityId: id,
      before,
      ...g.meta,
    });
    refreshTags([TAGS.collection(before.slug), TAGS.navigation]);
    refresh();
    return { ok: true, message: "Collection deleted." };
  });
}

// ---------- Products ----------

export async function saveProductAction(id: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const g = await guard("products.edit");
  if ("error" in g) return { ok: false, error: g.error };
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  const parsed = productInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    const { before, after } = await saveProduct(id, parsed.data, g.ctx.user.id);
    await writeAudit({
      actor: actor(g),
      action: id ? "product.update" : "product.create",
      entity: "product",
      entityId: after.id,
      before: before ? auditView(before) : null,
      after: auditView(after),
      ...g.meta,
    });
    const scope = [{ id: after.id, slug: after.slug, categoryIds: after.categoryIds }];
    if (before) scope.push({ id: after.id, slug: before.slug, categoryIds: before.categoryIds });
    refreshTags(await productTags(scope));
    refresh();
    return { ok: true, message: "Product saved.", data: { id: after.id } };
  });
}

/** Keeps audit entries small: the fields people actually ask about later. */
function auditView(p: Awaited<ReturnType<typeof saveProduct>>["after"]) {
  return {
    title: p.title.en,
    slug: p.slug,
    status: p.status,
    categoryIds: p.categoryIds,
    labels: p.labels,
    media: p.media.length,
    variants: p.variants.map((v) => ({
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      active: v.active,
    })),
  };
}

export async function duplicateProductAction(id: string): Promise<ActionResult<{ id: string }>> {
  const g = await guard("products.edit");
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  return run(async () => {
    const { after } = await duplicateProduct(id, g.ctx.user.id);
    await writeAudit({
      actor: actor(g),
      action: "product.duplicate",
      entity: "product",
      entityId: after.id,
      after: { from: id, slug: after.slug },
      ...g.meta,
    });
    refresh();
    return { ok: true, message: "Copy created as a draft.", data: { id: after.id } };
  });
}

export async function setProductStatusAction(id: string, status: ProductStatus): Promise<ActionResult> {
  const g = await guard(status === "archived" ? "products.delete" : "products.edit");
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(id).success || !["draft", "active", "archived"].includes(status))
    return { ok: false, error: "Invalid request." };
  return run(async () => {
    const res = await setProductStatus(id, status);
    await writeAudit({
      actor: actor(g),
      action: "product.status",
      entity: "product",
      entityId: id,
      before: { status: res.before },
      after: { status },
      ...g.meta,
    });
    refreshTags(await productTags(await scopeOfProducts([id])));
    refresh();
    return { ok: true, message: `Product is now ${status}.` };
  });
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  const g = await guard("products.delete");
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid id." };
  return run(async () => {
    // Read its categories first: they are what the deleted product's pages were listed on.
    const scope = await scopeOfProducts([id]);
    const { slug } = await deleteProduct(id);
    await writeAudit({
      actor: actor(g),
      action: "product.delete",
      entity: "product",
      entityId: id,
      before: { slug },
      ...g.meta,
    });
    refreshTags(await productTags(scope));
    refresh();
    return { ok: true, message: "Product deleted." };
  });
}

// ---------- Inventory ----------

export async function adjustStockAction(raw: unknown): Promise<ActionResult> {
  const g = await guard("inventory.edit");
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = adjustStockInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    const res = await adjustStock(parsed.data, g.ctx.user.id);
    await writeAudit({
      actor: actor(g),
      action: "inventory.adjust",
      entity: "variant",
      entityId: parsed.data.variantId,
      before: { sku: res.sku, stock: res.stockBefore },
      after: { stock: res.stockAfter, reason: parsed.data.reason, note: parsed.data.note },
      ...g.meta,
    });
    // Stock shows on the product page and as "sold out" on its cards.
    refreshTags(await productTags(await scopeOfProducts([res.productId])));
    refresh();
    return { ok: true, message: `${res.sku}: stock is now ${res.stockAfter}.` };
  });
}

export async function recordPurchaseBatchAction(raw: unknown): Promise<ActionResult<{ batchNo: string }>> {
  const g = await guard("inventory.edit");
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = purchaseBatchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    const res = await recordPurchaseBatch(parsed.data, g.ctx.user.id);
    await writeAudit({
      actor: actor(g),
      action: "inventory.purchase_batch",
      entity: "purchaseBatch",
      entityId: res.batchId,
      after: {
        batchNo: res.batchNo,
        goodsTotal: res.goodsTotal,
        landedTotal: res.landedTotal,
        items: res.items.map((i) => ({ sku: i.sku, qty: i.qty, landedUnitCost: i.landedUnitCost })),
      },
      ...g.meta,
    });
    refreshTags(await productTags(await scopeOfProducts(res.productIds)));
    refresh();
    return { ok: true, message: `Batch ${res.batchNo} received.`, data: { batchNo: res.batchNo } };
  });
}
