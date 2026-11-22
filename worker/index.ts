import "./load-env";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getQueue, ORDER_JOBS, QUEUE_NAMES, type NotificationJob } from "@/lib/queue";
import { bullConnection } from "@/lib/redis";
import { productTags, scopeOfProducts } from "@/modules/catalog/product-tags";
import { ensureInvoicePdf } from "@/modules/invoices/pdf";
import { loadBrand } from "@/modules/notifications/brand";
import { emailProvider, EmailSendError, errorText, type EmailAttachment } from "@/modules/notifications/email";
import { renderEmailHtml } from "@/modules/notifications/email-layout";
import { markSent, markTryFailed } from "@/modules/notifications/log";
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

type EmailJob = Extract<NotificationJob, { kind: "email" }>;

async function sendEmailJob(data: EmailJob) {
  const html = data.html ?? (await renderEmailHtml(await loadBrand(), data));
  const attachments: EmailAttachment[] = [];
  if (data.attachInvoiceId) {
    // Printed now if the PDF job hasn't finished yet. No invoice (deleted) = the email goes without it.
    const inv = await ensureInvoicePdf(data.attachInvoiceId);
    if (inv) attachments.push({ filename: `${inv.invoiceNo}.pdf`, content: inv.pdf, contentType: "application/pdf" });
  }
  return (await emailProvider()).send({ to: data.to, subject: data.subject, text: data.text, html, attachments });
}

/**
 * One SMS or email (FR-OR-07). Each try is noted in the message log: sent, or the error and whether
 * the queue will try again. Errors that retrying can't fix (bad key, number or address) stop at once.
 */
async function handleNotification(job: Job<NotificationJob>) {
  const data = job.data;
  try {
    const res = data.kind === "sms" ? await (await smsProvider()).send(data.to, data.text) : await sendEmailJob(data);
    if (data.logId) await markSent(data.logId, res);
    return res;
  } catch (err) {
    const message = errorText(err);
    const permanent = (err instanceof SmsSendError || err instanceof EmailSendError) && err.permanent;
    const lastTry = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (data.logId) await markTryFailed(data.logId, message, lastTry).catch(() => undefined);
    // Kept in the failed list either way, where staff can see it.
    if (permanent) throw new UnrecoverableError(message);
    throw err;
  }
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
