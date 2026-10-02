import { describe, expect, test } from "bun:test";
import {
  expectedGoals,
  quickSimMatch,
  ratingFromStats,
  samplePoisson,
  teamLevel,
  teamStrength,
} from "@/Domain/advanceDay/quickSim";
import { QUICK_SIM_CONFIG as C, ROLE_GROUP } from "@/GameEngine/Configs/QuickSimConfig";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { drainMultiplier, matchStartEnergy } from "@/Domain/fitness/fitness";
import { FITNESS } from "@/Domain/fitness/fitnessConfig";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];

function makeSquad(id: string, level: number): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}-p${i}`,
    name: `${id} ${role} ${i}`,
    age: 25,
    squadId: id,
    preferredFoot: "right",
    positions: [role],
    stats: {
      passing: level, vision: level, finishing: level, dribbling: level,
      speed: level, acceleration: level, tackling: level, pressing: level,
      stamina: level, heading: level, strength: level, reflex: level, jump: level,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

/** Squad of a single GK — exercises the uniform-pick fallback when scorerWeight totals 0. */
function makeGkOnlySquad(id: string, level: number): Squad {
  const player: RosterPlayer = {
    id: `${id}-p0`,
    name: `${id} GK 0`,
    age: 25,
    squadId: id,
    preferredFoot: "right",
    positions: ["GK"],
    stats: {
      passing: level, vision: level, finishing: level, dribbling: level,
      speed: level, acceleration: level, tackling: level, pressing: level,
      stamina: level, heading: level, strength: level, reflex: level, jump: level,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  };
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players: [player] };
}

const lineupOf = (s: Squad) => s.players.map((p) => p.id);

function run(home: Squad, away: Squad, seed: number) {
  return quickSimMatch(
    { fixtureId: "f1", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
    mulberry32(seed),
  );
}

describe("samplePoisson", () => {
  test("média próxima de lambda", () => {
    const rng = mulberry32(1);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += samplePoisson(1.4, rng);
    expect(sum / 20000).toBeCloseTo(1.4, 1);
  });
});

describe("teamStrength / expectedGoals", () => {
  test("elenco mais forte tem linhas mais fortes", () => {
    const strong = teamStrength(makeSquad("s", 6).players);
    const weak = teamStrength(makeSquad("w", 2).players);
    expect(strong.attack).toBeGreaterThan(weak.attack);
    expect(strong.defense).toBeGreaterThan(weak.defense);
    expect(strong.goalkeeper).toBeGreaterThan(weak.goalkeeper);
  });

  test("mando aumenta o xG", () => {
    const s = teamStrength(makeSquad("a", 4).players);
    expect(expectedGoals(s, s, true)).toBeGreaterThan(expectedGoals(s, s, false));
  });

  test("atacantes mais rápidos que a defesa adversária aumentam o xG (pace edge)", () => {
    const base = makeSquad("b", 4);
    const fast = makeSquad("f", 4);
    for (const p of fast.players) {
      if (["LW", "ST", "RW"].includes(p.positions[0]!)) p.stats.speed = 8;
    }
    const opp = teamStrength(makeSquad("o", 4).players);
    const sBase = teamStrength(base.players);
    const sFast = teamStrength(fast.players);
    expect(sFast.forwardPace).toBeGreaterThan(sBase.forwardPace);
    expect(sFast.forwardPace).toBeLessThanOrEqual(7 + 1e-9); // (3·8 + 4) / 4, minus any out-of-position penalty
    expect(sFast.defensePace).toBeCloseTo(sBase.defensePace, 5);
    const ratio = expectedGoals(sFast, opp, false) / expectedGoals(sBase, opp, false);
    // Speed also feeds the attack strength, so the lift is at least the pace-edge factor.
    expect(ratio).toBeGreaterThan(Math.exp(0.1 * 3));
  });
});

/** Squad with real-data main roles in `positions[0]` and a per-player attribute level. */
function makeMainRoleSquad(id: string, spec: { pos: string; level: number }[]): Squad {
  const players: RosterPlayer[] = spec.map(({ pos, level }, i) => ({
    id: `${id}-p${i}`,
    name: `${id} ${pos} ${i}`,
    age: 25,
    squadId: id,
    preferredFoot: "right",
    positions: [pos],
    stats: {
      passing: level, vision: level, finishing: level, dribbling: level,
      speed: level, acceleration: level, tackling: level, pressing: level,
      stamina: level, heading: level, strength: level, reflex: level, jump: level,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

describe("slot roles", () => {
  test("papel do slot muda a força: meia em slot CAM conta no ataque", () => {
    // Midfielders are much stronger than the forwards, so pulling one into the attack line
    // (via a CAM slot) must raise attack strength vs grouping by main role alone.
    const squad = makeMainRoleSquad("m", [
      { pos: "GK", level: 4 },
      ...Array.from({ length: 4 }, () => ({ pos: "Defender", level: 4 })),
      ...Array.from({ length: 3 }, () => ({ pos: "Midfielder", level: 8 })),
      ...Array.from({ length: 3 }, () => ({ pos: "Forward", level: 3 })),
    ]);
    const roles = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CAM", "LW", "ST", "RW"];
    const withoutRoles = teamStrength(squad.players);
    const withRoles = teamStrength(squad.players, roles);
    expect(withRoles.attack).toBeGreaterThan(withoutRoles.attack);
    expect(withRoles.defense).toBeGreaterThan(withoutRoles.defense); // CDM joins the defense
  });

  test("Midfielder no slot ST recebe peso de atacante e marca mais gols", () => {
    const squad = makeMainRoleSquad("h", [
      { pos: "GK", level: 5 },
      ...Array.from({ length: 10 }, () => ({ pos: "Midfielder", level: 5 })),
    ]);
    const away = makeSquad("a", 5);
    const roles = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CM", "ST", "CM"];
    const goals = new Map<string, number>();
    for (let seed = 0; seed < 500; seed++) {
      const { recording } = quickSimMatch(
        {
          fixtureId: "f", home: squad, away,
          homeLineup: lineupOf(squad), awayLineup: lineupOf(away), homeRoles: roles,
        },
        mulberry32(seed),
      );
      for (const [id, s] of Object.entries(recording.playerStats)) {
        if (id.startsWith("h-")) goals.set(id, (goals.get(id) ?? 0) + s.goals);
      }
    }
    const stGoals = goals.get("h-p9") ?? 0;
    const others = [...goals.entries()].filter(([id]) => id !== "h-p9").map(([, g]) => g);
    expect(stGoals).toBeGreaterThan(0);
    for (const g of others) expect(stGoals).toBeGreaterThan(g * 3);
  });

  test("vagas puladas não desalinham os papéis", () => {
    // Blank slot 0 is skipped; the player in slot 9 must still get the slot-9 role (ST).
    const squad = makeMainRoleSquad("h", [
      { pos: "GK", level: 5 },
      ...Array.from({ length: 10 }, () => ({ pos: "Midfielder", level: 5 })),
    ]);
    const away = makeSquad("a", 5);
    const lineup = ["", ...lineupOf(squad).slice(1)];
    const roles = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CM", "ST", "CM"];
    let stGoals = 0, total = 0;
    for (let seed = 0; seed < 300; seed++) {
      const { recording } = quickSimMatch(
        { fixtureId: "f", home: squad, away, homeLineup: lineup, awayLineup: lineupOf(away), homeRoles: roles },
        mulberry32(seed),
      );
      stGoals += recording.playerStats["h-p9"]?.goals ?? 0;
      total += recording.score.home;
    }
    expect(stGoals / total).toBeGreaterThan(0.5);
  });
});

describe("quickSimMatch", () => {
  test("determinístico com a mesma semente", () => {
    const h = makeSquad("h", 4);
    const a = makeSquad("a", 4);
    const strip = (seed: number) => ({ ...run(h, a, seed).recording, durationMs: 0 });
    expect(strip(99)).toEqual(strip(99));
  });

  test("gols dos jogadores somam o placar", () => {
    const h = makeSquad("h", 4);
    const a = makeSquad("a", 4);
    for (let seed = 0; seed < 50; seed++) {
      const { recording } = run(h, a, seed);
      const sum = (prefix: string) =>
        Object.entries(recording.playerStats)
          .filter(([id]) => id.startsWith(prefix))
          .reduce((acc, [, s]) => acc + s.goals, 0);
      expect(sum("h-")).toBe(recording.score.home);
      expect(sum("a-")).toBe(recording.score.away);
    }
  });

  test("notas em [0,10] e energia em [0,100]", () => {
    const { recording } = run(makeSquad("h", 5), makeSquad("a", 3), 3);
    for (const r of Object.values(recording.playerRatings)) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(10);
    }
    for (const e of Object.values(recording.playerEnergy)) {
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(100);
    }
  });

  test("ignora vagas vazias e ids desconhecidos na escalação", () => {
    const h = makeSquad("h", 4);
    const a = makeSquad("a", 4);
    const { recording } = quickSimMatch(
      { fixtureId: "f", home: h, away: a, homeLineup: ["", "nope", ...lineupOf(h).slice(0, 9)], awayLineup: lineupOf(a) },
      mulberry32(5),
    );
    expect(Object.keys(recording.playerStats).filter((id) => id.startsWith("h-")).length).toBe(9);
  });

  // Sanity band, not the calibration target (that is scripts/quicksim-calibrate.ts against the
  // engine): uniform-attribute squads at level ~4.5 land ~1.3; real leagues at that level ~1.45–1.6.
  test("distribuição: times iguais com média de 1,1 a 1,9 gols e mandante vencendo mais", () => {
    const h = makeSquad("h", 4);
    const a = makeSquad("a", 4);
    let goals = 0, homeWins = 0, awayWins = 0;
    const N = 2000;
    for (let seed = 0; seed < N; seed++) {
      const { score } = run(h, a, seed).recording;
      goals += score.home + score.away;
      if (score.home > score.away) homeWins++;
      else if (score.away > score.home) awayWins++;
    }
    expect(goals / N).toBeGreaterThanOrEqual(1.1);
    expect(goals / N).toBeLessThanOrEqual(1.9);
    expect(homeWins).toBeGreaterThan(awayWins);
  });

  test("nível absoluto: dois nível 7 marcam mais que dois nível 3", () => {
    const avgGoals = (level: number) => {
      const h = makeSquad("h", level);
      const a = makeSquad("a", level);
      let goals = 0;
      for (let seed = 0; seed < 1000; seed++) {
        const { score } = run(h, a, seed).recording;
        goals += score.home + score.away;
      }
      return goals / 1000;
    };
    expect(avgGoals(7)).toBeGreaterThan(avgGoals(3));
  });

  test("passes seguem o nível do próprio time: meio-campo fraco passa bem menos", () => {
    const strong = makeSquad("s", 7);
    const weak = makeSquad("w", 3);
    const mids = new Set(["CDM", "CM"]);
    let strongPasses = 0;
    let weakPasses = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const { playerStats } = run(strong, weak, seed).recording;
      for (const p of strong.players) if (mids.has(p.positions[0]!)) strongPasses += playerStats[p.id]!.passesAttempted;
      for (const p of weak.players) if (mids.has(p.positions[0]!)) weakPasses += playerStats[p.id]!.passesAttempted;
    }
    // MID pass rate ∝ (teamLevel / LEVEL_REF)^PASS_LEVEL_EXPONENT.MID (no attribute factor).
    const expectedRatio = Math.pow(
      teamLevel(teamStrength(strong.players)) / teamLevel(teamStrength(weak.players)),
      C.PASS_LEVEL_EXPONENT.MID,
    );
    expect(expectedRatio).toBeGreaterThan(1.5);
    expect(strongPasses / weakPasses).toBeGreaterThan(expectedRatio * 0.9);
    expect(strongPasses / weakPasses).toBeLessThan(expectedRatio * 1.1);
  });

  test("desarmes e interceptações por vaga seguem taxa × (nível do time / LEVEL_REF)^expoente × fator de atributo", () => {
    for (const level of [3, 7]) {
      const h = makeSquad("h", level);
      const a = makeSquad("a", 5);
      const lvl = teamLevel(teamStrength(h.players));
      const factor = 0.5 + level / 10;
      const expected = (rate: number, exp: number) => rate * Math.pow(lvl / C.LEVEL_REF, exp) * factor;
      const cms = h.players.filter((p) => p.positions[0] === "CM");
      let tackles = 0;
      let ints = 0;
      const N = 3000;
      for (let seed = 0; seed < N; seed++) {
        const { playerStats } = run(h, a, seed).recording;
        for (const p of cms) {
          tackles += playerStats[p.id]!.tackles;
          ints += playerStats[p.id]!.interceptions;
        }
      }
      const n = N * cms.length;
      expect(tackles / n).toBeCloseTo(expected(C.TACKLES_PER_MATCH.MID, C.TACKLE_LEVEL_EXPONENT.MID), 1);
      expect(ints / n).toBeCloseTo(expected(C.INTERCEPTIONS_PER_MATCH.MID, C.INTERCEPTION_LEVEL_EXPONENT.MID), 1);
    }
  });

  test("chutes sem gol = SHOTS_PER_XG × xG × (nível da partida / LEVEL_REF)^SHOTS_LEVEL_EXPONENT", () => {
    for (const level of [3, 7]) {
      const h = makeSquad("h", level);
      const a = makeSquad("a", level);
      const matchLevel = teamLevel(teamStrength(h.players));
      let extra = 0;
      let xg = 0;
      for (let seed = 0; seed < 3000; seed++) {
        const { recording, breakdown } = run(h, a, seed);
        const shots = recording.teamStats.home.shots + recording.teamStats.away.shots;
        extra += shots - recording.score.home - recording.score.away;
        xg += breakdown.xgHome + breakdown.xgAway;
      }
      const perXg = C.SHOTS_PER_XG * Math.pow(matchLevel / C.LEVEL_REF, C.SHOTS_LEVEL_EXPONENT);
      expect(extra / xg / perXg).toBeGreaterThan(0.93);
      expect(extra / xg / perXg).toBeLessThan(1.07);
    }
  });

  test("forte vence o fraco na maioria", () => {
    const strong = makeSquad("s", 7);
    const weak = makeSquad("w", 2);
    let strongWins = 0;
    for (let seed = 0; seed < 500; seed++) {
      const { score } = run(weak, strong, seed).recording;
      if (score.away > score.home) strongWins++;
    }
    expect(strongWins / 500).toBeGreaterThan(0.6);
  });

  test("XI apenas com GK: scorerWeight zerado cai no fallback uniforme e os gols batem com o placar", () => {
    const gkOnly = makeGkOnlySquad("g", 4);
    const normal = makeSquad("n", 4);
    for (let seed = 0; seed < 200; seed++) {
      const { recording } = quickSimMatch(
        { fixtureId: "f", home: gkOnly, away: normal, homeLineup: lineupOf(gkOnly), awayLineup: lineupOf(normal) },
        mulberry32(seed),
      );
      const homeGoals = Object.entries(recording.playerStats)
        .filter(([id]) => id.startsWith("g-"))
        .reduce((acc, [, s]) => acc + s.goals, 0);
      const awayGoals = Object.entries(recording.playerStats)
        .filter(([id]) => id.startsWith("n-"))
        .reduce((acc, [, s]) => acc + s.goals, 0);
      expect(homeGoals).toBe(recording.score.home);
      expect(awayGoals).toBe(recording.score.away);
    }
  });
});

describe("calibração de notas", () => {
  test("elencos nível 5 iguais: média de linha (sem goleiro) em [5.9, 6.8] e poucas notas >= 8.5", () => {
    const h = makeSquad("h", 5);
    const a = makeSquad("a", 5);
    const ratings: number[] = [];
    for (let seed = 0; seed < 1000; seed++) {
      const { recording } = run(h, a, seed);
      for (const [id, r] of Object.entries(recording.playerRatings)) {
        if (id.endsWith("-p0")) continue; // goalkeeper (ROLES[0] === "GK")
        ratings.push(r);
      }
    }
    const mean = ratings.reduce((x, y) => x + y, 0) / ratings.length;
    const share85 = ratings.filter((r) => r >= 8.5).length / ratings.length;
    expect(mean).toBeGreaterThanOrEqual(5.9);
    expect(mean).toBeLessThanOrEqual(6.8);
    expect(share85).toBeLessThan(0.08);
  });
});

describe("ratingFromStats tail shrink (#9)", () => {
  const zero = { passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0 };
  test("a big forward night is pulled toward the line centre, a quiet one barely moves", () => {
    const big = { ...zero, goals: 1, shots: 2, assists: 1 };
    expect(ratingFromStats(big, 0, "FWD")).toBeLessThan(ratingFromStats(big));
    expect(ratingFromStats(big, 0, "FWD")).toBeGreaterThan(8);
    expect(Math.abs(ratingFromStats(zero, 0, "FWD") - ratingFromStats(zero))).toBeLessThan(0.1);
    expect(ratingFromStats(zero, 0, "GK")).toBe(ratingFromStats(zero));
  });
});

describe("ratingFromStats", () => {
  test("baseline 6.0 sem ações e gol sobe a nota", () => {
    const zero = { passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0 };
    expect(ratingFromStats(zero)).toBe(6);
    expect(ratingFromStats({ ...zero, goals: 1, shots: 1 })).toBeCloseTo(7.7, 5);
  });

  test("tacklesFailed é opcional (default 0) e reduz a nota via TACKLE_FAILED quando informado", () => {
    const zero = { passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0 };
    expect(ratingFromStats(zero, 0)).toBe(ratingFromStats(zero));
    expect(ratingFromStats(zero, 1)).toBeCloseTo(5.8, 5);
  });
});

describe("quickSim knockout", () => {
  test("never ends level; decider consistent; goals match the score", () => {
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    let shootouts = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { recording: r } = quickSimMatch(
        { fixtureId: "k", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away), knockout: true },
        mulberry32(seed),
      );
      const goals = (side: "h" | "a") =>
        Object.entries(r.playerStats).filter(([id]) => id.startsWith(`${side}-`)).reduce((n, [, s]) => n + s.goals, 0);
      expect(goals("h")).toBe(r.score.home);
      expect(goals("a")).toBe(r.score.away);
      if (r.decider?.penalties) {
        shootouts++;
        expect(r.score.home).toBe(r.score.away);
        expect(r.decider.penalties.home).not.toBe(r.decider.penalties.away);
      } else {
        expect(r.score.home).not.toBe(r.score.away);
      }
    }
    expect(shootouts).toBeGreaterThan(0);
  });

  test("extra time drains energy ×4/3 versus the 90' formula", () => {
    // Energy drain is a pure function of the player's own stamina and start fitness — it never
    // depends on rng draws or match events. That means we don't need to compare a knockout run
    // against a non-knockout run of the same seed (which would be invalid anyway: extra time
    // consumes extra samplePoisson/rng draws before goalsHome/goalsAway are even settled, so a
    // non-knockout run of the same seed does not share the same rng call order). Instead we
    // recompute the expected drain directly from QUICK_SIM_CONFIG and compare.
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    let found = false;
    for (let seed = 1; seed <= 3000 && !found; seed++) {
      const { recording: r } = quickSimMatch(
        { fixtureId: "et", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away), knockout: true },
        mulberry32(seed),
      );
      if (!r.decider?.extraTime) continue;
      found = true;
      for (const p of [...home.players, ...away.players]) {
        // Start energy is the match's compressed energy (`matchStartEnergy`), not raw persisted
        // fitness — see `.claude/rules/non-player-games.md` → "Fadiga".
        const startEnergy = matchStartEnergy(ensureSeasonLog(p).seasonLog!.fitness);
        const group = ROLE_GROUP[p.positions[0]!]!;
        const drain =
          C.ENERGY_DRAIN_BY_LINE[group] *
          (1.2 - 0.4 * (p.stats.stamina / 10)) *
          drainMultiplier(ensureSeasonLog(p).seasonLog!.load ?? 0) *
          (4 / 3);
        const expected = Math.max(0, Math.min(100, startEnergy - drain));
        expect(r.playerEnergy[p.id]).toBeCloseTo(expected, 6);
      }
    }
    expect(found).toBe(true);
  });

  test("drain differs by line", () => {
    // Same squad/lineup on both sides so the only asymmetry is role → line group. GK/DEF/MID/FWD
    // each have a distinct ENERGY_DRAIN_BY_LINE constant, so a full-90 GK and a full-90 ST must
    // lose different amounts of energy for the same stamina and load.
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    const { recording: r } = quickSimMatch(
      { fixtureId: "d", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
      mulberry32(1),
    );
    const gk = home.players.find((p) => p.positions[0] === "GK")!;
    const st = home.players.find((p) => p.positions[0] === "ST")!;
    // Loss is measured from the match's compressed start energy, not raw persisted fitness.
    const gkLoss = matchStartEnergy(ensureSeasonLog(gk).seasonLog!.fitness) - r.playerEnergy[gk.id]!;
    const stLoss = matchStartEnergy(ensureSeasonLog(st).seasonLog!.fitness) - r.playerEnergy[st.id]!;
    expect(C.ENERGY_DRAIN_BY_LINE.GK).not.toBe(C.ENERGY_DRAIN_BY_LINE.FWD);
    expect(gkLoss).toBeCloseTo(
      C.ENERGY_DRAIN_BY_LINE.GK * (1.2 - 0.4 * (gk.stats.stamina / 10)),
      6,
    );
    expect(stLoss).toBeCloseTo(
      C.ENERGY_DRAIN_BY_LINE.FWD * (1.2 - 0.4 * (st.stats.stamina / 10)),
      6,
    );
  });

  test("load raises drain via drainMultiplier", () => {
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    const loaded = {
      ...home,
      players: home.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), load: FITNESS.LOAD_HIGH } })),
    };
    const { recording: fresh } = quickSimMatch(
      { fixtureId: "l1", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
      mulberry32(5),
    );
    const { recording: tired } = quickSimMatch(
      { fixtureId: "l2", home: loaded, away, homeLineup: lineupOf(loaded), awayLineup: lineupOf(away) },
      mulberry32(5),
    );
    for (const p of home.players) {
      // Both `fresh` and `tired` start from the SAME raw fitness (only `load` differs between the
      // two squads), so they share the same compressed start energy — load itself is never
      // compressed, only fitness (see `matchStartEnergy`).
      const startEnergy = matchStartEnergy(ensureSeasonLog(p).seasonLog!.fitness);
      const freshLoss = startEnergy - fresh.playerEnergy[p.id]!;
      const tiredLoss = startEnergy - tired.playerEnergy[p.id]!;
      expect(tiredLoss).toBeGreaterThan(freshLoss);
      expect(tiredLoss).toBeCloseTo(freshLoss * drainMultiplier(FITNESS.LOAD_HIGH), 6);
    }
  });

  test("a knockout match with an empty lineup still ends with an unlevel shootout", () => {
    // Regresses the bug fixed in resolvePenaltyShootout: an empty home XI means `shootoutSide`
    // returns no takers for home, so the shootout used to resolve as a 0-0 tie (no synthetic
    // kick) — decider.penalties.home === decider.penalties.away. It must now always resolve
    // with a winner.
    // The away side is deliberately GK-only (floor-level attack/midfield, same as the empty
    // home side's floor-level defense/GK): a full 11-man away side would have overwhelming
    // attack strength against an empty defense and would score almost every match, making a
    // 0-0-after-extra-time (the only path to a shootout) too rare to hit within a seed sweep.
    const home = makeSquad("h", 6);
    const away = makeGkOnlySquad("a", 4);
    let sawShootout = false;
    for (let seed = 1; seed <= 3000 && !sawShootout; seed++) {
      const { recording: r } = quickSimMatch(
        { fixtureId: "empty-ko", home, away, homeLineup: [], awayLineup: lineupOf(away), knockout: true },
        mulberry32(seed),
      );
      expect(r.score.home).toBe(0);
      if (!r.decider?.penalties) continue;
      sawShootout = true;
      expect(r.decider.penalties.home).not.toBe(r.decider.penalties.away);
    }
    expect(sawShootout).toBe(true);
  });

  test("without knockout, draws are still possible and no decider is set", () => {
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    let draws = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { recording: r } = quickSimMatch(
        { fixtureId: "l", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
        mulberry32(seed),
      );
      expect(r.decider).toBeUndefined();
      if (r.score.home === r.score.away) draws++;
    }
    expect(draws).toBeGreaterThan(0);
  });
});

describe("quickSim aggregate", () => {
  test("extra time only when level on aggregate", () => {
    const home = makeSquad("h", 6), away = makeSquad("a", 6);
    for (let seed = 1; seed <= 300; seed++) {
      const { recording: r } = quickSimMatch(
        { fixtureId: "g", home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away),
          knockout: true, aggregate: { home: 0, away: 2 } },
        mulberry32(seed),
      );
      const diffAfter90 = r.score.home - (r.decider?.extraTime.home ?? 0) - (r.score.away - (r.decider?.extraTime.away ?? 0));
      if (r.decider) expect(diffAfter90).toBe(2);           // level on aggregate after 90'
      else expect(r.score.home - r.score.away).not.toBe(2); // otherwise decided in 90'
      if (r.decider?.penalties) expect(r.score.home - r.score.away).toBe(2);
    }
  });
});

// ── injuries (Task 3, docs/superpowers/plans/2026-09-28-injuries.md) ───────────

describe("quickSimMatch — injuries", () => {
  function extremeRiskSquad(id: string): Squad {
    const s = makeSquad(id, 5);
    return {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        age: 38,
        seasonLog: { ...emptySeasonLog(), fitness: 5, load: 400 },
      })),
    };
  }

  test("injuries occur across many matches under extreme risk factors (old, exhausted, overloaded)", () => {
    const home = extremeRiskSquad("h");
    const away = extremeRiskSquad("a");
    let totalInjuries = 0;
    for (let seed = 0; seed < 200; seed++) {
      const { recording } = quickSimMatch(
        { fixtureId: `f${seed}`, home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
        mulberry32(seed),
      );
      totalInjuries += recording.injuries?.length ?? 0;
    }
    expect(totalInjuries).toBeGreaterThan(0);
  });

  test("injuries are absent (or rare) for fresh, young, low-load players", () => {
    const home = makeSquad("h", 7);
    const away = makeSquad("a", 7);
    let matchesWithInjury = 0;
    const N = 100;
    for (let seed = 0; seed < N; seed++) {
      const { recording } = quickSimMatch(
        { fixtureId: `f${seed}`, home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
        mulberry32(seed + 10_000),
      );
      if (recording.injuries && recording.injuries.length > 0) matchesWithInjury++;
    }
    // Baseline target is ~0.3 injuries/match combined — well under half the matches should show one.
    expect(matchesWithInjury / N).toBeLessThan(0.5);
  });

  test("recorded injuries carry valid team/severity and a matchMinute within the match, sorted", () => {
    const home = extremeRiskSquad("h");
    const away = extremeRiskSquad("a");
    let found: NonNullable<ReturnType<typeof quickSimMatch>["recording"]["injuries"]> | undefined;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const { recording } = quickSimMatch(
        { fixtureId: `f${seed}`, home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
        mulberry32(seed),
      );
      if (recording.injuries && recording.injuries.length > 0) found = recording.injuries;
    }
    expect(found).toBeDefined();
    for (const inj of found!) {
      expect(["home", "away"]).toContain(inj.team);
      expect(["light", "medium", "severe"]).toContain(inj.severity);
      expect(inj.matchMinute).toBeGreaterThanOrEqual(1);
      expect(inj.matchMinute).toBeLessThanOrEqual(90);
    }
    const sorted = [...found!].sort((a, b) => a.matchMinute - b.matchMinute);
    expect(found).toEqual(sorted);
  });

  test("no substitutions in quickSim — an injured player still appears with full stats (no lineup change)", () => {
    const home = extremeRiskSquad("h");
    const away = extremeRiskSquad("a");
    for (let seed = 0; seed < 200; seed++) {
      const { recording } = quickSimMatch(
        { fixtureId: `f${seed}`, home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away) },
        mulberry32(seed),
      );
      if (recording.injuries && recording.injuries.length > 0) {
        expect(recording.substitutions).toEqual([]);
        for (const inj of recording.injuries) {
          expect(recording.playerStats[inj.playerId]).toBeDefined();
        }
        return;
      }
    }
    throw new Error("expected at least one injury across 200 seeds under extreme risk factors");
  });
});

// Etapa 12 part 2 — fouls, cards, penalties and offsides (`.claude/rules/game/discipline.md`).
describe("quickSimMatch — discipline", () => {
  test("per-match means match the engine's and the cards are consistent", () => {
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    const n = 3000;
    let fouls = 0, yellows = 0, reds = 0, pens = 0;
    for (let i = 0; i < n; i++) {
      const r = run(home, away, 1000 + i).recording;
      const ids = new Set([...lineupOf(home), ...lineupOf(away)]);
      for (const side of [r.teamStats.home, r.teamStats.away]) {
        fouls += side.fouls!;
        yellows += side.yellowCards!;
        reds += side.redCards!;
        pens += side.penaltiesAwarded!;
      }
      const cards = r.cards ?? [];
      expect(cards.filter((c) => c.card === "yellow").length).toBe(r.teamStats.home.yellowCards! + r.teamStats.away.yellowCards!);
      for (const c of cards) expect(ids.has(c.playerId)).toBe(true);
      // A second-yellow red always follows that player's earlier yellow.
      for (const c of cards.filter((x) => x.secondYellow)) {
        expect(cards.filter((x) => x.playerId === c.playerId && x.card === "yellow").length).toBe(2);
      }
      // Penalties never add goals: per-player goals still sum to the score.
      const goals = (side: Squad) => lineupOf(side).reduce((s, id) => s + (r.playerStats[id]?.goals ?? 0), 0);
      expect(goals(home)).toBe(r.score.home);
      expect(goals(away)).toBe(r.score.away);
    }
    expect(fouls / n).toBeGreaterThan(10);
    expect(fouls / n).toBeLessThan(13);
    expect(yellows / n).toBeGreaterThan(2.4);
    expect(yellows / n).toBeLessThan(3.3);
    expect(reds / n).toBeLessThan(0.25);
    expect(pens / n).toBeGreaterThan(0.17);
    expect(pens / n).toBeLessThan(0.3);
  });

  test("a red card names a player of the carded side's XI", () => {
    const home = makeSquad("h", 6);
    const away = makeSquad("a", 6);
    for (let seed = 1; seed < 5000; seed++) {
      const r = run(home, away, seed).recording;
      const red = r.cards?.find((c) => c.card === "red");
      if (!red) continue;
      expect(red.team === "home" ? lineupOf(home) : lineupOf(away)).toContain(red.playerId);
      return;
    }
    throw new Error("no red card in 5000 seeds");
  });
});
