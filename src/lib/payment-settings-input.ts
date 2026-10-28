import { z } from "zod";

// Validation for payment_settings, kept free of database imports so `settings:sync -- --check`
// runs without DATABASE_URL (CI check job).
/** Hard floor: the minimum must be above ₹5 (owner decision, 2026-10-22). */
export const MIN_AMOUNT_FLOOR_PAISE = 500;

const paise = z.number().int().positive();
export const PaymentSettingsInput = z
  .object({
    minAmountPaise: paise.gt(MIN_AMOUNT_FLOOR_PAISE, "The minimum must be above ₹5"),
    maxAmountPaise: paise.nullable(),
    presetAmountsPaise: z.array(paise).min(3).max(4),
    feeCoverEnabled: z.boolean(),
    feeCoverPercentBp: z.number().int().min(0).max(1000),
    // The quick donate box on Home (shown only while online donations are live).
    homeDonateBox: z.boolean().default(true),
  })
  .superRefine((s, ctx) => {
    if (s.maxAmountPaise !== null && s.maxAmountPaise < s.minAmountPaise)
      ctx.addIssue({ code: "custom", path: ["maxAmountPaise"], message: "Maximum is below the minimum" });
    s.presetAmountsPaise.forEach((p, i) => {
      if (p < s.minAmountPaise || (s.maxAmountPaise !== null && p > s.maxAmountPaise))
        ctx.addIssue({ code: "custom", path: ["presetAmountsPaise", i], message: "Outside min/max" });
    });
    if (new Set(s.presetAmountsPaise).size !== s.presetAmountsPaise.length)
      ctx.addIssue({ code: "custom", path: ["presetAmountsPaise"], message: "Duplicate amounts" });
    if (s.feeCoverEnabled && s.feeCoverPercentBp === 0)
      ctx.addIssue({ code: "custom", path: ["feeCoverPercentBp"], message: "Set the fee percentage" });
  });
export type PaymentSettingsInput = z.infer<typeof PaymentSettingsInput>;
