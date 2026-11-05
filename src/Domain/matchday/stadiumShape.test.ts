import { describe, expect, test } from "bun:test";
import { shapeFromFill, stadiumShapeOf, STADIUM_SHAPE } from "@/Domain/matchday/stadiumShape";

describe("stadium shape", () => {
  test("the outline's fill picks oval, rounded or square", () => {
    expect(shapeFromFill(0.79)).toBe("oval");
    expect(shapeFromFill(0.87)).toBe("rounded");
    expect(shapeFromFill(0.97)).toBe("square");
  });

  test("a small ground is always blocks, even with a real outline", () => {
    expect(stadiumShapeOf({ id: "a", capacity: 9000, real: "oval" })).toBe("blocks");
    expect(stadiumShapeOf({ id: "a", capacity: 74000, real: "oval" })).toBe("oval");
  });

  test("without an outline the shape is drawn from the id, stable and close to the real shares", () => {
    expect(stadiumShapeOf({ id: "std_x", capacity: 40000 })).toBe(stadiumShapeOf({ id: "std_x", capacity: 40000 }));
    const n = 4000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const s = stadiumShapeOf({ id: `std_${i}`, capacity: 40000 });
      count[s] = (count[s] ?? 0) + 1;
    }
    for (const [shape, share] of STADIUM_SHAPE.DRAWN) expect(Math.abs(count[shape]! / n - share)).toBeLessThan(0.03);
    expect(count.blocks).toBeUndefined();
  });

  test("an unknown capacity (0) never makes blocks", () => {
    expect(stadiumShapeOf({ id: "a", capacity: 0 })).not.toBe("blocks");
  });
});
