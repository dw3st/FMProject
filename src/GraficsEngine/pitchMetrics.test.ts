import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

describe("pitch metrics", () => {
  test("without stadium: same numbers as the old buildMetrics (1100x700, 900x520)", () => {
    expect(buildMetrics(1100, 700, { stadium: false })).toEqual({
      scale: 9.243697478991596, width: 1063, height: 684, marginX: 19, marginY: 8,
      centreCircleRadius: 92, goalAreaDepth: 55, goalAreaWidth: 166, penaltyAreaDepth: 166,
      penaltyAreaWidth: 407, penaltySpotDistance: 111, cornerArcRadius: 9, goalNetDepth: 18, stand: null,
    });
    expect(buildMetrics(900, 520, { stadium: false })).toEqual({
      scale: 7.027027027027027, width: 808, height: 520, marginX: 46, marginY: 0,
      centreCircleRadius: 70, goalAreaDepth: 42, goalAreaWidth: 126, penaltyAreaDepth: 126,
      penaltyAreaWidth: 309, penaltySpotDistance: 84, cornerArcRadius: 7, goalNetDepth: 14, stand: null,
    });
  });

  test("with stadium the pitch shrinks by PITCH_SHRINK and the stand fills all four sides", () => {
    for (const [w, h] of [[1100, 700], [900, 520]] as const) {
      const plain = buildMetrics(w, h, { stadium: false });
      const m = buildMetrics(w, h, { stadium: true });
      expect(m.scale).toBeCloseTo(plain.scale * STADIUM.PITCH_SHRINK, 6);
      const s = m.stand!;
      expect(s.outer).toEqual({ x: 0, y: 0, w, h });
      for (const side of ["top", "bottom", "left", "right"] as const) expect(s.thickness[side]).toBeGreaterThan(4);
      // the inner rect holds the pitch + nets + run-off and stays inside the canvas
      expect(s.inner.x).toBeLessThan(m.marginX - m.goalNetDepth);
      expect(s.inner.y).toBeLessThan(m.marginY);
      expect(s.inner.y + s.inner.h).toBeGreaterThan(m.marginY + m.height);
      expect(s.inner.x + s.inner.w).toBeGreaterThan(m.marginX + m.width + m.goalNetDepth);
      expect(s.inner.x + s.inner.w).toBeLessThanOrEqual(w);
      expect(s.thickness.top + s.inner.h + s.thickness.bottom).toBe(h);
      expect(s.thickness.left + s.inner.w + s.thickness.right).toBe(w);
    }
  });
});
