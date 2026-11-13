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
  test("a year of normal sessions is slower than the old rollover block (11.2: the academy pace was cut)", () => {
    const old = mean(developYouthSeason(youngster(), 1)) - mean(youngster());
    const daily = mean(year(DEFAULT_YOUTH_PLAN)) - mean(youngster());
    // ACADEMY_PACE 0.8 on the DP; the attributes move a little less than in proportion.
    expect(daily / old).toBeGreaterThan(0.78);
    expect(daily / old).toBeLessThan(0.95);
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

describe("club bonuses in the academy (11.2)", () => {
  test("only half of a club multiplier's distance from 1 counts, bonus or penalty", async () => {
    const { academyAreas, academyClubMult, YOUTH_TRAINING } = await import("@/Domain/youth/youthTraining");
    expect(academyClubMult(1)).toBe(1);
    expect(academyClubMult(1.4)).toBeCloseTo(1 + 0.4 * YOUTH_TRAINING.CLUB_BONUS_SHARE, 6);
    expect(academyClubMult(0.6)).toBeCloseTo(1 - 0.4 * YOUTH_TRAINING.CLUB_BONUS_SHARE, 6);
    expect(academyAreas({ technical: 1.25, physical: 0.4 })).toEqual({ technical: 1.125, physical: 0.7 });
    expect(academyAreas({})).toEqual({});
  });
});
