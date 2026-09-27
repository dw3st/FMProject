import { describe, expect, test } from "bun:test";
import { overlayDismissDelayMs } from "@/GameInterface/matchOverlayTiming";

describe("overlayDismissDelayMs", () => {
  test("1x speed keeps the base delay unchanged", () => {
    expect(overlayDismissDelayMs(3500, 1)).toBe(3500);
  });

  test("2x speed halves the delay", () => {
    expect(overlayDismissDelayMs(3500, 2)).toBe(1750);
  });

  test("4x speed quarters the delay", () => {
    expect(overlayDismissDelayMs(3500, 4)).toBe(875);
  });

  test("falls back to the base delay for non-positive or non-finite speed", () => {
    expect(overlayDismissDelayMs(3500, 0)).toBe(3500);
    expect(overlayDismissDelayMs(3500, -1)).toBe(3500);
    expect(overlayDismissDelayMs(3500, NaN)).toBe(3500);
    expect(overlayDismissDelayMs(3500, Infinity)).toBe(3500);
  });
});
