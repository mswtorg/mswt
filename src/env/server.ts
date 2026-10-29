import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Server-only secrets. Imported only by code that needs them, so static pages build without them.
// Donation-related values are optional here so local builds and CI run without real accounts;
// src/lib/secrets.ts refuses to fall back to development values in production.
export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url(),
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    // Payments (Cashfree). PAYMENT_PROVIDER=fake is for tests and is refused in production.
    PAYMENT_PROVIDER: z.enum(["cashfree", "fake"]).optional(),
    CASHFREE_APP_ID: z.string().min(1).optional(),
    CASHFREE_SECRET_KEY: z.string().min(1).optional(),
    CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    // Cloudflare R2 (private bucket for receipt PDFs).
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_RECEIPTS_BUCKET: z.string().min(1).optional(),
    // Public bucket for website photos (Step 8c) and the URL it is served from (r2.dev or a domain).
    R2_MEDIA_BUCKET: z.string().min(1).optional(),
    R2_MEDIA_PUBLIC_URL: z
      .url()
      .refine((v) => v.startsWith("https://") && !v.endsWith("/"), "must be https:// with no trailing slash")
      .optional(),
    // Admin → Move from stage (production only): a read-only login to the stage database, and the
    // public URL of stage's media bucket (photos and PDFs are copied from there).
    STAGE_DATABASE_URL: z.url().optional(),
    STAGE_MEDIA_PUBLIC_URL: z
      .url()
      .refine((v) => !v.endsWith("/"), "must have no trailing slash")
      .optional(),
    // Outbound email (Brevo).
    BREVO_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM_ADDRESS: z.email().optional(),
    EMAIL_FROM_NAME: z.string().min(1).default("MS Welfare Trust"),
    // Security.
    PII_ENCRYPTION_KEY: z
      .string()
      .refine((v) => /^[A-Za-z0-9+/]{43}=$/.test(v), {
        message: `must be exactly 44 base64 characters ending in "=" (output of \`openssl rand -base64 32\`), with no quotes, spaces or "# comment"`,
      })
      .optional(),
    RECEIPT_LINK_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
    CRON_SECRET: z.string().min(16, "must be at least 16 characters").optional(),
    // Signs admin sessions (Auth.js) and login challenges: 32+ random characters.
    AUTH_SECRET: z
      .string()
      .min(32, "must be at least 32 characters (e.g. `openssl rand -base64 32`)")
      .refine((v) => !/\s#|^["']|["']$/.test(v), 'must not contain quotes or a "# comment"')
      .optional(),
  },
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
