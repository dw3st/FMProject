import { describe, expect, test } from "bun:test";
import {
  areaMultsOf, developmentMultiplier, effectiveRating, effectiveStars, initialStaff, injuryMultiplier,
  makeProfessional, memberStars, obscurePlayer, ratingFromStars, recoveryMultiplier, resolveAreaAssignments,
  roleLimit, scoutGainMultOf, scoutUncertaintyMultOf, signContract, squadStaffWages, staffEffectsOf,
  staffWageFor, staffWeeklyWage, starsFromScore,
} from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { StaffMember, StaffRecord } from "@/Domain/staff/staffTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 };
const player = { id: "p1", name: "X", age: 25, squadId: "s", preferredFoot: "right", positions: ["CM"], stats, profile: { summary: "", archetype: "" } } as RosterPlayer;
const squad = (extra: Partial<Squad> = {}): Squad =>
  ({ id: "s", name: "S", colors: ["#000", "#fff"], money: 0, players: [], finances: { broadcasting: 10e6, commercial: 10e6, total: 20e6, budget: 0, followers: 1e6 }, ...extra }) as Squad;
const fin = (income: number) => ({ broadcasting: income, commercial: 0, total: income, followers: 0, budget: 0 });
const aiSquad = (income: number) => ({ id: "x", players: [], finances: fin(income) }) as unknown as Squad;
const human = (staff: StaffRecord) => ({ id: "h", players: [], finances: fin(20e6), staff }) as unknown as Squad;
const pro = (key: string, role: StaffMember["role"], stars: number) => makeProfessional(key, role, stars);

describe("rating curves (old effects)", () => {
  test("extremes and neutral", () => {
    expect(developmentMultiplier(1)).toBeCloseTo(0.9);
    expect(developmentMultiplier(5)).toBeCloseTo(1);
    expect(developmentMultiplier(10)).toBeCloseTo(1.15);
    expect(recoveryMultiplier(1)).toBeCloseTo(0.95);
    expect(recoveryMultiplier(10)).toBeCloseTo(1.1);
    expect(injuryMultiplier(1)).toBeCloseTo(1.1);
    expect(injuryMultiplier(10)).toBeCloseTo(0.85);
    expect(scoutUncertaintyMultOf(1)).toBeCloseTo(1.3);
    expect(scoutUncertaintyMultOf(10)).toBeCloseTo(0.75);
    expect(scoutGainMultOf(1)).toBeCloseTo(0.7);
    expect(scoutGainMultOf(10)).toBeCloseTo(1.4);
  });
});

describe("stars", () => {
  test("rating conversion keeps the old curve points", () => {
    expect(ratingFromStars(1)).toBe(1);
    expect(ratingFromStars(3)).toBe(5);
    expect(ratingFromStars(5)).toBe(10);
    expect(ratingFromStars(2.5)).toBe(4);
    expect(ratingFromStars(3.8)).toBeCloseTo(7, 9);
  });
  test("score 10.5 is 3 stars, extremes clamp", () => {
    expect(starsFromScore(10.5)).toBe(3);
    expect(starsFromScore(1)).toBe(1);
    expect(starsFromScore(20)).toBe(5);
  });
  test("a generated professional lands within half a star of the target", () => {
    for (const s of [1, 2, 3, 4, 5]) expect(Math.abs(memberStars(pro(`k${s}`, "medic", s)) - s)).toBeLessThanOrEqual(0.5);
    for (const s of [1, 2, 3, 4, 5]) expect(Math.abs(memberStars(pro(`c${s}`, "coach", s)) - s)).toBeLessThanOrEqual(0.5);
  });
  test("generation is deterministic", () => {
    expect(pro("a", "scout", 3.5)).toEqual(pro("a", "scout", 3.5));
  });
});

describe("effects", () => {
  test("AI: implied stars reproduce today's ratings exactly", () => {
    // LOW 4, MEDIUM 5, HIGH 6, ELITE 7 (staff.md) — income thresholds 15M/80M/200M.
    expect(effectiveRating(aiSquad(1e6), "assistant")).toBe(4);
    expect(effectiveRating(aiSquad(20e6), "fitness")).toBe(5);
    expect(effectiveRating(aiSquad(100e6), "scout")).toBeCloseTo(6, 9);
    expect(effectiveRating(aiSquad(300e6), "assistant")).toBeCloseTo(7, 9);
    expect(effectiveRating(squad({ financialTier: "ELITE" }), "fitness")).toBeCloseTo(7, 9);
  });
  test("3 stars everywhere is neutral", () => {
    const fx = staffEffectsOf(aiSquad(20e6));
    expect(fx.devMult).toBe(1);
    expect(fx.recoveryMult).toBe(1);
    expect(fx.injuryMult).toBe(1);
    expect(fx.injuryDurationMult).toBe(1);
    expect(fx.familiarityMult).toBe(1);
    for (const v of Object.values(areaMultsOf(aiSquad(20e6)))) expect(v).toBe(1);
  });
  test("vacant area = 0.4; vacant role = 2 stars", () => {
    const sq = human({ members: [] });
    for (const v of Object.values(areaMultsOf(sq))) expect(v).toBe(STAFF.AREA_VACANT_MULT);
    expect(effectiveStars(sq, "medic")).toBe(STAFF.VACANT_STARS);
    expect(effectiveRating(sq, "assistant")).toBe(3);
    expect(staffEffectsOf(sq).injuryDurationMult).toBeCloseTo(1.1, 9);
    expect(staffEffectsOf(sq).familiarityMult).toBeCloseTo(0.9, 9);
  });
  test("1 and 5 stars on an area", () => {
    const one = human({ members: [pro("gk1", "goalkeeping", 1)] });
    const five = human({ members: [pro("gk5", "goalkeeping", 5)] });
    expect(areaMultsOf(one).goalkeeping).toBeLessThan(0.8); // 1 star ± half a star of generation
    expect(areaMultsOf(five).goalkeeping).toBeGreaterThan(1.15);
  });
  test("hand-built squads without finances are neutral", () => {
    const sq = { id: "lab", players: [] } as unknown as Squad;
    expect(staffEffectsOf(sq).devMult).toBe(1);
  });
});

describe("area assignments", () => {
  test("auto: each area to the best coach with room, at most 2 each", () => {
    const a = pro("ca", "coach", 4), b = pro("cb", "coach", 2), c = pro("cc", "coach", 3);
    const res = resolveAreaAssignments({ members: [a, b, c] });
    const count = new Map<string, number>();
    for (const m of Object.values(res)) count.set(m!.id, (count.get(m!.id) ?? 0) + 1);
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(2);
    expect(Object.keys(res).length).toBe(5);
  });
  test("manual choice wins while valid; a coach gone frees it", () => {
    const a = pro("ca", "coach", 4), b = pro("cb", "coach", 2), c = pro("cc", "coach", 3);
    const res = resolveAreaAssignments({ members: [a, b, c], areaAssignments: { setPieces: b.id } });
    expect(res.setPieces!.id).toBe(b.id);
    const gone = resolveAreaAssignments({ members: [a, c], areaAssignments: { setPieces: b.id } });
    expect(gone.setPieces?.id).not.toBe(b.id);
  });
  test("two coaches leave one area vacant", () => {
    const res = resolveAreaAssignments({ members: [pro("x", "coach", 3), pro("y", "coach", 3)] });
    expect(Object.keys(res).length).toBe(4);
  });
});

describe("wages and starting staff", () => {
  test("wage frozen at signing: the bill sums the contracts", () => {
    const m = signContract(makeProfessional("w", "assistant", 3), { date: "2027-02-05", seasonEnd: "2027-12-06", years: 2, clubFactor: 1 });
    expect(m.contract!.until).toBe("2028-12-06");
    expect(m.contract!.wage).toBe(staffWageFor("assistant", memberStars(m), 1));
    expect(squadStaffWages({ members: [m] })).toBe(m.contract!.wage);
    expect(staffWageFor("groundskeeper", 3, 1)).toBeLessThan(staffWageFor("assistant", 3, 1));
    expect(staffWeeklyWage(9, 1)).toBeGreaterThan(staffWeeklyWage(3, 1));
  });
  test("initial staff: one per role, coaches up to the tier limit, no field scouts, deterministic", () => {
    const sq = { id: "c", players: [], finances: fin(20e6) } as unknown as Squad; // MEDIUM
    const a = initialStaff("save1", sq, { date: "2027-02-05", seasonEnd: "2027-12-06" });
    const b = initialStaff("save1", sq, { date: "2027-02-05", seasonEnd: "2027-12-06" });
    expect(a).toEqual(b);
    const count = (r: string) => a.members.filter((m) => m.role === r).length;
    expect(count("coach")).toBe(3);
    expect(count("fieldScout")).toBe(0);
    for (const r of ["assistant", "fitness", "goalkeeping", "medic", "analyst", "scout", "groundskeeper"]) expect(count(r)).toBe(1);
    for (const m of a.members) {
      expect(Math.abs(memberStars(m) - 3)).toBeLessThanOrEqual(1);
      expect(m.contract).toBeDefined();
    }
  });
  test("initial staff of a big club: still one groundskeeper", () => {
    const sq = { id: "c", players: [], finances: fin(300e6) } as unknown as Squad; // ELITE
    const a = initialStaff("save1", sq, { date: "2027-02-05", seasonEnd: "2027-12-06" });
    expect(a.members.filter((m) => m.role === "groundskeeper")).toHaveLength(1);
  });
  test("role limit by natural tier", () => {
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "coach")).toBe(3);
    expect(roleLimit({ finances: fin(300e6) } as unknown as Squad, "coach")).toBe(5);
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "fieldScout")).toBe(4);
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "medic")).toBe(1);
    // Groundskeepers (Etapa 34): LOW 1, MEDIUM 1, HIGH 2, ELITE 2.
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "groundskeeper")).toBe(1);
    expect(roleLimit({ finances: fin(20e6) } as unknown as Squad, "groundskeeper")).toBe(1);
    expect(roleLimit({ finances: fin(100e6) } as unknown as Squad, "groundskeeper")).toBe(2);
    expect(roleLimit({ finances: fin(300e6) } as unknown as Squad, "groundskeeper")).toBe(2);
  });

  test("groundskeeper: pitch wear multiplier by stars and count; none 1.6; AI 1", () => {
    const keepers = (...stars: number[]) => human({ members: stars.map((s, i) => pro(`g${i}`, "groundskeeper", s)) });
    expect(staffEffectsOf(keepers()).pitchWearMult).toBeCloseTo(1.6, 10);
    expect(staffEffectsOf(keepers(3)).pitchWearMult).toBeCloseTo(1, 10);
    expect(staffEffectsOf(keepers(5)).pitchWearMult).toBeCloseTo(0.75, 10);
    expect(staffEffectsOf(keepers(1)).pitchWearMult).toBeCloseTo(1.3, 10);
    expect(staffEffectsOf(keepers(3, 3)).pitchWearMult).toBeCloseTo(0.9, 10);
    expect(staffEffectsOf(aiSquad(20e6)).pitchWearMult).toBe(1);
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

import { withFitnessCoach } from "@/Domain/staff/staff";
import { applyRestDays } from "@/lab/fitnessCarry";
import { emptySeasonLog } from "@/types/playerTypes";

describe("lab fitness coach", () => {
  test("a better fitness coach recovers more between congestion games and cuts injury risk", () => {
    const tired = { ...player, seasonLog: { ...emptySeasonLog(), fitness: 50, load: 0 } } as RosterPlayer;
    const base = squad({ players: [tired] });
    const weak = applyRestDays(withFitnessCoach(base, 1), 2).players[0]!.seasonLog!.fitness;
    const strong = applyRestDays(withFitnessCoach(base, 5), 2).players[0]!.seasonLog!.fitness;
    expect(strong).toBeGreaterThan(weak);
    expect(staffEffectsOf(withFitnessCoach(base, 5)).injuryMult).toBeLessThan(0.95);
    expect(withFitnessCoach(base, undefined)).toBe(base);
  });
});
