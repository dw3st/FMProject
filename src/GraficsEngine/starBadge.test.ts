import { describe, expect, test } from "bun:test";
import { mixColor, starPoints } from "@/GraficsEngine/starBadge";

describe("star badge geometry", () => {
  test("ten points, the first straight up, outer and inner radius alternating", () => {
    const pts = starPoints(0, 0, 10);
    expect(pts).toHaveLength(10);
    expect(pts[0]!.x).toBeCloseTo(0);
    expect(pts[0]!.y).toBeCloseTo(-10);
    expect(Math.hypot(pts[2]!.x, pts[2]!.y)).toBeCloseTo(10);
    expect(Math.hypot(pts[1]!.x, pts[1]!.y)).toBeCloseTo(4.7);
  });
  test("mixColor is the channel average", () => {
    expect(mixColor(0xffffff, 0x000000)).toBe(0x808080);
    expect(mixColor(0xff0000, 0x0000ff)).toBe(0x800080);
  });
});
