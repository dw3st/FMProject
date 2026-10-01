import { describe, expect, test } from "bun:test";
import {
  addYearsIso, aiShouldRenew, contractDemand, evaluateContractOffer, initialContract, isExpired, renewalContract,
} from "@/Domain/contracts/contracts";
import { currentWage, squadWeeklyWages } from "@/Domain/finance/wages";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function player(id: string, age: number, level = 5): RosterPlayer {
  const v = level;
  return {
    id, name: id, age, squadId: "c1", preferredFoot: "right", positions: ["CM"],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
      tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
  };
}

function squad(players: RosterPlayer[]): Squad {
  return {
    id: "c1", name: "Test FC", colors: ["#000", "#fff"], money: 0, players,
    finances: { broadcasting: 10_000_000, commercial: 5_000_000, total: 15_000_000, budget: 0, followers: 0 },
    venue: { name: "A", city: "C", capacity: 40_000, surface: "grass" },
    wageFactor: 1,
  };
}

const END = "2027-05-31";

describe("initialContract", () => {
  test("deterministic and within the age bands", () => {
    for (const [age, lo, hi] of [[20, 3, 5], [26, 2, 4], [33, 1, 2]] as const) {
      for (let i = 0; i < 30; i++) {
        const p = player(`p${i}`, age);
        const c = initialContract(p, squad([p]), END);
        expect(c).toEqual(initialContract(p, squad([p]), END));
        const years = Number(c.until.slice(0, 4)) - 2027 + 1;
        expect(years).toBeGreaterThanOrEqual(lo);
        expect(years).toBeLessThanOrEqual(hi);
        expect(c.until.slice(4)).toBe("-05-31");
      }
    }
  });

  test("wage is the curve at the club factor", () => {
    const p = player("a", 25);
    expect(initialContract(p, squad([p]), END).wage).toBeGreaterThan(0);
  });
});

describe("evaluateContractOffer", () => {
  const p = player("a", 25);
  const s = squad([p, player("b", 25), player("c", 25)]);

  test("accepts at the demand", () => {
    const demand = contractDemand(p, s, "2027-01-01");
    expect(evaluateContractOffer({ wage: demand, years: 3 }, p, s, "2027-01-01").accepted).toBe(true);
  });
  test("refuses a low wage and reports the demand", () => {
    const r = evaluateContractOffer({ wage: 1, years: 3 }, p, s, "2027-01-01");
    expect(r).toMatchObject({ accepted: false, reason: "lowWage" });
    expect(r.demand).toBeGreaterThan(1);
  });
  test("refuses too many years past 36", () => {
    const old = player("o", 34);
    const r = evaluateContractOffer({ wage: 1e9, years: 3 }, old, squad([old]), "2027-01-01");
    expect(r.reason).toBe("tooManyYears");
  });
  test("refuses invalid years", () => {
    expect(evaluateContractOffer({ wage: 1e9, years: 0 }, p, s, "d").reason).toBe("invalidYears");
    expect(evaluateContractOffer({ wage: 1e9, years: 6 }, p, s, "d").reason).toBe("invalidYears");
  });
  test("a star above the average asks more than an average player", () => {
    const star = player("s", 28, 8);
    const sq = squad([star, player("b", 28), player("c", 28)]);
    const plain = player("b", 28);
    const starBase = initialContract(star, sq, END).wage;
    expect(contractDemand(star, sq, "d")).toBeGreaterThan(starBase);
    expect(contractDemand(plain, sq, "d")).toBeLessThanOrEqual(initialContract(plain, sq, END).wage * 1.01);
  });
});

describe("aiShouldRenew / renewalContract / isExpired", () => {
  const s = squad([player("a", 25), player("b", 25), player("weak", 25, 2), player("old", 35)]);
  test("renews a fitting player under the cap", () => {
    expect(aiShouldRenew(s.players[0]!, s, 100, 1000, 2000)).toBe(true);
  });
  test("does not renew when over the cap, too old, or too weak", () => {
    expect(aiShouldRenew(s.players[0]!, s, 100, 1950, 2000)).toBe(false);
    expect(aiShouldRenew(s.players[3]!, s, 100, 0, 2000)).toBe(false);
    expect(aiShouldRenew(s.players[2]!, s, 100, 0, 2000)).toBe(false);
  });
  test("renewalContract counts the coming season as year one", () => {
    expect(renewalContract(s.players[0]!, s, "2028-05-31", 3).until).toBe("2030-05-31");
    expect(renewalContract(s.players[0]!, s, "2028-05-31", 1).until).toBe("2028-05-31");
  });
  test("isExpired is inclusive and honours grace", () => {
    expect(isExpired({ until: "2027-05-31", wage: 1 }, "2027-05-31")).toBe(true);
    expect(isExpired({ until: "2027-05-31", wage: 1 }, "2027-05-30")).toBe(false);
    expect(isExpired({ until: "2027-05-31", wage: 1 }, "2027-04-15", 60)).toBe(true);
    expect(isExpired(undefined, "2027-05-31")).toBe(false);
  });
  test("addYearsIso clamps Feb 29", () => expect(addYearsIso("2028-02-29", 1)).toBe("2029-02-28"));
});

describe("currentWage", () => {
  test("uses the contract wage and sums it", () => {
    const a = { ...player("a", 25), contract: { until: END, wage: 1234 } };
    const b = player("b", 25);
    expect(currentWage(a, 1)).toBe(1234);
    expect(squadWeeklyWages([a], 1)).toBe(1234);
    expect(currentWage(b, 1)).toBeGreaterThan(0);
  });
});
