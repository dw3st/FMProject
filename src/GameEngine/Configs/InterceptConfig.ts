/**
 * The physical interception (engine rebuild stage 5, `.claude/rules/game-engine/interception.md` → "Stage 5"). No
 * interception dice: a defender who reaches a point of the ball's path in time, at a height he can play, touches it;
 * the touch decides control, a clearance, a deflection or the ball running past him. Design constants of the model,
 * not fitted to any match volume (the calibration is stage 21). `INTERCEPT_OVERRIDES='{"MAX_RUNNERS":3}'` (env, read
 * once at load) changes them for measuring.
 */
export const INTERCEPT = {
  // ── reaching the path ──
  /** Seconds before a defender reacts to a pass (the arrival-lane score's reaction, `PASS_PHYSICS.LANE_REACTION_S`). */
  REACTION_S: 0.45, // stage 21: 0.25 → 0.45 and the body reach 1.3 → 0.7 yd: interceptions 115 → 75–95 (FM 59)
  /** Body reach across the ball (yd, the receiver's `FM_NUMBERS.REACH_SIDE_YD`) + REACH_TACKLE_YD × tackling: a leg put in. */
  REACH_BODY_YD: 0.7,
  REACH_TACKLE_YD: 0.6,
  /** The ball's path is predicted this far ahead (s) and sampled every PLAN_STEP_S. */
  PLAN_HORIZON_S: 3,
  PLAN_STEP_S: 0.1,
  /** At most this many defenders per pass run at their intercept point (the earliest ones). */
  MAX_RUNNERS: 2,
  // ── the touch ──
  /** Control of the touch: CONTROL_BASE + CONTROL_TOUCH × first touch (the keeper with his hands: KEEPER_CONTROL). */
  CONTROL_BASE: 0.45,
  CONTROL_TOUCH: 0.45,
  KEEPER_CONTROL: 0.92,
  /** At the edge of his reach the control × (1 − EDGE_LOSS); in the middle × 1. */
  EDGE_LOSS: 0.6,
  /** A ball faster than SPEED_FREE_MS (m/s) is harder to keep: × (1 − (v − free) / SPEED_SPAN_MS), floor SPEED_FLOOR. */
  SPEED_FREE_MS: 10,
  SPEED_SPAN_MS: 25,
  SPEED_FLOOR: 0.4,
  /** A ball above the knee (yd) is played with the body or a stretched leg: control × HIGH_TOUCH. */
  KNEE_YD: 0.6,
  HIGH_TOUCH: 0.7,
  /** Of the touches he does not control, the share that runs past him at the edge of his reach (× offset). */
  MISS_EDGE_SHARE: 0.6,
  /** A defender within this of his own goal line (yd) clears a touch he does not control, unless at the edge (offset > CLEAR_MAX_OFFSET). */
  CLEAR_ZONE_YD: 35,
  CLEAR_MAX_OFFSET: 0.6,
  /** A clearance goes this far (yd): CLEAR_MIN_YD + random × CLEAR_SPAN_YD. */
  CLEAR_MIN_YD: 16,
  CLEAR_SPAN_YD: 12,
  /** A deflection keeps this share of the ball's speed, turned by up to DEFLECT_MAX_DEG. */
  DEFLECT_KEEP: 0.4,
  DEFLECT_MAX_DEG: 70,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.INTERCEPT_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(INTERCEPT) as (keyof typeof INTERCEPT)[]) {
      const v = parsed[k];
      if (v !== undefined && typeof v === typeof INTERCEPT[k]) (INTERCEPT as Record<string, unknown>)[k] = v;
    }
  }
} catch { /* ignore a malformed override */ }
