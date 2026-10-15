import { FRIEND_CODE_ALPHABET } from "@/Domain/social/nickname";

export const WORLD_CODE_LENGTH = 10;

/** A world invite code; `pick(n)` returns an integer in [0, n) (crypto `randomInt` on the server). */
export function generateWorldCode(pick: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < WORLD_CODE_LENGTH; i++) s += FRIEND_CODE_ALPHABET[pick(FRIEND_CODE_ALPHABET.length) % FRIEND_CODE_ALPHABET.length];
  return s;
}

/** Upper case without spaces and dashes; null unless it is 10 characters of the alphabet. */
export function normalizeWorldCode(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== WORLD_CODE_LENGTH) return null;
  for (const c of s) if (!FRIEND_CODE_ALPHABET.includes(c)) return null;
  return s;
}
