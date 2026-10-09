import { describe, expect, test } from "bun:test";
import {
  buildYouthCompArchive,
  generateYouthComp,
  youthChampion,
  youthCompsToRegenerate,
  youthStandingsBase,
  youthWindow,
} from "@/Domain/youthComps/generateYouthComp";
import { computeStandings } from "@/Domain/season/computeStandings";

const clubs = Array.from({ length: 20 }, (_, i) => `${i + 1}`);
const teams = Object.fromEntries(clubs.map((c) => [c, { name: `Club ${c}`, colors: ["#fff", "#000"] as [string, string] }]));
const input = {
  country: "England",
  age: "u21" as const,
  year: 2026,
  clubs,
  teams,
  window: { start: "2026-08-22", end: "2027-05-09" },
  busyByClub: new Map<string, Set<string>>(),
  seedKey: "save:2026:u21_england",
};

describe("generateYouthComp", () => {
  test("meta, rounds, ids and date index", () => {
    const out = generateYouthComp(input)!;
    expect(out.meta.kind).toBe("youth");
    expect(out.meta.leagueSlug).toBe("u21_england");
    expect(out.meta.youth!.clubs).toEqual(clubs);
    expect(out.meta.youth!.leaders).toEqual({});
    expect(out.meta.youth!.championId).toBeNull();
    expect(out.meta.youth!.singleLeg).toBeUndefined();
    expect(out.meta.totalRounds).toBe(38);
    expect(out.rounds.length).toBe(38);
    const all = out.rounds.flatMap((r) => r.fixtures);
    expect(all.length).toBe(380);
    expect(all.every((f) => f.competition === "u21_england" && !f.played && f.result === null)).toBe(true);
    expect(out.rounds[0]!.fixtures[0]!.id).toBe("u21_england_2026_r1_0");
    expect(new Set(all.map((f) => f.id)).size).toBe(380);
    for (const f of all) expect(out.dateIndex[f.date]).toContain(f.round);
    const dates = all.map((f) => f.date).sort();
    expect(out.meta.start).toBe(dates[0]!);
    expect(out.meta.end).toBe(dates.at(-1)!);
  });
  test("a round can span several dates in the index", () => {
    // Club 1 plays for the first team every weekday of the first week: its game moves to the weekend.
    const busy = new Map<string, Set<string>>([["1", new Set(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"])]]);
    // 39 whole weeks: one round a week, room to move into the weekend.
    const out = generateYouthComp({ ...input, window: { start: "2026-08-10", end: "2027-05-09" }, busyByClub: busy })!;
    const r1 = out.rounds[0]!.fixtures;
    expect(new Set(r1.map((f) => f.date)).size).toBe(2);
    for (const date of new Set(r1.map((f) => f.date))) expect(out.dateIndex[date]).toContain(1);
  });
  test("fewer than 2 clubs or no room → null", () => {
    expect(generateYouthComp({ ...input, clubs: ["1"] })).toBeNull();
    expect(generateYouthComp({ ...input, window: { start: "2027-04-05", end: "2027-05-09" } })).toBeNull();
  });
  test("compressed season flags singleLeg", () => {
    const out = generateYouthComp({ ...input, window: { start: "2027-01-04", end: "2027-05-09" } })!;
    expect(out.meta.youth!.singleLeg).toBe(true);
    expect(out.meta.totalRounds).toBe(19);
  });
});

describe("youthWindow", () => {
  test("margin of 7 days, never before tomorrow", () => {
    expect(youthWindow("2026-08-15", "2027-05-16")).toEqual({ start: "2026-08-22", end: "2027-05-09" });
    expect(youthWindow("2026-08-15", "2027-05-16", "2027-02-05")).toEqual({ start: "2027-02-06", end: "2027-05-09" });
  });
});

describe("youthCompsToRegenerate", () => {
  const states = [{ country: "England", leagueSlug: "premier_league", year: 2027, start: "2027-08-14", end: "2028-05-20" }];
  test("tier-1 league in a later year → regenerate with the margin", () => {
    expect(youthCompsToRegenerate(states, { England: 2026 })).toEqual([
      { country: "England", year: 2027, window: { start: "2027-08-21", end: "2028-05-13" } },
    ]);
  });
  test("same year or no competition → nothing", () => {
    expect(youthCompsToRegenerate(states, { England: 2027 })).toEqual([]);
    expect(youthCompsToRegenerate(states, {})).toEqual([]);
  });
});

describe("standings, champion and archive", () => {
  test("base rows, champion and archive with one title", () => {
    const out = generateYouthComp(input)!;
    const base = youthStandingsBase(out.meta);
    expect(base.map((b) => b.squadId)).toEqual(clubs);
    expect(base[0]!.name).toBe("Club 1");
    expect(youthChampion(computeStandings(base, [], "u21_england"))).toBeNull();
    const fixtures = out.rounds[0]!.fixtures.map((f, i) => ({ ...f, played: true, result: { home: i === 0 ? 3 : 1, away: 0 } }));
    const standings = computeStandings(base, fixtures, "u21_england");
    const champ = youthChampion(standings)!;
    expect(champ).toBe(fixtures[0]!.home);
    const archive = buildYouthCompArchive({ ...out.meta, youth: { ...out.meta.youth!, championId: champ } }, standings);
    expect(archive.leagueSlug).toBe("u21_england");
    expect(archive.year).toBe(2026);
    expect(archive.standings).toEqual(standings);
    expect(archive.titles.length).toBe(1);
    expect(archive.titles[0]!.clubId).toBe(champ);
    expect(archive.playerLogs).toEqual({});
  });
});
