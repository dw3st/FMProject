import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import ROLES from "@/Data/roles.json";
import { getMainRole, type MainRole } from "@/GameInterface/positionHelpers";

/**
 * Leaf module: a player's weighted overall rating from their attributes/role, with no dependency
 * on `Player.ts` or `src/Domain/finance/wages.ts`. `Player.ts` re-exposes these as static methods
 * (`Player.overallAvg`, etc.) for the existing call sites; `wages.ts` imports `overallAvg`
 * directly from here instead of from `Player.ts`, so the wage curve can compute a player's rating
 * without a `wages.ts` → `Player.ts` → `wages.ts` import cycle (`Player.salaryLabel` calls
 * `weeklyWage` from `wages.ts`, so `Player.ts` importing `wages.ts` is the one-way edge that must
 * stay one-way).
 */

/** All detailed roles mapped to their main role band — used to find a player's best fit. */
export const MAIN_ROLE_TO_SPECIFICS: Record<MainRole, string[]> = {
  GK:         ["GK"],
  Defender:   ["CB", "LB", "RB", "LWB", "RWB"],
  Midfielder: ["CDM", "CM", "CAM", "LM", "RM"],
  Forward:    ["LW", "RW", "ST"],
};

type RolesWithAttrWeights = Record<string, { attrWeights?: Record<string, number> }>;

/**
 * Weighted score for a single specific role (e.g. "CB", "CM").
 * Uses a quadratic mean (power mean, p=2) so high-end attributes outweigh
 * mid-range ones — e.g. acc 9 + speed 5 scores higher than acc 8 + speed 6,
 * because a point at the top of the scale is harder to get than one in the middle.
 */
function scoreForRole(stats: PlayerStatsRecord, role: string): number {
  const R = ROLES as RolesWithAttrWeights;
  const weights = R[role]?.attrWeights ?? R["CM"]?.attrWeights ?? {};
  let wSum = 0;
  let wTotal = 0;
  for (const [attr, val] of Object.entries(stats)) {
    const w = weights[attr] ?? 0;
    wSum += val * val * w;
    wTotal += w;
  }
  return wTotal > 0 ? Math.sqrt(wSum / wTotal) : 5.0;
}

/**
 * Weighted score for a role. If a main role (GK / Defender / Midfielder / Forward) is
 * passed, returns the best score across every specific role in that band. Specific roles
 * are scored directly.
 */
export function weightedScore(stats: PlayerStatsRecord, position: string): number {
  const specifics = MAIN_ROLE_TO_SPECIFICS[position as MainRole];
  if (specifics) {
    let best = 0;
    for (const role of specifics) {
      const s = scoreForRole(stats, role);
      if (s > best) best = s;
    }
    return best;
  }
  return scoreForRole(stats, position);
}

/** Specific role (e.g. "ST", "CB") with the best weighted score inside `position`'s main role. */
export function bestSpecificRole(stats: PlayerStatsRecord, position: string): string {
  const specifics = MAIN_ROLE_TO_SPECIFICS[getMainRole(position)];
  let best = specifics[0]!;
  let bestScore = -1;
  for (const role of specifics) {
    const s = scoreForRole(stats, role);
    if (s > bestScore) { bestScore = s; best = role; }
  }
  return best;
}

/** Computes a player's overall AVG — best weighted score across their main role's specifics. */
export function computeOverallAvg(player: RosterPlayer): number {
  const main = getMainRole(player.positions[0] ?? "CM");
  return weightedScore(player.stats, main);
}

/**
 * Returns the player's cached overall AVG, computing and storing it on first access.
 * The cache is invalidated whenever stats change (see `PlayerDevelopment.applyDevelopment`).
 */
export function overallAvg(player: RosterPlayer): number {
  if (typeof player.overallAvg === "number") return player.overallAvg;
  const v = computeOverallAvg(player);
  player.overallAvg = v;
  return v;
}
