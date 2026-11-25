import "server-only";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { formatSequence, nextSequence } from "@/modules/shared/counters";
import { CatalogError } from "./categories";
import { allocateLandedCost, weightedAverageCost } from "./logic";
import { InventoryMovement, Product, PurchaseBatch, Variant } from "./models";
import { syncProductFromVariants } from "./products";
import type { PurchaseBatchInput } from "./schemas";

/** Inventory (FR-AD-04): stock per variant, low-stock list, movement history, purchase batches with landed cost. */

const { ObjectId } = mongoose.Types;
type AnyDoc = Record<string, unknown> & { _id: { toString(): string } };

export type InventoryRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  variantTitle: string;
  sku: string;
  stock: number;
  reserved: number;
  available: number;
  lowStockAt: number;
  low: boolean;
  costPrice: number;
  price: number;
  active: boolean;
};

export async function listInventory(opts: { q?: string; lowOnly?: boolean }): Promise<InventoryRow[]> {
  await connectMongoose();
  const pipeline: mongoose.PipelineStage[] = [
    { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "p" } },
    { $unwind: "$p" },
    { $match: { "p.deletedAt": null } },
    {
      $addFields: {
        available: { $subtract: ["$stock", "$reserved"] },
        threshold: { $ifNull: ["$lowStockAt", "$p.lowStockAt"] },
      },
    },
  ];
  if (opts.q?.trim()) {
    const rx = new RegExp(
      opts.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .slice(0, 60),
      "i",
    );
    pipeline.push({ $match: { $or: [{ sku: rx }, { "p.title.en": rx }, { title: rx }] } });
  }
  if (opts.lowOnly) pipeline.push({ $match: { active: true, $expr: { $lte: ["$available", "$threshold"] } } });
  pipeline.push({ $sort: { available: 1, sku: 1 } }, { $limit: 500 });

  const docs = await Variant.aggregate<AnyDoc & { p: AnyDoc; available: number; threshold: number }>(pipeline);
  return docs.map((v) => ({
    variantId: v._id.toString(),
    productId: String(v.productId),
    productTitle: (v.p.title as { en: string }).en,
    productSlug: String(v.p.slug),
    variantTitle: String(v.title ?? ""),
    sku: String(v.sku),
    stock: Number(v.stock),
    reserved: Number(v.reserved ?? 0),
    available: v.available,
    lowStockAt: Number(v.threshold ?? 5),
    low: v.available <= Number(v.threshold ?? 5),
    costPrice: Number(v.costPrice ?? 0),
    price: Number(v.price),
    active: v.active !== false,
  }));
}

/** Manual stock change (count correction, damage, customer return). Atomic; never goes below 0. */
export async function adjustStock(
  input: { variantId: string; change: number; reason: "adjust" | "damage" | "return" | string; note: string },
  actorId: string,
) {
  await connectMongoose();
  const vid = new ObjectId(input.variantId);
  const filter = input.change < 0 ? trustFilter({ _id: vid, stock: { $gte: -input.change } }) : { _id: vid };
  const updated = await Variant.findOneAndUpdate(
    filter,
    { $inc: { stock: input.change } },
    { new: true },
  ).lean<AnyDoc>();
  if (!updated) {
    const exists = await Variant.exists({ _id: vid });
    throw new CatalogError(exists ? "Not enough stock to remove that many." : "Variant not found.");
  }
  await InventoryMovement.create({
    variantId: vid,
    productId: updated.productId,
    change: input.change,
    stockAfter: Number(updated.stock),
    reason: input.reason,
    note: input.note,
    byUserId: actorId,
  });
  const slug = await syncProductFromVariants(updated.productId as mongoose.Types.ObjectId);
  return {
    sku: String(updated.sku),
    stockBefore: Number(updated.stock) - input.change,
    stockAfter: Number(updated.stock),
    slug,
    productId: String(updated.productId),
  };
}

export type MovementRow = {
  id: string;
  createdAt: string;
  sku: string;
  change: number;
  stockAfter: number;
  reason: string;
  note: string;
  costPerUnit: number | null;
  refId: string | null;
};

export async function listMovements(opts: { variantId?: string; limit?: number }): Promise<MovementRow[]> {
  await connectMongoose();
  const filter =
    opts.variantId && /^[a-f0-9]{24}$/i.test(opts.variantId) ? { variantId: new ObjectId(opts.variantId) } : {};
  const docs = await InventoryMovement.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(opts.limit ?? 100, 500))
    .lean<AnyDoc[]>();
  const skus = new Map(
    (
      await Variant.find(
        trustFilter({ _id: { $in: [...new Set(docs.map((d) => String(d.variantId)))].map((i) => new ObjectId(i)) } }),
      )
        .select("sku")
        .lean<AnyDoc[]>()
    ).map((v) => [v._id.toString(), String(v.sku)]),
  );
  return docs.map((d) => ({
    id: d._id.toString(),
    createdAt: new Date(d.createdAt as Date).toISOString(),
    sku: skus.get(String(d.variantId)) ?? "—",
    change: Number(d.change),
    stockAfter: Number(d.stockAfter),
    reason: String(d.reason),
    note: String(d.note ?? ""),
    costPerUnit: d.costPerUnit == null ? null : Number(d.costPerUnit),
    refId: d.refId == null ? null : String(d.refId),
  }));
}

/**
 * Receives a purchase batch in one transaction: adds stock, spreads shipping/customs/other costs
 * over the items (landed cost), updates each variant's weighted average cost and logs movements.
 */
export async function recordPurchaseBatch(input: PurchaseBatchInput, actorId: string) {
  await connectMongoose();
  const variants = await Variant.find(
    trustFilter({ _id: { $in: input.items.map((i) => new ObjectId(i.variantId)) } }),
  ).lean<AnyDoc[]>();
  if (variants.length !== input.items.length) throw new CatalogError("One of the variants no longer exists.");
  const byId = new Map(variants.map((v) => [v._id.toString(), v]));

  const extra = input.shippingCost + input.customsCost + input.otherCost;
  const landed = allocateLandedCost(input.items, extra);
  const goodsTotal = input.items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  const year = input.receivedAt.getFullYear();
  const batchNo = formatSequence(`PB-${year}-`, await nextSequence(`purchaseBatch:${year}`), 4);

  const items = input.items.map((i, idx) => {
    const v = byId.get(i.variantId)!;
    return {
      variantId: v._id,
      productId: v.productId,
      sku: String(v.sku),
      qty: i.qty,
      unitCost: i.unitCost,
      landedUnitCost: landed[idx]?.landedUnitCost ?? i.unitCost,
    };
  });

  const session = await mongoose.startSession();
  let batchId = "";
  try {
    await session.withTransaction(async () => {
      const [batch] = await PurchaseBatch.create(
        [
          {
            batchNo,
            supplier: input.supplier,
            receivedAt: input.receivedAt,
            items,
            shippingCost: input.shippingCost,
            customsCost: input.customsCost,
            otherCost: input.otherCost,
            goodsTotal,
            landedTotal: goodsTotal + extra,
            note: input.note,
            byUserId: actorId,
          },
        ],
        { session },
      );
      batchId = batch._id.toString();
      for (const item of items) {
        const current = await Variant.findById(item.variantId).session(session).lean<AnyDoc>();
        if (!current) throw new CatalogError("One of the variants no longer exists.");
        const cost = weightedAverageCost(
          Number(current.stock),
          Number(current.costPrice ?? 0),
          item.qty,
          item.landedUnitCost,
        );
        const updated = await Variant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stock: item.qty }, $set: { costPrice: cost } },
          { new: true, session },
        ).lean<AnyDoc>();
        await InventoryMovement.create(
          [
            {
              variantId: item.variantId,
              productId: item.productId,
              change: item.qty,
              stockAfter: Number(updated!.stock),
              reason: "purchase",
              refId: batchNo,
              costPerUnit: item.landedUnitCost,
              byUserId: actorId,
            },
          ],
          { session },
        );
      }
      for (const pid of new Set(items.map((i) => String(i.productId)))) await syncProductFromVariants(pid, session);
    });
  } finally {
    await session.endSession();
  }
  const slugs = (
    await Product.find(trustFilter({ _id: { $in: [...new Set(items.map((i) => i.productId))] } }))
      .select("slug")
      .lean<AnyDoc[]>()
  ).map((p) => String(p.slug));
  const productIds = [...new Set(items.map((i) => String(i.productId)))];
  return { batchId, batchNo, goodsTotal, landedTotal: goodsTotal + extra, items, slugs, productIds };
}

export type BatchRow = {
  id: string;
  batchNo: string;
  supplier: string;
  receivedAt: string;
  itemCount: number;
  units: number;
  goodsTotal: number;
  landedTotal: number;
};

export async function listPurchaseBatches(): Promise<BatchRow[]> {
  await connectMongoose();
  const docs = await PurchaseBatch.find().sort({ receivedAt: -1 }).limit(100).lean<AnyDoc[]>();
  return docs.map((b) => {
    const items = b.items as { qty: number }[];
    return {
      id: b._id.toString(),
      batchNo: String(b.batchNo),
      supplier: String(b.supplier ?? ""),
      receivedAt: new Date(b.receivedAt as Date).toISOString(),
      itemCount: items.length,
      units: items.reduce((a, i) => a + i.qty, 0),
      goodsTotal: Number(b.goodsTotal),
      landedTotal: Number(b.landedTotal),
    };
  });
}

/** Variants for the purchase-batch picker. */
export async function variantOptions(): Promise<{ id: string; label: string; costPrice: number }[]> {
  await connectMongoose();
  const rows = await listInventory({});
  return rows
    .filter((r) => r.active)
    .map((r) => ({
      id: r.variantId,
      label: `${r.productTitle}${r.variantTitle ? ` — ${r.variantTitle}` : ""} (${r.sku})`,
      costPrice: r.costPrice,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
