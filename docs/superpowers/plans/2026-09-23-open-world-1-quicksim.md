# Open World — Plano 1: quickSim + modo por liga

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partidas das ligas que o jogador não acompanha passam a ser resolvidas por um simulador estatístico leve (`quickSim`). A liga do jogador e as ligas seguidas continuam no motor completo.

**Architecture:** `quickSimMatch` é uma função pura: recebe dois elencos e as escalações e devolve um `PlayedMatchRecording`, o mesmo formato que o jogo gravado ao vivo já produz. `advanceDay` escolhe o modo de cada liga com `resolveSimMode`. No modo `fast`, o recording passa por `buildMatchEventFromRecording` (energia, `seasonLog` e desenvolvimento continuam iguais) e o evento é compactado antes de ir para o log do dia.

**Tech Stack:** Bun + TypeScript, `bun:test`, React 19 + Tailwind (painel do `/test`), Web Worker do `/lab`.

**Spec:** `docs/superpowers/specs/2026-09-23-open-world-database-design.md`, seção 2.

**Desvio do spec (intencional):** o spec guarda `simMode` em `meta.activeLeagues[i]`. Este plano **deriva** o modo com `resolveSimMode(leagueSlug, meta)` a partir de `meta.leagueSlug` e `meta.followedLeagues`. Assim ele nunca fica desatualizado quando o jogador troca de liga. A Task 11 atualiza o spec.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/Domain/rng.ts` | criar | `mulberry32(seed)`: RNG com semente para testes e calibração |
| `src/GameEngine/Configs/QuickSimConfig.ts` | criar | Todas as constantes ajustáveis do quickSim |
| `src/Domain/advanceDay/quickSim.ts` | criar | `quickSimMatch`, `teamStrength`, `expectedGoals`, `samplePoisson`, `ratingFromStats` |
| `src/Domain/advanceDay/quickSim.test.ts` | criar | Testes do quickSim |
| `src/Domain/advanceDay/simMode.ts` | criar | `resolveSimMode(leagueSlug, meta)` |
| `src/Domain/advanceDay/simMode.test.ts` | criar | Testes do simMode |
| `src/Domain/advanceDay/matches.ts` | modificar | `buildQuickMatchEvent` + `compactMatchEvent` |
| `src/Domain/advanceDay/matches.quick.test.ts` | criar | Testes da integração |
| `src/types/dayLogTypes.ts` | modificar | `MatchEvent.compact?: true` |
| `src/backend/SaveService.ts` | modificar | `SaveMeta.followedLeagues?: string[]` |
| `src/backend/advanceDay.ts` | modificar | Ramificação `full`/`fast` no loop de partidas |
| `src/GameInterface/LeagueTableScreen.tsx` | modificar | Aviso quando o evento é compacto |
| `src/i18n/locales/en.json`, `pt-BR.json` | modificar | Chave `leagues.quickSimNoDetail` |
| `src/lab/types.ts`, `balanceWorker.ts`, `scenarioRunner.ts`, `components/ScenarioBuilder.tsx`, `components/ResultsViewer.tsx` | modificar | Motor escolhível no `/lab` (`full` ou `quick`) |
| `src/GameInterface/QuickSimPanel.tsx` | criar | Painel do `/test` com o breakdown do quickSim |
| `src/GameInterface/TestScreen.tsx` | modificar | Botão que abre o `QuickSimPanel` |
| `scripts/quicksim-calibrate.ts` | criar | Compara quickSim × motor em elencos reais |

---

### Task 0: Pré-requisito — Bun local

Os testes e scripts precisam do Bun, que não está instalado nesta máquina (só no container).

- [ ] **Step 1: Instalar o Bun (Windows)**

Run (PowerShell): `powershell -c "irm bun.sh/install.ps1 | iex"`
Depois abra um shell novo e confira: `bun --version`
Expected: uma versão `1.x`.

- [ ] **Step 2: Instalar dependências e rodar a suíte existente**

Run: `bun install` e depois `bun test`
Expected: a suíte atual passa. Anote quantos testes existem, para comparar no final.

---

### Task 1: RNG com semente

**Files:**
- Create: `src/Domain/rng.ts`
- Test: `src/Domain/rng.test.ts`

- [ ] **Step 1: Escrever o teste**

```ts
// src/Domain/rng.test.ts
import { describe, expect, test } from "bun:test";
import { mulberry32 } from "@/Domain/rng";

describe("mulberry32", () => {
  test("mesma semente gera a mesma sequência", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  test("valores em [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("sementes diferentes divergem", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/rng.test.ts`
Expected: FAIL — `Cannot find module '@/Domain/rng'`.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/rng.ts
/** Seeded PRNG (mulberry32). Deterministic — use for tests and calibration runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/rng.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/Domain/rng.ts src/Domain/rng.test.ts
git commit -m "feat: mulberry32 seeded rng"
```

---

### Task 2: Config do quickSim

**Files:**
- Create: `src/GameEngine/Configs/QuickSimConfig.ts`

Não há lógica nesta task, então não há teste. A Task 3 usa essas constantes.

- [ ] **Step 1: Criar o arquivo**

```ts
// src/GameEngine/Configs/QuickSimConfig.ts
/**
 * QuickSimConfig — tunable constants for the statistical match simulator used by
 * leagues the player is not following. Calibrate with `bun scripts/quicksim-calibrate.ts`.
 */

export type LineGroup = "GK" | "DEF" | "MID" | "FWD";

export const ROLE_GROUP: Record<string, LineGroup> = {
  GK: "GK",
  CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
  CDM: "MID", DM: "MID", CM: "MID", CAM: "MID", AM: "MID", LM: "MID", RM: "MID",
  LW: "FWD", RW: "FWD", ST: "FWD", CF: "FWD",
};

/** Midfield roles that also count toward the attack strength. */
export const ATTACKING_MID_ROLES = ["CAM", "AM", "LM", "RM"] as const;
/** Midfield roles that also count toward the defense strength. */
export const DEFENSIVE_MID_ROLES = ["CDM", "DM"] as const;

export const QUICK_SIM_CONFIG = {
  /** Expected goals for one side when both teams are equal, before home advantage. */
  BASE_GOALS: 1.3,
  HOME_ADVANTAGE: 1.12,
  /** Exponent on (atk × mid) / (def × gk). < 1 compresses mismatches. */
  STRENGTH_EXPONENT: 0.5,
  /** Added to every line strength (0–10 attribute averages) to avoid division by ~0. */
  STRENGTH_FLOOR: 0.5,
  /** Strength multiplier lost at 0 fitness (linear): factor = 1 − FATIGUE_PENALTY × (1 − fitness/100). */
  FATIGUE_PENALTY: 0.3,

  ATTACK_KEYS:     ["finishing", "dribbling", "speed", "acceleration"],
  MIDFIELD_KEYS:   ["passing", "vision", "pressing"],
  DEFENSE_KEYS:    ["tackling", "pressing", "strength", "heading"],
  GOALKEEPER_KEYS: ["reflex", "jump", "pressing"],

  ROLE_GOAL_WEIGHT:   { GK: 0,    DEF: 0.15, MID: 0.5, FWD: 1.5 } as Record<LineGroup, number>,
  ROLE_ASSIST_WEIGHT: { GK: 0.02, DEF: 0.3,  MID: 1.0, FWD: 0.8 } as Record<LineGroup, number>,
  NO_ASSIST_RATE: 0.3,
  /** Non-goal shots per unit of xG. */
  SHOTS_PER_XG: 8,

  PASSES_PER_MATCH:        { GK: 15, DEF: 35, MID: 40, FWD: 20 } as Record<LineGroup, number>,
  PASS_COMPLETION_BASE: 0.6,
  PASS_COMPLETION_SKILL: 0.3,
  TACKLES_PER_MATCH:       { GK: 0, DEF: 2.0, MID: 1.5, FWD: 0.5 } as Record<LineGroup, number>,
  INTERCEPTIONS_PER_MATCH: { GK: 0, DEF: 1.5, MID: 1.0, FWD: 0.3 } as Record<LineGroup, number>,

  /** Energy spent over 90' for an average-stamina player. */
  ENERGY_DRAIN: 35,
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/GameEngine/Configs/QuickSimConfig.ts
git commit -m "feat: QuickSimConfig constants"
```

---

### Task 3: `quickSim.ts`

**Files:**
- Create: `src/Domain/advanceDay/quickSim.ts`
- Test: `src/Domain/advanceDay/quickSim.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
// src/Domain/advanceDay/quickSim.test.ts
import { describe, expect, test } from "bun:test";
import {
  expectedGoals,
  quickSimMatch,
  ratingFromStats,
  samplePoisson,
  teamStrength,
} from "@/Domain/advanceDay/quickSim";
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

  test("distribuição: times iguais com média de 2 a 3,5 gols e mandante vencendo mais", () => {
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
    expect(goals / N).toBeGreaterThan(2);
    expect(goals / N).toBeLessThan(3.5);
    expect(homeWins).toBeGreaterThan(awayWins);
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
});

describe("ratingFromStats", () => {
  test("baseline 6.0 sem ações e gol sobe a nota", () => {
    const zero = { passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0 };
    expect(ratingFromStats(zero)).toBe(6);
    expect(ratingFromStats({ ...zero, goals: 1, shots: 1 })).toBeCloseTo(7.7, 5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/advanceDay/quickSim.test.ts`
Expected: FAIL — `Cannot find module '@/Domain/advanceDay/quickSim'`.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/advanceDay/quickSim.ts
/**
 * quickSim — statistical match resolution for leagues the player is not following.
 * Pure: same inputs + same rng → same output. Produces a PlayedMatchRecording so the
 * normal post-match pipeline (seasonLog, energy, development) applies unchanged.
 */
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MatchPlayerStats, MatchTeamStats } from "@/types/dayLogTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import {
  ATTACKING_MID_ROLES,
  DEFENSIVE_MID_ROLES,
  QUICK_SIM_CONFIG as C,
  ROLE_GROUP,
  type LineGroup,
} from "@/GameEngine/Configs/QuickSimConfig";
import { RATING_WEIGHTS } from "@/GameEngine/Configs/PlayerRatingConfig";

export type Rng = () => number;

export interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
}

export interface QuickSimBreakdown {
  home: TeamStrength;
  away: TeamStrength;
  xgHome: number;
  xgAway: number;
}

export interface QuickSimInput {
  fixtureId: string;
  home: Squad;
  away: Squad;
  homeLineup: string[];
  awayLineup: string[];
}

export interface QuickSimResult {
  recording: PlayedMatchRecording;
  breakdown: QuickSimBreakdown;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function mainRole(p: RosterPlayer): string {
  return p.positions[0] ?? "CM";
}

export function lineGroupOf(p: RosterPlayer): LineGroup {
  return ROLE_GROUP[mainRole(p)] ?? "MID";
}

function stat(p: RosterPlayer, key: string): number {
  return (p.stats as Record<string, number | undefined>)[key] ?? 0;
}

function fitnessFactor(p: RosterPlayer): number {
  const fitness = p.seasonLog?.fitness ?? 100;
  return 1 - C.FATIGUE_PENALTY * (1 - fitness / 100);
}

function lineValue(players: RosterPlayer[], keys: readonly string[], fallback: RosterPlayer[]): number {
  const pool = players.length ? players : fallback;
  return avg(pool.map((p) => avg(keys.map((k) => stat(p, k))) * fitnessFactor(p))) + C.STRENGTH_FLOOR;
}

export function teamStrength(xi: RosterPlayer[]): TeamStrength {
  const outfield = xi.filter((p) => lineGroupOf(p) !== "GK");
  const role = (p: RosterPlayer) => mainRole(p);
  const attackers = xi.filter(
    (p) => lineGroupOf(p) === "FWD" || (ATTACKING_MID_ROLES as readonly string[]).includes(role(p)),
  );
  const mids = xi.filter((p) => lineGroupOf(p) === "MID");
  const defenders = xi.filter(
    (p) => lineGroupOf(p) === "DEF" || (DEFENSIVE_MID_ROLES as readonly string[]).includes(role(p)),
  );
  const keepers = xi.filter((p) => lineGroupOf(p) === "GK");
  return {
    attack: lineValue(attackers, C.ATTACK_KEYS, outfield),
    midfield: lineValue(mids, C.MIDFIELD_KEYS, outfield),
    defense: lineValue(defenders, C.DEFENSE_KEYS, outfield),
    goalkeeper: keepers.length ? lineValue(keepers, C.GOALKEEPER_KEYS, keepers) : C.STRENGTH_FLOOR,
  };
}

export function expectedGoals(attacker: TeamStrength, defender: TeamStrength, isHome: boolean): number {
  const ratio = (attacker.attack * attacker.midfield) / (defender.defense * defender.goalkeeper);
  return C.BASE_GOALS * Math.pow(ratio, C.STRENGTH_EXPONENT) * (isHome ? C.HOME_ADVANTAGE : 1);
}

export function samplePoisson(lambda: number, rng: Rng): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function weightedPick<T>(items: T[], weight: (t: T) => number, rng: Rng): T | null {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function emptyStats(): MatchPlayerStats {
  return {
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0,
  };
}

export function ratingFromStats(s: MatchPlayerStats): number {
  const W = RATING_WEIGHTS;
  const raw =
    W.BASELINE +
    s.goals * W.GOAL +
    s.assists * W.ASSIST +
    s.shots * W.SHOT +
    s.passesCompleted * W.PASS_COMPLETED +
    s.passesFailed * W.PASS_FAILED +
    s.tackles * W.TACKLE_WON +
    s.interceptions * W.INTERCEPTION;
  return Math.round(clamp(raw, 0, 10) * 10) / 10;
}

function resolveXI(squad: Squad, lineup: string[]): RosterPlayer[] {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi: RosterPlayer[] = [];
  for (const id of lineup) {
    const p = id ? byId.get(id) : undefined;
    if (p && !xi.includes(p)) xi.push(p);
  }
  return xi;
}

function fillSide(
  xi: RosterPlayer[],
  goals: number,
  xg: number,
  stats: Record<string, MatchPlayerStats>,
  rng: Rng,
): void {
  const scorerWeight = (p: RosterPlayer) => C.ROLE_GOAL_WEIGHT[lineGroupOf(p)] * (0.5 + stat(p, "finishing"));
  const assistWeight = (p: RosterPlayer) => C.ROLE_ASSIST_WEIGHT[lineGroupOf(p)] * (0.5 + stat(p, "passing"));

  for (let g = 0; g < goals; g++) {
    const scorer = weightedPick(xi, scorerWeight, rng);
    if (!scorer) break;
    stats[scorer.id]!.goals++;
    stats[scorer.id]!.shots++;
    if (rng() >= C.NO_ASSIST_RATE) {
      const assister = weightedPick(xi.filter((p) => p.id !== scorer.id), assistWeight, rng);
      if (assister) stats[assister.id]!.assists++;
    }
  }

  const extraShots = samplePoisson(xg * C.SHOTS_PER_XG, rng);
  for (let i = 0; i < extraShots; i++) {
    const shooter = weightedPick(xi, scorerWeight, rng);
    if (shooter) stats[shooter.id]!.shots++;
  }

  for (const p of xi) {
    const group = lineGroupOf(p);
    const s = stats[p.id]!;
    const attempts = samplePoisson(C.PASSES_PER_MATCH[group], rng);
    const rate = C.PASS_COMPLETION_BASE + C.PASS_COMPLETION_SKILL * (stat(p, "passing") / 10);
    let completed = 0;
    for (let i = 0; i < attempts; i++) if (rng() < rate) completed++;
    s.passesAttempted = attempts;
    s.passesCompleted = completed;
    s.passesFailed = attempts - completed;
    s.tackles = samplePoisson(C.TACKLES_PER_MATCH[group] * (0.5 + stat(p, "tackling") / 10), rng);
    s.interceptions = samplePoisson(C.INTERCEPTIONS_PER_MATCH[group] * (0.5 + stat(p, "pressing") / 10), rng);
  }
}

function sumTeamStats(xi: RosterPlayer[], stats: Record<string, MatchPlayerStats>): MatchTeamStats {
  const t: MatchTeamStats = { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 };
  for (const p of xi) {
    const s = stats[p.id]!;
    t.shots += s.shots;
    t.passesCompleted += s.passesCompleted;
    t.passesAttempted += s.passesAttempted;
    t.tackles += s.tackles;
    t.interceptions += s.interceptions;
  }
  return t;
}

export function quickSimMatch(input: QuickSimInput, rng: Rng = Math.random): QuickSimResult {
  const start = performance.now();
  const homeXI = resolveXI(input.home, input.homeLineup);
  const awayXI = resolveXI(input.away, input.awayLineup);

  const home = teamStrength(homeXI);
  const away = teamStrength(awayXI);
  const xgHome = expectedGoals(home, away, true);
  const xgAway = expectedGoals(away, home, false);
  const goalsHome = samplePoisson(xgHome, rng);
  const goalsAway = samplePoisson(xgAway, rng);

  const playerStats: Record<string, MatchPlayerStats> = {};
  for (const p of [...homeXI, ...awayXI]) playerStats[p.id] = emptyStats();
  fillSide(homeXI, goalsHome, xgHome, playerStats, rng);
  fillSide(awayXI, goalsAway, xgAway, playerStats, rng);

  const playerRatings: Record<string, number> = {};
  const playerEnergy: Record<string, number> = {};
  for (const p of [...homeXI, ...awayXI]) {
    playerRatings[p.id] = ratingFromStats(playerStats[p.id]!);
    const startEnergy = p.seasonLog?.fitness ?? 100;
    const drain = C.ENERGY_DRAIN * (1.2 - 0.4 * (stat(p, "stamina") / 10));
    playerEnergy[p.id] = clamp(startEnergy - drain, 0, 100);
  }

  const recording: PlayedMatchRecording = {
    fixtureId: input.fixtureId,
    score: { home: goalsHome, away: goalsAway },
    teamStats: { home: sumTeamStats(homeXI, playerStats), away: sumTeamStats(awayXI, playerStats) },
    playerStats,
    playerRatings,
    playerEnergy,
    substitutions: [],
    durationMs: Math.round(performance.now() - start),
  };

  return { recording, breakdown: { home, away, xgHome, xgAway } };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/advanceDay/quickSim.test.ts`
Expected: PASS (9 testes). Se o teste "de 2 a 3,5 gols" ou "forte vence" falhar, ajuste `BASE_GOALS` ou `STRENGTH_EXPONENT` em `QuickSimConfig.ts` (não os testes) e registre o valor novo no commit.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/advanceDay/quickSim.ts src/Domain/advanceDay/quickSim.test.ts
git commit -m "feat: quickSim statistical match resolver"
```

---

### Task 4: `resolveSimMode` + `followedLeagues`

**Files:**
- Create: `src/Domain/advanceDay/simMode.ts`
- Test: `src/Domain/advanceDay/simMode.test.ts`
- Modify: `src/backend/SaveService.ts` (interface `SaveMeta`, perto da linha 83)

- [ ] **Step 1: Escrever o teste**

```ts
// src/Domain/advanceDay/simMode.test.ts
import { describe, expect, test } from "bun:test";
import { MAX_FOLLOWED_LEAGUES, resolveSimMode } from "@/Domain/advanceDay/simMode";

describe("resolveSimMode", () => {
  test("liga do jogador é full", () => {
    expect(resolveSimMode("premier_league", { leagueSlug: "premier_league" })).toBe("full");
  });

  test("outras ligas são fast", () => {
    expect(resolveSimMode("la_liga", { leagueSlug: "premier_league" })).toBe("fast");
  });

  test("ligas seguidas são full", () => {
    const meta = { leagueSlug: "premier_league", followedLeagues: ["la_liga"] };
    expect(resolveSimMode("la_liga", meta)).toBe("full");
  });

  test("só as primeiras MAX_FOLLOWED_LEAGUES seguidas contam", () => {
    const meta = { leagueSlug: "x", followedLeagues: ["a", "b", "c", "d"] };
    expect(MAX_FOLLOWED_LEAGUES).toBe(3);
    expect(resolveSimMode("c", meta)).toBe("full");
    expect(resolveSimMode("d", meta)).toBe("fast");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/advanceDay/simMode.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/advanceDay/simMode.ts
export type SimMode = "full" | "fast";

export const MAX_FOLLOWED_LEAGUES = 3;

/**
 * Which engine resolves a league's matches. Derived (never stored) so it can't go stale
 * when the player changes league: own league + up to 3 followed leagues use the full engine.
 */
export function resolveSimMode(
  leagueSlug: string,
  meta: { leagueSlug: string; followedLeagues?: string[] },
): SimMode {
  if (leagueSlug === meta.leagueSlug) return "full";
  const followed = (meta.followedLeagues ?? []).slice(0, MAX_FOLLOWED_LEAGUES);
  return followed.includes(leagueSlug) ? "full" : "fast";
}
```

Em `src/backend/SaveService.ts`, dentro de `interface SaveMeta`, logo depois de `activeLeagues?: LeagueSeasonState[];`, adicione:

```ts
  /** Leagues (besides the player's own) resolved by the full engine. Max 3 — see simMode.ts. */
  followedLeagues?: string[];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/advanceDay/simMode.test.ts && bun run typecheck`
Expected: PASS (4 testes), typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/advanceDay/simMode.ts src/Domain/advanceDay/simMode.test.ts src/backend/SaveService.ts
git commit -m "feat: resolveSimMode + SaveMeta.followedLeagues"
```

---

### Task 5: `buildQuickMatchEvent` + evento compacto

**Files:**
- Modify: `src/types/dayLogTypes.ts` (interface `MatchEvent`, linhas 50-71)
- Modify: `src/Domain/advanceDay/matches.ts` (adicionar no final)
- Test: `src/Domain/advanceDay/matches.quick.test.ts`

- [ ] **Step 1: Escrever o teste**

```ts
// src/Domain/advanceDay/matches.quick.test.ts
import { describe, expect, test } from "bun:test";
import { buildQuickMatchEvent } from "@/Domain/advanceDay/matches";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];

function makeSquad(id: string): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}-p${i}`, name: `${id}${i}`, age: 25, squadId: id, preferredFoot: "right",
    positions: [role],
    stats: {
      passing: 4, vision: 4, finishing: 4, dribbling: 4, speed: 4, acceleration: 4,
      tackling: 4, pressing: 4, stamina: 4, heading: 4, strength: 4, reflex: 4, jump: 4,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

describe("buildQuickMatchEvent", () => {
  test("gera evento compacto e atualiza seasonLog dos escalados", () => {
    const home = makeSquad("h");
    const away = makeSquad("a");
    const fixture = { id: "fx1", competition: "la_liga", round: 1, home: "h", away: "a" } as Fixture;
    const sim = { homeLineup: home.players.map((p) => p.id), awayLineup: away.players.map((p) => p.id) };

    const r = buildQuickMatchEvent(fixture, home, away, sim, mulberry32(11));

    expect(r.event.compact).toBe(true);
    expect(r.event.playerStats).toEqual({});
    expect(r.event.playerRatings).toEqual({});
    expect(r.event.developmentChanges).toEqual([]);
    expect(r.event.fixtureId).toBe("fx1");
    const scorerGoals = r.event.scorers.reduce((acc, s) => acc + s.goals, 0);
    expect(scorerGoals).toBe(r.event.score.home + r.event.score.away);
    for (const p of r.updatedHome.players) expect(p.seasonLog!.appearances).toBe(1);
  });
});
```

Confira se `Fixture` tem mais campos obrigatórios (`src/types/calendarTypes.ts`). O `as Fixture` cobre o teste; não adicione campos à mão.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/advanceDay/matches.quick.test.ts`
Expected: FAIL — `buildQuickMatchEvent` não exportado.

- [ ] **Step 3: Implementar**

Em `src/types/dayLogTypes.ts`, dentro de `interface MatchEvent`, depois de `durationMs: number;`:

```ts
  /**
   * true when resolved by quickSim (league not followed): playerStats / playerRatings /
   * developmentChanges are empty to keep the day log small. UI must not expect player rows.
   */
  compact?: true;
```

No final de `src/Domain/advanceDay/matches.ts`:

```ts
import { quickSimMatch, type Rng } from "@/Domain/advanceDay/quickSim";

/** Drops per-player detail from a match event (quickSim leagues) — scorers and team stats stay. */
export function compactMatchEvent(event: MatchEvent): MatchEvent {
  return {
    ...event,
    playerStats: {},
    playerRatings: {},
    playerNames: Object.fromEntries(event.scorers.map((s) => [s.playerId, s.playerName])),
    playerTeams: Object.fromEntries(event.scorers.map((s) => [s.playerId, s.team])),
    developmentChanges: [],
    compact: true,
  };
}

/** Resolve a fixture with quickSim; squads still get seasonLog/energy/development updates. */
export function buildQuickMatchEvent(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  sim: { homeLineup: string[]; awayLineup: string[] },
  rng: Rng = Math.random,
): MatchSimResult {
  const { recording } = quickSimMatch(
    {
      fixtureId: fixture.id,
      home: homeSquad,
      away: awaySquad,
      homeLineup: sim.homeLineup,
      awayLineup: sim.awayLineup,
    },
    rng,
  );
  const r = buildMatchEventFromRecording(fixture, homeSquad, awaySquad, recording);
  return { ...r, event: compactMatchEvent(r.event) };
}
```

Mova o `import` novo para o bloco de imports no topo do arquivo, junto dos outros. Aqui ele só aparece perto do código por clareza.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/advanceDay/ && bun run typecheck`
Expected: PASS em todos os testes da pasta, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/types/dayLogTypes.ts src/Domain/advanceDay/matches.ts src/Domain/advanceDay/matches.quick.test.ts
git commit -m "feat: buildQuickMatchEvent with compact day-log event"
```

---

### Task 6: Ligar o modo `fast` no `advanceDay`

**Files:**
- Modify: `src/backend/advanceDay.ts` (ramo `else` do loop de partidas, perto das linhas 220-231)

- [ ] **Step 1: Trocar o ramo `else`**

Adicione aos imports de `src/backend/advanceDay.ts`:

```ts
import { resolveSimMode } from "@/Domain/advanceDay/simMode";
import { buildQuickMatchEvent } from "@/Domain/advanceDay/matches";
```

(Se `matches.ts` já é importado ali, acrescente `buildQuickMatchEvent` ao mesmo `import`.)

Troque o bloco atual:

```ts
          } else {
            const sim = computeMatchSimulationLineups(fixture, homeSquad, awaySquad, playerSquadId, tactics);
            const r = buildMatchEvent(fixture, homeSquad, awaySquad, sim);
```

por:

```ts
          } else {
            const sim = computeMatchSimulationLineups(fixture, homeSquad, awaySquad, playerSquadId, tactics);
            const userPlays = fixture.home === playerSquadId || fixture.away === playerSquadId;
            const mode = userPlays ? "full" : resolveSimMode(leagueSlug, meta);
            const r = mode === "full"
              ? buildMatchEvent(fixture, homeSquad, awaySquad, sim)
              : buildQuickMatchEvent(fixture, homeSquad, awaySquad, sim);
```

O resto do bloco (`dayEvents.push`, `squadWrites`, `teamsPlayingToday`, `updatedFixtures`) continua como está.

- [ ] **Step 2: Typecheck + suíte**

Run: `bun run typecheck && bun test`
Expected: sem erros, mesmo número de testes passando da Task 0 mais os novos.

- [ ] **Step 3: Teste manual**

Run: `bun run dev`. No navegador, crie uma carreira na Premier League e avance até o primeiro dia de rodada.
Expected: as outras ligas têm placares na Classificação. O `Continuar` fica visivelmente mais rápido que antes nos dias em que várias ligas jogam.

- [ ] **Step 4: Commit**

```bash
git add src/backend/advanceDay.ts
git commit -m "feat: resolve non-followed leagues with quickSim in advanceDay"
```

---

### Task 7: Telas lidam com evento compacto

**Files:**
- Modify: `src/GameInterface/LeagueTableScreen.tsx` (bloco "Player stats", perto das linhas 442-452)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json` (objeto `"leagues"`)

- [ ] **Step 1: Chaves de i18n**

Em `en.json`, dentro do objeto `"leagues"`:

```json
"quickSimNoDetail": "Player detail unavailable — this league is simulated. Follow it in Settings to get full match data."
```

Em `pt-BR.json`, dentro do objeto `"leagues"`:

```json
"quickSimNoDetail": "Detalhe dos jogadores indisponível — esta liga é simulada. Siga a liga nas Configurações para ter os dados completos da partida."
```

- [ ] **Step 2: Condicional na tela**

Em `LeagueTableScreen.tsx`, envolva o bloco `{/* Player stats */}` (a `div` com `grid grid-cols-2 gap-4`) assim:

```tsx
          {/* Player stats */}
          {event.compact ? (
            <p className="text-xs text-white/40 m-0">{t("leagues.quickSimNoDetail")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 pl-3">{homeName}</p>
                <PlayerTable players={homePlayers} side="home" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 pl-3">{awayName}</p>
                <PlayerTable players={awayPlayers} side="away" />
              </div>
            </div>
          )}
```

`DaySummaryModal` e `MatchResultScreen` só mostram partidas do clube do jogador, que são sempre `full`, então não precisam mudar.

- [ ] **Step 3: Checar**

Run: `bun run typecheck && bun run i18n:lint`
Expected: sem erros e sem chave faltando.

Manual: na Classificação de uma liga não seguida, abra o detalhe de um jogo. Expected: placar e barras de estatística do time aparecem, e a tabela de jogadores é trocada pela mensagem.

- [ ] **Step 4: Commit**

```bash
git add src/GameInterface/LeagueTableScreen.tsx src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat: league table shows notice for quickSim matches"
```

---

### Task 8: `/lab` — escolher o motor

**Files:**
- Modify: `src/lab/types.ts` (`BalanceScenario`, `WorkerInput`)
- Modify: `src/lab/balanceWorker.ts`
- Modify: `src/lab/scenarioRunner.ts:283`
- Modify: `src/lab/components/ScenarioBuilder.tsx`
- Modify: `src/lab/components/ResultsViewer.tsx`

- [ ] **Step 1: Tipos**

Em `src/lab/types.ts`:

```ts
export type SimEngine = "full" | "quick";
```

Adicione `simEngine?: SimEngine;` em `BalanceScenario` (depois de `matchesPerPair`) e em `WorkerInput` (depois de `matches`). Quando o campo está ausente, vale `"full"`.

- [ ] **Step 2: Worker**

Em `src/lab/balanceWorker.ts`, adicione aos imports:

```ts
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
```

Leia `simEngine` junto dos outros campos: `const { variantA, variantB, matches, simEngine = "full" } = e.data;`

Dentro do `for`, antes de `const r = simulateMatch(...)`, adicione:

```ts
      if (simEngine === "quick") {
        const q = quickSimMatch({
          fixtureId: `lab-${m}`,
          home: squadA,
          away: squadB,
          homeLineup: autoLineupDefaultFormation(squadA),
          awayLineup: autoLineupDefaultFormation(squadB),
        });
        const hA = q.recording.teamStats.home;
        const hB = q.recording.teamStats.away;
        const assists = (prefix: string) =>
          Object.entries(q.recording.playerStats)
            .filter(([id]) => squadIdOf(prefix, id))
            .reduce((acc, [, s]) => acc + s.assists, 0);
        teamA.goals += q.recording.score.home;   teamB.goals += q.recording.score.away;
        teamA.shots += hA.shots;                 teamB.shots += hB.shots;
        teamA.xg    += q.breakdown.xgHome;       teamB.xg    += q.breakdown.xgAway;
        teamA.assists += assists("A");           teamB.assists += assists("B");
        teamA.passesAttempted += hA.passesAttempted; teamB.passesAttempted += hB.passesAttempted;
        teamA.passesCompleted += hA.passesCompleted; teamB.passesCompleted += hB.passesCompleted;
        teamA.passesFailed += hA.passesAttempted - hA.passesCompleted;
        teamB.passesFailed += hB.passesAttempted - hB.passesCompleted;
        teamA.tackles += hA.tackles;             teamB.tackles += hB.tackles;
        teamA.interceptions += hA.interceptions; teamB.interceptions += hB.interceptions;
        if (q.recording.score.home > q.recording.score.away) teamA.wins++;
        else if (q.recording.score.away > q.recording.score.home) teamB.wins++;
        else draws++;
        if ((m + 1) % 10 === 0 || m + 1 === matches) {
          postMessage({ type: "progress", variantAId: variantA.id, variantBId: variantB.id, done: m + 1, total: matches });
        }
        continue;
      }
```

No quickSim, dribles, through balls, loose balls e switch plays ficam em 0 porque ele não modela esses lances.

Os dois elencos do lab usam os mesmos ids de jogador (`p0`…`p19`). Por isso a atribuição de assistências precisa saber de que lado vem cada id. Antes do loop, torne os ids únicos:

```ts
    const squadA = prefixIds(buildSquad(variantA.squad, variantA.label), "A");
    const squadB = prefixIds(buildSquad(variantB.squad, variantB.label), "B");
```

E defina estes dois helpers no arquivo, acima de `self.onmessage`:

```ts
function prefixIds(squad: Squad, side: "A" | "B"): Squad {
  return { ...squad, players: squad.players.map((p) => ({ ...p, id: `${side}-${p.id}` })) };
}

function squadIdOf(side: "A" | "B", playerId: string): boolean {
  return playerId.startsWith(`${side}-`);
}
```

O motor completo mapeia jogadores pelo nome, então os ids prefixados não o afetam.

- [ ] **Step 3: Runner**

Em `src/lab/scenarioRunner.ts:283`, troque:

```ts
      { variantA: p.variantA, variantB: p.variantB, matches: scenario.matchesPerPair },
```

por:

```ts
      { variantA: p.variantA, variantB: p.variantB, matches: scenario.matchesPerPair, simEngine: scenario.simEngine ?? "full" },
```

- [ ] **Step 4: ScenarioBuilder**

Em `src/lab/components/ScenarioBuilder.tsx`, perto do estado de `matchesPerPair` (linha 26):

```tsx
  const [simEngine, setSimEngine] = useState<"full" | "quick">(draft?.simEngine ?? "full");
```

Ao lado do input de partidas por par (perto da linha 139):

```tsx
            <select
              value={simEngine}
              onChange={(e) => setSimEngine(e.target.value as "full" | "quick")}
              className="bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-sm"
            >
              <option value="full">Motor completo</option>
              <option value="quick">quickSim</option>
            </select>
```

No objeto do cenário salvo (perto da linha 182, onde está `matchesPerPair,`), adicione `simEngine,`.

- [ ] **Step 5: ResultsViewer**

Em `src/lab/components/ResultsViewer.tsx`, ao lado do nome do cenário, mostre um selo quando `result.scenario.simEngine === "quick"`:

```tsx
{result.scenario.simEngine === "quick" && (
  <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40 border border-white/10 rounded px-1.5 py-0.5">quickSim</span>
)}
```

Confira o nome real da variável do resultado no componente (por exemplo, `result`) e ajuste. O campo vem de `ScenarioResult.scenario` (`lab/types.ts:194`). Se `ScenarioResult` não guardar o cenário, use o `scenario` que o componente já recebe.

- [ ] **Step 6: Checar**

Run: `bun run typecheck`, depois `bun run lab`. Crie um cenário com duas variantes e rode duas vezes: uma com "Motor completo" e outra com "quickSim".
Expected: os dois rodam, e o quickSim termina em uma fração do tempo. Compare gols/jogo e vitórias em `SummaryBars`.

- [ ] **Step 7: Commit**

```bash
git add src/lab
git commit -m "feat(lab): choose full engine or quickSim per scenario"
```

---

### Task 9: `/test` — painel do quickSim

**Files:**
- Create: `src/GameInterface/QuickSimPanel.tsx`
- Modify: `src/GameInterface/TestScreen.tsx` (antes do comentário `{/* ── Pitch row: Team A | Pitch | Team B ── */}`, perto da linha 1099)

- [ ] **Step 1: Criar o painel**

```tsx
// src/GameInterface/QuickSimPanel.tsx
import { useState } from "react";
import { quickSimMatch, type QuickSimResult } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import playersJson from "@/Data/players.json";

function squadFrom(squadId: string, name: string): Squad {
  const players = (playersJson as RosterPlayer[])
    .filter((p) => p.squadId === squadId)
    .map((p) => ({ ...p, seasonLog: emptySeasonLog() }));
  return { id: squadId, name, colors: ["#3b82f6", "#ffffff"], money: 0, players };
}

const HOME = squadFrom("team_red", "Red");
const AWAY = squadFrom("team_blue", "Blue");

function runOnce(): QuickSimResult {
  return quickSimMatch({
    fixtureId: "test",
    home: HOME,
    away: AWAY,
    homeLineup: autoLineupDefaultFormation(HOME),
    awayLineup: autoLineupDefaultFormation(AWAY),
  });
}

interface Batch { n: number; goals: number; home: number; draw: number; away: number }

export function QuickSimPanel() {
  const [last, setLast] = useState<QuickSimResult | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);

  function runBatch(n: number) {
    const b: Batch = { n, goals: 0, home: 0, draw: 0, away: 0 };
    for (let i = 0; i < n; i++) {
      const { score } = runOnce().recording;
      b.goals += score.home + score.away;
      if (score.home > score.away) b.home++;
      else if (score.away > score.home) b.away++;
      else b.draw++;
    }
    setBatch(b);
  }

  const row = (label: string, h: number, a: number) => (
    <div key={label} className="flex justify-between text-xs tabular-nums">
      <span className="text-white/70">{h.toFixed(2)}</span>
      <span className="text-white/40">{label}</span>
      <span className="text-white/70">{a.toFixed(2)}</span>
    </div>
  );

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-3 space-y-2 max-w-md">
      <div className="flex gap-2">
        <button className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10" onClick={() => setLast(runOnce())}>
          Simular 1
        </button>
        <button className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10" onClick={() => runBatch(500)}>
          Simular 500
        </button>
      </div>
      {last && (
        <div className="space-y-1">
          <div className="text-sm font-bold text-center">
            {HOME.name} {last.recording.score.home} × {last.recording.score.away} {AWAY.name}
          </div>
          {row("Ataque", last.breakdown.home.attack, last.breakdown.away.attack)}
          {row("Meio", last.breakdown.home.midfield, last.breakdown.away.midfield)}
          {row("Defesa", last.breakdown.home.defense, last.breakdown.away.defense)}
          {row("Goleiro", last.breakdown.home.goalkeeper, last.breakdown.away.goalkeeper)}
          {row("xG", last.breakdown.xgHome, last.breakdown.xgAway)}
        </div>
      )}
      {batch && (
        <div className="text-xs text-white/70 tabular-nums">
          {batch.n} jogos · {(batch.goals / batch.n).toFixed(2)} gols/jogo · casa {((batch.home / batch.n) * 100).toFixed(0)}% ·
          empate {((batch.draw / batch.n) * 100).toFixed(0)}% · fora {((batch.away / batch.n) * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montar no TestScreen**

Em `TestScreen.tsx`, importe `import { QuickSimPanel } from "@/GameInterface/QuickSimPanel";`. Junto dos outros `useState` do componente, adicione:

```tsx
  const [quickSimOpen, setQuickSimOpen] = useState(false);
```

Antes do comentário `{/* ── Pitch row: Team A | Pitch | Team B ── */}`:

```tsx
      <div>
        <button
          className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10"
          onClick={() => setQuickSimOpen((o) => !o)}
        >
          QuickSim
        </button>
        {quickSimOpen && <div className="mt-2"><QuickSimPanel /></div>}
      </div>
```

- [ ] **Step 3: Checar**

Run: `bun run typecheck`, depois `bun run dev` e abra `/test`. Clique em "QuickSim", depois em "Simular 1" e em "Simular 500".
Expected: as forças por setor, o xG e o placar aparecem. No lote de 500, os gols por jogo ficam entre 2 e 3,5.

- [ ] **Step 4: Commit**

```bash
git add src/GameInterface/QuickSimPanel.tsx src/GameInterface/TestScreen.tsx
git commit -m "feat(test): quickSim breakdown panel"
```

---

### Task 10: Script de calibração

**Files:**
- Create: `scripts/quicksim-calibrate.ts`

- [ ] **Step 1: Criar o script**

```ts
// scripts/quicksim-calibrate.ts
/**
 * Compares quickSim with the full engine on real squads.
 * Usage: bun scripts/quicksim-calibrate.ts [league=premier_league] [pairs=40] [repeats=5]
 * Goal (spec): quickSim within ±10% of the engine on goals/match, home-win % and draw %.
 */
import { readdir } from "node:fs/promises";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";

const league = process.argv[2] ?? "premier_league";
const PAIRS = Number(process.argv[3] ?? 40);
const REPEATS = Number(process.argv[4] ?? 5);
const dir = new URL(`../src/example_data/squads/${league}/`, import.meta.url).pathname;

const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
const squads: Squad[] = await Promise.all(
  files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: emptySeasonLog() })) };
  }),
);

const rng = mulberry32(2026);
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
type Acc = { n: number; goals: number; home: number; draw: number; ms: number };
const full: Acc = { n: 0, goals: 0, home: 0, draw: 0, ms: 0 };
const quick: Acc = { n: 0, goals: 0, home: 0, draw: 0, ms: 0 };

function add(acc: Acc, h: number, a: number, ms: number) {
  acc.n++;
  acc.goals += h + a;
  if (h > a) acc.home++;
  else if (h === a) acc.draw++;
  acc.ms += ms;
}

for (let i = 0; i < PAIRS; i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  const hl = autoLineupDefaultFormation(home);
  const al = autoLineupDefaultFormation(away);
  for (let r = 0; r < REPEATS; r++) {
    let t = performance.now();
    const f = simulateMatch(home, away, formation, formation, hl, al);
    add(full, f.score.A, f.score.B, performance.now() - t);
    t = performance.now();
    const q = quickSimMatch({ fixtureId: "c", home, away, homeLineup: hl, awayLineup: al }, rng);
    add(quick, q.recording.score.home, q.recording.score.away, performance.now() - t);
  }
}

const fmt = (a: Acc) => ({
  "gols/jogo": +(a.goals / a.n).toFixed(2),
  "casa %": +((a.home / a.n) * 100).toFixed(1),
  "empate %": +((a.draw / a.n) * 100).toFixed(1),
  "ms/jogo": +(a.ms / a.n).toFixed(2),
});
const F = fmt(full);
const Q = fmt(quick);
console.table({ motor: F, quickSim: Q });
const within = (q: number, f: number) => Math.abs(q - f) <= Math.abs(f) * 0.1;
console.log("dentro de ±10%:", {
  gols: within(Q["gols/jogo"], F["gols/jogo"]),
  casa: within(Q["casa %"], F["casa %"]),
  empate: within(Q["empate %"], F["empate %"]),
});
```

- [ ] **Step 2: Rodar e calibrar**

Run: `bun scripts/quicksim-calibrate.ts premier_league 40 5`
Expected: uma tabela com as duas linhas e um objeto com três booleanos.

Se algum ficar `false`, ajuste só em `QuickSimConfig.ts`:
- gols/jogo fora → `BASE_GOALS`;
- casa % fora → `HOME_ADVANTAGE`;
- empate % alto demais → aumente `STRENGTH_EXPONENT` (os resultados ficam mais decididos);
- empate % baixo demais → reduza `STRENGTH_EXPONENT`.

Repita até os três ficarem `true`, depois rode também com `brazil_serie_a` e confirme. Rode `bun test src/Domain/advanceDay/quickSim.test.ts` de novo: os testes de faixa precisam continuar passando.

Anote o `ms/jogo` do motor e do quickSim. Esse número vai para o plano 2, para dimensionar o custo de 80 ligas.

- [ ] **Step 3: Commit**

```bash
git add scripts/quicksim-calibrate.ts src/GameEngine/Configs/QuickSimConfig.ts
git commit -m "feat: quickSim calibration script + calibrated constants"
```

---

### Task 11: Docs e spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-open-world-database-design.md` (seção "Modo por liga")
- Modify: `.claude/rules/non-player-games.md` (adicionar uma seção no final)

- [ ] **Step 1: Atualizar o spec**

Substitua os três bullets de "### Modo por liga" por:

```markdown
- O modo é **derivado** por `resolveSimMode(leagueSlug, meta)` (`src/Domain/advanceDay/simMode.ts`), nunca gravado.
- É `full` a liga do clube do jogador e as primeiras 3 ligas de `meta.followedLeagues`. As outras são `fast`.
- Jogos do clube do jogador são sempre `full`.
```

- [ ] **Step 2: Documentar nas regras**

No final de `.claude/rules/non-player-games.md`:

```markdown
---

## quickSim (ligas não seguidas)

Ligas que o jogador não acompanha não rodam o motor tick a tick. `quickSimMatch`
(`src/Domain/advanceDay/quickSim.ts`) resolve a partida por força de setor + Poisson e devolve um
`PlayedMatchRecording`. O pós-jogo (seasonLog, energia, desenvolvimento) é o mesmo do motor.

- Modo: `resolveSimMode` (`simMode.ts`). Liga do jogador + até 3 `followedLeagues` = `full`.
- Log do dia: eventos `compact: true` (sem estatísticas por jogador).
- Constantes: `QuickSimConfig.ts`. Calibrar com `bun scripts/quicksim-calibrate.ts` (meta: ±10% do motor).
- `/lab`: escolha "quickSim" no ScenarioBuilder. `/test`: botão "QuickSim".
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-23-open-world-database-design.md .claude/rules/non-player-games.md
git commit -m "docs: quickSim in rules + spec sim mode is derived"
```

---

## Verificação final

- [ ] `bun run typecheck`: sem erros.
- [ ] `bun test`: tudo passa (contagem da Task 0 + ~17 testes novos).
- [ ] `bun scripts/quicksim-calibrate.ts`: os três critérios `true`.
- [ ] Manual: carreira nova, avançar 1 semana, abrir a Classificação de outra liga e ver o aviso de liga simulada.
