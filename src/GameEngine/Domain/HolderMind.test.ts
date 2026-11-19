import { describe, expect, test } from "bun:test";
import { spyMatchRandom } from '@/GameEngine/Support/spyMatchRandom';
import {
  argmaxIndex, facingAwayWiden, fatigueLapseMult, formOf, formWindow, moodBand, moodOf, perceiveScores, releaseFires,
  rollMindWindow, sigmaOf, windowedRoll, longShotRange,
} from "@/GameEngine/Domain/HolderMind";
import { HOLDER_MIND } from "@/GameEngine/Configs/DecisionConfig";
import { mulberry32 } from "@/Domain/rng";

describe("holder mind rules", () => {
  test("mood bands and form", () => {
    expect(moodBand(0.4)).toBe("good");
    expect(moodBand(-0.4)).toBe("bad");
    expect(moodBand(0)).toBe("normal");
    expect(formOf([])).toBe(0);
    expect(formOf([8, 8])).toBe(1);
    expect(moodOf(1, 1)).toBe(1);
  });

  test("form window: below it a roll under 1 is a lapse, at or above it the roll is floored at 1", () => {
    expect(formWindow(0)).toBe(35);
    expect(formWindow(14)).toBe(49);
    expect(formWindow(15)).toBe(35);
    expect(windowedRoll(0.5, 30, 40)).toEqual({ roll: 0, lapse: true });
    expect(windowedRoll(0.5, 60, 40)).toEqual({ roll: 1, lapse: false });
    expect(windowedRoll(5, 30, 40)).toEqual({ roll: 5, lapse: false });
    // Tired: the roll is divided by the fatigue factor before the test.
    expect(windowedRoll(1.5, 30, 40, 2).lapse).toBe(true);
    expect(fatigueLapseMult(100, 0.5)).toBe(1);
    expect(fatigueLapseMult(0, 0.5)).toBe(1 + HOLDER_MIND.LAPSE_FATIGUE);
  });

  test("release under pressure", () => {
    expect(releaseFires(0, 0, 10, 0)).toBe(false);
    // pN 0.9 near goal with nobody open: released.
    expect(releaseFires(0.9, 10, 20, 0)).toBe(true);
    // Same far from goal with three open options: not.
    expect(releaseFires(0.9, 10, 90, 3)).toBe(false);
    expect(releaseFires(0.9, 10, 60, 0)).toBe(true);
    // Facing away widens the window: a case just over the line is held back.
    const d = ((0.9 * 100 - 5) * 10) / HOLDER_MIND.RELEASE_K;
    // More open options raise the bar.
    expect(releaseFires(0.9, 10, d * 0.98, 2)).toBe(false);
    expect(releaseFires(0.9, 10, d * 0.98, 0)).toBe(true);
    expect(releaseFires(0.9, 10, d * 0.98, 0, 0.12)).toBe(false);
  });

  test("facing away", () => {
    const p = { x: 50, y: 37, attackDir: 1 as const };
    expect(facingAwayWiden({ ...p, vel: { x: 3, y: 0 } }, 0.5)).toBe(0);
    expect(facingAwayWiden({ ...p, vel: { x: -3, y: 0 } }, 0.1)).toBeCloseTo(0.11);
    expect(facingAwayWiden({ ...p, vel: { x: -3, y: 0 } }, 1)).toBeCloseTo(0.12);
    expect(facingAwayWiden({ ...p }, 1)).toBe(0);
  });

  test("perceived scores keep infeasible options at 0 and noise the rest", () => {
    const st = { ticks: 4, dec: 20, comp: 20, flair: 20, lapse: false, sigma: 0.05, z: [1, 1, 1, 1, 1, 1, 1], lapseMul: [] };
    const v = perceiveScores([0.5, 0, 0.3, 0, 0, 0, 0], [0, 0, 0.01, 0, 0, 0, 0], st);
    expect(v[0]).toBeCloseTo(0.55);
    expect(v[1]).toBe(0);
    expect(v[2]).toBeCloseTo(0.36);
    expect(argmaxIndex(v)).toBe(0);
  });

  test("σ falls with the decisions attribute and the roll", () => {
    expect(sigmaOf(0.65, 65, 67)).toBeCloseTo(HOLDER_MIND.SIGMA_MIN, 5);
    expect(sigmaOf(0.3, 30, 1)).toBeGreaterThan(sigmaOf(0.6, 60, 50));
    expect(sigmaOf(0, 0, 0)).toBeCloseTo(HOLDER_MIND.SIGMA_MIN + HOLDER_MIND.SIGMA_SPAN, 5);
  });

  test("a window always draws the same number of dice (without a lapse)", () => {
    const m = { decisions: 0.8, composure: 0.5, flair: 0.5, anticipation: 0.5, consistency: 0.5, mood: 0 };
    let n = 0;
    const rng = mulberry32(1);
    const spy = spyMatchRandom().mockImplementation(() => { n++; return rng(); });
    try {
      const w = rollMindWindow(m, 100, 3);
      expect(w.ticks).toBe(HOLDER_MIND.WINDOW_TICKS);
      expect(w.z.length).toBe(7);
      expect(w.lapse).toBe(false);
      expect(n).toBe(3 + 14);
      expect(longShotRange(w)).toBeGreaterThanOrEqual(HOLDER_MIND.LONG_SHOT_BASE_YD);
    } finally {
      spy.mockRestore();
    }
  });
});
