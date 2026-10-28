import { describe, expect, test } from "bun:test";
import { CROWD_MOTION, crowdTiles, tileLift } from "@/GraficsEngine/crowdMotion";

describe("crowd motion", () => {
  test("tiles group the seats, keep every seat once and have a stable order", () => {
    const seats = Array.from({ length: 200 }, (_, i) => ({ x: (i % 20) * 5, y: Math.floor(i / 20) * 5, id: i }));
    const tiles = crowdTiles(seats, 30, "s");
    expect(tiles.flatMap((t) => t.seats).length).toBe(200);
    expect(new Set(tiles.flatMap((t) => t.seats.map((s) => s.id))).size).toBe(200);
    expect(crowdTiles(seats, 30, "s").map((t) => t.phase)).toEqual(tiles.map((t) => t.phase));
  });

  test("sway stays within its height, never below the seat", () => {
    for (let t = 0; t < 10; t += 0.07) {
      const lift = tileLift({ cx: 0, cy: 0, phase: 1 }, t, { x: 500, y: 300 }, 4, 1e9); // no wave yet
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(4 * CROWD_MOTION.SWAY + 1e-9);
    }
  });

  test("the wave lifts a tile when it passes, then goes away until the next one", () => {
    const tile = { cx: 0, cy: 300, phase: 0 }; // left of the centre: angle 0 after the +PI
    const centre = { x: 500, y: 300 };
    // Phase 0 at t = 0 means no sway; the wave front is at angle 0 at the start of a lap.
    const passing = tileLift({ ...tile, phase: -Math.PI / 2 }, 0, centre, 4, 0);
    expect(passing).toBeGreaterThan(4 * CROWD_MOTION.SWAY);
    const later = tileLift({ ...tile, phase: -Math.PI / 2 }, CROWD_MOTION.WAVE_LAP_S + 1, centre, 4, 0);
    expect(later).toBeLessThanOrEqual(4 * CROWD_MOTION.SWAY + 1e-9);
  });
});
