# Torneios de base e reservas (Etapa 36) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada país ganha um sub-21 e um sub-19 com os clubes da liga de nível 1, em turno e returno, uma rodada por semana num dia de meio de semana sem jogo do time principal, simulados no quickSim com escalação automática (jovens, reservas sem minutos, base do clube do jogador e convocações; a IA completa com jovens gerados), com efeito em DP, fôlego/carga, moral (clube do jogador) e lesões, tabela e destaques na aba Base de Ligas e os jogos no Painel e na ficha.

**Architecture:** lógica pura em `src/Domain/youthComps/` (slugs, calendário, geração, escalação, pós-jogo); `src/backend/youthCompWorld.ts` é a única camada de E/S (criar, regenerar, garantir, jogar o dia). As competições moram em `saves/{id}/leagues/u21_<país>`/`u19_<país>` como uma liga (meta, rodadas, `date-index`, `standings.json`), nunca em `activeLeagues`, e ficam **fora** das leituras de "jogos de hoje" (`getActiveRoundsForDate`/`getFixturesForDate`) e de `StoredDayLog.events` (vão para `youthMatches`), para nenhum fluxo do time principal (dia de jogo, diretoria, moral de partida, prêmios, histórico) enxergar um jogo de base.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-09-youth-competitions-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — arquivos em CRLF no disco e LF no
  índice; conferir `git diff --stat` (nenhum arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é
  CRLF: editar só com a ferramenta Edit e conferir que continua 100% CRLF. Commits em português terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem
  migração.
- Worktree `C:/Projects/FMProject-youthcups`, branch `feat/youth-competitions` (com `src/Data` e `bun install`).
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando.
- `/test` e `/lab`: sem efeito de partida (só quickSim) — nenhuma tarefa mexe neles nem em `Statistics.ts`.

---

### Task 0: Linha de base do custo do dia

**Files:** nenhum código. Anotar os números na spec (§9, "Medições", tabela nova "Antes").

- [ ] **Step 1:** Na `main` atual (o worktree está nela), `bun scripts/bench-advance-day.ts --days 14 --buffered`
  três vezes; anotar média e mediana por dia, separando "dia de rodada do usuário" e "demais dias".
- [ ] **Step 2:** Registrar em `docs/superpowers/specs/2026-10-09-youth-competitions-design.md` §9.1 (tabela
  "Antes", máquina, data). Commit `docs(base): linha de base do custo do avanço do dia (Etapa 36)`.

---

### Task 1: Tipos, constantes e slugs

**Files:** Create `src/types/youthCompTypes.ts`, `src/Domain/youthComps/youthCompConfig.ts`,
`src/Domain/youthComps/youthCompIds.ts`, `src/Domain/youthComps/youthCompIds.test.ts`. Modify
`src/types/calendarTypes.ts`, `src/types/playerTypes.ts`, `src/types/moraleTypes.ts`, `src/types/dayLogTypes.ts`,
`src/backend/SaveService.ts` (`SaveMeta`).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { isYouthCompSlug, youthCompAgeOf, youthCompSlugOf } from "@/Domain/youthComps/youthCompIds";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";

describe("youth competition ids", () => {
  test("slug per country and age, same normalisation as the cup", () => {
    expect(youthCompSlugOf("England", "u21")).toBe("u21_england");
    expect(youthCompSlugOf("Côte d’Ivoire", "u19")).toBe("u19_cote_d_ivoire");
  });
  test("recognised and never a cup or continental", () => {
    for (const s of ["u21_brazil", "u19_england"]) {
      expect(isYouthCompSlug(s)).toBe(true);
      expect(isCupSlug(s)).toBe(false);
      expect(isContinentalSlug(s)).toBe(false);
    }
    expect(isYouthCompSlug("premier_league")).toBe(false);
    expect(youthCompAgeOf("u19_brazil")).toBe("u19");
    expect(youthCompAgeOf("cup_brazil")).toBeNull();
  });
  test("config", () => {
    expect(YOUTH_COMP.MAX_AGE).toEqual({ u21: 21, u19: 19 });
    expect(YOUTH_COMP.PREFERRED_DAYS.u21[0]).toBe(2); // terça
    expect(YOUTH_COMP.PREFERRED_DAYS.u19[0]).toBe(4); // quinta
    expect(Object.values(YOUTH_COMP.FILLER_POOL).reduce((a, b) => a + b, 0)).toBe(14);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/youthComps/youthCompIds.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

`youthCompTypes.ts`: `YouthCompAge`, `YouthLeader`, `YouthCompMetaData`, `YouthMatchLog` exatamente como na spec §1.

`youthCompConfig.ts`:

```ts
export const YOUTH_COMP = {
  AGES: ["u19", "u21"] as const,          // ordem do dia: sub-19 primeiro
  MAX_AGE: { u21: 21, u19: 19 },
  FILLER_AGE: { u21: [17, 21], u19: [16, 19] } as Record<"u21" | "u19", [number, number]>,
  LINES: { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  FILLER_POOL: { GK: 2, DEF: 5, MID: 4, FWD: 3 },
  OVERAGE_MAX: 5,                          // reservas > 21 no sub-21
  NO_MINUTES_SHARE: 0.4,
  MIN_FITNESS: 60,
  MAX_CALL_UPS: 11,
  WINDOW_MARGIN_DAYS: 7,
  PREFERRED_DAYS: { u21: [2, 3, 1, 4, 5], u19: [4, 3, 5, 2, 1] },  // getUTCDay
  COST: { HUGE: 1000, ADJ: 1 },
  MOVE_MAX_DAYS: 6,                        // jogo movido na geração: até 6 dias depois do dia comum
  MAX_POSTPONE_DAYS: 14,                   // adiamento no dia
  DP_MULT: 0.6,                            // medido na Task 12
  MORALE_YOUTH_WEIGHT: 0.5,
  MORALE_WINDOW: 5,                        // youthMinutes guardados
  LEADERS_MIN_APPS: 3,
  PITCH: 90,
} as const;
```

`youthCompIds.ts`: extrair a normalização de `cupSlugOf` para `countryKey(country)` (exportada em `cupIds.ts`, o
`cupSlugOf` passa a usá-la) e `youthCompSlugOf = (c, age) => \`${age}_${countryKey(c)}\``; `isYouthCompSlug`,
`youthCompAgeOf`.

Tipos existentes:
- `calendarTypes.ts`: `LeagueSeasonMeta.kind?: "cup" | "continental" | "youth"`, `youth?: YouthCompMetaData`;
  `Fixture.cancelled?: true`, `Fixture.postponedFrom?: string` (com comentário).
- `playerTypes.ts`: `PlayerSeasonLog.youthCup?: { appearances: number; goals: number; assists: number; ratingSum:
  number }` — comentário: "fora dos totais (diferente de cup/continental)".
- `moraleTypes.ts`: `PlayerMoraleLog.youthMinutes?: number[]`.
- `dayLogTypes.ts`: `StoredDayLog.youthMatches?: YouthMatchLog[]`.
- `SaveService.ts` (`SaveMeta`): `youthCallUps?: { u21?: string[]; u19?: string[] }`.

- [ ] **Step 4: Rodar** — teste PASS; `bun test src/Domain/cups` PASS; `bunx tsc --noEmit -p .` limpo.
- [ ] **Step 5: Commit** — `feat(base): tipos, constantes e slugs dos torneios de base (Etapa 36)`.

---

### Task 2: Calendário puro (turno e returno, datas por clube)

**Files:** Create `src/Domain/youthComps/youthSchedule.ts`, `src/Domain/youthComps/youthSchedule.test.ts`.

- [ ] **Step 1: Testes**

```ts
import { describe, expect, test } from "bun:test";
import { roundRobinPairings, scheduleYouthSeason } from "@/Domain/youthComps/youthSchedule";

const clubs = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

describe("roundRobinPairings", () => {
  test("double round robin: 38 rounds, 10 games, every pair twice with swapped venue", () => {
    const rounds = roundRobinPairings(clubs, "seed");
    expect(rounds.length).toBe(38);
    for (const r of rounds) {
      expect(r.length).toBe(10);
      expect(new Set(r.flatMap(([h, a]) => [h, a])).size).toBe(20);
    }
    const seen = new Map<string, number>();
    for (const r of rounds) for (const [h, a] of r) seen.set(`${h}>${a}`, (seen.get(`${h}>${a}`) ?? 0) + 1);
    for (const a of clubs) for (const b of clubs) if (a !== b) expect(seen.get(`${a}>${b}`)).toBe(1);
  });
  test("odd number of clubs: one rests per round", () => {
    const rounds = roundRobinPairings(clubs.slice(0, 5), "s");
    expect(rounds.length).toBe(10);
    for (const r of rounds) expect(r.length).toBe(2);
  });
  test("deterministic", () => {
    expect(roundRobinPairings(clubs, "x")).toEqual(roundRobinPairings(clubs, "x"));
  });
});

describe("scheduleYouthSeason", () => {
  const window = { start: "2026-08-10", end: "2027-05-09" }; // 39 semanas inteiras
  test("no fixture on a first-team day of either club, every date inside the window", () => {
    const busy = new Map<string, Set<string>>();
    for (const c of clubs) busy.set(c, new Set(["2026-08-25", "2026-09-02", "2026-09-03"]));
    busy.get("c1")!.add("2026-09-01");
    const out = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: busy, age: "u21" });
    for (const f of out.fixtures) {
      expect(f.date >= window.start && f.date <= window.end).toBe(true);
      expect(busy.get(f.home)!.has(f.date) || busy.get(f.away)!.has(f.date)).toBe(false);
    }
  });
  test("one round per week when there are enough weeks; mostly midweek", () => {
    const out = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u21" });
    const commonDays = out.roundDates; // dia comum por rodada
    for (let i = 1; i < commonDays.length; i++) expect(commonDays[i]! > commonDays[i - 1]!).toBe(true);
    expect(out.fixtures.every((f) => [1, 2, 3, 4, 5].includes(dow(f.date)))).toBe(true);
    expect(out.singleLeg).toBe(false);
  });
  test("u21 prefers tuesday, u19 thursday", () => {
    const u21 = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u21" });
    const u19 = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u19" });
    expect(dow(u21.roundDates[0]!)).toBe(2);
    expect(dow(u19.roundDates[0]!)).toBe(4);
  });
  test("short windows: two a week, then only the first leg, then nothing", () => {
    const all = roundRobinPairings(clubs, "s");
    // 2027-01-04 (seg) .. 2027-05-09 (dom) = 18 semanas: 36 vagas ≥ 38? não → 2W = 36 < 38 → só o turno.
    // 2026-12-21 .. 2027-05-09 = 20 semanas: 2W = 40 ≥ 38 → turno e returno, duas por semana.
    const twice = scheduleYouthSeason({ rounds: all, window: { start: "2026-12-21", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" });
    expect(twice.singleLeg).toBe(false);
    expect(new Set(twice.fixtures.map((f) => f.round)).size).toBe(38);
    const half = scheduleYouthSeason({ rounds: all, window: { start: "2027-01-04", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" });
    expect(half.singleLeg).toBe(true);
    expect(new Set(half.fixtures.map((f) => f.round)).size).toBe(19);
    // 2027-04-05 .. 2027-05-09 = 5 semanas: 3 × 5 = 15 < 19 → não gera.
    expect(scheduleYouthSeason({ rounds: all, window: { start: "2027-04-05", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" })).toBeNull();
  });
  test("deterministic", () => {
    const a = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u19" });
    const b = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u19" });
    expect(a).toEqual(b);
  });
});
```

(Ajuste a expectativa do caso "short" ao que a regra dá: semanas × 2 ≥ R → duas por semana; senão só o turno. Escreva
os números exatos da janela no teste antes de implementar.)

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

```ts
export type Pairing = [home: string, away: string];

/** Turno e returno pelo método do círculo (mesma rotação de generateLeagueCalendar); returno com mando invertido. */
export function roundRobinPairings(clubIds: string[], seedKey: string): Pairing[][] { /* shuffle(mulberry32(seedFrom(seedKey))) + círculo + __bye__ */ }

export interface ScheduledYouthFixture { round: number; home: string; away: string; date: string }

export function scheduleYouthSeason(args: {
  rounds: Pairing[][];
  window: { start: string; end: string };
  /** Datas de jogo do time principal de cada clube conhecidas na geração. */
  busyByClub: Map<string, Set<string>>;
  age: YouthCompAge;
}): { fixtures: ScheduledYouthFixture[]; roundDates: string[]; singleLeg: boolean } | null  // null = não cabe
```

Algoritmo (spec §2.4):
1. Semanas (segunda a domingo) com `segunda ≥ window.start` e `domingo ≤ window.end` → `W`. `R = rounds.length`.
   `W ≥ R` → uma por semana (`floor(r × W / R)`); `2W ≥ R` → as rodadas sobrando ganham a segunda vaga da semana
   (pares de dias comuns: sub-21 ter + sex, sub-19 seg + qui; cada um escolhido pelo custo do passo 2 entre os dois
   do par); senão `rounds = rounds.slice(0, R / 2)`, `singleLeg = true` e até 3 por semana (seg, qua, sex); se
   `3W < R/2` → `null`.
2. Dia comum: entre `PREFERRED_DAYS[age]` da semana (e dentro da janela), o de menor custo
   `Σ (HUGE se busy(home|away, d)) + (ADJ se busy em d ± 1)`; empate pela ordem.
3. Jogo com clube ocupado no dia comum: seg–sex da mesma semana sem `busy` dos dois, mais perto do dia comum; senão
   qualquer dia livre dos dois em `d+1 … d+MOVE_MAX_DAYS`, antes do dia comum da rodada seguinte e ≤ `window.end`;
   senão fica no dia comum (o adiamento do dia resolve).
4. Sem `Math.random`: o embaralhamento é só em `roundRobinPairings`.

- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat(base): calendário dos torneios de base em turno e returno (Etapa 36)`.

---

### Task 3: Geração, regeneração e arquivo (puros)

**Files:** Create `src/Domain/youthComps/generateYouthComp.ts`, `src/Domain/youthComps/generateYouthComp.test.ts`.

- [ ] **Step 1: Testes**
  - `generateYouthComp({ country: "England", age: "u21", year: 2026, clubs, teams, window, busyByClub, seedKey })`
    devolve `LeagueCalendarResult` com `meta.kind === "youth"`, `meta.youth.clubs`, `leaders: {}`, `championId:
    null`, `totalRounds === 38`, `rounds[i].fixtures` com `competition === "u21_england"`, ids
    `u21_england_2026_r<n>_<i>`, `played: false`; `dateIndex` aponta cada data de jogo para a sua rodada (uma rodada
    pode ter mais de uma data); `meta.start`/`meta.end` = primeira/última data.
  - Menos de 2 clubes → `null`.
  - `youthCompsToRegenerate([{ country, leagueSlug, year: 2027, start, end }], { England: 2026 })` → regenera
    England com `year 2027` e a janela com a margem; ano igual → nada; país sem competição (sem chave) → nada (a
    criação de uma que falta é do `ensure`, Task 6).
  - `youthChampion(standings)` = 1º da tabela com jogos (ou `null`); `buildYouthCompArchive(meta, standings)` =
    `SeasonArchive` com a tabela e um título do campeão, `playerLogs: {}`.
  - `youthStandingsBase(meta)` → `LeagueTeam[]` de `meta.youth.teams` na ordem de `clubs`.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** — usa `roundRobinPairings`/`scheduleYouthSeason`; janela com
  `WINDOW_MARGIN_DAYS` aplicada por quem chama (`youthWindow(leagueStart, leagueEnd, today?)`, exportada aqui:
  `[max(start + 7, today + 1), end − 7]`). `buildYouthCompArchive` reaproveita a forma de `SeasonArchive` (como
  `buildKnockoutSeasonArchive`, mas com `standings`).

- [ ] **Step 4: Rodar** — PASS. **Step 5: Commit** — `feat(base): geração e virada dos torneios de base (Etapa 36)`.

---

### Task 4: `SaveService` — base fora das leituras de "jogos de hoje"

**Files:** Modify `src/backend/SaveService.ts`; Create `src/backend/youthComps.saveService.test.ts`.

- [ ] **Step 1: Teste** — save de teste (`saveService.createSave` Premier, como `cupWorld.test.ts`); escreve à mão
  uma competição `u21_england` com uma rodada datada em `currentDate` (meta + rodada + date-index). Confere:
  `getActiveRoundsForDate(id, d)` não tem `u21_england`; `getActiveRoundsForDate(id, d, { includeYouth: true })` tem;
  `getFixturesForDate` não traz o jogo; `getYouthFixturesForDate(id, d)` traz; `listCompetitionSlugs` lista.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** — `getActiveRoundsForDate(saveId, date, opts: { includeYouth?: boolean } = {})`
  filtra `isYouthCompSlug` quando `!opts.includeYouth`; `getFixturesForDate` usa o padrão (sem base);
  `getYouthFixturesForDate(saveId, date)` lê só os slugs de base (rodadas do dia, fixtures `date === d && !played`).

- [ ] **Step 4: Auditoria dos consumidores** — `grep -rn "listCompetitionSlugs\|getActiveRoundsForDate\|getFixturesForDate\|getAllFixturesForLeague" src scripts`:
  conferir cada um (`startKits.buildKitWorld` → Task 11; smoke de dupla marcação → deve continuar vendo a base;
  `clubHistoryWorld.cupAndContinentalFixtures`, `advanceUntil.nextPlayerFixtureDate`, rotas de copa/continental →
  filtram por tipo de slug, nada muda). Anotar no commit o que foi conferido.

- [ ] **Step 5: Rodar** — PASS; `bun test src/backend/cupWorld.test.ts src/backend/advanceUntil.test.ts` PASS.
- [ ] **Step 6: Commit** — `feat(base): jogos de base fora das leituras do dia do time principal (Etapa 36)`.

---

### Task 5: Escalação pura e jovens gerados

**Files:** Create `src/Domain/youthComps/youthLineup.ts`, `src/Domain/youthComps/youthLineup.test.ts`. Modify
`src/Domain/youth/youth.ts` (exportar `statsFor` e extrair `makeAcademyPlayer` do laço de `generateIntake`, sem mudar
a safra — o teste de `youth.test.ts` continua igual).

- [ ] **Step 1: Testes** (elencos sintéticos com o helper de jogadores dos testes de `youth.test.ts`)
  - `firstTeamXI` (passado pronto pelo chamador) nunca entra, salvo convocado.
  - Sub-19: convocados (≤ 19) → base ≤ 19 → elenco ≤ 19 fora do XI → gerados; nunca um jogador > 19, nem convocado.
  - Sub-21: convocados (qualquer idade) → elenco ≤ 21 fora do XI → base 20–21 → base ≤ 19 que não jogou hoje →
    reservas > 21 sem minutos (no máximo 5) → gerados.
  - "Sem minutos": com o maior número de jogos do elenco = 20, um reserva com 8 entra, um com 9 não
    (`0,4 × 20 = 8`); com máximo 0, todo não titular conta.
  - Fora sempre: lesionado/suspenso (`isUnavailable` na data), quem está em `playedToday`; fora salvo convocado:
    fôlego < 60.
  - Linhas: exatamente GK 1, DEF 4, MID 3, FWD 3 escolhidos por `MainRole`; convocados extras de uma linha cheia
    ficam de fora e voltam em `skippedCallUps`.
  - Gerados: determinísticos (`youthFillers` com a mesma semente = mesmos ids, nomes e atributos), idade na faixa da
    competição, ids `ygen_<squad>_<slug>_<ano>_<linha>_<i>`, nível perto de `lineAverage(squad, linha) −
    YOUTH.LEVEL_OFFSET`; uma rodada que precisa de 2 DEF gerados usa `DEF_0` e `DEF_1`.
  - Saída: `{ lineup: string[] (11, ordem das vagas do 4-3-3), matchPlayers: RosterPlayer[], generatedIds: Set,
    skippedCallUps: string[] }`; `lineup` = `autoFillLineup(slots 4-3-3, matchPlayers)` sem vaga vazia.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

```ts
export interface YouthLineupInput {
  age: YouthCompAge;
  squad: Squad;                  // players + youth (base só existe no clube do jogador)
  firstTeamXI: ReadonlySet<string>;
  callUps: readonly string[];    // vazio para a IA
  playedToday: ReadonlySet<string>;
  date: string;
  fillerSeed: string;            // `${saveId}:${squadId}:${slug}:${year}`
  nationality: string;
}
export function pickYouthLineup(input: YouthLineupInput): {
  lineup: string[]; matchPlayers: RosterPlayer[]; generatedIds: Set<string>; skippedCallUps: string[];
}
export function youthFillers(seed: string, squad: Squad, age: YouthCompAge, line: MainRole, n: number, nationality: string): RosterPlayer[]
export function noMinutes(p: RosterPlayer, maxApps: number): boolean
```

A ordenação dentro de cada grupo: `seasonLog.appearances` asc, `slotValue` na posição natural desc, id. A linha de
cada jogador = `getMainRole(preferredRole(p))` (`@/Domain/roles`, `positions.md`).

- [ ] **Step 4: Rodar** — PASS; `bun test src/Domain/youth` PASS.
- [ ] **Step 5: Commit** — `feat(base): escalação automática dos torneios de base e jovens gerados (Etapa 36)`.

---

### Task 6: Pós-jogo da base, destaques e adiamento (puros)

**Files:** Create `src/Domain/youthComps/youthMatch.ts`, `src/Domain/youthComps/youthMatch.test.ts`.

- [ ] **Step 1: Testes**
  - `applyYouthMatch(squad, recording, side, date, rng)`:
    - quem jogou (em `players` **ou** em `youth`) ganha `seasonLog.youthCup` (+1 jogo, gols, assistências,
      `ratingSum`); `appearances`, `goals`, `avgRating`, `recentRatings`, `cup`, `continental`, cartões **iguais**;
    - fôlego e carga mudam pela mesma conta de `applyMatchFitness` (minutos 90, `endEnergy` do recording);
    - DP: com `DP_MULT` aplicado (comparar com `applyDevelopment` direto); um jogador de 33 anos não ganha declínio
      extra (o declínio é anual: `applyDevelopment` com o mesmo multiplicador de declínio de uma partida — conferir
      que o resultado é o de uma partida × `DP_MULT` no crescimento);
    - lesão do recording vira `injury` com `returnDate` (multiplicadores de staff/CT) e volta em `injuriesApplied`;
    - cartões do recording **não** mudam nada (sem `suspension`, sem `yellowCards`);
    - suspensão existente **não** é cumprida (`suspension.matches` igual);
    - quem não jogou não muda (nem fôlego);
    - jogador do clube do jogador (`players`) ganha o minuto em `moraleLog.youthMinutes` (máx. 5); `youth` não.
  - `updateLeaders(leaders, recording, nameOf, squadOf, generatedIds)` soma por jogador, marca `generated`.
  - `youthMatchLog(fixture, recording, …)` → `YouthMatchLog` com artilheiros, a maior nota e `players` só com reais.
  - `postponeDate({ date, end, busy: (club, d) => boolean, home, away, sameCompDates })` → a próxima data livre
    em até 14 dias e ≤ `end`, ou `null` (cancelar).

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** — reaproveita `applyMatchFitness`, `applyDevelopment`, `dpWeightsFor`,
  `staffEffectsOf`, `trainingGroundEffectsOf`, `areaMultsOf`, `rebornDpMult`, `personalDpMult`, `moraleDpMult`,
  `professionalismDecayMult`, `injuryReturnDate`, `mergeInjury`, `withInjuryCounted`, `clearHealed` (os mesmos de
  `finalizeSquadsAfterMatch`, `src/Domain/advanceDay/matches.ts`). Não chama `finalizeSquadsAfterMatch` (ele cumpre
  suspensões, aplica cartões, recupera quem não jogou e soma nos totais).

- [ ] **Step 4: Rodar** — PASS. **Step 5: Commit** — `feat(base): pós-jogo, destaques e adiamento da base (Etapa 36)`.

---

### Task 7: Moral — minutos de base

**Files:** Modify `src/Domain/morale/morale.ts`, `src/Domain/morale/morale.test.ts`.

- [ ] **Step 1: Testes** — `minutesDelta(status, minutes, excused, youthMinutes)`:
  - `backup` com déficit no time principal e 5 jogos completos de base → delta maior (menos negativo) que sem base,
    nunca > 0;
  - `key`/`starter`: igual com ou sem base;
  - sem déficit: igual com ou sem base (a base não dá bônus);
  - `youthMinutes` ausente = comportamento de hoje (todos os testes antigos passam).
  - `moraleDay` passa `p.moraleLog.youthMinutes` adiante.

- [ ] **Step 2: Rodar** → FAIL. **Step 3: Implementação** (spec §7):

```ts
export function minutesDelta(status: SquadStatus, minutes: number[], excused = false, youthMinutes?: number[]): number {
  const base = /* conta de hoje */;
  if (base >= 0 || !youthMinutes?.length || !(["youth", "backup", "rotation"] as const).includes(status as never)) return base;
  const p = windowMatches(minutes);
  if (p === null) return base;
  const y = (youthMinutes.reduce((a, m) => a + Math.min(1, m / 90), 0) * MORALE.WINDOW) / youthMinutes.length;
  return Math.min(0, deltaFor(status, p + YOUTH_COMP.MORALE_YOUTH_WEIGHT * y, excused));
}
```

(extrair a conta atual para `deltaFor(status, p, excused)`.)

- [ ] **Step 4: Rodar** — `bun test src/Domain/morale` PASS. **Step 5: Commit** — `feat(base): minutos de base contam na moral dos jovens e reservas (Etapa 36)`.

---

### Task 8: `youthCompWorld` — criar, garantir, regenerar

**Files:** Create `src/backend/youthCompWorld.ts`, `src/backend/youthCompWorld.test.ts`.

- [ ] **Step 1: Testes** (save Premier de teste, como `cupWorld.test.ts`; 120 s)
  - `createYouthCompetitions({ service, saveId, index, catalog, pyramids, activeLeagues })`: `u21_england` e
    `u19_england` existem, `meta.youth.clubs` = clubes da `premier_league`, 38 rodadas, `standings.json` com 20
    linhas zeradas, nenhuma data de jogo de base em que o clube tem jogo da liga, da copa (`cup_england`) ou da
    continental; um país com a liga de nível 1 de 1 clube não ganha competição.
  - `ensureYouthCompetitions(..., currentDate)`: apagar a pasta `u19_england` → recriada; uma rodada não jogada datada
    antes de `currentDate` → a competição é regerada com todas as datas > `currentDate`.
  - `regenerateYouthComps` (com `updatedActiveLeagues` do ano seguinte para a Inglaterra): arquiva o ano antigo com
    1 título (`readLeagueSeasonArchive`) e cria o ano novo.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
  - `busyByClubOf(service, saveId, country, clubs)`: por clube, as datas do `date-index` da liga dele (a de nível 1),
    as datas das fases da copa do país (`meta.cup.stages[].date`) e, para quem está nos grupos de uma continental
    (`meta.continental.groups`), as 13 datas (`stages[].dates`).
  - `createYouthComp(...)` → `generateYouthComp` + `writeYouthComp` (meta, rodadas, date-index, standings); nomes e
    cores de `index.byId(id)`.
  - `createYouthCompetitions` para todo país do catálogo com liga de nível 1 ativa (`topLeagueOf`), as duas idades,
    try/catch por país (`logError("youthComps", …)`).
  - `ensureYouthCompetitions` e `regenerateYouthComps(service, saveId, { updatedActiveLeagues, index })` (puros de
    `generateYouthComp.ts` para decidir; arquivo antes de criar).

- [ ] **Step 4: Rodar** — PASS. **Step 5: Commit** — `feat(base): criação e virada dos torneios de base no save (Etapa 36)`.

---

### Task 9: `playYouthDay` e o avanço do dia

**Files:** Modify `src/backend/youthCompWorld.ts`, `src/backend/advanceDay.ts`,
`src/Domain/advanceDay/dailyTraining.ts`, `src/Domain/advanceDay/dailyRest.ts`, `src/backend/moraleWorld.ts` (só se
precisar repassar algo), `src/backend/SaveService.ts` (`createSave`), `src/backend/saves.ts` (rota `presimulate`).
Create `src/backend/youthComps.advanceDay.test.ts`; testes em `dailyTraining.test.ts`/`dailyRest.test.ts`.

- [ ] **Step 1: Testes puros do treino** — `buildTrainingEvent(id, squad, policy, date, rng, { skipPlayerIds })`: os
  ids pulados ficam idênticos; os jovens da base (`squad.youth`) com fôlego 50 recuperam pela curva de descanso e não
  ganham DP de treino; `buildRestEvent(id, squad, date, { skipPlayerIds })` idem.

- [ ] **Step 2: Teste de integração** (`youthComps.advanceDay.test.ts`, save Premier, 180 s):
  - pôr `currentDate` no dia comum da 1ª rodada do `u19_england` (de um clube sem jogo do time principal) e avançar:
    os 10 jogos jogados (ou adiados/cancelados, contados), a tabela gravada igual a `computeStandings` das rodadas,
    `meta.youth.leaders` não vazio, `StoredDayLog.youthMatches` com 10 entradas e `events` **sem** nenhum
    `competition` de base; nenhum jogador recebeu `appearances` nos totais; quem jogou não treinou (sem
    `trainingSessions` a mais) e tem `youthCup.appearances === 1`.
  - conflito forçado: escrever um jogo do time principal (liga) para um clube no dia do jogo de base dele → o jogo de
    base vai para outro dia (`postponedFrom`), nunca no mesmo dia; sem dia livre (todas as datas seguintes ocupadas
    até o fim) → `cancelled`.
  - convocação: `meta.youthCallUps.u21 = [titular do clube do jogador]` → ele joga o próximo sub-21 do clube e a
    convocação some depois.
  - o clube do jogador numa rodada de base: nenhum `MatchEvent` dele no dia, a diretoria e a torcida iguais.

- [ ] **Step 3: Rodar** → FAIL.

- [ ] **Step 4: Implementação** (spec §3, §6)
  - `playYouthDay({ service, saveId, date, index, meta, tactics, teamsPlayingToday, squadOf, rng })` em
    `youthCompWorld.ts` → `{ squads: Map<squadId, Squad>, participants: Set<string>, logs: YouthMatchLog[],
    injuries: AppliedInjury[] (com squadId), consumedCallUps: YouthCompAge[] }`:
    1. `getYouthFixturesForDate`; para cada competição do dia, sub-19 antes do sub-21;
    2. adiamento/cancelamento (`postponeDate` com `busy` lendo os `date-index` da liga, copa e continental de cada
       clube, memoizados no dia), regravando a rodada e o `date-index`;
    3. XI do time principal: IA `autoLineupForFormation(squad, formationForSimId(squad.aiFormation?.id), date)`, clube
       do jogador `tactics.lineup` (XI automático se vazio);
    4. `pickYouthLineup`, `quickSimMatch` com o squad da partida (`{ ...squad, players: matchPlayers }`), papéis do
       4-3-3, `pitchCondition: YOUTH_COMP.PITCH`, sem `knockout`;
    5. `applyYouthMatch` nos dois clubes, `updateLeaders`, `youthMatchLog`;
    6. por competição jogada: grava rodadas, `standings.json` (`computeStandings(youthStandingsBase(meta), todas as
       rodadas)`) e a meta com `leaders`.
  - `advanceDay.ts`, logo depois do laço de partidas (e do `recordSeasonGoals`):

```ts
const youthDay = await playYouthDay({
  service: saveService, saveId, date: currentDate, index, meta, tactics, teamsPlayingToday,
  squadOf: async (id) => squadWrites.get(id)?.squad ?? (await saveService.getSquadById(saveId, id)),
});
for (const [id, squad] of youthDay.squads) {
  const e = index.byId(id)!;
  squadWrites.set(id, { league: e.leagueSlug, club: e.stem, squad });
}
for (const inj of youthDay.injuries) injuryInboxEvents.push({ kind: "injured", ...inj });
```

  - laço de treino/descanso: `const squad = squadWrites.get(row.squadId)?.squad ?? await saveService.getSquad(...)` e
    `{ skipPlayerIds: youthDay.participants }` nos dois builders.
  - log do dia: `youthMatches: youthDay.logs` no `writeDayLog`.
  - patch da meta: `youthCallUps` sem as idades consumidas.
  - moral: nada novo no `applyMoraleDay` (o `youthMinutes` já foi gravado no squad pelo `applyYouthMatch` e o
    `moraleDay` lê da Task 7). Conferir que `applyMoraleDay` relê o squad **depois** do `flush` dos `squadWrites`
    (ordem atual) — senão passar o squad de `squadWrites`.
  - virada: depois do bloco das continentais, `if (due.units.length > 0 || due.resync.length > 0) await
    regenerateYouthComps(...)` (fail-fast como a continental: sem try/catch, o dia é refeito).
  - `SaveService.createSave`: depois das continentais, `createYouthCompetitions` (try/catch).
  - rota `presimulate` (`saves.ts`): depois de `applyRandomStartKit`, `ensureYouthCompetitions(saveId, currentDate)`.
  - `marketFrozen` (pré-simulação dos kits) joga a base normalmente.

- [ ] **Step 5: Rodar** — os testes novos; `bun test src/backend src/Domain/advanceDay` PASS.
- [ ] **Step 6: Commit** — `feat(base): jogos de base no avanço do dia, treino e virada (Etapa 36)`.

---

### Task 10: Rotas e calendário do clube

**Files:** Create `src/backend/youthCompRoutes.ts`, `src/backend/youthComps.routes.test.ts`. Modify
`src/index.ts` (registrar as rotas), `src/backend/saves.ts` (`season.youthCalendar`), `src/types/calendarTypes.ts`
(`SeasonData.youthCalendar?: Fixture[]`), `src/backend/jobWorld.ts` (`youthCallUps` sai na troca/demissão).

- [ ] **Step 1: Testes** (save Premier)
  - `GET /api/saves/:id/youth-comps?country=England` → os dois slugs; país sem competição → `null`s.
  - `GET /api/saves/:id/youth-comps/u21_england` → `{ meta, fixtures, standings, names, leaders }`; `cup_england` →
    400; `u21_atlantis` → 404; sem dono → 401/403.
  - `GET /api/saves/:id/youth-callups` → próximo jogo de cada idade do clube, elegíveis (elenco + base; sub-19 só ≤ 19).
  - `PUT` válido grava `meta.youthCallUps`; jogador de outro clube, repetido, 12 ids, 20 anos no sub-19 → 400
    `invalidPlayers`; desempregado → 409 `noClub`.
  - `GET /api/saves/:id` → `season.youthCalendar` só com jogos de base do clube; `season.calendar` sem nenhum.
  - Troca de clube (`acceptJobOffer`) → `meta.youthCallUps` ausente.

- [ ] **Step 2: Rodar** → FAIL. **Step 3: Implementação** — molde da rota de copa
  (`/api/saves/:saveId/cups/:cupSlug`, `routes.ts`); `requireSaveOwner`; `PUT` com `withSaveLock`; nomes reais pelo
  índice e gerados pelos `leaders`.
- [ ] **Step 4: Rodar** — PASS. **Step 5: Commit** — `feat(base): rotas dos torneios de base e das convocações (Etapa 36)`.

---

### Task 11: Telas

**Files:** Create `src/GameInterface/Components/YouthCompView.tsx`, `src/GameInterface/Squad/YouthCallUpsPanel.tsx`.
Modify `src/GameInterface/LeagueTableScreen.tsx`, `src/GameInterface/Dashboard/WeekCalendar.tsx` (+ teste),
`src/GameInterface/Dashboard/dashboardData.ts` (se a semana for montada lá), `src/GameInterface/PlayerScreen.tsx`,
`src/GameInterface/Components/YouthTable.tsx`, `src/GameInterface/SquadScreen.tsx`, `src/i18n/locales/en.json`,
`src/i18n/locales/pt-BR.json`.

- [ ] **Step 1: Ligas → aba "Base"** — sexta aba (`"table" | "fixtures" | "finances" | "cup" | "continental" |
  "youth"`), depois de "Continental", só quando `GET /youth-comps?country=` devolve algum slug; ao trocar de liga, a
  aba sem competição volta para "table" (como a de Copa). `YouthCompView` (componente burro, props = resposta da rota
  + `myClubId`): `SegmentedTabs` compacto "Sub-21 / Sub-19"; tabela com as peças de `StatsTable`/`TABLE_STYLE`
  (`StandingsTable` se aceitar as linhas sem zonas); resultados agrupados por rodada (data, placar, "Adiado" com a
  data original, "Cancelado"); "Destaques": artilheiros e notas (≥ 3 jogos) — reais com link para
  `/player/<id>`, gerados sem link. Estados carregando / 404 (`youthComps.none`) / erro (`warnings.errors.loadFailed`).
- [ ] **Step 2: Painel** — `WeekCalendar`: cada dia mostra também o jogo de base do clube vindo de
  `season.youthCalendar` (selo `youthComps.badge.u21|u19`, adversário, placar); o jogo de base **não** muda o tipo do
  dia (treino/folga continua clicável) nem o "Jogo" da barra superior. Teste em `WeekCalendar.test.ts`.
- [ ] **Step 3: Ficha** — no bloco da temporada, linha "Base" (J, G, A, nota = `ratingSum / appearances`) quando
  `seasonLog.youthCup` existe. `YouthTable`: colunas "J base" e "G base".
- [ ] **Step 4: Convocação** — `YouthCallUpsPanel` na aba Base do Elenco (clube do jogador): para cada idade, o
  próximo jogo (data, adversário, mandante) e `Chip` por elegível (nome, posição colorida, idade, fôlego), até 11,
  salvando com `PUT /youth-callups`; aviso "convocado não jogou" lendo o último `youthMatches` do clube (ou um campo
  `skippedCallUps` devolvido pela rota GET a partir da meta — escolher o mais simples e testar).
- [ ] **Step 5: i18n** `youthComps.*` em en e pt-BR (títulos "Sub-21"/"Under-21", "Sub-19"/"Under-19", "Base",
  "Destaques", "Adiado", "Cancelado", "Convocar para a base", avisos).
- [ ] **Step 6: Conferir** — `bun run ui:audit` (0 duras, 0 leves nos arquivos tocados); `bun test src/GameInterface`
  PASS; abrir no navegador (dev login, `.claude/rules/dev-login.md`) Ligas → Base, Painel, ficha e Elenco → Base.
- [ ] **Step 7: Commit** — `feat(base): aba Base em Ligas, jogos no Painel e na ficha, convocação (Etapa 36)`.

---

### Task 12: Medições (evolução e custo)

**Files:** Create `scripts/youth-comp-measure.ts`. Modify `src/Domain/youthComps/youthCompConfig.ts` (se `DP_MULT`
mudar), `docs/superpowers/specs/2026-10-09-youth-competitions-design.md` (§9, "Depois").

- [ ] **Step 1: Evolução** — o script (molde de `scripts/development-pace.ts`) simula uma temporada: jovem de 17 da
  base (pesos do papel, CT/comissão implícitos de um clube MEDIUM) com e sem 38 jogos de base (nota ~N(6,4; 0,6),
  semente fixa) + `developYouthSeason` na virada; reserva de 23 com 6 jogos oficiais e treino normal, com e sem os
  38 jogos de base; e o mesmo reserva com 13 jogos oficiais (1/3 da temporada) como referência. Imprime Δ da média
  dos 13 atributos e do overall.
- [ ] **Step 2:** Ajustar `DP_MULT` até: jovem +0,10..+0,30 acima do que não joga; reserva com base ≤ reserva com
  1/3 dos jogos oficiais. Registrar a tabela final na spec e (Task 14) na regra.
- [ ] **Step 3: Custo** — `bun scripts/bench-advance-day.ts --days 14 --buffered` três vezes (mesma máquina da
  Task 0); tabela "Depois" na spec. Se passar de +10%: perfilar `playYouthDay` (escalação da IA, leitura dos
  `date-index` de adiamento, gravação de meta/tabela) e otimizar antes de seguir.
- [ ] **Step 4: Commit** — `test(base): medição da evolução e do custo do dia com os torneios de base (Etapa 36)`.

---

### Task 13: Start kits e smoke

**Files:** Modify `src/backend/startKits.ts`, `scripts/season-rollover-smoke.ts`; regenerar
`src/example_data/startKits/*` (Git LFS).

- [ ] **Step 1: Kits** — `buildKitWorld`: `knockoutSlugs` passa a incluir `isYouthCompSlug` (o `applyKit` já grava
  meta/rodadas/date-index; conferir que grava `standings.json` quando existe no kit — senão incluir). Teste em
  `src/backend/startKits.test.ts` (se existir) ou no smoke.
- [ ] **Step 2: Regenerar** (cadeia de `.claude/rules/data/espn-import.md`, só o fim): `rm -rf src/Data/squads
  src/Data/logos/espn && cp -R src/example_data/. src/Data/`, `bun run kits:generate 5`, `rm -f
  src/example_data/startKits/* && cp src/Data/startKits/* src/example_data/startKits/`; `git lfs status` mostra os
  `kit-*.json.gz` como LFS.
- [ ] **Step 3: Smoke, seção "Base"** (spec §12): checagens na criação, diárias (rodada no passado, mesmo dia do time
  principal lendo **todas** as pastas, inclusive a base), jogadores do clube do jogador nos `youthMatches`,
  `youthCup` coerente, tabela coerente e igual à recalculada, convocação pela rota, virada (ano novo, arquivo com 1
  título, nenhum jogo antes da virada), contagem de jogos/adiamentos/cancelamentos (falha com ≥ 1% cancelados).
  Conferir que as seções existentes que procuram "o jogo do clube hoje" (`getFixturesForDate`) não pegam jogo de base.
- [ ] **Step 4: Rodar** — `bun scripts/season-rollover-smoke.ts` (~15 min; um de cada vez, ver memória de OOM) →
  todas as seções passam.
- [ ] **Step 5: Commit** — `data(kits): kits de início com os torneios de base; smoke da base (Etapa 36)`.

---

### Task 14: Documentação, changelog e versão

**Files:** Create `.claude/rules/game/youth-competitions.md`. Modify `.claude/rules/game/youth.md`, `cups.md`,
`morale.md`, `fitness.md`, `development.md`, `discipline.md`, `stats.md`, `non-player-games.md`,
`.claude/rules/game/membership.md` (pastas que não são liga), `docs/ROADMAP.md`,
`src/GameInterface/changelog/changelog.ts`, `package.json`.

- [ ] **Step 1: Regra nova** `youth-competitions.md` no formato das outras (Regra, Arquivos, Calendário, Escalação,
  Pós-jogo, Moral, Telas, Rotas, `/test` e `/lab` sem efeito, Medições com as tabelas da Task 12, Testes e smoke,
  Limitações = pontos abertos da spec que ficaram).
- [ ] **Step 2: Atualizações curtas** — `youth.md` (a base joga o sub-19/sub-21, recupera fôlego todo dia);
  `cups.md` (outras competições fora de `activeLeagues`: a base); `morale.md` (`youthMinutes`); `fitness.md` (jogo de
  base conta carga; quem jogou não treina); `development.md` (`DP_MULT`); `discipline.md` (cartões da base não
  contam); `stats.md` (`youthCup` fora dos totais e dos rankings); `non-player-games.md` (quickSim também na base,
  sem calibração própria); `membership.md` (pastas `u21_`/`u19_` em `leagues/` não são ligas).
- [ ] **Step 3: ROADMAP** — linha 36 `36 ✅ | Torneios de base e reservas (4.14)` com o resumo; bloco "36 ·" com as
  decisões (só nível 1; IA com jovens/reservas + gerados por temporada; meio de semana sem jogo do principal, dia
  comum + jogo movido + adiamento; cartões ignorados; spec e regra).
- [ ] **Step 4: Changelog** (ferramenta Edit; conferir 100% CRLF depois:
  `node -e "const s=require('fs').readFileSync('src/GameInterface/changelog/changelog.ts','utf8');console.log((s.match(/\r\n/g)||[]).length, (s.match(/\n/g)||[]).length)"`
  → os dois números iguais): entrada `4.14` (data do dia) com itens em pt e en para o jogador (torneios sub-21 e
  sub-19 por país, aba Base em Ligas, jogos da base no Painel e na ficha, convocar para a base, jovens e reservas
  evoluem e ganham moral jogando); tirar o item "Torneios sub-21 e sub-19…" de `upcoming` e colocar a próxima etapa
  do ROADMAP que ainda não está lá. `package.json` `"version": "4.14"`. `bun test src/GameInterface/changelog` PASS.
- [ ] **Step 5: Bateria final** — `bunx tsc --noEmit -p .`; `bun test` completo (um de cada vez); `bun run ui:audit`;
  `git diff --stat main` sem arquivo convertido inteiro.
- [ ] **Step 6: Commit** — `docs(base): regra, roadmap, changelog e versão 4.14 (Etapa 36)`.
