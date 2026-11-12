/**
 * Pixel-art figures (10.7): which frame of the atlas a player, the referee or anyone else on the touchline shows, how
 * big it is drawn and how its layers are tinted. Pure; the motion and the actions are the ones of the top-down figures
 * (`playerSprite.ts`), only the picture changes. A clip owns its length: a shot or a tackle plays to its end even
 * after the game's short action is over. Drawing only: nothing reaches the engine.
 */
import type { PixelAtlas, PixelClip } from "@/Domain/art/pixelSprite";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { PLAYER_SPRITE, colorLuma, type SpriteAction, type SpriteActionKind, type SpriteMotion } from "@/GraficsEngine/playerSprite";

export const PIXEL_FIGURE = {
  /** A standing figure is this many times as tall as the top-down figure is wide. */
  HEIGHT_RATIO: 1.7,
  /** The same for a painted (smooth) atlas: drawn a little smaller, the match seen from a bit farther away. */
  SMOOTH_HEIGHT_RATIO: 1.36,
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
  /** Dribble tricks, one picked for a won dribble; `TRICK_ON_THE_RUN` is the version of a trick for a moving player. */
  TRICKS: ["roulette", "hocusPocus", "rivelino", "rainbow"],
  TRICK_ON_THE_RUN: { rainbow: "rainbowRun" } as Record<string, string>,
  /** The loose ball turns in quarter turns (the art's pixels stay square). */
  BALL_TURN: Math.PI / 2,
  /** The ball in snow (as the top-down ball). */
  BALL_SNOW: 0xff9a3c,
  /** Kits of the people drawn with the referee's figure and of the managers and medics (player figures). */
  REFEREE: { shirt: 0x3e3546, socks: 0xf2c230 },
  FOURTH: { shirt: 0x3a4458, socks: 0xf2c230 },
  COACH: { shorts: 0x1d2433, socks: 0x1d2433, boots: 0x2a2a30 },
  MEDIC: { shirt: 0xf4f6fa, shorts: 0xd63430, socks: 0xf4f6fa, boots: 0x2a2a30 },
  /** An assistant's flag, in art pixels: pole length, cloth side. */
  FLAG: { POLE: 9, CLOTH: 5, A: 0xf2c230, B: 0xd63430, POLE_COLOR: 0xe8e8e8 },
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
export function pixelZoom(markerR: number, heightPx: number, width: number, resolution = 1, smooth = false): number {
  const P = PIXEL_FIGURE, res = resolution > 0 ? resolution : 1;
  // A painted atlas has no pixels to keep square: any zoom.
  if (smooth) return (2 * markerR * width * P.SMOOTH_HEIGHT_RATIO) / heightPx;
  const want = (2 * markerR * width * P.HEIGHT_RATIO) / heightPx;
  return Math.min(P.MAX_ZOOM, Math.max(Math.ceil(res), Math.round(want * res)) / res);
}

/** A coordinate on whole device pixels (pixel art: its pixels stay square); a painted atlas moves freely. */
export function pixelSnap(v: number, resolution: number, smooth = false): number {
  return smooth || !(resolution > 0) ? v : Math.round(v * resolution) / resolution;
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

/**
 * Hair style and boot colour of a player, stable by his roster id. `canBeBald` false: the atlas has no head under
 * the hair (a painted atlas), so nobody is shaved.
 */
export function pixelLook(rosterId: string, hairStyles: number, canBeBald = true): PixelLook {
  const P = PIXEL_FIGURE, r = mulberry32(seedFrom(`pixel:${rosterId}`));
  const bald = r() < P.BALD && canBeBald, style = Math.floor(r() * Math.max(1, hairStyles)), boots = P.BOOTS[Math.floor(r() * P.BOOTS.length)]!;
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
      // Gloves, the ball, effects and anything else keep the art's own colours.
      return 0xffffff;
  }
}

/** Whether a frame carries a piece of a layer (the ball of a dribble frame, the referee's card). */
export function frameHasLayer(atlas: PixelAtlas, frame: number, layer: string): boolean {
  const i = atlas.layers.indexOf(layer);
  return i >= 0 && (atlas.frames[frame] ?? []).some((p) => p.layer === i);
}

/** Who else is drawn in pixel art: the referee's figure (referee, assistants, fourth official) or a player's (manager, medic). */
export type PixelOfficialKind = "referee" | "assistant" | "fourth" | "coach" | "medic";

export function isPixelOfficial(kind: string): kind is PixelOfficialKind {
  return kind === "referee" || kind === "assistant" || kind === "fourth" || kind === "coach" || kind === "medic";
}

/** Whether the atlas has the figure of a kind (an older atlas has no referee). */
export function hasPixelOfficial(atlas: PixelAtlas, kind: PixelOfficialKind): boolean {
  return kind === "coach" || kind === "medic" ? !!atlas.clips.idle : !!atlas.clips.refIdle && !!atlas.clips.refRun;
}

/** The colours of an official's figure: stable skin and hair by his id; the manager wears the club colour. */
export function officialPixelColours(kind: PixelOfficialKind, id: string, hair: readonly string[], clubColor = 0x2b3140, canBeBald = true): PixelColours {
  const P = PIXEL_FIGURE, r = mulberry32(seedFrom(`official:${id}`));
  const skin = PLAYER_SPRITE.SKIN[Math.floor(r() * PLAYER_SPRITE.SKIN.length)]!;
  const hairColor = PLAYER_SPRITE.HAIR[Math.floor(r() * PLAYER_SPRITE.HAIR.length)]!;
  if (kind === "coach" || kind === "medic") {
    const look = pixelLook(`official:${id}`, hair.length, canBeBald);
    const hairLayer = hair[look.hairStyle] ?? null;
    if (kind === "medic") return { ...P.MEDIC, skin, hair: hairColor, hairLayer };
    return { shirt: pixelKit(clubColor, clubColor).shirt, ...P.COACH, skin, hair: hairColor, hairLayer };
  }
  // The referee's figure has one hair style and no boots or shorts of its own.
  const kit = kind === "fourth" ? P.FOURTH : P.REFEREE;
  return { shirt: kit.shirt, socks: kit.socks, shorts: kit.shirt, boots: 0x2a2a30, skin, hair: hairColor, hairLayer: hair[0] ?? null };
}

export interface PixelOfficialState {
  /** The referee shows a card since `at` (effects clock). */
  card?: { card: "yellow" | "red"; at: number } | null;
  /** A manager celebrating a goal. */
  celebrate?: boolean;
  offset?: number;
}

/** The frame an official shows: his card, else idle or the stride of his run. */
export function officialPixelFrame(atlas: PixelAtlas, kind: PixelOfficialKind, m: SpriteMotion, now: number, s: PixelOfficialState = {}): number {
  const c = atlas.clips, t = now + (s.offset ?? 0);
  const stride = (clip: PixelClip) => clip.frames[Math.floor(m.phase * clip.frames.length) % clip.frames.length]!;
  if (kind === "coach" || kind === "medic") {
    if (s.celebrate && c.celebrate) return clipFrame(c.celebrate, t);
    if (kind === "medic" && m.gait !== "idle") return stride(c.run!);
    return m.gait === "idle" ? clipFrame(c.idle!, t) : stride(c[m.gait]!);
  }
  if (kind === "referee" && s.card) {
    const clip = s.card.card === "red" ? c.refRed : c.refYellow;
    if (clip) return clipFrame(clip, now - s.card.at);
  }
  return m.gait === "idle" ? clipFrame(c.refIdle!, t) : stride(c.refRun!);
}

/** The loose ball's turn (radians) from how far it has rolled: whole quarter turns (a painted ball turns freely). */
export function pixelBallTurn(roll: number, smooth = false): number {
  if (smooth) return roll;
  const q = PIXEL_FIGURE.BALL_TURN;
  return Math.round(roll / q) * q;
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
  /** A header that is only a jump (the loser of an aerial duel, the wall at a free kick). */
  jump?: boolean;
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
  if (o.jump && !o.keeper && kind === "header") names.push("jump");
  // A keeper's own version of a clip (`keeperKick`) comes before the outfield one.
  for (const n of ACTION_CLIPS[kind]) {
    if (o.keeper) names.push(`keeper${n[0]!.toUpperCase()}${n.slice(1)}`);
    names.push(n);
  }
  return names.find((n) => c[n]) ?? null;
}

/** A dribble trick of the atlas, or null; a moving player plays the trick's version on the run when it has one. */
export function pickPixelTrick(atlas: PixelAtlas, variant: number, moving = false): string | null {
  const have = PIXEL_FIGURE.TRICKS.filter((n) => atlas.clips[n]);
  if (!have.length) return null;
  const name = have[Math.min(have.length - 1, Math.floor(variant * have.length))]!;
  const run = PIXEL_FIGURE.TRICK_ON_THE_RUN[name];
  return moving && run && atlas.clips[run] ? run : name;
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
  /** He waits to take a set piece with the ball at his feet. */
  setPiece?: boolean;
  /** He juggles the ball (the kick-off taker before the whistle). */
  juggle?: boolean;
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
  if (o.juggle && o.hasBall && m.gait === "idle" && c.juggle) return clipFrame(c.juggle, t);
  const stride = (clip: PixelClip) => clip.frames[Math.floor(m.phase * clip.frames.length) % clip.frames.length]!;
  if (o.keeper) {
    // A goal kick or a free kick of his: the ball on the ground at his feet.
    if (m.gait === "idle" && o.hasBall && o.setPiece && c.keeperIdleBall) return clipFrame(c.keeperIdleBall, t);
    // The ball in his hands while he stands with it.
    if (m.gait === "idle" && o.hasBall && c.keeperHold) return clipFrame(c.keeperHold, t);
    if (m.gait === "idle") return clipFrame((o.ready && c.keeperReady) || c.keeperIdle || c.idle!, t);
    if (m.gait === "walk" && c.keeperWalk && !o.hasBall) return stride(c.keeperWalk);
  }
  if (m.gait === "idle" && o.hasBall) {
    const withBall = (o.setPiece && c.setBall) || c.idleBall;
    if (withBall) return clipFrame(withBall, t);
  }
  if (m.gait === "idle") return clipFrame((o.stance && c.stance) || c.idle!, t);
  if (o.stance && m.gait === "walk" && c.stance) return clipFrame(c.stance, t);
  const withBall = o.hasBall ? c[`${m.gait}Ball`] : undefined;
  return stride(withBall ?? c[m.gait]!);
}
