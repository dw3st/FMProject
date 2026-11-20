/**
 * The FM ball-holder chooser (engine rebuild stage 8, `.claude/rules/game-engine/holder-choice.md`). Flag `FM_HOLDER`
 * (`DecisionConfig.ts`). Every candidate (pass to each teammate, through-ball cells, cross targets, long ball, shot,
 * carry lanes, sprint, byline run, dribble, turn, spin past the marker, hold, shield, corner-flag hold) gets a value
 * (0..1, the evaluators' compressed score), a category multiplier and a risk byte 0–100 (100 vetoes it). Its score
 * s = value × multiplier × SCALE (× f24 for a kick), compressed above (100 − risk)³ / 10, then a hard argmax (ties: the
 * lower risk, then the higher quality byte). Noise only on a decisions lapse.
 *
 * Distances in yards. `HOLDER_CHOICE_OVERRIDES='{"HOLD_S":1}'` (env, read once at load) for measuring runs.
 */
export const HOLDER_CHOICE = {
  /** Value × multiplier on FM's integer scale (FM: noise 100 × f24 100 = ×10 000; median pass score ~6 500). */
  SCALE: 10_000,
  /** Score floor of a non-vetoed candidate (FM: minimum 1). */
  MIN_SCORE: 1,
  /** Compression keeps this share of the excess above the risk cap (FM: s − 0.9·(s − cap)). */
  COMPRESS_KEEP: 0.1,
  /**
   * Category multiplier relative to a carry: FM's measured medians (report 6: carry 0.36, hold 0.41, turn 0.72; they
   * include FM's own ×0.5 for turn and hold) divided by the carry's. Pass and kick keep 1 (their scores are the
   * generator's own in FM). Stage 21 (`fm-numbers.md` → "Etapa 21"): order pass, kick, turn, hold, carry; turn 2 → 2.3,
   * hold 1.14 → 1.4 and carry 1 → 0.95 bring the holder mix to FM's (carry 37 / pass 42 / turn 10.5 / hold 9). The
   * argmax is knife-edged: carry 0.92 already drops carries to 33% and dribbles to a third, 0.85 to 18%.
   */
  CAT_MULT: [1, 1, 2.3, 1.4, 0.95] as readonly number[],
  /** Kicks: f24 = min(KICK_F24_K · v², 1) (FM: min(500·v², 100) / 100). */
  KICK_F24_K: 5,
  /** Lapse noise: each score × (1 + U(−LAPSE_NOISE, +LAPSE_NOISE)) only when the decisions roll lapsed (FM ±20%). */
  LAPSE_NOISE: 0.2,
  /** Pass adder: when risk − quality > ADDER_GAP the score is divided by 1 + ADDER_STEP·(risk − quality − ADDER_GAP). */
  ADDER_GAP: 50,
  ADDER_STEP: 0.05,

  // ── Risk bytes ──
  /** A pass whose lane score is at or below this is vetoed (an opponent owns the line); an offside receiver too. */
  PASS_VETO_LANE: 0.05,
  /** A through-ball cell with a race score at or below this is vetoed (the defender gets there first). */
  TB_VETO_RACE: 0.15,
  /** A carry lane with a clearance at or below this is vetoed (he runs into an opponent). */
  CARRY_VETO_CLEARANCE: 0.05,
  /** Through-ball cells and cross targets offered (the best ones). */
  TB_CANDIDATES: 3,

  // ── New actions ──
  /** Sprint: a carry step of SPRINT_STEP_YD (FM type 0x2c, 5 m at ~6 m/s), only with SPRINT_CLEAR_YD of open lane. */
  SPRINT_STEP_YD: 5.5,
  SPRINT_CLEAR_YD: 12,
  SPRINT_LANE_R_YD: 4,
  /** Sprint value = the lane's × (SPRINT_BASE + SPRINT_ACCEL × acceleration): above the plain carry only for a quick player. */
  SPRINT_BASE: 0.7,
  SPRINT_ACCEL: 0.4,
  /** Sprint speed: carry speed + acceleration × this (yd/s). */
  SPRINT_ACCEL_BOOST: 1.5,
  SPRINT_MAX_S: 1.4,
  /** Byline run: a wide holder (≥ BYLINE_WIDE_YD off the centre line: outside the box) within BYLINE_ZONE_YD of the end line runs at it. */
  BYLINE_WIDE_YD: 20,
  BYLINE_ZONE_YD: 35,
  /** ...and stops this far from the line (yd): a cross or cut-back comes next. */
  BYLINE_STOP_YD: 4,
  /** Turn: moving more than TURN_DEG from the best way forward, at TURN_MIN_SPEED (yd/s) or more; lasts TURN_S. */
  TURN_DEG: 70,
  TURN_MIN_SPEED: 0.5,
  TURN_S: 0.7,
  TURN_SPEED: 0.45,
  /** Spin past the marker: back to goal, the marker within SPIN_MARKER_YD on his goal side. */
  SPIN_MARKER_YD: 3,
  SPIN_S: 0.6,
  SPIN_SPEED: 0.7,
  /** Hold: keep the ball and wait for an option (FM category 3, held ~5–10 FM ticks); edges away at HOLD_SPEED. */
  HOLD_S: 1.2,
  HOLD_SPEED: 0.25,
  /** Hold value = HOLD_BASE + HOLD_SUPPORT × teammates arriving within HOLD_SUPPORT_YD, × (1 − pressure) under a press. */
  HOLD_BASE: 0.25,
  HOLD_SUPPORT: 0.08,
  HOLD_SUPPORT_YD: 15,
  /** Corner-flag hold: leading, from FLAG_MINUTE on, within FLAG_ZONE_YD of the opponents' corner flag. */
  FLAG_MINUTE: 85,
  FLAG_ZONE_YD: 18,
  FLAG_S: 2,
  FLAG_SPEED: 0.15,
  FLAG_VALUE: 0.9,
  /** Re-decide at once only when a challenge comes in (an opponent within CHALLENGE_YD, farther at the start). */
  CHALLENGE_YD: 3,
};
{
  const raw = typeof process !== 'undefined' ? process.env?.HOLDER_CHOICE_OVERRIDES : undefined;
  if (raw) { try { Object.assign(HOLDER_CHOICE, JSON.parse(raw)); } catch { /* ignored */ } }
}
