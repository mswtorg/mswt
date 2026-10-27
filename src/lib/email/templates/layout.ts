import tokens from "../../../../tokens/design-tokens.json";
import { appOrigin, siteUrl } from "@/lib/seo/site";

// Shared frame for every email (Step 9): logo header, green rule, body, footer. Inline styles from
// the design tokens (email clients drop <style>); every email also has a plain-text version.

export const C = {
  text: tokens.color.neutral["900"].$value,
  muted: tokens.color.neutral["700"].$value,
  rule: tokens.color.brand.green.$value,
  link: tokens.color.primary["700"].$value,
  border: tokens.color.neutral["200"].$value,
  quote: tokens.color.neutral["50"].$value,
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const p = (s: string) => `<p style="margin:0 0 16px">${esc(s)}</p>`;

export const link = (href: string, label: string) =>
  `<a href="${esc(href)}" style="color:${C.link}">${esc(label)}</a>`;

/** Rows of label/value pairs (admin alerts, summaries). Values are plain text. */
export function table(rows: [string, string][]): string {
  const cell = `padding:6px 12px 6px 0;border-bottom:1px solid ${C.border};vertical-align:top`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;width:100%">
${rows.map(([k, v]) => `<tr><td style="${cell};color:${C.muted};white-space:nowrap">${esc(k)}</td><td style="${cell}">${esc(v)}</td></tr>`).join("\n")}
</table>`;
}

/** Someone's own words (a contact message), shown as plain text: links in it are never made clickable. */
export const quote = (s: string) =>
  `<div style="margin:0 0 20px;padding:12px 16px;background:${C.quote};border-left:4px solid ${C.border};white-space:pre-wrap">${esc(s)}</div>`;

export function emailLayout(input: { lang: string; heading: string; body: string; footer?: string }): string {
  const footer = input.footer ?? `${input.heading} · ${siteUrl().host}`;
  return `<!doctype html><html lang="${input.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:1.6;color:${C.text}">
<div style="max-width:560px;margin:0 auto">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
<td style="padding-right:16px"><img src="${appOrigin()}/brand/mswt-logo-512.png" width="56" height="56" alt="MS Welfare Trust" style="display:block;border:0"></td>
<td style="font-weight:600;color:${C.text}">${esc(input.heading)}</td>
</tr></table>
<div style="border-top:4px solid ${C.rule};padding-top:20px">
${input.body}
</div>
<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid ${C.border};font-size:13px;color:${C.muted}">${esc(footer)}</p>
</div></body></html>`;
}
