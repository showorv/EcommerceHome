"use client";

import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ViewMedia } from "@/modules/catalog/storefront";
import { Stage } from "./media-gallery";

/**
 * Full-screen viewer (FR-PD-01). Photos: pinch or double-tap to zoom (up to 4×), drag to move around,
 * mouse wheel zooms on desktop, swipe left/right when not zoomed. Videos play with their controls.
 */
const MAX = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Lightbox({
  media,
  index,
  onIndex,
  open,
  onOpenChange,
  title,
}: {
  media: ViewMedia[];
  index: number;
  onIndex: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const current = media[index];
  const go = (i: number) => onIndex((i + media.length) % media.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-w-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(index + 1);
          if (e.key === "ArrowLeft") go(index - 1);
        }}
      >
        <DialogTitle className="sr-only">{title}: photos and videos</DialogTitle>
        <DialogDescription className="sr-only">
          Pinch, double-tap or scroll to zoom. Use the arrow keys to move between items.
        </DialogDescription>
        {current && (
          <div className="relative size-full">
            {current.type === "image" ? (
              <ZoomableImage key={current.id} media={current} title={title} onSwipe={(dir) => go(index + dir)} />
            ) : (
              <div className="absolute inset-0 m-auto aspect-video max-h-full w-full max-w-5xl">
                <Stage media={current} title={title} sizes="100vw" playing onPlay={() => {}} />
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums backdrop-blur">
                {index + 1} / {media.length}
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
                aria-label="Close"
              >
                <X className="size-6" aria-hidden />
              </button>
            </div>
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
                  aria-label="Previous"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
                  aria-label="Next"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ZoomableImage({ media, title, onSwipe }: { media: ViewMedia; title: string; onSwipe: (dir: 1 | -1) => void }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const swipeStart = useRef<number | null>(null);
  const lastTap = useRef(0);

  // Keep the picture covering the screen edges when zoomed: limit how far it can be dragged.
  function bounded(s: number, x: number, y: number) {
    const r = box.current?.getBoundingClientRect();
    const mx = r ? ((s - 1) * r.width) / 2 : 0;
    const my = r ? ((s - 1) * r.height) / 2 : 0;
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  }

  /** Zoom to scale `s`, keeping the point under (cx, cy) in place. */
  function zoomAt(s: number, cx: number, cy: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const next = clamp(s, 1, MAX);
    const px = cx - (r.left + r.width / 2);
    const py = cy - (r.top + r.height / 2);
    const k = next / view.s;
    setView(bounded(next, px - (px - view.x) * k, py - (py - view.y) * k));
  }

  function onDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), s: view.s };
      swipeStart.current = null;
    } else {
      swipeStart.current = view.s === 1 ? e.clientX : null;
    }
  }

  function onMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomAt(pinch.current.s * (dist / pinch.current.dist), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    } else if (view.s > 1) {
      setView((v) => bounded(v.s, v.x + e.clientX - prev.x, v.y + e.clientY - prev.y));
    }
  }

  function onUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (swipeStart.current !== null && view.s === 1) {
      const dx = e.clientX - swipeStart.current;
      swipeStart.current = null;
      if (Math.abs(dx) > 60) return onSwipe(dx < 0 ? 1 : -1);
    }
    // Double tap / double click toggles zoom at that point.
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (view.s > 1) setView({ s: 1, x: 0, y: 0 });
      else zoomAt(2.5, e.clientX, e.clientY);
    } else {
      lastTap.current = now;
    }
  }

  function onWheel(e: WheelEvent) {
    zoomAt(view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  }

  const center = () => {
    const r = box.current?.getBoundingClientRect();
    return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0];
  };

  return (
    <>
      <div
        ref={box}
        className="absolute inset-0 touch-none overflow-hidden select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        style={{ cursor: view.s > 1 ? "grab" : "zoom-in" }}
      >
        <div
          className="absolute inset-0 transition-transform duration-75 ease-out will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        >
          <Image
            src={media.url}
            alt={media.alt || title}
            fill
            sizes="100vw"
            quality={75}
            draggable={false}
            className="object-contain"
          />
        </div>
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => zoomAt(view.s / 1.5, ...(center() as [number, number]))}
          disabled={view.s <= 1}
          className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 disabled:opacity-40"
          aria-label="Zoom out"
        >
          <ZoomOut className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => zoomAt(view.s * 1.5, ...(center() as [number, number]))}
          disabled={view.s >= MAX}
          className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 disabled:opacity-40"
          aria-label="Zoom in"
        >
          <ZoomIn className="size-5" aria-hidden />
        </button>
      </div>
    </>
  );
}
