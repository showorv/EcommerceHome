import type { Query, Schema } from "mongoose";

/**
 * Soft delete for products, customers and content (SRS §7): documents get `deletedAt`
 * instead of being removed, and normal find queries skip them automatically.
 * Pass `{ withDeleted: true }` in query options to include them (e.g. in admin restore views).
 */
export function softDeletePlugin(schema: Schema) {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });

  const hideDeleted = function (this: Query<unknown, unknown>) {
    if (this.getOptions().withDeleted) return;
    const filter = this.getFilter();
    if (!("deletedAt" in filter)) this.where({ deletedAt: null });
  };
  for (const op of ["find", "findOne", "countDocuments", "findOneAndUpdate", "updateMany", "updateOne"] as const) {
    schema.pre(op, hideDeleted);
  }

  schema.method("softDelete", function (this: { deletedAt: Date | null; save(): Promise<unknown> }) {
    this.deletedAt = new Date();
    return this.save();
  });
  schema.method("restore", function (this: { deletedAt: Date | null; save(): Promise<unknown> }) {
    this.deletedAt = null;
    return this.save();
  });
}
