import { checkStaff } from "@/modules/auth/session";
import { Invoice } from "@/modules/invoices/models";
import { ensureInvoicePdf } from "@/modules/invoices/pdf";
import { isOrderNo } from "@/modules/orders/orders";
import { connectMongoose } from "@/lib/db/mongo";

/** GET /admin/orders/<orderNo>/invoice: the invoice PDF for staff, whatever the state of the customer's link. */
export async function GET(_req: Request, ctx: RouteContext<"/admin/orders/[orderNo]/invoice">) {
  const g = await checkStaff("orders.view");
  if (!g.ok) return new Response(g.status === 401 ? "Please sign in again." : "Forbidden", { status: g.status });
  const { orderNo } = await ctx.params;
  if (!isOrderNo(orderNo)) return new Response("Not found", { status: 404 });
  await connectMongoose();
  const inv = await Invoice.findOne({ orderNo }).select("_id").lean<{ _id: unknown }>();
  const file = inv ? await ensureInvoicePdf(String(inv._id)) : null;
  if (!file) return new Response("This order has no invoice yet.", { status: 404 });
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${file.invoiceNo}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
