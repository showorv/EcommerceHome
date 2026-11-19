"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./form-bits";
import { ImagePicker } from "./image-picker";

/** Rich description blocks per product (FR-PD-03). Plain text only — no HTML, so nothing can be injected. */

export type Block =
  | { type: "text"; data: { heading: string; body: string } }
  | { type: "image"; data: { url: string; alt: string; caption: string } }
  | { type: "video"; data: { url: string; caption: string } }
  | { type: "specs"; data: { heading: string; rows: { label: string; value: string }[] } }
  | { type: "inBox"; data: { heading: string; items: string[] } }
  | { type: "comparison"; data: { heading: string; columns: string[]; rows: { label: string; values: string[] }[] } };

const NEW_BLOCK: Record<Block["type"], () => Block> = {
  text: () => ({ type: "text", data: { heading: "", body: "" } }),
  image: () => ({ type: "image", data: { url: "", alt: "", caption: "" } }),
  video: () => ({ type: "video", data: { url: "", caption: "" } }),
  specs: () => ({ type: "specs", data: { heading: "Specifications", rows: [{ label: "", value: "" }] } }),
  inBox: () => ({ type: "inBox", data: { heading: "What's in the box", items: [""] } }),
  comparison: () => ({
    type: "comparison",
    data: { heading: "", columns: ["This product", "Others"], rows: [{ label: "", values: ["", ""] }] },
  }),
};

const LABELS: Record<Block["type"], string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  specs: "Spec table",
  inBox: "What's in the box",
  comparison: "Comparison table",
};

export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="grid gap-4">
      {blocks.map((b, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{LABELS[b.type]}</span>
            <div className="flex">
              <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-4" aria-hidden />
                <span className="sr-only">Move up</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => move(i, 1)}
                disabled={i === blocks.length - 1}
              >
                <ArrowDown className="size-4" aria-hidden />
                <span className="sr-only">Move down</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(blocks.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
                <span className="sr-only">Remove block</span>
              </Button>
            </div>
          </div>
          <BlockFields block={b} onChange={(nb) => set(i, nb)} idx={i} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(NEW_BLOCK) as Block["type"][]).map((t) => (
          <Button
            key={t}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...blocks, NEW_BLOCK[t]()])}
          >
            <Plus className="size-4" aria-hidden /> {LABELS[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BlockFields({ block, onChange, idx }: { block: Block; onChange: (b: Block) => void; idx: number }) {
  const id = `block-${idx}`;
  switch (block.type) {
    case "text":
      return (
        <>
          <Input
            aria-label="Heading"
            placeholder="Heading (optional)"
            value={block.data.heading}
            onChange={(e) => onChange({ ...block, data: { ...block.data, heading: e.target.value } })}
          />
          <Textarea
            aria-label="Text"
            rows={5}
            placeholder="Write a paragraph. Empty lines start a new paragraph."
            value={block.data.body}
            onChange={(e) => onChange({ ...block, data: { ...block.data, body: e.target.value } })}
          />
        </>
      );
    case "image":
      return (
        <>
          <ImagePicker
            id={id}
            value={{ url: block.data.url, alt: block.data.alt }}
            onChange={(v) => onChange({ ...block, data: { ...block.data, ...v } })}
          />
          <Input
            aria-label="Caption"
            placeholder="Caption (optional)"
            value={block.data.caption}
            onChange={(e) => onChange({ ...block, data: { ...block.data, caption: e.target.value } })}
          />
        </>
      );
    case "video":
      return (
        <>
          <Field label="YouTube link or uploaded video URL" htmlFor={id}>
            <Input
              id={id}
              placeholder="https://youtu.be/…"
              value={block.data.url}
              onChange={(e) => onChange({ ...block, data: { ...block.data, url: e.target.value } })}
            />
          </Field>
          <Input
            aria-label="Caption"
            placeholder="Caption (optional)"
            value={block.data.caption}
            onChange={(e) => onChange({ ...block, data: { ...block.data, caption: e.target.value } })}
          />
        </>
      );
    case "specs":
      return (
        <>
          <Input
            aria-label="Heading"
            value={block.data.heading}
            onChange={(e) => onChange({ ...block, data: { ...block.data, heading: e.target.value } })}
          />
          <RowsEditor
            rows={block.data.rows}
            onChange={(rows) => onChange({ ...block, data: { ...block.data, rows } })}
          />
        </>
      );
    case "inBox":
      return (
        <>
          <Input
            aria-label="Heading"
            value={block.data.heading}
            onChange={(e) => onChange({ ...block, data: { ...block.data, heading: e.target.value } })}
          />
          <Textarea
            aria-label="Items, one per line"
            rows={4}
            placeholder={"1 × Chopper\n1 × USB-C cable\n1 × Manual"}
            value={block.data.items.join("\n")}
            onChange={(e) => onChange({ ...block, data: { ...block.data, items: e.target.value.split("\n") } })}
          />
        </>
      );
    case "comparison":
      return <ComparisonEditor block={block} onChange={onChange} />;
  }
}

/** Label/value rows, used for spec tables. */
export function RowsEditor({
  rows,
  onChange,
}: {
  rows: { label: string; value: string }[];
  onChange: (r: { label: string; value: string }[]) => void;
}) {
  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input
            aria-label={`Row ${i + 1} label`}
            placeholder="e.g. Capacity"
            value={r.label}
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <Input
            aria-label={`Row ${i + 1} value`}
            placeholder="e.g. 2 litres"
            value={r.value}
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">Remove row</span>
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { label: "", value: "" }])}>
          <Plus className="size-4" aria-hidden /> Row
        </Button>
      </div>
    </div>
  );
}

function ComparisonEditor({
  block,
  onChange,
}: {
  block: Extract<Block, { type: "comparison" }>;
  onChange: (b: Block) => void;
}) {
  const d = block.data;
  const set = (data: Partial<typeof d>) => onChange({ ...block, data: { ...d, ...data } });
  return (
    <div className="grid gap-2">
      <Input
        aria-label="Heading"
        placeholder="Heading (optional)"
        value={d.heading}
        onChange={(e) => set({ heading: e.target.value })}
      />
      <div className="flex flex-wrap gap-2">
        {d.columns.map((c, ci) => (
          <Input
            key={ci}
            aria-label={`Column ${ci + 1}`}
            className="w-40"
            value={c}
            onChange={(e) => set({ columns: d.columns.map((x, j) => (j === ci ? e.target.value : x)) })}
          />
        ))}
        {d.columns.length < 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set({ columns: [...d.columns, ""], rows: d.rows.map((r) => ({ ...r, values: [...r.values, ""] })) })
            }
          >
            <Plus className="size-4" aria-hidden /> Column
          </Button>
        )}
      </div>
      {d.rows.map((r, ri) => (
        <div key={ri} className="flex flex-wrap gap-2">
          <Input
            aria-label={`Row ${ri + 1} label`}
            className="w-40"
            placeholder="Feature"
            value={r.label}
            onChange={(e) => set({ rows: d.rows.map((x, j) => (j === ri ? { ...x, label: e.target.value } : x)) })}
          />
          {d.columns.map((_, ci) => (
            <Input
              key={ci}
              aria-label={`Row ${ri + 1}, column ${ci + 1}`}
              className="w-40"
              value={r.values[ci] ?? ""}
              onChange={(e) =>
                set({
                  rows: d.rows.map((x, j) =>
                    j === ri
                      ? { ...x, values: d.columns.map((__, k) => (k === ci ? e.target.value : (x.values[k] ?? ""))) }
                      : x,
                  ),
                })
              }
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => set({ rows: d.rows.filter((_, j) => j !== ri) })}
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">Remove row</span>
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set({ rows: [...d.rows, { label: "", values: d.columns.map(() => "") }] })}
        >
          <Plus className="size-4" aria-hidden /> Row
        </Button>
      </div>
    </div>
  );
}
