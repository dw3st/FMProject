import { describe, expect, test } from "bun:test";
import { developYouthSeason } from "@/Domain/youth/youth";
import {
  DEFAULT_YOUTH_PLAN, parseYouthPlan, trainYouthSession, withYouthTrend, YOUTH_TRAINING, youthDpWeights, youthTrendDelta,
} from "@/Domain/youth/youthTraining";
import { DP_CATEGORIES } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";
import type { YouthTrainingPlan } from "@/types/youthTrainingTypes";

function youngster(): RosterPlayer {
  return {
    id: "y1", name: "Y", age: 16, squadId: "s", preferredFoot: "right", positions: ["Midfielder"], naturalPosition: "CM",
    stats: { passing: 4, vision: 4, finishing: 3, dribbling: 4, speed: 4, acceleration: 4, tackling: 3, pressing: 3, stamina: 4, heading: 3, strength: 3, reflex: 1, jump: 1 },
    profile: { summary: "", archetype: "" }, nationality: "Spain",
  } as RosterPlayer;
}
const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((s, v) => s + v, 0) / Object.values(p.stats).length;
const year = (plan: YouthTrainingPlan) => {
  let p = youngster();
  for (let i = 0; i < YOUTH_TRAINING.SESSIONS_PER_YEAR; i++) p = trainYouthSession(p, plan, 1, {});
  return p;
};

describe("youth training", () => {
  test("a year of normal sessions keeps the old rollover pace (±5%)", () => {
    const old = mean(developYouthSeason(youngster(), 1)) - mean(youngster());
    const daily = mean(year(DEFAULT_YOUTH_PLAN)) - mean(youngster());
    expect(Math.abs(daily / old - 1)).toBeLessThan(0.05);
  });

  test("light and heavy move the pace", () => {
    const base = mean(youngster());
    const normal = mean(year(DEFAULT_YOUTH_PLAN)) - base;
    expect(mean(year({ ...DEFAULT_YOUTH_PLAN, intensity: "light" })) - base).toBeLessThan(normal);
    expect(mean(year({ ...DEFAULT_YOUTH_PLAN, intensity: "heavy" })) - base).toBeGreaterThan(normal);
  });

  test("a focus shifts the weights, the total stays 1", () => {
    const p = youngster();
    const base = youthDpWeights(p, DEFAULT_YOUTH_PLAN);
    const tech = youthDpWeights(p, { ...DEFAULT_YOUTH_PLAN, focus: "technical" });
    expect(tech.technical).toBeGreaterThan(base.technical);
    expect(DP_CATEGORIES.reduce((s, k) => s + tech[k], 0)).toBeCloseTo(1);
    const gk = youthDpWeights(p, { ...DEFAULT_YOUTH_PLAN, players: { y1: { focus: "goalkeeping" } } });
    expect(gk.goalkeeping).toBeGreaterThan(0);
  });

  test("a training position uses that position's weights", () => {
    const p = youngster();
    const asCb = youthDpWeights(p, { ...DEFAULT_YOUTH_PLAN, players: { y1: { position: "CB" } } });
    expect(asCb.defending).toBeGreaterThan(youthDpWeights(p, DEFAULT_YOUTH_PLAN).defending);
  });

  test("trend: a snapshot a week, delta over four weeks", () => {
    let p = youngster();
    p = withYouthTrend(p, "2027-01-04");
    p = withYouthTrend(p, "2027-01-06");
    expect(p.youthTrend).toHaveLength(1);
    expect(youthTrendDelta(p)).toBeNull();
    p = withYouthTrend({ ...p, stats: { ...p.stats, passing: 6 } }, "2027-01-11");
    expect(youthTrendDelta(p)!).toBeGreaterThan(0);
  });

  test("parse: enums checked, unknown ids dropped", () => {
    const ids = new Set(["y1"]);
    expect(parseYouthPlan({ intensity: "heavy", focus: "physical" }, ids)).toEqual({ intensity: "heavy", focus: "physical" });
    expect(parseYouthPlan({ intensity: "max", focus: "physical" }, ids)).toBeNull();
    expect(parseYouthPlan({ intensity: "light", focus: "x" }, ids)).toBeNull();
    expect(parseYouthPlan({ intensity: "light", focus: "balanced", players: { y1: { position: "ZZ" } } }, ids)).toBeNull();
    expect(parseYouthPlan({ intensity: "light", focus: "balanced", players: { y1: { position: "CB" }, gone: { focus: "technical" } } }, ids))
      .toEqual({ intensity: "light", focus: "balanced", players: { y1: { position: "CB" } } });
  });
});
