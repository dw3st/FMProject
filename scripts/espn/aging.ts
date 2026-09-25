import { unitHash } from "@/../scripts/openfootball/ids";
import { STAT_KEYS } from "@/../scripts/openfootball/derive";
import type { PlayerStatsRecord } from "@/types/playerTypes";

/** Change of the mean role attribute per year, by age during that year. */
const AGE_DELTA: Array<[maxAge: number, delta: number]> = [
  [21, 0.6], [25, 0.3], [27, 0.1], [29, 0], [31, -0.2], [34, -0.4], [Infinity, -0.6],
];
export const MAX_YEARS = 2;
const PHYSICAL = new Set(["speed", "acceleration", "stamina"]);

export function ageDelta(age: number): number {
  return AGE_DELTA.find(([max]) => age <= max)![1];
}

/**
 * Ages `stats` from `fromAge` to `toAge` (at most MAX_YEARS years). Each year the total
 * `ageDelta × (attributes with weight > 0)` is split over those attributes by `weights`
 * (the attrWeights of the player's best specific role). Growth is damped by `1 − (v/10)²`;
 * decline weighs speed, acceleration and stamina double. Fractions are rounded with a
 * per-player, per-attribute hash, so the result is deterministic.
 */
export function agePlayerStats(
  playerId: string, stats: PlayerStatsRecord, fromAge: number, toAge: number, weights: Record<string, number>,
): PlayerStatsRecord {
  const years = Math.max(0, Math.min(MAX_YEARS, toAge - fromAge));
  if (years === 0) return { ...stats };
  const keys = STAT_KEYS.filter((k) => (weights[k] ?? 0) > 0);
  const x: Record<string, number> = { ...stats };
  for (let y = 0; y < years; y++) {
    const d = ageDelta(fromAge + y);
    if (d === 0 || keys.length === 0) continue;
    const w = keys.map((k) => weights[k]! * (d < 0 && PHYSICAL.has(k) ? 2 : 1));
    const wSum = w.reduce((a, b) => a + b, 0);
    const total = d * keys.length;
    keys.forEach((k, i) => {
      const share = (total * w[i]!) / wSum;
      x[k] = d > 0 ? x[k]! + share * (1 - (x[k]! / 10) ** 2) : x[k]! + share;
    });
  }
  const out = {} as PlayerStatsRecord;
  for (const k of STAT_KEYS) {
    const v = Math.max(0, Math.min(10, x[k]!));
    const f = Math.floor(v);
    out[k] = Math.min(10, f + (unitHash(`${playerId}:${k}:age`) < v - f ? 1 : 0));
  }
  return out;
}
