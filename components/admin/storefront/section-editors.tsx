"use client";

import { ArrowDown, ArrowUp, Film, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Field, selectClass } from "@/components/admin/catalog/form-bits";
import { ImagePicker } from "@/components/admin/catalog/image-picker";
import { uploadMedia } from "@/components/admin/catalog/media-upload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { emptySlide, USP_ICONS, type SectionData, type SectionType } from "@/modules/storefront/sections";

/** Editors for each section type's content. Each gets the section's data and returns a changed copy. */

export type Option = { id: string; name: string };
export type EditorOptions = { categories: Option[]; collections: Option[] };

type EditorProps<T extends SectionType> = {
  id: string;
  data: SectionData<T>;
  onChange: (d: SectionData<T>) => void;
  options: EditorOptions;
};

// ---------- Small building blocks ----------

export function Text({
  id,
  label,
  value,
  onChange,
  max,
  hint,
  multiline,
  rows = 3,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  hint?: ReactNode;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      {multiline ? (
        <Textarea
          id={id}
          rows={rows}
          maxLength={max}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          maxLength={max}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function Choice<V extends string>({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: readonly (readonly [V, string])[];
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

const LINK_HINT = "A store page like /c/kitchen, or a full https:// link";

function ButtonFields({
  id,
  label,
  href,
  onLabel,
  onHref,
  title = "Button",
}: {
  id: string;
  label: string;
  href: string;
  onLabel: (v: string) => void;
  onHref: (v: string) => void;
  title?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Text id={`${id}-label`} label={`${title} text`} value={label} onChange={onLabel} max={30} />
      <Text
        id={`${id}-href`}
        label={`${title} link`}
        value={href}
        onChange={onHref}
        max={500}
        hint={LINK_HINT}
        placeholder="/search"
      />
    </div>
  );
}

function Pictures({
  id,
  image,
  mobileImage,
  onImage,
  onMobile,
}: {
  id: string;
  image: { url: string; alt: string };
  mobileImage: { url: string; alt: string };
  onImage: (v: { url: string; alt: string }) => void;
  onMobile: (v: { url: string; alt: string }) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Field label="Picture" htmlFor={`${id}-img`} hint="Wide picture, about 1920 × 800">
        <ImagePicker id={`${id}-img`} value={image} onChange={onImage} />
      </Field>
      <Field label="Phone picture (optional)" htmlFor={`${id}-mimg`} hint="Taller picture for phones, about 800 × 1000">
        <ImagePicker id={`${id}-mimg`} value={mobileImage} onChange={onMobile} />
      </Field>
    </div>
  );
}

/** A list of items with move up / down / remove, and an add button. */
export function ItemList<T>({
  items,
  onChange,
  make,
  max,
  min = 1,
  noun,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  max: number;
  min?: number;
  noun: string;
  render: (item: T, set: (v: T) => void, index: number) => ReactNode;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      {items.map((item, i) => (
        <div key={i} className="bg-muted/30 grid gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {noun} {i + 1}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="size-3.5" aria-hidden />
                <span className="sr-only">
                  Move {noun.toLowerCase()} {i + 1} up
                </span>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="size-3.5" aria-hidden />
                <span className="sr-only">
                  Move {noun.toLowerCase()} {i + 1} down
                </span>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-destructive size-7"
                disabled={items.length <= min}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" aria-hidden />
                <span className="sr-only">
                  Remove {noun.toLowerCase()} {i + 1}
                </span>
              </Button>
            </div>
          </div>
          {render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}
        </div>
      ))}
      {items.length < max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...items, make()])}
        >
          <Plus className="size-4" aria-hidden /> Add {noun.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

// ---------- Editors ----------

function HeroEditor({ id, data, onChange }: EditorProps<"hero">) {
  return (
    <div className="grid gap-4">
      <ItemList
        items={data.slides}
        onChange={(slides) => onChange({ ...data, slides })}
        make={emptySlide}
        max={6}
        noun="Slide"
        render={(s, set, i) => {
          const p = `${id}-s${i}`;
          return (
            <>
              <Pictures
                id={p}
                image={s.image}
                mobileImage={s.mobileImage}
                onImage={(image) => set({ ...s, image })}
                onMobile={(mobileImage) => set({ ...s, mobileImage })}
              />
              <Text
                id={`${p}-eyebrow`}
                label="Small text above the heading"
                value={s.eyebrow}
                onChange={(eyebrow) => set({ ...s, eyebrow })}
                max={60}
              />
              <Text
                id={`${p}-heading`}
                label="Heading"
                value={s.heading}
                onChange={(heading) => set({ ...s, heading })}
                max={120}
              />
              <Text
                id={`${p}-text`}
                label="Text"
                value={s.text}
                onChange={(text) => set({ ...s, text })}
                max={300}
                multiline
                rows={2}
              />
              <ButtonFields
                id={`${p}-cta`}
                label={s.ctaLabel}
                href={s.ctaHref}
                onLabel={(ctaLabel) => set({ ...s, ctaLabel })}
                onHref={(ctaHref) => set({ ...s, ctaHref })}
              />
              <ButtonFields
                id={`${p}-cta2`}
                title="Second button"
                label={s.cta2Label}
                href={s.cta2Href}
                onLabel={(cta2Label) => set({ ...s, cta2Label })}
                onHref={(cta2Href) => set({ ...s, cta2Href })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  id={`${p}-align`}
                  label="Text position"
                  value={s.align}
                  onChange={(align) => set({ ...s, align })}
                  options={[
                    ["left", "Left"],
                    ["center", "Centre"],
                  ]}
                />
                <Choice
                  id={`${p}-theme`}
                  label="Text colour"
                  value={s.theme}
                  onChange={(theme) => set({ ...s, theme })}
                  options={[
                    ["dark", "White text (dark picture)"],
                    ["light", "Dark text (light picture)"],
                  ]}
                />
              </div>
            </>
          );
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          id={`${id}-height`}
          label="Height"
          value={data.height}
          onChange={(height) => onChange({ ...data, height })}
          options={[
            ["medium", "Medium"],
            ["tall", "Tall"],
          ]}
        />
        <Field label="Next slide every (seconds)" htmlFor={`${id}-autoplay`} hint="0 = only when the shopper taps">
          <Input
            id={`${id}-autoplay`}
            type="number"
            min={0}
            max={20}
            value={data.autoplaySeconds}
            onChange={(e) => onChange({ ...data, autoplaySeconds: clampInt(e.target.value, 0, 20) })}
          />
        </Field>
      </div>
    </div>
  );
}

function CategoryGridEditor({ id, data, onChange, options }: EditorProps<"categoryGrid">) {
  const picked = new Set(data.categoryIds);
  return (
    <div className="grid gap-4">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={80}
      />
      <Text
        id={`${id}-sub`}
        label="Text under the heading"
        value={data.subheading}
        onChange={(subheading) => onChange({ ...data, subheading })}
        max={200}
      />
      <Choice
        id={`${id}-style`}
        label="Style"
        value={data.style}
        onChange={(style) => onChange({ ...data, style })}
        options={[
          ["tiles", "Picture tiles"],
          ["circles", "Round icons"],
        ]}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Categories</legend>
        <p className="text-muted-foreground text-xs">
          Tick the ones to show, in the order you want them. Nothing ticked = all top-level categories.
        </p>
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {options.categories.map((c) => {
            const pos = data.categoryIds.indexOf(c.id);
            return (
              <label key={c.id} className="hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-sm">
                <Checkbox
                  checked={picked.has(c.id)}
                  onCheckedChange={(on) =>
                    onChange({
                      ...data,
                      categoryIds: on
                        ? [...data.categoryIds, c.id].slice(0, 24)
                        : data.categoryIds.filter((x) => x !== c.id),
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {pos >= 0 && <span className="text-muted-foreground text-xs tabular-nums">#{pos + 1}</span>}
              </label>
            );
          })}
          {options.categories.length === 0 && <p className="text-muted-foreground p-2 text-sm">No categories yet.</p>}
        </div>
      </fieldset>
    </div>
  );
}

function ProductsEditor({ id, data, onChange, options }: EditorProps<"productCarousel">) {
  const refList =
    data.source === "collection" ? options.collections : data.source === "category" ? options.categories : null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          id={`${id}-heading`}
          label="Heading"
          value={data.heading}
          onChange={(heading) => onChange({ ...data, heading })}
          max={80}
        />
        <Text
          id={`${id}-sub`}
          label="Text under the heading"
          value={data.subheading}
          onChange={(subheading) => onChange({ ...data, subheading })}
          max={200}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          id={`${id}-source`}
          label="Which products"
          value={data.source}
          onChange={(source) => onChange({ ...data, source, refId: "" })}
          options={[
            ["newest", "Newest"],
            ["bestselling", "Best sellers"],
            ["discount", "Biggest discounts"],
            ["collection", "From a collection"],
            ["category", "From a category"],
          ]}
        />
        {refList && (
          <Field label={data.source === "collection" ? "Collection" : "Category"} htmlFor={`${id}-ref`}>
            <select
              id={`${id}-ref`}
              className={selectClass}
              value={data.refId}
              onChange={(e) => onChange({ ...data, refId: e.target.value })}
            >
              <option value="">Choose…</option>
              {refList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="How many" htmlFor={`${id}-limit`} hint="2 to 24">
          <Input
            id={`${id}-limit`}
            type="number"
            min={2}
            max={24}
            value={data.limit}
            onChange={(e) => onChange({ ...data, limit: clampInt(e.target.value, 2, 24) })}
          />
        </Field>
        <Choice
          id={`${id}-layout`}
          label="Layout"
          value={data.layout}
          onChange={(layout) => onChange({ ...data, layout })}
          options={[
            ["carousel", "Sliding row"],
            ["grid", "Grid"],
          ]}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox
            checked={data.showViewAll}
            onCheckedChange={(v) => onChange({ ...data, showViewAll: v === true })}
          />
          Show a “View all” link
        </label>
      </div>
      {data.showViewAll && !refList && (
        <p className="text-muted-foreground text-xs">“View all” appears for collection and category rows.</p>
      )}
    </div>
  );
}

function BannerEditor({ id, data, onChange }: EditorProps<"banner">) {
  return (
    <div className="grid gap-4">
      <Pictures
        id={id}
        image={data.image}
        mobileImage={data.mobileImage}
        onImage={(image) => onChange({ ...data, image })}
        onMobile={(mobileImage) => onChange({ ...data, mobileImage })}
      />
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={120}
      />
      <Text
        id={`${id}-text`}
        label="Text"
        value={data.text}
        onChange={(text) => onChange({ ...data, text })}
        max={300}
        multiline
        rows={2}
      />
      <ButtonFields
        id={`${id}-cta`}
        label={data.ctaLabel}
        href={data.ctaHref}
        onLabel={(ctaLabel) => onChange({ ...data, ctaLabel })}
        onHref={(ctaHref) => onChange({ ...data, ctaHref })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          id={`${id}-layout`}
          label="Layout"
          value={data.layout}
          onChange={(layout) => onChange({ ...data, layout })}
          options={[
            ["full", "Text on the picture"],
            ["split", "Picture beside the text"],
          ]}
        />
        <Choice
          id={`${id}-theme`}
          label="Colours"
          value={data.theme}
          onChange={(theme) => onChange({ ...data, theme })}
          options={[
            ["dark", "Dark with white text"],
            ["light", "Light with dark text"],
          ]}
        />
      </div>
    </div>
  );
}

function VideoEditor({ id, data, onChange }: EditorProps<"video">) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMedia(file);
      if (up.kind !== "video") throw new Error("Pick a video file");
      onChange({ ...data, url: up.url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <div className="grid gap-4">
      <Field
        label="Video"
        htmlFor={`${id}-url`}
        hint="Upload a short video (it plays muted on a loop), or paste a YouTube link (plays when tapped)"
      >
        <div className="flex gap-2">
          <Input
            id={`${id}-url`}
            value={data.url}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => onChange({ ...data, url: e.target.value })}
          />
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Film className="size-4 animate-pulse" aria-hidden /> : <Upload className="size-4" aria-hidden />}
            Upload
          </Button>
        </div>
      </Field>
      <Field label="Cover picture (optional)" htmlFor={`${id}-poster`} hint="Shown until the uploaded video starts">
        <ImagePicker id={`${id}-poster`} value={data.poster} onChange={(poster) => onChange({ ...data, poster })} />
      </Field>
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={120}
      />
      <Text
        id={`${id}-text`}
        label="Text"
        value={data.text}
        onChange={(text) => onChange({ ...data, text })}
        max={300}
        multiline
        rows={2}
      />
      <ButtonFields
        id={`${id}-cta`}
        label={data.ctaLabel}
        href={data.ctaHref}
        onLabel={(ctaLabel) => onChange({ ...data, ctaLabel })}
        onHref={(ctaHref) => onChange({ ...data, ctaHref })}
      />
    </div>
  );
}

const ICON_NAMES: Record<(typeof USP_ICONS)[number], string> = {
  truck: "Delivery truck",
  cash: "Cash",
  shield: "Shield (warranty)",
  refund: "Return arrow",
  support: "Headset (support)",
  star: "Badge (quality)",
  gift: "Gift",
  clock: "Clock",
};

function UspEditor({ id, data, onChange }: EditorProps<"usp">) {
  return (
    <ItemList
      items={data.items}
      onChange={(items) => onChange({ ...data, items })}
      make={() => ({ icon: "star" as const, title: "", text: "" })}
      max={6}
      noun="Point"
      render={(item, set, i) => (
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <Choice
            id={`${id}-i${i}-icon`}
            label="Icon"
            value={item.icon}
            onChange={(icon) => set({ ...item, icon })}
            options={USP_ICONS.map((k) => [k, ICON_NAMES[k]] as const)}
          />
          <Text
            id={`${id}-i${i}-title`}
            label="Title"
            value={item.title}
            onChange={(title) => set({ ...item, title })}
            max={60}
          />
          <Text
            id={`${id}-i${i}-text`}
            label="Short text"
            value={item.text}
            onChange={(text) => set({ ...item, text })}
            max={140}
          />
        </div>
      )}
    />
  );
}

function TestimonialsEditor({ id, data, onChange }: EditorProps<"testimonials">) {
  return (
    <div className="grid gap-4">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={80}
      />
      <ItemList
        items={data.items}
        onChange={(items) => onChange({ ...data, items })}
        make={() => ({ name: "", location: "", text: "", rating: 5, avatar: { url: "", alt: "" } })}
        max={12}
        noun="Review"
        render={(t, set, i) => {
          const p = `${id}-t${i}`;
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Text id={`${p}-name`} label="Name" value={t.name} onChange={(name) => set({ ...t, name })} max={60} />
                <Text
                  id={`${p}-loc`}
                  label="Place"
                  value={t.location}
                  onChange={(location) => set({ ...t, location })}
                  max={60}
                />
                <Choice
                  id={`${p}-rating`}
                  label="Stars"
                  value={String(t.rating) as "1" | "2" | "3" | "4" | "5"}
                  onChange={(v) => set({ ...t, rating: Number(v) })}
                  options={(["5", "4", "3", "2", "1"] as const).map((n) => [n, `${n} stars`] as const)}
                />
              </div>
              <Text
                id={`${p}-text`}
                label="What they said"
                value={t.text}
                onChange={(text) => set({ ...t, text })}
                max={500}
                multiline
              />
              <Field label="Photo (optional)" htmlFor={`${p}-avatar`}>
                <ImagePicker id={`${p}-avatar`} value={t.avatar} onChange={(avatar) => set({ ...t, avatar })} />
              </Field>
            </>
          );
        }}
      />
    </div>
  );
}

function FaqEditor({ id, data, onChange }: EditorProps<"faq">) {
  return (
    <div className="grid gap-4">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={80}
      />
      <ItemList
        items={data.items}
        onChange={(items) => onChange({ ...data, items })}
        make={() => ({ q: "", a: "" })}
        max={30}
        noun="Question"
        render={(f, set, i) => (
          <>
            <Text id={`${id}-q${i}`} label="Question" value={f.q} onChange={(q) => set({ ...f, q })} max={200} />
            <Text
              id={`${id}-a${i}`}
              label="Answer"
              value={f.a}
              onChange={(a) => set({ ...f, a })}
              max={1500}
              multiline
            />
          </>
        )}
      />
    </div>
  );
}

function NewsletterEditor({ id, data, onChange }: EditorProps<"newsletter">) {
  return (
    <div className="grid gap-4">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={80}
      />
      <Text
        id={`${id}-text`}
        label="Text"
        value={data.text}
        onChange={(text) => onChange({ ...data, text })}
        max={300}
        multiline
        rows={2}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          id={`${id}-btn`}
          label="Button text"
          value={data.buttonLabel}
          onChange={(buttonLabel) => onChange({ ...data, buttonLabel })}
          max={30}
          placeholder="Subscribe"
        />
        <Text
          id={`${id}-note`}
          label="Small print"
          value={data.note}
          onChange={(note) => onChange({ ...data, note })}
          max={200}
        />
      </div>
      <p className="text-muted-foreground text-xs">Sign-ups are saved with the email address only.</p>
    </div>
  );
}

function RichTextEditor({ id, data, onChange }: EditorProps<"richText">) {
  return (
    <div className="grid gap-4">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={120}
      />
      <Text
        id={`${id}-body`}
        label="Text"
        value={data.body}
        onChange={(body) => onChange({ ...data, body })}
        max={5000}
        multiline
        rows={6}
        hint="Plain text. Press Enter for a new line or a blank line for a new paragraph."
      />
      <Choice
        id={`${id}-align`}
        label="Alignment"
        value={data.align}
        onChange={(align) => onChange({ ...data, align })}
        options={[
          ["left", "Left"],
          ["center", "Centre"],
        ]}
      />
    </div>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

export const EDITORS: { [T in SectionType]: (p: EditorProps<T>) => ReactNode } = {
  hero: HeroEditor,
  categoryGrid: CategoryGridEditor,
  productCarousel: ProductsEditor,
  banner: BannerEditor,
  video: VideoEditor,
  usp: UspEditor,
  testimonials: TestimonialsEditor,
  faq: FaqEditor,
  newsletter: NewsletterEditor,
  richText: RichTextEditor,
};
