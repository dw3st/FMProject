import { describe, expect, test } from "bun:test";
import {
  addMatchLoad,
  addTrainingLoad,
  decayLoad,
  drainMultiplier,
  postMatchFitness,
  recoverDay,
} from "@/Domain/fitness/fitness";
import { FITNESS } from "@/Domain/fitness/fitnessConfig";

describe("postMatchFitness", () => {
  test("rounds the end-of-match energy", () => {
    expect(postMatchFitness(62.4)).toBe(62);
    expect(postMatchFitness(62.6)).toBe(63);
  });

  test("clamps to 0..100", () => {
    expect(postMatchFitness(-5)).toBe(0);
    expect(postMatchFitness(104)).toBe(100);
  });
});

describe("recoverDay", () => {
  // Design example (docs/superpowers/specs/2026-09-27-stamina-design.md §1): a 26-year-old, no
  // accumulated load, stamina 7, recovering from a post-match fitness of 55. RECOVERY_BASE was
  // raised 0.35 → 0.45 (balance task, feat/stamina) — a tight-calendar squad was recovering too
  // slowly between matches even at moderate load. The honest curve is now
  // 55 → 76.1 → 87.3 → 93.2 → 96.4, one value per rest day (each `toBeCloseTo(target, 0)`, i.e.
  // within 0.5 of the exact recurrence `f += (100 − f) × rate`).
  test("matches the design example curve (55, 26yo, load 0, stamina 7)", () => {
    const p = { age: 26, load: 0, stamina: 7 };
    let fitness = 55;
    const days: number[] = [];
    for (let i = 0; i < 4; i++) {
      fitness = recoverDay(fitness, p);
      days.push(fitness);
    }
    const targets = [76.1, 87.3, 93.2, 96.4];
    for (let i = 0; i < targets.length; i++) {
      expect(days[i]!).toBeCloseTo(targets[i]!, 0);
    }
  });

  test("recovers slower at load >= LOAD_HIGH than at load 0 (half the rate)", () => {
    const p = { age: 26, stamina: 7 };
    const lowLoad = recoverDay(55, { ...p, load: 0 });
    const highLoad = recoverDay(55, { ...p, load: FITNESS.LOAD_HIGH });
    const lowGain = lowLoad - 55;
    const highGain = highLoad - 55;
    expect(highGain).toBeCloseTo(lowGain * 0.5, 5);
  });

  test("recovers slower for an over-32 player than a 26-year-old", () => {
    const base = { load: 0, stamina: 7 };
    const young = recoverDay(55, { ...base, age: 26 });
    const old = recoverDay(55, { ...base, age: 33 });
    expect(old - 55).toBeLessThan(young - 55);
  });

  test("never exceeds 100", () => {
    expect(recoverDay(99.9, { age: 20, load: 0, stamina: 10 })).toBeLessThanOrEqual(100);
    expect(recoverDay(100, { age: 20, load: 0, stamina: 10 })).toBe(100);
  });

  test("is monotonic — repeated recovery days never decrease fitness and always approach 100", () => {
    let fitness = 40;
    const p = { age: 26, load: 50, stamina: 5 };
    for (let i = 0; i < 10; i++) {
      const next = recoverDay(fitness, p);
      expect(next).toBeGreaterThanOrEqual(fitness);
      fitness = next;
    }
    expect(fitness).toBeGreaterThan(90);
    expect(fitness).toBeLessThanOrEqual(100);
  });
});

describe("decayLoad", () => {
  test("halves over one half-life (4 days)", () => {
    expect(decayLoad(100, FITNESS.LOAD_HALF_LIFE_DAYS)).toBeCloseTo(50, 5);
  });

  test("defaults to a single day", () => {
    expect(decayLoad(100)).toBe(decayLoad(100, 1));
  });

  test("quarters over two half-lives (8 days)", () => {
    expect(decayLoad(100, FITNESS.LOAD_HALF_LIFE_DAYS * 2)).toBeCloseTo(25, 5);
  });
});

describe("addMatchLoad", () => {
  test("adds the minutes played", () => {
    expect(addMatchLoad(0, 90)).toBe(90);
    expect(addMatchLoad(50, 120)).toBe(170);
  });
});

describe("addTrainingLoad", () => {
  test("only heavy training adds load", () => {
    expect(addTrainingLoad(10, "light")).toBe(10);
    expect(addTrainingLoad(10, "normal")).toBe(10);
    expect(addTrainingLoad(10, "heavy")).toBe(10 + FITNESS.HEAVY_TRAINING_LOAD);
  });
});

describe("drainMultiplier", () => {
  test("is 1 at load 0", () => {
    expect(drainMultiplier(0)).toBe(1);
  });

  test("is 1 + LOAD_DRAIN_BONUS at LOAD_HIGH and beyond", () => {
    expect(drainMultiplier(FITNESS.LOAD_HIGH)).toBeCloseTo(1 + FITNESS.LOAD_DRAIN_BONUS, 10);
    expect(drainMultiplier(FITNESS.LOAD_HIGH * 2)).toBeCloseTo(1 + FITNESS.LOAD_DRAIN_BONUS, 10);
  });

  test("is linear between 0 and LOAD_HIGH", () => {
    const half = FITNESS.LOAD_HIGH / 2;
    expect(drainMultiplier(half)).toBeCloseTo(1 + FITNESS.LOAD_DRAIN_BONUS / 2, 10);
  });
});
