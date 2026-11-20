/**
 * Movement and ball physics of the engine rebuild, stage 4 (`.claude/rules/game-engine/movement.md`).
 *
 * FM27's reference values (read from the FM27 Mobile config, ported as our own constants; FM measures in metres, the
 * engine in yards): distance bands 5/9/13/18/22/27/31/35 m (a short pass ≤ 9 m, a long one ≥ 31 m), a speed ladder of
 * 1..8 mph with the line-speed thresholds at 3 and 10 mph, a 12 m pressure radius, a 0.25 s tick. The switches live in
 * `DECISION_FLAGS` (`ROLLING_BALL`, `DEFLECTIONS`, `SHOT_BLOCKS`, `BACK_LINE`, `SECOND_PRESSER`, `SUPPORT_SHORT`,
 * `ANTICIPATION_PRESS`), so `DECISION_OVERRIDES` and `simulateMatch(..., { decisions })` measure each one on or off.
 *
 * `MOVEMENT_OVERRIDES='{"SHOT_BLOCK_BASE":0.2}'` (env, read once at load) tunes the numbers.
 */

/** 1 metre in yards. */
export const YD_PER_M = 1.0936;
/** 1 mph in yards per second. */
export const YDS_PER_MPH = 0.4889;

/** FM's distance bands (metres). */
export const FM_DISTANCE_BANDS_M = [5, 9, 13, 18, 22, 27, 31, 35] as const;
/** A pass this long or shorter is "short" (FM band 2). */
export const SHORT_PASS_M = 9;
/** A pass this long or longer is "long" (FM band 7). */
export const LONG_PASS_M = 31;

export type PassLengthBand = 'short' | 'medium' | 'long';

/** Pass length class from a distance in yards (FM bands). */
export function passLengthBand(yards: number): PassLengthBand {
  const m = yards / YD_PER_M;
  return m <= SHORT_PASS_M ? 'short' : m >= LONG_PASS_M ? 'long' : 'medium';
}

/** FM distance band index 0..8 (0 = under 5 m, 8 = beyond 35 m) of a distance in yards. */
export function fmDistanceBand(yards: number): number {
  const m = yards / YD_PER_M;
  let i = 0;
  while (i < FM_DISTANCE_BANDS_M.length && m > FM_DISTANCE_BANDS_M[i]!) i++;
  return i;
}

export const MOVEMENT = {
  // ── 1. Rolling ball and deflections ────────────────────────────────────────
  /** A through ball that lands beyond its target rolls on: extra residual speed (yd/s) per yard of overhit. */
  OVERHIT_SPEED_PER_YD: 1.1,
  /** Cap on the residual speed of an overhit through ball (yd/s). */
  OVERHIT_MAX_SPEED: 9,
  /** A long pass (≥ LONG_PASS_M) to feet can be miscontrolled: chance = HEAVY_TOUCH_BASE × length factor × (1 − first touch). */
  HEAVY_TOUCH_BASE: 0.12,
  /** The heavy touch runs on in the pass direction at this speed (yd/s). */
  HEAVY_TOUCH_SPEED: 6,
  /** Share of successful interceptions that are deflections (the ball bounces off the body, nobody controls it). */
  DEFLECT_SHARE: 0.3,
  /** A deflected pass leaves at this share of the pass flight speed, its direction turned by up to DEFLECT_MAX_DEG. */
  DEFLECT_SPEED_SHARE: 0.32,
  DEFLECT_MAX_DEG: 70,
  /** Open-play shot block: a defender (not the keeper) within SHOT_BLOCK_WIDTH yd of the shot line, in its first
   *  SHOT_BLOCK_DEPTH yd, gets chance SHOT_BLOCK_BASE × (1 − perp/width). */
  SHOT_BLOCK_DEPTH: 8,
  SHOT_BLOCK_WIDTH: 1.8,
  SHOT_BLOCK_BASE: 0.32,
  /** The blocked shot rebounds at U(MIN, MAX) yd/s, back toward the shooter within ±REBOUND_MAX_DEG. */
  SHOT_REBOUND_MIN: 5,
  SHOT_REBOUND_MAX: 11,
  SHOT_REBOUND_MAX_DEG: 75,

  // ── 2. The back line as a robust mean ──────────────────────────────────────
  /** Outliers clamped to ±LINE_CLAMP_M metres of the median before the mean. */
  LINE_CLAMP_M: 6,
  /** Target x of a back-liner = OWN × his own target + LINE × the line + BALL × the ball-relative depth. */
  // Stage 21 (`fm-numbers.md` → "Etapa 21"): own 0.5 → 0.2, line and ball 0.25 → 0.4, and markers hold the line too
  // (LINE_TRACK_MARK 0 → 1): with zonal markers free to follow their man the out-of-possession line sat at 37 yd (FM 24)
  // whatever the shape target; now ~29.
  LINE_OWN_W: 0.2,
  LINE_LINE_W: 0.4,
  LINE_BALL_W: 0.4,
  /** 1 = a zonal back-liner tracking a mark also holds the line; 0 = only those holding shape. */
  LINE_TRACK_MARK: 1,
  /** The line moves when the wanted rate (gap / LINE_REACTION_S) passes LINE_MOVE_MPH, and holds again below
   *  LINE_HOLD_MPH (hysteresis; FM's 10 and 3 mph). */
  LINE_REACTION_S: 1,
  LINE_MOVE_MPH: 10,
  LINE_HOLD_MPH: 3,
  /** While moving the line itself travels at most this fast (mph, FM's ladder top). */
  LINE_MAX_MPH: 8,

  // ── 3. Second presser stands off ───────────────────────────────────────────
  /** A second defender with press_holder while a teammate already presses stops STAND_OFF_YD short of the holder,
   *  on the line to his own goal, shifted STAND_OFF_INSIDE_YD toward the centre (cutting the inside route). */
  STAND_OFF_YD: 5,
  STAND_OFF_INSIDE_YD: 2.5,
  /** The first presser counts when within this distance of the holder (yd). */
  FIRST_PRESSER_YD: 6,

  // ── 4. Support comes short ─────────────────────────────────────────────────
  /** Pressed holder: raw P (`Pressure.ts`) at or above this, or the holder's release verdict. */
  SUPPORT_PRESSURE: 25,
  /** The nearest outfield teammate (defender / midfielder) within SUPPORT_RANGE_YD gets offer_support × SUPPORT_BOOST
   *  and a support anchor SUPPORT_SHORT_YD from the holder. */
  SUPPORT_RANGE_YD: 22,
  SUPPORT_BOOST: 2.2,
  SUPPORT_SHORT_YD: 8,

  // ── 5. Anticipation ────────────────────────────────────────────────────────
  /** Reading the play: lookahead (s) = ANTICIPATION_BASE_S + ANTICIPATION_SPAN_S × (anticipation stretched to the world,
   *  0..1 at MENTAL_TOP). Used for the press start (the holder's predicted point) and the loose / through ball chase
   *  (the predicted landing / roll point). */
  ANTICIPATION_BASE_S: 0,
  ANTICIPATION_SPAN_S: 0.7,
  /** Press start: an anticipating defender scores press_holder with the predicted distance (capped gain, yd). */
  ANTICIPATION_PRESS_MAX_YD: 4,
  /** Loose / through ball race: a chaser's ETA − ANTICIPATION_CHASE × lookahead when the chasers are picked. */
  ANTICIPATION_CHASE: 0.5,
  /** Interception reach × (1 + ANTICIPATION_INTERCEPT × (anticipation − mean)) . */
  ANTICIPATION_INTERCEPT: 0.3,
  /** Mean anticipation of the world (0..1): the neutral point of the interception gain. */
  ANTICIPATION_MEAN: 0.29,

  // ── Recovery run (stage 21, `team-shape.md`) ───────────────────────────────
  /** Out of possession, a player more than this far up the pitch from his target (yd) runs back faster... */
  RECOVER_GAP_YD: 8,
  /** ...at this × his speed (1 = off; stage 21: 1.6, the kinematic law caps it near 9 yd/s). */
  RECOVER_SPEED_MULT: 1.6,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.MOVEMENT_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(MOVEMENT) as (keyof typeof MOVEMENT)[]) {
      if (typeof parsed[k] === 'number') (MOVEMENT as Record<string, number>)[k] = parsed[k] as number;
    }
  }
} catch { /* ignore a malformed override */ }
