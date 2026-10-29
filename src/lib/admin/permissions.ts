// Who may do what in the admin: docs/spec.md §5 "Role permissions", as one table. Every admin page
// and Server Action checks this on the server (requireCapability); hiding links is only cosmetic.
export const ROLES = ["super_admin", "accountant", "content_editor"] as const;
export type AdminRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  accountant: "Accountant",
  content_editor: "Content Editor",
};

const ALL = ROLES;
const SA = ["super_admin"] as const;
const FINANCE = ["super_admin", "accountant"] as const;
const CONTENT = ["super_admin", "content_editor"] as const;

export const CAPABILITIES = {
  "dashboard.financial": FINANCE,
  "dashboard.content": ALL,
  "donations.view": FINANCE, // includes full PAN
  "donations.offline": FINANCE,
  "receipts.manage": FINANCE, // resend / void / reissue
  "reports.export": FINANCE,
  "donors.merge": SA, // merging duplicate donor records (8b)
  "causes.read": ALL,
  "causes.write": CONTENT,
  "cms.write": CONTENT, // pages, gallery, events, news, menus, media
  "messages.read": ALL,
  "messages.write": CONTENT,
  "content.sample": SA, // load/remove sample content (Step 8c)
  "settings.organization": SA,
  "settings.seo": CONTENT,
  "settings.payment": SA,
  "settings.email": SA,
  "settings.receipts": SA, // receipt PDF and email templates
  "settings.appearance": SA,
  "users.manage": SA,
  "audit.read.all": SA,
  "audit.read.own": ALL,
} as const satisfies Record<string, readonly AdminRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: AdminRole | null | undefined, capability: Capability): boolean {
  return !!role && (CAPABILITIES[capability] as readonly AdminRole[]).includes(role);
}
