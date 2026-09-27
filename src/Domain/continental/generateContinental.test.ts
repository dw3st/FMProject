import { describe, expect, test } from "bun:test";
import { generateContinental } from "@/Domain/continental/generateContinental";
import type { DrawClub } from "@/Domain/continental/groupDraw";

const clubs: DrawClub[] = Array.from({ length: 32 }, (_, i) => ({
  id: `c${i}`,
  country: ["England", "Spain", "Italy", "Germany", "France", "Portugal", "Netherlands", "Turkey"][i % 8]!,
  level: 6 - i * 0.05,
}));

// 13 arbitrary, strictly increasing dates — this module does not validate spacing (continentalDates does).
const dates = [
  "2026-09-15", "2026-10-06", "2026-10-27", "2026-11-17", "2026-12-01", "2026-12-15",
  "2027-02-10", "2027-02-24", "2027-03-10", "2027-03-24", "2027-04-07", "2027-04-21", "2027-05-12",
];

const args = { slug: "ucl" as const, year: 2026, clubs, dates, seedKey: "save1:2026:ucl" };

describe("generateContinental", () => {
  const r = generateContinental(args);

  test("meta basics", () => {
    expect(r.meta.leagueSlug).toBe("ucl");
    expect(r.meta.year).toBe(2026);
    expect(r.meta.kind).toBe("continental");
    expect(r.meta.totalRounds).toBe(13);
    expect(r.meta.start).toBe(dates[0]!);
    expect(r.meta.end).toBe(dates[12]!);
  });

  test("continental meta: 8 groups, countryOf/level filled, no champion yet", () => {
    const c = r.meta.continental!;
    expect(c.competition).toBe("ucl");
    expect(c.continent).toBe("Europe");
    expect(c.groups).toHaveLength(8);
    expect(c.groups.every((g) => g.clubs.length === 4)).toBe(true);
    expect(new Set(c.groups.flatMap((g) => g.clubs)).size).toBe(32);
    expect(c.championId).toBeNull();
    for (const club of clubs) {
      expect(c.countryOf[club.id]).toBe(club.country);
      expect(c.level[club.id]).toBe(club.level);
    }
  });

  test("stages: group (1-6, drawn) then r16/qf/sf/final undrawn, with dates", () => {
    const stages = r.meta.continental!.stages;
    expect(stages.map((s) => s.name)).toEqual(["group", "r16", "qf", "sf", "final"]);
    expect(stages.map((s) => s.rounds)).toEqual([[1, 2, 3, 4, 5, 6], [7, 8], [9, 10], [11, 12], [13]]);
    expect(stages[0]!.drawn).toBe(true);
    expect(stages.slice(1).every((s) => s.drawn === false)).toBe(true);
    expect(stages[0]!.dates).toEqual(dates.slice(0, 6));
    expect(stages[1]!.dates).toEqual(dates.slice(6, 8));
    expect(stages[2]!.dates).toEqual(dates.slice(8, 10));
    expect(stages[3]!.dates).toEqual(dates.slice(10, 12));
    expect(stages[4]!.dates).toEqual(dates.slice(12, 13));
  });

  test("rounds 1-6: 16 fixtures each, ids and competition, dated per stage", () => {
    expect(r.rounds).toHaveLength(13);
    for (let round = 1; round <= 6; round++) {
      const rf = r.rounds.find((x) => x.round === round)!;
      expect(rf.leagueSlug).toBe("ucl");
      expect(rf.fixtures).toHaveLength(16);
      for (const f of rf.fixtures) {
        expect(f.competition).toBe("ucl");
        expect(f.round).toBe(round);
        expect(f.date).toBe(dates[round - 1]!);
        expect(f.played).toBe(false);
        expect(f.result).toBeNull();
        expect(f.knockout).toBeUndefined();
        expect(f.id).toStartWith(`ucl_2026_r${round}_`);
      }
    }
  });

  test("rounds 7-13 exist with no fixtures", () => {
    for (let round = 7; round <= 13; round++) {
      const rf = r.rounds.find((x) => x.round === round)!;
      expect(rf).toBeTruthy();
      expect(rf.leagueSlug).toBe("ucl");
      expect(rf.fixtures).toEqual([]);
    }
  });

  test("nobody plays twice in the same round, within a group", () => {
    const c = r.meta.continental!;
    for (let round = 1; round <= 6; round++) {
      const rf = r.rounds.find((x) => x.round === round)!;
      for (const group of c.groups) {
        const played = rf.fixtures.filter((f) => group.clubs.includes(f.home) || group.clubs.includes(f.away));
        expect(played).toHaveLength(2);
        const involved = played.flatMap((f) => [f.home, f.away]);
        expect(new Set(involved).size).toBe(4);
      }
    }
  });

  test("each pair in a group meets exactly twice, once at each home", () => {
    const c = r.meta.continental!;
    const allFixtures = r.rounds.slice(0, 6).flatMap((rf) => rf.fixtures);
    for (const group of c.groups) {
      const [p1, p2, p3, p4] = group.clubs;
      const pairs: [string, string][] = [
        [p1!, p2!], [p1!, p3!], [p1!, p4!], [p2!, p3!], [p2!, p4!], [p3!, p4!],
      ];
      for (const [a, b] of pairs) {
        const between = allFixtures.filter(
          (f) => (f.home === a && f.away === b) || (f.home === b && f.away === a),
        );
        expect(between).toHaveLength(2);
        expect(between.some((f) => f.home === a)).toBe(true);
        expect(between.some((f) => f.home === b)).toBe(true);
      }
    }
  });

  test("date index maps every date to its round number", () => {
    dates.forEach((d, i) => expect(r.dateIndex[d]).toEqual([i + 1]));
  });

  test("deterministic from the seed key", () => {
    expect(generateContinental(args)).toEqual(generateContinental(args));
    expect(generateContinental({ ...args, seedKey: "other" }).meta.continental!.groups).not.toEqual(
      generateContinental(args).meta.continental!.groups,
    );
  });

  test("wrong number of clubs throws", () => {
    expect(() => generateContinental({ ...args, clubs: clubs.slice(0, 31) })).toThrow();
  });

  test("wrong number of dates throws", () => {
    expect(() => generateContinental({ ...args, dates: dates.slice(0, 12) })).toThrow();
  });
});
