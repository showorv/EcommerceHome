import { currentCustomer, myInvoicePdf } from "@/modules/account/data";
import { isOrderNo } from "@/modules/orders/orders";

/**
 * GET /account/orders/<orderNo>/invoice: the invoice PDF of one of your orders (FR-AC-06). Works even
 * if staff turned the public link off; anyone else gets 404, so order numbers can't be probed.
 */
export async function GET(_req: Request, ctx: RouteContext<"/account/orders/[orderNo]/invoice">) {
  const c = await currentCustomer();
  if (!c) return new Response("Please sign in again.", { status: 401 });
  const { orderNo } = await ctx.params;
  if (!isOrderNo(orderNo)) return new Response("Not found", { status: 404 });
  const file = await myInvoicePdf(c, orderNo);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${file.invoiceNo}.pdf"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
