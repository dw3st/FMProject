import { describe, expect, test } from "bun:test";
import {
  applyShift, findShift, fitLevelPredictor, predictLevel, quantileTargets, shiftToOverall,
  type LevelPair, type QuantileInput,
} from "@/../scripts/openfootball/recalibrate";
import { Player } from "@/Domain/Player";
import ROLES from "@/Data/roles.json";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const ATTR_WEIGHTS = ROLES as Record<string, { attrWeights?: Record<string, number> }>;

const STATS_ZERO: PlayerStatsRecord = {
  passing: 0, vision: 0, finishing: 0, dribbling: 0, speed: 0, acceleration: 0,
  tackling: 0, pressing: 0, stamina: 0, heading: 0, strength: 0, reflex: 0, jump: 0,
};

const st = (over: Partial<PlayerStatsRecord>): PlayerStatsRecord => ({ ...STATS_ZERO, ...over });

describe("fitLevelPredictor", () => {
  test("coeficientes finitos com pares suficientes", () => {
    // leagueRep varies independently of seedOverall (not collinear) across two leagues.
    const pairs: LevelPair[] = [
      { role: "Forward", seedOverall: 60, leagueRep: 3.0, nativeOverall: 3.0 },
      { role: "Forward", seedOverall: 70, leagueRep: 5.0, nativeOverall: 3.8 },
      { role: "Forward", seedOverall: 80, leagueRep: 3.0, nativeOverall: 3.6 },
      { role: "Forward", seedOverall: 90, leagueRep: 5.0, nativeOverall: 4.6 },
    ];
    const fits = fitLevelPredictor(pairs);
    const f = fits.Forward!;
    expect(Number.isFinite(f.a)).toBe(true);
    expect(Number.isFinite(f.b)).toBe(true);
    expect(Number.isFinite(f.c)).toBe(true);
    expect(Number.isFinite(f.sd)).toBe(true);
    expect(f.n).toBe(4);
  });

  test("papel com menos de 3 pares fica de fora", () => {
    const pairs: LevelPair[] = [
      { role: "GK", seedOverall: 60, leagueRep: 3, nativeOverall: 3.0 },
      { role: "GK", seedOverall: 70, leagueRep: 3, nativeOverall: 3.5 },
      { role: "Forward", seedOverall: 60, leagueRep: 3.0, nativeOverall: 3.0 },
      { role: "Forward", seedOverall: 70, leagueRep: 5.0, nativeOverall: 3.8 },
      { role: "Forward", seedOverall: 80, leagueRep: 3.5, nativeOverall: 4.0 },
    ];
    const fits = fitLevelPredictor(pairs);
    expect(fits.GK).toBeUndefined();
    expect(fits.Forward).toBeDefined();
  });

  test("ordem de z segue o seed dentro de uma liga (mesma leagueRep)", () => {
    // Two leagues (reps 4.2 and 6.5), overall growing with the seed within each — the fit is
    // estimated across both, then order is checked within a single fixed leagueRep.
    const leagueA: LevelPair[] = [
      { role: "Midfielder", seedOverall: 55, leagueRep: 4.2, nativeOverall: 2.8 },
      { role: "Midfielder", seedOverall: 62, leagueRep: 4.2, nativeOverall: 3.1 },
      { role: "Midfielder", seedOverall: 68, leagueRep: 4.2, nativeOverall: 3.3 },
      { role: "Midfielder", seedOverall: 74, leagueRep: 4.2, nativeOverall: 3.6 },
      { role: "Midfielder", seedOverall: 81, leagueRep: 4.2, nativeOverall: 4.0 },
      { role: "Midfielder", seedOverall: 88, leagueRep: 4.2, nativeOverall: 4.3 },
    ];
    const leagueB: LevelPair[] = leagueA.map((p) => ({ ...p, leagueRep: 6.5, nativeOverall: p.nativeOverall + 0.7 }));
    const fit = fitLevelPredictor([...leagueA, ...leagueB]).Midfielder!;
    // Same league (constant leagueRep = 4.2) → z order must follow seedOverall order exactly.
    const zs = leagueA.map((p) => predictLevel(fit, p.seedOverall, p.leagueRep));
    for (let i = 1; i < zs.length; i++) expect(zs[i]!).toBeGreaterThan(zs[i - 1]!);
  });
});

describe("quantileTargets", () => {
  test("multiset dos alvos é igual ao multiset atual; ordem segue z", () => {
    const players: QuantileInput[] = [
      { id: "p1", z: 10, currentOverall: 2.0 },
      { id: "p2", z: 50, currentOverall: 5.0 },
      { id: "p3", z: 30, currentOverall: 3.0 },
      { id: "p4", z: 90, currentOverall: 6.0 },
    ];
    const targets = quantileTargets(players);
    // Same multiset (mean + spread preserved).
    const inMulti = players.map((p) => p.currentOverall).sort((a, b) => a - b);
    const outMulti = [...targets.values()].sort((a, b) => a - b);
    expect(outMulti).toEqual(inMulti);
    // Highest z → highest current overall in the group, and so on down.
    expect(targets.get("p4")).toBe(6.0); // z=90, highest
    expect(targets.get("p2")).toBe(5.0); // z=50
    expect(targets.get("p3")).toBe(3.0); // z=30
    expect(targets.get("p1")).toBe(2.0); // z=10, lowest
  });

  test("empate em z é desempatado pelo id (ascendente)", () => {
    const players: QuantileInput[] = [
      { id: "zeta", z: 5, currentOverall: 1.0 },
      { id: "alpha", z: 5, currentOverall: 9.0 },
    ];
    const targets = quantileTargets(players);
    // "alpha" < "zeta" → alpha ranks first among the tie → gets the higher overall (9.0).
    expect(targets.get("alpha")).toBe(9.0);
    expect(targets.get("zeta")).toBe(1.0);
  });

  test("lista vazia devolve mapa vazio", () => {
    expect(quantileTargets([]).size).toBe(0);
  });
});

describe("applyShift", () => {
  test("só mexe em atributos de peso > 0, com clamp 0..10", () => {
    const stats = st({ finishing: 8, dribbling: 5, tackling: 9 });
    const weights = { finishing: 1, dribbling: 0.5, tackling: 0 };
    const shifted = applyShift(stats, weights, 5);
    expect(shifted.finishing).toBe(10); // 8+5 clamped
    expect(shifted.dribbling).toBe(10); // 5+5 clamped
    expect(shifted.tackling).toBe(9); // weight 0 → untouched
  });

  test("deslocamento negativo respeita o piso 0", () => {
    const stats = st({ finishing: 2 });
    const shifted = applyShift(stats, { finishing: 1 }, -10);
    expect(shifted.finishing).toBe(0);
  });
});

describe("findShift + shiftToOverall", () => {
  const weights = { finishing: 1, dribbling: 0.5 };
  const overallOf = (s: PlayerStatsRecord) => (s.finishing * s.finishing * 1 + s.dribbling * s.dribbling * 0.5) / 1.5 > 0
    ? Math.sqrt((s.finishing * s.finishing * 1 + s.dribbling * s.dribbling * 0.5) / 1.5)
    : 0;

  test("bisseção atinge o alvo antes do arredondamento (±0.01)", () => {
    const stats = st({ finishing: 4, dribbling: 3, tackling: 8 });
    const target = 7.2;
    const shift = findShift(stats, weights, target, overallOf);
    const continuous = applyShift(stats, weights, shift);
    expect(Math.abs(overallOf(continuous) - target)).toBeLessThanOrEqual(0.01);
  });

  test("shiftToOverall não mexe em atributos de peso 0", () => {
    const stats = st({ finishing: 4, dribbling: 3, tackling: 8, heading: 6 });
    const out = shiftToOverall("player-x", stats, weights, 7.2, overallOf);
    expect(out.tackling).toBe(8);
    expect(out.heading).toBe(6);
  });

  test("shiftToOverall respeita 0..10 e é determinístico", () => {
    const stats = st({ finishing: 9, dribbling: 9 });
    const out1 = shiftToOverall("player-y", stats, weights, 9.9, overallOf);
    const out2 = shiftToOverall("player-y", stats, weights, 9.9, overallOf);
    expect(out1).toEqual(out2);
    for (const k of Object.keys(out1) as (keyof PlayerStatsRecord)[]) {
      expect(out1[k]).toBeGreaterThanOrEqual(0);
      expect(out1[k]).toBeLessThanOrEqual(10);
    }
  });

  test("resultado é próximo do alvo mesmo depois do arredondamento", () => {
    const stats = st({ finishing: 4, dribbling: 3 });
    const target = 6.5;
    const out = shiftToOverall("player-z", stats, weights, target, overallOf);
    // Rounding on 2 weighted attributes can move the overall a bit; stay in a sane band.
    expect(Math.abs(overallOf(out) - target)).toBeLessThan(0.6);
  });
});

describe("integração: maior seedOverall vira o maior overall do jogo", () => {
  test("mundo de fixture pequeno (papel Forward)", () => {
    const players: Array<{ id: string; player: RosterPlayer; seedOverall: number; leagueRep: number }> = [
      { id: "n1", seedOverall: 65, leagueRep: 4.0, player: mkNative("n1", { finishing: 4, dribbling: 4, speed: 4, acceleration: 4, heading: 3, strength: 3, passing: 3, vision: 3, pressing: 3, stamina: 3, tackling: 1 }) },
      { id: "n2", seedOverall: 72, leagueRep: 4.3, player: mkNative("n2", { finishing: 5, dribbling: 5, speed: 5, acceleration: 5, heading: 4, strength: 4, passing: 4, vision: 4, pressing: 4, stamina: 4, tackling: 1 }) },
      { id: "n3", seedOverall: 80, leagueRep: 4.05, player: mkNative("n3", { finishing: 6, dribbling: 6, speed: 5, acceleration: 5, heading: 5, strength: 5, passing: 4, vision: 4, pressing: 4, stamina: 4, tackling: 2 }) },
      { id: "n4", seedOverall: 91, leagueRep: 4.2, player: mkNative("n4", { finishing: 4, dribbling: 4, speed: 6, acceleration: 6, heading: 3, strength: 3, passing: 3, vision: 3, pressing: 3, stamina: 3, tackling: 1 }) },
    ];

    // Deliberately scramble current overall vs seed overall: n4 has the highest seed overall but
    // (before recalibration) is not the strongest by native attributes.
    const currentOveralls = new Map(players.map((p) => [p.id, Player.computeOverallAvg(p.player)]));
    expect([...currentOveralls.entries()].sort((a, b) => b[1] - a[1])[0]![0]).not.toBe("n4");

    const levelPairs: LevelPair[] = players.map((p) => ({
      role: "Forward", seedOverall: p.seedOverall, leagueRep: p.leagueRep, nativeOverall: currentOveralls.get(p.id)!,
    }));
    const fit = fitLevelPredictor(levelPairs).Forward!;

    const quantileInput: QuantileInput[] = players.map((p) => ({
      id: p.id, z: predictLevel(fit, p.seedOverall, p.leagueRep), currentOverall: currentOveralls.get(p.id)!,
    }));
    const targets = quantileTargets(quantileInput);

    const recalibrated = new Map<string, number>();
    for (const p of players) {
      const role = Player.bestSpecificRole(p.player.stats, p.player.positions[0]!);
      const weights = ATTR_WEIGHTS[role]!.attrWeights!;
      const target = targets.get(p.id)!;
      const overallOf = (s: PlayerStatsRecord) => Player.computeOverallAvg({ ...p.player, stats: s });
      const newStats = shiftToOverall(p.id, p.player.stats, weights, target, overallOf);
      recalibrated.set(p.id, Player.computeOverallAvg({ ...p.player, stats: newStats }));
    }

    const ranked = [...recalibrated.entries()].sort((a, b) => b[1] - a[1]);
    expect(ranked[0]![0]).toBe("n4"); // highest seedOverall (91) → now the highest game overall
  });
});

function mkNative(id: string, overrides: Partial<PlayerStatsRecord>): RosterPlayer {
  return {
    id, name: id, age: 24, squadId: "sq1", preferredFoot: "right",
    positions: ["Forward"],
    stats: st(overrides),
    profile: { summary: "", archetype: "" },
  };
}
