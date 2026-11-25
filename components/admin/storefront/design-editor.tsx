"use client";

import { CheckCircle2, ListTree, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Field, selectClass } from "@/components/admin/catalog/form-bits";
import { ImagePicker } from "@/components/admin/catalog/image-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  discardDesignDraftAction,
  publishDesignAction,
  saveDesignDraftAction,
  type DesignResult,
} from "@/modules/storefront/actions";
import type { DesignState } from "@/modules/storefront/design-data";
import {
  BANGLA_FONTS,
  chatLinks,
  chatSchema,
  designProblem,
  FONTS,
  RADII,
  SOCIAL_NAMES,
  SOCIAL_NETWORKS,
  textOn,
  themeContrast,
  type Chat,
  type Design,
  type MenuItem,
  type Navigation,
  type Theme,
} from "@/modules/storefront/design";
import { dhakaInputToIso, formatDhaka, isoToDhakaInput, newSectionId } from "@/modules/storefront/sections";
import { PreviewFrame } from "./preview-frame";
import { Choice, ItemList, Text } from "./section-editors";

/**
 * Menus & theme editor (FR-SF-02, FR-SF-03, FR-AD-07): header menu with mega-menus, footer and social
 * links, announcement bar, chat button, colours, fonts, corners, light/dark, motion, logo and favicon. Changes stay in
 * a draft (previewed beside the editor) until published.
 */

export type DesignOptions = {
  links: { label: string; href: string }[];
  categoryTree: { id: string; name: string; slug: string; parentId: string | null }[];
};

const json = (v: unknown) => JSON.stringify(v);
const emptyImage = () => ({ url: "", alt: "" });
const newLink = () => ({ id: newSectionId(), label: "", href: "" });

export function DesignEditor({
  initial,
  options,
  canPublish,
}: {
  initial: DesignState;
  options: DesignOptions;
  canPublish: boolean;
}) {
  const [state, setState] = useState(initial);
  const [design, setDesign] = useState<Design>(initial.draft.design);
  const [pending, start] = useTransition();
  const [previewKey, setPreviewKey] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const linksId = useId();

  const unsaved = json(design) !== json(state.draft.design);
  const problem = designProblem(design);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const setNav = (navigation: Navigation) => setDesign((d) => ({ ...d, navigation }));
  const setTheme = (theme: Theme) => setDesign((d) => ({ ...d, theme }));
  const setChat = (chat: Chat) => setDesign((d) => ({ ...d, chat }));

  function run(fn: () => Promise<DesignResult>, sent: Design | null, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setState(res.state);
      setDesign((cur) => (sent === null || json(cur) === json(sent) ? res.state.draft.design : cur));
      setPreviewKey((k) => k + 1);
      after?.();
    });
  }

  function checked(): boolean {
    if (!problem) return true;
    toast.error(problem);
    return false;
  }

  const save = () => checked() && run(() => saveDesignDraftAction(design, state.version), design);
  const publish = () => checked() && run(() => publishDesignAction(design, state.version), design);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Link suggestions for every link field. */}
      <datalist id={linksId}>
        {options.links.map((l) => (
          <option key={l.href} value={l.href}>
            {l.label}
          </option>
        ))}
      </datalist>

      <div className="grid content-start gap-4">
        <div className="bg-background sticky top-0 z-20 grid gap-3 rounded-xl border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {unsaved ? (
              <Badge className="bg-amber-500 text-white">Unsaved changes</Badge>
            ) : state.hasChanges ? (
              <Badge variant="secondary">Draft saved · not live yet</Badge>
            ) : (
              <Badge variant="outline">Up to date with the store</Badge>
            )}
            <span className="text-muted-foreground">
              {state.published
                ? `Live version published ${formatDhaka(state.published.at)}`
                : "Not published yet: the store uses the default look"}
            </span>
          </div>
          {problem && (
            <p role="alert" className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-4 shrink-0" aria-hidden /> {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending || !unsaved} onClick={save}>
              Save draft
            </Button>
            {canPublish && (
              <Button
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={pending || (!unsaved && !state.hasChanges)}
                onClick={publish}
              >
                Publish now
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-muted-foreground"
              disabled={pending || (!unsaved && !state.hasChanges)}
              onClick={() => setConfirmDiscard(true)}
            >
              Discard changes
            </Button>
          </div>
          {!canPublish && (
            <p className="text-muted-foreground text-xs">
              You can edit and save drafts. A manager or the owner publishes them.
            </p>
          )}
        </div>

        <Tabs defaultValue="header">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="header">Header menu</TabsTrigger>
            <TabsTrigger value="footer">Footer</TabsTrigger>
            <TabsTrigger value="announcement">Announcement bar</TabsTrigger>
            <TabsTrigger value="chat">Chat button</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
          </TabsList>
          <TabsContent value="header" className="mt-4">
            <HeaderMenuEditor
              items={design.navigation.header}
              onChange={(header) => setNav({ ...design.navigation, header })}
              options={options}
              linksId={linksId}
            />
          </TabsContent>
          <TabsContent value="footer" className="mt-4">
            <FooterEditor
              footer={design.navigation.footer}
              onChange={(footer) => setNav({ ...design.navigation, footer })}
              linksId={linksId}
            />
          </TabsContent>
          <TabsContent value="announcement" className="mt-4">
            <AnnouncementEditor
              value={design.navigation.announcement}
              onChange={(announcement) => setNav({ ...design.navigation, announcement })}
              linksId={linksId}
            />
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            <ChatEditor value={design.chat} onChange={setChat} />
          </TabsContent>
          <TabsContent value="theme" className="mt-4">
            <ThemeEditor theme={design.theme} onChange={setTheme} />
          </TabsContent>
        </Tabs>
      </div>

      <PreviewFrame path="/preview/home" reloadKey={previewKey} unsaved={unsaved} pending={pending} onSave={save} />

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Throw away your changes?</DialogTitle>
            <DialogDescription>
              Menus and theme go back to what the store shows now. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => discardDesignDraftAction(state.version),
                  null,
                  () => setConfirmDiscard(false),
                )
              }
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Shared bits ----------

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="bg-card grid gap-4 rounded-xl border p-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function LinkFields({
  id,
  value,
  onChange,
  linksId,
  nameLabel = "Name",
}: {
  id: string;
  value: { label: string; href: string };
  onChange: (v: { label: string; href: string }) => void;
  linksId: string;
  nameLabel?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Text
        id={`${id}-label`}
        label={nameLabel}
        value={value.label}
        onChange={(label) => onChange({ ...value, label })}
        max={40}
      />
      <Field label="Link" htmlFor={`${id}-href`} hint="Pick a suggestion or type /… or https://…">
        <Input
          id={`${id}-href`}
          list={linksId}
          maxLength={500}
          value={value.href}
          placeholder="/c/kitchen"
          onChange={(e) => onChange({ ...value, href: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ---------- Header menu ----------

function HeaderMenuEditor({
  items,
  onChange,
  options,
  linksId,
}: {
  items: MenuItem[];
  onChange: (items: MenuItem[]) => void;
  options: DesignOptions;
  linksId: string;
}) {
  function fromCategories() {
    const tree = options.categoryTree;
    const kids = (id: string | null) => tree.filter((c) => c.parentId === id);
    const next: MenuItem[] = kids(null)
      .slice(0, 8)
      .map((top) => ({
        id: newSectionId(),
        label: top.name.slice(0, 40),
        href: `/c/${top.slug}`,
        badge: "",
        image: emptyImage(),
        children: kids(top.id)
          .slice(0, 6)
          .map((col) => ({
            id: newSectionId(),
            label: col.name.slice(0, 40),
            href: `/c/${col.slug}`,
            children: kids(col.id)
              .slice(0, 12)
              .map((l) => ({ id: newSectionId(), label: l.name.slice(0, 40), href: `/c/${l.slug}` })),
          })),
      }));
    if (!next.length) return toast.error("There are no visible categories yet.");
    onChange(next);
    toast.success("Menu filled from your categories. Edit it as you like.");
  }

  return (
    <div className="grid gap-4">
      <Card
        title="Header menu"
        description="Up to 8 items. An item with groups opens a menu; groups with links make it a large mega-menu. Leave empty to list your top-level categories automatically."
      >
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={fromCategories}>
          <ListTree className="size-4" aria-hidden />{" "}
          {items.length ? "Replace with my categories" : "Fill from my categories"}
        </Button>
        <ItemList
          items={items}
          min={0}
          max={8}
          noun="Menu item"
          onChange={onChange}
          make={() => ({ ...newLink(), badge: "", image: emptyImage(), children: [] })}
          render={(item, set) => (
            <>
              <LinkFields id={item.id} value={item} onChange={(v) => set({ ...item, ...v })} linksId={linksId} />
              <Text
                id={`${item.id}-badge`}
                label="Small badge (optional)"
                value={item.badge}
                onChange={(badge) => set({ ...item, badge })}
                max={12}
                placeholder="New"
              />
              <div className="grid gap-2">
                <p className="text-sm font-medium">Groups in its menu</p>
                <ItemList
                  items={item.children}
                  min={0}
                  max={6}
                  noun="Group"
                  onChange={(children) => set({ ...item, children })}
                  make={() => ({ ...newLink(), children: [] })}
                  render={(col, setCol) => (
                    <>
                      <LinkFields
                        id={col.id}
                        nameLabel="Group name"
                        value={col}
                        onChange={(v) => setCol({ ...col, ...v })}
                        linksId={linksId}
                      />
                      <ItemList
                        items={col.children}
                        min={0}
                        max={12}
                        noun="Link"
                        onChange={(children) => setCol({ ...col, children })}
                        make={newLink}
                        render={(l, setL) => (
                          <LinkFields id={l.id} value={l} onChange={(v) => setL({ ...l, ...v })} linksId={linksId} />
                        )}
                      />
                    </>
                  )}
                />
              </div>
              {item.children.some((c) => c.children.length > 0) && (
                <Field label="Mega-menu picture (optional)" htmlFor={`${item.id}-img`} hint="Portrait, about 640 × 800">
                  <ImagePicker id={`${item.id}-img`} value={item.image} onChange={(image) => set({ ...item, image })} />
                </Field>
              )}
            </>
          )}
        />
      </Card>
    </div>
  );
}

// ---------- Footer ----------

function FooterEditor({
  footer,
  onChange,
  linksId,
}: {
  footer: Navigation["footer"];
  onChange: (f: Navigation["footer"]) => void;
  linksId: string;
}) {
  const socialUrl = (n: (typeof SOCIAL_NETWORKS)[number]) => footer.social.find((s) => s.network === n)?.url ?? "";
  const setSocial = (n: (typeof SOCIAL_NETWORKS)[number], url: string) =>
    onChange({
      ...footer,
      social: SOCIAL_NETWORKS.flatMap((k) => {
        const u = k === n ? url : socialUrl(k);
        return u ? [{ network: k, url: u }] : [];
      }),
    });
  return (
    <div className="grid gap-4">
      <Card title="About the shop">
        <Text
          id="footer-about"
          label="Short text"
          value={footer.about}
          onChange={(about) => onChange({ ...footer, about })}
          max={300}
          multiline
          rows={3}
        />
      </Card>
      <Card title="Link columns" description="Up to 4 columns, e.g. Shop, Help, Company.">
        <ItemList
          items={footer.columns}
          min={0}
          max={4}
          noun="Column"
          onChange={(columns) => onChange({ ...footer, columns })}
          make={() => ({ id: newSectionId(), heading: "", links: [] })}
          render={(col, setCol) => (
            <>
              <Text
                id={`${col.id}-heading`}
                label="Column heading"
                value={col.heading}
                onChange={(heading) => setCol({ ...col, heading })}
                max={40}
              />
              <ItemList
                items={col.links}
                min={0}
                max={10}
                noun="Link"
                onChange={(links) => setCol({ ...col, links })}
                make={newLink}
                render={(l, setL) => (
                  <LinkFields id={l.id} value={l} onChange={(v) => setL({ ...l, ...v })} linksId={linksId} />
                )}
              />
            </>
          )}
        />
      </Card>
      <Card title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text
            id="footer-phone"
            label="Phone"
            value={footer.phone}
            onChange={(phone) => onChange({ ...footer, phone })}
            max={30}
            placeholder="+880 1700-000000"
          />
          <Field label="Email" htmlFor="footer-email">
            <Input
              id="footer-email"
              type="email"
              maxLength={254}
              value={footer.email}
              onChange={(e) => onChange({ ...footer, email: e.target.value.trim() })}
            />
          </Field>
        </div>
        <Text
          id="footer-address"
          label="Address"
          value={footer.address}
          onChange={(address) => onChange({ ...footer, address })}
          max={200}
          multiline
          rows={2}
        />
      </Card>
      <Card title="Social links" description="Full https:// links. Leave empty to hide.">
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((n) => (
            <Field key={n} label={SOCIAL_NAMES[n]} htmlFor={`social-${n}`}>
              <Input
                id={`social-${n}`}
                maxLength={500}
                value={socialUrl(n)}
                placeholder={n === "whatsapp" ? "https://wa.me/8801700000000" : `https://${n}.com/…`}
                onChange={(e) => setSocial(n, e.target.value.trim())}
              />
            </Field>
          ))}
        </div>
      </Card>
      <Card title="Bottom line">
        <Text
          id="footer-bottom"
          label="Text after © shop name"
          value={footer.bottomText}
          onChange={(bottomText) => onChange({ ...footer, bottomText })}
          max={120}
          placeholder="Trade licence 123456"
        />
      </Card>
    </div>
  );
}

// ---------- Announcement bar ----------

function AnnouncementEditor({
  value: a,
  onChange,
  linksId,
}: {
  value: Navigation["announcement"];
  onChange: (a: Navigation["announcement"]) => void;
  linksId: string;
}) {
  return (
    <Card
      title="Announcement bar"
      description="A thin strip above the header, e.g. “Free delivery in Dhaka over ৳1,500”."
    >
      <label className="flex items-center gap-3 text-sm font-medium">
        <Switch checked={a.enabled} onCheckedChange={(enabled) => onChange({ ...a, enabled })} />
        Show the announcement bar
      </label>
      <ItemList
        items={a.messages}
        min={0}
        max={3}
        noun="Message"
        onChange={(messages) => onChange({ ...a, messages })}
        make={() => ({ text: "", href: "" })}
        render={(m, set, i) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Text id={`ann-${i}-text`} label="Text" value={m.text} onChange={(text) => set({ ...m, text })} max={120} />
            <Field label="Link (optional)" htmlFor={`ann-${i}-href`}>
              <Input
                id={`ann-${i}-href`}
                list={linksId}
                maxLength={500}
                value={m.href}
                onChange={(e) => set({ ...m, href: e.target.value })}
              />
            </Field>
          </div>
        )}
      />
      {a.messages.length > 1 && <p className="text-muted-foreground text-xs">Messages take turns every 5 seconds.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          id="ann-style"
          label="Colours"
          value={a.style}
          onChange={(style) => onChange({ ...a, style })}
          options={[
            ["brand", "Brand colour"],
            ["dark", "Dark"],
            ["accent", "Accent colour"],
          ]}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={a.dismissible} onCheckedChange={(v) => onChange({ ...a, dismissible: v === true })} />
          Shoppers can close it
        </label>
        <Field label="Start showing (optional)" htmlFor="ann-start" hint="Bangladesh time">
          <Input
            id="ann-start"
            type="datetime-local"
            value={isoToDhakaInput(a.startAt)}
            onChange={(e) => onChange({ ...a, startAt: dhakaInputToIso(e.target.value) })}
          />
        </Field>
        <Field label="Stop showing (optional)" htmlFor="ann-end" hint="Bangladesh time">
          <Input
            id="ann-end"
            type="datetime-local"
            value={isoToDhakaInput(a.endAt)}
            onChange={(e) => onChange({ ...a, endAt: dhakaInputToIso(e.target.value) })}
          />
        </Field>
      </div>
    </Card>
  );
}

// ---------- Chat button ----------

function ChatEditor({ value: c, onChange }: { value: Chat; onChange: (c: Chat) => void }) {
  // What the store will link to once saved (numbers typed the local way get the country code). The
  // store adds the shopper's page address to the message; the test link has only the greeting.
  const parsed = chatSchema.safeParse(c);
  const links = parsed.success ? chatLinks(parsed.data) : null;
  return (
    <Card
      title="Chat button"
      description="A round button in the bottom corner of every store page that opens WhatsApp or Messenger."
    >
      <label className="flex items-center gap-3 text-sm font-medium">
        <Switch checked={c.enabled} onCheckedChange={(enabled) => onChange({ ...c, enabled })} />
        Show the chat button
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          id="chat-wa"
          label="WhatsApp number"
          value={c.whatsapp}
          onChange={(whatsapp) => onChange({ ...c, whatsapp })}
          max={24}
          placeholder="01712345678"
          hint="The number your WhatsApp (Business) app uses. Leave empty to show only Messenger."
        />
        <Text
          id="chat-fb"
          label="Facebook page (Messenger)"
          value={c.messenger}
          onChange={(messenger) => onChange({ ...c, messenger })}
          max={200}
          placeholder="mystore.bd"
          hint="Your page’s username or its facebook.com link. Leave empty to show only WhatsApp."
        />
      </div>
      <Text
        id="chat-greeting"
        label="Message typed for the shopper (WhatsApp)"
        value={c.greeting}
        onChange={(greeting) => onChange({ ...c, greeting })}
        max={200}
        multiline
        rows={2}
        hint="WhatsApp opens with this ready to send; the shopper can change it."
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={c.pageLink} onCheckedChange={(v) => onChange({ ...c, pageLink: v === true })} />
        Add the page they are on (so you know which product they mean)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          id="chat-label"
          label="Button text (computers)"
          value={c.label}
          onChange={(label) => onChange({ ...c, label })}
          max={30}
          hint="Phones show only the icon."
        />
        <Choice
          id="chat-position"
          label="Corner"
          value={c.position}
          onChange={(position) => onChange({ ...c, position })}
          options={[
            ["right", "Bottom right"],
            ["left", "Bottom left"],
          ]}
        />
      </div>
      {links && (links.whatsapp || links.messenger) && (
        <div className="text-muted-foreground grid gap-1 text-xs">
          <p>Try the links before publishing:</p>
          {links.whatsapp && (
            <a
              href={links.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand break-all underline"
            >
              {links.whatsapp}
            </a>
          )}
          {links.messenger && (
            <a
              href={links.messenger}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand break-all underline"
            >
              {links.messenger}
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Theme ----------

function ColourField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  const [draft, setDraft] = useState(value);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setDraft(value);
  }
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={draft}
          maxLength={7}
          className="font-mono"
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
    </Field>
  );
}

function FontSelect<T extends string>({
  id,
  label,
  value,
  fonts,
  onChange,
  sample,
}: {
  id: string;
  label: string;
  value: T;
  fonts: Record<T, string>;
  onChange: (v: T) => void;
  sample: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.entries(fonts) as [T, string][]).map(([k, name]) => (
          <option key={k} value={k}>
            {name}
          </option>
        ))}
      </select>
      <p className="truncate text-lg" style={{ fontFamily: `var(--ff-${value})` }}>
        {sample}
      </p>
    </Field>
  );
}

function ThemeEditor({ theme: t, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const checks = themeContrast(t);
  return (
    <div className="grid gap-4">
      <Card title="Colours">
        <div className="grid gap-3 sm:grid-cols-2">
          <ColourField
            id="theme-brand"
            label="Brand colour"
            value={t.brand}
            onChange={(brand) => onChange({ ...t, brand })}
            hint="Buttons, prices, links, highlights"
          />
          <ColourField
            id="theme-accent"
            label="Accent colour"
            value={t.accent}
            onChange={(accent) => onChange({ ...t, accent })}
            hint="Soft backgrounds (menu hover, chips)"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: t.brand, color: textOn(t.brand) }}
          >
            Button
          </span>
          <span className="text-sm font-semibold" style={{ color: t.brand }}>
            ৳1,450 · Link
          </span>
          <span className="rounded-full px-3 py-1 text-sm" style={{ background: t.accent, color: textOn(t.accent) }}>
            Accent
          </span>
        </div>
        <ul className="grid gap-1 text-sm" aria-label="Contrast checks">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              {c.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label="Passes" />
              ) : (
                <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-label="Hard to read" />
              )}
              <span>
                {c.label}: <span className="tabular-nums">{c.ratio}:1</span>{" "}
                <span className="text-muted-foreground">({c.hint})</span>
              </span>
            </li>
          ))}
        </ul>
        {checks.some((c) => !c.ok) && (
          <p className="text-muted-foreground text-xs">
            Some text may be hard to read with these colours. Try a darker (or, for a dark store, lighter) shade.
          </p>
        )}
      </Card>

      <Card title="Fonts" description="All fonts are stored on our own server, so they load fast and work offline.">
        <div className="grid gap-3 sm:grid-cols-3">
          <FontSelect
            id="theme-body-font"
            label="Text"
            value={t.bodyFont}
            fonts={FONTS}
            onChange={(bodyFont) => onChange({ ...t, bodyFont })}
            sample="Smart gadgets for home"
          />
          <FontSelect
            id="theme-heading-font"
            label="Headings"
            value={t.headingFont}
            fonts={FONTS}
            onChange={(headingFont) => onChange({ ...t, headingFont })}
            sample="Winter sale"
          />
          <FontSelect
            id="theme-bangla-font"
            label="Bangla"
            value={t.banglaFont}
            fonts={BANGLA_FONTS}
            onChange={(banglaFont) => onChange({ ...t, banglaFont })}
            sample="ঘরের জন্য স্মার্ট গ্যাজেট"
          />
        </div>
      </Card>

      <Card title="Look and feel">
        <div className="grid gap-3 sm:grid-cols-3">
          <Choice
            id="theme-radius"
            label="Corners"
            value={t.radius}
            onChange={(radius) => onChange({ ...t, radius })}
            options={(Object.keys(RADII) as (keyof typeof RADII)[]).map(
              (k) =>
                [
                  k,
                  { none: "Square", small: "Slightly rounded", medium: "Rounded", large: "Very rounded" }[k],
                ] as const,
            )}
          />
          <Choice
            id="theme-mode"
            label="Light or dark"
            value={t.mode}
            onChange={(mode) => onChange({ ...t, mode })}
            options={[
              ["system", "Follow the shopper’s device"],
              ["light", "Always light"],
              ["dark", "Always dark"],
            ]}
          />
          <Choice
            id="theme-motion"
            label="Animations"
            value={t.motion}
            onChange={(motion) => onChange({ ...t, motion })}
            options={[
              ["full", "Full"],
              ["reduced", "Reduced (fades only)"],
              ["off", "Off"],
            ]}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Shoppers who turned on “reduce motion” on their phone or computer always get reduced animations.
        </p>
      </Card>

      <Card title="Logo and browser icon">
        <Field
          label="Logo (optional)"
          htmlFor="theme-logo"
          hint="A wide PNG or SVG with a transparent background. Without a logo the shop name is shown."
        >
          <ImagePicker id="theme-logo" value={t.logo} onChange={(logo) => onChange({ ...t, logo })} />
        </Field>
        <Field label="Logo height (pixels)" htmlFor="theme-logo-height" hint="20 to 64">
          <Input
            id="theme-logo-height"
            type="number"
            min={20}
            max={64}
            className="w-28"
            value={t.logoHeight}
            onChange={(e) =>
              onChange({ ...t, logoHeight: Math.min(64, Math.max(20, Math.round(Number(e.target.value)) || 32)) })
            }
          />
        </Field>
        <Field
          label="Browser icon (favicon)"
          htmlFor="theme-favicon"
          hint="Square PNG, at least 192 × 192. Shown in browser tabs once published."
        >
          <ImagePicker id="theme-favicon" value={t.favicon} onChange={(favicon) => onChange({ ...t, favicon })} />
        </Field>
      </Card>
    </div>
  );
}
