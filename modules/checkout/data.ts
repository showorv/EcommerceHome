import "server-only";
import { getSession } from "@/modules/auth/session";
import { loadCart } from "@/modules/cart/data";
import type { CartView } from "@/modules/cart/logic";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { getPaymentConfig, isTrxIdUsed } from "@/modules/payments/data";
import { WALLET_NAMES } from "@/modules/payments/payments";
import {
  availableMethods,
  needsAdvance,
  checkoutInput,
  checkoutTotals,
  fieldErrors,
  zoneForArea,
  type CheckoutField,
  type CheckoutInput,
  type CheckoutTotals,
} from "./checkout";
import { isCheckoutPhoneVerified } from "./phone";

/**
 * The server's check of a checkout (FR-CO-02, FR-CO-05): the form, the saved cart at today's prices and
 * stock, the area and its zone, the payment method the zone allows, and every amount, worked out here
 * from scratch, and that the phone was confirmed with a code. Order placement (2.7) runs this first and
 * saves what it returns.
 */

export type CheckoutCheck =
  | { ok: true; input: CheckoutInput; cart: CartView; totals: CheckoutTotals; zoneName: string }
  | {
      ok: false;
      error: string;
      fields?: Partial<Record<CheckoutField, string>>;
      cart?: CartView;
      /** Everything else is fine; the phone needs a code first (FR-CO-03). */
      needsCode?: true;
    };

export async function checkCheckout(raw: unknown): Promise<CheckoutCheck> {
  const parsed = checkoutInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fields: fieldErrors(parsed.error) };
  }
  const input = parsed.data;

  const session = await getSession();
  if (session && !input.email) {
    return { ok: false, error: "Please check the highlighted fields.", fields: { email: "Enter your email" } };
  }

  const [cart, config, payments] = await Promise.all([loadCart([]), getDeliveryConfig(), getPaymentConfig()]);
  if (cart.lines.length === 0) return { ok: false, error: "Your cart is empty.", cart };
  if (cart.hasProblems) {
    return { ok: false, error: "Some products in your cart changed. Please check your cart.", cart };
  }

  const area = config.areas.find((a) => a.id === input.areaId);
  if (!area || area.districtId !== input.districtId) {
    return { ok: false, error: "Please check the highlighted fields.", fields: { areaId: "Choose your area again" } };
  }
  const zone = zoneForArea(config, input.areaId);
  if (!zone) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fields: { areaId: "Sorry, we don't deliver to this area yet" },
    };
  }
  const methods = availableMethods(zone.advanceRule, payments.wallets.length);
  if (methods.length === 0) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fields: { areaId: "Orders for this area need an advance payment, which isn't set up yet. Please contact us." },
    };
  }
  if (!methods.includes(input.paymentMethod)) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fields: { paymentMethod: "This payment option isn't available for your area" },
    };
  }
  if (needsAdvance(input.paymentMethod)) {
    if (!payments.wallets.some((w) => w.type === input.payWallet)) {
      const name = input.payWallet ? WALLET_NAMES[input.payWallet] : "This wallet";
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        fields: { payWallet: `${name} isn't taking payments right now. Please choose another.` },
      };
    }
    if (await isTrxIdUsed(input.trxId)) {
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        fields: { trxId: "This TrxID is already on another order. Check the ID in your payment SMS." },
      };
    }
  }

  const totals = checkoutTotals({
    zone,
    rules: config.rules,
    lines: cart.lines,
    paymentMethod: input.paymentMethod,
    now: Date.now(),
  });

  // Last, so a code is only sent once the rest of the order is right.
  if (!(await isCheckoutPhoneVerified(input.phone, session))) {
    return { ok: false, error: "Please confirm your mobile number with the code we text you.", needsCode: true };
  }
  return { ok: true, input, cart, totals, zoneName: zone.name };
}
