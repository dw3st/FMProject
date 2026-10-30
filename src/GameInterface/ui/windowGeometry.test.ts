import { describe, expect, test } from "bun:test";
import {
  clampRect, dockedRect, FLOAT, frontOf, isNarrow, moveRect, parseRect, resizeRect, zIndexOf,
} from "@/GameInterface/ui/windowGeometry";

const VP = { w: 1440, h: 900 };
const MIN = { w: 300, h: 200 };

describe("floating window geometry", () => {
  test("a window is kept whole between the bars", () => {
    expect(clampRect({ x: -50, y: 0, w: 400, h: 300 }, VP, MIN)).toEqual({ x: 0, y: FLOAT.TOP_INSET, w: 400, h: 300 });
    const r = clampRect({ x: 1300, y: 800, w: 400, h: 300 }, VP, MIN);
    expect(r.x + r.w).toBe(1440);
    expect(r.y + r.h).toBe(900 - FLOAT.BOTTOM_INSET);
  });

  test("the size stays within min and max and the screen", () => {
    expect(clampRect({ x: 0, y: 100, w: 50, h: 50 }, VP, MIN)).toMatchObject({ w: 300, h: 200 });
    expect(clampRect({ x: 0, y: 100, w: 900, h: 700 }, VP, MIN, { w: 600, h: 500 })).toMatchObject({ w: 600, h: 500 });
    const small = clampRect({ x: 0, y: 100, w: 2000, h: 2000 }, { w: 800, h: 500 }, MIN);
    expect(small.w).toBe(800);
    expect(small.h).toBe(500 - FLOAT.TOP_INSET - FLOAT.BOTTOM_INSET);
  });

  test("moving by a delta", () => {
    expect(moveRect({ x: 100, y: 100, w: 400, h: 300 }, 50, 40, VP, MIN)).toEqual({ x: 150, y: 140, w: 400, h: 300 });
  });

  test("resizing keeps the opposite edge where it was", () => {
    const start = { x: 200, y: 200, w: 400, h: 300 };
    expect(resizeRect(start, "se", 100, 50, VP, MIN)).toEqual({ x: 200, y: 200, w: 500, h: 350 });
    const nw = resizeRect(start, "nw", -100, -50, VP, MIN);
    expect(nw).toEqual({ x: 100, y: 150, w: 500, h: 350 });
    const shrunk = resizeRect(start, "w", 300, 0, VP, MIN);
    expect(shrunk.w).toBe(MIN.w);
    expect(shrunk.x + shrunk.w).toBe(600);
    expect(resizeRect(start, "e", 5000, 0, VP, MIN).x + resizeRect(start, "e", 5000, 0, VP, MIN).w).toBe(1440);
  });

  test("narrow screens dock full width at the bottom", () => {
    expect(isNarrow({ w: 400, h: 800 })).toBe(true);
    expect(isNarrow(VP)).toBe(false);
    expect(dockedRect({ w: 400, h: 800 }, 500)).toEqual({ x: 0, y: 800 - FLOAT.BOTTOM_INSET - 500, w: 400, h: 500 });
  });

  test("stored values: malformed ones are ignored", () => {
    expect(parseRect('{"x":1,"y":2,"w":3,"h":4}')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(parseRect("nope")).toBeNull();
    expect(parseRect('{"x":1,"y":2,"w":0,"h":4}')).toBeNull();
    expect(parseRect(null)).toBeNull();
  });

  test("the last window touched is on top, under the bars", () => {
    const stack = frontOf(frontOf(["a", "b", "c"], "a"), "b");
    expect(stack).toEqual(["c", "a", "b"]);
    expect(zIndexOf(stack, "b")).toBe(FLOAT.Z_MAX);
    expect(zIndexOf(stack, "c")).toBe(FLOAT.Z_MAX - 2);
    expect(zIndexOf(stack, "b")).toBeLessThan(50);
  });
});
