import { describe, expect, test } from "bun:test";
import { standDepths, STAND_DEPTH } from "@/Domain/facilities/standDepth";

const ground = (n: number, s: number, e: number, w: number) => [
  { id: "north" as const, seats: n }, { id: "south" as const, seats: s },
  { id: "east" as const, seats: e }, { id: "west" as const, seats: w },
];

describe("stand depths", () => {
  test("the default split draws every stand at full depth", () => {
    expect(standDepths(ground(6246, 6246, 11104, 11104))).toBeNull();
    expect(standDepths(undefined)).toBeNull();
    expect(standDepths([])).toBeNull();
  });

  test("a stand with 10 000 more seats is deeper than the one opposite", () => {
    const d = standDepths(ground(6246, 6246, 21104, 11104))!;
    expect(d.east).toBe(1);
    expect(d.west).toBeCloseTo(11104 / 21104, 2);
    expect(d.north).toBeLessThan(1);
    expect(d.west).toBeLessThan(d.east);
  });

  test("never thinner than the minimum", () => {
    const d = standDepths(ground(1000, 6000, 40000, 11000))!;
    expect(Math.min(...Object.values(d))).toBe(STAND_DEPTH.MIN_DEPTH);
  });
});
