/**
 * Recalibrates native players' *level* from the open-football seed while keeping their native
 * attribute *profile* (shape). See docs/superpowers/specs/2026-09-25-native-star-recalibration-design.md.
 *
 * Pipeline (driven by scripts/importOpenFootball.ts, one main role at a time):
 *   1. fitLevelPredictor — per role, z = a + b·seedOverall + c·leagueRep fitted against the native
 *      (game) overall of paired native↔seed players.
 *   2. quantileTargets — rank the paired players by z and hand out the CURRENT overall multiset of
 *      that same group in rank order (preserves mean/spread; reorders by the seed-derived level).
 *   3. shiftToOverall — one additive shift on the attributes that matter for the player's best
 *      specific role, found by bisection, then rounded to one decimal (roundAttr).
 *
 * Pure module — no filesystem, no @/Data imports beyond types.
 */
import { fitPlane, type PlaneFit } from "@/../scripts/openfootball/calibration";
import { roundAttr } from "@/Domain/attributes";
import type { MainRole } from "@/../scripts/openfootball/roster";
import type { PlayerStatsRecord } from "@/types/playerTypes";

export type { MainRole };

/** a + b·seedOverall + c·leagueRep, fitted by OLS against the native (game) overall. */
export type LevelPlaneFit = PlaneFit;

export interface LevelPair {
  role: MainRole;
  seedOverall: number;
  leagueRep: number;
  /** The native player's current game overall (`Player.computeOverallAvg`), pre-recalibration. */
  nativeOverall: number;
}

/**
 * Fits the level predictor per main role from native↔seed pairs. Roles with fewer than 3 pairs
 * (fitPlane's minimum) are omitted — callers should leave those players unrecalibrated.
 */
export function fitLevelPredictor(pairs: LevelPair[]): Partial<Record<MainRole, LevelPlaneFit>> {
  const byRole = new Map<MainRole, Array<[number, number, number]>>();
  for (const p of pairs) {
    const arr = byRole.get(p.role) ?? [];
    arr.push([p.seedOverall, p.leagueRep, p.nativeOverall]);
    byRole.set(p.role, arr);
  }
  const out: Partial<Record<MainRole, LevelPlaneFit>> = {};
  for (const [role, pts] of byRole) {
    if (pts.length >= 3) out[role] = fitPlane(pts);
  }
  return out;
}

/** Predicted level (z) for one seed player under a role's fitted plane. */
export function predictLevel(fit: LevelPlaneFit, seedOverall: number, leagueRep: number): number {
  return fit.a + fit.b * seedOverall + fit.c * leagueRep;
}

export interface QuantileInput {
  id: string;
  z: number;
  /** The player's current game overall, pre-recalibration. */
  currentOverall: number;
}

/**
 * Rank-maps a group of paired players: sorts by `z` descending (ties by id ascending, for
 * determinism), then hands out the group's own `currentOverall` values — sorted descending — in
 * that order. The output multiset of target overalls is exactly the input multiset of
 * `currentOverall` (same mean, same spread); only the assignment (who gets which value) changes,
 * driven by the seed-derived `z`.
 */
export function quantileTargets(players: QuantileInput[]): Map<string, number> {
  const byZDesc = [...players].sort((a, b) => b.z - a.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const overallsDesc = players.map((p) => p.currentOverall).sort((a, b) => b - a);
  const out = new Map<string, number>();
  byZDesc.forEach((p, i) => out.set(p.id, overallsDesc[i]!));
  return out;
}

const clamp10 = (v: number): number => Math.max(0, Math.min(10, v));

/**
 * Continuous (unrounded) stats after adding `shift` to every attribute with weight > 0 in
 * `weights`, clamped to 0..10. Attributes with weight 0 (or missing from `weights`) pass through
 * unchanged.
 */
export function applyShift(
  stats: PlayerStatsRecord,
  weights: Record<string, number>,
  shift: number,
): PlayerStatsRecord {
  const out = { ...stats };
  for (const k of Object.keys(stats) as (keyof PlayerStatsRecord)[]) {
    if ((weights[k] ?? 0) > 0) out[k] = clamp10(stats[k] + shift);
  }
  return out;
}

/** Wider than the 0..10 attribute range so the bisection bracket always contains the root. */
const SHIFT_BOUND = 12;
const BISECTION_ITERATIONS = 60;

/**
 * Bisects the single additive shift `s` so that `overallOf(applyShift(stats, weights, s))`
 * equals `target`. `overallOf` must be non-decreasing in `s` — true for the quadratic-mean
 * weighted score (`Player.scoreForRole`) when every positively-weighted attribute moves together.
 * 60 halvings of a [-12, 12] bracket converge to well under 1e-6, far past the 0.01 tolerance
 * callers rely on.
 */
export function findShift(
  stats: PlayerStatsRecord,
  weights: Record<string, number>,
  target: number,
  overallOf: (s: PlayerStatsRecord) => number,
): number {
  let lo = -SHIFT_BOUND;
  let hi = SHIFT_BOUND;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const val = overallOf(applyShift(stats, weights, mid));
    if (val < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Recalibrates one player's attributes to hit `target` overall (per `overallOf`): a single
 * additive shift on every attribute with weight > 0 in `weights` (continuous, clamped 0..10),
 * found by bisection to within 0.01 of `target`, then rounded per attribute to one decimal
 * (`roundAttr`) and repaired in 0.1 steps (`repairRounding`). Attributes with weight 0 are returned
 * unchanged. Deterministic for a given (stats, weights, target, overallOf); `playerId` is kept in the
 * signature for the callers.
 */
export function shiftToOverall(
  playerId: string,
  stats: PlayerStatsRecord,
  weights: Record<string, number>,
  target: number,
  overallOf: (s: PlayerStatsRecord) => number,
): PlayerStatsRecord {
  const shift = findShift(stats, weights, target, overallOf);
  const continuous = applyShift(stats, weights, shift);
  const out = { ...stats };
  for (const k of Object.keys(stats) as (keyof PlayerStatsRecord)[]) {
    if ((weights[k] ?? 0) <= 0) continue;
    out[k] = roundAttr(continuous[k]);
  }
  return repairRounding(out, weights, target, overallOf);
}

/** One-decimal attributes still quantise the overall a little (integers missed by up to ~0.25 —
 * Bellingham, issue #34); the repair closes the last gap in 0.1 steps. */
const REPAIR_TOLERANCE = 0.01;
const REPAIR_MAX_STEPS = 40;

/**
 * Deterministic repair after rounding: while the overall is further than `REPAIR_TOLERANCE` from
 * `target`, move the single weighted attribute by ±0.1 that brings it closest, stopping when no
 * move improves it. Only attributes with weight > 0 move, so the profile shape is preserved and
 * the quantile multiset is hit far more tightly (no bias — it only removes rounding noise).
 */
export function repairRounding(
  stats: PlayerStatsRecord,
  weights: Record<string, number>,
  target: number,
  overallOf: (s: PlayerStatsRecord) => number,
): PlayerStatsRecord {
  let cur = stats;
  let err = Math.abs(overallOf(cur) - target);
  for (let step = 0; step < REPAIR_MAX_STEPS && err > REPAIR_TOLERANCE; step++) {
    let best: PlayerStatsRecord | null = null;
    let bestErr = err;
    for (const k of Object.keys(cur) as (keyof PlayerStatsRecord)[]) {
      if ((weights[k] ?? 0) <= 0) continue;
      for (const d of [-0.1, 0.1]) {
        const raw = cur[k] + d;
        if (raw < -1e-9 || raw > 10 + 1e-9) continue;
        const v = roundAttr(raw);
        const cand = { ...cur, [k]: v };
        const e = Math.abs(overallOf(cand) - target);
        if (e < bestErr - 1e-9) { bestErr = e; best = cand; }
      }
    }
    if (!best) break;
    cur = best;
    err = bestErr;
  }
  return cur;
}
