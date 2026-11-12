import { describe, expect, test } from "bun:test";
import type { PixelAtlas } from "@/Domain/art/pixelSprite";
import {
  PIXEL_FIGURE, clipLength, hairLayers, pickPixelClip, pickPixelTrick, pixelFacing, pixelFrame, pixelKit, pixelLayerTint,
  pixelLook, pixelVariant, pixelZoom, stepPixelPlay, type PixelColours,
} from "@/GraficsEngine/pixelFigure";
import { newMotion, type SpriteAction } from "@/GraficsEngine/playerSprite";

const clip = (frames: number[], dur = 0.1, loop = false) => ({ frames, dur, ...(loop ? { loop: true } : {}) });
const atlas = (extra: PixelAtlas["clips"] = {}): PixelAtlas => ({
  image: "sprites/a.png", body: 15, height: 31,
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

  test("a throw-in taker holds the ball up", () => {
    expect(pixelFrame(atlas({ throwHold: clip([60], 0.5, true) }), idle, null, 0, { keeper: false, hold: true })).toBe(60);
    expect(pixelFrame(atlas(), idle, null, 0, { keeper: false, hold: true })).toBe(0);
  });
});
