"use client";

import { Plus, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import { saveProductAction } from "@/modules/catalog/actions";
import type { CategoryRow } from "@/modules/catalog/categories";
import { discountPercent, slugify, suggestSku, variantCombinations } from "@/modules/catalog/logic";
import type { ProductEdit } from "@/modules/catalog/products";
import { BlockEditor, RowsEditor, type Block } from "./block-editor";
import { Field, I18nField, poishaToInput, report, SeoFields, selectClass, TakaInput } from "./form-bits";
import { MediaManager, type MediaDraft } from "./media-manager";

const LABELS = ["new", "hot", "bestseller", "sale", "limited"] as const;

type VariantDraft = {
  key: string;
  id: string;
  sku: string;
  options: Record<string, string>;
  price: string;
  compareAtPrice: string;
  weightGrams: string;
  lowStockAt: string;
  mediaIds: string[];
  active: boolean;
  stock: number; // existing stock (read-only here)
  initialStock: string; // only for new variants
  initialCost: string;
};

type Draft = {
  title: { en: string; bn: string };
  slug: string;
  status: "draft" | "active" | "archived";
  categoryIds: string[];
  tags: string;
  labels: string[];
  shortDescription: { en: string; bn: string };
  blocks: Block[];
  specs: { label: string; value: string }[];
  media: MediaDraft[];
  hoverMediaIndex: number;
  options: { name: string; values: string }[];
  lowStockAt: string;
  seo: { title: string; description: string; ogImage: string };
  variants: VariantDraft[];
};

const key = () => Math.random().toString(36).slice(2, 10);

function newVariant(options: Record<string, string> = {}): VariantDraft {
  return {
    key: key(),
    id: "",
    sku: "",
    options,
    price: "",
    compareAtPrice: "",
    weightGrams: "",
    lowStockAt: "",
    mediaIds: [],
    active: true,
    stock: 0,
    initialStock: "",
    initialCost: "",
  };
}

function toDraft(p: ProductEdit | null): Draft {
  if (!p) {
    return {
      title: { en: "", bn: "" },
      slug: "",
      status: "draft",
      categoryIds: [],
      tags: "",
      labels: [],
      shortDescription: { en: "", bn: "" },
      blocks: [],
      specs: [],
      media: [],
      hoverMediaIndex: 1,
      options: [],
      lowStockAt: "5",
      seo: { title: "", description: "", ogImage: "" },
      variants: [newVariant()],
    };
  }
  return {
    title: p.title,
    slug: p.slug,
    status: p.status,
    categoryIds: p.categoryIds,
    tags: p.tags.join(", "),
    labels: p.labels,
    shortDescription: p.shortDescription,
    blocks: p.blocks as Block[],
    specs: p.specs,
    media: p.media,
    hoverMediaIndex: p.hoverMediaIndex,
    options: p.optionNames.map((name) => ({
      name,
      values: [...new Set(p.variants.map((v) => v.options[name]).filter(Boolean))].join(", "),
    })),
    lowStockAt: String(p.lowStockAt),
    seo: p.seo,
    variants: p.variants.map((v) => ({
      key: v.id,
      id: v.id,
      sku: v.sku,
      options: v.options,
      price: poishaToInput(v.price),
      compareAtPrice: poishaToInput(v.compareAtPrice),
      weightGrams: v.weightGrams ? String(v.weightGrams) : "",
      lowStockAt: v.lowStockAt == null ? "" : String(v.lowStockAt),
      mediaIds: v.mediaIds,
      active: v.active,
      stock: v.stock,
      initialStock: "",
      initialCost: "",
    })),
  };
}

/** Builds the payload the server validates (modules/catalog/schemas.ts → productInput). */
function toPayload(d: Draft) {
  const optionNames = d.options.map((o) => o.name.trim()).filter(Boolean);
  return {
    title: d.title,
    slug: d.slug.trim(),
    status: d.status,
    categoryIds: d.categoryIds,
    tags: d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    labels: d.labels,
    shortDescription: d.shortDescription,
    blocks: d.blocks.map((b) =>
      b.type === "inBox" ? { ...b, data: { ...b.data, items: b.data.items.map((i) => i.trim()).filter(Boolean) } } : b,
    ),
    specs: d.specs.filter((s) => s.label.trim() || s.value.trim()),
    media: d.media,
    hoverMediaIndex: d.hoverMediaIndex,
    optionNames,
    lowStockAt: d.lowStockAt || "0",
    seo: d.seo,
    variants: d.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      options: Object.fromEntries(optionNames.map((n) => [n, v.options[n] ?? ""])),
      price: v.price || "0",
      compareAtPrice: v.compareAtPrice || "0",
      weightGrams: v.weightGrams || "0",
      lowStockAt: v.lowStockAt === "" ? null : v.lowStockAt,
      mediaIds: v.mediaIds.filter((m) => d.media.some((x) => x.id === m)),
      active: v.active,
      initialStock: v.initialStock || "0",
      initialCost: v.initialCost || "0",
    })),
  };
}

export function ProductForm({
  product,
  categories,
  canEdit,
}: {
  product: ProductEdit | null;
  categories: CategoryRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => toDraft(product), [product]);
  const [d, setD] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const optionNames = d.options.map((o) => o.name.trim()).filter(Boolean);
  const slugPreview = d.slug || slugify(d.title.en) || "…";

  function generateVariants() {
    const combos = variantCombinations(
      d.options.map((o) => ({ name: o.name, values: o.values.split(",").map((v) => v.trim()) })),
    );
    const sameOptions = (a: Record<string, string>, b: Record<string, string>) =>
      optionNames.every((n) => (a[n] ?? "") === (b[n] ?? ""));
    const template = d.variants[0];
    const variants = combos.map((options) => {
      const existing = d.variants.find((v) => sameOptions(v.options, options));
      if (existing) return { ...existing, options };
      return {
        ...newVariant(options),
        sku: suggestSku(slugPreview === "…" ? "item" : slugPreview, options),
        price: template?.price ?? "",
        compareAtPrice: template?.compareAtPrice ?? "",
        weightGrams: template?.weightGrams ?? "",
      };
    });
    const dropped = d.variants.filter((v) => v.id && !variants.some((n) => n.key === v.key));
    if (
      dropped.length &&
      !confirm(`${dropped.length} existing variant(s) no longer match and will be removed or hidden. Continue?`)
    )
      return;
    set({ variants });
  }

  function save() {
    start(async () => {
      const res = await saveProductAction(product?.id ?? null, toPayload(d));
      if (report(res, "Product saved.") && res.ok && res.data && !product) {
        router.replace(`/admin/products/${res.data.id}`);
      }
    });
  }

  const setVariant = (k: string, patch: Partial<VariantDraft>) =>
    set({ variants: d.variants.map((v) => (v.key === k ? { ...v, ...patch } : v)) });
  const images = d.media.filter((m) => m.type === "image");

  return (
    <form
      className="grid gap-6 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <I18nField
                id="p-title"
                label="Title"
                required
                maxLength={150}
                value={d.title}
                onChange={(title) => set({ title })}
              />
              <I18nField
                id="p-short"
                label="Short description"
                multiline
                maxLength={400}
                value={d.shortDescription}
                onChange={(shortDescription) => set({ shortDescription })}
              />
              <Field label="URL slug" htmlFor="p-slug" hint={`Store address: /p/${slugPreview}`}>
                <Input
                  id="p-slug"
                  placeholder="Made from the title"
                  value={d.slug}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images and videos</CardTitle>
              <CardDescription>
                The first image is shown in lists. Pick one to show when shoppers hover a card.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MediaManager
                media={d.media}
                onChange={(media) => set({ media })}
                hoverIndex={d.hoverMediaIndex}
                onHoverIndex={(hoverMediaIndex) => set({ hoverMediaIndex })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Options and variants</CardTitle>
              <CardDescription>
                E.g. Colour: Red, Blue · Size: S, M. Each combination gets its own price, stock and SKU.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {d.options.map((o, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                  <Input
                    aria-label={`Option ${i + 1} name`}
                    placeholder="Option name, e.g. Colour"
                    value={o.name}
                    onChange={(e) =>
                      set({ options: d.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                    }
                  />
                  <Input
                    aria-label={`Option ${i + 1} values`}
                    placeholder="Values, comma separated: Red, Blue"
                    value={o.values}
                    onChange={(e) =>
                      set({ options: d.options.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)) })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => set({ options: d.options.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Remove option</span>
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {d.options.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => set({ options: [...d.options, { name: "", values: "" }] })}
                  >
                    <Plus className="size-4" aria-hidden /> Option
                  </Button>
                )}
                {d.options.length > 0 && (
                  <Button type="button" variant="secondary" size="sm" onClick={generateVariants}>
                    <Wand2 className="size-4" aria-hidden /> Build variants from options
                  </Button>
                )}
                {d.options.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => set({ variants: [...d.variants, newVariant()] })}
                  >
                    <Plus className="size-4" aria-hidden /> Variant
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {optionNames.length > 0 && <TableHead>Variant</TableHead>}
                      <TableHead className="min-w-36">SKU</TableHead>
                      <TableHead className="min-w-28">Price</TableHead>
                      <TableHead className="min-w-28">Compare at</TableHead>
                      <TableHead className="min-w-20">Weight (g)</TableHead>
                      <TableHead className="min-w-24">Stock</TableHead>
                      {images.length > 0 && <TableHead>Image</TableHead>}
                      <TableHead>On sale</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.variants.map((v) => {
                      const off = discountPercent(Number(v.price) * 100, Number(v.compareAtPrice) * 100);
                      return (
                        <TableRow key={v.key} className={v.active ? "" : "opacity-60"}>
                          {optionNames.length > 0 && (
                            <TableCell className="font-medium whitespace-nowrap">
                              {optionNames
                                .map((n) => v.options[n])
                                .filter(Boolean)
                                .join(" / ") || "—"}
                            </TableCell>
                          )}
                          <TableCell>
                            <Input
                              aria-label="SKU"
                              className="font-mono uppercase"
                              value={v.sku}
                              onChange={(e) => setVariant(v.key, { sku: e.target.value.toUpperCase() })}
                            />
                          </TableCell>
                          <TableCell>
                            <TakaInput
                              label="Price"
                              value={v.price}
                              onChange={(price) => setVariant(v.key, { price })}
                            />
                          </TableCell>
                          <TableCell>
                            <TakaInput
                              label="Compare-at price"
                              value={v.compareAtPrice}
                              onChange={(compareAtPrice) => setVariant(v.key, { compareAtPrice })}
                            />
                            {off > 0 && <span className="text-success text-xs">−{off}%</span>}
                          </TableCell>
                          <TableCell>
                            <Input
                              aria-label="Weight in grams"
                              inputMode="numeric"
                              value={v.weightGrams}
                              onChange={(e) => setVariant(v.key, { weightGrams: e.target.value.replace(/\D/g, "") })}
                            />
                          </TableCell>
                          <TableCell>
                            {v.id ? (
                              <Link
                                href={`/admin/inventory?q=${encodeURIComponent(v.sku)}`}
                                className="tabular-nums underline"
                              >
                                {v.stock}
                              </Link>
                            ) : (
                              <div className="grid gap-1">
                                <Input
                                  aria-label="Opening stock"
                                  placeholder="Opening qty"
                                  inputMode="numeric"
                                  value={v.initialStock}
                                  onChange={(e) =>
                                    setVariant(v.key, { initialStock: e.target.value.replace(/\D/g, "") })
                                  }
                                />
                                {Number(v.initialStock) > 0 && (
                                  <TakaInput
                                    label="Unit cost"
                                    placeholder="Unit cost"
                                    value={v.initialCost}
                                    onChange={(initialCost) => setVariant(v.key, { initialCost })}
                                  />
                                )}
                              </div>
                            )}
                          </TableCell>
                          {images.length > 0 && (
                            <TableCell>
                              <select
                                aria-label="Image for this variant"
                                className={selectClass}
                                value={v.mediaIds[0] ?? ""}
                                onChange={(e) =>
                                  setVariant(v.key, { mediaIds: e.target.value ? [e.target.value] : [] })
                                }
                              >
                                <option value="">Default</option>
                                {images.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    Image {d.media.indexOf(m) + 1}
                                    {m.alt ? ` — ${m.alt.slice(0, 20)}` : ""}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                          )}
                          <TableCell>
                            <Switch
                              aria-label="Variant is for sale"
                              checked={v.active}
                              onCheckedChange={(active) => setVariant(v.key, { active })}
                            />
                          </TableCell>
                          <TableCell>
                            {d.variants.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => set({ variants: d.variants.filter((x) => x.key !== v.key) })}
                              >
                                <Trash2 className="size-4" aria-hidden />
                                <span className="sr-only">Remove variant</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground text-xs">
                Stock of saved variants changes in{" "}
                <Link href="/admin/inventory" className="underline">
                  Inventory
                </Link>{" "}
                (adjustments and purchase batches), so every change is recorded.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
              <CardDescription>
                Build the product page story: text, pictures, videos, specs, box contents, comparisons.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BlockEditor blocks={d.blocks} onChange={(blocks) => set({ blocks })} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key specifications</CardTitle>
              <CardDescription>Short facts shown near the price (e.g. Capacity: 2 L).</CardDescription>
            </CardHeader>
            <CardContent>
              <RowsEditor rows={d.specs} onChange={(specs) => set({ specs })} />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <select
                aria-label="Status"
                className={selectClass}
                value={d.status}
                onChange={(e) => set({ status: e.target.value as Draft["status"] })}
              >
                <option value="draft">Draft — hidden</option>
                <option value="active">Active — on the store</option>
                <option value="archived">Archived</option>
              </select>
              {product && d.status === "active" && (
                <a href={`/p/${product.slug}`} target="_blank" rel="noreferrer" className="text-sm underline">
                  View on store ↗
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="grid max-h-72 gap-2 overflow-y-auto">
              {categories.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No categories yet.{" "}
                  <Link href="/admin/categories" className="underline">
                    Create one
                  </Link>
                  .
                </p>
              )}
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: c.depth * 16 }}>
                  <Checkbox
                    checked={d.categoryIds.includes(c.id)}
                    onCheckedChange={(on) =>
                      set({ categoryIds: on ? [...d.categoryIds, c.id] : d.categoryIds.filter((x) => x !== c.id) })
                    }
                  />
                  {c.name.en}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Labels and tags</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                {LABELS.map((l) => {
                  const on = d.labels.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ labels: on ? d.labels.filter((x) => x !== l) : [...d.labels, l] })}
                    >
                      <Badge variant={on ? "default" : "outline"} className="capitalize">
                        {l}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <Field label="Tags" htmlFor="p-tags" hint="Comma separated. Used for search and rule-based collections.">
                <Input
                  id="p-tags"
                  placeholder="kitchen, usb, gift"
                  value={d.tags}
                  onChange={(e) => set({ tags: e.target.value })}
                />
              </Field>
              <Field
                label="Low stock alert at"
                htmlFor="p-low"
                hint="Show in the low-stock list at or below this many."
              >
                <Input
                  id="p-low"
                  inputMode="numeric"
                  value={d.lowStockAt}
                  onChange={(e) => set({ lowStockAt: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Search engines</CardTitle>
            </CardHeader>
            <CardContent>
              <SeoFields idPrefix="p" value={d.seo} onChange={(seo) => set({ seo })} />
            </CardContent>
          </Card>
        </div>
      </div>

      {canEdit && (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur md:left-60">
          <div className="flex items-center justify-end gap-3 px-4 py-3 md:px-6">
            {dirty && <span className="text-muted-foreground text-sm">Unsaved changes</span>}
            {d.variants[0] && Number(d.variants[0].price) > 0 && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                From {formatTaka(Math.round(Math.min(...d.variants.map((v) => Number(v.price) || Infinity)) * 100))}
              </span>
            )}
            <Button type="submit" disabled={pending || (!dirty && !!product)}>
              {pending ? "Saving…" : product ? "Save changes" : "Create product"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
