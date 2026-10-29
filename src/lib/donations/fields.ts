// Donate form fields and error codes, without zod, so the form can import them cheaply.
export const DONATE_FIELDS = [
  "amount",
  "cause",
  "name",
  "email",
  "phone",
  "pan",
  "line1",
  "city",
  "state",
  "pincode",
  "citizen",
] as const;
export type DonateField = (typeof DONATE_FIELDS)[number];
export type DonateErrorCode =
  DonateField | "amountMin" | "amountMax" | "panRequired" | "captcha" | "rate" | "server" | "closed";
