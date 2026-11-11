import { describe, expect, test } from "bun:test";
import { autoBioParts } from "@/Domain/managers/autoBio";

describe("automatic manager bio (8.9.40)", () => {
  test("first job, no titles", () => {
    const p = autoBioParts({ squadId: "c1", clubName: "Club One", seasons: 0, titles: [], awards: [], clubs: [{ squadId: "c1", from: "2027-02-05" }] });
    expect(p.job).toEqual({ kind: "club", club: "Club One", year: "2027" });
    expect(p.career).toEqual({ first: true });
    expect(p.titles).toEqual({ count: 0, best: null });
    expect(p.highlight).toBeNull();
  });

  test("a career: the biggest title, the strongest highlight, without a club", () => {
    const p = autoBioParts({
      squadId: "", seasons: 7,
      titles: [
        { season: "2028", kind: "cup", competition: "cup_spain", squadId: "c1", points: 50 },
        { season: "2029-30", kind: "continental", competition: "uel", squadId: "c2", points: 80 },
        { season: "2027", kind: "promotion", competition: "segunda", squadId: "c1", points: 20 },
      ],
      awards: [{ season: "2030-31", kind: "best_manager", competition: "la_liga", squadId: "c2" }],
      clubs: [{ squadId: "c1", from: "2027-02-05", to: "2029-06-01" }, { squadId: "c2", from: "2029-06-01", to: "2032-05-20" }],
    });
    expect(p.job).toEqual({ kind: "free", club: null, year: "2032" });
    expect(p.career).toEqual({ first: false, seasons: 7, clubs: 2 });
    expect(p.titles).toEqual({ count: 2, best: { kind: "continental", competition: "uel" } });
    expect(p.highlight).toEqual({ kind: "league", competition: "la_liga", season: "2030-31" });
  });
});
