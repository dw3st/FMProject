import { describe, expect, test } from "bun:test";
import { MAX_FOLLOWED_LEAGUES, resolveSimMode, resolveSimModeForSeats, sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";

describe("resolveSimMode", () => {
  test("liga do jogador é full", () => {
    expect(resolveSimMode("premier_league", { leagueSlug: "premier_league" })).toBe("full");
  });

  test("outras ligas são fast", () => {
    expect(resolveSimMode("la_liga", { leagueSlug: "premier_league" })).toBe("fast");
  });

  test("ligas seguidas são full", () => {
    const meta = { leagueSlug: "premier_league", followedLeagues: ["la_liga"] };
    expect(resolveSimMode("la_liga", meta)).toBe("full");
  });

  test("só as primeiras MAX_FOLLOWED_LEAGUES seguidas contam", () => {
    const meta = { leagueSlug: "x", followedLeagues: ["a", "b", "c", "d"] };
    expect(MAX_FOLLOWED_LEAGUES).toBe(3);
    expect(resolveSimMode("c", meta)).toBe("full");
    expect(resolveSimMode("d", meta)).toBe("fast");
  });
});

describe("sanitizeFollowedLeagues", () => {
  const valid = new Set(["a", "b", "c", "d", "own"]);
  test("remove inválidas, a própria liga e duplicatas; limita a 3", () => {
    expect(sanitizeFollowedLeagues(["a", "x", "own", "a", "b", "c", "d"], valid, "own")).toEqual(["a", "b", "c"]);
  });
  test("entrada que não é array vira []", () => {
    expect(sanitizeFollowedLeagues("a", valid, "own")).toEqual([]);
    expect(sanitizeFollowedLeagues([1, null, "b"], valid, "own")).toEqual(["b"]);
  });
});

describe("resolveSimModeForSeats", () => {
  test("seats: full when any seat's league or followed league", () => {
    const seats = [{ leagueSlug: "pl", followedLeagues: ["ll"] }, { leagueSlug: "sa" }];
    expect(resolveSimModeForSeats("pl", seats)).toBe("full");
    expect(resolveSimModeForSeats("ll", seats)).toBe("full");
    expect(resolveSimModeForSeats("sa", seats)).toBe("full");
    expect(resolveSimModeForSeats("bl", seats)).toBe("fast");
    expect(resolveSimModeForSeats("pl", [])).toBe("fast");
  });
});
