# Standards — Definition of Done

Every PR must satisfy every item that applies to what it touches. Slash commands (`/a11y-audit`, `/seo-check`, `/jsonld-check`, `/pwa-check`, `/brand-check`, `/done-check`) report per **ID** as PASS / FAIL / N/A / MANUAL. Items marked *(manual)* need a human or a browser check and must be recorded in the PR description.

## General (every PR)
- [ ] **GEN-01** Work happened on the step's own branch; one PR per step
- [ ] **GEN-02** `lint`, `typecheck` (strict), unit tests, e2e tests and `build` pass locally and in CI
- [ ] **GEN-03** No secrets, tokens or `.env*` (other than `.env.example`) committed
- [ ] **GEN-04** New unknowns recorded in `docs/open-questions.md`; nothing invented
- [ ] **GEN-05** PR description lists checks run, their results, and any MANUAL items verified

## A11y — WCAG 2.2 AA
- [ ] **A11Y-01** Semantic HTML; landmarks `header`, `nav` (labelled), `main`, `footer`; exactly one `<h1>` per page; headings don't skip levels
- [ ] **A11Y-02** Skip link to `#main` is the first focusable element and visible on focus
- [ ] **A11Y-03** `<html lang>` matches the locale (`en`, `hi`, `mr`, `gu`); inline foreign-language text has its own `lang`
- [ ] **A11Y-04** Every input has a programmatic label; required fields indicated in text, not colour alone
- [ ] **A11Y-05** Errors: identified in text, linked via `aria-describedby`, `aria-invalid` set, error summary focused on submit failure (3.3.1, 3.3.3)
- [ ] **A11Y-06** Full keyboard operation, logical focus order, no keyboard traps (2.1.1, 2.1.2, 2.4.3)
- [ ] **A11Y-07** Visible focus indicator ≥ 3:1 against adjacent colours; focused element never fully hidden by sticky header/cookie bar (2.4.7, 2.4.11)
- [ ] **A11Y-08** Text contrast ≥ 4.5:1 (≥ 3:1 for large text ≥ 24px / 18.66px bold) — only pairs approved in `docs/brand.md` contrast table
- [ ] **A11Y-09** Non-text contrast ≥ 3:1 for UI components, borders of inputs, icons conveying meaning, focus rings (1.4.11)
- [ ] **A11Y-10** Pointer targets ≥ 24×24 CSS px or sufficient spacing (2.5.8)
- [ ] **A11Y-11** Meaningful images have descriptive alt in the page's language; decorative images `alt=""`
- [ ] **A11Y-12** `prefers-reduced-motion` respected: no autoplaying carousels/parallax; animations reduced or removed
- [ ] **A11Y-13** Content reflows at 320 CSS px without horizontal scroll; text resizes to 200%; text-spacing overrides don't break layout (1.4.10, 1.4.4, 1.4.12)
- [ ] **A11Y-14** Links have descriptive text (no bare "click here"/"read more" without context); link purpose clear
- [ ] **A11Y-15** Status messages (donation confirming, form sent) announced via `role="status"`/`aria-live` (4.1.3)
- [ ] **A11Y-16** Accessible authentication: admin login allows paste and password managers; TOTP field allows paste; no cognitive test (3.3.8)
- [ ] **A11Y-17** Consistent help: contact link/details in the same place on every page (3.2.6); no redundant re-entry in multi-step donate flow (3.3.7)
- [ ] **A11Y-18** Dragging not required; any drag in admin (reorder) has a button alternative (2.5.7)
- [ ] **A11Y-19** Logo in header/footer has an accessible name ("MS Welfare Trust — home")
- [ ] **A11Y-20** Playwright + axe: zero serious/critical violations on every public route × 4 locales and admin key screens
- [ ] **A11Y-21** *(manual)* Screen-reader smoke test (VoiceOver Safari + NVDA/Chrome) of home, donate, contact

## SEO
- [ ] **SEO-01** Every page exports `generateMetadata` with a unique, localised `title` and `description`
- [ ] **SEO-02** Self-referencing absolute `canonical` per page and locale
- [ ] **SEO-03** `alternates.languages` hreflang for `en`, `hi`, `mr`, `gu` + `x-default` → `/en/...`, reciprocal on every locale
- [ ] **SEO-04** `/` redirects (308) to `/en`; no duplicate unprefixed public URLs
- [ ] **SEO-05** `app/sitemap.ts` lists every indexable URL × locale with `alternates.languages` and `lastModified`
- [ ] **SEO-06** `app/robots.ts` allows public, `Disallow: /admin`, `Disallow: /api`, points to sitemap
- [ ] **SEO-07** `/admin/**` and `/api/**` send `X-Robots-Tag: noindex, nofollow` and `robots` meta noindex; thank-you, offline, 404 and error pages are noindex; **any host other than the canonical domain** (e.g. `*.vercel.app`, previews) gets `X-Robots-Tag: noindex, nofollow`, and `robots.txt` disallows everything outside production
- [ ] **SEO-08** Open Graph + Twitter card (title, description, image 1200×630, locale, alternate locales) per page
- [ ] **SEO-09** Public pages are server-rendered or statically generated (content visible without JS)
- [ ] **SEO-10** Clear, consistent top navigation and footer links; descriptive internal anchor text
- [ ] **SEO-11** Each cause/event/news item has a unique keyword-relevant title and H1 per language
- [ ] **SEO-12** Images: descriptive alt text and descriptive kebab-case file names; width/height set
- [ ] **SEO-13** Translations human-reviewed (`reviewed_at` set) before publishing a locale *(manual)*
- [ ] **SEO-14** No broken internal links; unknown URLs return HTTP 404 with a complete server-rendered, localized, `noindex` page (checked on the raw HTML, not the browser DOM); removed content returns 404/410 or 301
- [ ] **SEO-15** Site verification meta/DNS values come from SEO settings, not hard-coded
- [ ] **SEO-16** Publishing/updating content triggers revalidation and an IndexNow ping

## JSON-LD
- [ ] **LD-01** Rendered only through the typed `<JsonLd>` component (`schema-dts` types), safely serialised (`<` escaped)
- [ ] **LD-02** One site-wide `NGO` entity with stable `@id` (`https://mswelfaretrust.org/#organization`): the full node is output on the home and About pages; every other page's graph references it by `@id` only
- [ ] **LD-03** NGO has: `name`, `legalName` "Munira Shoaib Welfare Trust", `alternateName` (MS Welfare Trust, MSWT, hi/mr/gu names), `url`, `logo` (crawlable, ≥112×112), `description`, `foundingDate`, `address` (PostalAddress), `contactPoint` (telephone, email, contactType "customer support", availableLanguage en/hi/mr/gu), `areaServed`, `founder`/`member` (trustees as `Person`), `sameAs`, `taxID` (Trust PAN)
- [ ] **LD-04** All Organization values come from `organization_settings` — none hard-coded
- [ ] **LD-05** `WebSite` (with `@id`, `publisher` → NGO, `inLanguage`) on home only
- [ ] **LD-06** Page types: `WebPage` default, `AboutPage` on about, `ContactPage` on contact, `CollectionPage` on lists; each with `inLanguage`, `isPartOf` → WebSite, `about`/`publisher` → NGO
- [ ] **LD-07** `BreadcrumbList` on every inner page, matching visible breadcrumbs, localised names
- [ ] **LD-08** `Event`: `name`, `startDate` (+`endDate`) with +05:30 offset, `eventStatus`, `eventAttendanceMode`, `location` (Place+PostalAddress or VirtualLocation), `image`, `organizer` → NGO
- [ ] **LD-09** `NewsArticle`: `headline`, `image`, `datePublished`, `dateModified`, `author` (Person or NGO), `publisher` → NGO
- [ ] **LD-10** Gallery items as `ImageObject` (`contentUrl`, `caption`, `creditText`/`creator` where known)
- [ ] **LD-11** `DonateAction` on donate page (`recipient` → NGO, `target` EntryPoint)
- [ ] **LD-12** **No** `WebSite` `SearchAction`; **no** reliance on `FAQPage` rich results
- [ ] **LD-13** Valid in validator.schema.org and Google Rich Results Test for each page type *(manual, record URLs in PR)*
- [ ] **LD-14** Structured data matches visible page content (no hidden claims)

## Performance
- [ ] **PERF-01** Lighthouse CI (mobile) on key routes: Performance ≥ 90, LCP < 2.5 s, CLS < 0.1, TBT < 200 ms (INP proxy)
  - **Documented exception (owner decision, 2026-10-28): the Home page of each language has a lab LCP budget 0.2 s above its language's (en/gu 2.7 s, hi/mr 3.2 s).** The quick donate box (Settings → Payments, on by default) adds about 2.5 KB of compressed HTML to Home; under Lighthouse's simulated slow-4G that costs one extra network round trip (~0.15 s FCP/LCP), measured against `stage` on the same database (/en 2.32 → 2.54 s; with the box switched off it is back to 2.32 s). Fonts are not the cause (tested with and without the ₹ glyphs and with font preloads). Other pages keep their budgets; the field target (PERF-02) still applies.
  - **Documented exception (owner decision, 2026-10-22; budget raised 2026-10-23): `/hi` and `/mr` pages have a lab LCP budget of 3.0 s instead of 2.5 s.** Hindi and Marathi use Poppins Devanagari, about 40 KB per weight, which is the lightest Devanagari web font available (Noto Sans 50 KB, Hind 72 KB, Mukta 100 KB). Under Lighthouse's simulated slow-4G it adds about 0.4 s. Five loading strategies were tried; the best gives ~2.6–2.8 s. The budget was first 2.8 s, but those pages measure ~2.79 s locally, so CI failed intermittently depending on the runner's CPU speed (Lighthouse's simulated LCP scales with it); 3.0 s leaves a ~7% margin. The real, unthrottled LCP is only ~0.1–0.2 s. The alternative, the device's own Devanagari font, was declined to keep the brand font. `/en` and `/gu` keep 2.5 s. The field target (PERF-02, p75 LCP < 2.5 s) still applies to every locale and is checked after launch.
- [ ] **PERF-02** Field target: LCP < 2.5 s, INP < 200 ms, CLS < 0.1 at p75 (monitored post-launch via Search Console / Vercel Speed Insights)
- [ ] **PERF-03** All images via `next/image` with sizes, AVIF/WebP, LCP image `priority`, no layout shift
- [ ] **PERF-04** Fonts via `next/font` (self-hosted, subset, `display: swap`, size-adjusted fallback)
- [ ] **PERF-05** Minimal client JS: server components by default; JS transferred per public route ≤ 150 KiB compressed (Lighthouse CI budget). The Next 16 + React 19 runtime alone is ~120 KiB, so page code gets ~30 KiB; any increase needs a reason in the PR
- [ ] **PERF-06** Third-party scripts (Cashfree SDK, Turnstile) loaded only on pages that need them, `lazyOnload`/on interaction
- [ ] **PERF-07** Static/ISR for content pages; cache headers correct; no N+1 queries on list pages

## Security
- [ ] **SEC-01** Strict CSP (nonce-based scripts; allow-list only Cashfree, Turnstile, R2/CDN, analytics if any); `frame-ancestors 'none'`
- [ ] **SEC-02** HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, COOP
- [ ] **SEC-03** Rate limiting on donate order creation, contact form, login, 2FA, webhook (per IP)
- [ ] **SEC-04** Turnstile verified server-side on donate and contact forms
- [ ] **SEC-05** No secrets in repo; env validated at boot (zod); `.env.example` names only
- [ ] **SEC-06** Money stored as integer paise; amounts never trusted from client; fee computed server-side
- [ ] **SEC-07** All timestamps `timestamptz`; display/grouping in Asia/Kolkata; FY Apr–Mar utility unit-tested at boundaries (31 Mar 23:59 IST / 1 Apr 00:00 IST)
- [ ] **SEC-08** Webhook: signature verified on raw body, timestamp freshness, idempotent, amount re-verified via provider API
- [ ] **SEC-09** Admin: Auth.js credentials + mandatory TOTP, argon2id, lockout, secure/HttpOnly/SameSite cookies, CSRF protection, role checks on server for every action
- [ ] **SEC-10** Audit log entry for every admin write; append-only
- [ ] **SEC-11** PII minimised: PAN masked in UI/exports for non-financial roles; PAN, TOTP secrets encrypted at rest; receipt links signed + expiring
- [ ] **SEC-12** Foreign contributions blocked (Indian-citizen declaration, INR only, international cards disabled)
- [ ] **SEC-13** Dependency audit clean of high/critical (`npm audit`/Dependabot)
- [ ] **SEC-14** Privacy policy and consent text meet India's DPDP Act 2023 (purpose, retention, grievance contact) *(manual review)*

## i18n
- [ ] **I18N-01** next-intl with locales `en`, `hi`, `mr`, `gu`; default `en`; every public route locale-prefixed
- [ ] **I18N-02** All UI strings in `src/messages/*.json`; no hard-coded user-facing text; missing-key check in CI
- [ ] **I18N-03** CMS content appears in a language only when that translation exists and, in production, has been reviewed (`reviewed_at`); otherwise it is a 404 in that language. No silent English fallback
- [ ] **I18N-04** Numbers/currency formatted `en-IN` style (₹1,00,000) per locale; dates in Asia/Kolkata via `Intl`
- [ ] **I18N-05** Language switcher keeps the current page, uses native language names with `lang`/`hreflang` attributes
- [ ] **I18N-06** Indic scripts render with correct fonts and line-height (no tofu, no clipped matras)
- [ ] **I18N-07** Admin is English-only but edits all 4 locales side by side

## Brand
- [ ] **BRAND-01** Components use only tokens from `tokens/design-tokens.json` via Tailwind theme; no hex/rgb/hsl, font-family or px radius/shadow literals in `src/` outside the generated theme
- [ ] **BRAND-02** Only text/background pairs listed as PASS in the `docs/brand.md` contrast table are used
- [ ] **BRAND-03** Logo used only per usage rules (clear space, minimum size, approved variants, no distortion/recolour)
- [ ] **BRAND-04** Logo present in header and footer with accessible name; favicon set, PWA icons, OG template, receipt PDF header, email header, JSON-LD logo all from approved files
- [ ] **BRAND-05** Typography: brand font for Latin, approved Indic fallbacks per script, token line-heights
- [ ] **BRAND-06** Figma variables and Tailwind theme generated from the same token file (no drift)

## PWA
- [ ] **PWA-01** Manifest: `name`, `short_name`, `description`, `lang`, `start_url: "/en"`, `scope: "/"`, `display: "standalone"`, `theme_color` and `background_color` from tokens
- [ ] **PWA-02** Icons 192 and 512 (`any`) + maskable 512 with safe zone; `screenshots` (narrow + wide)
- [ ] **PWA-03** `apple-touch-icon` (180), `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style`, `theme-color` meta
- [ ] **PWA-04** Serwist SW precaches static assets; public pages stale-while-revalidate; offline fallback page `/{l}/offline`
- [ ] **PWA-05** SW **never** caches `/*/donate*`, `/api/**`, `/admin/**`, receipt URLs or any Cashfree/payment response (NetworkOnly)
- [ ] **PWA-06** SW update flow does not break in-progress donation (skipWaiting only on navigation)
- [ ] **PWA-07** *(manual)* Installable in Chrome DevTools → Application; Lighthouse PWA/installability checks pass; iOS add-to-home-screen tested
