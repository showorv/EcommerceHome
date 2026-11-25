"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { reorder } from "@/components/store/cart/cart-store";
import { Button } from "@/components/ui/button";

/** Puts this order's products back in the cart and opens it. */
export function ReorderButton({ orderNo }: { orderNo: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await reorder(orderNo);
        setBusy(false);
      }}
    >
      <RotateCcw className="size-4" aria-hidden /> {busy ? "Adding…" : "Order again"}
    </Button>
  );
}
