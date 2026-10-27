import { createSerwistRoute } from "@serwist/turbopack";
import { LOCALES } from "@/lib/pwa/routes";

// Serves the service worker (src/app/sw.ts) at /serwist/sw.js, built with esbuild at build time.
// Its Service-Worker-Allowed: / header lets it control the whole site.

// The offline pages change only with a deploy.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  // Precache only what every visitor needs: CSS, fonts, icons and the offline pages. Page JS is
  // cached as it is used (admin code never ends up on a visitor's device).
  globPatterns: [
    ".next/static/**/*.css",
    "public/fonts/**/*.woff2",
    "public/icons/{icon,apple}-*.png",
    "public/brand/mswt-mark*.svg",
  ],
  additionalPrecacheEntries: LOCALES.map((locale) => ({ url: `/${locale}/offline`, revision })),
});
