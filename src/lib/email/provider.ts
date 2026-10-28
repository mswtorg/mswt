export type EmailMessage = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  /** Where a reply goes (e.g. the visitor, on a contact alert). */
  replyTo?: { email: string; name?: string };
  attachments?: { filename: string; content: Uint8Array }[];
  /** Groups messages in the provider's logs, e.g. "receipt". */
  tag?: string;
};

/** Outbound email (CLAUDE.md: behind an adapter; Brevo now, Resend/MSG91 possible). */
export interface EmailProvider {
  readonly name: "brevo" | "memory";
  send(message: EmailMessage): Promise<{ messageId: string }>;
}
