"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ErrorSummary, FormField, Input, Select, Textarea } from "@/components/ui/Form";
import { useLiveErrors } from "@/components/forms/useLiveErrors";
import { useTurnstile } from "@/components/forms/useTurnstile";
import { sendContactMessage, type ContactState } from "./actions";

export type ContactStrings = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  select: string;
  subjects: Record<"donation" | "help" | "volunteer" | "other", string>;
  required: string;
  optional: string;
  send: string;
  sending: string;
  sent: string;
  errorSummary: string;
  captcha: string;
  errors: Record<"name" | "email" | "phone" | "subject" | "message" | "captcha" | "rate" | "server", string>;
};

const FIELDS = ["name", "email", "phone", "subject", "message"] as const;
type Field = (typeof FIELDS)[number];

export function ContactForm({
  locale,
  siteKey,
  t,
}: {
  locale: string;
  siteKey: string | null;
  t: ContactStrings;
}) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, {
    status: "idle",
  });
  const summary = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const resetTurnstile = useTurnstile(form, box, siteKey, locale);

  useEffect(() => {
    if (state.status === "error") {
      document.getElementById("error-summary")?.focus();
      resetTurnstile();
    }
    if (state.status === "sent") {
      form.current?.reset();
      status.current?.focus();
    }
  }, [state, resetTurnstile]);

  const errors = state.status === "error" ? state.errors : {};
  const values = state.status === "error" ? state.values : {};
  const shown = useLiveErrors<Field, Field>({
    form,
    serverErrors: errors as Partial<Record<Field, Field>>,
    serverState: state,
    fieldOf: (name) => ((FIELDS as readonly string[]).includes(name) ? (name as Field) : undefined),
    // The server's own rules, loaded on first use.
    check: async (data) => {
      const { ContactSchema } = await import("@/lib/contact/schema");
      const parsed = ContactSchema.safeParse(
        Object.fromEntries(FIELDS.map((k) => [k, String(data.get(k) ?? "")])),
      );
      const out: Partial<Record<Field, Field>> = {};
      for (const issue of parsed.error?.issues ?? []) out[issue.path[0] as Field] ??= issue.path[0] as Field;
      return out;
    },
  });
  const fieldErrors = FIELDS.filter((f) => errors[f] && shown(f));
  const summaryItems = [
    ...fieldErrors.map((f) => ({ fieldId: `contact-${f}`, message: t.errors[f] })),
    ...(errors.form
      ? [{ fieldId: "contact-name", message: t.errors[errors.form as keyof ContactStrings["errors"]] }]
      : []),
  ];

  return (
    <form ref={form} action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div ref={summary} className="empty:hidden">
        {summaryItems.length > 0 ? <ErrorSummary title={t.errorSummary} errors={summaryItems} /> : null}
      </div>
      <div ref={status} tabIndex={-1} className="empty:hidden">
        {state.status === "sent" ? (
          <Alert tone="success" live="polite">
            <p>{t.sent}</p>
          </Alert>
        ) : null}
      </div>
      <FormField
        id="contact-name"
        label={t.name}
        requiredLabel={t.required}
        required
        error={shown("name") && t.errors.name}
      >
        {(p) => <Input {...p} name="name" autoComplete="name" defaultValue={values.name} maxLength={120} />}
      </FormField>
      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          id="contact-email"
          label={t.email}
          requiredLabel={t.required}
          required
          error={shown("email") && t.errors.email}
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
          id="contact-phone"
          label={t.phone}
          requiredLabel={t.optional}
          error={shown("phone") && t.errors.phone}
        >
          {(p) => (
            <Input
              {...p}
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              defaultValue={values.phone}
              maxLength={20}
            />
          )}
        </FormField>
      </div>
      <FormField
        id="contact-subject"
        label={t.subject}
        requiredLabel={t.required}
        required
        error={shown("subject") && t.errors.subject}
      >
        {(p) => (
          <Select {...p} name="subject" defaultValue={values.subject ?? ""}>
            <option value="">{t.select}</option>
            {(Object.keys(t.subjects) as (keyof ContactStrings["subjects"])[]).map((k) => (
              <option key={k} value={k}>
                {t.subjects[k]}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField
        id="contact-message"
        label={t.message}
        requiredLabel={t.required}
        required
        error={shown("message") && t.errors.message}
      >
        {(p) => <Textarea {...p} name="message" defaultValue={values.message} maxLength={5000} rows={6} />}
      </FormField>
      <div>
        <p className="mb-2 font-semibold text-fg-strong">{t.captcha}</p>
        <div ref={box} className="min-h-16" />
      </div>
      <div>
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? t.sending : t.send}
        </Button>
      </div>
    </form>
  );
}
