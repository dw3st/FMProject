import { describe, expect, test } from "bun:test";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { mondayOf, orderTotal, unitPrice, weekPrice } from "@/Domain/craft/shop";

describe("craft shop", () => {
  test("weekly price stays within the noise and is stable for the week", () => {
    const base = 1_000_000 * CRAFT.MATERIAL_SHARE.steel;
    const a = weekPrice("s1", "steel", "2027-03-03", 1_000_000);
    expect(a).toBe(weekPrice("s1", "steel", "2027-03-07", 1_000_000));
    expect(a).toBeGreaterThanOrEqual(base * 0.9 - 1);
    expect(a).toBeLessThanOrEqual(base * 1.1 + 1);
    expect(mondayOf("2027-03-07")).toBe("2027-03-01");
  });
  test("good supplier and board discount", () => {
    const p = weekPrice("s1", "wood", "2027-03-03", 10_000_000);
    expect(unitPrice(p, "good", 50)).toBe(Math.round(p * 1.15));
    expect(unitPrice(p, "standard", 70)).toBe(Math.round(p * 0.9));
    expect(orderTotal([{ material: "wood", supplier: "standard", qty: 3 }], "s1", "2027-03-03", 10_000_000, 50)).toBe(3 * Math.round(p));
  });
});
