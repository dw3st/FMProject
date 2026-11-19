/**
 * Player kinematics (`.claude/rules/game-engine/kinematics.md`): acceleration, braking, turning.
 *
 * Inspired by Football Manager's movement model (reverse-engineered: path ticks of 0.25 s, metres). Our engine works in
 * yards and steps of 0.2 real seconds (`SIM_STEP`), and every player's speed is in yards per real second, so FM's
 * per-tick numbers are turned into per-second rates and metres into yards (1 yd = 0.9144 m):
 *
 *   FM, per 0.25 s tick:  Δv(v) = 2 + v/24 − v²/48           (m/s, v in m/s)
 *   per second (× 4):     A(v)  = 8 + v/6 − v²/12            (m/s²)
 *   in yards (v = 0.9144 u, A_yd = A / 0.9144):
 *                         A(u)  = 8.749 + 0.1667 u − 0.0762 u²   (yd/s², u in yd/s)
 *
 * 8.75 yd/s² from standstill (= 8 m/s²), zero at 11.87 yd/s (10.85 m/s), above every top speed of ours (≤ ~11 yd/s).
 * Braking: FM 1.5–2.0 m/s per tick → 1.75 m/s per 0.25 s = 7 m/s² = 7.655 yd/s².
 *
 * `ENABLED: false` switches the layer off (the engine before kinematics, bit for bit): `/lab` A/B (`Variant.kinematics`)
 * and the measurement script (`scripts/kinematics-measure.ts --off`).
 */
export const KINEMATICS_CONFIG = {
  ENABLED: true,

  /** A(u) = A0 + A1·u − A2·u² (yd/s², u = current speed in yd/s). */
  ACCEL_A0: 8.749,
  ACCEL_A1: 0.1667,
  ACCEL_A2: 0.0762,
  /** Acceleration attribute (0..1) scales the law: × (BASE + SPAN · acceleration) — FM's 0.5 + 0.5·attr. */
  ACCEL_ATTR_BASE: 0.5,
  ACCEL_ATTR_SPAN: 0.5,
  /** Global tuning lever on acceleration (1 = FM's law). */
  ACCEL_SCALE: 1,
  /** Floor of the acceleration (yd/s²) so a player always gets going, even past the law's zero. */
  ACCEL_MIN: 0.5,

  /** Braking (yd/s²): arriving at a target, or slowing to a lower top speed. */
  BRAKE: 7.655,

  /** Turning: a change of heading above FREE_DEG costs top speed this step × (1 − min(Δ° × PER_DEG, MAX)). */
  TURN_FREE_DEG: 20,
  TURN_PER_DEG: 0.005,
  TURN_MAX_PENALTY: 0.6,
  /** Below this speed (yd/s) a player has no heading to turn from. */
  TURN_MIN_SPEED: 1,

  /**
   * With the ball: distance to full speed = 16 − dribbling(0..20)/5 metres (FM) = (FULL_SPEED_M − DRIBBLE_M × dribbling)
   * with dribbling 0..1, in metres (converted to yards at use). The carrier's acceleration is the lower of the normal
   * law and the constant acceleration that reaches his top speed over that distance, × CARRY_ACCEL_SCALE.
   */
  CARRY_FULL_SPEED_M: 16,
  CARRY_DRIBBLE_M: 4,
  /**
   * × FM's with-ball law. At 1 (FM as reverse-engineered) a standing carrier needs ~4 s to reach his carry speed and the
   * engine lost ~21% of its goals (carriers are caught from behind: tackle attempts +26%); 3 brings goals and shots back
   * within ±1% (measured, `kinematics.md`).
   */
  CARRY_ACCEL_SCALE: 3,

  /**
   * Global foul compensation while the layer is on: carriers caught from behind draw ~20% more tackle attempts and ~11%
   * more fouls in all (`kinematics.md`). × this on every foul chance, so the world's fouls, cards and suspensions stay.
   */
  FOUL_MULT: 0.9,

  /** A sprint: speed ≥ SPRINT_FRACTION × the player's top running speed (pressSpeed / carrySpeed) for SPRINT_SECONDS. */
  SPRINT_FRACTION: 0.85,
  SPRINT_SECONDS: 1,
};

export type KinematicsConfig = typeof KINEMATICS_CONFIG;

/** Metres per yard. */
export const M_PER_YD = 0.9144;
