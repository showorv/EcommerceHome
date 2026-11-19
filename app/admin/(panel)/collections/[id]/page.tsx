import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionForm } from "@/components/admin/catalog/collection-form";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";
import { getCollection } from "@/modules/catalog/collections";
import { productOptionsForPicker } from "@/modules/catalog/products";

// Reads the collection id from the URL on every request.
export const instant = false;

export default async function EditCollectionPage({ params }: PageProps<"/admin/collections/[id]">) {
  const { permissions } = await requireStaff("products.view");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) notFound();
  const [collection, products, categories] = await Promise.all([
    getCollection(id),
    productOptionsForPicker(),
    listCategories(),
  ]);
  if (!collection) notFound();
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/admin/collections" className="text-muted-foreground text-sm hover:underline">
          ← Collections
        </Link>
        <PageHeader title={collection.name.en} />
      </div>
      <CollectionForm
        key={JSON.stringify(collection)}
        collection={collection}
        products={products}
        categories={categories}
        canEdit={permissions.has("products.edit")}
        canDelete={permissions.has("products.delete")}
      />
    </div>
  );
}
