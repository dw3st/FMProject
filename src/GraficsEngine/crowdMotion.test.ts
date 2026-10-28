import { describe, expect, test } from "bun:test";
import { CROWD_MOTION, crowdTiles, flagWave, standFlags, tileLift } from "@/GraficsEngine/crowdMotion";

describe("crowd motion", () => {
  test("tiles group the seats, keep every seat once and have a stable order", () => {
    const seats = Array.from({ length: 200 }, (_, i) => ({ x: (i % 20) * 5, y: Math.floor(i / 20) * 5, id: i }));
    const tiles = crowdTiles(seats, 30, "s");
    expect(tiles.flatMap((t) => t.seats).length).toBe(200);
    expect(new Set(tiles.flatMap((t) => t.seats.map((s) => s.id))).size).toBe(200);
    expect(crowdTiles(seats, 30, "s").map((t) => t.phase)).toEqual(tiles.map((t) => t.phase));
  });

  test("tiles of the same section jump close together (a chant)", () => {
    const seats = Array.from({ length: 36 }, (_, i) => ({ x: (i % 6) * 5, y: Math.floor(i / 6) * 5 }));
    const tiles = crowdTiles(seats, 10, "s"); // 3x3 tiles in one 30 px section
    const phases = tiles.map((t) => t.phase);
    expect(Math.max(...phases) - Math.min(...phases)).toBeLessThanOrEqual(CROWD_MOTION.JITTER + 1e-9);
  });

  test("jumping stays within its height, never below the seat", () => {
    for (let t = 0; t < 10; t += 0.07) {
      const lift = tileLift({ cx: 0, cy: 0, phase: 1 }, t, { x: 500, y: 300 }, 4, 1e9); // no wave yet
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(4 * CROWD_MOTION.BOUNCE + 1e-9);
    }
  });

  test("the wave lifts a tile when it passes, then goes away until the next one", () => {
    const tile = { cx: 0, cy: 300, phase: -Math.PI / 2 }; // left of the centre; phase = on the ground at t = 0
    const centre = { x: 500, y: 300 };
    expect(tileLift(tile, 0, centre, 4, 0)).toBeGreaterThan(4 * CROWD_MOTION.BOUNCE);
    expect(tileLift(tile, CROWD_MOTION.WAVE_LAP_S + 1, centre, 4, 0)).toBeLessThanOrEqual(4 * CROWD_MOTION.BOUNCE + 1e-9);
  });

  test("flags only over the home stands, and the free end waves more than the pole", () => {
    const bands = [
      { side: "top" as const, x: 0, y: 0, w: 900, h: 40 },
      { side: "bottom" as const, x: 0, y: 460, w: 900, h: 40 },
      { side: "left" as const, x: 0, y: 40, w: 40, h: 420 },
      { side: "right" as const, x: 860, y: 40, w: 40, h: 420 },
    ];
    const F = CROWD_MOTION.FLAGS;
    const flags = standFlags(bands, "left", "s");
    expect(flags).toHaveLength(F.PER_LONG_SIDE * 2 + F.HOME_END);
    expect(flags.some((f) => f.x > 860)).toBe(false);
    expect(standFlags(bands, "left", "s", ["top"])).toHaveLength(F.PER_LONG_SIDE + F.HOME_END);
    expect(flagWave(flags[0]!, 0, 1.3, 5)).toBe(0);
    expect(Math.abs(flagWave(flags[0]!, F.STRIPS, 1.3, 5))).toBeLessThanOrEqual(5);
  });
});
