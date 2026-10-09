import { describe, expect, test } from "bun:test";
import type { Fixture, LeagueDateIndex } from "@/types/calendarTypes";
import {
  applyMovesToDateIndex,
  applyMovesToFixtures,
  shiftRestDays,
  countConflicts,
  findClubConflicts,
  rescheduledGamesOf,
  resolveFixtureConflicts,
  type CalendarEntry,
} from "@/Domain/calendar/rescheduling";

let n = 0;
function fx(competition: string, date: string, home: string, away: string, round = 1, extra: Partial<Fixture> = {}): Fixture {
  return { id: `f${++n}`, date, competition, round, home, away, played: false, result: null, ...extra };
}
const league = (f: Fixture): CalendarEntry => ({ competition: f.competition, kind: "league", fixture: f });
const cont = (f: Fixture): CalendarEntry => ({ competition: f.competition, kind: "continental", fixture: f });
const cup = (f: Fixture): CalendarEntry => ({ competition: f.competition, kind: "cup", fixture: f });

const WINDOW = { lg: { start: "2027-08-01", end: "2028-05-31" } };

describe("findClubConflicts / countConflicts", () => {
  test("same day and next day, both directions", () => {
    const entries = [
      league(fx("lg", "2027-10-02", "A", "B")),     // Saturday
      cont(fx("ucl", "2027-10-02", "A", "X")),      // same day for A
      cont(fx("ucl", "2027-10-03", "B", "Y")),      // next day for B
      league(fx("lg", "2027-10-09", "C", "D")),
    ];
    const c = findClubConflicts(entries);
    expect(c.map((x) => [x.club, x.gap])).toEqual([["A", 0], ["B", 1]]);
    const counts = countConflicts(entries);
    expect(counts.sameDayClubs).toBe(1);
    expect(counts.adjacentClubs).toBe(1);
    expect(counts.sameDayPairs).toBe(1);
    expect(counts.adjacentPairs).toBe(1);
  });

  test("two days apart is not a conflict; cancelled fixtures are ignored", () => {
    const entries = [
      league(fx("lg", "2027-10-02", "A", "B")),
      cont(fx("ucl", "2027-10-04", "A", "X")),
      cont(fx("ucl", "2027-10-02", "B", "Y", 1, { cancelled: true })),
    ];
    expect(findClubConflicts(entries)).toEqual([]);
  });
});

describe("resolveFixtureConflicts", () => {
  test("moves the league game to the nearest free midweek day, keeps the continental one", () => {
    // Sat 2027-10-02 league A-B; Tue 2027-10-05? no: UCL Sun 2027-10-03 for A.
    const lg = fx("lg", "2027-10-02", "A", "B");
    const ucl = fx("ucl", "2027-10-03", "A", "X");
    const entries = [league(lg), cont(ucl), league(fx("lg", "2027-10-09", "A", "C", 2)), league(fx("lg", "2027-10-09", "B", "D", 2))];
    const r = resolveFixtureConflicts({ entries, windows: WINDOW, minDate: "2027-09-01" });
    expect(r.moves).toHaveLength(1);
    const m = r.moves[0]!;
    expect(m.fixtureId).toBe(lg.id);
    expect(m.from).toBe("2027-10-02");
    // Midweek candidates by distance: Thu 09-30 (-2) is free (UCL on 10-03 is 3 days away) — but Tue 10-05
    // (+3) is also checked; nearest wins: Thu 2027-09-30.
    expect(m.to).toBe("2027-09-30");
    expect(new Date(`${m.to}T12:00:00Z`).getUTCDay()).toBe(4);
    const moved = r.entries.find((e) => e.fixture.id === lg.id)!.fixture;
    expect(moved.date).toBe("2027-09-30");
    expect(moved.rescheduledFrom).toBe("2027-10-02");
    expect(r.entries.find((e) => e.fixture.id === ucl.id)!.fixture.date).toBe("2027-10-03");
    expect(countConflicts(r.entries).sameDayPairs + countConflicts(r.entries).adjacentPairs).toBe(0);
  });

  test("respects both clubs' games and the window; never before minDate", () => {
    // A plays UCL on Wed 10-06; league A-B on Thu 10-07 conflicts. B also plays a cup on Tue 10-12.
    const lg = fx("lg", "2027-10-07", "A", "B");
    const entries = [
      league(lg),
      cont(fx("ucl", "2027-10-06", "A", "X")),
      cup(fx("cup_x", "2027-10-12", "B", "Z")),
      league(fx("lg", "2027-10-02", "A", "E", 0)),
      league(fx("lg", "2027-10-02", "B", "F", 0)),
      league(fx("lg", "2027-10-09", "A", "C", 2)),
      league(fx("lg", "2027-10-09", "B", "D", 2)),
    ];
    const r = resolveFixtureConflicts({ entries, windows: WINDOW, minDate: "2027-10-05" });
    expect(r.moves).toHaveLength(1);
    const to = r.moves[0]!.to;
    expect(to >= "2027-10-05").toBe(true);
    expect(countConflicts(r.entries).sameDayPairs + countConflicts(r.entries).adjacentPairs).toBe(0);
    expect([2, 3, 4]).toContain(new Date(`${to}T12:00:00Z`).getUTCDay());
  });

  test("no free date in the window: unresolved, game kept", () => {
    const lg = fx("lg", "2027-10-02", "A", "B");
    const entries = [league(lg), cont(fx("ucl", "2027-10-03", "A", "X"))];
    const r = resolveFixtureConflicts({ entries, windows: { lg: { start: "2027-10-02", end: "2027-10-04" } }, minDate: "2027-09-01" });
    expect(r.moves).toEqual([]);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0]!.reason).toBe("noFreeDate");
    expect(r.entries.find((e) => e.fixture.id === lg.id)!.fixture.date).toBe("2027-10-02");
  });

  test("played or past league games and cup×continental conflicts are only reported", () => {
    const entries = [
      league(fx("lg", "2027-10-02", "A", "B", 1, { played: true, result: { home: 1, away: 0 } })),
      cont(fx("ucl", "2027-10-03", "A", "X")),
      cup(fx("cup_x", "2027-11-03", "C", "D")),
      cont(fx("ucl", "2027-11-04", "C", "Y")),
      league(fx("lg", "2027-09-10", "E", "F")),
      cont(fx("ucl", "2027-09-11", "E", "Z")),
    ];
    const r = resolveFixtureConflicts({ entries, windows: WINDOW, minDate: "2027-09-15" });
    expect(r.moves).toEqual([]);
    expect(r.unresolved.map((u) => u.reason)).toEqual(["fixed", "fixed", "fixed"]);
  });

  test("two league games of a club on consecutive days: the later one moves", () => {
    const a = fx("lg", "2027-10-02", "A", "B");
    const b = fx("lg2", "2027-10-03", "A", "C");
    const r = resolveFixtureConflicts({
      entries: [league(a), league(b)],
      windows: { ...WINDOW, lg2: WINDOW.lg },
      minDate: "2027-09-01",
    });
    expect(r.moves.map((m) => m.fixtureId)).toEqual([b.id]);
  });

  test("a game moved twice keeps its first original date", () => {
    const lg = fx("lg", "2027-10-02", "A", "B", 1, { rescheduledFrom: "2027-09-25" });
    const r = resolveFixtureConflicts({
      entries: [league(lg), cont(fx("ucl", "2027-10-02", "A", "X"))],
      windows: WINDOW, minDate: "2027-09-01",
    });
    expect(r.entries.find((e) => e.fixture.id === lg.id)!.fixture.rescheduledFrom).toBe("2027-09-25");
  });

  test("deterministic", () => {
    const mk = () => [
      league(fx("lg", "2027-10-02", "A", "B")),
      cont(fx("ucl", "2027-10-03", "A", "X")),
      cont(fx("ucl", "2027-10-01", "B", "Y")),
    ];
    const one = resolveFixtureConflicts({ entries: mk(), windows: WINDOW, minDate: "2027-09-01" });
    const two = resolveFixtureConflicts({ entries: mk(), windows: WINDOW, minDate: "2027-09-01" });
    expect(one.moves.map((m) => m.to)).toEqual(two.moves.map((m) => m.to));
  });
});

describe("applyMovesToDateIndex", () => {
  test("drops the round from the old date only when none of its games stays there", () => {
    const idx: LeagueDateIndex = { "2027-10-02": [1], "2027-10-09": [2] };
    const roundFixtures = new Map<number, Fixture[]>([
      [1, [fx("lg", "2027-09-30", "A", "B", 1), fx("lg", "2027-10-02", "C", "D", 1)]],
    ]);
    const out = applyMovesToDateIndex(idx, roundFixtures);
    expect(out["2027-09-30"]).toEqual([1]);
    expect(out["2027-10-02"]).toEqual([1]);
    const out2 = applyMovesToDateIndex(idx, new Map([[1, [fx("lg", "2027-09-30", "A", "B", 1)]]]));
    expect(out2["2027-10-02"]).toBeUndefined();
    expect(out2["2027-10-09"]).toEqual([2]);
    expect(Object.keys(out2)).toEqual(["2027-09-30", "2027-10-09"]);
  });
});

describe("rescheduledGamesOf", () => {
  test("only the club's games, with the opponent and the venue", () => {
    const moves = [
      { competition: "lg", round: 3, fixtureId: "a", home: "A", away: "B", from: "2027-10-02", to: "2027-10-06" },
      { competition: "lg", round: 1, fixtureId: "b", home: "C", away: "A", from: "2027-09-04", to: "2027-09-01" },
      { competition: "lg", round: 1, fixtureId: "c", home: "C", away: "D", from: "2027-09-04", to: "2027-09-08" },
    ];
    const games = rescheduledGamesOf(moves, "A", (id) => `Club ${id}`, (s) => s.toUpperCase());
    expect(games.map((g) => [g.opponentName, g.home, g.to, g.competitionName])).toEqual([
      ["Club C", false, "2027-09-01", "LG"],
      ["Club B", true, "2027-10-06", "LG"],
    ]);
  });
});

describe("fixture ids repeat across competitions", () => {
  test("the same id in two competitions is two games", () => {
    const lg = { id: "fix_0001", date: "2027-10-02", competition: "lg", round: 1, home: "A", away: "B", played: false, result: null };
    const cp = { ...lg, competition: "cup_x", home: "C", away: "D" };
    expect(findClubConflicts([league(lg), cup(cp)])).toEqual([]);
    const r = resolveFixtureConflicts({
      entries: [league(lg), cont({ ...lg, competition: "ucl", home: "A", away: "X" })],
      windows: WINDOW, minDate: "2027-09-01",
    });
    expect(r.moves).toHaveLength(1);
    expect(r.moves[0]!.competition).toBe("lg");
  });
});

describe("shiftRestDays", () => {
  test("moves the seeded days with the game and keeps the player's own choices", () => {
    // Games Sat 10-02 (moved to Wed 10-06) and Sat 10-09. Seeded: 10-01, 10-03, 10-08, 10-10. Manual: 10-15.
    const rest = ["2027-10-01", "2027-10-03", "2027-10-08", "2027-10-10", "2027-10-15"];
    const out = shiftRestDays(rest, [{ from: "2027-10-02", to: "2027-10-06" }], new Set(["2027-10-06", "2027-10-09"]));
    expect(out).toEqual(["2027-10-05", "2027-10-07", "2027-10-08", "2027-10-10", "2027-10-15"]);
  });

  test("a day still next to another match stays; the new match day is never a rest day", () => {
    // Games 10-02 → 10-05 and 10-04: 10-03 is next to 10-04, kept. 10-05 was a seeded rest day (after 10-04).
    const rest = ["2027-10-01", "2027-10-03", "2027-10-05"];
    const out = shiftRestDays(rest, [{ from: "2027-10-02", to: "2027-10-07" }], new Set(["2027-10-04", "2027-10-07"]));
    expect(out).toEqual(["2027-10-03", "2027-10-05", "2027-10-06", "2027-10-08"]);
    const onRest = shiftRestDays(["2027-10-05"], [{ from: "2027-10-02", to: "2027-10-05" }], new Set(["2027-10-05"]));
    expect(onRest).toEqual(["2027-10-04", "2027-10-06"]);
  });
});

describe("applyMovesToFixtures", () => {
  test("only the moved game of that competition changes", () => {
    const a = { id: "x1", competition: "lg", round: 1, date: "2027-10-02", home: "A", away: "B", played: false, result: null };
    const b = { ...a, competition: "lg2" };
    const out = applyMovesToFixtures([a, b], [{ competition: "lg", round: 1, fixtureId: "x1", home: "A", away: "B", from: "2027-10-02", to: "2027-10-06" }]);
    expect(out.map((f) => [f.date, f.rescheduledFrom])).toEqual([["2027-10-06", "2027-10-02"], ["2027-10-02", undefined]]);
  });
});
