import { describe, expect, test } from "bun:test";
import { easeOffsets, spreadOffsets } from "@/GraficsEngine/markerSpread";

const at = (id: number, x: number, y: number) => ({ id, x, y });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("spreadOffsets", () => {
  test("players far enough apart are not moved", () => {
    expect(spreadOffsets([at(1, 10, 10), at(2, 14, 10)], 3, 1).size).toBe(0);
  });

  test("an overlapping pair is pushed apart along the line between them, half each", () => {
    const offs = spreadOffsets([at(1, 10, 10), at(2, 11, 10)], 3, 2);
    expect(offs.get(1)!.x).toBeCloseTo(-1, 5);
    expect(offs.get(2)!.x).toBeCloseTo(1, 5);
    expect(offs.get(1)!.y).toBeCloseTo(0, 5);
  });

  test("no offset is longer than the cap", () => {
    const pts = [at(1, 10, 10), at(2, 10.2, 10), at(3, 10.1, 10.3), at(4, 9.9, 9.8), at(5, 10.4, 10.1)];
    for (const o of spreadOffsets(pts, 4, 0.6).values()) expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  test("a group ends further apart than it started", () => {
    const pts = [at(1, 10, 10), at(2, 11, 10), at(3, 10.5, 10.8)];
    const offs = spreadOffsets(pts, 2.5, 1.5);
    const moved = pts.map((p) => ({ x: p.x + (offs.get(p.id)?.x ?? 0), y: p.y + (offs.get(p.id)?.y ?? 0) }));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      expect(dist(moved[i]!, moved[j]!)).toBeGreaterThan(dist(pts[i]!, pts[j]!));
    }
  });

  test("a fixed player stays and the other takes the whole push", () => {
    const offs = spreadOffsets([at(1, 10, 10), at(2, 11, 10)], 3, 5, new Set([1]));
    expect(offs.has(1)).toBe(false);
    expect(offs.get(2)!.x).toBeCloseTo(2, 5);
  });

  test("two players on the same spot split, always the same way", () => {
    const a = spreadOffsets([at(1, 10, 10), at(2, 10, 10)], 2, 1);
    const b = spreadOffsets([at(1, 10, 10), at(2, 10, 10)], 2, 1);
    expect(a.size).toBe(2);
    expect(a.get(1)).toEqual(b.get(1)!);
    expect(Math.hypot(a.get(1)!.x, a.get(1)!.y)).toBeGreaterThan(0.5);
  });
});

describe("easeOffsets", () => {
  test("moves part of the way and reaches the target with a big step", () => {
    const target = new Map([[1, { x: 1, y: 0 }]]);
    expect(easeOffsets(new Map(), target, 0.05, 10).get(1)!.x).toBeCloseTo(0.5, 5);
    expect(easeOffsets(new Map(), target, 1, 10).get(1)!.x).toBeCloseTo(1, 5);
  });

  test("an offset with no target fades out and is dropped", () => {
    const prev = new Map([[1, { x: 1, y: 0 }]]);
    expect(easeOffsets(prev, new Map(), 0.05, 10).get(1)!.x).toBeCloseTo(0.5, 5);
    expect(easeOffsets(prev, new Map(), 1, 10).size).toBe(0);
  });
});
