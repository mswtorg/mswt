import { z } from "zod";
import { siteFont } from "@/lib/db/schema";

// Validation for the single-row settings tables. No database imports, so `org:sync -- --check`
// and other data checks run without DATABASE_URL.

const LOCALES = ["en", "hi", "mr", "gu"] as const;
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max = 200) => z.preprocess(blank, z.string().trim().max(max).nullable());
const date = z.preprocess(blank, z.iso.date().nullable());
const localised = z.partialRecord(z.enum(LOCALES), z.string().trim().min(1).max(2000));

export const OrganizationInput = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(120),
    alternateNames: z.partialRecord(z.enum(LOCALES), z.array(z.string().trim().min(1).max(120)).max(10)),
    description: localised,
    foundingDate: date,
    trustPan: z.preprocess(
      (v) => (typeof v === "string" ? blank(v.trim().toUpperCase()) : v),
      z
        .string()
        .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
        .nullable(),
    ),
    trustRegistrationNo: optText(),
    registrationAuthority: optText(),
    reg12aNumber: optText(),
    reg12aDate: date,
    reg80gNumber: optText(),
    reg80gValidFrom: date,
    reg80gValidTo: date,
    streetAddress: optText(300),
    locality: optText(),
    city: optText(),
    district: optText(),
    state: optText(),
    pincode: z.preprocess(
      blank,
      z
        .string()
        .regex(/^[1-9]\d{5}$/)
        .nullable(),
    ),
    phones: z.array(z.string().trim().min(6).max(20)).max(5),
    email: z.preprocess(blank, z.email().nullable()),
    contactHours: localised,
    areaServed: z.array(z.string().trim().min(1).max(120)).max(20),
    sameAs: z.array(z.url({ protocol: /^https$/, error: "Profiles must start with https://" })).max(10),
    signatoryName: optText(120).optional().default(null),
    signatoryTitle: optText(120).optional().default(null),
  })
  .refine((o) => !o.reg80gValidFrom || !o.reg80gValidTo || o.reg80gValidFrom <= o.reg80gValidTo, {
    path: ["reg80gValidTo"],
    message: "80G validity must end after it starts",
  });
export type OrganizationInput = z.output<typeof OrganizationInput>;

export const SeoInput = z.object({
  titleTemplate: z.partialRecord(
    z.enum(LOCALES),
    z
      .string()
      .trim()
      .max(120)
      .refine((t) => t.includes("%s"), "Must contain %s for the page title"),
  ),
  defaultDescription: localised,
  googleSiteVerification: optText(200),
  bingSiteVerification: optText(200),
  indexnowKey: z.preprocess(
    blank,
    z
      .string()
      .regex(/^[A-Za-z0-9-]{8,128}$/)
      .nullable(),
  ),
  twitterHandle: z.preprocess(
    blank,
    z
      .string()
      .regex(/^@?\w{1,15}$/)
      .nullable(),
  ),
});
export type SeoInput = z.output<typeof SeoInput>;

export const EmailInput = z.object({
  fromName: optText(120),
  fromAddress: z.preprocess(blank, z.email().nullable()),
  replyTo: z.preprocess(blank, z.email().nullable()),
  adminAlertRecipients: z.array(z.email()).max(10),
});
export type EmailInput = z.output<typeof EmailInput>;

export const AppearanceInput = z.object({
  siteFont: z.enum(siteFont.enumValues),
});
export type AppearanceInput = z.output<typeof AppearanceInput>;
