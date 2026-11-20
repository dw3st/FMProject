/**
 * FM's consistency cap on the summed attribute modifier (stage 16, flag `CONSISTENCY_CAP`, `decisions.md` → "Stage 16").
 *
 * A player's match attributes are his roster attributes plus the stacked modifiers of the day (pre-match training and
 * morale buffs, style familiarity, morale, settling). FM compresses that sum by consistency: on the 100 scale a positive
 * modifier m above the cap c = MIN + SPAN·consistency becomes (m + 2c + 1)/3 (an inconsistent player's good days are
 * shorter), a negative one below NEG_FROM becomes −(NEG_K − m)/3. Pure.
 */
import { DEFENSIVE_MIND as D } from '@/GameEngine/Configs/DefensiveMindConfig';
import { clamp } from '@/Domain/math';
import type { PlayerStatsRecord } from '@/types/playerTypes';

/** The cap c (100 scale) for a consistency 0..1. */
export function consistencyCap(consistency: number): number {
  return D.CAP_MIN + D.CAP_SPAN * clamp(consistency, 0, 1);
}

/** One modifier m (100 scale) after the cap. */
export function capModifier(m: number, cap: number): number {
  if (m > cap) return (m + 2 * cap + 1) / 3;
  if (m < D.CAP_NEG_FROM) return -(D.CAP_NEG_K - m) / 3;
  return m;
}

/**
 * The modified attributes with every attribute's modifier (modified − raw, 0..10 scale ×10) capped. A record without
 * any modifier above the cap is returned as is (same object).
 */
export function capStatModifiers(
  raw: PlayerStatsRecord, modified: PlayerStatsRecord, consistency: number,
): PlayerStatsRecord {
  const cap = consistencyCap(consistency);
  let out: PlayerStatsRecord | null = null;
  for (const k of Object.keys(modified) as (keyof PlayerStatsRecord)[]) {
    const r = raw[k];
    const v = modified[k];
    if (typeof r !== 'number' || typeof v !== 'number') continue;
    const m = (v - r) * 10;
    const c = capModifier(m, cap);
    if (c === m) continue;
    if (!out) out = { ...modified };
    out[k] = clamp(r + c / 10, 0, 10);
  }
  return out ?? modified;
}
