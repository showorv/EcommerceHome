"use client";

import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ADDRESSES, type AddressField, type SavedAddress } from "@/modules/account/account";
import {
  defaultAddressAction,
  deleteAddressAction,
  saveAddressAction,
  type AddressResult,
} from "@/modules/account/actions";

type Name = { en: string; bn: string };
export type PlaceOption = { id: string; name: Name };
export type AreaOption = PlaceOption & { districtId: string };

type Draft = {
  label: string;
  name: string;
  phone: string;
  districtId: string;
  areaId: string;
  line: string;
  note: string;
  isDefault: boolean;
};

const EMPTY: Draft = {
  label: "",
  name: "",
  phone: "",
  districtId: "",
  areaId: "",
  line: "",
  note: "",
  isDefault: false,
};
const local = (p: string) => p.replace(/^\+88/, "");
const label = (n: Name) => (n.bn ? `${n.en} · ${n.bn}` : n.en);
const selectClass =
  "bg-background h-9 w-full rounded-md border px-2 text-sm disabled:opacity-60 aria-[invalid=true]:border-destructive";

/** Saved addresses (FR-AC-06): add, change, remove and pick the default one for checkout. */
export function AddressBook({
  initial,
  districts,
  areas,
}: {
  initial: SavedAddress[];
  districts: PlaceOption[];
  areas: AreaOption[];
}) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  const [pending, start] = useTransition();

  function handle(res: AddressResult, after?: () => void) {
    if (res.ok) {
      setList(res.addresses);
      if (res.message) toast.success(res.message);
      after?.();
      return true;
    }
    if ("fields" in res && res.fields) setErrors(res.fields);
    toast.error(res.error);
    return false;
  }

  function open(a: SavedAddress | null) {
    setErrors({});
    setEditing({
      id: a?.id ?? null,
      draft: a ? { ...a, phone: local(a.phone) } : { ...EMPTY, isDefault: list.length === 0 },
    });
  }

  return (
    <div className="grid gap-4">
      {list.length === 0 ? (
        <div className="text-muted-foreground grid justify-items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
          <p>No saved addresses yet. Save one here, or tick &ldquo;Save this address&rdquo; at checkout.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => (
            <li key={a.id} className="grid content-start gap-2 rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin className="text-muted-foreground size-4" aria-hidden />
                <span className="font-semibold">{a.label || "Address"}</span>
                {a.isDefault && (
                  <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-xs font-medium">Default</span>
                )}
              </div>
              <p>
                {a.name}, {local(a.phone)}
              </p>
              <p className="text-muted-foreground break-words">{[a.line, a.place].filter(Boolean).join(", ")}</p>
              {!a.place && <p className="text-destructive text-xs">This area changed. Please choose it again.</p>}
              {a.note && <p className="text-muted-foreground text-xs break-words">Note: {a.note}</p>}
              <div className="mt-1 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => open(a)}>
                  <Pencil className="size-3.5" aria-hidden /> Edit
                </Button>
                {!a.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => start(async () => void handle(await defaultAddressAction({ id: a.id })))}
                  >
                    <Star className="size-3.5" aria-hidden /> Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Remove ${a.label || "address"}`}
                  onClick={() => {
                    if (!window.confirm(`Remove "${a.label || a.line}"?`)) return;
                    start(async () => void handle(await deleteAddressAction({ id: a.id })));
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length < MAX_ADDRESSES ? (
        <Button variant="outline" className="w-fit" onClick={() => open(null)}>
          <Plus className="size-4" aria-hidden /> Add an address
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">You have the most addresses you can save ({MAX_ADDRESSES}).</p>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Change address" : "New address"}</DialogTitle>
            <DialogDescription>Where should we deliver?</DialogDescription>
          </DialogHeader>
          {editing && (
            <AddressForm
              draft={editing.draft}
              errors={errors}
              districts={districts}
              areas={areas}
              onChange={(draft) => setEditing({ ...editing, draft })}
              onClearError={(k) => setErrors((e) => ({ ...e, [k]: undefined }))}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                editing &&
                start(async () => {
                  const res = await saveAddressAction({ id: editing.id, address: editing.draft });
                  handle(res, () => setEditing(null));
                })
              }
            >
              {pending ? "Saving…" : "Save address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddressForm({
  draft: d,
  errors,
  districts,
  areas,
  onChange,
  onClearError,
}: {
  draft: Draft;
  errors: Partial<Record<AddressField, string>>;
  districts: PlaceOption[];
  areas: AreaOption[];
  onChange: (d: Draft) => void;
  onClearError: (k: AddressField) => void;
}) {
  const sortedDistricts = useMemo(() => [...districts].sort((a, b) => a.name.en.localeCompare(b.name.en)), [districts]);
  const districtAreas = useMemo(
    () => areas.filter((a) => a.districtId === d.districtId).sort((a, b) => a.name.en.localeCompare(b.name.en)),
    [areas, d.districtId],
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    onChange({ ...d, [k]: v });
    if (k in errors) onClearError(k as AddressField);
  };
  const field = (k: AddressField) => ({
    id: `addr-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `addr-${k}-error` : undefined,
  });
  const error = (k: AddressField) =>
    errors[k] ? (
      <p id={`addr-${k}-error`} className="text-destructive text-xs">
        {errors[k]}
      </p>
    ) : null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="addr-label">Name this address (optional)</Label>
        <Input
          {...field("label")}
          maxLength={30}
          placeholder="Home, Office…"
          value={d.label}
          onChange={(e) => set("label", e.target.value)}
        />
        {error("label")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="addr-name">Full name</Label>
          <Input
            {...field("name")}
            autoComplete="name"
            maxLength={80}
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
          />
          {error("name")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="addr-phone">Mobile number</Label>
          <Input
            {...field("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="01XXXXXXXXX"
            maxLength={18}
            value={d.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
          {error("phone")}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="addr-districtId">District</Label>
          <select
            {...field("districtId")}
            className={selectClass}
            value={d.districtId}
            onChange={(e) => {
              onChange({ ...d, districtId: e.target.value, areaId: "" });
              onClearError("districtId");
              onClearError("areaId");
            }}
          >
            <option value="">Choose the district</option>
            {sortedDistricts.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x.name)}
              </option>
            ))}
          </select>
          {error("districtId")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="addr-areaId">Area / thana</Label>
          <select
            {...field("areaId")}
            className={selectClass}
            value={d.areaId}
            disabled={!d.districtId}
            onChange={(e) => set("areaId", e.target.value)}
          >
            <option value="">{d.districtId ? "Choose the area" : "Choose a district first"}</option>
            {districtAreas.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x.name)}
              </option>
            ))}
          </select>
          {error("areaId")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="addr-line">Full address</Label>
        <Textarea
          {...field("line")}
          autoComplete="street-address"
          rows={3}
          maxLength={250}
          placeholder="House, road, block, landmark"
          value={d.line}
          onChange={(e) => set("line", e.target.value)}
        />
        {error("line")}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="addr-note">Note for the delivery person (optional)</Label>
        <Input {...field("note")} maxLength={250} value={d.note} onChange={(e) => set("note", e.target.value)} />
        {error("note")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={d.isDefault}
          onChange={(e) => set("isDefault", e.target.checked)}
        />
        Use this address first at checkout
      </label>
    </div>
  );
}
