import { describe, expect, test } from "bun:test";
import rolesData from "@/Data/roles.json";
import { DP_CATEGORIES } from "@/GameEngine/PlayerDevelopment";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import type { RosterPlayer } from "@/types/playerTypes";

const ROLES = rolesData as unknown as Record<string, { dpWeights: Record<string, number> }>;

describe("dpWeights", () => {
  test("every role has the 7 categories and sums to 1", () => {
    for (const [role, v] of Object.entries(ROLES)) {
      expect(Object.keys(v.dpWeights).sort()).toEqual([...DP_CATEGORIES].sort());
      expect(Object.values(v.dpWeights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      if (role === "GK") expect(v.dpWeights.goalkeeping).toBeGreaterThan(0.4);
      else expect(v.dpWeights.goalkeeping).toBe(0);
    }
  });
  test("weights follow the natural position, not the line in positions[0]", () => {
    const st = { id: "s", age: 24, preferredFoot: "right", positions: ["Forward"], stats: { passing: 4, vision: 4, finishing: 8,
      dribbling: 6, speed: 6, acceleration: 6, tackling: 2, pressing: 3, stamina: 5, heading: 6, strength: 6, reflex: 1, jump: 3 } } as unknown as RosterPlayer;
    expect(preferredRole(st)).toBe("ST");
    expect(dpWeightsFor(st) as Record<string, number>).toEqual(ROLES.ST!.dpWeights);
    const gk = { ...st, id: "g", positions: ["GK"], stats: { ...st.stats, reflex: 7, jump: 6, passing: 4 } } as unknown as RosterPlayer;
    expect(dpWeightsFor(gk).goalkeeping).toBeGreaterThan(0.4);
  });
});
