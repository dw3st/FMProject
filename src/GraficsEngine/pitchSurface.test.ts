import { describe, expect, test } from "bun:test";
import { clipToPitch, pitchSurface, pitchVisualBand, type SurfaceShape } from "@/GraficsEngine/pitchSurface";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

const inside = (s: SurfaceShape) => {
  if (s.kind === "rect") return s.x >= 0 && s.y >= 0 && s.x + s.w <= PITCH_LENGTH + 1e-9 && s.y + s.h <= PITCH_WIDTH + 1e-9;
  if (s.kind === "poly") {
    for (let i = 0; i < s.points.length; i += 2) {
      if (s.points[i]! < -1e-9 || s.points[i]! > PITCH_LENGTH + 1e-9) return false;
      if (s.points[i + 1]! < -1e-9 || s.points[i + 1]! > PITCH_WIDTH + 1e-9) return false;
    }
    return true;
  }
  return true; // rings are clipped by the renderer
};

describe("pitchSurface", () => {
  test("bands", () => {
    expect(pitchVisualBand(100)).toBe("pristine");
    expect(pitchVisualBand(70)).toBe("pristine");
    expect(pitchVisualBand(69.9)).toBe("faded");
    expect(pitchVisualBand(40)).toBe("faded");
    expect(pitchVisualBand(39)).toBe("worn");
    expect(pitchVisualBand(15)).toBe("worn");
    expect(pitchVisualBand(14)).toBe("rotten");
  });

  test("pristine stripes = the old drawing (8 light bands of 15), crisp lines", () => {
    const s = pitchSurface({ condition: 95, turf: "natural", mowing: "stripes", seed: "f1" });
    expect(s.shapes.filter((x) => x.kind === "rect")).toHaveLength(7);
    expect(s.lineAlpha).toBe(0.9);
    expect(s.dashedLines).toBe(false);
  });

  test("every pattern draws; mowing fades out at 40; no patches above 70", () => {
    for (const mowing of ["stripes", "checker", "diagonal", "circles"] as const) {
      const pristine = pitchSurface({ condition: 90, turf: "natural", mowing, seed: "f1" });
      expect(pristine.shapes.length).toBeGreaterThan(0);
      expect(pristine.shapes.every((x) => x.layer === "mowing")).toBe(true);
      const worn = pitchSurface({ condition: 30, turf: "natural", mowing, seed: "f1" });
      expect(worn.shapes.some((x) => x.layer === "mowing")).toBe(false);
    }
  });

  test("worn and rotten: patches inside the pitch, deterministic by seed, rotten has puddles and dashed lines", () => {
    const a = pitchSurface({ condition: 25, turf: "natural", mowing: "stripes", seed: "fx" });
    const b = pitchSurface({ condition: 25, turf: "natural", mowing: "stripes", seed: "fx" });
    expect(a).toEqual(b);
    expect(a.shapes.filter((x) => x.layer === "wear").length).toBeGreaterThanOrEqual(5);
    expect(a.shapes.every(inside)).toBe(true);
    const r = pitchSurface({ condition: 5, turf: "natural", mowing: "stripes", seed: "fx" });
    expect(r.shapes.some((x) => x.kind === "poly" && x.color === 0x7a948a)).toBe(true);
    expect(r.dashedLines).toBe(true);
    expect(r.lineAlpha).toBeLessThan(0.6);
  });

  test("synthetic: never patches, its own base", () => {
    const s = pitchSurface({ condition: 5, turf: "synthetic", mowing: "stripes", seed: "fx" });
    expect(s.shapes.some((x) => x.layer === "wear")).toBe(false);
    expect(s.base).toBe(0x158a44);
    expect(s.dashedLines).toBe(false);
  });

  test("clipToPitch keeps a polygon inside", () => {
    const out = clipToPitch([-10, -10, 50, -10, 50, 30, -10, 30]);
    expect(out).toEqual([0, 0, 50, 0, 50, 30, 0, 30]);
  });
});
