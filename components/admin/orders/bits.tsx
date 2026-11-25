import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_NAMES,
  PAYMENT_STATUS_NAMES,
  type OrderStatus,
  type PaymentStatus,
} from "@/modules/orders/orders";
import { RISK_LEVEL_NAMES, type RiskLevel } from "@/modules/orders/risk";

/** Small pieces shared by the orders list and the order page. Server- and client-safe. */

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  on_hold: "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  confirmed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  packed: "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  shipped: "border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  delivered: "border-emerald-600/60 bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
  partially_delivered: "border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  returned: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
  cancelled: "border-muted-foreground/30 text-muted-foreground",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", STATUS_STYLE[status])}>
      {ORDER_STATUS_NAMES[status] ?? status}
    </Badge>
  );
}

const PAYMENT_STYLE: Partial<Record<PaymentStatus, string>> = {
  paid: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  refunded: "border-muted-foreground/30 text-muted-foreground",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === "advance_pending") {
    return (
      <Badge variant="destructive" className="whitespace-nowrap">
        {PAYMENT_STATUS_NAMES[status]}
      </Badge>
    );
  }
  return (
    <Badge
      variant={PAYMENT_STYLE[status] ? "outline" : "secondary"}
      className={cn("whitespace-nowrap", PAYMENT_STYLE[status])}
    >
      {PAYMENT_STATUS_NAMES[status] ?? status}
    </Badge>
  );
}

const RISK_STYLE: Record<RiskLevel, string> = {
  low: "border-muted-foreground/30 text-muted-foreground",
  medium: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  high: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
};

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap tabular-nums", RISK_STYLE[level])}>
      {RISK_LEVEL_NAMES[level]} · {score}
    </Badge>
  );
}

const dhaka = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Dhaka",
});
const dhakaYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Dhaka",
});

/** "21 Nov, 10:31 pm" in Dhaka time (with the year when it isn't this year). */
export function dhakaTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  return (d.getUTCFullYear() === new Date(now).getUTCFullYear() ? dhaka : dhakaYear).format(d);
}

/** "12 min", "3 h", "2 days": how long ago. */
export function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** 01712-345678, as people read it. */
export const showPhone = (p: string) => p.replace(/^\+88/, "").replace(/^(\d{5})(\d+)$/, "$1-$2");
export const telHref = (p: string) => `tel:${p.replace(/^\+88/, "")}`;
