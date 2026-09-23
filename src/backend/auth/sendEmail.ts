import { logEmail } from "@/backend/auth/emailLog";

export interface OutgoingEmail {
  to:      string;
  subject: string;
  text:    string;
  html:    string;
}

const SMTP2GO_ENDPOINT = "https://api.smtp2go.com/v3/email/send";

/**
 * Sends an email. In production (SMTP2GO_API_KEY set) it delivers via the
 * SMTP2GO HTTP send API. With no API key configured it falls back to the dev
 * log (console + Data/email-log.json) so local development needs no credentials.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const apiKey = process.env.SMTP2GO_API_KEY?.trim();

  if (!apiKey) {
    await logEmail(msg);
    return;
  }

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error(
      "SMTP2GO_API_KEY is set but EMAIL_FROM is missing — set EMAIL_FROM to a verified SMTP2GO sender address",
    );
  }
  const fromName = process.env.EMAIL_FROM_NAME?.trim();
  const sender = fromName ? `${fromName} <${from}>` : from;

  const res = await fetch(SMTP2GO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": apiKey,
    },
    body: JSON.stringify({
      sender,
      to:        [msg.to],
      subject:   msg.subject,
      text_body: msg.text,
      html_body: msg.html,
    }),
  });

  const json = (await res.json().catch(() => null)) as
    | { data?: { succeeded?: number; failed?: number; failures?: unknown } }
    | null;

  if (!res.ok || !json?.data || (json.data.succeeded ?? 0) < 1) {
    const detail = json?.data?.failures ?? json ?? `HTTP ${res.status}`;
    throw new Error(`SMTP2GO send failed: ${JSON.stringify(detail)}`);
  }
}
