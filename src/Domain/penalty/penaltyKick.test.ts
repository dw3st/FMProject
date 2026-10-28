import { describe, expect, test } from "bun:test";
import { aiDive, aiKick, areaOf, ballPoint, parsePenaltyChoice, powerAt, resolveKick, saveChance } from "@/Domain/penalty/penaltyKick";
import { mulberry32 } from "@/Domain/rng";

const avgKeeper = { reflex: 0.5, diving: 0.5 };
const fixed = (v: number) => () => v;

describe("2D penalty", () => {
  test("areas split the goal in thirds and halves", () => {
    expect(areaOf({ x: -0.8, y: 0.2 })).toBe("low-left");
    expect(areaOf({ x: 0, y: 0.7 })).toBe("high-mid");
    expect(areaOf({ x: 0.5, y: 0.6 })).toBe("high-right");
  });

  test("a perfect finisher lands closer to the aim than a poor one", () => {
    const spread = (acc: number) => {
      const rng = mulberry32(3);
      let s = 0;
      for (let i = 0; i < 2000; i++) {
        const b = ballPoint({ aim: { x: 0.5, y: 0.4 }, power: 0.65 }, acc, rng);
        s += Math.hypot(b.x - 0.5, b.y - 0.4);
      }
      return s / 2000;
    };
    expect(spread(0.95)).toBeLessThan(spread(0.1) * 0.4);
  });

  test("a full power bar sends a mid-height shot over", () => {
    const out = resolveKick({ aim: { x: 0, y: 0.5 }, power: 1 }, "low-left", { accuracy: 0.95, keeper: avgKeeper }, fixed(0.5));
    expect(out.result).toBe("miss");
  });

  test("the wrong column is a goal; the right area can save", () => {
    const ball = { x: -0.6, y: 0.2 };
    expect(saveChance(ball, "low-right", avgKeeper, 0.65)).toBe(0);
    expect(saveChance(ball, "low-left", avgKeeper, 0.65)).toBeGreaterThan(0.3);
    expect(saveChance(ball, "high-left", avgKeeper, 0.65)).toBeLessThan(saveChance(ball, "low-left", avgKeeper, 0.65));
  });

  test("a weak shot is easier to save, a corner harder", () => {
    expect(saveChance({ x: -0.6, y: 0.2 }, "low-left", avgKeeper, 0.2)).toBeGreaterThan(saveChance({ x: -0.6, y: 0.2 }, "low-left", avgKeeper, 0.65));
    expect(saveChance({ x: -0.9, y: 0.2 }, "low-left", avgKeeper, 0.65)).toBeLessThan(saveChance({ x: -0.45, y: 0.2 }, "low-left", avgKeeper, 0.65));
  });

  test("calibration: an average AI kick against an average keeper converts about 75%", () => {
    const rng = mulberry32(11);
    let goals = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (resolveKick(aiKick(rng), aiDive(rng), { accuracy: 0.5, keeper: avgKeeper }, rng).scored) goals++;
    expect(goals / n).toBeGreaterThan(0.72);
    expect(goals / n).toBeLessThan(0.78);
  });

  test("the power bar goes up and down", () => {
    expect(powerAt(0)).toBe(0);
    expect(powerAt(0.7)).toBeCloseTo(1);
    expect(powerAt(1.4)).toBeCloseTo(0);
  });
});

describe("parsePenaltyChoice (socket)", () => {
  test("a kick or a dive in range, nothing else", () => {
    expect(parsePenaltyChoice({ dive: "high-left" })).toEqual({ dive: "high-left" });
    expect(parsePenaltyChoice({ kick: { aim: { x: 0.2, y: 0.4 }, power: 0.6 } })).toEqual({ kick: { aim: { x: 0.2, y: 0.4 }, power: 0.6 } });
    expect(parsePenaltyChoice({ dive: "top" })).toBeNull();
    expect(parsePenaltyChoice({ kick: { aim: { x: 3, y: 0.4 }, power: 0.6 } })).toBeNull();
    expect(parsePenaltyChoice({ kick: { aim: { x: 0, y: 0.4 }, power: 2 } })).toBeNull();
    expect(parsePenaltyChoice({ kick: { aim: { x: 0, y: 0.4 }, power: 0.5, extra: 1 } })).toBeNull();
    expect(parsePenaltyChoice({ dive: "low-mid", kick: {} })).toBeNull();
    expect(parsePenaltyChoice(null)).toBeNull();
  });
});
