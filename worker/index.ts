import "./load-env";
import { Worker, type Job } from "bullmq";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { QUEUE_NAMES, type NotificationJob } from "@/lib/queue";
import { bullConnection } from "@/lib/redis";
import { sendEmail } from "@/modules/notifications/email";
import { smsProvider } from "@/modules/notifications/sms";

/**
 * Background worker (SRS §6.1). Run with `pnpm worker`.
 * Phase 0: notifications (SMS + email). Later phases add PDF invoices, courier booking,
 * image processing and scheduled tasks as more queues.
 */
env(); // fail fast on bad configuration

async function handleNotification(job: Job<NotificationJob>) {
  const data = job.data;
  if (data.kind === "sms") {
    const res = await smsProvider().send(data.to, data.text);
    return { provider: smsProvider().name, ...res };
  }
  const res = await sendEmail({ to: data.to, subject: data.subject, text: data.text, html: data.html });
  return { provider: "smtp", ...res };
}

const workers = [
  new Worker<NotificationJob>(QUEUE_NAMES.notifications, handleNotification, {
    connection: bullConnection(),
    concurrency: 10,
  }),
];

for (const w of workers) {
  w.on("completed", (job) => logger.info({ queue: w.name, jobId: job.id, kind: job.name }, "job completed"));
  w.on("failed", (job, err) =>
    logger.warn(
      { queue: w.name, jobId: job?.id, kind: job?.name, attempt: job?.attemptsMade, err: err.message },
      "job failed",
    ),
  );
}

logger.info({ queues: workers.map((w) => w.name) }, "worker started");

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
