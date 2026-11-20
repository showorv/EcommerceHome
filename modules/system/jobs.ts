"use server";

import { refresh } from "next/cache";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";

/** Retries a failed background job from the dead-letter list (NFR-SC-05). */
export async function retryJobAction(queueName: string, jobId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await checkStaff("system.view");
  if (!g.ok) return { ok: false, error: "You do not have permission." };
  if (!(Object.values(QUEUE_NAMES) as string[]).includes(queueName)) return { ok: false, error: "Unknown queue." };

  const job = await getQueue(queueName).getJob(jobId);
  if (!job) return { ok: false, error: "Job not found." };
  await job.retry("failed");
  await writeAudit({
    actor: { id: g.ctx.user.id, email: g.ctx.user.email },
    action: "job.retry",
    entity: "job",
    entityId: `${queueName}:${jobId}`,
    ...(await requestMeta()),
  });
  refresh();
  return { ok: true };
}
