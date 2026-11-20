"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { deleteCollectionAction, saveCollectionAction } from "@/modules/catalog/actions";
import type { CategoryRow } from "@/modules/catalog/categories";
import type { CollectionRow } from "@/modules/catalog/collections";
import { slugify } from "@/modules/catalog/logic";
import { Field, I18nField, poishaToInput, report, SeoFields, selectClass, TakaInput } from "./form-bits";
import { ImagePicker } from "./image-picker";

type RuleDraft =
  | { field: "price"; op: "lt" | "lte" | "gt" | "gte"; value: string }
  | { field: "category"; op: "in"; value: string[] }
  | { field: "tag"; op: "in"; value: string }
  | { field: "label"; op: "in"; value: string[] }
  | { field: "inStock"; op: "eq"; value: boolean }
  | { field: "onSale"; op: "eq"; value: boolean };

const LABELS = ["new", "hot", "bestseller", "sale", "limited"];

const NEW_RULE: Record<RuleDraft["field"], () => RuleDraft> = {
  price: () => ({ field: "price", op: "lt", value: "500" }),
  category: () => ({ field: "category", op: "in", value: [] }),
  tag: () => ({ field: "tag", op: "in", value: "" }),
  label: () => ({ field: "label", op: "in", value: [] }),
  inStock: () => ({ field: "inStock", op: "eq", value: true }),
  onSale: () => ({ field: "onSale", op: "eq", value: true }),
};

const FIELD_LABEL: Record<RuleDraft["field"], string> = {
  price: "Price",
  category: "Category",
  tag: "Tag",
  label: "Label",
  inStock: "In stock",
  onSale: "On sale",
};

type Draft = Omit<CollectionRow, "id" | "rules"> & { rules: RuleDraft[] };

function toDraft(c: CollectionRow | null): Draft {
  if (!c)
    return {
      name: { en: "", bn: "" },
      slug: "",
      description: { en: "", bn: "" },
      image: { url: "", alt: "" },
      type: "manual",
      match: "all",
      rules: [],
      productIds: [],
      sort: "manual",
      listingMode: "pagination",
      active: true,
      seo: { title: "", description: "", ogImage: "" },
    };
  return {
    ...c,
    rules: c.rules.map((r) => {
      if (r.field === "price") return { ...r, value: poishaToInput(r.value) || "0" };
      if (r.field === "tag") return { ...r, value: r.value.join(", ") };
      return r as RuleDraft;
    }),
  };
}

function toPayload(d: Draft) {
  return {
    ...d,
    slug: d.slug.trim(),
    rules:
      d.type === "rule"
        ? d.rules.map((r) => {
            if (r.field === "price") return { ...r, value: r.value || "0" };
            if (r.field === "tag")
              return {
                ...r,
                value: r.value
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              };
            return r;
          })
        : [],
  };
}

export function CollectionForm({
  collection,
  products,
  categories,
  canEdit,
  canDelete,
}: {
  collection: CollectionRow | null;
  products: { id: string; title: string; status: string }[];
  categories: CategoryRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => toDraft(collection));
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const matches = search.trim()
    ? products
        .filter((p) => !d.productIds.includes(p.id) && p.title.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  const setRule = (i: number, r: RuleDraft) => set({ rules: d.rules.map((x, j) => (j === i ? r : x)) });
  const moveProduct = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= d.productIds.length) return;
    const ids = [...d.productIds];
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    set({ productIds: ids });
  };

  function save() {
    start(async () => {
      const res = await saveCollectionAction(collection?.id ?? null, toPayload(d));
      if (report(res, "Collection saved.") && res.ok && res.data && !collection)
        router.replace(`/admin/collections/${res.data.id}`);
    });
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <I18nField
            id="col-name"
            label="Name"
            required
            maxLength={80}
            value={d.name}
            onChange={(name) => set({ name })}
          />
          <Field
            label="URL slug"
            htmlFor="col-slug"
            hint={`Store address: /collections/${d.slug || slugify(d.name.en) || "…"}`}
          >
            <Input id="col-slug" value={d.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
          </Field>
          <I18nField
            id="col-desc"
            label="Description"
            multiline
            maxLength={500}
            value={d.description}
            onChange={(description) => set({ description })}
          />
          <Field label="Banner image" htmlFor="col-image">
            <ImagePicker id="col-image" value={d.image} onChange={(image) => set({ image })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={d.active} onCheckedChange={(active) => set({ active })} />
            Visible on the store
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Pick products by hand, or let rules fill the collection automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="col-type"
                checked={d.type === "manual"}
                onChange={() => set({ type: "manual", sort: "manual" })}
              />
              Hand-picked
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="col-type"
                checked={d.type === "rule"}
                onChange={() =>
                  set({
                    type: "rule",
                    sort: d.sort === "manual" ? "newest" : d.sort,
                    rules: d.rules.length ? d.rules : [NEW_RULE.price()],
                  })
                }
              />
              Automatic (rules)
            </label>
          </div>

          {d.type === "manual" ? (
            <div className="grid gap-3">
              <div className="relative">
                <Input
                  placeholder="Search products to add"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search products to add"
                />
                {matches.length > 0 && (
                  <ul className="bg-popover absolute z-10 mt-1 w-full overflow-hidden rounded-md border shadow-md">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                          onClick={() => {
                            set({ productIds: [...d.productIds, p.id] });
                            setSearch("");
                          }}
                        >
                          {p.title}
                          {p.status !== "active" && <Badge variant="outline">{p.status}</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {d.productIds.length === 0 ? (
                <p className="text-muted-foreground text-sm">No products yet.</p>
              ) : (
                <ol className="divide-y rounded-md border">
                  {d.productIds.map((id, i) => (
                    <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground w-6 tabular-nums">{i + 1}</span>
                      <span className="flex-1">{byId.get(id)?.title ?? "(deleted product)"}</span>
                      {byId.get(id) && byId.get(id)!.status !== "active" && (
                        <Badge variant="outline">{byId.get(id)!.status}</Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveProduct(i, -1)}
                        disabled={i === 0}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                        <span className="sr-only">Move up</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveProduct(i, 1)}
                        disabled={i === d.productIds.length - 1}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                        <span className="sr-only">Move down</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => set({ productIds: d.productIds.filter((x) => x !== id) })}
                      >
                        <X className="size-4" aria-hidden />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center gap-2 text-sm">
                Products must match
                <select
                  aria-label="Match"
                  className={`${selectClass} w-auto`}
                  value={d.match}
                  onChange={(e) => set({ match: e.target.value as "all" | "any" })}
                >
                  <option value="all">all rules</option>
                  <option value="any">any rule</option>
                </select>
              </div>
              {d.rules.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <select
                    aria-label="Rule field"
                    className={`${selectClass} w-36`}
                    value={r.field}
                    onChange={(e) => setRule(i, NEW_RULE[e.target.value as RuleDraft["field"]]())}
                  >
                    {Object.entries(FIELD_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <RuleValue rule={r} onChange={(nr) => setRule(i, nr)} categories={categories} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    onClick={() => set({ rules: d.rules.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Remove rule</span>
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set({ rules: [...d.rules, NEW_RULE.price()] })}
                >
                  <Plus className="size-4" aria-hidden /> Rule
                </Button>
              </div>
            </div>
          )}

          <Field label="Sort products by" htmlFor="col-sort" className="max-w-xs">
            <select
              id="col-sort"
              className={selectClass}
              value={d.sort}
              onChange={(e) => set({ sort: e.target.value as Draft["sort"] })}
            >
              {d.type === "manual" && <option value="manual">The order above</option>}
              <option value="newest">Newest first</option>
              <option value="bestselling">Best selling</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </Field>
          <Field label="More products on the page" htmlFor="col-listing" className="max-w-xs">
            <select
              id="col-listing"
              className={selectClass}
              value={d.listingMode}
              onChange={(e) => set({ listingMode: e.target.value as Draft["listingMode"] })}
            >
              <option value="pagination">Numbered pages</option>
              <option value="infinite">Load as the shopper scrolls</option>
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search engines</CardTitle>
        </CardHeader>
        <CardContent>
          <SeoFields idPrefix="col" value={d.seo} onChange={(seo) => set({ seo })} />
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap justify-between gap-2">
          {collection && canDelete ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete the collection "${collection.name.en}"? Products are not deleted.`)) return;
                start(async () => {
                  if (report(await deleteCollectionAction(collection.id))) router.replace("/admin/collections");
                });
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Delete collection
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : collection ? "Save changes" : "Create collection"}
          </Button>
        </div>
      )}
    </form>
  );
}

function RuleValue({
  rule,
  onChange,
  categories,
}: {
  rule: RuleDraft;
  onChange: (r: RuleDraft) => void;
  categories: CategoryRow[];
}) {
  switch (rule.field) {
    case "price":
      return (
        <>
          <select
            aria-label="Comparison"
            className={`${selectClass} w-32`}
            value={rule.op}
            onChange={(e) => onChange({ ...rule, op: e.target.value as typeof rule.op })}
          >
            <option value="lt">is under</option>
            <option value="lte">is at most</option>
            <option value="gt">is over</option>
            <option value="gte">is at least</option>
          </select>
          <div className="w-32">
            <TakaInput value={rule.value} onChange={(value) => onChange({ ...rule, value })} />
          </div>
        </>
      );
    case "category":
      return (
        <select
          aria-label="Categories"
          multiple
          className={`${selectClass} h-24 min-w-48 flex-1`}
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: Array.from(e.target.selectedOptions).map((o) => o.value) })}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {"  ".repeat(c.depth)}
              {c.name.en}
            </option>
          ))}
        </select>
      );
    case "tag":
      return (
        <Input
          aria-label="Tags"
          className="min-w-48 flex-1"
          placeholder="is any of: kitchen, usb"
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
        />
      );
    case "label":
      return (
        <div className="flex flex-wrap gap-2">
          {LABELS.map((l) => {
            const on = rule.value.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({ ...rule, value: on ? rule.value.filter((x) => x !== l) : [...rule.value, l] })
                }
              >
                <Badge variant={on ? "default" : "outline"} className="capitalize">
                  {l}
                </Badge>
              </button>
            );
          })}
        </div>
      );
    case "inStock":
    case "onSale":
      return (
        <select
          aria-label="Value"
          className={`${selectClass} w-24`}
          value={rule.value ? "yes" : "no"}
          onChange={(e) => onChange({ ...rule, value: e.target.value === "yes" })}
        >
          <option value="yes">yes</option>
          <option value="no">no</option>
        </select>
      );
  }
}
