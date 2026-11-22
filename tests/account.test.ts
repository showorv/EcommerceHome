import { describe, expect, it } from "vitest";
import {
  addressInput,
  customerTimeline,
  dhakaDateTime,
  normalizeOrderNo,
  orderSteps,
  ownsOrder,
  safeNext,
  sameAddress,
  trackInput,
  type HistoryEntry,
} from "@/modules/account/account";
import { customerOrder, orderListRow } from "@/modules/account/order-view";

const ID = "6b0157c03078826ba4cfb185";
const AREA = "6b0157c13078826ba4cfb255";

describe("saved addresses", () => {
  const ok = { name: "Rahim", phone: "01712345678", districtId: ID, areaId: AREA, line: "House 1, Road 2, Adabor" };

  it("checks and tidies what's typed", () => {
    const a = addressInput.parse({ ...ok, label: " Home ", note: "" });
    expect(a).toMatchObject({ label: "Home", phone: "+8801712345678", isDefault: false });
    const bad = addressInput.safeParse({ ...ok, phone: "12345", line: "short", districtId: "x" });
    expect(bad.success).toBe(false);
    const fields = bad.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["phone", "line", "districtId"]));
  });

  it("knows an address it already has, whatever the spacing or case", () => {
    const a = addressInput.parse(ok);
    expect(sameAddress(a, { ...a, name: " rahim ", line: "house 1,  road 2, adabor" })).toBe(true);
    expect(sameAddress(a, { ...a, areaId: ID })).toBe(false);
    expect(sameAddress(a, { ...a, phone: "+8801712345679" })).toBe(false);
  });
});

describe("whose order", () => {
  const order = { userId: "u1", phone: "+8801711111111" };

  it("is the customer's when placed signed in, or with their confirmed mobile number", () => {
    expect(ownsOrder(order, { id: "u1" })).toBe(true);
    expect(ownsOrder(order, { id: "u2" })).toBe(false);
    const guest = { userId: null, phone: "+8801711111111" };
    expect(ownsOrder(guest, { id: "u2", phoneNumber: "+8801711111111", phoneNumberVerified: true })).toBe(true);
    // A number nobody confirmed never unlocks someone's orders.
    expect(ownsOrder(guest, { id: "u2", phoneNumber: "+8801711111111", phoneNumberVerified: false })).toBe(false);
    expect(ownsOrder(guest, { id: "u2", phoneNumber: null, phoneNumberVerified: true })).toBe(false);
  });
});

describe("guest tracking", () => {
  it("reads order numbers the way people type them", () => {
    expect(normalizeOrderNo("SR10234")).toBe("SR10234");
    expect(normalizeOrderNo(" sr 10234 ")).toBe("SR10234");
    expect(normalizeOrderNo("#SR10234")).toBe("SR10234");
    expect(normalizeOrderNo("10234")).toBe("SR10234");
    expect(normalizeOrderNo("SR12")).toBeNull();
    expect(normalizeOrderNo("INV-2026-000001")).toBeNull();
  });

  it("needs a real order number and a Bangladeshi mobile number", () => {
    expect(trackInput.parse({ orderNo: "10234", phone: "01712345678" })).toEqual({
      orderNo: "SR10234",
      phone: "+8801712345678",
    });
    const r = trackInput.safeParse({ orderNo: "", phone: "12" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual([
      "Enter the order number",
      "Enter a Bangladeshi mobile number, like 01712345678",
    ]);
  });
});

describe("order progress", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 22, h)).toISOString();
  const h = (...s: [HistoryEntry["status"], number][]): HistoryEntry[] =>
    s.map(([status, n]) => ({ status, at: at(n) }));

  it("shows where a normal order is", () => {
    const steps = orderSteps("packed", h(["pending", 1], ["confirmed", 2], ["packed", 3]));
    expect(steps.map((s) => [s.label, s.state])).toEqual([
      ["Order placed", "done"],
      ["Confirmed", "done"],
      ["Packed", "current"],
      ["On the way", "todo"],
      ["Delivered", "todo"],
    ]);
    expect(steps[2]!.at).toBe(at(3));
    expect(steps[3]!.at).toBeNull();
    expect(orderSteps("delivered", h(["pending", 1], ["delivered", 5])).every((s) => s.state === "done")).toBe(true);
    expect(orderSteps("partially_delivered", h(["pending", 1]))[4]).toMatchObject({
      label: "Partly delivered",
      state: "done",
    });
  });

  it("stops a cancelled or returned order where it got to", () => {
    expect(
      orderSteps("cancelled", h(["pending", 1], ["confirmed", 2], ["cancelled", 3])).map((s) => [s.label, s.state]),
    ).toEqual([
      ["Order placed", "done"],
      ["Confirmed", "done"],
      ["Cancelled", "stopped"],
    ]);
    const returned = orderSteps(
      "returned",
      h(["pending", 1], ["confirmed", 2], ["packed", 3], ["shipped", 4], ["returned", 6]),
    );
    expect(returned.at(-1)).toMatchObject({ label: "Returned", state: "stopped", at: at(6) });
    expect(returned).toHaveLength(5);
  });

  it("puts 'on hold' on the step the order reached", () => {
    const steps = orderSteps("on_hold", h(["pending", 1], ["confirmed", 2], ["on_hold", 3]));
    expect(steps[1]).toMatchObject({ label: "On hold", state: "current", at: at(3) });
    expect(steps[0]!.state).toBe("done");
  });

  it("lists every change newest first, in the customer's words", () => {
    expect(customerTimeline(h(["pending", 1], ["confirmed", 2], ["shipped", 4]))).toEqual([
      { label: "On the way", at: at(4) },
      { label: "Confirmed", at: at(2) },
      { label: "Order placed", at: at(1) },
    ]);
  });

  it("writes times in Dhaka", () => {
    expect(dhakaDateTime("2026-11-22T07:26:00Z")).toBe("22 Nov 2026, 1:26 pm");
  });
});

describe("what a customer sees of an order", () => {
  const doc = {
    _id: "x",
    orderNo: "SR10234",
    createdAt: new Date("2026-11-22T07:26:00Z"),
    status: "shipped",
    paymentStatus: "unpaid",
    paymentMethod: "cod",
    customer: { name: "Rahim", phone: "+8801711111111", email: "r@x.bd" },
    shippingAddress: { district: "Dhaka", area: "Adabor", line: "House 1", note: "Call first" },
    items: [
      { title: "Chopper", variantTitle: "Red", qty: 2, price: 145000, cost: 83478, image: null, slug: "chopper" },
      { title: "Bottle", variantTitle: "", qty: 1, price: 50000, cost: 20000, image: "/b.png", slug: "bottle" },
    ],
    subtotal: 340000,
    discount: 0,
    deliveryCharge: 7000,
    codFee: 0,
    total: 347000,
    codAmount: 347000,
    statusHistory: [
      { status: "pending", at: new Date("2026-11-22T07:26:00Z"), by: null, byName: "", note: "Placed on the website" },
      {
        status: "confirmed",
        at: new Date("2026-11-22T08:00:00Z"),
        by: "staff1",
        byName: "Karim",
        note: "Called twice",
      },
      { status: "shipped", at: new Date("2026-11-23T05:00:00Z"), by: "staff1", byName: "Karim", note: "" },
    ],
    riskScore: 40,
    riskReasons: ["New customer"],
    notes: [{ text: "Fussy customer" }],
    callLog: [{ outcome: "confirmed" }],
  };

  it("tracking shows progress and money, not the person or staff details", () => {
    const o = customerOrder(doc, { full: false });
    expect(o).toMatchObject({
      orderNo: "SR10234",
      statusLabel: "On the way",
      itemCount: 3,
      toPay: 347000,
      place: "Adabor, Dhaka",
    });
    expect(o.full).toBeNull();
    const text = JSON.stringify(o);
    for (const secret of [
      "Rahim",
      "+8801711111111",
      "House 1",
      "Karim",
      "Called twice",
      "Fussy",
      "83478",
      "riskScore",
      "New customer",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("the account view adds the address and the invoice", () => {
    const o = customerOrder(doc, { full: true, invoiceNo: "INV-2026-000001" });
    expect(o.full).toEqual({
      name: "Rahim",
      phone: "+8801711111111",
      line: "House 1",
      note: "Call first",
      invoiceNo: "INV-2026-000001",
    });
    expect(JSON.stringify(o)).not.toContain("Karim");
  });

  it("nothing is left to pay once delivered, cancelled or paid", () => {
    expect(customerOrder({ ...doc, status: "delivered" }, { full: false }).toPay).toBe(0);
    expect(customerOrder({ ...doc, status: "cancelled" }, { full: false }).toPay).toBe(0);
    expect(customerOrder({ ...doc, paymentStatus: "paid" }, { full: false }).toPay).toBe(0);
  });

  it("a list row names the first product", () => {
    expect(orderListRow(doc)).toMatchObject({ firstItem: "Chopper + 1 more", itemCount: 3, statusLabel: "On the way" });
  });
});

describe("returning after sign-in", () => {
  it("only goes to pages on this site", () => {
    expect(safeNext("/p/chopper?x=1")).toBe("/p/chopper?x=1");
    expect(safeNext(null)).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
    expect(safeNext("/ok\nSet-Cookie: x")).toBe("/account");
  });
});
