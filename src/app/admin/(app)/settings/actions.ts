"use server";

import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { requireCapability } from "@/lib/admin/guard";
import { parsePhotoIds } from "@/lib/admin/photo-ids";
import type { Capability } from "@/lib/admin/permissions";
import { AppearanceInput, EmailInput, OrganizationInput, SeoInput } from "@/lib/admin/settings/schemas";
import { updateAppearance, updateEmail, updateOrganization, updateSeo } from "@/lib/admin/settings/service";
import { db } from "@/lib/db/client";
import { organizationSettings } from "@/lib/db/schema";
import { withTx, type Tx } from "@/lib/db/tx";
import type { Actor } from "@/lib/audit";
import { rupeesToPaise } from "@/lib/money";
import { PAYMENT_SETTINGS_TAG, PaymentSettingsInput, updatePaymentSettings } from "@/lib/payment-settings";
import { clientIp } from "@/lib/security/rate-limit";
import { SETTINGS_TAGS } from "@/lib/settings";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const LOCALES = ["en", "hi", "mr", "gu"] as const;
const lines = (v: string | undefined) =>
  (v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const localised = (v: Record<string, string>, field: string) =>
  Object.fromEntries(
    LOCALES.flatMap((l) => (v[`${field}.${l}`]?.trim() ? [[l, v[`${field}.${l}`]!.trim()]] : [])),
  );

/**
 * Puts each validation error on the form field it belongs to: schema names are mapped
 * (minAmountPaise → min), and list items (phones.2, trustees.0.name) go to their textarea.
 */
function toFieldErrors(
  errors: Record<string, string>,
  values: Record<string, string>,
  fieldMap: Record<string, string>,
) {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const top = key.split(".")[0]!;
    const field = fieldMap[key] ?? fieldMap[top] ?? (key in values ? key : top in values ? top : "form");
    out[field] ??= message;
  }
  return out;
}

async function save(
  capability: Capability,
  form: FormData,
  toInput: (v: Record<string, string>) => unknown | Promise<unknown>,
  schema: ZodType,
  write: (tx: Tx, data: unknown, actor: Actor) => Promise<void>,
  tags: string[],
  fieldMap: Record<string, string> = {},
): Promise<FormState> {
  const admin = await requireCapability(capability);
  const values = formValues(form);
  let input: unknown;
  try {
    input = await toInput(values);
  } catch (error) {
    return {
      status: "error",
      errors: { form: error instanceof Error ? error.message : "Check the values" },
      values,
    };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      errors: toFieldErrors(issuesToErrors(parsed.error.issues), values, fieldMap),
      values,
    };
  const h = await headers();
  const actor = { userId: admin.id, ip: clientIp(h), userAgent: h.get("user-agent") };
  await withTx((tx) => write(tx, parsed.data, actor));
  for (const tag of tags) updateTag(tag);
  return { status: "saved", message: "Saved. The public site shows the change within a minute.", values };
}

export async function saveOrganization(_prev: FormState, form: FormData) {
  return save(
    "settings.organization",
    form,
    async (v) => {
      // Trustees are edited as "Name | Role" lines; bios are kept. Photos come from the
      // "Trustee photos" fields (trusteePhoto.<index in the saved list>), matched by name.
      const [current] = await db
        .select({ trustees: organizationSettings.trustees })
        .from(organizationSettings)
        .where(eq(organizationSettings.id, 1));
      const photoByName = new Map(
        (current?.trustees ?? []).map((t, j) => [
          t.name,
          `trusteePhoto.${j}` in v ? parsePhotoIds(v[`trusteePhoto.${j}`], 1)[0] : t.photoMediaId,
        ]),
      );
      const trustees = lines(v.trustees).map((line, i) => {
        const [name = "", role = ""] = line.split("|").map((s) => s.trim());
        if (!name || !role) throw new Error(`Trustee line ${i + 1}: write it as "Name | Role"`);
        const { photoMediaId: _, ...before } = current?.trustees.find((t) => t.name === name) ?? {};
        const photoMediaId = photoByName.get(name);
        return { ...before, name, role, sort: i + 1, ...(photoMediaId ? { photoMediaId } : {}) };
      });
      return {
        legalName: v.legalName,
        displayName: v.displayName,
        alternateNames: Object.fromEntries(
          LOCALES.flatMap((l) => {
            const names = (v[`alternateNames.${l}`] ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            return names.length ? [[l, names]] : [];
          }),
        ),
        description: localised(v, "description"),
        contactHours: localised(v, "contactHours"),
        foundingDate: v.foundingDate,
        trustPan: v.trustPan,
        trustRegistrationNo: v.trustRegistrationNo,
        registrationAuthority: v.registrationAuthority,
        reg12aNumber: v.reg12aNumber,
        reg12aDate: v.reg12aDate,
        reg80gNumber: v.reg80gNumber,
        reg80gValidFrom: v.reg80gValidFrom,
        reg80gValidTo: v.reg80gValidTo,
        streetAddress: v.streetAddress,
        locality: v.locality,
        city: v.city,
        district: v.district,
        state: v.state,
        pincode: v.pincode,
        phones: lines(v.phones),
        email: v.email,
        areaServed: lines(v.areaServed),
        sameAs: lines(v.sameAs),
        trustees,
        signatoryName: v.signatoryName,
        signatoryTitle: v.signatoryTitle,
      };
    },
    OrganizationInput,
    updateOrganization,
    [SETTINGS_TAGS.organization, CONTENT_TAG],
  );
}

export async function saveSeo(_prev: FormState, form: FormData) {
  return save(
    "settings.seo",
    form,
    (v) => ({
      titleTemplate: localised(v, "titleTemplate"),
      defaultDescription: localised(v, "defaultDescription"),
      googleSiteVerification: v.googleSiteVerification,
      bingSiteVerification: v.bingSiteVerification,
      indexnowKey: v.indexnowKey,
      twitterHandle: v.twitterHandle,
    }),
    SeoInput,
    updateSeo,
    [SETTINGS_TAGS.seo],
  );
}

const rupees = (v: string | undefined, label: string) => {
  try {
    return rupeesToPaise(v ?? "");
  } catch {
    throw new Error(`${label}: enter an amount in rupees, e.g. 500`);
  }
};

export async function savePayments(_prev: FormState, form: FormData) {
  return save(
    "settings.payment",
    form,
    (v) => ({
      minAmountPaise: rupees(v.min, "Minimum"),
      maxAmountPaise: v.max?.trim() ? rupees(v.max, "Maximum") : null,
      presetAmountsPaise: (v.presets ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => rupees(p, "Suggested amounts")),
      feeCoverEnabled: v.feeCoverEnabled === "on",
      feeCoverPercentBp: Math.round(Number(v.feePercent || "0") * 100),
    }),
    PaymentSettingsInput,
    (tx, data, actor) => updatePaymentSettings(tx, PaymentSettingsInput.parse(data), actor),
    [PAYMENT_SETTINGS_TAG],
    {
      minAmountPaise: "min",
      maxAmountPaise: "max",
      presetAmountsPaise: "presets",
      feeCoverPercentBp: "feePercent",
      feeCoverEnabled: "feeCoverEnabled",
    },
  );
}

export async function saveEmail(_prev: FormState, form: FormData) {
  return save(
    "settings.email",
    form,
    (v) => ({
      fromName: v.fromName,
      fromAddress: v.fromAddress,
      replyTo: v.replyTo,
      adminAlertRecipients: lines(v.adminAlertRecipients),
    }),
    EmailInput,
    updateEmail,
    [SETTINGS_TAGS.email],
  );
}

export async function saveAppearance(_prev: FormState, form: FormData) {
  return save(
    "settings.appearance",
    form,
    (v) => ({ siteFont: v.siteFont }),
    AppearanceInput,
    updateAppearance,
    [SETTINGS_TAGS.appearance],
  );
}
