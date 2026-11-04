import { describe, expect, test } from "bun:test";
import { groupByMonth } from "@/Domain/changelog/changelogMonths";

describe("groupByMonth", () => {
  test("groups by month and keeps the order", () => {
    const groups = groupByMonth([
      { date: "2026-11-04", v: "c" }, { date: "2026-11-01", v: "b" }, { date: "2026-10-31", v: "a" },
    ]);
    expect(groups.map((g) => g.month)).toEqual(["2026-11", "2026-10"]);
    expect(groups[0]!.entries.map((e) => e.v)).toEqual(["c", "b"]);
    expect(groups[1]!.entries.map((e) => e.v)).toEqual(["a"]);
  });

  test("empty", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
