import Link from "next/link";
import { CollectionForm } from "@/components/admin/catalog/collection-form";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";
import { productOptionsForPicker } from "@/modules/catalog/products";

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function NewCollectionPage() {
  await requireStaff("products.edit");
  const [products, categories] = await Promise.all([productOptionsForPicker(), listCategories()]);
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/admin/collections" className="text-muted-foreground text-sm hover:underline">
          ← Collections
        </Link>
        <PageHeader title="New collection" />
      </div>
      <CollectionForm collection={null} products={products} categories={categories} canEdit canDelete={false} />
    </div>
  );
}
