import { describe, expect, test } from "bun:test";
import { freeAgentTick, MIN_BY_ROLE, refillSquad, roleOf, trimSquadToCap } from "@/Domain/contracts/freeAgents";
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

  test("never signs a free agent about to retire (35+)", () => {
    const sq = squad(full().filter((p) => roleOf(p) !== "Forward").concat([player("f0", "ST", 5)]));
    const pool = Array.from({ length: 6 }, (_, i) => ({ ...agent(`fa${i}`, "ST", 5), player: { ...agent(`fa${i}`, "ST", 5).player, age: 35 + i } }));
    const rng = mulberry32(7);
    for (let d = 0; d < 20; d++) {
      const r = freeAgentTick({ squads: [sq], pool, date: "2027-07-01", rng, seasonEndOf: () => "2028-05-31" });
      expect(r.signedIds.size).toBe(0);
    }
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

describe("pool helpers and off-season dates", () => {
  test("pruneFreeAgents drops entries older than a year", async () => {
    const { pruneFreeAgents } = await import("@/Domain/contracts/freeAgents");
    const pool = [
      { ...agent("a", "ST", 5), since: "2026-01-01" },
      { ...agent("b", "ST", 5), since: "2027-04-01" },
    ];
    expect(pruneFreeAgents(pool, "2027-06-01").map((f) => f.player.id)).toEqual(["b"]);
  });
  test("toFreeAgent clears injury, contract and club", async () => {
    const { toFreeAgent } = await import("@/Domain/contracts/freeAgents");
    const hurt = { ...player("h", "CB", 5), injury: { severity: "light", returnDate: "2027-07-01" } } as RosterPlayer;
    const fa = toFreeAgent(hurt, "2027-06-01");
    expect(fa.player.injury).toBeUndefined();
    expect(fa.player.contract).toBeUndefined();
    expect(fa.player.squadId).toBe("");
  });
  test("freeAgentTick off-season signing ends next season, not the past one", () => {
    const s = squad(full().slice(0, 18));
    const pool = [agent("x", "CB", 6), agent("y", "CM", 6), agent("z", "ST", 6), agent("w", "GK", 6)];
    const r = freeAgentTick({ squads: [s], pool, date: "2027-06-20", rng: mulberry32(1), seasonEndOf: () => "2027-05-31" });
    for (const sq of r.squads) for (const p of sq.players) {
      if (r.signedIds.has(p.id)) expect(p.contract!.until > "2027-06-20").toBe(true);
    }
    expect(r.signedIds.size).toBeGreaterThan(0);
  });
});

describe("trimSquadToCap", () => {
  test("releases the lowest rated, keeps role minimums and loaned-in players", () => {
    // 21 at the minimums (GKs the weakest of all) + 12 strong midfielders + a weak loanee = 34.
    const players = [
      ...full().map((p) => (roleOf(p) === "GK" ? player(p.id, "GK", 1) : p)),
      ...Array.from({ length: 12 }, (_, i) => player(`x${i}`, "CM", 6 + (i % 3))),
      { ...player("loanee", "CM", 1), loan: { fromClubId: "c9", fromClubName: "Other", until: "2028-05-31", wageShare: 50 } },
    ];
    const r = trimSquadToCap(squad(players), 30);
    expect(r.squad.players.length).toBe(30);
    expect(r.released.length).toBe(4);
    expect(r.squad.players.some((p) => p.id === "loanee")).toBe(true);
    for (const [role, min] of Object.entries(MIN_BY_ROLE)) {
      expect(r.squad.players.filter((p) => roleOf(p) === role).length).toBeGreaterThanOrEqual(min);
    }
    // Only the midfield is above its minimum: its four weakest (level 5) go, never the weaker GKs.
    expect(r.released.every((p) => p.id.startsWith("m") && p.stats.passing === 5)).toBe(true);
  });

  test("a squad within the cap is untouched", () => {
    const sq = squad(full());
    expect(trimSquadToCap(sq).squad).toBe(sq);
  });
});
