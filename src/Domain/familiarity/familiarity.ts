/**
 * Pure style-familiarity model (`.claude/rules/game/style-training.md`). No I/O.
 *
 * Only the human club stores familiarity (`Squad.styleFamiliarity`); AI clubs follow rules
 * (`AI_OWN_STYLE` in their own style, `AI_OTHER` elsewhere), in the spirit of
 * `.claude/rules/AI-clubs/finance.md`.
 */
import { FAMILIARITY } from "@/Domain/familiarity/familiarityConfig";
import { FAMILIARITY_KEYS, type FamiliarityKey, type FamiliarityLevels } from "@/types/familiarityTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Linear: 0 at 50, +1 at 100, −1 at 0 (clamped). Undefined = neutral. */
export function familiarityFactor(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0;
  return clamp((v - FAMILIARITY.NEUTRAL) / (FAMILIARITY.MAX - FAMILIARITY.NEUTRAL), -1, 1);
}

/** The record a new career starts with: every key at INITIAL, the saved style higher. */
export function initialFamiliarity(savedStyle: TacticalStyle): Record<FamiliarityKey, number> {
  const out = {} as Record<FamiliarityKey, number>;
  for (const k of FAMILIARITY_KEYS) out[k] = k === savedStyle ? FAMILIARITY.SAVED_STYLE_INITIAL : FAMILIARITY.INITIAL;
  return out;
}

/** A stored familiarity value, INITIAL when the key (or the whole record) is absent. */
export function familiarityOf(squad: Squad, key: FamiliarityKey): number {
  return squad.styleFamiliarity?.[key] ?? FAMILIARITY.INITIAL;
}

/** AI clubs: implicit, nothing stored. */
export function aiFamiliarity(ownStyle: TacticalStyle): Record<FamiliarityKey, number> {
  const out = {} as Record<FamiliarityKey, number>;
  for (const k of FAMILIARITY_KEYS) out[k] = k === ownStyle ? FAMILIARITY.AI_OWN_STYLE : FAMILIARITY.AI_OTHER;
  return out;
}

/**
 * The familiarity a squad brings to a match playing `style`: the human club's stored record
 * (absent keys = INITIAL), or the AI rule for a club that stores none.
 */
export function squadFamiliarityLevels(squad: Squad, style: TacticalStyle): FamiliarityLevels {
  if (!squad.styleFamiliarity) return aiFamiliarity(style);
  const out: FamiliarityLevels = {};
  for (const k of FAMILIARITY_KEYS) out[k] = familiarityOf(squad, k);
  return out;
}

/**
 * One training day: the focus gains `GAIN_PER_SESSION × devMult × (1 − v/100)` (soft cap at
 * 100); every other key loses `DECAY_PER_DAY`, never below `DECAY_FLOOR` (a key already below
 * the floor is left as is). Absent keys start from INITIAL. Returns a full record.
 */
export function trainFamiliarity(
  current: FamiliarityLevels | undefined,
  focus: FamiliarityKey | undefined,
  devMult: number,
): Record<FamiliarityKey, number> {
  const out = {} as Record<FamiliarityKey, number>;
  for (const k of FAMILIARITY_KEYS) {
    const v = current?.[k] ?? FAMILIARITY.INITIAL;
    if (k === focus) {
      const gain = FAMILIARITY.GAIN_PER_SESSION * devMult * (1 - v / FAMILIARITY.MAX);
      out[k] = round2(clamp(v + Math.max(0, gain), FAMILIARITY.MIN, FAMILIARITY.MAX));
    } else {
      out[k] = v <= FAMILIARITY.DECAY_FLOOR ? v : round2(Math.max(FAMILIARITY.DECAY_FLOOR, v - FAMILIARITY.DECAY_PER_DAY));
    }
  }
  return out;
}
