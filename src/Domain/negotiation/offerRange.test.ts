import { describe, expect, test } from "bun:test";
import { starterLineLevel, transferOfferRange } from "@/Domain/negotiation/offerRange";
import type { RosterPlayer } from "@/types/playerTypes";

describe("transferOfferRange", () => {
  test("opens at his value, not above it: a cheap player is not a €9M offer", () => {
    const r = transferOfferRange(150_000_000, 500_000);
    expect(r.start).toBe(500_000);
    expect(r.min).toBe(100_000);
    expect(r.max).toBe(10_000_000);
  });
  test("reaches three times the value of an expensive player", () => {
    expect(transferOfferRange(500_000_000, 100_000_000).max).toBe(300_000_000);
  });
  test("never past what the club has", () => {
    const r = transferOfferRange(20_000_000, 60_000_000);
    expect(r.max).toBe(20_000_000);
    expect(r.start).toBe(20_000_000);
  });
  test("no money, no offer", () => {
    expect(transferOfferRange(-1_200_000, 60_000_000).canOffer).toBe(false);
    expect(transferOfferRange(0, 60_000_000).canOffer).toBe(false);
  });
});

describe("starterLineLevel", () => {
  const player = (position: string, overall: number) => ({ positions: [position], overallAvg: overall, stats: {} }) as unknown as RosterPlayer;
  test("averages the starters of the line, not the reserves", () => {
    const squad = [player("Midfielder", 7), player("Midfielder", 6), player("Midfielder", 5), player("Midfielder", 1), player("Forward", 9)];
    expect(starterLineLevel(squad, "Midfielder")).toBeCloseTo(6);
  });
  test("an empty line has no level", () => {
    expect(starterLineLevel([], "GK")).toBeNull();
  });
});
