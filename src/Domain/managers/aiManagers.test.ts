import { describe, expect, test } from "bun:test";
import type { ManagerRecord } from "@/types/managerTypes";
import {
  aiManagerReputation, chooseHire, clubsSackedSince, finishPercentile, formPpg, hireManager, managerInvariantBreaks,
  retireStale, rolloverSackChance, sackManager, vacancyHireOn, weeklySackChance, type SackInput,
} from "@/Domain/managers/aiManagers";
import {
  compensationFee, contractDay, contractUntil, managerWeeklyWage, offerSeasons, renewalDecision, renewalDue, renewedContract,
  severancePay, weeksLeft,
} from "@/Domain/managers/managerContract";

const m = (id: string, squadId: string, extra: Partial<ManagerRecord> = {}): ManagerRecord => ({
  id, name: id, squadId, isPlayer: false, points: 0, seasons: 0, titles: [],
  clubs: squadId ? [{ squadId, from: "2026-08-01" }] : [], ...extra,
});

const sack = (o: Partial<SackInput> = {}): SackInput => ({
  position: 18, target: 10, size: 20, form: 0.6, tier: "MEDIUM", daysInCharge: 200,
  progress: 0.5, roundsLeft: 15, sackedThisSeason: false, ...o,
});

describe("AI manager sackings", () => {
  test("pressure and bad form make a weekly chance, capped", () => {
    const p = weeklySackChance(sack());
    expect(p).toBeGreaterThan(0.1);
    expect(p).toBeLessThanOrEqual(0.35 * 1.5);
    expect(weeklySackChance(sack({ position: 10 }))).toBe(0);
    expect(weeklySackChance(sack({ form: 1.4 }))).toBe(0);
  });

  test("protection: 60 days, one per season, early season, last rounds, interims", () => {
    expect(weeklySackChance(sack({ daysInCharge: 30 }))).toBe(0);
    expect(weeklySackChance(sack({ sackedThisSeason: true }))).toBe(0);
    expect(weeklySackChance(sack({ progress: 0.2 }))).toBe(0);
    expect(weeklySackChance(sack({ roundsLeft: 2 }))).toBe(0);
    expect(weeklySackChance(sack({ interim: true }))).toBe(0);
  });

  test("big clubs sack faster", () => {
    expect(weeklySackChance(sack({ tier: "ELITE" }))).toBeGreaterThan(weeklySackChance(sack({ tier: "LOW" })));
  });

  test("rollover: relegated 0,6, failed 0,4, champion/promoted 0", () => {
    expect(rolloverSackChance({ position: 20, target: 17, size: 20, relegated: true })).toBe(0.6);
    expect(rolloverSackChance({ position: 15, target: 10, size: 20 })).toBe(0.4);
    expect(rolloverSackChance({ position: 12, target: 10, size: 20 })).toBe(0);
    expect(rolloverSackChance({ position: 1, target: 1, size: 20, champion: true })).toBe(0);
  });

  test("form and finish", () => {
    expect(formPpg(["W", "D", "L"])).toBeCloseTo(4 / 3);
    expect(formPpg([])).toBeNull();
    expect(finishPercentile(1, 20)).toBe(1);
    expect(finishPercentile(20, 20)).toBe(0);
  });
});

describe("free pool and hirings", () => {
  test("sacked manager goes free with an interim in his place; one per club", () => {
    const out = sackManager([m("a", "c1"), m("b", "c2")], { squadId: "c1", clubName: "C1", date: "2027-01-05" });
    expect(out.find((x) => x.id === "a")).toMatchObject({ squadId: "", freeSince: "2027-01-05" });
    expect(out.find((x) => x.id === "a")!.clubs!.at(-1)).toMatchObject({ to: "2027-01-05", left: "sacked" });
    expect(out.find((x) => x.squadId === "c1")!.interim).toBe(true);
    expect(managerInvariantBreaks(out, ["c1", "c2"])).toEqual({ missing: [], doubled: [] });
    expect(clubsSackedSince(out, "2026-08-01").has("c1")).toBe(true);
  });

  test("hiring a free manager drops an interim without points; poaching vacates his club", () => {
    const sacked = sackManager([m("a", "c1"), m("b", "c2"), m("f", "", { freeSince: "2026-12-01" })], { squadId: "c1", clubName: "C1", date: "2027-01-05" });
    const h = hireManager(sacked, { squadId: "c1", managerId: "f", date: "2027-01-15" });
    expect(h.vacated).toBeNull();
    expect(h.managers.some((x) => x.interim)).toBe(false);
    expect(h.managers.find((x) => x.id === "f")).toMatchObject({ squadId: "c1", hiredOn: "2027-01-15" });
    const p = hireManager(h.managers, { squadId: "c1", managerId: "b", date: "2027-02-01" });
    expect(p.vacated).toBe("c2");
    expect(p.managers.find((x) => x.id === "f")).toMatchObject({ squadId: "" });
    expect(p.managers.find((x) => x.id === "b")!.clubs!.map((c) => c.left ?? "")).toEqual(["moved", ""]);
  });

  test("interim confirmed keeps his passage; free for two seasons retires", () => {
    const sacked = sackManager([m("a", "c1")], { squadId: "c1", clubName: "C1", date: "2027-01-05" });
    const interim = sacked.find((x) => x.interim)!;
    const h = hireManager(sacked, { squadId: "c1", managerId: interim.id, date: "2027-01-20" });
    expect(h.managers.find((x) => x.id === interim.id)!.interim).toBeUndefined();
    const r = retireStale(h.managers, "2029-02-01");
    expect(r.find((x) => x.id === "a")!.retired).toBe(true);
  });

  test("a free manager without ranking points retires after half a season, with points after two", () => {
    const ms = [m("a", "", { freeSince: "2027-01-01" }), m("b", "", { freeSince: "2027-01-01", points: 20 })];
    const r = retireStale(ms, "2027-08-01");
    expect(r.find((x) => x.id === "a")!.retired).toBe(true);
    expect(r.find((x) => x.id === "b")!.retired).toBeUndefined();
    expect(retireStale(ms, "2029-01-10").find((x) => x.id === "b")!.retired).toBe(true);
  });

  test("hire choice: close to the club's prestige, local first", () => {
    const pick = chooseHire({
      prestige: 0.6, country: "England", continent: "Europe",
      free: [
        { managerId: "near", reputation: 58, country: "England", continent: "Europe" },
        { managerId: "far", reputation: 20, country: "Brazil", continent: "South America" },
      ],
      employed: [], interim: null, allowPoach: false, rng: () => 0.5,
    });
    expect(pick).toEqual({ managerId: "near", kind: "free" });
    const interim = chooseHire({
      prestige: 0.6, country: null, continent: null, free: [], employed: [],
      interim: { managerId: "i", reputation: 40, country: null, continent: null, interimPpg: 2 }, allowPoach: false, rng: () => 0.5,
    });
    expect(interim).toEqual({ managerId: "i", kind: "interim" });
  });

  test("AI reputation uses the last finish; vacancies hire in 7..21 days", () => {
    const ms = [m("a", "c1", { lastFinish: 1 }), m("b", "c2", { lastFinish: 0 })];
    expect(aiManagerReputation(ms, ms[0]!, 2027)).toBeGreaterThan(aiManagerReputation(ms, ms[1]!, 2027));
    expect(vacancyHireOn("2027-01-01", () => 0)).toBe("2027-01-08");
    expect(vacancyHireOn("2027-01-01", () => 0.999)).toBe("2027-01-22");
  });
});

describe("the human manager's contract", () => {
  test("wage: 1,5% to 4% of revenue a year", () => {
    expect(managerWeeklyWage(200_000_000, 40) * 52).toBeCloseTo(200_000_000 * 0.025, -3);
    expect(managerWeeklyWage(200_000_000, 0) * 52 / 200_000_000).toBeCloseTo(0.015, 3);
    expect(managerWeeklyWage(200_000_000, 100) * 52 / 200_000_000).toBeCloseTo(0.04, 3);
  });

  test("length, offer seasons, weeks left", () => {
    expect(contractUntil("2027-05-17", 2)).toBe("2028-05-17");
    expect(offerSeasons(0.1)).toBe(1);
    expect(offerSeasons(0.5)).toBe(2);
    expect(offerSeasons(0.9)).toBe(3);
    expect(weeksLeft("2027-01-01", "2029-01-01")).toBe(52);
    expect(weeksLeft("2027-01-01", "2026-01-01")).toBe(0);
  });

  test("severance and compensation: half the wage per week left, none in the last month", () => {
    const c = { wage: 100_000, until: "2027-12-31" };
    expect(severancePay(c, "2027-12-03")).toBe(200_000);
    expect(compensationFee(c, "2027-06-01")).toBe(Math.round(0.5 * 100_000 * weeksLeft("2027-06-01", "2027-12-31")));
    expect(compensationFee(c, "2027-12-10")).toBe(0);
    expect(compensationFee(undefined, "2027-06-01")).toBe(0);
  });

  test("renewal: board ≥ 60 two seasons, 40..59 one, < 40 none; due at 85% of the season", () => {
    expect(renewalDecision({ board: 70, currentWage: 100, reputationWage: 120 })).toEqual({ seasons: 2, wage: 120 });
    expect(renewalDecision({ board: 50, currentWage: 100, reputationWage: 120 })).toEqual({ seasons: 1, wage: 100 });
    expect(renewalDecision({ board: 30, currentWage: 100, reputationWage: 120 })).toBeNull();
    expect(renewalDue({ until: "2027-05-17", seasonEnd: "2027-05-17", played: 33, totalRounds: 38 })).toBe(true);
    expect(renewalDue({ until: "2027-05-17", seasonEnd: "2027-05-17", played: 30, totalRounds: 38 })).toBe(false);
    expect(renewalDue({ until: "2028-05-17", seasonEnd: "2027-05-17", played: 38, totalRounds: 38 })).toBe(false);
  });

  test("contract day: the board's offer at 85%, the warning a week before the end, renewal extends", () => {
    const contract = { squadId: "c", wage: 100, until: "2027-05-17", signed: "2025-08-01" };
    const base = { contract, notices: [] as string[], seasonEnd: "2027-05-17", totalRounds: 38, reputationWage: 150 };
    expect(contractDay({ ...base, date: "2027-03-01", board: 70, played: 20 }).message).toBeUndefined();
    const offer = contractDay({ ...base, date: "2027-04-20", board: 70, played: 33 });
    expect(offer.message).toEqual({ kind: "contract_offer", contract: { seasons: 2, wage: 150 } });
    expect(offer.renewal).toMatchObject({ seasons: 2, wage: 150 });
    // Decided once; a week before the end the warning arrives (offer still pending, not accepted).
    const later = contractDay({ ...base, notices: offer.notices, renewal: offer.renewal, date: "2027-05-12", board: 70, played: 37 });
    expect(later.message).toEqual({ kind: "contract_ending" });
    const refused = contractDay({ ...base, date: "2027-04-20", board: 30, played: 33 });
    expect(refused).toMatchObject({ message: { kind: "contract_ending" } });
    expect(renewedContract(contract, { wage: 150, seasons: 2 }, "2027-04-21")).toMatchObject({ until: "2029-05-17", wage: 150 });
  });
});
