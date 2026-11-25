"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  ExternalLink,
  GripVertical,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/admin/catalog/form-bits";
import { PreviewFrame } from "@/components/admin/storefront/preview-frame";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { slugify } from "@/modules/catalog/logic";
import {
  createPageAction,
  deleteCmsPageAction,
  discardCmsDraftAction,
  publishCmsPageAction,
  saveCmsDraftAction,
  unpublishCmsPageAction,
  type CmsResult,
} from "@/modules/cms/actions";
import {
  BLOCK_INFO,
  BLOCK_TYPES,
  blockInput,
  cmsContentInput,
  MAX_BLOCKS,
  newBlock,
  parseInline,
  type Block,
  type BlockType,
  type CmsContent,
} from "@/modules/cms/blocks";
import type { CmsPageState } from "@/modules/cms/pages";
import { formatDhaka } from "@/modules/storefront/sections";
import { BLOCK_EDITORS } from "./block-editors";

/**
 * CMS page editor (FR-SF-09): title, address and search-engine text, then the page built from blocks.
 * Changes stay in a draft (with a live preview) until someone with cms.publish publishes them.
 */

const json = (v: unknown) => JSON.stringify(v);

const EMPTY: CmsContent = { title: "", slug: "", seoTitle: "", seoDescription: "", blocks: [] };

export function CmsPageEditor({ initial, canPublish }: { initial: CmsPageState | null; canPublish: boolean }) {
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [content, setContent] = useState<CmsContent>(initial?.draft.content ?? EMPTY);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [previewKey, setPreviewKey] = useState(0);
  const [confirm, setConfirm] = useState<"discard" | "unpublish" | "delete" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const saved = page?.draft.content ?? EMPTY;
  const unsaved = json(content) !== json(saved);
  const blocks = content.blocks;
  const problems = useMemo(
    () =>
      new Map(
        blocks.flatMap((b) => {
          const r = blockInput.safeParse(b);
          return r.success ? [] : [[b.id, r.error.issues[0]?.message ?? "Check this block"] as const];
        }),
      ),
    [blocks],
  );

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const set = (patch: Partial<CmsContent>) => setContent((c) => ({ ...c, ...patch }));
  const setBlocks = (fn: (list: Block[]) => Block[]) => setContent((c) => ({ ...c, blocks: fn(c.blocks) }));

  const move = (from: number, to: number) =>
    setBlocks((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });

  function add(type: BlockType) {
    if (blocks.length >= MAX_BLOCKS) return toast.error(`A page can have up to ${MAX_BLOCKS} blocks.`);
    if (type === "contactForm" && blocks.some((b) => b.type === "contactForm")) {
      return toast.error("This page already has a contact form.");
    }
    const b = newBlock(type) as Block;
    const at = open ? blocks.findIndex((x) => x.id === open) + 1 : blocks.length;
    setBlocks((list) => [...list.slice(0, at), b, ...list.slice(at)]);
    setOpen(b.id);
  }

  function duplicate(b: Block) {
    if (blocks.length >= MAX_BLOCKS) return toast.error(`A page can have up to ${MAX_BLOCKS} blocks.`);
    if (b.type === "contactForm") return toast.error("A page can have only one contact form.");
    const copy = { ...structuredClone(b), id: newBlock(b.type).id } as Block;
    const at = blocks.findIndex((x) => x.id === b.id) + 1;
    setBlocks((list) => [...list.slice(0, at), copy, ...list.slice(at)]);
    setOpen(copy.id);
  }

  /** Checks the whole page; on a problem, says what and opens the block. */
  function checked(): boolean {
    const first = [...problems.entries()][0];
    if (first) {
      const i = blocks.findIndex((b) => b.id === first[0]);
      toast.error(`${BLOCK_INFO[blocks[i]!.type].name} (block ${i + 1}): ${first[1]}`);
      setOpen(first[0]);
      return false;
    }
    const r = cmsContentInput.safeParse(content);
    if (!r.success) {
      toast.error(r.error.issues[0]?.message ?? "Check the page.");
      return false;
    }
    return true;
  }

  /** Runs an action; on success adopts the server's copy (unless the user kept typing meanwhile). */
  function run(fn: () => Promise<CmsResult>, sent: CmsContent | null, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setPage(res.page);
      setContent((cur) => (sent === null || json(cur) === json(sent) ? res.page.draft.content : cur));
      setPreviewKey((k) => k + 1);
      after?.();
    });
  }

  function save() {
    if (!checked()) return;
    if (!page) {
      const sent = content;
      start(async () => {
        const res = await createPageAction(sent);
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message);
        // Next.js keeps this "new page" screen alive (hidden) for back/forward, so leave it blank for
        // the next page. In the same transition as the navigation, so the form doesn't flash empty.
        startTransition(() => {
          router.replace(`/admin/pages/${res.page.id}`);
          setContent(EMPTY);
          setSlugTouched(false);
          setOpen(null);
        });
      });
      return;
    }
    run(() => saveCmsDraftAction(page.id, content, page.version), content);
  }

  const publish = () => page && checked() && run(() => publishCmsPageAction(page.id, content, page.version), content);

  const live = page?.published ?? null;
  const renaming = live && content.slug !== page!.slug;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        {/* Status + actions */}
        <div className="bg-background sticky top-0 z-20 grid gap-3 rounded-xl border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {unsaved ? (
              <Badge className="bg-amber-500 text-white">Unsaved changes</Badge>
            ) : !page ? null : !live ? (
              <Badge variant="secondary">Not published</Badge>
            ) : page.hasChanges ? (
              <Badge variant="secondary">Draft saved · not live yet</Badge>
            ) : (
              <Badge className="bg-emerald-600 text-white">Live</Badge>
            )}
            <span className="text-muted-foreground">
              {!page
                ? "New page: save it to see the preview."
                : live
                  ? `Live version published ${formatDhaka(live.at)}`
                  : "Shoppers can't see this page yet."}
            </span>
            {live && (
              <Link
                href={`/pages/${page!.slug}`}
                target="_blank"
                className="text-brand ml-auto inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                View on store <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending || (!unsaved && Boolean(page))} onClick={save}>
              {page ? "Save draft" : "Create page"}
            </Button>
            {canPublish && page && (
              <Button
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={pending || (!unsaved && !page.hasChanges)}
                onClick={publish}
              >
                {live ? "Publish changes" : "Publish"}
              </Button>
            )}
            {page && live && (
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={pending || (!unsaved && !page.hasChanges)}
                onClick={() => setConfirm("discard")}
              >
                Discard changes
              </Button>
            )}
            {canPublish && page && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-muted-foreground ml-auto" disabled={pending}>
                    More <ChevronDown className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {live && (
                    <DropdownMenuItem onSelect={() => setConfirm("unpublish")}>Take off the store</DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-destructive" onSelect={() => setConfirm("delete")}>
                    Delete page
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {!canPublish && (
            <p className="text-muted-foreground text-xs">
              You can edit and save drafts. A manager or the owner publishes them.
            </p>
          )}
        </div>

        {/* Page details */}
        <section className="bg-card grid gap-4 rounded-xl border p-4" aria-label="Page details">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="page-title">
              <Input
                id="page-title"
                maxLength={120}
                value={content.title}
                onChange={(e) =>
                  set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value, 60) }) })
                }
              />
            </Field>
            <Field label="Address" htmlFor="page-slug" hint={`yourstore.com/pages/${content.slug || "…"}`}>
              <Input
                id="page-slug"
                maxLength={60}
                value={content.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
                }}
                onBlur={() => set({ slug: slugify(content.slug, 60) })}
              />
            </Field>
          </div>
          {renaming && (
            <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              When you publish, the address changes from /pages/{page!.slug} to /pages/{content.slug || "…"}. Update
              menu and footer links that point to the old address.
            </p>
          )}
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Search engines (Google)
              <ChevronDown
                className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="grid gap-3 border-t p-3">
              <Field
                label="Title in Google"
                htmlFor="page-seo-title"
                hint={`${content.seoTitle.length}/70 · leave empty to use the page title`}
              >
                <Input
                  id="page-seo-title"
                  maxLength={70}
                  value={content.seoTitle}
                  onChange={(e) => set({ seoTitle: e.target.value })}
                />
              </Field>
              <Field
                label="Description in Google"
                htmlFor="page-seo-desc"
                hint={`${content.seoDescription.length}/170 · leave empty to use the start of the page`}
              >
                <Textarea
                  id="page-seo-desc"
                  rows={2}
                  maxLength={170}
                  value={content.seoDescription}
                  onChange={(e) => set({ seoDescription: e.target.value })}
                />
              </Field>
            </div>
          </details>
        </section>

        {/* Blocks */}
        <ol className="grid gap-3" aria-label="Blocks">
          {blocks.map((b, i) => (
            <BlockCard
              key={b.id}
              block={b}
              index={i}
              count={blocks.length}
              open={open === b.id}
              problem={problems.get(b.id) ?? null}
              dragging={dragId === b.id}
              onToggle={() => setOpen((o) => (o === b.id ? null : b.id))}
              onChange={(next) => setBlocks((list) => list.map((x) => (x.id === b.id ? next : x)))}
              onMove={(to) => move(i, to)}
              onDuplicate={() => duplicate(b)}
              onDelete={() => {
                setBlocks((list) => list.filter((x) => x.id !== b.id));
                toast(`${BLOCK_INFO[b.type].name} removed`, {
                  action: {
                    label: "Undo",
                    onClick: () => setBlocks((list) => [...list.slice(0, i), b, ...list.slice(i)]),
                  },
                });
              }}
              onDragStart={() => setDragId(b.id)}
              onDragEnd={() => setDragId(null)}
              onDragEnter={() => {
                if (!dragId || dragId === b.id) return;
                move(
                  blocks.findIndex((x) => x.id === dragId),
                  i,
                );
              }}
            />
          ))}
          {blocks.length === 0 && (
            <li className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              No blocks yet. Add a paragraph, heading or list below.
            </li>
          )}
        </ol>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-fit" disabled={blocks.length >= MAX_BLOCKS}>
              <Plus className="size-4" aria-hidden /> Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuLabel>{open ? "Adds below the open block" : "Adds at the end"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {BLOCK_TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => add(t)} className="grid gap-0.5">
                <span className="font-medium">{BLOCK_INFO[t].name}</span>
                <span className="text-muted-foreground text-xs">{BLOCK_INFO[t].description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {page ? (
        <PreviewFrame
          path={`/preview/page/${page.id}`}
          reloadKey={previewKey}
          unsaved={unsaved}
          pending={pending}
          onSave={save}
        />
      ) : (
        <aside className="text-muted-foreground grid h-64 place-items-center rounded-xl border border-dashed text-sm">
          The preview appears once the page is created.
        </aside>
      )}

      <Dialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          {confirm === "discard" && (
            <>
              <DialogHeader>
                <DialogTitle>Throw away your changes?</DialogTitle>
                <DialogDescription>
                  The draft goes back to what the store shows now. This can’t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Keep editing
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    page &&
                    run(
                      () => discardCmsDraftAction(page.id, page.version),
                      null,
                      () => setConfirm(null),
                    )
                  }
                >
                  Discard changes
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm === "unpublish" && (
            <>
              <DialogHeader>
                <DialogTitle>Take this page off the store?</DialogTitle>
                <DialogDescription>
                  Shoppers get “page not found” at /pages/{page?.slug}. The draft stays here, and you can publish it
                  again any time.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    page &&
                    run(
                      () => unpublishCmsPageAction(page.id, page.version),
                      null,
                      () => setConfirm(null),
                    )
                  }
                >
                  Take off the store
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete “{saved.title || "this page"}”?</DialogTitle>
                <DialogDescription>
                  The page and its draft are removed{live ? ", and shoppers get “page not found” at its address" : ""}.
                  A copy is kept in the audit log.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    page &&
                    start(async () => {
                      const res = await deleteCmsPageAction(page.id, page.version);
                      if (!res.ok) return void toast.error(res.error);
                      toast.success(res.message);
                      setContent(saved); // nothing unsaved left, so leaving doesn't warn
                      router.push("/admin/pages");
                    })
                  }
                >
                  Delete page
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- One block ----------

function summary(b: Block): string {
  const raw =
    b.type === "heading" || b.type === "paragraph" || b.type === "callout"
      ? b.data.text
      : b.type === "list"
        ? (b.data.items[0] ?? "")
        : b.type === "faq"
          ? `${b.data.items.length} question${b.data.items.length === 1 ? "" : "s"}`
          : b.type === "button"
            ? b.data.label
            : b.type === "image"
              ? b.data.caption || b.data.image.alt
              : b.type === "contactDetails" || b.type === "contactForm"
                ? b.data.heading
                : "";
  return parseInline(raw.split("\n")[0] ?? "")
    .map((p) => p.text)
    .join("");
}

function BlockCard({
  block: b,
  index,
  count,
  open,
  problem,
  dragging,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragEnter,
}: {
  block: Block;
  index: number;
  count: number;
  open: boolean;
  problem: string | null;
  dragging: boolean;
  onToggle: () => void;
  onChange: (b: Block) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
}) {
  const Editor = BLOCK_EDITORS[b.type] as (p: {
    id: string;
    data: Block["data"];
    onChange: (d: Block["data"]) => void;
  }) => React.ReactNode;
  const name = BLOCK_INFO[b.type].name;
  const sub = summary(b);
  const bodyId = `block-${b.id}`;
  const hasFields = b.type !== "divider";

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
            e.dataTransfer.setData("text/plain", b.id);
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
          disabled={!hasFields}
          aria-expanded={hasFields ? open : undefined}
          aria-controls={hasFields ? bodyId : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
        >
          <span className="text-muted-foreground w-5 text-xs tabular-nums">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            {sub && <span className="text-muted-foreground block truncate text-xs">{sub}</span>}
          </span>
          {problem && <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-label="Needs attention" />}
          {hasFields && (
            <ChevronDown
              className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          )}
        </button>
        <div className="flex shrink-0">
          <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp />
          </IconButton>
          <IconButton label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown />
          </IconButton>
          <IconButton label={`Duplicate ${name}`} onClick={onDuplicate}>
            <Copy />
          </IconButton>
          <IconButton label={`Delete ${name}`} onClick={onDelete} className="text-destructive">
            <Trash2 />
          </IconButton>
        </div>
      </div>

      {open && hasFields && (
        <div id={bodyId} className="grid gap-4 border-t p-4">
          {problem && (
            <p
              role="alert"
              className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              {problem}
            </p>
          )}
          <Editor id={b.id} data={b.data} onChange={(data) => onChange({ ...b, data } as Block)} />
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
