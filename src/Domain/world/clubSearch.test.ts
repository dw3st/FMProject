import { describe, expect, test } from "bun:test";
import { CLUB_SEARCH_LIMIT, searchClubs, type ClubEntry } from "@/Domain/world/clubSearch";

const COUNTRY: Record<string, string> = { a: "Brazil", b: "Brazil", us: "United States", co: "Colombia", en: "England" };
const countryOf = (l: string) => COUNTRY[l] ?? "";
const clubs: ClubEntry[] = [
  { id: "1", name: "Internacional", league: "a" },
  { id: "2", name: "Inter de Limeira", league: "b" },
  { id: "3", name: "Inter Miami CF", league: "us" },
  { id: "4", name: "Internacional de Bogotá", league: "co" },
  { id: "5", name: "Grêmio", league: "a" },
  { id: "6", name: "Club Inter", league: "en" },
  { id: "7", name: "Winterthur", league: "en" },
];
const names = (r: { clubs: ClubEntry[] }[]) => r.flatMap((g) => g.clubs.map((c) => c.name));

describe("searchClubs", () => {
  test("an empty text lists the clubs of the open country, by name", () => {
    const r = searchClubs(clubs, "  ", "Brazil", countryOf);
    expect(r.map((g) => g.country)).toEqual(["Brazil"]);
    expect(names(r)).toEqual(["Grêmio", "Inter de Limeira", "Internacional"]);
  });

  test("ignores accents and case", () => {
    expect(names(searchClubs(clubs, "GREMIO", "England", countryOf))).toEqual(["Grêmio"]);
    expect(names(searchClubs(clubs, "bogota", "England", countryOf))).toEqual(["Internacional de Bogotá"]);
  });

  test("the name's start beats a word's start, which beats the middle of a word", () => {
    const r = searchClubs(clubs, "inter", "England", countryOf);
    const all = r.flatMap((g) => g.clubs);
    expect(all.filter((c) => c.league === "en").map((c) => c.name)).toEqual(["Club Inter", "Winterthur"]);
    expect(searchClubs(clubs, "inter", "Nowhere", countryOf)[0]!.country).toBe("Brazil");
  });

  test("the open country comes first, the others by best match", () => {
    const r = searchClubs(clubs, "inter", "Colombia", countryOf);
    expect(r.map((g) => g.country)).toEqual(["Colombia", "Brazil", "United States", "England"]);
  });

  test("the open country gets no empty group", () => {
    expect(searchClubs(clubs, "gremio", "Colombia", countryOf).map((g) => g.country)).toEqual(["Brazil"]);
  });

  test("no match gives no group", () => {
    expect(searchClubs(clubs, "zzz", "Brazil", countryOf)).toEqual([]);
  });

  test("a text stops at the limit", () => {
    const many = Array.from({ length: CLUB_SEARCH_LIMIT + 5 }, (_, i) => ({ id: String(i), name: `Clube ${i}`, league: "a" }));
    expect(names(searchClubs(many, "clube", "Brazil", countryOf))).toHaveLength(CLUB_SEARCH_LIMIT);
  });
});
