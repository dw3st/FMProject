# Copas — Plano 1: correções do #5 + motor de mata-mata (prorrogação e pênaltis)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar o issue #5 e dar ao motor, ao quickSim, ao `/test` e ao `/lab` partidas de mata-mata
que nunca terminam empatadas (prorrogação 2 × 15 + disputa de pênaltis).

**Architecture:** uma função pura `resolvePenaltyShootout` (usada pelo motor e pelo quickSim); o
motor ganha quatro fases (`extraTimeBreak`, `extraTimeFirst`, `extraTimeSecond`, `penalties`) só
quando `state.knockout === true`; a transição de período vira uma função exportada
`endCurrentPeriod` (usada pelo relógio e pelo `/test`). Ligas não mudam de comportamento.

**Tech Stack:** Bun, TypeScript, `bun:test`, React 19 + Tailwind, i18next.

Spec: `docs/superpowers/specs/2026-09-26-national-cups-design.md` (seções 2 e 4).
Branch: `feat/national-cups`. Regras do projeto: imports sempre com `@/`; Tailwind (sem `style={{}}`
exceto cores dinâmicas); ícones só via `Icons.tsx`; commits terminam com
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Nunca** mate todos os processos `bun` (o servidor MCP do projeto é bun) e não apague arquivos que você
não criou.

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `scripts/importOpenFootball.ts` | guarda de `roles.json` (#5) |
| `.claude/rules/data/espn-import.md` | cadeia sincroniza `src/Data` antes do primeiro passo |
| `src/backend/reports.ts` (+ teste) | media type exato, data real (#5) |
| `src/GameEngine/Configs/PenaltyConfig.ts` | **novo** — constantes dos pênaltis |
| `src/GameEngine/Infrastructure/PenaltyShootout.ts` (+ teste) | **novo** — `resolvePenaltyShootout` puro |
| `src/GameEngine/types.ts` | fases novas, `ShootoutState`, `KnockoutDecider`, campos opcionais do `GameState` |
| `src/types/calendarTypes.ts` | `MatchDecider` (home/away) |
| `src/GameEngine/Infrastructure/EventBus.ts` | eventos `extraTimeStart`, `penaltyKick`, `shootoutEnd`; `matchEnd.decider`; `triggerPhase: 'endPeriod'` |
| `src/GameEngine/Domain/gameState.ts` | `endCurrentPeriod`, `knockoutDecider`, `matchMinute`, `switchSides` genérico, fases novas no `tickState` |
| `src/GameEngine/Domain/knockout.test.ts` | **novo** — testes de transição de período |
| `src/GameEngine/Domain/AiSubstitution.ts` | substituições também na prorrogação |
| `src/GameEngine/Domain/Statistics.ts` | `penaltiesTaken/Scored` por jogador; `extraTimePlayed`, `shootoutsWon` por time |
| `src/GameEngine/Domain/SimulateMatch.ts` (+ teste) | opção `knockout`, `MatchResult.decider` |
| `src/Domain/advanceDay/matches.ts` | `PlayedMatchRecording.decider?` |
| `src/Domain/advanceDay/quickSim.ts` (+ teste) | `input.knockout`: prorrogação + pênaltis |
| `src/GameInterface/buildPlayedMatchRecording.ts` | copia o `decider` |
| `src/GameInterface/ScoreBar.tsx`, `MatchOverlay.tsx`, `MatchScreen.tsx`, `StatsPanel.tsx` | relógio da prorrogação, overlay, faixa de pênaltis |
| `src/GameInterface/Components/PenaltyShootoutStrip.tsx` | **novo** — bolinhas por cobrança |
| `src/GameEngine/Support/TestCases.ts`, `src/GameInterface/TestScreen.tsx`, `src/GraficsEngine/PixiPitch.tsx`, `src/GameInterface/QuickSimPanel.tsx` | superfícies do `/test` |
| `src/lab/types.ts`, `balanceWorker.ts`, `scenarioRunner.ts`, `components/PairDetail.tsx`, `components/ScenarioBuilder.tsx` | superfícies do `/lab` |
| `src/i18n/locales/en.json`, `pt-BR.json` | textos |
| `.claude/rules/match-flow.md`, `.claude/rules/game-engine/shot-and-save.md` | documentação |

---

### Task 1: #5 — `importOpenFootball` recusa `roles.json` fora de sincronia

**Files:**
- Modify: `scripts/importOpenFootball.ts` (logo depois de `const SOURCE = "open-football";`, ~linha 47)
- Modify: `.claude/rules/data/espn-import.md` (seção "Regenerar")

- [ ] **Step 1: Adicionar a guarda**

Logo depois da linha `const SOURCE = "open-football";` insira:

```ts
// ── Precondition: the recalibration reads attribute weights from src/Data/roles.json (via
// Player.ts and ROLES_JSON). src/Data is gitignored, so a stale or locally tuned copy would
// silently change the recalibrated world. Same check as scripts/importEspn.ts.
{
  const runtimeRoles = join(ROOT, "src", "Data", "roles.json");
  if (!existsSync(runtimeRoles) || readFileSync(runtimeRoles, "utf-8") !== readFileSync(join(DATA, "roles.json"), "utf-8"))
    throw new Error("src/Data/roles.json is out of sync — run cp -R src/example_data/. src/Data/ first");
}
```

(`existsSync`, `readFileSync`, `join`, `ROOT` e `DATA` já estão importados/definidos no arquivo.)

- [ ] **Step 2: Conferir que roda com os arquivos sincronizados**

Run: `cmp src/Data/roles.json src/example_data/roles.json && echo SAME`
Expected: `SAME`.

**Não** rode o importador aqui — ele regrava o mundo inteiro. Só cheque os tipos:
Run: `bunx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Atualizar a doc da cadeia**

Em `.claude/rules/data/espn-import.md`, no bloco "Regenerar", troque a primeira linha de comando por:

```bash
bun scripts/fetchEspn.ts            # único passo com rede (curl) — atualiza o snapshot
cp src/example_data/roles.json src/Data/roles.json   # os dois importadores recusam roles.json fora de sincronia
bun scripts/importOpenFootball.ts   # mundo base a partir de data_process/native + data_process/openfootball
```

e no parágrafo seguinte troque "`importEspn` recusa rodar se" por "`importOpenFootball` e `importEspn`
recusam rodar se".

- [ ] **Step 4: Commit**

```bash
git add scripts/importOpenFootball.ts .claude/rules/data/espn-import.md
git commit -m "fix(import): importOpenFootball refuses an out-of-sync src/Data/roles.json (#5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: #5 — reports: media type exato e data real

**Files:**
- Modify: `src/backend/reports.ts` (~linhas 20, 126-131, 154-157)
- Test: `src/backend/reports.test.ts`

- [ ] **Step 1: Testes que falham**

No `describe` onde estão os testes de `gameDate` e `415` em `src/backend/reports.test.ts`, adicione
(use os helpers `postReport`, `postRaw`, `handler`, `token`, `VALID_BODY` que já existem no arquivo):

```ts
  test("rejects an impossible gameDate", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate: "2027-02-30" }));
    expect(res.status).toBe(400);
  });

  test("415 when application/json only appears as a parameter", async () => {
    const req = postRaw(token, { "content-type": "text/plain; x=application/json" }, JSON.stringify(VALID_BODY));
    const res = await handler()(req);
    expect(res.status).toBe(415);
  });

  test("accepts application/json with a charset parameter", async () => {
    const req = postRaw(token, { "content-type": "Application/JSON; charset=utf-8" }, JSON.stringify(VALID_BODY));
    const res = await handler()(req);
    expect(res.status).toBe(201);
  });
```

Antes, confira no arquivo qual status o caminho feliz devolve (procure `toBe(201)` ou `toBe(200)` no
teste de sucesso existente) e use o mesmo no terceiro teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/reports.test.ts`
Expected: FAIL nos dois primeiros testes novos.

- [ ] **Step 3: Implementar**

Em `src/backend/reports.ts`, logo abaixo de `const GAME_DATE_RE = ...`:

```ts
/** True for a real calendar date in YYYY-MM-DD (rejects 2027-02-30, 2027-13-01…). */
function isRealDate(s: string): boolean {
  if (!GAME_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
```

Troque `if (!GAME_DATE_RE.test(trimmed)) {` por `if (!isRealDate(trimmed)) {`.

Troque a checagem de content type:

```ts
    const contentType = req.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
    if (mediaType !== "application/json") {
      return Response.json({ error: "unsupported content type" }, { status: 415 });
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/reports.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/backend/reports.ts src/backend/reports.test.ts
git commit -m "fix(reports): exact media type and real-date gameDate (#5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `resolvePenaltyShootout` (puro)

**Files:**
- Create: `src/GameEngine/Configs/PenaltyConfig.ts`
- Create: `src/GameEngine/Infrastructure/PenaltyShootout.ts`
- Test: `src/GameEngine/Infrastructure/PenaltyShootout.test.ts`

- [ ] **Step 1: Config**

`src/GameEngine/Configs/PenaltyConfig.ts`:

```ts
/**
 * Penalty shootout tuning. `BASE` is calibrated so two average sides (accuracy 0.5,
 * keeper reflex/diving 0.5) convert ~75% — close to the real-world rate.
 */
export const PENALTY_CONFIG = {
  /** Kicks per side before sudden death. */
  ROUNDS: 5,
  /** Safety cap on sudden-death rounds; after it the winner is a coin flip. */
  MAX_SUDDEN_DEATH_ROUNDS: 30,
  BASE: 0.85,
  /** Shooter multiplier range, mapped linearly from shootAccuracy 0..0.95. */
  SHOOTER_MIN: 0.85,
  SHOOTER_MAX: 1.15,
  /** Keeper multiplier = 1 − avg(reflex, diving) × GK_WEIGHT (0.75..1). */
  GK_WEIGHT: 0.25,
  MIN_CHANCE: 0.55,
  MAX_CHANCE: 0.92,
} as const;
```

- [ ] **Step 2: Testes que falham**

`src/GameEngine/Infrastructure/PenaltyShootout.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mulberry32 } from "@/Domain/rng";
import {
  penaltyChance,
  resolvePenaltyShootout,
  type PenaltySide,
} from "@/GameEngine/Infrastructure/PenaltyShootout";

function side(prefix: string, accuracy: number, keeperSkill: number): PenaltySide<string> {
  const takers = Array.from({ length: 10 }, (_, i) => ({ id: `${prefix}${i}`, accuracy, isGK: false }));
  takers.push({ id: `${prefix}gk`, accuracy: 0, isGK: true });
  return { takers, keeper: { id: `${prefix}gk`, reflex: keeperSkill, diving: keeperSkill } };
}

describe("penaltyChance", () => {
  test("average shooter vs average keeper is ~75%", () => {
    const c = penaltyChance(0.5, { id: "k", reflex: 0.5, diving: 0.5 });
    expect(c).toBeGreaterThan(0.72);
    expect(c).toBeLessThan(0.78);
  });
  test("is clamped", () => {
    expect(penaltyChance(0.95, null)).toBeLessThanOrEqual(0.92);
    expect(penaltyChance(0, { id: "k", reflex: 1, diving: 1 })).toBeGreaterThanOrEqual(0.55);
  });
});

describe("resolvePenaltyShootout", () => {
  test("always produces a winner and a non-tied score", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), rng);
      expect(r.score.A).not.toBe(r.score.B);
      expect(r.winner).toBe(r.score.A > r.score.B ? "A" : "B");
    }
  });

  test("kicks alternate A, B, A, B… and the score matches the kicks", () => {
    const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), mulberry32(3));
    r.kicks.forEach((k, i) => expect(k.team).toBe(i % 2 === 0 ? "A" : "B"));
    const a = r.kicks.filter((k) => k.team === "A" && k.scored).length;
    const b = r.kicks.filter((k) => k.team === "B" && k.scored).length;
    expect({ A: a, B: b }).toEqual(r.score);
  });

  test("stops early once a side can no longer catch up", () => {
    // One rng() call per kick, kicks alternate A, B…: A always scores (0), B always misses (0.99).
    // After A's 3rd and B's 3rd kick it is 3–0 with B having 2 left: 0 + 2 < 3 → decided at 6 kicks.
    let n = 0;
    const aScoresBMisses = () => (n++ % 2 === 0 ? 0 : 0.99);
    const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), aScoresBMisses);
    expect(r.score).toEqual({ A: 3, B: 0 });
    expect(r.kicks.length).toBe(6);
  });

  test("best finisher kicks first, keeper kicks last", () => {
    const s: PenaltySide<string> = {
      takers: [
        { id: "gk", accuracy: 0, isGK: true },
        { id: "low", accuracy: 0.2, isGK: false },
        { id: "high", accuracy: 0.9, isGK: false },
      ],
      keeper: { id: "gk", reflex: 0.5, diving: 0.5 },
    };
    const r = resolvePenaltyShootout(s, s, mulberry32(11));
    const aTakers = r.kicks.filter((k) => k.team === "A").map((k) => k.takerId);
    expect(aTakers.slice(0, 3)).toEqual(["high", "low", "gk"]);
  });

  test("average sides convert ~75% over many shootouts", () => {
    const rng = mulberry32(42);
    let taken = 0, scored = 0;
    for (let i = 0; i < 10_000; i++) {
      const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), rng);
      taken += r.kicks.length;
      scored += r.kicks.filter((k) => k.scored).length;
    }
    const rate = scored / taken;
    expect(rate).toBeGreaterThan(0.70);
    expect(rate).toBeLessThan(0.80);
  });

  test("a side with no takers loses without kicks", () => {
    const r = resolvePenaltyShootout(side("a", 0.5, 0.5), { takers: [], keeper: null }, mulberry32(1));
    expect(r.winner).toBe("A");
    expect(r.kicks).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test src/GameEngine/Infrastructure/PenaltyShootout.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar**

`src/GameEngine/Infrastructure/PenaltyShootout.ts`:

```ts
/**
 * Penalty shootout — pure, shared by the full engine (GamePlayer ids are numbers) and
 * quickSim (roster ids are strings). The whole shootout is resolved up front; the engine
 * then *presents* the kicks one by one.
 */
import { PENALTY_CONFIG as C } from "@/GameEngine/Configs/PenaltyConfig";

export type ShootoutTeam = "A" | "B";

export interface PenaltyTaker<Id> {
  id: Id;
  /** Normalised finishing, 0..0.95 (same scale as runtimeStats.withBall.shootAccuracy). */
  accuracy: number;
  isGK: boolean;
}

export interface PenaltyKeeper<Id> {
  id: Id;
  /** 0..1 */
  reflex: number;
  /** 0..1 */
  diving: number;
}

export interface PenaltySide<Id> {
  takers: PenaltyTaker<Id>[];
  keeper: PenaltyKeeper<Id> | null;
}

export interface PenaltyKick<Id> {
  team: ShootoutTeam;
  takerId: Id;
  keeperId: Id | null;
  scored: boolean;
  chance: number;
}

export interface ShootoutResult<Id> {
  kicks: PenaltyKick<Id>[];
  score: { A: number; B: number };
  winner: ShootoutTeam;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Probability that a taker of `accuracy` scores against `keeper` (null = empty goal). */
export function penaltyChance<Id>(accuracy: number, keeper: PenaltyKeeper<Id> | null): number {
  const shooter = C.SHOOTER_MIN + (clamp(accuracy, 0, 0.95) / 0.95) * (C.SHOOTER_MAX - C.SHOOTER_MIN);
  const keeperFx = keeper ? 1 - ((keeper.reflex + keeper.diving) / 2) * C.GK_WEIGHT : 1;
  return clamp(C.BASE * shooter * keeperFx, C.MIN_CHANCE, C.MAX_CHANCE);
}

/** Outfield players by accuracy (desc, stable), goalkeepers last. */
function kickOrder<Id>(takers: PenaltyTaker<Id>[]): PenaltyTaker<Id>[] {
  const outfield = takers.filter((t) => !t.isGK).sort((a, b) => b.accuracy - a.accuracy);
  return [...outfield, ...takers.filter((t) => t.isGK)];
}

export function resolvePenaltyShootout<Id>(
  sideA: PenaltySide<Id>,
  sideB: PenaltySide<Id>,
  rng: () => number,
): ShootoutResult<Id> {
  if (sideA.takers.length === 0 || sideB.takers.length === 0) {
    return { kicks: [], score: { A: 0, B: 0 }, winner: sideA.takers.length > 0 ? "A" : "B" };
  }
  const order = { A: kickOrder(sideA.takers), B: kickOrder(sideB.takers) };
  const keeperFacing = { A: sideB.keeper, B: sideA.keeper };
  const score = { A: 0, B: 0 };
  const taken = { A: 0, B: 0 };
  const kicks: PenaltyKick<Id>[] = [];

  const kick = (team: ShootoutTeam) => {
    const list = order[team];
    const taker = list[taken[team] % list.length]!;
    const keeper = keeperFacing[team];
    const chance = penaltyChance(taker.accuracy, keeper);
    const scored = rng() < chance;
    if (scored) score[team]++;
    taken[team]++;
    kicks.push({ team, takerId: taker.id, keeperId: keeper?.id ?? null, scored, chance });
  };

  // Regulation rounds, stopping as soon as one side can no longer catch up.
  const decided = () =>
    score.A + (C.ROUNDS - taken.A) < score.B || score.B + (C.ROUNDS - taken.B) < score.A;
  for (let r = 0; r < C.ROUNDS; r++) {
    kick("A");
    if (decided()) break;
    kick("B");
    if (decided()) break;
  }

  // Sudden death.
  for (let r = 0; score.A === score.B && r < C.MAX_SUDDEN_DEATH_ROUNDS; r++) {
    kick("A");
    kick("B");
  }
  if (score.A === score.B) {
    // Degenerate safety net — practically unreachable.
    score[rng() < 0.5 ? "A" : "B"]++;
  }
  return { kicks, score, winner: score.A > score.B ? "A" : "B" };
}
```

(`resolvePenaltyShootout` chama `rng()` exatamente uma vez por cobrança — o teste "stops early"
depende disso.)

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test src/GameEngine/Infrastructure/PenaltyShootout.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add src/GameEngine/Configs/PenaltyConfig.ts src/GameEngine/Infrastructure/PenaltyShootout.ts src/GameEngine/Infrastructure/PenaltyShootout.test.ts
git commit -m "feat(engine): pure penalty shootout resolver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: tipos e eventos

**Files:**
- Modify: `src/GameEngine/types.ts` (linha 69 `MatchPhase`; bloco "Match flow" do `GameState`, ~linha 401)
- Modify: `src/types/calendarTypes.ts`
- Modify: `src/GameEngine/Infrastructure/EventBus.ts` (`testCommand`, `kickOff`, `matchEnd` ~linhas 204-240)

- [ ] **Step 1: `MatchPhase` e tipos do mata-mata**

Em `src/GameEngine/types.ts` troque a linha 69 por:

```ts
export type MatchPhase =
  | 'preMatch' | 'firstHalf' | 'halfTime' | 'secondHalf'
  | 'extraTimeBreak' | 'extraTimeFirst' | 'extraTimeSecond' | 'penalties'
  | 'matchEnd';

/** One kick of a penalty shootout, in engine ids. */
export interface ShootoutKick {
  team: TeamId;
  takerId: number;
  keeperId: number | null;
  scored: boolean;
  chance: number;
}

/** Shootout resolved up front (`resolvePenaltyShootout`) and presented kick by kick. */
export interface ShootoutState {
  kicks: ShootoutKick[];
  /** Score of the kicks already presented. */
  score: { A: number; B: number };
  /** Score once every kick is presented. */
  finalScore: { A: number; B: number };
  winner: TeamId;
  /** How many kicks have been presented. */
  shown: number;
}

/** How a knockout match was decided after regulation (engine sides). */
export interface KnockoutDecider {
  /** Goals scored in extra time only. */
  extraTime: { A: number; B: number };
  penalties: { A: number; B: number } | null;
  winner: TeamId;
}
```

(`TeamId` já é declarado em `types.ts`; se for declarado abaixo da linha 69, mova esses três tipos para
logo depois da declaração de `TeamId`.)

No `GameState`, logo depois do campo `extraTimeSecond: number;`, adicione:

```ts
  /** Knockout match: a draw after 90' goes to extra time and penalties. Absent/false = league. */
  knockout?: boolean;
  /** Score when the second half ended level in a knockout match (null/absent otherwise). */
  scoreAtRegulation?: { A: number; B: number } | null;
  /** Stoppage game-seconds for each extra-time half (0–2 min), drawn when extra time starts. */
  etStoppageFirst?: number;
  etStoppageSecond?: number;
  /** Penalty shootout in progress / finished. */
  shootout?: ShootoutState | null;
```

- [ ] **Step 2: `MatchDecider` (lado casa/fora)**

Em `src/types/calendarTypes.ts`, acima de `export interface Fixture`, adicione:

```ts
/** How a knockout fixture was decided after 90 minutes, from the home/away point of view. */
export interface MatchDecider {
  /** Goals scored in extra time only (the fixture `result` already includes them). */
  extraTime: { home: number; away: number };
  penalties?: { home: number; away: number };
}
```

- [ ] **Step 3: Eventos**

Em `src/GameEngine/Infrastructure/EventBus.ts`:

- em `testCommand`, troque `| { type: 'triggerPhase';  phase: 'halfTime' | 'matchEnd' }` por
  `| { type: 'triggerPhase';  phase: 'halfTime' | 'matchEnd' | 'endPeriod' }`;
- troque `kickOff: { team: TeamId; phase: 'firstHalf' | 'secondHalf' | 'afterGoal' };` por
  `kickOff: { team: TeamId; phase: 'firstHalf' | 'secondHalf' | 'extraTimeFirst' | 'extraTimeSecond' | 'afterGoal' };`;
- troque `matchEnd: { score: { A: number; B: number } };` por:

```ts
  matchEnd: { score: { A: number; B: number }; decider?: import('@/GameEngine/types').KnockoutDecider | null };
  /** Knockout match level after 90': extra time begins after a short break. */
  extraTimeStart: { score: { A: number; B: number } };
  /** One presented kick of a penalty shootout; `score` includes this kick. */
  penaltyKick: { team: TeamId; takerId: number; keeperId: number | null; scored: boolean; chance: number; score: { A: number; B: number } };
  /** Emitted once, right before `matchEnd`, when a shootout decided the match. */
  shootoutEnd: { winner: TeamId; score: { A: number; B: number } };
```

- [ ] **Step 4: Checar tipos**

Run: `bunx tsc --noEmit -p .`
Expected: sem erros novos (os campos são opcionais; `MatchPhase` só ganhou membros). Se aparecer erro de
`switch` exaustivo em algum lugar, adicione os casos novos com o mesmo tratamento de `secondHalf`.

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine/types.ts src/types/calendarTypes.ts src/GameEngine/Infrastructure/EventBus.ts
git commit -m "feat(engine): knockout match phases, shootout and decider types, events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: motor — prorrogação e pênaltis no `gameState.ts`

**Files:**
- Modify: `src/GameEngine/Domain/gameState.ts`
- Modify: `src/GameEngine/Domain/AiSubstitution.ts:32`
- Test: `src/GameEngine/Domain/knockout.test.ts`

- [ ] **Step 1: Testes que falham**

`src/GameEngine/Domain/knockout.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, endCurrentPeriod, knockoutDecider, matchMinute, tickState } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { Formation, GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}
function loadFormation(): Formation {
  const path = fileURLToPath(new URL(`../../example_data/formations/4-3-3.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Formation;
}

function base(knockout: boolean, score: { A: number; B: number }): GameState {
  const f = loadFormation();
  const s = createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f);
  return { ...s, knockout, score, matchPhase: "secondHalf", presentationCountdown: 0 };
}

describe("endCurrentPeriod", () => {
  test("league match level after 90' ends the match", () => {
    const s = endCurrentPeriod(base(false, { A: 1, B: 1 }));
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toBeNull();
  });

  test("knockout match decided in 90' ends without a decider", () => {
    const s = endCurrentPeriod(base(true, { A: 2, B: 1 }));
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toBeNull();
  });

  test("knockout level after 90' → extra time break → ET1 → ET2", () => {
    let s = endCurrentPeriod(base(true, { A: 1, B: 1 }));
    expect(s.matchPhase).toBe("extraTimeBreak");
    expect(s.scoreAtRegulation).toEqual({ A: 1, B: 1 });
    s = tickState({ ...s, presentationCountdown: 0.01 }, 0.02).state;
    expect(s.matchPhase).toBe("extraTimeFirst");
    expect(s.matchTime).toBe(0);
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("extraTimeSecond");
  });

  test("goal in extra time wins it; decider reports the extra-time goals", () => {
    let s = endCurrentPeriod(base(true, { A: 1, B: 1 }));
    s = { ...s, matchPhase: "extraTimeSecond", score: { A: 2, B: 1 } };
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toEqual({ extraTime: { A: 1, B: 0 }, penalties: null, winner: "A" });
  });

  test("level after extra time → penalties, presented kick by kick, then matchEnd", () => {
    let s = endCurrentPeriod(base(true, { A: 0, B: 0 }));
    s = { ...s, matchPhase: "extraTimeSecond" };
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("penalties");
    const total = s.shootout!.kicks.length;
    let kicks = 0;
    let ended: { decider?: unknown } | null = null;
    const offKick = gameBus.on("penaltyKick", () => { kicks++; });
    const offEnd = gameBus.on("matchEnd", (e) => { ended = e; });
    for (let i = 0; i < 200 && s.matchPhase === "penalties"; i++) s = tickState(s, 2).state;
    offKick(); offEnd();
    expect(kicks).toBe(total);
    expect(s.matchPhase).toBe("matchEnd");
    const d = knockoutDecider(s)!;
    expect(d.penalties).toEqual(s.shootout!.finalScore);
    expect(d.winner).toBe(s.shootout!.winner);
    expect(ended).not.toBeNull();
  });
});

describe("matchMinute", () => {
  test("offsets per period", () => {
    const s = base(true, { A: 0, B: 0 });
    expect(matchMinute({ ...s, matchPhase: "firstHalf", matchTime: 600 })).toBe(10);
    expect(matchMinute({ ...s, matchPhase: "secondHalf", matchTime: 600 })).toBe(55);
    expect(matchMinute({ ...s, matchPhase: "extraTimeFirst", matchTime: 300 })).toBe(95);
    expect(matchMinute({ ...s, matchPhase: "extraTimeSecond", matchTime: 300 })).toBe(110);
  });
});
```

Antes de rodar, confirme que `src/example_data/formations/4-3-3.json` existe
(`ls src/example_data/formations`). Se o arquivo tiver outro nome, ajuste `loadFormation`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameEngine/Domain/knockout.test.ts`
Expected: FAIL — `endCurrentPeriod`/`knockoutDecider`/`matchMinute` não exportados.

- [ ] **Step 3: Constantes e helpers**

Em `gameState.ts`, perto de `const PRESENTATION_DURATION = 4;` (~linha 83), adicione:

```ts
/** Game-seconds per extra-time half (15 min). */
const ET_HALF_DURATION = 900;
/** Real seconds between presented penalty kicks. */
const PENALTY_KICK_INTERVAL = 1.5;
/** Share of the half-time energy recovery granted in the break before extra time. */
const ET_BREAK_RECOVERY_SCALE = 0.5;

const LIVE_PHASES = new Set<MatchPhase>(['firstHalf', 'secondHalf', 'extraTimeFirst', 'extraTimeSecond']);
const MINUTE_OFFSET: Partial<Record<MatchPhase, number>> = {
  firstHalf: 0, secondHalf: 45, extraTimeFirst: 90, extraTimeSecond: 105,
};

/** True while the ball can be in play (the four clock-running periods). */
export function isLivePhase(phase: MatchPhase): boolean {
  return LIVE_PHASES.has(phase);
}

/** Displayed match minute (0-based within the match, stoppage not capped). */
export function matchMinute(state: GameState): number {
  return Math.floor(state.matchTime / 60) + (MINUTE_OFFSET[state.matchPhase] ?? 0);
}
```

Garanta que `MatchPhase` está no `import type { ... } from '../types'`/`'@/GameEngine/types'` do topo do
arquivo (adicione se faltar). Adicione também:

```ts
import { resolvePenaltyShootout, type PenaltySide } from '@/GameEngine/Infrastructure/PenaltyShootout';
```

- [ ] **Step 4: Usar os helpers onde o código já calcula fase/minuto**

- Em `performSubstitution`, troque o cálculo de `matchMinute`:

```ts
  const minute = matchMinute(state);
```

e no `record`, `matchMinute: minute,`.

- `shouldDrainStamina`: troque a primeira linha por
  `if (!isLivePhase(state.matchPhase)) return false;`.
- `isDeadBall`: logo depois de `if (state.matchPhase === 'halfTime') return true;` adicione
  `if (state.matchPhase === 'extraTimeBreak' || state.matchPhase === 'penalties') return true;`.
- `src/GameEngine/Domain/AiSubstitution.ts:32`: troque
  `if (state.matchPhase !== 'secondHalf') return [];` por

```ts
  if (state.matchPhase !== 'secondHalf' && state.matchPhase !== 'extraTimeFirst' && state.matchPhase !== 'extraTimeSecond') return [];
```

- [ ] **Step 5: `switchSides` genérico**

Troque a assinatura e as partes fixas de `switchSides`:

```ts
function switchSides(
  state: GameState,
  nextPhase: 'secondHalf' | 'extraTimeFirst' | 'extraTimeSecond' = 'secondHalf',
  kickoffTeam: TeamId = 'B',
  recoveryScale = 1,
): GameState {
  const switched = state.players.map(p => {
    const recoveryRate = (0.30 + (p.stamina / 10) * 0.30) * recoveryScale; // 30% at stamina 0 → 60% at stamina 10
```

(o resto do `.map` fica igual). Depois do `.map`, troque o bloco de posicionamento/kickoff:

```ts
  // The kicking team uses kickOff, the other kickOffDefend. attackDir is already flipped above,
  // so applySetPieceToTeam mirrors correctly.
  const defendingTeam: TeamId = kickoffTeam === 'A' ? 'B' : 'A';
  let positioned = switched;
  const spA2 = getFormationSetPieces(state.formationA.id);
  const spB2 = getFormationSetPieces(state.formationB.id);
  const layoutA = kickoffTeam === 'A'
    ? (spA2?.kickOff ?? generateKickoffLayout(state.formationA))
    : (spA2?.kickOffDefend ?? generateKickoffLayout(state.formationA));
  const layoutB = kickoffTeam === 'B'
    ? (spB2?.kickOff ?? generateKickoffLayout(state.formationB))
    : (spB2?.kickOffDefend ?? generateKickoffLayout(state.formationB));
  positioned = applySetPieceToTeam(positioned, 'A', layoutA);
  positioned = applySetPieceToTeam(positioned, 'B', layoutB);
  positioned = enforceKickoffCircleRule(positioned, defendingTeam);

  const kickoffHolder =
    positioned.find(p => p.team === kickoffTeam && p.role === 'ST') ??
    positioned.find(p => p.team === kickoffTeam)!;

  gameBus.emit('kickOff', { team: kickoffTeam, phase: nextPhase });
```

e no objeto de retorno troque `matchPhase: 'secondHalf',` por `matchPhase: nextPhase,`. (A chamada
existente `switchSides(state)` continua valendo pelos defaults.) Se `TeamId` não estiver importado no
arquivo, adicione ao import de tipos.

- [ ] **Step 6: `endCurrentPeriod`, `knockoutDecider`, pênaltis**

Adicione, logo depois de `switchSides`:

```ts
/** Goals in extra time, shootout and winner of a knockout match; null when decided in 90'. */
export function knockoutDecider(state: GameState): KnockoutDecider | null {
  const reg = state.scoreAtRegulation;
  if (!state.knockout || !reg) return null;
  const extraTime = { A: state.score.A - reg.A, B: state.score.B - reg.B };
  const so = state.shootout ?? null;
  const winner: TeamId = so ? so.winner : (state.score.A > state.score.B ? 'A' : 'B');
  return { extraTime, penalties: so ? { ...so.finalScore } : null, winner };
}

function finishMatch(state: GameState): GameState {
  const final: GameState = { ...state, matchPhase: 'matchEnd', pass: null, shot: null, looseBall: null };
  if (final.shootout) gameBus.emit('shootoutEnd', { winner: final.shootout.winner, score: { ...final.shootout.finalScore } });
  gameBus.emit('matchEnd', { score: final.score, decider: knockoutDecider(final) });
  return final;
}

function penaltySide(state: GameState, team: TeamId): PenaltySide<number> {
  const onPitch = state.players.filter(p => p.team === team);
  const gk = onPitch.find(p => p.role === 'GK') ?? null;
  return {
    takers: onPitch.map(p => ({ id: p.id, accuracy: p.runtimeStats.withBall.shootAccuracy, isGK: p.role === 'GK' })),
    keeper: gk
      ? { id: gk.id, reflex: gk.runtimeStats.withoutBall.gkReflex, diving: gk.runtimeStats.withoutBall.gkDiving }
      : null,
  };
}

function startPenalties(state: GameState): GameState {
  const r = resolvePenaltyShootout(penaltySide(state, 'A'), penaltySide(state, 'B'), Math.random);
  return {
    ...state,
    matchPhase: 'penalties',
    presentationCountdown: PENALTY_KICK_INTERVAL,
    pass: null, shot: null, looseBall: null, setPiece: null,
    shootout: { kicks: r.kicks, score: { A: 0, B: 0 }, finalScore: r.score, winner: r.winner, shown: 0 },
  };
}

/**
 * End the running period now. Used by the clock (tickState) and by /test ("end period").
 * firstHalf → halfTime; secondHalf → matchEnd, or extraTimeBreak when a knockout match is
 * level; extraTimeFirst → extraTimeSecond; extraTimeSecond → matchEnd or penalties.
 */
export function endCurrentPeriod(state: GameState, newMatchTime: number = state.matchTime): GameState {
  const s = { ...state, matchTime: newMatchTime };
  switch (s.matchPhase) {
    case 'firstHalf':
      gameBus.emit('halfTime', { score: s.score, extraTime: Math.round(s.extraTimeSecond / 60) });
      return {
        ...s, matchPhase: 'halfTime', presentationCountdown: PRESENTATION_DURATION,
        pass: null, shot: null, looseBall: null,
      };
    case 'secondHalf':
      if (s.knockout && s.score.A === s.score.B) {
        gameBus.emit('extraTimeStart', { score: s.score });
        return {
          ...s, matchPhase: 'extraTimeBreak', presentationCountdown: PRESENTATION_DURATION,
          pass: null, shot: null, looseBall: null,
          scoreAtRegulation: { ...s.score },
          etStoppageFirst:  Math.floor(Math.random() * 3) * 60,
          etStoppageSecond: Math.floor(Math.random() * 3) * 60,
        };
      }
      return finishMatch(s);
    case 'extraTimeFirst':
      return switchSides(s, 'extraTimeSecond', 'B', 0);
    case 'extraTimeSecond':
      return s.score.A === s.score.B ? startPenalties(s) : finishMatch(s);
    default:
      return state;
  }
}
```

Adicione `KnockoutDecider` ao import de tipos de `types.ts`.

- [ ] **Step 7: Fases novas no `tickState`**

No bloco "Match phase gating" do `tickState`, logo depois do bloco `if (state.matchPhase === 'halfTime') { ... }`, adicione:

```ts
  if (state.matchPhase === 'extraTimeBreak') {
    const countdown = state.presentationCountdown - dt;
    if (countdown <= 0) {
      return noop(switchSides(state, 'extraTimeFirst', 'A', ET_BREAK_RECOVERY_SCALE));
    }
    let brk = { ...state, presentationCountdown: countdown };
    if (brk.pendingSubsA.length > 0 || brk.pendingSubsB.length > 0) {
      brk = flushPendingSubs(brk, 'A');
      brk = flushPendingSubs(brk, 'B');
    }
    return noop(brk);
  }

  if (state.matchPhase === 'penalties') {
    const so = state.shootout;
    if (!so) return noop(finishMatch(state));
    const countdown = state.presentationCountdown - dt;
    if (countdown > 0) return noop({ ...state, presentationCountdown: countdown });
    if (so.shown >= so.kicks.length) return noop(finishMatch({ ...state, presentationCountdown: 0 }));
    const kick = so.kicks[so.shown]!;
    const score = { ...so.score, [kick.team]: so.score[kick.team] + (kick.scored ? 1 : 0) };
    gameBus.emit('penaltyKick', {
      team: kick.team, takerId: kick.takerId, keeperId: kick.keeperId,
      scored: kick.scored, chance: kick.chance, score,
    });
    return noop({
      ...state,
      presentationCountdown: PENALTY_KICK_INTERVAL,
      shootout: { ...so, score, shown: so.shown + 1 },
    });
  }
```

Troque o bloco "Clock advancement" inteiro (de `const newMatchTime` até o fechamento do
`if (!state.testMode && newMatchTime >= halfEnd) { ... }`) por:

```ts
  // ── Clock advancement (the four live periods) ─────────────────────────────
  const newMatchTime = state.matchTime + dt * TIME_SCALE;
  const periodEnd =
    state.matchPhase === 'firstHalf'       ? HALF_DURATION + state.extraTimeFirst :
    state.matchPhase === 'secondHalf'      ? HALF_DURATION + state.extraTimeSecond :
    state.matchPhase === 'extraTimeFirst'  ? ET_HALF_DURATION + (state.etStoppageFirst ?? 0) :
                                             ET_HALF_DURATION + (state.etStoppageSecond ?? 0);

  if (!state.testMode && newMatchTime >= periodEnd) {
    return noop(endCurrentPeriod(state, newMatchTime));
  }
```

Procure no restante do `tickState` outras checagens `matchPhase === 'secondHalf'` (a das substituições
da IA, ~linha 1479) e troque por `(state.matchPhase === 'secondHalf' || state.matchPhase === 'extraTimeFirst' || state.matchPhase === 'extraTimeSecond')`
(use o nome de variável de estado daquele trecho, `s` ou `state`).

- [ ] **Step 8: Rodar os testes**

Run: `bun test src/GameEngine/Domain/knockout.test.ts`
Expected: PASS (6 testes).

Run: `bun test src/GameEngine`
Expected: PASS (nenhuma regressão).

- [ ] **Step 9: Commit**

```bash
git add src/GameEngine/Domain/gameState.ts src/GameEngine/Domain/AiSubstitution.ts src/GameEngine/Domain/knockout.test.ts
git commit -m "feat(engine): extra time and penalty shootout for knockout matches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: estatísticas de prorrogação e pênaltis

**Files:**
- Modify: `src/GameEngine/Domain/Statistics.ts`
- Modify: `src/GameInterface/StatsPanel.tsx` (`EMPTY_STATS`, ~linha 41)
- Test: `src/GameEngine/Domain/Statistics.knockout.test.ts`

- [ ] **Step 1: Teste que falha**

`src/GameEngine/Domain/Statistics.knockout.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getPlayerStats, getTeamStats, initStats } from "@/GameEngine/Domain/Statistics";

describe("knockout stats", () => {
  test("penalties per player, extra time and shootout per team", () => {
    initStats([{ id: 1, team: "A" }, { id: 2, team: "B" }]);
    gameBus.emit("extraTimeStart", { score: { A: 1, B: 1 } });
    gameBus.emit("penaltyKick", { team: "A", takerId: 1, keeperId: 2, scored: true, chance: 0.75, score: { A: 1, B: 0 } });
    gameBus.emit("penaltyKick", { team: "B", takerId: 2, keeperId: 1, scored: false, chance: 0.75, score: { A: 1, B: 0 } });
    gameBus.emit("shootoutEnd", { winner: "A", score: { A: 1, B: 0 } });

    expect(getPlayerStats(1).penaltiesTaken).toBe(1);
    expect(getPlayerStats(1).penaltiesScored).toBe(1);
    expect(getPlayerStats(2).penaltiesScored).toBe(0);
    expect(getPlayerStats(1).goals).toBe(0); // shootout kicks are not goals
    expect(getTeamStats("A")).toMatchObject({ extraTimePlayed: 1, shootoutsWon: 1, penaltiesScored: 1 });
    expect(getTeamStats("B")).toMatchObject({ extraTimePlayed: 1, shootoutsWon: 0, penaltiesTaken: 1 });

    initStats([{ id: 1, team: "A" }]);
    expect(getTeamStats("A").extraTimePlayed).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameEngine/Domain/Statistics.knockout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `Statistics.ts`:

1. Em `PlayerStats`, depois de `switchPlays: number;`:

```ts
  /** Shootout kicks taken / scored (never counted as goals). */
  penaltiesTaken:           number;
  penaltiesScored:          number;
```

2. Troque `export type TeamStats = PlayerStats;` por:

```ts
export interface TeamStats extends PlayerStats {
  /** 1 when the match went to extra time. */
  extraTimePlayed: number;
  /** 1 when this team won a penalty shootout. */
  shootoutsWon:    number;
}
```

3. Em `emptyStats()`, adicione `penaltiesTaken: 0, penaltiesScored: 0,`.

4. Depois de `const playerTeam = ...`:

```ts
/** Team-level knockout flags (not derivable from player sums). */
const teamFlags: Record<TeamId, { extraTimePlayed: number; shootoutsWon: number }> = {
  A: { extraTimePlayed: 0, shootoutsWon: 0 },
  B: { extraTimePlayed: 0, shootoutsWon: 0 },
};
```

5. Depois das assinaturas de switch-of-play:

```ts
// ── Knockout stats ────────────────────────────────────────────────────────────
gameBus.on('extraTimeStart', () => {
  teamFlags.A.extraTimePlayed = 1;
  teamFlags.B.extraTimePlayed = 1;
  notify();
});
gameBus.on('penaltyKick', e => {
  const s = get(e.takerId);
  s.penaltiesTaken++;
  if (e.scored) s.penaltiesScored++;
  notify();
});
gameBus.on('shootoutEnd', e => {
  teamFlags[e.winner].shootoutsWon = 1;
  notify();
});
```

6. Em `initStats`, depois de `playerTeam.clear();`:

```ts
  teamFlags.A = { extraTimePlayed: 0, shootoutsWon: 0 };
  teamFlags.B = { extraTimePlayed: 0, shootoutsWon: 0 };
```

7. Em `getTeamStats`, troque `const result: TeamStats = emptyStats();` por
   `const result: TeamStats = { ...emptyStats(), ...teamFlags[team] };` e, dentro do laço, depois de
   `result.switchPlays += stats.switchPlays;`:

```ts
    result.penaltiesTaken           += stats.penaltiesTaken;
    result.penaltiesScored          += stats.penaltiesScored;
```

8. Em `src/GameInterface/StatsPanel.tsx`, no `EMPTY_STATS`, depois de `switchPlays: 0,` adicione
   `penaltiesTaken: 0, penaltiesScored: 0,`. Se `EMPTY_STATS` for usado como `TeamStats` (erro de tipo),
   adicione também `extraTimePlayed: 0, shootoutsWon: 0,` e troque a anotação para `TeamStats`.

- [ ] **Step 4: Rodar**

Run: `bun test src/GameEngine/Domain/Statistics.knockout.test.ts && bunx tsc --noEmit -p .`
Expected: PASS e sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine/Domain/Statistics.ts src/GameEngine/Domain/Statistics.knockout.test.ts src/GameInterface/StatsPanel.tsx
git commit -m "feat(stats): penalties, extra time and shootout counters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `simulateMatch` com mata-mata

**Files:**
- Modify: `src/GameEngine/Domain/SimulateMatch.ts`
- Test: `src/GameEngine/Domain/SimulateMatch.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente em `SimulateMatch.test.ts`:

```ts
describe("simulateMatch knockout", () => {
  test("never ends level; decider is consistent with the score", () => {
    const squad = loadSquad("33.json");
    for (let i = 0; i < 6; i++) {
      // Same squad both sides → many level games after 90'.
      const r = simulateMatch(squad, squad, undefined, undefined, undefined, undefined, { knockout: true });
      const d = r.decider;
      if (!d) {
        expect(r.score.A).not.toBe(r.score.B);
        continue;
      }
      if (d.penalties) {
        expect(r.score.A).toBe(r.score.B);
        expect(d.penalties.A).not.toBe(d.penalties.B);
        expect(d.winner).toBe(d.penalties.A > d.penalties.B ? "A" : "B");
      } else {
        expect(r.score.A).not.toBe(r.score.B);
      }
      expect(r.teamStats.A.extraTimePlayed).toBe(1);
    }
  }, 120_000);

  test("league match reports no decider", () => {
    const r = simulateMatch(loadSquad("33.json"), loadSquad("34.json"));
    expect(r.decider).toBeNull();
  }, 30_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameEngine/Domain/SimulateMatch.test.ts`
Expected: FAIL (parâmetro e campo não existem).

- [ ] **Step 3: Implementar**

Em `SimulateMatch.ts`:

- import: `import { tickState, createMatchState, knockoutDecider } from '@/GameEngine/Domain/gameState';`
  e `import type { GameState, GamePlayer, Formation, KnockoutDecider } from '@/GameEngine/types';`
- em `MatchResult`, depois de `substitutions`:
  `  /** Extra time / shootout outcome of a knockout match; null otherwise or when decided in 90'. */`
  `  decider:       KnockoutDecider | null;`
- nova interface acima de `simulateMatch`:

```ts
export interface SimulateMatchOptions {
  /** Knockout: a draw after 90' goes to extra time and penalties. */
  knockout?: boolean;
}
```

- assinatura: acrescente o parâmetro final `options: SimulateMatchOptions = {},`
- no estado inicial: depois de `presentationCountdown: 0,` adicione `knockout: options.knockout === true,`
- no laço, troque `if (s.matchPhase === 'secondHalf' && shouldCheckAiSubs(...))` por

```ts
    const subsWindow = s.matchPhase === 'secondHalf' || s.matchPhase === 'extraTimeFirst' || s.matchPhase === 'extraTimeSecond';
    if (subsWindow && shouldCheckAiSubs(s.matchTime, SIM_DT * (2700 / 150))) {
```

- no retorno, depois de `substitutions: s.substitutions,`: `decider: knockoutDecider(s),`

- [ ] **Step 4: Rodar**

Run: `bun test src/GameEngine/Domain/SimulateMatch.test.ts`
Expected: PASS. (Se o primeiro teste nunca cair em `d.penalties` nas 6 partidas, tudo bem — o
`knockout.test.ts` já cobre os pênaltis; o objetivo aqui é "nunca empata".)

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine/Domain/SimulateMatch.ts src/GameEngine/Domain/SimulateMatch.test.ts
git commit -m "feat(engine): headless knockout matches (simulateMatch knockout option)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `decider` na gravação da partida

**Files:**
- Modify: `src/Domain/advanceDay/matches.ts` (`PlayedMatchRecording`, ~linha 24)
- Modify: `src/GameInterface/buildPlayedMatchRecording.ts`

- [ ] **Step 1: Tipo**

Em `PlayedMatchRecording`, depois de `durationMs: number;`:

```ts
  /** Knockout only: extra-time goals and shootout, home/away. Absent when decided in 90'. */
  decider?: import("@/types/calendarTypes").MatchDecider;
```

- [ ] **Step 2: Mapear no front**

Em `buildPlayedMatchRecording.ts`, adicione o import
`import { knockoutDecider } from "@/GameEngine/Domain/gameState";` e, antes do `return`:

```ts
  const kd = knockoutDecider(gameState);
  const side = <T extends { A: number; B: number }>(v: T) =>
    ({ home: myIsHome ? v.A : v.B, away: myIsHome ? v.B : v.A });
  const decider = kd
    ? { extraTime: side(kd.extraTime), ...(kd.penalties ? { penalties: side(kd.penalties) } : {}) }
    : undefined;
```

e no objeto retornado, depois de `durationMs,`: `...(decider ? { decider } : {}),`

- [ ] **Step 3: Checar tipos e testes existentes**

Run: `bunx tsc --noEmit -p . && bun test src/Domain/advanceDay src/GameInterface`
Expected: sem erros; PASS.

- [ ] **Step 4: Commit**

```bash
git add src/Domain/advanceDay/matches.ts src/GameInterface/buildPlayedMatchRecording.ts
git commit -m "feat(match): carry the knockout decider in PlayedMatchRecording

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: quickSim com mata-mata

**Files:**
- Modify: `src/Domain/advanceDay/quickSim.ts`
- Test: `src/Domain/advanceDay/quickSim.test.ts`

- [ ] **Step 1: Testes que falham**

Acrescente em `quickSim.test.ts` (usa `makeSquad`, `lineupOf`, `mulberry32` já existentes no arquivo):

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/advanceDay/quickSim.test.ts`
Expected: FAIL (`knockout` não existe em `QuickSimInput`).

- [ ] **Step 3: Implementar**

Em `quickSim.ts`:

1. Import: `import { resolvePenaltyShootout, type PenaltySide } from "@/GameEngine/Infrastructure/PenaltyShootout";`
2. Em `QuickSimInput`, depois de `awayRoles?: string[];`:

```ts
  /** Knockout: a level score after 90' goes to extra time (xG × 30/90) and then penalties. */
  knockout?: boolean;
```

3. Extraia o laço de gols de `fillSide` para uma função própria, logo acima de `fillSide`:

```ts
function assignGoals(xi: XIPlayer[], goals: number, stats: Record<string, MatchPlayerStats>, rng: Rng): void {
  const scorerWeight = (x: XIPlayer) => C.ROLE_GOAL_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "finishing") / 10);
  const assistWeight = (x: XIPlayer) => C.ROLE_ASSIST_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "passing") / 10);
  for (let g = 0; g < goals; g++) {
    const scorer = weightedPick(xi, scorerWeight, rng) ?? uniformPick(xi, rng);
    if (!scorer) break;
    stats[scorer.p.id]!.goals++;
    stats[scorer.p.id]!.shots++;
    if (rng() >= C.NO_ASSIST_RATE) {
      const assister = weightedPick(xi.filter((x) => x.p.id !== scorer.p.id), assistWeight, rng);
      if (assister) stats[assister.p.id]!.assists++;
    }
  }
}
```

   e em `fillSide` substitua o laço `for (let g = 0; g < goals; g++) { ... }` por
   `assignGoals(xi, goals, stats, rng);` (mantenha `scorerWeight` em `fillSide`, ele ainda é usado
   pelos chutes extras). **A ordem de consumo do `rng` não muda**, então os testes/calibração existentes
   continuam determinísticos.

4. Nova função acima de `quickSimMatch`:

```ts
function shootoutSide(xi: XIPlayer[]): PenaltySide<string> {
  const gk = xi.find((x) => groupOf(x) === "GK");
  return {
    takers: xi.map((x) => ({
      id: x.p.id,
      accuracy: groupOf(x) === "GK" ? 0 : Math.min(0.95, stat(x.p, "finishing") / 10),
      isGK: groupOf(x) === "GK",
    })),
    keeper: gk ? { id: gk.p.id, reflex: stat(gk.p, "reflex") / 10, diving: stat(gk.p, "jump") / 10 } : null,
  };
}
```

   (confira que o grupo do goleiro em `LineGroup` se chama `"GK"`; se tiver outro nome, use o que
   `groupOf` devolve para goleiros.)

5. Em `quickSimMatch`, troque `const goalsHome = ...` / `const goalsAway = ...` por `let` e, **depois**
   das duas chamadas `fillSide(...)`, adicione:

```ts
  let decider: PlayedMatchRecording["decider"];
  if (input.knockout && goalsHome === goalsAway) {
    const etHome = homeXI.length > 0 ? sampleGoals(xgHomeDay * (30 / 90), rng) : 0;
    const etAway = awayXI.length > 0 ? sampleGoals(xgAwayDay * (30 / 90), rng) : 0;
    assignGoals(homeXI, etHome, playerStats, rng);
    assignGoals(awayXI, etAway, playerStats, rng);
    goalsHome += etHome;
    goalsAway += etAway;
    decider = { extraTime: { home: etHome, away: etAway } };
    if (goalsHome === goalsAway) {
      const so = resolvePenaltyShootout(shootoutSide(homeXI), shootoutSide(awayXI), rng);
      decider.penalties = { home: so.score.A, away: so.score.B };
    }
  }
```

6. No objeto `recording`, depois de `durationMs: ...,` adicione `...(decider ? { decider } : {}),`.
   As notas (`playerRatings`) continuam calculadas das `playerStats` já com os gols da prorrogação —
   mova o bloco `playerRatings`/`playerEnergy` para **depois** do bloco de prorrogação se ele estiver
   antes.

- [ ] **Step 4: Rodar**

Run: `bun test src/Domain/advanceDay`
Expected: PASS (incluindo os testes antigos do quickSim, sem alteração de resultado).

- [ ] **Step 5: Commit**

```bash
git add src/Domain/advanceDay/quickSim.ts src/Domain/advanceDay/quickSim.test.ts
git commit -m "feat(quicksim): knockout matches (extra time + shared shootout)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: tela da partida — prorrogação e faixa de pênaltis

**Files:**
- Create: `src/GameInterface/Components/PenaltyShootoutStrip.tsx`
- Modify: `src/GameInterface/ScoreBar.tsx`, `src/GameInterface/MatchOverlay.tsx`, `src/GameInterface/MatchScreen.tsx`
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Relógio do placar**

Em `ScoreBar.tsx`, troque `formatMatchClock` por:

```ts
const PERIOD: Partial<Record<MatchPhase, { offset: number; length: number }>> = {
  firstHalf:       { offset: 0,   length: 45 },
  secondHalf:      { offset: 45,  length: 45 },
  extraTimeFirst:  { offset: 90,  length: 15 },
  extraTimeSecond: { offset: 105, length: 15 },
};

function formatMatchClock(matchTime: number, matchPhase: MatchPhase): string {
  if (matchPhase === "preMatch") return "00:00";
  if (matchPhase === "halfTime") return "HT";
  if (matchPhase === "extraTimeBreak") return "ET";
  if (matchPhase === "penalties") return "PEN";
  if (matchPhase === "matchEnd") return "FT";

  const { offset, length } = PERIOD[matchPhase] ?? { offset: 0, length: 45 };
  const rawMinutes = matchTime / 60;
  const clampedMin = Math.min(Math.floor(rawMinutes), length);
  const displayMin = offset + clampedMin;
  const stoppage = rawMinutes > length ? Math.ceil(rawMinutes - length) : 0;
  const displaySec = Math.floor(matchTime % 60);

  if (stoppage > 0) {
    return `${displayMin}+${stoppage}'`;
  }
  return `${String(displayMin).padStart(2, "0")}:${String(displaySec).padStart(2, "0")}`;
}
```

Apague a constante `HALF_DURATION` do arquivo se ficar sem uso, e troque
`const isSpecial = matchPhase === "halfTime" || matchPhase === "matchEnd";` por

```ts
  const isSpecial = matchPhase === "halfTime" || matchPhase === "matchEnd"
    || matchPhase === "extraTimeBreak" || matchPhase === "penalties";
```

- [ ] **Step 2: Faixa de pênaltis**

`src/GameInterface/Components/PenaltyShootoutStrip.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import type { ShootoutState } from "@/GameEngine/types";

/** One row of dots per team: green = scored, red = missed, grey = still to come (first 5). */
export function PenaltyShootoutStrip({
  shootout,
  nameA,
  nameB,
}: {
  shootout: ShootoutState;
  nameA: string;
  nameB: string;
}) {
  const { t } = useTranslation();
  const shown = shootout.kicks.slice(0, shootout.shown);
  const row = (team: "A" | "B", name: string) => {
    const kicks = shown.filter((k) => k.team === team);
    const pending = Math.max(0, 5 - kicks.length);
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 truncate text-xs text-white/70">{name}</span>
        <div className="flex gap-1">
          {kicks.map((k, i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${k.scored ? "bg-emerald-500" : "bg-rose-500"}`} />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <span key={`p${i}`} className="h-3 w-3 rounded-full bg-white/15" />
          ))}
        </div>
        <span className="ml-auto font-display font-black tabular-nums">{shootout.score[team]}</span>
      </div>
    );
  };
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 space-y-1 min-w-64">
      <div className="text-[10px] uppercase tracking-widest text-white/40">{t("match.penalties")}</div>
      {row("A", nameA)}
      {row("B", nameB)}
    </div>
  );
}
```

- [ ] **Step 3: Overlay da prorrogação**

Em `MatchOverlay.tsx`: troque o tipo de `kind` para `"halfTime" | "extraTime" | "matchEnd" | null` e
os textos por:

```ts
  const title =
    kind === "halfTime" ? t("matchOverlay.halfTime")
    : kind === "extraTime" ? t("matchOverlay.extraTime")
    : t("matchOverlay.fullTime");
  const subtitle =
    kind === "halfTime" ? t("matchOverlay.secondHalfStarting")
    : kind === "extraTime" ? t("matchOverlay.extraTimeStarting")
    : t("matchOverlay.matchOver");
```

- [ ] **Step 4: `MatchScreen`**

- `useState<"halfTime" | "matchEnd" | null>` → `useState<"halfTime" | "extraTime" | "matchEnd" | null>`.
- Logo depois do `useEffect` do `halfTime`:

```tsx
  useEffect(() => {
    return gameBus.on("extraTimeStart", () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setMatchOverlay("extraTime");
      overlayTimerRef.current = setTimeout(() => setMatchOverlay(null), 3500);
    });
  }, []);
```

- Import `import { PenaltyShootoutStrip } from "@/GameInterface/Components/PenaltyShootoutStrip";`.
- No `<header>`, logo depois do `<ScoreBar ... />`:

```tsx
          {gameState.shootout && (
            <PenaltyShootoutStrip
              shootout={gameState.shootout}
              nameA={teamAWithCrest?.name ?? "A"}
              nameB={teamBWithCrest?.name ?? "B"}
            />
          )}
```

  (use as mesmas variáveis que o `ScoreBar` recebe em `teamA`/`teamB`; se forem opcionais, o `?.`
  já cobre.)

- [ ] **Step 5: i18n**

`src/i18n/locales/pt-BR.json`: em `"matchOverlay"` adicione
`"extraTime": "Prorrogação", "extraTimeStarting": "Prorrogação começando em breve…"`; no objeto
`"match"` adicione `"penalties": "Pênaltis"`.
`src/i18n/locales/en.json`: `"extraTime": "Extra time", "extraTimeStarting": "Extra time starting soon…"`
e `"penalties": "Penalties"`.

- [ ] **Step 6: Checar**

Run: `bunx tsc --noEmit -p . && bun test src/GameInterface`
Expected: sem erros; PASS.

- [ ] **Step 7: Commit**

```bash
git add src/GameInterface/ScoreBar.tsx src/GameInterface/MatchOverlay.tsx src/GameInterface/MatchScreen.tsx src/GameInterface/Components/PenaltyShootoutStrip.tsx src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(match-ui): extra-time clock, overlay and penalty shootout strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `/test` — cenário, fim de período e quickSim mata-mata

**Files:**
- Modify: `src/GameEngine/Support/TestCases.ts` (logo depois do cenário `'11v11-classic'`)
- Modify: `src/GraficsEngine/PixiPitch.tsx` (~linha 1097, bloco `triggerPhase`)
- Modify: `src/GameInterface/TestScreen.tsx` (~linha 1024, "Phase triggers")
- Modify: `src/GameInterface/QuickSimPanel.tsx`

- [ ] **Step 1: Cenário**

Em `TEST_SCENARIOS`, logo depois do objeto `'11v11-classic'`:

```ts
  {
    id:          'knockout-draw-90',
    name:        '11v11 — Knockout level at 90\'',
    description: 'Knockout match, 1–1 late in the second half. Use "End period" to go through extra time and penalties.',
    createState() {
      const f433 = formation433Json as Formation;
      return {
        ...createMatchState(teamRedPlayers, f433, teamBluePlayers, f433),
        knockout:   true,
        matchPhase: 'secondHalf',
        matchTime:  2640,
        score:      { A: 1, B: 1 },
        presentationCountdown: 0,
      };
    },
  },
```

- [ ] **Step 2: Comando `endPeriod` no Pixi**

Em `PixiPitch.tsx`, importe `endCurrentPeriod` de `@/GameEngine/Domain/gameState` (junto do import já
existente desse módulo) e, no bloco `else if (cmd.type === 'triggerPhase')`, depois do `else if (cmd.phase === 'matchEnd') { ... }`:

```ts
          } else if (cmd.phase === 'endPeriod') {
            stateRef.current = endCurrentPeriod(stateRef.current);
```

- [ ] **Step 3: Botão e faixa na `TestScreen`**

- Import `import { PenaltyShootoutStrip } from "@/GameInterface/Components/PenaltyShootoutStrip";`.
- No bloco "Phase triggers", dentro do fragmento do `else` (depois do botão "→ Match End"):

```tsx
              {liveGameState?.knockout &&
                (liveGameState.matchPhase === 'secondHalf' ||
                 liveGameState.matchPhase === 'extraTimeFirst' ||
                 liveGameState.matchPhase === 'extraTimeSecond') && (
                <button
                  onClick={() => gameBus.emit('testCommand', { type: 'triggerPhase', phase: 'endPeriod' })}
                  className="px-2.5 py-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 transition-colors cursor-pointer text-xs font-semibold">
                  → End period ({liveGameState.matchPhase})
                </button>
              )}
              {liveGameState?.shootout && (
                <PenaltyShootoutStrip shootout={liveGameState.shootout} nameA="A" nameB="B" />
              )}
```

  Se `gameBus` não estiver importado na `TestScreen`, importe de `@/GameEngine/Infrastructure/EventBus`.
  Esconda o botão "→ Match End" em partidas mata-mata trocando sua condição para
  `(liveGameState?.matchPhase === 'secondHalf' && !liveGameState?.knockout)`.

- [ ] **Step 4: Painel de chance por cobrança**

Logo abaixo da faixa (ainda na `TestScreen`, mesmo bloco), adicione a lista de cobranças já mostradas
com a chance, visível só em modo debug (use a mesma variável `debug` que controla o botão Debug):

```tsx
              {debug && liveGameState?.shootout && (
                <div className="text-[10px] font-mono text-white/60 space-y-0.5">
                  {liveGameState.shootout.kicks.slice(0, liveGameState.shootout.shown).map((k, i) => (
                    <div key={i}>
                      {k.team} #{k.takerId} {(k.chance * 100).toFixed(0)}% {k.scored ? "✓" : "✗"}
                    </div>
                  ))}
                </div>
              )}
```

- [ ] **Step 5: quickSim mata-mata no painel**

Em `QuickSimPanel.tsx`:

- `function runOnce(knockout = false): QuickSimResult` e passe `knockout` no objeto de `quickSimMatch`.
- No componente: `const [knockout, setKnockout] = useState(false);`; os dois botões chamam
  `runOnce(knockout)` / `runBatch(500)` (e `runBatch` usa `runOnce(knockout)`).
- Ao lado dos botões:

```tsx
        <label className="flex items-center gap-1 text-xs text-white/70">
          <input type="checkbox" checked={knockout} onChange={(e) => setKnockout(e.target.checked)} />
          Mata-mata
        </label>
```

- No placar do último jogo, depois do `{AWAY.name}` na linha do placar:

```tsx
            {last.recording.decider?.penalties &&
              ` (pên. ${last.recording.decider.penalties.home}–${last.recording.decider.penalties.away})`}
            {last.recording.decider && !last.recording.decider.penalties && " (prorr.)"}
```

- [ ] **Step 6: Checar**

Run: `bunx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/GameEngine/Support/TestCases.ts src/GraficsEngine/PixiPitch.tsx src/GameInterface/TestScreen.tsx src/GameInterface/QuickSimPanel.tsx
git commit -m "feat(test): knockout scenario, end-period trigger, shootout debug, quickSim knockout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `/lab` — mata-mata e métricas

**Files:**
- Modify: `src/lab/types.ts`, `src/lab/balanceWorker.ts`, `src/lab/scenarioRunner.ts`, `src/lab/components/PairDetail.tsx`, `src/lab/components/ScenarioBuilder.tsx`

- [ ] **Step 1: Tipos**

Em `src/lab/types.ts`:

- `BalanceScenario`, depois de `simEngine?: SimEngine;`:
  `  /** Knockout matches (extra time + penalties). Defaults to false. */`
  `  knockout?: boolean;`
- `WorkerInput`, depois de `simEngine?: SimEngine;`: `  knockout?: boolean;`
- `TeamRawStats`, depois de `switchPlays: number;`:

```ts
  extraTimeMatches: number;
  shootoutsWon: number;
  penaltiesTaken: number;
  penaltiesScored: number;
```

- `PerMatchView` e `VariantSummary`, depois de `avgSwitchPlays: number;`:

```ts
  /** Share of matches that went to extra time (0–100). */
  extraTimePct: number;
  shootoutsWon: number;
  /** Shootout conversion (0–100). */
  penaltyConversionPct: number;
```

- [ ] **Step 2: Worker**

Em `balanceWorker.ts`:

- `emptyTeamRaw()`: acrescente `extraTimeMatches: 0, shootoutsWon: 0, penaltiesTaken: 0, penaltiesScored: 0,`.
- `const { variantA, variantB, matches, simEngine = "full", knockout = false } = e.data;`
- quickSim: passe `knockout` em `quickSimMatch({ ..., knockout })`; troque o bloco de vitórias por:

```ts
        const qd = q.recording.decider;
        if (qd) { teamA.extraTimeMatches++; teamB.extraTimeMatches++; }
        const qpA = qd?.penalties?.home ?? 0, qpB = qd?.penalties?.away ?? 0;
        if (qd?.penalties) { if (qpA > qpB) teamA.shootoutsWon++; else teamB.shootoutsWon++; }
        const homeWon = q.recording.score.home > q.recording.score.away || (qd?.penalties !== undefined && qpA > qpB);
        const awayWon = q.recording.score.away > q.recording.score.home || (qd?.penalties !== undefined && qpB > qpA);
        if (homeWon) teamA.wins++;
        else if (awayWon) teamB.wins++;
        else draws++;
```

  (o quickSim não conta cobranças individuais; `penaltiesTaken/Scored` ficam 0 nesse motor.)
- motor completo: `const r = simulateMatch(squadA, squadB, formationA, formationB, undefined, undefined, { knockout });`
  depois de `teamA.switchPlays += ...`:

```ts
      teamA.extraTimeMatches += sA.extraTimePlayed;  teamB.extraTimeMatches += sB.extraTimePlayed;
      teamA.shootoutsWon     += sA.shootoutsWon;     teamB.shootoutsWon     += sB.shootoutsWon;
      teamA.penaltiesTaken   += sA.penaltiesTaken;   teamB.penaltiesTaken   += sB.penaltiesTaken;
      teamA.penaltiesScored  += sA.penaltiesScored;  teamB.penaltiesScored  += sB.penaltiesScored;
```

  e o bloco de vitória:

```ts
      const winner = r.decider?.winner ?? (r.score.A > r.score.B ? "A" : r.score.B > r.score.A ? "B" : null);
      if (winner === "A") teamA.wins++;
      else if (winner === "B") teamB.wins++;
      else draws++;
```

- [ ] **Step 3: Runner**

Em `scenarioRunner.ts`:

- `perMatchView`: depois de `avgSwitchPlays: ...,`:

```ts
    extraTimePct: pct(t.extraTimeMatches, matches),
    shootoutsWon: t.shootoutsWon,
    penaltyConversionPct: pct(t.penaltiesScored, t.penaltiesTaken),
```

- `emptyTotals()`: `extraTimeMatches: 0, shootoutsWon: 0, penaltiesTaken: 0, penaltiesScored: 0,`
- `addInto`: 

```ts
  dst.extraTimeMatches += src.extraTimeMatches;
  dst.shootoutsWon     += src.shootoutsWon;
  dst.penaltiesTaken   += src.penaltiesTaken;
  dst.penaltiesScored  += src.penaltiesScored;
```

- `summarise`: depois de `avgSwitchPlays: ...,`:

```ts
    extraTimePct: pct(totals.extraTimeMatches, totals.games),
    shootoutsWon: totals.shootoutsWon,
    penaltyConversionPct: pct(totals.penaltiesScored, totals.penaltiesTaken),
```

- na chamada do worker (~linha 283): acrescente `knockout: scenario.knockout ?? false` ao objeto.

- [ ] **Step 4: Telas**

- `PairDetail.tsx`, no array `rows`, depois de `{ stat: "Switch passes", ... }`:

```ts
    { stat: "Extra time%",       key: "extraTimePct" },
    { stat: "Shootouts won",     key: "shootoutsWon" },
    { stat: "Penalty conv%",     key: "penaltyConversionPct" },
```

- `ScenarioBuilder.tsx`: `const [knockout, setKnockout] = useState<boolean>(draft?.knockout ?? false);`;
  depois do `<Field label="Engine">…</Field>`:

```tsx
          <Field label="Knockout">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={knockout} onChange={(e) => setKnockout(e.target.checked)} />
              Extra time + penalties
            </label>
          </Field>
```

  e no `onRun({ ... })`, depois de `simEngine,`: `knockout,`.

- [ ] **Step 5: Checar**

Run: `bunx tsc --noEmit -p . && bun test src/lab`
Expected: sem erros; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lab
git commit -m "feat(lab): knockout scenarios with extra-time, shootout and penalty metrics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: documentação e verificação final

**Files:**
- Modify: `.claude/rules/match-flow.md`, `.claude/rules/game-engine/shot-and-save.md`, `.claude/rules/non-player-games.md`

- [ ] **Step 1: Documentar**

- `match-flow.md`: nova seção "## Mata-mata (prorrogação e pênaltis)" descrevendo: `state.knockout`;
  sequência `secondHalf → extraTimeBreak → extraTimeFirst → extraTimeSecond → penalties → matchEnd`;
  `ET_HALF_DURATION = 900`, acréscimo 0–2 min, recuperação de energia ×0,5 no intervalo da
  prorrogação; `endCurrentPeriod` (relógio e `/test`); eventos `extraTimeStart`, `penaltyKick`,
  `shootoutEnd`, `matchEnd.decider`; `knockoutDecider`.
- `shot-and-save.md`: seção "## 8. Disputa de pênaltis" com a fórmula de `penaltyChance`, a tabela do
  `PENALTY_CONFIG`, a ordem dos batedores, a parada antecipada, as alternadas e o ~75% medido.
- `non-player-games.md` (seção quickSim): "Mata-mata: `input.knockout`; empate → prorrogação com
  xG do dia × 30/90 (gols pelo mesmo `assignGoals`) → `resolvePenaltyShootout` com os titulares;
  `recording.decider`".

- [ ] **Step 2: Verificação completa**

Run: `bunx tsc --noEmit -p .`
Expected: sem erros.

Run: `bun test`
Expected: todos passam (anote a contagem).

- [ ] **Step 3: Conferência manual no navegador (servidor em modo produção)**

Suba um servidor local em modo produção a partir de `C:\Projects\FMProject` (o servidor de dev quebra a
tela de partida — issue #4):

```powershell
$env:NODE_ENV = "production"; $env:PORT = "3001"; Start-Process bun -ArgumentList "src/index.ts" -WorkingDirectory "C:\Projects\FMProject"
```

Abra `http://localhost:3001/test`, escolha "11v11 — Knockout level at 90'", clique "→ End period" até a
disputa: confira overlay/placar "ET"/"PEN", a faixa de bolinhas e o fim da partida. No painel QuickSim,
marque "Mata-mata" e simule 500: nenhum empate. Encerre só o processo que você subiu (pelo PID).

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/match-flow.md .claude/rules/game-engine/shot-and-save.md .claude/rules/non-player-games.md
git commit -m "docs(engine): knockout matches, penalty shootout, quickSim knockout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Próximos planos (não fazem parte deste)

- **Plano 2 — domínio e integração das copas:** `src/Domain/cups/` (geração, sorteio, datas), `meta.kind`,
  `Fixture.decider/neutral`, `createSave`, virada do país, avanço do dia (partidas `knockout`, sorteio
  da fase seguinte, campeão), start kits, smoke.
- **Plano 3 — interface das copas:** tela `/cups/:country`, próximo jogo / `advance-until` /
  `match-setup` com copa, inbox `cup`, `seasonLog` por competição, i18n.
