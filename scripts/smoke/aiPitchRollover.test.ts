import { describe, expect, test } from "bun:test";
import { firstHomePitch, pitchRolloverPairs } from "@/../scripts/smoke/aiPitchRollover";
import type { Squad } from "@/types/playerTypes";

const aiSquad = (id: string, tier: Squad["financialTier"]) =>
  ({ id, players: [], financialTier: tier, finances: { broadcasting: 0, commercial: 0, budget: 0, followers: 0 } }) as unknown as Squad;

describe("pitchRolloverPairs", () => {
  test("only one season observed per club → no pair (the smoke's empty check)", () => {
    const obs = new Map([["c1", new Map([[2026, { first: 78, last: 40 }]])]]);
    const r = pitchRolloverPairs(obs);
    expect(r.pairs).toBe(0);
    expect(r.ok).toBe(false);
  });

  test("a better pitch at the start of the next season passes; a worse one is flagged", () => {
    const obs = new Map([
      ["c1", new Map([[2026, { first: 78, last: 40 }], [2027, { first: 79, last: 79 }]])],
      ["c2", new Map([[2026, { first: 78, last: 60 }], [2027, { first: 50, last: 50 }]])],
    ]);
    const r = pitchRolloverPairs(obs);
    expect(r.pairs).toBe(2);
    expect(r.bad).toEqual(["c2 2026: 60.0 → 50.0"]);
    expect(r.ok).toBe(false);
  });
});

describe("firstHomePitch", () => {
  const window = { start: "2027-08-15", end: "2028-05-20" };
  const fixtures = [
    { id: "a", date: "2027-09-01", home: "c1", away: "x" },
    { id: "b", date: "2027-08-22", home: "x", away: "c1" },
    { id: "c", date: "2027-08-29", home: "c1", away: "y" },
  ];

  test("the first home fixture of the new season, on the AI formula of its tier", () => {
    const r = firstHomePitch(aiSquad("c1", "MEDIUM"), fixtures as never, window)!;
    expect(r.date).toBe("2027-08-29");
    expect(r.condition).toBeGreaterThan(77);
    expect(r.condition).toBeLessThanOrEqual(80);
  });

  test("no home fixture → null", () => {
    expect(firstHomePitch(aiSquad("z", "LOW"), fixtures as never, window)).toBeNull();
  });
});
