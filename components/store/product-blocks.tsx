import { Check } from "lucide-react";
import Image from "next/image";
import type { DetailBlock } from "@/modules/catalog/storefront";
import { YouTubeEmbed } from "./youtube-embed";

/**
 * Rich description blocks (FR-PD-03): text, image, video, specs, "what's in the box", comparison table.
 * Text is shown as plain text with line breaks kept, never as HTML, so nothing typed in the admin can
 * inject code into the page.
 */
export function ProductBlocks({ blocks, title }: { blocks: DetailBlock[]; title: string }) {
  if (blocks.length === 0) return null;
  return (
    <div className="grid gap-10">
      {blocks.map((b) => (
        <section key={b.id} aria-label={"heading" in b && b.heading ? undefined : blockLabel(b)}>
          <Block block={b} title={title} />
        </section>
      ))}
    </div>
  );
}

function blockLabel(b: DetailBlock) {
  return b.type === "image" ? "Photo" : b.type === "video" ? "Video" : "Details";
}

function Heading({ children }: { children: string }) {
  return children ? <h2 className="mb-3 text-xl font-bold tracking-tight">{children}</h2> : null;
}

function Block({ block: b, title }: { block: DetailBlock; title: string }) {
  switch (b.type) {
    case "text":
      return (
        <>
          <Heading>{b.heading}</Heading>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{b.body}</p>
        </>
      );
    case "image":
      return (
        <figure className="grid gap-2">
          <Image
            src={b.url}
            alt={b.alt || title}
            width={1200}
            height={800}
            sizes="(min-width: 1024px) 720px, 100vw"
            className="bg-muted h-auto w-full rounded-lg"
          />
          {b.caption && <figcaption className="text-muted-foreground text-center text-sm">{b.caption}</figcaption>}
        </figure>
      );
    case "video":
      return (
        <figure className="grid gap-2">
          {b.youtubeId ? (
            <YouTubeEmbed id={b.youtubeId} title={b.caption || title} />
          ) : (
            <video
              src={b.url}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full rounded-lg bg-black"
              aria-label={b.caption || `${title} video`}
            />
          )}
          {b.caption && <figcaption className="text-muted-foreground text-center text-sm">{b.caption}</figcaption>}
        </figure>
      );
    case "specs":
      return (
        <>
          <Heading>{b.heading}</Heading>
          <SpecsTable rows={b.rows} />
        </>
      );
    case "inBox":
      return (
        <>
          <Heading>{b.heading}</Heading>
          <ul className="grid gap-2 sm:grid-cols-2">
            {b.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      );
    case "comparison":
      return (
        <>
          <Heading>{b.heading}</Heading>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="p-3 text-left font-medium">
                    <span className="sr-only">Feature</span>
                  </th>
                  {b.columns.map((c, i) => (
                    <th key={i} scope="col" className="p-3 text-left font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <th scope="row" className="text-muted-foreground p-3 text-left font-normal">
                      {r.label}
                    </th>
                    {b.columns.map((_, j) => (
                      <td key={j} className="p-3">
                        {r.values[j] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
  }
}

export function SpecsTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y overflow-hidden rounded-lg border text-sm">
      {rows.map((r, i) => (
        <div key={i} className="even:bg-muted/40 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 p-3">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
