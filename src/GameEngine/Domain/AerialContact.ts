/**
 * Stage 10 of the engine rebuild (`aerial.md` → "Stage 10"): FM's cross targets and the contact in the air.
 *
 *   - `fmCrossZones` / `drawCrossZone`: FM's decided target zones of a cross (six-yard box 64 %, penalty-spot band 28 %,
 *     edge 8 %) for a crosser, and the drawn target.
 *   - `findAerialContact`: steps the free 3D ball of a high ball through one tick and finds the first player it comes
 *     within reach of (horizontally, and under the height his jump reaches).
 *   - `contestantsOf`: who else meets that contact (within `CONTEST_YD`, able to reach that height).
 *   - `fmAerialDuelScore`: the duel score at the contact (jumping above heading, standing still and goal-side win).
 *
 * Pure: no state mutation, no draws except `drawCrossZone`'s rng argument. Rolls live in `ActionOutcomes.ts`.
 */
import type { GamePlayer } from '@/GameEngine/types';
import { FM_AERIAL as F, FM_CROSS_ZONES, type FmCrossZoneKind } from '@/GameEngine/Configs/FmAerialConfig';
import { stepFree, type Ball3D, type BallEnv } from '@/GameEngine/Domain/Ball3D';
import { PITCH_LENGTH, PITCH_WIDTH, isInGoalScoreArea } from '@/GameEngine/Domain/pitch';
import { clamp } from '@/Domain/math';

const CENTRE_Y = PITCH_WIDTH / 2;

export interface CrossZonePoint { kind: FmCrossZoneKind; x: number; y: number; weight: number }

/** FM's cross target zones for a crosser at (x, y) attacking `attackDir` (the near side is his side). */
export function fmCrossZones(p: Pick<GamePlayer, 'y' | 'attackDir'>): CrossZonePoint[] {
  const goalX = p.attackDir === 1 ? PITCH_LENGTH : 0;
  const nearSign = p.y < CENTRE_Y ? -1 : 1;
  return FM_CROSS_ZONES.map(z => ({
    kind: z.kind, weight: z.weight,
    x: goalX - p.attackDir * z.depth,
    y: CENTRE_Y + nearSign * z.side,
  }));
}

/** The drawn target of a cross: a zone by FM's shares, a point within `ZONE_SPREAD_YD` of its centre. Three draws. */
export function drawCrossZone(p: Pick<GamePlayer, 'y' | 'attackDir'>, rng: () => number): CrossZonePoint {
  const zones = fmCrossZones(p);
  const total = zones.reduce((s, z) => s + z.weight, 0);
  let r = rng() * total;
  let pick = zones[zones.length - 1]!;
  for (const z of zones) { r -= z.weight; if (r <= 0) { pick = z; break; } }
  const a = rng() * 2 * Math.PI;
  const d = Math.sqrt(rng()) * F.ZONE_SPREAD_YD;
  return {
    ...pick,
    x: clamp(pick.x + Math.cos(a) * d, 0.5, PITCH_LENGTH - 0.5),
    y: clamp(pick.y + Math.sin(a) * d, 0.5, PITCH_WIDTH - 0.5),
  };
}

/** Jumping ability 0..1 (0.5 when a snapshot predates the field). */
export function jumpOf(p: GamePlayer): number {
  return p.runtimeStats.withoutBall.jump ?? 0.5;
}

/** The highest ball a player can play: an outfield head with his jump, a keeper's hands (inside his box only). */
export function contactReachZ(p: GamePlayer, keeperHands: boolean): number {
  return keeperHands ? F.KEEPER_HANDS_YD + F.KEEPER_JUMP_YD * jumpOf(p) : F.HEAD_TOP_YD + F.JUMP_YD * jumpOf(p);
}

/** A player who can meet the flight this tick. */
export interface AerialCatcher {
  id: number;
  x: number;
  y: number;
  /** Horizontal reach (yd) and the highest ball he plays (yd). */
  reach: number;
  reachZ: number;
  keeper: boolean;
}

/** Catchers of a high ball: everyone but the passer and the players in recovery; a keeper only in his own box. */
export function aerialCatchers(players: readonly GamePlayer[], passerId: number, inRecovery: (p: GamePlayer) => boolean): AerialCatcher[] {
  const out: AerialCatcher[] = [];
  for (const p of players) {
    if (p.id === passerId || inRecovery(p)) continue;
    const keeper = p.role === 'GK';
    if (keeper) {
      const ownGoalX = p.attackDir === 1 ? 0 : PITCH_LENGTH;
      if (!isInGoalScoreArea(p.x, p.y, ownGoalX)) continue;
    }
    out.push({ id: p.id, x: p.x, y: p.y, reach: keeper ? F.KEEPER_REACH_YD : F.BODY_REACH_YD, reachZ: contactReachZ(p, keeper), keeper });
  }
  return out;
}

export interface AerialContactHit {
  /** First player the ball reached. */
  id: number;
  /** The ball there and then. */
  point: { x: number; y: number };
  z: number;
  /** Seconds into the tick. */
  at: number;
  ball: Ball3D;
}

/**
 * Steps the free ball `dt` seconds in sub-steps and returns the first catcher it comes within reach of (and under his
 * reach height), or null with the ball at the end of the step. `elapsed` = the flight time before this tick: no contact
 * before `CONTACT_MIN_FLIGHT_S`. A ball at a keeper's own goal line or out of the pitch stops the search.
 */
export function findAerialContact(
  ball: Ball3D,
  env: BallEnv,
  dt: number,
  elapsed: number,
  catchers: readonly AerialCatcher[],
): { hit: AerialContactHit | null; ball: Ball3D } {
  let b = ball;
  let t = 0;
  while (t < dt - 1e-9) {
    const h = Math.min(F.SUBSTEP_S, dt - t);
    b = stepFree(b, h, env).ball;
    t += h;
    if (elapsed + t < F.CONTACT_MIN_FLIGHT_S) continue;
    let best: AerialCatcher | null = null;
    let bestD = Infinity;
    for (const c of catchers) {
      if (b.z > c.reachZ) continue;
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d <= c.reach && d < bestD) { best = c; bestD = d; }
    }
    if (best) return { hit: { id: best.id, point: { x: b.x, y: b.y }, z: b.z, at: t, ball: b }, ball: b };
    if (b.x < 0 || b.x > PITCH_LENGTH || b.y < 0 || b.y > PITCH_WIDTH) break;
  }
  return { hit: null, ball: b };
}

/** Everyone who contests a contact: within `CONTEST_YD` of it and able to reach its height (the first one included). */
export function contestantsOf(hit: AerialContactHit, catchers: readonly AerialCatcher[]): AerialCatcher[] {
  return catchers.filter(c => c.id === hit.id
    || (Math.hypot(c.x - hit.point.x, c.y - hit.point.y) <= F.CONTEST_YD + c.reach && hit.z <= c.reachZ));
}

/** 1 standing still, 0 at `STILL_SPEED_YD` or more. */
export function stillness(p: GamePlayer): number {
  const v = p.vel ? Math.hypot(p.vel.x, p.vel.y) : 0;
  return clamp(1 - v / F.STILL_SPEED_YD, 0, 1);
}

/**
 * FM's duel score at a contact: heading × 0.30 + jumping × 0.40 + strength × 0.15 + standing still × 0.15, + 0.20
 * for the contestant goal-side of his rival (nearer the goal under attack), + the base.
 */
export function fmAerialDuelScore(p: GamePlayer, goalSide: boolean): number {
  const wo = p.runtimeStats.withoutBall;
  return (wo.heading ?? 0.5) * F.DUEL_HEADING
    + jumpOf(p) * F.DUEL_JUMP
    + (wo.strength ?? 0.5) * F.DUEL_STRENGTH
    + stillness(p) * F.DUEL_STILL
    + (goalSide ? F.DUEL_GOAL_SIDE : 0)
    + F.DUEL_BASE;
}

/**
 * Where a launched high ball comes down through height `meetZ` (yd) — the spot players attack to meet it in the air
 * (`MEET_Z_YD`, FM's contact height); null when it never gets that high. Gravity in yd/s².
 */
export function meetPoint(
  l: { ox: number; oy: number; z0: number; vx: number; vy: number; vz: number },
  meetZ: number,
  gravity: number,
): { x: number; y: number; t: number } | null {
  const disc = l.vz * l.vz + 2 * gravity * (l.z0 - meetZ);
  if (disc < 0) return null;
  const t = (l.vz + Math.sqrt(disc)) / gravity;
  if (!(t > 0)) return null;
  return {
    x: clamp(l.ox + l.vx * t, 0.5, PITCH_LENGTH - 0.5),
    y: clamp(l.oy + l.vy * t, 0.5, PITCH_WIDTH - 0.5),
    t,
  };
}

/** Line of a player for the header-by-position counts. */
export function headerLine(role: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  if (role === 'GK') return 'GK';
  if (role === 'CB' || role === 'LB' || role === 'RB' || role === 'LWB' || role === 'RWB') return 'DEF';
  if (role === 'ST' || role === 'CF' || role === 'LW' || role === 'RW') return 'FWD';
  return 'MID';
}
