import { describe, expect, test } from "bun:test";
import { Player } from "@/Domain/Player";
import type { PlayerStatsRecord } from "@/types/playerTypes";

const stats = (over: Partial<PlayerStatsRecord>): PlayerStatsRecord => ({
  passing: 3, vision: 3, finishing: 3, dribbling: 3, speed: 3, acceleration: 3, tackling: 3,
  pressing: 3, stamina: 3, heading: 3, strength: 3, reflex: 1, jump: 1, ...over,
});

describe("Player.bestSpecificRole", () => {
  test("GK is always GK", () => {
    expect(Player.bestSpecificRole(stats({ reflex: 8 }), "GK")).toBe("GK");
  });
  test("a finisher forward fits ST", () => {
    expect(Player.bestSpecificRole(stats({ finishing: 9, heading: 8, strength: 8 }), "Forward")).toBe("ST");
  });
  test("accepts a detailed position and searches its main role", () => {
    const r = Player.bestSpecificRole(stats({ tackling: 9, heading: 9 }), "LB");
    expect(["CB", "LB", "RB", "LWB", "RWB"]).toContain(r);
  });
});
