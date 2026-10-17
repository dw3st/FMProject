import { describe, expect, test } from "bun:test";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import { matchClockMinutes, matchLighting, minutesOf } from "@/GraficsEngine/matchLighting";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";

const sun: StadiumSun = { stadiumId: "std_t", side: "top", lean: 0, covered: false, height: 1, cut: "lean", cutX: 20, cutDepth: 0.35, sideSteps: [1], endShadow: false, endDepth: 0.2, endSteps: [1] };

describe("matchClockMinutes", () => {
  const base = { extraTimeFirst: 120, extraTimeSecond: 180, etStoppageFirst: 60 };
  test("halves, break and extra time", () => {
    const k = minutesOf("17:30");
    expect(matchClockMinutes({ ...base, matchPhase: "preMatch", matchTime: 0 }, k)).toBe(k);
    expect(matchClockMinutes({ ...base, matchPhase: "firstHalf", matchTime: 600 }, k)).toBe(k + 10);
    expect(matchClockMinutes({ ...base, matchPhase: "halfTime", matchTime: 0 }, k)).toBe(k + 47);
    expect(matchClockMinutes({ ...base, matchPhase: "secondHalf", matchTime: 0 }, k)).toBe(k + 62);
    expect(matchClockMinutes({ ...base, matchPhase: "secondHalf", matchTime: 2700 }, k)).toBe(k + 107);
    expect(matchClockMinutes({ ...base, matchPhase: "extraTimeFirst", matchTime: 0 }, k)).toBe(k + 107 + 3 + 5);
    expect(matchClockMinutes({ ...base, matchPhase: "extraTimeSecond", matchTime: 0 }, k)).toBe(k + 107 + 3 + 5 + 16);
  });
});

describe("matchLighting", () => {
  const S = minutesOf("19:00");
  const at = (clock: number, weather: MatchWeather = "sunny") =>
    matchLighting({ clock, sunset: S, weather, sun });

  test("day: no darkness, stand shadow over 30% of the pitch, one sun shadow", () => {
    const l = at(S - 180);
    expect(l.dark.alpha).toBe(0);
    expect(l.flood).toBe(0);
    expect(l.stand.depth).toBeCloseTo(0.3, 5);
    expect(l.shadows.filter((x) => x.kind === "cast")).toHaveLength(1);
    expect(l.shadows.filter((x) => x.kind === "contact")).toHaveLength(1);
  });

  test("golden hour grows the stand shadow and the warm tint; continuous across the bands", () => {
    expect(at(S - 30).stand.depth).toBeCloseTo(0.7, 5);
    expect(at(S - 30).warm.alpha).toBeGreaterThan(at(S - 90).warm.alpha);
    for (const edge of [S - 90, S - 30, S + 30]) {
      const a = at(edge - 0.01), b = at(edge + 0.01);
      expect(Math.abs(a.dark.alpha - b.dark.alpha)).toBeLessThan(0.01);
      expect(Math.abs(a.stand.alpha - b.stand.alpha)).toBeLessThan(0.01);
    }
  });

  test("night: dark, floodlights on, four flood shadows, no sun", () => {
    const l = at(S + 60);
    expect(l.dark.alpha).toBeCloseTo(0.38, 5);
    expect(l.flood).toBe(1);
    expect(l.stand.alpha).toBe(0);
    expect(l.shadows.filter((x) => x.kind === "cast")).toHaveLength(4);
  });

  test("clouds take the sun shadows away and add a veil", () => {
    const l = at(S - 180, "cloudy");
    expect(l.shadows.filter((x) => x.kind === "cast")).toHaveLength(0);
    expect(l.stand.alpha).toBe(0);
    expect(l.veil.alpha).toBeGreaterThan(0);
  });

  test("sun on the top touchline: shadows point down (+y)", () => {
    const l = at(S - 180);
    expect(Math.sin(l.shadows.find((x) => x.kind === "cast")!.angle)).toBeGreaterThan(0);
  });

  test("end stand: grows toward sunset, none without it", () => {
    const end = { ...sun, endShadow: true };
    const day = matchLighting({ clock: S - 180, sunset: S, weather: "sunny", sun: end }).stand.endDepth;
    const dusk = matchLighting({ clock: S - 30, sunset: S, weather: "sunny", sun: end }).stand.endDepth;
    expect(dusk).toBeCloseTo(0.2 * 115, 5);
    expect(day).toBeCloseTo(0.2 * 115 * 0.35, 5);
    expect(at(S - 30).stand.endDepth).toBe(0);
  });

  test("taller stands cast a longer shadow, capped", () => {
    const tall = matchLighting({ clock: S - 30, sunset: S, weather: "sunny", sun: { ...sun, height: 1.25 } });
    expect(tall.stand.depth).toBeCloseTo(0.85, 5);
    const low = matchLighting({ clock: S - 180, sunset: S, weather: "sunny", sun: { ...sun, height: 0.8 } });
    expect(low.stand.depth).toBeCloseTo(0.24, 5);
  });

  test("covered stadium: no sun, no weather, lights on, half the night", () => {
    const cov = { ...sun, covered: true };
    const day = matchLighting({ clock: S - 180, sunset: S, weather: "rain", sun: cov });
    expect(day.covered).toBe(true);
    expect(day.stand.alpha).toBe(0);
    expect(day.veil.alpha).toBe(0);
    expect(day.warm.alpha).toBe(0);
    expect(day.shadows.filter((x) => x.kind === "cast")).toHaveLength(4);
    const night = matchLighting({ clock: S + 60, sunset: S, weather: "sunny", sun: cov });
    expect(night.dark.alpha).toBeCloseTo(0.38 * 0.5, 5);
  });
});
