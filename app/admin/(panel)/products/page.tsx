import { ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { ProductRowActions } from "@/components/admin/catalog/product-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import { requireStaff } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/categories";
import { listProductsAdmin } from "@/modules/catalog/products";

// Reads the URL filters on every request.
export const instant = false;

const STATUS_BADGE = {
  active: <Badge variant="secondary">Active</Badge>,
  draft: <Badge variant="outline">Draft</Badge>,
  archived: <Badge variant="outline">Archived</Badge>,
} as const;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const { permissions } = await requireStaff("products.view");
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = one(sp.status) ?? "";
  const categoryId = one(sp.category) ?? "";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ rows, total, pageCount }, categories] = await Promise.all([
    listProductsAdmin({ q, status, categoryId, page }),
    listCategories(),
  ]);
  const canEdit = permissions.has("products.edit");
  const pageHref = (p: number) => {
    const u = new URLSearchParams({
      ...(q && { q }),
      ...(status && { status }),
      ...(categoryId && { category: categoryId }),
    });
    if (p > 1) u.set("page", String(p));
    return `/admin/products${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"}`}
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus className="size-4" aria-hidden /> Add product
              </Link>
            </Button>
          )
        }
      />

      <form className="flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search title, slug or SKU"
          className="max-w-xs"
          aria-label="Search products"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <select
          name="category"
          defaultValue={categoryId}
          aria-label="Category"
          className="bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {"  ".repeat(c.depth)}
              {c.name.en}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(q || status || categoryId) && (
          <Button asChild variant="ghost">
            <Link href="/admin/products">Clear</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          {q || status || categoryId ? "No products match these filters." : "No products yet. Add your first product."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14" />
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="bg-muted flex size-10 items-center justify-center overflow-hidden rounded-md">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                        <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon className="text-muted-foreground size-4" aria-hidden />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                    </div>
                  </TableCell>
                  <TableCell>{STATUS_BADGE[p.status]}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {p.priceMin === p.priceMax
                      ? formatTaka(p.priceMin)
                      : `${formatTaka(p.priceMin)} – ${formatTaka(p.priceMax)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.lowStock ? (
                      <Badge variant={p.totalStock === 0 ? "destructive" : "outline"}>
                        {p.totalStock === 0 ? "Out" : p.totalStock}
                      </Badge>
                    ) : (
                      p.totalStock
                    )}
                  </TableCell>
                  <TableCell>
                    <ProductRowActions
                      id={p.id}
                      title={p.title}
                      slug={p.slug}
                      status={p.status}
                      canEdit={canEdit}
                      canDelete={permissions.has("products.delete")}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Pages">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>Previous</Link>
            </Button>
          )}
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>Next</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
