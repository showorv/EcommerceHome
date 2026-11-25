"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export function report(res: { ok: true; message?: string } | { ok: false; error: string }, success = "Saved.") {
  if (res.ok) toast.success(res.message ?? success);
  else toast.error(res.error);
  return res.ok;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  /** A problem with this field, shown in place of the hint. */
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}

export type I18n = { en: string; bn: string };

/** English + Bangla pair (FR-SF-11: product fields can hold both languages). */
export function I18nField({
  id,
  label,
  value,
  onChange,
  multiline,
  required,
  maxLength,
}: {
  id: string;
  label: string;
  value: I18n;
  onChange: (v: I18n) => void;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  const Comp = multiline ? Textarea : Input;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label} (English)`} htmlFor={`${id}-en`}>
        <Comp
          id={`${id}-en`}
          value={value.en}
          required={required}
          maxLength={maxLength}
          onChange={(e) => onChange({ ...value, en: e.target.value })}
        />
      </Field>
      <Field label={`${label} (বাংলা)`} htmlFor={`${id}-bn`} hint="Optional">
        <Comp
          id={`${id}-bn`}
          lang="bn"
          value={value.bn}
          maxLength={maxLength}
          onChange={(e) => onChange({ ...value, bn: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Taka amount input: shows taka, the form state keeps a string so typing "12." works. */
export function TakaInput({
  id,
  value,
  onChange,
  placeholder,
  label,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  label?: string;
}) {
  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
        ৳
      </span>
      <Input
        id={id}
        aria-label={label}
        inputMode="decimal"
        className="pl-6"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      />
    </div>
  );
}

/** Poisha → "1450.5" for editing. */
export function poishaToInput(p: number): string {
  if (!p) return "";
  return (p / 100).toString();
}

/** SEO block shared by products, categories and collections (FR-PD-08). */
export function SeoFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: { title: string; description: string; ogImage: string };
  onChange: (v: { title: string; description: string; ogImage: string }) => void;
}) {
  return (
    <div className="grid gap-3">
      <Field
        label="Meta title"
        htmlFor={`${idPrefix}-seo-title`}
        hint={`${value.title.length}/70 · leave empty to use the name`}
      >
        <Input
          id={`${idPrefix}-seo-title`}
          maxLength={70}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </Field>
      <Field label="Meta description" htmlFor={`${idPrefix}-seo-desc`} hint={`${value.description.length}/170`}>
        <Textarea
          id={`${idPrefix}-seo-desc`}
          maxLength={170}
          rows={2}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </Field>
      <Field
        label="Share image URL (Open Graph)"
        htmlFor={`${idPrefix}-seo-og`}
        hint="Leave empty to use the first image"
      >
        <Input
          id={`${idPrefix}-seo-og`}
          value={value.ogImage}
          onChange={(e) => onChange({ ...value, ogImage: e.target.value })}
        />
      </Field>
    </div>
  );
}
