import { describe, expect, test } from "bun:test";
import { continentalQualificationOf, type ContinentalCompetitionResult } from "@/backend/continentalWorld";
import type { LeagueSeasonMeta } from "@/types/calendarTypes";

function competitionResult(
  slug: ContinentalCompetitionResult["slug"],
  groups: { name: string; clubs: string[] }[],
  groupOf: Record<string, string>,
): ContinentalCompetitionResult {
  const meta: LeagueSeasonMeta = {
    leagueSlug: slug,
    year: 2027,
    start: "2027-08-15",
    end: "2028-05-25",
    totalRounds: 13,
    kind: "continental",
    continental: {
      competition: slug,
      continent: "Europe",
      groups,
      stages: [],
      countryOf: {},
      level: {},
      championId: null,
    },
  };
  return { slug, meta, groupOf, opponentsOf: {} };
}

describe("continentalQualificationOf", () => {
  test("finds the club's group and group-mates in the primary competition", () => {
    const primary = competitionResult(
      "ucl",
      [{ name: "C", clubs: ["my_club", "real_madrid", "bayern", "ajax"] }],
      { my_club: "C", real_madrid: "C", bayern: "C", ajax: "C" },
    );
    const secondary = competitionResult("uel", [{ name: "A", clubs: ["x", "y", "z", "w"] }], {});

    const result = continentalQualificationOf("my_club", { primary, secondary });
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("ucl");
    expect(result!.group).toBe("C");
    expect(result!.opponentIds.sort()).toEqual(["ajax", "bayern", "real_madrid"]);
  });

  test("finds the club in the secondary competition when it is not in the primary", () => {
    const primary = competitionResult("ucl", [{ name: "A", clubs: ["a1", "a2", "a3", "a4"] }], {
      a1: "A", a2: "A", a3: "A", a4: "A",
    });
    const secondary = competitionResult("uel", [{ name: "B", clubs: ["my_club", "b2", "b3", "b4"] }], {
      my_club: "B", b2: "B", b3: "B", b4: "B",
    });

    const result = continentalQualificationOf("my_club", { primary, secondary });
    expect(result?.slug).toBe("uel");
    expect(result?.group).toBe("B");
    expect(result?.opponentIds.sort()).toEqual(["b2", "b3", "b4"]);
  });

  test("league format: no group, the 8 league-phase opponents", () => {
    const primary = competitionResult("ucl", [], { my_club: "", o1: "" });
    primary.meta.continental!.format = "league";
    primary.opponentsOf = { my_club: ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"] };
    const secondary = competitionResult("uel", [], {});
    const result = continentalQualificationOf("my_club", { primary, secondary });
    expect(result).toEqual({ slug: "ucl", group: "", format: "league", opponentIds: ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"] });
  });

  test("returns null when the club is in neither competition", () => {
    const primary = competitionResult("ucl", [{ name: "A", clubs: ["a1", "a2", "a3", "a4"] }], {
      a1: "A", a2: "A", a3: "A", a4: "A",
    });
    const secondary = competitionResult("uel", [{ name: "B", clubs: ["b1", "b2", "b3", "b4"] }], {
      b1: "B", b2: "B", b3: "B", b4: "B",
    });

    expect(continentalQualificationOf("championship_club", { primary, secondary })).toBeNull();
  });
});
