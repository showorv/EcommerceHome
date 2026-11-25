import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";
import { isStoredMediaUrl } from "@/modules/catalog/media-rules";

/**
 * Receiving wallets for manual advance payments (SRS §2.1, §7 "settings"). Pure and browser-safe: the
 * admin editor and the checkout page use the same rules as the server.
 *
 * There is at most one wallet per type (bKash, Nagad). The customer sends money to it from their own
 * wallet and types the sender number and the transaction ID (TrxID) from the confirmation SMS; staff
 * check the TrxID against the wallet's statement before confirming the order.
 */

export const WALLET_TYPES = ["bkash", "nagad"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];
export const WALLET_NAMES: Record<WalletType, string> = { bkash: "bKash", nagad: "Nagad" };

/** What the customer chooses in their wallet app. A Personal Retail Account takes "Make Payment". */
export const PAY_HOW = ["send_money", "payment"] as const;
export type PayHow = (typeof PAY_HOW)[number];
export const PAY_HOW_NAMES: Record<PayHow, string> = { send_money: "Send Money", payment: "Make Payment" };

export type Wallet = {
  type: WalletType;
  /** +8801XXXXXXXXX */
  number: string;
  accountName: string;
  how: PayHow;
  /** Uploaded QR image, or "". */
  qrUrl: string;
  active: boolean;
};

export type PaymentSettings = { wallets: Wallet[] };

// ---------- Admin input ----------

const walletInput = z.object({
  type: z.enum(WALLET_TYPES),
  number: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return "";
      const p = normalizeBdPhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Enter a Bangladeshi mobile number, like 01712345678" });
        return z.NEVER;
      }
      return p;
    }),
  accountName: z.string().trim().max(60, "Keep the account name under 60 characters").default(""),
  how: z.enum(PAY_HOW).default("send_money"),
  qrUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((u) => u === "" || isStoredMediaUrl(u), "Upload the QR image (links to other websites can't be shown)")
    .default(""),
  active: z.boolean().default(false),
});

export const paymentSettingsInput = z
  .object({ wallets: z.array(walletInput).max(WALLET_TYPES.length) })
  .superRefine((v, ctx) => {
    v.wallets.forEach((w, i) => {
      if (v.wallets.findIndex((o) => o.type === w.type) !== i) {
        ctx.addIssue({
          code: "custom",
          path: ["wallets", i, "type"],
          message: `${WALLET_NAMES[w.type]} is listed twice`,
        });
      }
      if (w.active && !w.number) {
        ctx.addIssue({
          code: "custom",
          path: ["wallets", i, "number"],
          message: `Enter the ${WALLET_NAMES[w.type]} number before switching it on`,
        });
      }
    });
  });

/** Stored settings, read by hand (never re-parsed through the input schema). */
export function readPaymentSettings(raw: unknown): PaymentSettings {
  const doc = (raw ?? {}) as { wallets?: Partial<Wallet>[] };
  const wallets: Wallet[] = [];
  for (const type of WALLET_TYPES) {
    const w = doc.wallets?.find((x) => x?.type === type);
    wallets.push({
      type,
      number: typeof w?.number === "string" ? w.number : "",
      accountName: typeof w?.accountName === "string" ? w.accountName : "",
      how: w?.how && (PAY_HOW as readonly string[]).includes(w.how) ? w.how : "send_money",
      qrUrl: typeof w?.qrUrl === "string" ? w.qrUrl : "",
      active: w?.active === true && typeof w.number === "string" && w.number !== "",
    });
  }
  return { wallets };
}

/** The wallets shoppers can pay into. */
export const activeWallets = (s: PaymentSettings) => s.wallets.filter((w) => w.active && w.number);

// ---------- Checkout input ----------

/**
 * A TrxID as typed: spaces dropped, upper case. bKash IDs are 10 letters and digits, Nagad's 8; 8–12 is
 * accepted so a format change at the provider doesn't block orders. Null if it can't be one.
 */
export function normalizeTrxId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{8,12}$/.test(v) && /\d/.test(v) ? v : null;
}

/** Shows only the last 4 characters (NFR-SEC-14: TrxID stored but shown masked). */
export const maskTrxId = (t: string) => (t.length <= 4 ? t : "•".repeat(t.length - 4) + t.slice(-4));

/** 01712-345678, for showing a stored +880 number. */
export function showBdPhone(p: string): string {
  const local = p.replace(/^\+88/, "");
  return /^01\d{9}$/.test(local) ? `${local.slice(0, 5)}-${local.slice(5)}` : p;
}
