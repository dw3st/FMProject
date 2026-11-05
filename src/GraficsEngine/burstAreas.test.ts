import { describe, expect, test } from "bun:test";
import { burstAreas } from "@/GraficsEngine/stadiumAtmosphere";

const rect = (side: string) => ({ side, x: 0, y: 0, w: 10, h: 10 });
const SIDES = ["top", "bottom", "left", "right"].map(rect);

describe("burstAreas: a stand under works has no flares or fireworks", () => {
  test("all open: the home end and the fireworks over top and bottom", () => {
    const a = burstAreas(SIDES, "left", [])!;
    expect(a.end.side).toBe("left");
    expect(a.sky.map((r) => r.side)).toEqual(["top", "bottom"]);
  });
  test("home end closed: the other end", () => {
    expect(burstAreas(SIDES, "left", ["left"])!.end.side).toBe("right");
  });
  test("a closed side loses its fireworks; both ends closed: a side stand", () => {
    const a = burstAreas(SIDES, "left", ["left", "right", "top"])!;
    expect(a.end.side).toBe("bottom");
    expect(a.sky.map((r) => r.side)).toEqual(["bottom"]);
  });
  test("every stand closed: no burst", () => {
    expect(burstAreas(SIDES, "left", ["top", "bottom", "left", "right"])).toBeNull();
  });
});
