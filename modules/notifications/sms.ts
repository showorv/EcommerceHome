import { logger } from "@/lib/logger";
import { maskPhone } from "@/lib/phone";

/**
 * SMS provider adapter (SRS §8). Business logic only talks to this interface, so a
 * BTRC-listed provider (and a fallback) can be plugged in during Phase 2 without
 * touching callers.
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<{ providerMessageId: string }>;
}

/** Development provider: prints the message to the worker log instead of sending it. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  async send(to: string, text: string) {
    // The text is printed in full on purpose: in development this is how you read OTP codes.
    logger.info({ to: maskPhone(to) }, `[SMS → ${to}] ${text}`);
    return { providerMessageId: `console-${Date.now()}` };
  }
}

export function smsProvider(): SmsProvider {
  // Phase 2 adds real providers selected from the integrations settings.
  return new ConsoleSmsProvider();
}
