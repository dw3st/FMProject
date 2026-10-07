import { expect, test } from "bun:test";
import { fitSeedAgeEffects, levelOf, VETERAN_CAP, YOUTH_CAP, type SeedRated } from "@/../scripts/transfermarkt/level";

// Deterministic spread of seed overalls; value = e^(league + 0.1·seed + premium).
const gen = (league: string, base: number, age: number, premium: number, seedShift = 0): SeedRated[] =>
  Array.from({ length: 40 }, (_, i) => {
    const seedOverall = 60 + (i % 10) * 3 + seedShift;
    return { league, age, seedOverall, value: Math.exp(base + 0.1 * seedOverall + premium) };
  });

test("youths of the same skill worth 1.3× get effect log 1.3; league offsets don't leak", () => {
  const fx = fitSeedAgeEffects([...gen("A", 8, 27, 0), ...gen("A", 8, 20, Math.log(1.3)), ...gen("B", 12, 27, 0), ...gen("B", 12, 20, Math.log(1.3))]);
  expect(fx.raw.get(20)!).toBeCloseTo(Math.log(1.3), 6);
  expect(fx.age.get(20)!).toBeCloseTo(Math.log(1.3), 6);
  expect(fx.slope).toBeCloseTo(0.1, 6);
  expect(fx.age.get(27)).toBe(0);
});

test("a weaker band whose value follows its skill gets no effect (≥ 35 share a band)", () => {
  const fx = fitSeedAgeEffects([...gen("A", 8, 27, 0), ...gen("A", 8, 37, 0, -15)]);
  expect(fx.raw.get(35)!).toBeCloseTo(0, 6);
  expect(fx.age.get(40)!).toBeCloseTo(0, 6);
});

test("caps: youth premium at most 0.5, veteran discount at most 0.7; raw keeps the estimate", () => {
  const fx = fitSeedAgeEffects([...gen("A", 8, 27, 0), ...gen("A", 8, 17, 2), ...gen("A", 8, 36, -2)]);
  expect(fx.raw.get(18)!).toBeCloseTo(2, 6);
  expect(fx.age.get(16)!).toBe(YOUTH_CAP);
  expect(fx.age.get(39)!).toBe(-VETERAN_CAP);
});

test("level removes the age premium", () => {
  const fx = { age: new Map([[20, Math.log(2)], [27, 0]]) };
  expect(levelOf({ age: 20, value: 2e6 }, fx)).toBeCloseTo(levelOf({ age: 27, value: 1e6 }, fx), 9);
});
