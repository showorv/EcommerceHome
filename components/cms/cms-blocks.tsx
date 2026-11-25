import { AlertTriangle, CheckCircle2, ChevronDown, Info, Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { SocialIcon } from "@/components/store/shell/social-icons";
import { cn } from "@/lib/utils";
import { jsonLdString } from "@/modules/catalog/seo";
import { parseInline, type Block, type BlockOf } from "@/modules/cms/blocks";
import { SOCIAL_NAMES, type Design } from "@/modules/storefront/design";
import { ContactForm } from "./contact-form";

type Footer = Design["navigation"]["footer"];

/**
 * Renders a CMS page's blocks (FR-SF-09). Text goes through parseInline, so it becomes React elements
 * only — nothing typed in the admin can turn into HTML. Contact details come from the footer settings
 * in Menus & theme, so they are typed in one place.
 */
export function CmsBlocks({ blocks, footer, slug }: { blocks: Block[]; footer: Footer; slug: string }) {
  return (
    <div className="grid gap-5">
      {blocks.map((b) => (
        <div key={b.id} data-block={b.type}>
          <BlockView block={b} footer={footer} slug={slug} />
        </div>
      ))}
    </div>
  );
}

function BlockView({ block: b, footer, slug }: { block: Block; footer: Footer; slug: string }) {
  switch (b.type) {
    case "heading":
      return b.data.level === "3" ? (
        <h3 className="pt-2 text-lg font-semibold tracking-tight">{b.data.text}</h3>
      ) : (
        <h2 className="pt-4 text-2xl font-bold tracking-tight text-balance">{b.data.text}</h2>
      );
    case "paragraph":
      return <Paragraphs text={b.data.text} />;
    case "list":
      return <List b={b} />;
    case "image":
      return <Picture b={b} />;
    case "callout":
      return <Callout b={b} />;
    case "faq":
      return <Faq b={b} />;
    case "button":
      return <ButtonLink b={b} />;
    case "divider":
      return <hr className="my-2" />;
    case "contactDetails":
      return <ContactDetails heading={b.data.heading} footer={footer} />;
    case "contactForm":
      return <ContactBlock b={b} slug={slug} />;
  }
}

/** **bold**, *italic* and [links](/path) as React elements. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((piece, i) => {
        switch (piece.kind) {
          case "text":
            return <Fragment key={i}>{piece.text}</Fragment>;
          case "bold":
            return (
              <strong key={i} className="text-foreground font-semibold">
                {piece.text}
              </strong>
            );
          case "italic":
            return <em key={i}>{piece.text}</em>;
          case "link": {
            const external = piece.href.startsWith("https://");
            return (
              <Link
                key={i}
                href={piece.href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-brand font-medium underline underline-offset-2 hover:no-underline"
              >
                {piece.text}
              </Link>
            );
          }
        }
      })}
    </>
  );
}

/** A blank line starts a new paragraph; a single line break stays a line break. */
function Paragraphs({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground grid gap-4 leading-relaxed">
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          <InlineText text={para.trim()} />
        </p>
      ))}
    </div>
  );
}

function List({ b }: { b: BlockOf<"list"> }) {
  const items = b.data.items.filter(Boolean);
  const Tag = b.data.style === "number" ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "text-muted-foreground grid gap-2 pl-6 leading-relaxed",
        b.data.style === "number"
          ? "marker:text-foreground list-decimal marker:font-semibold"
          : "marker:text-brand list-disc",
      )}
    >
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          <InlineText text={item} />
        </li>
      ))}
    </Tag>
  );
}

function Picture({ b }: { b: BlockOf<"image"> }) {
  const { image, caption, width } = b.data;
  return (
    <figure className={cn("grid gap-2", width === "wide" && "md:-mx-16")}>
      <Image
        src={image.url}
        alt={image.alt}
        width={1200}
        height={800}
        sizes={width === "wide" ? "(min-width: 768px) 896px, 100vw" : "(min-width: 768px) 768px, 100vw"}
        className="bg-muted h-auto w-full rounded-2xl object-cover"
      />
      {caption && <figcaption className="text-muted-foreground text-center text-sm">{caption}</figcaption>}
    </figure>
  );
}

const TONES = {
  info: { icon: Info, box: "border-sky-500/30 bg-sky-500/10", icon_: "text-sky-600 dark:text-sky-400" },
  warning: {
    icon: AlertTriangle,
    box: "border-amber-500/40 bg-amber-500/10",
    icon_: "text-amber-600 dark:text-amber-400",
  },
  success: {
    icon: CheckCircle2,
    box: "border-emerald-500/30 bg-emerald-500/10",
    icon_: "text-emerald-600 dark:text-emerald-400",
  },
} as const;

function Callout({ b }: { b: BlockOf<"callout"> }) {
  const tone = TONES[b.data.tone];
  const Icon = tone.icon;
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4 leading-relaxed", tone.box)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone.icon_)} aria-hidden />
      <p className="whitespace-pre-line">
        <InlineText text={b.data.text} />
      </p>
    </div>
  );
}

function Faq({ b }: { b: BlockOf<"faq"> }) {
  const items = b.data.items.filter((f) => f.q);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items
      .filter((f) => f.a)
      .map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: parseInline(f.a)
            .map((p) => p.text)
            .join(""),
        },
      })),
  };
  return (
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
          {f.a && (
            <p className="text-muted-foreground pb-5 leading-relaxed whitespace-pre-line">
              <InlineText text={f.a} />
            </p>
          )}
        </details>
      ))}
      {jsonLd.mainEntity.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      )}
    </div>
  );
}

function ButtonLink({ b }: { b: BlockOf<"button"> }) {
  const external = b.data.href.startsWith("https://");
  return (
    <div>
      <Link
        href={b.data.href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors",
          b.data.style === "solid"
            ? "bg-brand text-brand-foreground hover:bg-brand/90"
            : "border-foreground/20 hover:bg-accent border",
        )}
      >
        {b.data.label}
      </Link>
    </div>
  );
}

function ContactDetails({ heading, footer: f }: { heading: string; footer: Footer }) {
  const rows = [
    f.phone && { icon: Phone, label: "Call us", value: f.phone, href: `tel:${f.phone.replace(/[^\d+]/g, "")}` },
    f.email && { icon: Mail, label: "Email", value: f.email, href: `mailto:${f.email}` },
    f.address && { icon: MapPin, label: "Address", value: f.address, href: "" },
  ].filter((r): r is { icon: typeof Phone; label: string; value: string; href: string } => Boolean(r));
  if (!rows.length && !f.social.length) return null;
  return (
    <section className="bg-muted/40 grid gap-4 rounded-2xl border p-5">
      {heading && <h2 className="text-lg font-semibold">{heading}</h2>}
      {rows.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((r) => {
            const Icon = r.icon;
            const body = (
              <>
                <span className="bg-background text-brand grid size-10 shrink-0 place-items-center rounded-full border">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="grid">
                  <span className="text-muted-foreground text-xs">{r.label}</span>
                  <span className="font-medium break-words whitespace-pre-line">{r.value}</span>
                </span>
              </>
            );
            return (
              <li key={r.label}>
                {r.href ? (
                  <a href={r.href} className="hover:text-brand flex items-start gap-3">
                    {body}
                  </a>
                ) : (
                  <div className="flex items-start gap-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {f.social.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {f.social.map((s) => (
            <li key={s.network}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={SOCIAL_NAMES[s.network]}
                className="bg-background hover:text-brand grid size-10 place-items-center rounded-full border transition-colors"
              >
                <SocialIcon network={s.network} className="size-5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContactBlock({ b, slug }: { b: BlockOf<"contactForm">; slug: string }) {
  return (
    <section className="grid gap-4 rounded-2xl border p-5">
      {(b.data.heading || b.data.text) && (
        <div className="grid gap-1">
          {b.data.heading && <h2 className="text-lg font-semibold">{b.data.heading}</h2>}
          {b.data.text && <p className="text-muted-foreground text-sm">{b.data.text}</p>}
        </div>
      )}
      <ContactForm page={slug} />
    </section>
  );
}
