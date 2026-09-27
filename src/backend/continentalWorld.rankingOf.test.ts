import { describe, expect, test } from "bun:test";
import { rankingOf, type CountryTier1 } from "@/backend/continentalWorld";
import type { SaveService } from "@/backend/SaveService";
import type { SeasonArchive } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";

function row(squadId: string): StandingRow {
  return { squadId, name: squadId, colors: ["#000", "#fff"], mp: 38, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] };
}

function archiveService(archive: SeasonArchive | null): SaveService {
  return {
    readLeagueSeasonArchive: async () => archive,
  } as unknown as SaveService;
}

function tier1(clubs: string[], levels: Record<string, number>): CountryTier1 {
  return {
    country: "Test", league: "test_league", crossYear: true, clubs,
    levels: new Map(Object.entries(levels)), coefficient: 5,
  };
}

describe("rankingOf", () => {
  test("first career season (no archive) — squad strength descending, numeric id tiebreak", async () => {
    const t = tier1(["c3", "c1", "c2"], { c1: 6, c2: 6, c3: 8 });
    const order = await rankingOf(archiveService(null), "save1", t, 2026);
    // c3 (8) first; c1/c2 tie at 6 — numeric id tiebreak keeps c1 before c2.
    expect(order).toEqual(["c3", "c1", "c2"]);
  });

  test("empty standings in the archive is treated the same as no archive", async () => {
    const t = tier1(["c1", "c2"], { c1: 5, c2: 9 });
    const archive: SeasonArchive = {
      leagueSlug: "test_league", year: 2026, start: "2026-08-15", end: "2027-05-20",
      standings: [], titles: [], playerLogs: {},
    };
    const order = await rankingOf(archiveService(archive), "save1", t, 2026);
    expect(order).toEqual(["c2", "c1"]);
  });

  test("archive order is used verbatim for clubs still in the league", async () => {
    const t = tier1(["c1", "c2", "c3"], { c1: 5, c2: 5, c3: 5 });
    const archive: SeasonArchive = {
      leagueSlug: "test_league", year: 2026, start: "2026-08-15", end: "2027-05-20",
      standings: [row("c3"), row("c1"), row("c2")], titles: [], playerLogs: {},
    };
    const order = await rankingOf(archiveService(archive), "save1", t, 2026);
    expect(order).toEqual(["c3", "c1", "c2"]);
  });

  test("a relegated club (in the archive, no longer in the league) is dropped", async () => {
    // c_out finished top of the OLD table but is no longer in t.clubs (relegated away).
    const t = tier1(["c1", "c2"], { c1: 5, c2: 5 });
    const archive: SeasonArchive = {
      leagueSlug: "test_league", year: 2026, start: "2026-08-15", end: "2027-05-20",
      standings: [row("c_out"), row("c1"), row("c2")], titles: [], playerLogs: {},
    };
    const order = await rankingOf(archiveService(archive), "save1", t, 2026);
    expect(order).toEqual(["c1", "c2"]);
  });

  test("a promoted club (in the league, not in the archive) is appended by level, after every archived club", async () => {
    const t = tier1(["c1", "c2", "c_new_weak", "c_new_strong"], {
      c1: 5, c2: 5, c_new_weak: 3, c_new_strong: 9,
    });
    const archive: SeasonArchive = {
      leagueSlug: "test_league", year: 2026, start: "2026-08-15", end: "2027-05-20",
      standings: [row("c2"), row("c1")], titles: [], playerLogs: {},
    };
    const order = await rankingOf(archiveService(archive), "save1", t, 2026);
    // Archive order first (even the weaker c1/c2), THEN the promoted pair by level desc —
    // a promoted club never outranks one that actually finished in the top flight.
    expect(order).toEqual(["c2", "c1", "c_new_strong", "c_new_weak"]);
  });
});
