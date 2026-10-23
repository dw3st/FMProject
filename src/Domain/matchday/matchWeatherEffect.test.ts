import { describe, expect, test } from "bun:test";
import { effectiveWeather, weatherEffectKey } from "@/Domain/matchday/matchWeatherEffect";

describe("effectiveWeather", () => {
  test("a roof cancels rain, snow and wind, not heat or cold", () => {
    expect(effectiveWeather("rain", true)).toBe("cloudy");
    expect(effectiveWeather("snow", true)).toBe("cloudy");
    expect(effectiveWeather("wind", true)).toBe("cloudy");
    expect(effectiveWeather("hot", true)).toBe("hot");
    expect(effectiveWeather("cold", true)).toBe("cold");
  });
  test("open stadium keeps the weather", () => {
    expect(effectiveWeather("rain", false)).toBe("rain");
  });
});

describe("weatherEffectKey", () => {
  test("text key of the effective weather, covered note, or none", () => {
    expect(weatherEffectKey({ weather: "rain", covered: false, effective: "rain" })).toBe("weatherEffect.rain");
    expect(weatherEffectKey({ weather: "rain", covered: true, effective: "cloudy" })).toBe("weatherEffect.covered");
    expect(weatherEffectKey({ weather: "sunny", covered: true, effective: "sunny" })).toBeNull();
    expect(weatherEffectKey({ weather: "cloudy", covered: false, effective: "cloudy" })).toBeNull();
    expect(weatherEffectKey({ weather: "hot", covered: false, effective: "hot" })).toBe("weatherEffect.hot");
  });
  test("a neutral venue (drawn weather with an effect, played neutral, no roof) says the weather does not count", () => {
    expect(weatherEffectKey({ weather: "rain", covered: false, effective: "sunny" })).toBe("weatherEffect.neutral");
    expect(weatherEffectKey({ weather: "hot", covered: false, effective: "sunny" })).toBe("weatherEffect.neutral");
    expect(weatherEffectKey({ weather: "cloudy", covered: false, effective: "sunny" })).toBeNull();
  });
});
