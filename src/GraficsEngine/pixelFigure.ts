/**
 * Pixel-art player figures (10.7): which frame of the atlas a player shows, how big it is drawn and how its layers are
 * tinted. Pure; the motion and the actions are the ones of the top-down figures (`playerSprite.ts`), only the picture
 * changes. A clip owns its length: a shot or a tackle plays to its end even after the game's short action is over.
 * Drawing only: nothing reaches the engine.
 */
import type { PixelAtlas, PixelClip } from "@/Domain/art/pixelSprite";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { colorLuma, type SpriteAction, type SpriteActionKind, type SpriteMotion } from "@/GraficsEngine/playerSprite";

export const PIXEL_FIGURE = {
  /** A standing figure is this many times as tall as the top-down figure is wide. */
  HEIGHT_RATIO: 1.7,
  /** Zoom of the art's pixels: whole device pixels, between one CSS pixel and this. */
  MAX_ZOOM: 4,
  /** The figure only turns around when it clearly moves (or looks) sideways: |cos| of the heading above this. */
  FACE_FLIP: 0.3,
  /** A shirt darker than this (luma 0..1) loses its shading: it is lifted by `DARK_LIFT`. */
  DARK_LUMA: 0.1,
  DARK_LIFT: 0x242424,
  /** Shorts as dark or light as the shirt (luma gap below this) become a darker shade of the shirt. */
  SHORTS_GAP: 0.12,
  SHORTS_SHADE: 0.55,
  /** Draw order of the markers by depth: added to the marker's z (stays far below the next layer). */
  Z_PER_PX: 0.00001,
  /**
   * The ground under a figure: a ring `RX` × the drawn body width in half-width, flattened by `FLAT`, in the kit
   * colour (`WIDTH` in marker radii), over a shadow `SHADOW` × its size.
   */
  GROUND: { RX: 0.62, FLAT: 0.38, SHADOW: 0.8, SHADOW_ALPHA: 0.36, WIDTH: 0.13, ALPHA: 0.95 },
  /** Boot colours, picked per player. */
  BOOTS: [0x2a2a30, 0x2a2a30, 0xf2f2f2, 0xff7a1a, 0xe8384f, 0x35c4f0, 0xd7f23a, 0xed8099],
  /** Share of players with a shaved head (no hair layer). */
  BALD: 0.08,
  /** Share of shots at goal struck as a volley or a rabona, and of headers at goal turned into a bicycle kick. */
  VOLLEY: 0.12,
  RABONA: 0.04,
  BICYCLE: 0.12,
  /** A keeper stands ready (not relaxed) with the ball this close (yards). */
  KEEPER_READY_YDS: 45,
  /** A defender near the ball (yards) who barely moves crouches in his defensive stance. */
  STANCE_YDS: 9,
  /** Dribble tricks, one picked for a won dribble. */
  TRICKS: ["roulette", "hocusPocus", "rivelino"],
} as const;

/** Clips an action can use, the first the atlas has; none = the gait goes on. */
const ACTION_CLIPS: Record<SpriteActionKind, readonly string[]> = {
  kick: ["kick"],
  pass: ["pass", "kick"],
  throw: ["throw", "kick"],
  header: ["header"],
  tackle: ["tackle"],
  tackleStand: ["tackleStand"],
  fall: ["fall"],
  appeal: ["appeal"],
  receive: ["receive"],
  injured: ["down", "fall"],
  celebrate: ["celebrate"],
  dive: ["dive"],
  catch: ["catch", "receive"],
  punch: ["punch", "header"],
  throwGo: ["throwGo"],
  kneeSlide: ["kneeSlide", "celebrate"],
};

/**
 * Zoom of the figure (CSS px per art px) so a standing one is about `HEIGHT_RATIO` × the top-down figure's width
 * (`width` × the marker's diameter): a whole number of device pixels (`resolution` per CSS px), at least one CSS px.
 */
export function pixelZoom(markerR: number, heightPx: number, width: number, resolution = 1): number {
  const P = PIXEL_FIGURE, res = resolution > 0 ? resolution : 1;
  const want = (2 * markerR * width * P.HEIGHT_RATIO) / heightPx;
  return Math.min(P.MAX_ZOOM, Math.max(Math.ceil(res), Math.round(want * res)) / res);
}

/** Which way the figure looks (1 = right): kept until the heading is clearly to the other side. */
export function pixelFacing(prev: 1 | -1, angle: number): 1 | -1 {
  const c = Math.cos(angle);
  return c > PIXEL_FIGURE.FACE_FLIP ? 1 : c < -PIXEL_FIGURE.FACE_FLIP ? -1 : prev;
}

/** A stable number 0..1 for a player and a moment (which variant of a move he plays). */
export function pixelVariant(playerId: number, startedAt: number): number {
  return ((Math.imul(playerId + 1, 2654435761) ^ Math.imul(Math.floor(startedAt * 1000) + 1, 40503)) >>> 0) / 4294967296;
}

export interface PixelLook {
  /** Hair layer index among the atlas's hair styles, or −1 (shaved). */
  hairStyle: number;
  boots: number;
}

/** Hair style and boot colour of a player, stable by his roster id. */
export function pixelLook(rosterId: string, hairStyles: number): PixelLook {
  const P = PIXEL_FIGURE, r = mulberry32(seedFrom(`pixel:${rosterId}`));
  const bald = r() < P.BALD, style = Math.floor(r() * Math.max(1, hairStyles)), boots = P.BOOTS[Math.floor(r() * P.BOOTS.length)]!;
  return { hairStyle: bald || hairStyles === 0 ? -1 : style, boots };
}

/** The hair layers of an atlas (`hair0`, `hair1`…), in order. */
export function hairLayers(atlas: PixelAtlas): string[] {
  return atlas.layers.filter((l) => /^hair\d+$/.test(l)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

export interface PixelKit {
  shirt: number;
  shorts: number;
  socks: number;
}

const shadeOf = (c: number, k: number): number => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The kit of a team's figures: shirt and socks in the kit colour, shorts in the club's second colour. */
export function pixelKit(kit: number, second: number): PixelKit {
  const P = PIXEL_FIGURE;
  const shirt = colorLuma(kit) < P.DARK_LUMA ? Math.min(0xffffff, kit + P.DARK_LIFT) : kit;
  const shorts = Math.abs(colorLuma(kit) - colorLuma(second)) < P.SHORTS_GAP ? shadeOf(shirt, P.SHORTS_SHADE) : second;
  return { shirt, shorts, socks: shirt };
}

/** The colours of one player's figure. */
export interface PixelColours extends PixelKit {
  skin: number;
  hair: number;
  boots: number;
  /** His hair layer's name (`hair2`), or null (shaved). */
  hairLayer: string | null;
}

/** The tint of a layer for a player (the layers are greys, multiplied by it), or null when he does not show it. */
export function pixelLayerTint(layer: string, c: PixelColours): number | null {
  switch (layer) {
    case "skin": return c.skin;
    case "socks": return c.socks;
    case "boots": return c.boots;
    case "shorts": return c.shorts;
    case "shirt": return c.shirt;
    default:
      if (layer.startsWith("hair")) return layer === c.hairLayer ? c.hair : null;
      // Gloves, effects and anything else keep the art's own colours.
      return 0xffffff;
  }
}

export function clipLength(clip: PixelClip): number {
  return clip.frames.length * clip.dur;
}

function clipFrame(clip: PixelClip, t: number): number {
  const n = clip.frames.length, i = Math.floor(Math.max(0, t) / clip.dur);
  return clip.frames[clip.loop ? i % n : Math.min(n - 1, i)]!;
}

export interface PixelPickOpts {
  keeper: boolean;
  /** A keeper's dive goes down the screen (else up). */
  diveDown?: boolean;
  /** The kick or header is an attempt at goal: the showy variants are allowed. */
  shot?: boolean;
  /** 0..1, which variant (`pixelVariant`). */
  variant?: number;
}

/** The clip an action plays, or null (the atlas has none for it: the gait goes on). */
export function pickPixelClip(atlas: PixelAtlas, kind: SpriteActionKind, o: PixelPickOpts): string | null {
  const P = PIXEL_FIGURE, c = atlas.clips, v = o.variant ?? 1;
  const names: string[] = [];
  if (kind === "dive") names.push(o.diveDown ? "diveDown" : "diveUp", o.diveDown ? "diveUp" : "diveDown");
  if (o.shot && !o.keeper && kind === "kick") {
    if (v < P.RABONA) names.push("rabona");
    else if (v < P.RABONA + P.VOLLEY) names.push("volley");
  }
  if (o.shot && !o.keeper && kind === "header" && v < P.BICYCLE) names.push("bicycle");
  // A keeper's own version of a clip (`keeperKick`) comes before the outfield one.
  for (const n of ACTION_CLIPS[kind]) {
    if (o.keeper) names.push(`keeper${n[0]!.toUpperCase()}${n.slice(1)}`);
    names.push(n);
  }
  return names.find((n) => c[n]) ?? null;
}

/** A dribble trick of the atlas, or null. */
export function pickPixelTrick(atlas: PixelAtlas, variant: number): string | null {
  const have = PIXEL_FIGURE.TRICKS.filter((n) => atlas.clips[n]);
  return have.length ? have[Math.min(have.length - 1, Math.floor(variant * have.length))]! : null;
}

/** A clip a player is in the middle of. `key` tells which action (or trick) started it. */
export interface PixelPlay {
  clip: string;
  startedAt: number;
  key: number;
}

/**
 * The clip a player is playing after this frame. A new action starts its clip (or stops the running one when the
 * atlas has none for it); a running clip goes on until its end, and for as long as its action lasts (a loop repeats,
 * any other holds its last frame).
 */
export function stepPixelPlay(atlas: PixelAtlas, prev: PixelPlay | null, action: SpriteAction | null, now: number, o: PixelPickOpts): PixelPlay | null {
  if (action && prev?.key !== action.startedAt) {
    const clip = pickPixelClip(atlas, action.kind, o);
    return clip ? { clip, startedAt: action.startedAt, key: action.startedAt } : null;
  }
  if (!prev) return null;
  const clip = atlas.clips[prev.clip];
  if (!clip) return null;
  if (action) return prev;
  return !clip.loop && now - prev.startedAt < clipLength(clip) ? prev : null;
}

export interface PixelGaitOpts {
  keeper: boolean;
  /** He has the ball at his feet. */
  hasBall?: boolean;
  /** A keeper with the play near: he stands ready. */
  ready?: boolean;
  /** A defender facing the ball carrier up close: his crouched stance when he barely moves. */
  stance?: boolean;
  /** He holds the ball over his head (throw-in taker). */
  hold?: boolean;
  /** Shifts the idle loop so the players do not breathe in step. */
  offset?: number;
}

/** The atlas frame a player shows: his running clip, else the gait (idle by time, walk and run by the stride). */
export function pixelFrame(atlas: PixelAtlas, m: SpriteMotion, play: PixelPlay | null, now: number, o: PixelGaitOpts): number {
  const c = atlas.clips;
  const playing = play ? c[play.clip] : undefined;
  if (play && playing) return clipFrame(playing, now - play.startedAt);
  const t = now + (o.offset ?? 0);
  if (o.hold && c.throwHold) return clipFrame(c.throwHold, t);
  const stride = (clip: PixelClip) => clip.frames[Math.floor(m.phase * clip.frames.length) % clip.frames.length]!;
  if (o.keeper) {
    if (m.gait === "idle") return clipFrame((o.ready && c.keeperReady) || c.keeperIdle || c.idle!, t);
    if (m.gait === "walk" && c.keeperWalk) return stride(c.keeperWalk);
  }
  if (m.gait === "idle") return clipFrame((o.stance && c.stance) || c.idle!, t);
  if (o.stance && m.gait === "walk" && c.stance) return clipFrame(c.stance, t);
  const withBall = o.hasBall ? c[`${m.gait}Ball`] : undefined;
  return stride(withBall ?? c[m.gait]!);
}
