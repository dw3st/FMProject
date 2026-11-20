import { describe, expect, test } from "bun:test";
import {
  assignZoneCover, backLineTarget, fmShapePoint, passShadowPoint, pressStateOf, shapeTemplate, zoneScore, zonesOf,
} from "@/GameEngine/Domain/TeamShape";
import { TEAM_SHAPE } from "@/GameEngine/Configs/ShapeConfig";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import type { Formation, GamePlayer } from "@/GameEngine/types";

const p = (id: number, team: "A" | "B", role: string, x: number, y: number, extra: Partial<GamePlayer> = {}) =>
  ({ id, team, role, x, y, attackDir: team === "A" ? 1 : -1, recoveryTime: 0, ...extra }) as unknown as GamePlayer;

const slots433 = [
  { role: "GK", x: 4, y: 37 }, { role: "LB", x: 20, y: 10 }, { role: "CB", x: 16, y: 28 }, { role: "CB", x: 16, y: 46 },
  { role: "RB", x: 20, y: 64 }, { role: "CM", x: 34, y: 24 }, { role: "CDM", x: 30, y: 37 }, { role: "CM", x: 34, y: 50 },
  { role: "LW", x: 48, y: 12 }, { role: "ST", x: 52, y: 37 }, { role: "RW", x: 48, y: 62 },
];
const f433 = { id: "4-3-3", attacking: slots433, defending: slots433 } as unknown as Formation;

describe("FM block", () => {
  test("template: back four, front two and width of the outfield slots", () => {
    const t = shapeTemplate(f433, "defending");
    expect(t.back).toBeCloseTo((16 + 16 + 20 + 20) / 4, 9);
    expect(t.front).toBeCloseTo((52 + 48) / 2, 9);
    expect(t.maxY - t.minY).toBe(54);
  });

  test("back line at FM's depth with the ball on halfway, sliding with the ball, inside its limits", () => {
    const half = PITCH_LENGTH / 2;
    expect(backLineTarget("attacking", half)).toBe(TEAM_SHAPE.IN_BACK_YD);
    expect(backLineTarget("defending", half)).toBe(TEAM_SHAPE.OUT_BACK_YD);
    expect(backLineTarget("defending", half + 20)).toBeCloseTo(TEAM_SHAPE.OUT_BACK_YD + 20 * TEAM_SHAPE.OUT_BALL_SLOPE, 9);
    expect(backLineTarget("defending", 0)).toBeGreaterThanOrEqual(TEAM_SHAPE.OUT_MIN_YD);
    expect(backLineTarget("attacking", PITCH_LENGTH)).toBeLessThanOrEqual(TEAM_SHAPE.IN_MAX_YD);
    // A higher defensive line stands higher.
    expect(backLineTarget("defending", half, 0.75)).toBeGreaterThan(backLineTarget("defending", half, 0.4));
  });

  test("the slots keep their order: back four on the line, front two a span ahead, FM's width", () => {
    const ball = { x: PITCH_LENGTH / 2, y: 37 };
    const pts = slots433.filter(s => s.role !== "GK").map(s => fmShapePoint(s, { attackDir: 1 }, ball, "defending", f433));
    const xs = pts.map(q => q.x).sort((a, b) => a - b);
    const back = (xs[0]! + xs[1]! + xs[2]! + xs[3]!) / 4;
    const front = (xs[8]! + xs[9]!) / 2;
    expect(back).toBeCloseTo(TEAM_SHAPE.OUT_BACK_YD, 6);
    expect(front - back).toBeCloseTo(TEAM_SHAPE.OUT_SPAN_YD, 6);
    const ys = pts.map(q => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(TEAM_SHAPE.OUT_WIDTH_YD, 6);
  });

  test("a team attacking −x mirrors the shape", () => {
    const ball = { x: PITCH_LENGTH / 2, y: 37 };
    const a = fmShapePoint({ x: 16, y: 28 }, { attackDir: 1 }, ball, "attacking", f433);
    const b = fmShapePoint({ x: PITCH_LENGTH - 16, y: 74 - 28 }, { attackDir: -1 }, ball, "attacking", f433);
    expect(b.x).toBeCloseTo(PITCH_LENGTH - a.x, 9);
    expect(b.y).toBeCloseTo(74 - a.y, 9);
  });
});

describe("pressing states and the pass shadow", () => {
  test("3 × depth third from the defending side's goal + lateral third, mirrored per team", () => {
    expect(pressStateOf({ x: 10, y: 5 }, 1)).toBe(0);
    expect(pressStateOf({ x: 100, y: 70 }, 1)).toBe(8);
    expect(pressStateOf({ x: 100, y: 70 }, -1)).toBe(0);
    expect(pressStateOf({ x: 57, y: 37 }, 1)).toBe(4);
  });

  test("the press point is on the lane to the receiver nearest the presser, never on the holder", () => {
    const holder = p(1, "A", "CB", 30, 37);
    const near = p(2, "A", "CM", 50, 20);
    const far = p(3, "A", "CM", 50, 60);
    const presser = p(9, "B", "ST", 42, 26);
    const pt = passShadowPoint(presser, holder, [holder, near, far, presser])!;
    expect(pt.receiverId).toBe(2);
    expect(pt.x).toBeCloseTo(40, 6);
    expect(pt.y).toBeCloseTo(28.5, 6);
    expect(Math.hypot(pt.x - holder.x, pt.y - holder.y)).toBeGreaterThanOrEqual(TEAM_SHAPE.SHADOW_MIN_HOLDER_YD);
    expect(passShadowPoint(presser, holder, [holder, presser])).toBeNull();
  });
});

describe("out-of-possession zones", () => {
  test("FM's scores: home, neighbour, next line, far; a centre-back only scores his line", () => {
    const cb = { role: "CB", rank: 1 };
    expect(zoneScore({ role: "CB" }, cb, cb, true)).toBe(TEAM_SHAPE.ZONE_HOME);
    expect(zoneScore({ role: "CB" }, { role: "CB", rank: 2 }, cb, false)).toBe(TEAM_SHAPE.ZONE_NEIGHBOUR);
    expect(zoneScore({ role: "CB" }, { role: "CM", rank: 1 }, cb, false)).toBe(0);
    const cdm = { role: "CDM", rank: 1 };
    expect(zoneScore({ role: "CDM" }, { role: "CB", rank: 1 }, cdm, false)).toBe(TEAM_SHAPE.ZONE_NEXT_LINE + TEAM_SHAPE.ZONE_ROLE_BONUS);
  });

  test("a vacated centre-back zone near goal is covered by the holding defensive midfielder", () => {
    // Team B attacks −x: its own goal is at x = 115.
    const players = [
      p(1, "B", "CB", 99, 46), p(2, "B", "CB", 70, 28), // the second centre-back has gone up (pressing)
      p(3, "B", "CDM", 86, 37), p(4, "B", "LB", 95, 64), p(5, "B", "RB", 95, 10),
    ];
    const anchors = new Map([[1, { x: 99, y: 46 }], [2, { x: 99, y: 28 }], [3, { x: 86, y: 37 }], [4, { x: 95, y: 64 }], [5, { x: 95, y: 10 }]]);
    const zones = zonesOf(players, anchors);
    const holding = (q: GamePlayer) => q.id !== 2;
    const cover = assignZoneCover(players, zones, holding, { x: 92, y: 30 }, -1);
    expect(cover.get(3)?.ownerId).toBe(2);
    // Everyone home: nobody moves.
    const none = assignZoneCover(players.map(q => (q.id === 2 ? { ...q, x: 99 } : q)), zones, () => true, { x: 92, y: 30 }, -1);
    expect(none.size).toBe(0);
  });
});
