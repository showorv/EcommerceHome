"use client";

import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { report, selectClass } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  saveAreaAction,
  setAreaActiveAction,
  setAreaZoneAction,
  setDistrictZoneAction,
} from "@/modules/delivery/actions";
import { cn } from "@/lib/utils";
import type { AreaRow, DeliveryData, DistrictRow } from "@/modules/delivery/data";

const bnLabel = (n: { en: string; bn: string }) => (n.bn ? `${n.en} · ${n.bn}` : n.en);

export function AreasTab({ data }: { data: DeliveryData }) {
  const [division, setDivision] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const zoneName = useMemo(() => new Map(data.zones.map((z) => [z.id, z.name])), [data.zones]);
  const areasOf = useMemo(() => {
    const m = new Map<string, AreaRow[]>();
    for (const a of data.areas) m.set(a.districtId, [...(m.get(a.districtId) ?? []), a]);
    return m;
  }, [data.areas]);

  const q = query.trim().toLowerCase();
  const matches = (n: { en: string; bn: string }) => n.en.toLowerCase().includes(q) || n.bn.includes(query.trim());
  const districts = data.districts.filter(
    (d) =>
      (!division || d.divisionId === division) &&
      (!q || matches(d.name) || (areasOf.get(d.id) ?? []).some((a) => matches(a.name))),
  );

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground max-w-3xl text-sm">
        Shoppers pick a district, then an area. Each district has a zone; an area uses its district&apos;s zone unless
        you give it its own. Switch off an area you don&apos;t deliver to. The starter list covers all 64 districts with
        their upazilas and the main city areas; add or rename areas as you need.
      </p>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Division"
          className={cn(selectClass, "w-48")}
          value={division}
          onChange={(e) => setDivision(e.target.value)}
        >
          <option value="">All divisions</option>
          {data.divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {bnLabel(d.name)}
            </option>
          ))}
        </select>
        <Input
          aria-label="Search districts and areas"
          placeholder="Search districts and areas"
          className="w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {districts.length === 0 && <p className="text-muted-foreground p-4 text-sm">Nothing matches.</p>}
          {districts.map((d) => (
            <DistrictRowView
              key={d.id}
              district={d}
              areas={areasOf.get(d.id) ?? []}
              data={data}
              zoneName={zoneName}
              open={open === d.id || (q.length > 1 && !matches(d.name))}
              highlight={q.length > 1 ? matches : undefined}
              onToggle={() => setOpen(open === d.id ? null : d.id)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DistrictRowView({
  district: d,
  areas,
  data,
  zoneName,
  open,
  highlight,
  onToggle,
}: {
  district: DistrictRow;
  areas: AreaRow[];
  data: DeliveryData;
  zoneName: Map<string, string>;
  open: boolean;
  highlight?: (n: { en: string; bn: string }) => boolean;
  onToggle: () => void;
}) {
  const [pending, start] = useTransition();
  const own = areas.filter((a) => a.zoneId).length;
  const off = areas.filter((a) => !a.active).length;
  const shown = highlight ? areas.filter((a) => highlight(a.name)) : areas;
  const districtZone = d.zoneId;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          className="flex min-w-48 flex-1 items-center gap-2 text-left text-sm font-medium"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {bnLabel(d.name)}
          <span className="text-muted-foreground font-normal">
            {areas.length} area{areas.length === 1 ? "" : "s"}
          </span>
          {own > 0 && <Badge variant="secondary">{own} with own zone</Badge>}
          {off > 0 && <Badge variant="outline">{off} off</Badge>}
        </button>
        <select
          aria-label={`Zone for ${d.name.en}`}
          className={cn(selectClass, "w-52")}
          value={d.zoneId ?? ""}
          disabled={pending}
          onChange={(e) => {
            const zoneId = e.target.value;
            start(async () => {
              report(await setDistrictZoneAction(d.id, zoneId, false));
            });
          }}
        >
          {!d.zoneId && <option value="">Choose a zone</option>}
          {data.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </div>
      {open && (
        <div className="bg-muted/40 grid gap-2 px-4 pt-1 pb-4 sm:pl-10">
          {own > 0 && districtZone && (
            <div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={pending}
                onClick={() => {
                  const to = zoneName.get(districtZone) ?? "the district's zone";
                  if (
                    !confirm(
                      `Remove the own zone from ${own} area${own === 1 ? "" : "s"} in ${d.name.en}? They will all use ${to}.`,
                    )
                  )
                    return;
                  start(async () => {
                    report(await setDistrictZoneAction(d.id, districtZone, true));
                  });
                }}
              >
                Make all {areas.length} areas use {zoneName.get(districtZone) ?? "the district's zone"}
              </Button>
            </div>
          )}
          <ul className="grid gap-1">
            {shown.map((a) => (
              <AreaRowView key={a.id} area={a} district={d} data={data} zoneName={zoneName} />
            ))}
          </ul>
          <AddArea districtId={d.id} />
        </div>
      )}
    </div>
  );
}

function AreaRowView({
  area: a,
  district,
  data,
  zoneName,
}: {
  area: AreaRow;
  district: DistrictRow;
  data: DeliveryData;
  zoneName: Map<string, string>;
}) {
  const [pending, start] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const inherited = district.zoneId ? zoneName.get(district.zoneId) : undefined;

  if (renaming) {
    return (
      <li>
        <AreaNameForm
          districtId={district.id}
          id={a.id}
          initial={a.name}
          submitLabel="Rename"
          onDone={() => setRenaming(false)}
        />
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-3 text-sm">
      <span className={`min-w-40 flex-1 ${a.active ? "" : "text-muted-foreground line-through"}`}>
        {bnLabel(a.name)}
        {a.custom && (
          <Badge variant="outline" className="ml-2">
            Added
          </Badge>
        )}
      </span>
      <select
        aria-label={`Zone for ${a.name.en}`}
        className={cn(selectClass, "h-8 w-60")}
        value={a.zoneId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const zoneId = e.target.value || null;
          start(async () => {
            report(await setAreaZoneAction(a.id, zoneId));
          });
        }}
      >
        <option value="">Same as district{inherited ? ` (${inherited})` : ""}</option>
        {data.zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2" title={a.active ? "Delivering here" : "Not delivering here"}>
        <Switch
          checked={a.active}
          disabled={pending}
          aria-label={`Deliver to ${a.name.en}`}
          onCheckedChange={(v) =>
            start(async () => {
              report(await setAreaActiveAction(a.id, v));
            })
          }
        />
      </label>
      <Button variant="ghost" size="icon" aria-label={`Rename ${a.name.en}`} onClick={() => setRenaming(true)}>
        <Pencil />
      </Button>
    </li>
  );
}

function AddArea({ districtId }: { districtId: string }) {
  const [adding, setAdding] = useState(false);
  if (!adding) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add area
        </Button>
      </div>
    );
  }
  return (
    <AreaNameForm
      districtId={districtId}
      id={null}
      initial={{ en: "", bn: "" }}
      submitLabel="Add area"
      onDone={() => setAdding(false)}
    />
  );
}

function AreaNameForm({
  districtId,
  id,
  initial,
  submitLabel,
  onDone,
}: {
  districtId: string;
  id: string | null;
  initial: { en: string; bn: string };
  submitLabel: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (report(await saveAreaAction(id, districtId, name))) onDone();
        });
      }}
    >
      <Input
        aria-label="Area name (English)"
        placeholder="Area name (English)"
        className="h-8 w-52"
        required
        maxLength={80}
        autoFocus
        value={name.en}
        onChange={(e) => setName({ ...name, en: e.target.value })}
      />
      <Input
        aria-label="Area name (বাংলা)"
        placeholder="বাংলা নাম (optional)"
        lang="bn"
        className="h-8 w-52"
        maxLength={80}
        value={name.bn}
        onChange={(e) => setName({ ...name, bn: e.target.value })}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {submitLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
        Cancel
      </Button>
    </form>
  );
}
