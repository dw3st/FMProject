import { describe, expect, test } from "bun:test";
import { aiDive, aiKick, areaOf, areaTarget, ballPoint, GOAL_AREAS, parsePenaltyChoice, resolveKick, saveChance } from "@/Domain/penalty/penaltyKick";
import { mulberry32 } from "@/Domain/rng";

const avgKeeper = { reflex: 0.5, diving: 0.5 };

/** Conversion of the AI's kick (finishing `acc`, strength `str`) against the AI keeper's dive. */
function conversion(acc: number, str: number, seed = 11, n = 20000): number {
  const rng = mulberry32(seed);
  let goals = 0;
  for (let i = 0; i < n; i++) if (resolveKick(aiKick(rng), aiDive(rng), { accuracy: acc, strength: str, keeper: avgKeeper }, rng).scored) goals++;
  return goals / n;
}

describe("2D penalty", () => {
  test("areas split the goal in thirds and halves; every area's target is inside it", () => {
    expect(areaOf({ x: -0.8, y: 0.2 })).toBe("low-left");
    expect(areaOf({ x: 0, y: 0.7 })).toBe("high-mid");
    expect(areaOf({ x: 0.5, y: 0.6 })).toBe("high-right");
    for (const a of GOAL_AREAS) expect(areaOf(areaTarget(a))).toBe(a);
  });

  test("a perfect finisher lands closer to the chosen area than a poor one", () => {
    const spread = (acc: number) => {
      const rng = mulberry32(3);
      const t = areaTarget("low-right");
      let s = 0;
      for (let i = 0; i < 2000; i++) {
        const b = ballPoint({ area: "low-right" }, acc, rng);
        s += Math.hypot(b.x - t.x, b.y - t.y);
      }
      return s / 2000;
    };
    expect(spread(0.95)).toBeLessThan(spread(0.1) * 0.4);
  });

  test("the wrong column is a goal off the corners; the right area can save", () => {
    const ball = { x: -0.6, y: 0.2 };
    expect(saveChance(ball, "low-right", avgKeeper)).toBe(0);
    expect(saveChance(ball, "low-left", avgKeeper)).toBeGreaterThan(0.3);
    expect(saveChance(ball, "high-left", avgKeeper)).toBeLessThan(saveChance(ball, "low-left", avgKeeper));
  });

  test("a ball down the middle is sometimes reached by a keeper who dived (low more than high)", () => {
    const low = saveChance({ x: 0, y: 0.2 }, "low-left", avgKeeper);
    const high = saveChance({ x: 0, y: 0.75 }, "high-left", avgKeeper);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(high);
    expect(low).toBeLessThan(saveChance({ x: 0, y: 0.2 }, "low-mid", avgKeeper));
  });

  test("strength and finishing make a shot harder to save; a corner too", () => {
    const b = { x: -0.6, y: 0.2 };
    expect(saveChance(b, "low-left", avgKeeper, 0.9)).toBeLessThan(saveChance(b, "low-left", avgKeeper, 0.1));
    expect(saveChance(b, "low-left", avgKeeper, 0.5, 0.9)).toBeLessThan(saveChance(b, "low-left", avgKeeper, 0.5, 0.1));
    expect(saveChance({ x: -0.9, y: 0.2 }, "low-left", avgKeeper)).toBeLessThan(saveChance({ x: -0.45, y: 0.2 }, "low-left", avgKeeper));
  });

  test("calibration: average taker ~75%, a good finisher ~85%, a poor one ~65%; strength helps", () => {
    const avg = conversion(0.5, 0.5);
    expect(avg).toBeGreaterThan(0.72);
    expect(avg).toBeLessThan(0.78);
    expect(conversion(0.85, 0.5)).toBeGreaterThan(0.82);
    expect(conversion(0.2, 0.5)).toBeLessThan(0.67);
    expect(conversion(0.5, 0.9)).toBeGreaterThan(avg + 0.02);
  });

  test("no area is a sure thing: every one between 55% and 85% against the AI keeper", () => {
    for (const a of GOAL_AREAS) {
      const rng = mulberry32(5);
      let goals = 0;
      for (let i = 0; i < 10000; i++) if (resolveKick({ area: a }, aiDive(rng), { accuracy: 0.5, strength: 0.5, keeper: avgKeeper }, rng).scored) goals++;
      expect(goals / 10000).toBeGreaterThan(0.55);
      expect(goals / 10000).toBeLessThan(0.85);
    }
  });
});

describe("parsePenaltyChoice (socket)", () => {
  test("an area to shoot or to dive, nothing else", () => {
    expect(parsePenaltyChoice({ dive: "high-left" })).toEqual({ dive: "high-left" });
    expect(parsePenaltyChoice({ kick: { area: "low-right" } })).toEqual({ kick: { area: "low-right" } });
    expect(parsePenaltyChoice({ dive: "top" })).toBeNull();
    expect(parsePenaltyChoice({ kick: { area: "top" } })).toBeNull();
    expect(parsePenaltyChoice({ kick: { aim: { x: 0, y: 0.4 }, power: 0.5 } })).toBeNull();
    expect(parsePenaltyChoice({ kick: { area: "low-mid", extra: 1 } })).toBeNull();
    expect(parsePenaltyChoice({ dive: "low-mid", kick: {} })).toBeNull();
    expect(parsePenaltyChoice(null)).toBeNull();
  });
});
