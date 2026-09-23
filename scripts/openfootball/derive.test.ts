import { describe, expect, test } from "bun:test";
import { STAT_KEYS, coachName, deriveClubEconomy, derivePlayer, type PlayerCoeffs } from "@/../scripts/openfootball/derive";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

const line = (a: number, b: number, sd = 0, n = 100) => ({ a, b, sd, n });
const coeffs: PlayerCoeffs = {
  byRole: {
    GK: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-2, 0.08)])),
    Defender: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-3, 0.09)])),
    Midfielder: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-3, 0.09)])),
    Forward: Object.fromEntries(STAT_KEYS.map((k) => [k, k === "finishing" ? line(-4, 0.12, 0, 5) : line(-3, 0.09)])),
  },
  pooled: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-3, 0.1)])),
};

const seedP: SeedPlayer = { id: "uy-x-1", name: "Juan Pérez", position: "ATT", overall: 70, potential: 72, age: 24, country: "uy", foot: "L", value: 0, clubId: "uy-x" };

describe("derivePlayer", () => {
  test("formato do elenco do TouchLines", () => {
    const p = derivePlayer(seedP, "of_uy_x", coeffs);
    expect(p.id).toBe("of_uy_x_1");
    expect(p.squadId).toBe("of_uy_x");
    expect(p.positions).toEqual(["Forward"]);
    expect(p.preferredFoot).toBe("left");
    expect(Object.keys(p.stats).sort()).toEqual([...STAT_KEYS].sort());
    for (const v of Object.values(p.stats)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
    expect(p.profile.archetype.length).toBeGreaterThan(0);
  });
  test("sem ruído (sd 0) segue a reta; n < 30 usa o ajuste agrupado", () => {
    const p = derivePlayer(seedP, "of_uy_x", coeffs);
    expect(p.stats.passing).toBe(Math.round(-3 + 0.09 * 70));   // 3
    expect(p.stats.finishing).toBe(Math.round(-3 + 0.1 * 70));  // pooled → 4
  });
  test("determinístico", () => {
    expect(derivePlayer(seedP, "s", coeffs)).toEqual(derivePlayer(seedP, "s", coeffs));
  });
});

describe("deriveClubEconomy / coachName", () => {
  test("exp da reta, total = broadcast + commercial, capacidade limitada", () => {
    const fits = {
      budget: line(10, 0.001), broadcasting: line(9, 0.001), commercial: line(9, 0.001),
      followers: line(8, 0.001), capacity: line(20, 0.01),
    };
    const e = deriveClubEconomy(2000, fits);
    expect(e.finances.budget).toBe(Math.round(Math.exp(12)));
    expect(e.finances.total).toBe(e.finances.broadcasting + e.finances.commercial);
    expect(e.capacity).toBe(90000);
  });
  test("coachName determinístico", () => {
    const pool = { first: ["Ana", "Rui"], last: ["Lopes", "Dias"] };
    expect(coachName("uy-x", pool)).toBe(coachName("uy-x", pool));
    expect(coachName("uy-x", pool).split(" ").length).toBe(2);
  });
});
