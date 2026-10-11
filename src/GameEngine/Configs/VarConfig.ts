/**
 * Referee errors, VAR and the manager's complaint (`.claude/rules/game/var.md`, spec
 * `docs/superpowers/specs/2026-10-10-var-design.md`). Every constant of the stage lives here.
 */
import type { RefereeErrorKind } from '@/GameEngine/Domain/Var';

export const VAR_CONFIG = {
  /**
   * Chance of each error per opportunity, for an average referee (quality 62.5, `qualityMult` = 1).
   * Opportunities: `phantom_penalty` a challenge in the defender's own box that was not a foul;
   * `missed_penalty` a foul in the box; `missed_offside` an offside the assistant would flag;
   * `wrong_red` a yellow card (not a second yellow); `missed_red` a straight red.
   * Calibrated with `scripts/var-measure.ts` (≈ 0.25 errors per match, goals ±3%).
   */
  BASE: {
    phantom_penalty: 0.014,
    missed_penalty:  0.2,
    missed_offside:  0.11,
    wrong_red:       0.0045,
    missed_red:      0.3,
  } satisfies Record<RefereeErrorKind, number>,
  /** `qualityMult(q) = QUALITY_HI − QUALITY_SLOPE × q / 100` (≈ 1.5 worst, ≈ 0.7 best, 1 at 62.5). */
  QUALITY_HI: 1.5,
  QUALITY_SLOPE: 0.8,
  /** Quality used when the referee has none recorded (never happens with a real appointment). */
  DEFAULT_QUALITY: 62.5,
  /** Chance the VAR corrects a reviewable error. */
  CORRECTION: 0.8,
  /** Share of correct penalties / straight reds the VAR checks anyway (always confirmed). */
  CHECK_CORRECT: 0.25,
  /** Real seconds of a review (no game time passes). */
  REVIEW_SECONDS: 3,
  /** Game seconds after a missed offside in which a goal of that team is reviewed. */
  GOAL_CHAIN_SECONDS: 15,
  // ── quickSim (statistics only, `quickVarStats`) ───────────────────────────
  /** Errors per match of an average referee (the engine's measured rate, M1). */
  QUICK_ERRORS_PER_MATCH: 0.25,
  /** Share of the errors the VAR corrects (engine, M1). */
  QUICK_CORRECTED_SHARE: 0.52,
  /** Correct calls checked and confirmed per match with VAR (engine, M1). */
  QUICK_CONFIRMED_CHECKS_PER_MATCH: 0.07,
  // ── Manager complaint (live match, the human team) ────────────────────────
  /** Real seconds the "Complain" button stays after a call against the team. */
  COMPLAINT_WINDOW: 6,
  /** Yellow chance: `YELLOW_BASE × (1 + YELLOW_PER_COMPLAINT × n) × (1 + YELLOW_RIGOR × s)`. */
  COMPLAINT_YELLOW_BASE: 0.2,
  COMPLAINT_YELLOW_PER_COMPLAINT: 0.6,
  COMPLAINT_YELLOW_RIGOR: 0.3,
  /** Straight red chance: `RED_BASE × (1 + n)`. */
  COMPLAINT_RED_BASE: 0.02,
  /** Chance a card-free complaint makes the referee stricter on the opponent. */
  COMPLAINT_BIAS_CHANCE: 0.15,
  /** Rigor added against the opponent until the end of the match. */
  COMPLAINT_BIAS: 0.25,
  /** Morale of the squad after a card-free complaint (once per match). */
  COMPLAINT_MORALE: 1,
  /** Board meter after a manager's yellow / red. */
  BOARD_YELLOW: -1,
  BOARD_RED: -3,
  /** A red on the 3rd complaint or later bans for 2 matches, else 1. */
  BAN_LONG_FROM_COMPLAINT: 3,
} as const;
