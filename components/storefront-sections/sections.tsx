import {
  BadgeCheck,
  Banknote,
  ChevronDown,
  Clock,
  Gift,
  Headphones,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal, staggerStyle } from "@/components/motion/reveal";
import { ProductGrid } from "@/components/store/product-grid";
import { YouTubeEmbed } from "@/components/store/youtube-embed";
import { cn } from "@/lib/utils";
import { youtubeId } from "@/modules/catalog/media-rules";
import { jsonLdString } from "@/modules/catalog/seo";
import { getCategoryTiles, getSectionProducts } from "@/modules/storefront/section-data";
import type { Section, SectionOf } from "@/modules/storefront/sections";
import { ArtImage } from "./art-image";
import { HeroSlider } from "./hero-slider";
import { NewsletterForm } from "./newsletter-form";
import { ProductRail } from "./product-rail";
import { StorySection } from "./story-section";

/**
 * Renders a page built in the admin storefront builder (FR-SF-01). Sections arrive already filtered
 * to the ones that are live; "phone only" / "desktop only" is done with CSS so cached pages stay the
 * same for everyone.
 */
export function Sections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <div
          key={s.id}
          data-section={s.type}
          className={cn(s.devices === "mobile" && "md:hidden", s.devices === "desktop" && "hidden md:block")}
        >
          <SectionView section={s} first={i === 0} />
        </div>
      ))}
    </>
  );
}

function SectionView({ section: s, first }: { section: Section; first: boolean }) {
  switch (s.type) {
    case "hero":
      return <Hero s={s} first={first} />;
    case "categoryGrid":
      return <CategoryGrid s={s} />;
    case "productCarousel":
      return <Products s={s} />;
    case "banner":
      return <Banner s={s} first={first} />;
    case "video":
      return <VideoBanner s={s} />;
    case "usp":
      return <Usp s={s} />;
    case "testimonials":
      return <Testimonials s={s} />;
    case "faq":
      return <Faq s={s} />;
    case "newsletter":
      return <Newsletter s={s} />;
    case "richText":
      return <RichText s={s} />;
    case "story":
      return <StorySection data={s.data} />;
  }
}

// ---------- Shared bits ----------

const Wrap = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cn("mx-auto max-w-7xl px-4 py-10 md:py-14", className)}>{children}</section>
);

function Heading({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  if (!title && !sub && !action) return null;
  return (
    <Reveal className="mb-6 flex items-end justify-between gap-4">
      <div className="grid gap-1">
        {title && <h2 className="text-2xl font-bold tracking-tight text-balance md:text-3xl">{title}</h2>}
        {sub && <p className="text-muted-foreground max-w-2xl">{sub}</p>}
      </div>
      {action}
    </Reveal>
  );
}

function Cta({
  label,
  href,
  variant = "solid",
  theme = "light",
}: {
  label: string;
  href: string;
  variant?: "solid" | "outline";
  theme?: "dark" | "light";
}) {
  if (!label || !href) return null;
  const external = href.startsWith("https://");
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors",
        variant === "solid" && "bg-brand text-brand-foreground hover:bg-brand/90",
        variant === "outline" && theme === "dark" && "border border-white/60 text-white hover:bg-white/10",
        variant === "outline" && theme === "light" && "border-foreground/20 hover:bg-accent border",
      )}
    >
      {label}
    </Link>
  );
}

// ---------- Hero ----------

function Hero({ s, first }: { s: SectionOf<"hero">; first: boolean }) {
  const { slides, autoplaySeconds, height, parallax } = s.data;
  const rendered = slides.map((slide, i) => {
    const dark = slide.theme === "dark";
    const hasImage = Boolean(slide.image.url || slide.mobileImage.url);
    return (
      <div
        key={i}
        className={cn(
          "relative isolate flex items-center overflow-hidden",
          height === "tall" ? "min-h-[520px] md:min-h-[640px]" : "min-h-[400px] md:min-h-[480px]",
          dark ? "bg-neutral-900 text-white" : "bg-muted text-foreground",
          parallax && "parallax-scope",
        )}
      >
        {/* While scrolling, the picture drifts and the text eases away (CSS only; see "Scroll motion" in
            globals.css). The text also rises in when the page opens (hero-enter). */}
        <div className={cn("absolute inset-0 -z-10", parallax && hasImage && "parallax")}>
          <ArtImage image={slide.image} mobileImage={slide.mobileImage} eager={first && i === 0} />
        </div>
        {hasImage && (
          <div
            aria-hidden
            className={cn(
              "absolute inset-0",
              slide.align === "center"
                ? dark
                  ? "bg-black/45"
                  : "bg-white/60"
                : dark
                  ? "bg-gradient-to-r from-black/75 via-black/45 to-black/5"
                  : "bg-gradient-to-r from-white/85 via-white/50 to-white/0",
            )}
          />
        )}
        <div
          className={cn(
            "hero-enter relative mx-auto grid w-full max-w-7xl gap-4 px-4 py-16",
            parallax && "hero-scroll",
            slide.align === "center" && "justify-items-center text-center",
          )}
        >
          {slide.eyebrow && (
            <p
              className={cn(
                "w-fit rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
                dark ? "bg-white/15 text-white" : "bg-background/80",
              )}
            >
              {slide.eyebrow}
            </p>
          )}
          {slide.heading &&
            (first && i === 0 ? (
              <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
                {slide.heading}
              </h1>
            ) : (
              <h2 className="max-w-2xl text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
                {slide.heading}
              </h2>
            ))}
          {slide.text && (
            <p className={cn("max-w-xl text-lg whitespace-pre-line", dark ? "text-white/85" : "text-muted-foreground")}>
              {slide.text}
            </p>
          )}
          {(slide.ctaLabel || slide.cta2Label) && (
            <div className="mt-2 flex flex-wrap gap-3">
              <Cta label={slide.ctaLabel} href={slide.ctaHref} />
              <Cta label={slide.cta2Label} href={slide.cta2Href} variant="outline" theme={slide.theme} />
            </div>
          )}
        </div>
      </div>
    );
  });
  if (rendered.length === 1) return <section aria-label="Highlight">{rendered[0]}</section>;
  return <HeroSlider slides={rendered} labels={slides.map((sl) => sl.heading)} autoplaySeconds={autoplaySeconds} />;
}

// ---------- Category grid ----------

async function CategoryGrid({ s }: { s: SectionOf<"categoryGrid"> }) {
  const tiles = await getCategoryTiles(s.data.categoryIds);
  if (!tiles.length) return null;
  const circles = s.data.style === "circles";
  return (
    <Wrap>
      <Heading title={s.data.heading} sub={s.data.subheading} />
      <ul
        className={cn(
          circles
            ? "-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:justify-center md:px-0"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4",
        )}
      >
        {tiles.map((c) => (
          <li key={c.slug} className={cn(circles && "w-24 shrink-0 snap-start md:w-28")}>
            <Link href={`/c/${c.slug}`} className="group grid gap-2 text-center">
              <span
                className={cn(
                  "bg-muted relative block overflow-hidden",
                  circles ? "aspect-square rounded-full" : "aspect-[4/3] rounded-xl",
                )}
              >
                {c.image && (
                  <Image
                    src={c.image}
                    alt=""
                    fill
                    sizes={circles ? "112px" : "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"}
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </span>
              <span className="text-sm font-semibold group-hover:underline">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Wrap>
  );
}

// ---------- Products ----------

async function Products({ s }: { s: SectionOf<"productCarousel"> }) {
  const { products, viewAllHref } = await getSectionProducts(s.data);
  if (!products.length) return null;
  const title = s.data.heading || "Products";
  return (
    <Wrap>
      <Heading
        title={s.data.heading}
        sub={s.data.subheading}
        action={
          s.data.showViewAll && viewAllHref ? (
            <Link href={viewAllHref} className="text-brand shrink-0 text-sm font-semibold hover:underline">
              View all
            </Link>
          ) : null
        }
      />
      {s.data.layout === "carousel" ? (
        <ProductRail products={products} label={title} />
      ) : (
        <ProductGrid products={products} />
      )}
    </Wrap>
  );
}

// ---------- Banner ----------

function Banner({ s, first }: { s: SectionOf<"banner">; first: boolean }) {
  const d = s.data;
  const dark = d.theme === "dark";
  const hasImage = Boolean(d.image.url || d.mobileImage.url);
  const content = (
    <div className={cn("grid gap-3", d.layout === "full" && "max-w-xl")}>
      {d.heading && <h2 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{d.heading}</h2>}
      {d.text && (
        <p className={cn("whitespace-pre-line", dark ? "text-white/85" : "text-muted-foreground")}>{d.text}</p>
      )}
      {d.ctaLabel && (
        <div className="mt-2">
          <Cta label={d.ctaLabel} href={d.ctaHref} />
        </div>
      )}
    </div>
  );
  if (d.layout === "split") {
    return (
      <Wrap>
        <Reveal
          className={cn(
            "grid overflow-hidden rounded-2xl md:grid-cols-2",
            dark ? "bg-neutral-900 text-white" : "bg-muted",
          )}
        >
          <div className="bg-muted relative aspect-[4/3] md:aspect-auto md:min-h-[360px]">
            <ArtImage
              image={d.image}
              mobileImage={d.mobileImage}
              sizes="(min-width: 768px) 50vw, 100vw"
              eager={first}
            />
          </div>
          <div className="flex items-center p-8 md:p-12">{content}</div>
        </Reveal>
      </Wrap>
    );
  }
  return (
    <Wrap>
      <Reveal
        className={cn(
          "relative isolate flex min-h-[280px] items-center overflow-hidden rounded-2xl p-8 md:min-h-[360px] md:p-12",
          dark ? "bg-neutral-900 text-white" : "bg-muted",
        )}
      >
        <ArtImage
          image={d.image}
          mobileImage={d.mobileImage}
          sizes="(min-width: 1152px) 1120px, 100vw"
          eager={first}
          className="-z-10"
        />
        {hasImage && (
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 -z-10",
              dark ? "bg-gradient-to-r from-black/70 to-black/10" : "bg-gradient-to-r from-white/85 to-white/10",
            )}
          />
        )}
        {content}
      </Reveal>
    </Wrap>
  );
}

// ---------- Video ----------

function VideoBanner({ s }: { s: SectionOf<"video"> }) {
  const d = s.data;
  const yt = youtubeId(d.url);
  const hasText = Boolean(d.heading || d.text || d.ctaLabel);
  if (yt) {
    return (
      <Wrap>
        <Heading title={d.heading} sub={d.text} action={<Cta label={d.ctaLabel} href={d.ctaHref} />} />
        <Reveal className="overflow-hidden rounded-2xl">
          <YouTubeEmbed id={yt} title={d.heading || "Video"} />
        </Reveal>
      </Wrap>
    );
  }
  return (
    <Wrap>
      <Reveal className="relative isolate flex min-h-[320px] items-end overflow-hidden rounded-2xl bg-neutral-900 text-white md:min-h-[440px]">
        <video
          src={d.url}
          poster={d.poster.url || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={d.poster.alt || d.heading || "Video"}
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        {hasText && (
          <>
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-transparent"
            />
            <div className="grid max-w-xl gap-3 p-8 md:p-12">
              {d.heading && (
                <h2 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{d.heading}</h2>
              )}
              {d.text && <p className="whitespace-pre-line text-white/85">{d.text}</p>}
              {d.ctaLabel && (
                <div className="mt-2">
                  <Cta label={d.ctaLabel} href={d.ctaHref} />
                </div>
              )}
            </div>
          </>
        )}
      </Reveal>
    </Wrap>
  );
}

// ---------- Why buy from us ----------

const ICONS: Record<SectionOf<"usp">["data"]["items"][number]["icon"], LucideIcon> = {
  truck: Truck,
  cash: Banknote,
  shield: ShieldCheck,
  refund: RotateCcw,
  support: Headphones,
  star: BadgeCheck,
  gift: Gift,
  clock: Clock,
};

function Usp({ s }: { s: SectionOf<"usp"> }) {
  return (
    <Wrap className="py-8 md:py-10">
      <ul className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {s.data.items.map((item, i) => {
          const Icon = ICONS[item.icon] ?? Truck;
          return (
            <li key={i} className="reveal bg-muted/50 flex items-start gap-3 rounded-xl p-4" style={staggerStyle(i)}>
              <span className="bg-brand/10 text-brand grid size-10 shrink-0 place-items-center rounded-full">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold">{item.title}</span>
                {item.text && <span className="text-muted-foreground text-xs">{item.text}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Wrap>
  );
}

// ---------- Testimonials ----------

function Testimonials({ s }: { s: SectionOf<"testimonials"> }) {
  return (
    <Wrap>
      <Heading title={s.data.heading} />
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {s.data.items.map((t, i) => (
          <li key={i} className="w-[85%] shrink-0 snap-start md:w-auto">
            <figure className="bg-card grid h-full gap-4 rounded-2xl border p-6">
              <div className="flex gap-0.5" role="img" aria-label={`${t.rating} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, k) => (
                  <Star
                    key={k}
                    aria-hidden
                    className={cn(
                      "size-4",
                      k < t.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                    )}
                  />
                ))}
              </div>
              <blockquote className="leading-relaxed whitespace-pre-line">“{t.text}”</blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                {t.avatar.url ? (
                  <Image
                    src={t.avatar.url}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="bg-brand/10 text-brand grid size-10 place-items-center rounded-full font-semibold"
                  >
                    {t.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="grid text-sm">
                  <span className="font-semibold">{t.name}</span>
                  {t.location && <span className="text-muted-foreground text-xs">{t.location}</span>}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Wrap>
  );
}

// ---------- FAQ ----------

function Faq({ s }: { s: SectionOf<"faq"> }) {
  const items = s.data.items.filter((f) => f.q);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items
      .filter((f) => f.a)
      .map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <Wrap className="max-w-3xl">
      <Heading title={s.data.heading} />
      <div className="divide-y rounded-2xl border">
        {items.map((f, i) => (
          <details key={i} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown
                aria-hidden
                className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            {f.a && <p className="text-muted-foreground pb-5 leading-relaxed whitespace-pre-line">{f.a}</p>}
          </details>
        ))}
      </div>
      {jsonLd.mainEntity.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      )}
    </Wrap>
  );
}

// ---------- Newsletter ----------

function Newsletter({ s }: { s: SectionOf<"newsletter"> }) {
  return (
    <Wrap>
      <Reveal className="bg-muted/60 grid justify-items-center gap-4 rounded-2xl px-6 py-12 text-center">
        {s.data.heading && <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{s.data.heading}</h2>}
        {s.data.text && <p className="text-muted-foreground max-w-lg">{s.data.text}</p>}
        <NewsletterForm buttonLabel={s.data.buttonLabel} note={s.data.note} />
      </Reveal>
    </Wrap>
  );
}

// ---------- Text ----------

function RichText({ s }: { s: SectionOf<"richText"> }) {
  if (!s.data.heading && !s.data.body) return null;
  return (
    <Wrap className={cn("max-w-3xl", s.data.align === "center" && "text-center")}>
      {s.data.heading && <h2 className="mb-4 text-2xl font-bold tracking-tight md:text-3xl">{s.data.heading}</h2>}
      {s.data.body && <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{s.data.body}</p>}
    </Wrap>
  );
}
