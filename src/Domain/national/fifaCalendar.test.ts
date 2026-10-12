import { describe, expect, test } from "bun:test";
import {
  blockedDays, countryBlockedDays, fifaWindows, qualifierDates, tournamentDates, tournamentsOfYear,
} from "@/Domain/national/fifaCalendar";

describe("fifaCalendar", () => {
  test("five windows in odd years, four in even years, Monday starts", () => {
    expect(fifaWindows(2027).map((w) => w.start)).toEqual(["2027-03-22", "2027-06-07", "2027-09-06", "2027-10-11", "2027-11-15"]);
    expect(fifaWindows(2028).map((w) => w.start)).toEqual(["2028-03-27", "2028-09-04", "2028-10-09", "2028-11-13"]);
    const w = fifaWindows(2026)[1]!;
    expect(w.start).toBe("2026-08-31");
    expect(w.matchDates).toEqual(["2026-09-03", "2026-09-07"]);
    expect(w.release).toBe("2026-09-08");
    expect(w.blockEnd).toBe("2026-09-09");
  });

  test("tournaments: Euro and Copa América in 2028, World Cup in 2030", () => {
    expect(tournamentsOfYear(2027)).toEqual([]);
    expect(tournamentsOfYear(2028)).toEqual(["euro", "copa"]);
    expect(tournamentsOfYear(2030)).toEqual(["wc"]);
    expect(tournamentsOfYear(2032)).toEqual(["euro", "copa"]);
    const wc = tournamentDates("wc", 2030);
    expect(wc.stageDates.map((s) => s.name)).toEqual(["group", "r32", "r16", "qf", "sf", "final"]);
    expect(wc.stageDates[0]!.dates).toEqual(["2030-06-12", "2030-06-16", "2030-06-20"]);
    expect(wc.final).toBe("2030-07-12");
  });

  test("qualifier dates: windows of the two previous years", () => {
    expect(qualifierDates(2028, "2026-08-15")).toHaveLength(16);
    expect(qualifierDates(2030)).toHaveLength(18);
  });

  test("blocked days: windows for everyone, tournaments by confederation", () => {
    const br = countryBlockedDays("Brazil", "2028-01-01", "2028-12-31");
    expect(br.has("2028-03-27")).toBe(true);
    expect(br.has("2028-04-05")).toBe(true);
    expect(br.has("2028-04-06")).toBe(false);
    expect(br.has("2028-06-20")).toBe(true); // Copa América
    const jp = countryBlockedDays("Japan", "2028-01-01", "2028-12-31");
    expect(jp.has("2028-06-20")).toBe(false);
    const all2030 = blockedDays("AFC", "2030-05-30", "2030-07-20");
    expect(all2030.has("2030-06-01")).toBe(true);
    expect(all2030.has("2030-07-12")).toBe(true);
    expect(all2030.has("2030-07-13")).toBe(false);
  });
});
