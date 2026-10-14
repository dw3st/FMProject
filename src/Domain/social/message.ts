import { DAY_MS, SOCIAL } from "@/Domain/social/socialConfig";

/**
 * Plain text, 1–500 characters (code points): line breaks normalized to `\n`, other control characters dropped,
 * trimmed. HTML is kept as text (the screens never render it as HTML). Null when invalid.
 */
export function cleanMessageBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();
  if (body.length === 0) return null;
  if ([...body].length > SOCIAL.MESSAGE_MAX) return null;
  return body;
}

/** Sliding window: the send times kept for the user and whether this send is allowed. */
export function rateLimit(stamps: readonly number[], now: number): { allowed: boolean; stamps: number[] } {
  const recent = stamps.filter((t) => now - t < SOCIAL.RATE_WINDOW_MS);
  if (recent.length >= SOCIAL.RATE_MAX) return { allowed: false, stamps: recent };
  return { allowed: true, stamps: [...recent, now] };
}

/** Messages created before this instant are deleted. */
export function messageCutoff(now: number): number {
  return now - SOCIAL.HISTORY_DAYS * DAY_MS;
}
