import type { ImageView } from "@/lib/media/view";
import type { LibraryItem } from "./BlocksEditor";

/** What every admin Server Action returns to its form. */
export type FormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  /** Field name → message. */
  errors?: Record<string, string>;
  /** Submitted values, so a failed submit keeps what was typed (no re-entry, 3.3.7). */
  values?: Record<string, string>;
};

export const IDLE: FormState = { status: "idle" };

export type FieldSpec = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "date"
    | "datetime-local"
    | "number"
    | "textarea"
    | "select"
    | "checkbox"
    | "url"
    | "tel"
    /** Content text with toolbar and preview (BlocksEditor); needs `editor`. */
    | "blocks"
    /** One library photo (cover) or an ordered list (slider/album); needs `photos`. */
    | "photo"
    | "photos";
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email" | "tel" | "url";
  lang?: string;
  rows?: number;
  readOnly?: boolean;
  maxLength?: number;
  /** "full" spans both columns of the form grid (textareas do by default). */
  span?: "full";
  /** For type "blocks": photos for the preview and the "Insert image" picker. */
  editor?: { media: Record<string, ImageView>; library: LibraryItem[] };
  /** For type "photo"/"photos": the library to choose from, and the most photos allowed. */
  photos?: { library: LibraryItem[]; max?: number };
};

/** Everything a form posted, as strings (checkboxes "on"). */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

/** zod issues → { field: message } using the first issue per field ("a.b" paths joined). */
export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "form";
    errors[key] ??= i.message;
  }
  return errors;
}

/** A titled block of fields (settings-style: title and description on the left). */
export type FormSectionSpec = { title: string; description?: string; fields: FieldSpec[] };
