import { logEmail } from "@/backend/auth/emailLog";

export interface OutgoingEmail {
  to:      string;
  subject: string;
  text:    string;
  html:    string;
}

const RESEND_ENDPOINT  = "https://api.resend.com/emails";
const SMTP2GO_ENDPOINT = "https://api.smtp2go.com/v3/email/send";

/**
 * Sends an email through the first configured provider:
 *   1. Resend  (RESEND_API_KEY)  — https://resend.com
 *   2. SMTP2GO (SMTP2GO_API_KEY) — https://www.smtp2go.com
 * With no API key configured it falls back to the dev log (console +
 * Data/email-log.json) so local development needs no credentials.
 * Both providers send from EMAIL_FROM (a verified sender on that provider),
 * optionally with the EMAIL_FROM_NAME display name.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const resendKey  = process.env.RESEND_API_KEY?.trim();
  const smtp2goKey = process.env.SMTP2GO_API_KEY?.trim();

  if (!resendKey && !smtp2goKey) {
    await logEmail(msg);
    return;
  }

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error(
      "An email API key is set but EMAIL_FROM is missing — set EMAIL_FROM to a verified sender address",
    );
  }
  const fromName = process.env.EMAIL_FROM_NAME?.trim();
  const sender = fromName ? `${fromName} <${from}>` : from;

  if (resendKey) await sendViaResend(resendKey, sender, msg);
  else await sendViaSmtp2go(smtp2goKey!, sender, msg);
}

async function sendViaResend(apiKey: string, sender: string, msg: OutgoingEmail): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    sender,
      to:      [msg.to],
      subject: msg.subject,
      text:    msg.text,
      html:    msg.html,
    }),
  });

  const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;

  if (!res.ok || !json?.id) {
    const detail = json?.message ?? json ?? `HTTP ${res.status}`;
    throw new Error(`Resend send failed: ${JSON.stringify(detail)}`);
  }
}

async function sendViaSmtp2go(apiKey: string, sender: string, msg: OutgoingEmail): Promise<void> {
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
