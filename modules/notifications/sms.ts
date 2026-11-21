import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { maskPhone } from "@/lib/phone";

/**
 * SMS provider adapter (SRS §8.2, NFR-AV-02). Business logic only talks to `SmsProvider`, so the gateway
 * can be swapped, or a fallback added, without touching callers. The worker sends; the web app only
 * queues (lib/queue.ts).
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<{ provider: string; providerMessageId: string }>;
}

/**
 * A send that failed. `permanent` means trying again with the same provider can't help (bad key, bad
 * number, blocked content), so the job stops retrying; a fallback provider may still be tried.
 */
export class SmsSendError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly permanent: boolean,
    readonly code?: number,
  ) {
    super(message);
    this.name = "SmsSendError";
  }
}

/** Development provider: prints the message to the worker log instead of sending it. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  async send(to: string, text: string) {
    // The text is printed in full on purpose: in development this is how you read OTP codes.
    logger.info({ to: maskPhone(to) }, `[SMS → ${to}] ${text}`);
    return { provider: this.name, providerMessageId: `console-${Date.now()}` };
  }
}

/** Alpha SMS error codes (https://sms.net.bd/api) where retrying the same request can't help. */
const ALPHA_PERMANENT = new Set([400, 403, 405, 410, 411, 413, 414, 415, 416, 420]);
const ALPHA_ERRORS: Record<number, string> = {
  400: "missing or invalid parameter",
  403: "no permission",
  405: "authorization required (check the API key)",
  409: "unknown error at the provider",
  410: "account expired",
  411: "reseller account expired or suspended",
  413: "sender ID not approved",
  414: "message is empty",
  415: "message is too long",
  416: "no valid number",
  417: "insufficient balance",
  420: "content blocked",
};

/**
 * Alpha SMS (sms.net.bd), a BTRC-listed Bangladeshi A2P aggregator. One POST per message; numbers go
 * as 8801XXXXXXXXX. With `senderId` the message uses the approved masking name.
 */
export class AlphaSmsProvider implements SmsProvider {
  readonly name = "alpha";
  constructor(
    private readonly apiKey: string,
    private readonly senderId?: string,
    private readonly endpoint = "https://api.sms.net.bd/sendsms",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, text: string) {
    const body = new URLSearchParams({ api_key: this.apiKey, msg: text, to: to.replace(/^\+/, "") });
    if (this.senderId) body.set("sender_id", this.senderId);

    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      throw new SmsSendError(`Alpha SMS unreachable: ${(err as Error).message}`, this.name, false);
    }
    if (!res.ok) throw new SmsSendError(`Alpha SMS HTTP ${res.status}`, this.name, res.status < 500);

    const data = (await res.json().catch(() => null)) as {
      error?: number | string;
      msg?: string;
      data?: { request_id?: number | string };
    } | null;
    const code = Number(data?.error);
    if (!data || Number.isNaN(code)) throw new SmsSendError("Alpha SMS sent an unreadable answer", this.name, false);
    if (code !== 0) {
      const why = ALPHA_ERRORS[code] ?? data.msg ?? "unknown error";
      throw new SmsSendError(`Alpha SMS error ${code}: ${why}`, this.name, ALPHA_PERMANENT.has(code), code);
    }
    return { provider: this.name, providerMessageId: String(data.data?.request_id ?? "") };
  }
}

/** Tries each provider in turn; the error is permanent only if every provider failed permanently. */
export class FallbackSmsProvider implements SmsProvider {
  readonly name: string;
  constructor(private readonly providers: SmsProvider[]) {
    this.name = providers.map((p) => p.name).join("→");
  }

  async send(to: string, text: string) {
    const errors: SmsSendError[] = [];
    for (const p of this.providers) {
      try {
        return await p.send(to, text);
      } catch (err) {
        const e = err instanceof SmsSendError ? err : new SmsSendError(String(err), p.name, false);
        logger.warn({ provider: p.name, to: maskPhone(to), err: e.message }, "SMS provider failed");
        errors.push(e);
      }
    }
    throw new SmsSendError(
      errors.map((e) => e.message).join("; "),
      this.name,
      errors.every((e) => e.permanent),
    );
  }
}

function build(name: "console" | "alpha"): SmsProvider {
  const e = env();
  if (name === "alpha") return new AlphaSmsProvider(e.ALPHA_SMS_API_KEY!, e.SMS_SENDER_ID);
  return new ConsoleSmsProvider();
}

let cached: SmsProvider | undefined;

/** The configured provider, with the fallback behind it when one is set. */
export function smsProvider(): SmsProvider {
  if (cached) return cached;
  const e = env();
  const main = build(e.SMS_PROVIDER);
  const fallback = e.SMS_FALLBACK_PROVIDER;
  cached = fallback && fallback !== e.SMS_PROVIDER ? new FallbackSmsProvider([main, build(fallback)]) : main;
  return cached;
}
