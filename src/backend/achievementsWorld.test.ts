import { describe, expect, test } from "bun:test";
import { achievementSnapshot, clubArrival } from "@/backend/achievementsWorld";
import { applyAchievementDay } from "@/Domain/achievements/day";
import { emptyAchievements } from "@/Domain/achievements/progress";
import type { Squad } from "@/types/playerTypes";

const rich = (budget: number, capacity: number, level: number): Squad => ({
  id: "rich", name: "Rich", colors: ["#000000", "#ffffff"], money: 0, players: [],
  venue: { name: "Arena", city: "Town", capacity },
  finances: { broadcasting: 0, commercial: 0, total: 0, budget, followers: 0 },
  facilities: { items: { gym: { level, wear: 0 }, pool: { level, wear: 0 } } },
} as unknown as Squad);

describe("finance tracks count what the manager built", () => {
  test("a rich club unlocks nothing on day 1; later gains count from his arrival", () => {
    const day1 = rich(200_000_000, 60_000, 9);
    const input = (club: Squad, date: string, state = emptyAchievements()) => ({
      date, squadId: club.id, arrival: clubArrival(club), matches: [], transfers: [], awards: [],
      snapshot: achievementSnapshot(state, club, [], "s1"),
    });
    const first = applyAchievementDay(emptyAchievements(), input(day1, "2027-02-05"));
    expect(first.unlocked).toEqual([]);
    const later = rich(212_000_000, 62_500, 10);
    const second = applyAchievementDay(first.state, input(later, "2027-03-01", first.state));
    expect(second.unlocked.sort()).toEqual(["balance:bronze", "facilities:bronze", "stadium:bronze"]);
  });
});
