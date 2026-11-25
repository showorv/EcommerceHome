import mongoose, { Schema, type Model } from "mongoose";

/**
 * Invoices (SRS §7 "invoices"). One per order, issued when it is confirmed. The link token is kept
 * twice: its SHA-256 to find the invoice, and encrypted (AES-GCM) so the PDF's QR code and the admin
 * "copy link" can show it. The PDF itself is stored here: private, and backed up with the database.
 */
const invoiceSchema = new Schema(
  {
    invoiceNo: { type: String, required: true },
    orderId: { type: String, required: true },
    orderNo: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    /** What the invoice shows, fixed at confirmation (InvoiceSnapshot). */
    snapshot: { type: Schema.Types.Mixed, required: true },
    accessTokenHash: { type: String, required: true },
    accessTokenEnc: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    /** Rendered by the worker after confirmation (or on first download). Never sent to lists. */
    pdf: { type: Buffer, default: null, select: false },
    pdfRenderedAt: { type: Date, default: null },
    /** Which token the stored PDF's QR code points to: a new link means a new PDF. */
    pdfTokenHash: { type: String, default: null },
  },
  { collection: "invoices", timestamps: true, minimize: false },
);

invoiceSchema.index({ invoiceNo: 1 }, { unique: true });
invoiceSchema.index({ orderId: 1 }, { unique: true });
invoiceSchema.index({ accessTokenHash: 1 }, { unique: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- written by issue.ts, read back by hand
type LooseModel = Model<any>;
// Registered again when this file reloads in development, so a schema change applies without a restart.
if (mongoose.models.Invoice) mongoose.deleteModel("Invoice");
export const Invoice: LooseModel = mongoose.model("Invoice", invoiceSchema) as unknown as LooseModel;
