"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Field, report, selectClass } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addBlockedAction, removeBlockedAction, updateBlockedAction } from "@/modules/customers/actions";
import { BLOCK_KIND_NAMES, BLOCK_KINDS, type BlockedContact, type BlockKind } from "@/modules/customers/blocks";

const shown = (phone: string) => phone.replace(/^\+88/, "");
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dhaka",
});

type Draft = { phone: string; kind: BlockKind; reason: string };
const EMPTY: Draft = { phone: "", kind: "block", reason: "" };

export function BlockedNumbers({ rows }: { rows: BlockedContact[] }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; kind: BlockKind; reason: string } | null>(null);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();

  const list = useMemo(() => {
    const q = query.replace(/\D/g, "");
    const words = query.trim().toLowerCase();
    if (!words) return rows;
    return rows.filter((r) => (q && r.phone.includes(q)) || r.reason.toLowerCase().includes(words));
  }, [rows, query]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      if (report(await addBlockedAction(draft))) setDraft(EMPTY);
    });
  }

  function saveEdit() {
    if (!editing) return;
    start(async () => {
      if (report(await updateBlockedAction(editing))) setEditing(null);
    });
  }

  function remove(r: BlockedContact) {
    if (!confirm(`Remove ${shown(r.phone)} from the list? It can order normally again.`)) return;
    start(async () => {
      report(await removeBlockedAction(r.id));
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a number</CardTitle>
          <CardDescription>Customers are never told why. Your note is for staff only.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={add}
            className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end"
          >
            <Field label="Mobile number" htmlFor="block-phone">
              <Input
                id="block-phone"
                type="tel"
                inputMode="tel"
                placeholder="01XXXXXXXXX"
                maxLength={18}
                required
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </Field>
            <Field label="Action" htmlFor="block-kind">
              <select
                id="block-kind"
                className={selectClass}
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as BlockKind })}
              >
                {BLOCK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "block" ? "Block ordering" : "Flag for checking"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason" htmlFor="block-reason">
              <Input
                id="block-reason"
                maxLength={200}
                required
                placeholder="e.g. Refused 3 deliveries"
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            On the list <span className="text-muted-foreground text-sm font-normal">({rows.length})</span>
          </h2>
          {rows.length > 0 && (
            <Input
              aria-label="Search by number or reason"
              placeholder="Search number or reason"
              className="w-full sm:w-64"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
            No blocked or flagged numbers.
          </p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing matches “{query}”.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-56">Reason</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) =>
                  editing?.id === r.id ? (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{shown(r.phone)}</TableCell>
                      <TableCell>
                        <select
                          aria-label={`Status for ${shown(r.phone)}`}
                          className={selectClass}
                          value={editing.kind}
                          onChange={(e) => setEditing({ ...editing, kind: e.target.value as BlockKind })}
                        >
                          {BLOCK_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {BLOCK_KIND_NAMES[k]}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Reason for ${shown(r.phone)}`}
                          maxLength={200}
                          value={editing.reason}
                          onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {dateFmt.format(new Date(r.createdAt))}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" onClick={saveEdit} disabled={pending}>
                          Save
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(null)}
                          aria-label="Cancel editing"
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono whitespace-nowrap">{shown(r.phone)}</TableCell>
                      <TableCell>
                        <Badge variant={r.kind === "block" ? "destructive" : "secondary"}>
                          {BLOCK_KIND_NAMES[r.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">{r.reason}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {dateFmt.format(new Date(r.createdAt))}
                        {r.byName && <span className="block text-xs">by {r.byName}</span>}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing({ id: r.id, kind: r.kind, reason: r.reason })}
                          aria-label={`Change ${shown(r.phone)}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => remove(r)}
                          aria-label={`Remove ${shown(r.phone)}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
