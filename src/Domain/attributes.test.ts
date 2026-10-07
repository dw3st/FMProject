import { expect, test } from "bun:test";
import { attrDisplay, roundAttr } from "@/Domain/attributes";

test("one decimal, clamped", () => {
  expect(roundAttr(5.04)).toBe(5);
  expect(roundAttr(5.06)).toBe(5.1);
  expect(roundAttr(-1)).toBe(0);
  expect(roundAttr(10.4)).toBe(10);
  expect(roundAttr(Number.NaN)).toBe(0);
});

test("display ×10", () => {
  expect(attrDisplay(5)).toBe(50);
  expect(attrDisplay(6.27)).toBe(63);
  expect(attrDisplay(10)).toBe(100);
});
