import type { AwardKind } from "@/types/awardTypes";

/** Season awards constants (`.claude/rules/game/awards.md`). */
export const AWARDS = {
  YOUNG_MAX_AGE: 21,
  /** Rating awards need league games ≥ ceil(totalRounds × MIN_ROUNDS_SHARE). */
  MIN_ROUNDS_SHARE: 0.5,
  XI_SLOTS: ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"] as const,
  XI_LINES: { GK: 1, Defender: 4, Midfielder: 3, Forward: 3 } as const,
  /** Best manager: (target − position) / size + bonuses. */
  MANAGER_CHAMPION_BONUS: 0.3,
  MANAGER_PROMOTED_BONUS: 0.15,
  /** seasonScore = rating + goals × G + assists × A + titles. */
  SEASON_SCORE: { GOAL: 0.03, ASSIST: 0.02, TITLE: { league: 0.15, cup: 0.1, continental: 0.3 } },
  SHORTLIST_PLAYERS: 5,
  SHORTLIST_MANAGERS: 3,
  /** World score = weight × (seasonScore − WORLD_BASE). */
  WORLD_BASE: 5,
  /** Title points of the year count ÷ this in the world manager score. */
  WORLD_TITLE_DIVISOR: 200,
  /** Tier ≥ 3 uses 3 (`TIER_FACTOR[Math.min(3, tier)]`). */
  TIER_FACTOR: { 1: 1, 2: 0.6, 3: 0.4 } as Record<number, number>,
  /** Goal of the season: header weight 1, outside the box 1 + (distance − 18) / 10, capped. */
  GOAL_WEIGHT_CAP: 3,
  /** Market value until the next rollover of the player's league (the largest counts). */
  VALUE_MULT: { best_player: 1.15, world_player: 1.15, top_scorer: 1.12, young_player: 1.12, best_goalkeeper: 1.12, team_of_season: 1.1 } as Partial<Record<AwardKind, number>>,
  /** Morale (human club), via withEventDelta: the largest award of the rollover counts. */
  MORALE: { best_player: 10, world_player: 10, young_player: 8, top_scorer: 8, best_goalkeeper: 8, team_of_season: 5, goal_of_season: 4 } as Partial<Record<AwardKind, number>>,
  /** Big clubs: improvement-target bonus and the unlisted-standout bid chance. */
  IMPROVEMENT_BONUS: 0.08,
  BIG_CLUB_BID_MULT: 2,
  TOP_TO_SHOW: 3,
} as const;

export function tierFactor(tier: number): number {
  return AWARDS.TIER_FACTOR[Math.max(1, Math.min(3, Math.round(tier) || 1))] ?? 1;
}
