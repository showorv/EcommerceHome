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

## Planned folder layout

```
EcommerceHome/
├─ app/
│  ├─ (store)/          # public storefront (static/ISR pages)
│  ├─ admin/            # admin panel (dynamic, authenticated, 2FA)
│  └─ api/              # route handlers: webhooks, invoice link, auth callbacks
├─ modules/             # business logic, no UI
│  ├─ auth/  catalog/  inventory/  orders/  cms/
│  ├─ notifications/  shipping/  audit/  settings/
├─ components/          # shared UI (shadcn/ui, motion primitives, product card…)
├─ lib/                 # db, redis, env, utils
├─ worker/              # BullMQ worker: SMS, email, PDF, courier, image jobs, cron
├─ tests/               # Vitest + Playwright
├─ docker-compose.yml   # local MongoDB, Redis, Mailpit
└─ docs/                # SRS and decisions
```

---

## Phases and steps

Estimates come from the SRS (two part-time developers). Adjust to real availability.

### Phase 0 — Foundation (2–3 weeks)

- [ ] 0.1 Initialise repo: git, Next.js (App Router) + TypeScript strict, pnpm, ESLint, Prettier, folder layout above
- [ ] 0.2 Local environment: `docker-compose.yml` with MongoDB (replica set, needed for transactions), Redis, Mailpit; `.env.example`; typed env loader
- [ ] 0.3 CI: GitHub Actions running lint, typecheck, tests, build; dependency scan (NFR-SEC-17)
- [ ] 0.4 Design system: Tailwind + shadcn/ui, theme tokens as CSS variables (FR-SF-03), fonts incl. Bangla, motion primitives with reduce-motion support (FR-SF-04/05)
- [ ] 0.5 Database layer: Mongoose connection, base schema conventions (timestamps, soft delete, poisha money), `counters` collection for atomic numbers
- [ ] 0.6 Auth for customers: Google OAuth + email/phone + password (Argon2id), account linking, sessions in HttpOnly cookies (FR-AC-01…05, NFR-SEC-01…03)
- [ ] 0.7 Admin auth: separate `/admin`, staff invite, TOTP 2FA required, session list + forced sign-out (FR-AD-09, NFR-SEC-04)
- [ ] 0.8 RBAC: roles (Staff / Manager / Owner) with granular permissions like `orders.confirm`, server-side guards (NFR-SEC-07)
- [ ] 0.9 Audit log: append-only `auditLogs` with before/after, IP, user agent (FR-AD-10, NFR-SEC-16)
- [ ] 0.10 Security baseline: headers + CSP, rate limiting with Redis, CSRF, Zod everywhere (NFR-SEC-05, 09, 11, 12)
- [ ] 0.11 Media upload pipeline: Cloudinary (or R2) direct upload via signed URLs, type/size checks (NFR-SEC-15)
- [ ] 0.12 Worker process skeleton: BullMQ queues, retries with back-off, dead-letter list (NFR-SC-05)

**Done when:** a staff user can sign in with 2FA, sees only what their role allows, every action shows in the audit log, and CI is green.

### Phase 1 — Catalogue + storefront (3–4 weeks)

- [ ] 1.1 Categories and collections (manual + rule-based) — admin CRUD (FR-AD-03)
- [ ] 1.2 Products + variants: CRUD, duplicate, archive, per-variant price/stock/SKU/weight/images, SEO fields (FR-AD-02, FR-PD-02, FR-PD-08)
- [ ] 1.3 Product media: multiple images + videos, focal point, alt text, hover image choice
- [ ] 1.4 Inventory: stock per variant, low-stock threshold, movement history, purchase batches with landed cost (FR-AD-04)
- [ ] 1.5 Product card: hover image swap, pop/lift with action bar, labels, stock badge, no layout shift (FR-PC-01…03, 07)
- [ ] 1.6 Quick-view modal with shareable URL (FR-PC-04)
- [ ] 1.7 Product detail page: gallery with video, zoom, lightbox, variant picker, rich description blocks, sticky mobile add-to-cart (FR-PD-01…03, 05)
- [ ] 1.8 Category / collection pages: filters, sorting, pagination or infinite scroll (FR-SF-07)
- [ ] 1.9 Search: Atlas Search with typo tolerance + suggestions (FR-SF-08)
- [ ] 1.10 Storefront builder: sections per page (hero, carousel, grid, banners, video, FAQ…), reorder, schedule, hide, draft + preview + publish (FR-SF-01, FR-AD-07)
- [ ] 1.11 Navigation + theme editor: header, mega-menu, footer, announcement bar, colours, fonts, motion level (FR-SF-02, 03)
- [ ] 1.12 CMS pages with block editor (About, Privacy, Terms, Returns, Shipping, FAQ, Contact) (FR-SF-09)
- [ ] 1.13 Scroll motion: reveal, page transitions, parallax hero, GSAP pinned story section, lazy-loaded (FR-SF-04, NFR-PF-02/03)
- [ ] 1.14 WhatsApp / Messenger floating button (FR-SF-10)
- [ ] 1.15 ISR + on-demand revalidation when admin saves content (NFR-SC-02)

**Done when:** a manager adds a product with 6 images + 2 videos and sees it live within 1 minute without redeploy, and can rearrange home-page sections with preview.

### Phase 2 — Orders (launch-critical, 3–4 weeks)

- [ ] 2.1 Locations (division/district/area) seed data + delivery zones and charge rules in admin (FR-AD-08)
- [ ] 2.2 Cart: drawer + page, guest persistence, merge on sign-in (FR-CO-01)
- [ ] 2.3 Checkout form with live totals and zone/weight delivery charge (FR-CO-02, SRS §2.2–2.3)
- [ ] 2.4 SMS adapter (BTRC-listed provider) + phone OTP with limits (FR-CO-03, SRS §2.4)
- [ ] 2.5 Payment options: COD, COD + delivery advance, full advance with sender number + unique TrxID; wallet numbers + QR from settings
- [ ] 2.6 Coupons (FR-CO-04)
- [ ] 2.7 Order placement: server re-validation, idempotency key, MongoDB transaction, atomic stock reservation, order number counter (FR-CO-05…07, NFR-SC-07)
- [ ] 2.8 Risk score + blocked contacts + rules that require advance (SRS §2.4)
- [ ] 2.9 Admin orders: pending queue, click-to-call, call log, notes, edit before confirm, confirm/cancel with reason, bulk actions (FR-OR-08/09, FR-AD-05)
- [ ] 2.10 Order state machine + separate payment status, enforced on server (FR-OR-01/02)
- [ ] 2.11 Invoice: sequential number, PDF with Bangla font, signed token link with expiry/revoke (FR-OR-03…05)
- [ ] 2.12 Email adapter (Resend/SES/Brevo) + React Email templates; editable SMS/email templates; notification log with retry (FR-OR-06/07)
- [ ] 2.13 Steadfast courier adapter: book single/bulk, tracking code, status polling/webhook (SRS §8.4)
- [ ] 2.14 Customer account area: addresses, order history timeline, invoice download, re-order, wishlist; guest order tracking (FR-AC-06/07)
- [ ] 2.15 Customers admin + dashboard (FR-AD-01, FR-AD-06)
- [ ] 2.16 Integrations settings page with encrypted keys (FR-AD-12, NFR-SEC-13)
- [ ] 2.17 Manual order form for Facebook/WhatsApp orders (Open question 9)

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
- [ ] **Store name** (needed for the repo, theme and later the domain)
- [ ] **GitHub account / repository** where the code will live (private repo recommended)
- [ ] Confirm or change the SRS defaults in [Open decisions](#open-decisions) below
- [x] Node.js, pnpm, Docker, Git installed on this Mac (already present)

### During Phase 0
- [ ] **Google Cloud** project + OAuth client (Web) for sign-in — I will give the exact redirect URIs
- [ ] **Cloudinary** account (free tier) for images/videos
- [ ] **MongoDB Atlas** account (free cluster for staging; Singapore or Mumbai region) — local Docker is used for development
- [ ] An authenticator app (Google Authenticator / Authy) for admin 2FA

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

| # | Question | Default being used |
|---|----------|--------------------|
| 1 | Store name, domain, SMS sender ID | **Needed from you** |
| 2 | Advance for all outside-Dhaka orders, or only risky ones? | Risk-based: new customers outside Dhaka + orders above ৳3,000 |
| 3 | Receiving account | bKash PRA + Nagad, both with QR at checkout |
| 4 | Courier at launch | Steadfast; Pathao in Phase 4 |
| 5 | Hosting | One VPS with Docker behind Cloudflare |
| 6 | Media | Cloudinary free tier |
| 7 | Bangla UI at launch? | English UI, Bangla product names/descriptions; full Bangla in Phase 4 |
| 8 | Return policy | 3-day change of mind for unused items, customer pays return delivery; defects replaced free |
| 9 | Orders from Facebook/WhatsApp chats? | Yes, admin manual-order form |
| 10 | VAT/BIN on invoices? | Not at launch; optional BIN field |

---

## Running locally

_Filled in during step 0.1–0.2._

---

## Progress log

Newest first. Each entry: date · step · what changed · what is left / needed from you.

### 2026-11-19 · Planning
- Read the SRS and turned it into the phase/step checklist above.
- Copied the SRS into `docs/` so the spec lives with the code.
- Checked the Mac: Node v26, pnpm, Docker and Git are installed.
- **Next:** step 0.1 (initialise the repo) as soon as the store name and GitHub repo are decided.
