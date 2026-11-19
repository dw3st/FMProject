import { describe, expect, test } from "bun:test";
import { MAX_FOLLOWED_LEAGUES, resolveSimMode, sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";

describe("resolveSimMode", () => {
  const humans = new Set(["mine", "friend"]);
  test("jogo de um clube com assento é full (mandante ou visitante)", () => {
    expect(resolveSimMode("mine", "x", humans)).toBe("full");
    expect(resolveSimMode("x", "friend", humans)).toBe("full");
    expect(resolveSimMode("mine", "friend", humans)).toBe("full");
  });

  test("qualquer outro jogo é fast, mesmo na liga do jogador ou numa liga seguida", () => {
    expect(resolveSimMode("x", "y", humans)).toBe("fast");
    expect(resolveSimMode("x", "y", new Set())).toBe("fast");
  });
});

describe("sanitizeFollowedLeagues", () => {
  const valid = new Set(["a", "b", "c", "d", "own"]);
  test("remove inválidas, a própria liga e duplicatas; limita a 3", () => {
    expect(MAX_FOLLOWED_LEAGUES).toBe(3);
    expect(sanitizeFollowedLeagues(["a", "x", "own", "a", "b", "c", "d"], valid, "own")).toEqual(["a", "b", "c"]);
  });
  test("entrada que não é array vira []", () => {
    expect(sanitizeFollowedLeagues("a", valid, "own")).toEqual([]);
    expect(sanitizeFollowedLeagues([1, null, "b"], valid, "own")).toEqual(["b"]);
  });
});
