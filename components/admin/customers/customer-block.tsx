"use client";

import { useState, useTransition } from "react";
import { report, selectClass } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBlockedAction, removeBlockedAction, updateBlockedAction } from "@/modules/customers/actions";
import { BLOCK_KIND_NAMES, BLOCK_KINDS, type BlockedContact, type BlockKind } from "@/modules/customers/blocks";

const shown = (phone: string) => phone.replace(/^\+88/, "");

/** Block or flag this customer's number, from their page (same list as Admin → Blocked numbers). */
export function CustomerBlock({
  phone,
  entry,
  canChange,
}: {
  phone: string;
  entry: BlockedContact | null;
  canChange: boolean;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<BlockKind>(entry?.kind ?? "flag");
  const [reason, setReason] = useState(entry?.reason ?? "");

  function open() {
    setKind(entry?.kind ?? "flag");
    setReason(entry?.reason ?? "");
    setEditing(true);
  }

  function save() {
    start(async () => {
      const res = entry
        ? await updateBlockedAction({ id: entry.id, kind, reason })
        : await addBlockedAction({ phone, kind, reason });
      if (report(res)) setEditing(false);
    });
  }

  function remove() {
    if (!entry || !confirm(`Take ${shown(phone)} off the list? It can order normally again.`)) return;
    start(async () => {
      if (report(await removeBlockedAction(entry.id))) setEditing(false);
    });
  }

  return (
    <div className="grid gap-3 text-sm">
      {entry ? (
        <p className="grid gap-1">
          <span>
            <Badge variant={entry.kind === "block" ? "destructive" : "outline"} className="mr-1">
              {BLOCK_KIND_NAMES[entry.kind]}
            </Badge>
            <span className="[overflow-wrap:anywhere]">{entry.reason}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {entry.kind === "block"
              ? "This number can't get a checkout code or order online."
              : "This number can order; its orders show this note and a higher risk score."}
            {entry.byName && ` Added by ${entry.byName}.`}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">Not blocked or flagged.</p>
      )}

      {canChange && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={open}>
            {entry ? "Change" : "Block or flag…"}
          </Button>
          {entry && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
              Take off the list
            </Button>
          )}
        </div>
      )}

      {canChange && editing && (
        <div className="grid gap-3 rounded-md border p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cb-kind">What to do</Label>
            <select
              id="cb-kind"
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as BlockKind)}
            >
              {BLOCK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === "block" ? "Block: no online orders" : "Flag: can order, staff see a warning"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cb-reason">Why (other staff see this)</Label>
            <Input id="cb-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
