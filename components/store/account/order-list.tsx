import { ChevronRight, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { dhakaDate } from "@/modules/account/account";
import type { OrderListRow } from "@/modules/account/order-view";
import { StatusBadge } from "./order-view";

/** The customer's orders, newest first; each opens its own page. */
export function OrderList({ rows }: { rows: OrderListRow[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((r) => (
        <li key={r.orderNo}>
          <Link
            href={`/account/orders/${r.orderNo}`}
            className="hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-3 p-3 focus-visible:ring-2 focus-visible:outline-none sm:p-4"
          >
            <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md">
              {r.image ? (
                <Image src={r.image} alt="" fill sizes="48px" className="object-cover" />
              ) : (
                <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" aria-hidden />
              )}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-sm font-semibold">{r.orderNo}</span>
                <StatusBadge status={r.status} label={r.statusLabel} />
              </span>
              <span className="text-muted-foreground truncate text-xs">{r.firstItem}</span>
              <span className="text-muted-foreground text-xs">
                {dhakaDate(r.placedAt)} · {r.itemCount} {r.itemCount === 1 ? "item" : "items"} ·{" "}
                <span className="text-foreground font-medium tabular-nums">{formatTaka(r.total)}</span>
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
