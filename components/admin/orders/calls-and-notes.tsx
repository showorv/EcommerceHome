"use client";

import { useState, useTransition } from "react";
import { report, selectClass } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addCallAction, addNoteAction } from "@/modules/orders/admin-actions";
import {
  CALL_OUTCOME_NAMES,
  CALL_OUTCOMES,
  type CallEntry,
  type CallOutcome,
  type NoteEntry,
} from "@/modules/orders/staff";
import { dhakaTime } from "./bits";

/** The call log and internal notes (FR-OR-09). Staff only; never shown to the customer. */
export function CallLog({ orderNo, calls, canWrite }: { orderNo: string; calls: CallEntry[]; canWrite: boolean }) {
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      if (report(await addCallAction({ orderNo, outcome, note }))) {
        setOutcome("");
        setNote("");
      }
    });
  }

  return (
    <div className="grid gap-3">
      {calls.length === 0 ? (
        <p className="text-muted-foreground text-sm">No calls logged yet.</p>
      ) : (
        <ol className="grid gap-2">
          {[...calls].reverse().map((c, i) => (
            <li key={`${c.at}-${i}`} className="text-sm">
              <span className="font-medium">{CALL_OUTCOME_NAMES[c.outcome] ?? c.outcome}</span>
              {c.note && <span> — {c.note}</span>}
              <div className="text-muted-foreground text-xs">
                {dhakaTime(c.at)} · {c.byName}
              </div>
            </li>
          ))}
        </ol>
      )}
      {canWrite && (
        <form onSubmit={save} className="grid gap-2 border-t pt-3">
          <div className="grid gap-1.5">
            <Label htmlFor="call-outcome">After the call</Label>
            <select
              id="call-outcome"
              className={selectClass}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome)}
            >
              <option value="">What happened?</option>
              {CALL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {CALL_OUTCOME_NAMES[o]}
                </option>
              ))}
            </select>
          </div>
          <Input
            aria-label="Call note (optional)"
            placeholder="Note (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !outcome}
            className="justify-self-start"
          >
            {pending ? "Saving…" : "Log call"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function Notes({ orderNo, notes, canWrite }: { orderNo: string; notes: NoteEntry[]; canWrite: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      if (report(await addNoteAction({ orderNo, text }))) setText("");
    });
  }

  return (
    <div className="grid gap-3">
      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      ) : (
        <ol className="grid gap-2">
          {[...notes].reverse().map((n, i) => (
            <li key={`${n.at}-${i}`} className="text-sm">
              <p className="whitespace-pre-line">{n.text}</p>
              <div className="text-muted-foreground text-xs">
                {dhakaTime(n.at)} · {n.byName}
              </div>
            </li>
          ))}
        </ol>
      )}
      {canWrite && (
        <form onSubmit={save} className="grid gap-2 border-t pt-3">
          <Textarea
            aria-label="New note"
            placeholder="Internal note: only staff see it"
            maxLength={1000}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !text.trim()}
            className="justify-self-start"
          >
            {pending ? "Saving…" : "Add note"}
          </Button>
        </form>
      )}
    </div>
  );
}
