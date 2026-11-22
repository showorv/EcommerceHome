import { connectMongoose } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { readInvoiceSettings } from "@/modules/invoices/invoices";
import { Setting } from "@/modules/payments/models";
import type { EmailBrand } from "./email-layout";

/**
 * The shop's name and contact details for messages: the ones set in Admin → Invoices, so invoices and
 * emails always match. Read at most once a minute. Not server-only: the worker uses it.
 */
let cache: { at: number; brand: EmailBrand } | null = null;

export async function loadBrand(): Promise<EmailBrand> {
  if (cache && Date.now() - cache.at < 60_000) return cache.brand;
  await connectMongoose();
  const s = await Setting.findById("invoice").lean<{ value?: unknown }>();
  const v = readInvoiceSettings(s?.value ?? {}, env().STORE_NAME);
  const brand = { name: v.shopName, phone: v.phone, email: v.email, address: v.address };
  cache = { at: Date.now(), brand };
  return brand;
}
