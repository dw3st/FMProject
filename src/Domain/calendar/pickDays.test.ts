import { describe, expect, test } from "bun:test";
import { pickDaysMinCost } from "@/Domain/calendar/pickDays";

describe("pickDaysMinCost", () => {
  test("picks the k cheapest strictly increasing days", () => {
    const cost = [5, 0, 5, 0, 5, 0];
    const picks = pickDaysMinCost({ days: 6, k: 3, dayCost: (j) => cost[j]!, gapCost: () => 0 });
    expect(picks).toEqual([1, 3, 5]);
  });

  test("respects the hard minimum gap and returns null without room", () => {
    expect(pickDaysMinCost({ days: 5, k: 3, dayCost: () => 0, gapCost: () => 0, minGap: 3 })).toBeNull();
    const picks = pickDaysMinCost({ days: 7, k: 3, dayCost: () => 0, gapCost: () => 0, minGap: 3 })!;
    expect(picks).toEqual([0, 3, 6]);
  });

  test("gap cost trades off against day cost; first-pick cost is applied", () => {
    // A 1-day gap costs 10 and day 3 costs 100: [1, 2] (cost 12) beats [1, 3] (101); day 0 is ruled out by firstCost.
    const picks = pickDaysMinCost({
      days: 4,
      k: 2,
      dayCost: (j) => (j === 3 ? 100 : 1),
      gapCost: (g) => (g < 2 ? 10 : 0),
      firstCost: (j) => (j === 0 ? 1000 : 0),
    });
    expect(picks).toEqual([1, 2]);
  });

  test("k = 0 is empty", () => {
    expect(pickDaysMinCost({ days: 3, k: 0, dayCost: () => 0, gapCost: () => 0 })).toEqual([]);
  });
});
