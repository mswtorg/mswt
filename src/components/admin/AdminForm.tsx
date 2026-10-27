"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { ErrorSummary, FieldError, Hint, fieldControlProps } from "@/components/ui/Form";
import { BlocksEditor } from "./BlocksEditor";
import { PhotoListField } from "./PhotoListField";
import { compactControl } from "./ui";
import type { FieldSpec, FormSectionSpec, FormState } from "./form-state";

const fieldId = (form: string, name: string) => `${form}-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-md bg-action-primary-bg px-4 text-sm font-semibold text-action-primary-fg hover:bg-action-primary-bg-hover disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-fg-disabled";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-md border border-border-input bg-bg-canvas px-4 text-sm font-semibold text-fg-default hover:bg-bg-subtle";

function Field({ f, formId, error, value }: { f: FieldSpec; formId: string; error?: string; value: string }) {
  const id = fieldId(formId, f.name);
  const full = f.span === "full" || f.type === "textarea" || f.type === "blocks" || f.type === "photos";
  if (f.type === "checkbox")
    return (
      <div className={cn("grid gap-1", full && "sm:col-span-2")}>
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name={f.name}
            defaultChecked={value === "on" || value === "true"}
            {...fieldControlProps(id, { hint: f.hint, error })}
            className="mt-0.5 size-5 flex-none accent-action-primary-bg"
          />
          <div className="grid gap-0.5">
            <label htmlFor={id} className="text-sm font-medium text-fg-strong">
              {f.label}
            </label>
            {f.hint ? <Hint id={`${id}-hint`}>{f.hint}</Hint> : null}
          </div>
        </div>
      </div>
    );
  const p = fieldControlProps(id, { hint: f.hint, error, required: f.required });
  const control = cn(
    compactControl,
    "aria-invalid:border-2 aria-invalid:border-status-error-fg-on-canvas",
    f.readOnly && "bg-bg-muted",
  );
  return (
    <div className={cn("grid content-start gap-1.5", full && "sm:col-span-2")}>
      <label htmlFor={id} className="text-sm font-medium text-fg-strong">
        {f.label}
        {f.required ? <span className="ml-1 text-xs font-normal text-fg-muted">(required)</span> : null}
      </label>
      {f.type === "photo" || f.type === "photos" ? (
        <PhotoListField
          label={f.label}
          id={id}
          name={f.name}
          defaultValue={value}
          library={f.photos?.library ?? []}
          single={f.type === "photo"}
          max={f.photos?.max}
          describedBy={error ? `${id}-error` : f.hint ? `${id}-hint` : undefined}
        />
      ) : f.type === "blocks" ? (
        <BlocksEditor
          id={id}
          name={f.name}
          defaultValue={value}
          lang={f.lang}
          error={error}
          describedBy={error ? `${id}-error` : f.hint ? `${id}-hint` : undefined}
          media={f.editor?.media ?? {}}
          library={f.editor?.library ?? []}
        />
      ) : f.type === "textarea" ? (
        <textarea
          {...p}
          name={f.name}
          defaultValue={value}
          rows={f.rows ?? 3}
          lang={f.lang}
          maxLength={f.maxLength}
          readOnly={f.readOnly}
          className={control}
        />
      ) : f.type === "select" ? (
        <select {...p} name={f.name} defaultValue={value} className={control}>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...p}
          name={f.name}
          type={f.type ?? "text"}
          defaultValue={f.type === "password" ? undefined : value}
          autoComplete={f.autoComplete}
          inputMode={f.inputMode}
          lang={f.lang}
          maxLength={f.maxLength}
          readOnly={f.readOnly}
          className={control}
        />
      )}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : f.hint ? (
        <Hint id={`${id}-hint`}>{f.hint}</Hint>
      ) : null}
    </div>
  );
}

/**
 * Admin form posted to a Server Action that validates on the server. Fields sit in a two-column
 * grid, optionally grouped into settings-style sections. Errors appear next to each field and in a
 * focused summary (A11Y-05); success is announced. With `sticky`, the actions stay visible at the
 * bottom and show when there are unsaved changes.
 */
export function AdminForm({
  id,
  action,
  fields,
  sections,
  submitLabel,
  pendingLabel = "Saving…",
  hidden,
  confirm,
  sticky,
  variant = "primary",
  columns = 2,
  children,
}: {
  id: string;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  fields?: FieldSpec[];
  sections?: FormSectionSpec[];
  submitLabel: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  /** Ask before submitting (destructive actions). */
  confirm?: string;
  /** Sticky Save / Discard bar (long settings forms). */
  sticky?: boolean;
  variant?: "primary" | "secondary" | "danger";
  /** 1 for narrow forms such as the sign-in screens. */
  columns?: 1 | 2;
  children?: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as FormState);
  const [dirty, setDirty] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  const errors = state.errors ?? {};
  const values = state.values ?? {};

  useEffect(() => {
    if (state.status === "error") document.getElementById(`${id}-summary`)?.focus();
    if (state.status === "saved") status.current?.focus();
  }, [state, id]);

  const summary = Object.entries(errors).map(([name, message]) => ({
    fieldId: name === "form" ? `${id}-submit` : fieldId(id, name),
    message,
  }));
  const grid = (list: FieldSpec[]) =>
    list.length ? (
      <div className={cn("grid gap-x-4 gap-y-5", columns === 2 && "sm:grid-cols-2")}>
        {list.map((f) => (
          <Field
            key={f.name}
            f={f}
            formId={id}
            error={errors[f.name]}
            value={values[f.name] ?? f.defaultValue ?? ""}
          />
        ))}
      </div>
    ) : null;

  const buttons = (
    <div className="flex items-center gap-2">
      {sticky ? (
        <button type="reset" className={secondaryButton} onClick={() => setDirty(false)} disabled={!dirty}>
          Discard
        </button>
      ) : null}
      <button
        id={`${id}-submit`}
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className={
          variant === "secondary"
            ? secondaryButton
            : variant === "danger"
              ? cn(primaryButton, "bg-status-error-fg-on-canvas hover:bg-status-error-fg-on-canvas")
              : primaryButton
        }
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );

  return (
    <form
      action={run}
      noValidate
      className="grid gap-5"
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
        else setDirty(false);
      }}
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      {summary.length > 0 ? (
        <ErrorSummary
          id={`${id}-summary`}
          title={state.message ?? "Please fix the following:"}
          errors={summary}
        />
      ) : null}
      <div ref={status} tabIndex={-1} className="empty:hidden">
        {state.status === "saved" ? (
          <Alert tone="success" live="polite">
            <p className="break-words">{state.message ?? "Saved."}</p>
          </Alert>
        ) : null}
      </div>
      {sections ? (
        <div className="rounded-lg border border-border-decorative bg-bg-canvas">
          {sections.map((s, i) => (
            <section
              key={s.title}
              aria-labelledby={`${id}-s${i}`}
              className="grid gap-4 border-b border-border-decorative p-5 last:border-b-0 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8 md:p-6"
            >
              <div className="grid content-start gap-1">
                <h2 id={`${id}-s${i}`} className="text-base font-semibold text-fg-strong">
                  {s.title}
                </h2>
                {s.description ? <p className="m-0 text-sm text-fg-muted">{s.description}</p> : null}
              </div>
              {grid(s.fields)}
            </section>
          ))}
        </div>
      ) : (
        grid(fields ?? [])
      )}
      {children}
      {sticky ? (
        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-4 rounded-lg border border-border-decorative bg-bg-canvas px-4 py-3 shadow-md">
          <p className="m-0 text-sm text-fg-muted" aria-live="polite">
            {dirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          {buttons}
        </div>
      ) : (
        <div>{buttons}</div>
      )}
    </form>
  );
}
