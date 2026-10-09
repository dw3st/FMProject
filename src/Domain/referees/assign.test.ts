import { describe, expect, test } from "bun:test";
import { assignDay, matchImportance, type AssignInput, type DayMatch } from "@/Domain/referees/assign";
import type { Referee } from "@/types/refereeTypes";

const ref = (id: string, country: string, quality: number, o: Partial<Referee> = {}): Referee => ({
  id, name: id, country, birthDate: "1985-01-01", role: "referee", gender: "male", quality, strictness: 0, fifa: false, since: "2026-01-01", ...o,
});
const assistants = (country: string, n: number) =>
  Array.from({ length: n }, (_, i) => ref(`a_${country}_${i}`, country, 50 + i, { role: "assistant" }));
const englandRefs = Array.from({ length: 12 }, (_, i) => ref(`e${i}`, "England", 90 - i * 5));
const pool = [...englandRefs, ...assistants("England", 24)];
const league = (i: number, importance: number, home = `h${i}`, away = `a${i}`): DayMatch =>
  ({ key: `premier_league:fix_${i}`, competition: "premier_league", home, away, importance, country: "England" });
const base = (o: Partial<AssignInput> = {}): AssignInput => ({
  saveId: "s", date: "2027-01-10", matches: [], referees: pool, state: { lastWorked: {}, recentByClub: {} },
  continentOf: (c) => (c === "Brazil" || c === "Argentina" ? "South America" : "Europe"), ...o,
});
const quality = (id: string) => [...pool, ...extra].find((r) => r.id === id)!.quality;
const extra: Referee[] = [];

describe("matchImportance", () => {
  test("top flight > second tier; derby and table bonuses; continental above all", () => {
    const top = matchImportance({ kind: "league", tier: 1, bothTopHalf: false, derby: false, lateSeason: false });
    expect(matchImportance({ kind: "league", tier: 2, bothTopHalf: false, derby: false, lateSeason: false })).toBe(top - 25);
    expect(matchImportance({ kind: "league", tier: 1, bothTopHalf: true, derby: true, lateSeason: true })).toBe(top + 35);
    expect(matchImportance({ kind: "continental", stageIndex: 0 })).toBeGreaterThan(top + 15);
    expect(matchImportance({ kind: "cup", stageIndex: 6, stageCount: 7, topTier: 1 })).toBeGreaterThan(matchImportance({ kind: "cup", stageIndex: 0, stageCount: 7, topTier: 1 }));
  });
});

describe("assignDay", () => {
  test("best referees to the most important matches; nobody twice", () => {
    const matches = [league(1, 100), league(2, 140), league(3, 80), league(4, 110), league(5, 75), league(6, 90)];
    const a = assignDay(base({ matches }));
    expect(Object.keys(a)).toHaveLength(6);
    expect(quality(a["premier_league:fix_2"]!.refereeId)).toBeGreaterThanOrEqual(80);
    expect(quality(a["premier_league:fix_2"]!.refereeId)).toBeGreaterThan(quality(a["premier_league:fix_5"]!.refereeId));
    const ids = Object.values(a).flatMap((x) => [x.refereeId, ...x.assistantIds]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of Object.values(a)) for (const id of x.assistantIds) expect(id.startsWith("a_England")).toBe(true);
  });
  test("rest: whoever worked two days ago is out", () => {
    const lastWorked = Object.fromEntries(englandRefs.slice(0, 11).map((r) => [r.id, "2027-01-08"]));
    const a = assignDay(base({ matches: [league(1, 100)], state: { lastWorked, recentByClub: {} } }));
    expect(a["premier_league:fix_1"]!.refereeId).toBe("e11");
  });
  test("rotation: not a referee in recentByClub of either club; relaxed when nobody is left", () => {
    const recentByClub = { h1: englandRefs.slice(0, 6).map((r) => r.id), a1: englandRefs.slice(6, 11).map((r) => r.id) };
    const a = assignDay(base({ matches: [league(1, 100)], state: { lastWorked: {}, recentByClub } }));
    expect(a["premier_league:fix_1"]!.refereeId).toBe("e11");
    const all = { h1: englandRefs.map((r) => r.id) };
    const b = assignDay(base({ matches: [league(1, 100)], state: { lastWorked: {}, recentByClub: all } }));
    expect(b["premier_league:fix_1"]).toBeDefined();
  });
  test("rest relaxed last, never twice the same day", () => {
    const lastWorked = Object.fromEntries(englandRefs.map((r) => [r.id, "2027-01-09"]));
    const matches = Array.from({ length: 12 }, (_, i) => league(i, 100 - i));
    const a = assignDay(base({ matches, state: { lastWorked, recentByClub: {} } }));
    expect(Object.keys(a)).toHaveLength(12);
    expect(new Set(Object.values(a).map((x) => x.refereeId)).size).toBe(12);
  });
  test("continental: another country of the continent, fifa or quality ≥ 75, assistants of his country", () => {
    const spain = [ref("s0", "Spain", 60), ref("s1", "Spain", 70, { fifa: true }), ...assistants("Spain", 4)];
    const brazil = [ref("b0", "Brazil", 99, { fifa: true }), ...assistants("Brazil", 4)];
    extra.push(...spain, ...brazil);
    const ucl: DayMatch = { key: "ucl:u1", competition: "ucl", home: "33", away: "541", importance: 120, country: null, continent: "Europe", clubCountries: ["England", "Italy"] };
    const a = assignDay(base({ matches: [ucl, league(1, 100)], referees: [...pool, ...spain, ...brazil] }));
    expect(a["ucl:u1"]!.refereeId).toBe("s1");
    for (const id of a["ucl:u1"]!.assistantIds) expect(id.startsWith("a_Spain")).toBe(true);
  });
  test("youth matches are never passed in; a match without referees in its country gets none", () => {
    const a = assignDay(base({ matches: [{ ...league(1, 100), country: "Fiji" }] }));
    expect(a).toEqual({});
  });
  test("deterministic; empty pool → nothing", () => {
    const matches = [league(1, 100), league(2, 90), league(3, 80)];
    expect(assignDay(base({ matches }))).toEqual(assignDay(base({ matches })));
    expect(assignDay(base({ matches, referees: [] }))).toEqual({});
  });
});
