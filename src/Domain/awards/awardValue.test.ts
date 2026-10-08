import { describe, expect, test } from "bun:test";
import { awardValueMult, playerValueModel } from "@/Domain/awards/awardValue";
import { Player } from "@/Domain/Player";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer } from "@/types/playerTypes";

const STATS_6 = {
  passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6,
  tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6,
};
const mk = (extra: Partial<RosterPlayer> = {}): RosterPlayer =>
  ({ id: "p", name: "p", age: 27, stats: { ...STATS_6 }, positions: ["Forward"], preferredFoot: "right", ...extra } as never);

describe("award value", () => {
  test("the boost multiplies the value and the price grid", () => {
    const p = mk();
    const base = playerValueModel(p).valueMillions;
    const boosted = playerValueModel(mk({ awardBoost: { season: "x", league: "y", mult: 1.15 } }));
    expect(boosted.valueMillions).toBeCloseTo(base * 1.15);
    expect(boosted.price).toBe(new Player(overallAvg(p), 27, 1.15).price);
  });
  test("without a boost (or a 3rd argument) nothing changes", () => {
    const p = mk();
    expect(awardValueMult(p)).toBe(1);
    expect(playerValueModel(p).valueMillions).toBe(new Player(overallAvg(p), 27).valueMillions);
    expect(playerValueModel(p, 6).valueMillions).toBe(new Player(6, 27).valueMillions);
  });
});
