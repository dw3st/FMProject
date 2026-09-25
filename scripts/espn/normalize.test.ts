import { describe, expect, test } from "bun:test";
import { clubKey, looseClubKey, normalizeNationality, playerKey } from "@/../scripts/espn/normalize";

describe("clubKey", () => {
  test("drops club-type tokens and accents", () => {
    expect(clubKey("AFC Bournemouth")).toBe("bournemouth");
    expect(clubKey("São Paulo FC")).toBe("sao paulo");
    expect(clubKey("Brighton & Hove Albion")).toBe("brighton hove albion");
  });
  test("keeps City / United in the strict key", () => {
    expect(clubKey("Manchester City")).toBe("manchester city");
  });

  test("decodes HTML entities before normalizing", () => {
    expect(clubKey("Newcastle &amp; District")).toBe(clubKey("Newcastle & District"));
  });
});

describe("looseClubKey", () => {
  test("also drops common suffixes", () => {
    expect(looseClubKey("Newcastle United")).toBe("newcastle");
    expect(looseClubKey("Tottenham Hotspur")).toBe("tottenham");
    expect(looseClubKey("Brighton & Hove Albion")).toBe("brighton hove");
  });
});

describe("playerKey", () => {
  test("transliterates and lowercases", () => {
    expect(playerKey("Martin Ødegaard")).toBe("martin odegaard");
    expect(playerKey("  Vinícius   Júnior ")).toBe("vinicius junior");
  });

  test("decodes HTML entities before normalizing", () => {
    expect(playerKey("M. O&apos;Riley")).toBe(playerKey("M. O'Riley"));
    expect(playerKey("M. O&apos;Riley")).toBe("m o riley");
    expect(playerKey("M&#39;Bappe")).toBe(playerKey("M'Bappe"));
    expect(playerKey("Marks &amp; Spencer")).toBe(playerKey("Marks & Spencer"));
    expect(playerKey('Quoted &quot;Nickname&quot;')).toBe(playerKey('Quoted "Nickname"'));
  });
});

describe("normalizeNationality", () => {
  const world = new Set(["USA", "Republic of Ireland", "South Korea", "Czechia", "Türkiye", "Congo DR", "Congo", "Italy", "France", "England"]);

  test("maps known aliases onto the world's convention", () => {
    expect(normalizeNationality("United States", world)).toBe("USA");
    expect(normalizeNationality("Ireland", world)).toBe("Republic of Ireland");
    expect(normalizeNationality("Korea, South", world)).toBe("South Korea");
    expect(normalizeNationality("Czech Republic", world)).toBe("Czechia");
    expect(normalizeNationality("Turkey", world)).toBe("Türkiye");
    expect(normalizeNationality("DR Congo", world)).toBe("Congo DR");
  });

  test("is case-insensitive on the alias key", () => {
    expect(normalizeNationality("united states", world)).toBe("USA");
    expect(normalizeNationality("IRELAND", world)).toBe("Republic of Ireland");
  });

  test("passes through a value that already matches the world's convention", () => {
    expect(normalizeNationality("England", world)).toBe("England");
  });

  test("rejects adjective forms instead of guessing", () => {
    expect(normalizeNationality("Italian", world)).toBeNull();
    expect(normalizeNationality("French", world)).toBeNull();
    expect(normalizeNationality("Croatian", world)).toBeNull();
  });

  test("rejects unknown values and null/empty input", () => {
    expect(normalizeNationality("Narnia", world)).toBeNull();
    expect(normalizeNationality(null, world)).toBeNull();
    expect(normalizeNationality("  ", world)).toBeNull();
  });
});
