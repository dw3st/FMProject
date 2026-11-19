/**
 * The 3D ball (stage 3, `.claude/rules/game-engine/ball-3d.md`): position x, y, z and velocity vx, vy, vz in yards and
 * yards per second of the sim step. Gravity, bounce (restitution, grip), rolling friction. Pure: no state, no draws.
 *
 * Two ways to move it:
 *  - `stepFree`: a loose ball, nobody steering it (gravity, bounces, rolling);
 *  - `stepGuided`: a pass / shot in flight. The engine still decides when it arrives (stage 4 makes the pass free):
 *    the horizontal speed is the one that reaches the target in the time left (constant in the air, decelerating on
 *    the ground), the vertical is free physics from the launch.
 */
import { BALL_PHYSICS } from '@/GameEngine/Configs/BallPhysicsConfig';

export interface Ball3D {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

/** What the ground does to the ball (weather multipliers already applied). */
export interface BallEnv {
  /** Rolling deceleration (yd/s²). */
  rollDecel: number;
  /** Multiplier of the restitution (wet grass bounces lower). */
  bounce: number;
}

/** `air`: no friction while it flies (high ball, shot); `ground`: rolls and slows down (ground pass). */
export type FlightProfile = 'air' | 'ground';

const G = () => BALL_PHYSICS.GRAVITY;

/** True when the ball is off the ground or going up. */
export function isAirborne(b: Ball3D): boolean {
  return b.z > 1e-6 || b.vz > 1e-6;
}

/** Peak height of a ball going up from `z` at `vz` (z itself when going down). */
export function apexOf(z: number, vz: number): number {
  return vz > 0 ? z + (vz * vz) / (2 * G()) : z;
}

/** One airborne sub-step: ballistic, bounce on the grass. Mutates `b`; returns true when it bounced. */
function airSub(b: Ball3D, h: number, env: BallEnv): boolean {
  const g = G();
  const z1 = b.z + b.vz * h - 0.5 * g * h * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  if (z1 > 0) {
    b.z = z1;
    b.vz -= g * h;
    return false;
  }
  // Hits the grass inside this sub-step: the speed at contact, reflected.
  const vImpact = -Math.sqrt(Math.max(0, b.vz * b.vz + 2 * g * b.z));
  b.z = 0;
  const up = -vImpact * BALL_PHYSICS.RESTITUTION * env.bounce;
  b.vx *= BALL_PHYSICS.BOUNCE_KEEP;
  b.vy *= BALL_PHYSICS.BOUNCE_KEEP;
  b.vz = up < BALL_PHYSICS.SETTLE_VZ ? 0 : up;
  return true;
}

/** Rolling on the grass for `dt` (same scheme as the loose ball of old: moves at the old speed, then slows down). */
function rollStep(b: Ball3D, dt: number, env: BallEnv): void {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed <= 0) return;
  const next = Math.max(0, speed - env.rollDecel * dt);
  const k = next / speed;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.vx *= k;
  b.vy *= k;
}

export interface FreeStep {
  ball: Ball3D;
  /** Bounces during the step. */
  bounces: number;
  /** Seconds of the step spent above `AIR_Z`. */
  air: number;
  /** Highest point reached during the step. */
  peak: number;
}

/**
 * A loose ball for `dt` seconds. On the ground (z 0, vz 0) it is exactly the rolling of old (one step); in the air
 * it is integrated in sub-steps and rolls for whatever is left once it settles.
 */
export function stepFree(ball: Ball3D, dt: number, env: BallEnv): FreeStep {
  const b = { ...ball };
  let bounces = 0, air = 0, peak = b.z;
  if (!isAirborne(b)) {
    rollStep(b, dt, env);
    return { ball: b, bounces, air, peak };
  }
  peak = Math.max(peak, apexOf(b.z, b.vz));
  let left = dt;
  while (left > 1e-9 && isAirborne(b)) {
    const h = Math.min(BALL_PHYSICS.SUBSTEP, left);
    if (b.z > BALL_PHYSICS.AIR_Z) air += h;
    if (airSub(b, h, env)) bounces++;
    left -= h;
  }
  if (left > 1e-9) rollStep(b, left, env);
  return { ball: b, bounces, air, peak };
}

/** Vertical motion only (x, y untouched), for `dt` seconds: where a flight's height is when it arrives. */
export function stepVertical(ball: Ball3D, dt: number, env: BallEnv): Ball3D {
  const b = { ...ball };
  const x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  let left = dt;
  while (left > 1e-9 && isAirborne(b)) {
    const h = Math.min(BALL_PHYSICS.SUBSTEP, left);
    airSub(b, h, env);
    left -= h;
  }
  return { ...b, x, y, vx, vy };
}

/** Vertical launch speed that takes the ball from `z0` to `z1` in `T` seconds of free flight. */
export function launchVz(z0: number, z1: number, T: number): number {
  if (!(T > 0)) return 0;
  return (z1 - z0) / T + 0.5 * G() * T;
}

/** Horizontal speed now along the profile that covers `dist` yards in `T` seconds (≥ 0). */
export function profileSpeed(dist: number, T: number, profile: FlightProfile, rollDecel: number): number {
  if (!(T > 0)) return 0;
  const v = profile === 'air' ? dist / T : dist / T + 0.5 * rollDecel * T;
  return Math.max(0, v);
}

/**
 * A ball launched from `from` toward `to` (x, y, z) to arrive in `T` seconds: horizontal velocity of the profile,
 * vertical to reach `to.z` at T (an air profile), or straight along the ground (vz 0).
 */
export function launchToward(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  T: number,
  profile: FlightProfile,
  rollDecel: number,
): Ball3D {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  const v = profileSpeed(d, T, profile, rollDecel);
  const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 0;
  const vz = profile === 'air' ? launchVz(from.z, to.z, T) : 0;
  return { x: from.x, y: from.y, z: from.z, vx: ux * v, vy: uy * v, vz };
}

/**
 * A guided flight for `dt` seconds toward `target` (which may have moved) with `Trem` seconds left before `dt`
 * started. Horizontal: the profile speed that reaches the target in `Trem`; vertical: free physics. At the end of the
 * flight (Trem ≤ dt) the ball is on the target, at `arriveZ` when given (an air flight lands where it was aimed).
 */
export function stepGuided(
  ball: Ball3D,
  target: { x: number; y: number },
  Trem: number,
  dt: number,
  profile: FlightProfile,
  env: BallEnv,
  arriveZ?: number,
): FreeStep {
  const dx = target.x - ball.x, dy = target.y - ball.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 0;
  let b: Ball3D;
  let peak = ball.z;
  let air = 0;
  let bounces = 0;
  if (isAirborne(ball)) {
    peak = Math.max(peak, apexOf(ball.z, ball.vz));
    const vert = stepFree({ ...ball, vx: 0, vy: 0 }, Math.min(dt, Math.max(0, Trem)), env);
    air = vert.air; bounces = vert.bounces;
    b = { ...ball, z: vert.ball.z, vz: vert.ball.vz };
  } else {
    b = { ...ball };
  }
  if (Trem <= dt + 1e-9) {
    b.x = target.x; b.y = target.y;
    if (arriveZ !== undefined) { b.z = arriveZ; }
    const v = profile === 'air' ? profileSpeed(d, Math.max(Trem, 1e-3), 'air', 0) : Math.max(0, profileSpeed(d, Math.max(Trem, 1e-3), 'ground', env.rollDecel) - env.rollDecel * Trem);
    b.vx = ux * v; b.vy = uy * v;
    return { ball: b, bounces, air, peak };
  }
  const v0 = profileSpeed(d, Trem, profile, env.rollDecel);
  const onGround = profile === 'ground';
  const move = onGround ? Math.min(d, v0 * dt - 0.5 * env.rollDecel * dt * dt) : v0 * dt;
  const v1 = onGround ? Math.max(0, v0 - env.rollDecel * dt) : v0;
  b.x = ball.x + ux * move;
  b.y = ball.y + uy * move;
  b.vx = ux * v1; b.vy = uy * v1;
  return { ball: b, bounces, air, peak };
}

/** The path of a free ball over the next `seconds` (points every `step` s), for the `/test` overlay. */
export function predictPath(ball: Ball3D, seconds: number, step: number, env: BallEnv): Ball3D[] {
  const out: Ball3D[] = [{ ...ball }];
  let b = { ...ball };
  for (let t = step; t <= seconds + 1e-9; t += step) {
    b = stepFree(b, step, env).ball;
    out.push(b);
  }
  return out;
}

/** Where a free ball first touches the grass (null when it is on the ground already or never comes down in 5 s). */
export function landingPoint(ball: Ball3D, env: BallEnv): { x: number; y: number; t: number } | null {
  if (!isAirborne(ball)) return null;
  const b = { ...ball };
  let t = 0;
  while (t < 5) {
    const h = BALL_PHYSICS.SUBSTEP;
    if (airSub(b, h, env)) return { x: b.x, y: b.y, t: t + h };
    t += h;
  }
  return null;
}

/** Highest ball a player can play (yd). */
export function reachHeight(isKeeper: boolean): number {
  return isKeeper ? BALL_PHYSICS.REACH_KEEPER : BALL_PHYSICS.REACH_OUTFIELD;
}

/** Deterministic 0..1 from a few numbers (no draw from the match generator). */
export function geomFraction(...v: number[]): number {
  let h = 0;
  for (const n of v) h = Math.sin(h * 12.9898 + n * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
