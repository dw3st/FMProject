import { DAY_MS, SOCIAL } from "@/Domain/social/socialConfig";

const NICKNAME_RE = /^[A-Za-z0-9_.-]+$/;
/** Whole names that are not allowed. */
const RESERVED_EXACT = ["mod", "root", "system", "sistema", "support", "suporte", "staff", "null", "undefined"];
/** Names that may not appear anywhere inside a nickname. */
const RESERVED_PARTS = ["admin", "fmproject", "westlab", "moderator", "moderador"];

export type NicknameError = "length" | "chars" | "reserved";

export function normalizeNickname(raw: string): string {
  return raw.trim();
}

/** Uniqueness key: nicknames are unique ignoring case. */
export function nicknameKey(raw: string): string {
  return normalizeNickname(raw).toLowerCase();
}

export function validateNickname(raw: string): NicknameError | null {
  const n = normalizeNickname(raw);
  if (n.length < SOCIAL.NICKNAME_MIN || n.length > SOCIAL.NICKNAME_MAX) return "length";
  if (!NICKNAME_RE.test(n)) return "chars";
  const k = n.toLowerCase();
  if (RESERVED_EXACT.includes(k) || RESERVED_PARTS.some((p) => k.includes(p))) return "reserved";
  return null;
}

/** When the nickname can be changed again (ms), or null when it was never changed. */
export function nicknameChangeableAt(changedAt: number | null): number | null {
  return changedAt === null ? null : changedAt + SOCIAL.NICKNAME_CHANGE_DAYS * DAY_MS;
}

/** Base32 with no 0, 1, I or O (easy to read aloud and type). */
export const FRIEND_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** `FM-XXXX-XXXX`; `pick(n)` returns an integer in [0, n) (crypto `randomInt` on the server). */
export function generateFriendCode(pick: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += FRIEND_CODE_ALPHABET[pick(FRIEND_CODE_ALPHABET.length) % FRIEND_CODE_ALPHABET.length];
  return `FM-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Canonical code from what a person typed (any case, spaces or dashes, with or without "FM"), or null. */
export function normalizeFriendCode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  const body = compact.length === 10 && compact.startsWith("FM") ? compact.slice(2) : compact;
  if (body.length !== 8) return null;
  for (const c of body) if (!FRIEND_CODE_ALPHABET.includes(c)) return null;
  return `FM-${body.slice(0, 4)}-${body.slice(4)}`;
}
