import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/modules/auth/session";
import { listCollections } from "@/modules/catalog/collections";

export default async function CollectionsPage() {
  const { permissions } = await requireStaff("products.view");
  const rows = await listCollections();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Collections"
        description='Hand-picked groups ("Eid gifts") or automatic ones ("under ৳500", "on sale").'
        actions={
          permissions.has("products.edit") && (
            <Button asChild>
              <Link href="/admin/collections/new">
                <Plus className="size-4" aria-hidden /> New collection
              </Link>
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No collections yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/collections/${c.id}`} className="font-medium hover:underline">
                      {c.name.en}
                    </Link>
                    <div className="text-muted-foreground font-mono text-xs">/collections/{c.slug}</div>
                  </TableCell>
                  <TableCell>
                    {c.type === "manual"
                      ? "Hand-picked"
                      : `Automatic · ${c.rules.length} rule${c.rules.length === 1 ? "" : "s"}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.productCount}</TableCell>
                  <TableCell>
                    {c.active ? <Badge variant="secondary">Visible</Badge> : <Badge variant="outline">Hidden</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
