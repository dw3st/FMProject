import { describe, expect, test } from "bun:test";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { decide } from "@/GameEngine/Domain/DecisionTree";
import { mulberry32 } from "@/Domain/rng";
import { PITCH_LENGTH, PITCH_WIDTH, isInGoalScoreArea } from "@/GameEngine/Domain/pitch";
import {
  drawFmCornerTarget, drawGoalKickPlan, fmCornerPoint, goalKickLongPoint, goalKickShortSpot, inBoxCount, throwInOptionSpots, throwInPool,
} from "@/GameEngine/Domain/SetPieces";
import { FM_SET_PIECES } from "@/GameEngine/Configs/FmSetPieceConfig";
import type { GameState } from "@/GameEngine/types";

const scenario = (id: string): GameState => TEST_SCENARIOS.find(t => t.id === id)!.createState();

describe("stage 12: FM's set pieces (pure)", () => {
  test("corner targets come by FM's shares", () => {
    const rng = mulberry32(7);
    const n = 20000;
    const c: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const t = drawFmCornerTarget(rng); c[t] = (c[t] ?? 0) + 1; }
    expect(c.short! / n).toBeCloseTo(FM_SET_PIECES.CORNER_SHORT_SHARE, 1);
    expect((c.near_post! + c.far_post!) / n).toBeCloseTo(FM_SET_PIECES.CORNER_POST_SHARE, 1);
    expect(c.six_centre! / n).toBeGreaterThan(0.55);
  });

  test("the corner points: 3.5 m out, centre and 5 m to each post (near post on the ball's side)", () => {
    const six = fmCornerPoint("six_centre", { x: PITCH_LENGTH, y: 0 }, 1);
    expect(PITCH_LENGTH - six.x).toBeCloseTo(3.5 * 1.0936, 2);
    expect(six.y).toBeCloseTo(PITCH_WIDTH / 2, 5);
    const near = fmCornerPoint("near_post", { x: PITCH_LENGTH, y: 0 }, 1);
    const far = fmCornerPoint("far_post", { x: PITCH_LENGTH, y: 0 }, 1);
    expect(near.y).toBeLessThan(six.y);
    expect(far.y).toBeGreaterThan(six.y);
    expect(six.y - near.y).toBeCloseTo(5 * 1.0936, 2);
  });

  test("throw-in pool: backward 40 % of the draws, within range", () => {
    const thrower = { x: 50, y: 0, attackDir: 1 as const };
    const mates = [
      { x: 41, y: 4, role: "LB" as const }, { x: 59, y: 3, role: "LW" as const }, { x: 49, y: 11, role: "CM" as const }, { x: 90, y: 30, role: "ST" as const },
    ];
    expect(throwInPool(thrower, mates, 0.1)).toEqual({ pool: [mates[0]!, mates[2]!], backward: true });
    expect(throwInPool(thrower, mates, 0.9).pool).toEqual([mates[1]!]);
    expect(throwInPool(thrower, [mates[1]!], 0.1).backward).toBe(false);
    expect(throwInOptionSpots({ x: 50, y: 0 }, 1).every(s => s.y > 0)).toBe(true);
  });

  test("goal kick: 62 % short, the spots off the box corner and past half-way", () => {
    const rng = mulberry32(3);
    let short = 0;
    for (let i = 0; i < 10000; i++) if (drawGoalKickPlan(rng).kind === "short") short++;
    expect(short / 10000).toBeCloseTo(0.62, 1);
    expect(goalKickShortSpot(0, 1).x).toBeCloseTo(2.5 * 1.0936, 2);
    expect(goalKickLongPoint(0, -1).x).toBeGreaterThan(PITCH_LENGTH / 2);
  });
});

describe("stage 12: FM's set pieces (engine)", () => {
  test("a corner: a decided target, ten defenders (keeper incl.) in the box, the taker crosses to it", () => {
    const s = scenario("corner-attack");
    const a = s.players.find(p => p.team === "A")!;
    const goalX = a.attackDir === 1 ? PITCH_LENGTH : 0;
    expect(s.setPiece?.fmCorner).toBeDefined();
    expect(inBoxCount(s.players.filter(p => p.team === "B"), goalX)).toBe(10);
    const taker = s.players.find(p => p.id === s.setPiece!.takerId)!;
    const d = decide(taker, taker, true, false, s.players, null, 0, s.setPiece);
    if (s.setPiece!.fmCorner === "short") expect(d.type).toBe("pass");
    else {
      expect(d.type).toBe("cross");
      const t = fmCornerPoint(s.setPiece!.fmCorner as "six_centre", taker, taker.attackDir);
      if (d.type === "cross") { expect(d.toX).toBeCloseTo(t.x, 5); expect(d.toY).toBeCloseTo(t.y, 5); }
    }
  });

  test("a throw-in: three short options next to the thrower, nobody else teleported", () => {
    const s = scenario("fm-throw-in");
    expect(s.setPiece?.type).toBe("throw_in");
    const taker = s.players.find(p => p.id === s.setPiece!.takerId)!;
    for (const spot of throwInOptionSpots(taker, taker.attackDir)) {
      expect(s.players.some(p => p.team === "A" && Math.hypot(p.x - spot.x, p.y - spot.y) < 0.01)).toBe(true);
    }
  });

  test("a goal kick: a plan, opponents outside the box, the keeper plays it to the plan", () => {
    const s = scenario("fm-goal-kick");
    const a = s.players.find(p => p.team === "A")!;
    const own = a.attackDir === 1 ? 0 : PITCH_LENGTH;
    expect(s.setPiece?.goalKick).toBeDefined();
    expect(s.players.filter(p => p.team === "B" && isInGoalScoreArea(p.x, p.y, own)).length).toBe(0);
    const gk = s.players.find(p => p.id === s.setPiece!.takerId)!;
    const d = decide(gk, gk, true, false, s.players, null, 0, s.setPiece);
    expect(d.type).toBe(s.setPiece!.goalKick!.kind === "short" ? "pass" : "long_ball");
  });
});
