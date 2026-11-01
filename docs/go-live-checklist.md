# Go-live checklist

Everything still to do before and after launch, in order. Tick items as they are done.
Detail for each question is in [open-questions.md](open-questions.md); manual tests in [manual-checks.md](manual-checks.md).

**Where we are (31 Oct 2026):** production runs at `mswelfaretrust.vercel.app`, not indexed by Google.
Working and checked in production: photo and PDF storage (R2), email (Brevo), spam check (Turnstile),
the nightly job (03:00 IST, daily summary email). Online donations are **off**.

---

## Phase 1 — Production setup (now)

- [x] R2 storage, Brevo email, Turnstile, `CRON_SECRET` in Vercel (Production)
- [x] Nightly job runs without Cashfree; daily summary arrives
- [ ] Delete the test contact message (Admin → Messages)
- [ ] Gmail filters: label `[MSWT] [Daily summary]`; Star + Never spam for `[MSWT] [Job failed]`, `[MSWT] [Payment problem]`, `[MSWT] [Bank details]`
- [ ] Search Console: add a **Domain** property `mswelfaretrust.org` and verify through Cloudflare (DNS TXT). Can be done now; keep the TXT record
- [x] `DATABASE_URL` "Needs attention" in Vercel: managed by the Neon integration, can't be made Secret. Leave it

**Every morning from now:** a `[MSWT] [Daily summary]` email arrives soon after 03:00 IST. No email at all = the job didn't run; check Vercel → Logs → **Request Logs**, search `reconcile`.

---

## Phase 2 — Information and approvals from the Trust (send the request now; longest wait)

Message to trustees + CA drafted 31 Oct 2026 (questions 1–13).

**CA (blocks receipts and donations)**
- [ ] B13 Receipt wording: 80G statement, "no goods or services" line, acknowledgement notes; PAN shown masked OK?
- [ ] B8 Signatory name and designation; scanned signature/stamp?
- [ ] B12 Receipt series: start at 000001 for FY 2026-27, or continue from offline receipts?
- [ ] B4 Separate series for acknowledgements (`MSWT/ACK/…`) OK?
- [ ] Test 4: one real test receipt then void it, or check on the first real donation?
- [ ] B15 Corrections: void + reissue within the FY; process after 31 March / Form 10BD
- [ ] B5 No PAN → acknowledgement; later conversion to 80G within the FY OK?
- [ ] B6 "Anonymous" = hidden publicly only, identity recorded (s.115BBC) OK?
- [ ] B17 "Email us your details" after a bank/UPI transfer is enough to avoid anonymous-donation tax?
- [ ] B2 No FCRA: NRIs (Indian citizens, NRO/NRE accounts) allowed?
- [ ] B3 Cover the gateway fee: what %, and include it in the 80G amount?

**Trust facts** (enter in Admin → Settings → Organization; receipts print "[to be confirmed]" until filled)
- [ ] B1 Trust PAN, 12A no. + date, 80G no. + validity, registration no.
- [ ] C1 Founding date · C2 registered address · C3 phone/hours
- [ ] C5 Social profiles · C6 Trust name in Hindi/Marathi/Gujarati · C7 mission in 4 languages
- [ ] C4 Trustees (name, role, photo, bio, consent) · C8 causes, annual reports

**Bank details** (B17)
- [ ] Account name, number, IFSC, bank/branch, type, UPI ID (Trust's own), cheque payee, mailbox for donor details
- [ ] Enter in Admin → Settings → Payments, tick "Show on the site", save (alert email arrives)
- [ ] Scan the QR code with a UPI app: payee name is the Trust's (MB-1)

**Legal pages** (drafts written; off until approved)
- [ ] B11 Who reviews Privacy, Terms, Refund, 80G page? · grievance officer name + email (DPDP Act)
- [ ] B10 Refund window and who approves refunds
- [ ] Publish them (mark `ready` in `src/config/nav.ts`; they then join the sitemap and footer)

**Content and people**
- [ ] About, Causes, News, Gallery, Team content and real photos (with consent) in Admin → Content
- [ ] D3 Translators/reviewers for hi, mr, gu; translations reviewed (pages show in a language only once reviewed)
- [ ] D2 Admin users: invite Accountant and Content Editor (Admin → Users); each sets up 2FA
- [ ] Train them with the admin guide PDFs (`npm run guide:pdf`)

---

## Phase 3 — Online donations (after Phase 2 CA answers)

- [ ] B9 Cashfree production account approved (KYC), settlement to the Trust's account
- [ ] Cashfree dashboard: whitelist the domain `mswelfaretrust.org`; international payments **off** (no FCRA)
- [ ] Cashfree webhook → `https://mswelfaretrust.org/api/webhooks/cashfree`
- [ ] Vercel (Production): `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` (Secret), `CASHFREE_ENV=production` (Config)
- [ ] D6 **Vercel Pro plan**: Hobby is for non-commercial use only; a donation site needs Pro
- [ ] `NEXT_PUBLIC_DONATIONS_LIVE=true` (Config), redeploy
- [ ] ₹10 test donation: webhook confirms, receipt emailed, `[MSWT] [Donation]` alert; then refund it in Cashfree and check the receipt is voided
- [ ] Next morning's summary shows the donation and refund

---

## Phase 4 — Domain day (`mswelfaretrust.org`)

Do this a few days **before** announcing the site, so Google starts indexing early.

- [ ] Vercel → Settings → Domains: add `mswelfaretrust.org` and `www.mswelfaretrust.org`; www **redirects (308)** to `mswelfaretrust.org`
- [ ] Cloudflare DNS: add Vercel's records, **DNS only (grey cloud)**, never Proxied (redirect loop)
- [ ] Turnstile (Cloudflare → Turnstile → widget → Hostnames): add `mswelfaretrust.org` and `www.mswelfaretrust.org`
- [ ] `NEXT_PUBLIC_SITE_URL=https://mswelfaretrust.org` (already set), redeploy
- [ ] B14 Brevo: authenticate the domain (SPF/DKIM/DMARC records in Cloudflare); set `EMAIL_FROM_ADDRESS` to e.g. `receipts@mswelfaretrust.org`
- [ ] Cloudflare Email Routing: the Trust's addresses (info@, receipts@ replies) forward to a real mailbox
- [ ] Check: site loads on the domain over HTTPS; Admin → Settings → Email → **Send yesterday's summary now** → logo and "Open in the admin" link work
- [ ] Check: contact form works (Turnstile), receipt download link works
- [ ] Search Console → Sitemaps → submit `https://mswelfaretrust.org/sitemap.xml`
- [ ] Search Console → URL inspection on `/en`: "URL is on Google" or request indexing
- [ ] Optional: Bing Webmaster Tools (import from Search Console)
- [ ] Optional: redirect `mswelfaretrust.vercel.app` pages to the domain (code change, not `/api`)

---

## Launch day

- [ ] All Phase 2–4 boxes ticked; `docs/manual-checks.md` items done or consciously skipped
- [ ] Final run of every page in all 4 languages on a phone
- [ ] Announce (WhatsApp, social profiles)

## After launch

- **Daily:** read the Daily summary; act on any `[Job failed]`, `[Payment problem]`, `[Bank details]` email at once
- **Daily/weekly:** Accountant checks the bank statement against donor emails and records bank/UPI/cheque donations as offline donations
- **Weekly (first month):** Search Console → Pages and Sitemaps for errors ("Page with redirect" for `/` → `/en` is normal)
- **Monthly:** Admin → Audit log glance; review admin users
- **Each 31 March:** new financial year receipt series starts automatically; CA files Form 10BD for the year
- **Before 80G expiry:** renew registration and update the validity in Settings → Organization
