import { formatTaka } from "@/lib/money";
import { WALLET_NAMES } from "@/modules/payments/payments";
import { invoiceDate, type InvoiceSnapshot } from "./invoices";

/**
 * The invoice as one A4 HTML page, for the PDF (FR-OR-05). Pure: the fonts (as @font-face CSS) and
 * the QR code (as SVG) are passed in. Every value from the order is escaped; nothing is fetched.
 */

const esc = (v: string | number) =>
  String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const row = (label: string, value: string, cls = "") =>
  `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;

export function invoiceHtml(s: InvoiceSnapshot, opts: { link: string; qrSvg: string; fontCss: string }): string {
  const store = [s.store.address, s.store.phone, s.store.email].filter(Boolean).map(esc).join("<br>");
  const items = s.items
    .map(
      (i, n) => `<tr>
        <td class="n">${n + 1}</td>
        <td><div class="title">${esc(i.title)}</div><div class="muted">${esc([i.variantTitle, i.sku].filter(Boolean).join(" · "))}</div></td>
        <td class="num">${esc(i.qty)}</td>
        <td class="num">${esc(formatTaka(i.price))}</td>
        <td class="num">${esc(formatTaka(i.price * i.qty))}</td>
      </tr>`,
    )
    .join("");
  const totals = [
    row("Subtotal", formatTaka(s.subtotal)),
    s.discount > 0 ? row(s.couponCode ? `Discount (${s.couponCode})` : "Discount", `−${formatTaka(s.discount)}`) : "",
    row(`Delivery (${s.address.zoneName})`, formatTaka(s.deliveryCharge)),
    s.codFee > 0 ? row("COD fee", formatTaka(s.codFee)) : "",
    row("Total", formatTaka(s.total), "total"),
    s.advance
      ? row(
          `Advance (${WALLET_NAMES[s.advance.method]}, TrxID …${s.advance.trxLast4})`,
          `−${formatTaka(s.advance.amount)}`,
        )
      : "",
    row("To pay on delivery", formatTaka(s.codAmount), "due"),
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(s.invoiceNo)}</title>
<style>
${opts.fontCss}
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Invoice Latin", "Invoice Bangla", sans-serif; font-size: 10pt; color: #111; line-height: 1.45; }
.muted { color: #666; font-size: 8.5pt; }
header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
.shop { font-size: 17pt; font-weight: 700; line-height: 1.2; margin-bottom: 4px; }
.meta { text-align: right; }
.meta h1 { margin: 0 0 6px; font-size: 18pt; letter-spacing: 2px; }
.meta table td { padding: 1px 0 1px 12px; }
.meta table td:first-child { color: #666; }
.parties { display: flex; gap: 24px; margin: 16px 0; }
.parties > div { flex: 1; }
.label { text-transform: uppercase; letter-spacing: 1px; font-size: 7.5pt; color: #666; margin-bottom: 3px; }
table { border-collapse: collapse; width: 100%; }
.items th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .5px; color: #444; border-bottom: 1px solid #111; padding: 6px 6px; }
.items td { border-bottom: 1px solid #ddd; padding: 7px 6px; vertical-align: top; }
.items .n { width: 22px; color: #666; }
.title { font-weight: 600; }
.num { text-align: right; white-space: nowrap; }
.bottom { display: flex; justify-content: space-between; gap: 24px; margin-top: 14px; page-break-inside: avoid; }
.qr { width: 150px; text-align: center; font-size: 7.5pt; color: #666; }
.qr svg { width: 110px; height: 110px; display: block; margin: 0 auto 4px; }
.totals { width: 340px; }
.totals td { padding: 3px 0; }
.totals .total td { border-top: 1px solid #111; font-weight: 700; padding-top: 6px; }
.totals .due td { font-weight: 700; font-size: 12pt; border-top: 2px solid #111; padding-top: 6px; }
footer { margin-top: 22px; border-top: 1px solid #ddd; padding-top: 8px; color: #444; font-size: 8.5pt; }
.link { word-break: break-all; }
</style></head>
<body>
<header>
  <div><div class="shop">${esc(s.store.name)}</div><div class="muted">${store}</div></div>
  <div class="meta"><h1>INVOICE</h1>
    <table>
      <tr><td>Invoice</td><td><b>${esc(s.invoiceNo)}</b></td></tr>
      <tr><td>Order</td><td>${esc(s.orderNo)}</td></tr>
      <tr><td>Invoice date</td><td>${esc(invoiceDate(s.issuedAt))}</td></tr>
      <tr><td>Order date</td><td>${esc(invoiceDate(s.orderedAt))}</td></tr>
    </table>
  </div>
</header>
<section class="parties">
  <div><div class="label">Bill to</div><b>${esc(s.customer.name)}</b><br>${esc(s.customer.phone)}${s.customer.email ? `<br>${esc(s.customer.email)}` : ""}</div>
  <div><div class="label">Deliver to</div>${esc(s.address.line)}<br>${esc(`${s.address.area}, ${s.address.district}`)}</div>
  <div><div class="label">Payment</div>${esc(s.paymentMethod)}</div>
</section>
<table class="items">
  <thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
  <tbody>${items}</tbody>
</table>
<section class="bottom">
  <div class="qr">${opts.qrSvg}Scan to see this invoice online<br><span class="link">${esc(opts.link)}</span></div>
  <table class="totals">${totals}</table>
</section>
${s.footer ? `<footer>${esc(s.footer)}</footer>` : ""}
</body></html>`;
}
