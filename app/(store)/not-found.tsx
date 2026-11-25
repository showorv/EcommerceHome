import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StoreNotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">This page doesn&apos;t exist, or the product is no longer on sale.</p>
      <div>
        <Button asChild>
          <Link href="/">Back to the shop</Link>
        </Button>
      </div>
    </div>
  );
}
