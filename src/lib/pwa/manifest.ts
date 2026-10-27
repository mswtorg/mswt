import type { MetadataRoute } from "next";
import tokens from "../../../tokens/design-tokens.json";
import en from "../../messages/en.json";

// Web app manifest (Step 9, docs/standards.md PWA-01..03). English, like x-default: the installed
// app opens /en and the visitor switches language inside it.

export const THEME_COLOR = tokens.color.primary["700"].$value;
export const BACKGROUND_COLOR = tokens.color.white.$value;

export function webManifest(): MetadataRoute.Manifest {
  return {
    id: "/en",
    name: en.Meta.siteName,
    short_name: "MS Welfare",
    description: en.Meta.homeDescription,
    lang: "en",
    dir: "ltr",
    start_url: "/en",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    categories: ["charity", "education", "health"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/icons/screenshot-narrow.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: en.Meta.homeTitle,
      },
      {
        src: "/icons/screenshot-wide.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: en.Meta.homeTitle,
      },
    ],
  };
}
