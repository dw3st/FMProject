/**
 * Players drawn as animated top-down sprites (art plan phase 2, option B: the face goes to the name pill), following
 * the art preview (`fmproject-art-handoff/reference/preview-template.html`): gait with hysteresis and a stride that
 * grows with speed, turning by time, actions as chains of frames with fixed times. Pure: which atlas frame a player
 * shows, from how the drawn marker moves and from the engine's events. Drawing only: nothing reaches the engine.
 * Atlases in `src/example_data/assets/player` and `/keeper` (frames face −y, six layers each).
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export const SPRITE_LAYERS = ["socks", "shirt", "trim", "skin", "hair", "detail"] as const;
export type SpriteLayer = (typeof SPRITE_LAYERS)[number];

export const PLAYER_SPRITE = {
  /** The body's width in the 64 px frame: the body is drawn as wide as the marker. */
  BODY_PX: 38,
  ANCHOR: { x: 0.5, y: 0.55 },
  /** Gait (drawn yards per real second): idle below IDLE; walk → run above RUN_UP, run → walk below RUN_DOWN. */
  IDLE: 0.35,
  RUN_UP: 3.1,
  RUN_DOWN: 2.2,
  /** Yards per cycle (8 frames, two steps): a run's grows with speed so the feet never slide. */
  WALK_CYCLE: 1.5,
  RUN_CYCLE: 1.65,
  RUN_CYCLE_PER_SPEED: 0.32,
  /** Turn rate: clamp(TURN_MAX − speed × TURN_SPEED, TURN_MIN, TURN_MAX) per second (exponential). */
  TURN_MAX: 9,
  TURN_MIN: 3.5,
  TURN_SPEED: 0.75,
  /** Velocity smoothing per second (exponential). */
  VEL_RATE: 12,
  /** A drawn jump longer than this (yards) is a teleport: no stride, no turn. */
  JUMP_YDS: 4,
  /** Skin tones and hair colours (the crowd's), picked per player. */
  SKIN: [0xf1c9a5, 0xe0ac83, 0xc68b5e, 0x9b6a42, 0x6f4527, 0x4a2c17],
  HAIR: [0x1b1410, 0x3a2616, 0x6b4423, 0xa8742f, 0xd8c08a, 0x2b2b2b, 0x777777],
  /** The keeper's trim (collar and cuffs). */
  KEEPER_TRIM: 0x1e1e22,
} as const;

/** One step of an action: a frame base name (`player-kick`, `keeper-dive-left-1`) and how long it shows (seconds). */
export type ActionStep = readonly [base: string, seconds: number];

/** The preview's chains (`act(p, ...)`); `side` only matters for the keeper's dive. */
export function actionChain(kind: SpriteActionKind, side: "left" | "right" = "left"): readonly ActionStep[] {
  switch (kind) {
    case "kick": return [["player-kick-wind", 0.11], ["player-kick", 0.15], ["player-kick-follow", 0.3]];
    case "pass": return [["player-pass", 0.3]];
    case "throw": return [["keeper-throw", 0.45]];
    case "header": return [["player-header", 0.3], ["player-header-land", 0.2]];
    case "tackle": return [["player-tackle", 0.35], ["player-slide-end", 0.45]];
    case "tackleStand": return [["player-tackle-stand", 0.35]];
    case "fall": return [["player-foul-fall", 0.4], ["player-down", 0.8]];
    case "appeal": return [["player-tackle-stand", 0.4], ["player-appeal", 1.4]];
    case "receive": return [["player-receive", 0.22]];
    case "injured": return [["player-down", 0.5], ["player-injured", 2.5]];
    case "celebrate": return [["player-celebrate", 0.4], ["player-fist", 0.4], ["player-celebrate", 0.4], ["player-fist", 0.4], ["player-celebrate", 0.4]];
    case "dive": {
      const d = `keeper-dive-${side}`;
      return [[`${d}-0`, 0.09], [`${d}-1`, 0.1], [d, 0.31], [`${d}-3`, 0.15], [`${d}-sprawl`, 0.3], [`${d}-up`, 0.45]];
    }
    case "catch": return [["keeper-catch", 0.5]];
  }
}

export type SpriteActionKind =
  | "kick" | "pass" | "throw" | "header" | "tackle" | "tackleStand" | "fall" | "appeal" | "receive" | "injured"
  | "celebrate" | "dive" | "catch";

export interface SpriteAction {
  playerId: number;
  kind: SpriteActionKind;
  startedAt: number;
  /** Keeper dive side in engine y: +1 = toward +y, −1 = toward −y (turned into left / right when drawn). */
  side: 1 | -1;
}

export function actionDuration(kind: SpriteActionKind): number {
  return actionChain(kind).reduce((t, [, s]) => t + s, 0);
}

/** Per-player motion state of the drawing. */
export interface SpriteMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing (radians, screen space, 0 = +x). */
  angle: number;
  gait: "idle" | "walk" | "run";
  /** Cycle position 0..1 (8 frames). */
  phase: number;
}

export function newMotion(x: number, y: number, angle = -Math.PI / 2): SpriteMotion {
  return { x, y, vx: 0, vy: 0, angle, gait: "idle", phase: 0 };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function turn(angle: number, to: number, dt: number, rate: number): number {
  const d = Math.atan2(Math.sin(to - angle), Math.cos(to - angle));
  return angle + d * Math.min(1, dt * rate);
}

/**
 * The motion after a frame: `pos` the drawn position (yards, screen orientation: already mirrored), `dt` real
 * seconds (0 while paused), `look` where an idle player faces (the ball).
 */
export function stepMotion(m: SpriteMotion, pos: { x: number; y: number }, dt: number, look: { x: number; y: number } | null): SpriteMotion {
  const S = PLAYER_SPRITE;
  const dx = pos.x - m.x, dy = pos.y - m.y;
  if (Math.hypot(dx, dy) > S.JUMP_YDS) return { ...m, x: pos.x, y: pos.y, vx: 0, vy: 0, gait: "idle" };
  if (dt <= 0) return { ...m, x: pos.x, y: pos.y };
  const k = Math.min(1, dt * S.VEL_RATE);
  const vx = m.vx + (dx / dt - m.vx) * k;
  const vy = m.vy + (dy / dt - m.vy) * k;
  const sp = Math.hypot(vx, vy);
  const gait = sp < S.IDLE ? "idle" : m.gait === "run" ? (sp < S.RUN_DOWN ? "walk" : "run") : (sp > S.RUN_UP ? "run" : "walk");
  const rate = clamp(S.TURN_MAX - sp * S.TURN_SPEED, S.TURN_MIN, S.TURN_MAX);
  let angle = m.angle;
  if (gait !== "idle") angle = turn(angle, Math.atan2(vy, vx), dt, rate);
  else if (look && Math.hypot(look.x - pos.x, look.y - pos.y) > 0.5) angle = turn(angle, Math.atan2(look.y - pos.y, look.x - pos.x), dt, S.TURN_MIN);
  const cycle = gait === "run" ? S.RUN_CYCLE + S.RUN_CYCLE_PER_SPEED * sp : S.WALK_CYCLE;
  const phase = gait === "idle" ? m.phase : (m.phase + (sp / cycle) * dt) % 1;
  return { x: pos.x, y: pos.y, vx, vy, angle, gait, phase };
}

/** Adds an action; a new one replaces the player's running one. */
export function addAction(list: readonly SpriteAction[], a: Omit<SpriteAction, "startedAt">, now: number): SpriteAction[] {
  return [...list.filter((x) => x.playerId !== a.playerId), { ...a, startedAt: now }];
}

export function liveActions(list: readonly SpriteAction[], now: number): SpriteAction[] {
  return list.filter((a) => now < a.startedAt + actionDuration(a.kind));
}

/** Which atlas a frame name lives in. */
export type SpriteAtlas = "player" | "keeper";

export interface SpritePose {
  atlas: SpriteAtlas;
  /** Frame base name (`player-run-03`); the layer file is `${base}-${layer}.png`. */
  base: string;
}

const poseFor = (base: string): SpritePose => ({ atlas: base.startsWith("keeper-") ? "keeper" : "player", base });

/**
 * The frame a player shows: a running action wins (its step at `now`; `diveSide` the drawn side of a dive), else
 * idle / walk / run by the gait (an idle keeper stands ready).
 */
export function poseOf(m: SpriteMotion, action: SpriteAction | null, now: number, keeper: boolean, diveSide: "left" | "right" = "left"): SpritePose {
  if (action) {
    let t = now - action.startedAt;
    const chain = actionChain(action.kind, diveSide);
    for (const [base, s] of chain) {
      if (t < s) return poseFor(base);
      t -= s;
    }
    return poseFor(chain[chain.length - 1]![0]);
  }
  if (m.gait === "idle") return keeper ? poseFor("keeper-ready") : poseFor("player-idle");
  return poseFor(`player-${m.gait}-${String((Math.floor(m.phase * 8) % 8) + 1).padStart(2, "0")}`);
}

/** Skin tone and hair colour of a player, stable by his roster id. */
export function spriteLook(rosterId: string): { skin: number; hair: number } {
  const r = mulberry32(seedFrom(`sprite:${rosterId}`));
  const S = PLAYER_SPRITE;
  return { skin: S.SKIN[Math.floor(r() * S.SKIN.length)]!, hair: S.HAIR[Math.floor(r() * S.HAIR.length)]! };
}

/** Sprite scale so the body is as wide as the marker (`markerR` px radius). */
export function spriteScale(markerR: number): number {
  return (2 * markerR) / PLAYER_SPRITE.BODY_PX;
}
