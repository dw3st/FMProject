import { describe, expect, test } from "bun:test";
import {
  applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS, mentalAgeGrowth, type MentalWeights,
} from "@/GameEngine/PlayerDevelopment";
import { MENTAL_KEYS, mentalStatsFor } from "@/Domain/mental/mental";
import { emptySeasonLog, type DevelopmentProgress, type PlayerStatsRecord, type RosterPlayer } from "@/types/playerTypes";

// The mental pool (`.claude/rules/game/mental.md`): matches only, its own age curve, and the 13 base attributes
// develop exactly as without it.
const BASE = {
  passing: 4, vision: 3.5, finishing: 3, dribbling: 4, speed: 5, acceleration: 5, tackling: 3,
  pressing: 3.5, stamina: 5, heading: 3, strength: 4, reflex: 0.5, jump: 1,
};
const ZERO: MentalWeights = { decisions: 0, composure: 0, flair: 0, anticipation: 0 };
const EVEN: MentalWeights = { decisions: 0.25, composure: 0.25, flair: 0.25, anticipation: 0.25 };

function player(age: number): RosterPlayer {
  return {
    id: `dev-${age}`, name: "P", age, squadId: "s", preferredFoot: "right", positions: ["CM"],
    stats: mentalStatsFor(BASE, age, `dev-${age}`), profile: { summary: "", archetype: "" }, seasonLog: emptySeasonLog(),
  };
}

function season(p: RosterPlayer, rating: number, weights: MentalWeights, matches = 38): RosterPlayer {
  for (let i = 0; i < matches; i++) p = applyDevelopment(p, rating > 0 && i % 3 === 0 ? 7.2 : rating, DEFAULT_DP_WEIGHTS, 1, 1, {}, weights).updatedPlayer;
  return p;
}

const sum = (s: PlayerStatsRecord) => MENTAL_KEYS.reduce((a, k) => a + s[k], 0);
const baseOf = (s: PlayerStatsRecord) => Object.fromEntries(Object.keys(BASE).map((k) => [k, s[k as keyof PlayerStatsRecord]]));

describe("mental development", () => {
  test("mental attributes grow with matches; the 13 others are unchanged by the pool", () => {
    for (const age of [18, 22, 26, 30]) {
      const start = player(age);
      const withPool = season(start, 6.4, EVEN);
      const without = season(start, 6.4, ZERO);
      expect(sum(withPool.stats)).toBeGreaterThan(sum(start.stats));
      expect(sum(without.stats)).toBe(sum(start.stats));
      expect(baseOf(withPool.stats)).toEqual(baseOf(without.stats));
      expect(withPool.overallAvg).toBe(without.overallAvg);
    }
  });

  test("younger grows faster at first, and the split follows the weights", () => {
    const g = (age: number) => sum(season(player(age), 6.4, EVEN, 60).stats) - sum(player(age).stats);
    expect(mentalAgeGrowth(24)).toBeGreaterThan(mentalAgeGrowth(33));
    expect(g(24)).toBeGreaterThan(g(33));
    const onlyFlair = season(player(22), 6.4, { ...ZERO, flair: 1 }, 60);
    const start = player(22);
    expect(onlyFlair.stats.flair).toBeGreaterThan(start.stats.flair);
    for (const k of ["decisions", "composure", "anticipation"] as const) expect(onlyFlair.stats[k]).toBe(start.stats[k]);
  });

  test("decline only from 33; training never moves mental", () => {
    const at30 = season(player(30), 0, EVEN, 60);
    expect(sum(at30.stats)).toBe(sum(player(30).stats));
    const at34 = season(player(34), 0, EVEN, 60);
    expect(sum(at34.stats)).toBeLessThan(sum(player(34).stats));
    let t = player(19);
    for (let i = 0; i < 100; i++) t = applyTrainingDevelopment(t, "heavy", DEFAULT_DP_WEIGHTS).updatedPlayer;
    for (const k of MENTAL_KEYS) expect(t.stats[k]).toBe(player(19).stats[k]);
  });

  test("a progress record from before the mental keys still develops (no NaN)", () => {
    const p = player(22);
    const progress = Object.fromEntries(Object.keys(BASE).map((k) => [k, 0.5])) as unknown as DevelopmentProgress;
    const out = season({ ...p, progress }, 7.2, EVEN, 20);
    for (const k of MENTAL_KEYS) {
      expect(Number.isFinite(out.stats[k])).toBe(true);
      expect(Number.isFinite(out.progress![k])).toBe(true);
    }
  });
});
