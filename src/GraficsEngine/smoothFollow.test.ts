import { describe, expect, test } from "bun:test";
import { followAt, smoothDamp, smoothPlayers } from "@/GraficsEngine/smoothFollow";

describe("smoothDamp", () => {
  test("eases in: the first step is slow, speed grows, never overshoots, ends at the target", () => {
    let f = followAt({ x: 0, y: 0 });
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) { f = smoothDamp(f, { x: 10, y: 0 }, 0.45, 1 / 60, 9); xs.push(f.x); }
    const d1 = xs[0]!, d10 = xs[10]! - xs[9]!;
    expect(d10).toBeGreaterThan(d1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10);
    expect(xs.at(-1)!).toBeGreaterThan(9.9);
  });
  test("speed cap", () => {
    let f = followAt({ x: 0, y: 0 });
    for (let i = 0; i < 60; i++) f = smoothDamp(f, { x: 100, y: 0 }, 0.45, 1 / 60, 9);
    expect(f.x).toBeLessThan(9.5);
  });
  test("zero dt changes nothing", () => {
    const f = { x: 1, y: 2, vx: 3, vy: 0 };
    expect(smoothDamp(f, { x: 9, y: 9 }, 0.3, 0)).toBe(f);
  });
});

describe("smoothPlayers", () => {
  test("snaps on a teleport and drops players that left", () => {
    const s = new Map();
    smoothPlayers(s, new Map([[1, { x: 0, y: 0 }], [2, { x: 5, y: 5 }]]), 1 / 60, 1, 4);
    const out = smoothPlayers(s, new Map([[1, { x: 50, y: 0 }]]), 1 / 60, 1, 4);
    expect(out.get(1)).toEqual({ x: 50, y: 0 });
    expect(s.has(2)).toBe(false);
  });
  test("follows a small move with a lag", () => {
    const s = new Map();
    smoothPlayers(s, new Map([[1, { x: 0, y: 0 }]]), 1 / 60, 1, 4);
    const out = smoothPlayers(s, new Map([[1, { x: 1, y: 0 }]]), 1 / 60, 1, 4);
    expect(out.get(1)!.x).toBeGreaterThan(0);
    expect(out.get(1)!.x).toBeLessThan(1);
  });
});
