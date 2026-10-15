import { describe, expect, test } from "bun:test";
import { WORLD, isWorldDeadline } from "@/Domain/multiplayer/worldConfig";

describe("world config", () => {
  test("8 managers, 20 pending invites, 24 h by default", () => {
    expect(WORLD.MAX_MEMBERS).toBe(8);
    expect(WORLD.MAX_PENDING_INVITES).toBe(20);
    expect(WORLD.DEFAULT_DEADLINE).toBe(24);
  });

  test("deadline: 12, 24, 48 or none", () => {
    for (const v of [12, 24, 48, null]) expect(isWorldDeadline(v)).toBe(true);
    for (const v of [0, 6, 36, "24", undefined, 24.5]) expect(isWorldDeadline(v)).toBe(false);
  });
});
