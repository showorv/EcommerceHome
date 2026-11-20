import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Append-only audit log (FR-AD-10, NFR-SEC-16). Every update/delete query on this
 * model throws. In production the app's database user should also lack update/delete
 * rights on this collection (see README, "Production database user").
 */
const auditLogSchema = new Schema(
  {
    actorId: { type: String, default: null }, // null = system
    actorEmail: { type: String, default: null },
    action: { type: String, required: true }, // e.g. "order.confirm", "staff.invite"
    entity: { type: String, required: true }, // e.g. "order", "user", "settings"
    entityId: { type: String, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { collection: "auditLogs", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

const blocked = () => {
  throw new Error("Audit log is append-only");
};
for (const op of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const) {
  auditLogSchema.pre(op, blocked);
}
auditLogSchema.pre("save", function () {
  if (!this.isNew) throw new Error("Audit log is append-only");
});

export type AuditLog = InferSchemaType<typeof auditLogSchema>;

export const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<AuditLog> | undefined) ??
  mongoose.model<AuditLog>("AuditLog", auditLogSchema);
