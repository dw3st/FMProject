/**
 * Engine rebuild stage 4b (`.claude/rules/game-engine/fm-numbers.md`): the constants that bring the engine to the
 * behaviour measured in FM27 Mobile (reports 6–7). The switches live in `DECISION_FLAGS` (`PASS_ERROR`,
 * `ACTION_CADENCE`, `CALM_PRESS`, `SLIDING_BLOCK`, `SHORT_STEPS`, `SHOT_LIMIT`, `TACTIC_DAMP`), so
 * `DECISION_OVERRIDES` and `simulateMatch(..., { decisions })` measure each on or off.
 *
 * FM works in metres, the engine in yards (1 m = 1.0936 yd). `FM_NUMBERS_OVERRIDES='{"REACH_SIDE_YD":2}'` (env, read
 * once at load) tunes the numbers.
 */

export const FM_NUMBERS = {
  // ── 1. Pass launch error (FM: relErr ≈ 0.075·(1 − s/50)·(1 + 1.07·P/100), angle median 1.1°) ──
  /** σ of the relative speed error (along the pass) at margin 0 and no pressure. */
  ERR_REL: 0.075,
  /** σ of the direction error (degrees) at margin 0 and no pressure. */
  ERR_ANGLE_DEG: 2.5,
  /** Pressure term: × (1 + ERR_PRESSURE · P / 100), P = FM's pressure scalar on the passer (`Pressure.ts`). */
  ERR_PRESSURE: 1.07,
  /** Technique margin s = MARGIN_SPAN · passing − MARGIN_PER_M · distance (m), clamped 0..MARGIN_MAX; error × (1 − s/50). */
  MARGIN_SPAN: 40,
  MARGIN_PER_M: 0.5,
  MARGIN_MAX: 41,
  /** Along-track error in yards: offset = relErr · distance · ALONG_SCALE (rolling distance ∝ v², so ≈ 2× the speed error). */
  ALONG_SCALE: 2,
  /** The receiver reaches a ball within this ellipse of where he stood (along the pass / across it), + REACH_TOUCH_YD × first touch. */
  REACH_ALONG_YD: 2.2,
  REACH_SIDE_YD: 1.3,
  REACH_TOUCH_YD: 0.8,
  /** A missed pass runs on from its landing point at this speed (yd/s) plus the overrun. */
  MISS_ROLL_SPEED: 3,
  /** A pass to feet longer than this (yd, ≈ 27 m) is lofted: played as a high ball, contested where it lands. */
  LOFT_YD: 30,
  /** Lofted pass: the launch error × this (the ball drops on the receiver). */
  LOFT_ERR_MULT: 1.6,
  /** Chooser: the pass quality × (1 − RISK_WEIGHT · loss estimate). A miss is lost about MISS_LOSS of the time. */
  RISK_WEIGHT: 1,
  MISS_LOSS: 0.55,
  /** Estimated keep rate of a lofted pass for the chooser (FM: ~31% to the receiver, ~45% kept by the team). */
  LOFT_KEEP: 0.4,
  /** Through ball: the cell score × (1 − TB_RISK · (1 − race score)) — a race we may lose is worth less. */
  TB_RISK: 0.4,
  /** ...and × this for a ball into space longer than LOFT_YD (FM: almost every pass beyond ~27 m is lofted and contested). */
  TB_LONG_MULT: 0.85,

  // ── 2. Decision timing (FM: ~0.65 decisions per second, a carry is a 2 m step) ──
  /** A carry is a step this long (yd); the holder re-decides when it is done. */
  CARRY_STEP_YD: 2.2,
  /** ...or after this long (s) on the step (a slow or blocked carry). */
  CARRY_STEP_MAX_S: 0.8,
  /** Hold / turn last this long (s). */
  HOLD_S: 0.6,
  TURN_S: 0.4,
  /** Re-decide at once when an opponent comes this close (yd)... */
  INTERRUPT_YD: 4,
  /** ...and at least this much nearer (yd) than the nearest opponent when the action began. */
  INTERRUPT_CLOSE_YD: 1,
  /** ...or any opponent this close (yd): a challenge coming in. */
  CHALLENGE_YD: 3,
  /** Within this distance (yd) of the goal centre the holder reads the play every tick (a shot opens in a tick). */
  CADENCE_FREE_YD: 24,
  /** Hold only with the nearest opponent at least this far (yd): under a challenge he shields or plays instead. */
  HOLD_MIN_OPP_YD: 4,
  /** Hold: chosen in place of a weak carry (carry score below this, compressed) — keep the ball, wait for an option. */
  HOLD_CARRY_SCORE: 0.6,
  /** ...raised by up to this deep in his own half (0 from halfway on). */
  HOLD_OWN_THIRD_EXTRA: 0.08,
  /** ...and only when the best pass is not clearly better than the carry. */
  HOLD_PASS_MARGIN: 0.05,
  /** Hold speed (× carry speed): he edges away from the nearest opponent. */
  HOLD_SPEED: 0.25,
  /** Turn: the carry direction is this far (deg) from where he was moving, at this speed (yd/s) or more. */
  TURN_DEG: 60,
  TURN_MIN_SPEED: 0.8,
  TURN_SPEED: 0.45,

  // ── 3. Calmer pressing (FM: no dedicated presser 75% of the time; managers shift the shape 4–7 m) ──
  /** press_holder intent × this when the holder is in his own third (far from our goal), × MID in the middle third. */
  PRESS_OWN_THIRD: 0.55,
  PRESS_MID_THIRD: 0.85,
  /** The shape anchor shifts this far (yd) toward the ball (DEF / MID / FWD) instead of sending players onto him. */
  SHAPE_SHIFT_YD: { DEF: 5, MID: 7, FWD: 4 },
  /** ...only within this distance of the ball (yd); fades to 0 at twice it. */
  SHAPE_SHIFT_RANGE_YD: 25,
  /** ...never closer to the ball than this (yd): the shape moves, it does not crowd the ball. */
  SHAPE_SHIFT_KEEP_YD: 12,
  /** With two teammates already within this of the ball (yd), a third holding shape or marking stays at its edge. */
  BALL_CROWD_YD: 8.5,
  /** Ball in our defensive third: defenders / midfielders converge this share toward the ball's side. */
  BOX_CONVERGE: 0.35,

  // ── 4. Block that slides (FM: back line 58 yd from own goal in possession, 24 out of it) ──
  /** Out of possession: depth behind the ball × this (deeper block; also the back-line depth, `ballRelativeLineX`). */
  OUT_DEPTH_MULT: 1.15,
  /** In possession: the whole shape moves up IN_ADVANCE_YD plus IN_PUSH × (ball depth − halfway), uniformly. */
  IN_ADVANCE_YD: 8,
  IN_PUSH: 0.25,
  /** Out of possession: the whole shape drops this far (yd) toward its own goal (never inside OUT_MIN_YD of it). */
  OUT_DROP_YD: 5,
  OUT_MIN_YD: 8,
  /** In possession: lateral spread × this (FM team width 40 yd in possession). */
  IN_WIDTH: 0.85,
  /** Out of possession: lateral spread × this (FM 37 yd). */
  OUT_WIDTH: 0.92,

  // ── 5. Off-ball steps (FM setter targets DEF 4.4, MID 6, FWD 7 yd; default positioning held 10–19 s) ──
  STEP_YD: { GK: 1.6, DEF: 4.4, MID: 6, FWD: 7 },
  /** A held positioning intent (defensive and off-ball) is kept unless a new intent beats it by this margin. */
  INTENT_HYSTERESIS: 0.12,

  // ── 6. Shot limit (FM: no shot candidate beyond ~30 m in open play) ──
  SHOT_MAX_YD: 33,
  /** Shot score × SHOT_LEVEL_STEP^level; per-role baseline level (defenders "rarely" ×0.75). */
  SHOT_LEVEL_STEP: 1.25,
  SHOT_RARELY_MULT: 0.75,

  // ── 7. Tactic sensitivity (FM moves the weights gently) ──
  /** Attacking width ×0.9 / ×1 / ×1.1 (was ×0.75 / ×1 / ×1.2). */
  WIDTH_ATTACK_DAMPED: { narrow: 0.54, normal: 0.6, wide: 0.66 },
  /** Defensive mentality: the carry threshold + this (fewer carries); attacking: − this. */
  MENTALITY_CARRY_MIN: 0.05,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.FM_NUMBERS_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(FM_NUMBERS) as (keyof typeof FM_NUMBERS)[]) {
      const v = parsed[k];
      if (typeof v === 'number' && typeof FM_NUMBERS[k] === 'number') (FM_NUMBERS as Record<string, unknown>)[k] = v;
      else if (v && typeof v === 'object' && typeof FM_NUMBERS[k] === 'object') Object.assign(FM_NUMBERS[k] as object, v);
    }
  }
} catch { /* ignore a malformed override */ }
