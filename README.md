# China Import Store (BD) — E-commerce Website

Single-brand store for China-imported kitchen, home and lifestyle gadgets in Bangladesh.
Two parts: a motion-rich **storefront** and an **admin panel** that controls everything (products, orders,
customers, and every section, banner, menu and colour of the storefront).

- **Spec:** [docs/SRS.docx](docs/SRS.docx) (text copy: [docs/SRS.txt](docs/SRS.txt)). Requirement IDs such as `FR-CO-05` or `NFR-SEC-07` below refer to it.
- **Payment v1:** Cash on Delivery + optional manual bKash/Nagad advance with TrxID. No gateway until a merchant account exists.
- **Stack:** Next.js (App Router) + TypeScript (strict) + MongoDB (Mongoose) + Redis/BullMQ + Tailwind + shadcn/ui + Framer Motion + GSAP (+ optional React Three Fiber).

> This README is the project's living log. Every step is ticked off here as it is finished, and a dated
> entry is added to the [Progress log](#progress-log) at the bottom.

---

## How we work (the process)

Every step in the phases below goes through the same loop:

1. **Plan** — pick the next unticked step, list the SRS requirement IDs it covers.
2. **Build** — write the code in the right module (`modules/*` for business logic, `app/*` for UI/routes).
3. **Test** — unit tests (Vitest) for logic, Playwright for user flows; run lint + typecheck.
4. **Verify** — run the app locally and check the feature works in the browser.
5. **Log** — tick the step here, add a Progress log entry (what was done, what is left, anything you must do).
6. **Review & commit** — you review; we commit to git with a clear message (one commit or PR per step).

A phase is only "done" when its checklist is ticked **and** its acceptance checks pass.

Rules we keep from day one (from the SRS, cheaper to do now than to retrofit):

- Money is stored as integers in **poisha** (৳1 = 100). Never floats.
- The server recalculates every price, delivery charge, coupon and stock check. The browser is never trusted.
- Every admin route / server action checks permissions on the server (RBAC), not just by hiding buttons.
- All input is validated with shared **Zod** schemas.
- Every admin action is written to the append-only **audit log**.
- Secrets live only in `.env` / secrets manager, never in git.

---

## Folder layout

```
EcommerceHome/
├─ app/
│  ├─ (store)/          # public storefront (static/ISR pages): home, account, sign-in/up
│  ├─ admin/            # admin panel (rendered per request): sign-in, set-password, (panel)/…
│  └─ api/              # route handlers: auth, media signing, health (later: webhooks, invoice link)
├─ modules/             # business logic, no UI
│  ├─ auth/             # Better Auth config, RBAC, session guards, lockout, admin route map
│  ├─ audit/  staff/  media/  notifications/  system/  shared/ (counters, soft delete)
│  └─ (later) catalog/  inventory/  orders/  cms/  shipping/  settings/
├─ components/          # ui/ (shadcn), motion/ (Reveal, Lift…), auth/, admin/
├─ lib/                 # env, db, redis, queue, logger, money, phone, crypto, rate limit, CSP
├─ proxy.ts             # admin gate (session, role, permission → 403) + nonce CSP
├─ worker/              # BullMQ worker process (`pnpm worker`)
├─ scripts/             # create-owner
├─ tests/               # Vitest unit tests (Playwright end-to-end later)
├─ docker-compose.yml   # local MongoDB (port 27018), Redis, Mailpit
└─ docs/                # SRS
```

---

## Phases and steps

Estimates come from the SRS (two part-time developers). Adjust to real availability.

### Phase 0 — Foundation (2–3 weeks)

- [x] 0.1 Initialise repo: git, Next.js 16.4 (App Router) + TypeScript strict, pnpm, ESLint, Prettier, folder layout below
- [x] 0.2 Local environment: `docker-compose.yml` with MongoDB 8 (single-node replica set for transactions), Redis 7, Mailpit; `.env.example`; typed env loader (`lib/env.ts`)
- [x] 0.3 CI: GitHub Actions running lint, typecheck, tests, build; `pnpm audit` for critical vulnerabilities; Dependabot (NFR-SEC-17) — _runs on first push_
- [x] 0.4 Design system: Tailwind 4 + shadcn/ui (Radix), theme tokens as CSS variables (FR-SF-03), Plus Jakarta Sans + Hind Siliguri (Bangla), motion primitives `Reveal` / `Stagger` / `Lift` with admin motion level + OS reduce-motion (FR-SF-04/05)
- [x] 0.5 Database layer: Mongoose + native driver connections, poisha money helpers, soft-delete plugin, `counters` collection with atomic `nextSequence()` (checked: 50 parallel calls → 50 unique numbers)
- [x] 0.6 Auth for customers: Google OAuth (needs keys), email + password and phone + password sign-in, Argon2id, breached-password check (production), account linking, email verification, phone OTP, HttpOnly cookies (FR-AC-01…05, NFR-SEC-01…03) — _phone-only sign-up moves to Phase 2 with real SMS_
- [x] 0.7 Admin auth: separate `/admin`, staff invite by email, email + password sign-in with lockout, session count + "sign out all" per staff member (FR-AD-09) — _2FA removed on 2026-11-20 at your request (SRS NFR-SEC-04 not applied); can be added back later_
- [x] 0.8 RBAC: Staff / Manager / Owner with granular permissions (`orders.confirm`, `staff.manage`…), checked in `proxy.ts` (real HTTP 403), in every page, server action and route handler (NFR-SEC-07)
- [x] 0.9 Audit log: append-only `auditLogs` (updates/deletes throw), before/after, IP, user agent, secrets scrubbed; viewer at `/admin/audit` (FR-AD-10, NFR-SEC-16)
- [x] 0.10 Security baseline: CSP (strict nonce CSP on admin, locked-down CSP on storefront), HSTS on HTTPS, nosniff, frame-deny, Permissions-Policy; Redis rate limits; 5-fail / 15-min account lockout; CSRF via origin checks + SameSite cookies; Zod validation; Mongo filter sanitising (NFR-SEC-05, 09, 11, 12)
- [x] 0.11 Media upload pipeline: signed direct-to-Cloudinary uploads (`/api/media/sign`), type/size limits, magic-byte sniffing helper (NFR-SEC-15) — _needs Cloudinary keys to try for real_
- [x] 0.12 Worker: BullMQ `notifications` queue (SMS + email), 5 retries with exponential back-off, failed jobs kept and retryable from `/admin/system` (NFR-SC-05)

**Done when:** a staff user can sign in, sees only what their role allows, every action shows in the audit log, and CI is green.
✅ Verified locally on 2026-11-19 (see Progress log). CI goes green on the first push to GitHub.

### Phase 1 — Catalogue + storefront (3–4 weeks)

- [x] 1.1 Categories and collections (manual + rule-based) — admin CRUD (FR-AD-03)
- [x] 1.2 Products + variants: CRUD, duplicate, archive, per-variant price/stock/SKU/weight/images, SEO fields (FR-AD-02, FR-PD-02, FR-PD-08)
- [x] 1.3 Product media: multiple images + videos, focal point, alt text, hover image choice — _admin side done; storefront display comes with 1.5/1.7_
- [x] 1.4 Inventory: stock per variant, low-stock threshold, movement history, purchase batches with landed cost (FR-AD-04)
- [x] 1.5 Product card: hover image swap, pop/lift with action bar, labels, stock badge, no layout shift (FR-PC-01…03, 07) — _real Add to cart comes with the cart (2.2), wishlist with 2.14_
- [x] 1.6 Quick-view modal with shareable URL (FR-PC-04) — _Add to cart button switches on with the cart (2.2)_
- [x] 1.7 Product detail page: gallery with video, zoom, lightbox, variant picker, rich description blocks, sticky mobile add-to-cart (FR-PD-01…03, 05) — _Order now / Add to cart switch on with the cart and checkout (2.2, 2.3)_
- [x] 1.8 Category / collection pages: filters, sorting, pagination or infinite scroll (FR-SF-07)
- [x] 1.9 Search: typo tolerance + suggestions (FR-SF-08) — _built into the app (local Docker MongoDB has no Atlas Search); can move to Atlas Search / Meilisearch for a very large catalogue_
- [x] 1.10 Storefront builder: sections per page (hero, carousel, grid, banners, video, FAQ…), reorder, schedule, hide, draft + preview + publish (FR-SF-01, FR-AD-07)
- [x] 1.11 Navigation + theme editor: header, mega-menu, footer, announcement bar, colours, fonts, motion level (FR-SF-02, 03)
- [x] 1.12 CMS pages with block editor (About, Privacy, Terms, Returns, Shipping, FAQ, Contact) (FR-SF-09)
- [x] 1.13 Scroll motion: reveal, page transitions, parallax hero, GSAP pinned story section, lazy-loaded (FR-SF-04, NFR-PF-02/03)
- [x] 1.14 WhatsApp / Messenger floating button (FR-SF-10)
- [x] 1.15 ISR + on-demand revalidation when admin saves content (NFR-SC-02)

**Done when:** a manager adds a product with 6 images + 2 videos and sees it live within 1 minute without redeploy, and can rearrange home-page sections with preview.

### Phase 2 — Orders (launch-critical, 3–4 weeks)

- [x] 2.1 Locations (division/district/area) seed data + delivery zones and charge rules in admin (FR-AD-08)
- [x] 2.2 Cart: drawer + page, guest persistence, merge on sign-in (FR-CO-01)
- [x] 2.3 Checkout form with live totals and zone/weight delivery charge (FR-CO-02, SRS §2.2–2.3)
- [x] 2.4 SMS adapter (BTRC-listed provider) + phone OTP with limits (FR-CO-03, SRS §2.4)
- [x] 2.5 Payment options: COD, COD + delivery advance, full advance with sender number + unique TrxID; wallet numbers + QR from settings
- [x] 2.6 Coupons (FR-CO-04)
- [x] 2.7 Order placement: server re-validation, idempotency key, MongoDB transaction, atomic stock reservation, order number counter (FR-CO-05…07, NFR-SC-07)
- [x] 2.8 Risk score + blocked contacts + rules that require advance (SRS §2.4)
- [x] 2.9 Admin orders: pending queue, click-to-call, call log, notes, edit before confirm, confirm/cancel with reason, bulk actions (FR-OR-08/09, FR-AD-05)
- [x] 2.10 Order state machine + separate payment status, enforced on server (FR-OR-01/02)
- [x] 2.11 Invoice: sequential number, PDF with Bangla font, signed token link with expiry/revoke (FR-OR-03…05)
- [x] 2.12 Email adapter (Resend/SES/Brevo) + React Email templates; editable SMS/email templates; notification log with retry (FR-OR-06/07)
- [ ] 2.13 Steadfast courier adapter: book single/bulk, tracking code, status polling/webhook (SRS §8.4) — _on hold until you have a Steadfast merchant account; built after that_
- [x] 2.14 Customer account area: addresses, order history timeline, invoice download, re-order, wishlist; guest order tracking (FR-AC-06/07)
- [x] 2.15 Customers admin + dashboard (FR-AD-01, FR-AD-06)
- [x] 2.16 Integrations settings page with encrypted keys (FR-AD-12, NFR-SEC-13)
- [x] 2.17 Manual order form for Facebook/WhatsApp orders (Open question 9)

**Done when:** all "Ordering and confirmation" acceptance criteria in SRS §9.1 pass.

### Phase 3 — Hardening + launch (1–2 weeks)

- [ ] 3.1 Security review: headers scan (grade A), OWASP ZAP baseline, dependency scan clean
- [ ] 3.2 Load test with k6: 500 concurrent users, 20 orders/min for 10 min
- [ ] 3.3 Core Web Vitals pass on mobile (LCP ≤ 2.5 s, CLS ≤ 0.1)
- [ ] 3.4 SEO: sitemap, robots, structured data, OG images (NFR-UX-01)
- [ ] 3.5 Analytics: Meta Pixel + Conversions API, GA4, TikTok (FR-AD-13)
- [ ] 3.6 Production deploy: VPS + Docker Compose behind Cloudflare, Sentry, uptime alerts, logs (NFR-AV-*)
- [ ] 3.7 Backups (daily, 30 days) + restore test on staging (NFR-SEC-19)
- [ ] 3.8 Real data entry + full acceptance run (SRS §9.1) + staff training
- [ ] 3.9 🚀 Launch

### Phase 4 — Growth (ongoing, after launch)

- [ ] 4.1 Reviews with photos, moderated (FR-PD-06)
- [ ] 4.2 Related products + bundles (FR-PD-07)
- [ ] 4.3 Abandoned-checkout follow-up (FR-CO-08)
- [ ] 4.4 Pathao / RedX adapters, COD payout reconciliation
- [ ] 4.5 Reports with profit per product (FR-AD-11)
- [ ] 4.6 Full Bangla UI (FR-SF-11)
- [ ] 4.7 PWA (FR-SF-12)
- [ ] 4.8 3D product viewer (FR-SF-06), card styles (FR-PC-06), video-on-hover (FR-PC-05)

### Phase 5 — Online payments (1–2 weeks, when a merchant account exists)

- [ ] 5.1 PaymentProvider adapter: bKash Checkout, Nagad merchant and/or SSLCommerz

---

## What the owners need to provide (and when)

### Before Phase 0 starts

- [ ] **Store name** (needed for the repo, theme and later the domain) — placeholder "China Import Store" is used via `STORE_NAME` until then
- [x] **GitHub account / repository** — `showorv/EcommerceHome` (make sure it is private)
- [ ] Confirm or change the SRS defaults in [Open decisions](#open-decisions) below
- [x] Node.js, pnpm, Docker, Git installed on this Mac (already present)

### During Phase 0

- [ ] **Google Cloud** project + OAuth client (Web) for sign-in. Authorised JavaScript origin `http://localhost:3000`, redirect URI `http://localhost:3000/api/auth/callback/google` (add the real domain later). Put the ID/secret in `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The "Continue with Google" button appears automatically once they are set.
- [ ] **Cloudinary** account (free tier) for images/videos — put `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env.local`
- [ ] **MongoDB Atlas** account (free cluster for staging; Singapore or Mumbai region) — local Docker is used for development

### Start early — these take time (needed before Phase 2)

- [ ] **Domain name** bought, DNS on **Cloudflare**
- [ ] **SMS provider** account with a BTRC-listed aggregator (compare 2–3) + **masking sender ID registration** (slow — start now)
- [ ] **bKash Personal Retail Account** and/or **Nagad** receiving numbers + their QR images
- [ ] **Steadfast** merchant account + API key and secret
- [ ] **Email provider** (Resend recommended) — I will give the SPF/DKIM/DMARC records to add
- [ ] Delivery charges per zone that match your courier contract

### Content (needed for Phase 1–3)

- [ ] Logo, favicon, brand colours (or let us pick)
- [ ] Product data: names, descriptions, photos, short videos, prices, compare-at prices, weights, landed cost, stock per variant
- [ ] Category list
- [ ] Policy texts: return/refund, shipping, privacy, terms, about, FAQ, contact
- [ ] SMS/email wording if you want something different from the defaults

### Before launch (Phase 3)

- [ ] **VPS** (DigitalOcean/Hetzner, Singapore) or Vercel account
- [ ] **Sentry** account, uptime monitor (e.g. UptimeRobot)
- [ ] Meta Pixel ID + Conversions API token, GA4 ID, TikTok Pixel (if used)
- [ ] Staff list (names, emails, roles)
- [ ] Do the acceptance test run with us on staging

---

## Open decisions

SRS §10 defaults are used until you say otherwise.

| #   | Question                                                  | Default being used                                                                          |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Store name, domain, SMS sender ID                         | **Needed from you**                                                                         |
| 2   | Advance for all outside-Dhaka orders, or only risky ones? | Risk-based: new customers outside Dhaka + orders above ৳3,000                               |
| 3   | Receiving account                                         | bKash PRA + Nagad, both with QR at checkout                                                 |
| 4   | Courier at launch                                         | Steadfast; Pathao in Phase 4                                                                |
| 5   | Hosting                                                   | One VPS with Docker behind Cloudflare                                                       |
| 6   | Media                                                     | Cloudinary free tier                                                                        |
| 7   | Bangla UI at launch?                                      | English UI, Bangla product names/descriptions; full Bangla in Phase 4                       |
| 8   | Return policy                                             | 3-day change of mind for unused items, customer pays return delivery; defects replaced free |
| 9   | Orders from Facebook/WhatsApp chats?                      | Yes, admin manual-order form                                                                |
| 10  | VAT/BIN on invoices?                                      | Not at launch; optional BIN field                                                           |

---

## Running locally

Needs Node 24+, pnpm and Docker Desktop (running).

```bash
pnpm install
cp .env.example .env.local      # then fill BETTER_AUTH_SECRET and ENCRYPTION_KEY:
openssl rand -base64 48         # → BETTER_AUTH_SECRET
openssl rand -base64 32         # → ENCRYPTION_KEY
pnpm services:up                # MongoDB (localhost:27018), Redis, Mailpit
```

Then, in two terminals:

```bash
pnpm dev        # web app → http://localhost:3000
pnpm worker     # background jobs (emails, SMS). Dev SMS + OTP codes are printed here.
```

Create the first owner account (once):

```bash
pnpm owner:create --email you@example.com --name "Your Name"
```

`--name` can be left out (`pnpm owner:create --email you@example.com Your Name` works too). Keep `pnpm worker`
running so the email is sent. Open it in Mailpit (http://localhost:8025), set a password, sign in at
http://localhost:3000/admin with your email and password.

| Command                     | What it does                                            |
| --------------------------- | ------------------------------------------------------- |
| `pnpm check`                | lint + typecheck + unit tests (run before every commit) |
| `pnpm build` / `pnpm start` | production build / run it                               |
| `pnpm format`               | Prettier                                                |
| `pnpm services:down`        | stop Docker services (data is kept in volumes)          |

> MongoDB runs on host port **27018**, not 27017, because a Homebrew MongoDB is already using 27017 on this Mac.

### Email: local vs real

- **Locally, no email leaves your computer.** `SMTP_HOST=localhost` / `SMTP_PORT=1025` point at Mailpit, which
  catches every email (invites, password resets, verification). Read them at http://localhost:8025, even ones
  addressed to a real Gmail.
- **To send real email**, only `.env.local` (or the server's env) changes; the code stays the same. Example with Resend:

  ```bash
  SMTP_HOST=smtp.resend.com
  SMTP_PORT=465            # 465 = TLS on connect
  SMTP_USER=resend
  SMTP_PASS=re_xxx         # your Resend API key
  EMAIL_FROM="China Import Store <no-reply@yourdomain.com>"
  ```

  Then verify `yourdomain.com` in the provider (add the SPF, DKIM and DMARC DNS records it shows you), or emails
  land in spam or get rejected. Restart `pnpm worker` after changing these; the worker is the process that sends.
  Brevo or Amazon SES work the same way with their own host, user and password.

### SMS: local vs real

- **Locally, no SMS leaves your computer.** `SMS_PROVIDER=console` prints every message, including checkout
  and login codes, in the `pnpm worker` output.
- **To send real SMS**, set these in the server's env and restart `pnpm worker`:

  ```bash
  SMS_PROVIDER=alpha           # Alpha SMS (sms.net.bd), a BTRC-listed A2P provider
  ALPHA_SMS_API_KEY=xxx        # from the Alpha SMS panel → API
  SMS_SENDER_ID=YOURBRAND      # optional: your approved masking name; empty = numeric sender
  # SMS_FALLBACK_PROVIDER=     # optional second provider, tried when the first one fails
  ```

  A bad key, a bad number or blocked text stops at once and shows in the failed list at `/admin/system`; a
  network error, low balance or a provider outage is retried. Codes are tried 3 times within about 10
  seconds and never kept after sending.

### Security notes for later phases

- **Production database user:** give the app's MongoDB user `insert` + `find` only on `auditLogs` (no update/delete), so the audit log stays append-only even if the app is compromised.
- **Storefront CSP** allows inline scripts because static/ISR pages can't carry a per-request nonce (Next.js limitation). The admin area, which handles sensitive data, uses a strict nonce + `strict-dynamic` policy. Revisit Next's experimental SRI (hash-based CSP) in Phase 3.
- **Dev SMS** (`SMS_PROVIDER=console`) prints full messages, including OTP codes, to the worker log. Production must use a real provider.
- Set `CLIENT_IP_HEADER=cf-connecting-ip` behind Cloudflare so rate limits use the real visitor IP.

---

## Progress log

Newest first. Each entry: date · step · what changed · what is left / needed from you.

### 2026-11-22 · Phase 2.17 — Manual orders from Facebook and WhatsApp

- **Orders → New order** (Open question 9), for staff and up (new permission _orders.create_). For
  orders taken in a Facebook or WhatsApp chat, on a call, or elsewhere.
  - Choose where it came from, add products (search by name or SKU, today's prices, how many are
    free), the customer, district, area and address.
  - **Amounts:** an optional discount; the delivery charge is the zone's, and staff can type another.
    The total, COD fee and the amount to collect update as you type.
  - **Advance already received:** bKash or Nagad, the amount, the sender number and the TrxID. It is
    checked on the order page like any other advance. A TrxID already on another order is refused.
  - An optional **note for staff**, saved on the order.
- The server checks and works out everything again, then saves the order like checkout does: stock
  held in the same transaction, the next order number, risk score, and the usual "order received"
  SMS/email. No SMS code is asked for. Blocked numbers are refused. The zone's advance rule is not
  forced here: staff decide.
- From there it's an ordinary order: **Pending → Confirm** (with its invoice) → pack → ship. The
  history says "Taken by <name> from WhatsApp", the order page shows **From WhatsApp**, and the orders
  list shows a small source badge. Audit log: `order.create_manual`.
- **Checked in the browser** as a temporary staff member, on a phone-sized screen too: the New order
  button, an empty form (every field named), a WhatsApp order with a discount and a bKash advance
  (totals, stock held, history, note, SMS queued, risk), the source badge in the list, and a second
  order with the same TrxID (refused, nothing saved).
- **Cleanup:** removed the test order, its message log row and queued SMS, the order number counter,
  2 audit entries and the temporary staff member. The chopper is back exactly as before.
- 10 new tests (333 total); lint, types, formatting and the production build pass.
- **Phase 2 is finished**, apart from 2.13 (Steadfast), which waits for your merchant account. The
  SRS §9.1 acceptance run is part of 3.8.
- Not committed yet.

**Next:** Phase 3.1 — Security review: headers scan, OWASP ZAP baseline, dependency scan.

### 2026-11-22 · Phase 2.16 — Integrations settings with encrypted keys

- **Admin → Integrations** (FR-AD-12), owner only (_integrations.manage_; managers and staff get
  "no permission" from the server). One card each for **SMS**, **Email**, **Courier** and **Media
  storage**.
- Each card chooses where its settings come from:
  - **Use the server's .env** — how it worked before, and still the default. The card shows what the
    environment has, with secrets masked.
  - **Use the settings below** — keys typed in admin. SMS: provider, fallback, Alpha SMS key, sender
    ID. Email: SMTP (host, port, user, password) or Resend, and the From address. Courier: Steadfast
    API key and secret key, ready for 2.13. Media: Cloudinary cloud name, API key and secret.
- **Keys are encrypted** (AES-256-GCM with `ENCRYPTION_KEY`, NFR-SEC-13) and never sent back to the
  browser: a saved key shows as `••••••••` and its last 4 characters. Typing a new one replaces it;
  **Remove** deletes it. The audit log (`integrations.update`) records only the masks.
- Saves are checked: a provider needs its key, SMTP user and password go together, Steadfast and
  Cloudinary need all their keys, the From address must be a real address.
- The **worker** (SMS, email) and **media uploads** now use these settings. Changes take effect within
  about 30 seconds; no restart needed.
- **If you ever change `ENCRYPTION_KEY`**, keys saved here can't be read any more: the card says so,
  and you type them again.
- **Checked in the browser** as a temporary owner, on a phone-sized screen too: the .env summaries,
  saving Steadfast keys (one key alone is refused), the database, page and audit log holding no key
  in plain text, media uploads switching to saved Cloudinary values and back, Alpha SMS without a key
  refused, and removing keys. Email was not switched, so nothing could be sent through your Gmail.
- **Cleanup:** removed the temporary owner, the integrations settings it saved and its 8 audit
  entries. Nothing was uploaded to Cloudinary (only upload signatures were made).
- 10 new tests (323 total); lint, types, formatting and the production build pass.
- Committed and pushed (4eda37c).

**Next:** Phase 2.17 — Manual order form for Facebook/WhatsApp orders (Open question 9).

### 2026-11-22 · Phase 2.15 — Customers admin and dashboard

- **Dashboard** (FR-AD-01) at `/admin`, for **Today · Last 7 days · Last 30 days** (Dhaka time):
  - **Orders placed** and their value (cancelled left out)
  - **Confirmation rate:** of the orders staff have decided on, how many were confirmed
  - **Delivery success** and **Returned (RTO):** of the orders that reached the door in the period,
    how many were kept (fully or in part) and how many came back. The two add up to 100%.
  - **Waiting for a call:** pending and on-hold orders, oldest first, with risk and the last call
  - **Top products** by units, and **Low stock** (variants at or below their low-stock level)
  - Who sees what: order numbers need _orders.view_, money needs _reports.view_ (manager and up),
    low stock needs _products.view_. "Your permissions" is now folded away at the bottom.
- **Customers** (FR-AD-06), a new menu item after Orders (_customers.view_, staff and up):
  - One row per **mobile number**, guests included: name (and how many other names), orders, open
    orders, return rate, last order, lifetime value, and Blocked/Flagged and Account badges.
  - Search by name or number (typed as 017…, 88017… or +88017…); show all, ordered 2+ times, has
    returns, or blocked/flagged; sort by last order, lifetime value, most orders or most returns.
  - **Customer page:** call button, lifetime value (delivered and partly delivered orders, less
    refunds), orders, delivered, return rate, every order with status and payment, names, emails and
    places used, linked accounts, and **block or flag the number** right there (_customers.block_,
    manager and up — the same list as Blocked numbers).
  - The order page links to the **Customer profile**.
- **Checked in the browser** as a temporary manager, on a phone-sized screen too, with 7 test orders
  on two test numbers: every dashboard figure for Today and 30 days worked out by hand and matched,
  list search, filters and sorts, the customer page, flagging a number, the order page link, and an
  unknown or invalid number (not found).
- **Cleanup:** removed the 7 test orders, the flag, the temporary manager and its 2 audit entries.
  Nothing else was touched; the chopper's stock is unchanged.
- 10 new tests (313 total); lint, types, formatting and the production build pass.
- Committed and pushed (4b1cbef).

**Next:** Phase 2.16 — Integrations settings page with encrypted keys (FR-AD-12, NFR-SEC-13).

### 2026-11-22 · Phase 2.14 — Customer account area and order tracking

- **My account** (FR-AC-06), with tabs Overview · Orders · Addresses · Wishlist · Profile (a scrolling
  row on phones). Signed-out visitors go to sign-in and come back to the page they wanted.
- **Orders:** the list, and a page per order:
  - progress steps (placed → confirmed → packed → on the way → delivered; a cancelled or returned
    order stops where it got to) and the history with times in Dhaka time
  - items, totals, payment and what's left to pay at the door
  - **Order again** puts the same items back in the cart (only what is still on sale)
  - **Invoice PDF** once the order is confirmed: private to the customer, never cached
  - staff notes, call logs, costs and risk are never shown
- **Which orders are "mine":** orders placed while signed in, plus orders placed **without signing
  in** with the account's mobile number, once that number is confirmed with a code.
- **Addresses:** up to 10, with a default. Checkout has a "Saved addresses" picker, fills the default
  in, and offers "Save this address to my account" (on by default for the first one).
- **Wishlist:** a heart on product cards, the product page and quick view. Guests get "Sign in to save
  products". Products the shop stopped selling are listed so they can be removed.
- **Profile:** change the name, password (and sign out other devices), sign out of all other
  devices, and **add or change the mobile number with an SMS code**.
  - **Delete account:** needs the password (or, for Google-only accounts, a sign-in within the last
    day). Addresses, wishlist and cart are deleted and every device is signed out. Orders stay for
    deliveries, returns and accounts, but are no longer linked to the person. Staff accounts can't
    delete themselves here. Audit log entry: `account.delete`.
- **Track your order** at `/track` (FR-AC-07), linked in the header, the mobile menu and the thank-you
  page: order number + the mobile number used.
  - It shows progress, items and money, and only the area and district: no name, phone or street.
  - Wrong details get one message for every case, and lookups are limited (20 per 10 minutes per
    visitor, 8 per hour per order), so numbers can't be guessed.
- **Signing out now also forgets the checkout form** in that browser (name, phone, address), so the
  next person on a shared phone starts blank.
- **Checked in the browser** with a test customer, on a phone-sized screen too: sign-up, adding the
  mobile number with a code (a wrong code is refused), an order signed in (address saved) and one as
  a guest with the same number (both listed), tracking with a wrong and the right number, the invoice
  PDF (refused when signed out), Order again, addresses (errors, default, picker at checkout),
  wishlist (incl. a removed product), name change, and deleting the account (wrong password refused).
- **Fixed while testing:**
  - nothing let a customer add a confirmed mobile number, so guest orders could never show up
  - the checkout form kept the last customer's details after sign-out
  - "Track this order" now fills in the order number
  - the saved-address picker showed an empty first choice
  - "not confirmed yet" broke in the middle of a word on phones
- **Cleanup:** removed the test customer, 2 orders, invoice, order and invoice counters, 7 message
  log rows and queue jobs, 1 stock movement, 1 audit entry and the rate-limit keys. Nothing was
  emailed (no worker ran). The chopper is back exactly as before.
- 15 new tests (303 total); lint, types, formatting and the production build pass.
- **Good to know:**
  - Changing the **email** address isn't available yet ("please contact us").
  - Docker Desktop had stopped during this step; I started it and this project's containers again.
    The admin page in the app's browser now asks you to sign in again.
- Committed and pushed together with 2.12 (fa1aa8f).

**Next:** Phase 2.15 — Customers admin + dashboard (FR-AD-01, FR-AD-06).

### 2026-11-22 · Phase 2.12 — Email, message texts and the message log

- **Email providers** (SRS §8.3): `EMAIL_PROVIDER=smtp` (default) or `resend` with
  `RESEND_API_KEY` (see `.env.example`).
  - Amazon SES and Brevo both give SMTP settings, so they work through `smtp`.
  - Errors that retrying can't fix (bad key, bad address, SMTP 5xx) stop at once. Everything else is
    retried.
- **Emails look like the shop** (React Email): shop name on top, the text in paragraphs, clickable
  links, and the shop's phone and address at the bottom (taken from Admin → Invoices).
  - The confirmation email has the invoice PDF attached and a "View invoice" button.
  - The sign-in, reset and verify emails now have a button too.
- **Customers get a message at each step**, by SMS and, if they gave an email, by email:
  - order received, confirmed (with the invoice link), shipped, delivered, cancelled, returned, and
    new invoice link
  - cancelled and returned are email only by default, to save SMS cost
  - packed sends nothing
- **Admin → Notifications → Message texts** (FR-OR-06, `settings.manage`):
  - pick the language customers get: English or বাংলা
  - edit every SMS and email in both languages, with a live preview and an SMS counter (segments and
    plain or Unicode)
  - turn SMS or email on and off per step
  - placeholders such as `{order_no}`, `{total}` and `{invoice_link}`; one that doesn't belong to a
    step is refused, on screen and on the server
  - "Default text" brings back the original wording
  - English SMS write money as "Tk 1,450", so they stay at 160 characters a segment. Bangla SMS hold
    70, so they cost 2–3 times as much.
- **Admin → Notifications** (FR-OR-07, `orders.view`): every SMS and email with its status (waiting,
  sent, failed), the error, the number of tries, and search by phone, email or order number.
  - A failed send is tried 5 more times over about a minute and a half, then marked failed.
  - **Send again** works on sent and failed messages. The order page has a **Messages** card with the
    same list.
  - Codes and sign-in links are logged without their text, and can't be sent again.
  - Log rows are kept for a year; rows for codes, for 30 days.
  - Audit log entries: `notification.resend`, `notifications.templates`, `notifications.language`.
- **Checked in the browser** with 2 test orders (emails caught by Mailpit, SMS on the console):
  - received → confirmed (email with INV-2026-000001.pdf, link and button) → packed → shipped
  - Send again from the log
  - switched to Bangla, turned on the cancelled SMS and edited it; `{invoice_link}` was refused.
    Cancelling the second order sent the edited Bangla SMS.
  - stopped Mailpit: the email was retried 5 times, then failed with "connect ECONNREFUSED"; after
    Mailpit came back, Send again delivered it
  - both pages and the Messages card fit a phone screen
- **Fixed while testing:**
  - A refused connection was logged as just "SMTP:" with no reason.
  - A failed resend still showed the old "Sent" time.
  - Long links made the Message texts page and the Messages card wider than a phone.
- **Cleanup:** removed the test orders, invoice, invoice counter, 8 log rows, the saved message texts
  and language (none existed before), 1 stock movement, 9 audit entries, the queue jobs, Mailpit's
  test emails and the rate-limit key. The chopper is back exactly as before.
- 13 new tests (288 total); lint, types, formatting and the production build pass.
- **Good to know:**
  - **Your `.env.local` sends email through Gmail**, so local tests send real emails. One test
    email went out that way, to `rahim.test@example.com`. example.com accepts no mail, so it reached
    no one; Gmail may show you a bounce notice.
    For local work, set `SMTP_HOST=localhost`, `SMTP_PORT=1025` and empty `SMTP_USER`/`SMTP_PASS`
    (Mailpit, http://localhost:8025).
  - "Sent" means the provider accepted the message. Delivery reports from the SMS gateway and email
    provider aren't read yet.
  - The sign-in code text isn't editable; it stays short and fixed.
  - The two old workers from 19 Nov are stopped. **No worker is running now:** start
    `npm run worker` (after the Mailpit change above) so messages and PDFs go out.
- Not committed yet.

**Next:** Phase 2.14 — customer account area: addresses, order history, invoice download, re-order,
wishlist, guest order tracking. (2.13 Steadfast is on hold until you have a merchant account.)

### 2026-11-22 · Phase 2.11 — Invoices

- **Invoice number on confirmation** (FR-OR-03): every confirmed order gets `INV-2026-000001`, one
  sequence per year in Dhaka time. The number is taken inside the confirmation itself, so a failed
  confirmation gives the number back and there are no gaps.
- **What the invoice shows is fixed at confirmation**: shop details, customer, address, items,
  discount, delivery, total, advance (wallet and the last 4 characters of the TrxID only) and the
  amount to pay on delivery. Later edits never change an issued invoice.
- **Private link** (FR-OR-04): `/i/<token>`, a random 22-character code. The database keeps only its
  hash for lookups, plus an encrypted copy for the QR code and the admin "Copy link". It works for
  90 days by default.
  - The confirmation SMS now ends with "Invoice: <link>".
  - An unknown, changed, expired or turned-off link shows "This invoice link doesn't work". It is
    never indexed by search engines.
  - Opening links is limited to 60 per 10 minutes per IP, so tokens can't be guessed.
  - If the order is later cancelled or returned, the page says so above the invoice.
- **PDF** (FR-OR-05): A4, Noto Sans Bengali built in, with a QR code back to the link.
  - Printed by Chrome. react-pdf was tried first and broke Bangla conjuncts.
  - Printed right after confirmation by the worker, or on the first download if the worker hasn't
    done it yet. About 1–3 s to print, then served from storage.
  - The PDF is stored in MongoDB next to the invoice, so it is private and backed up with the
    database.
  - Making a new link prints a new PDF, because its QR code points to the link.
- **Admin:**
  - The order page has an **Invoice card**: number, issued date, link state and expiry, Copy link,
    PDF (always works for staff), **New link** (the old one stops at once; optionally SMS the new
    one) and **Turn off link**.
  - New page **Admin → Invoices** (`settings.manage`): shop name, phone, email, address, footer and
    link lifetime (1–730 days). It applies to new invoices only.
  - Audit log entries: `invoice.new_link`, `invoice.revoke_link`, `invoices.settings`, and the
    invoice number on `order.confirm`.
- **Checked in the browser** with 2 test orders, one with a Bangla name and address:
  - confirming gave INV-2026-000001 and an SMS with the link
  - the public page and the PDF show Bangla correctly; only "…1001" of the TrxID is printed
  - a link with one character changed, a short one and `../etc` are all not found
  - Turn off link → the link and its PDF stop working
  - New link with SMS → the new link works, the old one stays dead, and the PDF is printed again
  - settings saved (0 days refused) → the second confirmation printed INV-2026-000002 with the new
    phone and address and a 30-day link
  - cancelling the order shows the banner on the public page
  - the rate limit kicks in after 60 opens; the page fits a phone screen
- **Cleanup:** removed the test orders, both invoices, the invoice counter and the invoice settings
  (neither existed before), stock movements, 6 audit entries, 3 SMS and 3 PDF jobs, and the
  rate-limit keys. The chopper is back exactly as before. **Admin → Invoices is empty again:**
  fill in your phone and address there before the first real order.
- 11 new tests (278 total); lint, types, formatting and the production build pass.
- **Good to know:**
  - **Production** needs Chrome or Chromium on the server. Set `CHROMIUM_PATH` (see `.env.example`)
    if it isn't the standard Google Chrome install.
  - In the production build, a bad link shows the "doesn't work" page with HTTP 200 (the page
    streams before the link is checked). It is marked noindex and shows nothing private. The PDF
    address returns a real 404.
  - Two old worker processes from 19 Nov are still running with pre-2.11 code. Restart
    `npm run worker` so it picks up the invoice PDF jobs. Until then, PDFs are printed on first
    download.
- Committed.

**Next:** Phase 2.12 — email adapter and templates, editable SMS/email templates, notification log
with retry.

### 2026-11-22 · Phase 2.10 — Order state machine and payment status

- **Allowed status moves**, checked on the server for every change (FR-OR-01):

  | From                                  | To                                              |
  | ------------------------------------- | ----------------------------------------------- |
  | Pending                               | On hold, Confirmed, Cancelled                   |
  | On hold                               | Pending (back to To call), Confirmed, Cancelled |
  | Confirmed                             | Packed, Cancelled                               |
  | Packed                                | Shipped, Cancelled                              |
  | Shipped                               | Delivered, Partly delivered, Returned           |
  | Delivered                             | Returned (customer return)                      |
  | Partly delivered, Cancelled, Returned | — (final)                                       |

  Anything else is refused with a plain message, e.g. "A pending order can't be moved to shipped.",
  even if an old page or a hand-made request asks for it.

- **Stock follows the order:**
  - cancelled after confirmation (confirmed or packed): the items go back into stock, with a
    "Order cancelled" movement
  - returned: every unit goes back, with a "Return" movement
  - partly delivered: staff enter the units that came back; only those go back
- **Payment status on its own track** (FR-OR-02): Unpaid, Advance to check, Advance checked, Paid,
  Refunded. Each change is kept in the order's history with who and why.
  - Confirming with the TrxID tick → Advance checked
  - Delivered → Paid, with what the courier collected saved. Partly delivered → Paid, with the amount
    staff enter (the page suggests the door amount less what came back).
  - Cancelled with "Advance not received" → Unpaid, and the advance shows "Never arrived"
  - **Mark refunded** (new `orders.refund` permission: managers and the owner) on cancelled, returned
    or partly delivered orders that took money. Staff enter the amount and how it was sent back. It
    can't be more than the shop received.
- **Orders page:**
  - new tabs: To pack, To ship, On the way, Delivered (with partly delivered), Returned
  - work queues list the oldest first
  - bulk actions follow the tab: Confirm/Cancel, Mark packed/Cancel, Mark shipped/Cancel, Mark
    delivered
  - the CSV export has two new columns: Collected and Refunded
- **Order page:** a button for each allowed move, each with a short dialog. Returns need a reason
  (refused at the door, couldn't reach, wrong address, customer return, damaged, other). Units that
  came back are shown on the items. The payment card shows what was collected and refunded.
- Every move goes to the audit log (`order.packed`, `order.shipped`, `order.delivered`,
  `order.partially_delivered`, `order.returned`, `order.refund`).
- **Checked** with 6 test orders, by running the same server functions the buttons use against the
  database (the browser needed a fresh sign-in after the restart, see below):
  - pending → confirmed → packed → shipped → delivered: paid, ৳1,520 collected
  - advance checked on confirm, cancelled after confirmation: stock back with a cancel movement;
    a refund above ৳130 was refused, ৳130 was accepted, and a second refund was refused
  - partly delivered with 1 of 2 Blue back: that unit back in stock, ৳1,520 collected; "everything
    came back" was refused as a partial
  - returned by the courier: stock back, still unpaid, refund refused
  - advance not received: unpaid, advance "never arrived", hold released
  - on hold → back to To call; a stale copy, skipping a step, delivered → packed, and cancelling a
    shipped order were all refused
  - stock at the end matched the sums exactly (Red 28 with 1 held, Blue 21)
- **Then checked in the browser** with 6 fresh test orders:
  - Confirm → Mark packed → Mark shipped → Mark delivered through the dialogs; the delivered order
    offers only "Mark returned" and shows ৳1,520 collected
  - advance order: Confirm needed the TrxID tick; Cancel said the items go back into stock; a ৳200
    refund was refused, ৳130 accepted, and the button then went away
  - bulk Confirm, Mark packed and Mark shipped on two orders; each tab offered the right buttons and
    On the way had no Cancel
  - partly delivered: nothing back was refused; with 1 Blue back the page suggested ৳2,870 and the
    items show "1 came back"
  - Mark returned needed a reason ("Other" also needs a note)
  - Put on hold → Back to To call
  - the list and the order page work at phone size
- **Cleanup:** removed both rounds of test orders, their stock movements, the 4 confirmation SMS jobs
  and the 17 audit entries. The chopper's stock, held count and every other field are back exactly
  as before.
- 18 new tests (267 total); lint, types, formatting and the production build pass.
- After the restart, Docker Desktop, the database and `npm run dev` were down. I started Docker, the
  containers and the dev server (in the preview pane).
- Committed together with 2.9.

**Next:** Phase 2.11 — invoice: sequential number, PDF with Bangla font, signed link with expiry and
revoke.

### 2026-11-21 · Phase 2.9 — Admin orders

- **New Admin → Orders** (`orders.view`, staff and up), right after Dashboard in the menu, with a count
  of orders waiting for a call.
  - **Tabs:** To call, On hold, Confirmed, Cancelled, All, each with its count. To call and On hold
    show the oldest order first, so nobody waits too long.
  - **Search** by order number, phone or name. **Filters:** zone, payment, and from/to dates (Dhaka
    days). 50 orders a page.
  - Each row shows the waiting time, a tap-to-call phone number, area and zone, total, payment, risk
    and the last call.
  - **Export CSV** (`orders.export`, manager and up) saves what the list shows, up to 5,000 orders.
    It opens in Excel with Bangla intact, and text that looks like a formula is made harmless. Each
    export is audited.
- **Order page:** items and totals, the customer with a Call button, the earlier orders on the same
  phone (delivered / cancelled / returned), the risk reasons, the bKash/Nagad advance with its TrxID,
  and the full history with who did what.
  - **Call log:** pick the outcome (confirmed by phone, no answer, call later, switched off, wrong
    number, refused) and add a note.
  - **Notes** for other staff.
- **Confirm:**
  - If the customer sent an advance, staff must tick "I found this TrxID and amount in the statement".
    That marks the advance as checked.
  - Confirming takes the items out of stock for good and records a stock movement. This was planned
    for 2.10 and is here now.
  - The customer gets an SMS, e.g. "Order #SR10001 confirmed. Total ৳1,450 (COD ৳1,350)."
- **Put on hold** (needs a reason). The stock stays held until the hold time from Order rules ends.
- **Cancel** with a reason from a list. "Other" needs a note. Held stock goes back on sale and any
  coupon use is given back.
- **Edit before confirm:**
  - change the name, phone, address and area; the zone is checked again
  - add products (search by name or SKU), remove them or change quantities
  - change the discount and the delivery charge; the page suggests the area's charge
  - the totals and COD fee are worked out again; an advance already sent is kept, and the page warns
    if it's now more than the total
  - items already on the order keep the price they were ordered at
  - held stock follows the new quantities
  - each change is written in the order's history in words, with your name
- **Bulk actions** on the list: tick orders, then Confirm or Cancel (one reason for all). Bulk confirm
  skips orders with an advance to check and lists them with the reason.
- **Two people on one order:** every action checks the order hasn't changed since the page was opened.
  If it has, nothing is saved and the page says "Someone else changed this order a moment ago. Reload
  the page to see it."
- Every action goes to the audit log.
- **Found and fixed while testing:**
  - bulk confirm crashed the page. The list of orders wasn't passed to the database the safe way. Now
    it is, and a failure shows as a message instead.
  - on a 1024 px screen the order page was cramped. It now shows two columns only on wider screens.
  - the running dev server kept an old copy of the order format and dropped new fields. It now picks up
    changes to the order format without a restart.
- Checked in the browser with 5 test orders:
  - tabs, counts, search, filters and the menu badge
  - call log and notes
  - confirm: stock taken out, movement recorded, SMS queued
  - bulk confirm skipped the advance order; confirming it alone needed the tick
  - edit: Bogura address, new items and ৳130 delivery; history, totals and held stock all right
  - a second tab put an order on hold; the first tab's cancel was refused with the message above
  - cancel with "Other" needed a note and gave the held stock back
  - bulk cancel
  - CSV export
  - phone size
- **Cleanup:** removed the 5 test orders, their stock movements, SMS jobs and 12 audit entries. The
  chopper's stock, held count and every other field are back exactly as before.
- 16 new tests (249 total); lint, types, formatting and the production build pass.
- Committed.

**Next:** Phase 2.10 — order state machine with a separate payment status, enforced on the server.

### 2026-11-21 · Phase 2.8 — Risk score, blocked numbers, order rules

- **New Admin → Order rules page** (`settings.manage`, FR-AD-08). It sets which orders must pay an
  advance before you ship. The first rule that matches applies:
  - **past cancelled or returned orders** on the same phone (default: on, at least 1)
  - **high risk score** (default: off, score 60 or more)
  - **new customers in far zones**: no delivered order yet, and the zone is ticked as far. Until you
    save, zones named "Outside …" count as far (default: on).
  - **large orders**: items above an amount (default: on, above ৳3,000)
  - **what they pay first**: the delivery charge (default) or the full amount
  - **hold stock for new orders**: hours, 24 by default. This was planned for 2.9 and is here now.

  The defaults are the SRS rule: new customers outside Dhaka, and orders above ৳3,000, pay the delivery
  charge first. A zone that already asks for more keeps its own rule.

- **At checkout:** once the phone and area are filled in, the page asks the server which payment
  options this order gets. When a rule asks for an advance:
  - cash on delivery disappears
  - the shopper sees a kind reason, e.g. "For a first order to your area, please pay the delivery
    charge in advance."
  - the server checks the same thing again when the order is placed

  If no bKash/Nagad number is switched on, the rules can't ask for an advance. The order goes through
  as cash on delivery and its risk notes say "call".

- **New Admin → Blocked numbers page** (`customers.block`, FR-AD-06): add, change and remove numbers,
  with a reason for staff.
  - **Blocked:** the number gets no checkout code and can't order. The shopper only reads "Sorry, we
    can't take orders from this number online. Please contact us." under the phone field, never why.
  - **Flagged:** the number can still order. Its orders show your note and score higher.
- **Risk score** (0–100, Low / Medium / High) is saved on every order with its reasons, for the orders
  page in 2.9. Points:

  | Reason                                                          | Points         |
  | --------------------------------------------------------------- | -------------- |
  | flagged number                                                  | 40             |
  | each returned order                                             | 25, at most 50 |
  | each cancelled order                                            | 10, at most 30 |
  | no delivered order yet                                          | 20             |
  | far zone                                                        | 10             |
  | order above the large-order amount                              | 15             |
  | 2+ other numbers ordering from the same device in the last hour | 20             |
  | name shares no word with the names on earlier orders            | 10             |

- Every change on both pages goes to the audit log.
- Found and fixed while testing: the large-order default would have been saved as ৳30 instead of
  ৳3,000. The form's default amount skipped the taka → poisha step.
- Checked in the browser:
  - **Order rules:** the defaults showed (৳3,000, Outside Dhaka ticked, 24 h). Saving 48 h worked.
    0 and 999 hours were refused, with the field named in the message.
  - **Blocked numbers:** adding a blocked and a flagged number worked. A duplicate and a bad number
    were refused. Editing a reason and removing both entries worked. Each change was audited.
  - **Checkout with a test bKash number switched on:**
    - a new customer in Bogura (Outside Dhaka) got only the advance options and the reason
    - in Dhaka, cash on delivery came back
    - the blocked number showed the message once and couldn't get a code or order
    - the flagged number ordered after the phone code: score 60, with the reasons "Flagged number: …"
      and "New customer", and stock held for 48 h
  - both admin pages work at phone size
- **Cleanup:**
  - removed the test order, its SMS job, the order-number counter (your first real order is still
    SR10001), the test cart and the rate-limit keys
  - removed the test entries, the saved order rules, the test bKash setting and the 7 audit entries
  - the chopper's stock, held count, listing fields and timestamps are back exactly as before
- 17 new tests (233 total); lint, types, formatting and the production build pass.
- **For you:**
  - **Restart `npm run dev`** before placing orders. The running server still uses the order format
    from before this step and drops the new risk level (Low/Medium/High). The score and reasons save
    fine. A fresh start saves the level too.
  - Order rules start from the defaults above. Open the page and save to keep your own.
- Committed.

**Next:** Phase 2.9 — admin orders: pending queue, click-to-call, call log, notes, edit before confirm,
confirm/cancel with reason, bulk actions.

### 2026-11-21 · Phase 2.7 — Order placement

- **"Place order" now saves the order.** The server checks and prices everything again (FR-CO-05).
  Then one MongoDB transaction does all of this, or none of it:
  - holds the stock, only if enough is left (stock − held ≥ quantity), so two shoppers can't buy the
    last unit (NFR-SC-07)
  - counts the coupon use, and stops if the coupon's total limit was just reached
  - takes the next **order number** (SR10001, SR10002…). It is taken inside the transaction, so a
    failed order gives its number back and the numbers have no gaps.
  - saves the order and takes the ordered lines out of the cart
  - updates the product's stock shown in listings
- **No double orders (FR-CO-06):** the checkout page sends a key with each order. A double click, or
  a retry after a lost reply, gives back the same order. The key is tied to the browser's cart or account.
- **The total you saw is the total you pay:** if a price, stock or delivery setting changed while the
  page was open, nothing is ordered. The page shows the new total and asks again.
- **What's saved** (SRS §7):
  - the customer, the address with district and area names, and the zone
  - each item as a snapshot (title, variant, SKU, price and landed cost), so later product edits never
    change an order or the profit reports
  - subtotal, coupon discount, delivery charge, COD fee, total, the amount due at the door, and the
    bKash/Nagad advance with sender number and TrxID
  - status Pending, payment status Unpaid (or "Advance to check"), and the status history
- A TrxID can't be on two orders: the database refuses it too.
- One phone number can place 5 orders an hour (NFR-SEC-05).
- **Thank-you page** (`/checkout/thank-you`, SRS §2.5): the order number, what happens next ("We'll
  call 01712…"), the items and amounts, the advance with only the last 4 of the TrxID, and the address.
  Only the browser that placed the order sees it, for 6 hours (a signed cookie). Anyone else gets "No
  recent order on this device".
- **SMS** "China Import Store: Order #SR10023 received. We will call you to confirm." goes out through
  the queue. A failed send never undoes the order.
- **Stock holds end (FR-CO-07):** a pending order holds its stock for 24 hours by default. The worker
  checks every 5 minutes and puts stock from older pending orders back on sale. The order stays Pending
  with a note in its history, and staff can still confirm it (confirming holds stock again, 2.10). Then
  it asks the store to rebuild the product pages.
- After an order, a product page is rebuilt only when a variant drops to its low-stock level or sells out
  ("Only 3 left" / "Sold out"). Other orders don't touch the cached pages.
- Checked:
  - **Script against the local database:**
    - two orders at the same moment for the last unit: one placed, one "just sold out"
    - the same order sent twice at once: one order
    - a coupon with one use left: the second order was refused
    - a reused TrxID was refused
    - the 6th order from one phone in an hour was refused
    - expired holds gave back all 9 held units exactly once
    - numbers had no gaps after failed orders
  - **In the browser:**
    - double-clicked "Place order" on the chopper, then entered the phone code: one order, SR10023
    - 1 unit held, the cart emptied, the thank-you page shown and the SMS sent
    - the page works at phone size
- **Cleanup:**
  - the test orders, the test product, the coupon and the SMS jobs were removed
  - the orders collection and the order-number counter were removed, so your first real order is SR10001
  - the chopper's stock, held count and listing fields were put back as they were. Only its Red
    variant's "last updated" time now shows today.
- 11 new tests (216 total); lint, types, formatting and the production build pass.
- **For you:**
  - **Restart the worker** (`pnpm worker`) so it picks up the new orders queue and the 5-minute check.
  - Set `REVALIDATE_SECRET` in `.env.local` (32+ characters) so the worker can rebuild product pages
    after it puts stock back on sale.
  - Orders are in the database but there's no admin screen for them yet: that's 2.9.
- Committed.

**Next:** Phase 2.8 — risk score, blocked contacts and rules that require an advance.

### 2026-11-21 · Phase 2.6 — Coupons

- New **Admin → Coupons** page (`coupons.manage`). Each coupon has:
  - a **code** (3–30 letters, digits, - or _; saved in upper case; a button makes a random one)
  - a **type**: percent off (with an optional most it can take off), an amount off, or free delivery
  - a **minimum order**, **total uses** and **uses per customer** (by phone number or account)
  - **start and end** in Bangladesh time
  - **applies to** the whole store, or chosen categories (their sub-categories too) and products
  - a staff note and an on/off switch
- The list shows each coupon's status (Active, Off, Scheduled, Expired, Used up) and what it gives.
  A duplicate code is refused. A coupon already on orders can't be deleted or have its code changed;
  switch it off instead. Every change is in the audit log.
- **Checkout:** "Have a coupon code?" opens a field (Enter applies it). The applied coupon shows as a
  chip with a remove button, and the summary gets a "Coupon discount" row, or "Free delivery with your
  coupon" on the delivery line.
- **Rules:**
  - Percent discounts are rounded to whole taka, then capped.
  - An amount off never goes above the products it covers.
  - The minimum order counts the whole cart, before the discount.
  - Free delivery makes the delivery charge ৳0; a COD fee, if any, stays.
  - Unknown and switched-off codes get the same answer ("We couldn't find this code."), so codes
    can't be guessed by their message.
  - The page works the discount out live as the cart changes. The server checks the code again when the
    order is sent. If it stopped working (switched off, used up, expired), the page takes it off, shows
    why and shows the new total before anything is ordered.
  - Coupon checks are rate-limited (20 per 10 minutes per IP).
- The usage counts and per-customer limit read orders, which arrive in 2.7. 2.7 also counts a use when
  an order is saved.
- Checked in the browser:
  - TEST10 (10% off, up to ৳100, from ৳1,000) on the ৳1,450 chopper gave −৳100 and ৳1,420 to Dhanmondi.
  - A duplicate code was refused, and an unknown code gave its message.
  - A free-delivery code made Inside Dhaka delivery free ("you save ৳70").
  - Switching a code off after it was applied, then placing the order, took the coupon off with the
    reason and showed ৳1,520.
  - Phone size works for checkout and the admin form.
- The 2 test coupons, their 2 audit entries, the test cart, browser draft and rate-limit keys were
  removed. 17 new tests (205 total); lint, types and formatting pass.
- Committed.

### 2026-11-21 · Phase 2.5 — bKash / Nagad advance payments

- New **Admin → Payments** page (Owner only, `settings.manage`): one card each for **bKash** and
  **Nagad** with an on/off switch, the receiving number, an optional account name, whether customers
  choose **Send Money** or **Make Payment** (a bKash Personal Retail Account usually takes Make
  Payment), and an optional QR image. A wallet can't be switched on without a number. Saving is in the
  audit log and checkout updates right away.
- **Checkout**, when the shopper picks "Delivery charge now" or "Pay everything now":
  - choose bKash or Nagad (only the wallets that are on)
  - short steps: open the app, choose Send Money / Make Payment, send **the exact advance** to the
    number (with a copy button and the account name), or scan the QR
  - **Your bKash/Nagad number** (sent from) and the **Transaction ID (TrxID)** from the payment SMS
- **Checks (FR-CO-05):**
  - The sender number must be a Bangladeshi mobile number.
  - The TrxID must be 8–12 letters and digits. Spaces and lower case are fine; it is saved in upper
    case.
  - **A TrxID already on another order is refused.** Orders arrive in 2.7, which also adds a unique
    index so two orders placed at the same moment can't share one.
  - The server also checks the chosen wallet is still switched on.
- **No wallet switched on** → checkout offers cash on delivery only. An area whose zone needs an
  advance then says it can't order yet and to contact you.
- The payment labels name only the wallets that are on, e.g. "Pay everything now (bKash)".
- The TrxID is not kept in the browser draft, since a TrxID belongs to one order.
- Checked in the browser:
  - Switching bKash on with no number was refused.
  - With a test bKash wallet, checkout showed ৳1,520, the number, the account name and the QR.
  - Empty fields gave a message at each.
  - A TrxID already on a (temporary, fake) order was refused, even typed in lower case with spaces.
    A new TrxID passed.
  - Switching bKash off left cash on delivery only.
  - Phone size works.
- The test wallet settings, the fake order, the test cart, browser draft and the 3 audit entries were
  removed. 12 new tests (188 total); lint, types, formatting and build pass.
- **For you:** before launch, enter your real bKash (and/or Nagad) receiving number in Admin →
  Payments, and upload its QR from the bKash/Nagad app. The SRS's optional small discount for paying
  everything in advance isn't in; say if you want it.
- Committed.

### 2026-11-21 · Phase 2.4 — SMS provider and phone code at checkout

- **SMS provider:** messages now go through Alpha SMS (sms.net.bd), a BTRC-listed Bangladeshi gateway,
  when `SMS_PROVIDER=alpha` is set; locally they are still printed in the worker log. A second provider
  can be set as a fallback. See "SMS: local vs real" above for the settings.
- **Phone code at checkout (FR-CO-03):** when everything else on the form is right, **Place order**
  texts a 6-digit code to the number and asks for it in a small window. The code is checked as soon as
  all six digits are typed (Bangla digits work too), and the order then goes through on its own.
  - A code works for **5 minutes** and **5 tries**. Only the newest code works, and it is stored as a
    keyed hash, never as the digits.
  - **Limits (SRS §5):** a new code can be asked for after 1 minute (the window counts down), at most 3
    per number per 10 minutes and 10 per connection per hour. Checks are limited to 30 per 10 minutes
    per connection, across all numbers.
  - Once confirmed, the number stays confirmed in that browser for an hour, so changing the address or
    payment doesn't ask again. A different number asks again.
  - **Signed-in customers whose account already has this number verified skip the code.**
  - **Change number** closes the window and puts the cursor in the phone field.
- Code SMS jobs go to the front of the queue, give up after 3 quick tries (a late code is useless) and
  are not kept in Redis once sent. Login and password-reset codes get the same treatment.
- Checked in the browser:
  - A wrong code showed "4 tries left". The right code confirmed the number, and the order check passed.
  - Sending again didn't ask; a new number asked again.
  - Reopening within a minute showed "We sent you a code a moment ago" and the countdown. **Send a new
    code** worked after it.
  - The phone layout works.
- A script against the local database checked the limits: the wait between sends, 5 wrong tries using
  up a code, a used code being refused, an expired code, and the 4th send to a number in 10 minutes
  being refused.
- The test's codes, rate-limit counters, cart and browser draft were removed. 13 new tests (176 total);
  lint, types, formatting and build pass.
- **For you:**
  - The two `pnpm worker` processes I started earlier still run the old worker code; I wasn't allowed to
    stop them. They print dev SMS the same way. Restart the worker (one is enough) to use the new
    provider code.
  - Before launch: an Alpha SMS account with balance, its API key, and (optional) an approved masking
    name. Bot protection on code requests (Turnstile, SRS §5) is not in yet.
- Committed.

### 2026-11-21 · Phase 2.3 — Checkout form with live totals

- New **checkout page** (`/checkout`), reached from the cart drawer, the cart page and **Order now** on a
  product page. One page with the form from SRS §2.2:
  - **Your details:** full name, mobile number (any Bangladeshi format, saved as +8801…), and email
    (optional for guests, required when signed in)
  - **Delivery address:** district → area (from Admin → Delivery), the full address, and a delivery
    note
  - **Payment:** only the options the area's zone allows. Normally **Cash on delivery** or **Pay
    everything now**; for a zone set to "delivery charge in advance", **Delivery charge now, rest on
    delivery** or pay everything now.
  - **Accept terms and return policy**, linking to your Terms and Returns pages
- **The order summary updates as you type:** products, subtotal, delivery for the chosen area (with
  "Free delivery from ৳…" or what a free/campaign rule saves), the COD fee, the total, **pay now** and
  **pay at the door**, plus the delivery time.
- Signed-in customers get their name, email and phone filled in. What a shopper typed is kept in the
  browser and comes back if they leave and return.
- **The server checks everything again** when the form is sent: each field, the saved cart at today's
  prices and stock, that the area belongs to the district and is delivered to, that the payment option
  is allowed, and every amount, worked out from scratch. If the total has changed since the page
  opened (a price or a delivery charge was edited), the shopper sees the new total and checks again.
  Order placement (2.7) will save what this check returns.
- **Not yet:** the **Place order** button only checks the order for now and says so. The phone code
  (2.4), the bKash/Nagad numbers and TrxID (2.5), coupons (2.6) and saving the order (2.7) come next.
- Checked in the browser:
  - Order now went to checkout with the account's name and email filled in.
  - An empty form showed a message at each field and put the cursor in the first one.
  - Dhanmondi gave ৳70 (total ৳1,520) and the server agreed.
  - Outside Dhaka, set for the test to "delivery charge in advance" with a 1% COD fee, offered only the
    two advance options: ৳130 now, ৳1,465 at the door, a ৳15 fee.
  - Raising the zone's charge in another tab made the stale page show "The total changed to ৳1,605"
    and refresh its numbers.
  - Phone size works.
- The zone was set back, and the test's cart, browser draft and audit entries were removed. **A
  slip:** my first cleanup also deleted the cart of your own owner account (1 × Red chopper, added at
  14:54 in another browser). I put it back exactly from the database's change log. 10 new tests (163
  total); lint, types, formatting and build pass.
- Committed.

### 2026-11-21 · Phase 2.2 — Cart

- **Add to cart works everywhere:** on the product page, in quick view, and on product cards. A card
  adds a product straight to the cart when it has only one option; otherwise "Options" opens quick view.
  Adding opens a **slide-out cart** from the right. **Order now** on the product page adds and goes to
  the cart page, and will go to the checkout once that exists (2.3).
- **Header cart button** with the number of items, and a full **cart page** at `/cart`:
  - change quantities, remove products, see each line's total, the subtotal and an order summary
  - "Add ৳… more for free delivery" with a progress bar, when Admin → Delivery has a store-wide
    free-delivery amount
  - lines that can't be ordered say why: no longer on sale, sold out, or "Only N available"
- **Prices and stock are always read fresh on the server.** The cart stores only which product option
  and how many, never a price. Nobody can add more than is in stock, or more than 10 of one item.
- **Guests keep their cart** for 30 days (a private cookie plus a copy in the browser, which also brings
  the cart back if the cookie is lost). **Signing in merges** the guest cart into the account's cart:
  the same product adds up. Signing out leaves the cart with the account, and the browser starts empty.
  Account carts are kept for 180 days; old carts are removed automatically.
- Checked in the browser:
  - Signed in, 2 Red added from the product page, +1 in the cart, and the cart page after a reload
    still had them.
  - After signing out, the cart was empty. Blue added as a guest from quick view.
  - After signing in again, the cart held both (Red ×3, Blue ×1).
  - Adding 10 more Red stopped at 10 with a message. Remove worked. The cart looked right at phone
    size. No console errors.
- The test carts and the sign-in audit entry from the test were removed afterwards. The chopper's
  stock didn't change. 8 new tests (153 total); lint, types, formatting and build pass.
- Committed.

### 2026-11-21 · Phase 2.1 — Locations, delivery zones and charge rules

- New **Admin → Delivery** page (owners and managers: the `zones.manage` permission). The first time
  anyone opens it, it adds Bangladesh's **8 divisions, 64 districts and 566 areas** (upazilas, plus the
  city thanas of Dhaka and the areas of Chattogram, Khulna, Rajshahi and Sylhet cities), all in English
  and Bangla, and three starter zones with the example charges from the SRS:
  - **Inside Dhaka** — ৳70 for the first kg, +৳15 per extra kg, 1–2 days: the 50 Dhaka city areas.
  - **Dhaka suburbs** — ৳100, +৳20/kg, 2–3 days: Gazipur, Narayanganj, and Savar, Keraniganj, Dhamrai,
    Dohar and Nawabganj.
  - **Outside Dhaka** — ৳130, +৳20/kg, 3–5 days: the other 61 districts.
- **Zones & charges:** add, edit and delete zones. Each has a charge for the first kg (or another base
  weight), a charge per extra kg started, a COD fee (% of what is collected at the door, rounded to whole
  taka), its own free-delivery amount, the advance-payment rule (none / delivery charge / full amount),
  a usual courier, and delivery days. A zone in use can't be deleted, and the last zone that is on
  can't be switched off.
- **Districts & areas:** filter by division or search; set each district's zone; give an area its own
  zone or let it follow its district; switch off areas you don't deliver to; add and rename areas (the
  same name twice in one district is refused).
- **Free delivery & rules:** packaging weight added to every order (100 g), free delivery above a cart
  value (a zone's own amount wins), free-delivery products (an order of only those ships free), and a
  flat-rate campaign with optional start and end times (Bangladesh time).
- **Try it:** pick a district, area, weight, cart value and time and see the charge, why, the COD fee,
  the total and the delivery days, using the same calculation the checkout (2.3) will use.
- Every change is in the audit log. The checkout will read the settings from a cache that refreshes
  when you save.
- Checked in the browser: the first visit added the data; Dhanmondi → Inside Dhaka ৳70; Savar with
  2.5 kg → ৳140; Sylhet with a 1% COD fee → ৳130 + ৳16; free above a ৳3,000 store-wide amount; a
  switched-off area can't be chosen; a duplicate area name is refused. Those test changes were undone
  and their audit entries removed (the one-time setup entry stays). 14 new tests (145 total); lint,
  types, formatting and build pass.
- **You need to:** look through **Districts & areas** for your own delivery reality: which places
  count as suburbs, any areas your courier doesn't serve, and area names you'd like spelled
  differently. Set the real charges in **Zones & charges** (the starter ones are the SRS examples).
- Committed.

### 2026-11-21 · Phase 1.15 — ISR + on-demand revalidation

- Store pages are built once and kept (product pages fully, category / collection / search pages as a
  kept frame with the product list filled in per visit). Saving in the admin now rebuilds **only the
  pages the change affects**:
  - **Product** (save, status, stock, purchase batch, delete): its page (old and new address), its
    categories and every category above them, the collections that hand-pick it or pick by rules, the
    home page rows and search. Other products' pages stay as they are.
  - **Category / collection:** its own page, plus menus and filters.
  - **Builder pages, menus & theme, CMS pages:** the page itself (as before).
- Right after a save, the server visits each affected page once (product pages first, at most 30), so
  the first shopper gets the new page, not the old copy a cached page would otherwise hand out while it
  rebuilds. Pages over that limit rebuild on their first visit.
- **For scripts and the worker:** `POST /api/internal/revalidate` with the header
  `Authorization: Bearer <secret>` and a body like `{"tags": ["product:x"]}` refreshes those pages.
  The secret is `REVALIDATE_SECRET`; without it the endpoint is off (404). Only known store tags are
  accepted. `pnpm catalog:resync` now uses it; orders will use it in Phase 2 when stock changes.
- Checked on a production build with two temporary products in two temporary categories (removed
  afterwards, with their audit entries): saving A in the admin updated A's page, A's category and
  search; B's page and category kept their cached copy although B had changed in the database. The
  first visit after the save got the new page. The endpoint rejects a missing or wrong secret, unknown
  tags and bad JSON. 6 new tests (131 total); lint, types, formatting and build pass.
- **You need to (optional):** add `REVALIDATE_SECRET` to `.env.local` (32+ random characters; make
  one with `openssl rand -hex 24`) so `pnpm catalog:resync` can refresh the store. Before running
  several copies of the store in production, they will need a shared cache (noted for deployment).
- Committed.

### 2026-11-21 · Phase 1.14 — WhatsApp / Messenger chat button

- **Menus & theme → Chat button** (new tab): switch it on, add your **WhatsApp number** (type it any way:
  01712345678, +880 1712-345678… it is stored as 8801712345678) and/or your **Facebook page** (username
  or the facebook.com link). Also: the message WhatsApp opens with, whether to add the page the shopper
  is on (so you see which product they mean), the button text on computers, and the corner. Test links
  appear under the form. Like the rest of Menus & theme it is a draft until you publish.
- **On the store:** a round button in the bottom corner of every page. One channel opens it directly;
  with both, it opens a small WhatsApp / Messenger menu (Escape or a tap elsewhere closes it). Phones
  show only the icon; computers show the text too. On product pages it moves up while the phone buy
  bar is showing. Hidden when printing.
- Checked on a production build with sample numbers on a temporary page (removed): links, page address
  added at the click, menu open/close, phone size, buy-bar clearance. Checked the admin tab on your dev
  server without saving; your design is unchanged. 5 new tests (125 total); lint, types, formatting and
  build pass.
- **You need to:** open Menus & theme → Chat button, add your number and/or page, try the links,
  publish. Restart `npm run dev` first (it still serves the old stylesheet).
- Committed.

**Next:** Phase 1.15 — ISR + on-demand revalidation when admin saves content.

### 2026-11-21 · Phase 1.13 — Scroll motion

- **Hero entrance:** when a page opens, the hero's label, heading, text and buttons rise in one after
  another (the heading only moves, so it still shows at once for page speed).
- **Reveal on scroll:** sections, product cards (in grids and sideways rows) and the "Why buy from us"
  items fade and rise in as they come into view; cards in a row follow one another. It is plain CSS tied to scrolling (no JavaScript), so nothing is hidden while
  scripts load and the main picture is never held back. Browsers without scroll-driven animations
  (Firefox today) simply show everything without motion.
- **Parallax hero:** as you scroll past the hero, its text eases down and fades (with or without a
  picture), and a hero picture drifts slower than the page without ever showing an edge. A new
  **"Parallax"** switch on each hero in the builder (on by default).
- **Product story** (new builder section): a heading, 2–5 steps, each with a picture, title and text,
  and an optional button. On computers the section stays in place while you scroll and each step takes
  over in turn (picture cross-fade, text slide, progress dots). The animation library (GSAP) downloads
  only when the section comes near the screen. Phones, the "reduced" / "off" motion levels and shoppers
  who turn motion down see the steps one under another.
- **Page transitions:** moving between store pages fades the old page out (0.15 s) and lets the new one
  rise in (0.34 s). Opening quick view or changing filters doesn't trigger it.
- **Motion level** (Menus & theme): "full" = all of the above; "reduced" = fades without movement;
  "off" = no motion. A shopper's "reduce motion" device setting always switches scroll and page motion
  off. Only opacity and transform are animated (smooth on cheap phones); the hero slideshow and the
  announcement bar pause while scrolled out of view.
- Checked on a production build: hero entrance, hero text scroll-away, reveal (incl. product rows),
  picture parallax, pinned story with lazy GSAP, page transitions (old page fades, new page rises, ends
  fully visible). Fixed: a hero with several slides would have tracked its own box instead of the page. 3 new tests (120 total); lint, types, formatting and
  build pass. Test content was removed; your home page is back as it was.
- **You need to:** restart `npm run dev` after any change to `app/globals.css`. The dev server reloads
  components but keeps serving the old stylesheet until it restarts, so new motion won't show before
  then. Optional: add a Product story section to the home page.
- Check: the "Why buy from us" starter text says "7-day return on faulty items" but the Returns page
  says 3 days. Make them match.
- Steps 1.12 and 1.13 are committed together.

**Next:** Phase 1.14 — WhatsApp / Messenger floating button.

### 2026-11-21 · Phase 1.12 — CMS pages

- **Admin → Pages** (new menu item, `cms.edit`): every page lives at `/pages/<address>`. The first time
  anyone opens it, the seven standard pages are added as **unpublished drafts** with starter text:
  About, Privacy policy, Terms & conditions, Return & refund (3-day change of mind, customer pays return
  delivery, faulty items replaced free, as in the SRS defaults), Shipping & delivery, FAQ and Contact.
  "New page" adds your own pages. Deleted pages are not added back (unless every page is deleted).
- **Block editor:** heading, paragraph, bullet / numbered list, image with caption, coloured notice,
  questions & answers (Google sees them as an FAQ), button, divider, contact details and contact form.
  Add, reorder (drag or arrows), duplicate and remove blocks, with undo. Paragraphs, notices, answers and
  list points take **bold**, _italic_ and links via B / I / link buttons. Text is stored as JSON and
  drawn by our own components, so nothing typed in the admin can become HTML. Links must be store
  links, https, tel: or mailto:.
- **Draft → preview → publish**, as in the page builder: "Save draft" refreshes the preview beside the
  editor, "Publish" updates the store at once, "Discard changes" goes back to the live version, and
  "More" has "Take off the store" and "Delete page" (a copy stays in the audit log). Changing the
  address of a live page warns that old links stop working. Each page has its own Google title and
  description (otherwise the start of the page is used). Unpublished pages give a real 404.
- **Contact form → Admin → Messages** (new menu item, `customers.view`): name, Bangladeshi mobile
  number or email, and message. Spam protection: a hidden field for bots and at most 5 messages per hour
  from one address. Messages have "To answer" / "Done" tabs with call and email links. The **contact
  details** block shows the phone, email, address and social links from Menus & theme → Footer, so you
  only type them once.
- Menu and footer link fields now also suggest your pages.
- Checked in the browser (test data removed afterwards, including the seeded pages, so you will see the
  "we added 7 pages" notice yourself): seeding, formatting buttons, save → preview, publish → store,
  contact form errors and success, Messages and "Mark done", creating a page (address clash message),
  delete, take off the store → 404, FAQ structured data, phone layout. 13 new tests (117 total); lint,
  types, formatting and build pass.
- **You need to:** open Pages, read each starter page, change what doesn't fit (return days, delivery
  times, refund method), add your phone / email / address under Menus & theme → Footer, then publish.
  Add the Privacy and Terms links to the footer; Google sign-in (later) needs both pages.
- Committed together with 1.13.

**Next:** Phase 1.13 — scroll motion (reveal, page transitions, parallax hero, pinned story section).

### 2026-11-20 · Phase 1.11 — menus and theme

- **Admin → Menus & theme** (new menu item, `cms.edit`) with four tabs:
  - **Header menu:** up to 8 items, each with an optional badge ("New", "Hot"). An item can hold groups
    (a dropdown); groups with links turn it into a full-width mega-menu, with an optional picture. "Fill
    from my categories" builds the menu from the category tree in one click. Link fields suggest store
    pages, categories and collections. With no menu set up, the store lists the top-level categories.
  - **Footer:** about text, up to 4 link columns, phone / email / address, social links (Facebook,
    Instagram, YouTube, TikTok, WhatsApp) and a line after "© shop name".
  - **Announcement bar:** up to 3 messages that take turns, brand / dark / accent colours, optional
    links, can be closed by shoppers (stays closed until the text changes), optional start and stop
    times (Bangladesh time).
  - **Theme:** brand and accent colours with live contrast checks (button text, links on light / dark
    pages, text on the accent colour), text / heading / Bangla fonts from a curated list (all
    self-hosted), corner style, light / dark / follow the device, animation level (full / reduced /
    off; "reduce motion" on the shopper's device is always respected), logo with height, favicon.
- **Draft → preview → publish**, like the page builder: "Save draft" updates the preview beside the
  editor (the preview now shows the draft menus and theme together with the draft home page), "Publish
  now" updates the store immediately, "Discard changes" goes back. Two people saving at once can't
  overwrite each other. Publishing needs `cms.publish`; everything is in the audit log.
- **How the theme works:** colours, fonts and corners are CSS variables set from the published theme,
  so changes need no rebuild. Only checked values (hex colours, fixed font / option lists) reach the
  page. Button text colour is picked automatically for readability, so with the default orange the
  button text is now dark instead of white (white on that orange was below the contrast minimum).
- **Store header:** logo or shop name, search and account in the top row, the menu in a second row on
  tablets and computers, a slide-in menu on phones; the new footer replaces the old one-line footer.
- Checked in the browser with temporary settings (removed afterwards): filling the menu, a group and
  link, badge, announcement, blue brand, Poppins headings, very rounded corners, always-light mode,
  validation message, save → preview, publish → store, audit entries, mega-menu on desktop, phone menu.
  The theme fonts and corners were checked on a production build: the `npm run dev` server that was
  already running kept serving an old copy of `globals.css`, so **restart your dev server** to see the
  new header fonts. 9 new tests (104 total); lint, types, formatting and build pass.
- Step 1.10 is committed; 1.11 is not committed yet.

**Next:** Phase 1.12 — CMS pages (About, Privacy, Terms, Return & Refund, Shipping, FAQ, Contact).

### 2026-11-20 · Phase 1.10 — storefront builder

- **Admin → Storefront** builds the home page from sections: Hero / slider (up to 6 slides, separate
  phone picture, two buttons, autoplay), Category grid (tiles or round icons), Products (newest, best
  sellers, biggest discounts, a collection or a category; sliding row or grid), Promo banner, Video
  banner (uploaded video playing muted on a loop, or YouTube that loads only when tapped), Why buy from
  us, Testimonials, FAQ (also tells Google it is an FAQ), Newsletter sign-up and Text. "Featured
  collection" is a ready-made Products section.
- **Editing:** add, duplicate, delete (with Undo), reorder by dragging or with the arrow buttons, hide /
  show, and per section: phones only / computers only, start and stop dates (Bangladesh time). Problems
  (missing video link, picture from another website, unsafe button link) are flagged on the section
  before saving. All text is plain text, so nothing typed can break or hack the store.
- **Draft → preview → publish:** changes stay in a draft until published. "Save draft" updates the live
  preview beside the editor (computer or phone size, or open it in a new tab); the store doesn't change.
  "Publish now" shows it to shoppers straight away; "Schedule…" makes it go live at a set time (the
  current version stays until then; cancel any time); "Discard changes" goes back to the live version.
  If two people edit at once, the second save is refused with a "reload" message instead of overwriting.
- **Who can do what:** `cms.edit` (managers, owner) edits and saves drafts; `cms.publish` publishes and
  schedules. Every save / publish / schedule is in the audit log.
- **Store side:** the home page is now built from the published sections (before the first publish it
  shows a starter layout: hero, new arrivals, why buy from us). It stays a fast prerendered page; it
  refreshes the moment you publish, and by itself when a scheduled version or a section's start / stop
  time comes (the first visitor after that moment triggers the refresh).
- **Newsletter:** sign-ups are stored (email only, limited to 5 per hour per visitor, bots filtered).
  Sending newsletters comes with marketing in a later phase.
- Checked in the browser (temporary data removed afterwards): editing, adding slides and sections, hide,
  reorder, validation, save → preview, publish → store, schedule → went live on time, the two-editors
  guard, newsletter sign-up, YouTube block, phone layout. 11 new tests (95 total); lint, types,
  formatting and build pass.
- Steps 1.8–1.9 are committed and pushed; 1.10 is not committed yet.

**Next:** Phase 1.11 — navigation and theme.

### 2026-11-20 · Phase 1.9 — search

- **Search box in the store header** (on phones: the 🔍 button opens it under the header). Typing shows up to
  6 matching products (photo, title, Bangla title, price) and up to 4 categories, plus "See all results".
  Arrow keys move through the list, Enter opens the highlighted item or, with nothing highlighted, the
  results page; Esc closes the list. Works as a plain form without JavaScript.
- **Forgives typos and half-typed words:** "chop" finds Chopper, "chpper" / "cohpper" find Chopper,
  "blendr jucie" finds Juice Blender (1 typo allowed in 4–6 letter words, 2 in longer ones). Bangla works
  too ("জুস", "রাইস"). Every word must match (title, Bangla title, tags or category names); if nothing
  matches every word, products matching all but one are shown ("rice cokr" → rice cookers).
- **Ranking:** title matches beat tag/category matches, whole-phrase matches get a boost, then best sellers
  and newest first.
- **Results page** `/search?q=…`: "Best match" order plus the same filters, sorting and numbered pages as
  category pages. No results → spelling tips, a search box and "Did you mean" categories (or all top-level
  categories). Results pages are kept out of Google (noindex).
- **How it works:** the searchable words of every Active product are kept in one cached list, so a search
  never scans the database and suggestions answer fast. Saving a product or category in the admin rebuilds
  it. **Why not Atlas Search (the SRS plan):** the local Docker MongoDB has no Atlas Search, so it couldn't
  be developed or tested here; the built-in search behaves the same everywhere and comfortably handles
  several thousand products. Switching to Atlas Search or Meilisearch later only touches
  `modules/catalog/search-data.ts`.
- Checked in the browser with 30 temporary test products (removed afterwards): suggestions for typos, word
  starts, Bangla and categories; keyboard selection; the phone search bar; results with sorting, colour
  filter and page 2 (links keep the search); no-results page. 9 new search tests (84 total); lint, types,
  formatting and build pass.
- Step 1.8 (category and collection pages) is not committed yet; it is in the same set of changes.

**Next:** Phase 1.10 — storefront builder (home page sections).

### 2026-11-20 · Phase 1.8 — category and collection pages

- **Addresses:** `/c/<category-slug>` (e.g. `/c/kitchen-gadgets`) and `/collections/<collection-slug>`
  (e.g. `/collections/under-1400-taka`). A category page shows products in that category and all its
  sub-categories, with a breadcrumb (Home › Parent › Category), title (+ Bangla), description, picture and
  links to its sub-categories. Hidden categories and collections show "Page not found".
- **Filters:** category (sub-categories on a category page, top-level categories on a collection page, each
  with a count), price range in taka, colour (with colour dots), in stock only, and customer rating (shown
  once any product has reviews). Changes apply straight away; the chosen filters show as chips you can remove
  one by one or all at once. On phones the filters open from a "Filters" button as a sheet with a
  "Show N products" button.
- **Sorting:** newest, best selling, price low→high / high→low, biggest discount. Hand-picked collections also
  have "Featured" (the order set in the admin) and use the collection's own sort setting as the default.
- **Filters are in the address**, e.g. `/c/kitchen-gadgets?colour=red&stock=1&sort=price-asc`, so a filtered
  page can be shared or bookmarked and Back works. Wrong or old values in the address are simply ignored.
- **More products: admin choice per category / collection** — new setting "More products on the page":
  _Numbered pages_ (24 per page, plain links search engines can follow) or _Load as the shopper scrolls_
  (more load automatically near the end of the list, with a "Load more" button as a fallback).
  Loading more continues from the last product shown instead of skipping rows, so long lists stay fast.
- **Colour filter:** products now remember the colours of their active variants (any option named Colour /
  Color / রং). Existing products were updated with `pnpm catalog:resync`; new saves keep it up to date.
- **Speed:** the title area of every visible category and collection is prebuilt at deploy time; the product
  list follows the filters in the same response, from the cache. Admin saves refresh both.
- **Search engines:** title, description (SEO fields, else the description), canonical link, share image and
  Google "Breadcrumb" data.
- Checked in the browser with 30 temporary test products (removed afterwards): every filter, sorting, the
  hand-picked order, numbered pages (incl. a page number that is too high), load more to the end of the list,
  the phone filter sheet, a price range typed the wrong way round, unknown pages (404), and bad requests to the
  load-more address. 11 new tests (75 total); lint, types, formatting and build pass.
- The product, category and collection pages are marked as waiting for their (cached) data on purpose, which
  clears the Next.js "Instant" notice in development.

### 2026-11-20 · Phase 1.7 — product page

- **Address:** `/p/<slug>`, e.g. `/p/mini-electric-chopper-2l`, with a breadcrumb (Home › Category › Product).
- **Gallery:** photos, uploaded videos and YouTube. On a computer, hovering magnifies the photo under the mouse
  (2×); clicking (or the ⤢ button) opens a **full-screen viewer**: pinch, double-tap, mouse wheel or the ± buttons
  zoom up to 4×, drag to move around, swipe or arrow keys for the next photo, Esc closes.
- **Buying area:** labels, title (+ Bangla title), rating, price / old price / discount, stock, short description,
  option buttons, quantity, **Order now** and **Add to cart**. Choosing an option changes price, stock and photo.
  Both buttons are visible but switched off ("Ordering online is coming soon") until the cart and checkout exist
  (2.2, 2.3).
- **Phone:** once you scroll past the buttons, a bar with the product, price and "Order now" sticks to the bottom
  of the screen; it hides again when the buttons are back in view.
- **Description blocks** from the admin, in order: text, image, video, specifications, "What's in the box",
  comparison table; plus the product's own specification list. Text is shown as plain text (line breaks kept),
  never as HTML, so nothing typed in the admin can break the page.
- **Search engines (FR-PD-08):** page title and description (SEO fields, else short description), canonical link,
  share preview image (Open Graph), and Google "Product" + "Breadcrumb" data with price range in BDT and stock,
  so results can show price and availability. Rating is added once reviews exist.
- **Speed:** every Active product's page is prebuilt when the site is deployed and sent as complete HTML (no
  loading placeholder). A product added later is built on its first visit and then cached. Saving the product in
  the admin refreshes its page. Unknown products show a friendly "Page not found" (marked noindex).
- Quick view and the product page now share the same price / stock / quantity parts, so they always match.
- Category links in the breadcrumb lead to category pages (added in 1.8).
- Checked in the browser (development + production build): gallery, zoom 2.25× + drag + arrow keys, lightbox
  closes with Esc, option switching, blocks, structured data, no cost data in the page, phone layout and sticky
  bar show/hide. 6 new SEO tests (64 total); lint, types and build pass.
- For testing, the local test product got a short description, specifications, a category and sample description
  blocks (text, what's in the box, comparison, YouTube video). Edit or remove them in the admin.

**Next:** Phase 1.8 — category and collection pages (filters, sorting, pagination).

### 2026-11-20 · Phase 1.6 — quick-view popup

- **Quick view** on a product card opens a popup on the same page: photo/video gallery, price, stock, short
  description, option buttons (Colour, Size…), quantity, and "View full details".
- **Shareable:** opening it adds `?product=<slug>` to the address (e.g. `/?product=mini-electric-chopper-2l`).
  Sending that link opens the same page with the popup already open. The **Back** button closes it and keeps your
  place on the page; Esc, the × and clicking outside close it too.
- **Options:** starts on the first variant that is in stock. Sold-out choices are struck through; combinations that
  don't exist are dashed, and choosing one jumps to the closest real variant. Price, old price, discount and stock
  follow the choice, and the gallery jumps to that variant's photo (set "variant images" in the admin).
  The card's "Options" button also opens quick view.
- **Gallery** (reused by the product page in 1.7): arrows, swipe, arrow keys, thumbnails, uploaded videos with
  controls, YouTube that loads only when the visitor presses play (privacy-friendly youtube-nocookie).
- **Fast:** product data starts loading when the mouse moves over "Quick view", and comes from a cached public
  endpoint (`/api/products/<slug>/view`) that is refreshed when the product is saved. It only contains what
  shoppers may see: no cost prices, no SKUs, no exact stock beyond "available".
- **Add to cart** is shown but switched off ("coming soon") until the cart is built in Phase 2 (2.2).
  "View full details" goes to the product page, which is built next (1.7), so it shows "not found" until then.
- Checked in the browser: open from the card, switch Red → Blue (price ৳1,450 → ৳1,350, photo changes), Back
  closes, shared link opens it, Esc on a shared link closes without leaving the page, unknown product shows a
  friendly message, phone layout fits and scrolls. 5 new tests for option picking (58 total); lint, types, build pass.
- For testing, the local product's Red and Blue variants were linked to its two photos.

**Next:** Phase 1.7 — product detail page.

### 2026-11-20 · Phase 1.5 — storefront product card + your keys checked

**Your settings (checked without sending email or uploading files):**

- **Google sign-in: working.** The "Continue with Google" button shows and sends people to Google with the right
  return address (`/api/auth/callback/google`).
- **Gmail: working.** Gmail accepted the login. Emails go to real inboxes now, not Mailpit. Emails are sent by the
  background worker, so keep `pnpm worker` running next to `pnpm dev`.
- **Cloudinary: working.** At first the key could read but not upload ("missing permissions (create)"); after you
  gave it full access, a test upload went through (test file deleted again). The admin now shows Cloudinary's actual
  reason if an upload is ever refused.
- If sign-in ever fails with a 500 error, check that **Docker Desktop** is running: MongoDB, Redis and Mailpit run
  inside it (`pnpm services:up`).

**Product card (1.5):**

- Shows photo, name, price ("From ৳…" when variants differ), struck-through old price, discount badge, rating
  (once reviews exist), labels (New, Hot, Bestseller…) and a stock badge ("Only 3 left" at the product's low-stock
  level, "Sold out").
- Discount is honest: the struck price is the cheapest variant's own old price. If only some variants are
  discounted, the badge says "Up to −19%" instead.
- Computer: on hover the second photo (the one chosen as "hover image" in the admin) fades in, or a muted video plays
  if "autoplay on hover" is set. The card lifts with a spring and a bar slides up with Quick view and Buy now /
  Options. Keyboard focus shows the same bar.
- Phone: swipe over the photo to see more photos, with dots below.
- No jumping while loading: fixed square frame, blurred preview for Cloudinary images, lazy loading, responsive
  sizes. Motion follows the visitor's "reduce motion" setting.
- The home page "New arrivals" now shows real Active products (newest 8) instead of the fake samples. It is a static
  page refreshed every hour, and immediately when a product is saved in the admin.
- Checked: desktop hover swap + lift + action bar, phone layout (2 columns, no sideways scroll), swipe, no console
  errors; discount badge contrast raised to pass accessibility (white on darker red).

**Also changed:**

- The admin pages no longer print the "uncached data during prerendering" development error.
- CI now starts a MongoDB container before `pnpm build`, because the home page reads products while it is built.
- New command `pnpm catalog:resync`: recalculates every product's price/discount/stock summary. Already run once.
- Your local test product "Mini Electric Chopper 2L" is now Active with the two test photos, so the card can be seen.
  Change or archive it in the admin any time.

**You need to:** run `pnpm worker` alongside `pnpm dev` so emails are sent.

**Next:** Phase 1.6 — quick-view popup.

### 2026-11-20 · Phase 1 — admin catalogue built (steps 1.1–1.4)

- **Categories** (`/admin/categories`): tree with parents, English + Bangla names, auto slug, image, SEO fields,
  show/hide. Deleting one moves its sub-categories up a level and takes it off its products.
- **Collections** (`/admin/collections`): either hand-picked products, or rules (price, tag, label, category,
  stock, on sale…) that keep the list up to date by themselves.
- **Products** (`/admin/products`): search + filters, create / edit / duplicate / archive / delete. Variants built
  from options (e.g. Colour × Size) with their own SKU, price, compare-at price, weight, stock, images. Rich
  description blocks, specs, labels, tags, SEO. A product cannot go Active without an image; unsaved-changes warning.
- **Media**: drag-and-drop images and videos, YouTube links, reorder, alt text, focal point, hover image, autoplay.
  Without Cloudinary keys, uploads go to `public/uploads/` on your computer (dev only, not committed; switched off
  in production). With keys, they go straight to Cloudinary.
- **Inventory** (`/admin/inventory`): stock per variant, low-stock filter, adjust with a reason (blocked if stock
  would go below 0), full history, and **purchase batches**: shipping/customs/other costs are spread over the goods
  by value, and each variant's average cost is updated.
- **Who sees what:** cost prices, landed cost and purchase batches are visible to **managers and owners only**.
  Staff can view products and stock but not costs, and get a real 403 on "new product" / "new collection".
- Every change is in the audit log; storefront cache tags are refreshed on save (ready for 1.15).
- Checked on a production build: product with 2 variants and opening stock; batch PB-2026-0001 landed costs match a
  hand calculation (Red ৳834.78, Blue ৳746.89); over-removal refused; rule collection counts correctly; staff role
  sees no edit buttons, no cost data, 403 on create pages. `pnpm lint`, typecheck and 50 tests pass.
- **You need to:** restart `pnpm dev` (Ctrl+C, then `pnpm dev`) — your running dev server still has old code and
  will 404 the new admin pages until restarted. Add Cloudinary keys when you can so uploads go to the cloud.

**Next:** Phase 1.5 — storefront product card.

### 2026-11-20 · Change: admin two-factor authentication removed

- At your request, admin sign-in is now **email + password only**. No QR code, no authenticator app, no 6-digit code.
- Removed: Better Auth `twoFactor` plugin (server + client), the `/admin/setup-2fa` page, the 2FA step in the admin
  sign-in form, the "2FA on" checks in `proxy.ts` and `modules/auth/session.ts`, the 2FA column in Staff & roles,
  and the `qrcode` package.
- Still protecting the admin: 5 wrong passwords → account locked 15 min, per-IP rate limits, Argon2id passwords,
  role permissions with real 403s, block / "sign out everywhere", audit log of every sign-in.
- **Trade-off:** this goes against SRS NFR-SEC-04 ("2FA required for every staff account"). If a staff password
  leaks, that alone is enough to get in. Use long unique passwords for staff. 2FA can be switched back on later
  (e.g. in Phase 3 hardening) without data changes.
- Old `twoFactor` records in the database are now unused and harmless.
- Checked: production build; staff account (which had 2FA on) signs in with password only → dashboard 200;
  `/admin/setup-2fa` → 404; permission 403s unchanged; `pnpm check` passes.
- **You need to:** restart `pnpm dev` (Ctrl+C, then `pnpm dev`). The running dev server kept the old dashboard code
  in memory and still sends you to the removed setup page until restarted.

### 2026-11-20 · Fix: 2FA QR code not scanning

- The QR on `/admin/setup-2fa` had a 1-module white border on a dark page. Phone scanners need about 4, so
  authenticator apps often didn't pick it up. It now has a full white border.
- Added step-by-step instructions and a **"Can't scan? Enter a setup key instead"** section that shows the key
  (with a Copy button) for typing into the authenticator app by hand.
- Checked: QR shows with the wide border; a code made from the setup key turned 2FA on and showed the backup
  codes; `pnpm check` passes.
- Note: the dev test account `staff@example.test` was still blocked from the Phase 0 "block staff" test; it is
  unblocked again.

### 2026-11-20 · Fix: admin set-password / sign-in pages showing a dev error

- `/admin/set-password` read the URL (`?token=`) without telling Next.js that the page must render at request
  time. In dev, Next.js flagged it ("URL data accessed outside `<Suspense>`") and rendered the page an extra time
  for its check, while the first visit was also compiling the route.
- Added `export const instant = false` to `/admin/set-password`, `/admin/sign-in` and `/admin/setup-2fa`. These
  pages read the URL or session on every request, so blocking is correct for them.
- Checked: page loads once with no dev error or issue badge; reload does not repeat; `pnpm check` passes (33 tests).
- Added the "Email: local vs real" notes under Running locally.

### 2026-11-19 · Fix: `pnpm owner:create` without `--name`

- Running `pnpm owner:create --email … showrov` crashed because the name was passed without `--name`.
- The script now accepts the name either way, and prints which value is missing or invalid instead of only the usage line.
- Checked: no arguments → both problems listed; bad email → email error; `--email owner@example.test Test Owner` → works.

### 2026-11-19 · Phase 0 — Foundation built (branch `phase-0-foundation`)

**Done**

- Next.js 16.4 + TypeScript strict + Tailwind 4 + shadcn/ui (Radix) scaffolded; pnpm scripts, Prettier, ESLint, Vitest.
- Docker Compose: MongoDB 8 replica set (port 27018), Redis 7, Mailpit. Typed, validated env (`lib/env.ts`).
- Auth with **Better Auth 1.7** (MongoDB adapter, Redis secondary storage): email/phone + password (Argon2id), Google OAuth (switches on when keys exist), email verification, phone OTP, TOTP 2FA with backup codes, account linking for verified Google emails.
- Staff/admin: `/admin` sign-in → forced 2FA setup → dashboard. Owner can invite staff by email, change roles, block/unblock, and sign someone out of every device. `pnpm owner:create` bootstraps the first owner.
- RBAC (`modules/auth/rbac.ts`): Staff / Manager / Owner, 23 granular permissions. Checked in `proxy.ts` (real HTTP 403), in pages (`requireStaff`), and in server actions / route handlers (`checkStaff`).
- Append-only audit log + viewer; sign-ins, invites, role changes, blocks, lockouts and job retries are recorded.
- Security: strict nonce CSP on admin, locked-down CSP on storefront, security headers, HSTS on HTTPS, Redis rate limits, account lockout, Zod everywhere, Mongo filter sanitising, AES-256-GCM helper for integration keys.
- Worker (`pnpm worker`): BullMQ notifications queue (email via SMTP/Mailpit, SMS via console provider), retries with back-off, failed-job list + retry button at `/admin/system`.
- Media: signed direct upload endpoint for Cloudinary with type/size limits and a magic-byte checker.
- Design system: brand tokens (light + dark), Bangla font, motion primitives that respect the admin motion level and OS reduce-motion. Temporary home page shows them.
- Shared helpers: poisha money, BD phone normalising (`+8801…`), atomic counters, soft-delete plugin.
- CI workflow + Dependabot.

**Verified (2026-11-19, production build on this Mac)**

- `pnpm check`: lint clean, typecheck clean, **33 unit tests pass**; `pnpm build` succeeds (storefront static, admin dynamic).
- Owner: invite email → set password → sign in → forced 2FA enrolment → dashboard. All admin scripts carry the CSP nonce; no console CSP errors.
- Staff user: `/admin` 200; `/admin/staff`, `/admin/audit`, `/admin/system` → **HTTP 403**; media upload signing → 403; owner-only menu items hidden.
- 5 wrong passwords → 6th attempt (even with the right password) → 429 for 15 minutes; lockout appears in the audit log.
- Blocking a staff member signs them out immediately.
- Customer sign-up → verification email in Mailpit; short password rejected; non-BD phone rejected for OTP; BD phone OTP sent through the worker.
- 50 parallel counter increments → 50 unique sequential numbers.

**Not done / notes**

- CI has not run yet (needs a push to GitHub).
- Google sign-in and Cloudinary uploads are wired but untested until you add keys.
- Phone-only customer sign-up (no email) moves to Phase 2, together with the real SMS provider.
- Invite links expire after 1 hour (same as password resets); the owner can re-send by inviting the same email again.
- Playwright end-to-end tests start in Phase 1 (the checks above were done by hand + curl).
- The SRS's suggested `sessions`/`otps` collection shapes are replaced by Better Auth's own collections (`sessions`, `accounts`, `verifications`, `twoFactor`).

**Needed from you:** store name; review and merge the branch; Google OAuth client and Cloudinary keys (see "During Phase 0" above).

**Next:** Phase 1.1 — categories and collections.

### 2026-11-19 · Planning

- Read the SRS and turned it into the phase/step checklist above.
- Copied the SRS into `docs/` so the spec lives with the code.
- Checked the Mac: Node v26, pnpm, Docker and Git are installed.
- **Next:** step 0.1 (initialise the repo) as soon as the store name and GitHub repo are decided.
