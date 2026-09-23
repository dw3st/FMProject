import { describe, expect, test } from "bun:test";
import {
  collectNationalities, collectSellListedIds, filterScoutPlayers, mapSquadsToScoutPlayers, paginate,
  runScoutQuery, sortScoutPlayers,
} from "@/Domain/scout/scoutQuery";
import { createDefaultScoutFilters, type ScoutFilterState } from "@/GameInterface/Scout/scoutFilterState";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import { ATTRIBUTE_LIST } from "@/GameInterface/AttributeLabels";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { PlayerStatsRecord, Squad } from "@/types/playerTypes";
import type { MarketState } from "@/types/transferMarketTypes";

const STATS = (v = 5): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});

const P = (over: Partial<DisplayPlayer> & { id: string }): DisplayPlayer => ({
  pos: "CM", positions: [over.pos ?? "CM"], name: `Player ${over.id}`, age: 25, avg: 6, energy: 100,
  salary: "£10K", value: "£5M", goals: 0, assists: 0, avgRating: 0, phase: 3, training: 3, moral: 3,
  status: "fit", club: "Club", stats: STATS(), preferredFoot: "right", valueMillions: 5,
  nationality: "Brazil", leagueSlug: "premier_league", clubSlug: "club", ...over,
});

const F = (over: Partial<ScoutFilterState> = {}): ScoutFilterState => ({ ...createDefaultScoutFilters(), ...over });
const ids = (rows: DisplayPlayer[]) => rows.map((r) => r.id);

describe("filterScoutPlayers — each filter in isolation", () => {
  const none = new Set<string>();

  test("defaults keep everyone", () => {
    const list = [P({ id: "a" }), P({ id: "b" })];
    expect(ids(filterScoutPlayers(list, F(), none))).toEqual(["a", "b"]);
  });

  test("name is a case-insensitive substring match", () => {
    const list = [P({ id: "a", name: "Lionel Messi" }), P({ id: "b", name: "Cristiano Ronaldo" })];
    expect(ids(filterScoutPlayers(list, F({ name: "MESS" }), none))).toEqual(["a"]);
    expect(ids(filterScoutPlayers(list, F({ name: "ronaldo" }), none))).toEqual(["b"]);
  });

  test("position matches the main role of the primary position", () => {
    const list = [P({ id: "gk", pos: "GK" }), P({ id: "cb", pos: "CB" }), P({ id: "st", pos: "ST" })];
    expect(ids(filterScoutPlayers(list, F({ position: "Defender" }), none))).toEqual(["cb"]);
    expect(ids(filterScoutPlayers(list, F({ position: "GK" }), none))).toEqual(["gk"]);
  });

  test("age range is inclusive", () => {
    const list = [P({ id: "a", age: 17 }), P({ id: "b", age: 20 }), P({ id: "c", age: 30 })];
    expect(ids(filterScoutPlayers(list, F({ minAge: 20, maxAge: 30 }), none))).toEqual(["b", "c"]);
  });

  test("avg range is inclusive", () => {
    const list = [P({ id: "a", avg: 4.9 }), P({ id: "b", avg: 5 }), P({ id: "c", avg: 7.1 })];
    expect(ids(filterScoutPlayers(list, F({ minAvg: 5, maxAvg: 7 }), none))).toEqual(["b"]);
  });

  test("price range uses valueMillions", () => {
    const list = [P({ id: "a", valueMillions: 1 }), P({ id: "b", valueMillions: 30 }), P({ id: "c", valueMillions: 90 })];
    expect(ids(filterScoutPlayers(list, F({ minPriceM: 10, maxPriceM: 50 }), none))).toEqual(["b"]);
  });

  test("league matches leagueSlug", () => {
    const list = [P({ id: "a", leagueSlug: "of_eredivisie" }), P({ id: "b", leagueSlug: "la_liga" }), P({ id: "c", leagueSlug: undefined })];
    expect(ids(filterScoutPlayers(list, F({ league: "of_eredivisie" }), none))).toEqual(["a"]);
  });

  test("nationality is an exact match", () => {
    const list = [P({ id: "a", nationality: "Brazil" }), P({ id: "b", nationality: "Argentina" })];
    expect(ids(filterScoutPlayers(list, F({ nationality: "Argentina" }), none))).toEqual(["b"]);
  });

  test("attribute range excludes players outside it; full 0–10 span is ignored", () => {
    const list = [
      P({ id: "a", stats: { ...STATS(), speed: 9 } }),
      P({ id: "b", stats: { ...STATS(), speed: 3 } }),
    ];
    const ranges = { ...createDefaultScoutFilters().attributeRanges, speed: { min: 8, max: 10 } };
    expect(ids(filterScoutPlayers(list, F({ attributeRanges: ranges }), none))).toEqual(["a"]);
  });

  test("onlyForSale keeps only sell-listed ids", () => {
    const list = [P({ id: "a" }), P({ id: "b" }), P({ id: "c" })];
    expect(ids(filterScoutPlayers(list, F({ onlyForSale: true }), new Set(["c", "a"])))).toEqual(["a", "c"]);
    expect(ids(filterScoutPlayers(list, F({ onlyForSale: false }), new Set(["c"])))).toEqual(["a", "b", "c"]);
  });
});

describe("sortScoutPlayers", () => {
  const list = [P({ id: "a", name: "Bruno", age: 30 }), P({ id: "b", name: "Alex", age: 19 }), P({ id: "c", name: "Carlos", age: 24 })];

  test("strings both directions", () => {
    expect(ids(sortScoutPlayers(list, "name", "asc"))).toEqual(["b", "a", "c"]);
    expect(ids(sortScoutPlayers(list, "name", "desc"))).toEqual(["c", "a", "b"]);
  });

  test("numbers both directions", () => {
    expect(ids(sortScoutPlayers(list, "age", "asc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortScoutPlayers(list, "age", "desc"))).toEqual(["a", "c", "b"]);
  });

  test("unknown / non-sortable key keeps input order and does not mutate", () => {
    expect(ids(sortScoutPlayers(list, "phaseXYZ", "asc"))).toEqual(["a", "b", "c"]);
    sortScoutPlayers(list, "age", "asc");
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);

  test("slices the requested page", () => {
    const p = paginate(rows, 1, 100);
    expect(p).toMatchObject({ total: 250, page: 1, pageSize: 100 });
    expect(p.rows[0]).toBe(100);
    expect(p.rows.length).toBe(100);
    expect(paginate(rows, 2, 100).rows.length).toBe(50);
  });

  test("pageSize is clamped to [10, 200]", () => {
    expect(paginate(rows, 0, 1).pageSize).toBe(10);
    expect(paginate(rows, 0, 5000).pageSize).toBe(200);
    expect(paginate(rows, 0, 5000).rows.length).toBe(200);
  });

  test("page past the end falls back to the last valid page; negative → 0", () => {
    const p = paginate(rows, 99, 100);
    expect(p.page).toBe(2);
    expect(p.rows[0]).toBe(200);
    expect(paginate(rows, -3, 100).page).toBe(0);
  });

  test("empty list → page 0, no rows", () => {
    expect(paginate([], 0, 100)).toEqual({ rows: [], total: 0, page: 0, pageSize: 100 });
    expect(paginate([], 7, 100)).toEqual({ rows: [], total: 0, page: 0, pageSize: 100 });
  });
});

describe("helpers", () => {
  test("collectSellListedIds merges AI profiles and the human list", () => {
    const market = {
      shuffledTeamIds: [], rotationIndex: 0,
      profiles: {
        s1: { squadId: "s1", needs: [], sellList: [{ playerId: "p1", priority: 0.5 }], lastUpdateDay: "" },
        s2: { squadId: "s2", needs: [], sellList: [{ playerId: "p2", priority: 0.2 }], lastUpdateDay: "" },
      },
      playerSellList: [{ playerId: "p9", priority: 1 }],
    } as unknown as MarketState;
    expect(collectSellListedIds(market).sort()).toEqual(["p1", "p2", "p9"]);
    expect(collectSellListedIds(null)).toEqual([]);
  });

  test("collectNationalities is distinct, sorted, skips empty", () => {
    expect(collectNationalities([P({ id: "a", nationality: "Spain" }), P({ id: "b", nationality: "" }), P({ id: "c", nationality: "Brazil" }), P({ id: "d", nationality: "Spain" })]))
      .toEqual(["Brazil", "Spain"]);
  });

  test("mapSquadsToScoutPlayers resolves league/club slugs from the squad id", () => {
    const squad = {
      id: "premier_league_arsenal", name: "Arsenal", country: "England",
      players: [{
        id: "x1", name: "Saka", age: 22, positions: ["RW"], stats: STATS(7),
        profile: { summary: "", archetype: "" },
      }],
    } as unknown as Squad;
    const [row] = mapSquadsToScoutPlayers([squad], ["premier_league", "premier"]);
    expect(row).toMatchObject({ id: "x1", club: "Arsenal", leagueSlug: "premier_league", clubSlug: "arsenal" });
  });

  test("runScoutQuery filters, sorts and paginates", () => {
    const list = Array.from({ length: 30 }, (_, i) => P({ id: `p${i}`, age: 18 + (i % 10), pos: i % 2 ? "ST" : "CB" }));
    const page = runScoutQuery(list, { filters: F({ position: "Forward" }), sortKey: "age", sortDir: "desc", page: 0, pageSize: 10 }, new Set());
    expect(page.total).toBe(15);
    expect(page.rows.length).toBe(10);
    expect(page.rows.every((r) => r.pos === "ST")).toBe(true);
    expect(page.rows[0]!.age).toBe(27);
  });
});

// ── Parity with the pre-refactor client code (ScoutTable.tsx useMemo filter + sort) ──────────

function legacyFilter(players: DisplayPlayer[], filters: ScoutFilterState, sellListedIds: Set<string>): DisplayPlayer[] {
  return players.filter((player) => {
    if (filters.onlyForSale && !sellListedIds.has(player.id)) return false;
    if (filters.name && !player.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.position !== "all" && getMainRole(player.pos) !== filters.position) return false;
    if (player.age < filters.minAge || player.age > filters.maxAge) return false;
    if (player.avg < filters.minAvg || player.avg > filters.maxAvg) return false;
    if (player.valueMillions < filters.minPriceM || player.valueMillions > filters.maxPriceM)
      return false;
    if (filters.league !== "all" && player.leagueSlug !== filters.league) return false;
    if (filters.nationality !== "all" && player.nationality !== filters.nationality) return false;
    for (const attr of ATTRIBUTE_LIST) {
      const range = filters.attributeRanges[attr.id];
      if (!range) continue;
      if (range.min <= 0 && range.max >= 10) continue;
      const v = player.stats[attr.id];
      if (v < range.min || v > range.max) return false;
    }
    return true;
  });
}

function legacySort(filteredPlayers: DisplayPlayer[], sortKey: string, sortDir: "asc" | "desc"): DisplayPlayer[] {
  return [...filteredPlayers].sort((a, b) => {
    const aVal = a[sortKey as keyof DisplayPlayer];
    const bVal = b[sortKey as keyof DisplayPlayer];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("parity with the legacy client filter/sort", () => {
  const rnd = mulberry32(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]!;
  const POS = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
  const NATS = ["Brazil", "Argentina", "Spain", "England", "Netherlands"];
  const LEAGUES = ["premier_league", "la_liga", "of_eredivisie", undefined];
  const NAMES = ["Silva", "Santos", "de Jong", "Smith", "García", "Müller", "van Dijk", "Rossi"];
  const players: DisplayPlayer[] = Array.from({ length: 50 }, (_, i) => {
    const s = STATS();
    for (const k of Object.keys(s) as (keyof PlayerStatsRecord)[]) s[k] = Math.round(rnd() * 10);
    return P({
      id: `p${i}`,
      name: `${pick(NAMES)} ${i}`,
      pos: pick(POS),
      age: 16 + Math.floor(rnd() * 22),
      avg: Math.round(rnd() * 100) / 10,
      valueMillions: Math.round(rnd() * 800) / 10,
      nationality: pick(NATS),
      leagueSlug: pick(LEAGUES),
      stats: s,
    });
  });
  const sellListed = new Set(players.filter((_, i) => i % 7 === 0).map((p) => p.id));

  const cases: [string, ScoutFilterState][] = [
    ["defaults", F()],
    ["name", F({ name: "SIL" })],
    ["position", F({ position: "Midfielder" })],
    ["age", F({ minAge: 20, maxAge: 28 })],
    ["avg", F({ minAvg: 3.5, maxAvg: 8 })],
    ["price", F({ minPriceM: 10, maxPriceM: 40 })],
    ["league", F({ league: "of_eredivisie" })],
    ["nationality", F({ nationality: "Spain" })],
    ["attribute", F({ attributeRanges: { ...createDefaultScoutFilters().attributeRanges, speed: { min: 6, max: 10 }, passing: { min: 0, max: 7 } } })],
    ["onlyForSale", F({ onlyForSale: true })],
    ["combined", F({ position: "Forward", minAge: 18, maxAge: 32, league: "la_liga", onlyForSale: false, name: "a" })],
  ];

  for (const [label, filters] of cases) {
    test(`filter: ${label}`, () => {
      expect(ids(filterScoutPlayers(players, filters, sellListed))).toEqual(ids(legacyFilter(players, filters, sellListed)));
    });
  }

  for (const key of ["avg", "age", "name", "club", "valueMillions", "salary", "pos", "phase"]) {
    for (const dir of ["asc", "desc"] as const) {
      test(`sort: ${key} ${dir}`, () => {
        expect(ids(sortScoutPlayers(players, key, dir))).toEqual(ids(legacySort(players, key, dir)));
      });
    }
  }

  test("the fixture actually exercises the filters (non-trivial result sizes)", () => {
    const sizes = cases.map(([, f]) => legacyFilter(players, f, sellListed).length);
    expect(sizes[0]).toBe(50);
    expect(sizes.slice(1).some((n) => n > 0 && n < 50)).toBe(true);
  });
});
