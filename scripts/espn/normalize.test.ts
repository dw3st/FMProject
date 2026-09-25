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
