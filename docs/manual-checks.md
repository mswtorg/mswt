# Manual checks pending

Checks that automated tests can't cover or that are waiting on accounts or keys. Tick each one when done and note the date. Steps are listed in order.

## Production setup (owner decision: do last, before go-live)

Production runs the latest release (2026-10-27) and its page texts and menus can already be edited. These Vercel **Production** settings are still missing, so photo and PDF uploads, offline donation receipts, emails, the contact form and the nightly job don't work there yet. Add them in Vercel → Settings → Environment Variables → **Production**, then redeploy production once.

- [ ] **P-1 Production R2 buckets.** In Cloudflare R2 create **`mswt-prod-receipts`** (private) and **`mswt-prod-media`** (public access on; copy its `https://pub-….r2.dev` URL). Don't reuse stage's buckets: stage's database is a copy of production, so receipt numbers would collide and stage deletes would remove production photos. Create an API token with Object Read & Write on both buckets.
- [ ] **P-2 R2 variables.** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (the production token), `R2_RECEIPTS_BUCKET=mswt-prod-receipts`, `R2_MEDIA_BUCKET=mswt-prod-media`, `R2_MEDIA_PUBLIC_URL` (the r2.dev URL, no trailing `/`).
- [ ] **P-3 CORS rule on `mswt-prod-media`** for PDF uploads (same JSON as M8c-6).
- [ ] **P-4 Email (Brevo).** `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` (verified sender), `EMAIL_FROM_NAME=MS Welfare Trust`. Brevo → Security → Authorised IPs must stay off.
- [ ] **P-5 Secrets.** New values, not stage's: `RECEIPT_LINK_SECRET` (`openssl rand -base64 32`) and `CRON_SECRET` (16+ characters).
- [ ] **P-6 Contact form.** Cloudflare Turnstile → add a site for `mswelfaretrust.vercel.app` (and later `mswelfaretrust.org`); add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
- [ ] **P-7 Redeploy production and check:** upload a photo (Content → Media), upload a PDF (Content → Documents), record an offline donation and download its receipt, send the contact form, and run the cron once from Vercel → Cron Jobs.
- [ ] **P-8 Go-live only (later):** Cashfree **production** keys after KYC (`CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV=production`) and the production webhook URL with the 4 events, then `NEXT_PUBLIC_DONATIONS_LIVE=true` (M7-18). Real content reviewed in the admin; legal pages approved (B11).

## Step 7: Donations

### Waiting on accounts (SMS verification)
- [ ] **M7-1 Cashfree sandbox keys.** Sign up in the Cashfree merchant dashboard (Test mode, no KYC). Go to Developers → API Keys → Test and add these to `.env.local`:
  `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV=sandbox`.
  Ask Cashfree to keep **international payments disabled** on the account (no FCRA, SEC-12).
- [ ] **M7-2 Brevo key and sender.** Create an API key (SMTP & API → API keys) and add `BREVO_API_KEY` to `.env.local`. `EMAIL_FROM_ADDRESS` must be a verified sender. Add Brevo's SPF and DKIM records to the domain's DNS (B14). In Brevo → Security → **Authorised IPs**, turn off IP blocking for the API key: Vercel sends from changing IP addresses, and Brevo already rejected a local test send because of this.
- [ ] **M7-3 Vercel environment variables (Preview only for now).** Add every variable from `.env.example` that is set in `.env.local` (R2, Brevo, Cashfree, `PII_ENCRYPTION_KEY`, `RECEIPT_LINK_SECRET`, `CRON_SECRET`). **Do not** set `NEXT_PUBLIC_DONATIONS_LIVE` (it stays off until go-live). Use the **same** `PII_ENCRYPTION_KEY` everywhere that shares a database.

### End-to-end test on the Vercel preview (after M7-1 to M7-3)
Previews are behind Vercel's login (Deployment Protection), which would also block Cashfree's webhooks and return pages. In Vercel → Project → Settings → Deployment Protection, create a **Protection Bypass for Automation** secret. Then set the Cashfree webhook URL (Developers → Webhooks, payment and refund events) to
`https://<preview-url>/api/webhooks/cashfree?x-vercel-protection-bypass=<secret>`.
Open the preview in a browser where you are signed in to Vercel.

- [ ] **M7-4 Successful payment.** On `/en/donate`, donate ₹100 with the 80G option (PAN in the format `ABCDE1234F`, with an address). Pay in the Cashfree test checkout with a test UPI ID or test card from Cashfree's docs. Expect:
  - The thank-you page shows "Thank you for your donation" and a receipt number `MSWT/2026-27/000001`.
  - "Download receipt (PDF)" opens the PDF.
- [ ] **M7-5 Receipt PDF.** Check:
  - The logo appears in the header.
  - Your name, the masked PAN (`XXXXXX…`), the amount in figures and in words, the mode and the date (IST).
  - Trust facts still show `[to be confirmed: …]` until B1/B8 are filled in.
- [ ] **M7-6 Receipt in R2.** Cloudflare → R2 → the receipts bucket → `receipts/2026-27/` contains the PDF. The bucket has no public access.
- [ ] **M7-7 Receipt email (Brevo).** The email arrives in the inbox (not spam) in the page's language, with the PDF attached and a working download link. Repeat once from `/hi/donate` and check that the email is in Hindi.
- [ ] **M7-8 Failed payment.** Choose a failure option in the Cashfree test checkout. Expect "Payment not completed" and a "Try again" button. No receipt is issued.
- [ ] **M7-9 Closed tab (no redirect).** Pay successfully but close the tab before returning to the site. The webhook should still mark the donation paid, and the receipt email should still arrive.
- [ ] **M7-10 Webhook signature.** In Cashfree's webhook logs, the deliveries to `/api/webhooks/cashfree` return **200**. A retried delivery also returns 200 and doesn't create a second receipt.
- [ ] **M7-11 Refund.** Refund the M7-4 payment from the Cashfree dashboard. In the database, the donation becomes `refunded` and the receipt is voided with the same number.
- [ ] **M7-11b Automatic refund.** The webhook has **auto refund** ticked. If Cashfree's sandbox can simulate it (a second payment on the same order), check that the donation stays paid when the extra payment is returned, and that the admin timeline shows the auto-refund event.
- [ ] **M7-12 Daily reconciliation.** In Vercel → Project → Cron Jobs, `/api/cron/reconcile` is listed (03:00 IST). Run it once from there. It returns 200, and `reconciliation_runs` has a new row.

### Accessibility and devices
- [ ] **M7-13 Screen reader.** Test the full donate flow on `/en/donate` and `/hi/donate` with VoiceOver (Safari, iPhone and Mac) and with NVDA (Chrome, Windows). Check that:
  - Every field is announced with its label.
  - Errors are read out.
  - The thank-you result is announced (A11Y-21).
- [ ] **M7-14 Phone check.** Make the donation on a real Android phone (Chrome) and a real iPhone (Safari), paying with UPI in the Cashfree test checkout. Check that the form is easy to fill and the page returns from the UPI app correctly.

### Before go-live (not needed for the Step 7 PR)
- [ ] **M7-15 Trust facts on receipts.** Fill in B1 (Trust PAN, 12A and 80G numbers and validity) and B8 (signatory) in `data/organization.json`, then run `npm run org:sync`. Production won't issue receipts until these are filled in.
- [ ] **M7-16 CA review.** The CA checks the receipt and acknowledgement wording and approves printing the donor's PAN masked (B13), along with the legal pages (B11).
- [ ] **M7-17 Amounts.** The Trust confirms the minimum and suggested amounts, and whether fee cover is on (B3, B7). Update `data/payment-settings.json` and run `npm run settings:sync`.
- [ ] **M7-18 Production switch.** Add Cashfree **production** keys (after KYC) with `CASHFREE_ENV=production` and the production webhook URL. Then set `NEXT_PUBLIC_DONATIONS_LIVE=true` in Vercel Production, and make one real ₹10 donation and refund it.

## Step 8a: Admin sign-in

- [ ] **M8-1 First Super Admin on production.** After merging, with `AUTH_SECRET` in Vercel (Production and Preview), run `npm run admin:create` with `DATABASE_URL` pointing at the production Neon database. Sign in at `/admin/login` and set up 2FA with your phone's authenticator app. Print or store the 10 recovery codes.
- [ ] **M8-2 Authenticator apps.** Check that setup works with Google Authenticator, Microsoft Authenticator and 1Password (scan the QR code, and also type the key by hand).
- [ ] **M8-3 Password managers.** Your password manager offers to save the password on the invite page and fills it on the sign-in page. Pasting works in every field (A11Y-16).
- [ ] **M8-4 Invite a second person** as a Content Editor. They open the link, set a password and set up 2FA. Check they see only Dashboard, SEO, Audit log and My account.
- [ ] **M8-5 Screen reader** (VoiceOver/NVDA): sign in, 2FA, one settings save and the audit log, with every field and message announced.
- [ ] **M8-6 Idle timeout.** Leave the admin open for 31 minutes; the next click goes to the sign-in page.

## Step 8b: Donations, donors and reports

- [ ] **M8b-1 PAN code email.** Needs Brevo working in the environment (M7-2). On the stage preview, open a donation with a PAN, click **Email me a code**, and check the code arrives at your admin email within a minute. Enter it: full PANs show for 15 minutes, and the audit log has `pan.otp_sent`, `pan.unlocked` and `pan.viewed`.
- [ ] **M8b-2 Excel and CSV open correctly.** Download the donations export and each report as CSV and Excel. Open them in Excel (and Google Sheets): Hindi, Marathi and Gujarati names show correctly, amounts are numbers with 2 decimals, dates are IST.
- [ ] **M8b-3 Offline entry with real numbers.** Record one cheque and one cash donation on the stage preview, then reissue the cheque one with a PAN. The receipt PDFs show the right series (`MSWT/ACK/…` and `MSWT/2026-27/…`) and the void receipt keeps its number.
- [ ] **M8b-4 Accountant's view.** Invite an Accountant: they see Dashboard, Donations, Donors, Reports, Audit log and My account, and cannot merge donors.

## Step 8c-1: Content

- [ ] **M8c-1 Public media bucket.** Cloudflare → R2 → create a bucket (e.g. `mswt-media`) → Settings → **Public access**: allow the r2.dev URL (or connect a domain such as `media.mswelfaretrust.org`). Give the existing R2 API token Object Read & Write on this bucket too. In Vercel (Preview for `stage`, then Production) add `R2_MEDIA_BUCKET` and `R2_MEDIA_PUBLIC_URL` (https, no trailing slash) and redeploy. Until then the Media page says storage isn't set up.
- [ ] **M8c-2 Photo from a phone.** On stage, upload a photo taken on an Android phone and one on an iPhone (Safari sends HEIC photos as JPEG). Check it appears upright, and download a copy from the bucket: it has no location data (e.g. `exiftool` shows no GPS).
- [ ] **M8c-3 Write a page in Hindi, Marathi and Gujarati** with the phone's keyboard (Gboard / iOS). The preview and the public page show the text correctly.
- [ ] **M8c-4 Screen reader** (VoiceOver/NVDA): the editor toolbar, the photo picker dialog (Esc closes it) and the language tabs are announced; error messages are read on save.
- [ ] **M8c-5 Move the legal drafts in.** For each legal page, open it in English, check the draft text with the Trust (B11), save, and mark reviewed only when approved.

## Step 8c-2: Events, news, gallery, documents, menus

- [ ] **M8c-6 CORS rule for PDF uploads.** Cloudflare → R2 → the **public media bucket** (stage's, and later production's) → Settings → **CORS policy** → add:
  ```json
  [
    {
      "AllowedOrigins": ["https://mswt-git-stage-mswt.vercel.app", "https://mswelfaretrust.vercel.app", "https://mswelfaretrust.org"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
  Without it, "Upload PDF" says the upload was refused.
- [ ] **M8c-7 Upload a real annual report** (about 10 MB) on stage, publish it, and download it from `/en/transparency`.
- [ ] **M8c-8 Sliders on a phone and with a screen reader.** Swipe an event's slider on Android and iPhone; open the full-screen viewer and close it. With VoiceOver/NVDA, the buttons say "Next photo", "Photo 2 of 5" and the viewer announces the photo.
- [ ] **M8c-9 Menus.** Rename a header link in Hindi and check `/hi`; add a link to a cause; reset the menu and check the built-in one is back.

## Admin-managed menu pages and sample content

- [ ] **M8c-10 Load sample content on stage.** Admin → Content → **Sample content** → Load sample content (takes up to a minute). Then visit Home, Causes, Events, News, Gallery, Transparency, About and Contact: every page shows the sample items and photos, and all of it is editable in the admin.
- [ ] **M8c-11 Edit a list page.** Content → Pages → Causes (list) → change the heading in Hindi, mark reviewed, check `/hi/causes`.
- [ ] **M8c-12 Production (when ready).** Loading sample content on production adds hidden drafts only; mark reviewed only what should go live, or use Remove sample content.

## Workflow setup (stage → main)

- [x] **MW-1 Production secrets.** (Done 2026-10-22: 2FA works on production.) In Vercel → Settings → Environment Variables → **Production**, add `PII_ENCRYPTION_KEY` (the **same** value as in `.env.local`, which points at the production database) and `AUTH_SECRET` (a new `openssl rand -base64 32`). Redeploy production. Production builds now fail without them.
- [ ] **MW-2 Default branch.** GitHub → mswtorg/mswt → Settings → General → Default branch → **stage**, so new PRs target stage.
- [ ] **MW-3 Auto-delete merged branches.** Same page → turn on **Automatically delete head branches**. Neon then removes preview databases automatically.
- [ ] **MW-4 Preview secrets for stage.** Vercel → Environment Variables → **Preview**, branch `stage`: `AUTH_SECRET`, `PII_ENCRYPTION_KEY` (any values; not the production ones), plus R2/Brevo/Cashfree test keys when you have them.
