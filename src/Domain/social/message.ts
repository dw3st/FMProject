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

export interface RateRule {
  windowMs: number;
  max: number;
}

const MESSAGE_RATE: RateRule = { windowMs: SOCIAL.RATE_WINDOW_MS, max: SOCIAL.RATE_MAX };

/** Sliding window (messages by default): the stamps kept for the user and whether this attempt is allowed. */
export function rateLimit(
  stamps: readonly number[],
  now: number,
  rule: RateRule = MESSAGE_RATE,
): { allowed: boolean; stamps: number[] } {
  const recent = stamps.filter((t) => now - t < rule.windowMs);
  if (recent.length >= rule.max) return { allowed: false, stamps: recent };
  return { allowed: true, stamps: [...recent, now] };
}

/** Messages created before this instant are deleted. */
export function messageCutoff(now: number): number {
  return now - SOCIAL.HISTORY_DAYS * DAY_MS;
}
