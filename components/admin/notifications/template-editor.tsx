"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Field, report } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveEventTemplatesAction, saveMessageLanguageAction } from "@/modules/notifications/actions";
import {
  DEFAULT_TEMPLATES,
  EVENT_INFO,
  EVENTS,
  fillTemplate,
  LANGUAGE_NAMES,
  LANGUAGES,
  PLACEHOLDERS,
  sampleVars,
  smsLength,
  unknownPlaceholders,
  type EventTemplates,
  type Language,
  type NotificationEvent,
  type NotificationSettings,
} from "@/modules/notifications/templates";

type Draft = EventTemplates & { enabled: { sms: boolean; email: boolean } };

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/** As the server stores it (trimmed; one-line subjects), so a saved event no longer looks changed. */
function tidy(d: Draft): Draft {
  const email = (t: { subject: string; body: string }) => ({
    subject: t.subject.trim().replace(/\s+/g, " "),
    body: t.body.trim(),
  });
  return {
    enabled: d.enabled,
    sms: { en: d.sms.en.trim(), bn: d.sms.bn.trim() },
    email: { en: email(d.email.en), bn: email(d.email.bn) },
  };
}

/** Admin → Notifications → Message texts (FR-OR-06): one event at a time, both languages, with previews. */
export function TemplateEditor({
  templates,
  settings,
  storeName,
}: {
  templates: Record<NotificationEvent, EventTemplates>;
  settings: NotificationSettings;
  storeName: string;
}) {
  const saved = useMemo(
    () =>
      Object.fromEntries(EVENTS.map((e) => [e, { ...templates[e], enabled: settings.enabled[e] }])) as Record<
        NotificationEvent,
        Draft
      >,
    [templates, settings],
  );
  const [drafts, setDrafts] = useState(saved);
  const [event, setEvent] = useState<NotificationEvent>("order_confirmed");
  const [lang, setLang] = useState<Language>(settings.language);
  const [language, setLanguage] = useState<Language>(settings.language);
  const [pending, start] = useTransition();

  const d = drafts[event];
  const info = EVENT_INFO[event];
  const set = (patch: (x: Draft) => Draft) => setDrafts((all) => ({ ...all, [event]: patch(all[event]) }));
  const dirty = (e: NotificationEvent) => !same(drafts[e], saved[e]);

  const smsVars = sampleVars(storeName, "sms", lang);
  const emailVars = sampleVars(storeName, "email", lang);
  const smsText = fillTemplate(d.sms[lang], smsVars);
  const len = smsLength(smsText);
  const bad = [d.sms[lang], d.email[lang].subject, d.email[lang].body].flatMap((t) =>
    unknownPlaceholders(t, info.placeholders),
  );

  function resetLanguage() {
    set((x) => ({
      ...x,
      sms: { ...x.sms, [lang]: DEFAULT_TEMPLATES[event].sms[lang] },
      email: { ...x.email, [lang]: { ...DEFAULT_TEMPLATES[event].email[lang] } },
    }));
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Message language</CardTitle>
          <CardDescription>
            Customers get every SMS and email in this language. A Bangla SMS holds 70 characters instead of 160, so it
            can cost 2–3 times as much.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Message language">
            {LANGUAGES.map((l) => (
              <Button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                variant={language === l ? "default" : "outline"}
                size="sm"
                onClick={() => setLanguage(l)}
              >
                {LANGUAGE_NAMES[l]}
              </Button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || language === settings.language}
            onClick={() => start(async () => void report(await saveMessageLanguageAction({ language })))}
          >
            Save language
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Message" className="grid content-start gap-1">
          <label className="lg:hidden">
            <span className="sr-only">Message</span>
            <select
              className="bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={event}
              onChange={(e) => setEvent(e.target.value as NotificationEvent)}
            >
              {EVENTS.map((e) => (
                <option key={e} value={e}>
                  {EVENT_INFO[e].name}
                  {dirty(e) ? " (not saved)" : ""}
                </option>
              ))}
            </select>
          </label>
          {EVENTS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEvent(e)}
              aria-current={event === e ? "true" : undefined}
              className={cn(
                "hidden items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm lg:flex",
                event === e
                  ? "bg-accent font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span>{EVENT_INFO[e].name}</span>
              <span className="flex items-center gap-1">
                {dirty(e) && <span className="size-2 rounded-full bg-amber-500" aria-label="Not saved" />}
                {!drafts[e].enabled.sms && !drafts[e].enabled.email && (
                  <Badge variant="outline" className="text-[10px]">
                    Off
                  </Badge>
                )}
              </span>
            </button>
          ))}
        </nav>

        <Card>
          <CardHeader>
            <CardTitle>{info.name}</CardTitle>
            <CardDescription>{info.when}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5">
            <div className="flex flex-wrap gap-6">
              {(["sms", "email"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={d.enabled[c]}
                    onCheckedChange={(on) => set((x) => ({ ...x, enabled: { ...x.enabled, [c]: on } }))}
                  />
                  {c === "sms" ? "Send SMS" : "Send email (when the customer gave one)"}
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b">
              <div className="flex gap-1" role="tablist" aria-label="Language">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={lang === l}
                    onClick={() => setLang(l)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-2 text-sm",
                      lang === l ? "border-primary font-medium" : "text-muted-foreground border-transparent",
                    )}
                  >
                    {LANGUAGE_NAMES[l]}
                    {l === settings.language && <span className="text-muted-foreground ml-1 text-xs">(in use)</span>}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={resetLanguage}>
                <RotateCcw className="size-3.5" aria-hidden /> Default text
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">
              Placeholders:{" "}
              {info.placeholders.map((p) => (
                <code key={p} className="bg-muted mr-1 inline-block rounded px-1 py-0.5" title={PLACEHOLDERS[p]}>
                  {`{${p}}`}
                </code>
              ))}
            </p>
            {bad.length > 0 && (
              <p className="text-sm text-red-700 dark:text-red-300">
                {`{${bad[0]}}`} can&apos;t be used in this message.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Field label="SMS" htmlFor="tpl-sms">
                <Textarea
                  id="tpl-sms"
                  rows={4}
                  maxLength={480}
                  value={d.sms[lang]}
                  onChange={(e) => set((x) => ({ ...x, sms: { ...x.sms, [lang]: e.target.value } }))}
                />
              </Field>
              <div className="grid content-start gap-1.5">
                <span className="text-sm font-medium">Preview</span>
                <div className="bg-muted rounded-lg p-3 text-sm [overflow-wrap:anywhere] whitespace-pre-line">
                  {smsText}
                </div>
                <p
                  className={cn(
                    "text-xs",
                    len.segments > 2 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                  )}
                >
                  {len.segments} SMS · {len.length} characters ·{" "}
                  {len.unicode ? "Unicode (70 a segment)" : "plain (160 a segment)"}
                </p>
              </div>

              <div className="grid content-start gap-3">
                <Field label="Email subject" htmlFor="tpl-subject">
                  <Input
                    id="tpl-subject"
                    maxLength={150}
                    value={d.email[lang].subject}
                    onChange={(e) =>
                      set((x) => ({
                        ...x,
                        email: { ...x.email, [lang]: { ...x.email[lang], subject: e.target.value } },
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Email"
                  htmlFor="tpl-body"
                  hint="A blank line starts a new paragraph. Links become clickable."
                >
                  <Textarea
                    id="tpl-body"
                    rows={9}
                    maxLength={4000}
                    value={d.email[lang].body}
                    onChange={(e) =>
                      set((x) => ({ ...x, email: { ...x.email, [lang]: { ...x.email[lang], body: e.target.value } } }))
                    }
                  />
                </Field>
              </div>
              <div className="grid content-start gap-1.5">
                <span className="text-sm font-medium">Preview</span>
                <div className="rounded-lg border bg-white p-4 text-sm text-zinc-900">
                  <div className="mb-3 border-b pb-2 text-xs text-zinc-500">
                    Subject: <span className="text-zinc-900">{fillTemplate(d.email[lang].subject, emailVars)}</span>
                  </div>
                  <div className="mb-3 font-bold">{storeName}</div>
                  {fillTemplate(d.email[lang].body, emailVars)
                    .split(/\n\s*\n/)
                    .filter((p) => p.trim())
                    .map((p, i) => (
                      <p key={i} className="mb-3 [overflow-wrap:anywhere] whitespace-pre-line">
                        {p.trim()}
                      </p>
                    ))}
                  {info.placeholders.includes("invoice_link") && (
                    <span className="inline-block rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white">
                      {lang === "bn" ? "ইনভয়েস দেখুন" : "View invoice"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={pending || !dirty(event) || bad.length > 0}
                onClick={() =>
                  start(async () => {
                    if (report(await saveEventTemplatesAction({ event, ...d }))) set(() => tidy(d));
                  })
                }
              >
                {pending ? "Saving…" : `Save "${info.name}"`}
              </Button>
              <p className="text-muted-foreground text-sm">Saves both languages and the on/off switches.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
