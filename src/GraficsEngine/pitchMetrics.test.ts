import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

const s0 = (m: ReturnType<typeof buildMetrics>) => m.stand!.inner.y + m.stand!.inner.h - (m.marginY + m.height);

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

  test("with stadium the pitch leaves the preview's aprons and a stand on all four sides", () => {
    for (const [w, h] of [[1100, 700], [900, 520]] as const) {
      const plain = buildMetrics(w, h, { stadium: false });
      const m = buildMetrics(w, h, { stadium: true });
      expect(m.scale).toBeLessThan(plain.scale);
      // every stand keeps at least MIN_STAND_YDS
      for (const side of ["top", "bottom", "left", "right"] as const) {
        expect(m.stand!.thickness[side]).toBeGreaterThanOrEqual(Math.floor(STADIUM.MIN_STAND_YDS * m.scale) - 2);
      }
      expect(m.marginY - m.stand!.inner.y).toBeGreaterThanOrEqual(Math.round(STADIUM.RUNOFF_YDS * m.scale) - 1);
      // the bottom run-off holds the assistant's lane and the benches
      expect(s0(m)).toBeGreaterThanOrEqual(Math.round(STADIUM.BENCH_RUNOFF_YDS * m.scale) - 1);
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
