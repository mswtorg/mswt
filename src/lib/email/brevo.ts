import type { EmailMessage, EmailProvider } from "./provider";

export class BrevoProvider implements EmailProvider {
  readonly name = "brevo" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: { email: string; name: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(m: EmailMessage) {
    const res = await this.fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: this.from,
        to: [m.to],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(m.tag ? { tags: [m.tag] } : {}),
        ...(m.attachments?.length
          ? {
              attachment: m.attachments.map((a) => ({
                name: a.filename,
                content: Buffer.from(a.content).toString("base64"),
              })),
            }
          : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as { messageId?: string; message?: string } | null;
    if (!res.ok || !body?.messageId)
      throw new Error(`Brevo send failed (${res.status}): ${body?.message ?? ""}`);
    return { messageId: body.messageId };
  }
}
