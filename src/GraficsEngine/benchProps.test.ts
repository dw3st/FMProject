import { describe, expect, test } from "bun:test";
import { BENCH_PROPS, benchPropSpots } from "@/GraficsEngine/benchProps";

const box = { x: 100, y: 400, w: 120, h: 30 };

describe("benchPropSpots", () => {
  test("the cooler sits on the bench's inner end, clear of it", () => {
    const l = benchPropSpots(box, "left", 14, "m1").cooler;
    expect(l.x - l.w / 2).toBeGreaterThan(box.x + box.w);
    const r = benchPropSpots(box, "right", 14, "m1").cooler;
    expect(r.x + r.w / 2).toBeLessThan(box.x);
    expect(l.w).toBeCloseTo(BENCH_PROPS.COOLER_W * 14);
  });

  test("bottles lie by the cooler, inside the bench's run-off band, stable per match", () => {
    const a = benchPropSpots(box, "left", 14, "m1");
    expect(a.bottles).toHaveLength(BENCH_PROPS.BOTTLES);
    for (const b of a.bottles) {
      expect(Math.abs(b.x - a.cooler.x)).toBeLessThan(a.cooler.w * 1.2);
      expect(b.y).toBeLessThanOrEqual(box.y + box.h);
    }
    expect(benchPropSpots(box, "left", 14, "m1")).toEqual(a);
    expect(benchPropSpots(box, "left", 14, "m2").bottles).not.toEqual(a.bottles);
  });
});
