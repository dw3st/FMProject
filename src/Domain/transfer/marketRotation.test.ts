import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import {
  dailyMarketTick,
  initMarketState,
  TEAMS_PER_DAY_NEEDS,
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
