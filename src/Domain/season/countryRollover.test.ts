import { describe, expect, spyOn, test } from "bun:test";
import {
  findDueRollovers,
  planCountryRollover,
  pyramidByLeague,
  tierOfLeague,
  type RolloverLeagueState,
} from "@/Domain/season/countryRollover";
import pyramidsJson from "@/example_data/pyramids.json";
import type { Pyramids } from "@/types/pyramidTypes";
import type { StandingRow } from "@/types/playerTypes";

const pyramids = pyramidsJson as Pyramids;

const table = (prefix: string, n: number, mp = 38): StandingRow[] =>
  Array.from({ length: n }, (_, i) => ({
    squadId: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`, colors: ["#000", "#fff"],
    mp, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 100 - i, form: [],
  }) as StandingRow);

const st = (leagueSlug: string, end: string, year = 2025): RolloverLeagueState => ({ leagueSlug, year, end });

const ENGLAND = [st("premier_league", "2026-05-17"), st("of_championship", "2026-05-17")];
const BRAZIL = [st("brazil_serie_a", "2025-12-07"), st("brazil_serie_b", "2025-11-30"), st("brazil_serie_c", "2025-11-23")];
const ITALY = [
  st("serie_a", "2026-05-18"), st("of_italian_serie_b", "2026-05-17"),
  st("of_italian_serie_c_a", "2026-05-17"), st("of_italian_serie_c_b", "2026-05-17"), st("of_italian_serie_c_c", "2026-05-17"),
];
const SOLO = st("of_egyptian_premier_league", "2026-05-17");

describe("pyramid helpers", () => {
  test("pyramidByLeague / tierOfLeague", () => {
    const by = pyramidByLeague(pyramids);
    expect(by.get("of_italian_serie_c_b")!.country).toBe("Italy");
    expect(by.get("of_egyptian_premier_league")).toBeUndefined();
    expect(tierOfLeague(pyramids.Italy!, "of_italian_serie_c_c")).toBe(3);
    expect(tierOfLeague(pyramids.England!, "premier_league")).toBe(1);
    expect(tierOfLeague(pyramids.England!, "serie_a")).toBeNull();
  });
});

describe("findDueRollovers", () => {
  test("August: nothing due", () => {
    const r = findDueRollovers({ date: "2025-08-20", activeLeagues: [...ENGLAND, ...ITALY, SOLO], pyramids, storedYear: {} });
    expect(r).toEqual({ units: [], resync: [], waiting: [] });
  });

  test("England rolls as one unit the day its leagues end", () => {
    const r = findDueRollovers({ date: "2026-05-17", activeLeagues: ENGLAND, pyramids, storedYear: {} });
    expect(r.units).toHaveLength(1);
    expect(r.units[0]!.country).toBe("England");
    expect(r.units[0]!.leagues).toEqual(["premier_league", "of_championship"]);
    expect(r.units[0]!.partial).toBe(false);
    // Day before the end: not yet.
    expect(findDueRollovers({ date: "2026-05-16", activeLeagues: ENGLAND, pyramids, storedYear: {} }).units).toEqual([]);
  });

  test("Italy: B/C end a day earlier and wait for Serie A, then all five roll together", () => {
    const early = findDueRollovers({ date: "2026-05-17", activeLeagues: ITALY, pyramids, storedYear: {} });
    expect(early.units).toEqual([]);
    expect(early.waiting.sort()).toEqual(["of_italian_serie_b", "of_italian_serie_c_a", "of_italian_serie_c_b", "of_italian_serie_c_c"]);
    const day = findDueRollovers({ date: "2026-05-18", activeLeagues: ITALY, pyramids, storedYear: {} });
    expect(day.units).toHaveLength(1);
    expect(day.units[0]!.leagues).toHaveLength(5);
    expect(day.waiting).toEqual([]);
  });

  test("Brazil: C and B wait for weeks; nothing rolls alone", () => {
    for (const date of ["2025-11-23", "2025-11-30", "2025-12-06"]) {
      const r = findDueRollovers({ date, activeLeagues: BRAZIL, pyramids, storedYear: {} });
      expect(r.units).toEqual([]);
    }
    expect(findDueRollovers({ date: "2025-12-01", activeLeagues: BRAZIL, pyramids, storedYear: {} }).waiting.sort())
      .toEqual(["brazil_serie_b", "brazil_serie_c"]);
    const r = findDueRollovers({ date: "2025-12-07", activeLeagues: BRAZIL, pyramids, storedYear: {} });
    expect(r.units.map((u) => u.leagues)).toEqual([["brazil_serie_a", "brazil_serie_b", "brazil_serie_c"]]);
  });

  test("single-level league rolls alone; other countries unaffected", () => {
    const r = findDueRollovers({ date: "2026-05-17", activeLeagues: [...ENGLAND, SOLO, ...ITALY], pyramids, storedYear: {} });
    expect(r.units.map((u) => [u.country, u.leagues])).toEqual([
      ["England", ["premier_league", "of_championship"]],
      [null, ["of_egyptian_premier_league"]],
    ]);
    expect(r.waiting).toHaveLength(4);
  });

  test("idempotent: once rolled (state carries next season) nothing is due again", () => {
    const rolled = ENGLAND.map((l) => ({ ...l, year: 2026, end: "2027-05-17" }));
    expect(findDueRollovers({ date: "2026-05-17", activeLeagues: rolled, pyramids, storedYear: {} }).units).toEqual([]);
  });

  test("rolled on disk but meta not persisted → resync, never rolled twice", () => {
    const r = findDueRollovers({
      date: "2026-05-17", activeLeagues: ENGLAND, pyramids,
      storedYear: { premier_league: 2026, of_championship: 2026 },
    });
    expect(r.units).toEqual([]);
    expect(r.resync).toEqual(["premier_league", "of_championship"]);
  });

  test("partially rolled country: the rest rolls without moves", () => {
    const r = findDueRollovers({ date: "2026-05-17", activeLeagues: ENGLAND, pyramids, storedYear: { premier_league: 2026 } });
    expect(r.resync).toEqual(["premier_league"]);
    expect(r.units).toEqual([{ country: "England", pyramid: pyramids.England!, leagues: ["of_championship"], partial: true }]);
    expect(planCountryRollover(r.units[0]!, { of_championship: table("ch", 19) }, undefined).moves).toEqual([]);
  });

  test("a pyramid league missing from activeLeagues does not block its country", () => {
    const r = findDueRollovers({ date: "2025-12-07", activeLeagues: BRAZIL.slice(0, 2), pyramids, storedYear: {} });
    expect(r.units[0]!.leagues).toEqual(["brazil_serie_a", "brazil_serie_b"]);
  });
});

describe("planCountryRollover", () => {
  const englandUnit = () => findDueRollovers({ date: "2026-05-17", activeLeagues: ENGLAND, pyramids, storedYear: {} }).units[0]!;

  test("England 3/3: moves, tiers and next membership sizes", () => {
    const plan = planCountryRollover(englandUnit(), { premier_league: table("pl", 20), of_championship: table("ch", 19) }, "pl5");
    expect(plan.moves.filter((m) => m.kind === "relegated").map((m) => m.squadId)).toEqual(["pl18", "pl19", "pl20"]);
    expect(plan.moves.filter((m) => m.kind === "promoted").map((m) => m.squadId)).toEqual(["ch1", "ch2", "ch3"]);
    expect(plan.tierChanges.pl20).toEqual({ from: 1, to: 2 });
    expect(plan.tierChanges.ch1).toEqual({ from: 2, to: 1 });
    expect(plan.nextMembership.premier_league).toHaveLength(20);
    expect(plan.nextMembership.of_championship).toHaveLength(19);
    expect(plan.nextMembership.premier_league).toContain("ch1");
    expect(plan.nextMembership.premier_league).not.toContain("pl20");
    expect(plan.playerMove).toBeNull();
    expect(plan.playerChampionOf).toBeNull();
  });

  test("player promoted as champion of the Championship", () => {
    const plan = planCountryRollover(englandUnit(), { premier_league: table("pl", 20), of_championship: table("ch", 19) }, "ch1");
    expect(plan.playerMove).toEqual({ squadId: "ch1", from: "of_championship", to: "premier_league", kind: "promoted" });
    expect(plan.playerChampionOf).toBe("of_championship");
  });

  test("player relegated", () => {
    const plan = planCountryRollover(englandUnit(), { premier_league: table("pl", 20), of_championship: table("ch", 19) }, "pl19");
    expect(plan.playerMove).toEqual({ squadId: "pl19", from: "premier_league", to: "of_championship", kind: "relegated" });
    expect(plan.playerChampionOf).toBeNull();
  });

  test("champion needs games played", () => {
    const plan = planCountryRollover(englandUnit(), { premier_league: table("pl", 20, 0), of_championship: table("ch", 19) }, "pl1");
    expect(plan.playerChampionOf).toBeNull();
  });

  test("Brazil 4/4: A and B swap 4, B and C swap 4, sizes stay 20", () => {
    const unit = findDueRollovers({ date: "2025-12-07", activeLeagues: BRAZIL, pyramids, storedYear: {} }).units[0]!;
    const plan = planCountryRollover(unit, {
      brazil_serie_a: table("a", 20), brazil_serie_b: table("b", 20), brazil_serie_c: table("c", 20),
    }, "b2");
    expect(plan.moves).toHaveLength(16);
    expect(plan.moves.filter((m) => m.from === "brazil_serie_a").map((m) => m.squadId)).toEqual(["a17", "a18", "a19", "a20"]);
    expect(plan.moves.filter((m) => m.from === "brazil_serie_c").map((m) => m.squadId)).toEqual(["c1", "c2", "c3", "c4"]);
    for (const slug of unit.leagues) expect(plan.nextMembership[slug]).toHaveLength(20);
    expect(plan.playerMove!.to).toBe("brazil_serie_a");
    expect(plan.tierChanges.c1).toEqual({ from: 3, to: 2 });
    expect(new Set(plan.moves.map((m) => m.squadId)).size).toBe(16);
  });

  test("Italy groups: B's relegated clubs spread over the three C groups; group sizes kept", () => {
    const unit = findDueRollovers({ date: "2026-05-18", activeLeagues: ITALY, pyramids, storedYear: {} }).units[0]!;
    const sizes: Record<string, number> = {
      serie_a: 20, of_italian_serie_b: 20, of_italian_serie_c_a: 19, of_italian_serie_c_b: 18, of_italian_serie_c_c: 19,
    };
    const standings = Object.fromEntries(Object.entries(sizes).map(([s, n]) => [s, table(`${s}_`, n)]));
    const plan = planCountryRollover(unit, standings, "of_italian_serie_c_b_1");
    const down = plan.moves.filter((m) => m.from === "of_italian_serie_b" && m.kind === "relegated");
    expect(down.map((m) => m.to).sort()).toEqual(["of_italian_serie_c_a", "of_italian_serie_c_b", "of_italian_serie_c_c"]);
    for (const [slug, n] of Object.entries(sizes)) expect(plan.nextMembership[slug]).toHaveLength(n);
    expect(plan.playerMove).toEqual({ squadId: "of_italian_serie_c_b_1", from: "of_italian_serie_c_b", to: "of_italian_serie_b", kind: "promoted" });
    expect(plan.playerChampionOf).toBe("of_italian_serie_c_b");
  });

  test("single-level unit: no moves, champion still detected, membership unchanged", () => {
    const unit = findDueRollovers({ date: "2026-05-17", activeLeagues: [SOLO], pyramids, storedYear: {} }).units[0]!;
    const plan = planCountryRollover(unit, { of_egyptian_premier_league: table("e", 18) }, "e1");
    expect(plan.moves).toEqual([]);
    expect(plan.playerMove).toBeNull();
    expect(plan.playerChampionOf).toBe("of_egyptian_premier_league");
    expect(plan.nextMembership.of_egyptian_premier_league).toHaveLength(18);
  });

  test("a league with no standings neither sends nor receives", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const plan = planCountryRollover(englandUnit(), { premier_league: table("pl", 20) }, undefined);
    expect(plan.moves).toEqual([]);
    warn.mockRestore();
  });
});
