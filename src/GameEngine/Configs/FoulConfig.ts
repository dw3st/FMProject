/**
 * FoulConfig — tuning for fouls, cards and in-match penalties (Etapa 12,
 * `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §1–4, `.claude/rules/game-engine/fouls.md`).
 *
 * Calibrated with `bun scripts/fouls-calibrate.ts` against the targets (per match, both teams):
 * fouls 10–14, yellows ~3, reds 0.1–0.15, penalties 0.2–0.3.
 */
export const FOUL_CONFIG = {
  // ── Foul chance (`foulChance`) ──────────────────────────────────────────────
  /** Base foul chance for a resolved tackle attempt (side angle, neutral aggression/skill/energy). */
  TACKLE_BASE: 0.2,
  /** Base foul chance for a contested loose-ball duel. */
  DUEL_BASE: 0.12,
  /** Multiplier when the tackle itself won the ball — most fouls come from mistimed (failed) challenges. */
  TACKLE_WON_MULT: 0.35,
  /** Approach-angle multipliers (`classifyPosition` of the tackler relative to the holder). */
  ANGLE_MULT: { front: 0.7, side: 1.0, behind: 1.8 },
  /** `TACKLE_AGGRESSION` (team pressing style) around which the aggression multiplier is neutral. */
  AGGRESSION_REF: 0.4,
  /** Multiplier = 1 + AGGRESSION_WEIGHT × (aggression − AGGRESSION_REF): low_block 0.85, high_press 1.25. */
  AGGRESSION_WEIGHT: 1.0,
  /** Multiplier = 1 + LOW_TACKLING_WEIGHT × (0.5 − tackling): a poor tackler (0.2) fouls 18% more. */
  LOW_TACKLING_WEIGHT: 0.6,
  /** Energy below which fatigue raises the foul chance. */
  ENERGY_REF: 70,
  /** Multiplier = 1 + LOW_ENERGY_WEIGHT × max(0, (ENERGY_REF − energy) / ENERGY_REF). */
  LOW_ENERGY_WEIGHT: 0.6,
  /** A player already on a yellow is more careful. */
  ON_YELLOW_MULT: 0.6,
  /**
   * Inside the defending team's own penalty area defenders hold back (a foul there is a penalty).
   * Tuned so penalties land at ~0.2–0.3 per match.
   */
  IN_BOX_MULT: 0.5,

  // ── Cards (`cardRoll`) ──────────────────────────────────────────────────────
  /** Yellow-card chance for a plain foul (front/side, no clear chance). */
  YELLOW_BASE: 0.2,
  /** Straight-red chance for a plain foul. */
  RED_BASE: 0.004,
  /** Card-severity multipliers for a challenge from behind. */
  BEHIND_YELLOW_MULT: 1.6,
  BEHIND_RED_MULT: 2.5,
  /** Card-severity multipliers when the fouled player had a clear run on goal (DOGSO). */
  CLEAR_CHANCE_YELLOW_MULT: 2.5,
  CLEAR_CHANCE_RED_MULT: 12,
  /** Card-severity multipliers for a player already on a yellow (the referee's patience is shorter). */
  ON_YELLOW_YELLOW_MULT: 1.3,
  ON_YELLOW_RED_MULT: 1.0,
  /** Cap on the card chances so the roll never saturates. */
  MAX_YELLOW: 0.85,
  MAX_RED: 0.6,

  // ── Clear chance (`isClearChance`) ──────────────────────────────────────────
  /** The fouled player must be within this distance (yards) of the goal he attacks. */
  CLEAR_CHANCE_MAX_DIST: 35,
  /** Half-width (yards) of the corridor ahead of the fouled player that must hold no outfield defender. */
  CLEAR_CHANCE_CORRIDOR: 8,

  // ── Restarts ────────────────────────────────────────────────────────────────
  /** Free kick freeze (real seconds). */
  FREE_KICK_COUNTDOWN: 1.0,
  /** A free kick within this many yards of the goal it attacks uses the freeKick_Attack/_Defend layouts. */
  DANGEROUS_FREE_KICK_DIST: 35,
  /** Penalty freeze (real seconds) before the kick is resolved. */
  PENALTY_COUNTDOWN: 2.0,
  /** Penalty spot distance from the goal line (yards). */
  PENALTY_SPOT_DIST: 12,
} as const;
