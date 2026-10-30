import { describe, expect, test } from "bun:test";
import { hudAttributes } from "@/Domain/match/matchHud";

describe("match HUD attributes", () => {
  test("by position, shown 0..100", () => {
    const stats = { finishing: 8.4, heading: 6, speed: 7.7, strength: 5, passing: 6.6, reflex: 9 };
    expect(hudAttributes("ST", stats)).toEqual([
      { key: "finishing", value: 84 }, { key: "heading", value: 60 }, { key: "speed", value: 77 }, { key: "strength", value: 50 },
    ]);
    expect(hudAttributes("GK", stats).map((a) => a.key)).toEqual(["reflex", "jump", "pressing", "passing"]);
    expect(hudAttributes("XYZ", stats)).toHaveLength(4);
  });
});
