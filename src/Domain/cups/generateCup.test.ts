import { describe, expect, test } from "bun:test";
import { generateCup } from "@/Domain/cups/generateCup";

const clubs = Array.from({ length: 44 }, (_, i) => ({ id: `c${i}`, tier: i < 20 ? 1 : 2 }));
const args = {
  country: "England", year: 2026, clubs,
  window: { start: "2026-08-15", end: "2027-05-20" },
  busyDates: new Set<string>(), seedKey: "save1:2026:England",
};

describe("generateCup", () => {
  test("meta, stages, first round and date index", () => {
    const r = generateCup(args)!;
    expect(r.meta.leagueSlug).toBe("cup_england");
    expect(r.meta.kind).toBe("cup");
    expect(r.meta.totalRounds).toBe(6);
    const cup = r.meta.cup!;
    expect(cup.stages.map((s) => s.name)).toEqual(["preliminary", "r32", "r16", "qf", "sf", "final"]);
    expect(cup.stages[0]!.drawn).toBe(true);
    expect(cup.stages.slice(1).every((s) => !s.drawn)).toBe(true);
    expect(cup.byes).toHaveLength(20);
    // byes are the top-tier clubs; the preliminary is the 24 lowest
    expect(cup.byes.every((id) => cup.tiers[id] === 1)).toBe(true);
    expect(cup.stages[0]!.entrants).toHaveLength(24);
    // one round file per stage, only the first filled
    expect(r.rounds).toHaveLength(6);
    expect(r.rounds[0]!.fixtures).toHaveLength(12);
    expect(r.rounds.slice(1).every((rd) => rd.fixtures.length === 0)).toBe(true);
    for (const f of r.rounds[0]!.fixtures) {
      expect(f.competition).toBe("cup_england");
      expect(f.knockout).toBe(true);
      expect(f.date).toBe(cup.stages[0]!.date);
    }
    // date index maps every stage date to its round
    cup.stages.forEach((s) => expect(r.dateIndex[s.date]).toEqual([s.round]));
    expect(r.meta.start).toBe(cup.stages[0]!.date);
    expect(r.meta.end).toBe(cup.stages[5]!.date);
  });

  test("deterministic from the seed key", () => {
    expect(generateCup(args)).toEqual(generateCup(args));
    expect(generateCup({ ...args, seedKey: "other" })!.rounds[0]).not.toEqual(generateCup(args)!.rounds[0]);
  });

  test("fewer than 2 clubs → null", () => {
    expect(generateCup({ ...args, clubs: clubs.slice(0, 1) })).toBeNull();
  });

  test("16 clubs: no preliminary, no byes, final is neutral when drawn", () => {
    const r = generateCup({ ...args, clubs: clubs.slice(0, 16) })!;
    expect(r.meta.cup!.byes).toEqual([]);
    expect(r.rounds[0]!.fixtures).toHaveLength(8);
  });
});
