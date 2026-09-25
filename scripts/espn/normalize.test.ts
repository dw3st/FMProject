import { describe, expect, test } from "bun:test";
import { clubKey, looseClubKey, playerKey } from "@/../scripts/espn/normalize";

describe("clubKey", () => {
  test("drops club-type tokens and accents", () => {
    expect(clubKey("AFC Bournemouth")).toBe("bournemouth");
    expect(clubKey("São Paulo FC")).toBe("sao paulo");
    expect(clubKey("Brighton & Hove Albion")).toBe("brighton hove albion");
  });
  test("keeps City / United in the strict key", () => {
    expect(clubKey("Manchester City")).toBe("manchester city");
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
});
