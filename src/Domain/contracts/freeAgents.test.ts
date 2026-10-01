import { describe, expect, test } from "bun:test";
import { freeAgentTick, MIN_BY_ROLE, refillSquad, roleOf } from "@/Domain/contracts/freeAgents";
import { mulberry32 } from "@/Domain/rng";
import type { FreeAgent, RosterPlayer, Squad } from "@/types/playerTypes";

function player(id: string, pos: string, level: number, age = 26): RosterPlayer {
  const v = level;
  return {
    id, name: `P ${id}`, age, squadId: "c1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
      tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
    contract: { until: "2030-05-31", wage: 1000 },
  };
}

function squad(players: RosterPlayer[]): Squad {
  return {
    id: "c1", name: "T", colors: ["#000", "#fff"], money: 0, players,
    finances: { broadcasting: 100_000_000, commercial: 100_000_000, total: 200_000_000, budget: 0, followers: 1_000_000 },
    venue: { name: "A", city: "C", capacity: 40_000, surface: "grass" },
    wageFactor: 1, wageRevenueBasis: 200_000_000,
  };
}

const full = () => [
  ...Array.from({ length: 3 }, (_, i) => player(`g${i}`, "GK", 5)),
  ...Array.from({ length: 7 }, (_, i) => player(`d${i}`, "CB", 5)),
  ...Array.from({ length: 7 }, (_, i) => player(`m${i}`, "CM", 5)),
  ...Array.from({ length: 4 }, (_, i) => player(`f${i}`, "ST", 5)),
];

function agent(id: string, pos: string, level: number): FreeAgent {
  return { player: { ...player(id, pos, level), squadId: "", contract: undefined }, since: "2027-05-31" };
}

describe("refillSquad", () => {
  test("AI squad below the minimum signs free agents first, then youth", () => {
    const sq = squad(full().slice(0, 15));
    const pool = [agent("fa1", "CM", 5), agent("fa2", "CB", 5)];
    const r = refillSquad({ squad: sq, pool, nextSeasonEnd: "2028-05-31", isHuman: false, tagPrefix: "t" });
    expect(r.squad.players.length).toBeGreaterThanOrEqual(24);
    expect(r.signed.length).toBeGreaterThan(0);
    expect(r.youth.length).toBeGreaterThan(0);
    for (const p of [...r.signed, ...r.youth]) {
      expect(p.contract).toBeDefined();
      expect(p.squadId).toBe("c1");
    }
    for (const y of r.youth) expect(y.age).toBeGreaterThanOrEqual(17);
  });

  test("fills every role minimum", () => {
    const sq = squad(full().filter((p) => roleOf(p) !== "GK"));
    const r = refillSquad({ squad: sq, pool: [], nextSeasonEnd: "2028-05-31", isHuman: true, tagPrefix: "t" });
    expect(r.squad.players.filter((p) => roleOf(p) === "GK").length).toBe(MIN_BY_ROLE.GK);
  });

  test("human club gets only youth up to role minimums, never free agents", () => {
    const sq = squad(full().slice(0, 18));
    const r = refillSquad({ squad: sq, pool: [agent("fa1", "ST", 8)], nextSeasonEnd: "2028-05-31", isHuman: true, tagPrefix: "t" });
    expect(r.signed.length).toBe(0);
  });

  test("deterministic", () => {
    const sq = squad(full().slice(0, 15));
    const a = refillSquad({ squad: sq, pool: [], nextSeasonEnd: "2028-05-31", isHuman: false, tagPrefix: "t" });
    const b = refillSquad({ squad: sq, pool: [], nextSeasonEnd: "2028-05-31", isHuman: false, tagPrefix: "t" });
    expect(a.squad.players.map((p) => p.id)).toEqual(b.squad.players.map((p) => p.id));
  });

  test("never exceeds 30 players", () => {
    const r = refillSquad({ squad: squad(full()), pool: [], nextSeasonEnd: "2028-05-31", isHuman: false, tagPrefix: "t" });
    expect(r.squad.players.length).toBeLessThanOrEqual(30);
  });
});

describe("freeAgentTick", () => {
  test("a club with a thin position signs a fitting free agent with a contract", () => {
    const sq = squad(full().filter((p) => roleOf(p) !== "Forward").concat([player("f0", "ST", 5)]));
    const pool = Array.from({ length: 6 }, (_, i) => agent(`fa${i}`, "ST", 5));
    const rng = mulberry32(7);
    let signed = 0;
    for (let d = 0; d < 20 && signed === 0; d++) {
      const r = freeAgentTick({ squads: [sq], pool, date: "2027-07-01", rng, seasonEndOf: () => "2028-05-31" });
      signed = r.signedIds.size;
      if (signed > 0) {
        const added = r.squads[0]!.players.find((p) => r.signedIds.has(p.id))!;
        expect(added.contract!.until >= "2028-05-31").toBe(true);
        expect(added.squadId).toBe("c1");
      }
    }
    expect(signed).toBeGreaterThan(0);
  });

  test("the human squad is never touched", () => {
    const sq = squad(full().slice(0, 12));
    const r = freeAgentTick({
      squads: [sq], pool: [agent("fa1", "CM", 5)], date: "2027-07-01", rng: mulberry32(1),
      excludeSquadId: "c1", seasonEndOf: () => "2028-05-31",
    });
    expect(r.signedIds.size).toBe(0);
  });
});
