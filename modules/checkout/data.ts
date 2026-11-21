import "server-only";
import { getSession } from "@/modules/auth/session";
import { loadCart } from "@/modules/cart/data";
import type { CartView } from "@/modules/cart/logic";
import { getDeliveryConfig } from "@/modules/delivery/data";
import {
  allowedMethods,
  checkoutInput,
  checkoutTotals,
  fieldErrors,
  zoneForArea,
  type CheckoutField,
  type CheckoutInput,
  type CheckoutTotals,
} from "./checkout";

/**
 * The server's check of a checkout (FR-CO-02, FR-CO-05): the form, the saved cart at today's prices and
 * stock, the area and its zone, the payment method the zone allows, and every amount, worked out here
 * from scratch. Order placement (2.7) runs this first and saves what it returns.
 */

export type CheckoutCheck =
  | { ok: true; input: CheckoutInput; cart: CartView; totals: CheckoutTotals; zoneName: string }
  | { ok: false; error: string; fields?: Partial<Record<CheckoutField, string>>; cart?: CartView };

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

  const [cart, config] = await Promise.all([loadCart([]), getDeliveryConfig()]);
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
  if (!allowedMethods(zone.advanceRule).includes(input.paymentMethod)) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fields: { paymentMethod: "This payment option isn't available for your area" },
    };
  }

  const totals = checkoutTotals({
    zone,
    rules: config.rules,
    lines: cart.lines,
    paymentMethod: input.paymentMethod,
    now: Date.now(),
  });
  return { ok: true, input, cart, totals, zoneName: zone.name };
}
