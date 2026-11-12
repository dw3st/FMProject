import { describe, expect, test } from "bun:test";
import { matchPitchLayout } from "@/GameInterface/matchPitchLayout";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

describe("matchPitchLayout", () => {
  test("no room, no layout", () => {
    expect(matchPitchLayout(0, 500, { stadium: true })).toBeNull();
    expect(matchPitchLayout(800, 0, { stadium: false })).toBeNull();
  });

  test("without a stadium the canvas keeps the pitch ratio, centred, never cropped", () => {
    const l = matchPitchLayout(2000, 890, { stadium: false })!;
    expect(l.canvasH).toBe(890);
    expect(l.canvasW).toBe(Math.floor(890 * 124 / 80));
    expect(l.x).toBe(Math.round((2000 - l.canvasW) / 2));
    expect(l.y).toBe(0);
    const narrow = matchPitchLayout(600, 890, { stadium: false })!;
    expect(narrow.canvasW).toBe(600);
    expect(narrow.y).toBeGreaterThan(0);
  });

  test("with a stadium the canvas is taller than the view and cropped evenly; the pitch is bigger than a fitted one", () => {
    const W = 2000, H = 890;
    const l = matchPitchLayout(W, H, { stadium: true, shape: true })!;
    expect(l.canvasH).toBeGreaterThan(H);
    expect(l.y).toBe(Math.round((H - l.canvasH) / 2));
    expect(l.canvasW).toBeLessThanOrEqual(W);
    const m = buildMetrics(l.canvasW, l.canvasH, { stadium: true, shape: "oval" });
    // What the old screen drew: a 124:80 canvas between two side panels (w-72 + w-64).
    const old = buildMetrics(Math.floor(H * 124 / 80), H, { stadium: true, shape: "oval" });
    expect(m.scale / old.scale).toBeGreaterThan(1.12);
    // The top apron (LED boards) and the benches are inside the view.
    const top = l.y + m.marginY - STADIUM.RUNOFF_YDS * m.scale;
    const bottom = l.y + m.marginY + m.height + STADIUM.BENCH_RUNOFF_YDS * m.scale;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(H);
    // And the pitch with its end aprons fits the width.
    expect(m.marginX - m.goalNetDepth - STADIUM.END_RUNOFF_YDS * m.scale).toBeGreaterThanOrEqual(0);
  });

  test("a narrow view is bound by its width: nothing is cropped away from the pitch", () => {
    const l = matchPitchLayout(700, 890, { stadium: true, shape: true })!;
    const m = buildMetrics(l.canvasW, l.canvasH, { stadium: true, shape: "oval" });
    expect(l.canvasW).toBe(700);
    expect(m.marginX - m.goalNetDepth).toBeGreaterThanOrEqual(0);
    expect(m.marginX + m.width + m.goalNetDepth).toBeLessThanOrEqual(700);
    expect(l.canvasH).toBe(890);
    expect(l.y).toBe(0);
  });

  test("an ultra-wide view does not stretch the end stands for ever", () => {
    const l = matchPitchLayout(3440, 1000, { stadium: true, shape: true })!;
    expect(l.canvasW).toBeLessThan(3440);
    expect(l.x).toBe(Math.round((3440 - l.canvasW) / 2));
  });
});
