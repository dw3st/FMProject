import { describe, expect, test } from "bun:test";
import { fillMissingEnergy } from "@/GameInterface/buildPlayedMatchRecording";
import { emptySeasonLog } from "@/types/playerTypes";

describe("fillMissingEnergy", () => {
  test("leaves a valid, finite energy entry untouched", () => {
    const playerStats = { p1: {} };
    const playerEnergy: Record<string, number> = { p1: 42 };
    fillMissingEnergy(playerStats, playerEnergy, new Map([["p1", 80]]));
    expect(playerEnergy.p1).toBe(42);
  });

  test("falls back to the player's start-of-match fitness when energy is missing", () => {
    const playerStats = { p1: {} };
    const playerEnergy: Record<string, number> = {};
    fillMissingEnergy(playerStats, playerEnergy, new Map([["p1", 73]]));
    // "No change" — postMatchFitness(startFitness) is a no-op relative to the pre-match value.
    expect(playerEnergy.p1).toBe(73);
  });

  test("falls back to the default fresh-player fitness when the player has no known start fitness", () => {
    const playerStats = { p1: {} };
    const playerEnergy: Record<string, number> = {};
    fillMissingEnergy(playerStats, playerEnergy, new Map());
    expect(playerEnergy.p1).toBe(emptySeasonLog().fitness);
  });

  test("replaces NaN and non-finite values, not just missing keys", () => {
    const playerStats = { p1: {}, p2: {} };
    const playerEnergy: Record<string, number> = { p1: NaN, p2: Infinity };
    fillMissingEnergy(playerStats, playerEnergy, new Map([["p1", 60], ["p2", 65]]));
    expect(playerEnergy.p1).toBe(60);
    expect(playerEnergy.p2).toBe(65);
  });

  test("never touches an energy entry for a player not in playerStats", () => {
    const playerStats = { p1: {} };
    const playerEnergy: Record<string, number> = {};
    fillMissingEnergy(playerStats, playerEnergy, new Map([["p2", 90]]));
    expect(playerEnergy.p2).toBeUndefined();
    expect(playerEnergy.p1).toBe(emptySeasonLog().fitness);
  });
});
