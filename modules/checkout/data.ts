import "server-only";
import { getSession, requestMeta } from "@/modules/auth/session";
import { loadCart } from "@/modules/cart/data";
import type { CartView } from "@/modules/cart/logic";
import { checkCoupon } from "@/modules/coupons/data";
import type { CouponTerms } from "@/modules/coupons/coupons";
import { BLOCKED_MESSAGE } from "@/modules/customers/blocks";
import type { AdvanceRule } from "@/modules/delivery/charge";
import { getDeliveryConfig } from "@/modules/delivery/data";
import type { RiskDecision } from "@/modules/orders/risk";
import { assessCheckout } from "@/modules/orders/rules-data";
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
  | {
      ok: true;
      input: CheckoutInput;
      cart: CartView;
      totals: CheckoutTotals;
      zone: { id: string; name: string };
      /** District and area names for the order's address. */
      district: string;
      area: string;
      /** The coupon used, as checked now (null without one). */
      coupon: CouponTerms | null;
      /** Risk score and reasons for staff (SRS §2.4). */
      risk: RiskDecision;
    }
  | {
      ok: false;
      error: string;
      fields?: Partial<Record<CheckoutField, string>>;
      cart?: CartView;
      /** Everything else is fine; the phone needs a code first (FR-CO-03). */
      needsCode?: true;
      /** What this order must pay in advance, when that is why it was refused. */
      advance?: { rule: AdvanceRule; message: string | null };
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
  // Blocked numbers stop here; the order rules may ask for an advance the zone alone doesn't (SRS §2.4).
  const { ip } = await requestMeta();
  const assessed = await assessCheckout({
    phone: input.phone,
    name: input.name,
    ip,
    subtotal: cart.subtotal,
    zone,
    zones: config.zones,
    walletCount: payments.wallets.length,
  });
  if (assessed.blocked) {
    return { ok: false, error: "Please check your mobile number.", fields: { phone: BLOCKED_MESSAGE } };
  }
  const { decision } = assessed;
  const advance = { rule: decision.advance, message: decision.message };

  const methods = availableMethods(decision.advance, payments.wallets.length);
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
      fields: { paymentMethod: decision.message ?? "This payment option isn't available for your area" },
      advance,
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

  const now = Date.now();
  let coupon: CouponTerms | null = null;
  let discount = 0;
  let freeDelivery = false;
  if (input.couponCode) {
    const c = await checkCoupon({
      code: input.couponCode,
      lines: cart.lines,
      phone: input.phone,
      userId: session?.user.id ?? null,
      now,
    });
    if (!c.ok) return { ok: false, error: "Please check the highlighted fields.", fields: { couponCode: c.error } };
    coupon = c.terms;
    discount = c.result.discount;
    freeDelivery = c.result.freeDelivery;
  }

  const totals = checkoutTotals({
    zone,
    rules: config.rules,
    lines: cart.lines,
    discount,
    freeDelivery,
    paymentMethod: input.paymentMethod,
    now,
  });

  // Last, so a code is only sent once the rest of the order is right.
  if (!(await isCheckoutPhoneVerified(input.phone, session))) {
    return { ok: false, error: "Please confirm your mobile number with the code we text you.", needsCode: true };
  }
  const district = config.districts.find((d) => d.id === input.districtId)?.name.en ?? "";
  return {
    ok: true,
    input,
    cart,
    totals,
    zone: { id: zone.id, name: zone.name },
    district,
    area: area.name.en,
    coupon,
    risk: decision,
  };
}
