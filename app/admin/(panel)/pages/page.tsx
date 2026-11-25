import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tryWriteAudit } from "@/modules/audit/audit";
import { requestMeta, requireStaff } from "@/modules/auth/session";
import { ensureStandardPages, listPages } from "@/modules/cms/pages";
import { formatDhaka } from "@/modules/storefront/sections";

export const metadata: Metadata = { title: "Pages" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

const STATUS = {
  live: <Badge className="bg-emerald-600 text-white">Live</Badge>,
  changes: <Badge variant="secondary">Live · unpublished changes</Badge>,
  draft: <Badge variant="outline">Not published</Badge>,
} as const;

/** CMS pages list (FR-SF-09). The first visit adds the standard pages as drafts to review. */
export default async function PagesPage() {
  const { user } = await requireStaff("cms.edit");
  const added = await ensureStandardPages(user.id);
  if (added > 0) {
    await tryWriteAudit({
      actor: { id: user.id, email: user.email },
      action: "cms.page.seed",
      entity: "cmsPage",
      after: { added },
      ...(await requestMeta()),
    });
  }
  const rows = await listPages();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Pages"
        description="About, policies, FAQ, Contact and any other page. Each lives at /pages/<address>."
        actions={
          <Button asChild>
            <Link href="/admin/pages/new">
              <Plus className="size-4" aria-hidden /> New page
            </Link>
          </Button>
        }
      />
      {added > 0 && (
        <p className="bg-brand/5 rounded-md border px-4 py-3 text-sm">
          We added {added} standard pages with starter text. Read each one, change what doesn’t fit your shop (return
          days, delivery times, contact details), then publish it.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">No pages yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/admin/pages/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    <div className="text-muted-foreground font-mono text-xs">/pages/{p.slug}</div>
                  </TableCell>
                  <TableCell>{STATUS[p.status]}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDhaka(p.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
