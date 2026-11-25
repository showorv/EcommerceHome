import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { decrypt } from "@/lib/crypto";
import { connectMongoose } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { invoiceHtml } from "./html";
import { invoiceUrl, type InvoiceSnapshot } from "./invoices";
import { Invoice } from "./models";

/**
 * Invoice PDFs (FR-OR-03/05), printed by Chrome so Bangla names and addresses are shaped correctly
 * (react-pdf breaks Bangla conjuncts). The page gets no JavaScript and no network: it is our own
 * escaped HTML with the fonts inlined. Used by the worker (right after confirmation) and by the
 * download routes (when the PDF isn't there yet). Not marked server-only: worker code.
 */

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans-bengali", "files");
const FACES = [
  ["Invoice Latin", "latin", 400],
  ["Invoice Latin", "latin", 700],
  ["Invoice Bangla", "bengali", 400],
  ["Invoice Bangla", "bengali", 700],
] as const;

let fontCss: Promise<string> | null = null;

/** Noto Sans Bengali (Latin and Bangla parts) as inline @font-face rules, read once. */
function fonts(): Promise<string> {
  fontCss ??= Promise.all(
    FACES.map(async ([family, subset, weight]) => {
      const file = path.join(FONT_DIR, `noto-sans-bengali-${subset}-${weight}-normal.woff2`);
      const data = (await readFile(file)).toString("base64");
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
    }),
  ).then((rules) => rules.join("\n"));
  fontCss.catch(() => (fontCss = null));
  return fontCss;
}

/** HTML → A4 PDF in a fresh headless Chrome. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const exe = env().CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : { channel: "chrome" }),
    args: ["--no-first-run", "--disable-extensions"],
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await context.newPage();
    // Nothing leaves the page: everything it needs is inline.
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready").catch(() => undefined);
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

export async function renderInvoicePdf(snapshot: InvoiceSnapshot, link: string): Promise<Buffer> {
  const [css, qrSvg] = await Promise.all([
    fonts(),
    QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
  ]);
  return htmlToPdf(invoiceHtml(snapshot, { link, qrSvg, fontCss: css }));
}

/** A stored binary as read back (Buffer, or the driver's Binary with its bytes in `.buffer`). */
function toBuffer(v: unknown): Buffer | null {
  if (!v) return null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  const inner = (v as { buffer?: unknown }).buffer;
  return inner instanceof Uint8Array ? Buffer.from(inner) : null;
}

/**
 * The invoice's PDF: the stored one if it was printed for the current link, otherwise printed now
 * and stored. Returns null if there is no such invoice.
 */
export async function ensureInvoicePdf(invoiceId: string): Promise<{ pdf: Buffer; invoiceNo: string } | null> {
  await connectMongoose();
  const inv = await Invoice.findById(invoiceId)
    .select("+pdf invoiceNo snapshot accessTokenHash accessTokenEnc pdfTokenHash")
    .lean<{
      _id: unknown;
      invoiceNo: string;
      snapshot: InvoiceSnapshot;
      accessTokenHash: string;
      accessTokenEnc: string;
      pdf?: unknown;
      pdfTokenHash: string | null;
    }>();
  if (!inv) return null;
  const stored = toBuffer(inv.pdf);
  if (stored && inv.pdfTokenHash === inv.accessTokenHash) return { pdf: stored, invoiceNo: inv.invoiceNo };
  const token = decrypt(inv.accessTokenEnc, env().ENCRYPTION_KEY);
  const pdf = await renderInvoicePdf(inv.snapshot, invoiceUrl(env().APP_URL, token));
  // Saved only if the link didn't change while printing.
  await Invoice.updateOne(
    { _id: inv._id, accessTokenHash: inv.accessTokenHash },
    { $set: { pdf, pdfRenderedAt: new Date(), pdfTokenHash: inv.accessTokenHash } },
  );
  return { pdf, invoiceNo: inv.invoiceNo };
}
