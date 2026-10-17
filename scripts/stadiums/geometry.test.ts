import { describe, expect, test } from "bun:test";
import { dirOf, heightFromCapacity, heightFromDepth, standHeight, minAreaRect, rayHit, sideAzimuth, standDepths, type Pt } from "@/../scripts/stadiums/geometry";

const rect = (cx: number, cy: number, az: number, l: number, w: number): Pt[] => {
  const u = dirOf(az), v = { x: -u.y, y: u.x };
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: cx + (u.x * a! * l) / 2 + (v.x * b! * w) / 2,
    y: cy + (u.y * a! * l) / 2 + (v.y * b! * w) / 2,
  }));
};

describe("minAreaRect", () => {
  test("recovers a rotated pitch's axis and size", () => {
    for (const az of [0, 30, 95, 170]) {
      const r = minAreaRect(rect(10, -5, az, 105, 68));
      expect(r.axis).toBeCloseTo(az, 3);
      expect(r.length).toBeCloseTo(105, 3);
      expect(r.width).toBeCloseTo(68, 3);
      expect(r.center.x).toBeCloseTo(10, 3);
    }
  });
});

describe("sideAzimuth", () => {
  test("top faces axis − 90, bottom axis + 90", () => {
    expect(sideAzimuth(0, "top")).toBe(270);
    expect(sideAzimuth(0, "bottom")).toBe(90);
    expect(sideAzimuth(10, "low")).toBe(190);
  });
});

describe("standDepths", () => {
  test("distance from each side of the pitch to the outline", () => {
    const pitch = minAreaRect(rect(0, 0, 0, 105, 68));
    // Outline: 40 m beyond the touchlines, 20 m beyond the ends.
    const outline = [rect(0, 0, 0, 105 + 40, 68 + 80)];
    const d = standDepths(pitch, outline);
    expect(d.top).toBeCloseTo(40, 3);
    expect(d.bottom).toBeCloseTo(40, 3);
    expect(d.low).toBeCloseTo(20, 3);
    expect(d.high).toBeCloseTo(20, 3);
  });
  test("no outline: null", () => {
    expect(standDepths(minAreaRect(rect(0, 0, 0, 105, 68)), []).top).toBeNull();
  });
});

describe("rayHit and heights", () => {
  test("ray to a square", () => {
    expect(rayHit({ x: 0, y: 0 }, { x: 1, y: 0 }, [rect(0, 0, 0, 10, 10)], 100)).toBeCloseTo(5, 5);
  });
  test("height from depth", () => {
    expect(heightFromDepth(null)).toBe(0);
    expect(heightFromDepth(5)).toBe(0);
    expect(heightFromDepth(40)).toBe(20);
    expect(heightFromDepth(200)).toBe(50);
  });
});

describe("standHeight", () => {
  test("from the depth, capped by the capacity, the capacity's when unread", () => {
    expect(heightFromCapacity(60000)).toBe(32);
    expect(standHeight(40, 60000)).toBe(20);
    expect(standHeight(120, 22000)).toBe(Math.round(heightFromCapacity(22000) * 1.35));
    expect(standHeight(null, 22000)).toBe(heightFromCapacity(22000));
    expect(standHeight(5, 60000)).toBe(0);
  });
});
