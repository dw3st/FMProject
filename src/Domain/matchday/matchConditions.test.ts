import { describe, expect, test } from "bun:test";
import { SUNSET, climateOf, matchConditions } from "@/Domain/matchday/matchConditions";

const fx = (date: string, home = "33", away = "40") => ({ date, home, away });

describe("matchConditions", () => {
  test("deterministic: same fixture, same kickoff and weather", () => {
    expect(matchConditions(fx("2027-03-13"), "England")).toEqual(matchConditions(fx("2027-03-13"), "England"));
  });

  test("kickoffs follow the league's usual slots", () => {
    const at = (date: string, country: string | null, competition?: string) =>
      new Set(Array.from({ length: 200 }, (_, i) => matchConditions({ ...fx(date, `h${i}`), competition }, country).kickoff));
    // 2027-03-13 is a Saturday, 2027-03-14 a Sunday, 2027-03-16 a Tuesday.
    expect([...at("2027-03-13", "England")].every((k) => ["12:30", "15:00", "17:30", "20:00"].includes(k))).toBe(true);
    expect(at("2027-03-13", "England").has("15:00")).toBe(true);
    expect([...at("2027-03-14", "Germany")].every((k) => ["15:30", "17:30", "19:30"].includes(k))).toBe(true);
    expect([...at("2027-03-16", "Spain")].every((k) => ["19:00", "21:00", "21:30"].includes(k))).toBe(true);
    // Continental nights, an hour earlier in England.
    expect([...at("2027-03-16", "England", "ucl")].every((k) => ["17:45", "20:00"].includes(k))).toBe(true);
    expect([...at("2027-03-16", "Italy", "ucl")].every((k) => ["18:45", "21:00"].includes(k))).toBe(true);
    expect([...at("2027-03-16", "Brazil", "lib")].every((k) => ["19:00", "21:30"].includes(k))).toBe(true);
    // A country without its own table: the generic slots.
    expect([...at("2027-03-13", "Kenya")].every((k) => ["13:30", "15:00", "16:00", "17:30", "18:30", "20:00"].includes(k))).toBe(true);
    expect([...at("2027-03-16", null)].every((k) => ["19:00", "19:45", "20:00", "20:45", "21:30"].includes(k))).toBe(true);
  });

  test("the usual slot is the most common one (England Saturday: 15:00)", () => {
    const sat = Array.from({ length: 1000 }, (_, i) => matchConditions(fx("2027-03-13", `h${i}`), "England").kickoff);
    const n = (k: string) => sat.filter((x) => x === k).length;
    expect(n("15:00")).toBeGreaterThan(n("12:30"));
    expect(n("15:00")).toBeGreaterThan(n("20:00"));
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

  test("night: no sun and no heat after sunset, partly cloudy stays (moon icon in the UI)", () => {
    // Tuesdays (weekday slots 19:00..21:30). England, January: winter sunset 17:30, every slot is night.
    // Saudi Arabia (arid, sunset 18:30): sunny and hot by day, both become a clear sky at night.
    for (const [date, country] of [["2027-01-19", "England"], ["2027-07-20", "Saudi Arabia"], ["2027-01-19", "Brazil"]] as const) {
      for (let i = 0; i < 200; i++) {
        const c = matchConditions(fx(date, `h${i}`, `a${i}`), country);
        if (!c.night) continue;
        expect(c.weather).not.toBe("sunny");
        expect(c.weather).not.toBe("hot");
      }
    }
    const nightArid = Array.from({ length: 200 }, (_, i) => matchConditions(fx("2027-07-20", `h${i}`), "Saudi Arabia"));
    expect(nightArid.every((c) => c.night)).toBe(true);
    expect(nightArid.some((c) => c.weather === "clear")).toBe(true);
  });

  test("night only from the local sunset (season and climate)", () => {
    const night = (date: string, country: string) =>
      Array.from({ length: 80 }, (_, i) => matchConditions(fx(date, `h${i}`), country));
    // Brazil in January is summer (sunset 20:30): a 20:00 kickoff is still day, 20:45 is night.
    for (const c of night("2027-01-19", "Brazil")) expect(c.night).toBe(c.kickoff >= "20:30");
    // England in June (summer, 20:30) vs October (autumn, 19:00).
    for (const c of night("2027-06-15", "England")) expect(c.night).toBe(c.kickoff >= "20:30");
    for (const c of night("2027-10-12", "England")) expect(c.night).toBe(true);
    // Saturday afternoons are day; the weather keeps the daytime draw.
    for (const c of night("2027-03-13", "England")) expect(c.night).toBe(c.kickoff >= "19:00");
  });

  test("a 20:45 kickoff is never sunny (issue #112)", () => {
    for (const country of ["England", "Brazil", "Spain", "Kenya", "Saudi Arabia", "Argentina"]) {
      for (const date of ["2027-01-19", "2027-04-13", "2027-07-20", "2027-10-12"]) {
        for (let i = 0; i < 100; i++) {
          const c = matchConditions(fx(date, `h${i}`, `a${i}`), country);
          if (c.kickoff !== "20:45") continue;
          expect(c.night).toBe(true);
          expect(["sunny", "hot"]).not.toContain(c.weather);
        }
      }
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

describe("matchConditions sunset", () => {
  test("sunset is the season's (north summer, south winter), and night follows it", () => {
    const july = matchConditions({ date: "2027-07-10", home: "a", away: "b" }, "England");
    expect(july.sunset).toBe(SUNSET.summer);
    expect(july.night).toBe(july.kickoff >= july.sunset);
    const julySouth = matchConditions({ date: "2027-07-10", home: "a", away: "b" }, "Brazil");
    expect(julySouth.sunset).toBe(SUNSET.winter);
    expect(matchConditions({ date: "2027-07-10", home: "a", away: "b" }, "Kenya").sunset).toBe(SUNSET.tropical);
  });
});
