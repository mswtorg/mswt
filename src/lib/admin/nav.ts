import { can, type AdminRole, type Capability } from "./permissions";
import type { AdminNavGroup } from "@/components/layout/AdminShell";
import { CONTENT_PAGES } from "./content-pages";

// Sidebar, grouped. Each entry is shown only to roles with one of its capabilities; pages check again.
// Content: Pages (one entry per fixed page), Causes, Events, News, Gallery, Documents, Media, Menus, Messages.
type Item = {
  key: string;
  label: string;
  href: string;
  icon: string;
  anyOf: Capability[];
  children?: { key: string; label: string; href: string }[];
};
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { key: "home", label: "Dashboard", href: "/admin", icon: "dashboard", anyOf: ["dashboard.content"] },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        key: "donations",
        label: "Donations",
        href: "/admin/donations",
        icon: "donations",
        anyOf: ["donations.view"],
      },
      { key: "donors", label: "Donors", href: "/admin/donors", icon: "donors", anyOf: ["donations.view"] },
      {
        key: "reports",
        label: "Reports",
        href: "/admin/reports",
        icon: "reports",
        anyOf: ["reports.export"],
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        key: "pages",
        label: "Pages",
        href: "/admin/content/pages",
        icon: "pages",
        anyOf: ["cms.write"],
        children: CONTENT_PAGES.map((p) => ({
          key: `page-${p.key}`,
          label: p.label,
          href: `/admin/content/pages/${p.key}`,
        })),
      },
      {
        key: "causes",
        label: "Causes",
        href: "/admin/content/causes",
        icon: "causes",
        anyOf: ["causes.read"],
      },
      { key: "events", label: "Events", href: "/admin/content/events", icon: "events", anyOf: ["cms.write"] },
      { key: "news", label: "News", href: "/admin/content/news", icon: "news", anyOf: ["cms.write"] },
      {
        key: "gallery",
        label: "Gallery",
        href: "/admin/content/gallery",
        icon: "gallery",
        anyOf: ["cms.write"],
      },
      {
        key: "documents",
        label: "Documents",
        href: "/admin/content/documents",
        icon: "documents",
        anyOf: ["cms.write"],
      },
      { key: "media", label: "Media", href: "/admin/content/media", icon: "media", anyOf: ["cms.write"] },
      { key: "menus", label: "Menus", href: "/admin/content/menus", icon: "menus", anyOf: ["cms.write"] },
      {
        key: "sample",
        label: "Sample content",
        href: "/admin/content/sample",
        icon: "sample",
        anyOf: ["content.sample"],
      },
      {
        key: "messages",
        label: "Messages",
        href: "/admin/content/messages",
        icon: "messages",
        anyOf: ["messages.read"],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        key: "org",
        label: "Organization",
        href: "/admin/settings/organization",
        icon: "organization",
        anyOf: ["settings.organization"],
      },
      { key: "seo", label: "SEO", href: "/admin/settings/seo", icon: "seo", anyOf: ["settings.seo"] },
      {
        key: "payments",
        label: "Payments",
        href: "/admin/settings/payments",
        icon: "payments",
        anyOf: ["settings.payment"],
      },
      {
        key: "email",
        label: "Email",
        href: "/admin/settings/email",
        icon: "email",
        anyOf: ["settings.email"],
      },
      {
        key: "appearance",
        label: "Appearance",
        href: "/admin/settings/appearance",
        icon: "appearance",
        anyOf: ["settings.appearance"],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "users", label: "Users", href: "/admin/users", icon: "users", anyOf: ["users.manage"] },
      {
        key: "audit",
        label: "Audit log",
        href: "/admin/audit-log",
        icon: "audit",
        anyOf: ["audit.read.all", "audit.read.own"],
      },
      {
        key: "account",
        label: "My account",
        href: "/admin/account",
        icon: "account",
        anyOf: ["dashboard.content"],
      },
    ],
  },
];

/** The sidebar for a role. `newMessages` shows as a count on Messages. */
export function adminNav(role: AdminRole, counts: { newMessages?: number } = {}): AdminNavGroup[] {
  return GROUPS.map((g) => ({
    label: g.label,
    items: g.items
      .filter((i) => i.anyOf.some((c) => can(role, c)))
      .map(({ anyOf: _, ...i }) =>
        i.key === "messages" && counts.newMessages ? { ...i, badge: counts.newMessages } : i,
      ),
  })).filter((g) => g.items.length > 0);
}

/** Flat list of what a role can open (admin home "quick links", tests). */
export const adminNavItems = (role: AdminRole) => adminNav(role).flatMap((g) => g.items);
