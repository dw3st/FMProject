import { describe, expect, test } from "bun:test";
import { MAX_FOLLOWED_LEAGUES, resolveSimMode } from "@/Domain/advanceDay/simMode";

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
