# Functional spec — Phase 1

Status: draft for review (Step 0). Items marked **[OQ-n]** depend on an answer in [open-questions.md](open-questions.md).

## 1. Sitemap

Locales: `en` (default), `hi`, `mr`, `gu`. `{l}` = locale. Slugs are ASCII and **shared across locales** (same slug for `/en/causes/education` and `/hi/causes/education`) so hreflang pairs are trivial; titles, H1s and body are localised.

### Public (indexable, server-rendered/static, in `sitemap.xml` with alternates)
| Page | URL | Notes |
|---|---|---|
| Root | `/` | 308 → `/en` (no content) |
| Home | `/{l}` | WebSite + NGO JSON-LD |
| About | `/{l}/about` | Trustees, Trust PAN, 12A/80G numbers + validity. AboutPage |
| Causes list | `/{l}/causes` | CollectionPage |
| Cause detail | `/{l}/causes/{slug}` | Unique title/H1 per locale, Donate CTA |
| Donate | `/{l}/donate` | `?cause={slug}` preselects. DonateAction. **Never cached by SW** |
| Gallery | `/{l}/gallery` | Albums; ImageObject per image |
| Gallery album | `/{l}/gallery/{slug}` | |
| Events list | `/{l}/events` | Upcoming + past |
| Event detail | `/{l}/events/{slug}` | Event JSON-LD |
| News list | `/{l}/news` | Paginated `?page=n` (canonical to itself) |
| News article | `/{l}/news/{slug}` | NewsArticle JSON-LD |
| Testimonials | `/{l}/testimonials` | CollectionPage; 9 per page; in Admin → Menus only (not in the built-in menus) |
| Testimonial story | `/{l}/testimonials/{slug}` | WebPage + BreadcrumbList; no `Review` markup |
| Transparency | `/{l}/transparency` | Registration certificates (12A, 80G, trust registration, PAN), then annual reports and audited accounts by year (PDF links on R2) |
| Contact | `/{l}/contact` | Form (Turnstile) + address/map link. ContactPage |
| Privacy policy | `/{l}/privacy` | DPDP Act 2023 compliant |
| Terms of use | `/{l}/terms` | |
| Refund policy | `/{l}/refund-policy` | Required by Cashfree |
| 80G disclaimer | `/{l}/80g-disclaimer` | Eligibility, cash limit, PAN rule, Form 10BE note |

### Public but `noindex` (not in sitemap)
| Page | URL |
|---|---|
| Thank you / status | `/{l}/donate/thank-you?order={publicOrderId}` — reads status from DB, polls until webhook lands |
| Offline fallback | `/{l}/offline` |
| 404 / 500 | localised `not-found` / `error` |

### Admin (English, `noindex, nofollow`, `Disallow` in robots, auth required)
`/admin/login`, `/admin/2fa`, `/admin` (dashboard), `/admin/donations`, `/admin/donations/new` (offline entry), `/admin/donations/{id}`, `/admin/donors`, `/admin/donors/{id}`, `/admin/causes`, `/admin/content/pages`, `/admin/content/gallery`, `/admin/content/events`, `/admin/content/news`, `/admin/content/menus`, `/admin/messages`, `/admin/reports`, `/admin/settings/organization`, `/admin/settings/seo`, `/admin/settings/payments`, `/admin/settings/email`, `/admin/settings/receipts`, `/admin/settings/appearance`, `/admin/users`, `/admin/audit-log`.

### API (`noindex` header, `Disallow`, never cached)
`POST /api/donations/order`, `POST /api/webhooks/cashfree`, `GET /api/donations/{publicOrderId}/status`, `GET /api/receipts/{token}` (signed, expiring link to R2 PDF), `POST /api/contact`, `GET /api/cron/reconcile` (Vercel Cron, secret header), `POST /api/indexnow` (internal, on publish).

### Generated
`/sitemap.xml` (`app/sitemap.ts`, with `alternates.languages` for all 4 locales + x-default), `/robots.txt` (`app/robots.ts`), `/manifest.webmanifest`, `/sw.js`, `/{indexnow-key}.txt`, OG images via `opengraph-image.tsx` per route.

### SEO rules (as built in Step 4)
- Canonical origin = `NEXT_PUBLIC_SITE_URL`. Every page uses `buildMetadata()` (`src/lib/seo/metadata.ts`): absolute canonical, hreflang for en/hi/mr/gu + x-default → `/en…`, Open Graph (`en_IN`, `hi_IN`, `mr_IN`, `gu_IN`), Twitter `summary_large_image`.
- `robots.txt`: production allows `/` and disallows `/admin` and `/api`, plus a sitemap link; every other environment disallows all. Requests on a non-canonical host get `X-Robots-Tag: noindex, nofollow` (set in `src/proxy.ts`). In Step 12 the vercel.app host gets a 308 redirect to the domain.
- `sitemap.xml` lists only `ready` pages from `src/config/nav.ts` × 4 locales with alternates; CMS content is added in Step 6.
- Share images: English is rendered live by `next/og`. **Hindi, Marathi and Gujarati use PNGs pre-rendered in Chromium** (`scripts/og-indic.mjs` → `public/og/*.png`) because next/og's Satori mis-shapes Indic scripts (vowel signs and conjuncts). Re-run the script when the home headline or site name changes.
- **404 pages (Next.js 16.4 behaviour, verified 2026-10-23):** when a page calls `notFound()`, Next sends the correct 404 status but only an empty client-rendered shell as HTML (`<html id="__next_error__">`), even in a stock app. URLs that match **no route** are different: they get complete server HTML. So:
  - Unknown paths (`/en/does-not-exist`, `/fr`, `/xx/yy`) are deliberately **unmatched** (there is no catch-all route) and are rendered by `src/app/global-not-found.tsx` (`experimental.globalNotFound`): full localized page, correct `lang`/title, `noindex`, status 404. The language comes from the URL via next-intl's proxy header, with English as the fallback.
  - Unknown **content slugs** (`/en/causes/nope`, missing translation) still call `notFound()`: status 404 and `noindex` are correct, and browsers render the localized page, but the raw HTML is Next's empty shell. The only way to make that complete is `dynamicParams = false`, which would stop newly published content appearing without a redeploy, so it is not used. Revisit if the admin triggers a deploy on publish.
  - The error page (`error.tsx`) is localised and noindex.
- IndexNow: `pingIndexNow()` runs only in production with a key from `seo_settings`; the key is served at `/indexnow-key.txt`. Verification meta tags come from `seo_settings` when set (DNS TXT stays primary).

### Structured data (as built in Step 5)
- One `<script type="application/ld+json">` per page with an `@graph`, built by `src/lib/seo/jsonld.ts` and rendered by `<JsonLd>`.
- **Home:** NGO (full) + WebSite (with `alternateName`: the Trust's legal, display and alternate names from Settings → Organization, for the site name Google shows) + WebPage. **About** (Step 6): NGO (full) + AboutPage + BreadcrumbList. **Contact:** ContactPage + BreadcrumbList. **Lists:** CollectionPage + BreadcrumbList. **Cause detail:** WebPage + BreadcrumbList + DonateAction. **Event:** Event + WebPage + BreadcrumbList. **News:** NewsArticle + WebPage + BreadcrumbList. **Gallery:** ImageObject per image. **404/styleguide:** none.
- The NGO node is built only from `organization_settings`, and empty fields are omitted, never invented. Until the admin exists (Step 8), the Trust's public facts live in `data/organization.json` and are written with `npm run org:sync` (`-- --check` validates in CI).
- Logo for search engines: `/brand/mswt-logo-512.png` (512×512).

### Content rules (as built in Step 6)
- **Language rule:** an item exists in a language only if it has a translation for that language; in **production that translation must also be reviewed** (`reviewed_at` set). Otherwise the page is a 404 in that language and is left out of lists, hreflang and the sitemap. There is no fallback to English.
- **Where content comes from:** production reads only the database. Local builds and Vercel previews fall back to `data/content/content.json` (real drafts, such as the legal pages) and then `data/sample/content.json` (sample content, shown with a "Sample content" banner) for any part the database doesn't have yet. Sample content is never written to the database.
- **Loading real content before the admin exists:** add it to `data/content/content.json` and run `npm run content:sync`. Translations marked `"reviewed": true` go live; the rest stay preview-only. The script then calls `POST /api/revalidate` (`REVALIDATE_SECRET`) to refresh the site.
- **Rich text** is stored as typed blocks (heading, paragraph, list, callout) with `**bold**` and `[links](…)`. Links are limited to site paths, https, mailto and tel. No HTML is stored.
- **Legal pages** (privacy, terms, refund, 80G) are English drafts marked unreviewed. They stay off production (404, not in navigation) until the Trust's CA approves them.
- **Images** are placeholders until Cloudflare R2 uploads exist (Step 8); gallery `ImageObject` and article images arrive then.
- **Contact form:** zod validation, Cloudflare Turnstile (test keys outside production), and a limit of 5 messages per IP per hour using a salted IP hash (the IP itself is never stored). Messages are saved to `messages`; since Step 9 the admins get a `[MSWT] [Contact]` alert and the sender an acknowledgement in their language.
- **Migrations on Vercel:** the build runs `npm run db:migrate` before `next build`, so previews (Neon branch per preview) and production get new tables automatically. Migrations must stay additive and reviewed.

## 2. Data model (Drizzle / Postgres)

Conventions: `id uuid pk`, `created_at`/`updated_at timestamptz`, money `*_paise bigint`, soft delete `deleted_at` where content is editable. Translatable content uses a `*_translations` table keyed `(parent_id, locale)` with `locale` enum `en|hi|mr|gu`.

### Identity & audit
- **users** — email (unique), name, password_hash (argon2id), role enum `super_admin|accountant|content_editor`, totp_secret (encrypted at rest), totp_enabled_at, recovery_codes_hash[], failed_logins, locked_until, last_login_at, is_active
- **sessions / accounts / verification_tokens** — Auth.js tables
- **audit_log** — actor_user_id, action, entity_type, entity_id, before jsonb, after jsonb, ip, user_agent, created_at (append-only; no update/delete grants)

### Donations
- **donors** — full_name, email, phone, pan (uppercase, validated `[A-Z]{5}[0-9]{4}[A-Z]`), address_line1/2, city, state, pincode, is_indian_citizen_declared bool + declared_at, consent_marketing bool, created_via `online|offline`. Dedupe key: PAN, else email+phone.
- **causes** — slug, status `draft|active|closed`, goal_paise nullable, raised_paise (cached), sort_order, cover_image_id, is_80g_eligible bool (default true)
- **cause_translations** — title, summary, body (rich text JSON), seo_title, seo_description, og_image_id
- **donations** — public_order_id (random, URL-safe), donor_id, cause_id nullable (general fund), amount_paise (donation), fee_cover_paise (0 if unchecked), total_paise (= amount + fee_cover; what is charged), currency `INR` only, mode `online|cash|cheque|neft|upi_offline`, status `created|pending|paid|failed|expired|refunded`, provider `cashfree`, provider_order_id, provider_payment_id, provider_payment_method, instrument_ref (cheque no./UTR for offline), instrument_date, bank_name, is_anonymous (display only — see §4), wants_80g bool, pan_snapshot, name_snapshot, address_snapshot (frozen at payment time), received_at (IST semantics), fy (`2026-27`, derived from received_at), entered_by_user_id (offline), notes, locale
- **payment_events** — provider, event_type, provider_event_id (unique → idempotency), donation_id, signature_valid bool, payload jsonb, received_at, processed_at, error
- **receipts** — donation_id (unique), kind `80g|acknowledgement`, number (unique, e.g. `MSWT/2026-27/000123`), fy, seq, pdf_r2_key, issued_at, emailed_at, email_message_id, voided_at, void_reason, voided_by_user_id
- **receipt_sequences** — (kind, fy) pk, last_seq — incremented with `SELECT … FOR UPDATE` inside the payment-confirmation transaction → gapless, never reused
- **reconciliation_runs** — started_at, finished_at, checked, updated, errors jsonb

### Content (CMS)
- **pages** — key enum (`home|about|transparency|contact|privacy|terms|refund_policy|disclaimer_80g`), + **page_translations** — title, h1, sections jsonb (typed blocks), seo_title, seo_description, og_image_id, reviewed_by, reviewed_at (translation human-review flag)
- **media** — r2_key, filename (descriptive, kebab-case), mime, width, height, bytes, blurhash/lqip, + **media_translations** — alt_text, caption
- **gallery_albums** (+translations), **gallery_items** — album_id, media_id, sort_order
- **events** — slug, starts_at, ends_at, timezone (`Asia/Kolkata`), status `scheduled|cancelled|postponed|rescheduled|moved_online`, attendance `offline|online|mixed`, venue_name, venue_address fields, online_url, cover_image_id, + **event_translations** — title, summary, body, seo fields
- **news_posts** — slug, published_at, author_user_id / author_name, cover_image_id, status `draft|published`, + **news_translations** — headline, excerpt, body, seo fields
- **reports** — fy, kind `annual_report|audited_accounts|other`, pdf_r2_key, published_at, + translations (title)
- **pages.section_order** — Home only: the order of the sections under the headline (`impact, why, story, causes, events, news, testimonials, band`); empty means that default. **pages.hidden_sections** — Home only: sections switched off in the admin (they keep their place in the order; their content is kept). **causes.icon** (card icon, one of `src/lib/content/card-icons.ts`) and **cause_translations.tag** (card label, per language).
- **testimonials** — slug (unique), status (draft/published), story_date (`date`), sort_order, show_on_home, photo_id (library, optional) + **testimonial_translations** — title, body (blocks), summary (optional; else the story's first lines), name, role, reviewed_by, reviewed_at. No `Review` JSON-LD (Google's self-serving reviews policy).
- **menu_items** — location (`header`, `footer_explore`, `footer_trust`, `footer_legal`), sort, kind + target (page key / cause / news / event slug / https URL), hidden, labels per language, `parent_id` (header sub-links, one level), `auto` (`causes|news|events`: a dropdown that lists itself)
- **messages** — name, email, phone, subject, body, locale, ip_hash, turnstile_ok, status `new|read|replied|spam`, assigned_to

### Settings (single-row tables, edited in admin; feed JSON-LD, footer, receipts, emails)
- **organization_settings** — legal_name ("Munira Shoaib Welfare Trust"), display_name ("MS Welfare Trust"), alternate_names jsonb (`{en:["MS Welfare Trust","MSWT"],hi:…,mr:…,gu:…}`), description per locale, founding_date, trust_pan, reg_12a_number + date, reg_80g_number + valid_from + valid_to, registration_authority/trust_reg_no, address (street, locality, city, state, pincode, country `IN`), geo (lat/lng, optional), phones[], email, contact_hours, area_served[], trustees jsonb (name, role, photo_media_id, bio per locale, sort), same_as[] (official social profiles, https only, max 10: the NGO's `sameAs` in JSON-LD and the footer's "Follow us" icons; platform recognised from the address by `src/lib/social.ts`, brand marks from simple-icons via `node scripts/social-icons.mjs`, LinkedIn and other sites get a globe icon), logo_media_id (≥112×112, crawlable), signatory_name, signatory_title, signature_media_id (for receipts)
- **seo_settings** — default title template per locale, default description per locale, default og_image_id, google_site_verification, bing_site_verification, indexnow_key, twitter_handle
- **payment_settings** — min_amount_paise, max_amount_paise, preset_amounts_paise[], fee_cover_percent_bp (basis points), fee_cover_enabled, cash_80g_limit_paise (200000), provider_mode `sandbox|production` (keys stay in env)
- **appearance_settings** — site_font enum `poppins|mukta|hind|noto_sans` (default `poppins`), updated_by, updated_at. Only fonts bundled at build time can be chosen (docs/brand.md §3)
- **email_settings** — from_name, from_address, reply_to, admin_alert_recipients[], provider

## 3. Donation flow (online)

```
Donor ──form──► Server action / POST /api/donations/order
                 1. Turnstile verify, rate limit (IP + email)
                 2. zod: amount integer paise, min ≤ amount ≤ max, cause active,
                    PAN format if wants_80g, Indian-citizen declaration = true
                 3. fee_cover = round(amount × fee_bp / 10000) if checked (server-computed)
                 4. upsert donor, insert donation(status=created), snapshots
                 5. PaymentProvider.createOrder(total, order_id, customer) → status=pending
              ◄── payment_session_id
Donor ──► Cashfree checkout (domestic instruments only; international cards disabled)
Cashfree ──► return_url /{l}/donate/thank-you?order=…   (UI only, shows "confirming…")
Cashfree ──► POST /api/webhooks/cashfree
                 1. verify signature over raw body + timestamp; reject stale timestamps
                 2. insert payment_events (unique provider_event_id) — duplicate → 200 no-op
                 3. PaymentProvider.getOrder(order_id) re-fetch; check amount == total_paise, currency INR
                 4. TX: donation → paid, update cause.raised_paise,
                        lock receipt_sequences(kind, fy) → assign number, insert receipt
                 5. after commit: render PDF → R2, email donor (receipt link + attachment),
                    alert admins; failures retried by job, never roll back the payment
Thank-you page polls GET /api/donations/{id}/status → shows receipt number / download.
```
- **Daily reconciliation** (Vercel Cron, `Asia/Kolkata` 03:00): for donations `pending` > 30 min, call `getOrder`; apply the same confirmation path (idempotent) or mark `expired/failed`. Also retries un-emailed receipts. Summary row in `reconciliation_runs`, then the `[MSWT] [Daily summary]` email to the admin alert recipients (Step 9) when anything happened or went wrong.
- **Failure/refund:** refunds are processed in Cashfree dashboard; webhook `refund` → donation `refunded`, receipt voided (number kept, void reason recorded). **Automatic refunds** (`AUTO_REFUND_STATUS_WEBHOOK`: the donor paid twice, or paid after the order expired) are handled the same way, but only when the refunded payment is the donation's recorded payment: refunding a duplicate payment leaves the donation paid and its receipt valid. Either way the event is kept on the donation's timeline.

#### As built in Step 7 (2026-10-23)
- **Form** (`/{l}/donate`): 3–4 preset amounts + a typed amount, cause (active DB causes translated into the page language; `?cause=` preselects), fee cover (only when enabled), name, email, **mobile (required: Cashfree needs it)**, optional 80G receipt (then PAN + postal address required), "don't show my name publicly", Indian-citizen declaration, Turnstile. All errors are reported at once, server-side.
- **Limits:** minimum above ₹5 (DB check), 3–4 presets, max optional — `payment_settings`, edited through `updatePaymentSettings()` (validated + audited; `npm run settings:sync` until the admin). Provisional values: min ₹100, presets ₹500/1,000/2,500/5,000, no max, fee cover off (B3/B7).
- **Rate limits:** 30 orders per IP and 10 per email per hour (Indian mobile networks share IPs). Unsigned webhooks are rejected with 401 and are **not** stored (so they can't fill the database); every signed delivery is stored in `payment_events`.
- **Transactions:** confirmation, receipt numbering, refunds and offline entry run in `withTx()`; numbers come from an `INSERT … ON CONFLICT DO UPDATE … RETURNING` on `receipt_sequences`, which holds the row lock until commit (gapless; tested with 20 concurrent confirmations).
- **Statuses:** a failed attempt can still be followed by a successful one (`failed → paid`); `paid` is never downgraded. Orders unpaid after 3 days become `expired`.
- **Amount check:** the webhook re-fetches the order; a different amount or currency is recorded as an error and never marks the donation paid.
- **PAN at rest:** AES-256-GCM (`PII_ENCRYPTION_KEY`) + last 4 + HMAC lookup (donor de-duplication). Receipts print the PAN masked (`XXXXXX234F`).
- **Receipt PDF:** English, pdfkit, Poppins + Noto Sans Gujarati TTF (Devanagari/Gujarati names shape correctly). Missing Trust facts print `[to be confirmed: …]`; in production a receipt is not issued until B1/B8 are filled (the number is kept; reconciliation retries).
- **Delivery:** PDF → private R2 bucket → email via Brevo with the PDF attached and a signed link (`/api/receipts/{order}?e=…&t=…`, 30 days) that redirects to a 10-minute R2 URL. Failures never undo the payment; the daily run retries (max 5 email attempts).
- **Switch:** online donations are on locally and on previews (Cashfree sandbox) and off in production until `NEXT_PUBLIC_DONATIONS_LIVE=true` (go-live, Step 12).
- **Tests:** unit (`tests/unit/donations.test.ts`), Postgres (`tests/integration`, CI job "Migrations"), e2e with the fake gateway (`tests/e2e/donate.spec.ts`, CI only for flows that write).

### Offline donations (admin)
Accountant enters donor, amount, mode (cash/cheque/NEFT/UPI), instrument ref & date, received date → same receipt service. Cash > ₹2,000 → acknowledgement only (see §4).

## 4. Receipt rules
1. Issued only for `paid` donations (online via webhook; offline on save by Accountant/Super Admin).
2. **Number format** `MSWT/{FY}/{seq:06}` e.g. `MSWT/2026-27/000123`; FY derived from `received_at` in Asia/Kolkata (Apr–Mar). Gapless per FY, never reused; voided receipts keep their number. Acknowledgements use a separate series `MSWT/ACK/{FY}/{seq:06}` **[OQ-B4]**.
3. **80G receipt** requires: donor name, address, **PAN**, amount in figures and words, mode, date, instrument ref (offline), cause; Trust legal name, address, Trust PAN, 80G registration number + validity, signatory. Text: deduction subject to Section 80G conditions.
4. **Cash > ₹2,000** (Section 80G(5D)): no 80G receipt — acknowledgement only, with a note that the amount is not eligible for deduction. Admin form warns before saving.
5. **No PAN** → acknowledgement receipt (not 80G); donor can add PAN later via admin "regenerate as 80G" (same FY only, old ack voided) **[OQ-B5]**.
6. **Anonymous option = public-display only.** Identity (name, email/phone, and PAN for 80G) is still collected and stored: truly unidentified donations are taxed under Section 115BBC. "Anonymous" hides the name in any public listing/thank-you wall.
7. **Gateway fee cover:** whether the fee-cover amount is included in the 80G amount **[OQ-B3]** — default proposal: included (it is a voluntary payment to the Trust).
8. Website receipts are the Trust's own receipt; the statutory **Form 10BE** certificate is generated from the Income-tax portal after Form 10BD is filed (Phase 2 export). We capture every field 10BD needs now (donor ID type/number, address, mode, amount, section).
9. Foreign contributions are refused: donor must declare Indian citizenship; currency INR; international cards disabled on Cashfree **[OQ-B2]**.
10. Resend receipt (admin) re-sends the same PDF; edits to donor details after issue require void + reissue (audited).

## 5. Admin modules
| Module | Contents |
|---|---|
| Dashboard | Today / FY totals, by cause, pending count, last reconciliation, recent messages |
| Donations | Filters (date range, FY, cause, mode, status, 80G/ack, amount range, donor search), detail with event timeline, offline entry, resend receipt, void/reissue, CSV + XLSX export |
| Donors | Search, profile with donation history, merge duplicates, PAN masked except for Accountant/Super Admin |
| Causes | CRUD, 4-language translations, goal, status, sort |
| CMS | Pages (typed blocks per locale), gallery, events, news, menus, media library (alt text per locale required), SEO fields per item, translation review flag, preview, publish → revalidate + IndexNow |
| Messages | Inbox from contact form, status, assign, reply via mailto |
| Reports | FY donation register, cause-wise summary, 80G receipt register, acknowledgement register, mode-wise — CSV/XLSX/PDF |
| Settings | Organization, SEO, payments, email, **appearance** (site font from the curated list, with a 4-script live preview; see §2) |
| Users & roles | Invite, role, deactivate, force 2FA reset (Super Admin only) |
| Audit log | Filter by actor / entity / date; read-only |

### Role permissions
| Capability | Super Admin | Accountant | Content Editor |
|---|:-:|:-:|:-:|
| Dashboard (financial totals) | ✓ | ✓ | — (content stats only) |
| View donations / donors (masked PAN; full PAN after an email code) | ✓ | ✓ | — |
| Offline donation entry | ✓ | ✓ | — |
| Resend / void / reissue receipt | ✓ | ✓ | — |
| Export donations / reports | ✓ | ✓ | — |
| Causes CRUD | ✓ | read | ✓ |
| CMS (pages, gallery, events, news, menus, media) | ✓ | — | ✓ |
| Messages | ✓ | read | ✓ |
| Organization & SEO settings | ✓ | — | SEO only |
| Payment & email settings | ✓ | — | — |
| Appearance (site font) | ✓ | — | — |
| Users & roles | ✓ | — | — |
| Audit log | ✓ | own actions | own actions |

All roles: TOTP 2FA mandatory, session timeout 2 hours idle (owner decision 2026-10-29; an admin form with unsaved changes renews the session every 5 minutes while the person is typing or clicking in it), login rate-limited and locked after 5 failures.

### Sign-in and accounts (as built in Step 8a, 2026-10-23)
- **Flow:** email + password → a signed 5-minute challenge cookie (no session) → 6-digit TOTP (±1 step, never the same step twice) or a one-time recovery code → Auth.js JWT session (HttpOnly, SameSite=Lax, `__Secure-` on https), 2 hours idle. First sign-in without 2FA goes to setup (QR + key, confirm a code, 10 recovery codes shown once). No admin page works without 2FA.
- **Lockout:** 5 wrong passwords or codes lock the account for 15 minutes; an in-memory per-IP limit (30 per 15 min per instance) slows guessing. Unknown emails and wrong passwords get the same message and take the same time.
- **Sessions end at once** when a user is deactivated, their role changes, their password is reset or their 2FA is reset (`users.session_version`, checked on every request).
- **Accounts:** the first Super Admin is created with `npm run admin:create` (password typed in the terminal, hidden). Super Admins invite users and create password-reset links (one-time, 72 h, only a SHA-256 stored) and send them themselves until email works. Nobody can change their own role or deactivate themselves, and the last active Super Admin can't be removed. Passwords: 12+ characters, not common, not containing the name/email (NIST 800-63B; no composition rules); argon2id.
- **Every page and Server Action** calls `requireCapability()` (`src/lib/admin/guard.ts`) with the matrix in `src/lib/admin/permissions.ts`; a page outside the role answers 403. Every change is written through a service with an audit entry; passwords, hashes, TOTP secrets and recovery codes never go into the audit log.
- **Settings** pages write `organization_settings`, `seo_settings`, `payment_settings`, `email_settings` and `appearance_settings` (site font on the public site) and refresh the cached values at once.

### Donations, donors and reports (as built in Step 8b, 2026-10-23)
- **Dashboard** (`/admin`): today and FY totals, by cause and by mode, pending count, last reconciliation run, newest messages. Content Editors see content counts only.
- **Donations:** filters (FY, IST date range, cause, mode, status, 80G/acknowledgement, amount range, search over name, email, phone, order ID and receipt number), 50 per page with the sum of the filtered rows; CSV (UTF-8 with BOM, formula cells prefixed with `'`) and Excel downloads of the filtered rows. Detail page: donor snapshot, payment, receipts (voided ones keep their number), timeline from gateway events and the audit log.
- **Receipt corrections:** *Resend* emails the same PDF. *Void* needs a reason and keeps the number. *Reissue* voids the live receipt and issues a new number in the **same FY only**; it is how the name, address or PAN on a receipt changes, and how "add PAN later → 80G" works (cash above ₹2,000 stays an acknowledgement). The database allows one live receipt per donation (partial unique index on `receipts(donation_id) WHERE voided_at IS NULL`); `receipts.replaces_receipt_id` links a reissue to what it replaced.
- **Offline entry** (`/admin/donations/new`): warns live and asks again before saving cash above ₹2,000.
- **Donors:** search with totals; profile with history; contact edits (audited); **merge** (Super Admin) moves donations, marks the source `merged_into_id`, and refuses two different PANs.
- **Full PAN by email code:** PAN is masked everywhere. "Email me a code" sends a 6-digit code to the admin's own email (stored as an HMAC, 10 minutes, 5 tries, 5 codes an hour). The right code opens a 15-minute window (`users.pan_access_until`) in which donation and donor pages and exports show full PANs. Audited as `pan.otp_sent`, `pan.unlocked`, `pan.viewed`, `pan.exported`. Without working email in production, full PAN stays hidden.
- **Reports** (`/admin/reports`): FY donation register, cause-wise summary, 80G receipt register, acknowledgement register and mode-wise summary, as CSV or Excel (PDF later). Amounts in rupees with 2 decimals, dates in IST. Every download is audited and sent with `Cache-Control: no-store`.

### Content (as built in Step 8c-1, 2026-10-23)
- **Sidebar → Content:** Pages (one sub-entry per fixed page), Causes, Media, Messages (with a count of new messages). Content Editors and Super Admins edit; Accountants read causes and messages.
- **Pages** (`/admin/content/pages/[key]?lang=`): one tab per language showing Not written / Draft / Reviewed. Each language has page title, heading, introduction, text, SEO title/description and **"Reviewed by a person"**, which publishes it in production. "Remove this language" deletes it (no English fallback). Legal pages start from the drafts in `data/content` until saved. Home has its own fields (line above the headline, headline, introduction, three points, up to four **impact numbers**), stored in `page_translations.extras`; Home's text is **Our story** (shown with a "Read our story" link to About, hidden while empty); languages without a saved home row show the built-in text from `src/messages`. Contact and Transparency take optional text above the form or list.
- **Text format** (`src/lib/content/markup.ts`): one block per paragraph; `## ` / `### ` headings, `- ` / `1. ` lists, `> ` note, `>! ` warning, `**bold**`, `[label](https://… | /path | mailto: | tel:)`, and `![caption](media:ID)` photos from the library (inserted with the toolbar). Stored as typed blocks (never HTML); errors are reported by line, on screen and on save.
- **Visual editor (2026-10-28):** every content field (pages, causes, events, news, legal) opens in a **Visual** editor (`src/components/admin/RichEditor.tsx`, Tiptap 3) with a toolbar for paragraph, heading, subheading, bold (Ctrl+B), link (Ctrl+K), lists, note, warning, insert image/slider (library photos as cards with a caption), undo/redo. It offers exactly what blocks can store; pasting from Word or Google Docs keeps headings (h1 → heading, h4–h6 → subheading), bold, lists and links and drops the rest (pasted images too: photos come from the library). A **Text** view shows the text format with its preview; switching is lossless. Either way the form posts the text format, so saving and validation are unchanged (`src/lib/content/rich.ts` maps blocks ↔ editor document).
- **Causes:** web address (slug), status (draft / active / closed), goal in ₹ (stored in paise), order, cover photo, 80G eligibility; raised amount comes from donations. Text per language (title, summary, story, SEO, reviewed). Only a draft cause with no donations can be deleted.
- **Media:** JPEG/PNG/WebP. The browser shrinks photos to 2560 px before upload (Vercel's 4.5 MB limit); the server checks the real format, applies the camera rotation, **removes all metadata (EXIF/GPS)** and stores WebP copies at 640/1280/1920 px (never upscaled) plus a blur placeholder, in a **public R2 bucket** (`R2_MEDIA_BUCKET`, `R2_MEDIA_PUBLIC_URL`; `.data/media` locally). Alt text is required in English and per language where the photo appears: a translation using a photo (cover or in the text) **can't be marked reviewed** without alt text in that language. A photo can also be **pasted or dropped** where it is needed: into the text editor (Visual or Text view, placed at the cursor), onto a photo field's "Upload new" button (a cover is replaced, an album or slider gets it added), or onto the Media upload form. A pasted photo first asks for its English alt text, then goes through the same upload service (audited). Text pasted from Word or a web page stays text, even when the clipboard also holds a picture of it. A used photo can't be deleted. Public pages use `srcset`, fixed width/height, lazy loading, and `fetchpriority="high"` for the cause cover.
- **Messages:** inbox with status (New / Read / Replied / Spam), assignee (Content Editors and Super Admins), search; opening a new message marks it read; "Reply by email" opens the admin's mail app with the message quoted. Messages are kept until a Content Editor or Super Admin deletes one (owner decision B16, 2026-10-23); the delete is audited without the message text.
- Every save is audited (`content.page.*`, `cause.*`, `media.*`, `message.*`), refreshes public pages at once (`updateTag("content")`), and in production pings IndexNow for reviewed pages.

### Events, news, gallery, documents, menus and photos (as built in Step 8c-2, 2026-10-23)
- **Photos everywhere:** the text format has a **slider** block (`!slider[Caption](media:ID,ID,…)`, 2–20 photos, inserted with "Insert slider"). Causes, events and news have a cover photo and an optional photo slider; every fixed page (Home included) has optional **header photos** (one photo, or a slider) in Content → Pages; albums have a cover and ordered photos; trustees have photos (Settings → Organization). Photo lists use ↑ ↓ buttons to reorder.
- **Slider** (`src/components/content/PhotoSlider.tsx`): native scroll-snap (swipe), ‹ › buttons, dots ("Photo 2 of 5"), no autoplay, and a full-screen viewer (`<dialog>`, arrow keys, Esc). Gallery albums show a grid that opens the same viewer. Only a page's header slider loads its first photo eagerly.
- **Home** (`src/app/[locale]/page.tsx`): the header photos are a full-width banner (`PageHero variant="full"`: edge to edge, 16:9 on phones, 5:2 from large screens up to 560px high, dots on the photo). Below it, the headline row uses the full container width, with the **quick donate box** (`src/components/donate/QuickDonate.tsx`) beside it on large screens and under it on phones. The box is a plain GET form to `/{l}/donate?preset=…&custom=…&cause=…` (works without JavaScript; the donate form fills itself in and the server checks everything; canonical stays `/{l}/donate`). It shows only when Settings → Payments → **Show the quick donate box on Home** (`payment_settings.home_donate_box`, default on, audited) is on **and** online donations are live.
- **Header:** sticky (`SiteHeader`); `HeaderShadow` swaps the bottom border for a shadow once the page scrolls; `html` has `scroll-padding-top` so anchors stay clear of it. A header link with sub-links (Admin → Menus, below) gets a dropdown (`src/components/ui/NavDropdown.tsx`): the link still goes to its page, and a chevron button beside it (`aria-expanded`, named "{label}: more links") opens the list. Large screens: a panel that also opens on hover. Phones (Menu panel): an indented list, **collapsed until the chevron is tapped**. Esc, outside click or tabbing away closes it. All links are plain `<a href>` in the server HTML (closed lists are `display:none`), so crawlers reach every page.
- **Review rule:** a translation can't be marked reviewed while a photo it shows (cover, slider, album, text) lacks alt text in that language. A photo used anywhere can't be deleted.
- **Events** (`/admin/content/events`): web address, draft/published, event status, in person/online/mixed, start/end typed in IST, venue or online link, cover, slider; text per language (title, summary, details, SEO, reviewed). Event structured data includes the cover image.
- **News** (`/admin/content/news`): web address, draft/published, publish date (IST; publishing without one publishes now), author, cover, slider; headline, excerpt, story per language. NewsArticle structured data uses the cover.
- **Gallery** (`/admin/content/gallery`): album settings, cover (else the first photo), ordered photos (captions come from the media library per language), title and description per language.
- **Documents** (`/admin/content/documents`): type, FY, draft/published, title per language, and a PDF of up to 25 MB. With R2 the browser uploads straight to the public media bucket through a 5-minute signed URL (needs a CORS rule, M8c-6); the server then checks it starts with `%PDF-` and its size, attaches it under `documents/{id}/{name}-{random}.pdf` and deletes the previous file. Transparency lists "Download PDF (n MB)". **Registration certificates** are document types too (12A, 80G, trust registration, PAN, other: `cert_*`) with **no financial year** (a database check keeps years and types apart). They are listed in their own admin table and in a "Registration certificates" section at the top of Transparency (`#certificates`); About links the 12A and 80G numbers to their certificate PDF once published. The upload reminds the editor to blank out home addresses and signatures first.
- **Menus** (`/admin/content/menus`, table `menu_items`): header and the three footer lists. Links to pages, causes, news, events or https sites, ordered, hidden, renamed per language. While a menu has no saved links the built-in menu (`src/config/nav.ts`) is used; pages that aren't live and items not published in that language never show; a web link shows only in languages it has a label for.
- **Header dropdowns (2026-10-28):** each header link has **Sub-links**: None; **Pick by hand** (up to 12 links, same controls: page, cause, news, event or web link, order, hide, rename per language); or **Automatic**: all causes, latest 5 news posts, or next 5 upcoming events, each followed by "View all …". One level deep, header only (footer lists stay flat). Sub-links follow the same visibility rules; a link whose sub-links are all left out in a language shows as a plain link. The built-in header (and the seeded/migrated one) has Causes on "Automatic: all causes". Saves are audited (`menu.update` lists sub-links).

### Every menu page from the admin (2026-10-27)
- **Content → Pages** also covers the list pages **Causes, Events, News, Gallery and Testimonials** (heading, introduction, header photos, optional text above the list), and Home's section headings (why give, impact, our story, causes, events, news, testimonials, donate band).
- **Content → Pages → Home → Sections:** drag-and-drop list of the Home sections (↑ ↓ buttons and the keyboard work too), each with a **Show** switch: a section switched off leaves the Home page but keeps its content and its place. One order for every language; sections with nothing to show are skipped; the header photos, headline and donate box always come first and can't be hidden.
- **Photos in text (visual editor):** each photo has a **Position** (Full width, Centre, Left with the text on the right, Right with the text on the left) and, unless full width, a **Size** (Small ⅓, Medium ½, Large ⅔); sliders have a Size (Full width, Large, Medium). Left/right photos float from tablet width (`md`) and stack full width on phones; headings start below them. Stored on the block (`size`, `align`); text format `![caption](media:ID){small left}`.
- **Header photo size** (Content → Pages, each page) and **Cover photo size** (causes, news, events: the cover at the top of the item's own page): Short banner (3:1), Standard (16:9) or Tall (4:3). Home's edge-to-edge banner: short 2:1→4:1, standard as before, tall 4:3→2:1. Cards on list pages keep one shape. Columns `pages.hero_size`, `causes/events/news_posts.cover_size` (checked: short, standard, tall).
- **Sorting in the admin:** every ordered list (Home sections, menus and sub-links, header/gallery photos) has a ⠿ grip: drag it with a mouse, finger or pen; or focus it, press Space, move with ↑ ↓, Space to drop (Esc cancels). The ↑ ↓ buttons stay as the single-click alternative (WCAG 2.5.7). Impact numbers count up from 0 once in view (not with reduced motion; the HTML and screen readers have the final value).
- **Causes:** settings have a **Card icon** (or none); each language has an optional **Card label** (≤24 characters) shown on the card photo.
- **Content → Testimonials** (`/admin/content/testimonials`, `cms.write`): unlimited stories, each with a web address, a date, order, publish status, "Show on the home page" and an optional photo (decorative, alt ""); per language a heading, the story (visual editor), an optional short summary, name and role, with "Reviewed by a person". Each story has its own page; Home shows cards for the first 6 marked for Home, About the first 6 of all, both with "All testimonials". Order: the Order number, then the newest date. No English fallback; all changes audited (`testimonial.*`).
- **Built-in texts and menus are copied into the database** by `npm run db:migrate` (every build): each page language and menu that has no row gets today's built-in text (reviewed) or link list. Existing rows are never touched, so admin edits survive every deploy. Legal drafts keep their unreviewed state.
- **Stage and production read the database only** (`getSiteContent()` when `VERCEL_ENV` is set). Local and CI builds still fall back to `data/content` and `data/sample` so tests run on any database.
- **Content → Sample content** (Super Admin): **Load sample content** imports the causes, events, news, album and documents from `data/sample` with 20 sample photos (Lorem Picsum, fixed seeds, alt text "Sample photo n" in 4 languages). Everything is created **unreviewed** and flagged `is_sample`, so production doesn't show it until a person reviews it; page header photos are only added outside production. Running it again skips existing items. **Remove sample content** deletes unreviewed sample items (and causes without donations) and the sample photos no longer used.

### PWA and emails (as built in Step 9, 2026-10-27)
- **Installable app:** `/manifest.webmanifest` (`start_url /en`, `scope /`, standalone, theme colour `primary.700`), icons 192/512 + maskable 512 and two screenshots from `node scripts/pwa-icons.mjs [--screenshots <url>]` (`public/icons/`), Apple touch icon, title and status bar meta.
- **Service worker** (Serwist, `src/app/sw.ts`, served at `/serwist/sw.js` with `Service-Worker-Allowed: /`; registered by a small client component on public pages only, never in the admin):
  - **Never cached** (`src/lib/pwa/routes.ts`): `/{l}/donate` and the thank-you page, `/admin/**`, `/api/**` (receipts, webhooks, cron), POST requests and server actions, Next.js RSC data, and every other site (Cashfree, Turnstile).
  - **Public pages:** stale-while-revalidate (50 pages, 7 days); pages opened by client-side navigation are saved too.
  - **Build files** (`/_next/static`), **photos and fonts:** cache-first (30 days).
  - **Precached at install:** CSS, Poppins fonts, app icons, the mark, and `/{l}/offline` for all 4 languages.
  - **Offline:** a page that isn't saved shows `/{l}/offline` (noindex) in the page's language, with links to the saved main pages.
  - **Updates:** a new worker waits until every tab of the site is closed (no `skipWaiting`, no `clientsClaim`), so a donation in progress is never interrupted.
- **Email layout** (`src/lib/email/templates/layout.ts`): logo header, green rule, footer; inline token colours; every email has a text version. Visitor text is escaped and shown as plain text (links are not made clickable).
- **Admin alerts** (English) go to Settings → Email → admin alert recipients. Subjects always start with a fixed prefix for mailbox filters:

| Email | Subject | When |
|---|---|---|
| New donation | `[MSWT] [Donation] ₹1,000 – School support – MSWT/2026-27/000012` | Once per donation, right after its receipt number is issued (webhook, daily check or offline entry); webhook retries don't repeat it |
| Contact message | `[MSWT] [Contact] Volunteering – from Asha` | After a message is saved; replying answers the visitor |
| Payment failed | `[MSWT] [Payment failed] ₹1,000 – Card declined by the bank – MSWT-…` | Every failed attempt (Cashfree's or the bank's reason; "Donor closed the payment page" when the donor left). Once per Cashfree event; none if the donation is already paid |
| Payment problem | `[MSWT] [Payment problem] Amount mismatch – MSWT-…` / `Unknown order – …` / `Receipt not emailed – MSWT/…` | Webhook amount/currency mismatch or unknown order; first receipt delivery failure |
| Daily summary | `[MSWT] [Daily summary] 26 October 2026 – 4 donations, ₹7,500` | After the 03:00 IST check: yesterday's donations by mode, refunds, failed payments (up to 10 with reasons), abandoned donations (expired, never paid), orders updated by the check, receipts not emailed, new messages, problems. Not sent when there is nothing to report. The time is fixed in `vercel.json` (one run a day on the Hobby plan; never on previews): Settings → Email → **Send yesterday's summary now** (Super Admin, audited `email.summary_sent`) sends it at once, even when empty ("Nothing to report") |

- **Donor-facing emails** start with the Trust's name in the reader's language (`MS Welfare Trust: …`): the receipt, and the contact acknowledgement (copy of the message, the Trust's email/phones/website; replies go to Settings → Email → Replies go to, else the Trust's email). The admin PAN code email is `MS Welfare Trust: your code to view donor PANs: 123456`.
- **Alerts never block or undo anything:** they are sent after the commit; a failed alert is logged and recorded in the audit log as `email.alert_failed`. Alerts show the masked PAN at most and no postal address.

