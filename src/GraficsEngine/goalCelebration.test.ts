import { describe, expect, test } from "bun:test";
import { arrivedMates, celebrationPositions, CELEBRATION, planCelebration, walkBackPositions } from "@/GraficsEngine/goalCelebration";
import { curvePos } from "@/GraficsEngine/renderInterp";
import { ballHeightBetween, bounceHeight } from "@/GraficsEngine/ballHeight";
import type { GameState } from "@/GameEngine/types";

const players = [
  { id: 1, team: "A" as const, keeper: false },
  { id: 2, team: "A" as const, keeper: false },
  { id: 3, team: "A" as const, keeper: false },
  { id: 4, team: "A" as const, keeper: true },
  { id: 5, team: "B" as const, keeper: false },
];
const positions = new Map([
  [1, { x: 105, y: 30 }], [2, { x: 102, y: 22 }], [3, { x: 20, y: 37 }], [4, { x: 5, y: 37 }], [5, { x: 108, y: 35 }],
]);
const plan = (seed: string) => planCelebration({ scorerId: 1, positions, players, attackDir: 1, seed, gameSpeed: 1 })!;

describe("goal celebration", () => {
  test("the scorer starts where he scored and ends at his target; the near mate joins, the far one and the keeper stay", () => {
    const p = plan("a");
    expect(celebrationPositions(p, 0).get(1)).toEqual({ x: 105, y: 30 });
    expect(celebrationPositions(p, p.duration).get(1)).toEqual(p.to);
    expect(p.mates.map((m) => m.id)).toEqual([2]);
    expect(celebrationPositions(p, 2).get(3)).toEqual({ x: 20, y: 37 });
    expect(celebrationPositions(p, 2).get(4)).toEqual({ x: 5, y: 37 });
    expect(celebrationPositions(p, 2).get(5)).toEqual({ x: 108, y: 35 });
    expect(arrivedMates(p, p.duration)).toEqual([2]);
    expect(arrivedMates(p, 0)).toEqual([]);
  });

  test("every kind is picked for some goal, the corner run ends at the attacked corner, inside the pitch", () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const p = plan(`s${i}`);
      kinds.add(p.kind);
      if (p.kind === "corner") expect(p.to).toEqual({ x: 115 - CELEBRATION.INSET, y: CELEBRATION.INSET });
      expect(p.to.x).toBeGreaterThan(0);
      expect(p.to.x).toBeLessThan(115);
    }
    expect([...kinds].sort()).toEqual(["corner", "crowd", "pile"]);
  });

  test("shorter at a higher game speed, never before the scorer arrives", () => {
    const slow = planCelebration({ scorerId: 1, positions, players, attackDir: 1, seed: "x", gameSpeed: 1 })!;
    const fast = planCelebration({ scorerId: 1, positions, players, attackDir: 1, seed: "x", gameSpeed: 4 })!;
    expect(fast.duration).toBeLessThan(slow.duration);
    expect(fast.duration).toBeGreaterThan(fast.arrival);
  });

  test("walk back ends on the kickoff spots", () => {
    const to = new Map([[1, { x: 57, y: 37 }]]);
    expect(walkBackPositions(new Map([[1, { x: 110, y: 2 }]]), to, 1).get(1)).toEqual({ x: 57, y: 37 });
    expect(walkBackPositions(new Map([[1, { x: 110, y: 2 }]]), to, 0).get(1)).toEqual({ x: 110, y: 2 });
  });

  test("no scorer on the pitch: no celebration", () => {
    expect(planCelebration({ scorerId: 9, positions, players, attackDir: 1, seed: "a", gameSpeed: 1 })).toBeNull();
  });
});

describe("smooth drawing", () => {
  test("curved path ends on the sim steps and rounds a turn", () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 1, y: 0 }, p2 = { x: 1, y: 1 };
    expect(curvePos(p0, p1, p2, 0)).toEqual(p1);
    expect(curvePos(p0, p1, p2, 1)).toEqual(p2);
    const mid = curvePos(p0, p1, p2, 0.5);
    expect(mid.x).toBeGreaterThan(1); // carried on by the run before the turn
  });

  test("a straight run stays straight", () => {
    const mid = curvePos({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, 0.5);
    expect(mid.x).toBeCloseTo(1.5);
    expect(mid.y).toBeCloseTo(0);
  });

  test("a long ball's height follows the parabola between steps; a short pass rolls; a long pass lifts a little", () => {
    const pass = (t: number, kind: string, distance: number) =>
      ({ pass: { fromId: 1, toId: null, toX: 50, toY: 30, kind, t, distance, receiverOffside: false }, shot: null }) as unknown as GameState;
    expect(ballHeightBetween(pass(0, "long_ball", 50), pass(1, "long_ball", 50), 0.5)).toBeCloseTo(8);
    expect(ballHeightBetween(pass(0.2, "regular", 10), pass(0.4, "regular", 10), 0.5)).toBe(0);
    const lofted = ballHeightBetween(pass(0.4, "regular", 40), pass(0.6, "regular", 40), 0.5);
    expect(lofted).toBeGreaterThan(0);
    expect(lofted).toBeLessThanOrEqual(1.1);
  });

  test("a loose high ball bounces and settles", () => {
    expect(bounceHeight(0)).toBe(0);
    expect(bounceHeight(0.2)).toBeGreaterThan(0.5);
    expect(bounceHeight(2)).toBe(0);
  });
});
