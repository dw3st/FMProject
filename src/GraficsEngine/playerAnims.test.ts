import { describe, expect, test } from "bun:test";
import { addAnim, animOffset, liveAnims, ANIM_DURATION, isLongShot } from "@/GraficsEngine/playerAnims";

const REST = { dx: 0, dy: 0, liftYds: 0, scale: 1, rotation: 0 };

describe("player animations", () => {
  test("offsets start and end at rest", () => {
    for (const kind of ["longShot", "header", "save"] as const) {
      const a = addAnim([], { playerId: 1, kind, dir: { x: 1, y: 0 }, side: 1 }, 0)[0]!;
      expect(animOffset(a, 0)).toEqual(REST);
      expect(animOffset(a, ANIM_DURATION[kind])).toEqual(REST);
    }
  });

  test("long shot winds back then goes through the ball and swells", () => {
    const a = addAnim([], { playerId: 1, kind: "longShot", dir: { x: 1, y: 0 }, side: 1 }, 0)[0]!;
    expect(animOffset(a, ANIM_DURATION.longShot * 0.25).dx).toBeLessThan(0);
    expect(animOffset(a, ANIM_DURATION.longShot * 0.75).dx).toBeGreaterThan(0);
    expect(animOffset(a, ANIM_DURATION.longShot * 0.5).scale).toBeGreaterThan(1.1);
  });

  test("header lifts, save dives and rotates towards the dive side", () => {
    const h = addAnim([], { playerId: 1, kind: "header", dir: { x: 1, y: 0 }, side: 1 }, 0)[0]!;
    expect(animOffset(h, ANIM_DURATION.header / 2).liftYds).toBeGreaterThan(1);
    const s = addAnim([], { playerId: 2, kind: "save", dir: { x: 0, y: -1 }, side: -1 }, 0)[0]!;
    const mid = animOffset(s, ANIM_DURATION.save / 2);
    expect(mid.rotation).toBeLessThan(0);
    expect(mid.dy).toBeLessThan(-1);
  });

  test("a new animation of the same player replaces the old one; expired ones drop", () => {
    let list = addAnim([], { playerId: 1, kind: "header", dir: { x: 1, y: 0 }, side: 1 }, 0);
    list = addAnim(list, { playerId: 2, kind: "save", dir: { x: 0, y: 1 }, side: 1 }, 0);
    list = addAnim(list, { playerId: 1, kind: "longShot", dir: { x: 1, y: 0 }, side: 1 }, 0.1);
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.playerId === 1)!.kind).toBe("longShot");
    expect(liveAnims(list, 0.3)).toHaveLength(2);
    expect(liveAnims(list, 10)).toHaveLength(0);
  });

  test("long shot threshold", () => {
    expect(isLongShot({ x: 90, y: 37 }, 115)).toBe(true); // 25 yd
    expect(isLongShot({ x: 100, y: 37 }, 115)).toBe(false); // 15 yd
    expect(isLongShot({ x: 20, y: 37 }, 0)).toBe(true);
  });
});
