# Continentais — Plano 1: agregado (ida e volta) no motor/quickSim + issue #2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a partida de volta de um mata-mata decide pelo agregado (prorrogação/pênaltis só com
ida+volta empatados) no motor, no quickSim e no avanço do dia; e o quickSim volta a ficar a ±15% do
motor em gols em todas as ligas (issue #2), com uma checagem nova de jogos entre ligas.

**Architecture:** `GameState.aggregate` / `QuickSimInput.aggregate` / `Fixture.aggregate` carregam os
gols da ida do ponto de vista do jogo atual; a regra "empatado" passa a somar o agregado num único
helper em cada camada. A recalibração é trabalho de dados com os scripts que já existem
(`scripts/quicksim-spread.ts`), mais um script novo de jogos entre ligas.

**Tech Stack:** Bun, TypeScript, `bun:test`.

Spec: `docs/superpowers/specs/2026-09-26-continental-competitions-design.md` (seções 2 e 3). Branch:
`feat/continental`. Regras: imports com `@/`; commits com
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca mate todos os processos `bun`;
`git add` só com caminhos explícitos; nunca commite `src/Data`.

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `src/GameEngine/types.ts` | `GameState.aggregate?` |
| `src/GameEngine/Domain/gameState.ts` | `isLevelForKnockout`, `endCurrentPeriod`/`knockoutDecider` com agregado |
| `src/GameEngine/Domain/SimulateMatch.ts` | opção `aggregate` |
| `src/GameEngine/Domain/knockout.test.ts`, `SimulateMatch.test.ts` | testes |
| `src/Domain/advanceDay/quickSim.ts` (+ teste) | `input.aggregate` |
| `src/types/calendarTypes.ts` | `Fixture.aggregate?`, `leg?`, `tieId?` |
| `src/Domain/advanceDay/matches.ts` (+ teste) | repassa o agregado da fixture |
| `src/backend/advanceDay.ts` | validação da gravação usa o agregado |
| `src/GameInterface/MatchScreen.tsx` | estado com o agregado da fixture (lado A = jogador) |
| `scripts/quicksim-crossleague.ts` | **novo** — motor × quickSim entre ligas |
| `src/GameEngine/Configs/QuickSimConfig.ts` | constantes recalibradas (#2) |
| `.claude/rules/non-player-games.md`, `.claude/rules/match-flow.md` | documentação |

---

### Task 1: agregado no motor

**Files:** `src/GameEngine/types.ts`, `src/GameEngine/Domain/gameState.ts`,
`src/GameEngine/Domain/SimulateMatch.ts`, testes `knockout.test.ts` e `SimulateMatch.test.ts`.

- [ ] **Step 1: Testes** — em `src/GameEngine/Domain/knockout.test.ts` (use o helper `base` do arquivo):

```ts
describe("aggregate (second leg)", () => {
  test("level on the day but ahead on aggregate → match ends, no extra time", () => {
    const s = endCurrentPeriod({ ...base(true, { A: 1, B: 1 }), aggregate: { A: 2, B: 0 } });
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toBeNull();
  });
  test("aggregate level (2–1 today after 0–1 away) → extra time", () => {
    const s = endCurrentPeriod({ ...base(true, { A: 1, B: 0 }), aggregate: { A: 0, B: 1 } });
    expect(s.matchPhase).toBe("extraTimeBreak");
  });
  test("aggregate level after extra time → penalties; winner from the shootout", () => {
    let s = endCurrentPeriod({ ...base(true, { A: 1, B: 0 }), aggregate: { A: 0, B: 1 } });
    s = endCurrentPeriod({ ...s, matchPhase: "extraTimeSecond" });
    expect(s.matchPhase).toBe("penalties");
  });
  test("extra-time goal wins on aggregate; decider winner uses the aggregate", () => {
    let s = endCurrentPeriod({ ...base(true, { A: 1, B: 0 }), aggregate: { A: 0, B: 1 } });
    s = endCurrentPeriod({ ...s, matchPhase: "extraTimeSecond", score: { A: 1, B: 1 } });
    expect(s.matchPhase).toBe("matchEnd");
    // today 1–1 after 0–1 away: aggregate A 1, B 2 → B wins
    expect(knockoutDecider(s)!.winner).toBe("B");
  });
});
```

Em `SimulateMatch.test.ts`, acrescente: `simulateMatch(squad, squad, undefined, undefined, undefined,
undefined, { knockout: true, aggregate: { A: 3, B: 0 } })` em 4 jogos — `r.decider` é `null` sempre
que `r.score.B - r.score.A < 3`, e quando `r.decider` existe, `r.score.B - r.score.A === 3`.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

`types.ts`, no `GameState`, depois de `knockout?: boolean;`:

```ts
  /** Second leg of a two-legged tie: first-leg goals per side of THIS match. Level = score + aggregate. */
  aggregate?: { A: number; B: number };
```

`gameState.ts`, perto de `knockoutDecider`:

```ts
/** Knockout "level": today's score plus the first-leg aggregate (if any). */
function isLevelForKnockout(s: GameState): boolean {
  const agg = s.aggregate ?? { A: 0, B: 0 };
  return s.score.A + agg.A === s.score.B + agg.B;
}
```

- `endCurrentPeriod`: `case 'secondHalf'` troca `s.knockout && s.score.A === s.score.B` por
  `s.knockout && isLevelForKnockout(s)`; `case 'extraTimeSecond'` troca `s.score.A === s.score.B` por
  `isLevelForKnockout(s)`.
- `knockoutDecider`: o vencedor sem pênaltis passa a ser pelo total:

```ts
  const agg = state.aggregate ?? { A: 0, B: 0 };
  const winner: TeamId = so ? so.winner : (state.score.A + agg.A > state.score.B + agg.B ? 'A' : 'B');
```

`SimulateMatch.ts`: `SimulateMatchOptions` ganha `aggregate?: { A: number; B: number };` e o estado
inicial recebe `...(options.aggregate ? { aggregate: options.aggregate } : {})`.

- [ ] **Step 4: Rodar** — `bun test src/GameEngine` → PASS.
- [ ] **Step 5: Commit** (`feat(engine): two-legged ties — knockout level uses the aggregate`).

---

### Task 2: agregado no quickSim

**Files:** `src/Domain/advanceDay/quickSim.ts`, `src/Domain/advanceDay/quickSim.test.ts`.

- [ ] **Step 1: Teste** (reusa `makeSquad`, `lineupOf`, `mulberry32` do arquivo):

```ts
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
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `QuickSimInput` ganha
  `aggregate?: { home: number; away: number };` (doc: first-leg goals, home/away of THIS match).
  No bloco do mata-mata:

```ts
  const agg = input.aggregate ?? { home: 0, away: 0 };
  const levelNow = () => goalsHome + agg.home === goalsAway + agg.away;
  if (input.knockout && levelNow()) {
    // …prorrogação como já existe…
    if (levelNow()) { /* …pênaltis como já existe… */ }
  }
```

  (troque as duas comparações `goalsHome === goalsAway` do bloco por `levelNow()`; a ordem do `rng`
  não muda.)
- [ ] **Step 4: Rodar** — `bun test src/Domain/advanceDay` → PASS.
- [ ] **Step 5: Commit** (`feat(quicksim): two-legged ties use the aggregate`).

---

### Task 3: fixture, montagem da partida, gravação e tela

**Files:** `src/types/calendarTypes.ts`, `src/Domain/advanceDay/matches.ts` (+
`matches.quick.test.ts`), `src/backend/advanceDay.ts`, `src/GameInterface/MatchScreen.tsx`.

- [ ] **Step 1: Tipo** — `Fixture` ganha, depois de `decider?`:

```ts
  /** Two-legged tie id (same on both legs). */
  tieId?:      string;
  /** 1 = first leg, 2 = second leg (knockout, decides on aggregate). */
  leg?:        1 | 2;
  /** Second leg only: first-leg goals from THIS fixture's home/away point of view. */
  aggregate?:  { home: number; away: number };
```

- [ ] **Step 2: Teste** — em `matches.quick.test.ts`: fixture `{ ...fixture, knockout: true,
  aggregate: { home: 0, away: 1 } }` em 300 seeds → quando `event.decider` existe,
  `score.home - score.away === 1` após subtrair a prorrogação (mesma conta do Task 2).
- [ ] **Step 3: Implementar**
  - `buildMatchEvent`: opções do motor ganham
    `...(fixture.aggregate ? { aggregate: { A: fixture.aggregate.home, B: fixture.aggregate.away } } : {})`
    (A = mandante, confirmado no Plano 2 das copas).
  - `buildQuickMatchEvent`: repassa `aggregate: fixture.aggregate`.
  - `advanceDay.ts`, validação da gravação de mata-mata (`knockout recording without a winner`):
    "empatado" passa a ser `result.home + (fixture.aggregate?.home ?? 0) === result.away + (fixture.aggregate?.away ?? 0)`.
  - `MatchScreen.tsx`: o jogador é o lado A. No estado:

```ts
          ...(data.fixture.aggregate
            ? { aggregate: data.fixture.home === data.mySquadId
                  ? { A: data.fixture.aggregate.home, B: data.fixture.aggregate.away }
                  : { A: data.fixture.aggregate.away, B: data.fixture.aggregate.home } }
            : {}),
```

- [ ] **Step 4: Rodar** — `bun test src/Domain src/backend` e `bunx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** (`feat(match): fixtures carry the first-leg aggregate end to end`).

---

### Task 4: script de jogos entre ligas

**Files:** Create `scripts/quicksim-crossleague.ts`.

- [ ] **Step 1: Script**

```ts
/**
 * Engine vs quickSim on CROSS-league matches (continental ties): for every pair of clubs
 * (top `n` of league A × top `n` of league B, both venues), `repeats` engine matches and
 * `quickRepeats` quickSim matches. Prints, per engine: stronger-side (higher teamLevel) win /
 * draw / loss rates and goals per match, and the gap between the engines.
 *
 *   bun scripts/quicksim-crossleague.ts <leagueA> <leagueB> [n=6] [repeats=4] [quickRepeats=50]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { quickSimMatch, teamLevel, teamStrength } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";

const [leagueA, leagueB, nArg, repArg, qArg] = process.argv.slice(2);
if (!leagueA || !leagueB) throw new Error("usage: quicksim-crossleague <leagueA> <leagueB> [n] [repeats] [quickRepeats]");
const N = Number(nArg ?? 6), REPEATS = Number(repArg ?? 4), QUICK = Number(qArg ?? 50);

const SQUADS = fileURLToPath(new URL("../src/Data/squads/", import.meta.url));
const FORMATION = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const ROLES = slotRoles(FORMATION);

function load(league: string): Squad[] {
  return readdirSync(join(SQUADS, league)).filter((f) => f.endsWith(".json")).map((f) => {
    const s = JSON.parse(readFileSync(join(SQUADS, league, f), "utf8")) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: p.seasonLog ?? emptySeasonLog() })) };
  });
}
const level = (s: Squad) => teamLevel(teamStrength(s.players.filter((p) => autoLineupDefaultFormation(s).includes(p.id)), ROLES));
const top = (league: string) => load(league).map((s) => ({ s, lv: level(s) })).sort((a, b) => b.lv - a.lv).slice(0, N);

type Tally = { w: number; d: number; l: number; goals: number; n: number };
const empty = (): Tally => ({ w: 0, d: 0, l: 0, goals: 0, n: 0 });
const add = (t: Tally, strongGoals: number, weakGoals: number) => {
  t.n++; t.goals += strongGoals + weakGoals;
  if (strongGoals > weakGoals) t.w++; else if (strongGoals < weakGoals) t.l++; else t.d++;
};

const engine = empty(), quick = empty();
let seed = 1;
for (const a of top(leagueA)) for (const b of top(leagueB)) for (const [home, away] of [[a, b], [b, a]] as const) {
  const strongIsHome = home.lv >= away.lv;
  const lh = autoLineupDefaultFormation(home.s), la = autoLineupDefaultFormation(away.s);
  for (let r = 0; r < REPEATS; r++) {
    const m = simulateMatch(home.s, away.s, FORMATION, FORMATION, lh, la);
    strongIsHome ? add(engine, m.score.A, m.score.B) : add(engine, m.score.B, m.score.A);
  }
  for (let r = 0; r < QUICK; r++) {
    const { recording } = quickSimMatch(
      { fixtureId: "x", home: home.s, away: away.s, homeLineup: lh, awayLineup: la, homeRoles: ROLES, awayRoles: ROLES },
      mulberry32(seed++),
    );
    strongIsHome ? add(quick, recording.score.home, recording.score.away) : add(quick, recording.score.away, recording.score.home);
  }
}

const row = (name: string, t: Tally) =>
  `${name.padEnd(9)} n=${String(t.n).padStart(5)}  strong W ${(100 * t.w / t.n).toFixed(1)}%  D ${(100 * t.d / t.n).toFixed(1)}%  L ${(100 * t.l / t.n).toFixed(1)}%  goals ${(t.goals / t.n).toFixed(2)}`;
console.log(`${leagueA} × ${leagueB} (top ${N} each, both venues)`);
console.log(row("engine", engine));
console.log(row("quickSim", quick));
console.log(`gap: strong-win ${(100 * (quick.w / quick.n - engine.w / engine.n)).toFixed(1)} pp, goals ${((quick.goals / quick.n) / (engine.goals / engine.n) * 100 - 100).toFixed(1)}%`);
```

  Confira os nomes exportados de `quickSim.ts` (`teamLevel`, `teamStrength(players, roles)`) e de
  `matchSimulationLineups` (`autoLineupDefaultFormation`, `slotRoles`) — são os que o
  `QuickSimPanel.tsx` e o `quickSim.test.ts` usam; ajuste se a assinatura for diferente.
- [ ] **Step 2: Rodar um par** — `bun scripts/quicksim-crossleague.ts premier_league of_eredivisie 4 2 20`
  → imprime as três linhas sem erro.
- [ ] **Step 3: Commit** (`chore(quicksim): cross-league engine vs quickSim check`).

---

### Task 5: recalibração do quickSim (#2)

Trabalho de dados; siga `.claude/rules/non-player-games.md` → "Como recalibrar". Tudo com o motor
**atual** (depois das Tasks 1–3, que não mudam ligas).

- [ ] **Step 1: Coletar** — 26 ligas (as da tabela "Volume de gols" em `non-player-games.md`), em
  paralelo (6–8 por vez, em background), num diretório de scratch **fora do repositório**:

```bash
bun scripts/quicksim-spread.ts collect premier_league 200 2 <SCRATCH>/qs/premier_league.json
# … idem para as outras 25 ligas
```

- [ ] **Step 2: Analisar** — `bun scripts/quicksim-spread.ts analyze <SCRATCH>/qs` → anote o erro por
  liga com as constantes atuais e a seção 8 (reajuste da fórmula inteira).
- [ ] **Step 3: Aplicar** — se alguma liga passa de ±15% (ou o rms piora em relação ao 6,5% da última
  calibração), atualize em `src/GameEngine/Configs/QuickSimConfig.ts` as constantes da seção 8
  (`BASE_GOALS`, `STRENGTH_EXPONENT`, `LEVEL_EXPONENT`, `PACE_EDGE_WEIGHT`, `HOME_ADVANTAGE`) e rode
  `analyze` de novo até todas as ligas ficarem a ±15%. Depois
  `bun scripts/quicksim-spread.ts events <SCRATCH>/qs --apply` três vezes.
- [ ] **Step 4: Entre ligas** — rode `scripts/quicksim-crossleague.ts` para
  `premier_league of_eredivisie`, `la_liga of_portuguese_primeira_liga`,
  `brazil_serie_a of_argentine_premier_division`, `bundesliga of_danish_superliga` (n=6, repeats=4,
  quick=50). Meta: diferença na vitória do mais forte ≤ 6 p.p. e em gols ≤ 15%. Se passar, verifique
  se o termo de nível (`LEVEL_EXPONENT`) está achatando a diferença entre ligas e registre.
- [ ] **Step 5: Testes** — `bun test` → tudo passa (os testes do quickSim usam constantes; ajuste só
  expectativas numéricas que dependem diretamente das constantes, justificando).
- [ ] **Step 6: Documentar** — em `non-player-games.md`, nova subseção "Recalibração de 2026-09-26
  (após a recalibração dos craques)" com a tabela motor × quickSim antes/depois por liga, as
  constantes novas, e a tabela das checagens entre ligas.
- [ ] **Step 7: Commit** (`fix(quicksim): recalibrate goal volume after the star recalibration (#2)`)
  — só `QuickSimConfig.ts` e a doc (nunca os caches).

---

### Task 6: documentação e verificação

- [ ] `.claude/rules/match-flow.md` (seção de mata-mata): `aggregate` e a regra do "empatado".
- [ ] `bunx tsc --noEmit -p .` e `bun test` → tudo passa.
- [ ] Commit (`docs(engine): two-legged ties`).
