import { describe, expect, test } from "bun:test";
import { applyDefensiveMind, applyOffBallMind, deriveMind, mindMarkView } from "@/GameEngine/Domain/DefensiveMind";
import { capModifier, capStatModifiers, consistencyCap } from "@/GameEngine/Domain/ConsistencyCap";
import type { GamePlayer, MindRolls } from "@/GameEngine/types";

const rolls = (over: Partial<MindRolls> = {}): MindRolls => ({
  nextAt: 1, dec: 20, antic: 20, conc: 20, aggr: 22, lapse: false, sigma: 0, z: [0, 0, 0, 0], ...over,
});

const player = (mind?: MindRolls): GamePlayer => ({
  id: 7, name: "Def", team: "B", role: "CB", x: 30, y: 37, attackDir: -1, energy: 80,
  mental: { decisions: 0.3, composure: 0.3, flair: 0.3, anticipation: 0.4, consistency: 0.5, mood: 0, concentration: 0.3, aggression: 0.4 },
  ...(mind ? { mind } : {}),
} as unknown as GamePlayer);

const defScores = () => ({ hold_shape: 0.5, track_mark: 0.7, press_holder: 0.6, step_into_carry_lane: 0.3 });

describe("defensive mind", () => {
  test("no window: the scores are untouched", () => {
    const s = defScores();
    expect(applyDefensiveMind(player(), s)).toBeNull();
    expect(s).toEqual(defScores());
  });

  test("a neutral window (no noise, median aggression) keeps the argmax", () => {
    const s = defScores();
    const e = applyDefensiveMind(player(rolls()), s)!;
    expect(e.before).toBe("track_mark");
    expect(e.after).toBe("track_mark");
    expect(s).toEqual(defScores());
  });

  test("a concentration lapse drops the mark and holds back the press", () => {
    const s = defScores();
    const e = applyDefensiveMind(player(rolls({ lapse: true })), s)!;
    expect(s.track_mark).toBe(0);
    expect(s.hold_shape).toBeCloseTo(0.7);
    expect(s.press_holder).toBeCloseTo(0.3);
    expect(e.after).toBe("hold_shape");
    expect(e.lapse).toBe(true);
  });

  test("an aggressive roll pushes toward the press", () => {
    const s = { hold_shape: 0.5, track_mark: 0.62, press_holder: 0.6, step_into_carry_lane: 0.3 };
    const e = applyDefensiveMind(player(rolls({ aggr: 44 })), s)!;
    expect(s.press_holder).toBeGreaterThan(0.6);
    expect(e.after).toBe("press_holder");
    const timid = { hold_shape: 0.5, track_mark: 0.62, press_holder: 0.6, step_into_carry_lane: 0.3 };
    applyDefensiveMind(player(rolls({ aggr: 2 })), timid);
    expect(timid.press_holder).toBeLessThan(0.6);
  });

  test("off the ball a lapse leaves him in his zone", () => {
    const s = { offer_support: 0.8, hold_space: 0.4, make_run: 0.9 };
    expect(applyOffBallMind(player(rolls({ lapse: true })), s)).toBe(true);
    expect(s.hold_space).toBeGreaterThan(s.make_run);
    expect(s.hold_space).toBeGreaterThan(s.offer_support);
  });

  test("anticipation reads the mark's run; a lapse reads where he is", () => {
    const mark = { ...player(), id: 9, team: "A", x: 40, y: 37, vel: { x: 5, y: 0 } } as unknown as GamePlayer;
    const read = mindMarkView(player(rolls({ antic: 40 })), mark);
    expect(read.x).toBeGreaterThan(40);
    expect(mindMarkView(player(rolls({ lapse: true })), mark)).toBe(mark);
  });

  test("derived concentration and aggression follow their attributes", () => {
    const lo = deriveMind({ anticipation: 0.2, decisions: 0.2 }, { pressing: 2, tackling: 2, strength: 3 }, { prof: 0, temp: 0 });
    const hi = deriveMind({ anticipation: 0.7, decisions: 0.7 }, { pressing: 8, tackling: 8, strength: 8 }, { prof: 1, temp: 1 });
    expect(hi.concentration).toBeGreaterThan(lo.concentration);
    expect(hi.aggression).toBeGreaterThan(lo.aggression);
  });
});

describe("consistency cap", () => {
  test("FM's compression above the cap and below −20", () => {
    expect(consistencyCap(0)).toBe(5);
    expect(consistencyCap(1)).toBe(10);
    expect(capModifier(4, 5)).toBe(4);
    expect(capModifier(20, 5)).toBeCloseTo(31 / 3);
    expect(capModifier(-10, 5)).toBe(-10);
    expect(capModifier(-30, 5)).toBeCloseTo(-71 / 3);
  });

  test("an inconsistent player's good day is shorter; no modifier = same object", () => {
    const raw = { finishing: 5, passing: 5 } as unknown as import("@/types/playerTypes").PlayerStatsRecord;
    const buff = { finishing: 7, passing: 5 } as unknown as import("@/types/playerTypes").PlayerStatsRecord;
    const lo = capStatModifiers(raw, buff, 0);
    const hi = capStatModifiers(raw, buff, 1);
    expect(lo.finishing).toBeLessThan(hi.finishing);
    expect(hi.finishing).toBeLessThan(7);
    expect(capStatModifiers(raw, raw, 0)).toBe(raw);
  });
});
