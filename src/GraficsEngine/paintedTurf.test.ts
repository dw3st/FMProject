import { describe, expect, test } from "bun:test";
import { PAINTED_TURF, paintedOverlay, paintedPlacement, paintedTurfId, paintedWash } from "@/GraficsEngine/paintedTurf";

const base = { condition: 90, turf: "natural" as const, mowing: "stripes" as const, seed: "fx1" };

describe("painted turf", () => {
  test("backdrop by grass and mowing; the same ground keeps its tone", () => {
    expect(paintedTurfId({ ...base, turf: "synthetic" })).toBe("match-backdrop-synthetic");
    expect(paintedTurfId({ ...base, mowing: "checker" })).toBe("match-backdrop-mow-check");
    expect(paintedTurfId({ ...base, mowing: "diagonal" })).toBe("match-backdrop-mow-diag");
    expect(paintedTurfId({ ...base, mowing: "circles" })).toBe("match-backdrop-mow-rings");
    expect(paintedTurfId({ ...base, mowing: "none" })).toBeNull();
    expect(paintedTurfId({ ...base, mowing: "none", turf: "synthetic" })).toBe("match-backdrop-synthetic");
    const a = paintedTurfId({ ...base, seed: "fx1", ground: "33" });
    expect(a).toBe(paintedTurfId({ ...base, seed: "fx2", ground: "33" }));
    expect(PAINTED_TURF.TONES.map((t) => `match-backdrop-${t}`)).toContain(a!);
  });

  test("no wash on a pristine pitch, more as it wears; the game's wear on top, never its mowing", () => {
    expect(paintedWash(base)).toBe(0);
    expect(paintedWash({ ...base, condition: 60 })).toBeGreaterThan(0);
    expect(paintedWash({ ...base, condition: 20 })).toBeGreaterThan(paintedWash({ ...base, condition: 60 }));
    expect(paintedWash({ ...base, condition: 5 })).toBeGreaterThan(paintedWash({ ...base, condition: 20 }));
    expect(paintedOverlay(base).shapes).toEqual([]);
    const worn = paintedOverlay({ ...base, condition: 20 });
    expect(worn.shapes.length).toBeGreaterThan(0);
    expect(worn.shapes.every((s) => s.layer === "wear")).toBe(true);
    expect(paintedOverlay({ ...base, condition: 5 }).dashedLines).toBe(true);
  });

  test("the painted pitch lands on the game's pitch; mirrored, turned about its centre", () => {
    const pitch = { x: 40, y: 30, w: 1050, h: 680 };
    const p = paintedPlacement(pitch, false);
    expect(p.scaleX).toBe(1);
    expect(p.scaleY).toBe(1);
    expect(p.x).toBe(40 + 525);
    expect(p.y).toBe(30 + 340);
    // The pivot is the painted pitch centre in the crop.
    expect(p.pivotX).toBe(PAINTED_TURF.PITCH.x - PAINTED_TURF.FRAME.x + 525);
    expect(paintedPlacement(pitch, true).rotation).toBeCloseTo(Math.PI);
  });
});
