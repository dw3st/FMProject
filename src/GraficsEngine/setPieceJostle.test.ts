import { describe, expect, test } from "bun:test";
import { JOSTLE, jostleOffsets } from "@/GraficsEngine/setPieceJostle";
import { addAnim, animOffset } from "@/GraficsEngine/playerAnims";

const players = [
  { id: 1, team: "A" as const, keeper: false },
  { id: 2, team: "B" as const, keeper: false },
  { id: 3, team: "A" as const, keeper: false },
  { id: 4, team: "B" as const, keeper: true },
];

describe("box jostling", () => {
  test("an attacker in the box and his marker move together; far ones and keepers do not", () => {
    const pos = new Map([[1, { x: 108, y: 37 }], [2, { x: 109.5, y: 37 }], [3, { x: 60, y: 37 }], [4, { x: 114, y: 37 }]]);
    const offs = jostleOffsets(players, pos, "A", 115, 0.13);
    expect([...offs.keys()].sort()).toEqual([1, 2]);
    const a = offs.get(1)!;
    expect(Math.abs(a.x)).toBeLessThanOrEqual(JOSTLE.AMP_YDS);
    expect(a.y).toBeCloseTo(0);
  });

  test("nobody close enough: no jostling", () => {
    const pos = new Map([[1, { x: 108, y: 37 }], [2, { x: 108, y: 47 }]]);
    expect(jostleOffsets(players, pos, "A", 115, 0.2).size).toBe(0);
  });
});

describe("foul and aerial animations", () => {
  const off = (kind: "tumble" | "lunge" | "jump", p: number) => {
    const a = addAnim([], { playerId: 1, kind, dir: { x: 1, y: 0 }, side: 1 }, 0)[0]!;
    return animOffset(a, a.duration * p);
  };
  test("the fouled player is thrown on, then back on his spot", () => {
    expect(off("tumble", 0.5).dx).toBeGreaterThan(1);
    expect(off("tumble", 0.999).dx).toBeLessThan(0.05);
  });
  test("the offender lunges and a jump lifts, both back at rest", () => {
    expect(off("lunge", 0.5).dx).toBeGreaterThan(0.5);
    expect(off("jump", 0.5).liftYds).toBeGreaterThan(1);
    expect(off("jump", 1).liftYds).toBe(0);
  });
});

describe("style animations", () => {
  const at = (kind: "stepover" | "spin" | "flick", p: number) => {
    const a = addAnim([], { playerId: 1, kind, dir: { x: 1, y: 0 }, side: 1 }, 0)[0]!;
    return animOffset(a, a.duration * p);
  };
  test("a step-over feints across the run and ends at rest", () => {
    expect(Math.abs(at("stepover", 0.125).dy)).toBeGreaterThan(0.1);
    expect(at("stepover", 0.125).dx).toBeCloseTo(0);
    expect(at("stepover", 1).dy).toBe(0);
  });
  test("a spin turns once; a first-time pass pops", () => {
    expect(at("spin", 0.5).rotation).toBeCloseTo(Math.PI);
    expect(at("flick", 0.5).scale).toBeGreaterThan(1.1);
  });
});
