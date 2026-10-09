import { describe, expect, test } from "bun:test";
import { drawnLeaguesOf, playerRestDaysAfterMoves, rescheduleFixtureConflicts } from "@/backend/reschedulingWorld";
import { seasonEndExpiry } from "@/backend/jobWorld";
import { firstMatchAfterMoves } from "@/Domain/calendar/rescheduling";
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { Fixture, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { LeagueDataEntry } from "@/backend/advanceDay";

function fx(id: string, competition: string, round: number, date: string, home: string, away: string): Fixture {
  return { id, competition, round, date, home, away, played: false, result: null };
}

function memoryService(data: {
  metas: Record<string, LeagueSeasonMeta>;
  rounds: Record<string, RoundFixtures[]>;
}) {
  const indexes: Record<string, LeagueDateIndex> = {};
  const rounds = new Map<string, RoundFixtures>();
  for (const [slug, list] of Object.entries(data.rounds)) {
    const idx: LeagueDateIndex = {};
    for (const rf of list) {
      rounds.set(`${slug}:${rf.round}`, rf);
      for (const f of rf.fixtures) (idx[f.date] ??= []).includes(rf.round) || idx[f.date]!.push(rf.round);
    }
    indexes[slug] = idx;
  }
  const writes: string[] = [];
  const service = {
    listCompetitionSlugs: async () => Object.keys(data.rounds),
    getLeagueMeta: async (_s: string, slug: string) => data.metas[slug] ?? null,
    getDateIndex: async (_s: string, slug: string) => indexes[slug] ?? null,
    getRound: async (_s: string, slug: string, r: number) => rounds.get(`${slug}:${r}`) ?? null,
    writeRound: async (_s: string, slug: string, r: number, rf: RoundFixtures) => { rounds.set(`${slug}:${r}`, rf); writes.push(`${slug}:${r}`); },
    writeDateIndex: async (_s: string, slug: string, idx: LeagueDateIndex) => { indexes[slug] = idx; writes.push(`${slug}:index`); },
  } as unknown as SaveService;
  return { service, indexes, rounds, writes };
}

const leagueMeta = (slug: string): LeagueSeasonMeta => ({
  leagueSlug: slug, year: 2027, start: "2027-08-01", end: "2028-05-31", totalRounds: 2,
});
const catalog = [{ slug: "lg", country: "Testland" }] as unknown as LeagueDataEntry[];

describe("rescheduleFixtureConflicts", () => {
  test("moves the clashing league game and keeps rounds and the date index consistent", async () => {
    const mem = memoryService({
      metas: { lg: leagueMeta("lg"), ucl: { ...leagueMeta("ucl"), kind: "continental" } },
      rounds: {
        lg: [
          { leagueSlug: "lg", round: 1, fixtures: [fx("l1", "lg", 1, "2027-10-02", "A", "B"), fx("l2", "lg", 1, "2027-10-02", "C", "D")] },
          { leagueSlug: "lg", round: 2, fixtures: [fx("l3", "lg", 2, "2027-10-09", "A", "C"), fx("l4", "lg", 2, "2027-10-09", "B", "D")] },
        ],
        ucl: [{ leagueSlug: "ucl", round: 1, fixtures: [fx("u1", "ucl", 1, "2027-10-03", "A", "X")] }],
      },
    });
    const r = await rescheduleFixtureConflicts({ service: mem.service, saveId: "s", minDate: "2027-09-01", catalog });
    expect(r.moves).toHaveLength(1);
    expect(r.before.adjacentPairs).toBe(1);
    expect(r.after.adjacentPairs + r.after.sameDayPairs).toBe(0);
    const round1 = mem.rounds.get("lg:1")!.fixtures;
    const moved = round1.find((f) => f.id === "l1")!;
    expect(moved.rescheduledFrom).toBe("2027-10-02");
    expect(moved.date).toBe(r.moves[0]!.to);
    expect(round1.find((f) => f.id === "l2")!.date).toBe("2027-10-02");
    expect(mem.indexes.lg![moved.date]).toEqual([1]);
    expect(mem.indexes.lg!["2027-10-02"]).toEqual([1]);
    expect(mem.writes).not.toContain("ucl:1");
  });

  test("nothing to do: nothing written", async () => {
    const mem = memoryService({
      metas: { lg: leagueMeta("lg") },
      rounds: { lg: [{ leagueSlug: "lg", round: 1, fixtures: [fx("l1", "lg", 1, "2027-10-02", "A", "B")] }] },
    });
    const r = await rescheduleFixtureConflicts({ service: mem.service, saveId: "s", minDate: "2027-09-01", catalog });
    expect(r.moves).toEqual([]);
    expect(mem.writes).toEqual([]);
  });

  test("scope limits the leagues loaded", async () => {
    const mem = memoryService({
      metas: { lg: leagueMeta("lg"), other: leagueMeta("other"), ucl: { ...leagueMeta("ucl"), kind: "continental" } },
      rounds: {
        lg: [{ leagueSlug: "lg", round: 1, fixtures: [fx("l1", "lg", 1, "2027-10-02", "A", "B")] }],
        other: [{ leagueSlug: "other", round: 1, fixtures: [fx("o1", "other", 1, "2027-10-02", "Y", "Z")] }],
        ucl: [{ leagueSlug: "ucl", round: 1, fixtures: [fx("u1", "ucl", 1, "2027-10-02", "Y", "X")] }],
      },
    });
    const r = await rescheduleFixtureConflicts({ service: mem.service, saveId: "s", minDate: "2027-09-01", catalog, scope: new Set(["lg"]) });
    expect(r.moves).toEqual([]);
    const all = await rescheduleFixtureConflicts({ service: mem.service, saveId: "s", minDate: "2027-09-01", catalog });
    expect(all.moves.map((m) => m.fixtureId)).toEqual(["o1"]);
  });
});

describe("drawnLeaguesOf", () => {
  test("leagues of the clubs of a drawn cup round and of drawn continental ties", async () => {
    const mem = memoryService({
      metas: {},
      rounds: { cup_x: [{ leagueSlug: "cup_x", round: 3, fixtures: [fx("c1", "cup_x", 3, "2027-11-03", "A", "B")] }] },
    });
    const leagueOf: Record<string, string> = { A: "lg1", B: "lg2", X: "lg3", Y: "lg1" };
    const index = { byId: (id: string) => (leagueOf[id] ? { leagueSlug: leagueOf[id] } : undefined) } as unknown as SquadIndex;
    const out = await drawnLeaguesOf({
      service: mem.service, saveId: "s", index,
      cupChanges: [{ slug: "cup_x", drawnRound: 3 }, { slug: "cup_x" }],
      continentalChanges: [{ slug: "ucl", events: [{ kind: "drawn", stage: "r16", round: 7, ties: [{ home: "X", away: "Y", firstLegDate: "2028-02-15" }] }] }],
    });
    expect([...out].sort()).toEqual(["lg1", "lg2", "lg3"]);
  });
});

describe("human club after the moves", () => {
  test("rest days follow the moved game, from the league fixtures on disk", async () => {
    const fixtures = [
      { ...fx("l1", "lg", 1, "2027-10-06", "A", "B"), rescheduledFrom: "2027-10-02" },
      fx("l3", "lg", 2, "2027-10-09", "A", "C"),
    ];
    const service = { getAllFixturesForLeague: async () => fixtures } as unknown as SaveService;
    const moves = [{ competition: "lg", round: 1, fixtureId: "l1", home: "A", away: "B", from: "2027-10-02", to: "2027-10-06" }];
    const out = await playerRestDaysAfterMoves({
      service, saveId: "s", clubId: "A", moves,
      state: { leagueSlug: "lg", restDays: ["2027-10-01", "2027-10-03", "2027-10-08", "2027-10-10", "2027-10-20"] },
    });
    expect(out).toEqual(["2027-10-05", "2027-10-07", "2027-10-08", "2027-10-10", "2027-10-20"]);
    expect(await playerRestDaysAfterMoves({ service, saveId: "s", clubId: "Z", moves, state: { leagueSlug: "lg", restDays: [] } })).toBeNull();
  });

  test("the season-end job offer expires on the eve of the first game after the moves", () => {
    const fixtures = [fx("l1", "lg", 1, "2027-08-14", "A", "B"), fx("l2", "lg", 2, "2027-08-21", "A", "C")];
    const moves = [{ competition: "lg", round: 1, fixtureId: "l1", home: "A", away: "B", from: "2027-08-14", to: "2027-08-18" }];
    const first = firstMatchAfterMoves(fixtures, moves, "A");
    expect(first).toBe("2027-08-18");
    expect(seasonEndExpiry("2027-05-20", first)).toBe("2027-08-17");
    expect(firstMatchAfterMoves(fixtures, moves, "Z")).toBeNull();
  });
});
