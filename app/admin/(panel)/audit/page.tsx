import Link from "next/link";
import { isValidObjectId } from "mongoose";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { connectMongoose } from "@/lib/db/mongo";
import { AuditLogModel } from "@/modules/audit/audit-log.model";
import { requireStaff } from "@/modules/auth/session";

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

const PAGE_SIZE = 50;

/** Audit log viewer (FR-AD-10). Cursor pagination by _id, newest first (NFR-SC-06). */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff("audit.view");
  const { before, action } = await searchParams;

  await connectMongoose();
  const filter: Record<string, unknown> = {};
  if (typeof before === "string" && isValidObjectId(before)) filter._id = { $lt: before };
  if (typeof action === "string" && /^[a-z_.]{1,60}$/.test(action)) filter.action = action;

  const rows = await AuditLogModel.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE).lean();
  const last = rows.at(-1);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground text-sm">Every admin action. Entries cannot be edited or deleted.</p>
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    No entries yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={String(r._id)}>
                  <TableCell className="whitespace-nowrap">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }) : "—"}
                  </TableCell>
                  <TableCell>{r.actorEmail ?? "system"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/audit?action=${encodeURIComponent(r.action)}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {r.action}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.entity}
                    {r.entityId ? `:${r.entityId}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs font-mono text-xs break-all">
                    {r.before ? <div>− {JSON.stringify(r.before)}</div> : null}
                    {r.after ? <div>+ {JSON.stringify(r.after)}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">{r.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        {(typeof before === "string" || typeof action === "string") && (
          <Button asChild variant="outline">
            <Link href="/admin/audit">Newest</Link>
          </Button>
        )}
        {rows.length === PAGE_SIZE && last && (
          <Button asChild variant="outline">
            <Link
              href={`/admin/audit?before=${String(last._id)}${typeof action === "string" ? `&action=${encodeURIComponent(action)}` : ""}`}
            >
              Older
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
