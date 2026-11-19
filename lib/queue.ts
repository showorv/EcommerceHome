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

export function enqueueNotification(job: NotificationJob) {
  return getQueue(QUEUE_NAMES.notifications).add(job.kind, job);
}
