// Transparency documents: yearly reports (with a financial year) and the Trust's registration
// certificates (no financial year), shown in their own section in this order.

export const REPORT_KINDS = ["annual_report", "audited_accounts", "other"] as const;
export const CERTIFICATE_KINDS = [
  "cert_12a",
  "cert_80g",
  "cert_registration",
  "cert_pan",
  "cert_other",
] as const;
export const DOCUMENT_KINDS = [...REPORT_KINDS, ...CERTIFICATE_KINDS] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

export const isCertificate = (kind: string): kind is CertificateKind =>
  (CERTIFICATE_KINDS as readonly string[]).includes(kind);
