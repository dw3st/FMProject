/**
 * The physical pass (engine rebuild stage 4, `.claude/rules/game-engine/pass-physics.md`). A pass is a launch: FM's
 * speed by distance (|v| = 7 + 0.45·d m/s), vertical speed by type and distance, and the passer's error applied to the
 * vector (direction, speed, height). After the kick the 3D ball flies on its own (`Ball3D.ts`): where and when it
 * arrives is the physics, not a fixed flight time. Pure: no state, the normals are passed in.
 */
import { BALL_PHYSICS } from '@/GameEngine/Configs/BallPhysicsConfig';
import { PASS_PHYSICS as P, YD_PER_M_PASS as YD } from '@/GameEngine/Configs/PassPhysicsConfig';
import { FM_NUMBERS } from '@/GameEngine/Configs/FmNumbersConfig';
import { stepFree, type Ball3D, type BallEnv } from '@/GameEngine/Domain/Ball3D';

import type { PassType } from '@/GameEngine/types';
export type { PassType } from '@/GameEngine/types';

export const PASS_TYPES: readonly PassType[] = [
  'ground', 'driven', 'chip', 'high', 'through_low', 'through_high', 'cross', 'corner', 'long', 'clearance', 'header',
];

export interface LaunchVector { vx: number; vy: number; vz: number }

const G = () => BALL_PHYSICS.GRAVITY;

/** FM's launch speed (yd/s) for a target `dYd` yards away. */
export function launchSpeedYd(dYd: number): number {
  const dM = Math.max(0, dYd) / YD;
  return (P.SPEED_BASE + P.SPEED_PER_M * dM) * YD;
}

/** FM's vertical launch speed (yd/s) of a pass by distance (report 6 medians, interpolated). */
export function loftVzYd(dYd: number): number {
  const dM = Math.max(0, dYd) / YD;
  const t = P.VZ_BY_M;
  if (dM <= t[0]![0]) return t[0]![1] * YD;
  for (let i = 1; i < t.length; i++) {
    const [x1, y1] = t[i]!;
    if (dM <= x1) {
      const [x0, y0] = t[i - 1]!;
      return (y0 + ((y1 - y0) * (dM - x0)) / (x1 - x0)) * YD;
    }
  }
  return t[t.length - 1]![1] * YD;
}

/** Vertical speed (yd/s) that peaks at `peakYd` from `z0`. */
export function vzForPeak(z0: number, peakYd: number): number {
  return Math.sqrt(2 * G() * Math.max(0.05, peakYd - z0));
}

/** Seconds a ball launched at `vz` from `z0` takes to come down to the grass. */
export function airTime(z0: number, vz: number): number {
  return (vz + Math.sqrt(vz * vz + 2 * G() * Math.max(0, z0))) / G();
}

function unit(from: { x: number; y: number }, to: { x: number; y: number }): { ux: number; uy: number; d: number } {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { ux: dx / d, uy: dy / d, d } : { ux: 1, uy: 0, d: 0 };
}

/**
 * A pass to feet or into space: |v| from the distance, vz from the distance (FM's table), the rest horizontal toward
 * the target. The ball rolls (and hops a little) on to the target and beyond.
 */
export function groundLaunch(from: { x: number; y: number }, to: { x: number; y: number }): LaunchVector {
  const { ux, uy, d } = unit(from, to);
  const v = launchSpeedYd(d);
  const vz = Math.min(loftVzYd(d), v * 0.9);
  const vh = Math.sqrt(Math.max(0, v * v - vz * vz));
  return { vx: ux * vh, vy: uy * vh, vz };
}

/** A high ball that lands on `to` from height `z0`: vz for the type's peak, horizontal speed to land there. */
export function aerialLaunch(from: { x: number; y: number }, to: { x: number; y: number }, z0: number, vz: number): LaunchVector {
  const { ux, uy, d } = unit(from, to);
  const vh = d / airTime(z0, vz);
  return { vx: ux * vh, vy: uy * vh, vz };
}

/**
 * The passer's error on the vector (FM, report 6): the direction turned by z0 · σθ, the horizontal speed × (1 + z1 ·
 * relErr), the vertical speed + z2 · VZ_ERR_SHARE · relErr · |v|. `factor` is FM's error factor (`passErrorFactor`).
 */
export function launchWithError(v: LaunchVector, factor: number, z0: number, z1: number, z2: number, weatherMult = 1): LaunchVector {
  const rel = FM_NUMBERS.ERR_REL * factor * weatherMult;
  const ang = ((FM_NUMBERS.ERR_ANGLE_DEG * factor * weatherMult * Math.PI) / 180) * z0;
  const c = Math.cos(ang), s = Math.sin(ang);
  const k = Math.max(0.2, 1 + z1 * rel);
  const vx = (v.vx * c - v.vy * s) * k;
  const vy = (v.vx * s + v.vy * c) * k;
  const speed = Math.hypot(v.vx, v.vy, v.vz);
  const vz = Math.max(0, v.vz + z2 * P.VZ_ERR_SHARE * rel * speed);
  return { vx, vy, vz };
}

/** Where a free ball first lands and when (`null`: on the ground already, or it never comes down in 6 s). */
export function landing(ball: Ball3D, env: BallEnv): { x: number; y: number; t: number } | null {
  if (!(ball.z > 1e-6 || ball.vz > 1e-6)) return null;
  let b = { ...ball };
  let t = 0;
  while (t < 6) {
    const st = stepFree(b, P.SUBSTEP, env);
    t += P.SUBSTEP;
    if (st.bounces > 0) return { x: st.ball.x, y: st.ball.y, t };
    b = st.ball;
  }
  return null;
}

/**
 * When and where a free ball covers `along` yards from `origin` along `(ux, uy)` (null: it stops short, in 8 s at
 * most). The ball flies, bounces and rolls as it would.
 */
export function reachAlong(ball: Ball3D, origin: { x: number; y: number }, ux: number, uy: number, along: number, env: BallEnv): { x: number; y: number; t: number; z: number } | null {
  let b = { ...ball };
  let t = 0;
  while (t < 8) {
    b = stepFree(b, P.SUBSTEP, env).ball;
    t += P.SUBSTEP;
    if ((b.x - origin.x) * ux + (b.y - origin.y) * uy >= along) return { x: b.x, y: b.y, t, z: b.z };
    if (Math.hypot(b.vx, b.vy) < 0.05 && b.z <= 1e-6 && b.vz <= 1e-6) return null;
  }
  return null;
}

/** The pass type of a launch. */
export function passTypeOf(
  kind: 'regular' | 'through' | 'cross' | 'long_ball' | 'clearance',
  vzYd: number,
  opts: { header?: boolean; corner?: boolean; lofted?: boolean } = {},
): PassType {
  const vzM = vzYd / YD;
  if (opts.header) return 'header';
  if (kind === 'cross') return opts.corner ? 'corner' : 'cross';
  if (kind === 'clearance') return 'clearance';
  if (kind === 'long_ball') return opts.lofted ? 'high' : 'long';
  if (kind === 'through') return vzM >= P.LOFTED_VZ ? 'through_high' : 'through_low';
  return vzM < P.GROUND_VZ ? 'ground' : vzM < P.LOFTED_VZ ? 'driven' : 'chip';
}

/** Seconds a rolling ball launched at `v0` (yd/s, horizontal) takes to cover `x` yards (Infinity if it stops first). */
export function rollTime(v0: number, x: number, decel: number): number {
  if (x <= 0) return 0;
  if (decel <= 1e-9) return v0 > 0 ? x / v0 : Infinity;
  const disc = v0 * v0 - 2 * decel * x;
  if (disc < 0) return Infinity;
  return (v0 - Math.sqrt(disc)) / decel;
}

/**
 * The pass score's lane (stage 4): the ball's arrival time at points of the path against each defender's. A defender
 * at speed `speed` (yd/s) reaches a point after `LANE_REACTION_S`, within `LANE_REACH_YD` of it. Margin = his time −
 * the ball's; the lane is min margin / LANE_CLEAR_S, in 0..1 (0 = he gets there first). Points from 10% of the path
 * to the receiver, as the geometric lane score.
 */
export function arrivalLaneScore(
  from: { x: number; y: number },
  to: { x: number; y: number },
  defenders: ReadonlyArray<{ x: number; y: number; speed: number }>,
  rollDecel: number,
): number {
  const { ux, uy, d } = unit(from, to);
  if (d < 1) return 1;
  const v = groundLaunch(from, to);
  const vh = Math.hypot(v.vx, v.vy);
  let minMargin = Infinity;
  const n = P.LANE_SAMPLES;
  for (let i = 1; i <= n; i++) {
    const f = 0.1 + (0.9 * i) / n;
    const x = d * f;
    const tBall = rollTime(vh, x, rollDecel);
    const px = from.x + ux * x, py = from.y + uy * x;
    for (const o of defenders) {
      // Only defenders ahead of the passer, alongside the path (the geometric score's corridor).
      const t = ((o.x - from.x) * ux + (o.y - from.y) * uy) / d;
      if (t < 0.1 || t > 1.0) continue;
      const reachD = Math.max(0, Math.hypot(o.x - px, o.y - py) - P.LANE_REACH_YD);
      const tDef = P.LANE_REACTION_S + reachD / Math.max(0.5, o.speed);
      minMargin = Math.min(minMargin, tDef - tBall);
    }
  }
  if (minMargin === Infinity) return 1;
  return Math.max(0, Math.min(1, minMargin / P.LANE_CLEAR_S));
}

/** A launch and what the physics says it does (`PassState.physics`, the point it reaches). */
export interface BuiltLaunch {
  launch: import('@/GameEngine/types').PassPhysicsLaunch;
  /** Ground pass: where it covers the target distance (through ball: the cell it was meant for). High ball: where it lands. */
  point: { x: number; y: number };
}

/**
 * A pass along the ground (to feet or into space) from `from` (height z0) toward `target`, with the error. `T` is when
 * it covers the target distance (it may stop short: then the time it stops).
 */
export function buildGroundLaunch(
  from: { x: number; y: number }, target: { x: number; y: number }, z0: number, env: BallEnv,
  factor: number, n: readonly [number, number, number], type: (vz: number) => PassType,
  /** Horizontal speed (yd/s) to use instead of FM's (a through ball weighted for the runner, `weightedSpeed`). */
  vh?: number,
): BuiltLaunch {
  const { ux, uy, d } = unit(from, target);
  const g0 = groundLaunch(from, target);
  const h0 = Math.hypot(g0.vx, g0.vy);
  const base = vh !== undefined && h0 > 1e-6 ? { vx: (g0.vx / h0) * vh, vy: (g0.vy / h0) * vh, vz: g0.vz } : g0;
  const v = launchWithError(base, factor, n[0], n[1], n[2]);
  const ball: Ball3D = { x: from.x, y: from.y, z: z0, ...v };
  const at = reachAlong(ball, from, ux, uy, d, env);
  const speed = Math.hypot(v.vx, v.vy, v.vz);
  const T = at ? at.t : d / Math.max(1, speed);
  const point = at ? { x: at.x, y: at.y } : { x: target.x, y: target.y };
  return { launch: { ...v, z0, ox: from.x, oy: from.y, T, type: type(v.vz), aimX: target.x, aimY: target.y, speed }, point };
}

/**
 * Horizontal speed (yd/s) of a ball into space weighted to reach the cell `d` yards away when the runner does
 * (`tRunner` s), rolling at `decel`: d / t + ½·a·t, never faster than FM's launch for the distance nor too slow to get
 * there.
 */
export function weightedSpeed(d: number, tRunner: number, decel: number): number {
  const g = groundLaunch({ x: 0, y: 0 }, { x: d, y: 0 });
  const fm = Math.hypot(g.vx, g.vy);
  const reach = Math.sqrt(2 * decel * d) + 1;
  const timed = tRunner > 0.05 ? d / tRunner + 0.5 * decel * tRunner : fm;
  return Math.max(Math.min(reach, fm), Math.min(fm, timed));
}

/** A high ball from `from` (height z0) aimed to land on `target` with vertical speed `vz`, with the error. */
export function buildAerialLaunch(
  from: { x: number; y: number }, target: { x: number; y: number }, z0: number, vz: number, env: BallEnv,
  factor: number, n: readonly [number, number, number], type: PassType, weatherMult = 1,
): BuiltLaunch {
  const v = launchWithError(aerialLaunch(from, target, z0, vz), factor, n[0], n[1], n[2], weatherMult);
  const ball: Ball3D = { x: from.x, y: from.y, z: z0, ...v };
  const land = landing(ball, env);
  const T = land ? land.t : airTime(z0, v.vz);
  const point = land ? { x: land.x, y: land.y } : { x: target.x, y: target.y };
  const speed = Math.hypot(v.vx, v.vy, v.vz);
  return { launch: { ...v, z0, ox: from.x, oy: from.y, T, type, aimX: target.x, aimY: target.y, speed }, point };
}
