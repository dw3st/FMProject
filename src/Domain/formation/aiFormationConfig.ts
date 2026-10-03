import type { TacticalStyle } from "@/types/tacticsTypes";

/**
 * AI formation choice (Etapa 18, #59) — every constant. See `.claude/rules/game/formations.md`.
 * Scores are in `slotValue` units (mean role-weighted score of the XI, ~3.8 world average).
 */
export const AI_FORMATION = {
  /** Used when no formation can be filled without an `unsuitable` starter. */
  FALLBACK: "4-3-3",
  /**
   * World mean XI slot value per formation (all 1273 clubs at the 2026/27 start). Subtracted from a
   * club's fit so a formation wins because the SQUAD suits it better than the average squad does,
   * not because its roles score higher on the role weights (back-three roles read ~0.03 higher).
   */
  BASELINE: {
    "3-4-1-2": 3.8258, "3-4-2-1": 3.828, "3-4-3": 3.8103, "3-5-2": 3.8276,
    "4-1-2-1-2": 3.804, "4-1-4-1": 3.8035, "4-2-2-2": 3.7984, "4-2-3-1": 3.8085,
    "4-3-1-2": 3.798, "4-3-2-1": 3.79, "4-3-3": 3.8017, "4-4-1-1": 3.783,
    "4-4-2": 3.7945, "4-5-1": 3.8031, "5-2-3": 3.8126, "5-3-2": 3.8273, "5-4-1": 3.8239,
  } as Record<string, number>,
  /**
   * Popularity prior: common shapes win close calls. A formation not listed has 0. Tuned so the
   * world distribution looks like real football (4-3-3 / 4-2-3-1 most common).
   */
  PRIOR: {
    "4-3-3": 0.03, "4-2-3-1": 0.03, "4-4-2": 0.02, "4-1-4-1": 0.015, "3-5-2": 0.015,
    "3-4-2-1": 0.015, "4-4-1-1": 0.01, "4-3-1-2": 0.005, "4-1-2-1-2": 0.005, "3-4-3": 0.005,
    "5-3-2": 0.005, "4-5-1": 0.005,
  } as Record<string, number>,
  /** Bonus for formations that suit the club's tactical style. */
  STYLE_BONUS: 0.02,
  STYLE_FORMATIONS: {
    balanced: [],
    counter_attack: ["5-4-1", "4-5-1", "5-3-2", "4-4-1-1"],
    high_press: ["4-3-3", "4-2-3-1", "3-4-3", "4-1-2-1-2"],
    possession: ["4-3-3", "4-1-4-1", "4-2-3-1", "3-4-2-1", "4-3-2-1"],
    direct_play: ["4-4-2", "4-4-1-1", "3-5-2", "4-2-2-2"],
  } as Record<TacticalStyle, readonly string[]>,
  /** Per club + season + formation seeded bonus in [0, JITTER): the club's identity for the season. */
  JITTER: 0.03,
  /** Shapes an underdog drops into against a much stronger opponent. */
  DEFENSIVE: ["5-4-1", "4-5-1", "5-3-2", "4-1-4-1"] as readonly string[],
  /** Opponent level minus own level (XI slot value) from which the club plays its defensive shape. */
  UNDERDOG_GAP: 0.6,
  /** The defensive shape is kept only when its score is within this of the season pick. */
  UNDERDOG_MARGIN: 0.06,
} as const;
