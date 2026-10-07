import { expect, test } from "bun:test";
import { applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS, dpRequired } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";

const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 };

const isOneDecimal = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

test("a step costs a tenth of the old level cost", () => {
  expect(dpRequired(5)).toBeCloseTo((10 * (1 + 25 * 0.1)) / 10, 9);
});

test("changes are 0.1 steps and values keep one decimal", () => {
  const p = { id: "x", name: "x", age: 18, positions: ["CM"], stats } as unknown as RosterPlayer;
  const r = applyDevelopment(p, 8.6, DEFAULT_DP_WEIGHTS);
  for (const c of r.levelChanges?.changes ?? []) {
    expect(Math.abs(c.delta)).toBeCloseTo(0.1, 9);
    expect(isOneDecimal(c.newValue)).toBe(true);
  }
  expect(r.levelChanges).not.toBeNull();
});

test("a fresh player is not handed free steps by the progress seed", () => {
  const p = { id: "x", name: "x", age: 24, positions: ["CM"], stats } as unknown as RosterPlayer;
  const r = applyTrainingDevelopment(p, "light", DEFAULT_DP_WEIGHTS);
  expect(r.levelChanges).toBeNull();
});

test("several steps in one call aggregate into one entry per stat", () => {
  const p = {
    id: "x", name: "x", age: 18, positions: ["CM"], stats,
    progress: { passing: 9.9, vision: 0.1, finishing: 0.1, dribbling: 0.1, speed: 0.1, acceleration: 0.1,
      tackling: 0.1, pressing: 0.1, stamina: 0.1, heading: 0.1, strength: 0.1, reflex: 0.1, jump: 0.1 },
  } as unknown as RosterPlayer;
  const r = applyDevelopment(p, 6.4, DEFAULT_DP_WEIGHTS);
  const passing = (r.levelChanges?.changes ?? []).filter((c) => c.stat === "passing");
  expect(passing).toHaveLength(1);
  expect(passing[0]!.delta).toBeCloseTo(0.2, 9);
  expect(passing[0]!.newValue).toBeCloseTo(5.2, 9);
  expect(r.updatedPlayer.stats.passing).toBe(5.2);
});

test("decline steps down by 0.1 and keeps one decimal", () => {
  const p = {
    id: "x", name: "x", age: 35, positions: ["CM"], stats,
    progress: { passing: 0.01, vision: 0.01, finishing: 0.01, dribbling: 0.01, speed: 0.01, acceleration: 0.01,
      tackling: 0.01, pressing: 0.01, stamina: 0.01, heading: 0.01, strength: 0.01, reflex: 0.01, jump: 0.01 },
  } as unknown as RosterPlayer;
  const r = applyDevelopment(p, 0, DEFAULT_DP_WEIGHTS);
  const changes = r.levelChanges?.changes ?? [];
  expect(changes.length).toBeGreaterThan(0);
  for (const c of changes) {
    expect(c.delta).toBeLessThan(0);
    expect(isOneDecimal(c.delta)).toBe(true);
    expect(isOneDecimal(c.newValue)).toBe(true);
  }
});
