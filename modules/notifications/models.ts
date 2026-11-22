import mongoose, { Schema, type Model } from "mongoose";

/**
 * The message log (SRS §7 "notifications", FR-OR-07): one row per SMS or email, written when it is
 * queued and updated by the worker after each try. Codes and sign-in links keep no text here.
 */
const notificationSchema = new Schema(
  {
    channel: { type: String, enum: ["sms", "email"], required: true },
    to: { type: String, required: true },
    /** The event (order_confirmed…) or another purpose (checkout_otp, password_reset…). */
    purpose: { type: String, required: true },
    language: { type: String, default: null },
    orderId: { type: String, default: null },
    orderNo: { type: String, default: null },
    subject: { type: String, default: "" },
    text: { type: String, default: "" },
    /** Email button (e.g. "View invoice"). */
    button: { type: { label: String, url: String }, default: null, _id: false },
    /** Invoice whose PDF goes with the email. */
    attachInvoiceId: { type: String, default: null },
    /** A code or sign-in link: the text isn't kept and it can't be sent again. */
    private: { type: Boolean, default: false },
    status: { type: String, enum: ["queued", "sent", "failed"], default: "queued" },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    provider: { type: String, default: null },
    providerMessageId: { type: String, default: null },
    sentAt: { type: Date, default: null },
    resends: { type: Number, default: 0 },
    lastResentBy: { type: String, default: null },
    /** Private rows go after 30 days, the rest after a year. */
    expiresAt: { type: Date, required: true },
  },
  { collection: "notifications", timestamps: true, minimize: false },
);

notificationSchema.index({ orderId: 1, createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Texts staff changed (SRS §7 "notificationTemplates"); anything not here uses the default. */
const templateSchema = new Schema(
  {
    event: { type: String, required: true },
    channel: { type: String, enum: ["sms", "email"], required: true },
    language: { type: String, enum: ["en", "bn"], required: true },
    subject: { type: String, default: "" },
    body: { type: String, required: true },
    updatedBy: { type: String, default: null },
  },
  { collection: "notificationTemplates", timestamps: true },
);

templateSchema.index({ event: 1, channel: 1, language: 1 }, { unique: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- read back by hand, field by field
type LooseModel = Model<any>;
// Registered again when this file reloads in development, so a schema change applies without a restart.
if (mongoose.models.Notification) mongoose.deleteModel("Notification");
if (mongoose.models.NotificationTemplate) mongoose.deleteModel("NotificationTemplate");
export const Notification: LooseModel = mongoose.model("Notification", notificationSchema) as unknown as LooseModel;
export const NotificationTemplate: LooseModel = mongoose.model(
  "NotificationTemplate",
  templateSchema,
) as unknown as LooseModel;
