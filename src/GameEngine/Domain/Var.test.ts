import { describe, expect, test } from "bun:test";
import { VAR_CONFIG } from "@/GameEngine/Configs/VarConfig";
import { banMatches, canErr, complaintChances, errorChance, qualityMult, resolveComplaint, rollError, varChecksCorrect, varCorrects } from "@/GameEngine/Domain/Var";

const counting = (values: number[]) => {
  let n = 0;
  const rng = () => { n++; return values.shift() ?? 0.5; };
  return { rng, calls: () => n };
};

describe("qualityMult", () => {
  test("worse referee errs more, 1 at 62.5", () => {
    expect(qualityMult(62.5)).toBeCloseTo(1, 6);
    expect(qualityMult(0)).toBeCloseTo(1.5, 6);
    expect(qualityMult(100)).toBeCloseTo(0.7, 6);
    expect(errorChance("missed_offside", 20) / errorChance("missed_offside", 90)).toBeGreaterThan(1.6);
  });
});

describe("rollError", () => {
  test("no referee / no quality: false without drawing", () => {
    const c = counting([0]);
    expect(rollError("missed_offside", undefined, c.rng)).toBe(false);
    expect(rollError("missed_offside", { var: true }, c.rng)).toBe(false);
    expect(c.calls()).toBe(0);
    expect(canErr({ quality: 50 })).toBe(true);
  });
  test("with quality: one draw against the chance", () => {
    const c = counting([0, 0.99]);
    expect(rollError("missed_penalty", { quality: 50 }, c.rng)).toBe(true);
    expect(rollError("missed_penalty", { quality: 50 }, c.rng)).toBe(false);
    expect(c.calls()).toBe(2);
  });
  test("forced kind fires without drawing", () => {
    const c = counting([]);
    expect(rollError("wrong_red", undefined, c.rng, "wrong_red")).toBe(true);
    expect(c.calls()).toBe(0);
  });
});

describe("VAR", () => {
  test("no VAR: never corrects nor checks, no draw", () => {
    const c = counting([0]);
    expect(varCorrects({ quality: 50 }, c.rng)).toBe(false);
    expect(varChecksCorrect({ quality: 50, var: false }, c.rng)).toBe(false);
    expect(c.calls()).toBe(0);
  });
  test("with VAR: CORRECTION and CHECK_CORRECT", () => {
    expect(varCorrects({ var: true }, () => VAR_CONFIG.CORRECTION - 0.01)).toBe(true);
    expect(varCorrects({ var: true }, () => VAR_CONFIG.CORRECTION + 0.01)).toBe(false);
    expect(varChecksCorrect({ var: true }, () => VAR_CONFIG.CHECK_CORRECT - 0.01)).toBe(true);
  });
});

describe("complaint", () => {
  test("chances grow with complaints and rigor", () => {
    const a = complaintChances({ made: 0, onYellow: false });
    const b = complaintChances({ made: 2, strictness: 1, onYellow: false });
    expect(a.yellow).toBeCloseTo(0.2, 6);
    expect(a.red).toBeCloseTo(0.02, 6);
    expect(b.yellow).toBeCloseTo(0.2 * 2.2 * 1.3, 6);
    expect(b.red).toBeCloseTo(0.06, 6);
  });
  test("red first, yellow on a yellow is red, bias only card-free", () => {
    expect(resolveComplaint({ made: 0, onYellow: false }, counting([0]).rng).card).toBe("red");
    expect(resolveComplaint({ made: 0, onYellow: false }, counting([0.9, 0.1]).rng).card).toBe("yellow");
    expect(resolveComplaint({ made: 0, onYellow: true }, counting([0.9, 0.1]).rng).card).toBe("red");
    expect(resolveComplaint({ made: 0, onYellow: false }, counting([0.9, 0.9, 0.1]).rng)).toEqual({ card: "none", bias: true });
    expect(resolveComplaint({ made: 0, onYellow: false }, counting([0.9, 0.9, 0.9]).rng)).toEqual({ card: "none", bias: false });
  });
  test("ban: 1 match, 2 from the 3rd complaint", () => {
    expect(banMatches(1)).toBe(1);
    expect(banMatches(2)).toBe(1);
    expect(banMatches(3)).toBe(2);
  });
});
