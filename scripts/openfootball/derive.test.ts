import { describe, expect, test } from "bun:test";
import { STAT_KEYS, coachName, computeTierMultipliers, deriveClubEconomy, derivePlayer, playerProfile, type ClubFits, type EconSample, type PlayerCoeffs, type TierMultipliers } from "@/../scripts/openfootball/derive";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

const line = (a: number, b: number, sd = 0, n = 100) => ({ a, b, sd, n });
const plane = (a: number, b: number, c = 0, sd = 0, n = 100) => ({ a, b, c, sd, n });
const coeffs: PlayerCoeffs = {
  byRole: {
    GK: Object.fromEntries(STAT_KEYS.map((k) => [k, plane(-2, 0.08)])),
    Defender: Object.fromEntries(STAT_KEYS.map((k) => [k, plane(-3, 0.09)])),
    Midfielder: Object.fromEntries(STAT_KEYS.map((k) => [k, plane(-3, 0.09)])),
    Forward: Object.fromEntries(STAT_KEYS.map((k) => [k, k === "finishing" ? plane(-4, 0.12, 0, 0, 5) : plane(-3, 0.09)])),
  },
  pooled: Object.fromEntries(STAT_KEYS.map((k) => [k, plane(-3, 0.1)])),
  repMin: 5.8,
  repMax: 9.5,
};
const REP = 7;

const seedP: SeedPlayer = { id: "uy-x-1", name: "Juan Pérez", position: "ATT", overall: 70, potential: 72, age: 24, country: "uy", foot: "L", value: 0, clubId: "uy-x" };

describe("derivePlayer", () => {
  test("formato do elenco do FMProject", () => {
    const p = derivePlayer(seedP, "of_uy_x", coeffs, REP);
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
  test("código gb vira England, como no FMProject", () => {
    expect(derivePlayer({ ...seedP, country: "gb" }, "s", coeffs, REP).nationality).toBe("England");
  });
  test("pé B vira right; código de país inválido não gera nacionalidade", () => {
    const p = derivePlayer({ ...seedP, foot: "B", country: "zz-bad" }, "s", coeffs, REP);
    expect(p.preferredFoot).toBe("right");
    expect(p.nationality).toBeUndefined();
  });
  test("sem ajuste utilizável (papel nem agrupado) lança erro nomeado", () => {
    const broken: PlayerCoeffs = {
      ...coeffs,
      byRole: { ...coeffs.byRole, Forward: { ...coeffs.byRole.Forward, finishing: plane(Number.NaN, 0.1) } },
      pooled: { ...coeffs.pooled, finishing: plane(Number.NaN, 0.1) },
    };
    expect(() => derivePlayer(seedP, "s", broken, REP)).toThrow("derivePlayer: missing/non-finite fit for Forward.finishing");
    const missing: PlayerCoeffs = { ...coeffs, byRole: { ...coeffs.byRole, Forward: {} }, pooled: {} };
    expect(() => derivePlayer(seedP, "s", missing, REP)).toThrow("derivePlayer: missing/non-finite fit for Forward.passing");
  });
  test("ajuste de papel com NaN cai no agrupado; overall não finito faz clamp lançar", () => {
    const c: PlayerCoeffs = { ...coeffs, byRole: { ...coeffs.byRole, Forward: { ...coeffs.byRole.Forward, passing: plane(Number.NaN, 0.09) } } };
    expect(derivePlayer(seedP, "s", c, REP).stats.passing).toBe(Math.round(-3 + 0.1 * 70));
    expect(() => derivePlayer({ ...seedP, overall: Number.NaN }, "s", coeffs, REP)).toThrow("clamp: non-finite");
  });
  test("sem ruído (sd 0) segue a reta; n < 30 usa o ajuste agrupado", () => {
    const p = derivePlayer(seedP, "of_uy_x", coeffs, REP);
    expect(p.stats.passing).toBe(Math.round(-3 + 0.09 * 70));   // 3
    expect(p.stats.finishing).toBe(Math.round(-3 + 0.1 * 70));  // pooled → 4
  });
  test("reputação da liga entra como covariável e é limitada a [repMin − 3, repMax]", () => {
    const c: PlayerCoeffs = { ...coeffs, byRole: { ...coeffs.byRole, Forward: Object.fromEntries(STAT_KEYS.map((k) => [k, plane(-3, 0.05, 0.5)])) } };
    expect(derivePlayer(seedP, "s", c, 7).stats.passing).toBe(Math.round(-3 + 0.05 * 70 + 0.5 * 7));
    expect(derivePlayer(seedP, "s", c, 9.5).stats.passing).toBe(Math.round(-3 + 0.05 * 70 + 0.5 * 9.5));
    expect(derivePlayer(seedP, "s", c, 20)).toEqual(derivePlayer(seedP, "s", c, 9.5));
    expect(derivePlayer(seedP, "s", c, 0.5)).toEqual(derivePlayer(seedP, "s", c, 2.8));
    expect(derivePlayer(seedP, "s", c, 2.8).stats.passing).toBe(Math.round(-3 + 0.05 * 70 + 0.5 * 2.8));
  });
  test("c não finito conta como ajuste degenerado", () => {
    const c: PlayerCoeffs = { ...coeffs, byRole: { ...coeffs.byRole, Forward: { ...coeffs.byRole.Forward, passing: plane(-3, 0.09, Number.NaN) } } };
    expect(derivePlayer(seedP, "s", c, REP).stats.passing).toBe(Math.round(-3 + 0.1 * 70));
  });
  test("determinístico", () => {
    expect(derivePlayer(seedP, "s", coeffs, REP)).toEqual(derivePlayer(seedP, "s", coeffs, REP));
  });
  test("playerProfile names the archetype of the strongest stat", () => {
    const s = { passing: 9, vision: 2, finishing: 1, dribbling: 3, speed: 3, acceleration: 3, tackling: 3,
      pressing: 3, stamina: 3, heading: 3, strength: 3, reflex: 0, jump: 0 };
    expect(playerProfile("Midfielder", s, "Solid")).toEqual({ archetype: "Playmaker", summary: "Solid midfielder, strongest at passing." });
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
  test("multiplicadores de dinheiro ≤ 1 e de capacidade ≤ 1,2 nos níveis ≥ 2", () => {
    const c = (a: number) => line(a, 0);
    const f: ClubFits = { budget: c(0), broadcasting: c(0), commercial: c(0), followers: c(0), capacity: c(0), repMax: 3000 };
    const big = { budget: 5, broadcasting: 0.5, commercial: 3, followers: 4, capacity: 2 };
    const m = computeTierMultipliers({ fits: f, seedSerieBReputations: [1000], tlSerieB: [big], tlSerieC: [big] });
    expect(m.budget).toEqual({ 1: 1, 2: 1, 3: 1 });
    expect(m.followers).toEqual({ 1: 1, 2: 1, 3: 1 });
    expect(m.commercial[2]).toBe(1);
    expect(m.broadcasting[2]).toBeCloseTo(0.5, 9);
    expect(m.capacity).toEqual({ 1: 1, 2: 1.2, 3: 1.2 });
  });
  test("previsão usa a reputação limitada e entradas vazias lançam", () => {
    const f: ClubFits = { budget: line(0, 0.001), broadcasting: line(0, 0.001), commercial: line(0, 0.001), followers: line(0, 0.001), capacity: line(0, 0.001), repMax: 1000 };
    const one = { budget: 1, broadcasting: 1, commercial: 1, followers: 1, capacity: 1 };
    const m = computeTierMultipliers({ fits: f, seedSerieBReputations: [5000], tlSerieB: [one], tlSerieC: [one] });
    expect(m.budget[2]).toBeCloseTo(1 / Math.exp(1), 9);
    expect(() => computeTierMultipliers({ fits: f, seedSerieBReputations: [], tlSerieB: [one], tlSerieC: [one] })).toThrow("no values");
  });
});
