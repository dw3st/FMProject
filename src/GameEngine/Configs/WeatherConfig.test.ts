import { describe, expect, test } from "bun:test";
import { NEUTRAL_WEATHER, weatherEffectOf, WEATHER_EFFECTS } from "@/GameEngine/Configs/WeatherConfig";

describe("weatherEffectOf", () => {
  test("absent and neutral weathers are all 1", () => {
    for (const w of [undefined, null, "sunny", "clear", "partlyCloudy", "cloudy"] as const) {
      expect(weatherEffectOf(w)).toEqual(NEUTRAL_WEATHER);
    }
    for (const v of Object.values(NEUTRAL_WEATHER)) expect(v).toBe(1);
  });
  test("each active weather has its signature", () => {
    expect(weatherEffectOf("rain").control).toBeLessThan(1);
    expect(weatherEffectOf("rain").looseDecel).toBeLessThan(1);
    expect(weatherEffectOf("rain").gkClaim).toBeLessThan(1);
    expect(weatherEffectOf("snow").looseDecel).toBeGreaterThan(1);
    expect(weatherEffectOf("snow").carrySpeed).toBeLessThan(1);
    expect(weatherEffectOf("wind").aerialError).toBeGreaterThan(1);
    expect(weatherEffectOf("wind").longShot).toBeLessThan(1);
    expect(weatherEffectOf("hot").drain).toBeGreaterThan(1);
    expect(weatherEffectOf("cold").injury).toBeGreaterThan(1);
  });
  test("wind_rain is the product of wind and rain", () => {
    const wr = weatherEffectOf("wind_rain");
    expect(wr.control).toBeCloseTo(weatherEffectOf("rain").control * weatherEffectOf("wind").control, 10);
    expect(wr.aerialError).toBeCloseTo(weatherEffectOf("rain").aerialError * weatherEffectOf("wind").aerialError, 10);
  });
  test("overrides patch the table in place", () => {
    const before = WEATHER_EFFECTS.hot!.drain;
    WEATHER_EFFECTS.hot!.drain = 1.5;
    expect(weatherEffectOf("hot").drain).toBe(1.5);
    WEATHER_EFFECTS.hot!.drain = before;
  });
});
