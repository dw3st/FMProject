import { describe, expect, test } from "bun:test";
import {
  academyEffectsAt, advanceFacilities, attendanceOf, boardDecision, comfortPriceMult, demandOf,
  effectiveCapacity, facilitiesGate, facilityLevels, initialFacilities, instalmentAmount, quoteProject,
  recordAttendance, seasonPhaseMult, seatCost, splitStands, standWeeks, startProject, totalSeats,
  trainingEffectsAt, weeklyUpkeep, withFacilities,
} from "@/Domain/facilities/facilities";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { gateRevenue } from "@/Domain/finance/gate";
import { academyEffectsOf, committedSpend } from "@/Domain/facilities/facilities";
import { clubAnnualRevenue } from "@/Domain/finance/wages";
import { stadiumFillRate } from "@/Domain/boardFans/boardFans";
import type { Squad } from "@/types/playerTypes";
import type { ClubFacilities } from "@/types/facilityTypes";

function squad(over: Partial<Squad> = {}): Squad {
  return {
    id: "c1", name: "Club", colors: ["#000000", "#ffffff"], money: 0, players: [],
    venue: { name: "Arena", city: "Town", capacity: 40000 },
    finances: { broadcasting: 60_000_000, commercial: 30_000_000, total: 90_000_000, budget: 0, followers: 2_000_000 },
    ...over,
  };
}

describe("stadium", () => {
  test("stands sum exactly to the capacity, sides bigger", () => {
    for (const cap of [0, 1, 999, 40000, 52341]) {
      const s = splitStands(cap);
      expect(s.reduce((a, x) => a + x.seats, 0)).toBe(cap);
    }
    const s = splitStands(40000);
    const by = Object.fromEntries(s.map((x) => [x.id, x.seats]));
    expect(by.east!).toBeGreaterThan(by.north!);
    expect(by.west!).toBeGreaterThan(by.south!);
  });

  test("default facilities sell exactly the old gate (neutral phase)", () => {
    const sq = squad();
    const f = initialFacilities(sq, 1);
    for (const fans of [0, 30, 60, 85, 100]) {
      const input = { followers: 2_000_000, tier: 1, fans };
      for (const kind of ["league", "cup", "continental"] as const) {
        expect(facilitiesGate(f, input, kind)).toBe(gateRevenue(40000, kind, false, stadiumFillRate(fans)));
      }
    }
    expect(facilitiesGate(f, { followers: 2_000_000, tier: 1, fans: 60 }, "league", true)).toBe(0);
  });

  test("phase averages ~1 over the season", () => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += seasonPhaseMult(i / 1000);
    expect(Math.abs(sum / 1000 - 1)).toBeLessThan(0.005);
  });

  test("demand follows followers and league tier; attendance capped by capacity", () => {
    const f = initialFacilities(squad(), 1);
    const base = demandOf(f, { followers: 2_000_000, tier: 1, fans: 60 });
    expect(base).toBeCloseTo(40000 * 0.65, 6);
    expect(demandOf(f, { followers: 4_000_000, tier: 1, fans: 60 })).toBeCloseTo(base * Math.pow(2, F.FOLLOWERS_EXPONENT), 6);
    expect(demandOf(f, { followers: 2_000_000, tier: 2, fans: 60 })).toBeCloseTo(base * 0.6, 6);
    const big = attendanceOf(f, { followers: 20_000_000, tier: 1, fans: 100 });
    expect(big.demand).toBeGreaterThan(40000);
    expect(big.attendance).toBe(40000);
  });

  test("comfort raises the price 6% per level", () => {
    expect(comfortPriceMult(1)).toBe(1);
    expect(comfortPriceMult(3)).toBeCloseTo(1.12, 10);
    expect(comfortPriceMult(5)).toBeCloseTo(1.24, 10);
  });

  test("expanding without demand does not raise the estimated revenue", () => {
    const sq = squad();
    const f = initialFacilities(sq, 1);
    const before = clubAnnualRevenue(withFacilities(sq, f), 19);
    expect(before).toBe(clubAnnualRevenue(sq, 19));
    const bigger = { ...f, stands: f.stands.map((s) => (s.id === "east" ? { ...s, seats: s.seats + 10000 } : s)) };
    const expanded = withFacilities(sq, bigger);
    expect(expanded.venue!.capacity).toBe(50000);
    expect(clubAnnualRevenue(expanded, 19)).toBe(before);
    // More followers (demand) do fill some of the new seats.
    const grown = { ...expanded, finances: { ...expanded.finances!, followers: 3_000_000 } };
    expect(clubAnnualRevenue(grown, 19)).toBeGreaterThan(before);
  });

  test("forecast capacity: the stand counts half until its works end, then with the new seats", () => {
    let f = initialFacilities(squad(), 1);
    const q = quoteProject(f, { kind: "stand", stand: "east", seats: 4000 }, { revenue: 1e8, seatCost: 4000 })!;
    f = startProject(f, q, { id: "p1", date: "2027-01-01", boardShare: 0 });
    const end = f.projects[0]!.end;
    const east = f.stands.find((s) => s.id === "east")!.seats;
    expect(effectiveCapacity(f, "2027-01-02")).toBe(40000 - east + Math.floor(east / 2));
    expect(effectiveCapacity(f, end)).toBe(44000);
  });

  test("a stand under works counts half", () => {
    let f = initialFacilities(squad(), 1);
    const q = quoteProject(f, { kind: "stand", stand: "east", seats: 5000 }, { revenue: 1e8, seatCost: 4000 })!;
    expect(q.newCapacity).toBe(45000);
    f = startProject(f, q, { id: "p1", date: "2027-01-01", boardShare: 0 });
    const east = f.stands.find((s) => s.id === "east")!.seats;
    expect(effectiveCapacity(f)).toBe(40000 - east + Math.floor(east / 2));
  });
});

describe("costs", () => {
  test("seat cost by country and league tier within 1.5k..6k", () => {
    expect(seatCost(1, 1)).toBe(6000);
    expect(seatCost(1.2, 1)).toBe(6000);
    expect(seatCost(0.2, 1)).toBe(2400);
    expect(seatCost(1, 2)).toBeLessThan(seatCost(1, 1));
    expect(seatCost(0, 4)).toBe(1500);
  });

  test("stand works take 8..30 weeks", () => {
    expect(standWeeks(1000)).toBe(8);
    expect(standWeeks(10000)).toBe(30);
    expect(standWeeks(5000)).toBeGreaterThan(8);
  });

  test("quotes: invalid seats, max level, revenue-based costs", () => {
    const f = initialFacilities(squad(), 1);
    const ctx = { revenue: 100_000_000, seatCost: 3000 };
    expect(quoteProject(f, { kind: "stand", stand: "north", seats: 1500 }, ctx)).toBeNull();
    expect(quoteProject(f, { kind: "stand", stand: "north", seats: 11000 }, ctx)).toBeNull();
    expect(quoteProject(f, { kind: "stand", stand: "north", seats: 3000 }, ctx)!.cost).toBe(9_000_000);
    const tr = quoteProject({ ...f, training: 2 }, { kind: "training" }, ctx)!;
    expect(tr.level).toBe(3);
    expect(tr.cost).toBe(6_000_000);
    expect(tr.weeks).toBeGreaterThanOrEqual(12);
    expect(tr.weeks).toBeLessThanOrEqual(40);
    expect(quoteProject({ ...f, academy: 5 }, { kind: "academy" }, ctx)).toBeNull();
    expect(quoteProject(f, { kind: "comfort" }, ctx)!.cost).toBe(40000 * 100);
  });

  test("upkeep only for levels above the implied level", () => {
    const sq = squad();
    const f = initialFacilities(sq, 1);
    expect(weeklyUpkeep(withFacilities(sq, f), 9e7)).toBe(0);
    expect(weeklyUpkeep(withFacilities(sq, { ...f, training: f.training + 2 }), 9e7)).toBe(Math.round((9e7 * 2 * F.TRAINING_UPKEEP_SHARE) / 52));
    expect(weeklyUpkeep(sq, 9e7)).toBe(0);
  });
});

describe("effects", () => {
  test("training ground: level 3 neutral, ends as specified", () => {
    expect(trainingEffectsAt(3)).toEqual({ recoveryMult: 1, injuryMult: 1, devMult: 1 });
    expect(trainingEffectsAt(1)).toEqual({ recoveryMult: 0.97, injuryMult: 1.05, devMult: 0.95 });
    expect(trainingEffectsAt(5)).toEqual({ recoveryMult: 1.08, injuryMult: 0.85, devMult: 1.1 });
  });

  test("academy: quality ±0.15/level, size up to 6 at level 5, promise 5% → 9%", () => {
    expect(academyEffectsAt(3)).toEqual({ qualityBonus: 0, intakeMax: 5, promiseChance: 0.05 });
    expect(academyEffectsAt(5).qualityBonus).toBeCloseTo(0.3, 10);
    expect(academyEffectsAt(1).qualityBonus).toBeCloseTo(-0.3, 10);
    expect(academyEffectsAt(5).intakeMax).toBe(6);
    expect(academyEffectsAt(5).promiseChance).toBe(0.09);
  });

  test("academy relative to the tier's implied level: AI neutral, the human club by what it built", () => {
    const elite = squad({ finances: { broadcasting: 2e8, commercial: 2e8, total: 4e8, budget: 0, followers: 1e8 } });
    expect(academyEffectsOf(elite)).toEqual(academyEffectsAt(3));
    const f = initialFacilities(elite, 1);
    expect(f.academy).toBe(4);
    expect(academyEffectsOf(withFacilities(elite, f))).toEqual(academyEffectsAt(3));
    expect(academyEffectsOf(withFacilities(elite, { ...f, academy: 5 }))).toEqual(academyEffectsAt(4));
  });

  test("AI clubs use the implied level by tier; the human club its stored levels", () => {
    const low = squad({ finances: { broadcasting: 1e6, commercial: 1e6, total: 2e6, budget: 0, followers: 1e5 } });
    expect(facilityLevels(low)).toEqual({ training: 2, academy: 2 });
    const elite = squad({ finances: { broadcasting: 2e8, commercial: 2e8, total: 4e8, budget: 0, followers: 1e8 } });
    expect(facilityLevels(elite)).toEqual({ training: 4, academy: 4 });
    const f = initialFacilities(low, 1);
    expect(facilityLevels(withFacilities(low, { ...f, training: 5 }))).toEqual({ training: 5, academy: 2 });
    const mid = squad({ finances: { broadcasting: 3e7, commercial: 1e7, total: 4e7, budget: 0, followers: 1e6 } });
    expect(facilityLevels(mid)).toEqual({ training: 3, academy: 3 });
  });
});

describe("board decision", () => {
  const rev = 100_000_000;
  test("refusals", () => {
    expect(boardDecision({ board: 90, balance: -1, cost: 1, revenue: rev })).toEqual({ approved: false, reason: "negative_balance" });
    expect(boardDecision({ board: 49, balance: 1e9, cost: 1, revenue: rev })).toEqual({ approved: false, reason: "board_low" });
    expect(boardDecision({ board: 60, balance: 1e9, cost: 11e6, revenue: rev })).toEqual({ approved: false, reason: "too_big" });
    expect(boardDecision({ board: 75, balance: 5e6, cost: 6e6, revenue: rev })).toEqual({ approved: false, reason: "no_money" });
  });
  test("approvals and board funding", () => {
    expect(boardDecision({ board: 60, balance: 1e9, cost: 9e6, revenue: rev })).toEqual({ approved: true, boardShare: 0 });
    expect(boardDecision({ board: 75, balance: 6e6, cost: 6e6, revenue: rev })).toEqual({ approved: true, boardShare: 0 });
    expect(boardDecision({ board: 85, balance: 1e9, cost: 6e6, revenue: rev })).toEqual({ approved: true, boardShare: 0.25 });
    expect(boardDecision({ board: 100, balance: 1e9, cost: 6e6, revenue: rev })).toEqual({ approved: true, boardShare: 0.5 });
    // Running works: the club's remaining share is taken off the balance.
    expect(boardDecision({ board: 75, balance: 10e6, cost: 6e6, revenue: rev, committed: 5e6 })).toEqual({ approved: false, reason: "no_money" });
    expect(boardDecision({ board: 75, balance: 11e6, cost: 6e6, revenue: rev, committed: 5e6 }).approved).toBe(true);
    // The board's part lowers what the balance must cover.
    expect(boardDecision({ board: 100, balance: 3e6, cost: 6e6, revenue: rev }).approved).toBe(true);
  });
});

describe("projects", () => {
  test("instalments sum to the cost, board funding to its share, completion applies the effect", () => {
    expect([0, 1, 2].reduce((s, k) => s + instalmentAmount(1000, 3, k), 0)).toBe(1000);
    let f: ClubFacilities = initialFacilities(squad(), 1);
    const q = quoteProject(f, { kind: "stand", stand: "west", seats: 4000 }, { revenue: 1e8, seatCost: 3333 })!;
    f = startProject(f, q, { id: "p", date: "2027-01-01", boardShare: 0.3 });
    const p = f.projects[0]!;
    expect(committedSpend(f)).toBe(p.cost - Math.round(p.cost * 0.3));
    let date = "2027-01-01";
    let paid = 0;
    let funded = 0;
    let done = false;
    for (let i = 0; i < 400 && !done; i++) {
      const r = advanceFacilities(f, date);
      f = r.facilities;
      for (const e of r.entries) {
        if (e.kind === "facilities") paid -= e.amount;
        if (e.kind === "board_funding") funded += e.amount;
      }
      if (r.completed.length) done = true;
      const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); date = d.toISOString().slice(0, 10);
    }
    expect(done).toBe(true);
    expect(paid).toBe(p.cost);
    expect(funded).toBe(Math.round(p.cost * 0.3));
    expect(committedSpend(f)).toBe(0);
    expect(totalSeats(f)).toBe(44000);
    expect(f.projects).toHaveLength(0);
    expect(f.completed.at(-1)!.kind).toBe("stand");
    expect(withFacilities(squad(), f).venue!.capacity).toBe(44000);
  });

  test("attendance record: the first game sets it silently, a better one breaks it", () => {
    let f = initialFacilities(squad(), 1);
    const row = (a: number) => ({ date: "2027-01-01", competition: "x", opponentId: "o", attendance: a, capacity: 40000, demand: a });
    const r1 = recordAttendance(f, row(20000));
    expect(r1.recordBroken).toBeNull();
    f = r1.facilities;
    expect(recordAttendance(f, row(19000)).recordBroken).toBeNull();
    expect(recordAttendance(f, row(25000)).recordBroken).toEqual({ previous: 20000, attendance: 25000 });
  });
});
