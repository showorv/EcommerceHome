import {
  DM_Sans,
  Hind_Siliguri,
  Inter,
  Manrope,
  Noto_Sans_Bengali,
  Nunito,
  Outfit,
  Plus_Jakarta_Sans,
  Poppins,
} from "next/font/google";

/**
 * The fonts the theme editor offers (FR-SF-03), bundled at build time and self-hosted. Each sets a
 * `--ff-<id>` variable; the theme points --font-sans-latin / --font-heading / --font-bangla at one.
 * Only the defaults are preloaded; browsers download the others only if the theme uses them.
 * Keep the ids in sync with FONTS / BANGLA_FONTS in modules/storefront/design.ts.
 */
const jakarta = Plus_Jakarta_Sans({ variable: "--ff-jakarta", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--ff-inter", subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({
  variable: "--ff-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  preload: false,
});
const dmSans = DM_Sans({ variable: "--ff-dmSans", subsets: ["latin"], display: "swap", preload: false });
const manrope = Manrope({ variable: "--ff-manrope", subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ variable: "--ff-nunito", subsets: ["latin"], display: "swap", preload: false });
const outfit = Outfit({ variable: "--ff-outfit", subsets: ["latin"], display: "swap", preload: false });
const hind = Hind_Siliguri({
  variable: "--ff-hind",
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const notoBengali = Noto_Sans_Bengali({
  variable: "--ff-notoBengali",
  subsets: ["bengali"],
  display: "swap",
  preload: false,
});

export const FONT_VARIABLES = [jakarta, inter, poppins, dmSans, manrope, nunito, outfit, hind, notoBengali]
  .map((f) => f.variable)
  .join(" ");
