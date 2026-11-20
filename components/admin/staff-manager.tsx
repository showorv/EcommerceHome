"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  changeRoleAction,
  inviteStaffAction,
  setStatusAction,
  signOutEverywhereAction,
  type ActionResult,
} from "@/modules/staff/actions";
import type { StaffRow } from "@/modules/staff/staff";

const ROLE_OPTIONS = ["staff", "manager", "owner"] as const;
const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

function report(res: ActionResult, success: string) {
  if (res.ok) toast.success(res.message ?? success);
  else toast.error(res.error);
}

export function InviteStaffForm() {
  const [state, action, pending] = useActionState(inviteStaffAction, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" name="name" required minLength={2} maxLength={80} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select id="invite-role" name="role" defaultValue="staff" className={selectClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
      {state && (
        <p
          className={state.ok ? "text-success text-sm md:col-span-4" : "text-destructive text-sm md:col-span-4"}
          role="status"
        >
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}

export function StaffTable({ rows, currentUserId }: { rows: StaffRow[]; currentUserId: string }) {
  const [pending, start] = useTransition();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Sessions</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => {
          const self = u.id === currentUserId;
          return (
            <TableRow key={u.id}>
              <TableCell>
                <div className="font-medium">
                  {u.name} {self && <span className="text-muted-foreground text-xs">(you)</span>}
                </div>
                <div className="text-muted-foreground text-xs">{u.email}</div>
              </TableCell>
              <TableCell>
                <select
                  aria-label={`Role for ${u.name}`}
                  className={selectClass}
                  defaultValue={u.role}
                  disabled={self || pending}
                  onChange={(e) => {
                    const role = e.target.value;
                    start(async () => report(await changeRoleAction(u.id, role), "Role updated"));
                  }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell>{u.activeSessions}</TableCell>
              <TableCell>
                {u.status === "blocked" ? (
                  <Badge variant="destructive">Blocked</Badge>
                ) : (
                  <Badge variant="secondary">Active</Badge>
                )}
              </TableCell>
              <TableCell className="space-x-2 text-right whitespace-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || u.activeSessions === 0}
                  onClick={() =>
                    start(async () => report(await signOutEverywhereAction(u.id), "Signed out everywhere"))
                  }
                >
                  Sign out all
                </Button>
                {!self && (
                  <Button
                    size="sm"
                    variant={u.status === "blocked" ? "outline" : "destructive"}
                    disabled={pending}
                    onClick={() =>
                      start(async () =>
                        report(
                          await setStatusAction(u.id, u.status === "blocked" ? "active" : "blocked"),
                          u.status === "blocked" ? "Unblocked" : "Blocked",
                        ),
                      )
                    }
                  >
                    {u.status === "blocked" ? "Unblock" : "Block"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
