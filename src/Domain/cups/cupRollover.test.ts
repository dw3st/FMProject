import { describe, expect, test } from "bun:test";
import { buildCupArchive, countriesToRegenerate } from "@/Domain/cups/cupRollover";

const leagues = [
  { leagueSlug: "pl", country: "England", year: 2027, start: "2027-08-15", end: "2028-05-20" },
  { leagueSlug: "ch", country: "England", year: 2027, start: "2027-08-10", end: "2028-05-25" },
  { leagueSlug: "sa", country: "Italy", year: 2027, start: "2027-08-20", end: "2028-05-30" },
  { leagueSlug: "sb", country: "Italy", year: 2026, start: "2026-08-20", end: "2027-06-01" },
];

describe("countriesToRegenerate", () => {
  test("only countries whose every league moved past the cup year", () => {
    const out = countriesToRegenerate(leagues, { England: 2026, Italy: 2026, Spain: 2026 });
    expect(out).toEqual([{ country: "England", year: 2027, window: { start: "2027-08-10", end: "2028-05-25" } }]);
  });
  test("a country with no cup yet is ignored", () => {
    expect(countriesToRegenerate(leagues, {})).toEqual([]);
  });
});

describe("buildCupArchive", () => {
  test("title for the champion", () => {
    const a = buildCupArchive(
      { leagueSlug: "cup_england", year: 2026, start: "s", end: "e", totalRounds: 6, kind: "cup",
        cup: { country: "England", stages: [], byes: [], tiers: {}, championId: "33" } },
      (id) => ({ name: `Club ${id}`, coachId: null, coachName: "" }),
    );
    expect(a.leagueSlug).toBe("cup_england");
    expect(a.titles).toEqual([{ competition: "cup_england", clubId: "33", clubName: "Club 33", coachId: null, coachName: "" }]);
    expect(a.standings).toEqual([]);
  });
});
