import { expect, test } from "bun:test";
import { MATCH_FOG, matchHasFog } from "@/Domain/matchday/matchFog";

test("fog only in overcast or cold matches, about the set share, never under a roof", () => {
  const seeds = Array.from({ length: 2000 }, (_, i) => `m${i}`);
  expect(seeds.some((s) => matchHasFog("rain", s))).toBe(false);
  expect(seeds.some((s) => matchHasFog("sunny", s))).toBe(false);
  expect(seeds.some((s) => matchHasFog("cloudy", s, true))).toBe(false);
  const share = seeds.filter((s) => matchHasFog("cloudy", s)).length / seeds.length;
  expect(Math.abs(share - MATCH_FOG.SHARE)).toBeLessThan(0.05);
  expect(matchHasFog("cold", "x")).toBe(matchHasFog("cold", "x"));
});
