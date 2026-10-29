import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavItems } from "@/lib/admin/nav";
import { can, CAPABILITIES, ROLES, type Capability } from "@/lib/admin/permissions";
import { OrganizationInput, SeoInput, AppearanceInput } from "@/lib/admin/settings/schemas";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { hashLinkToken, newLinkToken, readSignedValue, signValue } from "@/lib/auth/signed";
import {
  currentTotp,
  hashRecoveryCodes,
  matchRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  totpUri,
  verifyTotp,
} from "@/lib/auth/totp";

describe("role permissions match docs/spec.md §5", () => {
  // Rows of the spec's table → capabilities, with the roles that have ✓.
  const SPEC: [Capability, string[]][] = [
    ["dashboard.financial", ["super_admin", "accountant"]],
    ["donations.view", ["super_admin", "accountant"]],
    ["donations.offline", ["super_admin", "accountant"]],
    ["receipts.manage", ["super_admin", "accountant"]],
    ["reports.export", ["super_admin", "accountant"]],
    ["donors.merge", ["super_admin"]],
    ["causes.read", ["super_admin", "accountant", "content_editor"]],
    ["causes.write", ["super_admin", "content_editor"]],
    ["cms.write", ["super_admin", "content_editor"]],
    ["messages.read", ["super_admin", "accountant", "content_editor"]],
    ["messages.write", ["super_admin", "content_editor"]],
    ["content.sample", ["super_admin"]],
    ["settings.organization", ["super_admin"]],
    ["settings.seo", ["super_admin", "content_editor"]],
    ["settings.payment", ["super_admin"]],
    ["settings.email", ["super_admin"]],
    ["settings.receipts", ["super_admin"]],
    ["settings.appearance", ["super_admin"]],
    ["users.manage", ["super_admin"]],
    ["audit.read.all", ["super_admin"]],
    ["audit.read.own", ["super_admin", "accountant", "content_editor"]],
  ];
  it.each(SPEC)("%s", (cap, allowed) => {
    for (const role of ROLES) expect(can(role, cap), `${role} → ${cap}`).toBe(allowed.includes(role));
  });
  it("covers every capability in the matrix", () => {
    const tested = new Set(SPEC.map(([c]) => c));
    const untested = (Object.keys(CAPABILITIES) as Capability[]).filter(
      (c) => !tested.has(c) && c !== "dashboard.content",
    );
    expect(untested).toEqual([]);
  });
  it("denies unknown or missing roles", () => {
    expect(can(null, "dashboard.content")).toBe(false);
    expect(can(undefined, "settings.seo")).toBe(false);
  });
  it("shows each role only the sections it may open", () => {
    expect(adminNavItems("content_editor").map((i) => i.key)).toEqual([
      "home",
      "pages",
      "causes",
      "events",
      "news",
      "testimonials",
      "gallery",
      "documents",
      "media",
      "menus",
      "messages",
      "seo",
      "audit",
      "account",
    ]);
    expect(adminNavItems("accountant").map((i) => i.key)).toEqual([
      "home",
      "donations",
      "donors",
      "reports",
      "causes",
      "messages",
      "audit",
      "account",
    ]);
    expect(adminNavItems("super_admin").map((i) => i.key)).toContain("payments");
  });
  it("every admin page and action checks a capability on the server", () => {
    const files = [
      "src/app/admin/(app)/page.tsx",
      "src/app/admin/(app)/users/page.tsx",
      "src/app/admin/(app)/users/[id]/page.tsx",
      "src/app/admin/(app)/audit-log/page.tsx",
      "src/app/admin/(app)/settings/organization/page.tsx",
      "src/app/admin/(app)/settings/seo/page.tsx",
      "src/app/admin/(app)/settings/payments/page.tsx",
      "src/app/admin/(app)/settings/email/page.tsx",
      "src/app/admin/(app)/settings/receipts/page.tsx",
      "src/app/admin/(app)/settings/receipts/actions.ts",
      "src/app/admin/(app)/settings/appearance/page.tsx",
      "src/app/admin/(app)/donations/page.tsx",
      "src/app/admin/(app)/donations/[id]/page.tsx",
      "src/app/admin/(app)/donations/new/page.tsx",
      "src/app/admin/(app)/donations/export/route.ts",
      "src/app/admin/(app)/donors/page.tsx",
      "src/app/admin/(app)/donors/[id]/page.tsx",
      "src/app/admin/(app)/reports/page.tsx",
      "src/app/admin/(app)/reports/[report]/route.ts",
      "src/app/admin/(app)/content/pages/page.tsx",
      "src/app/admin/(app)/content/pages/[key]/page.tsx",
      "src/app/admin/(app)/content/causes/page.tsx",
      "src/app/admin/(app)/content/causes/new/page.tsx",
      "src/app/admin/(app)/content/causes/[id]/page.tsx",
      "src/app/admin/(app)/content/media/page.tsx",
      "src/app/admin/(app)/content/media/[id]/page.tsx",
      "src/app/admin/(app)/content/messages/page.tsx",
      "src/app/admin/(app)/content/messages/[id]/page.tsx",
      ...["events", "news", "gallery", "documents"].flatMap((k) => [
        `src/app/admin/(app)/content/${k}/page.tsx`,
        `src/app/admin/(app)/content/${k}/new/page.tsx`,
        `src/app/admin/(app)/content/${k}/[id]/page.tsx`,
      ]),
      "src/app/admin/(app)/content/menus/page.tsx",
      "src/app/admin/(app)/content/sample/page.tsx",
    ];
    // actorFor() (src/lib/admin/actor.ts) runs requireCapability first.
    for (const f of files) expect(readFileSync(f, "utf8"), f).toMatch(/requireCapability\(|actorFor\(/);
    // Each exported action in these files starts with a guard.
    for (const f of [
      "src/app/admin/(app)/users/actions.ts",
      "src/app/admin/(app)/settings/actions.ts",
      "src/app/admin/(app)/donations/actions.ts",
      "src/app/admin/(app)/donors/actions.ts",
      "src/app/admin/(app)/pan/actions.ts",
      "src/app/admin/(app)/content/actions.ts",
      "src/app/admin/(app)/content/pages/actions.ts",
      "src/app/admin/(app)/content/causes/actions.ts",
      "src/app/admin/(app)/content/messages/actions.ts",
      "src/app/admin/(app)/content/items-actions.ts",
      "src/app/admin/(app)/content/gallery/actions.ts",
      "src/app/admin/(app)/content/documents/actions.ts",
      "src/app/admin/(app)/content/menus/actions.ts",
      "src/app/admin/(app)/content/sample/actions.ts",
      "src/app/admin/(app)/settings/receipts/actions.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      const actions = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
      expect(actions.length, f).toBeGreaterThan(0);
      // Every exported action calls a helper or guard that runs requireCapability first.
      expect(src, f).toMatch(/requireCapability\(|actorFor\(/);
      for (const name of actions) {
        const body = src.slice(src.indexOf(`export async function ${name}`)).split(/\nexport /)[0]!;
        expect(body, `${f} → ${name}`).toMatch(
          /requireCapability\(|await actor(For)?\(|return save\(\s*"settings\./,
        );
      }
    }
    expect(
      readFileSync("src/app/admin/(app)/account/actions.ts", "utf8").match(/requireAdmin\(\)/g),
    ).toHaveLength(2);
  });
});

describe("passwords (argon2id, NIST rules)", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("a long enough passphrase");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "a long enough passphrase")).toBe(true);
    expect(await verifyPassword(h, "a long enough passphrasE")).toBe(false);
    expect(await verifyPassword(null, "x")).toBe(false);
  });
  it.each([
    ["short", "elevenchars"],
    ["common", "password1234"],
    ["common", "aaaaaaaaaaaaaaaa"],
    ["personal", "asha.patel-secret-2026"],
  ])("rejects %s passwords", (problem, pw) => {
    expect(passwordProblem(pw, ["asha.patel@example.com", "Asha Patel"])).toBe(problem);
  });
  it("accepts long passphrases without composition rules", () => {
    expect(passwordProblem("correct horse battery staple")).toBeNull();
  });
});

describe("two-step verification", () => {
  const secret = newTotpSecret();
  const now = Date.UTC(2026, 9, 23, 10, 0, 15);
  it("accepts the current code and one step of drift, never the same step twice", () => {
    const step = verifyTotp(secret, currentTotp(secret, now), null, now);
    expect(step).toBe(Math.floor(now / 30000));
    expect(verifyTotp(secret, currentTotp(secret, now), step, now)).toBeNull();
    expect(verifyTotp(secret, currentTotp(secret, now - 30000), null, now)).toBe(step! - 1);
    expect(verifyTotp(secret, currentTotp(secret, now - 90000), null, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
  });
  it("builds an otpauth URI for authenticator apps", () => {
    expect(totpUri(secret, "a@example.com")).toMatch(
      /^otpauth:\/\/totp\/MS%20Welfare%20Trust:a%40example\.com\?/,
    );
  });
  it("matches a recovery code once (case and spaces ignored)", async () => {
    const codes = newRecoveryCodes(3);
    expect(codes[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    const hashes = await hashRecoveryCodes(codes);
    expect(await matchRecoveryCode(` ${codes[1]!.toUpperCase()} `, hashes)).toBe(1);
    expect(await matchRecoveryCode("aaaaa-aaaaa", hashes)).toBe(-1);
  });
});

describe("signed values and link tokens", () => {
  it("round-trips, rejects tampering, other purposes and expiry", () => {
    const v = signValue("p", { uid: "u1", sv: 2 }, 60, 1000);
    expect(readSignedValue<{ uid: string }>("p", v, 2000)?.uid).toBe("u1");
    expect(readSignedValue("other", v, 2000)).toBeNull();
    expect(readSignedValue("p", v, 1000 + 61_000)).toBeNull();
    expect(readSignedValue("p", v.slice(0, -2) + "xx", 2000)).toBeNull();
  });
  it("stores only a hash of link tokens", () => {
    const { token, hash } = newLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashLinkToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("settings validation", () => {
  const org = {
    legalName: "Munira Shoaib Welfare Trust",
    displayName: "MS Welfare Trust",
    alternateNames: {},
    description: {},
    foundingDate: "",
    trustPan: "aaatm1234b",
    trustRegistrationNo: "",
    registrationAuthority: "",
    reg12aNumber: "",
    reg12aDate: "",
    reg80gNumber: "",
    reg80gValidFrom: "2026-04-01",
    reg80gValidTo: "2031-03-31",
    streetAddress: "",
    locality: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    phones: [],
    email: "",
    contactHours: {},
    areaServed: [],
    trustees: [],
    sameAs: [],
  };
  it("normalises empty strings to null and upper-cases PAN", () => {
    const o = OrganizationInput.parse(org);
    expect(o.trustPan).toBe("AAATM1234B");
    expect(o.city).toBeNull();
    expect(o.signatoryName).toBeNull();
  });
  it("rejects bad PAN, PIN and an 80G validity that ends before it starts", () => {
    expect(OrganizationInput.safeParse({ ...org, trustPan: "123" }).success).toBe(false);
    expect(OrganizationInput.safeParse({ ...org, pincode: "012345" }).success).toBe(false);
    expect(OrganizationInput.safeParse({ ...org, reg80gValidTo: "2025-01-01" }).success).toBe(false);
  });
  it("accepts only https profile links (they become footer links)", () => {
    expect(OrganizationInput.safeParse({ ...org, sameAs: ["https://facebook.com/mswt"] }).success).toBe(true);
    for (const bad of ["http://facebook.com/mswt", "javascript:alert(1)", "ftp://example.org"])
      expect(OrganizationInput.safeParse({ ...org, sameAs: [bad] }).success).toBe(false);
  });
  it("requires %s in title templates and a known site font", () => {
    const seo = {
      titleTemplate: { en: "MS Welfare Trust" },
      defaultDescription: {},
      googleSiteVerification: "",
      bingSiteVerification: "",
      indexnowKey: "",
      twitterHandle: "",
    };
    expect(SeoInput.safeParse(seo).success).toBe(false);
    expect(SeoInput.safeParse({ ...seo, titleTemplate: { en: "%s | MSWT" } }).success).toBe(true);
    expect(AppearanceInput.safeParse({ siteFont: "comic_sans" }).success).toBe(false);
    expect(AppearanceInput.safeParse({ siteFont: "mukta" }).success).toBe(true);
  });
});
