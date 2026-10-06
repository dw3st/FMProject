import { describe, expect, test } from "bun:test";
import {
  attributesHidden, decayed, gainKnowledge, implicitKnowledge, knowledgeOf, pruneKnowledge, ratingGain,
  scoutMultipliersOf, uncertaintyOf,
} from "@/Domain/scouting/knowledge";

describe("implicit knowledge", () => {
  test("own league 35, same country 20, elsewhere 0", () => {
    expect(implicitKnowledge({ playerLeague: "pl", ownLeague: "pl", playerCountry: "England", ownCountry: "England" })).toBe(35);
    expect(implicitKnowledge({ playerLeague: "ch", ownLeague: "pl", playerCountry: "England", ownCountry: "England" })).toBe(20);
    expect(implicitKnowledge({ playerLeague: "la", ownLeague: "pl", playerCountry: "Spain", ownCountry: "England" })).toBe(0);
  });
  test("fame adds 25, capped at 60", () => {
    expect(implicitKnowledge({ playerLeague: "la", ownLeague: "pl", famous: true })).toBe(25);
    expect(implicitKnowledge({ playerLeague: "pl", ownLeague: "pl", famous: true })).toBe(60);
  });
});

describe("decay", () => {
  test("nothing in the first 90 days, then 5 per 30 days, floor 0", () => {
    expect(decayed({ k: 80, seen: "2027-01-01" }, "2027-03-31")).toBe(80);
    expect(decayed({ k: 80, seen: "2027-01-01" }, "2027-05-01")).toBeCloseTo(80 - 5 * (30 / 30), 0);
    expect(decayed({ k: 10, seen: "2020-01-01" }, "2027-01-01")).toBe(0);
  });
  test("effective knowledge never below the implicit; own players 100", () => {
    expect(knowledgeOf({ implicit: 35, stored: { k: 10, seen: "2027-01-01" }, date: "2027-01-02" })).toBe(35);
    expect(knowledgeOf({ implicit: 35, stored: { k: 90, seen: "2027-01-01" }, date: "2027-01-02" })).toBe(90);
    expect(knowledgeOf({ own: true, implicit: 0, date: "2027-01-02" })).toBe(100);
  });
});

describe("uncertainty", () => {
  test("monotonic in k, 0 at 100, spec points", () => {
    expect(uncertaintyOf(0)).toBeCloseTo(2.0);
    expect(uncertaintyOf(100)).toBe(0);
    let prev = Infinity;
    for (let k = 0; k <= 100; k += 5) {
      const n = uncertaintyOf(k);
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
    expect(uncertaintyOf(80)).toBeLessThan(0.5);
    expect(uncertaintyOf(20)).toBeCloseTo(1.53, 1);
  });
  test("chief multiplier", () => {
    expect(scoutMultipliersOf(5)).toEqual({ uncertainty: 1, gain: 1 });
    expect(scoutMultipliersOf(1).uncertainty).toBeCloseTo(1.3);
    expect(scoutMultipliersOf(10).gain).toBeCloseTo(1.4);
    expect(uncertaintyOf(0, scoutMultipliersOf(10).uncertainty)).toBeCloseTo(1.5);
    expect(ratingGain(1)).toBeCloseTo(0.6);
    expect(ratingGain(10)).toBeCloseTo(1.4);
  });
  test("hidden below 20", () => {
    expect(attributesHidden(19)).toBe(true);
    expect(attributesHidden(20)).toBe(false);
  });
});

describe("gain and prune", () => {
  test("gain caps at 100", () => {
    expect(gainKnowledge(90, 30, "2027-01-01")).toEqual({ k: 100, seen: "2027-01-01" });
  });
  test("prune drops entries decayed to the implicit and keeps the newest", () => {
    const k = {
      a: { k: 50, seen: "2027-01-01" },
      b: { k: 30, seen: "2027-01-02" },
      c: { k: 70, seen: "2027-01-03" },
      d: { k: 5, seen: "2020-01-01" },
    };
    const pruned = pruneKnowledge(k, "2027-01-04", (id) => (id === "b" ? 35 : 0), 2);
    expect(Object.keys(pruned).sort()).toEqual(["a", "c"]);
    expect(Object.keys(pruneKnowledge(k, "2027-01-04", () => 0, 1))).toEqual(["c"]);
  });
});
