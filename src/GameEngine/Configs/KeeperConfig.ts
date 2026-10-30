/**
 * Active goalkeeper (sweeper, 1v1 rush, advanced position, wider high-ball claims).
 * Spec: docs/superpowers/specs/2026-10-28-active-keeper-design.md. Rules in `Domain/Keeper.ts`.
 */
export const KEEPER_CONFIG = {
  // ── Arc while defending, ball far ─────────────────────────────────────────
  /** Yards off the line with the ball at FAR_DIST or more from goal. */
  FAR_COME_OUT: 6,
  FAR_DIST: 60,

  // ── 1v1 rush ──────────────────────────────────────────────────────────────
  /** Holder within this distance of the goal centre. */
  RUSH_RANGE: 25,
  /** Lateral half-width of the corridor checked for an outfield defender goal-side. */
  RUSH_CORRIDOR: 8,
  /** Furthest the keeper comes off his line. */
  RUSH_MAX: 10,
  /** He stops this far short of the holder (tackle range is 2). */
  RUSH_GAP: 1.5,

  // ── Own team in possession ────────────────────────────────────────────────
  /** Off = the keeper holds his formation slot while his team has the ball (measurement switch). */
  ATTACK_ENABLED: true,
  ATTACK_MIN: 6,
  ATTACK_SPOT: 12,
  ATTACK_EDGE: 18,
  /** Ball distance from own goal line for ATTACK_MIN / ATTACK_SPOT / ATTACK_EDGE. */
  ATTACK_NEAR_DIST: 30,
  ATTACK_MID_DIST: 57.5,
  ATTACK_FAR_DIST: 97.5,
  /** Share of the ball's lateral offset he follows. */
  ATTACK_Y_FOLLOW: 0.15,

  // ── Sweeper ───────────────────────────────────────────────────────────────
  /** Furthest from his goal line he chases a loose / through ball. */
  SWEEP_RANGE: 30,
  SWEEP_HALF_WIDTH: 26,
  /** He chases when his ETA beats the fastest attacker's by margin = BASE − SKILL × positioning (s). */
  SWEEP_MARGIN_BASE: 0.15,
  SWEEP_MARGIN_SKILL: 0.15,

  // ── Smother (keeper tackle) ───────────────────────────────────────────────
  SMOTHER_BASE: 0.25,
  SMOTHER_SKILL: 0.3,
  /** Foul chance multiplier on a keeper's challenge. */
  SMOTHER_FOUL_MULT: 0.5,

  // ── Shot stopping ─────────────────────────────────────────────────────────
  /**
   * How much a keeper's skill cuts a shot's goal chance: gkEffect = 1 − skill × SAVE_SCALE (`computeGKEffect`).
   * Kept at its old value: lowering it to 0.30 barely moved the goal volume (spec, measurements).
   */
  SAVE_SCALE: 0.45,

  // ── High balls beyond the small box ───────────────────────────────────────
  /**
   * Deepest a high ball may drop (yards from the goal line) for him to come: past the penalty spot, where the
   * spot cross lands (tester report 4.41.51: at 10 he waited on the line for balls he would reach first).
   */
  HIGH_CLAIM_DEPTH: 13,
  /** Lateral half-width from the goal centre. */
  HIGH_CLAIM_HALF_WIDTH: 10,
  /** Furthest he travels for it. */
  HIGH_REACH: 12,
  /** He comes when at most this much further from the point than the nearest other player. */
  HIGH_SLACK: 0,
  /** Claim chance × (1 − PENALTY × (depth − small box) / (claim depth − small box)). */
  HIGH_DEPTH_PENALTY: 0.7,
  /** Share of failed wide claims that drop loose at the point (the rest are punched). */
  HIGH_FLAP_SHARE: 0.5,
};
