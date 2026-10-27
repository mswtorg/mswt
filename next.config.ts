import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Secrets production can't run without (admin sessions; encrypted PAN and 2FA secrets). Fail the
// production build instead of deploying a site whose admin breaks at the first sign-in.
const REQUIRED_IN_PRODUCTION = ["AUTH_SECRET", "PII_ENCRYPTION_KEY"];
if (process.env.VERCEL_ENV === "production") {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(
      `Missing in Vercel Production environment variables: ${missing.join(", ")} (see .env.example)`,
    );
}

// Website photos are served from the public R2 bucket (Step 8c).
const mediaOrigin = (() => {
  try {
    return process.env.R2_MEDIA_PUBLIC_URL ? new URL(process.env.R2_MEDIA_PUBLIC_URL).origin : "";
  } catch {
    return "";
  }
})();

// Baseline security headers. CSP is report-only; it is enforced and tightened in Step 10.
// Cashfree: the checkout SDK (sdk.cashfree.com) and its payment pages/APIs (*.cashfree.com).
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://sdk.cashfree.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
  "font-src 'self'",
  // *.r2.cloudflarestorage.com: admins upload large PDFs straight to the media bucket (signed URL).
  "connect-src 'self' https://challenges.cloudflare.com https://*.cashfree.com https://*.r2.cloudflarestorage.com",
  "frame-src https://challenges.cloudflare.com https://*.cashfree.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.cashfree.com",
  "object-src 'none'",
].join("; ");

// Sent with every response.
const baseHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];
// Only meaningful on documents. Kept off hashed JS/CSS and font files, where they are dead weight
// on every request (Lighthouse counts header bytes in the script budget).
const documentHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // globalNotFound: 404 for unmatched URLs as full server HTML (src/app/global-not-found.tsx).
  // authInterrupts: forbidden() → 403 for admin pages a role may not open (src/app/admin/forbidden.tsx).
  // serverActions.bodySizeLimit: photo uploads (the browser shrinks them first; Vercel caps at 4.5 MB).
  experimental: {
    globalNotFound: true,
    authInterrupts: true,
    serverActions: { bodySizeLimit: "4mb" },
  },
  // pdfkit reads font files at runtime; keep it out of the bundle.
  serverExternalPackages: ["pdfkit", "sharp"],
  // Files read with fs at runtime by the receipt routes (PDF fonts and the logo).
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/assets/receipt/**", "./public/brand/mswt-logo-horizontal.svg"],
  },
  async redirects() {
    // x-default is /en; the root never serves content of its own.
    return [{ source: "/", destination: "/en", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      { source: "/((?!_next/static/|fonts/).*)", headers: documentHeaders },
      // Self-hosted font files never change in place (rename them to update).
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      { source: "/admin/:path*", headers: noindex },
      { source: "/admin", headers: noindex },
      { source: "/api/:path*", headers: [...noindex, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
