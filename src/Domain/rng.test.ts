// src/Domain/rng.test.ts
import { describe, expect, test } from "bun:test";
import { mulberry32, unitFrom } from "@/Domain/rng";

describe("mulberry32", () => {
  test("mesma semente gera a mesma sequência", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  test("valores em [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("sementes diferentes divergem", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("unitFrom", () => {
  test("keys that differ only in the last character spread over the range", () => {
    const xs = Array.from({ length: 10 }, (_, i) => unitFrom(`save:529:2027:donor:${i}`));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});
