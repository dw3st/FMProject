import { describe, expect, test } from "bun:test";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
import { sideEdgeAt, stadiumShadeGrid, SHADE_MARGIN } from "@/GraficsEngine/stadiumShadow";

const sun = (over: Partial<StadiumSun>): StadiumSun => ({
  stadiumId: "s", side: "top", lean: 0, covered: false, height: 1, cut: "none", cutX: 20, cutDepth: 0.3,
  sideSteps: [1], endShadow: false, endDepth: 0.2, endSteps: [1], ...over,
});
const at = (g: ReturnType<typeof stadiumShadeGrid>, x: number, y: number) =>
  g.cells[Math.floor(y - g.y0) * g.w + Math.floor(x - g.x0)]!;

describe("sideEdgeAt", () => {
  test("flat without lean, steps or cuts", () => {
    expect(sideEdgeAt(sun({}), 30, 0.15, 10)).toBeCloseTo(30, 5);
    expect(sideEdgeAt(sun({}), 30, 0.15, 100)).toBeCloseTo(30, 5);
  });
  test("roof steps change the depth along the pitch", () => {
    const s = sun({ sideSteps: [0.8, 1.2] });
    expect(sideEdgeAt(s, 30, 0, 20)).toBeCloseTo(24, 5);
    expect(sideEdgeAt(s, 30, 0, 95)).toBeCloseTo(36, 5);
  });
  test("the corner cut makes the edge turn toward the touchline at the end the sun leans to", () => {
    const s = sun({ cut: "lean", lean: 0.5 });
    expect(sideEdgeAt(s, 30, 0, 115 + SHADE_MARGIN)).toBeCloseTo(9, 5);
    expect(sideEdgeAt(s, 30, 0, 10)).toBeCloseTo(30, 5);
  });
});

describe("stadiumShadeGrid", () => {
  test("shadow near the sun's stand, sunlit beyond, a soft edge in between", () => {
    const g = stadiumShadeGrid(sun({}), 30, 0, 0, 4);
    expect(at(g, 50, 5)).toBe(1);
    expect(at(g, 50, 60)).toBe(0);
    const edge = at(g, 50, 30.5);
    expect(edge).toBeGreaterThan(0.2);
    expect(edge).toBeLessThan(0.8);
  });
  test("bottom stand: the shadow starts at y 74", () => {
    const g = stadiumShadeGrid(sun({ side: "bottom" }), 20, 0, 0, 2);
    expect(at(g, 50, 70)).toBe(1);
    expect(at(g, 50, 10)).toBe(0);
  });
  test("end stand adds an L at the end the sun leans to, never more than 1", () => {
    const g = stadiumShadeGrid(sun({ lean: 0.6, endShadow: true }), 20, 25, 0, 2);
    expect(at(g, 105, 60)).toBe(1);
    expect(at(g, 20, 60)).toBe(0);
    for (const v of g.cells) expect(v).toBeLessThanOrEqual(1);
  });
});
