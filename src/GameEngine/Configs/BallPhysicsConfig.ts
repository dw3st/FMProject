/**
 * Physics of the 3D ball (stage 3 of the engine rebuild, `.claude/rules/game-engine/ball-3d.md`). Yards and seconds of
 * the sim step (the same `dt` the players move with). Physical constants, not tuning: nothing here is fitted to a
 * match volume.
 */
export const BALL_PHYSICS = {
  /** 9.81 m/s² in yards. */
  GRAVITY: 10.73,
  /** Vertical speed kept by a bounce on grass (coefficient of restitution). */
  RESTITUTION: 0.55,
  /** Horizontal speed kept by a bounce (the grass grips the ball). */
  BOUNCE_KEEP: 0.82,
  /** Below this upward speed after a bounce the ball stops hopping and rolls (yd/s). */
  SETTLE_VZ: 0.6,
  /** Integration step for an airborne ball (seconds): bounces are found within this. */
  SUBSTEP: 0.02,
  /** Above this height (yd) the ball counts as in the air (`Statistics.ts` air time). */
  AIR_Z: 0.1,
  /** A flight peaking above this height (1.2 m, the FM definition of "met in the air") is a high ball. */
  HIGH_BALL_Z: 1.31,
  /** Height of the ball at a player's feet / head when he plays it (yd). */
  FOOT_Z: 0.12,
  HEAD_Z: 1.95,
  /**
   * Highest ball a player can play (yd): an outfield player's head with a small jump (2.2 m), a keeper's hands
   * (2.75 m). A loose ball above it can't be collected.
   */
  REACH_OUTFIELD: 2.4,
  REACH_KEEPER: 3.0,
  /** Height of the crossbar (2.44 m). */
  CROSSBAR_Z: 2.67,
  /**
   * Crossing height of a shot on the goal line (stage 7 replaces it with the real aim): spread between LOW and HIGH,
   * a header between HEADER_LOW and HEADER_HIGH. Picked from the shot geometry, no draw.
   */
  SHOT_Z_LOW: 0.2,
  SHOT_Z_HIGH: 2.3,
  HEADER_Z_LOW: 0.25,
  HEADER_Z_HIGH: 1.3,
};
