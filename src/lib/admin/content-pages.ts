// The fixed public pages edited under Content → Pages (page_key enum), with their public paths.
export const CONTENT_PAGES = [
  { key: "home", label: "Home", path: "" },
  { key: "about", label: "About", path: "/about" },
  { key: "contact", label: "Contact", path: "/contact" },
  { key: "causes", label: "Causes (list)", path: "/causes" },
  { key: "events", label: "Events (list)", path: "/events" },
  { key: "news", label: "News (list)", path: "/news" },
  { key: "gallery", label: "Gallery (list)", path: "/gallery" },
  { key: "testimonials", label: "Testimonials (list)", path: "/testimonials" },
  { key: "team", label: "Team (list)", path: "/team" },
  { key: "transparency", label: "Transparency", path: "/transparency" },
  { key: "privacy", label: "Privacy policy", path: "/privacy" },
  { key: "terms", label: "Terms", path: "/terms" },
  { key: "refund_policy", label: "Refund policy", path: "/refund-policy" },
  { key: "disclaimer_80g", label: "80G disclaimer", path: "/80g-disclaimer" },
] as const;

export type ContentPageKey = (typeof CONTENT_PAGES)[number]["key"];

export const contentPage = (key: string) => CONTENT_PAGES.find((p) => p.key === key) ?? null;
