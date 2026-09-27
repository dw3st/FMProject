import { describe, expect, spyOn, test } from "bun:test";
import { logEuropeanCalendarClashes } from "@/backend/continentalWorld";
import type { SaveService } from "@/backend/SaveService";
import type { ContinentalMetaData, Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";

function continentalMeta(
  slug: "ucl" | "uel",
  clubs: string[],
  stageDates: string[],
): LeagueSeasonMeta {
  const continental: ContinentalMetaData = {
    competition: slug,
    continent: "Europe",
    groups: [{ name: "A", clubs }],
    stages: [{ name: "group", rounds: [1], dates: stageDates, drawn: true }],
    countryOf: Object.fromEntries(clubs.map((c) => [c, "Test"])),
    level: Object.fromEntries(clubs.map((c) => [c, 5])),
    championId: null,
  };
  return {
    leagueSlug: slug, kind: "continental", year: 2027, start: "2027-09-01", end: "2028-05-01",
    totalRounds: 13, restDays: [], continental,
  };
}

function fakeService(metas: Record<string, LeagueSeasonMeta | null>): SaveService {
  return {
    getLeagueMeta: async (_saveId: string, slug: string) => metas[slug] ?? null,
  } as unknown as SaveService;
}

function fixture(id: string, date: string, home: string, away: string, round = 1): Fixture {
  return { id, date, competition: "of_test_league", round, home, away, played: false, result: null };
}

describe("logEuropeanCalendarClashes", () => {
  test("logs a clash when a club's new domestic round date matches its own UCL date", async () => {
    const service = fakeService({
      ucl: continentalMeta("ucl", ["club_1", "club_2"], ["2027-09-15", "2027-09-22"]),
    });
    const err = spyOn(console, "error").mockImplementation(() => {});
    let count: number;
    let calls: unknown[][];
    try {
      const fixtures = new Map([
        ["of_test_league", [fixture("f1", "2027-09-15", "club_1", "club_9")]],
      ]);
      count = await logEuropeanCalendarClashes(service, "save1", fixtures);
      calls = err.mock.calls.filter((c) => c[0] === "[continental]");
    } finally {
      err.mockRestore();
    }
    expect(count).toBe(1);
    expect(calls.length).toBe(1);
  });

  test("no clash when the club is not a European continental participant", async () => {
    const service = fakeService({
      ucl: continentalMeta("ucl", ["club_1"], ["2027-09-15"]),
    });
    const fixtures = new Map([
      ["of_test_league", [fixture("f1", "2027-09-15", "club_404", "club_405")]],
    ]);
    const count = await logEuropeanCalendarClashes(service, "save1", fixtures);
    expect(count).toBe(0);
  });

  test("no clash when the dates simply don't coincide", async () => {
    const service = fakeService({
      ucl: continentalMeta("ucl", ["club_1"], ["2027-09-15"]),
    });
    const fixtures = new Map([
      ["of_test_league", [fixture("f1", "2027-10-01", "club_1", "club_9")]],
    ]);
    const count = await logEuropeanCalendarClashes(service, "save1", fixtures);
    expect(count).toBe(0);
  });

  test("no continental competitions on disk yet — returns 0, never throws", async () => {
    const service = fakeService({});
    const fixtures = new Map([
      ["of_test_league", [fixture("f1", "2027-09-15", "club_1", "club_9")]],
    ]);
    await expect(logEuropeanCalendarClashes(service, "save1", fixtures)).resolves.toBe(0);
  });

  test("counts a clash for both UCL and UEL independently, and both home/away clubs", async () => {
    const service = fakeService({
      ucl: continentalMeta("ucl", ["club_1"], ["2027-09-15"]),
      uel: continentalMeta("uel", ["club_2"], ["2027-09-15"]),
    });
    const err = spyOn(console, "error").mockImplementation(() => {});
    let count: number;
    try {
      const fixtures = new Map([
        ["of_test_league", [fixture("f1", "2027-09-15", "club_1", "club_2")]],
      ]);
      count = await logEuropeanCalendarClashes(service, "save1", fixtures);
    } finally {
      err.mockRestore();
    }
    expect(count).toBe(2);
  });
});
