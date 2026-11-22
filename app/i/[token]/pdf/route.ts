import { connection } from "next/server";
import { invoiceOpenAllowed } from "@/modules/invoices/access";
import { invoiceByToken } from "@/modules/invoices/data";
import { ensureInvoicePdf } from "@/modules/invoices/pdf";

/** GET /i/<token>/pdf: the invoice PDF for a working link (FR-OR-04/05). Printed now if it isn't stored yet. */
export async function GET(_req: Request, ctx: RouteContext<"/i/[token]/pdf">) {
  await connection();
  const { token } = await ctx.params;
  if (!(await invoiceOpenAllowed())) {
    return new Response("Too many tries. Please wait a few minutes.", {
      status: 429,
      headers: { "retry-after": "600" },
    });
  }
  const found = await invoiceByToken(token);
  const file = found ? await ensureInvoicePdf(found.id) : null;
  if (!file)
    return new Response("This invoice link doesn't work.", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${file.invoiceNo}.pdf"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
    },
  });
}
