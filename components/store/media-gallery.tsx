"use client";

import { ChevronLeft, ChevronRight, Film, MonitorPlay, Play } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { ViewMedia } from "@/modules/catalog/storefront";

/**
 * Product gallery: one big item with arrows, swipe and arrow keys, plus a row of thumbnails.
 * Images, uploaded videos (with controls) and YouTube (loaded only when the visitor presses play,
 * through youtube-nocookie). Used by quick view now; the product page adds zoom and a lightbox (1.7).
 */
export function MediaGallery({
  media,
  title,
  activeId,
  sizes = "(min-width: 768px) 450px, 100vw",
  className,
}: {
  media: ViewMedia[];
  title: string;
  /** Jump to this item when it changes (e.g. the picked variant's photo). */
  activeId?: string;
  sizes?: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [lastActive, setLastActive] = useState(activeId);
  const [playing, setPlaying] = useState<string | null>(null); // YouTube item that was started
  const touchX = useRef<number | null>(null);

  // Follow the variant's photo without an effect: adjust state while rendering when the prop changes.
  if (activeId !== lastActive) {
    setLastActive(activeId);
    const i = media.findIndex((m) => m.id === activeId);
    if (i >= 0) setIndex(i);
  }

  if (media.length === 0) {
    return (
      <div className={cn("bg-muted text-muted-foreground grid aspect-square place-items-center rounded-lg", className)}>
        No photos yet
      </div>
    );
  }

  const current = media[Math.min(index, media.length - 1)]!;
  const go = (i: number) => setIndex((i + media.length) % media.length);

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else return;
    e.preventDefault();
  }
  function onDown(e: PointerEvent) {
    if (e.pointerType === "touch") touchX.current = e.clientX;
  }
  function onUp(e: PointerEvent) {
    if (e.pointerType !== "touch" || touchX.current === null) return;
    const dx = e.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div
        className="bg-muted focus-visible:ring-ring relative aspect-square touch-pan-y overflow-hidden rounded-lg outline-none focus-visible:ring-2"
        tabIndex={0}
        role="group"
        aria-roledescription="gallery"
        aria-label={`${title}: item ${index + 1} of ${media.length}. Use the arrow keys to browse.`}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        <Stage
          key={current.id}
          media={current}
          title={title}
          sizes={sizes}
          playing={playing === current.id}
          onPlay={() => setPlaying(current.id)}
        />
        {media.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="bg-background/80 hover:bg-background absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-full shadow backdrop-blur"
              aria-label="Previous"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="bg-background/80 hover:bg-background absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full shadow backdrop-blur"
              aria-label="Next"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="bg-background/80 absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-xs tabular-nums shadow backdrop-blur">
              {index + 1} / {media.length}
            </span>
          </>
        )}
      </div>

      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="All photos and videos">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="listitem"
              onClick={() => setIndex(i)}
              aria-label={`Show item ${i + 1}${m.type === "image" ? "" : " (video)"}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "bg-muted relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                i === index ? "border-primary" : "hover:border-muted-foreground/40 border-transparent",
              )}
            >
              <Thumb media={m} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stage({
  media,
  title,
  sizes,
  playing,
  onPlay,
}: {
  media: ViewMedia;
  title: string;
  sizes: string;
  playing: boolean;
  onPlay: () => void;
}) {
  if (media.type === "video") {
    return (
      <video
        src={media.url}
        poster={media.poster || undefined}
        controls
        playsInline
        preload="metadata"
        className="absolute inset-0 size-full bg-black object-contain"
        aria-label={media.alt || `${title} video`}
      />
    );
  }
  if (media.type === "youtube") {
    return playing ? (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${media.youtubeId}?autoplay=1&rel=0`}
        title={media.alt || `${title} video`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        className="absolute inset-0 size-full"
      />
    ) : (
      // Nothing loads from YouTube until the visitor asks for it.
      <button
        type="button"
        onClick={onPlay}
        className="absolute inset-0 grid place-items-center bg-neutral-900 text-white"
        aria-label={`Play video: ${media.alt || title}`}
      >
        <span className="grid place-items-center gap-2 text-sm">
          <span className="grid size-16 place-items-center rounded-full bg-red-600 shadow-lg">
            <Play className="size-7 fill-white" aria-hidden />
          </span>
          Play video
        </span>
      </button>
    );
  }
  return (
    <Image
      src={media.url}
      alt={media.alt || title}
      fill
      sizes={sizes}
      className="object-contain"
      style={{
        objectPosition: `${media.focalX}% ${media.focalY}%`,
        ...(media.blur ? { backgroundImage: `url(${media.blur})`, backgroundSize: "cover" } : {}),
      }}
    />
  );
}

function Thumb({ media }: { media: ViewMedia }) {
  const still = media.type === "image" ? media.url : media.type === "video" ? media.poster : "";
  return (
    <>
      {still ? (
        <Image src={still} alt="" fill sizes="64px" className="object-cover" />
      ) : (
        <span className="text-muted-foreground grid size-full place-items-center">
          {media.type === "youtube" ? (
            <MonitorPlay className="size-6" aria-hidden />
          ) : (
            <Film className="size-6" aria-hidden />
          )}
        </span>
      )}
      {media.type !== "image" && still && (
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <Play className="size-5 fill-white text-white" aria-hidden />
        </span>
      )}
    </>
  );
}
