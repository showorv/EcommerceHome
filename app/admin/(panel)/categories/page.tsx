import { CategoryManager } from "@/components/admin/catalog/category-manager";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function CategoriesPage() {
  const { permissions } = await requireStaff("products.view");
  const rows = await listCategories();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Categories"
        description="Group products for menus and category pages. Lower order numbers show first."
      />
      <CategoryManager
        rows={rows}
        canEdit={permissions.has("products.edit")}
        canDelete={permissions.has("products.delete")}
      />
    </div>
  );
}
