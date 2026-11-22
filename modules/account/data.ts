import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { getSession } from "@/modules/auth/session";
import { Product } from "@/modules/catalog/models";
import { CARD_FIELDS, toCardProduct, type CardProduct } from "@/modules/catalog/storefront";
import { getDeliveryConfig, type DeliveryData } from "@/modules/delivery/data";
import { Invoice } from "@/modules/invoices/models";
import { ensureInvoicePdf } from "@/modules/invoices/pdf";
import { Order } from "@/modules/orders/models";
import {
  MAX_ADDRESSES,
  MAX_WISHLIST,
  ownsOrder,
  sameAddress,
  type AddressInput,
  type SavedAddress,
  type TrackInput,
} from "./account";
import { Address, WishlistItem } from "./models";
import { customerOrder, orderListRow, type CustomerOrder, type OrderListRow } from "./order-view";

/**
 * Server side of the account area and guest tracking (FR-AC-06/07). Every read is scoped to the
 * signed-in customer; callers never pass a user id they got from the browser.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export class AccountError extends Error {}

export type Customer = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  isStaff: boolean;
};

export async function currentCustomer(): Promise<Customer | null> {
  await connection(); // per visitor, at request time: the session check reads the clock
  const session = await getSession();
  if (!session) return null;
  const u = session.user as typeof session.user & {
    phoneNumber?: string | null;
    phoneNumberVerified?: boolean | null;
    role?: string | null;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: Boolean(u.emailVerified),
    phoneNumber: u.phoneNumber ?? null,
    phoneNumberVerified: Boolean(u.phoneNumberVerified),
    isStaff: Boolean(u.role && u.role !== "customer"),
  };
}

/** For account pages: the customer, or off to sign in (and back here afterwards). */
export async function requireCustomer(next: string): Promise<Customer> {
  const c = await currentCustomer();
  if (!c) redirect(`/account/sign-in?next=${encodeURIComponent(next)}`);
  return c;
}

// ---------- Addresses ----------

function placeName(config: DeliveryData, districtId: string, areaId: string): string {
  const area = config.areas.find((a) => a.id === areaId);
  const district = config.districts.find((d) => d.id === districtId);
  return [area?.name.en, district?.name.en].filter(Boolean).join(", ");
}

function toAddress(d: AnyDoc, config: DeliveryData): SavedAddress {
  const districtId = String(d.districtId);
  const areaId = String(d.areaId);
  return {
    id: String(d._id),
    label: String(d.label ?? ""),
    name: String(d.name),
    phone: String(d.phone),
    districtId,
    areaId,
    line: String(d.line),
    note: String(d.note ?? ""),
    isDefault: Boolean(d.isDefault),
    place: placeName(config, districtId, areaId),
  };
}

/** Default first, then oldest first. */
export async function listAddresses(userId: string): Promise<SavedAddress[]> {
  await connectMongoose();
  const [docs, config] = await Promise.all([
    Address.find({ userId }).sort({ isDefault: -1, createdAt: 1 }).limit(MAX_ADDRESSES).lean<AnyDoc[]>(),
    getDeliveryConfig(),
  ]);
  return docs.map((d) => toAddress(d, config));
}

async function checkPlace(input: Pick<AddressInput, "districtId" | "areaId">) {
  const config = await getDeliveryConfig();
  const area = config.areas.find((a) => a.id === input.areaId);
  if (!area || area.districtId !== input.districtId) throw new AccountError("Choose the area again.");
}

/** Adds (id null) or changes an address. The first one, or one marked default, becomes the default. */
export async function saveAddress(userId: string, id: string | null, input: AddressInput): Promise<string> {
  await connectMongoose();
  await checkPlace(input);
  const count = await Address.countDocuments({ userId });
  let savedId: string;
  if (id) {
    const res = await Address.updateOne({ _id: id, userId }, { $set: { ...input } });
    if (res.matchedCount === 0) throw new AccountError("This address is no longer in your account.");
    savedId = id;
  } else {
    if (count >= MAX_ADDRESSES) throw new AccountError(`You can save up to ${MAX_ADDRESSES} addresses.`);
    const doc = await Address.create({ userId, ...input, isDefault: input.isDefault || count === 0 });
    savedId = String(doc._id);
  }
  if (input.isDefault) await makeDefault(userId, savedId);
  return savedId;
}

export async function makeDefault(userId: string, id: string): Promise<void> {
  await connectMongoose();
  const res = await Address.updateOne({ _id: id, userId }, { $set: { isDefault: true } });
  if (res.matchedCount === 0) throw new AccountError("This address is no longer in your account.");
  await Address.updateMany(trustFilter({ userId, _id: { $ne: id } }), { $set: { isDefault: false } });
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  await connectMongoose();
  const gone = await Address.findOneAndDelete({ _id: id, userId }).lean<AnyDoc>();
  if (!gone) return;
  if (gone.isDefault) {
    const next = await Address.findOne({ userId }).sort({ createdAt: 1 }).lean<AnyDoc>();
    if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
}

/**
 * "Save this address" at checkout: kept unless it's already saved or the book is full. Never fails the
 * order: returns whether it was saved.
 */
export async function saveCheckoutAddress(
  userId: string,
  a: { name: string; phone: string; districtId: string; areaId: string; address: string; note: string; area: string },
): Promise<boolean> {
  await connectMongoose();
  const docs = await Address.find({ userId }).lean<AnyDoc[]>();
  const fields = { name: a.name, phone: a.phone, districtId: a.districtId, areaId: a.areaId, line: a.address };
  if (docs.length >= MAX_ADDRESSES) return false;
  if (docs.some((d) => sameAddress({ ...fields }, { ...(d as AddressInput) }))) return false;
  await Address.create({
    userId,
    label: docs.length === 0 ? "Home" : a.area,
    ...fields,
    note: a.note,
    isDefault: docs.length === 0,
  });
  return true;
}

// ---------- Orders ----------

/** Orders placed signed in, plus guest orders with the account's confirmed mobile number. */
function ordersOf(c: Customer) {
  return c.phoneNumberVerified && c.phoneNumber
    ? trustFilter({ $or: [{ userId: c.id }, { "customer.phone": c.phoneNumber }] })
    : { userId: c.id };
}

export const ORDER_LIST_LIMIT = 100;

export async function myOrders(c: Customer, limit = ORDER_LIST_LIMIT): Promise<OrderListRow[]> {
  await connectMongoose();
  const docs = await Order.find(ordersOf(c))
    .select("orderNo createdAt status total items.title items.qty items.image")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<AnyDoc[]>();
  return docs.map(orderListRow);
}

async function ownedOrder(c: Customer, orderNo: string): Promise<AnyDoc | null> {
  await connectMongoose();
  const d = await Order.findOne({ orderNo }).lean<AnyDoc>();
  if (!d) return null;
  return ownsOrder({ userId: d.userId ?? null, phone: String(d.customer?.phone ?? "") }, c) ? d : null;
}

export async function myOrder(c: Customer, orderNo: string): Promise<CustomerOrder | null> {
  const d = await ownedOrder(c, orderNo);
  if (!d) return null;
  const inv = await Invoice.findOne({ orderId: String(d._id) })
    .select("invoiceNo")
    .lean<AnyDoc>();
  return customerOrder(d, { full: true, invoiceNo: inv ? String(inv.invoiceNo) : null });
}

/** The lines of one of your orders, for "Order again". */
export async function reorderLines(
  c: Customer,
  orderNo: string,
): Promise<{ variantId: string; qty: number; name: string }[] | null> {
  const d = await ownedOrder(c, orderNo);
  if (!d) return null;
  return ((d.items ?? []) as AnyDoc[]).map((i) => ({
    variantId: String(i.variantId),
    qty: Number(i.qty),
    name: i.variantTitle ? `${i.title} (${i.variantTitle})` : String(i.title),
  }));
}

/** The invoice PDF of one of your orders, even if its public link was turned off. */
export async function myInvoicePdf(c: Customer, orderNo: string): Promise<{ pdf: Buffer; invoiceNo: string } | null> {
  const d = await ownedOrder(c, orderNo);
  if (!d) return null;
  const inv = await Invoice.findOne({ orderId: String(d._id) })
    .select("_id")
    .lean<AnyDoc>();
  return inv ? ensureInvoicePdf(String(inv._id)) : null;
}

/** Guest tracking (FR-AC-07): the short view, only when the number and the phone match. */
export async function trackOrder(input: TrackInput): Promise<CustomerOrder | null> {
  await connectMongoose();
  const d = await Order.findOne({ orderNo: input.orderNo }).lean<AnyDoc>();
  if (!d || String(d.customer?.phone ?? "") !== input.phone) return null;
  return customerOrder(d, { full: false });
}

// ---------- Wishlist ----------

/** Saved product ids, newest first. */
export async function wishlistIds(userId: string): Promise<string[]> {
  await connectMongoose();
  const docs = await WishlistItem.find({ userId })
    .sort({ createdAt: -1 })
    .limit(MAX_WISHLIST)
    .select("productId")
    .lean<AnyDoc[]>();
  return docs.map((d) => String(d.productId));
}

export async function setWishlisted(userId: string, productId: string, on: boolean): Promise<void> {
  await connectMongoose();
  if (!on) {
    await WishlistItem.deleteOne({ userId, productId });
    return;
  }
  const product = await Product.findOne({ _id: productId, status: "active" }).select("_id").lean<AnyDoc>();
  if (!product) throw new AccountError("This product isn't available any more.");
  if ((await WishlistItem.countDocuments({ userId })) >= MAX_WISHLIST) {
    throw new AccountError(`Your wishlist is full (${MAX_WISHLIST} products). Remove some first.`);
  }
  try {
    await WishlistItem.create({ userId, productId });
  } catch (err) {
    // Already saved (another tab): fine.
    if (!(err && typeof err === "object" && "code" in err && err.code === 11000)) throw err;
  }
}

export type WishlistView = { products: CardProduct[]; gone: { id: string; title: string }[] };

export async function wishlistProducts(userId: string): Promise<WishlistView> {
  const ids = await wishlistIds(userId);
  if (ids.length === 0) return { products: [], gone: [] };
  const docs = await Product.find(trustFilter({ _id: { $in: ids } }))
    .select(`${CARD_FIELDS} status`)
    .lean<AnyDoc[]>();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const products: CardProduct[] = [];
  const gone: { id: string; title: string }[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (d && d.status === "active") products.push(toCardProduct(d));
    else gone.push({ id, title: d ? String(d.title?.en ?? "") : "" });
  }
  return { products, gone };
}
