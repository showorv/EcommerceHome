import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import { Category } from "@/modules/catalog/models";
import type { CartLine } from "@/modules/cart/logic";
import {
  applyCoupon,
  normalizeCouponCode,
  withSubcategories,
  type Coupon,
  type CouponInput,
  type CouponResult,
  type CouponTerms,
} from "./coupons";
import { CouponModel } from "./models";

/**
 * Coupon storage and the server's coupon check (FR-CO-04, FR-CO-05). Admin callers check
 * coupons.manage and write the audit log.
 */

/** Errors with a message that is safe to show in the admin. */
export class CouponError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

function toCoupon(d: AnyDoc): Coupon {
  return {
    id: String(d._id),
    code: String(d.code),
    type: d.type,
    value: Number(d.value ?? 0),
    minOrder: Number(d.minOrder ?? 0),
    maxDiscount: Number(d.maxDiscount ?? 0),
    usageLimit: Number(d.usageLimit ?? 0),
    perCustomerLimit: Number(d.perCustomerLimit ?? 0),
    usedCount: Number(d.usedCount ?? 0),
    startsAt: iso(d.startsAt),
    endsAt: iso(d.endsAt),
    productIds: ((d.productIds ?? []) as unknown[]).map(String),
    categoryIds: ((d.categoryIds ?? []) as unknown[]).map(String),
    active: d.active !== false,
    note: String(d.note ?? ""),
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  await connectMongoose();
  const docs = await CouponModel.find().sort({ createdAt: -1 }).limit(500).lean<AnyDoc[]>();
  return docs.map(toCoupon);
}

async function byId(id: string): Promise<Coupon> {
  await connectMongoose();
  const d = await CouponModel.findById(id).lean<AnyDoc>();
  if (!d) throw new CouponError("This coupon no longer exists.");
  return toCoupon(d);
}

const isDuplicate = (err: unknown) => (err as { code?: number }).code === 11000;

export async function createCoupon(input: CouponInput, by: string): Promise<Coupon> {
  await connectMongoose();
  try {
    const d = await CouponModel.create({ ...input, createdBy: by });
    return toCoupon(d.toObject());
  } catch (err) {
    if (isDuplicate(err)) throw new CouponError(`There is already a coupon with the code ${input.code}.`);
    throw err;
  }
}

export async function updateCoupon(id: string, input: CouponInput) {
  const before = await byId(id);
  // Orders keep the code they used, so a used code stays as it is.
  if (before.usedCount > 0 && input.code !== before.code) {
    throw new CouponError(`${before.code} is on ${before.usedCount} order(s), so its code can't change.`);
  }
  try {
    await CouponModel.updateOne({ _id: id }, { $set: input });
  } catch (err) {
    if (isDuplicate(err)) throw new CouponError(`There is already a coupon with the code ${input.code}.`);
    throw err;
  }
  return { before, after: await byId(id) };
}

export async function setCouponActive(id: string, active: boolean) {
  const before = await byId(id);
  await CouponModel.updateOne({ _id: id }, { $set: { active } });
  return { before, after: { ...before, active } };
}

export async function deleteCoupon(id: string): Promise<Coupon> {
  const c = await byId(id);
  if (c.usedCount > 0) {
    throw new CouponError(`${c.code} is on ${c.usedCount} order(s). Switch it off instead, so the orders keep it.`);
  }
  await CouponModel.deleteOne({ _id: id, usedCount: 0 });
  return c;
}

// ---------- Checkout ----------

/** The coupon's terms for the checkout page, with sub-categories of its categories included. */
async function termsFor(c: Coupon): Promise<CouponTerms> {
  let categoryIds = c.categoryIds;
  if (categoryIds.length > 0) {
    const all = await Category.find().select("parentId").lean<AnyDoc[]>();
    categoryIds = withSubcategories(
      categoryIds,
      all.map((x) => ({ id: String(x._id), parentId: x.parentId ? String(x.parentId) : null })),
    );
  }
  return {
    code: c.code,
    type: c.type,
    value: c.value,
    minOrder: c.minOrder,
    maxDiscount: c.maxDiscount,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    productIds: c.productIds,
    categoryIds,
  };
}

/**
 * Orders this customer has placed with the code (not cancelled). Orders arrive in Phase 2.7; until then
 * there are none.
 */
async function customerUses(code: string, phone: string | null, userId: string | null): Promise<number> {
  const who = [...(phone ? [{ "customer.phone": phone }] : []), ...(userId ? [{ userId }] : [])];
  if (who.length === 0) return 0;
  const m = await connectMongoose();
  const db = m.connection.db;
  if (!db) return 0;
  return db.collection("orders").countDocuments({ couponCode: code, status: { $ne: "cancelled" }, $or: who });
}

export type CouponCheck =
  { ok: true; terms: CouponTerms; result: CouponResult & { ok: true } } | { ok: false; error: string };

/**
 * Everything about a code for this cart and customer: it exists and is on, its dates, the total and
 * per-customer limits, the minimum order and the products it covers. Unknown and switched-off codes get
 * the same answer.
 */
export async function checkCoupon(input: {
  code: string;
  lines: Pick<CartLine, "productId" | "categoryIds" | "price" | "qty">[];
  phone: string | null;
  userId: string | null;
  now: number;
}): Promise<CouponCheck> {
  const code = normalizeCouponCode(input.code);
  if (!code) return { ok: false, error: "Check the code: letters, digits, - or _." };
  await connectMongoose();
  const doc = await CouponModel.findOne({ code }).lean<AnyDoc>();
  const c = doc ? toCoupon(doc) : null;
  if (!c || !c.active) return { ok: false, error: "We couldn't find this code." };
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return { ok: false, error: "This code has been used up." };
  if (c.perCustomerLimit > 0 && (await customerUses(code, input.phone, input.userId)) >= c.perCustomerLimit) {
    return {
      ok: false,
      error:
        c.perCustomerLimit === 1
          ? "You've already used this code."
          : `You've used this code the most times allowed (${c.perCustomerLimit}).`,
    };
  }
  const terms = await termsFor(c);
  const result = applyCoupon(terms, input.lines, input.now);
  if (!result.ok) return result;
  return { ok: true, terms, result };
}
