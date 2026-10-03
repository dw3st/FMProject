import type { SetPieceTakersSave } from "@/types/tacticsTypes";

const DUTIES = ["corners", "freeKicks", "penalties"] as const;

/**
 * Validates a `TacticsSave.setPieceTakers` body (`set-pieces-play.md` §4): an object whose
 * `corners` / `freeKicks` / `penalties` are player ids; `null`, `""` or absent = automatic.
 * Returns the cleaned value (only the set duties), or `null` when the shape is invalid.
 */
export function parseSetPieceTakers(raw: unknown): SetPieceTakersSave | null {
  if (raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: SetPieceTakersSave = {};
  for (const key of Object.keys(src)) if (!(DUTIES as readonly string[]).includes(key)) return null;
  for (const duty of DUTIES) {
    const v = src[duty];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || v.length > 100) return null;
    out[duty] = v;
  }
  return out;
}
