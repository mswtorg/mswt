import type { Locale } from "@/i18n/routing";

/** Dates are always shown in India time with Latin digits (I18N-04). */
export function formatDate(locale: Locale, date: Date, withTime = false): string {
  return new Intl.DateTimeFormat(`${locale}-IN`, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
    numberingSystem: "latn",
  }).format(date);
}

/** Machine-readable value for <time dateTime>, with the +05:30 offset. */
export function isoIst(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
}

/** A calendar day ("2026-03-14", a `date` column) → midnight of that day in India, for formatDate. */
export const istDay = (day: string): Date => new Date(`${day}T00:00:00+05:30`);

/** "12 Dec" in the language (India time): a compact date for card badges. */
export function formatShortDate(locale: Locale, date: Date): string {
  return new Intl.DateTimeFormat(`${locale}-IN`, {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
