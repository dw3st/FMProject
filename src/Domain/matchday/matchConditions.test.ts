import { describe, expect, test } from "bun:test";
import { climateOf, matchConditions } from "@/Domain/matchday/matchConditions";

const fx = (date: string, home = "33", away = "40") => ({ date, home, away });

describe("matchConditions", () => {
  test("deterministic: same fixture, same kickoff and weather", () => {
    expect(matchConditions(fx("2027-03-13"), "England")).toEqual(matchConditions(fx("2027-03-13"), "England"));
  });

  test("weekend and weekday kickoff slots", () => {
    for (let i = 0; i < 40; i++) {
      // 2027-03-13 is a Saturday, 2027-03-16 a Tuesday.
      const sat = matchConditions(fx("2027-03-13", `h${i}`), "England").kickoff;
      const tue = matchConditions(fx("2027-03-16", `h${i}`), "England").kickoff;
      expect(["13:30", "15:00", "16:00", "17:30", "18:30", "20:00"]).toContain(sat);
      expect(["19:00", "19:45", "20:00", "20:45", "21:30"]).toContain(tue);
    }
  });

  test("the weather follows the month and the hemisphere", () => {
    const weathers = (date: string, country: string) =>
      new Set(Array.from({ length: 200 }, (_, i) => matchConditions(fx(date, `h${i}`, `a${i}`), country).weather));
    // January: winter in England (snow possible, never hot), summer in Brazil (hot possible, never snow).
    const engJan = weathers("2027-01-16", "England");
    const braJan = weathers("2027-01-16", "Brazil");
    expect(engJan.has("hot")).toBe(false);
    expect(engJan.has("cold")).toBe(true);
    expect(braJan.has("snow")).toBe(false);
    expect(braJan.has("cold")).toBe(false);
    expect(braJan.has("hot")).toBe(true);
    // July flips it.
    expect(weathers("2027-07-17", "Brazil").has("cold")).toBe(true);
    // The tropics and the desert never get cold or snow.
    for (const c of ["Kenya", "Saudi Arabia"]) {
      const w = weathers("2027-01-16", c);
      expect(w.has("snow") || w.has("cold")).toBe(false);
    }
  });

  test("climate of a country", () => {
    expect(climateOf("England")).toBe("north");
    expect(climateOf("Argentina")).toBe("south");
    expect(climateOf("Colombia")).toBe("tropical");
    expect(climateOf("Egypt")).toBe("arid");
    expect(climateOf(undefined)).toBe("north");
  });
});
