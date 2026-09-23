import { describe, expect, test } from "bun:test";
import type { PlayerStatsRecord } from "@/types/playerTypes";
import {
  applyFormBias,
  computeBuffedStats,
  LEVEL_EFFECT,
  roll,
  type EffectTable,
} from "@/Domain/PlayerBuffs";

function sumTable(t: EffectTable): number {
  return t.neg2 + t.neg1 + t.zero + t.pos1 + t.pos2;
}

function baseStats(): PlayerStatsRecord {
  return {
    passing: 6,
    vision: 6,
    finishing: 6,
    dribbling: 6,
    speed: 6,
    acceleration: 6,
    tackling: 6,
    pressing: 6,
    stamina: 6,
    heading: 6,
    strength: 6,
    reflex: 6,
    jump: 6,
  };
}

describe("roll", () => {
  test("returns only -2, -1, 0, 1, or 2", () => {
    const table = LEVEL_EFFECT[3];
    for (let i = 0; i < 5000; i++) {
      const d = roll(table);
      expect([-2, -1, 0, 1, 2]).toContain(d);
    }
  });

  test("deterministic thresholds", () => {
    const t: EffectTable = { neg2: 10, neg1: 20, zero: 30, pos1: 25, pos2: 15 };
    expect(roll(t, () => 0.0)).toBe(-2);
    expect(roll(t, () => 0.099)).toBe(-2);
    expect(roll(t, () => 0.1)).toBe(-1);
    expect(roll(t, () => 0.29)).toBe(-1);
    expect(roll(t, () => 0.3)).toBe(0);
    expect(roll(t, () => 0.59)).toBe(0);
    expect(roll(t, () => 0.6)).toBe(1);
    expect(roll(t, () => 0.84)).toBe(1);
    expect(roll(t, () => 0.85)).toBe(2);
    expect(roll(t, () => 0.999)).toBe(2);
  });
});

describe("applyFormBias", () => {
  test("leaves zero unchanged and total probability at 100", () => {
    const base = LEVEL_EFFECT[3];
    for (const form of [1, 2, 3, 4, 5] as const) {
      const out = applyFormBias(base, form);
      expect(out.zero).toBe(base.zero);
      expect(sumTable(out)).toBe(100);
    }
  });

  test("form 5 shifts mass from negative to positive for level-3 table", () => {
    const base = LEVEL_EFFECT[3];
    const out = applyFormBias(base, 5);
    expect(out.neg1).toBe(5);
    expect(out.pos1).toBe(25);
    expect(out.zero).toBe(70);
  });

  test("form 1 shifts mass from positive to negative for level-3 table", () => {
    const base = LEVEL_EFFECT[3];
    const out = applyFormBias(base, 1);
    expect(out.neg1).toBe(25);
    expect(out.pos1).toBe(5);
    expect(out.zero).toBe(70);
  });
});

describe("computeBuffedStats", () => {
  test("clamps all attributes to [0, 10]", () => {
    const low = baseStats();
    for (const k of Object.keys(low) as (keyof PlayerStatsRecord)[]) {
      low[k] = 0;
    }
    const rng = () => 0.99;
    const out = computeBuffedStats(low, 5, 5, 5, rng);
    for (const k of Object.keys(out) as (keyof PlayerStatsRecord)[]) {
      expect(out[k]).toBeGreaterThanOrEqual(0);
      expect(out[k]).toBeLessThanOrEqual(10);
    }
  });

  test("neutral bands (3/3/3) leave most attributes unchanged on average", () => {
    let totalChanged = 0;
    const runs = 800;
    for (let i = 0; i < runs; i++) {
      const s = baseStats();
      const out = computeBuffedStats(s, 3, 3, 3);
      let changed = 0;
      for (const k of Object.keys(s) as (keyof PlayerStatsRecord)[]) {
        if (out[k] !== s[k]) changed++;
      }
      totalChanged += changed;
    }
    const avg = totalChanged / runs;
    expect(avg).toBeLessThan(4);
    expect(avg).toBeGreaterThan(0.2);
  });

  test("high training + high form skews mean total delta positive over many runs", () => {
    const s = baseStats();
    let sumDelta = 0;
    const runs = 3000;
    for (let i = 0; i < runs; i++) {
      const out = computeBuffedStats(s, 5, 5, 5);
      for (const k of Object.keys(s) as (keyof PlayerStatsRecord)[]) {
        sumDelta += out[k] - s[k];
      }
    }
    expect(sumDelta / runs).toBeGreaterThan(0.15);
  });

  test("low training + low form skews mean total delta negative over many runs", () => {
    const s = baseStats();
    let sumDelta = 0;
    const runs = 3000;
    for (let i = 0; i < runs; i++) {
      const out = computeBuffedStats(s, 1, 1, 1);
      for (const k of Object.keys(s) as (keyof PlayerStatsRecord)[]) {
        sumDelta += out[k] - s[k];
      }
    }
    expect(sumDelta / runs).toBeLessThan(-0.15);
  });

  test("affects only a small subset of attributes per call on average", () => {
    const s = baseStats();
    let totalNonZero = 0;
    const runs = 1000;
    for (let i = 0; i < runs; i++) {
      const out = computeBuffedStats(s, 3, 3, 3);
      let nz = 0;
      for (const k of Object.keys(s) as (keyof PlayerStatsRecord)[]) {
        if (out[k] !== s[k]) nz++;
      }
      totalNonZero += nz;
    }
    const avg = totalNonZero / runs;
    expect(avg).toBeLessThan(3.5);
    expect(avg).toBeGreaterThan(0.5);
  });
});
