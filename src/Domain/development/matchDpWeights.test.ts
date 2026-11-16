import { describe, expect, test } from "bun:test";
import { dpWeightsFor, matchDpWeights, playedRoles, POSITION_ADAPT } from "@/Domain/development/dpWeights";
import type { RosterPlayer } from "@/types/playerTypes";

const cb = {
  id: "p", name: "P", age: 24, squadId: "s", preferredFoot: "right", positions: ["Defender"], naturalPosition: "CB",
  stats: { passing: 4, vision: 4, finishing: 2, dribbling: 3, speed: 5, acceleration: 5, tackling: 6, pressing: 6, stamina: 5, heading: 6, strength: 6, reflex: 0, jump: 1 },
} as unknown as RosterPlayer;

describe("position adaptation by playing (tester report)", () => {
  test("his natural slot, no slot or an unknown one: his own weights", () => {
    expect(matchDpWeights(cb, "CB")).toEqual(dpWeightsFor(cb));
    expect(matchDpWeights(cb)).toEqual(dpWeightsFor(cb));
    expect(matchDpWeights(cb, "XX")).toEqual(dpWeightsFor(cb));
  });

  test("another slot moves a share of the DP there, the total stays", () => {
    const own = dpWeightsFor(cb);
    const out = matchDpWeights(cb, "ST");
    const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(out)).toBeCloseTo(sum(own), 6);
    expect(out.shooting).toBeGreaterThan(own.shooting);
    expect(out.defending).toBeCloseTo((1 - POSITION_ADAPT.MATCH_SHARE) * own.defending + POSITION_ADAPT.MATCH_SHARE * matchDpWeights({ ...cb, naturalPosition: "ST", positions: ["Forward"] } as RosterPlayer, "ST").defending, 6);
  });

  test("a substitute plays the slot of the player he replaced", () => {
    const roles = playedRoles(["a", "b", ""], ["GK", "CB", "ST"], [{ playerOutId: "b", playerInId: "c" }, { playerOutId: "x", playerInId: "d" }]);
    expect(roles).toEqual({ a: "GK", b: "CB", c: "CB" });
  });
});
