import { describe, expect, test } from "bun:test";
import { coneAim, coneStrength } from "@/GraficsEngine/floodCones";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { towerSpots } from "@/GraficsEngine/stadiumAtmosphere";

describe("flood cones", () => {
  test("off by day, full at night", () => {
    expect(coneStrength(0)).toBe(0);
    expect(coneStrength(0.35)).toBe(0);
    expect(coneStrength(1)).toBe(1);
  });
  test("each tower aims at the pitch half on its own side", () => {
    const m = buildMetrics(1300, 900, { stadium: true });
    const cx = m.marginX + m.width / 2, cy = m.marginY + m.height / 2;
    for (const t of towerSpots(m.stand!)) {
      const a = coneAim(t, m);
      expect(Math.sign(a.x - cx)).toBe(Math.sign(t.x - cx));
      expect(Math.sign(a.y - cy)).toBe(Math.sign(t.y - cy));
      expect(a.x).toBeGreaterThan(m.marginX);
      expect(a.x).toBeLessThan(m.marginX + m.width);
    }
  });
});
