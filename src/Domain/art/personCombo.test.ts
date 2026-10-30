import { describe, expect, test } from "bun:test";
import { personCombo } from "@/Domain/art/personCombo";

const SHAPE = /^[1-7]-(black|blond|brown|darkBrown|grey|red)-(bald|long|medium|short)-(full|none|stubble)-[gn]$/;

describe("personCombo", () => {
  test("always a painted coach key, the same for the same person", () => {
    for (let i = 0; i < 500; i++) {
      const c = personCombo(`coach_${i}`, i % 2 ? "Brazil" : "Nigeria", 30 + (i % 40));
      expect(c).toMatch(SHAPE);
      expect(personCombo(`coach_${i}`, i % 2 ? "Brazil" : "Nigeria", 30 + (i % 40))).toBe(c);
    }
  });
  test("older people go grey more often", () => {
    const grey = (age: number) => Array.from({ length: 400 }, (_, i) => personCombo(`p${i}`, "England", age)).filter((c) => c.includes("-grey-")).length;
    expect(grey(65)).toBeGreaterThan(grey(35));
  });
});
