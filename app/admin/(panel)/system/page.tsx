import { RetryJobButton } from "@/components/admin/retry-job-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mongoDb } from "@/lib/db/mongo";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { requireStaff } from "@/modules/auth/session";

/** Health of the database, cache and job queues, plus the dead-letter list (NFR-SC-05). */
export default async function SystemPage() {
  await requireStaff("system.view");

  const [mongoOk, redisOk] = await Promise.all([
    mongoDb()
      .command({ ping: 1 })
      .then(() => true)
      .catch(() => false),
    redis()
      .ping()
      .then(() => true)
      .catch(() => false),
  ]);

  const queues = await Promise.all(
    Object.values(QUEUE_NAMES).map(async (name) => {
      const q = getQueue(name);
      const [counts, failed] = await Promise.all([
        q.getJobCounts("waiting", "active", "delayed", "completed", "failed"),
        q.getFailed(0, 49),
      ]);
      return { name, counts, failed };
    }),
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jobs & system</h1>
        <p className="text-muted-foreground text-sm">
          Background work: SMS, email, and later invoices and courier bookings.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Database</CardDescription>
            <CardTitle>{mongoOk ? "✅ Connected" : "❌ Down"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Cache & queue (Redis)</CardDescription>
            <CardTitle>{redisOk ? "✅ Connected" : "❌ Down"}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      {queues.map((q) => (
        <Card key={q.name}>
          <CardHeader>
            <CardTitle className="capitalize">{q.name} queue</CardTitle>
            <CardDescription>
              waiting {q.counts.waiting ?? 0} · active {q.counts.active ?? 0} · delayed {q.counts.delayed ?? 0} · done{" "}
              {q.counts.completed ?? 0} · failed {q.counts.failed ?? 0}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {q.failed.length === 0 ? (
              <p className="text-muted-foreground text-sm">No failed jobs.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.failed.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">
                        {job.name}#{job.id}
                      </TableCell>
                      <TableCell>{(job.data as { purpose?: string }).purpose ?? "—"}</TableCell>
                      <TableCell>{job.attemptsMade}</TableCell>
                      <TableCell className="text-destructive max-w-xs truncate text-xs">{job.failedReason}</TableCell>
                      <TableCell className="text-right">
                        {job.id && <RetryJobButton queue={q.name} jobId={job.id} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
