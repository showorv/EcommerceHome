"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, selectClass } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  cancelScheduleAction,
  discardDraftAction,
  publishAction,
  saveDraftAction,
  scheduleAction,
  type BuilderResult,
} from "@/modules/storefront/actions";
import type { PageState } from "@/modules/storefront/pages";
import {
  dhakaInputToIso,
  formatDhaka,
  isoToDhakaInput,
  MAX_SECTIONS,
  newSection,
  newSectionId,
  scheduleState,
  SECTION_INFO,
  SECTION_TYPES,
  sectionInput,
  type Section,
  type SectionType,
} from "@/modules/storefront/sections";
import { EDITORS, type EditorOptions } from "./section-editors";

/**
 * Storefront builder (FR-AD-07): add, edit, reorder, hide and schedule the sections of a page, save a
 * draft, preview it, then publish now or at a set time. The store keeps showing the published version
 * until then.
 */

const json = (v: unknown) => JSON.stringify(v);

export function StorefrontBuilder({
  initial,
  options,
  canPublish,
}: {
  initial: PageState;
  options: EditorOptions;
  canPublish: boolean;
}) {
  const [page, setPage] = useState(initial);
  const [sections, setSections] = useState<Section[]>(initial.draft.sections);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [previewKey, setPreviewKey] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const unsaved = json(sections) !== json(page.draft.sections);
  const problems = useMemo(
    () =>
      new Map(
        sections.flatMap((s) => {
          const r = sectionInput.safeParse(s);
          return r.success ? [] : [[s.id, r.error.issues[0]?.message ?? "Check this section"] as const];
        }),
      ),
    [sections],
  );

  // Schedule badges change over time; refresh them every minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const update = (id: string, fn: (s: Section) => Section) =>
    setSections((list) => list.map((s) => (s.id === id ? fn(s) : s)));

  const move = (from: number, to: number) =>
    setSections((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });

  function add(type: SectionType, preset?: "featuredCollection") {
    if (sections.length >= MAX_SECTIONS) return toast.error(`A page can have up to ${MAX_SECTIONS} sections.`);
    const s = newSection(type, preset) as Section;
    const at = open ? sections.findIndex((x) => x.id === open) + 1 : sections.length;
    setSections((list) => [...list.slice(0, at), s, ...list.slice(at)]);
    setOpen(s.id);
  }

  function duplicate(s: Section) {
    if (sections.length >= MAX_SECTIONS) return toast.error(`A page can have up to ${MAX_SECTIONS} sections.`);
    const copy = { ...structuredClone(s), id: newSectionId(), label: s.label ? `${s.label} (copy)` : "" };
    const at = sections.findIndex((x) => x.id === s.id) + 1;
    setSections((list) => [...list.slice(0, at), copy, ...list.slice(at)]);
    setOpen(copy.id);
  }

  /** Runs an action; on success adopts the server's copy (unless the user kept typing meanwhile). */
  function run(fn: () => Promise<BuilderResult>, sent: Section[] | null, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setPage(res.page);
      setSections((cur) => (sent === null || json(cur) === json(sent) ? res.page.draft.sections : cur));
      setPreviewKey((k) => k + 1);
      setNow(Date.now());
      after?.();
    });
  }

  function checked(): boolean {
    const first = [...problems.entries()][0];
    if (!first) return true;
    const i = sections.findIndex((s) => s.id === first[0]);
    toast.error(`${SECTION_INFO[sections[i]!.type].name} (section ${i + 1}): ${first[1]}`);
    setOpen(first[0]);
    return false;
  }

  const save = () => checked() && run(() => saveDraftAction(page.slug, sections, page.version), sections);
  const publish = () => checked() && run(() => publishAction(page.slug, sections, page.version), sections);

  const live = page.scheduled && Date.parse(page.scheduled.at) <= now ? page.scheduled : page.published;
  const upcoming = page.scheduled && Date.parse(page.scheduled.at) > now ? page.scheduled : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        {/* Status + actions */}
        <div className="bg-background sticky top-0 z-20 grid gap-3 rounded-xl border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {unsaved ? (
              <Badge className="bg-amber-500 text-white">Unsaved changes</Badge>
            ) : page.hasChanges ? (
              <Badge variant="secondary">Draft saved · not live yet</Badge>
            ) : upcoming ? (
              <Badge variant="secondary">Same as the scheduled version</Badge>
            ) : (
              <Badge variant="outline">Up to date with the store</Badge>
            )}
            <span className="text-muted-foreground">
              {live
                ? `Live version published ${formatDhaka(live.at)}`
                : "Not published yet: the store shows the starter layout"}
            </span>
          </div>
          {upcoming && (
            <div className="bg-brand/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>
                A new version goes live on <strong>{formatDhaka(upcoming.at)}</strong> (Bangladesh time).
              </span>
              {canPublish && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => cancelScheduleAction(page.slug, page.version), null)}
                >
                  Cancel schedule
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending || !unsaved} onClick={save}>
              Save draft
            </Button>
            {canPublish && (
              <>
                <Button
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                  disabled={pending || (!unsaved && !page.hasChanges)}
                  onClick={publish}
                >
                  Publish now
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => checked() && setScheduling(true)}>
                  Schedule…
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              className="text-muted-foreground"
              disabled={pending || (!unsaved && !page.hasChanges)}
              onClick={() => setConfirmDiscard(true)}
            >
              Discard changes
            </Button>
          </div>
          {!canPublish && (
            <p className="text-muted-foreground text-xs">
              You can edit and save drafts. A manager or the owner publishes them.
            </p>
          )}
        </div>

        {/* Sections */}
        <ol className="grid gap-3" aria-label="Sections">
          {sections.map((s, i) => (
            <SectionCard
              key={s.id}
              section={s}
              index={i}
              count={sections.length}
              open={open === s.id}
              problem={problems.get(s.id) ?? null}
              now={now}
              dragging={dragId === s.id}
              options={options}
              onToggle={() => setOpen((o) => (o === s.id ? null : s.id))}
              onChange={(next) => update(s.id, () => next)}
              onMove={(to) => move(i, to)}
              onDuplicate={() => duplicate(s)}
              onDelete={() => {
                setSections((list) => list.filter((x) => x.id !== s.id));
                toast(`${SECTION_INFO[s.type].name} removed`, {
                  action: {
                    label: "Undo",
                    onClick: () => setSections((list) => [...list.slice(0, i), s, ...list.slice(i)]),
                  },
                });
              }}
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => setDragId(null)}
              onDragEnter={() => {
                if (!dragId || dragId === s.id) return;
                move(
                  sections.findIndex((x) => x.id === dragId),
                  i,
                );
              }}
            />
          ))}
          {sections.length === 0 && (
            <li className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              No sections yet. Add the first one below.
            </li>
          )}
        </ol>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-fit" disabled={sections.length >= MAX_SECTIONS}>
              <Plus className="size-4" aria-hidden /> Add section
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuLabel>{open ? "Adds below the open section" : "Adds at the end"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SECTION_TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => add(t)} className="grid gap-0.5">
                <span className="font-medium">{SECTION_INFO[t].name}</span>
                <span className="text-muted-foreground text-xs">{SECTION_INFO[t].description}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => add("productCarousel", "featuredCollection")} className="grid gap-0.5">
              <span className="font-medium">Featured collection</span>
              <span className="text-muted-foreground text-xs">A grid of products from one collection</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Preview slug={page.slug} reloadKey={previewKey} unsaved={unsaved} pending={pending} onSave={save} />

      <ScheduleDialog
        open={scheduling}
        onOpenChange={setScheduling}
        pending={pending}
        now={now}
        onSchedule={(when) =>
          run(
            () => scheduleAction(page.slug, sections, page.version, when),
            sections,
            () => setScheduling(false),
          )
        }
      />

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Throw away your changes?</DialogTitle>
            <DialogDescription>
              The draft goes back to {page.scheduled ? "the scheduled version" : "what the store shows now"}. This can’t
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => discardDraftAction(page.slug, page.version),
                  null,
                  () => setConfirmDiscard(false),
                )
              }
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- One section ----------

const STATE_BADGE = {
  hidden: { label: "Hidden", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  ended: { label: "Ended", className: "bg-muted text-muted-foreground line-through" },
  live: null,
} as const;

function summary(s: Section): string {
  if (s.label) return s.label;
  const d = s.data as Record<string, unknown>;
  if (s.type === "hero") return s.data.slides[0]?.heading || "";
  return typeof d.heading === "string" ? d.heading : "";
}

function SectionCard({
  section: s,
  index,
  count,
  open,
  problem,
  now,
  dragging,
  options,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragEnter,
}: {
  section: Section;
  index: number;
  count: number;
  open: boolean;
  problem: string | null;
  now: number;
  dragging: boolean;
  options: EditorOptions;
  onToggle: () => void;
  onChange: (s: Section) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
}) {
  const state = scheduleState(s, now);
  const badge = STATE_BADGE[state];
  const Editor = EDITORS[s.type] as (p: {
    id: string;
    data: Section["data"];
    onChange: (d: Section["data"]) => void;
    options: EditorOptions;
  }) => React.ReactNode;
  const name = SECTION_INFO[s.type].name;
  const sub = summary(s);
  const bodyId = `section-${s.id}`;

  return (
    <li
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "bg-card rounded-xl border transition-shadow",
        dragging && "opacity-50 ring-2 ring-blue-400",
        open && "shadow-md",
      )}
    >
      <div className="flex items-center gap-1 p-2 pl-1">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", s.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className="text-muted-foreground hover:text-foreground grid size-8 cursor-grab place-items-center active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
        >
          <span className="text-muted-foreground w-5 text-xs tabular-nums">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            {sub && <span className="text-muted-foreground block truncate text-xs">{sub}</span>}
          </span>
          {problem && <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-label="Needs attention" />}
          {badge && (
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", badge.className)}>
              {badge.label}
            </span>
          )}
          {s.devices !== "all" && (
            <span
              className="text-muted-foreground shrink-0"
              title={s.devices === "mobile" ? "Phones only" : "Desktop only"}
            >
              {s.devices === "mobile" ? (
                <Smartphone className="size-4" aria-label="Phones only" />
              ) : (
                <Monitor className="size-4" aria-label="Desktop only" />
              )}
            </span>
          )}
          <ChevronDown
            className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
        <div className="flex shrink-0">
          <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp />
          </IconButton>
          <IconButton label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown />
          </IconButton>
          <IconButton
            label={s.hidden ? `Show ${name}` : `Hide ${name}`}
            onClick={() => onChange({ ...s, hidden: !s.hidden })}
          >
            {s.hidden ? <EyeOff /> : <Eye />}
          </IconButton>
          <IconButton label={`Duplicate ${name}`} onClick={onDuplicate}>
            <Copy />
          </IconButton>
          <IconButton label={`Delete ${name}`} onClick={onDelete} className="text-destructive">
            <Trash2 />
          </IconButton>
        </div>
      </div>

      {open && (
        <div id={bodyId} className="grid gap-5 border-t p-4">
          {problem && (
            <p
              role="alert"
              className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              {problem}
            </p>
          )}
          <Editor id={s.id} data={s.data} onChange={(data) => onChange({ ...s, data } as Section)} options={options} />
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              When and where it shows
              <ChevronDown
                className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
              <Field label="Name in the builder" htmlFor={`${s.id}-label`} hint="Only you see this">
                <Input
                  id={`${s.id}-label`}
                  maxLength={60}
                  value={s.label}
                  onChange={(e) => onChange({ ...s, label: e.target.value })}
                />
              </Field>
              <Field label="Show on" htmlFor={`${s.id}-devices`}>
                <select
                  id={`${s.id}-devices`}
                  className={selectClass}
                  value={s.devices}
                  onChange={(e) => onChange({ ...s, devices: e.target.value as Section["devices"] })}
                >
                  <option value="all">Phones and computers</option>
                  <option value="mobile">Phones only</option>
                  <option value="desktop">Computers only</option>
                </select>
              </Field>
              <Field label="Start showing (optional)" htmlFor={`${s.id}-start`} hint="Bangladesh time">
                <Input
                  id={`${s.id}-start`}
                  type="datetime-local"
                  value={isoToDhakaInput(s.startAt)}
                  onChange={(e) => onChange({ ...s, startAt: dhakaInputToIso(e.target.value) })}
                />
              </Field>
              <Field label="Stop showing (optional)" htmlFor={`${s.id}-end`} hint="Bangladesh time">
                <Input
                  id={`${s.id}-end`}
                  type="datetime-local"
                  value={isoToDhakaInput(s.endAt)}
                  onChange={(e) => onChange({ ...s, endAt: dhakaInputToIso(e.target.value) })}
                />
              </Field>
            </div>
          </details>
        </div>
      )}
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn("[&_svg]:size-4", className)}
    >
      {children}
    </Button>
  );
}

// ---------- Preview ----------

const DESKTOP_WIDTH = 1280;

function Preview({
  slug,
  reloadKey,
  unsaved,
  pending,
  onSave,
}: {
  slug: string;
  reloadKey: number;
  unsaved: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [width, setWidth] = useState(0);
  const [manualKey, setManualKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const src = `/preview/${slug}?r=${reloadKey}-${manualKey}`;
  const scale = device === "desktop" && width ? Math.min(1, width / DESKTOP_WIDTH) : 1;
  const height = 760;

  return (
    <aside className="grid content-start gap-3 xl:sticky xl:top-4 xl:self-start" aria-label="Preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Preview size">
          <Button
            size="sm"
            variant={device === "desktop" ? "secondary" : "ghost"}
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="size-4" aria-hidden /> Computer
          </Button>
          <Button
            size="sm"
            variant={device === "phone" ? "secondary" : "ghost"}
            aria-pressed={device === "phone"}
            onClick={() => setDevice("phone")}
          >
            <Smartphone className="size-4" aria-hidden /> Phone
          </Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setManualKey((k) => k + 1)}>
            <RefreshCw className="size-4" aria-hidden /> Reload
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={`/preview/${slug}`} target="_blank" rel="noopener">
              <ExternalLink className="size-4" aria-hidden /> Open
            </a>
          </Button>
        </div>
      </div>
      {unsaved && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          The preview shows the last saved draft.
          <Button size="xs" variant="outline" disabled={pending} onClick={onSave}>
            Save to update
          </Button>
        </div>
      )}
      <div ref={box} className="bg-muted/40 overflow-hidden rounded-xl border" style={{ height }}>
        {device === "desktop" ? (
          <iframe
            key={src}
            src={src}
            title="Draft preview (computer)"
            style={{
              width: DESKTOP_WIDTH,
              height: height / scale,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            className="bg-background border-0"
          />
        ) : (
          <div className="grid h-full place-items-center p-3">
            <iframe
              key={src}
              src={src}
              title="Draft preview (phone)"
              className="bg-background h-full w-[390px] max-w-full rounded-2xl border shadow-lg"
            />
          </div>
        )}
      </div>
    </aside>
  );
}

// ---------- Schedule ----------

function ScheduleDialog({
  open,
  onOpenChange,
  pending,
  now,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  now: number;
  onSchedule: (dhakaLocal: string) => void;
}) {
  const [when, setWhen] = useState("");
  const iso = dhakaInputToIso(when);
  const tooSoon = iso !== null && Date.parse(iso) <= now + 60_000;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule this version</DialogTitle>
          <DialogDescription>
            Your changes are saved now and go live at the time you pick. Until then the store shows the current version.
          </DialogDescription>
        </DialogHeader>
        <Field label="Go live on" htmlFor="schedule-at" hint="Bangladesh time">
          <Input id="schedule-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        {tooSoon && <p className="text-destructive text-sm">Pick a time at least a minute from now.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !iso || tooSoon} onClick={() => onSchedule(when)}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
