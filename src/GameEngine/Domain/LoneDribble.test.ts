import { describe, expect, test } from "bun:test";
import { LONE_DRIBBLE } from "@/GameEngine/Configs/CarryConfig";
import { loneDribbleFactor } from "@/GameEngine/Domain/DecisionTree";
import type { GamePlayer } from "@/GameEngine/types";

/** A holder with nobody to play with only takes defenders on when he can dribble (tester report, 10.7). */

const p = (id: number, team: "A" | "B", x: number, y: number, extra: Partial<GamePlayer> = {}, dribbling = 0.5) => ({
  id, team, x, y, role: "ST", recoveryTime: 0, runtimeStats: { withBall: { dribbling } }, ...extra,
}) as unknown as GamePlayer;

describe("loneDribbleFactor", () => {
  const defender = p(20, "B", 84, 37);

  test("alone against a defender: nothing below the lower skill, everything from the upper one, linear between", () => {
    const at = (skill: number) => loneDribbleFactor(p(1, "A", 80, 37, {}, skill), [defender], [p(1, "A", 80, 37)]);
    expect(at(LONE_DRIBBLE.SKILL_FROM - 0.1)).toBe(0);
    expect(at(LONE_DRIBBLE.SKILL_FROM)).toBe(0);
    expect(at(LONE_DRIBBLE.SKILL_FULL)).toBe(1);
    expect(at(0.95)).toBe(1);
    expect(at((LONE_DRIBBLE.SKILL_FROM + LONE_DRIBBLE.SKILL_FULL) / 2)).toBeCloseTo(0.5, 6);
  });

  test("a teammate close by, no opponent near, or the rule off: the score is untouched", () => {
    const holder = p(1, "A", 80, 37, {}, 0.2);
    const near = p(2, "A", 80 - LONE_DRIBBLE.SUPPORT_RADIUS + 1, 37);
    const far = p(3, "A", 80 - LONE_DRIBBLE.SUPPORT_RADIUS - 5, 37);
    expect(loneDribbleFactor(holder, [defender], [holder, near])).toBe(1);
    expect(loneDribbleFactor(holder, [defender], [holder, far])).toBe(0);
    // The goalkeeper is no support; a beaten (recovering) defender is no threat.
    expect(loneDribbleFactor(holder, [defender], [holder, { ...near, role: "GK" } as GamePlayer])).toBe(0);
    expect(loneDribbleFactor(holder, [{ ...defender, recoveryTime: 0.5 } as GamePlayer], [holder])).toBe(1);
    expect(loneDribbleFactor(holder, [p(21, "B", 80 + LONE_DRIBBLE.CROWD_RADIUS + 2, 37)], [holder])).toBe(1);
    const was = LONE_DRIBBLE.ENABLED;
    LONE_DRIBBLE.ENABLED = false;
    try {
      expect(loneDribbleFactor(holder, [defender], [holder])).toBe(1);
    } finally {
      LONE_DRIBBLE.ENABLED = was;
    }
  });
});
