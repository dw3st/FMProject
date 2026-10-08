import { describe, expect, test } from "bun:test";
import {
  academyEffectsAt, advanceFacilities, attendanceOf, boardDecision, comfortPriceMult, demandOf,
  effectiveCapacity, facilitiesGate, facilityLevels, initialFacilities, instalmentAmount, quoteProject,
  recordAttendance, seasonPhaseMult, seatCost, splitStands, standWeeks, startProject, totalSeats,
  trainingEffectsAt, weeklyUpkeep, withFacilities,
} from "@/Domain/facilities/facilities";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { gateRevenue } from "@/Domain/finance/gate";
import { academyEffectsOf, committedSpend, itemBusy, itemValue, payRepairNow, projectRunning, trainingGroundEffectsOf } from "@/Domain/facilities/facilities";
import { comfortLevelPriceMult, facilitiesAppeal } from "@/Domain/facilities/facilities";
import { FACILITY_ITEMS, conditionOf, wearFor, withGroupLevel } from "@/Domain/facilities/facilityItems";
import { INJURY } from "@/Domain/injury/injuryConfig";
import type { FacilityItemId } from "@/types/facilityTypes";
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
    expect(comfortLevelPriceMult(1)).toBe(1);
    expect(comfortLevelPriceMult(3)).toBeCloseTo(1.12, 10);
    expect(comfortLevelPriceMult(5)).toBeCloseTo(1.24, 10);
    const f = initialFacilities(squad(), 1);
    expect(comfortPriceMult(f)).toBe(1);
    expect(comfortPriceMult(withGroupLevel(f, "comfort", 3))).toBeCloseTo(1.12, 10);
  });

  test("worn seats and structure: demand × 0.9 × 0.95 and price × 0.95 at 0%", () => {
    const f = initialFacilities(squad(), 1);
    const base = demandOf(f, { followers: 2_000_000, tier: 1, fans: 60 });
    const worn = withCondition(f, { seats: 0, stadiumStructure: 0 });
    expect(demandOf(worn, { followers: 2_000_000, tier: 1, fans: 60 })).toBeCloseTo(base * 0.9 * 0.95, 6);
    expect(comfortPriceMult(worn)).toBeCloseTo(0.95, 10);
    // At 40% or more nothing changes.
    expect(demandOf(withCondition(f, { seats: 40, stadiumStructure: 41 }), { followers: 2_000_000, tier: 1, fans: 60 })).toBeCloseTo(base, 6);
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
    const tr = quoteProject(withGroupLevel(f, "training", 2), { kind: "training" }, ctx)!;
    expect(tr.level).toBe(3);
    expect(tr.cost).toBe(6_000_000);
    expect(tr.weeks).toBeGreaterThanOrEqual(12);
    expect(tr.weeks).toBeLessThanOrEqual(40);
    expect(quoteProject(withGroupLevel(f, "academy", 5), { kind: "academy" }, ctx)).toBeNull();
    // A fractional group level asks for the next whole level.
    const half = { ...f, items: { ...f.items, gym: { ...f.items.gym, level: f.items.gym.level + 1 } } };
    expect(quoteProject(half, { kind: "training" }, ctx)!.level).toBe(Math.floor(f.items.gym.level / 2) + 1);
    expect(quoteProject(f, { kind: "comfort" }, ctx)!.cost).toBe(40000 * 100);
  });

  test("upkeep only for levels above the implied level", () => {
    const sq = squad();
    const f = initialFacilities(sq, 1);
    expect(weeklyUpkeep(withFacilities(sq, f), 9e7)).toBe(0);
    expect(weeklyUpkeep(withFacilities(sq, withGroupLevel(f, "training", 5)), 9e7)).toBe(Math.round((9e7 * 2 * F.TRAINING_UPKEEP_SHARE) / 52));
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
    expect(facilityLevels(withFacilities(elite, f)).academy).toBe(4);
    expect(academyEffectsOf(withFacilities(elite, f))).toEqual(academyEffectsAt(3));
    expect(academyEffectsOf(withFacilities(elite, withGroupLevel(f, "academy", 5)))).toEqual(academyEffectsAt(4));
  });

  test("AI clubs use the implied level by tier; the human club its stored levels", () => {
    const low = squad({ finances: { broadcasting: 1e6, commercial: 1e6, total: 2e6, budget: 0, followers: 1e5 } });
    expect(facilityLevels(low)).toEqual({ training: 2, academy: 2 });
    const elite = squad({ finances: { broadcasting: 2e8, commercial: 2e8, total: 4e8, budget: 0, followers: 1e8 } });
    expect(facilityLevels(elite)).toEqual({ training: 4, academy: 4 });
    const f = initialFacilities(low, 1);
    expect(facilityLevels(withFacilities(low, withGroupLevel(f, "training", 5)))).toEqual({ training: 5, academy: 2 });
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

function withCondition(f: ClubFacilities, conds: Partial<Record<FacilityItemId, number>>): ClubFacilities {
  const items = { ...f.items };
  for (const [id, c] of Object.entries(conds) as [FacilityItemId, number][]) items[id] = { ...items[id], wear: wearFor(c) };
  return { ...f, items };
}

describe("living facilities: effects of the items' condition", () => {
  const sq = squad();
  const f = initialFacilities(sq, 1);
  const human = (x: ClubFacilities) => withFacilities(sq, x);

  test("starting items: levels and effects are today's (group level = implied)", () => {
    expect(facilityLevels(human(f))).toEqual(facilityLevels(sq));
    const ground = trainingGroundEffectsOf(human(f));
    expect({ recoveryMult: ground.recoveryMult, injuryMult: ground.injuryMult, devMult: ground.devMult })
      .toEqual(trainingEffectsAt(facilityLevels(sq).training));
    expect(ground.normalSessionInjury).toBe(0);
    expect(ground.injuryDurationMult).toBe(1);
    expect(academyEffectsOf(human(f))).toEqual(academyEffectsAt(3));
    for (const id of FACILITY_ITEMS) expect(f.items[id].level).toBe(id === "seats" ? 2 : 6);
  });

  test("AI clubs: no penalties, physio neutral", () => {
    const g = trainingGroundEffectsOf(sq);
    expect(g.normalSessionInjury).toBe(0);
    expect(g.injuryDurationMult).toBe(1);
  });

  test("training pitches, gym and canteen at 20%: development, injuries, normal-session risk", () => {
    const worn = human(withCondition(f, { trainingPitches: 20, gym: 20, canteen: 20, pool: 20, physio: 20 }));
    const lv = trainingEffectsAt(facilityLevels(sq).training);
    const g = trainingGroundEffectsOf(worn);
    expect(g.devMult).toBeCloseTo(lv.devMult * 0.975 * 0.965 * 0.985, 10);
    expect(g.injuryMult).toBeCloseTo(lv.injuryMult * 1.3, 10);
    expect(g.recoveryMult).toBeCloseTo(lv.recoveryMult * 0.985 * 0.985, 10);
    expect(g.normalSessionInjury).toBeCloseTo(INJURY.HEAVY_TRAINING_CHANCE * 0.5 * 0.5, 12);
    expect(g.normalSessionInjury).toBeLessThanOrEqual(0.005);
    // Physio at 20%: injuries last 12.5% longer.
    expect(g.injuryDurationMult).toBeCloseTo(1.125, 10);
  });

  test("match DP: neutral at the start, the AI and from 40% up; falls with the CT items below 40%", () => {
    expect(trainingGroundEffectsOf(human(f)).matchDevMult).toBe(1);
    expect(trainingGroundEffectsOf(sq).matchDevMult).toBe(1);
    expect(trainingGroundEffectsOf(human(withCondition(f, { trainingPitches: 41, gym: 41, canteen: 41 }))).matchDevMult).toBe(1);
    // Pool and physio do not touch the match DP.
    expect(trainingGroundEffectsOf(human(withCondition(f, { pool: 0, physio: 0 }))).matchDevMult).toBe(1);
    const at = (c: number) => trainingGroundEffectsOf(human(withCondition(f, { trainingPitches: c, gym: c, canteen: c }))).matchDevMult;
    expect(at(20)).toBeCloseTo(1 + (F.WEAR.CT_MATCH_DEV_MIN - 1) * 0.5, 10);
    expect(at(0)).toBeCloseTo(F.WEAR.CT_MATCH_DEV_MIN, 10);
    expect(at(0)).toBeLessThan(at(20));
    expect(at(20)).toBeLessThan(1);
    // Mean of the three items: 0%, 40% and 40% = the mean condition 26.7% (a third of the penalty).
    const one = trainingGroundEffectsOf(human(withCondition(f, { trainingPitches: 0, gym: 40, canteen: 40 }))).matchDevMult;
    expect(one).toBeCloseTo(1 + (F.WEAR.CT_MATCH_DEV_MIN - 1) / 3, 6);
  });

  test("physio level: a better physio shortens injuries, neutral at the starting level", () => {
    const up = { ...f, items: { ...f.items, physio: { level: 10, wear: 0 } } };
    expect(trainingGroundEffectsOf(human(up)).injuryDurationMult).toBeLessThan(1);
    const down = { ...f, items: { ...f.items, physio: { level: 2, wear: 0 } } };
    expect(trainingGroundEffectsOf(human(down)).injuryDurationMult).toBeGreaterThan(1);
  });

  test("academy pitches and lodging at 0%: intake −0.3, promise × 0.8", () => {
    const worn = human(withCondition(f, { academyPitches: 0, academyLodging: 0 }));
    const e = academyEffectsOf(worn);
    expect(e.qualityBonus).toBeCloseTo(-0.3, 10);
    expect(e.promiseChance).toBeCloseTo(academyEffectsAt(3).promiseChance * 0.8, 10);
  });

  test("group works raise every item of the group to 2 × the new level at 100%", () => {
    let x = withCondition(f, { gym: 30 });
    const q = quoteProject(x, { kind: "training" }, { revenue: 1e8, seatCost: 3000 })!;
    expect(q.level).toBe(4);
    x = startProject(x, q, { id: "t", date: "2027-01-01", boardShare: 0 });
    const done = advanceFacilities(x, x.projects[0]!.end).facilities;
    for (const id of ["trainingPitches", "gym", "pool", "physio", "canteen"] as const) {
      expect(done.items[id].level).toBe(8);
      expect(done.items[id].wear).toBe(0);
    }
    expect(done.items.seats).toEqual(x.items.seats);
    const c = startProject(f, quoteProject(f, { kind: "comfort" }, { revenue: 1e8, seatCost: 3000 })!, { id: "c", date: "2027-01-01", boardShare: 0 });
    expect(advanceFacilities(c, c.projects[0]!.end).facilities.items.seats.level).toBe(4);
  });

  test("weekly upkeep unchanged with whole levels", () => {
    expect(weeklyUpkeep(human(f), 9e7)).toBe(0);
    expect(weeklyUpkeep(human(withGroupLevel(f, "academy", 5)), 9e7)).toBe(Math.round((9e7 * 2 * F.ACADEMY_UPKEEP_SHARE) / 52));
  });
});

describe("item projects: repair, rebuild, upgrade", () => {
  const rev = 100_000_000;
  const ctx = { revenue: rev, seatCost: 3000 };
  const f0 = initialFacilities(squad(), 1);
  const at = (id: FacilityItemId, c: number, extra = {}) => ({ ...f0, items: { ...f0.items, [id]: { ...f0.items[id], wear: wearFor(c), ...extra } } });

  test("item value", () => {
    expect(itemValue(rev, "seats", 6)).toBeCloseTo(rev * 0.03, 6);
    expect(itemValue(rev, "stadiumPitch", 3)).toBeCloseTo(rev * 0.006 / 2, 6);
  });

  test("repair quote: cost, weeks, small; invalid targets", () => {
    const f = at("stadiumPitch", 30);
    const q = quoteProject(f, { kind: "repair", item: "stadiumPitch", to: 100 }, ctx)!;
    const value = itemValue(rev, "stadiumPitch", f.items.stadiumPitch.level);
    expect(q.cost).toBe(Math.round(value * 0.7 * 0.6));
    expect(q.weeks).toBe(2);
    expect(q.small).toBe(true);
    expect(q.item).toBe("stadiumPitch");
    expect(q.to).toBe(100);
    expect(quoteProject(f, { kind: "repair", item: "stadiumPitch", to: 72 }, ctx)).toBeNull();
    expect(quoteProject(f, { kind: "repair", item: "stadiumPitch", to: 25 }, ctx)).toBeNull();
    expect(quoteProject(f, { kind: "repair", item: "stadiumPitch", to: 105 }, ctx)).toBeNull();
    expect(quoteProject(at("stadiumPitch", 30, { condemned: true }), { kind: "repair", item: "stadiumPitch", to: 100 }, ctx)).toBeNull();
    // A big repair is not small: seats at level 10, 0 → 100 = 3% of the revenue (all the starting
    // levels repair under the 2% line: value share × level / 6 × 0.6).
    expect(quoteProject(at("seats", 0, { level: 10 }), { kind: "repair", item: "seats", to: 100 }, ctx)!.small).toBe(false);
    expect(quoteProject(at("seats", 0), { kind: "repair", item: "seats", to: 100 }, ctx)!.small).toBe(true);
  });

  test("rebuild only below 15% or condemned; upgrade up to level 10", () => {
    expect(quoteProject(at("gym", 60), { kind: "rebuild", item: "gym" }, ctx)).toBeNull();
    const r = quoteProject(at("gym", 10), { kind: "rebuild", item: "gym" }, ctx)!;
    expect(r.cost).toBe(Math.round(itemValue(rev, "gym", f0.items.gym.level)));
    expect(r.weeks).toBe(F.ITEMS.gym.rebuildWeeks);
    expect(quoteProject(at("gym", 60, { condemned: true }), { kind: "rebuild", item: "gym" }, ctx)).not.toBeNull();
    const u = quoteProject(f0, { kind: "upgrade", item: "gym" }, ctx)!;
    expect(u.level).toBe(f0.items.gym.level + 1);
    expect(u.cost).toBe(Math.round(itemValue(rev, "gym", f0.items.gym.level + 1) * 0.6));
    expect(u.weeks).toBe(Math.ceil(F.ITEMS.gym.rebuildWeeks * 0.6));
    expect(quoteProject(at("gym", 60, { level: 10 }), { kind: "upgrade", item: "gym" }, ctx)).toBeNull();
  });

  test("busy: one project per item; group works take the whole group", () => {
    const q = quoteProject(at("gym", 30), { kind: "repair", item: "gym", to: 50 }, ctx)!;
    const f = startProject(f0, q, { id: "r", date: "2027-01-01", boardShare: 0 });
    expect(itemBusy(f, "gym")).toBe(true);
    expect(itemBusy(f, "pool")).toBe(false);
    expect(projectRunning(f, "training")).toBe(true);
    expect(projectRunning(f, "academy")).toBe(false);
    const g = startProject(f0, quoteProject(f0, { kind: "training" }, ctx)!, { id: "g", date: "2027-01-01", boardShare: 0 });
    expect(itemBusy(g, "pool")).toBe(true);
    expect(itemBusy(g, "seats")).toBe(false);
    const c = startProject(f0, quoteProject(f0, { kind: "comfort" }, ctx)!, { id: "c", date: "2027-01-01", boardShare: 0 });
    expect(itemBusy(c, "seats")).toBe(true);
  });

  test("delivery: repair to the target, rebuild to 100 same level, upgrade +1 level", () => {
    const run = (f: ClubFacilities, req: Parameters<typeof quoteProject>[1]) => {
      const q = quoteProject(f, req, ctx)!;
      const s = startProject(f, q, { id: "x", date: "2027-01-01", boardShare: 0 });
      return advanceFacilities(s, s.projects[0]!.end);
    };
    const rep = run(at("stadiumPitch", 30, { alert: 40 }), { kind: "repair", item: "stadiumPitch", to: 80 });
    expect(conditionOf(rep.facilities.items.stadiumPitch)).toBeCloseTo(80, 1);
    expect(rep.facilities.items.stadiumPitch.alert).toBeUndefined();
    expect(rep.completed[0]!.item).toBe("stadiumPitch");
    expect(rep.facilities.completed.at(-1)!.item).toBe("stadiumPitch");
    const reb = run(at("gym", 5, { condemned: true, alert: 15 }), { kind: "rebuild", item: "gym" });
    expect(reb.facilities.items.gym).toEqual({ level: f0.items.gym.level, wear: 0 });
    const up = run(f0, { kind: "upgrade", item: "pool" });
    expect(up.facilities.items.pool).toEqual({ level: f0.items.pool.level + 1, wear: 0 });
    const line = up.entries.find((e) => e.kind === "facilities")!;
    expect(line.ref).toEqual({ facility: "upgrade", item: "pool" });
  });

  test("small repair paid now: one ledger line, no board funding, nothing committed", () => {
    const f = at("stadiumPitch", 30);
    const q = quoteProject(f, { kind: "repair", item: "stadiumPitch", to: 100 }, ctx)!;
    const r = payRepairNow(f, q, { id: "s", date: "2027-01-01" });
    expect(r.entry).toEqual({
      date: "2027-01-01", kind: "facilities", amount: -q.cost, label: "Facilities repair (stadiumPitch)",
      ref: { facility: "repair", item: "stadiumPitch" },
    });
    const p = r.facilities.projects[0]!;
    expect(p.paid).toBe(1);
    expect(p.instalments).toBe(1);
    expect(p.boardShare).toBe(0);
    expect(committedSpend(r.facilities)).toBe(0);
    const day = advanceFacilities(r.facilities, p.end);
    expect(day.entries).toEqual([]);
    expect(day.completed).toHaveLength(1);
  });
});

describe("facilitiesAppeal", () => {
  test("AI club 100; training ground mean; up to 21 also the academy", () => {
    const sq = squad();
    expect(facilitiesAppeal(sq, { age: 26 })).toBe(100);
    const f = initialFacilities(sq, 1);
    const items = { ...f.items };
    for (const id of ["trainingPitches", "gym", "pool", "physio", "canteen"] as FacilityItemId[]) items[id] = { ...items[id], wear: wearFor(20) };
    for (const id of ["academyPitches", "academyLodging"] as FacilityItemId[]) items[id] = { ...items[id], wear: wearFor(80) };
    const human = { ...sq, facilities: { ...f, items } };
    expect(facilitiesAppeal(human, { age: 26 })).toBeCloseTo(20, 8);
    expect(facilitiesAppeal(human, { age: 19 })).toBeCloseTo(50, 8);
  });
});
