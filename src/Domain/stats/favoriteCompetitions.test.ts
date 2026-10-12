import { describe, expect, test } from "bun:test";
import {
  MAX_FAVORITE_COMPETITIONS, parseFavoriteCompetitions, toggleFavoriteCompetition,
} from "@/Domain/stats/favoriteCompetitions";

describe("toggleFavoriteCompetition", () => {
  test("adds a new competition at the end", () => {
    expect(toggleFavoriteCompetition(["all"], "la_liga")).toEqual(["all", "la_liga"]);
  });
  test("removes a competition already there", () => {
    expect(toggleFavoriteCompetition(["all", "la_liga"], "all")).toEqual(["la_liga"]);
  });
  test("never goes past the limit: the oldest one leaves", () => {
    const full = Array.from({ length: MAX_FAVORITE_COMPETITIONS }, (_, i) => `l${i}`);
    const next = toggleFavoriteCompetition(full, "new");
    expect(next).toHaveLength(MAX_FAVORITE_COMPETITIONS);
    expect(next[0]).toBe("l1");
    expect(next.at(-1)).toBe("new");
  });
});

describe("parseFavoriteCompetitions", () => {
  test("keeps known strings, in order, without duplicates", () => {
    expect(parseFavoriteCompetitions('["a","b","a","x",3]', new Set(["a", "b"]))).toEqual(["a", "b"]);
  });
  test("bad or missing data is an empty list", () => {
    expect(parseFavoriteCompetitions(null)).toEqual([]);
    expect(parseFavoriteCompetitions("{oops")).toEqual([]);
    expect(parseFavoriteCompetitions('{"a":1}')).toEqual([]);
  });
  test("without a known set it only checks the shape and the limit", () => {
    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => `c${i}`));
    expect(parseFavoriteCompetitions(many)).toHaveLength(MAX_FAVORITE_COMPETITIONS);
  });
});
