import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { ProductForm } from "@/components/admin/catalog/product-form";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";
import { getProductForEdit } from "@/modules/catalog/products";

// Reads the product id from the URL on every request.
export const instant = false;

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { permissions } = await requireStaff("products.view");
  const { id } = await params;
  const [product, categories] = await Promise.all([getProductForEdit(id), listCategories()]);
  if (!product) notFound();
  // Landed cost is for managers and owners only.
  if (!permissions.has("reports.view")) product.variants = product.variants.map((v) => ({ ...v, costPrice: 0 }));
  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
          ← Products
        </Link>
        <PageHeader
          title={product.title.en}
          description={`Last saved ${new Date(product.updatedAt).toLocaleString("en-GB")}`}
        />
      </div>
      {/* key: a fresh form after each save, so "unsaved changes" resets to the saved data */}
      <ProductForm
        key={product.updatedAt}
        product={product}
        categories={categories}
        canEdit={permissions.has("products.edit")}
      />
    </div>
  );
}
