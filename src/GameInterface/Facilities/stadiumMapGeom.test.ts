import { describe, expect, test } from "bun:test";
import { STAND_FULL, STAND_RING, paintedStands, stadiumMapGeom } from "@/GameInterface/Facilities/stadiumMapGeom";

describe("club stadium drawing", () => {
  test("full depth without depths, bowl around all stands", () => {
    const g = stadiumMapGeom("rounded", null);
    expect(g.stands).toEqual(STAND_FULL);
    expect(g.bowl).toMatchObject({ x: 6, y: 6, w: 308, h: 388 });
  });

  test("a thinner stand keeps its pitch-side edge and the bowl follows it", () => {
    const g = stadiumMapGeom("oval", { north: 0.5, south: 1, east: 1, west: 0.5 });
    expect(g.stands.west.x + g.stands.west.w).toBe(STAND_FULL.west.x + STAND_FULL.west.w);
    expect(g.stands.west.w).toBe(35);
    expect(g.stands.north.y + g.stands.north.h).toBe(STAND_FULL.north.y + STAND_FULL.north.h);
    expect(g.bowl!.x).toBe(g.stands.west.x - 8);
    expect(g.bowl!.rx).toBeGreaterThan(100);
  });

  test("the painted map uses separate stands up to phase 3 and the ring after it", () => {
    expect(paintedStands(3)).toBe(STAND_FULL);
    expect(paintedStands(4)).toBe(STAND_RING);
    expect(paintedStands(5)).toBe(STAND_RING);
  });

  test("separate stands have no bowl", () => {
    expect(stadiumMapGeom("blocks", null).bowl).toBeNull();
  });
});
