/**
 * PlayerDevelopment — pure, side-effect-free development logic.
 *
 * Implements the spec in .claude/rules/game/development.md:
 *  - Performance-based DP after each match
 *  - Age growth multiplier + age decay
 *  - Role-based DP distribution (5 categories → 10 stats)
 *  - Soft cap at high attribute values
 *  - Level-up / level-down resolution
 */

import type { RosterPlayer, DevelopmentProgress, PlayerStatsRecord } from "@/types/playerTypes";
import { emptyDevelopmentProgress } from "@/types/playerTypes";
import type { PlayerDevelopmentChange, StatLevelChange } from "@/types/dayLogTypes";
import { Player } from "@/Domain/Player";

// ── Constants ───────────────────────────────────────────────────────────────

const BASE_DP    = 10;   // DP earned per match at 1.0 multiplier
const BASE_COST  = 10;   // base DP required for a stat level-up
const SCALE      = 0.10; // how steeply cost grows with value

/** Training-only: per-intensity fraction of BASE_DP earned per session. */
export const TRAINING_DP_RATIO: Record<"light" | "normal" | "heavy", number> = {
  heavy:  0.25, // spec: 25% of a rating-6 match
  normal: 0.12,
  light:  0.05,
};

// ── Category → stat mapping ─────────────────────────────────────────────────

type DPCategory = "shooting" | "passing" | "defending" | "technical" | "physical";

const CATEGORY_STATS: Record<DPCategory, (keyof PlayerStatsRecord)[]> = {
  shooting:  ["finishing", "heading"],
  passing:   ["passing", "vision"],
  defending: ["tackling", "pressing"],
  technical: ["dribbling"],
  physical:  ["speed", "acceleration"],
};

export type RoleDPWeights = Record<DPCategory, number>;

/** Fallback weights when a player's role isn't found in roles.json or has no dpWeights. */
export const DEFAULT_DP_WEIGHTS: RoleDPWeights = {
  shooting: 0.1,
  passing: 0.3,
  defending: 0.2,
  technical: 0.25,
  physical: 0.15,
};

// ── Formulas ────────────────────────────────────────────────────────────────

function performanceMultiplier(rating: number): number {
  if (rating >= 8.5) return 2.0;
  if (rating >= 7.0) return 1.0;
  if (rating >= 6.0) return 0.5;
  return 0.0;
}

function ageGrowthMultiplier(age: number): number {
  if (age <= 18) return 0.9;
  if (age <= 21) return 0.75;
  if (age <= 25) return 0.6;
  if (age <= 27) return 0.4;
  if (age === 28) return 0.2;
  if (age <= 31) return 0.05;
  return 0.0;
}

function ageDecayPerMatch(age: number): number {
  if (age <= 27) return 0;
  if (age === 28) return 0.25;
  if (age === 29) return 0.5;
  if (age <= 31) return 1.0;
  if (age <= 34) return 2.0;
  return 4.0;
}

function dpRequired(value: number): number {
  return BASE_COST * (1 + value * value * SCALE);
}

function softCapFactor(value: number): number {
  return 1 - (value / 10) ** 2;
}

// ── Core update ─────────────────────────────────────────────────────────────

export interface DevelopmentResult {
  updatedPlayer: RosterPlayer;
  levelChanges:  PlayerDevelopmentChange | null; // null if no levels changed
}

/**
 * Apply one match's worth of development to a player.
 *
 * @param player      The roster player (will not be mutated)
 * @param matchRating The player's match rating (0–10); pass 0 if didn't play
 * @param weights     Role DP category weights (from roles.json)
 */
export function applyDevelopment(
  player: RosterPlayer,
  matchRating: number,
  weights: RoleDPWeights,
): DevelopmentResult {
  const earnedDP = BASE_DP * performanceMultiplier(matchRating);
  const netDP    = earnedDP * ageGrowthMultiplier(player.age) - ageDecayPerMatch(player.age);
  return distributeAndResolve(player, netDP, weights);
}

/**
 * Per-age-band training DP factor.
 *  < 21      → full gain
 *  21..30    → half gain (BASE_DP/2 multiplier)
 *  > 30      → no gain
 */
function trainingAgeFactor(age: number): number {
  if (age < 21)  return 1.0;
  if (age <= 30) return 0.5;
  return 0.0;
}

/**
 * Apply one training session's worth of development to a player.
 * No decay (training only adds DP). Players over 30 receive nothing.
 *
 * @param player    The roster player (will not be mutated)
 * @param intensity Training intensity — drives the fraction of BASE_DP earned
 * @param weights   Role DP category weights (from roles.json)
 */
export interface TrainingDevelopmentResult extends DevelopmentResult {
  /** Net DP applied to the player's progress this session (after age growth multiplier). */
  dpGained: number;
}

export function applyTrainingDevelopment(
  player: RosterPlayer,
  intensity: "light" | "normal" | "heavy",
  weights: RoleDPWeights,
): TrainingDevelopmentResult {
  const ageFactor = trainingAgeFactor(player.age);
  if (ageFactor === 0) {
    return { updatedPlayer: player, levelChanges: null, dpGained: 0 };
  }

  const earnedDP = BASE_DP * TRAINING_DP_RATIO[intensity] * ageFactor;
  const netDP    = earnedDP * ageGrowthMultiplier(player.age);
  const result   = distributeAndResolve(player, netDP, weights);
  return { ...result, dpGained: netDP };
}

/** Shared core: split netDP across category weights, apply soft cap, resolve level-ups/downs. */
function distributeAndResolve(
  player: RosterPlayer,
  netDP: number,
  weights: RoleDPWeights,
): DevelopmentResult {
  // Seed progress at the midpoint of each stat's current level cost so that players
  // without any tracked history aren't immediately at the cliff edge: any tiny decay
  // would otherwise drop progress below 0 and trigger an instant level-down.
  // Also treat an all-zero progress record as uninitialized (legacy saves).
  const isUninitialized =
    !player.progress ||
    Object.values(player.progress).every((v) => v === 0);

  const progress: DevelopmentProgress = isUninitialized
    ? (() => {
        const p = emptyDevelopmentProgress();
        for (const stat of Object.keys(p) as (keyof DevelopmentProgress)[]) {
          p[stat] = dpRequired(player.stats[stat as keyof PlayerStatsRecord]) * 0.5;
        }
        return p;
      })()
    : { ...player.progress! };

  const stats: PlayerStatsRecord = { ...player.stats };
  const statChanges: StatLevelChange[] = [];

  for (const [category, weight] of Object.entries(weights) as [DPCategory, number][]) {
    const categoryDP = netDP * weight;
    const statsInCategory = CATEGORY_STATS[category];
    const dpPerStat = categoryDP / statsInCategory.length;

    for (const stat of statsInCategory) {
      const currentValue = stats[stat];

      // Soft cap — high values grow slower (or decline faster when negative)
      const effective = dpPerStat >= 0
        ? dpPerStat * softCapFactor(currentValue)
        : dpPerStat; // decay is not soft-capped

      progress[stat] += effective;

      // Resolve level-ups
      while (progress[stat] >= dpRequired(stats[stat])) {
        if (stats[stat] >= 10) { progress[stat] = 0; break; }
        progress[stat] -= dpRequired(stats[stat]);
        stats[stat] += 1;
        statChanges.push({ stat, delta: 1, newValue: stats[stat] });
      }

      // Resolve level-downs
      while (progress[stat] < 0) {
        if (stats[stat] <= 0) { progress[stat] = 0; break; }
        progress[stat] += dpRequired(stats[stat] - 1);
        stats[stat] -= 1;
        statChanges.push({ stat, delta: -1, newValue: stats[stat] });
      }
    }
  }

  const updatedPlayer: RosterPlayer = { ...player, stats, progress };
  updatedPlayer.overallAvg = Player.computeOverallAvg(updatedPlayer);

  const levelChanges: PlayerDevelopmentChange | null =
    statChanges.length > 0
      ? { playerId: player.id, playerName: player.name, changes: statChanges }
      : null;

  return { updatedPlayer, levelChanges };
}
