import { Queue } from "bullmq";
import { bullConnection } from "@/lib/redis";

/**
 * Background job queues (NFR-SC-05). The web app only enqueues; the worker process
 * (worker/index.ts) does the slow work. Jobs retry with exponential back-off, and failed
 * jobs are kept (the "dead-letter list") so staff can see and retry them in admin.
 */
export const QUEUE_NAMES = { notifications: "notifications", orders: "orders" } as const;

/**
 * One SMS or email. `logId` is its row in the message log (modules/notifications), which the worker
 * updates after each try. Emails are laid out by the worker (React Email); `attachInvoiceId` adds
 * that invoice's PDF. Queue messages with `queueMessage()` in modules/notifications/send.ts.
 */
export type NotificationJob =
  | { kind: "sms"; to: string; text: string; purpose: string; logId?: string }
  | {
      kind: "email";
      to: string;
      subject: string;
      text: string;
      /** Ready-made HTML (older jobs); otherwise the worker lays the text out. */
      html?: string;
      button?: { label: string; url: string } | null;
      purpose: string;
      logId?: string;
      attachInvoiceId?: string | null;
    };

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5_000 },
  removeOnFail: false,
} as const;

const g = globalThis as unknown as { __queues?: Map<string, Queue> };
const queues = (g.__queues ??= new Map());

export function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: bullConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(name, q);
  }
  return q;
}

/**
 * Login and checkout codes (purpose "otp", "password_reset_otp", "checkout_otp"…) go first and give up
 * fast: a code that arrives after it expired (5 minutes) is useless. They are also not kept once sent,
 * so the code doesn't sit in Redis.
 */
export const OTP_JOB_OPTIONS = {
  priority: 1,
  attempts: 3,
  backoff: { type: "fixed", delay: 3_000 },
  removeOnComplete: true,
  removeOnFail: { age: 3600 },
} as const;

export const isOtpPurpose = (purpose: string) => /(^|_)otp$/.test(purpose);

/** Jobs on the orders queue. */
export const ORDER_JOBS = {
  releaseReservations: "release-reservations",
  invoicePdf: "invoice-pdf",
  metaEvent: "meta-event",
} as const;

/** Prints an invoice's PDF in the worker (FR-OR-03), so it is ready before anyone opens the link. */
export function enqueueInvoicePdf(invoiceId: string) {
  return getQueue(QUEUE_NAMES.orders).add(ORDER_JOBS.invoicePdf, { invoiceId }, { attempts: 3 });
}

export function enqueueNotification(job: NotificationJob) {
  const opts = isOtpPurpose(job.purpose) ? OTP_JOB_OPTIONS : undefined;
  return getQueue(QUEUE_NAMES.notifications).add(job.kind, job, opts);
}

/**
 * One server-side event for Meta's Conversions API (FR-AD-13), sent by the worker. Customer details
 * are already hashed (SHA-256) when queued; the access key is read by the worker, never queued.
 */
export type MetaEventJob = {
  eventName: string;
  eventId: string;
  /** Seconds since 1970. */
  eventTime: number;
  eventSourceUrl: string;
  userData: Record<string, string | string[]>;
  customData: Record<string, unknown>;
};

export function enqueueMetaEvent(job: MetaEventJob) {
  return getQueue(QUEUE_NAMES.orders).add(ORDER_JOBS.metaEvent, job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 24 * 3600 },
  });
}
