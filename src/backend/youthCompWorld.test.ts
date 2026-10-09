import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { saveService } from "@/backend/SaveService";
import { getLeagueData, getPyramids } from "@/backend/advanceDay";
import {
  createYouthCompetitions,
  ensureYouthCompetitions,
  regenerateYouthComps,
  youthCompFixtures,
} from "@/backend/youthCompWorld";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import { addDays } from "@/Domain/dates";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import type { LeagueSeasonState } from "@/types/calendarTypes";

describe("youthCompWorld", () => {
  let saveId = "";
  let active: LeagueSeasonState[] = [];
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    active = meta.activeLeagues ?? [];
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const ctx = async () => ({
    service: saveService, saveId, index: await saveService.getSquadIndex(saveId),
    catalog: await getLeagueData(), pyramids: await getPyramids(),
  });

  test("creates the under-21 and under-19 of England off the first-team dates", async () => {
    await createYouthCompetitions({ ...(await ctx()), activeLeagues: active });
    const pl = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((t) => t.squadId);
    for (const slug of ["u21_england", "u19_england"]) {
      const meta = await saveService.getLeagueMeta(saveId, slug);
      expect(meta?.kind).toBe("youth");
      expect(meta!.youth!.clubs).toEqual(pl);
      expect(meta!.totalRounds).toBe(38);
      const table = await saveService.getLeagueStandings(saveId, slug);
      expect(table!.length).toBe(20);
      expect(table!.every((r) => r.mp === 0 && r.pts === 0)).toBe(true);

      const busy = new Map<string, Set<string>>();
      const add = (c: string, d: string) => (busy.get(c) ?? busy.set(c, new Set()).get(c)!).add(d);
      for (const f of await saveService.getAllFixturesForLeague(saveId, "premier_league")) { add(f.home, f.date); add(f.away, f.date); }
      for (const f of await saveService.getAllFixturesForLeague(saveId, "cup_england")) { add(f.home, f.date); add(f.away, f.date); }
      for (const c of CONTINENTAL_SLUGS) {
        for (const f of await saveService.getAllFixturesForLeague(saveId, c)) { add(f.home, f.date); add(f.away, f.date); }
      }
      const fixtures = await youthCompFixtures(saveService, saveId, meta!);
      expect(fixtures.length).toBe(380);
      const clash = fixtures.filter((f) => busy.get(f.home)?.has(f.date) || busy.get(f.away)?.has(f.date));
      expect(clash).toEqual([]);
    }
    expect((await saveService.getMeta(saveId))!.activeLeagues!.some((l) => l.leagueSlug.startsWith("u2"))).toBe(false);
  }, 120_000);

  test("ensure recreates a missing competition and rebuilds one with a past unplayed game", async () => {
    await rm(`${RUNTIME_DATA_DIR}/saves/${saveId}/leagues/u19_england`, { recursive: true, force: true });
    const before = (await saveService.getLeagueMeta(saveId, "u21_england"))!;
    const today = addDays(before.start, 30);
    const rebuilt = await ensureYouthCompetitions({ ...(await ctx()), today, activeLeagues: active });
    expect(rebuilt).toContain("u19_england");
    expect(rebuilt).toContain("u21_england");
    for (const slug of ["u21_england", "u19_england"]) {
      const meta = (await saveService.getLeagueMeta(saveId, slug))!;
      const fixtures = await youthCompFixtures(saveService, saveId, meta);
      expect(fixtures.every((f) => f.date > today)).toBe(true);
    }
  }, 120_000);

  test("regenerate archives the old season with one title and creates the next", async () => {
    const old = (await saveService.getLeagueMeta(saveId, "u21_england"))!;
    const table = (await saveService.getLeagueStandings(saveId, "u21_england"))!;
    table[0] = { ...table[0]!, mp: 1, w: 1, pts: 3 };
    await saveService.writeLeagueStandings(saveId, "u21_england", table);
    const next = active.map((l) => l.leagueSlug === "premier_league"
      ? { ...l, year: l.year + 1, start: addDays(l.start, 365), end: addDays(l.end, 365) }
      : l);
    const done = await regenerateYouthComps({ ...(await ctx()), today: addDays(old.end, 30), updatedActiveLeagues: next });
    expect(done.sort()).toEqual(["u19_england", "u21_england"]);
    const archive = await saveService.readLeagueSeasonArchive(saveId, "u21_england", old.year);
    expect(archive!.titles.length).toBe(1);
    expect(archive!.titles[0]!.clubId).toBe(table[0]!.squadId);
    expect((await saveService.getLeagueMeta(saveId, "u21_england"))!.year).toBe(old.year + 1);
  }, 120_000);
});
