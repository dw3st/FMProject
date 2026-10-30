import { describe, expect, test } from "bun:test";
import { grassPhoto } from "@/GraficsEngine/grassPhoto";

describe("grass photo", () => {
  test("by grass type and condition", () => {
    expect(grassPhoto({ condition: 90, turf: "natural" }).id).toBe("grass-a");
    expect(grassPhoto({ condition: 90, turf: "hybrid" }).id).toBe("grass-b");
    expect(grassPhoto({ condition: 90, turf: "synthetic" })).toMatchObject({ id: "grass-c" });
    expect(grassPhoto({ condition: 30, turf: "natural" }).id).toBe("grass-worn");
    expect(grassPhoto({ condition: 5, turf: "natural" }).id).toBe("grass-muddy");
    // synthetic never wears into mud
    expect(grassPhoto({ condition: 5, turf: "synthetic" }).id).toBe("grass-c");
  });
});
