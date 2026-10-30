/**
 * Short player animations (pure, drawing only): long shot, header, goalkeeper save. Each adds an
 * offset to the already-interpolated marker; the engine position never moves
 * (spec 2026-10-08-match-visual §5). Times on the effects clock (real seconds, frozen while paused).
 */
import { PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

export type PlayerAnimKind = "longShot" | "header" | "save" | "celebrate" | "tumble" | "lunge" | "jump" | "stepover" | "spin" | "flick";

export const ANIM_DURATION: Record<PlayerAnimKind, number> = {
  longShot: 0.45, header: 0.5, save: 0.6, celebrate: 1.4, tumble: 1.3, lunge: 0.4, jump: 0.45,
  stepover: 0.6, spin: 0.55, flick: 0.35,
};
/** Styles (leva 3): who shows skill moves (dribbling 0..1) and how soon after receiving a pass is "first time". */
export const STYLE = { SKILL_DRIBBLING: 0.7, FIRST_TIME_S: 0.45 } as const;
/** A shot from at least this far from the goal centre is a "long shot". */
export const LONG_SHOT_YDS = 20;

const LONG_SHOT = { BACK: 0.4, FORWARD: 0.6, SCALE: 0.15 } as const;
const HEADER_LIFT_YDS = 1.5;
/** A header toward goal also lunges at the ball. */
const HEADER_LUNGE_YDS = 0.5;
/** Fouled player (leva 2): thrown on along the challenge and rolling, then up and back on his spot. */
const TUMBLE = { YDS: 1.3, OUT: 0.3, BACK: 0.75, ROLL: 1.1 } as const;
/** The offender steps into the challenge. */
const LUNGE_YDS = 0.6;
/** Skill moves of a good dribbler (leva 3): two feints side to side, or a full turn on the ball. */
const STEPOVER_YDS = 0.45;
/** First-time pass: a quick pop of the marker. */
const FLICK_SCALE = 0.14;
/** Both players go up for a high ball. */
const JUMP_LIFT_YDS = 1.2;
const SAVE = { DIVE_YDS: 1.5, ROTATION: (70 * Math.PI) / 180 } as const;
/** Goal celebration (#129): two hops and one full turn. */
const CELEBRATE = { HOP_YDS: 1.2, SCALE: 0.15 } as const;

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
      return { dx: a.dir.x * HEADER_LUNGE_YDS * bump, dy: a.dir.y * HEADER_LUNGE_YDS * bump, liftYds: HEADER_LIFT_YDS * bump, scale: 1, rotation: 0 };
    case "jump":
      return { dx: a.dir.x * 0.3 * bump, dy: a.dir.y * 0.3 * bump, liftYds: JUMP_LIFT_YDS * bump, scale: 1 + 0.08 * bump, rotation: 0 };
    case "stepover": {
      // Two feints across the run (dir is the run): left, right, then on.
      const s = Math.sin(4 * Math.PI * p) * STEPOVER_YDS * bump;
      return { dx: -a.dir.y * s, dy: a.dir.x * s, liftYds: 0, scale: 1, rotation: 0.35 * Math.sin(4 * Math.PI * p) * bump };
    }
    case "spin": {
      const turn = p * p * (3 - 2 * p);
      return { dx: 0, dy: 0, liftYds: 0, scale: 1 + 0.06 * bump, rotation: a.side * 2 * Math.PI * turn };
    }
    case "flick":
      return { dx: 0, dy: 0, liftYds: 0, scale: 1 + FLICK_SCALE * bump, rotation: 0 };
    case "lunge":
      return { dx: a.dir.x * LUNGE_YDS * bump, dy: a.dir.y * LUNGE_YDS * bump, liftYds: 0, scale: 1, rotation: 0 };
    case "tumble": {
      // Out fast along the challenge, a roll, down for a moment, then back up to his spot.
      const out = p < TUMBLE.OUT ? 1 - (1 - p / TUMBLE.OUT) ** 2 : p < TUMBLE.BACK ? 1 : 1 - ((p - TUMBLE.BACK) / (1 - TUMBLE.BACK)) ** 2;
      const roll = p < TUMBLE.OUT ? p / TUMBLE.OUT : 1;
      return {
        dx: a.dir.x * TUMBLE.YDS * out, dy: a.dir.y * TUMBLE.YDS * out, liftYds: 0, scale: 1,
        rotation: a.side * TUMBLE.ROLL * Math.sin(Math.PI * roll) * (p < TUMBLE.BACK ? 1 : out),
      };
    }
    case "celebrate": {
      const turn = p * p * (3 - 2 * p);
      return {
        dx: 0, dy: 0, liftYds: CELEBRATE.HOP_YDS * Math.abs(Math.sin(2 * Math.PI * p)),
        scale: 1 + CELEBRATE.SCALE * bump, rotation: a.side * 2 * Math.PI * turn,
      };
    }
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
