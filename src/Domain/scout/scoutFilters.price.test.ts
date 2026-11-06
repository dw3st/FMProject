import { describe, expect, test } from "bun:test";
import { parsePriceM, PRICE_FILTER_NO_LIMIT_M, stepPriceM } from "@/Domain/scout/scoutFilterState";

describe("price filter steps (tester report, 8.8.2)", () => {
  test("finer for cheap players, coarser for stars", () => {
    expect(stepPriceM(0, 1)).toBe(0.1);
    expect(stepPriceM(0.9, 1)).toBe(1);
    expect(stepPriceM(1, 1)).toBe(1.5);
    expect(stepPriceM(10, 1)).toBe(11);
    expect(stepPriceM(50, 1)).toBe(55);
    expect(stepPriceM(200, 1)).toBe(225);
    expect(stepPriceM(11, -1)).toBe(10);
    expect(stepPriceM(10, -1)).toBe(9.5);
    expect(stepPriceM(1, -1)).toBe(0.9);
    expect(stepPriceM(0, -1)).toBe(0);
    expect(stepPriceM(1031.5, -1)).toBe(1000);
    expect(stepPriceM(PRICE_FILTER_NO_LIMIT_M, 1)).toBe(PRICE_FILTER_NO_LIMIT_M);
  });
  test("a typed price: millions, comma, M, or euros", () => {
    expect(parsePriceM("20")).toBe(20);
    expect(parsePriceM("20,5")).toBe(20.5);
    expect(parsePriceM("20M")).toBe(20);
    expect(parsePriceM("20000000")).toBe(20);
    expect(parsePriceM("")).toBeNull();
    expect(parsePriceM("1000+")).toBeNull();
  });
});
