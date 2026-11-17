import { describe, expect, test } from "bun:test";
import type { IccConfed, IccEntrant } from "@/types/calendarTypes";
import { pickIccEntrants } from "@/Domain/intercontinental/entrants";
import { initialMatches, stepBracket } from "@/Domain/intercontinental/bracket";
import { iccDates } from "@/Domain/intercontinental/iccDates";
import { generateIcc } from "@/Domain/intercontinental/generateIcc";

const DATES = ["2027-12-04", "2027-12-08", "2027-12-11", "2027-12-15"];
const full = (): Record<IccConfed, IccEntrant> => ({
  UEFA: { clubId: "ucl", source: "ucl", position: 1 },
  CONMEBOL: { clubId: "lib", source: "lib", position: 1 },
  AFC: { clubId: "afc", source: "jp", position: 1 },
  CAF: { clubId: "caf", source: "eg", position: 1 },
  CONCACAF: { clubId: "cnc", source: "mx", position: 1 },
  OFC: { clubId: "ofc", source: "fj", position: 1 },
});

describe("pickIccEntrants", () => {
  test("strongest league with a closed season per confederation", () => {
    const e = pickIccEntrants({
      continental: [{ confed: "UEFA", competition: "ucl", order: ["real"] }, { confed: "CONMEBOL", competition: "lib", order: ["fla"] }],
      leagues: [
        { confed: "AFC", league: "sa", coefficient: 4.2, table: ["hilal", "nassr"] },
        { confed: "AFC", league: "jp", coefficient: 4.5, table: null },
        { confed: "AFC", league: "au", coefficient: 3.9, table: ["sydney"] },
        { confed: "CAF", league: "eg", coefficient: 3.5, table: ["ahly"] },
        { confed: "CONCACAF", league: "mx", coefficient: 4.4, table: ["america"] },
        { confed: "CONCACAF", league: "us", coefficient: 4.5, table: ["miami"] },
      ],
    });
    expect(e.UEFA).toEqual({ clubId: "real", source: "ucl", position: 1 });
    expect(e.CONMEBOL.clubId).toBe("fla");
    expect(e.AFC).toEqual({ clubId: "hilal", source: "sa", position: 1 }); // jp is stronger but has no closed season
    expect(e.CONCACAF.clubId).toBe("miami");
    expect(e.OFC).toEqual({ clubId: null, source: null });
  });

  test("a club never takes two slots: the runner-up comes in", () => {
    const e = pickIccEntrants({
      continental: [{ confed: "UEFA", competition: "ucl", order: ["x"] }, { confed: "CONMEBOL", competition: "lib", order: ["x", "y"] }],
      leagues: [{ confed: "AFC", league: "a", coefficient: 1, table: ["y", "z"] }],
    });
    expect(e.UEFA.clubId).toBe("x");
    expect(e.CONMEBOL).toEqual({ clubId: "y", source: "lib", position: 2 });
    expect(e.AFC).toEqual({ clubId: "z", source: "a", position: 2 });
  });

  test("no champion and no runner-up = bye", () => {
    const e = pickIccEntrants({ continental: [{ confed: "UEFA", competition: "ucl", order: [] }], leagues: [] });
    expect(e.UEFA.clubId).toBeNull();
    expect(e.CAF.clubId).toBeNull();
  });
});

describe("stepBracket", () => {
  test("full bracket: 1 and 3 first, then 2, 4, final", () => {
    let s = stepBracket(initialMatches(DATES), full(), {});
    expect(s.created.map((m) => m.n).sort()).toEqual([1, 3]);
    expect(s.matches.find((m) => m.n === 1)!.date).toBe(DATES[0]!);
    expect(s.matches.find((m) => m.n === 3)!.date).toBe(DATES[0]!);
    const winners: Record<number, string> = { 1: "afc", 3: "lib" };
    s = stepBracket(s.matches, full(), winners);
    expect(s.created.map((m) => [m.n, m.home, m.away])).toEqual([[2, "afc", "caf"]]);
    winners[2] = "caf";
    s = stepBracket(s.matches, full(), winners);
    expect(s.created.map((m) => [m.n, m.home, m.away])).toEqual([[4, "caf", "lib"]]);
    winners[4] = "lib";
    s = stepBracket(s.matches, full(), winners);
    expect(s.created.map((m) => [m.n, m.home, m.away])).toEqual([[5, "lib", "ucl"]]);
    expect(s.championId).toBeNull();
    winners[5] = "ucl";
    s = stepBracket(s.matches, full(), winners);
    expect(s.championId).toBe("ucl");
    expect(s.decided).toEqual([{ n: 5, winner: "ucl", loser: "lib", bye: false }]);
  });

  test("byes cascade", () => {
    const e = full();
    e.OFC = { clubId: null, source: null };
    e.CAF = { clubId: null, source: null };
    const s = stepBracket(initialMatches(DATES), e, {});
    expect(s.decided.filter((d) => d.bye).map((d) => [d.n, d.winner])).toEqual([[1, "afc"], [2, "afc"]]);
    expect(s.created.map((m) => m.n)).toEqual([3]);
    const t = stepBracket(s.matches, e, { 3: "cnc" });
    expect(t.created.map((m) => [m.n, m.home, m.away])).toEqual([[4, "afc", "cnc"]]);
  });

  test("everyone missing: no champion, nothing to play", () => {
    const e = Object.fromEntries(Object.keys(full()).map((k) => [k, { clubId: null, source: null }])) as Record<IccConfed, IccEntrant>;
    const s = stepBracket(initialMatches(DATES), e, {});
    expect(s.created).toEqual([]);
    expect(s.matches.every((m) => m.done)).toBe(true);
    expect(s.championId).toBeNull();
  });
});

describe("iccDates", () => {
  test("Wednesdays and Saturdays after the given day, skipping busy and blocked days", () => {
    const d = iccDates({ after: "2027-12-01", busy: new Set(["2027-12-04"]), blocked: new Set(["2027-12-08"]) });
    expect(d).toEqual(["2027-12-11", "2027-12-15", "2027-12-18", "2027-12-22"]);
    for (const x of d) expect([3, 6]).toContain(new Date(`${x}T12:00:00Z`).getUTCDay());
  });

  test("falls back to other free days when Wednesdays and Saturdays are taken", () => {
    const busy = new Set<string>();
    for (let day = 2; day <= 31; day++) {
      const d = `2027-12-${String(day).padStart(2, "0")}`;
      const w = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (w === 3 || w === 6) busy.add(d);
    }
    const d = iccDates({ after: "2027-12-01", busy, blocked: new Set() });
    expect(d.length).toBe(4);
    for (const x of d) expect(busy.has(x)).toBe(false);
    for (let i = 1; i < d.length; i++) expect(d[i]! > d[i - 1]!).toBe(true);
  });
});

describe("generateIcc", () => {
  test("writes the first fixtures and indexes every match date", () => {
    const g = generateIcc({ year: 2027, start: "2027-12-01", dates: DATES, entrants: full(), countryOf: {}, pastYears: [] });
    expect(g.rounds.length).toBe(5);
    expect(g.rounds.find((r) => r.round === 1)!.fixtures[0]).toMatchObject({ home: "ofc", away: "afc", knockout: true, neutral: true, competition: "icc" });
    expect(g.rounds.find((r) => r.round === 2)!.fixtures).toEqual([]);
    expect(g.dateIndex[DATES[0]!]!.sort()).toEqual([1, 3]);
    expect(g.meta.kind).toBe("intercontinental");
    expect(g.meta.end).toBe(DATES[3]!);
  });
});
