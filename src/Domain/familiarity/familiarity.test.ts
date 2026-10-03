import { describe, expect, test } from "bun:test";
import {
  aiFamiliarity,
  familiarityFactor,
  familiarityOf,
  initialFamiliarity,
  squadFamiliarityLevels,
  trainFamiliarity,
} from "@/Domain/familiarity/familiarity";
import { FAMILIARITY } from "@/Domain/familiarity/familiarityConfig";
import { FAMILIARITY_KEYS } from "@/types/familiarityTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (extra: Partial<Squad> = {}): Squad =>
  ({ id: "s", name: "S", colors: ["#000", "#fff"], money: 0, players: [], ...extra }) as Squad;

describe("familiarityFactor", () => {
  test("0 at 50, +1 at 100, -1 at 0, linear and clamped", () => {
    expect(familiarityFactor(50)).toBe(0);
    expect(familiarityFactor(100)).toBe(1);
    expect(familiarityFactor(0)).toBe(-1);
    expect(familiarityFactor(75)).toBeCloseTo(0.5);
    expect(familiarityFactor(150)).toBe(1);
    expect(familiarityFactor(-20)).toBe(-1);
    expect(familiarityFactor(undefined)).toBe(0);
  });
});

describe("initialFamiliarity", () => {
  test("every key at INITIAL, the saved style at SAVED_STYLE_INITIAL", () => {
    const r = initialFamiliarity("possession");
    for (const k of FAMILIARITY_KEYS) {
      expect(r[k]).toBe(k === "possession" ? FAMILIARITY.SAVED_STYLE_INITIAL : FAMILIARITY.INITIAL);
    }
  });
});

describe("familiarityOf / levels", () => {
  test("absent record or key = INITIAL", () => {
    expect(familiarityOf(squad(), "possession")).toBe(FAMILIARITY.INITIAL);
    expect(familiarityOf(squad({ styleFamiliarity: { possession: 90 } }), "possession")).toBe(90);
    expect(familiarityOf(squad({ styleFamiliarity: { possession: 90 } }), "high_press")).toBe(FAMILIARITY.INITIAL);
  });

  test("AI: own style at AI_OWN_STYLE, everything else at AI_OTHER", () => {
    const r = aiFamiliarity("balanced");
    expect(r.balanced).toBe(FAMILIARITY.AI_OWN_STYLE);
    expect(r.possession).toBe(FAMILIARITY.AI_OTHER);
    expect(r.long_ball).toBe(FAMILIARITY.AI_OTHER);
  });

  test("squadFamiliarityLevels: the human club's record, AI rules otherwise", () => {
    const human = squad({ styleFamiliarity: { possession: 88 } });
    expect(squadFamiliarityLevels(human, "possession").possession).toBe(88);
    expect(squadFamiliarityLevels(squad(), "high_press")).toEqual(aiFamiliarity("high_press"));
  });
});

describe("trainFamiliarity", () => {
  test("focus gains GAIN × devMult × (1 - v/100); others decay to the floor", () => {
    const start = { possession: 50, high_press: 60, balanced: 30.1, long_ball: 20 };
    const next = trainFamiliarity(start, "possession", 1);
    expect(next.possession).toBeCloseTo(50 + FAMILIARITY.GAIN_PER_SESSION * 0.5);
    expect(next.high_press).toBeCloseTo(60 - FAMILIARITY.DECAY_PER_DAY);
    expect(next.balanced).toBe(FAMILIARITY.DECAY_FLOOR);
    // Already below the floor: decay never pulls it further down, and never lifts it either.
    expect(next.long_ball).toBe(20);
    // Absent keys start from INITIAL and decay.
    expect(next.direct_play).toBeCloseTo(FAMILIARITY.INITIAL - FAMILIARITY.DECAY_PER_DAY);
  });

  test("the assistant multiplies the gain", () => {
    const a = trainFamiliarity({ possession: 50 }, "possession", 1.15).possession!;
    const b = trainFamiliarity({ possession: 50 }, "possession", 0.9).possession!;
    expect(a - 50).toBeCloseTo(1.15);
    expect(b - 50).toBeCloseTo(0.9);
  });

  test("soft cap: never passes 100, gains shrink near the top", () => {
    let r: Record<string, number> = { possession: 50 };
    for (let i = 0; i < 2000; i++) r = trainFamiliarity(r, "possession", 1.15);
    expect(r.possession).toBeLessThanOrEqual(100);
    expect(r.possession).toBeGreaterThan(99);
  });

  test("no focus: everything decays", () => {
    const next = trainFamiliarity({ possession: 70 }, undefined, 1);
    expect(next.possession).toBeCloseTo(70 - FAMILIARITY.DECAY_PER_DAY);
  });

  test("pure: does not mutate the input", () => {
    const start = { possession: 50 };
    trainFamiliarity(start, "possession", 1);
    expect(start).toEqual({ possession: 50 });
  });
});
