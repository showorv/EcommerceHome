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
- [x] 1.5 Product card: hover image swap, pop/lift with action bar, labels, stock badge, no layout shift (FR-PC-01…03, 07) — _Quick view button opens the product page until 1.6; real Add to cart comes with the cart (2.2), wishlist with 2.14_
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

### Security notes for later phases

- **Production database user:** give the app's MongoDB user `insert` + `find` only on `auditLogs` (no update/delete), so the audit log stays append-only even if the app is compromised.
- **Storefront CSP** allows inline scripts because static/ISR pages can't carry a per-request nonce (Next.js limitation). The admin area, which handles sensitive data, uses a strict nonce + `strict-dynamic` policy. Revisit Next's experimental SRI (hash-based CSP) in Phase 3.
- **Dev SMS** (`SMS_PROVIDER=console`) prints full messages, including OTP codes, to the worker log. Production must use a real provider.
- Set `CLIENT_IP_HEADER=cf-connecting-ip` behind Cloudflare so rate limits use the real visitor IP.

---

## Progress log

Newest first. Each entry: date · step · what changed · what is left / needed from you.

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
