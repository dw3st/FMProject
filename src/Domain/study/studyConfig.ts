import type { FinancialTier } from "@/types/playerTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";

/**
 * AI clubs study the human manager's tactic (`.claude/rules/game/study.md`,
 * spec `docs/superpowers/specs/2026-11-13-ai-tactic-study-design.md`).
 */
export const STUDY = {
  /** Official club games kept in the seat's tactic log (a missing game scores 0). */
  GAMES: 5,
  /** What a game loses for differing from the expected plan. */
  PENALTY: { formation: 0.5, style: 0.5, axes: 0.25 },
  /** Study of the AI club by its financial tier. */
  TIER: { LOW: 0.8, MEDIUM: 0.9, HIGH: 1, ELITE: 1.1 } as Record<FinancialTier, number>,
  /** Tier multiplier of a club without finances (hand-built squads: lab, tests). */
  TIER_NEUTRAL: 1,
  /** The human club's performance analyst hides the plan: multiplier at 1, 3 and 5 stars. */
  ANALYST: [1.15, 1, 0.8] as const,
  /** Read from which the AI brings a game plan (style). */
  MEDIUM: 0.6,
  /** Read from which the AI also man-marks the best attacker. */
  HIGH: 0.85,
  /**
   * Style the AI plays against the expected style (the measured style matrix, 8.8.33, checked by
   * `scripts/study-measure.ts`). The same style back = no swap (the AI stays balanced).
   */
  COUNTER: {
    balanced: "balanced",
    possession: "balanced",
    high_press: "counter_attack",
    counter_attack: "possession",
    direct_play: "possession",
  } as Record<TacticalStyle, TacticalStyle>,
  /** Analyst stars from which the preview tells what the opponent will do. */
  ANALYST_HINT_STARS: 4,
  /** Slots that take the man-marking job, in order of preference. */
  MARKER_ROLES: [["CDM", "CM"], ["CB"]] as const,
} as const;
