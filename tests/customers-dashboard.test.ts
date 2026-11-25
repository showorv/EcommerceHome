import { describe, expect, it } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { can } from "@/modules/auth/rbac";
import {
  customerFiltersQuery,
  customerHref,
  customerSearch,
  percent,
  phoneFromParam,
  readCustomerFilters,
  returnRate,
  statsFromOrders,
} from "@/modules/customers/stats";
import {
  dashboardRates,
  periodStart,
  rate,
  ratePercent,
  readPeriod,
  type OrderCounts,
  type Outcomes,
} from "@/modules/dashboard/dashboard";

describe("customer stats", () => {
  it("counts statuses and adds up what was kept, less refunds", () => {
    const s = statsFromOrders([
      { status: "delivered", total: 100_000, createdAt: "2026-11-01T10:00:00Z" },
      { status: "partially_delivered", total: 50_000, refund: { amount: 20_000 }, createdAt: "2026-11-05T10:00:00Z" },
      { status: "returned", total: 70_000, refund: { amount: 70_000 }, createdAt: "2026-11-03T10:00:00Z" },
      { status: "cancelled", total: 9_000, createdAt: "2026-10-20T10:00:00Z" },
      { status: "pending", total: 30_000, createdAt: "2026-11-20T10:00:00Z" },
      { status: "shipped", total: 30_000, createdAt: "2026-11-19T10:00:00Z" },
    ]);
    expect(s).toMatchObject({ orders: 6, open: 2, delivered: 1, partial: 1, cancelled: 1, returned: 1 });
    expect(s.value).toBe(130_000);
    expect(s.firstOrderAt).toBe("2026-10-20T10:00:00.000Z");
    expect(s.lastOrderAt).toBe("2026-11-20T10:00:00.000Z");
  });

  it("has nothing for no orders", () => {
    expect(statsFromOrders([])).toMatchObject({ orders: 0, value: 0, firstOrderAt: null, lastOrderAt: null });
  });

  it("return rate is of the orders that reached the door", () => {
    expect(returnRate({ delivered: 2, partial: 1, returned: 1 })).toBe(0.25);
    expect(returnRate({ delivered: 0, partial: 0, returned: 0 })).toBeNull();
    expect(percent(1 / 3)).toBe("33%");
    expect(percent(null)).toBe("—");
  });
});

describe("customer addresses and filters", () => {
  it("links by the local number and reads it back", () => {
    expect(customerHref("+8801712345678")).toBe("/admin/customers/01712345678");
    expect(phoneFromParam("01712345678")).toBe("+8801712345678");
    expect(phoneFromParam("%2B8801712345678")).toBe("+8801712345678");
    expect(phoneFromParam("12345")).toBeNull();
    expect(phoneFromParam("%E0%A4")).toBeNull();
  });

  it("reads filters with safe defaults", () => {
    expect(readCustomerFilters({})).toEqual({ q: "", sort: "recent", show: "all", page: 1 });
    expect(readCustomerFilters({ sort: "value", show: "listed", page: "3", q: "  Rahim " })).toEqual({
      q: "Rahim",
      sort: "value",
      show: "listed",
      page: 3,
    });
    expect(readCustomerFilters({ sort: "$where", show: ["repeat", "x"], page: "-2" })).toMatchObject({
      sort: "recent",
      show: "repeat",
      page: 1,
    });
    expect(customerFiltersQuery({ q: "a b", sort: "recent", show: "returns" }, 2)).toBe("?q=a+b&show=returns&page=2");
    expect(customerFiltersQuery({ sort: "recent", show: "all" })).toBe("");
  });

  it("searches numbers by digits and names as literal text", () => {
    expect(customerSearch("")).toBeNull();
    expect(customerSearch("01712-345")).toEqual({ phone: "1712345" });
    expect(customerSearch("+8801712")).toEqual({ phone: "1712" });
    expect(customerSearch("Rahim (Dhaka)")).toEqual({ name: "Rahim \\(Dhaka\\)" });
    expect(customerSearch(".*")).toEqual({ name: "\\.\\*" });
  });
});

describe("dashboard", () => {
  it("starts periods at Dhaka midnight", () => {
    // 22 Nov 2026, 01:30 in Dhaka = 21 Nov 19:30 UTC.
    const now = Date.parse("2026-11-21T19:30:00Z");
    expect(periodStart("today", now).toISOString()).toBe("2026-11-21T18:00:00.000Z");
    expect(periodStart("7d", now).toISOString()).toBe("2026-11-15T18:00:00.000Z");
    expect(periodStart("30d", now).toISOString()).toBe("2026-10-23T18:00:00.000Z");
    // Just before Dhaka midnight it is still the 21st there.
    expect(periodStart("today", Date.parse("2026-11-21T17:59:00Z")).toISOString()).toBe("2026-11-20T18:00:00.000Z");
  });

  it("reads the period", () => {
    expect(readPeriod("7d")).toBe("7d");
    expect(readPeriod(["30d"])).toBe("30d");
    expect(readPeriod("year")).toBe("today");
    expect(readPeriod(undefined)).toBe("today");
  });

  it("works out the rates", () => {
    const c: OrderCounts = { placed: 12, value: 0, decided: 10, confirmed: 8 };
    const o: Outcomes = { delivered: 6, partial: 1, returned: 3, deliveredValue: 0 };
    const r = dashboardRates(c, o);
    expect(r.confirmation).toEqual({ part: 8, of: 10, rate: 0.8 });
    expect(r.deliverySuccess.rate).toBe(0.7);
    expect(r.rto.rate).toBe(0.3);
    expect(ratePercent(r.rto)).toBe("30%");
    expect(ratePercent(rate(0, 0))).toBe("—");
  });
});

describe("customers admin access", () => {
  it("needs customers.view; blocking needs customers.block", () => {
    expect(requiredPermission("/admin/customers")).toBe("customers.view");
    expect(requiredPermission("/admin/customers/01712345678")).toBe("customers.view");
    expect(can({ role: "staff" }, "customers.view")).toBe(true);
    expect(can({ role: "staff" }, "customers.block")).toBe(false);
    expect(can({ role: "manager" }, "customers.block")).toBe(true);
  });
});
