import { describe, expect, test } from "bun:test";
import { groupAwards } from "@/Domain/awards/awardGroups";

describe("groupAwards", () => {
  test("a repeated kind becomes one entry with its count and every title, in order of first appearance", () => {
    expect(groupAwards([
      { kind: "world_manager", title: "2030" },
      { kind: "best_manager", title: "La Liga 2027-28" },
      { kind: "world_manager", title: "2029" },
    ])).toEqual([
      { kind: "world_manager", count: 2, titles: ["2030", "2029"] },
      { kind: "best_manager", count: 1, titles: ["La Liga 2027-28"] },
    ]);
  });
  test("nothing to group", () => {
    expect(groupAwards([])).toEqual([]);
  });
});
