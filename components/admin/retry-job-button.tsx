"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryJobAction } from "@/modules/system/jobs";

export function RetryJobButton({ queue, jobId }: { queue: string; jobId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retryJobAction(queue, jobId);
          if (res.ok) toast.success("Job queued again");
          else toast.error(res.error ?? "Could not retry");
        })
      }
    >
      Retry
    </Button>
  );
}
