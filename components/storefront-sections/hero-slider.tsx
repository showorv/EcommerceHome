"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionLevel } from "@/components/motion/motion-provider";
import { cn } from "@/lib/utils";

/**
 * Hero slides (FR-SF-01). Slides cross-fade; autoplay pauses while the pointer or keyboard focus is on
 * the hero, when the tab is hidden, and never starts for visitors who prefer less motion. Each slide's
 * content is rendered on the server and passed in.
 */
export function HeroSlider({
  slides,
  labels,
  autoplaySeconds,
  className,
}: {
  slides: ReactNode[];
  /** Short name per slide for the dots ("Slide 1: Winter sale"). */
  labels: string[];
  autoplaySeconds: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const hovering = useRef(false);
  const level = useMotionLevel();
  const reduce = useReducedMotion();
  const count = slides.length;
  const canAutoplay = count > 1 && autoplaySeconds > 0 && level !== "off" && !reduce && !stopped;

  useEffect(() => {
    if (!canAutoplay || paused) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % count);
    }, autoplaySeconds * 1000);
    return () => clearTimeout(t);
  }, [canAutoplay, paused, index, count, autoplaySeconds]);

  const go = (i: number) => setIndex((i + count) % count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className={cn("relative isolate overflow-hidden", className)}
      onPointerEnter={() => {
        hovering.current = true;
        setPaused(true);
      }}
      onPointerLeave={() => {
        hovering.current = false;
        setPaused(false);
      }}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !hovering.current) setPaused(false);
      }}
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          aria-hidden={i !== index}
          inert={i !== index}
          className={cn(
            "transition-opacity duration-700 ease-out motion-reduce:transition-none",
            i === 0 ? "relative" : "absolute inset-0",
            i === index ? "z-10 opacity-100" : "z-0 opacity-0",
          )}
        >
          {slide}
        </div>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="absolute top-1/2 left-3 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50 md:grid"
            aria-label="Previous slide"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="absolute top-1/2 right-3 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50 md:grid"
            aria-label="Next slide"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Slide ${i + 1}${labels[i] ? `: ${labels[i]}` : ""}`}
                aria-current={i === index}
                className="grid h-6 place-items-center px-0.5"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full bg-white/60 shadow transition-all",
                    i === index ? "w-6 bg-white" : "w-1.5",
                  )}
                />
              </button>
            ))}
            {autoplaySeconds > 0 && level !== "off" && !reduce && (
              <button
                type="button"
                onClick={() => setStopped((s) => !s)}
                aria-label={stopped ? "Play slideshow" : "Pause slideshow"}
                className="ml-1 grid size-6 place-items-center rounded-full bg-black/30 text-white"
              >
                {stopped ? <Play className="size-3" /> : <Pause className="size-3" />}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
