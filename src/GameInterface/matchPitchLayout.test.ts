import { describe, expect, test } from "bun:test";
import { matchPitchLayout, railOffset, RAIL_GAP, RAIL_ROOM } from "@/GameInterface/matchPitchLayout";

describe("railOffset", () => {
  test("with room beside the stadium the rail ends a gap before it", () => {
    expect(railOffset(251)).toBe(251 - RAIL_GAP);
    expect(railOffset(RAIL_ROOM)).toBe(RAIL_ROOM - RAIL_GAP);
  });
  test("without room (or before the layout is known) the rail stays by the screen edge", () => {
    expect(railOffset(RAIL_ROOM - 1)).toBeNull();
    expect(railOffset(0)).toBeNull();
    expect(railOffset(null)).toBeNull();
  });
});

describe("matchPitchLayout", () => {
  test("no room, no layout", () => {
    expect(matchPitchLayout(0, 500)).toBeNull();
    expect(matchPitchLayout(800, 0)).toBeNull();
  });

  test("a wide row: the canvas takes the height, keeps the pitch ratio and is centred", () => {
    const l = matchPitchLayout(2000, 890)!;
    expect(l.canvasH).toBe(890);
    expect(l.canvasW).toBe(Math.floor(890 * 124 / 80));
    expect(l.x).toBe(Math.round((2000 - l.canvasW) / 2));
    expect(l.y).toBe(0);
  });

  test("a narrow row: the canvas takes the width and is centred vertically", () => {
    const l = matchPitchLayout(600, 890)!;
    expect(l.canvasW).toBe(600);
    expect(l.canvasH).toBe(Math.floor(600 / (124 / 80)));
    expect(l.x).toBe(0);
    expect(l.y).toBeGreaterThan(0);
  });

  test("the canvas is never cropped nor stretched past the row", () => {
    for (const [w, h] of [[1600, 708], [3158, 1400], [844, 303], [3440, 1000]] as const) {
      const l = matchPitchLayout(w, h)!;
      expect(l.canvasW).toBeLessThanOrEqual(w);
      expect(l.canvasH).toBeLessThanOrEqual(h);
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(l.canvasW / l.canvasH - 124 / 80)).toBeLessThan(0.01);
    }
  });
});
