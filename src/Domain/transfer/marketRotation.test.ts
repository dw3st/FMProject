import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import {
  dailyMarketTick,
  initMarketState,
  TEAMS_PER_DAY_NEEDS,
  type DailyMarketTickOptions,
} from "@/Domain/transfer/marketRotation";

function basePlayer(overrides: Partial<RosterPlayer> & Pick<RosterPlayer, "id" | "name">): RosterPlayer {
  return {
    age: 25,
    squadId: "s1",
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 10,
      vision: 10,
      finishing: 10,
      dribbling: 10,
      speed: 10,
      acceleration: 10,
      tackling: 10,
      pressing: 10,
      stamina: 10,
      heading: 10,
      strength: 10,
      reflex: 10,
      jump: 10,
    },
    profile: { summary: "", archetype: "test" },
    ...overrides,
  };
}

function makeSquad(id: string, players: RosterPlayer[], finances?: Squad["finances"]): Squad {
  return {
    id,
    name: `Club ${id}`,
    colors: ["#fff", "#000"],
    money: 0,
    players,
    leagueSlug: "test_league",
    slug: id,
    finances,
  };
}

/** Flat stats so overall rating ~10 across the board. */
function flatStats(v: number): RosterPlayer["stats"] {
  return {
    passing: v,
    vision: v,
    finishing: v,
    dribbling: v,
    speed: v,
    acceleration: v,
    tackling: v,
    pressing: v,
    stamina: v,
    heading: v,
    strength: v,
    reflex: v,
    jump: v,
  };
}

describe("initMarketState", () => {
  test("contains all squad ids and rotationIndex 0", () => {
    const squads = [
      makeSquad("a", [basePlayer({ id: "p1", name: "P1" })]),
      makeSquad("b", [basePlayer({ id: "p2", name: "P2" })]),
      makeSquad("c", [basePlayer({ id: "p3", name: "P3" })]),
    ];
    const m = initMarketState(squads, () => 0.5);
    expect(m.rotationIndex).toBe(0);
    expect(new Set(m.shuffledTeamIds).size).toBe(3);
    expect(new Set(m.shuffledTeamIds)).toEqual(new Set(["a", "b", "c"]));
    expect(Object.keys(m.profiles).length).toBe(0);
  });
});

describe("dailyMarketTick", () => {
  test("rotation index advances by TEAMS_PER_DAY_NEEDS", () => {
    const squads = Array.from({ length: 25 }, (_, i) =>
      makeSquad(`t${i}`, [basePlayer({ id: `p${i}`, name: `P${i}` })]),
    );
    const market = {
      shuffledTeamIds: squads.map((s) => s.id),
      rotationIndex: 0,
      profiles: {},
      playerSellList: [],
    };
    const { updatedMarket } = dailyMarketTick(market, squads, "2025-01-01", () => 0.5);
    expect(updatedMarket.rotationIndex).toBe(TEAMS_PER_DAY_NEEDS);
    expect(Object.keys(updatedMarket.profiles).length).toBeGreaterThanOrEqual(TEAMS_PER_DAY_NEEDS);
  });

  test("reshuffles and resets index when rotation would exceed list", () => {
    const squads = Array.from({ length: 5 }, (_, i) =>
      makeSquad(`t${i}`, [basePlayer({ id: `p${i}`, name: `P${i}` })]),
    );
    const market = {
      shuffledTeamIds: squads.map((s) => s.id),
      rotationIndex: 4,
      profiles: {},
      playerSellList: [],
    };
    const { updatedMarket } = dailyMarketTick(market, squads, "2025-01-01", () => 0.5);
    expect(updatedMarket.rotationIndex).toBeLessThan(squads.length);
    expect(updatedMarket.shuffledTeamIds.length).toBe(5);
  });

  test("deterministic rng yields identical output for same inputs", () => {
    const squads = Array.from({ length: 12 }, (_, i) =>
      makeSquad(`t${i}`, [basePlayer({ id: `p${i}`, name: `P${i}` })]),
    );
    const market = initMarketState(squads, () => 0.42);
    const rng = () => 0.42;
    const a = dailyMarketTick(market, squads, "2025-01-01", rng);
    const b = dailyMarketTick(market, squads, "2025-01-01", rng);
    expect(JSON.stringify(a.updatedMarket)).toBe(JSON.stringify(b.updatedMarket));
  });

  test("excludes player squad from needs profiles and AI attempts", () => {
    const squads = [
      makeSquad("human", [basePlayer({ id: "p0", name: "H" })]),
      makeSquad("ai", [basePlayer({ id: "p1", name: "A" })]),
    ];
    const rng = () => 0;
    const market = initMarketState(squads, rng);
    const { updatedMarket } = dailyMarketTick(market, squads, "2025-01-01", rng, {
      excludePlayerSquadId: "human",
    });
    expect(updatedMarket.profiles["human"]).toBeUndefined();
    expect(updatedMarket.profiles["ai"]).toBeDefined();
  });
});

describe("dailyMarketTick — marketFrozen / excludePlayerSquadId", () => {
  async function loadLeague(slug: string): Promise<Squad[]> {
    const out: Squad[] = [];
    for await (const f of new Bun.Glob(`src/example_data/squads/${slug}/*.json`).scan(".")) {
      out.push({ ...(await Bun.file(f).json()), leagueSlug: slug } as Squad);
    }
    return out;
  }

  /** Runs `days` market ticks and returns every completed transfer as [sellerId, buyerId]. */
  function runTicks(
    squads: Squad[],
    days: number,
    opts?: DailyMarketTickOptions,
  ): Array<[string, string]> {
    const rng = mulberry32(2026);
    let market = initMarketState(squads, rng);
    let world = squads;
    const moves: Array<[string, string]> = [];
    for (let d = 0; d < days; d++) {
      const { updatedMarket, completedTransfers } = dailyMarketTick(market, world, "2024-09-01", rng, opts);
      market = updatedMarket;
      const byId = new Map(world.map((s) => [s.id, s] as const));
      for (const tx of completedTransfers) {
        moves.push([tx.sellerSquad.id, tx.buyerSquad.id]);
        byId.set(tx.updatedSeller.id, tx.updatedSeller);
        byId.set(tx.updatedBuyer.id, tx.updatedBuyer);
      }
      world = [...byId.values()];
    }
    return moves;
  }

  test("marketFrozen: true stops every club from trading, and leaves the market untouched", async () => {
    const england = await loadLeague("premier_league");
    const brazil = await loadLeague("brazil_serie_a");
    const squads = [...england, ...brazil];

    // Sanity: this pool trades freely without the flag (otherwise the assertion below is vacuous).
    const free = runTicks(squads, 30);
    expect(free.length).toBeGreaterThan(0);

    const rng = mulberry32(2026);
    const market = initMarketState(squads, rng);
    const result = dailyMarketTick(market, squads, "2024-09-01", rng, { marketFrozen: true });

    expect(result.completedTransfers).toEqual([]);
    expect(result.updatedMarket).toBe(market);

    const frozenMoves = runTicks(squads, 30, { marketFrozen: true });
    expect(frozenMoves).toEqual([]);
  });

  test("human club never appears as a seller unless it lists a player (live-path exclusion)", async () => {
    const england = await loadLeague("premier_league");
    const humanId = england[0]!.id;

    const moves = runTicks(england, 90, { excludePlayerSquadId: humanId });
    expect(moves.some(([s, b]) => s === humanId || b === humanId)).toBe(false);
  });
});
