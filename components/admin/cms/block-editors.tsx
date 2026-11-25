"use client";

import { Bold, Italic, Link2 } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Field } from "@/components/admin/catalog/form-bits";
import { ImagePicker } from "@/components/admin/catalog/image-picker";
import { Choice, ItemList, Text } from "@/components/admin/storefront/section-editors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BlockData, BlockType } from "@/modules/cms/blocks";

/** Editors for each CMS block type. Each gets the block's data and returns a changed copy. */

type EditorProps<T extends BlockType> = { id: string; data: BlockData<T>; onChange: (d: BlockData<T>) => void };

export const FORMAT_HINT = (
  <>
    Select words and press <strong>B</strong>, <em>I</em> or the link button. A blank line starts a new paragraph.
  </>
);

/**
 * A textarea with Bold / Italic / Link buttons that wrap the selected words in the store's simple
 * formatting (**bold**, *italic*, [text](/link)).
 */
export function FormattedText({
  id,
  label,
  value,
  onChange,
  max,
  rows = 5,
  hint = FORMAT_HINT,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  hint?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Where the cursor goes once the formatted text is on screen. */
  const nextSelection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const sel = nextSelection.current;
    if (!el || !sel) return;
    nextSelection.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  function wrap(kind: "bold" | "italic" | "link") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = value.slice(a, b) || (kind === "link" ? "link text" : "text");
    const [before, after] = kind === "bold" ? ["**", "**"] : kind === "italic" ? ["*", "*"] : ["[", "](/)"];
    const next = value.slice(0, a) + before + picked + after + value.slice(b);
    if (next.length > max) return;
    // Select what to type next: the link address, or the formatted words.
    const start = a + before.length + picked.length + 2;
    nextSelection.current =
      kind === "link" ? [start, start + 1] : [a + before.length, a + before.length + picked.length];
    onChange(next);
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="focus-within:ring-ring/50 grid overflow-hidden rounded-md border focus-within:ring-[3px]">
        <div
          className="bg-muted/40 flex gap-0.5 border-b p-1"
          role="toolbar"
          aria-label={`Format ${label.toLowerCase()}`}
        >
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="Bold"
            aria-label="Bold"
            onClick={() => wrap("bold")}
          >
            <Bold />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="Italic"
            aria-label="Italic"
            onClick={() => wrap("italic")}
          >
            <Italic />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="Link"
            aria-label="Link"
            onClick={() => wrap("link")}
          >
            <Link2 />
          </Button>
        </div>
        <Textarea
          ref={ref}
          id={id}
          rows={rows}
          maxLength={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </Field>
  );
}

const LINK_HINT = "A store page like /pages/returns or /c/kitchen, or a full https:// link";

function HeadingEditor({ id, data, onChange }: EditorProps<"heading">) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
      <Text
        id={`${id}-text`}
        label="Heading"
        value={data.text}
        onChange={(text) => onChange({ ...data, text })}
        max={160}
      />
      <Choice
        id={`${id}-level`}
        label="Size"
        value={data.level}
        onChange={(level) => onChange({ ...data, level })}
        options={[
          ["2", "Large (section)"],
          ["3", "Small (sub-section)"],
        ]}
      />
    </div>
  );
}

function ParagraphEditor({ id, data, onChange }: EditorProps<"paragraph">) {
  return (
    <FormattedText
      id={`${id}-text`}
      label="Text"
      value={data.text}
      onChange={(text) => onChange({ text })}
      max={5000}
      rows={6}
    />
  );
}

function ListEditor({ id, data, onChange }: EditorProps<"list">) {
  return (
    <div className="grid gap-3">
      <Choice
        id={`${id}-style`}
        label="Style"
        value={data.style}
        onChange={(style) => onChange({ ...data, style })}
        options={[
          ["bullet", "Bullet points"],
          ["number", "Numbered steps"],
        ]}
      />
      <ItemList
        items={data.items}
        onChange={(items) => onChange({ ...data, items })}
        make={() => ""}
        max={50}
        noun="Point"
        render={(item, set, i) => (
          <Text
            id={`${id}-item${i}`}
            label="Text"
            value={item}
            onChange={set}
            max={600}
            hint={i === 0 ? "You can use **bold**, *italic* and [links](/pages/returns)." : undefined}
          />
        )}
      />
    </div>
  );
}

function ImageEditor({ id, data, onChange }: EditorProps<"image">) {
  return (
    <div className="grid gap-3">
      <Field
        label="Picture"
        htmlFor={`${id}-img`}
        hint="Describe the picture in the alt text for screen readers and Google"
      >
        <ImagePicker id={`${id}-img`} value={data.image} onChange={(image) => onChange({ ...data, image })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Text
          id={`${id}-caption`}
          label="Caption (optional)"
          value={data.caption}
          onChange={(caption) => onChange({ ...data, caption })}
          max={200}
        />
        <Choice
          id={`${id}-width`}
          label="Width"
          value={data.width}
          onChange={(width) => onChange({ ...data, width })}
          options={[
            ["normal", "Text width"],
            ["wide", "Wider"],
          ]}
        />
      </div>
    </div>
  );
}

function CalloutEditor({ id, data, onChange }: EditorProps<"callout">) {
  return (
    <div className="grid gap-3">
      <Choice
        id={`${id}-tone`}
        label="Colour"
        value={data.tone}
        onChange={(tone) => onChange({ ...data, tone })}
        options={[
          ["info", "Blue: information"],
          ["success", "Green: good news / promise"],
          ["warning", "Amber: important / warning"],
        ]}
      />
      <FormattedText
        id={`${id}-text`}
        label="Text"
        value={data.text}
        onChange={(text) => onChange({ ...data, text })}
        max={1000}
        rows={3}
      />
    </div>
  );
}

function FaqEditor({ id, data, onChange }: EditorProps<"faq">) {
  return (
    <ItemList
      items={data.items}
      onChange={(items) => onChange({ items })}
      make={() => ({ q: "", a: "" })}
      max={40}
      noun="Question"
      render={(f, set, i) => (
        <>
          <Text id={`${id}-q${i}`} label="Question" value={f.q} onChange={(q) => set({ ...f, q })} max={200} />
          <FormattedText
            id={`${id}-a${i}`}
            label="Answer"
            value={f.a}
            onChange={(a) => set({ ...f, a })}
            max={2000}
            rows={3}
            hint={null}
          />
        </>
      )}
    />
  );
}

function ButtonEditor({ id, data, onChange }: EditorProps<"button">) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Text
        id={`${id}-label`}
        label="Button text"
        value={data.label}
        onChange={(label) => onChange({ ...data, label })}
        max={40}
      />
      <Choice
        id={`${id}-style`}
        label="Look"
        value={data.style}
        onChange={(style) => onChange({ ...data, style })}
        options={[
          ["solid", "Filled (brand colour)"],
          ["outline", "Outline"],
        ]}
      />
      <Text
        id={`${id}-href`}
        label="Link"
        value={data.href}
        onChange={(href) => onChange({ ...data, href })}
        max={500}
        hint={LINK_HINT}
        placeholder="/search"
      />
    </div>
  );
}

function DividerEditor() {
  return <p className="text-muted-foreground text-sm">A thin line. Nothing to set.</p>;
}

function ContactDetailsEditor({ id, data, onChange }: EditorProps<"contactDetails">) {
  return (
    <div className="grid gap-2">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ heading })}
        max={80}
      />
      <p className="text-muted-foreground text-xs">
        Shows the phone, email, address and social links from{" "}
        <a href="/admin/appearance" className="underline" target="_blank" rel="noopener">
          Menus &amp; theme → Footer
        </a>
        , so you only type them in one place.
      </p>
    </div>
  );
}

function ContactFormEditor({ id, data, onChange }: EditorProps<"contactForm">) {
  return (
    <div className="grid gap-3">
      <Text
        id={`${id}-heading`}
        label="Heading"
        value={data.heading}
        onChange={(heading) => onChange({ ...data, heading })}
        max={80}
      />
      <Text
        id={`${id}-text`}
        label="Short note"
        value={data.text}
        onChange={(text) => onChange({ ...data, text })}
        max={300}
      />
      <p className="text-muted-foreground text-xs">
        Shoppers give their name, mobile number or email, and a message. Messages appear in{" "}
        <a href="/admin/messages" className="underline" target="_blank" rel="noopener">
          Messages
        </a>
        .
      </p>
    </div>
  );
}

export const BLOCK_EDITORS: { [T in BlockType]: (p: EditorProps<T>) => ReactNode } = {
  heading: HeadingEditor,
  paragraph: ParagraphEditor,
  list: ListEditor,
  image: ImageEditor,
  callout: CalloutEditor,
  faq: FaqEditor,
  button: ButtonEditor,
  divider: DividerEditor,
  contactDetails: ContactDetailsEditor,
  contactForm: ContactFormEditor,
};
