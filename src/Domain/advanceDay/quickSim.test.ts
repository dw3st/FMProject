import { describe, expect, test } from "bun:test";
import {
  expectedGoals,
  quickSimMatch,
  ratingFromStats,
  samplePoisson,
  teamLevel,
  teamStrength,
} from "@/Domain/advanceDay/quickSim";
import { QUICK_SIM_CONFIG as C } from "@/GameEngine/Configs/QuickSimConfig";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";

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
    expect(sFast.forwardPace).toBeCloseTo(7, 5); // (3·8 + 4) / 4
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
