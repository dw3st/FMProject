// allowance.test.ts
import { describe, expect, test } from "bun:test";
import { allowanceShare, materialsWorth } from "@/Domain/craft/allowance";
import { CRAFT } from "@/Domain/craft/craftConfig";

describe("allowance", () => {
  test("share by board", () => {
    expect(allowanceShare(30)).toBe(0);
    expect(allowanceShare(50)).toBeCloseTo(0.003);
    expect(allowanceShare(85)).toBeCloseTo(0.01);
    expect(allowanceShare(99)).toBeCloseTo(0.01);
    expect(allowanceShare(67.5)).toBeCloseTo(0.0065);
    expect(allowanceShare(40)).toBeCloseTo(0.003);
  });
  test("a value split in equal parts of the six materials", () => {
    const m = materialsWorth(60_000, 100_000_000);
    expect(m.steel).toBe(Math.floor(10_000 / (100_000_000 * CRAFT.MATERIAL_SHARE.steel)));
    expect(Object.keys(m)).toHaveLength(6);
  });
});
