"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Checks fields as people fill the form: a field is checked when they leave it, then on every
 * change, so its message clears as soon as it's right. `check` validates the whole form with the
 * server's own rules (load them with a dynamic import so they stay out of the first page load);
 * the server still checks everything on submit. `fieldOf` maps an input name to its field
 * ("custom" → "amount"); return undefined for inputs that aren't checked live.
 *
 * Returns the error to show for a field: the live result once the field was touched, else the
 * server's. A new server answer (`serverState`) starts over.
 */
export function useLiveErrors<F extends string, C extends string>({
  form,
  check,
  fieldOf,
  serverErrors,
  serverState,
}: {
  form: RefObject<HTMLFormElement | null>;
  check: (data: FormData) => Promise<Partial<Record<F, C>>>;
  fieldOf: (name: string) => F | undefined;
  serverErrors: Partial<Record<F, C>>;
  serverState: unknown;
}): (field: F) => C | undefined {
  const [live, setLive] = useState<{ touched: Set<F>; errors: Partial<Record<F, C>> }>({
    touched: new Set(),
    errors: {},
  });
  const touched = useRef(new Set<F>());
  const run = useRef(0);
  const checkRef = useRef(check);
  const fieldOfRef = useRef(fieldOf);
  useEffect(() => {
    checkRef.current = check;
    fieldOfRef.current = fieldOf;
  });

  // A new server answer wins: forget what was checked live.
  useEffect(() => {
    touched.current = new Set();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the server answers
    setLive({ touched: new Set(), errors: {} });
  }, [serverState]);

  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const validate = async () => {
      const id = ++run.current;
      const errors = await checkRef.current(new FormData(el));
      if (id === run.current) setLive({ touched: new Set(touched.current), errors });
    };
    const onLeave = (e: Event) => {
      const field = nameOf(e.target, fieldOfRef.current);
      if (!field) return;
      touched.current.add(field);
      void validate();
    };
    const onEdit = (e: Event) => {
      const field = nameOf(e.target, fieldOfRef.current);
      if (!field) return;
      // Ticks and choices count as finished at once; typed text waits until it was left once.
      const target = e.target as HTMLInputElement;
      if (target.type === "checkbox" || target.type === "radio" || target.tagName === "SELECT")
        touched.current.add(field);
      if (touched.current.has(field)) void validate();
    };
    el.addEventListener("focusout", onLeave);
    el.addEventListener("input", onEdit);
    el.addEventListener("change", onEdit);
    return () => {
      el.removeEventListener("focusout", onLeave);
      el.removeEventListener("input", onEdit);
      el.removeEventListener("change", onEdit);
    };
  }, [form]);

  return (field) => (live.touched.has(field) ? live.errors[field] : serverErrors[field]);
}

function nameOf<F>(target: EventTarget | null, fieldOf: (name: string) => F | undefined): F | undefined {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLSelectElement)
  )
    return undefined;
  return target.name ? fieldOf(target.name) : undefined;
}
