import { describe, expect, test } from "bun:test";
import { autoReleased, autoReleaseValue, parseAutoRelease } from "@/Domain/youth/autoRelease";
import type { RosterPlayer } from "@/types/playerTypes";

const p = (id: string, level: number, over: Partial<RosterPlayer> = {}): RosterPlayer => ({
  id, name: id, age: 16, positions: ["Midfielder"], overallAvg: level,
  stats: { finishing: level, passing: level, dribbling: level, tackling: level, pressing: level, speed: level, acceleration: level, strength: level, stamina: level, vision: level, heading: level, reflex: 1, jump: 1 },
  ...over,
} as unknown as RosterPlayer);

describe("youth auto release", () => {
  test("parse", () => {
    expect(parseAutoRelease(null)).toBeNull();
    expect(parseAutoRelease({ by: "level", below: 4.55 })).toEqual({ by: "level", below: 4.6 });
    expect(parseAutoRelease({ by: "x", below: 4 })).toBe("invalid");
    expect(parseAutoRelease({ by: "potential", below: 11 })).toBe("invalid");
  });
  test("below the level leaves; reborn and created players stay", () => {
    const youth = [p("a", 3), p("b", 6), p("c", 3, { reborn: { fromId: "x" } } as Partial<RosterPlayer>), p("created_d", 3)];
    const low = autoReleaseValue(youth[0]!, "level");
    expect(autoReleased(youth, { by: "level", below: low + 0.1 }).map((x) => x.id)).toEqual(["a"]);
    expect(autoReleased(youth, null)).toEqual([]);
  });
});
