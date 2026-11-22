import "./load-env";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getQueue, ORDER_JOBS, QUEUE_NAMES, type NotificationJob } from "@/lib/queue";
import { bullConnection } from "@/lib/redis";
import { productTags, scopeOfProducts } from "@/modules/catalog/product-tags";
import { ensureInvoicePdf } from "@/modules/invoices/pdf";
import { sendEmail } from "@/modules/notifications/email";
import { smsProvider, SmsSendError } from "@/modules/notifications/sms";
import { releaseExpiredReservations } from "@/modules/orders/reservations";
import { revalidateStore } from "./revalidate";

/**
 * Background worker (SRS §6.1). Run with `pnpm worker`.
 * Queues: notifications (SMS + email) and orders (scheduled: stock held by orders not confirmed in
 * time goes back on sale, FR-CO-07; and invoice PDFs, FR-OR-03). Later phases add courier booking and
 * image work.
 */
env(); // fail fast on bad configuration

async function handleNotification(job: Job<NotificationJob>) {
  const data = job.data;
  if (data.kind === "sms") {
    try {
      return await smsProvider().send(data.to, data.text);
    } catch (err) {
      // A bad key, number or text won't get better by retrying: stop now, keep the job in the failed list.
      if (err instanceof SmsSendError && err.permanent) throw new UnrecoverableError(err.message);
      throw err;
    }
  }
  const res = await sendEmail({ to: data.to, subject: data.subject, text: data.text, html: data.html });
  return { provider: "smtp", ...res };
}

const RELEASE_JOB = ORDER_JOBS.releaseReservations;

async function handleOrders(job: Job) {
  if (job.name === ORDER_JOBS.invoicePdf) {
    const id = String((job.data as { invoiceId?: unknown }).invoiceId ?? "");
    if (!/^[a-f0-9]{24}$/.test(id)) throw new UnrecoverableError("invoice-pdf job without an invoice id");
    const res = await ensureInvoicePdf(id);
    if (!res) throw new UnrecoverableError(`Invoice ${id} not found`);
    return { invoiceNo: res.invoiceNo, bytes: res.pdf.length };
  }
  if (job.name !== RELEASE_JOB) throw new UnrecoverableError(`Unknown orders job: ${job.name}`);
  const res = await releaseExpiredReservations();
  if (res.orderNos.length > 0) {
    logger.info({ orders: res.orderNos }, "stock released from orders not confirmed in time");
    // Products back in stock: their store pages are rebuilt.
    await revalidateStore(await productTags(await scopeOfProducts(res.productIds)));
  }
  return { released: res.orderNos.length };
}

const workers = [
  new Worker<NotificationJob>(QUEUE_NAMES.notifications, handleNotification, {
    connection: bullConnection(),
    concurrency: 10,
  }),
  new Worker(QUEUE_NAMES.orders, handleOrders, { connection: bullConnection(), concurrency: 1 }),
];

// Every 5 minutes. Upserting keeps one schedule however often the worker restarts.
getQueue(QUEUE_NAMES.orders)
  .upsertJobScheduler(
    RELEASE_JOB,
    { every: 5 * 60_000 },
    { name: RELEASE_JOB, opts: { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } } },
  )
  .catch((err: unknown) => logger.error({ err }, "could not schedule the stock release job"));

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
