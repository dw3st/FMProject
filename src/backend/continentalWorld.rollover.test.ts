import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, getLeagueData } from "@/backend/advanceDay";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import type { LeagueZone } from "@/types/playerTypes";
import type { StandingRow } from "@/types/playerTypes";

function row(squadId: string, name: string): StandingRow {
  return { squadId, name, colors: ["#000", "#fff"], mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] };
}

/**
 * A full rollover, without waiting the ~9 months a real European season takes:
 * - `premier_league`'s archive for its CURRENT (pre-rollover) year is written by hand, with a
 *   known, deliberately shuffled standings order — this becomes England's UCL/UEL qualifying
 *   order for the NEW continental season (`rankingOf` reads exactly this archive).
 * - Every cross-year European league's `activeLeagues` entry is bumped to next year — this is
 *   what `continentsToRegenerateContinental` requires to consider Europe's continental
 *   competitions due (every "season-defining" tier-1 league already past the current UCL/UEL year).
 * - `ucl`/`uel` get a `championId` set by hand (the actual final normally sets this via
 *   `advanceContinentalStages` once the final is played).
 * - A single standalone calendar-year league (Iceland) is pushed past its own season end so
 *   `advanceOneDay` actually has a `due.units` trigger for the day (the gate the continental
 *   archive/regenerate block itself runs on).
 */
describe("advanceOneDay rolls Europe's continental competitions over", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("old ucl/uel are archived with the champion title; new season is Y+1 with England's qualifiers in archive order", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const uclBefore = await saveService.getLeagueMeta(saveId, "ucl");
    const uelBefore = await saveService.getLeagueMeta(saveId, "uel");
    expect(uclBefore?.continental).toBeTruthy();
    expect(uelBefore?.continental).toBeTruthy();
    const oldYear = uclBefore!.year;

    // Champion of the OLD season, set by hand (normally done by `advanceContinentalStages` once
    // the final is played) — the thing the archive must carry forward as a title.
    const uclChampion = uclBefore!.continental!.groups[0]!.clubs[0]!;
    const uelChampion = uelBefore!.continental!.groups[0]!.clubs[0]!;
    await saveService.writeLeagueMeta(saveId, {
      ...uclBefore!, continental: { ...uclBefore!.continental!, championId: uclChampion },
    });
    await saveService.writeLeagueMeta(saveId, {
      ...uelBefore!, continental: { ...uelBefore!.continental!, championId: uelChampion },
    });

    // England's known qualifying order for the new season: reverse of the squad index's own
    // (numeric ascending) order — deliberately different from "natural" so the assertion below
    // can tell "used the archive" apart from "used level/id fallback ordering".
    const index = await saveService.getSquadIndex(saveId);
    const plClubs = index.inLeague("premier_league").map((t) => t.squadId);
    const customOrder = [...plClubs].reverse();
    const plState = meta.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!;
    await saveService.writeLeagueSeasonArchive(saveId, {
      leagueSlug: "premier_league", year: oldYear, start: plState.start, end: plState.end,
      standings: customOrder.map((id) => row(id, id)),
      titles: [], playerLogs: {},
    });

    // Every cross-year league (all European) is bumped past the current UCL/UEL year — this is
    // what makes `continentsToRegenerateContinental` consider Europe's continent due, without
    // simulating the ~9 months a real season takes. `start`/`end` are shifted forward a year too
    // (not just `year`) so `findDueRollovers`'s own `nextDate > end` check stays false for them —
    // otherwise, jumping `currentDate` all the way to Iceland's November end date would leave
    // their now-stale `end` (still in the original May) looking "ended" too, triggering a SECOND,
    // real rollover of these leagues on top of this manual bump.
    const addYear = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
    const crossYearSlugs = new Set(LEAGUE_SCHEDULE_CONFIGS.filter((c) => c.crossYear).map((c) => c.slug));
    const bumped = meta.activeLeagues!.map((l) =>
      crossYearSlugs.has(l.leagueSlug)
        ? { ...l, year: l.year + 1, start: addYear(l.start), end: addYear(l.end) }
        : l,
    );
    // `createContinentalSeason` reads the window's `end` from each season-defining league's OWN
    // on-disk meta (`getLeagueMeta`), not from `activeLeagues` — bump those too, or the new
    // continental season would compute its knockout window against the OLD (year-earlier) end.
    for (const slug of crossYearSlugs) {
      const lm = await saveService.getLeagueMeta(saveId, slug);
      if (!lm) continue;
      await saveService.writeLeagueMeta(saveId, { ...lm, year: lm.year + 1, start: addYear(lm.start), end: addYear(lm.end) });
    }
    const iceland = meta.activeLeagues!.find((l) => l.leagueSlug === "of_icelandic_urvalsdeild")!;
    await saveService.updateMeta(saveId, { activeLeagues: bumped, currentDate: iceland.end });

    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    // Old season archived with exactly the champion title.
    const uclArchive = await saveService.readLeagueSeasonArchive(saveId, "ucl", oldYear);
    const uelArchive = await saveService.readLeagueSeasonArchive(saveId, "uel", oldYear);
    expect(uclArchive?.titles).toEqual([
      { competition: "ucl", clubId: uclChampion, clubName: index.byId(uclChampion)!.name, coachId: null, coachName: "" },
    ]);
    expect(uelArchive?.titles).toEqual([
      { competition: "uel", clubId: uelChampion, clubName: index.byId(uelChampion)!.name, coachId: null, coachName: "" },
    ]);

    // New season is Y+1, with a fresh draw (not the same groups/championId as before).
    const uclAfter = await saveService.getLeagueMeta(saveId, "ucl");
    const uelAfter = await saveService.getLeagueMeta(saveId, "uel");
    expect(uclAfter!.year).toBe(oldYear + 1);
    expect(uelAfter!.year).toBe(oldYear + 1);
    expect(uclAfter!.continental!.championId).toBeNull();
    expect(uclAfter!.continental!.groups.flatMap((g) => g.clubs)).toHaveLength(32);
    expect(uelAfter!.continental!.groups.flatMap((g) => g.clubs)).toHaveLength(32);

    // England's qualifiers came from the archive order we wrote, not level/id fallback ordering:
    // the top `ucl` zone span of `customOrder`, then the next `uel`+`uecl` span.
    const catalog = (await getLeagueData()) as unknown as Array<{ slug: string; zones?: LeagueZone[] }>;
    const pl = catalog.find((l) => l.slug === "premier_league")!;
    const spanOf = (id: string) => {
      const z = pl.zones!.find((zz) => zz.id === id);
      return z && z.from !== undefined ? (z.to ?? z.from) - z.from + 1 : 0;
    };
    const uclSpan = spanOf("ucl");
    const uelSpan = spanOf("uel") + spanOf("uecl");

    const uclEnglandClubs = new Set(uclAfter!.continental!.groups.flatMap((g) => g.clubs).filter((id) => plClubs.includes(id)));
    const uelEnglandClubs = new Set(uelAfter!.continental!.groups.flatMap((g) => g.clubs).filter((id) => plClubs.includes(id)));
    expect(uclEnglandClubs).toEqual(new Set(customOrder.slice(0, uclSpan)));
    expect(uelEnglandClubs).toEqual(new Set(customOrder.slice(uclSpan, uclSpan + uelSpan)));
  }, 300_000);
});
