import { describe, expect, test } from "bun:test";
import type { PixelAtlas } from "@/Domain/art/pixelSprite";
import {
  PIXEL_FIGURE, clipLength, frameHasLayer, hairLayers, hasPixelOfficial, isPixelOfficial, officialPixelColours, officialPixelFrame,
  pickPixelClip, pickPixelTrick, pixelBallTurn, pixelFacing, pixelFrame, pixelKit, pixelLayerTint, pixelLook, pixelSnap, pixelVariant, pixelZoom,
  stepPixelPlay, type PixelColours,
} from "@/GraficsEngine/pixelFigure";
import { newMotion, type SpriteAction } from "@/GraficsEngine/playerSprite";

const clip = (frames: number[], dur = 0.1, loop = false) => ({ frames, dur, ...(loop ? { loop: true } : {}) });
const atlas = (extra: PixelAtlas["clips"] = {}): PixelAtlas => ({
  image: "sprites/a.png", body: 15, height: 31, scale: 1,
  layers: ["skin", "socks", "boots", "shorts", "shirt", "gloves", "hair0", "hair1", "vfx"],
  rects: [[0, 0, 4, 4]], frames: Array.from({ length: 100 }, () => []),
  clips: {
    idle: clip([0, 1, 2, 3], 0.2, true), walk: clip([10, 11, 12, 13], 0.1, true), run: clip([20, 21, 22, 23, 24, 25], 0.1, true),
    kick: clip([30, 31, 32], 0.1), ...extra,
  },
});
const act = (kind: SpriteAction["kind"], startedAt = 10, playerId = 1): SpriteAction => ({ playerId, kind, startedAt, side: 1 });
const outfield = { keeper: false };

describe("pixelZoom", () => {
  test("whole device pixels, never below one CSS pixel", () => {
    expect(pixelZoom(12, 31, 1.35)).toBe(2);
    expect(pixelZoom(6, 31, 1.35)).toBe(1);
    expect(pixelZoom(60, 31, 1.35)).toBe(PIXEL_FIGURE.MAX_ZOOM);
    // At 1.5 device pixels per CSS pixel the steps are thirds of two: 1⅓, 2, 2⅔…
    const z = pixelZoom(12, 31, 1.35, 1.5);
    expect(Number.isInteger(Math.round(z * 1.5 * 1000) / 1000)).toBe(true);
    expect(z).toBeGreaterThanOrEqual(4 / 3);
  });
});

describe("a painted (smooth) atlas", () => {
  test("any zoom, a little smaller than the pixel figure for the same art", () => {
    const z = pixelZoom(12, 93, 1.35, 1.5, true);
    expect(z).toBeCloseTo((2 * 12 * 1.35 * PIXEL_FIGURE.SMOOTH_HEIGHT_RATIO) / 93, 6);
    // Its drawn height is the smooth ratio over the pixel one (before the pixel zoom is rounded).
    expect((z * 93) / (2 * 12 * 1.35)).toBeCloseTo(PIXEL_FIGURE.SMOOTH_HEIGHT_RATIO, 6);
    expect(PIXEL_FIGURE.SMOOTH_HEIGHT_RATIO).toBeLessThan(PIXEL_FIGURE.HEIGHT_RATIO);
  });

  test("never snapped to whole pixels; pixel art is", () => {
    expect(pixelSnap(10.3, 2)).toBe(10.5);
    expect(pixelSnap(10.6, 1.5)).toBeCloseTo(10 + 2 / 3, 6);
    expect(pixelSnap(10.3, 2, true)).toBe(10.3);
    expect(pixelSnap(10.3, 0)).toBe(10.3);
  });

  test("nobody is shaved (there is no head under the painted hair) and the ball turns freely", () => {
    for (let i = 0; i < 300; i++) expect(pixelLook(`p${i}`, 1, false).hairStyle).toBe(0);
    expect(Array.from({ length: 300 }, (_, i) => pixelLook(`p${i}`, 1).hairStyle)).toContain(-1);
    expect(pixelBallTurn(1.1, true)).toBe(1.1);
    expect(pixelBallTurn(1.1)).toBe(Math.PI / 2);
    for (let i = 0; i < 200; i++) expect(officialPixelColours("coach", `c${i}`, ["hair0"], 0x112233, false).hairLayer).toBe("hair0");
  });
});

describe("pixelFacing", () => {
  test("turns only when clearly heading to the other side", () => {
    expect(pixelFacing(1, Math.PI)).toBe(-1);
    expect(pixelFacing(-1, 0)).toBe(1);
    expect(pixelFacing(1, Math.PI / 2)).toBe(1);
    expect(pixelFacing(-1, -Math.PI / 2)).toBe(-1);
  });
});

describe("look and tints", () => {
  test("a player's look is stable and inside the atlas's styles", () => {
    const a = pixelLook("player_1", 5);
    expect(pixelLook("player_1", 5)).toEqual(a);
    expect(a.hairStyle).toBeGreaterThanOrEqual(-1);
    expect(a.hairStyle).toBeLessThan(5);
    expect(PIXEL_FIGURE.BOOTS).toContain(a.boots as never);
    expect(pixelLook("x", 0).hairStyle).toBe(-1);
    const styles = new Set(Array.from({ length: 300 }, (_, i) => pixelLook(`p${i}`, 5).hairStyle));
    expect(styles.size).toBe(6);       // five styles and the shaved head
  });

  test("hair layers in order", () => {
    expect(hairLayers(atlas())).toEqual(["hair0", "hair1"]);
  });

  test("each layer takes its colour; only the player's own hair shows", () => {
    const c: PixelColours = { shirt: 1, shorts: 2, socks: 3, skin: 4, hair: 5, boots: 6, hairLayer: "hair1" };
    expect(pixelLayerTint("shirt", c)).toBe(1);
    expect(pixelLayerTint("shorts", c)).toBe(2);
    expect(pixelLayerTint("socks", c)).toBe(3);
    expect(pixelLayerTint("skin", c)).toBe(4);
    expect(pixelLayerTint("boots", c)).toBe(6);
    expect(pixelLayerTint("hair1", c)).toBe(5);
    expect(pixelLayerTint("hair0", c)).toBeNull();
    expect(pixelLayerTint("gloves", c)).toBe(0xffffff);
    expect(pixelLayerTint("vfx", c)).toBe(0xffffff);
    expect(pixelLayerTint("hair0", { ...c, hairLayer: null })).toBeNull();
  });

  test("kit: dark shirt lifted, shorts never the shirt's shade", () => {
    expect(pixelKit(0x000000, 0xffffff).shirt).toBe(PIXEL_FIGURE.DARK_LIFT);
    expect(pixelKit(0xcc0000, 0xffffff)).toEqual({ shirt: 0xcc0000, shorts: 0xffffff, socks: 0xcc0000 });
    const same = pixelKit(0xcc0000, 0xcc0000);
    expect(same.shorts).not.toBe(0xcc0000);
  });
});

describe("clips", () => {
  test("an action picks the first clip the atlas has; none = null", () => {
    expect(pickPixelClip(atlas(), "kick", outfield)).toBe("kick");
    expect(pickPixelClip(atlas(), "pass", outfield)).toBe("kick");
    expect(pickPixelClip(atlas({ pass: clip([40]) }), "pass", outfield)).toBe("pass");
    expect(pickPixelClip(atlas(), "appeal", outfield)).toBeNull();
    expect(pickPixelClip(atlas(), "tackle", outfield)).toBeNull();
  });

  test("a keeper's own clip comes first; a dive follows its side", () => {
    const a = atlas({ keeperKick: clip([50]), throw: clip([51]), diveUp: clip([60]), diveDown: clip([61]) });
    expect(pickPixelClip(a, "kick", { keeper: true })).toBe("keeperKick");
    expect(pickPixelClip(a, "kick", outfield)).toBe("kick");
    expect(pickPixelClip(a, "throw", { keeper: true })).toBe("throw");
    expect(pickPixelClip(a, "dive", { keeper: true, diveDown: true })).toBe("diveDown");
    expect(pickPixelClip(a, "dive", { keeper: true })).toBe("diveUp");
    expect(pickPixelClip(atlas({ diveUp: clip([60]) }), "dive", { keeper: true, diveDown: true })).toBe("diveUp");
  });

  test("showy variants only on an attempt at goal, by the variant number", () => {
    const a = atlas({ volley: clip([70]), rabona: clip([71]), bicycle: clip([72]), header: clip([73]) });
    const P = PIXEL_FIGURE;
    expect(pickPixelClip(a, "kick", { keeper: false, shot: true, variant: P.RABONA / 2 })).toBe("rabona");
    expect(pickPixelClip(a, "kick", { keeper: false, shot: true, variant: P.RABONA + P.VOLLEY / 2 })).toBe("volley");
    expect(pickPixelClip(a, "kick", { keeper: false, shot: true, variant: 0.9 })).toBe("kick");
    expect(pickPixelClip(a, "kick", { keeper: false, variant: 0 })).toBe("kick");
    expect(pickPixelClip(a, "kick", { keeper: true, shot: true, variant: 0 })).toBe("kick");
    expect(pickPixelClip(a, "header", { keeper: false, shot: true, variant: 0 })).toBe("bicycle");
    expect(pickPixelClip(a, "header", { keeper: false, variant: 0 })).toBe("header");
    // An atlas without the variant plays the plain clip.
    expect(pickPixelClip(atlas(), "kick", { keeper: false, shot: true, variant: 0 })).toBe("kick");
  });

  test("tricks: one of the atlas's, by the variant", () => {
    expect(pickPixelTrick(atlas(), 0.5)).toBeNull();
    const a = atlas({ roulette: clip([80]), rivelino: clip([81]) });
    expect(pickPixelTrick(a, 0)).toBe("roulette");
    expect(pickPixelTrick(a, 0.99)).toBe("rivelino");
    expect(pickPixelTrick(a, 1)).toBe("rivelino");
  });

  test("a trick has its version on the run for a moving player", () => {
    const a = atlas({ roulette: clip([80]), rainbow: clip([82]), rainbowRun: clip([83]) });
    expect(pickPixelTrick(a, 0.9)).toBe("rainbow");
    expect(pickPixelTrick(a, 0.9, true)).toBe("rainbowRun");
    expect(pickPixelTrick(a, 0.1, true)).toBe("roulette");
    // Without the running version, the standing one.
    expect(pickPixelTrick(atlas({ rainbow: clip([82]) }), 0.9, true)).toBe("rainbow");
  });

  test("a header that is only a jump", () => {
    const a = atlas({ header: clip([70]), jump: clip([71]) });
    expect(pickPixelClip(a, "header", { keeper: false, jump: true })).toBe("jump");
    expect(pickPixelClip(a, "header", { keeper: false })).toBe("header");
    expect(pickPixelClip(a, "header", { keeper: true, jump: true })).toBe("header");
    expect(pickPixelClip(atlas({ header: clip([70]) }), "header", { keeper: false, jump: true })).toBe("header");
  });

  test("the variant number is stable and spread", () => {
    expect(pixelVariant(3, 12.345)).toBe(pixelVariant(3, 12.345));
    const vs = Array.from({ length: 400 }, (_, i) => pixelVariant(i % 22, i * 1.37));
    expect(Math.min(...vs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vs)).toBeLessThan(1);
    const low = vs.filter((v) => v < 0.25).length;
    expect(low).toBeGreaterThan(60);
    expect(low).toBeLessThan(140);
  });
});

describe("stepPixelPlay", () => {
  const a = atlas({ celebrate: clip([90, 91], 0.1, true), long: clip([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1) });

  test("a new action starts its clip; the clip plays to its end after the action is over", () => {
    const kick = act("kick", 10);
    const p = stepPixelPlay(a, null, kick, 10, outfield)!;
    expect(p).toEqual({ clip: "kick", startedAt: 10, key: 10 });
    expect(stepPixelPlay(a, p, kick, 10.1, outfield)).toBe(p);
    // The action is gone at 10.2, the clip lasts 0.3 s.
    expect(stepPixelPlay(a, p, null, 10.25, outfield)).toBe(p);
    expect(stepPixelPlay(a, p, null, 10.3, outfield)).toBeNull();
  });

  test("a clip shorter than its action holds on; a loop ends with its action", () => {
    const kick = act("kick", 10);
    const p = stepPixelPlay(a, null, kick, 10, outfield)!;
    expect(stepPixelPlay(a, p, kick, 12, outfield)).toBe(p);
    const party = stepPixelPlay(a, null, act("celebrate", 20), 20, outfield)!;
    expect(stepPixelPlay(a, party, act("celebrate", 20), 21.9, outfield)).toBe(party);
    expect(stepPixelPlay(a, party, null, 22, outfield)).toBeNull();
  });

  test("a newer action replaces the running clip, or stops it when the atlas has none", () => {
    const p = stepPixelPlay(a, null, act("kick", 10), 10, outfield)!;
    expect(stepPixelPlay(a, p, act("celebrate", 10.1), 10.1, outfield)).toEqual({ clip: "celebrate", startedAt: 10.1, key: 10.1 });
    expect(stepPixelPlay(a, p, act("appeal", 10.1), 10.1, outfield)).toBeNull();
  });

  test("a trick (no action) plays to its end; a clip the atlas lost stops", () => {
    const trick = { clip: "long", startedAt: 5, key: -5 };
    expect(stepPixelPlay(a, trick, null, 5.9, outfield)).toBe(trick);
    expect(stepPixelPlay(a, trick, null, 6, outfield)).toBeNull();
    expect(clipLength(a.clips.long!)).toBeCloseTo(1);
    expect(stepPixelPlay(a, { clip: "gone", startedAt: 5, key: -5 }, null, 5.1, outfield)).toBeNull();
  });
});

describe("pixelFrame", () => {
  const idle = newMotion(0, 0);
  const moving = (gait: "walk" | "run", phase: number) => ({ ...idle, gait, phase });

  test("a running clip wins: by time, held on its last frame, a loop wrapping", () => {
    const a = atlas({ celebrate: clip([90, 91], 0.1, true) });
    const kick = { clip: "kick", startedAt: 10, key: 10 };
    expect(pixelFrame(a, idle, kick, 10, outfield)).toBe(30);
    expect(pixelFrame(a, idle, kick, 10.15, outfield)).toBe(31);
    expect(pixelFrame(a, idle, kick, 99, outfield)).toBe(32);
    expect(pixelFrame(a, idle, { clip: "celebrate", startedAt: 0, key: 0 }, 0.25, outfield)).toBe(90);
  });

  test("gait: idle by time (with the player's offset), walk and run by the stride", () => {
    const a = atlas();
    expect(pixelFrame(a, idle, null, 0, outfield)).toBe(0);
    expect(pixelFrame(a, idle, null, 0.25, outfield)).toBe(1);
    expect(pixelFrame(a, idle, null, 0, { keeper: false, offset: 0.45 })).toBe(2);
    expect(pixelFrame(a, moving("walk", 0.5), null, 0, outfield)).toBe(12);
    expect(pixelFrame(a, moving("run", 0.99), null, 0, outfield)).toBe(25);
  });

  test("with the ball he uses the dribbling cycles when the atlas has them", () => {
    const a = atlas({ walkBall: clip([14, 15], 0.1, true), runBall: clip([26, 27], 0.1, true) });
    expect(pixelFrame(a, moving("run", 0.6), null, 0, { keeper: false, hasBall: true })).toBe(27);
    expect(pixelFrame(a, moving("walk", 0), null, 0, { keeper: false, hasBall: true })).toBe(14);
    expect(pixelFrame(atlas(), moving("run", 0), null, 0, { keeper: false, hasBall: true })).toBe(20);
  });

  test("a defender up close crouches while he barely moves, and runs normally", () => {
    const a = atlas({ stance: clip([40, 41], 0.1, true) });
    expect(pixelFrame(a, idle, null, 0.1, { keeper: false, stance: true })).toBe(41);
    expect(pixelFrame(a, moving("walk", 0.5), null, 0, { keeper: false, stance: true })).toBe(40);
    expect(pixelFrame(a, moving("run", 0), null, 0, { keeper: false, stance: true })).toBe(20);
  });

  test("keeper: relaxed, ready with the play near, shuffling when he moves slowly", () => {
    const a = atlas({ keeperIdle: clip([50], 0.2, true), keeperReady: clip([51], 0.2, true), keeperWalk: clip([52, 53], 0.1, true) });
    expect(pixelFrame(a, idle, null, 0, { keeper: true })).toBe(50);
    expect(pixelFrame(a, idle, null, 0, { keeper: true, ready: true })).toBe(51);
    expect(pixelFrame(a, moving("walk", 0.5), null, 0, { keeper: true })).toBe(53);
    expect(pixelFrame(a, moving("run", 0), null, 0, { keeper: true })).toBe(20);
    // An atlas without keeper clips: the outfield ones.
    expect(pixelFrame(atlas(), idle, null, 0, { keeper: true, ready: true })).toBe(0);
  });

  test("standing with the ball: at his feet, a foot by it at a set piece, juggling before the whistle", () => {
    const a = atlas({ idleBall: clip([61], 0.2, true), setBall: clip([62], 0.2, true), juggle: clip([63, 64], 0.1, true) });
    expect(pixelFrame(a, idle, null, 0, { keeper: false, hasBall: true })).toBe(61);
    expect(pixelFrame(a, idle, null, 0, { keeper: false, hasBall: true, setPiece: true })).toBe(62);
    expect(pixelFrame(a, idle, null, 0.15, { keeper: false, hasBall: true, juggle: true })).toBe(64);
    // Juggling needs the ball and standing still.
    expect(pixelFrame(a, idle, null, 0, { keeper: false, juggle: true })).toBe(0);
    expect(pixelFrame(a, moving("walk", 0), null, 0, { keeper: false, hasBall: true, juggle: true })).toBe(10);
    // An atlas without those clips: the plain idle.
    expect(pixelFrame(atlas(), idle, null, 0, { keeper: false, hasBall: true, setPiece: true })).toBe(0);
  });

  test("a keeper standing with the ball holds it in his hands", () => {
    const a = atlas({ keeperIdle: clip([50], 0.2, true), keeperHold: clip([54], 0.2, true), keeperWalk: clip([52, 53], 0.1, true) });
    expect(pixelFrame(a, idle, null, 0, { keeper: true, hasBall: true, ready: true })).toBe(54);
    expect(pixelFrame(a, idle, null, 0, { keeper: true })).toBe(50);
    // Walking with it he uses the outfield gait (the ball at his feet).
    expect(pixelFrame(a, moving("walk", 0), null, 0, { keeper: true, hasBall: true })).toBe(10);
  });

  test("a throw-in taker holds the ball up", () => {
    expect(pixelFrame(atlas({ throwHold: clip([60], 0.5, true) }), idle, null, 0, { keeper: false, hold: true })).toBe(60);
    expect(pixelFrame(atlas(), idle, null, 0, { keeper: false, hold: true })).toBe(0);
  });
});

describe("the ball and the officials", () => {
  const idle = newMotion(0, 0);
  const ref = () => atlas({
    refIdle: clip([90, 91], 0.2, true), refRun: clip([92, 93, 94], 0.1, true), refYellow: clip([95, 96], 0.1), refRed: clip([97, 98], 0.1),
    celebrate: clip([85, 86], 0.1, true),
  });

  test("which frames carry a layer", () => {
    const a = atlas();
    a.layers = [...a.layers, "ball"];
    a.frames[5] = [{ layer: a.layers.indexOf("ball"), rect: 0, x: 0, y: 0 }];
    expect(frameHasLayer(a, 5, "ball")).toBe(true);
    expect(frameHasLayer(a, 6, "ball")).toBe(false);
    expect(frameHasLayer(a, 5, "card")).toBe(false);
    expect(frameHasLayer(a, 999, "ball")).toBe(false);
  });

  test("the loose ball turns in quarter turns", () => {
    expect(pixelBallTurn(0.1)).toBe(0);
    expect(pixelBallTurn(Math.PI / 2 + 0.2)).toBeCloseTo(Math.PI / 2);
    expect(pixelBallTurn(-Math.PI)).toBeCloseTo(-Math.PI);
  });

  test("who has a pixel figure", () => {
    expect(isPixelOfficial("referee")).toBe(true);
    expect(isPixelOfficial("photographer")).toBe(false);
    expect(hasPixelOfficial(atlas(), "referee")).toBe(false);
    expect(hasPixelOfficial(atlas(), "coach")).toBe(true);
    expect(hasPixelOfficial(ref(), "assistant")).toBe(true);
  });

  test("the referee: idle, the stride of his run, the card taken out and held", () => {
    const a = ref();
    expect(officialPixelFrame(a, "referee", idle, 0.25)).toBe(91);
    expect(officialPixelFrame(a, "referee", { ...idle, gait: "run", phase: 0.5 }, 0)).toBe(93);
    expect(officialPixelFrame(a, "referee", idle, 10.05, { card: { card: "yellow", at: 10 } })).toBe(95);
    expect(officialPixelFrame(a, "referee", idle, 12, { card: { card: "yellow", at: 10 } })).toBe(96);
    expect(officialPixelFrame(a, "referee", idle, 10, { card: { card: "red", at: 10 } })).toBe(97);
    // Only the referee shows cards.
    expect(officialPixelFrame(a, "assistant", idle, 0, { card: { card: "red", at: 0 } })).toBe(90);
  });

  test("managers and medics use a player's figure; a manager celebrates", () => {
    const a = ref();
    expect(officialPixelFrame(a, "coach", idle, 0)).toBe(0);
    expect(officialPixelFrame(a, "coach", idle, 0.15, { celebrate: true })).toBe(86);
    expect(officialPixelFrame(a, "coach", { ...idle, gait: "walk", phase: 0.5 }, 0)).toBe(12);
    // Medics only run.
    expect(officialPixelFrame(a, "medic", { ...idle, gait: "walk", phase: 0.5 }, 0)).toBe(23);
  });

  test("colours: the referee's kit, the manager in the club colour, stable by the id", () => {
    const hair = ["hair0", "hair1"];
    const r = officialPixelColours("referee", "referee", hair);
    expect(r.shirt).toBe(PIXEL_FIGURE.REFEREE.shirt);
    expect(r.socks).toBe(PIXEL_FIGURE.REFEREE.socks);
    expect(r.hairLayer).toBe("hair0");
    expect(officialPixelColours("referee", "referee", hair)).toEqual(r);
    expect(officialPixelColours("fourth", "fourth", hair).shirt).toBe(PIXEL_FIGURE.FOURTH.shirt);
    const c = officialPixelColours("coach", "coach:A", hair, 0xcc2030);
    expect(c.shirt).toBe(0xcc2030);
    expect(c.shorts).toBe(PIXEL_FIGURE.COACH.shorts);
    expect(officialPixelColours("medic", "medic:0:1", hair).shirt).toBe(PIXEL_FIGURE.MEDIC.shirt);
  });
});
