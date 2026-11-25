import { Breadcrumbs } from "@/components/store/breadcrumbs";
import type { CmsContent } from "@/modules/cms/blocks";
import type { Design } from "@/modules/storefront/design";
import { CmsBlocks } from "./cms-blocks";

/** A CMS page as the store shows it: breadcrumbs, title, the blocks and when it was last updated. */
export function CmsPageView({
  content,
  footer,
  updatedAt,
}: {
  content: CmsContent;
  footer: Design["navigation"]["footer"];
  updatedAt: string | null;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-4 pb-16">
      <Breadcrumbs
        crumbs={[
          { name: "Home", path: "/" },
          { name: content.title, path: `/pages/${content.slug}` },
        ]}
      />
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-balance md:text-4xl">{content.title}</h1>
      {content.blocks.length ? (
        <CmsBlocks blocks={content.blocks} footer={footer} slug={content.slug} />
      ) : (
        <p className="text-muted-foreground">This page is empty.</p>
      )}
      {updatedAt && (
        <p className="text-muted-foreground mt-12 border-t pt-4 text-xs">
          Last updated{" "}
          <time dateTime={updatedAt}>
            {new Date(updatedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Asia/Dhaka",
            })}
          </time>
        </p>
      )}
    </article>
  );
}
