"use client";

import { useState, useTransition } from "react";
import { Field, report, selectClass } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveIntegrationAction } from "@/modules/integrations/actions";
import { defOf, fieldApplies, type IntegrationView, type Source } from "@/modules/integrations/integrations";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Dhaka",
});

/**
 * One integration. Secrets are never sent to the browser: a saved one shows as its mask, typing a new
 * value replaces it, and "Remove" deletes it. Values for options not chosen right now are kept.
 */
export function IntegrationCard({ view }: { view: IntegrationView }) {
  const def = defOf(view.id);
  const [source, setSource] = useState<Source>(view.source);
  const [values, setValues] = useState<Record<string, string>>(view.values);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [clear, setClear] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const envOnly = view.id === "courier" || view.id === "analytics"; // no environment variables exist for them
  const name = `int-${view.id}`;

  function save() {
    start(async () => {
      const ok = report(await saveIntegrationAction({ id: view.id, source, values, secrets, clear }));
      if (ok) {
        setSecrets({});
        setClear([]);
      }
    });
  }

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {def.title}
          <Badge variant={view.source === "admin" ? "secondary" : "outline"}>
            {view.source === "admin" ? "Using the keys saved here" : envOnly ? "Not set up" : "Using the server's .env"}
          </Badge>
        </CardTitle>
        <CardDescription>{def.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-2 text-sm">
          <legend className="sr-only">Where the {def.title} settings come from</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name={name}
              className="mt-1"
              checked={source === "env"}
              onChange={() => setSource("env")}
            />
            <span>{envOnly ? "Off" : "Use the server's environment variables (.env)"}</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name={name}
              className="mt-1"
              checked={source === "admin"}
              onChange={() => setSource("admin")}
            />
            <span>Use the settings below</span>
          </label>
        </fieldset>

        {source === "env" && !envOnly && (
          <dl className="bg-muted/50 grid gap-1 rounded-md p-3 text-xs">
            {view.env.map((e) => (
              <div key={e.label} className="flex flex-wrap justify-between gap-x-3">
                <dt className="text-muted-foreground">{e.label}</dt>
                <dd className="font-mono [overflow-wrap:anywhere]">{e.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {source === "admin" && (
          <div className="grid gap-3">
            {def.fields
              .filter((f) => fieldApplies(f, values))
              .map((f) => {
                const id = `${name}-${f.key}`;
                if (f.options) {
                  return (
                    <Field key={f.key} label={f.label} htmlFor={id} hint={f.help}>
                      <select
                        id={id}
                        className={selectClass}
                        value={values[f.key] ?? ""}
                        onChange={(e) => set(f.key, e.target.value)}
                      >
                        {!f.options.some((o) => o.value === "") && <option value="">Choose…</option>}
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  );
                }
                if (f.secret) {
                  const saved = view.secrets[f.key];
                  const removing = clear.includes(f.key);
                  return (
                    <Field
                      key={f.key}
                      label={f.label}
                      htmlFor={id}
                      hint={
                        <>
                          {saved && !removing ? `Saved: ${saved}. Type a new one to replace it.` : f.help}
                          {removing && "Will be removed when you save."}
                        </>
                      }
                    >
                      <div className="flex gap-2">
                        <Input
                          id={id}
                          type="password"
                          autoComplete="new-password"
                          spellCheck={false}
                          maxLength={500}
                          placeholder={saved && !removing ? saved : "Not set"}
                          value={secrets[f.key] ?? ""}
                          onChange={(e) => {
                            setSecrets((s) => ({ ...s, [f.key]: e.target.value }));
                            setClear((c) => c.filter((k) => k !== f.key));
                          }}
                        />
                        {saved && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 shrink-0"
                            onClick={() => {
                              setSecrets((s) => ({ ...s, [f.key]: "" }));
                              setClear((c) => (removing ? c.filter((k) => k !== f.key) : [...c, f.key]));
                            }}
                          >
                            {removing ? "Keep" : "Remove"}
                          </Button>
                        )}
                      </div>
                    </Field>
                  );
                }
                return (
                  <Field key={f.key} label={f.label} htmlFor={id} hint={f.help}>
                    <Input
                      id={id}
                      spellCheck={false}
                      maxLength={200}
                      placeholder={f.placeholder}
                      value={values[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  </Field>
                );
              })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : `Save ${def.title} settings`}
          </Button>
          {view.updatedAt && (
            <span className="text-muted-foreground text-xs">
              Last saved {when.format(new Date(view.updatedAt))}
              {view.updatedByName && ` by ${view.updatedByName}`}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
