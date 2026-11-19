/**
 * Player kinematics (`.claude/rules/game-engine/kinematics.md`): pure. A player has a velocity; each step he
 * accelerates toward his top speed (the speed the engine computes for his action), brakes to arrive at his target
 * instead of stopping dead, never overshoots it, and loses top speed on a sharp turn.
 *
 * Units: yards, yards per second, seconds. No `Math.random`, no state.
 */
import { KINEMATICS_CONFIG, M_PER_YD, type KinematicsConfig } from "@/GameEngine/Configs/KinematicsConfig";

export interface KinBody {
  x: number;
  y: number;
  /** Velocity at the start of the step (yd/s). */
  vx: number;
  vy: number;
  /** Acceleration attribute, 0..1 (`runtimeStats.*.acceleration`). */
  accel: number;
}

export interface KinOptions {
  /** Brake to arrive at the target (off for a carrier heading in a direction). */
  arrive: boolean;
  /** Carrying the ball: dribbling 0..1 sets the distance to full speed. */
  carryDribbling?: number;
  /**
   * The top speed fell because the player is beaten / recovering (`recoveryTime`): drop to it at once instead of
   * braking — the stumble of the duel loser.
   */
  dropToTop?: boolean;
}

export interface KinStep {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Speed after the step (yd/s). */
  speed: number;
  /** Turn factor applied to the top speed this step (1 = no turn penalty). */
  turn: number;
}

/** FM's acceleration law (yd/s²) at `speed`, scaled by the acceleration attribute. */
export function accelAt(speed: number, accel: number, cfg: KinematicsConfig = KINEMATICS_CONFIG): number {
  const law = cfg.ACCEL_A0 + cfg.ACCEL_A1 * speed - cfg.ACCEL_A2 * speed * speed;
  const attr = cfg.ACCEL_ATTR_BASE + cfg.ACCEL_ATTR_SPAN * Math.max(0, Math.min(1, accel));
  return Math.max(cfg.ACCEL_MIN, law * attr * cfg.ACCEL_SCALE);
}

/** Constant acceleration that reaches `vTop` over the carrier's distance to full speed (yd/s²). */
export function carryAccel(vTop: number, dribbling: number, cfg: KinematicsConfig = KINEMATICS_CONFIG): number {
  const fullM = cfg.CARRY_FULL_SPEED_M - cfg.CARRY_DRIBBLE_M * Math.max(0, Math.min(1, dribbling));
  const fullYd = Math.max(1, fullM / M_PER_YD);
  return (vTop * vTop) / (2 * fullYd) * cfg.CARRY_ACCEL_SCALE;
}

/** Turn factor for a heading change of `deg` degrees (FM: above 20°, top speed × (100 − min(Δ/2, 60))%). */
export function turnFactor(deg: number, cfg: KinematicsConfig = KINEMATICS_CONFIG): number {
  if (deg <= cfg.TURN_FREE_DEG) return 1;
  return 1 - Math.min(deg * cfg.TURN_PER_DEG, cfg.TURN_MAX_PENALTY);
}

function advance(
  body: KinBody, dirX: number, dirY: number, dist: number, vTop: number, dt: number, opts: KinOptions, cfg: KinematicsConfig,
): KinStep {
  const speed0 = Math.hypot(body.vx, body.vy);
  let turn = 1;
  if (speed0 > cfg.TURN_MIN_SPEED) {
    const cos = Math.max(-1, Math.min(1, (body.vx * dirX + body.vy * dirY) / speed0));
    turn = turnFactor((Math.acos(cos) * 180) / Math.PI, cfg);
  }
  const cap = Math.max(0, vTop * turn);
  let a = accelAt(speed0, body.accel, cfg);
  if (opts.carryDribbling !== undefined) a = Math.min(a, Math.max(cfg.ACCEL_MIN, carryAccel(vTop, opts.carryDribbling, cfg)));

  let s: number;
  if (speed0 <= cap) s = Math.min(speed0 + a * dt, cap);
  else if (turn < 1 || opts.dropToTop) s = cap;
  else s = Math.max(cap, speed0 - cfg.BRAKE * dt);

  if (opts.arrive && Number.isFinite(dist)) {
    // Stopping speed for the distance left: decelerate in time, at most BRAKE per step.
    const vArr = Math.sqrt(2 * cfg.BRAKE * dist);
    if (s > vArr) s = Math.min(s, Math.max(vArr, speed0 - cfg.BRAKE * dt));
    // Never overshoot the target.
    s = Math.min(s, dist / dt);
  }
  const step = s * dt;
  return { x: body.x + dirX * step, y: body.y + dirY * step, vx: dirX * s, vy: dirY * s, speed: s, turn };
}

/** One step toward a target point, braking to arrive. */
export function stepToward(
  body: KinBody, tx: number, ty: number, vTop: number, dt: number, opts: Omit<KinOptions, "arrive"> = {},
  cfg: KinematicsConfig = KINEMATICS_CONFIG,
): KinStep {
  const dx = tx - body.x;
  const dy = ty - body.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) return { x: body.x, y: body.y, vx: 0, vy: 0, speed: 0, turn: 1 };
  return advance(body, dx / dist, dy / dist, dist, vTop, dt, { ...opts, arrive: true }, cfg);
}

/** One step along a unit direction (the carrier), no arrival. */
export function stepAlong(
  body: KinBody, dirX: number, dirY: number, vTop: number, dt: number, opts: Omit<KinOptions, "arrive"> = {},
  cfg: KinematicsConfig = KINEMATICS_CONFIG,
): KinStep {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-9) return { x: body.x, y: body.y, vx: 0, vy: 0, speed: 0, turn: 1 };
  return advance(body, dirX / len, dirY / len, Infinity, vTop, dt, { ...opts, arrive: false }, cfg);
}

/**
 * Seconds to cover `dist` from speed `v0` (the velocity component toward the point, ≥ 0) with top speed `vTop` and
 * acceleration `a` (taken constant: the law at the mid speed of the run-up). Ignores turning and braking.
 */
export function timeToCover(dist: number, v0: number, vTop: number, a: number): number {
  if (vTop < 0.01) return Infinity;
  if (dist <= 0) return 0;
  const start = Math.max(0, Math.min(v0, vTop));
  const tAcc = (vTop - start) / a;
  const dAcc = ((start + vTop) / 2) * tAcc;
  if (dAcc >= dist) return (-start + Math.sqrt(start * start + 2 * a * dist)) / a;
  return tAcc + (dist - dAcc) / vTop;
}

/**
 * Race estimate for the decisions (chaser selection, through-ball race margin, loose ball, sweeper): seconds for a
 * player at (x, y) moving at (vx, vy) to reach (tx, ty) at top speed `vTop`. With the layer off, `dist / vTop` — the
 * estimate of the engine before kinematics.
 */
export function etaTo(
  p: { x: number; y: number; vel?: { x: number; y: number }; kin?: { x: number; y: number } }, accel: number,
  tx: number, ty: number, dist: number, vTop: number, cfg: KinematicsConfig = KINEMATICS_CONFIG,
): number {
  if (!cfg.ENABLED) return vTop > 0.01 ? dist / vTop : Infinity;
  if (vTop < 0.01) return Infinity;
  // The velocity counts only while he is where his last step ended (a teleport leaves him standing).
  const moving = p.vel && p.kin && p.kin.x === p.x && p.kin.y === p.y;
  const vx = moving ? p.vel!.x : 0;
  const vy = moving ? p.vel!.y : 0;
  const v0 = dist > 0.01 ? Math.max(0, (vx * (tx - p.x) + vy * (ty - p.y)) / dist) : 0;
  const a = accelAt((Math.min(v0, vTop) + vTop) / 2, accel, cfg);
  return timeToCover(dist, v0, vTop, a);
}
