import { describe, expect, test } from "bun:test";
import { STAT_KEYS, coachName, computeTierMultipliers, deriveClubEconomy, derivePlayer, type ClubFits, type EconSample, type PlayerCoeffs, type TierMultipliers } from "@/../scripts/openfootball/derive";
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
    expect(p.nationality).toBe("Uruguay");
  });
  test("pé B vira right; código de país inválido não gera nacionalidade", () => {
    const p = derivePlayer({ ...seedP, foot: "B", country: "zz-bad" }, "s", coeffs);
    expect(p.preferredFoot).toBe("right");
    expect(p.nationality).toBeUndefined();
  });
  test("sem ajuste utilizável (papel nem agrupado) lança erro nomeado", () => {
    const broken: PlayerCoeffs = {
      byRole: { ...coeffs.byRole, Forward: { ...coeffs.byRole.Forward, finishing: line(Number.NaN, 0.1) } },
      pooled: { ...coeffs.pooled, finishing: line(Number.NaN, 0.1) },
    };
    expect(() => derivePlayer(seedP, "s", broken)).toThrow("derivePlayer: missing/non-finite fit for Forward.finishing");
    const missing: PlayerCoeffs = { byRole: { ...coeffs.byRole, Forward: {} }, pooled: {} };
    expect(() => derivePlayer(seedP, "s", missing)).toThrow("derivePlayer: missing/non-finite fit for Forward.passing");
  });
  test("ajuste de papel com NaN cai no agrupado; overall não finito faz clamp lançar", () => {
    const c: PlayerCoeffs = { ...coeffs, byRole: { ...coeffs.byRole, Forward: { ...coeffs.byRole.Forward, passing: line(Number.NaN, 0.09) } } };
    expect(derivePlayer(seedP, "s", c).stats.passing).toBe(Math.round(-3 + 0.1 * 70));
    expect(() => derivePlayer({ ...seedP, overall: Number.NaN }, "s", coeffs)).toThrow("clamp: non-finite");
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

const fits: ClubFits = {
  budget: line(10, 0.001), broadcasting: line(9, 0.001), commercial: line(9, 0.001),
  followers: line(8, 0.001), capacity: line(20, 0.01), repMax: 3000,
};
const flat = (m2: number, m3: number) => ({ 1: 1, 2: m2, 3: m3 });
const mult: TierMultipliers = {
  budget: flat(0.5, 0.1), broadcasting: flat(0.4, 0.1), commercial: flat(0.4, 0.1), followers: flat(0.6, 0.2), capacity: flat(0.7, 0.3),
};

describe("deriveClubEconomy / coachName", () => {
  test("exp da reta, total = broadcast + commercial, capacidade limitada", () => {
    const e = deriveClubEconomy(2000, 1, fits, mult);
    expect(e.finances.budget).toBe(Math.round(Math.exp(12)));
    expect(e.finances.total).toBe(e.finances.broadcasting + e.finances.commercial);
    expect(e.capacity).toBe(90000);
  });
  test("reputação acima de repMax é limitada (sem extrapolar)", () => {
    expect(deriveClubEconomy(9000, 1, fits, mult)).toEqual(deriveClubEconomy(3000, 1, fits, mult));
    expect(deriveClubEconomy(2000, 1, fits, mult)).not.toEqual(deriveClubEconomy(3000, 1, fits, mult));
  });
  test("multiplicador por nível; nível ausente usa o mais profundo; nível 1 sempre 1", () => {
    const t2 = deriveClubEconomy(2000, 2, fits, mult);
    expect(t2.finances.budget).toBe(Math.round(Math.exp(12) * 0.5));
    expect(t2.finances.broadcasting).toBe(Math.round(Math.exp(11) * 0.4));
    expect(t2.finances.followers).toBe(Math.round(Math.exp(10) * 0.6));
    expect(t2.finances.total).toBe(t2.finances.broadcasting + t2.finances.commercial);
    const t5 = deriveClubEconomy(2000, 5, fits, mult);
    expect(t5).toEqual(deriveClubEconomy(2000, 3, fits, mult));
    expect(t5.finances.budget).toBe(Math.round(Math.exp(12) * 0.1));
    const lowCap = { ...fits, capacity: line(10, 0) }; // e^10 ≈ 22026
    expect(deriveClubEconomy(2000, 3, lowCap, mult).capacity).toBe(Math.round(Math.exp(10) * 0.3));
    expect(deriveClubEconomy(2000, 1, fits, { ...mult, budget: { 1: 7 } }).finances.budget).toBe(Math.round(Math.exp(12)));
  });
  test("coeficiente não finito lança erro", () => {
    expect(() => deriveClubEconomy(2000, 1, { ...fits, commercial: line(Number.NaN, 0.001) }, mult)).toThrow("non-finite fit for commercial");
    expect(() => deriveClubEconomy(2000, 1, { ...fits, budget: line(10, Number.POSITIVE_INFINITY) }, mult)).toThrow("non-finite fit for budget");
    expect(() => deriveClubEconomy(2000, 1, { ...fits, repMax: Number.NaN }, mult)).toThrow("non-finite repMax");
  });
  test("coachName determinístico", () => {
    const pool = { first: ["Ana", "Rui"], last: ["Lopes", "Dias"] };
    expect(coachName("uy-x", pool)).toBe(coachName("uy-x", pool));
    expect(coachName("uy-x", pool).split(" ").length).toBe(2);
  });
});

describe("computeTierMultipliers", () => {
  test("razão de medianas por campo contra a previsão do ajuste", () => {
    // Fit constante: previsão = e^a em qualquer reputação.
    const c = (a: number) => line(a, 0);
    const f: ClubFits = { budget: c(Math.log(100)), broadcasting: c(Math.log(50)), commercial: c(Math.log(20)), followers: c(Math.log(1000)), capacity: c(Math.log(40000)), repMax: 3000 };
    const s = (budget: number, broadcasting: number, commercial: number, followers: number, capacity: number): EconSample =>
      ({ budget, broadcasting, commercial, followers, capacity });
    const tlSerieB = [s(10, 10, 4, 500, 20000), s(30, 20, 6, 700, 30000), s(20, 15, 5, 600, 10000)];
    const tlSerieC = [s(2, 3, 1, 100, 5000), s(4, 5, 1, 300, 8000)];
    const m = computeTierMultipliers({ fits: f, seedSerieBReputations: [1000, 1100, 1200], tlSerieB, tlSerieC });
    expect(m.budget[1]).toBe(1);
    expect(m.budget[2]).toBeCloseTo(20 / 100, 9);
    expect(m.budget[3]).toBeCloseTo((20 / 100) * (3 / 20), 9);
    expect(m.broadcasting[2]).toBeCloseTo(15 / 50, 9);
    expect(m.commercial[3]).toBeCloseTo((5 / 20) * (1 / 5), 9);
    expect(m.followers[2]).toBeCloseTo(600 / 1000, 9);
    expect(m.capacity[2]).toBeCloseTo(20000 / 40000, 9);
    expect(m.capacity[3]).toBeCloseTo(0.5 * (6500 / 20000), 9);
  });
  test("previsão usa a reputação limitada e entradas vazias lançam", () => {
    const f: ClubFits = { budget: line(0, 0.001), broadcasting: line(0, 0.001), commercial: line(0, 0.001), followers: line(0, 0.001), capacity: line(0, 0.001), repMax: 1000 };
    const one = { budget: 1, broadcasting: 1, commercial: 1, followers: 1, capacity: 1 };
    const m = computeTierMultipliers({ fits: f, seedSerieBReputations: [5000], tlSerieB: [one], tlSerieC: [one] });
    expect(m.budget[2]).toBeCloseTo(1 / Math.exp(1), 9);
    expect(() => computeTierMultipliers({ fits: f, seedSerieBReputations: [], tlSerieB: [one], tlSerieC: [one] })).toThrow("no values");
  });
});
