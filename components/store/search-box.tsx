"use client";

import { Loader2, Search, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SearchSuggestions } from "@/modules/catalog/search-data";

/**
 * Search box with suggestions (FR-SF-08). Typing shows matching products and categories (typos are
 * fine); arrow keys move through them, Enter opens one, or Enter on its own shows all results.
 * Without JavaScript it is a plain form that opens /search?q=…
 */

type Option = { key: string; href: string; kind: "product" | "category" | "all" };

const cache = new Map<string, SearchSuggestions>();

export function SearchBox({
  initialQuery = "",
  autoFocus = false,
  className,
  onDone,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  className?: string;
  /** Called after navigating (e.g. to close the phone search bar). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [value, setValue] = useState(initialQuery);
  const [data, setData] = useState<SearchSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  const q = value.trim();

  // Fetch suggestions 150 ms after typing stops; older answers are ignored.
  useEffect(() => {
    if (q.length < 2) return;
    const hit = cache.get(q);
    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        if (hit) {
          setData(hit);
          return;
        }
        setLoading(true);
        try {
          const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
          if (!res.ok) return;
          const json = (await res.json()) as SearchSuggestions;
          if (cache.size > 100) cache.clear();
          cache.set(q, json);
          setData(json);
        } catch {
          // aborted or offline: keep the previous suggestions
        } finally {
          if (!ctrl.signal.aborted) setLoading(false);
        }
      },
      hit ? 0 : 150,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const shown = q.length >= 2 && data && data.query === q ? data : null;
  const options: Option[] = shown
    ? [
        ...shown.products.map((p) => ({ key: `p-${p.slug}`, href: `/p/${p.slug}`, kind: "product" as const })),
        ...shown.categories.map((c) => ({ key: `c-${c.slug}`, href: `/c/${c.slug}`, kind: "category" as const })),
        { key: "all", href: `/search?q=${encodeURIComponent(q)}`, kind: "all" as const },
      ]
    : [];
  const expanded = open && options.length > 0;
  const optionId = (i: number) => `${id}-opt-${i}`;

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    // A product or category was picked: start fresh next time. (The results page shows its own search.)
    if (!href.startsWith("/search")) setValue("");
    input.current?.blur();
    router.push(href);
    onDone?.();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (expanded && active >= 0 && options[active]) return go(options[active].href);
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      // -1 is "back in the box"; the list wraps around through it.
      const n = options.length;
      setActive((i) => (step === 1 ? (i + 1 >= n ? -1 : i + 1) : i - 1 < -1 ? n - 1 : i - 1));
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (value) {
        e.preventDefault();
        setValue("");
      }
    }
  }

  const optProps = (i: number) => ({
    id: optionId(i),
    index: i,
    href: options[i]!.href,
    active: active === i,
    onHover: setActive,
  });

  return (
    <form role="search" action="/search" onSubmit={submit} className={cn("relative", className)}>
      <label htmlFor={`${id}-input`} className="sr-only">
        Search products
      </label>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          ref={input}
          id={`${id}-input`}
          name="q"
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={80}
          placeholder="Search products…"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          className="bg-muted/60 focus-visible:bg-background focus-visible:ring-ring/50 h-10 w-full rounded-full border pr-10 pl-9 text-sm outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center">
          {loading ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Searching" />
          ) : value ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue("");
                setActive(-1);
                input.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground grid size-7 place-items-center rounded-full"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!expanded}
        className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-2 max-h-[min(70dvh,32rem)] overflow-y-auto rounded-xl border p-2 shadow-xl"
      >
        {shown && shown.products.length > 0 && (
          <div role="group" aria-label="Products">
            <p
              className="text-muted-foreground px-2 pt-1 pb-2 text-xs font-semibold tracking-wide uppercase"
              aria-hidden
            >
              Products
            </p>
            {shown.products.map((p, i) => (
              <SuggestionOption key={p.slug} {...optProps(i)} onPick={go}>
                <span className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-md">
                  {p.image && <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title}</span>
                  {p.titleBn && (
                    <span lang="bn" className="text-muted-foreground block truncate text-xs">
                      {p.titleBn}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatTaka(p.price)}</span>
              </SuggestionOption>
            ))}
          </div>
        )}
        {shown && shown.categories.length > 0 && (
          <div role="group" aria-label="Categories" className="mt-1 border-t pt-2">
            <p
              className="text-muted-foreground px-2 pt-1 pb-2 text-xs font-semibold tracking-wide uppercase"
              aria-hidden
            >
              Categories
            </p>
            {shown.categories.map((c, j) => (
              <SuggestionOption key={c.slug} {...optProps(shown.products.length + j)} onPick={go}>
                <span className="text-muted-foreground grid size-10 shrink-0 place-items-center">
                  <Search className="size-4" aria-hidden />
                </span>
                <span className="truncate">{c.name}</span>
              </SuggestionOption>
            ))}
          </div>
        )}
        {shown && (
          <div className={cn((shown.products.length > 0 || shown.categories.length > 0) && "mt-1 border-t pt-2")}>
            <SuggestionOption {...optProps(options.length - 1)} onPick={go}>
              <span className="text-muted-foreground grid size-10 shrink-0 place-items-center">
                <Search className="size-4" aria-hidden />
              </span>
              <span className="truncate">
                {shown.products.length || shown.categories.length
                  ? "See all results for "
                  : "No quick matches. Search for "}
                <span className="font-semibold">“{q}”</span>
              </span>
            </SuggestionOption>
          </div>
        )}
      </div>
    </form>
  );
}

function SuggestionOption({
  id,
  index,
  href,
  active,
  onHover,
  onPick,
  children,
}: {
  id: string;
  index: number;
  href: string;
  active: boolean;
  onHover: (index: number) => void;
  onPick: (href: string) => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e: MouseEvent) => e.preventDefault()} // keep focus in the box
      onMouseEnter={() => onHover(index)}
      onClick={() => onPick(href)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
        active && "bg-accent",
      )}
    >
      {children}
    </div>
  );
}
