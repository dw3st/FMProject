import { describe, expect, test } from "bun:test";
import { processContractExpiries, renewExpiringOnTakeover } from "@/Domain/contracts/expiry";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function player(id: string, age: number, level: number, until: string, wage = 1000): RosterPlayer {
  const v = level;
  return {
    id, name: id, age, squadId: "c1", preferredFoot: "right", positions: ["CM"],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
      tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
    contract: { until, wage },
  };
}

function squad(players: RosterPlayer[]): Squad {
  return {
    id: "c1", name: "T", colors: ["#000", "#fff"], money: 0, players,
    finances: { broadcasting: 50_000_000, commercial: 50_000_000, total: 100_000_000, budget: 0, followers: 0 },
    venue: { name: "A", city: "C", capacity: 40_000, surface: "grass" },
    wageFactor: 1, wageRevenueBasis: 100_000_000,
  };
}

const DATE = "2027-05-31";
const NEXT = "2028-05-31";
const base = Array.from({ length: 20 }, (_, i) => player(`s${i}`, 26, 5, "2029-05-31"));

describe("processContractExpiries", () => {
  test("nothing expiring leaves the squad untouched", () => {
    const sq = squad(base);
    const r = processContractExpiries({ squad: sq, date: DATE, nextSeasonEnd: NEXT, isHuman: false });
    expect(r.squad).toBe(sq);
  });

  test("human club releases every expired contract and renews none", () => {
    const sq = squad([...base, player("e1", 26, 5, DATE), player("e2", 26, 5, "2027-06-15")]);
    const r = processContractExpiries({ squad: sq, date: DATE, nextSeasonEnd: NEXT, isHuman: true });
    expect(r.released.map((p) => p.id).sort()).toEqual(["e1", "e2"]);
    expect(r.renewed).toHaveLength(0);
    expect(r.squad.players).toHaveLength(20);
  });

  test("AI renews a fitting player, releases an old one, and renewal pushes the end out", () => {
    const sq = squad([...base, player("good", 26, 5, DATE), player("old", 35, 5, DATE)]);
    const r = processContractExpiries({ squad: sq, date: DATE, nextSeasonEnd: NEXT, isHuman: false });
    expect(r.renewed.map((p) => p.id)).toEqual(["good"]);
    expect(r.released.map((p) => p.id)).toEqual(["old"]);
    const good = r.squad.players.find((p) => p.id === "good")!;
    expect(good.contract!.until > NEXT || good.contract!.until === NEXT).toBe(true);
    expect(r.squad.players.some((p) => p.id === "old")).toBe(false);
  });

  test("AI over its wage cap releases instead of renewing", () => {
    const pricey = base.map((p) => ({ ...p, contract: { until: "2029-05-31", wage: 5_000_000 } }));
    const sq = squad([...pricey, player("good", 26, 5, DATE)]);
    const r = processContractExpiries({ squad: sq, date: DATE, nextSeasonEnd: NEXT, isHuman: false });
    expect(r.released.map((p) => p.id)).toEqual(["good"]);
  });

  test("a club that would drop under the minimum squad keeps its best leavers", () => {
    const few = Array.from({ length: 10 }, (_, i) => player(`o${i}`, 35, 5, DATE));
    const sq = squad(few);
    const r = processContractExpiries({ squad: sq, date: DATE, nextSeasonEnd: NEXT, isHuman: false });
    expect(r.squad.players).toHaveLength(10);
    expect(r.released).toHaveLength(0);
  });
});

describe("renewExpiringOnTakeover", () => {
  test("renews by the AI rule and keeps the others in the squad", () => {
    const sq = squad([...base, player("good", 26, 5, DATE), player("old", 35, 5, DATE)]);
    const r = renewExpiringOnTakeover({ squad: sq, date: DATE, nextSeasonEnd: NEXT });
    expect(r.renewed.map((p) => p.id)).toEqual(["good"]);
    expect(r.squad.players).toHaveLength(22);
    expect(r.squad.players.find((p) => p.id === "good")!.contract!.until >= NEXT).toBe(true);
    expect(r.squad.players.find((p) => p.id === "old")!.contract!.until).toBe(DATE);
  });
});
