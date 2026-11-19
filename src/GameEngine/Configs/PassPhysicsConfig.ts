/**
 * The physical pass (engine rebuild stage 4, `.claude/rules/game-engine/pass-physics.md`). FM27's launch as measured
 * in reports 6, 7 and 9, in FM's units (metres, m/s); the engine converts. These are FM's measurements, not tuning:
 * nothing here is fitted to a match volume.
 */
export const PASS_PHYSICS = {
  /** Launch speed |v| = SPEED_BASE + SPEED_PER_M · d (m/s, d in metres to the target; FM fit, report 6). */
  SPEED_BASE: 7,
  SPEED_PER_M: 0.45,
  /**
   * Vertical launch speed of a pass by distance (FM medians, report 6: 0–10 m 0.85, 10–20 1.8, 20–30 4.7, 30–45 10.2,
   * 45–80 14.3 m/s), as points (band centre, vz) interpolated linearly, flat beyond the ends.
   */
  VZ_BY_M: [[5, 0.85], [15, 1.8], [25, 4.7], [37.5, 10.2], [62.5, 14.3]] as ReadonlyArray<readonly [number, number]>,
  /** Peak height of the high balls (m, FM medians of report 9 §3): cross, corner, long ball and clearance. */
  PEAK_CROSS_M: 4.0,
  PEAK_CORNER_M: 5.6,
  PEAK_LONG_M: 4.4,
  PEAK_CLEARANCE_M: 4.4,
  /** A pass launched above this vz (m/s) counts as lofted / a high through ball (FM's 3–6 m/s band starts lofting). */
  LOFTED_VZ: 3,
  /** Below this the pass is driven along the ground (FM's ≤ 1 m/s band). */
  GROUND_VZ: 1,
  /**
   * σ of the vertical launch error as a share of the speed error (FM: speed error ≈ ±0.7 m/s, height ≈ ±0.5 m/s,
   * report 6). The direction and speed errors are the 4b ones (`FM_NUMBERS.ERR_ANGLE_DEG`, `ERR_REL`).
   */
  VZ_ERR_SHARE: 0.7,
  /** A ground pass the ball stopped short of (slower than this, yd/s) is a loose ball. */
  STOP_SPEED_YD: 0.8,
  /**
   * A player plays a moving ball that passes within this of him (yd): a through ball runs loose to him, and a loose
   * ball faster than MOVING_SPEED_YD is picked up along its path within it (a ball at rest keeps the old 0.5 yd).
   */
  MOVING_TOUCH_YD: 1.0,
  MOVING_SPEED_YD: 2,
  /** Integration step of the physical pass (s): the receiver is checked along the path at this step. */
  SUBSTEP: 0.02,
  /**
   * The pass score reads the arrival time against the defenders' (`PassLanes`): a defender who reaches a point of the
   * path, after his reaction, LANE_CLEAR_S later than the ball leaves it clear (score 1); at the same time or before,
   * blocked (0). He plays the ball from LANE_REACH_YD; LANE_REACTION_S before he moves.
   */
  LANE_CLEAR_S: 0.5,
  LANE_REACH_YD: 1.0,
  LANE_REACTION_S: 0.25,
  /** Points sampled along the path for the timing lane score. */
  LANE_SAMPLES: 8,
  /** Parts of the mechanic, for measuring each (`PASS_PHYSICS_OVERRIDES='{"MEET":false}'`): the receiver goes to meet
   *  the ball; the pass score reads the arrival times. */
  MEET: true,
  ARRIVAL_LANE: true,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.PASS_PHYSICS_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(PASS_PHYSICS) as (keyof typeof PASS_PHYSICS)[]) {
      const v = parsed[k];
      if (v !== undefined && typeof v === typeof PASS_PHYSICS[k]) (PASS_PHYSICS as Record<string, unknown>)[k] = v;
    }
  }
} catch { /* ignore a malformed override */ }

/** 1 m in yards / m per yard. */
export const YD_PER_M_PASS = 1.0936;
