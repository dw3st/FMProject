import { describe, expect, test } from "bun:test";
import { filterReports, reportScoutId, sortReports } from "@/Domain/scouting/reportView";
import { RECOMMENDATION_ORIGIN, type ScoutReport } from "@/types/scoutingTypes";

const rep = (o: Partial<ScoutReport>): ScoutReport => ({
  id: o.id ?? "r", date: "2027-01-10", playerId: "p1", name: "A", squadId: "s", club: "C", league: "l", country: "Spain",
  nationality: "Spain", age: 24, position: "ST", k: 50, overall: [5, 6], potential: [5, 6], value: [1, 2], wageDemand: 1000,
  forSale: false, grade: "B", gem: false, text: "squad", ...o,
} as ScoutReport);

const missions = [{ id: "m1", scoutId: "chief" }, { id: "m2", scoutId: "f1" }];

describe("scout report view", () => {
  test("the scout comes from the report, the mission or the recommendation", () => {
    expect(reportScoutId(rep({ scoutId: "f9" }), missions)).toBe("f9");
    expect(reportScoutId(rep({ missionId: "m2" }), missions)).toBe("f1");
    expect(reportScoutId(rep({ missionId: RECOMMENDATION_ORIGIN }), missions)).toBe("chief");
    expect(reportScoutId(rep({ missionId: "gone" }), missions)).toBeNull();
  });

  test("one row per player (the newest), filtered by scout and grade", () => {
    const rows = [
      rep({ id: "a", playerId: "p1", missionId: "m1", date: "2027-01-01", grade: "C" }),
      rep({ id: "b", playerId: "p1", missionId: "m2", date: "2027-01-08", grade: "A" }),
      rep({ id: "c", playerId: "p2", missionId: "m2", grade: "D" }),
    ];
    expect(filterReports(rows, { mission: "all", scout: "all", grades: [] }, missions).map((r) => r.id).sort()).toEqual(["b", "c"]);
    expect(filterReports(rows, { mission: "all", scout: "chief", grades: [] }, missions).map((r) => r.id)).toEqual(["a"]);
    expect(filterReports(rows, { mission: "all", scout: "all", grades: ["A", "B"] }, missions).map((r) => r.id)).toEqual(["b"]);
  });

  test("sort by grade (A first) and by value (highest first)", () => {
    const rows = [rep({ id: "x", grade: "C", value: [10, 10] }), rep({ id: "y", grade: "A", value: [1, 1] })];
    expect(sortReports(rows, "grade", "asc").map((r) => r.id)).toEqual(["y", "x"]);
    expect(sortReports(rows, "value", "desc").map((r) => r.id)).toEqual(["x", "y"]);
  });
});
