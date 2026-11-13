import { describe, expect, test } from "bun:test";
import { applyDevelopment, applyTrainingDevelopment, decayDpScale, DEFAULT_DP_WEIGHTS, dpRequired } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";

const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 };

const isOneDecimal = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

test("a step costs a tenth of the old level cost", () => {
  expect(dpRequired(5)).toBeCloseTo((10 * (1 + 25 * 0.1)) / 10, 9);
});

test("changes are 0.1 steps and values keep one decimal", () => {
  const p = {
    id: "x", name: "x", age: 18, positions: ["CM"], stats,
    progress: { passing: 3.0, vision: 0.1, finishing: 0.1, dribbling: 0.1, speed: 0.1, acceleration: 0.1,
      tackling: 0.1, pressing: 0.1, stamina: 0.1, heading: 0.1, strength: 0.1, reflex: 0.1, jump: 0.1 },
  } as unknown as RosterPlayer;
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

test("age decay scale by band (pace calibration)", () => {
  expect(decayDpScale(28)).toBe(1.0);
  expect(decayDpScale(30)).toBe(0.39);
  expect(decayDpScale(34)).toBe(0.39);
  expect(decayDpScale(35)).toBe(0.7);
});

describe("elite brake (11.1)", () => {
  test("full growth up to FROM, MIN from TO on, linear between", async () => {
    const { ELITE_BRAKE, eliteBrake } = await import("@/GameEngine/PlayerDevelopment");
    expect(eliteBrake(4)).toBe(1);
    expect(eliteBrake(ELITE_BRAKE.FROM)).toBe(1);
    expect(eliteBrake(ELITE_BRAKE.TO)).toBe(ELITE_BRAKE.MIN);
    expect(eliteBrake(9)).toBe(ELITE_BRAKE.MIN);
    const mid = eliteBrake((ELITE_BRAKE.FROM + ELITE_BRAKE.TO) / 2);
    expect(mid).toBeCloseTo((1 + ELITE_BRAKE.MIN) / 2, 6);
  });

  test("a top player grows less than before from the same training; a common one the same", async () => {
    const { ELITE_BRAKE, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS } = await import("@/GameEngine/PlayerDevelopment");
    const flat = (v: number) => ({
      id: `p${v}`, name: "P", age: 18, squadId: "s", preferredFoot: "right", positions: ["Midfielder"],
      stats: { passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v },
      profile: { summary: "", archetype: "" }, nationality: null,
    }) as never;
    const gain = (v: number) => {
      let p = flat(v) as { stats: Record<string, number> };
      for (let i = 0; i < 150; i++) p = applyTrainingDevelopment(p as never, "heavy", DEFAULT_DP_WEIGHTS).updatedPlayer as never;
      return Object.values(p.stats).reduce((s, x) => s + x, 0) - v * 13;
    };
    const saved = { ...ELITE_BRAKE };
    const braked = { common: gain(5), top: gain(7.2) };
    Object.assign(ELITE_BRAKE, { FROM: 99, TO: 100, MIN: 1 });
    const free = { common: gain(5), top: gain(7.2) };
    Object.assign(ELITE_BRAKE, saved);
    expect(braked.common).toBe(free.common);
    expect(free.top).toBeGreaterThan(0);
    expect(braked.top).toBeLessThan(free.top * 0.4);
  });
});
