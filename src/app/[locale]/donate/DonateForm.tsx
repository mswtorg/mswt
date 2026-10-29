"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  AmountPicker,
  Choice,
  ChoiceGroup,
  ErrorSummary,
  FormField,
  Input,
  InputPrefix,
  Select,
} from "@/components/ui/Form";
import { openCheckout } from "@/components/forms/checkout";
import { useTurnstile } from "@/components/forms/useTurnstile";
import { formatRupees, rupeesToPaise } from "@/lib/money";
import { DONATE_FIELDS, type DonateErrorCode, type DonateField } from "@/lib/donations/fields";
import { useLiveErrors } from "@/components/forms/useLiveErrors";
import { startDonation, type DonateState } from "./actions";

export type DonateStrings = {
  amountLegend: string;
  customAmount: string;
  minHint: string;
  cause: string;
  generalFund: string;
  coverFee: string;
  detailsLegend: string;
  name: string;
  nameHint: string;
  email: string;
  emailHint: string;
  phone: string;
  phoneHint: string;
  receiptLegend: string;
  wants80g: string;
  wants80gHint: string;
  pan: string;
  panHint: string;
  panRequiredHint: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  anonymous: string;
  anonymousHint: string;
  citizen: string;
  citizenHint: string;
  captcha: string;
  total: string;
  pay: string;
  payNoAmount: string;
  processing: string;
  errorSummary: string;
  required: string;
  optional: string;
  errors: Record<DonateErrorCode | "gateway", string>;
};

export type DonateConfig = {
  presets: number[];
  minPaise: number;
  /** Largest online donation (null = no limit). */
  maxPaise: number | null;
  /** Donations above this need a PAN, 80G or not (Settings → Payments). */
  panAbovePaise: number;
  feeBp: number;
  causes: { slug: string; title: string }[];
};

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

function paiseOf(custom: string, preset: string): number {
  try {
    if (custom.trim()) return rupeesToPaise(custom);
  } catch {
    return 0;
  }
  return Number(preset) || 0;
}

export function DonateForm({
  locale,
  siteKey,
  config,
  t,
}: {
  locale: string;
  siteKey: string | null;
  config: DonateConfig;
  t: DonateStrings;
}) {
  const [state, action, pending] = useActionState<DonateState, FormData>(startDonation, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const resetTurnstile = useTurnstile(form, box, siteKey, locale);
  const values = useMemo(() => (state.status === "error" ? state.values : {}), [state]);
  const errors = useMemo(() => (state.status === "error" ? state.errors : {}), [state]);

  const [preset, setPreset] = useState(values.preset ?? String(config.presets[1] ?? config.presets[0] ?? ""));
  const [custom, setCustom] = useState(values.custom ?? "");
  const [wants80g, setWants80g] = useState(values.wants80g === "on");
  const [coverFee, setCoverFee] = useState(values.coverFee === "on");
  const [gatewayError, setGatewayError] = useState(false);

  // ?cause=slug from a cause page, and ?preset=/?custom= from the Home donate box, fill the form in
  // (read here so the page itself stays static). The server still checks every value.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const slug = query.get("cause");
    const select = document.getElementById("donate-cause");
    if (slug && select instanceof HTMLSelectElement && config.causes.some((c) => c.slug === slug))
      select.value = slug;
    const custom = query.get("custom")?.trim();
    const preset = Number(query.get("preset"));
    // One read of the URL after hydration (the static page can't know it while rendering).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (custom && /^\d{1,9}(\.\d{1,2})?$/.test(custom)) setCustom(custom);
    else if (config.presets.includes(preset)) {
      setPreset(String(preset));
      const radio = document.querySelector<HTMLInputElement>(`input[name="preset"][value="${preset}"]`);
      if (radio) radio.checked = true;
    }
  }, [config.causes, config.presets]);

  useEffect(() => {
    if (state.status === "error") {
      document.getElementById("error-summary")?.focus();
      resetTurnstile();
    }
    if (state.status === "checkout") openCheckout(state).catch(() => setGatewayError(true));
  }, [state, resetTurnstile]);

  const amount = paiseOf(custom, preset);
  const panNeeded = amount > config.panAbovePaise;
  const fee = coverFee && config.feeBp > 0 ? Math.floor((amount * config.feeBp + 5000) / 10000) : 0;
  const total = amount + fee;
  const money = (p: number) => formatRupees(p, locale);

  const limits = {
    min: money(config.minPaise),
    max: config.maxPaise === null ? "" : money(config.maxPaise),
    pan: money(config.panAbovePaise),
  };
  const shown = useLiveErrors<DonateField, DonateErrorCode>({
    form,
    serverErrors: errors,
    serverState: state,
    fieldOf: (name) =>
      name === "custom" || name === "preset"
        ? "amount"
        : (DONATE_FIELDS as readonly string[]).includes(name)
          ? (name as DonateField)
          : undefined,
    // The server's own rules, loaded on first use (amount as the server builds it).
    check: async (data) => {
      const { validateDonation } = await import("@/lib/donations/schema");
      const raw = Object.fromEntries([...data].map(([k, v]) => [k, String(v)]));
      const amount = raw.custom?.trim() || (raw.preset ? String(Number(raw.preset) / 100) : "");
      const result = validateDonation(
        {
          minAmountPaise: config.minPaise,
          maxAmountPaise: config.maxPaise,
          panRequiredAbovePaise: config.panAbovePaise,
        },
        { ...raw, amount },
      );
      return result.ok ? {} : result.errors;
    },
  });
  const err = (f: DonateField) => {
    const code = shown(f);
    return code ? fill(t.errors[code], limits) : undefined;
  };
  // The summary lists what the server found, minus what has been put right since.
  const summaryItems = (() => {
    const ids: Partial<Record<DonateField, string>> = { amount: "donate-custom", citizen: "donate-citizen" };
    const items = (Object.keys(errors) as (DonateField | "form")[])
      .filter((f): f is DonateField => f !== "form" && Boolean(shown(f as DonateField)))
      .map((f) => ({ fieldId: ids[f] ?? `donate-${f}`, message: err(f)! }));
    if (errors.form) items.push({ fieldId: "donate-name", message: t.errors[errors.form] });
    return items;
  })();

  const busy = pending || (state.status === "checkout" && !gatewayError);
  return (
    <form
      ref={form}
      action={action}
      onSubmit={(e) => {
        // Run the action ourselves: a form `action` resets the form afterwards, which unticks the
        // 80G and fee boxes while their state (and the PAN fields) stays, so a retry lost the 80G choice.
        e.preventDefault();
        setGatewayError(false);
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid gap-8"
      noValidate
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="empty:hidden">
        {summaryItems.length > 0 ? <ErrorSummary title={t.errorSummary} errors={summaryItems} /> : null}
        {gatewayError ? (
          <Alert tone="error" live="assertive">
            <p>{t.errors.gateway}</p>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-4">
        <div
          onChange={(e) => {
            const target = e.target as HTMLInputElement;
            if (target.name === "preset") {
              setPreset(target.value);
              setCustom("");
            }
          }}
        >
          <AmountPicker
            id="donate-preset"
            name="preset"
            legend={t.amountLegend}
            defaultValue={Number(preset)}
            options={config.presets.map((p) => ({ value: p, label: money(p) }))}
          />
        </div>
        <FormField
          id="donate-custom"
          label={t.customAmount}
          hint={fill(t.minHint, { min: money(config.minPaise) })}
          error={err("amount")}
        >
          {(p) => (
            <InputPrefix
              {...p}
              prefix="₹"
              name="custom"
              inputMode="decimal"
              autoComplete="off"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={12}
            />
          )}
        </FormField>
        {config.causes.length > 0 ? (
          <FormField id="donate-cause" label={t.cause} error={err("cause")}>
            {(p) => (
              <Select {...p} name="cause" defaultValue={values.cause ?? ""}>
                <option value="">{t.generalFund}</option>
                {config.causes.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : (
          <input type="hidden" name="cause" value="" />
        )}
        {config.feeBp > 0 ? (
          <Choice
            id="donate-coverFee"
            name="coverFee"
            label={fill(t.coverFee, { percent: String(config.feeBp / 100) })}
            checked={coverFee}
            onChange={(e) => setCoverFee(e.target.checked)}
          />
        ) : null}
      </div>

      <ChoiceGroup legend={t.detailsLegend} id="donate-details">
        <div className="grid gap-6">
          <FormField
            id="donate-name"
            label={t.name}
            hint={t.nameHint}
            required
            requiredLabel={t.required}
            error={err("name")}
          >
            {(p) => (
              <Input {...p} name="name" autoComplete="name" defaultValue={values.name} maxLength={120} />
            )}
          </FormField>
          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              id="donate-email"
              label={t.email}
              hint={t.emailHint}
              required
              requiredLabel={t.required}
              error={err("email")}
            >
              {(p) => (
                <Input
                  {...p}
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={values.email}
                  maxLength={200}
                />
              )}
            </FormField>
            <FormField
              id="donate-phone"
              label={t.phone}
              hint={t.phoneHint}
              required
              requiredLabel={t.required}
              error={err("phone")}
            >
              {(p) => (
                <Input
                  {...p}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  defaultValue={values.phone}
                  maxLength={16}
                />
              )}
            </FormField>
          </div>
        </div>
      </ChoiceGroup>

      <ChoiceGroup legend={t.receiptLegend} id="donate-receipt">
        <Choice
          id="donate-wants80g"
          name="wants80g"
          label={t.wants80g}
          hint={t.wants80gHint}
          checked={wants80g}
          onChange={(e) => setWants80g(e.target.checked)}
        />
        {wants80g || panNeeded ? (
          <div className="mt-2 grid gap-6">
            <FormField
              id="donate-pan"
              label={t.pan}
              hint={wants80g ? t.panHint : `${fill(t.panRequiredHint, limits)} ${t.panHint}`}
              required
              requiredLabel={t.required}
              error={err("pan")}
            >
              {(p) => (
                <Input
                  {...p}
                  name="pan"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  defaultValue={values.pan}
                  maxLength={10}
                  className="uppercase"
                />
              )}
            </FormField>
          </div>
        ) : null}
        {wants80g ? (
          <div className="mt-2 grid gap-6">
            <FormField
              id="donate-line1"
              label={t.line1}
              required
              requiredLabel={t.required}
              error={err("line1")}
            >
              {(p) => (
                <Input
                  {...p}
                  name="line1"
                  autoComplete="address-line1"
                  defaultValue={values.line1}
                  maxLength={200}
                />
              )}
            </FormField>
            <FormField id="donate-line2" label={t.line2} requiredLabel={t.optional}>
              {(p) => (
                <Input
                  {...p}
                  name="line2"
                  autoComplete="address-line2"
                  defaultValue={values.line2}
                  maxLength={200}
                />
              )}
            </FormField>
            <div className="grid gap-6 md:grid-cols-3">
              <FormField id="donate-city" label={t.city} requiredLabel={t.optional} error={err("city")}>
                {(p) => (
                  <Input
                    {...p}
                    name="city"
                    autoComplete="address-level2"
                    defaultValue={values.city}
                    maxLength={80}
                  />
                )}
              </FormField>
              <FormField id="donate-state" label={t.state} requiredLabel={t.optional} error={err("state")}>
                {(p) => (
                  <Input
                    {...p}
                    name="state"
                    autoComplete="address-level1"
                    defaultValue={values.state}
                    maxLength={80}
                  />
                )}
              </FormField>
              <FormField
                id="donate-pincode"
                label={t.pincode}
                required
                requiredLabel={t.required}
                error={err("pincode")}
              >
                {(p) => (
                  <Input
                    {...p}
                    name="pincode"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    defaultValue={values.pincode}
                    maxLength={6}
                  />
                )}
              </FormField>
            </div>
          </div>
        ) : null}
      </ChoiceGroup>

      <div className="grid gap-4">
        <Choice
          id="donate-anonymous"
          name="anonymous"
          label={t.anonymous}
          hint={t.anonymousHint}
          defaultChecked={values.anonymous === "on"}
        />
        <Choice
          id="donate-citizen"
          name="citizen"
          label={t.citizen}
          hint={t.citizenHint}
          required
          defaultChecked={values.citizen === "on"}
          error={err("citizen")}
        />
      </div>

      <div>
        <p className="mb-2 font-semibold text-fg-strong">{t.captcha}</p>
        <div ref={box} className="min-h-16" />
      </div>

      <div className="grid gap-3">
        {total > 0 ? (
          <p className="text-lg font-semibold text-fg-strong" aria-live="polite">
            {fill(t.total, { amount: money(total) })}
          </p>
        ) : null}
        <div>
          <Button type="submit" size="lg" disabled={busy} aria-disabled={busy}>
            {busy ? t.processing : total > 0 ? fill(t.pay, { amount: money(total) }) : t.payNoAmount}
          </Button>
        </div>
      </div>
    </form>
  );
}
