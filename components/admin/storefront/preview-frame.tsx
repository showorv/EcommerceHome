"use client";

import { ExternalLink, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Live preview of the drafts (page sections, menus and theme) in a frame, at computer or phone size. */

const DESKTOP_WIDTH = 1280;

export function PreviewFrame({
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
