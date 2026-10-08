import { describe, expect, test } from "bun:test";
import { toDisplayPlayer } from "@/Domain/scout/displayPlayer";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const STATS: PlayerStatsRecord = {
  passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6,
  pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6,
};

const seenWith = (knowledge: number, noise: number): RosterPlayer => ({
  id: "p1", name: "P", age: 26, positions: ["CM"], preferredFoot: "right", stats: STATS,
  scoutView: { knowledge, noise },
} as RosterPlayer);

describe("toDisplayPlayer — scouting fields", () => {
  // A noise just under the range threshold used to round up to the threshold (0.46 → 0.5): the
  // attribute bars showed a range while the overall stayed a single number.
  test("statNoise and the overall range agree around the threshold", () => {
    for (const noise of [0.44, 0.46, 0.49, 0.499, 0.5, 0.51, 0.55]) {
      const d = toDisplayPlayer(seenWith(70, noise), "Club");
      expect((d.statNoise ?? 0) >= STAFF.RANGE_THRESHOLD).toBe(!!d.avgRange);
    }
  });

  test("attributes hidden below 20, exact noise at 100", () => {
    expect(toDisplayPlayer(seenWith(19.9, 1.6), "Club").hiddenAttrs).toBe(true);
    expect(toDisplayPlayer(seenWith(20, 1.5), "Club").hiddenAttrs).toBeUndefined();
    expect(toDisplayPlayer(seenWith(100, 0), "Club").statNoise).toBe(0);
  });
});

describe("toDisplayPlayer — season-award value (`awards.md`)", () => {
  test("an award winner shows the boosted value; without one, the value of before", () => {
    const own = { id: "p1", name: "P", age: 26, positions: ["CM"], preferredFoot: "right", stats: STATS } as RosterPlayer;
    const plain = toDisplayPlayer(own, "Club");
    const boosted = toDisplayPlayer({ ...own, awardBoost: { season: "2026-27", league: "pl", mult: 1.1 } }, "Club");
    expect(boosted.valueMillions).toBeCloseTo(plain.valueMillions * 1.1);
  });
});
