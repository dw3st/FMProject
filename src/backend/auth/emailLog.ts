import type { OutgoingEmail } from "@/backend/auth/sendEmail";

const DATA_DIR = new URL("../../Data", import.meta.url).pathname;
const LOG_PATH = `${DATA_DIR}/email-log.json`;

interface LoggedEmail extends OutgoingEmail {
  timestamp: string;
}

/**
 * Dev fallback "delivery": prints the email to the console and appends it to
 * Data/email-log.json. Used when no SMTP2GO_API_KEY is configured so local
 * development can read login codes without sending real mail.
 */
export async function logEmail(msg: OutgoingEmail): Promise<void> {
  const entry: LoggedEmail = { timestamp: new Date().toISOString(), ...msg };

  console.log(`[email:dev] → ${msg.to} | ${msg.subject}`);
  console.log(msg.text);

  let existing: LoggedEmail[] = [];
  const file = Bun.file(LOG_PATH);
  if (await file.exists()) {
    try {
      existing = (await file.json()) as LoggedEmail[];
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }
  existing.push(entry);
  await Bun.write(LOG_PATH, JSON.stringify(existing, null, 2));
}
