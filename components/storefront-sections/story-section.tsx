"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMotionLevel } from "@/components/motion/motion-provider";
import type { SectionData } from "@/modules/storefront/sections";

/**
 * Product story (FR-SF-04): on computers with the "full" motion level, the section is pinned while the
 * shopper scrolls and each step takes over in turn: the picture cross-fades, the text slides in, a bar
 * shows progress. GSAP + ScrollTrigger are downloaded only when such a section comes near the screen
 * (NFR-PF-02), animate opacity and transform only, and work only while scrolling (NFR-PF-03).
 *
 * The server sends the plain version (every step with its picture, one under another), which is also
 * what phones, the "reduced" / "off" levels and shoppers who prefer less motion get. The effect switches
 * the same markup to the pinned layout by setting data-pinned, so React never re-renders it.
 */

type Data = SectionData<"story">;

const QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";

export function StorySection({ data }: { data: Data }) {
  const root = useRef<HTMLElement>(null);
  const level = useMotionLevel();
  const { steps } = data;

  useEffect(() => {
    const el = root.current;
    if (!el || level !== "full" || steps.length < 2) return;
    let cancelled = false;
    let revert: (() => void) | undefined;

    async function enhance() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled || !el) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();
      mm.add(QUERY, () => {
        el.dataset.pinned = "";
        const stage = el.querySelector<HTMLElement>("[data-stage]")!;
        const media = gsap.utils.toArray<HTMLElement>("[data-media]", el);
        const texts = gsap.utils.toArray<HTMLElement>("[data-step]", el);
        const dots = gsap.utils.toArray<HTMLElement>("[data-dot]", el);
        const n = texts.length;

        gsap.set(media.slice(1), { opacity: 0, scale: 0.96 });
        gsap.set(texts.slice(1), { opacity: 0, y: 32 });
        gsap.set(dots.slice(1), { opacity: 0.35 });

        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: () => `+=${(n - 1) * window.innerHeight * 0.9}`,
            pin: true,
            scrub: 0.6,
            snap: { snapTo: 1 / (n - 1), duration: { min: 0.15, max: 0.4 }, ease: "power1.inOut" },
            invalidateOnRefresh: true,
          },
        });
        for (let i = 1; i < n; i++) {
          const at = i - 1 + 0.25;
          tl.to(texts[i - 1]!, { opacity: 0, y: -32, duration: 0.4 }, at)
            .to(media[i - 1]!, { opacity: 0, scale: 1.04, duration: 0.5 }, at)
            .to(dots[i - 1]!, { opacity: 0.35, duration: 0.3 }, at)
            .to(media[i]!, { opacity: 1, scale: 1, duration: 0.5 }, at)
            .to(texts[i]!, { opacity: 1, y: 0, duration: 0.4 }, at + 0.2)
            .to(dots[i]!, { opacity: 1, duration: 0.3 }, at + 0.2);
        }
        // Keep the last step on screen for a moment before the page moves on.
        tl.to({}, { duration: 0.25 });

        return () => {
          delete el.dataset.pinned;
        };
      });
      revert = () => mm.revert();
    }

    // Only fetch the animation code when the section is about to be seen.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || !window.matchMedia(QUERY).matches) return;
        io.disconnect();
        void enhance();
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      revert?.();
    };
  }, [level, steps.length]);

  return (
    <section ref={root} className="group/story" aria-label={data.heading || "Product story"}>
      <div data-stage className="w-full group-data-[pinned]/story:h-svh">
        {/* GSAP fixes the pinned element's width, so the centred container sits inside it. */}
        <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-10 group-data-[pinned]/story:justify-center group-data-[pinned]/story:pt-28 group-data-[pinned]/story:pb-10 md:py-14">
          {(data.heading || data.intro) && (
            <header className="mb-8 grid max-w-2xl gap-2 group-data-[pinned]/story:mb-6">
              {data.heading && (
                <h2 className="text-2xl font-bold tracking-tight text-balance md:text-3xl">{data.heading}</h2>
              )}
              {data.intro && <p className="text-muted-foreground">{data.intro}</p>}
            </header>
          )}

          <div className="grid gap-10 group-data-[pinned]/story:min-h-0 group-data-[pinned]/story:flex-1 group-data-[pinned]/story:grid-cols-2 group-data-[pinned]/story:items-center">
            {/* Pinned layout only: the pictures stacked on top of each other. */}
            <div className="relative hidden aspect-[4/5] max-h-full w-full overflow-hidden rounded-2xl group-data-[pinned]/story:block">
              {steps.map((step, i) => (
                <div key={i} data-media className="bg-muted absolute inset-0 will-change-transform">
                  <Image
                    src={step.image.url}
                    alt={step.image.alt}
                    fill
                    sizes="(min-width: 1152px) 560px, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-12 group-data-[pinned]/story:gap-0">
              <ol className="grid gap-12 group-data-[pinned]/story:gap-0">
                {steps.map((step, i) => (
                  <li
                    key={i}
                    data-step
                    className="grid items-center gap-5 group-data-[pinned]/story:col-start-1 group-data-[pinned]/story:row-start-1 group-data-[pinned]/story:grid-cols-1 md:grid-cols-2 md:gap-10"
                  >
                    {/* Plain layout only: each step with its own picture. */}
                    <div
                      className={
                        "bg-muted relative aspect-[4/5] overflow-hidden rounded-2xl group-data-[pinned]/story:hidden" +
                        (i % 2 ? " md:order-2" : "")
                      }
                    >
                      <Image
                        src={step.image.url}
                        alt={step.image.alt}
                        fill
                        sizes="(min-width: 1152px) 560px, (min-width: 768px) 50vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="grid content-center gap-3">
                      <p className="text-brand text-sm font-semibold tabular-nums">
                        {String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                      </p>
                      <h3 className="text-xl font-bold tracking-tight text-balance md:text-3xl">{step.title}</h3>
                      {step.text && (
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line md:text-lg">
                          {step.text}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {/* Pinned layout only: which step is showing. */}
              <div className="hidden gap-2 group-data-[pinned]/story:mt-8 group-data-[pinned]/story:flex" aria-hidden>
                {steps.map((_, i) => (
                  <span key={i} data-dot className="bg-brand h-1.5 w-8 rounded-full" />
                ))}
              </div>

              {data.ctaLabel && data.ctaHref && (
                <div className="group-data-[pinned]/story:mt-8">
                  <Link
                    href={data.ctaHref}
                    {...(data.ctaHref.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors"
                  >
                    {data.ctaLabel}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
