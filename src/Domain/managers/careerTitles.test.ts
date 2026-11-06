import { describe, expect, test } from "bun:test";
import { titlesByPassage } from "@/Domain/managers/careerTitles";
import type { ManagerTitle } from "@/types/managerTypes";

const title = (squadId: string, competition: string, season: string, points: number, on?: string): ManagerTitle =>
  ({ season, kind: "league", competition, squadId, points, ...(on ? { on } : {}) });

describe("titlesByPassage", () => {
  const passages = [
    { squadId: "rm", from: "2026-08-15", to: "2028-05-17" },
    { squadId: "car", from: "2029-07-06", to: "2031-12-01" },
    { squadId: "rm", from: "2032-01-01" },
  ];

  test("groups each club's titles by competition, by date", () => {
    const { byPassage, rest } = titlesByPassage(passages, [
      title("rm", "la_liga", "2026-27", 103, "2027-05-20"),
      title("rm", "la_liga", "2027-28", 102, "2028-05-17"),
      title("car", "vzla", "2030", 81, "2030-12-01"),
      title("rm", "la_liga", "2032-33", 100, "2033-05-20"),
    ]);
    expect(byPassage[0]).toEqual([{ kind: "league", competition: "la_liga", count: 2, points: 205, seasons: ["2026-27", "2027-28"] }]);
    expect(byPassage[1]![0]!.count).toBe(1);
    expect(byPassage[2]![0]!.points).toBe(100);
    expect(rest).toEqual([]);
  });

  test("a title of no passage stays apart", () => {
    const { rest } = titlesByPassage(passages, [title("nat_br", "wc", "2030", 200)]);
    expect(rest).toHaveLength(1);
  });

  test("without a date the latest passage of the club", () => {
    const { byPassage } = titlesByPassage(passages, [title("rm", "la_liga", "2033", 100)]);
    expect(byPassage[2]).toHaveLength(1);
  });
});
