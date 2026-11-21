import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";

/**
 * Blocked and flagged numbers (FR-AD-06, SRS §7 "blockedContacts"). Pure and browser-safe.
 * A blocked number can't get a checkout code or place an order; a flagged one can, and the order's
 * risk score shows staff why.
 */

export const BLOCK_KINDS = ["block", "flag"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK_KIND_NAMES: Record<BlockKind, string> = { block: "Blocked", flag: "Flagged" };

export type BlockedContact = {
  id: string;
  phone: string;
  kind: BlockKind;
  reason: string;
  byName: string;
  createdAt: string;
};

export const blockInput = z.object({
  phone: z
    .string({ error: "Enter the mobile number" })
    .trim()
    .transform((v, ctx) => {
      const p = normalizeBdPhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Enter a Bangladeshi mobile number, like 01712345678" });
        return z.NEVER;
      }
      return p;
    }),
  kind: z.enum(BLOCK_KINDS, { error: "Choose block or flag" }),
  reason: z.string().trim().min(3, "Write why, so other staff know").max(200, "Keep it under 200 characters"),
});
export type BlockInput = z.output<typeof blockInput>;

/** What the shopper reads when their number is blocked. Plain, and never says why. */
export const BLOCKED_MESSAGE = "Sorry, we can't take orders from this number online. Please contact us.";
