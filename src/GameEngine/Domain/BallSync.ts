/**
 * Keeps the 3D ball (`GameState.ball`, `Ball3D.ts`) in step with the play (stage 3, `ball-3d.md`). Called by
 * `tickState` after every tick with the state before and after:
 *  - a new pass / shot launches the ball from the kicker (vertical speed from the flight time the engine gives it);
 *  - a pass / shot in flight is stepped along its profile toward its (possibly moving) target;
 *  - a new loose ball takes over the height and vertical speed the ball had; afterwards `handleLooseBall` moves it
 *    (`advanceLooseBall`);
 *  - a held ball sits at the holder's feet.
 * When a pass, shot or loose spell ends, `ballFlight` reports its peak, air time and bounces (`Statistics.ts`).
 * No draws from the match generator.
 */
import type { BallFlightKind, BallState, GameState, LooseBallState, PassState, ShotState, TeamId } from '@/GameEngine/types';
import { isAerialKind } from '@/GameEngine/types';
import { BALL_PHYSICS } from '@/GameEngine/Configs/BallPhysicsConfig';
import { PASS_PHYSICS } from '@/GameEngine/Configs/PassPhysicsConfig';
import { AERIAL_CONFIG } from '@/GameEngine/Configs/AerialConfig';
import { PASS_YARDS_PER_SEC } from '@/GameEngine/Configs/PassConfig';
import { THROUGH_BALL_CONFIG } from '@/GameEngine/Configs/ThroughBallConfig';
import { weatherEffectOf } from '@/GameEngine/Configs/WeatherConfig';
import { SHOT_SPEED } from '@/GameEngine/Infrastructure/ActionOutcomes';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { debugLog, isDebugEnabled } from '@/GameEngine/Support/DebugLog';
import {
  geomFraction, isAirborne, launchToward, reachHeight, stepFree, stepGuided, stepVertical, type Ball3D, type BallEnv,
} from '@/GameEngine/Domain/Ball3D';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';

/** The ground of the match (rolling friction and bounce with the weather). */
export function ballEnv(weather: GameState['weather']): BallEnv {
  const w = weatherEffectOf(weather);
  return { rollDecel: THROUGH_BALL_CONFIG.LOOSE_BALL_DECELERATION * w.looseDecel, bounce: w.bounce };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const passKey = (p: PassState) => `p:${p.fromId}:${p.kind}:${r3(p.toX)}:${r3(p.toY)}:${r3(p.distance)}`;
export const shotKey = (s: ShotState) => `s:${s.shooterId}:${r3(s.fromX)}:${r3(s.fromY)}:${r3(s.toX)}:${r3(s.toY)}`;
export const looseKey = (l: LooseBallState) => `l:${r3(l.startTime)}:${l.fromPasserId}:${l.source ?? 'through'}`;

/** Flight progress per second of a pass (the engine's own rate, `gameState.ts` pass in flight). */
export function passRate(p: PassState, passSpeed: number): number {
  // A physical pass (stage 4): its expected flight to the target.
  if (p.physics) return 1 / Math.max(0.05, p.physics.T);
  const v = isAerialKind(p.kind) ? AERIAL_CONFIG.AERIAL_YARDS_PER_SEC : PASS_YARDS_PER_SEC;
  return p.distance > 0 ? v / p.distance : passSpeed;
}

function teamOf(s: GameState, id: number | null | undefined): TeamId | null {
  if (id === null || id === undefined) return null;
  return s.players.find(p => p.id === id)?.team ?? null;
}

function holderSpot(s: GameState): { x: number; y: number } {
  const h = s.players.find(p => p.id === s.ballHolderId);
  if (h) return { x: h.x, y: h.y };
  if (s.setPiece?.position) return s.setPiece.position;
  return { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 };
}

function heldBall(s: GameState): BallState {
  const p = holderSpot(s);
  return {
    x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, phase: 'held', key: `h:${s.ballHolderId}`, kind: 'ground',
    team: teamOf(s, s.ballHolderId), peak: 0, air: 0, elapsed: 0, bounces: 0, distance: 0,
  };
}

/** The 3D ball of a state (a held ball when it has none yet). */
export function ballOf(s: GameState): BallState {
  return s.ball ?? heldBall(s);
}

/** Height of a flight where it ended inside this step (it arrived, or something met it on the way). */
function endHeight(prev: GameState, b: BallState, dt: number, passSpeed: number, env: BallEnv): { z: number; vz: number } {
  if (b.phase !== 'pass' && b.phase !== 'shot') return { z: b.z, vz: b.vz };
  // Stage 10: a high ball met in flight ended at the contact (the core left the ball there).
  if (b.metZ !== undefined) return { z: b.metZ, vz: b.vz };
  // A physical ground pass was moved by the core up to where it ended (`advancePassBall`).
  if (b.free && b.profile === 'ground') return { z: b.z, vz: b.vz };
  const total = flightLeft(prev, b, passSpeed);
  const left = Math.min(dt, Math.max(0, total));
  if (b.profile === 'air' && b.arriveZ !== undefined && left >= total - 1e-6) {
    return { z: b.arriveZ, vz: stepVertical(b, left, env).vz };
  }
  const v = stepVertical(b, left, env);
  return { z: v.z, vz: v.vz };
}

/** Reports the end of a pass / shot / loose spell; returns what the new ball keeps of it (`BallState.ended`). */
function endPhase(b: BallState, endZ: number): BallState['ended'] {
  if (b.phase === 'held') return undefined;
  gameBus.emit('ballFlight', { team: b.team, kind: b.kind, peak: b.peak, air: b.air, distance: b.distance, bounces: b.bounces, endZ });
  if (isDebugEnabled() && b.peak >= BALL_PHYSICS.HIGH_BALL_Z) {
    debugLog('ball', `${b.kind} peaked at ${(b.peak / 1.0936).toFixed(1)} m, ended at ${(endZ / 1.0936).toFixed(1)} m, ${b.air.toFixed(1)} s in the air, ${b.bounces} bounce(s)`);
  }
  return { kind: b.kind, phase: b.phase, peak: b.peak, z: endZ };
}

/** Corner kick: a set-piece cross from within a few yards of a corner flag. */
function isCornerKick(prev: GameState, p: PassState, from: { x: number; y: number }): boolean {
  if (prev.setPiece?.type === 'corner') return true;
  if (!p.fromSetPiece) return false;
  const nearX = from.x < 3 || from.x > PITCH_LENGTH - 3;
  const nearY = from.y < 3 || from.y > PITCH_WIDTH - 3;
  return nearX && nearY;
}

function passTarget(s: GameState, p: PassState): { x: number; y: number } {
  if (p.kind !== 'through' && p.toId !== null && !p.miss && !isAerialKind(p.kind)) {
    const r = s.players.find(q => q.id === p.toId);
    if (r) return { x: r.x, y: r.y };
  }
  return { x: p.toX, y: p.toY };
}

/** Launch height: a header / knock-down / headed clearance right after a high ball starts from head height. */
function launchZ(prevBall: BallState, header: boolean): number {
  if (header) return BALL_PHYSICS.HEAD_Z;
  if (prevBall.phase === 'pass' && (prevBall.kind === 'cross' || prevBall.kind === 'corner' || prevBall.kind === 'long_ball' || prevBall.kind === 'clearance')) {
    return BALL_PHYSICS.HEAD_Z;
  }
  return BALL_PHYSICS.FOOT_Z;
}

function launchPass(prev: GameState, next: GameState, prevBall: BallState, p: PassState, passSpeed: number, env: BallEnv): BallState {
  const passer = next.players.find(q => q.id === p.fromId) ?? prev.players.find(q => q.id === p.fromId);
  const from = passer ? { x: passer.x, y: passer.y } : { x: prevBall.x, y: prevBall.y };
  const air = isAerialKind(p.kind) || !!p.lofted;
  const kind: BallFlightKind = p.kind === 'cross' ? (isCornerKick(prev, p, from) ? 'corner' : 'cross')
    : p.kind === 'long_ball' ? 'long_ball'
      : p.kind === 'clearance' ? 'clearance'
        : p.lofted ? 'lofted' : 'ground';
  if (p.physics) {
    // Stage 4 (`pass-physics.md`): the launch the passer gave it, error included; then free physics.
    const ph = p.physics;
    const profile = isAerialKind(p.kind) ? 'air' : 'ground';
    return {
      x: from.x, y: from.y, z: ph.z0, vx: ph.vx, vy: ph.vy, vz: ph.vz,
      phase: 'pass', key: passKey(p), kind: ph.type === 'chip' || ph.type === 'through_high' ? 'lofted' : kind,
      team: passer?.team ?? null, peak: Math.max(ph.z0, ph.vz > 0 ? ph.z0 + (ph.vz * ph.vz) / (2 * BALL_PHYSICS.GRAVITY) : ph.z0),
      air: 0, elapsed: 0, bounces: 0, profile, distance: p.distance, free: true,
    };
  }
  const T = Math.max(0.05, (1 - p.t) / passRate(p, passSpeed));
  const z0 = launchZ(prevBall, false);
  const target = passTarget(next, p);
  const profile = air ? 'air' : 'ground';
  const b = launchToward({ ...from, z: z0 }, { ...target, z: 0 }, T, profile, env.rollDecel);
  return {
    ...b, phase: 'pass', key: passKey(p), kind, team: passer?.team ?? null,
    peak: Math.max(z0, b.vz > 0 ? z0 + (b.vz * b.vz) / (2 * BALL_PHYSICS.GRAVITY) : z0),
    air: 0, elapsed: 0, bounces: 0, profile, arriveZ: air ? 0 : undefined, distance: Math.hypot(target.x - from.x, target.y - from.y),
  };
}

/** Crossing height of a shot on the goal line, from its geometry (stage 7 makes it the real aim). */
export function shotArriveZ(shot: ShotState): number {
  const f = geomFraction(shot.shooterId, shot.fromX, shot.fromY, shot.toY);
  if (shot.header) return BALL_PHYSICS.HEADER_Z_LOW + (BALL_PHYSICS.HEADER_Z_HIGH - BALL_PHYSICS.HEADER_Z_LOW) * f;
  return BALL_PHYSICS.SHOT_Z_LOW + (BALL_PHYSICS.SHOT_Z_HIGH - BALL_PHYSICS.SHOT_Z_LOW) * f;
}

function launchShot(next: GameState, prevBall: BallState, shot: ShotState): BallState {
  const z0 = launchZ(prevBall, !!shot.header);
  const zT = shotArriveZ(shot);
  const T = Math.max(0.05, (1 - shot.t) / SHOT_SPEED);
  const b = launchToward({ x: shot.fromX, y: shot.fromY, z: z0 }, { x: shot.toX, y: shot.toY, z: zT }, T, 'air', 0);
  return {
    ...b, phase: 'shot', key: shotKey(shot), kind: shot.header ? 'header' : 'shot', team: teamOf(next, shot.shooterId),
    peak: Math.max(z0, zT, b.vz > 0 ? z0 + (b.vz * b.vz) / (2 * BALL_PHYSICS.GRAVITY) : z0),
    air: 0, elapsed: 0, bounces: 0, profile: 'air', arriveZ: zT, distance: Math.hypot(shot.toX - shot.fromX, shot.toY - shot.fromY),
  };
}

function stepFlight(b: BallState, target: { x: number; y: number }, Trem: number, dt: number, env: BallEnv): BallState {
  const st = stepGuided(b, target, Trem, dt, b.profile ?? 'air', env, b.arriveZ);
  return {
    ...b, ...st.ball, ended: undefined, peak: Math.max(b.peak, st.peak), air: b.air + st.air,
    elapsed: b.elapsed + dt, bounces: b.bounces + st.bounces,
  };
}

/** Seconds a flight had left before this step (to read its height when it ended inside the step). */
function flightLeft(prev: GameState, b: BallState, passSpeed: number): number {
  if (b.phase === 'shot' && prev.shot) return (1 - prev.shot.t) / SHOT_SPEED;
  if (b.phase === 'pass' && prev.pass) return (1 - prev.pass.t) / passRate(prev.pass, passSpeed);
  return 0;
}

function startLoose(prev: GameState, next: GameState, prevBall: BallState, lb: LooseBallState, dt: number, passSpeed: number, env: BallEnv): BallState {
  // The ball keeps the height it had: a high ball dropping loose falls on and bounces; a blocked or parried ball
  // keeps its height and pace.
  let z = 0, vz = 0;
  if (prevBall.phase === 'pass' || prevBall.phase === 'shot') {
    ({ z, vz } = endHeight(prev, prevBall, dt, passSpeed, env));
    // Landing on the grass: it bounces up off it.
    if (z <= 1e-6 && vz < 0) vz = -vz * BALL_PHYSICS.RESTITUTION * env.bounce;
    if (z <= 1e-6 && vz < BALL_PHYSICS.SETTLE_VZ) vz = 0;
  } else if (prevBall.phase === 'loose') {
    z = prevBall.z; vz = prevBall.vz;
  }
  return {
    x: lb.x, y: lb.y, z, vx: lb.vx, vy: lb.vy, vz, phase: 'loose', key: looseKey(lb), kind: 'loose',
    team: lb.fromTeamLastTouch, peak: z, air: 0, elapsed: 0, bounces: 0, distance: 0,
  };
}

/** The 3D ball after one tick (`prev` → `next`). */
export function syncBall(prev: GameState, next: GameState, dt: number, passSpeed: number): BallState {
  // The core leaves `ball` untouched except for a loose ball (`advanceLooseBall`): the latest is on `next`.
  const b0 = next.ball ?? ballOf(prev);
  const env = ballEnv(next.weather);
  const end = () => endPhase(b0, endHeight(prev, b0, dt, passSpeed, env).z);
  if (next.shot) {
    const key = shotKey(next.shot);
    if (b0.phase === 'shot' && b0.key === key && prev.shot) {
      const Trem = (1 - prev.shot.t) / SHOT_SPEED;
      return stepFlight(b0, { x: next.shot.toX, y: next.shot.toY }, Trem, dt, env);
    }
    const ended = end();
    return { ...launchShot(next, b0, next.shot), ended };
  }
  if (next.pass) {
    const key = passKey(next.pass);
    if (b0.phase === 'pass' && b0.key === key && prev.pass && b0.free) {
      // A physical pass: a high ball flies freely here; a ground pass was moved by the core (`advancePassBall`).
      if (b0.profile === 'ground') return { ...b0, ended: undefined };
      const st = stepFree(b0, dt, env);
      return {
        ...b0, ...st.ball, ended: undefined, peak: Math.max(b0.peak, st.peak), air: b0.air + st.air,
        elapsed: b0.elapsed + dt, bounces: b0.bounces + st.bounces,
      };
    }
    if (b0.phase === 'pass' && b0.key === key && prev.pass) {
      const Trem = (1 - prev.pass.t) / passRate(prev.pass, passSpeed);
      return stepFlight(b0, passTarget(next, next.pass), Trem, dt, env);
    }
    const ended = end();
    return { ...launchPass(prev, next, b0, next.pass, passSpeed, env), ended };
  }
  if (next.looseBall) {
    const key = looseKey(next.looseBall);
    if (b0.phase === 'loose' && b0.key === key) return { ...b0, ended: undefined, x: next.looseBall.x, y: next.looseBall.y, vx: next.looseBall.vx, vy: next.looseBall.vy };
    const ended = end();
    return { ...startLoose(prev, next, b0, next.looseBall, dt, passSpeed, env), ended };
  }
  const ended = b0.phase !== 'held' ? end() : undefined;
  return { ...heldBall(next), ended };
}

/**
 * One tick of a loose ball (`handleLooseBall`): the 3D ball rolls, flies and bounces. Returns the new ball and the
 * flat position / velocity the loose-ball state keeps.
 */
export function advanceLooseBall(s: GameState, lb: LooseBallState, dt: number): BallState {
  const key = looseKey(lb);
  const cur: BallState = s.ball && s.ball.phase === 'loose' && s.ball.key === key
    ? { ...s.ball, x: lb.x, y: lb.y, vx: lb.vx, vy: lb.vy }
    : {
      x: lb.x, y: lb.y, z: 0, vx: lb.vx, vy: lb.vy, vz: 0, phase: 'loose', key, kind: 'loose',
      team: lb.fromTeamLastTouch, peak: 0, air: 0, elapsed: 0, bounces: 0, distance: 0,
    };
  const st = stepFree(cur, dt, ballEnv(s.weather));
  return {
    ...cur, ...st.ball, ended: undefined, peak: Math.max(cur.peak, st.peak), air: cur.air + st.air,
    elapsed: cur.elapsed + dt, bounces: cur.bounces + st.bounces,
  };
}

/** True when a player can play the ball at its height (a loose ball above his reach flies over him). */
export function ballWithinReach(ball: BallState | undefined, isKeeper: boolean): boolean {
  if (!ball || !isAirborne(ball)) return true;
  return ball.z <= reachHeight(isKeeper);
}

/** Someone who can take a physical pass on its way: within `reach` (yd) of the ball and under his reach height. */
export interface PassCatcher { id: number; x: number; y: number; reach: number; keeper: boolean }

export interface PassBallStep {
  ball: BallState;
  /** The first catcher the ball reached during the step (null: nobody). */
  contactId: number | null;
  /** It stopped short (rolling slower than `STOP_SPEED_YD`) or left the pitch. */
  stopped: boolean;
  out: boolean;
}

/**
 * One tick of a physical ground pass / through ball (stage 4, `pass-physics.md`): the 3D ball flies, bounces and rolls
 * on its own in sub-steps of `PASS_PHYSICS.SUBSTEP`; at each one the catchers (their positions this tick) are checked
 * along the path. No draws.
 */
export function advancePassBall(s: GameState, dt: number, catchers: readonly PassCatcher[]): PassBallStep {
  const b0 = s.ball!;
  const env = ballEnv(s.weather);
  let b: Ball3D = { x: b0.x, y: b0.y, z: b0.z, vx: b0.vx, vy: b0.vy, vz: b0.vz };
  let peak = b0.peak, air = 0, bounces = 0, left = dt, used = 0;
  let contactId: number | null = null;
  let out = false;
  const done = (): BallState => ({
    ...b0, ...b, ended: undefined, peak: Math.max(peak, b.z), air: b0.air + air, elapsed: b0.elapsed + used, bounces: b0.bounces + bounces,
  });
  while (left > 1e-9) {
    const h = Math.min(PASS_PHYSICS.SUBSTEP, left);
    const st = stepFree(b, h, env);
    b = st.ball; peak = Math.max(peak, st.peak); air += st.air; bounces += st.bounces;
    left -= h; used += h;
    for (const c of catchers) {
      if (b.z > reachHeight(c.keeper)) continue;
      if (Math.hypot(b.x - c.x, b.y - c.y) <= c.reach) { contactId = c.id; break; }
    }
    if (contactId !== null) break;
    if (b.x < 0 || b.x > PITCH_LENGTH || b.y < 0 || b.y > PITCH_WIDTH) { out = true; break; }
    if (!isAirborne(b) && Math.hypot(b.vx, b.vy) < PASS_PHYSICS.STOP_SPEED_YD) break;
  }
  const stopped = contactId === null && (out || (!isAirborne(b) && Math.hypot(b.vx, b.vy) < PASS_PHYSICS.STOP_SPEED_YD));
  return { ball: done(), contactId, stopped, out };
}
