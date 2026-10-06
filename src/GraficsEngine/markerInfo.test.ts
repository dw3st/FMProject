import { describe, expect, test } from "bun:test";
import { bookedPlayerIds, fatigueColor, fatigueFill } from "@/GraficsEngine/markerInfo";
import { FATIGUE_BAR } from "@/GraficsEngine/pitchStyle";
import type { CardRecord } from "@/GameEngine/types";

const card = (playerId: number, c: "yellow" | "red"): CardRecord => ({
  team: "A", playerId, playerName: "x", playerRosterId: "r", card: c, secondYellow: false, matchMinute: 10, energy: 80,
});

describe("fatigueColor", () => {
  test("bands and limits", () => {
    expect(fatigueColor(100)).toBe(FATIGUE_BAR.OK);
    expect(fatigueColor(60)).toBe(FATIGUE_BAR.OK);
    expect(fatigueColor(59.9)).toBe(FATIGUE_BAR.MID);
    expect(fatigueColor(40)).toBe(FATIGUE_BAR.MID);
    expect(fatigueColor(39.9)).toBe(FATIGUE_BAR.LOW);
    expect(fatigueColor(0)).toBe(FATIGUE_BAR.LOW);
  });
});

describe("fatigueFill", () => {
  test("energy / 100, limited to 0..1", () => {
    expect(fatigueFill(75)).toBeCloseTo(0.75);
    expect(fatigueFill(130)).toBe(1);
    expect(fatigueFill(-5)).toBe(0);
  });
});

describe("bookedPlayerIds", () => {
  test("players with a yellow and no red", () => {
    const ids = bookedPlayerIds([card(1, "yellow"), card(2, "yellow"), card(2, "red"), card(3, "red")]);
    expect([...ids]).toEqual([1]);
  });
  test("empty list", () => {
    expect(bookedPlayerIds([]).size).toBe(0);
  });
});
