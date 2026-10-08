import type { SetPieceTakersSave } from "@/types/tacticsTypes";

const DUTIES = ["corners", "freeKicks", "penalties"] as const;

/** Maximum takers per duty, in order of preference (#116). */
export const MAX_TAKERS_PER_DUTY = 3;

/**
 * Validates a `TacticsSave.setPieceTakers` body (`set-pieces-play.md` §4): an object whose
 * `corners` / `freeKicks` / `penalties` are lists of up to 3 player ids in order of preference;
 * `null`, an empty list or an absent duty = automatic, `""` entries are dropped. A repeated player
 * in the same duty is invalid. Returns the cleaned value (only the set duties), or `null` when the
 * shape is invalid.
 */
export function parseSetPieceTakers(raw: unknown): SetPieceTakersSave | null {
  if (raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: SetPieceTakersSave = {};
  for (const key of Object.keys(src)) if (!(DUTIES as readonly string[]).includes(key)) return null;
  for (const duty of DUTIES) {
    const v = src[duty];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v) || v.length > MAX_TAKERS_PER_DUTY) return null;
    const ids: string[] = [];
    for (const id of v) {
      if (typeof id !== "string" || id.length > 100) return null;
      if (id === "") continue;
      if (ids.includes(id)) return null;
      ids.push(id);
    }
    if (ids.length > 0) out[duty] = ids;
  }
  return out;
}
