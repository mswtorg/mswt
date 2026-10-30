# Admin guide

Training material for trustees and staff: one guide per admin module, with screenshots, as PDFs.

- `modules/*.md` — the text, one file per module (edit these). Kept to a small Markdown subset: `#`/`##` headings, paragraphs, `-`/`1.` lists, tables, `> ` notes, `![caption](img/…)` images, and a `Who can use it:` line.
- `img/` — screenshots, taken by `scripts/admin-guide/capture.spec.ts`.
- `pdf/` — the built PDFs (not committed; rebuild them).

## Rebuild the PDFs

```bash
npm run guide:pdf
```

Writes `docs/admin-guide/pdf/NN-module.pdf` for each module and `mswt-admin-guide-complete.pdf` with all of them.

## Retake the screenshots

After the admin screens change. It signs in to a fresh **local** database with sample content (it refuses anything but localhost), so start a throwaway Postgres (`npm run db:local`) and use an empty database:

```bash
npm run build
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/guidedb npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/guidedb PAYMENT_PROVIDER=fake BREVO_API_KEY= R2_ACCOUNT_ID= npm run guide:screens
```

Then `npm run guide:pdf`. When a screen gains or loses a feature, update the matching `modules/*.md` too.
