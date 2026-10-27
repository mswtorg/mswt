# Roadmap — Phase 1

One branch and one PR per step. A step is done only when its exit criteria pass and `/done-check` is clean (see [standards.md](standards.md)).

**Branches (from 2026-10-23):** step PRs merge into **`stage`**, which has the only preview deployment (`mswt-git-stage-mswt.vercel.app`, Neon branch `preview/stage`). When stage has been checked, the owner merges a **`stage` → `main`** PR, which deploys production. Feature branches get CI but no Vercel deployment or database branch, so the Neon branch limit isn't reached again.

| # | Step | Branch |
|---|---|---|
| 0 | Foundation + brand tokens | `chore/step-0-foundation` |
| 1 | Design in code (HTML mockups) | `design/step-1-mockups` |
| 2 | Scaffold + CI gates | `chore/step-2-scaffold` |
| 3 | Design system in code | `feat/step-3-design-system` |
| 4 | SEO foundation | `feat/step-4-seo` |
| 5 | JSON-LD | `feat/step-5-jsonld` |
| 6 | Public pages | `feat/step-6-public-pages` |
| 7 | Donation flow | `feat/step-7-donations` |
| 8 | Admin, in 4 PRs: 8a auth + users + audit + settings, 8b donations + donors + reports, 8c-1 pages + causes + media + messages, 8c-2 events + news + gallery + documents + menus | `feat/step-8a-admin-auth`, `feat/step-8b-admin-donations`, `feat/step-8c1-admin-content`, `feat/step-8c2-admin-content` |
| 9 | PWA + email | `feat/step-9-pwa-email` |
| 10 | QA audit | `chore/step-10-qa` |
| 11 | Staging review | `chore/step-11-staging` |
| 12 | Go-live | `chore/step-12-go-live` |
| 13 | Post-launch monitoring | `chore/step-13-monitoring` |

---

## Step 0 — Foundation + brand tokens
**Deliverables:** `CLAUDE.md`, `docs/brand.md`, `tokens/design-tokens.json`, `docs/spec.md`, `docs/standards.md`, `docs/roadmap.md`, `docs/open-questions.md`, `.claude/commands/*` (a11y-audit, seo-check, jsonld-check, pwa-check, brand-check, done-check).
**Exit:** tokens parse as valid W3C DTCG JSON with all aliases resolving; contrast table computed with every used pair PASS; owner approves palette, typography and spec; open questions handed to the Trust.

## Step 1 — Design in code (HTML mockups on brand tokens)
*Changed from "Figma design": the owner chose to design in code (2026-10-20). Figma stays optional, via the html.to.design plugin and a Tokens Studio import.*
**Deliverables:**
- `scripts/tokens-to-css.mjs` → `design/tokens.css`, using Tailwind v4 variable names
- `design/base.css` (components)
- 22 static mockups in `design/mockups/`:
  - Home in en/hi/mr/gu
  - Donate in all 4 languages, plus error states in en and hi
  - Thank-you states (confirming, paid, failed)
  - About, Causes, Cause detail, Contact, 404
  - Admin sign-in + 2FA, Dashboard, Donations list, Offline entry
  - Style guide (colours, type in 3 scripts, components, logo)
- `design/README.md`

**Exit:** owner sign-off on the published mockups; site font decided (Poppins, 2026-10-21); no literal colours, fonts, radii or shadows outside tokens.css; axe clean; every page reviewed at 360px and 1440px.

## Step 2 — Scaffold + CI gates
**Deliverables:** Node 24 via nvm (`.nvmrc` = 24; run `nvm use`), engines field and CI on Node 24, Next.js App Router + TS strict, Tailwind, ESLint (incl. jsx-a11y) + Prettier, next-intl with 4 locales and `/` → `/en`, Drizzle + Neon connection + first SQL migration (users, audit_log, settings), env validation (zod) + `.env.example`, Vitest, Playwright + axe, Lighthouse CI config with budgets, GitHub Actions (lint, typecheck, test, e2e, build, Lighthouse), Vercel project with preview deployments, secure headers baseline, Dependabot.
**Exit:** CI green on an empty localised page in all 4 locales; axe 0 violations; Lighthouse budgets enforced and failing a deliberately bad change.

## Step 3 — Design system in code
**Deliverables:** token build (reuse `scripts/tokens-to-css.mjs` output inside Tailwind v4 `@theme`), components lifted from `design/base.css` and the mockups, `next/font` setup (Poppins + Noto Sans Devanagari/Gujarati, plus the curated admin font options with CSS variables; subsets, swap), UI primitives (Button, Link, Input, Select, Checkbox, Radio, Textarea, FormField with error wiring, Alert, Card, Badge, Breadcrumbs, Skip link, Header, Footer, LanguageSwitcher, Dialog), logo component, reduced-motion utilities, component tests + axe per component, a `/en/_styleguide` route (noindex, dev/preview only).
**Exit:** `/brand-check` PASS (no literals in `src/`); all components keyboard + axe clean; Indic sample text renders correctly.
**Done (2026-10-22):** Tailwind theme generated from tokens with Tailwind's defaults removed; Poppins self-hosted with per-locale preloads; UI components + header/footer/admin shell; nav `ready` flags; `/styleguide` (non-production); `brand:lint` in CI; 37 unit + 44 e2e tests. Hindi/Marathi lab LCP budget is 3.0 s by owner decision (standards PERF-01).

## Step 4 — SEO foundation
**Deliverables:** metadata helpers (title template, canonical, hreflang + x-default), `sitemap.ts` with alternates, `robots.ts`, noindex for admin/api/thank-you/offline, OG/Twitter image template (`opengraph-image.tsx` with logo + brand tokens, Indic-capable font), 404/500 pages, IndexNow helper + key file, verification meta from settings.
**Exit:** `/seo-check` PASS; sitemap validates; hreflang reciprocal across 4 locales in e2e test.
**Done (2026-10-22):** `buildMetadata` + per-locale title templates from `seo_settings`; sitemap and robots with environment rules; noindex on non-canonical hosts; OG/Twitter images (English live, Indic pre-rendered in Chromium); catch-all 404 and localised error pages; IndexNow helper and key route; verification from settings. The CI build now reads settings from its own Postgres. Lighthouse SEO is 1.0.

## Step 5 — JSON-LD
**Deliverables:** typed `<JsonLd>` (schema-dts), builders for NGO (from `organization_settings`), WebSite, WebPage/AboutPage/ContactPage/CollectionPage, BreadcrumbList, Event, NewsArticle, ImageObject, DonateAction; unit tests asserting shape; Organization settings form (minimal) in admin seeded with Trust data.
**Exit:** `/jsonld-check` PASS; Rich Results Test + schema.org validator clean for each type (URLs recorded in PR); no SearchAction, no FAQPage.
**Done (2026-10-22):** typed builders (NGO, WebSite, WebPage types, BreadcrumbList, Event, NewsArticle, ImageObject, DonateAction) with `compact()` (no empty fields) and a script-safe serialiser; `<JsonLd>`; home graph live; 512×512 logo PNG; `data/organization.json` + `org:sync` instead of an admin form (the admin needs auth, Step 8). Rich Results validation done by pasting code, since previews are behind login.

## Step 6 — Public pages
**Deliverables:** Home, About, Causes list/detail, Gallery (+album), Events list/detail, News list/detail, Transparency, Contact (form + Turnstile + messages table), Privacy, Terms, Refund Policy, 80G disclaimer — all reading CMS tables, 4 locales, ISR + on-demand revalidation. Donate page shell only.
**Exit:** every route × 4 locales passes axe, Lighthouse budgets, `/seo-check`, `/jsonld-check`; legal texts reviewed by Trust *(manual)*.
**Done (2026-10-22):** content schema (migration 0002); content layer with the language/review rule; sample content for previews; `content:sync` + `/api/revalidate`; About, Causes (+detail), Gallery (+album), Events (+detail), News (+detail, paginated), Transparency, Contact (Turnstile, rate limit) and legal drafts (off production until reviewed); sitemap includes content; Vercel build runs migrations. Real photos/R2, per-item share images and the donate flow come later.

## Step 7 — Donation flow
**Deliverables:** `PaymentProvider` interface + Cashfree adapter (sandbox), donate form (presets, custom amount, cause, fee-cover, anonymous display, 80G + PAN, Indian-citizen declaration), order route, webhook with signature verification + idempotency, receipt numbering service (gapless per FY), receipt PDF (logo header, Indic-capable font) → R2, thank-you page with status polling, daily reconciliation cron, offline-donation service (used by admin in Step 8).
**Exit:** unit tests for amount validation, fee calc, FY boundaries, receipt numbering under concurrency, cash > ₹2,000 rule, PAN rule; e2e against Cashfree sandbox (success, failure, duplicate webhook, delayed webhook, redirect-without-webhook); no SW caching of donate/api.
**Built (2026-10-23):** everything above plus the receipt email via Brevo (moved here from Step 9). The e2e flows run against an in-process fake gateway that sends Cashfree-format signed webhooks; the run against the real Cashfree sandbox waits for keys (B9). Donations are off in production until go-live (`NEXT_PUBLIC_DONATIONS_LIVE`). Admin alert emails stay in Step 9.

## Step 8 — Admin
**Deliverables:** Auth.js credentials + TOTP enrolment/recovery codes, role middleware, Dashboard, Donations (filters, detail, offline entry, resend, void/reissue, CSV/XLSX export), Donors, Causes, CMS (pages, gallery, events, news, menus, media with per-locale alt, SEO fields, translation review), Messages, Reports (FY register, cause-wise, 80G register, ack register), Settings (organization, SEO, payments, email, appearance/site font), Users/roles, Audit log.
**Exit:** permission matrix in `spec.md` enforced by server tests for every action; audit entries for every write; admin keyboard + axe clean; noindex verified.
**Split (owner decision, 2026-10-23):** three PRs.
- **8a (built 2026-10-23):** Auth.js + mandatory TOTP (setup, recovery codes, no reuse), argon2id, 5-failure lockout, 30-min idle sessions ended at once on deactivate/role change/2FA reset; one-time invite and reset links (72 h, hash stored) handed out by a Super Admin; Users, Audit log, My account; Settings (organization, SEO, payments, email, appearance → public site font); `npm run admin:create`.
- **8b (built 2026-10-23):** dashboard; donations (filters, detail with timeline, offline entry with the cash warning, resend, void, reissue in the same FY, CSV + Excel export); donors (search, profile, contact edit, merge); reports (5 registers/summaries, CSV + Excel); full PAN only after a code emailed to the admin (15-minute window, audited). Admin UI redesigned: grouped sidebar with icons, page headers, sectioned two-column forms with a sticky Save bar, compact tables and filters.
- **8c** is split in two (owner decision, 2026-10-23):
  - **8c-1 (built 2026-10-23):** Content group in the sidebar with one entry per public page (Home, About, Contact, Transparency, the four legal pages), each edited per language in a sectioned form with a text editor (`## heading`, `- list`, `**bold**`, links, notes, photos) and live preview, plus a "reviewed by a person" switch; Causes (settings, cover photo, text per language); Media library (photos resized to WebP at upload, EXIF/GPS removed, alt text per language); Messages inbox (status, assignee, mailto reply, 12-month deletion). Organization settings keep only the Trust's facts.
  - **8c-2 (built 2026-10-23):** Events, News, Gallery albums, Transparency documents (PDF up to 25 MB, direct upload to R2), header/footer menus; photos everywhere: cover photos, photo sliders (swipe, arrows, dots, full-screen viewer, no autoplay), slider blocks in text, header photos on every page including Home, trustee photos.
  - **Content everywhere (built 2026-10-27):** list pages and Home sections editable; built-in texts and menus copied into the database on every migrate; deployed sites read the database only; Content → Sample content loads/removes sample items with sample photos.
  - **Owner request (2026-10-23):** a **Content (CMS)** group in the admin sidebar with one entry per public page (Home, About, Causes, Contact, Transparency, legal pages…), each editing that page's content in its own sectioned form. Today that content is managed as a single block under Settings → Organization. Organization settings keep only the Trust's facts (name, address, registrations, contact).

## Step 9 — PWA + email
**Deliverables:** Serwist SW (precache static, SWR public pages, NetworkOnly for donate/api/admin/receipts, offline page), manifest + icons + screenshots + Apple meta; `EmailProvider` interface + one adapter (choice from open questions) + templates (donor receipt, admin alert, contact acknowledgement, reconciliation summary) with logo header, 4 locales; SPF/DKIM/DMARC on Cloudflare DNS; Cloudflare Email Routing `info@` → Trust Gmail.
**Exit:** `/pwa-check` PASS; installable in Chrome DevTools; offline fallback works; donate never served from cache (e2e); test emails pass mail-tester ≥ 9/10.

## Step 10 — QA audit
**Deliverables:** full run of `/done-check` and all audits across all routes × locales; manual screen-reader pass; cross-browser (Chrome, Safari iOS, Firefox, Samsung Internet); security review (headers, CSP report, rate limits, authz); load sanity on webhook; translation review sign-off; bug list fixed.
**Exit:** zero FAIL items; audit report committed to `docs/qa/`.

## Step 11 — Staging review
**Deliverables:** staging on Vercel (`staging.mswelfaretrust.org`, noindex + basic auth), seeded with real content, Cashfree sandbox; Trust walkthrough of public site, donation, receipt PDF and admin; training notes for Accountant and Content Editor.
**Exit:** Trust sign-off in writing; all feedback resolved or deferred to Phase 2 explicitly.

## Step 12 — Go-live
**Deliverables / checklist:**
- Confirm the Vercel plan for the MSWT-owned account (Hobby vs Pro, see D6) and that every service (GitHub, Vercel, Neon, Cloudflare, Cashfree, email) is owned by the Trust email with 2FA
- Cashfree production keys + webhook URL, international payments disabled, ₹1 live test + refund
- DNS on Cloudflare → Vercel, HTTPS, HSTS; email SPF/DKIM/DMARC verified
- Production DB migrated, settings filled (Organization, SEO, payments), first FY sequence initialised
- **Google Search Console:** verify Domain property via DNS TXT on Cloudflare; submit `https://mswelfaretrust.org/sitemap.xml`; inspect home + key URLs; check Pages, Core Web Vitals and Enhancements reports
- **Bing Webmaster Tools:** verify (import from GSC or DNS), submit sitemap; IndexNow key live and ping on publish confirmed
- Rich Results Test on live URLs; Lighthouse on production
- **Off-site checklist (Trust):** claim Google Business Profile with exactly the same name, address and phone as the website; create official social profiles and link both ways (site `sameAs` ↔ profile website field); check eligibility of an Indian 12A/80G trust for **Google for Nonprofits** (via TechSoup/Goodstack validation) and, if eligible, apply for Google Ad Grants and YouTube Nonprofit Program
**Exit:** live donation end-to-end with receipt emailed; GSC + Bing verified with sitemap accepted; uptime monitor green.

## Step 13 — Post-launch monitoring
**Deliverables:** weekly (first month) then monthly review: GSC Pages (indexing errors), Core Web Vitals (field), Enhancements (Breadcrumbs, Events etc.), Bing reports; Vercel Speed Insights; uptime + error alerts (Sentry or Vercel); daily reconciliation summary watched; Neon free-plan storage/compute usage; backup/export of donations monthly; dependency updates; FY rollover dry-run before 1 April.
**Exit:** 30 days with no unresolved critical alerts; FY rollover tested; Phase 2 backlog (recurring donations, Form 10BD export, donor OTP lookup, WhatsApp, volunteers, push) groomed.
