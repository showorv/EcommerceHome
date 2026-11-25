import type { SocialNetwork } from "@/modules/storefront/design";

/** Simple outline glyphs for the footer's social links (lucide no longer ships brand icons). */
export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (network) {
    case "facebook":
      return (
        <svg {...common}>
          <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3a5 5 0 0 0 5 5" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common}>
          <path d="M4 20l1.3-4A8 8 0 1 1 8.3 19z" />
          <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" />
        </svg>
      );
  }
}
