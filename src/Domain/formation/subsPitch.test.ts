import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { cardsOverlap, subsCardPercent, subsSlotPositions } from "@/Domain/formation/subsPitch";
import { spreadAlongAxis, wideCardSpec } from "@/Domain/formation/pitchMarkers";

type F = { id: string; attacking: { x: number; y: number }[]; defending: { x: number; y: number }[] };
const dir = new URL("../../Data/formations/", import.meta.url);
const formations: F[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

describe("subsSlotPositions", () => {
  test("17 formations", () => expect(formations.length).toBe(17));
  // Desktop (1080p), a laptop window and a short window (compact cards): the panel's pitch at those sizes.
  for (const [w, h] of [[860, 555], [640, 413], [520, 335], [480, 309]] as const) {
    test(`no two cards overlap in any formation (${w}×${h})`, () => {
      const card = subsCardPercent(w, h);
      for (const f of formations) {
        const pos = subsSlotPositions(f.attacking, f.defending, card);
        expect({ id: f.id, overlap: cardsOverlap(pos, card.w, card.h) }).toEqual({ id: f.id, overlap: false });
        for (const p of pos) {
          expect(p.x - card.w / 2).toBeGreaterThanOrEqual(-0.01);
          expect(p.x + card.w / 2).toBeLessThanOrEqual(100.01);
          expect(p.y - card.h / 2).toBeGreaterThanOrEqual(-0.01);
          expect(p.y + card.h / 2).toBeLessThanOrEqual(100.01);
        }
      }
    });
  }
  test("the keeper stays at the back and the forwards at the front", () => {
    const f = formations.find((x) => x.id === "4-3-3")!;
    const pos = subsSlotPositions(f.attacking, f.defending, subsCardPercent(860, 555));
    expect(pos[0]!.x).toBeLessThan(Math.min(...pos.slice(1).map((p) => p.x)));
    expect(pos[9]!.x).toBeGreaterThan(pos[5]!.x);
  });
});

describe("spreadAlongAxis (horizontal)", () => {
  test("two cards on the same spot are pushed apart along x only", () => {
    const out = spreadAlongAxis([{ x: 50, y: 50 }, { x: 50, y: 52 }], wideCardSpec(14, 8));
    expect(Math.abs(out[1]!.x - out[0]!.x)).toBeGreaterThanOrEqual(13.99);
    expect(out[0]!.y).toBe(50);
    expect(out[1]!.y).toBe(52);
  });
  test("cards far apart across the pitch stay put", () => {
    const pts = [{ x: 50, y: 20 }, { x: 50, y: 60 }];
    expect(spreadAlongAxis(pts, wideCardSpec(14, 8))).toEqual(pts);
  });
});
