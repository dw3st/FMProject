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
import { roundAttr } from "@/Domain/attributes";

// ── Constants ───────────────────────────────────────────────────────────────

const BASE_DP    = 10;   // DP earned per match at 1.0 multiplier
const BASE_COST  = 10;   // base DP required for a stat level-up
const SCALE      = 0.10; // how steeply cost grows with value

/*
 * Pace calibration for the 0.1 steps (scripts/development-pace.ts, "realista": progress reset and age +1 at every
 * rollover, as in the game). With whole-point steps and the progress reset at each rollover, a stat only moved in
 * a season when its DP passed half a point, so most of the growth and of the veteran decline never showed. The
 * 0.1 steps have no such dead zone, so the same DP moved ~2x faster up and ~3x faster down. These scales bring the
 * 3-season average change back to within ±10% of the old pace at every starting age (18, 21, 24, 27, 31, 33).
 */

/** Scale on the growth DP (match and training). */
export const GROWTH_DP_SCALE = 0.43;

/**
 * Scale on the age decay per match, by age band. 28–29 decays more than before because the old dead zone also
 * hid that age's small growth; 30–34 much less (a season's decline there stayed under half a point); 35+ a bit less.
 */
export function decayDpScale(age: number): number {
  if (age <= 29) return 1.5;
  if (age <= 34) return 0.35;
  return 0.7;
}

/** Training-only: per-intensity fraction of BASE_DP earned per session. */
const TRAINING_DP_RATIO: Record<"light" | "normal" | "heavy", number> = {
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

/** Size of one development step: attributes move in tenths (0.1 = one point on the 0–100 display). */
export const ATTR_STEP = 0.1;

/** DP for one 0.1 step at `value` (a tenth of the old whole-point cost, so ten steps cost one old level). */
export function dpRequired(value: number): number {
  return (BASE_COST * ATTR_STEP) * (1 + value * value * SCALE);
}

/**
 * Starting progress of an untracked stat: the midpoint of the current step. Seeding the old absolute value
 * (half a whole point, five steps' worth) would be cashed in at once by the level-up loop: +0.4..0.5 on every
 * weighted stat at the first update of each season, since the record is reset at every rollover.
 */
function SEED_DP(value: number): number {
  return dpRequired(value) * 0.5;
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
 * @param dpMult      Assistant-coach multiplier on the DP earned (`src/Domain/staff`); default 1
 * @param decayMult   Multiplier on the age decay (professionalism, `src/Domain/personality`); default 1
 */
export function applyDevelopment(
  player: RosterPlayer,
  matchRating: number,
  weights: RoleDPWeights,
  dpMult = 1,
  decayMult = 1,
): DevelopmentResult {
  const earnedDP = BASE_DP * performanceMultiplier(matchRating) * dpMult;
  const netDP    = earnedDP * ageGrowthMultiplier(player.age) * GROWTH_DP_SCALE
    - ageDecayPerMatch(player.age) * decayDpScale(player.age) * decayMult;
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
  dpMult = 1,
): TrainingDevelopmentResult {
  const ageFactor = trainingAgeFactor(player.age);
  if (ageFactor === 0) {
    return { updatedPlayer: player, levelChanges: null, dpGained: 0 };
  }

  const earnedDP = BASE_DP * TRAINING_DP_RATIO[intensity] * ageFactor * dpMult;
  const netDP    = earnedDP * ageGrowthMultiplier(player.age) * GROWTH_DP_SCALE;
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
  // An all-zero record (reset at every season rollover) is seeded the same way.
  const isUninitialized =
    !player.progress ||
    Object.values(player.progress).every((v) => v === 0);

  const progress: DevelopmentProgress = isUninitialized
    ? (() => {
        const p = emptyDevelopmentProgress();
        for (const stat of Object.keys(p) as (keyof DevelopmentProgress)[]) {
          p[stat] = SEED_DP(player.stats[stat as keyof PlayerStatsRecord]);
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

      // Resolve level-ups (0.1 steps)
      while (progress[stat] >= dpRequired(stats[stat])) {
        if (stats[stat] >= 10) { progress[stat] = 0; break; }
        progress[stat] -= dpRequired(stats[stat]);
        stats[stat] = roundAttr(stats[stat] + ATTR_STEP);
        statChanges.push({ stat, delta: ATTR_STEP, newValue: stats[stat] });
      }

      // Resolve level-downs (0.1 steps)
      while (progress[stat] < 0) {
        if (stats[stat] <= 0) { progress[stat] = 0; break; }
        progress[stat] += dpRequired(stats[stat] - ATTR_STEP);
        stats[stat] = roundAttr(stats[stat] - ATTR_STEP);
        statChanges.push({ stat, delta: -ATTR_STEP, newValue: stats[stat] });
      }
    }
  }

  const aggregated = aggregateChanges(statChanges);

  const updatedPlayer: RosterPlayer = { ...player, stats, progress };
  updatedPlayer.overallAvg = Player.computeOverallAvg(updatedPlayer);

  const levelChanges: PlayerDevelopmentChange | null =
    aggregated.length > 0
      ? { playerId: player.id, playerName: player.name, changes: aggregated }
      : null;

  return { updatedPlayer, levelChanges };
}

/** One entry per stat: the steps of a call summed into a single delta (entries that cancel out are dropped). */
function aggregateChanges(changes: StatLevelChange[]): StatLevelChange[] {
  const byStat = new Map<string, StatLevelChange>();
  for (const c of changes) {
    const prev = byStat.get(c.stat);
    byStat.set(c.stat, { stat: c.stat, delta: (prev?.delta ?? 0) + c.delta, newValue: c.newValue });
  }
  const out: StatLevelChange[] = [];
  for (const c of byStat.values()) {
    const delta = Math.round(c.delta * 10) / 10;
    if (delta !== 0) out.push({ ...c, delta });
  }
  return out;
}
