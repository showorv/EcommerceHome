import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { ProductForm } from "@/components/admin/catalog/product-form";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function NewProductPage() {
  await requireStaff("products.edit");
  const categories = await listCategories();
  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
          ← Products
        </Link>
        <PageHeader title="Add product" description="Saved as a draft until you set it to Active." />
      </div>
      <ProductForm product={null} categories={categories} canEdit />
    </div>
  );
}
