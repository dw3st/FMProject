import { describe, expect, test } from "bun:test";
import { AWARDS } from "@/Domain/awards/awardsConfig";
import { LEAGUE_AWARD_KINDS, AWARD_KINDS } from "@/types/awardTypes";

describe("awards config", () => {
  test("kinds", () => {
    expect([...LEAGUE_AWARD_KINDS]).toEqual(["best_player", "young_player", "top_scorer", "best_goalkeeper", "team_of_season", "best_manager", "goal_of_season"]);
    expect([...AWARD_KINDS]).toEqual([...LEAGUE_AWARD_KINDS, "world_player", "world_manager"]);
  });
  test("value boosts 10–15%, morale positive, xi slots of the 4-3-3", () => {
    for (const v of Object.values(AWARDS.VALUE_MULT)) { expect(v).toBeGreaterThanOrEqual(1.10); expect(v).toBeLessThanOrEqual(1.15); }
    for (const v of Object.values(AWARDS.MORALE)) expect(v).toBeGreaterThan(0);
    expect([...AWARDS.XI_SLOTS]).toEqual(["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"]);
    expect(AWARDS.YOUNG_MAX_AGE).toBe(21);
    expect(AWARDS.TIER_FACTOR[1]).toBe(1);
  });
});
