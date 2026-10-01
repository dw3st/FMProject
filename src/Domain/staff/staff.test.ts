import { describe, expect, test } from "bun:test";
import {
  developmentMultiplier, effectiveRating, initialStaff, injuryMultiplier, makeStaffMember, obscurePlayer,
  overallRange, recoveryMultiplier, scoutNoiseOf, staffEffectsOf, staffMarket, staffWeeklyWage,
} from "@/Domain/staff/staff";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 };
const player = { id: "p1", name: "X", age: 25, squadId: "s", preferredFoot: "right", positions: ["CM"], stats, profile: { summary: "", archetype: "" } } as RosterPlayer;
const squad = (extra: Partial<Squad> = {}): Squad =>
  ({ id: "s", name: "S", colors: ["#000", "#fff"], money: 0, players: [], finances: { broadcasting: 10e6, commercial: 10e6, total: 20e6, budget: 0, followers: 1e6 }, ...extra }) as Squad;

describe("staff effects", () => {
  test("extremes and neutral", () => {
    expect(developmentMultiplier(1)).toBeCloseTo(0.9);
    expect(developmentMultiplier(5)).toBeCloseTo(1);
    expect(developmentMultiplier(10)).toBeCloseTo(1.15);
    expect(recoveryMultiplier(1)).toBeCloseTo(0.95);
    expect(recoveryMultiplier(5)).toBeCloseTo(1);
    expect(recoveryMultiplier(10)).toBeCloseTo(1.1);
    expect(injuryMultiplier(1)).toBeCloseTo(1.1);
    expect(injuryMultiplier(5)).toBeCloseTo(1);
    expect(injuryMultiplier(10)).toBeCloseTo(0.85);
    expect(scoutNoiseOf(1)).toBeCloseTo(1.5);
    expect(scoutNoiseOf(5)).toBeCloseTo(0.6);
    expect(scoutNoiseOf(10)).toBeCloseTo(0);
  });

  test("hired staff wins over tier; vacant role counts as 3; no staff uses the tier", () => {
    const hired = makeStaffMember("k", "assistant", 9, 1);
    expect(effectiveRating(squad({ staff: { assistant: hired } }), "assistant")).toBe(9);
    expect(effectiveRating(squad({ staff: { assistant: hired } }), "scout")).toBe(3);
    expect(effectiveRating(squad({ financialTier: "ELITE" }), "fitness")).toBe(7);
    expect(staffEffectsOf(squad({ financialTier: "MEDIUM" })).devMult).toBeCloseTo(1);
  });
});

describe("staff generation", () => {
  test("deterministic", () => {
    expect(makeStaffMember("a", "scout", 6, 1)).toEqual(makeStaffMember("a", "scout", 6, 1));
    expect(initialStaff("save1", squad())).toEqual(initialStaff("save1", squad()));
  });

  test("starting staff within one point of the implicit rating", () => {
    const s = initialStaff("save1", squad({ financialTier: "HIGH" }));
    for (const m of Object.values(s)) expect(Math.abs(m!.rating - 6)).toBeLessThanOrEqual(1);
  });

  test("market: 5 per role, stable within a week, renews the next Monday", () => {
    const mon = staffMarket("s", "2027-03-01", "fitness", 1);
    expect(mon).toHaveLength(5);
    expect(staffMarket("s", "2027-03-05", "fitness", 1)).toEqual(mon);
    expect(staffMarket("s", "2027-03-08", "fitness", 1)).not.toEqual(mon);
  });

  test("wage grows with rating", () => {
    expect(staffWeeklyWage(9, 1)).toBeGreaterThan(staffWeeklyWage(3, 1));
  });
});

describe("scout noise", () => {
  test("zero noise is exact; noise is deterministic and bounded", () => {
    expect(obscurePlayer(player, 0, "s")).toBe(player);
    const a = obscurePlayer(player, 1.5, "s");
    expect(a).toEqual(obscurePlayer(player, 1.5, "s"));
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) expect(Math.abs(a.stats[k] - 5)).toBeLessThanOrEqual(1.55);
    expect(a.stats).not.toEqual(player.stats);
  });

  test("range only when uncertain", () => {
    expect(overallRange(6, 0.4)).toBeUndefined();
    expect(overallRange(6, 0.6)).toEqual([5.4, 6.6]);
  });
});

import { recoverDay } from "@/Domain/fitness/fitness";
import { applyDevelopment } from "@/GameEngine/PlayerDevelopment";
import { contactInjuryChance, injuryRatePerMinute, trainingInjuryChance } from "@/Domain/injury/injury";
import { DEFAULT_DP_WEIGHTS } from "@/GameEngine/PlayerDevelopment";

describe("staff wiring in the pure models", () => {
  test("recovery multiplier scales the recovered gap", () => {
    const base = recoverDay(50, { age: 25, load: 0, stamina: 5 });
    const better = recoverDay(50, { age: 25, load: 0, stamina: 5, recoveryMult: 1.1 });
    expect(better - 50).toBeCloseTo((base - 50) * 1.1, 6);
  });

  test("injury multiplier scales rate, contact chance and training chance", () => {
    const f = { energy: 100, load: 0, age: 25, strength: 5 };
    expect(injuryRatePerMinute({ ...f, staffMult: 0.85 })).toBeCloseTo(injuryRatePerMinute(f) * 0.85, 12);
    expect(contactInjuryChance({ ...f, staffMult: 1.1 })).toBeCloseTo(contactInjuryChance(f) * 1.1, 12);
    expect(trainingInjuryChance("heavy", 0.85)).toBeCloseTo(trainingInjuryChance("heavy") * 0.85, 12);
    expect(trainingInjuryChance("light", 0.85)).toBe(0);
  });

  test("assistant multiplier scales earned DP (a young player progresses faster)", () => {
    const young = { ...player, age: 18 } as RosterPlayer;
    const total = (r: ReturnType<typeof applyDevelopment>) =>
      Object.values(r.updatedPlayer.progress ?? {}).reduce((a, b) => a + (b as number), 0);
    const lo = total(applyDevelopment(young, 8, DEFAULT_DP_WEIGHTS, 0.9));
    const hi = total(applyDevelopment(young, 8, DEFAULT_DP_WEIGHTS, 1.15));
    expect(hi).toBeGreaterThan(lo);
  });
});
