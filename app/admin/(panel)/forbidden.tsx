import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminForbidden() {
  return (
    <div className="grid place-items-center gap-3 py-24 text-center">
      <p className="text-muted-foreground font-mono text-sm">403</p>
      <h1 className="text-2xl font-bold">You don&apos;t have access to this page</h1>
      <p className="text-muted-foreground text-sm">Ask an owner if you need this permission.</p>
      <Button asChild variant="outline">
        <Link href="/admin">Back to dashboard</Link>
      </Button>
    </div>
  );
}
