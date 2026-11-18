import { describe, expect, test } from "bun:test";
import { lineCohesionPull } from "@/GameEngine/Domain/DefensivePositioning";
import { predictBallPoint } from "@/GameEngine/Domain/BallPrediction";
import { COHESION } from "@/GameEngine/Configs/CohesionConfig";
import type { GamePlayer, GameState } from "@/GameEngine/types";

const p = (id: number, team: "A" | "B", role: string, x: number, y: number) =>
  ({ id, team, role, x, y, attackDir: team === "A" ? 1 : -1, runtimeStats: { withBall: { carrySpeed: 6 } } }) as unknown as GamePlayer;

describe("lineCohesionPull", () => {
  test("no pull inside MAX_GAP", () => {
    const players = [p(1, "B", "CB", 80, 30), p(2, "B", "CB", 80, 30 + COHESION.MAX_GAP - 1)];
    expect(lineCohesionPull(players[0]!, { x: 80, y: 30 }, players)).toBeNull();
  });

  test("mutual pair: each closes half the excess, toward the partner", () => {
    const players = [p(1, "B", "CB", 80, 30), p(2, "B", "CB", 80, 30 + COHESION.MAX_GAP + 3)];
    const c = lineCohesionPull(players[0]!, { x: 80, y: 30 }, players)!;
    expect(c.mutual).toBe(true);
    expect(c.pull).toBeCloseTo(3 * 0.5, 5);
  });

  test("capped at MAX_PULL, lateral only, never for a midfielder or a partner out of the line", () => {
    const players = [p(1, "B", "LB", 80, 70), p(2, "B", "CB", 82, 40), p(3, "B", "CB", 82, 34), p(4, "B", "CM", 60, 70)];
    const c = lineCohesionPull(players[0]!, { x: 80, y: 70 }, players)!;
    expect(c.partnerId).toBe(2);
    expect(c.mutual).toBe(false);
    expect(c.pull).toBe(-COHESION.MAX_PULL);
    expect(lineCohesionPull(players[3]!, { x: 60, y: 70 }, players)).toBeNull();
    const deep = [p(1, "B", "CB", 80, 10), p(2, "B", "CB", 100, 60)];
    expect(lineCohesionPull(deep[0]!, { x: 80, y: 30 }, deep)).toBeNull();
  });
});

describe("predictBallPoint", () => {
  const base = (over: Partial<GameState>) =>
    ({ players: [p(1, "A", "RW", 50, 60)], ballHolderId: 1, decisions: {}, pass: null, shot: null, looseBall: null, ...over }) as unknown as GameState;

  test("a carrier's run: carry speed × PREDICT_S ahead", () => {
    const s = base({ decisions: { 1: { type: "carry", dx: 1, dy: 0 } } as GameState["decisions"] });
    const q = predictBallPoint(s, { x: 50, y: 60 });
    expect(q.x).toBeCloseTo(50 + 6 * COHESION.PREDICT_S, 5);
    expect(q.y).toBe(60);
  });

  test("a held ball without a carry, and a shot, stay on the real ball", () => {
    expect(predictBallPoint(base({}), { x: 50, y: 60 })).toEqual({ x: 50, y: 60 });
    const shot = base({ shot: { shooterId: 1, fromX: 50, fromY: 60, toX: 115, toY: 37, t: 0.2, xg: 0.1 } as GameState["shot"] });
    expect(predictBallPoint(shot, { x: 52, y: 60 })).toEqual({ x: 52, y: 60 });
  });

  test("a loose ball rolls on and slows down, capped at PREDICT_MAX_YDS", () => {
    const s = base({ looseBall: { x: 50, y: 37, vx: 4, vy: 0 } as GameState["looseBall"] });
    const q = predictBallPoint(s, { x: 50, y: 37 });
    expect(q.x).toBeGreaterThan(50);
    expect(q.x).toBeLessThan(50 + 4 * COHESION.PREDICT_S);
    const fast = base({ looseBall: { x: 50, y: 37, vx: 200, vy: 0 } as GameState["looseBall"] });
    expect(predictBallPoint(fast, { x: 50, y: 37 }).x).toBeCloseTo(50 + COHESION.PREDICT_MAX_YDS, 5);
  });
});
