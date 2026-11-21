"use client";

import { CheckCircle2, ImageOff, Lock, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { reloadCart, useCart } from "@/components/store/cart/cart-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { formatTaka } from "@/lib/money";
import { normalizeBdPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  checkoutRulesAction,
  sendCheckoutCodeAction,
  submitCheckoutAction,
  type CheckoutRulesResponse,
} from "@/modules/checkout/actions";
import {
  availableMethods,
  checkoutInput,
  checkoutTotals,
  fieldErrors,
  PAYMENT_METHOD_NAMES,
  zoneForArea,
  type CheckoutField,
  type CheckoutTotals,
  type PaymentMethod,
} from "@/modules/checkout/checkout";
import { applyCoupon, type CouponTerms } from "@/modules/coupons/coupons";
import type { DeliveryData } from "@/modules/delivery/data";
import { WALLET_NAMES, type Wallet, type WalletType } from "@/modules/payments/payments";
import { AdvancePayment } from "./advance-payment";
import { CouponBox } from "./coupon-box";
import { PhoneCodeDialog, type CodeSent } from "./phone-code-dialog";

/**
 * Single-page checkout (FR-CO-02, SRS §2.2): the form on the left, an order summary that updates as the
 * shopper types on the right. The server checks and works out everything again when the form is sent.
 */

type Form = {
  name: string;
  phone: string;
  email: string;
  districtId: string;
  areaId: string;
  address: string;
  note: string;
  paymentMethod: PaymentMethod | "";
  payWallet: WalletType | "";
  senderNumber: string;
  trxId: string;
  acceptTerms: boolean;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  email: "",
  districtId: "",
  areaId: "",
  address: "",
  note: "",
  paymentMethod: "",
  payWallet: "",
  senderNumber: "",
  trxId: "",
  acceptTerms: false,
};

const DRAFT_KEY = "checkout:draft:v1";
const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50";

function readDraft(): Partial<Form> {
  if (typeof window === "undefined") return {};
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Partial<Form>;
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

/**
 * The time, to the minute, for a campaign that starts or ends while the page is open. Read in the
 * browser only (the page itself is built ahead of time), so it is 0 while prerendering.
 */
function subscribeMinute(onChange: () => void) {
  const t = setInterval(onChange, 30_000);
  return () => clearInterval(t);
}
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const useMinuteClock = () => useSyncExternalStore(subscribeMinute, currentMinute, () => 0);

const label = (n: { en: string; bn: string }) => (n.bn ? `${n.en} · ${n.bn}` : n.en);

export function CheckoutView({ config, wallets }: { config: DeliveryData; wallets: Wallet[] }) {
  const { cart, synced } = useCart();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  // What the shopper typed last time comes back (not the terms tick). Read before the first render;
  // the form only shows once the cart is known, so server and browser render the same.
  const [form, setForm] = useState<Form>(() => ({ ...EMPTY, ...readDraft(), acceptTerms: false }));
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  // The applied coupon's terms (not kept in the draft: it is checked again on every visit).
  const [coupon, setCoupon] = useState<CouponTerms | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);
  const orderKey = useRef<string | null>(null);
  const [codeStep, setCodeStep] = useState<{ phone: string; sent: CodeSent; sentAt: number } | null>(null);
  const now = useMinuteClock();

  useEffect(() => {
    try {
      // Not the terms tick, and not the TrxID: a transaction ID belongs to one order only.
      const { acceptTerms: _terms, trxId: _trx, ...draft } = form;
      void _terms;
      void _trx;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Private mode: no draft, the form still works.
    }
  }, [form]);

  // Signed-in customers: fill the empty fields with what the account knows, once per account.
  const user = session?.user as { id: string; name?: string; email?: string; phoneNumber?: string | null } | undefined;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (user && user.id !== prefilledFor) {
    setPrefilledFor(user.id);
    setForm((f) => ({
      ...f,
      name: f.name || user.name || "",
      email: f.email || user.email || "",
      phone: f.phone || (user.phoneNumber ? user.phoneNumber.replace(/^\+88/, "") : ""),
    }));
  }

  const districts = useMemo(
    () => [...config.districts].sort((a, b) => a.name.en.localeCompare(b.name.en)),
    [config.districts],
  );
  const areas = useMemo(
    () =>
      config.areas.filter((a) => a.districtId === form.districtId).sort((a, b) => a.name.en.localeCompare(b.name.en)),
    [config.areas, form.districtId],
  );
  const zone = form.areaId ? zoneForArea(config, form.areaId) : null;
  // The order rules (first order to a far zone, a large order…) may ask for more than the zone does.
  // Asked from the server once the phone and area are known; until it answers, the zone's rule shows.
  const phoneOk = normalizeBdPhone(form.phone);
  const rulesKey = phoneOk && form.areaId ? `${phoneOk}|${form.areaId}|${cart.subtotal}|${form.name.trim()}` : null;
  const [rules, setRules] = useState<{ key: string; res: CheckoutRulesResponse } | null>(null);
  useEffect(() => {
    if (!rulesKey) return;
    const [phone, areaId, , ...rest] = rulesKey.split("|");
    const t = setTimeout(() => {
      void checkoutRulesAction({ phone, areaId, name: rest.join("|") })
        .then((res) => setRules({ key: rulesKey, res }))
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [rulesKey]);
  const ruled = rules && rules.key === rulesKey && rules.res.ok ? rules.res : null;
  const blocked = rules && rules.key === rulesKey && !rules.res.ok && rules.res.blocked ? rules.res.error : null;
  const advanceRule = ruled ? ruled.advance : (zone?.advanceRule ?? "none");
  const methods = availableMethods(advanceRule, wallets.length);
  // No option at all: this area needs an advance and no wallet is set up yet (the server says so too).
  const method =
    form.paymentMethod && methods.includes(form.paymentMethod) ? form.paymentMethod : (methods[0] ?? "cod");
  // "bKash / Nagad": only the wallets that are switched on.
  const walletLabel = wallets.map((w) => WALLET_NAMES[w.type]).join(" / ");
  const payWallet =
    form.payWallet && wallets.some((w) => w.type === form.payWallet) ? form.payWallet : (wallets[0]?.type ?? "");
  const lines = cart.lines.filter((l) => l.problem === null);
  // Worked out live, so a cart that drops below the minimum or a code that expires shows at once.
  const applied = coupon && now ? applyCoupon(coupon, lines, now) : null;
  const discount = applied?.ok ? applied.discount : 0;
  const totals =
    zone && lines.length > 0
      ? checkoutTotals({
          zone,
          rules: config.rules,
          lines,
          discount,
          freeDelivery: applied?.ok ? applied.freeDelivery : false,
          paymentMethod: method,
          now,
        })
      : null;

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as CheckoutField]) setErrors((e) => ({ ...e, [key]: undefined }));
    setNotice(null);
  }

  function submit() {
    const data = { ...form, paymentMethod: method, payWallet, couponCode: coupon && applied?.ok ? coupon.code : "" };
    const local = checkoutInput.safeParse(data);
    if (!local.success) {
      const fe = fieldErrors(local.error);
      setErrors(fe);
      setNotice({ kind: "error", text: "Please check the highlighted fields." });
      focusFirst(fe);
      return;
    }
    // One key per order: a double click or a retry after a lost reply gives back the same order.
    orderKey.current ??= crypto.randomUUID();
    const key = orderKey.current;
    start(async () => {
      const res = await submitCheckoutAction(data, { key, expectedTotal: totals?.total }).catch(() => null);
      if (!res) {
        setNotice({ kind: "error", text: "Couldn't reach the store. Check your connection and try again." });
        return;
      }
      if (!res.ok && res.needsCode) {
        // Everything else is right: text a code to the number and ask for it (FR-CO-03).
        const phone = local.data.phone;
        const sent = await sendCheckoutCodeAction(phone).catch(() => null);
        if (!sent) {
          setNotice({ kind: "error", text: "Couldn't reach the store. Check your connection and try again." });
          return;
        }
        if (sent.ok && sent.verified) {
          submit();
          return;
        }
        setErrors({});
        setNotice(null);
        setCodeStep({
          phone,
          sent: sent.ok ? { ok: true, resendIn: sent.resendIn } : sent,
          sentAt: Math.floor(Date.now() / 1000),
        });
        return;
      }
      if (!res.ok && res.fields?.couponCode) {
        // The code stopped working since it was applied (switched off, used up…): take it off so the
        // summary shows the real total, and say why. The box opens again with the reason under it.
        setCoupon(null);
        setCouponError(res.fields.couponCode);
        setNotice({ kind: "error", text: "We took the coupon off. Check the new total, then place the order again." });
        return;
      }
      if (!res.ok) {
        setErrors(res.fields ?? {});
        setNotice({ kind: "error", text: res.error });
        if (res.fields) focusFirst(res.fields);
        // The order rules asked for an advance this page didn't know about yet: show those options.
        if (res.advance && rulesKey) {
          setRules({ key: rulesKey, res: { ok: true, advance: res.advance.rule, message: res.advance.message } });
        }
        // A price, stock or delivery setting changed since the page loaded: show the new numbers.
        if (res.cart || res.totals) void reloadCart();
        return;
      }
      setPlaced(res.orderNo);
      router.replace("/checkout/thank-you");
      // The ordered lines are out of the cart now: the badge and drawer follow.
      void reloadCart();
    });
  }

  if (placed) {
    return (
      <div className="grid place-items-center gap-3 rounded-lg border px-4 py-16 text-center" role="status">
        <CheckCircle2 className="text-success size-10" aria-hidden />
        <p className="text-lg font-semibold">Order {placed} placed</p>
        <p className="text-muted-foreground text-sm">Opening your order…</p>
      </div>
    );
  }

  if (!synced && cart.lines.length === 0) {
    return <p className="text-muted-foreground py-16 text-center">Loading your cart…</p>;
  }
  if (cart.lines.length === 0) {
    return (
      <div className="grid place-items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center">
        <ShoppingBag className="text-muted-foreground size-10" aria-hidden />
        <p className="text-lg font-semibold">Your cart is empty</p>
        <Button asChild>
          <Link href="/search">Browse products</Link>
        </Button>
      </div>
    );
  }

  // A blocked number is said once, under the phone field, as soon as the area is chosen.
  const err = (k: CheckoutField) => errors[k] ?? (k === "phone" ? (blocked ?? undefined) : undefined);
  const invalid = (k: CheckoutField) =>
    err(k) ? { "aria-invalid": true as const, "aria-describedby": `co-${k}-error` } : {};

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start"
    >
      <div className="grid gap-6">
        {cart.hasProblems && (
          <p className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm" role="alert">
            Some products in your cart changed (price, stock or no longer on sale).{" "}
            <Link href="/cart" className="font-medium underline">
              Check your cart
            </Link>{" "}
            before ordering.
          </p>
        )}

        <Section title="Your details">
          <Field id="name" label="Full name" error={err("name")}>
            <Input
              id="co-name"
              autoComplete="name"
              maxLength={80}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              {...invalid("name")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="phone" label="Mobile number" error={err("phone")} hint="We'll text a code to confirm it.">
              <Input
                id="co-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="01XXXXXXXXX"
                maxLength={18}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                {...invalid("phone")}
              />
            </Field>
            <Field
              id="email"
              label={session ? "Email" : "Email (optional)"}
              error={err("email")}
              hint={session ? undefined : "For the invoice by email."}
            >
              <Input
                id="co-email"
                type="email"
                autoComplete="email"
                maxLength={120}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                {...invalid("email")}
              />
            </Field>
          </div>
        </Section>

        <Section title="Delivery address">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="districtId" label="District" error={err("districtId")}>
              <select
                id="co-districtId"
                className={selectClass}
                autoComplete="address-level1"
                value={form.districtId}
                onChange={(e) => {
                  setForm((f) => ({ ...f, districtId: e.target.value, areaId: "" }));
                  setErrors((x) => ({ ...x, districtId: undefined, areaId: undefined }));
                  setNotice(null);
                }}
                {...invalid("districtId")}
              >
                <option value="">Choose your district</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {label(d.name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="areaId" label="Area / thana" error={err("areaId")}>
              <select
                id="co-areaId"
                className={selectClass}
                autoComplete="address-level2"
                value={form.areaId}
                disabled={!form.districtId}
                onChange={(e) => set("areaId", e.target.value)}
                {...invalid("areaId")}
              >
                <option value="">{form.districtId ? "Choose your area" : "Choose a district first"}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a.name)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {form.areaId && !zone && (
            <p className="text-destructive text-sm" role="alert">
              Sorry, we don&apos;t deliver to this area yet. Please call us.
            </p>
          )}
          <Field id="address" label="Full address" error={err("address")} hint="House, road, block, landmark.">
            <Textarea
              id="co-address"
              autoComplete="street-address"
              rows={3}
              maxLength={250}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              {...invalid("address")}
            />
          </Field>
          <Field
            id="note"
            label="Delivery note (optional)"
            error={err("note")}
            hint="For example, a good time to call."
          >
            <Input id="co-note" maxLength={250} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </Field>
        </Section>

        <Section title="Payment">
          <fieldset
            className="grid gap-2"
            aria-describedby={err("paymentMethod") ? "co-paymentMethod-error" : undefined}
          >
            <legend className="sr-only">How you&apos;ll pay</legend>
            {methods.map((m) => (
              <label
                key={m}
                className={cn(
                  "has-[:focus-visible]:ring-ring/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-[3px]",
                  method === m && "border-brand bg-brand/5",
                )}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={m}
                  checked={method === m}
                  onChange={() => set("paymentMethod", m)}
                  className="accent-brand mt-0.5 size-4"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">
                    {PAYMENT_METHOD_NAMES[m]}
                    {m === "full" && walletLabel && ` (${walletLabel})`}
                  </span>
                  <span className="text-muted-foreground text-xs">{methodHint(m, totals)}</span>
                </span>
              </label>
            ))}
            {ruled?.message ? (
              <p className="text-muted-foreground text-xs">{ruled.message}</p>
            ) : (
              zone &&
              zone.advanceRule !== "none" && (
                <p className="text-muted-foreground text-xs">
                  For {zone.name}, {zone.advanceRule === "full" ? "the full amount" : "the delivery charge"} is paid in
                  advance.
                </p>
              )
            )}
            {zone && methods.length === 0 && (
              <p className="text-destructive text-sm" role="alert">
                Orders for {zone.name} need an advance payment, which isn&apos;t set up yet. Please contact us to order.
              </p>
            )}
            {err("paymentMethod") && <FieldError id="paymentMethod" text={err("paymentMethod")!} />}
          </fieldset>
          {method !== "cod" && methods.length > 0 && (
            <AdvancePayment
              wallets={wallets}
              payWallet={payWallet}
              senderNumber={form.senderNumber}
              trxId={form.trxId}
              amount={totals?.advanceDue ?? null}
              errors={{ payWallet: err("payWallet"), senderNumber: err("senderNumber"), trxId: err("trxId") }}
              onChange={(patch) => {
                if (patch.payWallet) set("payWallet", patch.payWallet);
                if (patch.senderNumber !== undefined) set("senderNumber", patch.senderNumber);
                if (patch.trxId !== undefined) set("trxId", patch.trxId);
              }}
            />
          )}
        </Section>

        <div className="grid gap-1.5">
          <div className="flex items-start gap-2.5 text-sm">
            <Checkbox
              id="co-acceptTerms"
              aria-labelledby="co-acceptTerms-label"
              checked={form.acceptTerms}
              onCheckedChange={(v) => set("acceptTerms", v === true)}
              className="mt-0.5"
              {...invalid("acceptTerms")}
            />
            <label id="co-acceptTerms-label" htmlFor="co-acceptTerms">
              I accept the{" "}
              <Link href="/pages/terms" className="underline" target="_blank">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/pages/returns" className="underline" target="_blank">
                return policy
              </Link>
              .
            </label>
          </div>
          {err("acceptTerms") && <FieldError id="acceptTerms" text={err("acceptTerms")!} />}
        </div>
      </div>

      <Summary
        cart={cart}
        totals={totals}
        discount={discount}
        zoneName={zone?.name ?? null}
        walletLabel={walletLabel}
        couponSlot={
          <CouponBox
            coupon={coupon}
            phone={form.phone}
            problem={couponError ?? (applied && !applied.ok ? applied.error : null)}
            onApply={(terms) => {
              setCoupon(terms);
              setCouponError(null);
              setNotice(null);
            }}
            onRemove={() => {
              setCoupon(null);
              setCouponError(null);
              setNotice(null);
            }}
            onEdit={() => setCouponError(null)}
          />
        }
      >
        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-2 rounded-md p-3 text-sm",
              notice.kind === "ok" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {notice.kind === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
            {notice.text}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="bg-brand text-brand-foreground hover:bg-brand/90 w-full"
          disabled={pending || cart.hasProblems}
        >
          <Lock className="size-4" aria-hidden />
          {pending ? "Checking…" : totals ? `Place order · ${formatTaka(totals.total)}` : "Place order"}
        </Button>
      </Summary>

      {codeStep && (
        <PhoneCodeDialog
          key={`${codeStep.phone}:${codeStep.sentAt}`}
          phone={codeStep.phone}
          sent={codeStep.sent}
          sentAt={codeStep.sentAt}
          onVerified={() => {
            setCodeStep(null);
            submit();
          }}
          onChangeNumber={() => {
            setCodeStep(null);
            // After the dialog hands focus back to the button it was opened from.
            setTimeout(() => document.getElementById("co-phone")?.focus(), 50);
          }}
          onClose={() => {
            setCodeStep(null);
            setNotice({ kind: "error", text: "Confirm your mobile number with the SMS code to place the order." });
          }}
        />
      )}
    </form>
  );
}

function focusFirst(fields: Partial<Record<CheckoutField, string>>) {
  const order: CheckoutField[] = [
    "name",
    "phone",
    "email",
    "districtId",
    "areaId",
    "address",
    "note",
    "paymentMethod",
    "payWallet",
    "senderNumber",
    "trxId",
    "couponCode",
    "acceptTerms",
  ];
  const first = order.find((k) => fields[k]);
  if (first) document.getElementById(`co-${first}`)?.focus();
}

function methodHint(m: PaymentMethod, t: CheckoutTotals | null): string {
  if (!t) {
    return m === "cod" ? "Pay the courier when it arrives." : m === "full" ? "Nothing to pay at the door." : "";
  }
  const delivery = t.delivery.charge;
  if (m === "cod") return `Pay ${formatTaka(t.subtotal - t.discount + delivery)} to the courier when it arrives.`;
  if (m === "cod_advance") return `${formatTaka(delivery)} now, the rest when it arrives.`;
  return `${formatTaka(t.subtotal - t.discount + delivery)} now, nothing at the door.`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg border p-4 sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label: text,
  error,
  hint,
  children,
}: {
  id: CheckoutField;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`co-${id}`}>{text}</Label>
      {children}
      {error ? <FieldError id={id} text={error} /> : hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function FieldError({ id, text }: { id: CheckoutField; text: string }) {
  return (
    <p id={`co-${id}-error`} className="text-destructive text-xs font-medium">
      {text}
    </p>
  );
}

function Summary({
  cart,
  totals,
  discount,
  zoneName,
  walletLabel,
  couponSlot,
  children,
}: {
  cart: ReturnType<typeof useCart>["cart"];
  totals: CheckoutTotals | null;
  /** The coupon's discount, shown even before an area is chosen. */
  discount: number;
  zoneName: string | null;
  walletLabel: string;
  couponSlot: ReactNode;
  children: ReactNode;
}) {
  const subtotal = totals?.subtotal ?? cart.subtotal;
  const d = totals?.delivery;
  return (
    <aside className="bg-card grid gap-4 rounded-lg border p-5 lg:sticky lg:top-24" aria-label="Order summary">
      <h2 className="text-base font-semibold">Order summary</h2>
      <ul className="grid max-h-72 gap-3 overflow-y-auto">
        {cart.lines.map((l) => (
          <li key={l.variantId} className={cn("flex gap-3", l.problem && "opacity-50")}>
            <span className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
              {l.image ? (
                <Image src={l.image.url} alt="" fill sizes="56px" className="object-cover" />
              ) : (
                <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" aria-hidden />
              )}
              <span className="bg-foreground text-background absolute top-0.5 right-0.5 grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold">
                {l.qty}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="line-clamp-2 font-medium">{l.title}</span>
              {l.variantTitle && <span className="text-muted-foreground block text-xs">{l.variantTitle}</span>}
            </span>
            <span className="text-sm font-medium tabular-nums">{formatTaka(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t pt-3">{couponSlot}</div>
      <dl className="grid gap-2 border-t pt-3 text-sm">
        <Row label="Subtotal" value={formatTaka(subtotal)} />
        {discount > 0 && <Row label="Coupon discount" value={`−${formatTaka(totals?.discount ?? discount)}`} />}
        <Row
          label={zoneName ? `Delivery (${zoneName})` : "Delivery"}
          value={!d ? "Choose your area" : d.charge === 0 ? "Free" : formatTaka(d.charge)}
          muted={!d}
        />
        {d && d.charge !== d.regularCharge && (
          <p className="text-success -mt-1 text-xs">
            {d.reason === "flat"
              ? "Campaign price"
              : d.reason === "coupon"
                ? "Free delivery with your coupon"
                : "Free delivery"}
            : you save {formatTaka(d.regularCharge - d.charge)}.
          </p>
        )}
        {d && d.reason === "weight" && d.freeAbove !== null && subtotal < d.freeAbove && (
          <p className="text-muted-foreground -mt-1 text-xs">
            Free delivery from {formatTaka(d.freeAbove)} ({formatTaka(d.freeAbove - subtotal)} more).
          </p>
        )}
        {totals && totals.codFee > 0 && <Row label="Cash-on-delivery fee" value={formatTaka(totals.codFee)} />}
        <div className="flex items-baseline justify-between border-t pt-2">
          <dt className="font-semibold">Total</dt>
          <dd className="text-lg font-bold tabular-nums">{formatTaka(totals?.total ?? subtotal - discount)}</dd>
        </div>
        {totals && (
          <>
            {totals.advanceDue > 0 && (
              <Row label={walletLabel ? `Pay now (${walletLabel})` : "Pay now"} value={formatTaka(totals.advanceDue)} />
            )}
            <Row label="Pay at the door" value={formatTaka(totals.codAmount)} />
          </>
        )}
      </dl>
      {d && (
        <p className="text-muted-foreground text-xs">
          Arrives in {d.minDays === d.maxDays ? d.minDays : `${d.minDays}–${d.maxDays}`} days after we confirm your
          order.
        </p>
      )}
      {children}
    </aside>
  );
}

function Row({ label: text, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{text}</dt>
      <dd className={cn("text-right tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</dd>
    </div>
  );
}
