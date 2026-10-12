import { describe, expect, test } from "bun:test";
import { containRect, selectionRect, sourceCrop } from "@/GameInterface/Components/screenCaptureGeometry";

describe("selectionRect", () => {
  test("normalises a drag in any direction", () => {
    expect(selectionRect({ x: 50, y: 40 }, { x: 10, y: 100 })).toEqual({ x: 10, y: 40, w: 40, h: 60 });
  });
});

describe("containRect", () => {
  test("same aspect fills the box", () => {
    expect(containRect(2000, 1000, 1000, 500)).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });
  test("a taller image is centred with side bars", () => {
    expect(containRect(1000, 1000, 1000, 500)).toEqual({ x: 250, y: 0, w: 500, h: 500 });
  });
});

describe("sourceCrop", () => {
  const shown = { x: 0, y: 0, w: 1000, h: 500 };
  test("maps the selection to image pixels (device pixel ratio 2)", () => {
    expect(sourceCrop({ x: 100, y: 50, w: 200, h: 100 }, shown, 2000, 1000)).toEqual({ x: 200, y: 100, w: 400, h: 200 });
  });
  test("clips the part outside the shown image", () => {
    const bars = { x: 250, y: 0, w: 500, h: 500 };
    expect(sourceCrop({ x: 200, y: 0, w: 150, h: 100 }, bars, 1000, 1000)).toEqual({ x: 0, y: 0, w: 200, h: 200 });
  });
  test("a click (tiny or empty selection) is no crop", () => {
    expect(sourceCrop({ x: 10, y: 10, w: 3, h: 3 }, shown, 2000, 1000)).toBeNull();
    expect(sourceCrop({ x: 1200, y: 10, w: 50, h: 50 }, shown, 2000, 1000)).toBeNull();
  });
});
