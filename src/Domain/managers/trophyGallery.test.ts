import { describe, expect, test } from "bun:test";
import { countriesWithTitles, trophyGallery } from "@/Domain/managers/trophyGallery";
import type { ManagerRecord } from "@/types/managerTypes";

const leagues = [
  { slug: "premier_league", country: "England" },
  { slug: "of_championship", country: "England" },
  { slug: "brazil_serie_a", country: "Brazil" },
];
const title = (kind: ManagerRecord["titles"][number]["kind"], competition: string) =>
  ({ season: "2027", kind, competition, squadId: "x", points: 1 });

describe("trophyGallery", () => {
  test("lists the divisions, the cup and the continental cups, counting titles", () => {
    const titles = [title("league", "of_championship"), title("league", "of_championship"), title("cup", "cup_england"),
      title("promotion", "of_championship"), title("continental", "ucl")];
    const g = trophyGallery("England", "Europe", leagues, titles);
    expect(g.map((t) => t.slug)).toEqual(["premier_league", "of_championship", "cup_england", "ucl", "uel", "icc"]);
    expect(g.map((t) => t.count)).toEqual([0, 2, 1, 1, 0, 0]);
  });

  test("a country outside Europe and South America has no continental cups", () => {
    expect(trophyGallery("Brazil", "Asia", leagues, []).map((t) => t.slug)).toEqual(["brazil_serie_a", "cup_brazil"]);
  });

  test("an unknown country gives nothing", () => {
    expect(trophyGallery("Nowhere", "Europe", leagues, [])).toEqual([]);
  });

  test("countries with titles, most first", () => {
    const titles = [title("league", "brazil_serie_a"), title("cup", "cup_england"), title("league", "premier_league"),
      title("continental", "ucl")];
    expect(countriesWithTitles(leagues, titles)).toEqual(["England", "Brazil"]);
  });
});
