import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * Email adapter. In development SMTP points to Mailpit (http://localhost:8025).
 * In production the same SMTP settings can point at Resend / SES / Brevo SMTP,
 * or a provider-specific adapter can replace this in Phase 2.
 */
export type EmailMessage = { to: string; subject: string; text: string; html?: string };

let transporter: Transporter | undefined;

function transport(): Transporter {
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: e.SMTP_USER && e.SMTP_PASS ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(msg: EmailMessage): Promise<{ providerMessageId: string }> {
  const info = await transport().sendMail({ from: env().EMAIL_FROM, ...msg });
  return { providerMessageId: info.messageId };
}
