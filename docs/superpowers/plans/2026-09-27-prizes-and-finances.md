# Premiação e finanças — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** salários em escala real (#12), extrato do caixa do jogador, bilheteria em copa/continental,
premiação por liga/copa/continental (jogador e IA) e a tela de Finanças lendo o extrato.

**Architecture:** lógica pura em `src/Domain/finance/` (salário, extrato, bilheteria, prêmios); a
camada de E/S (`SaveService`/DAL, `advanceDay`, `FinancialService`, rotas) só aplica. Todo movimento
de dinheiro do clube do jogador passa por `applyMoney` e vira lançamento no extrato; a IA recebe
prêmios na verba de transferências.

**Tech Stack:** Bun, TypeScript, React 19, Tailwind, i18next, `bun:test`.

Spec: `docs/superpowers/specs/2026-09-27-prizes-and-finances-design.md`. Branch `feat/prizes-finances`
(já contém a correção da #16). Regras: imports `@/`; Tailwind; ícones via `Icons.tsx`; i18n en +
pt-BR; commits por **pathspec** (`git commit -m "…" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`),
sem amend nem `git add -A`; nunca matar todos os processos `bun`; nunca commitar `src/Data`.

Contexto do código atual (levantado antes do plano):

- `estimateWeeklyWage(player) = overallAvg^2,2 × 50` (`src/Domain/aiFinance/aiClubFinance.ts`,
  constantes `WAGE_EXPONENT`/`WAGE_SCALE` em `aiFinanceConfig.ts`); nota 0–10.
- `Player.salaryLabel = nota² × 350` (`src/Domain/Player.ts`), usado em `playerHelpers.ts`.
- `FinancesScreen.tsx` repete a fórmula de salário (linhas ~20–27), inventa o gráfico semanal
  (~129–139) e tem um modelo de público próprio (~70–103; bug na média de seguidores ~228–230).
- `FinancialService.ts`: `TICKET_PRICE = 25`, `HOME_FILL_RATE = 0.65`, `calcWeeklyDelta`
  (comercial/52 − salários − 10% operacional), `calcMatchdayRevenue`, `applyBroadcasting` (TV na
  criação), `transferFeeSquads` (taxas; clamp ≥ 0).
- `src/Domain/advanceDay/financial.ts` `computeAdvanceDayMoneyDelta` (segunda-feira + jogo da liga
  em casa); aplicado em `advanceDay.ts` (~850–882) com `Math.max(0, …)`.
- Virada: `runSeasonTransition` → `applyPlayerBroadcastingCredit` (`seasonTransition.ts`), depois
  `applyTierFinanceChange`, `applyAISeasonReaction`/`applyHumanSeasonReaction`,
  `clubSeasonOutcome(standings, id, moves)` (`src/Domain/aiFinance/seasonReaction.ts`).
- IA: `maxWageBudget = weeklyBudget × 0,8`, `weeklyBudget = BASE_WEEKLY_BUDGET[tier] × (1 + pop/100) × SOFT_BALANCE[tier]`;
  `aiTransferBudget` com `applyAITransferSale` (50% da venda, teto 1,5× a verba sazonal).
- Copa: `advanceCupStages` (`src/backend/cupWorld.ts`) + `fixtureWinner`/`stageNameOf`.
  Continental: `advanceContinentalStages` → `ContinentalEvent` (`advanced`/`eliminated`/`champion`/`drawn`).
- `PUT /api/saves/:saveId/squad/:league/:club` (`routes.ts` ~191–213) aceita `finances` do cliente.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/Domain/finance/wageConfig.ts` | parâmetros da curva (preenchidos pela calibração) |
| `src/Domain/finance/wages.ts` (+ teste) | `weeklyWage(rating)`, `squadWeeklyWages(players)` |
| `scripts/wage-calibrate.ts` | calibração da curva e do orçamento da IA no mundo inteiro |
| `src/Domain/aiFinance/*` | `estimateWeeklyWage` delega; `maxWageBudget` pela receita |
| `src/Domain/finance/ledger.ts` (+ teste) | `LedgerEntry`, `applyMoney`, agregações (totais por tipo, saldo semanal) |
| `src/Domain/finance/gate.ts` (+ teste) | bilheteria por competição |
| `src/Domain/finance/prizeConfig.ts` / `prizes.ts` (+ teste) | tabelas e cálculo de prêmios |
| `src/backend/dal/*`, `SaveService.ts` | `readLedger`/`appendLedger` (bufferizado) |
| `src/backend/FinancialService.ts`, `advanceDay.ts`, `saves.ts`, `transfers.ts`, `routes.ts` | aplicação |
| `src/GameInterface/FinancesScreen.tsx` | tela a partir do extrato |
| `src/lab/*`, `src/GameInterface/*Test*`/`DebugPanel` | prorrogação/pênaltis em `/lab` e `/test` |
| `scripts/season-rollover-smoke.ts` | checagens |
| `.claude/rules/AI-clubs/finance.md`, `.claude/rules/game/finances.md` (novo) | documentação |

---

### Task 1: curva de salário e calibração

**Files:** Create `src/Domain/finance/wageConfig.ts`, `src/Domain/finance/wages.ts` (+ `wages.test.ts`),
`scripts/wage-calibrate.ts`.

- [ ] **Step 1: Teste da curva** (`wages.test.ts`):

```ts
import { describe, expect, test } from "bun:test";
import { weeklyWage } from "@/Domain/finance/wages";
import { WAGE_CONFIG } from "@/Domain/finance/wageConfig";

describe("weeklyWage", () => {
  test("monotonic in rating", () => {
    for (let r = 0; r < 10; r += 0.5) expect(weeklyWage(r + 0.5)).toBeGreaterThanOrEqual(weeklyWage(r));
  });
  test("floor for youngsters / very low ratings", () => {
    expect(weeklyWage(0)).toBe(WAGE_CONFIG.FLOOR);
  });
  test("whole euros", () => expect(Number.isInteger(weeklyWage(6.3))).toBe(true));
});
```

- [ ] **Step 2: Implementação**

```ts
// wageConfig.ts — valores iniciais; a Step 4 os substitui pelos calibrados.
export const WAGE_CONFIG = {
  /** weekly € = max(FLOOR, SCALE × e^(GROWTH × rating)) */
  SCALE: 150,
  GROWTH: 1.3,
  FLOOR: 1_500,
} as const;

// wages.ts
import { WAGE_CONFIG } from "@/Domain/finance/wageConfig";
import { Player } from "@/Domain/Player";
import type { RosterPlayer } from "@/types/playerTypes";

/** The single wage curve: a player's weekly wage in real euros from their 0–10 rating. */
export function weeklyWage(rating: number): number {
  return Math.round(Math.max(WAGE_CONFIG.FLOOR, WAGE_CONFIG.SCALE * Math.exp(WAGE_CONFIG.GROWTH * rating)));
}

export function playerWeeklyWage(p: RosterPlayer): number {
  return weeklyWage(Player.computeOverallAvg(p.stats));   // use the same rating estimateWeeklyWage uses today
}

export function squadWeeklyWages(players: RosterPlayer[]): number {
  return players.reduce((s, p) => s + playerWeeklyWage(p), 0);
}
```

  (Confira qual nota `estimateWeeklyWage` usa hoje — `overallAvg` do jogador — e use exatamente a
  mesma em `playerWeeklyWage`. Se a forma exponencial ajustar mal na Step 4, troque por lei de
  potência `SCALE × rating^GROWTH` e ajuste o teste.)

- [ ] **Step 3: Script** `scripts/wage-calibrate.ts` (lê `src/Data/squads/**` e `leagueData.json` +
  `pyramids.json` para o nível de cada liga):
  - receita anual do clube = `broadcasting + commercial + capacity × 0,65 × 25 × jogosEmCasa` (jogos
    em casa = clubes da liga − 1);
  - para uma grade de `(SCALE, GROWTH)` (ou mínimos quadrados em log), calcula a razão
    `52 × squadWeeklyWages / receita` por clube;
  - escolhe os parâmetros que deixam a **mediana por nível** (1, 2, 3+) mais perto de 0,60
    (minimiza a soma dos `(log mediana − log 0,60)²`);
  - imprime por liga (liga, nível, mediana, p10, p90) com a curva antiga e a nova, e o `FLOOR`
    sugerido (≈ o p10 do salário da 3ª divisão).
- [ ] **Step 4:** rodar `bun scripts/wage-calibrate.ts`, gravar os parâmetros em `wageConfig.ts`
  (comentário com a data e as medianas por nível), rodar os testes.
- [ ] **Step 5:** commit `feat(finance): real-euro wage curve calibrated on the world (#12)`.

### Task 2: salário único em todo lugar + orçamento da IA pela receita

**Files:** `src/Domain/aiFinance/aiClubFinance.ts`, `aiFinanceConfig.ts` (+ testes),
`src/Domain/Player.ts` (`salaryLabel`), `src/GameInterface/playerHelpers.ts`,
`src/GameInterface/FinancesScreen.tsx` (só a fórmula local), `scripts/wage-calibrate.ts`.

- [ ] **Step 1:** `estimateWeeklyWage(p)` passa a ser `playerWeeklyWage(p)`; remova
  `WAGE_EXPONENT`/`WAGE_SCALE`. `Player.salaryLabel` formata `weeklyWage` (semanal, mesmo formato de
  hoje). A cópia local do `FinancesScreen` importa `playerWeeklyWage`.
- [ ] **Step 2: Teste** (em `aiClubFinance.test.ts`): `maxWageBudget` de um clube com receita R é
  `≈ 0,70 × R / 52 × SOFT_BALANCE[tier]` (± arredondamento); `weeklyBudget = maxWageBudget / 0,8`.
- [ ] **Step 3: Implementação:** `clubAnnualRevenue(squad) = broadcasting + commercial` (+ bilheteria
  estimada, mesma do script) em `aiClubFinance.ts`; `maxWageBudget` usa a receita no lugar de
  `BASE_WEEKLY_BUDGET` (constante `WAGE_REVENUE_SHARE = 0.70` em `aiFinanceConfig.ts`; remova
  `BASE_WEEKLY_BUDGET` se nada mais usar). Ajuste os testes antigos que dependiam dos valores.
- [ ] **Step 4:** estenda o script para imprimir a distribuição de `hiring` (open/tight/frozen) no
  mundo inicial com a regra nova; se ficar longe de ~92/5/3%, ajuste `WAGE_REVENUE_SHARE` e anote.
- [ ] **Step 5:** `bunx tsc --noEmit -p .`, `bun test src/Domain src/backend`; commit
  `feat(ai-finance): one wage everywhere; wage budget from revenue (#12)`.

### Task 3: extrato (domínio + persistência)

**Files:** Create `src/Domain/finance/ledger.ts` (+ teste); Modify o DAL (`src/backend/dal/*`:
`ISaveDAL`, `FileSystemDAL`, `BufferingSaveDAL`) e `SaveService.ts`.

- [ ] **Step 1: Tipos e funções puras**

```ts
export type LedgerKind =
  | "broadcasting" | "commercial" | "wages" | "operational"
  | "gate" | "prize" | "transfer_in" | "transfer_out";

export interface LedgerEntry {
  date: string;          // YYYY-MM-DD
  kind: LedgerKind;
  amount: number;        // signed euros
  label: string;         // e.g. "Champions League · Quartas", "Premier League · 3º lugar"
  ref?: { competition?: string; stage?: string; opponentId?: string; playerId?: string };
}

/** Pure: new squad with the budget moved by entry.amount (no clamp — the balance may go negative). */
export function applyMoney(squad: Squad, entry: LedgerEntry): Squad;
/** Totals per kind (income positive, expenses negative). */
export function totalsByKind(entries: LedgerEntry[]): Record<LedgerKind, number>;
/** Net per ISO week (Monday-start), oldest → newest. */
export function weeklyNet(entries: LedgerEntry[]): { weekStart: string; net: number }[];
```

  Testes: `applyMoney` soma e deixa negativo; `totalsByKind`; `weeklyNet` agrupa por segunda-feira.
- [ ] **Step 2: Persistência:** `saves/{id}/ledger/{season}.json` (array). No `ISaveDAL`:
  `readLedger(saveId, season)` e `appendLedger(saveId, season, entries)`; o `BufferingSaveDAL`
  acumula os `append` do dia e grava no `flush` (fase 1, antes da meta — ver
  `.claude/rules/game/membership.md` "Ordem do flush"); `SaveService` expõe os dois. Teste: dois
  `append` no mesmo dia bufferizado viram um arquivo com as duas entradas depois do flush; nada é
  gravado se o flush não acontecer.
- [ ] **Step 3:** helper de E/S `recordMoney(service, saveId, season, squadRef, entry)` em
  `src/backend/FinancialService.ts`: aplica `applyMoney`, grava o squad e faz `appendLedger`.
  A temporada do extrato = `year` da meta da liga do jogador.
- [ ] **Step 4:** commit `feat(finance): club ledger (pure + buffered persistence)`.

### Task 4: todo dinheiro do jogador pelo extrato; bilheteria em copa/continental; brecha

**Files:** `src/Domain/finance/gate.ts` (+ teste), `src/Domain/advanceDay/financial.ts` (+ teste),
`src/backend/advanceDay.ts`, `src/backend/FinancialService.ts`, `src/backend/saves.ts`,
`src/backend/transfers.ts`, `src/backend/routes.ts`, `src/Domain/season/seasonTransition.ts`,
inbox (`src/Domain/inbox/inboxEvents.ts` + tela, i18n).

- [ ] **Step 1: Bilheteria pura** (`gate.ts`):

```ts
export const GATE = { TICKET_PRICE: 25, FILL_RATE: 0.65, CONTINENTAL_MULT: 2 } as const;
/** Home gate for a fixture of the given competition kind; 0 on a neutral venue or away. */
export function gateRevenue(capacity: number, kind: "league" | "cup" | "continental", neutral = false): number {
  if (neutral || capacity <= 0) return 0;
  const price = GATE.TICKET_PRICE * (kind === "continental" ? GATE.CONTINENTAL_MULT : 1);
  return Math.round(capacity * GATE.FILL_RATE * price);
}
```

  `FinancialService.calcMatchdayRevenue` passa a chamar `gateRevenue(cap, "league")` (mesmo valor de
  hoje). Testes para os três tipos e o neutro.
- [ ] **Step 2: Movimentos do dia viram lançamentos:** `computeAdvanceDayMoneyDelta` vira
  `computeAdvanceDayMoney(args) → LedgerEntry[]` (segunda: `commercial` +, `wages` −, `operational`
  −, cada um num lançamento; cada jogo em casa do jogador **de qualquer competição** hoje: `gate` +
  com o rótulo da competição). Em `advanceDay.ts`, colete as fixtures do jogador de hoje em todas as
  competições (liga, copa, continental — o `date-index` de todas as pastas já é lido), aplique com
  `recordMoney` e **remova o `Math.max(0, …)`**.
- [ ] **Step 3: TV e transferências:** `applyBroadcasting` (criação) e
  `applyPlayerBroadcastingCredit` (virada) gravam `broadcasting` no extrato; `transferFeeSquads`
  grava `transfer_in`/`transfer_out` para o jogador (a IA segue só na verba) e perde o clamp ≥ 0 do
  lado do jogador.
- [ ] **Step 4: Caixa negativo:** quando o saldo do jogador cruza de ≥ 0 para < 0 num dia, mande uma
  mensagem na inbox (categoria `season`, kind novo `negative_balance`, texto en/pt-BR).
- [ ] **Step 5: Brecha:** o `PUT` do squad descarta `finances` do corpo (teste de rota: um PUT com
  `finances.budget` não muda o orçamento).
- [ ] **Step 6: Teste integrado** (`src/backend/finance.ledger.test.ts`): save novo → extrato tem a TV;
  avançar até uma segunda-feira → 3 lançamentos semanais; soma do extrato = orçamento atual;
  um jogo continental em casa do jogador rende `gate` 2×.
- [ ] **Step 7:** `bunx tsc --noEmit -p .`, `bun test src/backend src/Domain`; commit
  `feat(finance): every player money move goes through the ledger; cup/continental gate`.

### Task 5: premiação (domínio)

**Files:** Create `src/Domain/finance/prizeConfig.ts`, `src/Domain/finance/prizes.ts` (+ teste).

- [ ] **Step 1: Config**

```ts
export const LEAGUE_PRIZE = { MERIT_SHARE: 0.20, CHAMPION_SHARE: 0.05 } as const;

/** Cup: fraction of the country's tier-1 mean broadcasting paid for WINNING a stage. */
export const CUP_STAGE_SHARE: Record<CupStageName, number> = {
  preliminary: 0.003, r128: 0.003, r64: 0.003, r32: 0.005, r16: 0.008, qf: 0.011, sf: 0.015,
  final: 0.04,   // winning the final (champion)
};
export const CUP_RUNNER_UP_SHARE = 0.02;

export const CONTINENTAL_PRIZE: Record<ContinentalSlug, {
  participation: number; groupWin: number; groupDraw: number;
  r16: number; qf: number; sf: number; final: number; title: number;
}> = {
  ucl: { participation: 15e6, groupWin: 2.8e6, groupDraw: 0.9e6, r16: 9e6, qf: 10e6, sf: 12e6, final: 15e6, title: 4e6 },
  uel: { participation: 4e6, groupWin: 0.6e6, groupDraw: 0.2e6, r16: 1.2e6, qf: 1.8e6, sf: 2.8e6, final: 4.5e6, title: 4e6 },
  lib: { participation: 3e6, groupWin: 0.3e6, groupDraw: 0.1e6, r16: 1.2e6, qf: 1.7e6, sf: 2.3e6, final: 5e6, title: 17e6 },
  sud: { participation: 1e6, groupWin: 0.1e6, groupDraw: 0.05e6, r16: 0.5e6, qf: 0.6e6, sf: 0.8e6, final: 1.5e6, title: 5e6 },
};
export const AI_PRIZE_SHARE = 0.5;
```

  (`CupStageName` / `ContinentalSlug` de `src/types/calendarTypes.ts`.)
- [ ] **Step 2: Funções puras + testes**

```ts
/** League merit (paid at rollover): position 1..n. */
export function leaguePrize(broadcasting: number, position: number, n: number): number {
  if (n < 2) return 0;
  const merit = broadcasting * LEAGUE_PRIZE.MERIT_SHARE * (n - position) / (n - 1);
  const title = position === 1 ? broadcasting * LEAGUE_PRIZE.CHAMPION_SHARE : 0;
  return Math.round(merit + title);
}
/** Cup: prize for winning `stage` (final = champion); runner-up gets cupRunnerUpPrize. */
export function cupStagePrize(tier1MeanBroadcasting: number, stage: CupStageName): number;
export function cupRunnerUpPrize(tier1MeanBroadcasting: number): number;
/** Continental: amount for one event kind. */
export function continentalPrize(slug: ContinentalSlug,
  what: "participation" | "groupWin" | "groupDraw" | "r16" | "qf" | "sf" | "final" | "title"): number;
/** AI share, capped: returns the new aiTransferBudget. */
export function aiBudgetWithPrize(current: number, prize: number, seasonalGrant: number): number {
  const cap = 1.5 * seasonalGrant;
  if (current >= cap) return current;
  return Math.min(cap, current + Math.round(prize * AI_PRIZE_SHARE));
}
```

  Testes: 1º/último/meio da liga; n = 1; campeão da copa recebe só `final`; vice recebe o valor de
  vice; valores continentais; teto da IA (inclusive verba já acima do teto não diminui).
- [ ] **Step 3:** commit `feat(finance): prize tables and pure prize maths`.

### Task 6: premiação (aplicação)

**Files:** `src/backend/advanceDay.ts`, `src/backend/continentalWorld.ts`, `src/backend/cupWorld.ts`,
`src/Domain/aiFinance/seasonReaction.ts` (+ testes), inbox builders/tela/i18n.

- [ ] **Step 1: Liga (virada):** no laço por clube da virada (onde já estão
  `applyPlayerBroadcastingCredit` e `clubSeasonOutcome`), para cada clube da liga que virou: posição
  final na tabela arquivada → `leaguePrize`; jogador: `recordMoney` (`prize`, rótulo
  "<liga> · Nº lugar"); IA: `aiBudgetWithPrize` **depois** de `applyAISeasonReaction` (que reconcede
  a verba da temporada nova — o prêmio entra em cima da verba nova).
- [ ] **Step 2: Copa (dia):** para cada fixture de copa jogada hoje, o vencedor
  (`fixtureWinner`) ganha `cupStagePrize(base, stage)`; na final, o perdedor ganha
  `cupRunnerUpPrize`. `base` = média da TV dos clubes da liga de nível 1 do país (helper em
  `cupWorld.ts`, com cache por dia). Jogador → extrato; IA → `aiBudgetWithPrize` (grava o squad).
- [ ] **Step 3: Continental (dia):**
  - participação: quando a rodada 1 dos grupos é jogada hoje, cada um dos 32 clubes recebe
    `participation`;
  - vitória/empate: para cada jogo de grupo (rodadas 1–6) jogado hoje;
  - fases: evento `advanced` com `stage` = grupo → `r16`, r16 → `qf`, qf → `sf`, sf → `final`
    (mapeie o evento para a fase **alcançada**); título: evento `champion`.
  - Jogador → extrato; IA → verba.
- [ ] **Step 4: Boa temporada:** `clubSeasonOutcome` (ou o chamador) recebe um conjunto de clubes com
  título ou final continental na temporada (lido das metas continentais arquivadas/atuais) e os
  trata como `good` (mesmo peso do top 15%). Teste unitário.
- [ ] **Step 5: Inbox com valores:** as mensagens existentes de fim de temporada (liga), eliminação
  e título de copa/continental, e a de classificação às oitavas continental, ganham um campo
  `prize?: number` mostrado na tela ("+ €12,0M"); en/pt-BR. Se a mensagem sai no dia, o valor é o
  pago naquele dia.
- [ ] **Step 6: Teste integrado:** save novo com um clube que se classifica para a Champions: jogar
  a rodada 1 (via `advanceOneDay` na data) → extrato tem `participation` + vitória/empate; um clube
  da IA na mesma rodada tem a verba aumentada em 50% do prêmio (respeitando o teto).
- [ ] **Step 7:** `bunx tsc --noEmit -p .`, `bun test src/backend src/Domain`; commit
  `feat(finance): league, cup and continental prizes for the player and the AI`.

### Task 7: rota do extrato e tela de Finanças

**Files:** `src/backend/routes.ts` (+ teste), `src/GameInterface/FinancesScreen.tsx`, i18n.

- [ ] **Step 1: Rota** `GET /api/saves/:saveId/ledger?season=YYYY` (dono do save; sem `season` =
  temporada atual; 404 sem extrato) → `{ season, entries, totals: totalsByKind, weekly: weeklyNet, balance }`.
  Teste de rota.
- [ ] **Step 2: Tela:**
  - cartões: saldo, receita da temporada, despesa da temporada, prêmios da temporada (de `totals`);
  - gráfico do saldo semanal real (`weekly`, últimas 12 semanas) — remova as senoides;
  - "Receitas" e "Despesas" por tipo a partir de `totals` (TV, comercial, bilheteria, prêmios,
    vendas / salários, operacional, compras);
  - lista do extrato (mais novo primeiro) com filtro por tipo;
  - projeção de bilheteria com `gateRevenue` (remova o modelo de público paralelo e o bug da média
    de seguidores);
  - aviso de saldo negativo;
  - salários do elenco via `playerWeeklyWage`.
- [ ] **Step 3:** `bunx tsc --noEmit -p .`; commit `feat(ui): finances screen reads the ledger`.

### Task 8: `/lab` e `/test` com resultados de copa

**Files:** `src/lab/types.ts`, `src/lab/balanceWorker.ts`, `src/lab/scenarioRunner.ts`, um componente
de exibição (`PairDetail`), e o painel do `/test` (`DebugPanel`/`StatsPanel`).

- [ ] **Step 1:** leia como `extraTimePlayed`/`shootoutsWon` (`Statistics.ts`) chegam ao
  `simulateMatch().teamStats`. Em `/lab`: um variante pode rodar `knockout: true` (campo opcional no
  cenário, default falso); agregue prorrogações e pênaltis vencidos em `TeamRawStats` →
  `PerMatchView`/`VariantSummary` → uma linha no `PairDetail`.
- [ ] **Step 2:** em `/test`, o painel de estatísticas mostra "Prorrogação" e "Pênaltis" quando a
  partida teve.
- [ ] **Step 3:** `bunx tsc --noEmit -p .`; commit `feat(lab): knockout results in /lab and /test`.

### Task 9: smoke, kits, documentação

- [ ] **Step 1:** `scripts/season-rollover-smoke.ts`: seção "Finanças": a soma do extrato do jogador
  (todas as temporadas) = orçamento final − orçamento de antes da TV inicial; há pelo menos um
  lançamento `prize` de liga na virada; algum clube da IA com campanha continental teve a verba
  aumentada; nenhuma verba da IA acima de 1,5× a concessão sazonal.
- [ ] **Step 2:** rodar o smoke com a ferramenta Bash em `run_in_background: true` e esperar o fim
  (~10 min); tudo PASS.
- [ ] **Step 3:** regenerar os kits (`cp src/example_data/roles.json src/Data/roles.json`,
  `bun run kits:generate 5`, `rm -f src/example_data/startKits/* && cp src/Data/startKits/* src/example_data/startKits/`).
- [ ] **Step 4: Docs:** `.claude/rules/game/finances.md` (novo: curva de salário e calibração,
  extrato, bilheteria, premiação, caixa negativo, tela); atualizar
  `.claude/rules/AI-clubs/finance.md` (orçamento de salário pela receita, prêmios na verba, boa
  temporada continental, números da calibração); `docs/ROADMAP.md` (Etapa 3 ✅, "Onde estamos").
- [ ] **Step 5:** `bunx tsc --noEmit -p .` e `bun test`; commits
  `feat(finance): smoke checks and docs` e `data: regenerate start kits`.
