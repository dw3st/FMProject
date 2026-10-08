/**
 * Short player animations (pure, drawing only): long shot, header, goalkeeper save. Each adds an
 * offset to the already-interpolated marker; the engine position never moves
 * (spec 2026-10-08-match-visual §5). Times on the effects clock (real seconds, frozen while paused).
 */
import { PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

export type PlayerAnimKind = "longShot" | "header" | "save";

export const ANIM_DURATION: Record<PlayerAnimKind, number> = { longShot: 0.45, header: 0.5, save: 0.6 };
/** A shot from at least this far from the goal centre is a "long shot". */
export const LONG_SHOT_YDS = 20;

const LONG_SHOT = { BACK: 0.4, FORWARD: 0.6, SCALE: 0.15 } as const;
const HEADER_LIFT_YDS = 1.5;
const SAVE = { DIVE_YDS: 1.5, ROTATION: (70 * Math.PI) / 180 } as const;

export interface PlayerAnim {
  playerId: number;
  kind: PlayerAnimKind;
  startedAt: number;
  duration: number;
  /** Unit direction in engine yards (shot direction / dive direction). */
  dir: { x: number; y: number };
  /** Dive side for the save rotation: +1 / −1. */
  side: 1 | -1;
}

export interface AnimOffset {
  /** Engine yards. */
  dx: number; dy: number;
  liftYds: number;
  scale: number;
  /** Radians. */
  rotation: number;
}

const REST: AnimOffset = { dx: 0, dy: 0, liftYds: 0, scale: 1, rotation: 0 };

/** Adds an animation; a new one for the same player replaces the old. */
export function addAnim(
  list: readonly PlayerAnim[],
  a: { playerId: number; kind: PlayerAnimKind; dir: { x: number; y: number }; side: 1 | -1 },
  now: number,
): PlayerAnim[] {
  const len = Math.hypot(a.dir.x, a.dir.y) || 1;
  const anim: PlayerAnim = {
    playerId: a.playerId, kind: a.kind, startedAt: now, duration: ANIM_DURATION[a.kind],
    dir: { x: a.dir.x / len, y: a.dir.y / len }, side: a.side,
  };
  return [...list.filter((x) => x.playerId !== a.playerId), anim];
}

/** Animations still running at `now`. */
export function liveAnims(list: readonly PlayerAnim[], now: number): PlayerAnim[] {
  return list.filter((a) => now < a.startedAt + a.duration);
}

/** Offset of the marker `now`; exactly at rest at the start and the end. */
export function animOffset(a: PlayerAnim, now: number): AnimOffset {
  const p = (now - a.startedAt) / a.duration;
  if (!(p > 0 && p < 1)) return { ...REST };
  const bump = Math.sin(Math.PI * p);
  switch (a.kind) {
    case "longShot": {
      // Wind-up back, then through the ball: −BACK over the first half, +FORWARD over the second.
      const s = Math.sin(2 * Math.PI * p);
      const along = p < 0.5 ? -LONG_SHOT.BACK * s : -LONG_SHOT.FORWARD * s;
      return { dx: a.dir.x * along, dy: a.dir.y * along, liftYds: 0, scale: 1 + LONG_SHOT.SCALE * bump, rotation: 0 };
    }
    case "header":
      return { dx: 0, dy: 0, liftYds: HEADER_LIFT_YDS * bump, scale: 1, rotation: 0 };
    case "save":
      return {
        dx: a.dir.x * SAVE.DIVE_YDS * bump, dy: a.dir.y * SAVE.DIVE_YDS * bump,
        liftYds: 0, scale: 1, rotation: a.side * SAVE.ROTATION * bump,
      };
  }
}

/** True when a shot from `pos` towards the goal at `goalX` is a long shot (≥ LONG_SHOT_YDS). */
export function isLongShot(pos: { x: number; y: number }, goalX: number): boolean {
  return Math.hypot(pos.x - goalX, pos.y - PITCH_WIDTH / 2) >= LONG_SHOT_YDS;
}
