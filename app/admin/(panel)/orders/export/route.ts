import type { NextRequest } from "next/server";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { ordersForExport } from "@/modules/orders/admin-data";
import { ORDER_STATUS_NAMES, PAYMENT_STATUS_NAMES, PAYMENT_STATUSES } from "@/modules/orders/orders";
import { ORDER_CSV_HEADER, orderCsvLine, readOrderFilters } from "@/modules/orders/staff";

/**
 * GET /admin/orders/export?tab=…&q=…: the orders the list shows (all pages, up to 5,000), as CSV
 * (FR-AD-05). Starts with a byte-order mark so Excel reads Bangla names correctly.
 */
export async function GET(req: NextRequest) {
  const g = await checkStaff("orders.export");
  if (!g.ok) return new Response(g.status === 401 ? "Please sign in again." : "Forbidden", { status: g.status });
  const filters = readOrderFilters(Object.fromEntries(req.nextUrl.searchParams), PAYMENT_STATUSES);
  const orders = await ordersForExport(filters);
  const csv = [
    ORDER_CSV_HEADER.join(","),
    ...orders.map((o) => orderCsvLine(o, ORDER_STATUS_NAMES[o.status], PAYMENT_STATUS_NAMES[o.paymentStatus])),
  ].join("\r\n");
  const used = { ...filters, page: undefined };
  await writeAudit({
    actor: { id: g.ctx.user.id, email: g.ctx.user.email },
    action: "orders.export",
    entity: "order",
    entityId: "export",
    after: { count: orders.length, filters: used },
    ...(await requestMeta()),
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}
