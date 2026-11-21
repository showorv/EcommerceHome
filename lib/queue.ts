import { Queue } from "bullmq";
import { bullConnection } from "@/lib/redis";

/**
 * Background job queues (NFR-SC-05). The web app only enqueues; the worker process
 * (worker/index.ts) does the slow work. Jobs retry with exponential back-off, and failed
 * jobs are kept (the "dead-letter list") so staff can see and retry them in admin.
 */
export const QUEUE_NAMES = { notifications: "notifications" } as const;

export type NotificationJob =
  | { kind: "sms"; to: string; text: string; purpose: string }
  | { kind: "email"; to: string; subject: string; text: string; html?: string; purpose: string };

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

export function enqueueNotification(job: NotificationJob) {
  const opts = isOtpPurpose(job.purpose) ? OTP_JOB_OPTIONS : undefined;
  return getQueue(QUEUE_NAMES.notifications).add(job.kind, job, opts);
}
