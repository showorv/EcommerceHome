import { getImageProps } from "next/image";
import { cn } from "@/lib/utils";

/**
 * A full-bleed background picture with an optional separate phone picture (art direction). Fills its
 * positioned parent. Only the picture for the visitor's screen size is downloaded.
 */
export function ArtImage({
  image,
  mobileImage,
  sizes = "100vw",
  eager = false,
  className,
}: {
  image: { url: string; alt: string };
  mobileImage?: { url: string; alt: string };
  sizes?: string;
  eager?: boolean;
  className?: string;
}) {
  const desktopUrl = image.url || mobileImage?.url || "";
  if (!desktopUrl) return null;
  const common = {
    alt: image.alt || mobileImage?.alt || "",
    sizes,
    fill: true,
    loading: eager ? ("eager" as const) : ("lazy" as const),
    fetchPriority: eager ? ("high" as const) : ("auto" as const),
  };
  const { props: desktop } = getImageProps({ ...common, src: desktopUrl });
  const phoneUrl = mobileImage?.url && mobileImage.url !== desktopUrl ? mobileImage.url : null;
  const phone = phoneUrl ? getImageProps({ ...common, src: phoneUrl }).props : null;
  const { srcSet, ...rest } = desktop;
  return (
    <picture>
      {phone && <source media="(max-width: 767px)" srcSet={phone.srcSet} sizes={phone.sizes} />}
      <source media="(min-width: 768px)" srcSet={srcSet} sizes={rest.sizes} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
      <img {...rest} srcSet={phone ? phone.srcSet : srcSet} className={cn("object-cover", className)} />
    </picture>
  );
}
