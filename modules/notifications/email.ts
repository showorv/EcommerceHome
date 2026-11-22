import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * Email provider adapter (SRS §8.3). The worker sends through `emailProvider()`:
 * - "smtp": any SMTP server. Mailpit in development (http://localhost:8025); Amazon SES and Brevo
 *   both give SMTP settings, so they work here too.
 * - "resend": Resend's HTTP API with RESEND_API_KEY.
 */

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
};

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ provider: string; providerMessageId: string }>;
}

/** A send that failed; `permanent` = retrying the same message can't help (bad key, bad address). */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

/**
 * A readable reason. A refused connection to a name with several addresses (localhost = ::1 and
 * 127.0.0.1) is an AggregateError with an empty message, so fall back to its code and inner errors.
 */
export function errorText(err: unknown): string {
  const e = err as { message?: string; code?: string; errors?: unknown[] };
  if (e?.message) return e.message;
  const inner = Array.isArray(e?.errors)
    ? [...new Set(e.errors.map((x) => (x as Error)?.message).filter(Boolean))].join("; ")
    : "";
  return inner || e?.code || String(err) || "unknown error";
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private transporter: Transporter | undefined;

  private transport(): Transporter {
    if (!this.transporter) {
      const e = env();
      this.transporter = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_PORT === 465,
        auth: e.SMTP_USER && e.SMTP_PASS ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
      });
    }
    return this.transporter;
  }

  async send(msg: EmailMessage) {
    try {
      const info = await this.transport().sendMail({ from: env().EMAIL_FROM, ...msg });
      return { provider: this.name, providerMessageId: String(info.messageId ?? "") };
    } catch (err) {
      const code = (err as { responseCode?: number }).responseCode;
      // 5xx SMTP replies (bad address, rejected) won't change on retry; 4xx and network errors may.
      throw new EmailSendError(`SMTP: ${errorText(err)}`, this.name, typeof code === "number" && code >= 500);
    }
  }
}

/** Resend (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint = "https://api.resend.com/emails",
  ) {}

  async send(msg: EmailMessage) {
    const body = {
      from: this.from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
      ...(msg.attachments?.length
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString("base64"),
              content_type: a.contentType,
            })),
          }
        : {}),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new EmailSendError(`Resend unreachable: ${errorText(err)}`, this.name, false);
    }
    const data = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (!res.ok) {
      const why = data?.message ?? `HTTP ${res.status}`;
      // 429 (too many) and 5xx are worth retrying; other 4xx (bad key, bad address) are not.
      throw new EmailSendError(`Resend: ${why}`, this.name, res.status < 500 && res.status !== 429);
    }
    if (!data?.id) throw new EmailSendError("Resend sent an unreadable answer", this.name, false);
    return { provider: this.name, providerMessageId: data.id };
  }
}

let cached: EmailProvider | undefined;

export function emailProvider(): EmailProvider {
  if (cached) return cached;
  const e = env();
  cached =
    e.EMAIL_PROVIDER === "resend" ? new ResendEmailProvider(e.RESEND_API_KEY!, e.EMAIL_FROM) : new SmtpEmailProvider();
  return cached;
}
