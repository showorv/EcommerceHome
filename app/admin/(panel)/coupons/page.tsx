import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { CouponsEditor } from "@/components/admin/coupons/coupons-editor";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";
import { productOptionsForPicker } from "@/modules/catalog/products";
import { listCoupons } from "@/modules/coupons/data";

export const metadata: Metadata = { title: "Coupons" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function CouponsPage() {
  await requireStaff("coupons.manage");
  const [coupons, products, cats] = await Promise.all([listCoupons(), productOptionsForPicker(), listCategories()]);
  // "Kitchen › Choppers" so sub-categories are easy to tell apart.
  const byId = new Map(cats.map((c) => [c.id, c]));
  const path = (id: string): string => {
    const c = byId.get(id);
    if (!c) return "";
    return c.parentId && byId.has(c.parentId) ? `${path(c.parentId)} › ${c.name.en}` : c.name.en;
  };
  const categories = cats.map((c) => ({ id: c.id, name: path(c.id) })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="grid gap-6">
      <PageHeader title="Coupons" description="Discount codes customers can use at checkout." />
      <CouponsEditor coupons={coupons} products={products} categories={categories} />
    </div>
  );
}
