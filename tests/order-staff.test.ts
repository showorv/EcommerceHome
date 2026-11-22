import { describe, expect, it } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import {
  canCancel,
  canConfirm,
  canEdit,
  canHold,
  cancelInput,
  cancelNote,
  describeEdit,
  dhakaDayStart,
  editedTotals,
  needsAdvanceCheck,
  orderConfirmedSms,
  orderCsvLine,
  orderEditInput,
  orderFiltersQuery,
  readOrderFilters,
  type AdminOrder,
} from "@/modules/orders/staff";

const oid = (n: number) => n.toString(16).padStart(24, "0");
const item = (variantId: string, qty: number, price = 145000) => ({
  variantId,
  title: "Mini Chopper",
  variantTitle: variantId === oid(1) ? "Red" : "Blue",
  qty,
  price,
});

describe("what staff can do with an order", () => {
  it("allows edit and confirm only before confirmation, and cancel until it ships", () => {
    for (const f of [canEdit, canConfirm, canCancel]) {
      expect(f("pending")).toBe(true);
      expect(f("on_hold")).toBe(true);
      expect(f("cancelled")).toBe(false);
    }
    expect(canEdit("confirmed")).toBe(false);
    expect(canConfirm("confirmed")).toBe(false);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("shipped")).toBe(false);
    expect(canHold("pending")).toBe(true);
    expect(canHold("on_hold")).toBe(false);
  });

  it("asks for the advance to be checked first", () => {
    expect(needsAdvanceCheck({ advance: null })).toBe(false);
    expect(needsAdvanceCheck({ advance: { status: "pending" } })).toBe(true);
    expect(needsAdvanceCheck({ advance: { status: "verified" } })).toBe(false);
  });

  it("needs a reason to cancel, and words for 'Other'", () => {
    const base = { orderNo: "SR10001", rev: 0 };
    expect(cancelInput.safeParse({ ...base, reason: "Fake order" }).success).toBe(true);
    expect(cancelInput.safeParse({ ...base, reason: "Because" }).success).toBe(false);
    expect(cancelInput.safeParse({ ...base, reason: "Other" }).success).toBe(false);
    expect(cancelInput.safeParse({ ...base, reason: "Other", note: "Moved abroad" }).success).toBe(true);
    expect(cancelInput.safeParse({ ...base, orderNo: { $ne: "" }, reason: "Fake order" }).success).toBe(false);
    expect(cancelNote("Fake order", "")).toBe("Fake order");
    expect(cancelNote("Other", "Moved abroad")).toBe("Other: Moved abroad");
  });

  it("texts a short confirmation", () => {
    expect(orderConfirmedSms({ orderNo: "SR10234", total: 145000, codAmount: 135000 }, "China Import Store")).toBe(
      "China Import Store: Order #SR10234 confirmed. Total ৳1,450 (COD ৳1,350). Thank you!",
    );
    expect(orderConfirmedSms({ orderNo: "SR10234", total: 145000, codAmount: 145000 }, "Shop")).toBe(
      "Shop: Order #SR10234 confirmed. Total ৳1,450. Thank you!",
    );
  });
});

describe("totals after an edit", () => {
  it("add up like checkout, with a COD fee on what the courier collects", () => {
    const t = editedTotals({
      items: [item(oid(1), 2)],
      discount: 10000,
      deliveryCharge: 7000,
      codFeePercent: 1,
      advancePaid: 0,
    });
    // ৳2,900 − ৳100 + ৳70 = ৳2,870, 1% fee ৳28.70 → ৳29
    expect(t).toMatchObject({ subtotal: 290000, discount: 10000, codFee: 2900, total: 289900, codAmount: 289900 });
  });

  it("keep an advance already sent, and say when it is more than the new total", () => {
    const paid = editedTotals({
      items: [item(oid(1), 1)],
      discount: 0,
      deliveryCharge: 13000,
      codFeePercent: 0,
      advancePaid: 13000,
    });
    expect(paid).toMatchObject({ total: 158000, codAmount: 145000, overpaid: 0 });
    const over = editedTotals({
      items: [item(oid(1), 1, 50000)],
      discount: 0,
      deliveryCharge: 7000,
      codFeePercent: 1,
      advancePaid: 158000,
    });
    expect(over).toMatchObject({ total: 57000, codAmount: 0, codFee: 0, overpaid: 101000 });
  });

  it("never let the discount go above the items", () => {
    expect(
      editedTotals({
        items: [item(oid(1), 1, 1000)],
        discount: 5000,
        deliveryCharge: 0,
        codFeePercent: 0,
        advancePaid: 0,
      }).discount,
    ).toBe(1000);
  });
});

describe("the record of an edit", () => {
  const before = {
    customer: { name: "Rahim", phone: "+8801712345678", email: "" },
    address: { district: "Dhaka", area: "Adabor", line: "House 1", note: "" },
    items: [item(oid(1), 1), item(oid(2), 2)],
    discount: 0,
    deliveryCharge: 7000,
    total: 442000,
  };

  it("lists each change in words", () => {
    const after = {
      ...before,
      customer: { ...before.customer, phone: "+8801812345678" },
      address: { ...before.address, area: "Badda" },
      items: [item(oid(1), 3), { ...item(oid(3), 1, 50000), title: "Lamp", variantTitle: "" }],
      deliveryCharge: 0,
      total: 485000,
    };
    expect(describeEdit(before, after)).toEqual([
      'Phone: "01712345678" → "01812345678"',
      'Area: "Adabor, Dhaka" → "Badda, Dhaka"',
      "Mini Chopper (Red): 1 → 3",
      "Added 1 × Lamp at ৳500",
      "Removed 2 × Mini Chopper (Blue)",
      "Delivery charge: ৳70 → ৳0",
      "Total: ৳4,420 → ৳4,850",
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(describeEdit(before, structuredClone(before))).toEqual([]);
  });
});

describe("the edit form", () => {
  const form = {
    orderNo: "SR10001",
    rev: 2,
    name: "Rahim Uddin",
    phone: "01712-345678",
    districtId: oid(10),
    areaId: oid(11),
    address: "House 12, Road 5, Dhanmondi",
    items: [{ variantId: oid(1), qty: "2" }],
    discount: "100",
    deliveryCharge: "70.5",
  };

  it("takes taka and stores poisha, with the phone in one form", () => {
    const r = orderEditInput.parse(form);
    expect(r).toMatchObject({ phone: "+8801712345678", discount: 10000, deliveryCharge: 7050, items: [{ qty: 2 }] });
  });

  it("refuses an empty order, a line twice and bad ids", () => {
    expect(orderEditInput.safeParse({ ...form, items: [] }).success).toBe(false);
    const twice = [
      { variantId: oid(1), qty: 1 },
      { variantId: oid(1), qty: 1 },
    ];
    expect(orderEditInput.safeParse({ ...form, items: twice }).success).toBe(false);
    expect(orderEditInput.safeParse({ ...form, areaId: { $gt: "" } }).success).toBe(false);
    expect(orderEditInput.safeParse({ ...form, items: [{ variantId: oid(1), qty: 0 }] }).success).toBe(false);
  });
});

describe("list filters", () => {
  const payments = ["unpaid", "advance_pending"] as const;

  it("read only known values from the URL", () => {
    expect(
      readOrderFilters(
        { tab: "confirmed", q: " 01712 ", zone: oid(5), payment: "advance_pending", from: "2026-11-01", page: "3" },
        payments,
      ),
    ).toEqual({
      tab: "confirmed",
      q: "01712",
      zoneId: oid(5),
      payment: "advance_pending",
      from: "2026-11-01",
      to: "",
      page: 3,
    });
    expect(readOrderFilters({ tab: "drop", zone: "x", payment: "paid", from: "1 Nov", page: ["2"] }, payments)).toEqual(
      {
        tab: "pending",
        q: "",
        zoneId: "",
        payment: "",
        from: "",
        to: "",
        page: 1,
      },
    );
  });

  it("go back into a short URL", () => {
    expect(orderFiltersQuery({ tab: "pending", q: "", page: 1 })).toBe("");
    expect(orderFiltersQuery({ tab: "all", q: "SR1" }, 2)).toBe("?tab=all&q=SR1&page=2");
  });

  it("use Dhaka days", () => {
    expect(dhakaDayStart("2026-11-21").toISOString()).toBe("2026-11-20T18:00:00.000Z");
  });

  it("have pages behind the right permissions", () => {
    expect(requiredPermission("/admin/orders")).toBe("orders.view");
    expect(requiredPermission("/admin/orders/SR10001/edit")).toBe("orders.view");
    expect(requiredPermission("/admin/orders/export")).toBe("orders.export");
  });
});

describe("CSV export", () => {
  it("quotes text and stops spreadsheet formulas", () => {
    const o = {
      orderNo: "SR10001",
      createdAt: "2026-11-21T10:00:00.000Z",
      customer: { name: '=HYPERLINK("x")', phone: "+8801712345678", email: "" },
      address: { district: "Dhaka", area: "Adabor", line: "House 1, Road 2", note: "" },
      items: [{ sku: "CHOP-RED", qty: 2 }],
      subtotal: 290000,
      discount: 0,
      deliveryCharge: 7000,
      codFee: 0,
      total: 297000,
      codAmount: 297000,
      advance: null,
      codCollected: 297000,
      refund: null,
      risk: { score: 20 },
    } as unknown as AdminOrder;
    expect(orderCsvLine(o, "Delivered", "Paid")).toBe(
      `SR10001,2026-11-21T10:00:00.000Z,Delivered,Paid,"'=HYPERLINK(""x"")",01712345678,Dhaka,Adabor,"House 1, Road 2",2 x CHOP-RED,2900.00,0.00,70.00,0.00,2970.00,0.00,,2970.00,2970.00,0.00,20`,
    );
  });
});
