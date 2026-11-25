"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCategoryAction, saveCategoryAction } from "@/modules/catalog/actions";
import type { CategoryRow } from "@/modules/catalog/categories";
import { Field, I18nField, report, SeoFields, selectClass } from "./form-bits";
import { ImagePicker } from "./image-picker";

type Draft = Omit<CategoryRow, "id" | "productCount" | "depth" | "parentId"> & { parentId: string };

const empty: Draft = {
  name: { en: "", bn: "" },
  slug: "",
  parentId: "",
  description: { en: "", bn: "" },
  image: { url: "", alt: "" },
  order: 0,
  listingMode: "pagination",
  active: true,
  seo: { title: "", description: "", ogImage: "" },
};

export function CategoryManager({
  rows,
  canEdit,
  canDelete,
}: {
  rows: CategoryRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [pending, start] = useTransition();

  function openNew() {
    setEditing({ id: null, draft: { ...empty, order: rows.length } });
  }
  function openEdit(r: CategoryRow) {
    setEditing({
      id: r.id,
      draft: {
        name: r.name,
        slug: r.slug,
        parentId: r.parentId ?? "",
        description: r.description,
        image: r.image,
        order: r.order,
        listingMode: r.listingMode,
        active: r.active,
        seo: r.seo,
      },
    });
  }
  function save() {
    if (!editing) return;
    start(async () => {
      if (report(await saveCategoryAction(editing.id, editing.draft), "Category saved.")) setEditing(null);
    });
  }
  function remove(r: CategoryRow) {
    const msg =
      r.productCount > 0
        ? `Delete "${r.name.en}"? ${r.productCount} product(s) will lose this category. Sub-categories move up a level.`
        : `Delete "${r.name.en}"?`;
    if (!confirm(msg)) return;
    start(async () => {
      report(await deleteCategoryAction(r.id), "Deleted.");
    });
  }

  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  // A category can't be moved under itself or its own children.
  const blocked = new Set<string>();
  if (editing?.id) {
    blocked.add(editing.id);
    let inside = false;
    let depth = 0;
    for (const r of rows) {
      if (r.id === editing.id) {
        inside = true;
        depth = r.depth;
        continue;
      }
      if (inside && r.depth > depth) blocked.add(r.id);
      else inside = false;
    }
  }

  return (
    <div className="grid gap-4">
      {canEdit && (
        <div>
          <Button onClick={openNew}>
            <Plus className="size-4" aria-hidden /> New category
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No categories yet. Create one, e.g. &quot;Kitchen gadgets&quot;.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span style={{ paddingLeft: r.depth * 20 }} className="inline-flex items-center gap-2">
                      {r.depth > 0 && <span className="text-muted-foreground">└</span>}
                      <span className="font-medium">{r.name.en}</span>
                      {r.name.bn && (
                        <span className="text-muted-foreground text-xs" lang="bn">
                          {r.name.bn}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">/c/{r.slug}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.productCount}</TableCell>
                  <TableCell>
                    {r.active ? <Badge variant="secondary">Visible</Badge> : <Badge variant="outline">Hidden</Badge>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)} disabled={pending}>
                        <Pencil className="size-4" aria-hidden />
                        <span className="sr-only">Edit {r.name.en}</span>
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => remove(r)} disabled={pending}>
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Delete {r.name.en}</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>Shown in menus and on the category page.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              id="category-form"
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <I18nField
                id="cat-name"
                label="Name"
                required
                maxLength={80}
                value={editing.draft.name}
                onChange={(name) => set({ name })}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="URL slug" htmlFor="cat-slug" hint="Empty = made from the name" className="sm:col-span-1">
                  <Input
                    id="cat-slug"
                    value={editing.draft.slug}
                    onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                  />
                </Field>
                <Field label="Parent" htmlFor="cat-parent">
                  <select
                    id="cat-parent"
                    className={selectClass}
                    value={editing.draft.parentId}
                    onChange={(e) => set({ parentId: e.target.value })}
                  >
                    <option value="">— Top level —</option>
                    {rows
                      .filter((r) => !blocked.has(r.id))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {"  ".repeat(r.depth)}
                          {r.name.en}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Order" htmlFor="cat-order" hint="Lower shows first">
                  <Input
                    id="cat-order"
                    type="number"
                    min={0}
                    value={editing.draft.order}
                    onChange={(e) => set({ order: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
              <I18nField
                id="cat-desc"
                label="Description"
                multiline
                maxLength={500}
                value={editing.draft.description}
                onChange={(description) => set({ description })}
              />
              <Field label="Image" htmlFor="cat-image">
                <ImagePicker id="cat-image" value={editing.draft.image} onChange={(image) => set({ image })} />
              </Field>
              <Field label="More products on the page" htmlFor="cat-listing" className="max-w-xs">
                <select
                  id="cat-listing"
                  className={selectClass}
                  value={editing.draft.listingMode}
                  onChange={(e) => set({ listingMode: e.target.value as Draft["listingMode"] })}
                >
                  <option value="pagination">Numbered pages</option>
                  <option value="infinite">Load as the shopper scrolls</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.draft.active} onCheckedChange={(active) => set({ active })} />
                Visible on the store
              </label>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Search engine (SEO)</summary>
                <div className="mt-3">
                  <SeoFields idPrefix="cat" value={editing.draft.seo} onChange={(seo) => set({ seo })} />
                </div>
              </details>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" disabled={pending}>
              {pending ? "Saving…" : "Save category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
