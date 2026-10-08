# Prêmios de fim de temporada (Etapa 32) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** toda liga do mundo premia, na sua virada, o melhor jogador, a revelação, o artilheiro, o melhor goleiro, a seleção da temporada (XI 4-3-3) e o melhor técnico — e, nas ligas jogadas no motor completo, o gol da temporada; todo janeiro saem o melhor jogador e o melhor técnico do mundo. Os prêmios ficam no histórico do jogador e do técnico, aparecem na ficha, no ranking de técnicos, na aba Prêmios de Estatísticas, no olheiro e na inbox, e mexem na moral, no valor de mercado e no interesse dos clubes grandes.

**Architecture:** lógica pura em `src/Domain/awards/` (candidatos, prêmios da liga, XI, técnico, gol da temporada, mundiais, efeitos, valor) sobre as linhas de histórico que a virada já grava. O motor só passa a registrar os gols da partida (`goalScored` com posição e minuto → `Statistics.getGoalLog()` → `MatchResult.goals` → `MatchEvent.goals`); o avanço do dia acumula os candidatos a gol da temporada por liga. E/S em `src/backend/awardsWorld.ts` (gols do dia, prêmios na virada, cerimônia de janeiro) com dois arquivos por save no DAL: `awards/{ano}.json` e `seasonGoals/{liga}-{ano}.json`.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-08-season-awards-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — conferir `git diff --stat` (nenhum arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é **CRLF**: editar com a ferramenta Edit e conferir que continua 100% CRLF (`file …` diz "with CRLF line terminators" e `grep -c $'\r$'` = número de linhas). Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Worktree `C:/Projects/FMProject-awards`, branch `feat/season-awards` (criada de `feat/coaching-staff`, com `src/Data` e `bun install`).
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando.
- **Sem efeito de partida:** nenhuma tarefa muda decisão, sorteio ou resultado do motor ou do quickSim. Se um teste de motor/quickSim existente mudar de resultado, pare e investigue.

---

### Task 1: Tipos e constantes

**Files:** Create `src/types/awardTypes.ts`, `src/Domain/awards/awardsConfig.ts`, `src/Domain/awards/awardsConfig.test.ts`. Modify `src/types/playerTypes.ts` (`PlayerHistoryRow.awards`, `RosterPlayer.awardBoost`), `src/types/managerTypes.ts` (`ManagerRecord.awards`, `ManagerTitle.on`), `src/types/dayLogTypes.ts` (`MatchGoal`, `MatchEvent.goals`), `src/Domain/advanceDay/matches.ts` (`PlayedMatchRecording.goals`), `src/types/inboxTypes.ts` (categoria `awards`), `src/Domain/inbox/inboxTopics.ts` (`awards` → `competitions`).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { AWARDS } from "@/Domain/awards/awardsConfig";
import { LEAGUE_AWARD_KINDS, AWARD_KINDS } from "@/types/awardTypes";

describe("awards config", () => {
  test("kinds", () => {
    expect(LEAGUE_AWARD_KINDS).toEqual(["best_player", "young_player", "top_scorer", "best_goalkeeper", "team_of_season", "best_manager", "goal_of_season"]);
    expect(AWARD_KINDS).toEqual([...LEAGUE_AWARD_KINDS, "world_player", "world_manager"]);
  });
  test("value boosts 10–15%, morale positive, xi slots of the 4-3-3", () => {
    for (const v of Object.values(AWARDS.VALUE_MULT)) { expect(v).toBeGreaterThanOrEqual(1.10); expect(v).toBeLessThanOrEqual(1.15); }
    for (const v of Object.values(AWARDS.MORALE)) expect(v).toBeGreaterThan(0);
    expect(AWARDS.XI_SLOTS).toEqual(["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"]);
    expect(AWARDS.YOUNG_MAX_AGE).toBe(21);
    expect(AWARDS.TIER_FACTOR[1]).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/awards/awardsConfig.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

`src/types/awardTypes.ts`:

```ts
export const LEAGUE_AWARD_KINDS = ["best_player", "young_player", "top_scorer", "best_goalkeeper", "team_of_season", "best_manager", "goal_of_season"] as const;
export type LeagueAwardKind = (typeof LEAGUE_AWARD_KINDS)[number];
export const AWARD_KINDS = [...LEAGUE_AWARD_KINDS, "world_player", "world_manager"] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

/** On a history row: `league` for league awards, `year` for the world ones. */
export interface PlayerAward { kind: AwardKind; league?: string; year?: number }
export interface ManagerAward { season: string; kind: "best_manager" | "world_manager"; competition: string; squadId: string; year?: number }

export interface AwardedPlayer {
  playerId: string; name: string; squadId: string; clubName: string;
  /** Average rating (goals for the top scorer). */
  value: number;
  leagueApps: number;
  /** Team of the season: slot role ("GK", "LB", …). */
  slot?: string;
}
export interface ShortlistPlayer extends AwardedPlayer { seasonScore: number }
export interface AwardedManager {
  managerId: string; name: string; squadId: string; clubName: string;
  position: number; target: number; score: number;
}
export interface GoalOfSeasonCandidate {
  key: string; fixtureId: string; date: string;
  playerId: string; playerName: string; squadId: string; opponentId: string;
  minute: number; header: boolean; distance: number;
  setPiece?: "corner" | "free_kick" | "direct_free_kick";
}
export interface LeagueSeasonAwards {
  league: string; season: string; closedOn: string; country: string | null; tier: number;
  /** countryWeight × tier factor (world awards). */
  weight: number;
  bestPlayer?: AwardedPlayer; youngPlayer?: AwardedPlayer; topScorer?: AwardedPlayer; bestGoalkeeper?: AwardedPlayer;
  teamOfSeason: AwardedPlayer[];
  bestManager?: AwardedManager;
  goalOfSeason?: GoalOfSeasonCandidate;
  shortlist: { players: ShortlistPlayer[]; managers: AwardedManager[] };
}
export interface WorldAwardEntry { id: string; name: string; squadId: string; clubName: string; league: string; score: number }
export interface WorldAwards { year: number; on: string; player: WorldAwardEntry[]; manager: WorldAwardEntry[] }
/** `saves/{id}/awards/{year}.json`: league seasons closed in `year` + the world awards for `year` (given in January of year + 1). */
export interface AwardsYear { year: number; leagues: LeagueSeasonAwards[]; world?: WorldAwards }
/** `saves/{id}/seasonGoals/{league}-{year}.json`. */
export interface SeasonGoals { league: string; year: number; goals: GoalOfSeasonCandidate[] }
```

`src/Domain/awards/awardsConfig.ts`:

```ts
import type { AwardKind } from "@/types/awardTypes";

export const AWARDS = {
  YOUNG_MAX_AGE: 21,
  /** Rating awards need league games ≥ ceil(totalRounds × MIN_ROUNDS_SHARE). */
  MIN_ROUNDS_SHARE: 0.5,
  XI_SLOTS: ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"] as const,
  XI_LINES: { GK: 1, Defender: 4, Midfielder: 3, Forward: 3 } as const,
  /** Best manager: (target − position) / size + bonuses. */
  MANAGER_CHAMPION_BONUS: 0.3,
  MANAGER_PROMOTED_BONUS: 0.15,
  /** seasonScore = rating + goals × G + assists × A + titles. */
  SEASON_SCORE: { GOAL: 0.03, ASSIST: 0.02, TITLE: { league: 0.15, cup: 0.1, continental: 0.3 } },
  SHORTLIST_PLAYERS: 5,
  SHORTLIST_MANAGERS: 3,
  /** World score = weight × (seasonScore − WORLD_BASE). */
  WORLD_BASE: 5,
  /** Title points of the year count ÷ this in the world manager score. */
  WORLD_TITLE_DIVISOR: 200,
  TIER_FACTOR: { 1: 1, 2: 0.6, 3: 0.4 } as Record<number, number>,
  /** Goal of the season: header weight 1, outside the box 1 + (distance − 18) / 10, capped. */
  GOAL_WEIGHT_CAP: 3,
  /** Market value until the next rollover of the player's league (the largest counts). */
  VALUE_MULT: { best_player: 1.15, world_player: 1.15, top_scorer: 1.12, young_player: 1.12, best_goalkeeper: 1.12, team_of_season: 1.1 } as Partial<Record<AwardKind, number>>,
  /** Morale (human club), via withEventDelta: the largest award of the rollover counts. */
  MORALE: { best_player: 10, world_player: 10, young_player: 8, top_scorer: 8, best_goalkeeper: 8, team_of_season: 5, goal_of_season: 4 } as Partial<Record<AwardKind, number>>,
  /** Big clubs: improvement-target bonus and the unlisted-standout bid chance. */
  IMPROVEMENT_BONUS: 0.08,
  BIG_CLUB_BID_MULT: 2,
  TOP_TO_SHOW: 3,
} as const;
```

`TIER_FACTOR`: nível ≥ 3 usa `3` (`AWARDS.TIER_FACTOR[Math.min(3, tier)]`).

Tipos: `PlayerHistoryRow.awards?: PlayerAward[]`; `RosterPlayer.awardBoost?: { season: string; league: string; mult: number }`; `ManagerRecord.awards?: ManagerAward[]`; `ManagerTitle.on?: string` (data do crédito, Task 9); `MatchGoal` (spec §1) em `dayLogTypes.ts`, `MatchEvent.goals?: MatchGoal[]`, `PlayedMatchRecording.goals?: MatchGoal[]`; `InboxCategory` + `"awards"` e `AwardsInboxMessage` (`kind: "league" | "world"`; `league` com `awards: LeagueSeasonAwards`, `leagueName`, `myClubId`; `world` com `world: WorldAwards`); `CATEGORY_TOPIC.awards = "competitions"`. Rodar `bunx tsc --noEmit -p .`: o `Record<InboxCategory, …>` exaustivo vai acusar os mapas que faltam (ícone na `InboxScreen` = `award`; o corpo vem na Task 12 — por ora um `case` que mostra o `subject`).

- [ ] **Step 4: Rodar** — `bun test src/Domain/awards src/Domain/inbox` → PASS; `bunx tsc --noEmit -p .` limpo.

- [ ] **Step 5: Commit** — `feat(prêmios): tipos e constantes`.

---

### Task 2: O motor registra os gols da partida

**Files:** Modify `src/GameEngine/Infrastructure/EventBus.ts`, `src/GameEngine/Domain/gameState.ts`, `src/GameEngine/Domain/Statistics.ts`, `src/GameEngine/Domain/SimulateMatch.ts`, `src/Domain/advanceDay/matches.ts`, `src/GameInterface/buildPlayedMatchRecording.ts`; Create `src/Domain/awards/goalOfSeason.ts` (só `goalGeometry` e `sanitizeRecordedGoals` nesta tarefa) + `goalOfSeason.test.ts`; tests em `src/GameEngine/Domain/SimulateMatch.test.ts`, `src/Domain/advanceDay/matches.test.ts`.

- [ ] **Step 1: Testes**

`goalOfSeason.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { goalGeometry, sanitizeRecordedGoals } from "@/Domain/awards/goalOfSeason";

describe("goal geometry", () => {
  test("inside the box vs outside, distance to the goal centre", () => {
    expect(goalGeometry({ fromX: 105, fromY: 37, goalX: 115 })).toEqual({ distance: 10, outsideBox: false });
    expect(goalGeometry({ fromX: 88, fromY: 37, goalX: 115 })).toEqual({ distance: 27, outsideBox: true });
    expect(goalGeometry({ fromX: 10, fromY: 37, goalX: 0 }).outsideBox).toBe(false);
    expect(goalGeometry({ fromX: 110, fromY: 10, goalX: 115 }).outsideBox).toBe(true); // wide of the box
  });
});

describe("sanitizeRecordedGoals", () => {
  const home = { id: "h", players: [{ id: "a" }] } as never;
  const away = { id: "w", players: [{ id: "b" }] } as never;
  const g = (playerId: string, team: "home" | "away") => ({ playerId, team, minute: 10, header: false, distance: 20, outsideBox: true });
  test("kept when it matches the score", () => {
    expect(sanitizeRecordedGoals([g("a", "home")], { home: 1, away: 0 }, home, away)).toHaveLength(1);
  });
  test("dropped on a count mismatch, a stranger or a bad number", () => {
    expect(sanitizeRecordedGoals([g("a", "home")], { home: 2, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([g("z", "home")], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([{ ...g("a", "home"), minute: 999 }], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals("x" as never, { home: 0, away: 0 }, home, away)).toBeUndefined();
  });
});
```
`SimulateMatch.test.ts`: numa partida simulada (o teste de `passAttempted` já tem uma), `result.goals.length === score.A + score.B` (com prorrogação), cada gol com `minute` ≥ 0, `distance` > 0 e um `scorerId` presente em `players`/substituições; gol de pênalti com `setPiece: "penalty"` e `outsideBox: false`. `matches.test.ts`: `buildMatchEvent` devolve `event.goals` com ids de elenco e o mesmo total do placar; `buildQuickMatchEvent` não tem `goals`.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

- `goalOfSeason.ts`:
  ```ts
  import { GOAL_Y_MAX, GOAL_Y_MIN, PENALTY_AREA_DEPTH, PENALTY_AREA_Y_MAX, PENALTY_AREA_Y_MIN } from "@/GameEngine/Domain/pitch";
  const r1 = (v: number) => Math.round(v * 10) / 10;
  export function goalGeometry(s: { fromX: number; fromY: number; goalX: number }): { distance: number; outsideBox: boolean } {
    const cy = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
    return {
      distance: r1(Math.hypot(s.goalX - s.fromX, cy - s.fromY)),
      outsideBox: Math.abs(s.goalX - s.fromX) > PENALTY_AREA_DEPTH || s.fromY < PENALTY_AREA_Y_MIN || s.fromY > PENALTY_AREA_Y_MAX,
    };
  }
  ```
  `sanitizeRecordedGoals(goals: unknown, score, home: Pick<Squad,"players">, away: Pick<Squad,"players">): MatchGoal[] | undefined` — array; cada item com `playerId` string do elenco do lado (`team`), `minute` inteiro 0..130, `distance` 0..130, `header` boolean, `outsideBox` boolean, `setPiece` ausente ou um dos 4; contagem por lado = `score` (o placar do recording já inclui a prorrogação); qualquer falha → `undefined`.
- `EventBus.ts`: `goalScored` ganha `fromX: number; fromY: number; goalX: number; minute: number` (obrigatórios — os dois `emit` são os únicos).
- `gameState.ts`: no gol de jogada (`resolveShot`), `fromX: s.shot.fromX, fromY: s.shot.fromY, goalX: s.shot.toX, minute: matchMinute(s)`; no pênalti (`resolveInMatchPenalty`, ~linha 1163), o ponto da marca (`fromX` da cobrança já usado ali) e `goalX` do gol atacado. Nada mais muda.
- `Statistics.ts`: `export interface GoalLogEntry { scorerId: number; assistId?: number; team: TeamId; minute: number; header: boolean; setPiece?: SetPieceGoalKind; fromX: number; fromY: number; goalX: number }`; lista do módulo zerada no mesmo reset das estatísticas; `gameBus.on('goalScored', …)` faz push; `export function getGoalLog(): GoalLogEntry[]` (cópia).
- `SimulateMatch.ts`: `MatchResult.goals: GoalLogEntry[]` = `getGoalLog()` no fim.
- `matches.ts` (`buildMatchEvent`): `goals = result.goals.flatMap(...)` → `MatchGoal` com `playerId = engineIdToRosterId.get(scorerId)` (pula se não mapeia), `team = (scorerTeam === "A") ? "home" : "away"` (A = mandante em `buildMatchEvent`), `minute: minute + 1`, `...goalGeometry(...)`, `assistId` mapeado. Grava `event.goals` (só aqui; `buildQuickMatchEvent` nunca). `buildMatchEventFromRecording`: `const goals = sanitizeRecordedGoals(recording.goals, recording.score, homeSquad, awaySquad)`; `...(goals ? { goals } : {})`.
- `buildPlayedMatchRecording.ts`: `goals` de `getGoalLog()` com o mesmo mapa nome→id do arquivo e o lado pelo `myIsHome` (time A = clube do jogador na partida ao vivo).

- [ ] **Step 4: Rodar** — `bun test src/GameEngine src/Domain/advanceDay src/Domain/awards src/GameInterface/buildPlayedMatchRecording.test.ts` → PASS (nenhum outro resultado de motor muda).

- [ ] **Step 5: Commit** — `feat(prêmios): o motor registra minuto, posição e tipo de cada gol`.

---

### Task 3: Prêmios da liga (puro)

**Files:** Create `src/Domain/awards/leagueAwards.ts` + `leagueAwards.test.ts`.

- [ ] **Step 1: Teste** (fábrica de linhas; `player(id, line, apps, …)` monta um `RosterPlayer` com uma linha de histórico nova)

```ts
import { describe, expect, test } from "bun:test";
import { computeLeagueAwards, leagueCandidates, managerAwardScore, pickTeamOfSeason, seasonScore } from "@/Domain/awards/leagueAwards";

// helper: player with the closing row of `season`/`league`
function mk(id: string, pos: string, o: { apps: number; goals?: number; rating: number; age?: number; cup?: number; titles?: string[] }) {
  return {
    id, name: id, age: (o.age ?? 25) + 1, positions: [pos], stats: {},
    history: [{ season: "2026-27", squadId: "c1", clubName: "C1", league: "pl", apps: o.apps + (o.cup ?? 0), goals: o.goals ?? 0, assists: 0,
      avgRating: o.rating, cupApps: o.cup ?? 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: o.titles ?? [] }],
  } as never;
}

describe("league candidates", () => {
  test("league numbers subtract cups; age is the season age", () => {
    const c = leagueCandidates([{ id: "c1", name: "C1", players: [mk("p", "Forward", { apps: 20, goals: 9, rating: 7, cup: 3 })] } as never], "pl", "2026-27");
    expect(c[0]).toMatchObject({ leagueApps: 20, leagueGoals: 9, age: 25, line: "Forward" });
  });
});

describe("computeLeagueAwards", () => {
  test("min games for rating awards, young ≤ 21, top scorer without minimum, keeper from the GK line", () => {
    const squad = { id: "c1", name: "C1", players: [
      mk("star", "Midfielder", { apps: 30, rating: 7.4 }),
      mk("cameo", "Midfielder", { apps: 5, rating: 9.0 }),
      mk("kid", "Forward", { apps: 25, rating: 7.0, age: 20, goals: 4 }),
      mk("nine", "Forward", { apps: 12, rating: 6.4, goals: 15 }),
      mk("gk", "GK", { apps: 38, rating: 6.9 }),
    ] } as never;
    const a = computeLeagueAwards({ league: "pl", season: "2026-27", closedOn: "2027-05-20", country: "England", tier: 1, weight: 1,
      totalRounds: 38, squads: [squad], table: [], managers: [], targets: new Map(), tierChanges: {}, seasonMid: "2027-01-01" });
    expect(a.bestPlayer?.playerId).toBe("star");          // cameo has 5 < 19 games
    expect(a.youngPlayer?.playerId).toBe("kid");
    expect(a.topScorer).toMatchObject({ playerId: "nine", value: 15 });
    expect(a.bestGoalkeeper?.playerId).toBe("gk");
  });
  test("team of the season: 11, the 4-3-3 slots, best aptitude per slot", () => {
    // 1 GK, 5 DEF, 4 MID, 4 FWD — the worst of each line left out
    const xi = pickTeamOfSeason(/* candidates built with leagueCandidates */ fixtureCandidates());
    expect(xi.map((p) => p.slot)).toEqual(["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"]);
    expect(new Set(xi.map((p) => p.playerId)).size).toBe(11);
  });
  test("manager: beats the target most; champion bonus; late interim excluded", () => {
    expect(managerAwardScore({ position: 3, target: 10, size: 20, champion: false, promoted: false })).toBeCloseTo(0.35);
    expect(managerAwardScore({ position: 1, target: 1, size: 20, champion: true, promoted: false })).toBeCloseTo(0.3);
  });
  test("season score and deterministic tie-break", () => {
    expect(seasonScore({ avgRating: 7, goals: 10, assists: 5, titles: ["league:pl", "continental:ucl"] })).toBeCloseTo(7 + 0.3 + 0.1 + 0.15 + 0.3);
  });
});
```
(`fixtureCandidates()` é um helper local do teste que monta, com `mk`, um elenco com posições naturais conhecidas — use `naturalPosition` para fixar LB/RB/CB/CM/CAM/LW/ST/RW e não depender dos atributos.)

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** (`leagueAwards.ts`)

```ts
export interface AwardCandidate {
  player: RosterPlayer; squadId: string; clubName: string;
  line: MainRole; age: number; leagueApps: number; leagueGoals: number;
  rating: number; goals: number; assists: number; titles: string[];
}

/** The closing row (`season`/`league`, not partial) of every player of the league's squads. Age = season age (squads aged at the transition). */
export function leagueCandidates(squads: Squad[], league: string, season: string): AwardCandidate[]
```
- linha = último item de `history` com `season`, `league` e sem `partial`; `leagueApps = apps − cupApps − contApps`, `leagueGoals = goals − cupGoals − contGoals` (≥ 0); `rating = avgRating ?? 0`; `line = getMainRole(positions[0])`; `age = player.age − 1`.
- `seasonScore(row)` = `rating + GOAL × goals + ASSIST × assists + Σ TITLE[prefixo]` (prefixo de `"league:"`, `"cup:"`, `"continental:"`).
- `byRating` = rating desc, (goals+assists) desc, id asc; `minApps = Math.ceil(totalRounds × MIN_ROUNDS_SHARE)`; elegível por nota = `leagueApps ≥ minApps && rating > 0`.
- `pickTeamOfSeason(cands, minApps)`: por linha (`XI_LINES`), os elegíveis por `byRating`; faltando, completa com `leagueApps ≥ 1`; dentro da linha, em ordem de nota, cada um pega a vaga livre da linha (vagas de `XI_SLOTS` cujo `getMainRole` é a linha) com melhor aptidão (`aptitudeFor(player, slot)`: natural 0, apt 1, training 2, unsuitable 3; empate → primeira vaga livre na ordem de `XI_SLOTS`). Devolve na ordem de `XI_SLOTS`, cada um com `slot`.
- `managerAwardScore({ position, target, size, champion, promoted })` = `(target − position) / size + (champion ? MANAGER_CHAMPION_BONUS : 0) + (promoted ? MANAGER_PROMOTED_BONUS : 0)`.
- `computeLeagueAwards(input)` com `input = { league, season, closedOn, country, tier, weight, totalRounds, squads, table: StandingRow[], managers: ManagerRecord[], targets: Map<string, number>, tierChanges, seasonMid: string, goalOfSeason?: GoalOfSeasonCandidate }` → `LeagueSeasonAwards`:
  - prêmios de jogador como na spec §3; `AwardedPlayer.value` = nota com 2 casas (gols no artilheiro);
  - técnico: para cada linha da tabela com `mp > 0`, `m = managers.find(x => x.squadId === row.squadId)`; elegível se `m` existe e (`!m.hiredOn || m.hiredOn <= seasonMid`); `target = targets.get(id) ?? ceil(n/2)`; `promoted = tierChanges[id]?.to < from`; melhor nota → `bestManager`; desempate pts da tabela desc, id asc;
  - `shortlist.players` = os `SHORTLIST_PLAYERS` melhores por `seasonScore` entre os elegíveis por nota; `shortlist.managers` = os `SHORTLIST_MANAGERS` melhores técnicos.

- [ ] **Step 4: Rodar** — `bun test src/Domain/awards` → PASS.

- [ ] **Step 5: Commit** — `feat(prêmios): prêmios da liga, seleção e técnico (puro)`.

---

### Task 4: Gol da temporada e mundiais (puro)

**Files:** Modify `src/Domain/awards/goalOfSeason.ts` (+ teste); Create `src/Domain/awards/worldAwards.ts` + `worldAwards.test.ts`.

- [ ] **Step 1: Testes**

```ts
// goalOfSeason.test.ts
test("candidates: header or outside the box, never a penalty", () => {
  expect(isGoalCandidate({ header: true, outsideBox: false } as never)).toBe(true);
  expect(isGoalCandidate({ header: false, outsideBox: true } as never)).toBe(true);
  expect(isGoalCandidate({ header: false, outsideBox: true, setPiece: "penalty" } as never)).toBe(false);
  expect(isGoalCandidate({ header: false, outsideBox: false } as never)).toBe(false);
});
test("pick is deterministic per save/league/season, none without candidates", () => {
  const goals = [1, 2, 3, 4].map((i) => ({ key: `k${i}`, distance: 20 + i, header: false } as never));
  const a = pickGoalOfSeason(goals, "s1:pl:2026-27");
  expect(pickGoalOfSeason(goals, "s1:pl:2026-27")).toEqual(a);
  expect(pickGoalOfSeason([], "x")).toBeUndefined();
});
test("goalWeight: header 1, long range up to the cap", () => {
  expect(goalWeight({ header: true, distance: 9 } as never)).toBe(1);
  expect(goalWeight({ header: false, distance: 28 } as never)).toBeCloseTo(2);
  expect(goalWeight({ header: false, distance: 60 } as never)).toBe(3);
});
test("appendGoals ignores repeated keys", () => {
  const g = { key: "f:10:p" } as never;
  expect(appendGoals([g], [g, { key: "f:20:p" } as never])).toHaveLength(2);
});

// worldAwards.test.ts
test("world player: weight × (seasonScore − 5), two entries of the same player add up", () => {
  const league = (slug: string, weight: number, players: [string, number][]) =>
    ({ league: slug, season: "x", closedOn: "2027-05-01", weight, shortlist: { players: players.map(([id, s]) => ({ playerId: id, name: id, squadId: "c", clubName: "C", value: 7, leagueApps: 30, seasonScore: s })), managers: [] }, teamOfSeason: [] } as never);
  const w = computeWorldAwards({ year: 2027, on: "2028-01-01",
    leagues: [league("pl", 1, [["a", 7.6], ["b", 7.5]]), league("ke", 0.2, [["c", 9.0]]), league("sw", 0.4, [["b", 7.4]])],
    managers: [] });
  expect(w.player[0]!.id).toBe("b");   // 2.5 + 0.96 > a's 2.6
  expect(w.player.map((p) => p.id)).toContain("a");
});
test("world manager: shortlist score × weight + title points of the year / 200", () => { /* técnico com título "on" 2027-06-01 de 150 pts vence um com só superação */ });
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

- `goalOfSeason.ts`: `isGoalCandidate(g: Pick<MatchGoal, "header" | "outsideBox" | "setPiece">)` = `g.setPiece !== "penalty" && (g.header || g.outsideBox)`; `goalWeight(g)` = `g.header ? 1 : Math.min(AWARDS.GOAL_WEIGHT_CAP, 1 + Math.max(0, g.distance - 18) / 10)`; `pickGoalOfSeason(goals, seedKey)` = sorteio ponderado com `mulberry32(seedFrom("goal:" + seedKey))` sobre a lista ordenada por `key` (a ordem do arquivo não decide); `appendGoals(cur, add)` sem chaves repetidas; `goalCandidatesOfMatch(event: MatchEvent, date, nameOf)` → `GoalOfSeasonCandidate[]` (`key = fixtureId:minute:playerId`, `squadId`/`opponentId` pelo `team`).
- `worldAwards.ts`: `computeWorldAwards({ year, on, leagues: LeagueSeasonAwards[], managers: ManagerRecord[] }): WorldAwards` — jogadores somando `weight × (seasonScore − WORLD_BASE)` por `playerId` (o nome/clube/liga da entrada de maior parcela), top `TOP_TO_SHOW`; técnicos: Σ `weight × score` da lista curta por `managerId` + Σ pontos de `titles` com `on` entre `${year}-01-01` e `${year}-12-31` ÷ `WORLD_TITLE_DIVISOR` (candidato também quem só tem título); desempate pontos de títulos desc, id asc; `score` com 2 casas. Lista vazia → arrays vazios.

- [ ] **Step 4: Rodar** — `bun test src/Domain/awards` → PASS.

- [ ] **Step 5: Commit** — `feat(prêmios): gol da temporada e prêmios mundiais (puro)`.

---

### Task 5: Efeitos (puro): linhas, bônus de valor, técnico, moral

**Files:** Create `src/Domain/awards/awardEffects.ts` + teste, `src/Domain/awards/awardValue.ts` + teste. Modify `src/Domain/morale/morale.ts` (+ `morale.test.ts`), `src/Domain/contracts/freeAgents.ts` (`toFreeAgent` apaga `awardBoost`).

- [ ] **Step 1: Testes**

```ts
// awardEffects.test.ts
test("withAwardsOnRows adds the award to the closing row only, no duplicate", () => {
  const p = mk("a", "Forward", { apps: 30, rating: 7 });               // helper da Task 3, copiado
  const once = withAwardsOnRows(p, "pl", "2026-27", [{ kind: "best_player", league: "pl" }]);
  expect(once.history!.at(-1)!.awards).toEqual([{ kind: "best_player", league: "pl" }]);
  expect(withAwardsOnRows(once, "pl", "2026-27", [{ kind: "best_player", league: "pl" }])).toBe(once);
});
test("boosts: the largest multiplier, cleared at the next rollover of the league", () => {
  const p = applyAwardBoost(mk("a", "Forward", { apps: 30, rating: 7 }) as never, ["team_of_season", "top_scorer"], "pl", "2026-27");
  expect(p.awardBoost).toEqual({ season: "2026-27", league: "pl", mult: 1.12 });
  expect(clearAwardBoost(p).awardBoost).toBeUndefined();
  expect(clearAwardBoost(mk("b", "GK", { apps: 1, rating: 6 }) as never)).toEqual(mk("b", "GK", { apps: 1, rating: 6 }));
});
test("manager award once per season/kind/competition", () => {
  const ms = [{ id: "m", squadId: "c", titles: [], points: 0 } as never];
  const once = addManagerAward(ms, "m", { season: "2026-27", kind: "best_manager", competition: "pl", squadId: "c" });
  expect(addManagerAward(once, "m", { season: "2026-27", kind: "best_manager", competition: "pl", squadId: "c" })).toBe(once);
});

// awardValue.test.ts
test("value model: the boost multiplies the value and the price grid", () => {
  const p = { age: 27, stats: STATS_6, positions: ["Forward"] } as never;   // STATS_6: fixture local, atributos que dão nota ~6
  const base = playerValueModel(p).valueMillions;
  expect(playerValueModel({ ...p, awardBoost: { season: "x", league: "y", mult: 1.15 } }).valueMillions).toBeCloseTo(base * 1.15);
  expect(new Player(6, 27).valueMillions).toBeCloseTo(base);           // without a 3rd argument nothing changes
});

// morale.test.ts
test("afterAward uses only the largest award (scaled by the temperament)", () => {
  const sq = { players: [{ id: "a", morale: 65 }, { id: "b", morale: 65 }] } as never;
  const both = moraleOf(afterAward(sq, "a", ["team_of_season", "best_player"]).players[0]!);
  expect(both).toBe(moraleOf(afterAward(sq, "a", ["best_player"]).players[0]!));
  expect(both).toBeGreaterThan(moraleOf(afterAward(sq, "a", ["team_of_season"]).players[0]!));
  expect(both).toBeGreaterThan(65);
  expect(afterAward(sq, "a", []).players[0]).toBe(sq.players[0]);
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

- `awardEffects.ts`: `withAwardsOnRows(player, league, season, awards)` (mesma referência quando nada muda); `applyAwardBoost(player, kinds, league, season)` (`mult` = máximo de `AWARDS.VALUE_MULT` entre os `kinds`; nenhum → sem mudança); `clearAwardBoost(player)`; `addManagerAward(managers, managerId, award)`; `awardKindsByPlayer(a: LeagueSeasonAwards): Map<string, LeagueAwardKind[]>` (best/young/top/gk, `team_of_season` para os 11, `goal_of_season` para o autor; o técnico fica de fora).
- `awardValue.ts`: `awardValueMult(p) = p.awardBoost?.mult ?? 1`; `playerValueModel(p, rating = overallAvg(p)) = new Player(rating, p.age, awardValueMult(p))`.
- `Player.ts`: `constructor(readonly overallRating: number, readonly age: number, readonly valueMult = 1)`; `valueMillions` multiplica por `valueMult`. (`awardValue.ts` usa `overallAvg` de `@/Domain/playerRating` — é o que `playerOverallRating` de `transferNeeds.ts` chama — para não criar ciclo com `transferNeeds.ts`, que importa `awardValue.ts` na Task 6.)
- `morale.ts`: `export function afterAward(squad: Squad, playerId: string, kinds: AwardKind[]): Squad` — delta = maior `AWARDS.MORALE[k]`; `withEventDelta`.
- `freeAgents.ts`: `toFreeAgent` remove `awardBoost`.

- [ ] **Step 4: Rodar** — `bun test src/Domain/awards src/Domain/morale src/Domain/contracts` → PASS.

- [ ] **Step 5: Commit** — `feat(prêmios): efeitos nas linhas, no valor, no técnico e na moral (puro)`.

---

### Task 6: Valor de mercado com o bônus

**Files:** Modify `src/Domain/negotiation/bids.ts`, `rivals.ts`, `askingPrice.ts`, `src/Domain/transfer/transferAcceptance.ts`, `transferNeeds.ts`, `src/Domain/scout/displayPlayer.ts`, `src/Domain/scouting/missions.ts`, `src/Domain/scouting/seen.ts`; tests nos `*.test.ts` vizinhos.

- [ ] **Step 1:** `grep -rn "new Player(" src --include=*.ts --include=*.tsx | grep -v test` — todo uso sobre um `RosterPlayer` (rating do jogador + idade dele) passa a `playerValueModel(p)` (ou `playerValueModel(p, rating)` quando o rating já foi calculado). Usos sem jogador (curvas, `seen.ts` com a faixa vista: multiplique o resultado por `awardValueMult(p)`) ficam com `new Player(...)`.
- [ ] **Step 2: Testes** — `askingPrice.test.ts`: `playerMarketValue` de um premiado (×1,15) é a grade de `valueMillions × 1,15`; `transferAcceptance.test.ts`: o `expectedValue` de um premiado sobe (a mesma oferta tem `offerScore` menor); `seen` (`scoutSeen.test.ts`): a faixa de valor de um premiado é ×mult. Um jogador sem `awardBoost` dá exatamente os números de antes (teste com o mesmo jogador antes/depois).
- [ ] **Step 3:** Implementar e rodar `bun test src/Domain/negotiation src/Domain/transfer src/Domain/scout src/Domain/scouting` → PASS.
- [ ] **Step 4: Commit** — `feat(prêmios): valor de mercado maior para o premiado`.

---

### Task 7: Clubes grandes e medição do mercado (obrigatória)

**Files:** Modify `src/Domain/transfer/transferNeeds.ts` (`scoreImprovement`), `src/Domain/negotiation/bids.ts` (proposta de clube maior), `scripts/market-sim.ts` (`--awards`); tests `transferNeeds.test.ts`, `src/Domain/negotiation/negotiation.test.ts`.

- [ ] **Step 1: Testes** — `scoreCandidate` de `improvement` com o mesmo `rng` fixo: premiado = não premiado + `AWARDS.IMPROVEMENT_BONUS` (mesmo `fee`); `cover_need`/`future_investment` não mudam. `generateBidsForHuman` com `rng` que dá `UNLISTED_CHANCE < r < UNLISTED_CHANCE × 2` no sorteio da proposta: sem premiado, nenhuma proposta de clube maior; com um premiado livre, uma proposta **por ele** (mesmo não sendo o de maior nota).
- [ ] **Step 2:** Implementar: `scoreImprovement` soma `(player.awardBoost ? AWARDS.IMPROVEMENT_BONUS : 0)`; em `bids.ts`, `const awarded = free.filter((p) => p.awardBoost).sort(byRating)[0]`, chance `B.UNLISTED_CHANCE × (awarded ? AWARDS.BIG_CLUB_BID_MULT : 1)`, alvo `awarded ?? best`. Rodar `bun test src/Domain/transfer src/Domain/negotiation` → PASS.
- [ ] **Step 3: `market-sim --awards`.** No fim de cada liga sintética (`ls.done`): limpa `awardBoost` dos elencos da liga e sorteia os "premiados" com a regra de linhas (o XI por linha pela **nota do jogador** `playerOverallRating` + ruído `N(0; 0,3)` com o `rng` do script — não há nota de partida no script — e o melhor/artilheiro/goleiro/revelação entre eles), aplicando `applyAwardBoost`. Imprime premiados vendidos na temporada e a taxa média ÷ valor sem bônus.
- [ ] **Step 4: Medir** — `bun scripts/market-sim.ts 3` e `bun scripts/market-sim.ts 3 --awards` (mesma semente). Aceite: transferências IA × IA com taxa ±5%; `open` ≥ 90% em todo tier; elenco médio igual (±0,1). Fora disso, ajuste só `AWARDS.IMPROVEMENT_BONUS` e meça de novo. Registre a tabela (sem/com, por temporada, premiados vendidos) em `.claude/rules/game/awards.md` (criado na Task 16; anote aqui no commit e copie lá). Commit `feat(prêmios): clubes grandes procuram os premiados + medição do mercado`.

---

### Task 8: DAL — arquivos de prêmios e de gols da temporada

**Files:** Modify `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `src/backend/SaveService.ts`; tests em `src/backend/dal/*.test.ts`.

- [ ] **Step 1: Testes** — `BufferingSaveDAL`: `writeAwardsYear`/`readAwardsYear` lê o que foi escrito antes do `flush` e não grava nada sem `flush`; `listAwardYears` inclui um ano só bufferizado; `writeSeasonGoals` + `deleteSeasonGoals` (tombstone some das leituras). `FileSystemDAL`: caminhos `saves/{id}/awards/{ano}.json` e `saves/{id}/seasonGoals/{liga}-{ano}.json`; ano sem arquivo → `null`; `listAwardYears` ordenado crescente; `listSeasonGoalFiles(saveId)` → `{ league, year }[]`.
- [ ] **Step 2:** Implementar (molde de `readStaffPool`/`writeStaffPool` e do tombstone de `deleteSquad`; chaves `awards:${saveId}:${year}` e `seasonGoals:${saveId}:${league}:${year}`, fase 1 do `flush`). `SaveService`: `getAwardsYear`, `writeAwardsYear`, `listAwardYears`, `getSeasonGoals`, `writeSeasonGoals`, `deleteSeasonGoals`, `listSeasonGoalFiles`. Valide `league` (`/^[a-z0-9_]+$/`) e `year` (inteiro 1900..2999) antes de montar caminho.
- [ ] **Step 3:** `bun test src/backend/dal` → PASS. Commit `feat(prêmios): arquivos de prêmios e de gols da temporada no DAL`.

---

### Task 9: Avanço do dia — gols da temporada e data dos títulos

**Files:** Create `src/backend/awardsWorld.ts`; Modify `src/backend/advanceDay.ts`, `src/backend/managerWorld.ts` (`createManagerTracker({ …, date })`, `credit` grava `on: date`); test `src/backend/awards.goals.test.ts`.

- [ ] **Step 1: Teste** — save de teste (molde dos testes de rota em `src/backend/*.routes.test.ts`, com `RUNTIME_DATA_DIR` do preload): avançar um dia de rodada da liga do jogador; `seasonGoals/{liga}-{ano}.json` existe só para a liga do jogador (e as seguidas) e cada entrada é cabeçada ou de fora da área, sem pênalti; repetir o mesmo `appendSeasonGoals` com o mesmo evento não duplica; nenhum arquivo para ligas no quickSim. `managers.rollover.test.ts`: o título creditado na virada tem `on` = data do dia.
- [ ] **Step 2:** `awardsWorld.ts`: `recordSeasonGoals(service, saveId, date, events: MatchEvent[], states: LeagueSeasonState[], nameOf)` — só eventos com `goals` cuja `competition` é uma liga ativa (não `isCupSlug`/`isContinentalSlug`), agrupa por liga, `appendGoals` no arquivo do `year` da liga. Chamar no `advanceOneDay` logo depois do laço das partidas (antes do bloco de virada), com `dayEvents`.
- [ ] **Step 3:** `bun test src/backend/awards.goals.test.ts src/backend/managers.rollover.test.ts` → PASS. Commit `feat(prêmios): candidatos a gol da temporada nas ligas do motor`.

---

### Task 10: Virada — prêmios da liga

**Files:** Modify `src/backend/awardsWorld.ts`, `src/backend/advanceDay.ts` (passo 3), `src/backend/managerWorld.ts` (`createAiManagerDesk` expõe `targets(slug, season)` = `targetsOf`); Create `src/Domain/awards/awardMessages.ts`; test `src/backend/awards.rollover.test.ts`.

- [ ] **Step 1: Teste** (`awards.rollover.test.ts`, molde de `managers.rollover.test.ts`/`board.advanceDay.test.ts`: save de teste, força o fim da temporada da liga do jogador e avança até a virada) — `awards/{ano}.json` tem a liga com `teamOfSeason` de 11, `bestPlayer`, `topScorer`, `bestManager`; a linha de histórico do melhor jogador tem `{ kind: "best_player", league }`; ele tem `awardBoost`; se é do clube do jogador, a moral subiu; o técnico premiado tem `awards`; inbox com `awards`/`league` depois do `clearInbox`; refazer a virada sobre o mesmo estado (chamar `recordLeagueAwards` de novo com a mesma entrada) não duplica nada; uma liga quickSim tem prêmios mas não `goalOfSeason`.
- [ ] **Step 2: Implementação**
  - `awardsWorld.ts`: `async function recordLeagueAwards(service, saveId, args): Promise<{ squads: Squad[]; managers: (ms) => ms; message?: AwardsInboxMessage }>` com `args = { league, season, closedOn, country, tier, weight, state: LeagueSeasonState, squads: Squad[] /* transition.squadsToSave */, table, managers, targets, tierChanges, playerClubId, leagueName }`:
    1. `squads` → `clearAwardBoost` em todo jogador;
    2. gol: `getSeasonGoals(league, state.year)` → `pickGoalOfSeason(goals, `${saveId}:${league}:${season}`)`;
    3. `computeLeagueAwards(...)` (`seasonMid` = meio de `state.start`..`state.end`);
    4. por premiado: `withAwardsOnRows` + `applyAwardBoost`; no clube do jogador, `afterAward`;
    5. `upsertLeagueAwards`: lê `awards/{ano de closedOn}.json`, troca/insere a entrada (`league`+`season`), grava; apaga `seasonGoals` desta liga com `year < state.year`;
    6. mensagem `league` se `league` é a liga do clube do jogador (`buildAwardsMessage`).
  - `advanceDay.ts`, passo 3 de cada liga: **antes** de `aiDesk.rollover`, monte `targets` (`aiDesk?.targets(slug, season)` ou, sem desk, `objectiveFor` dos `transition.squadsToSave` como no `targetsOf`; clube do jogador = `board?.objective?.target`) e leia `managerTracker.list()` (os técnicos ainda são os da temporada); passe ao `recordLeagueAwards` **depois** do laço de `closeSeasonForPlayers` (os elencos já com as linhas novas), troque `ref.squad` pelos devolvidos e aplique `addManagerAward` via `managerTracker.apply`. `weight = unitWeight × AWARDS.TIER_FACTOR[min(3, tier)]`. A mensagem vai para uma fila nova `deferredAwardsMessages`, gravada junto das outras filas depois do `clearInbox`.
  - `awardMessages.ts`: `buildAwardsMessage(m)` com assunto/texto em inglês de fallback (a tela traduz).
- [ ] **Step 3:** `bun test src/backend/awards.rollover.test.ts src/backend/managers.rollover.test.ts src/backend/board.advanceDay.test.ts` → PASS. Commit `feat(prêmios): prêmios da liga na virada`.

---

### Task 11: Cerimônia mundial em janeiro

**Files:** Modify `src/backend/awardsWorld.ts`, `src/backend/advanceDay.ts`; Create `src/backend/awards.world.test.ts`.

- [ ] **Step 1: Teste** — save de teste com `awards/2027.json` semeado (duas ligas com listas curtas e um técnico com título `on: "2027-06-01"`), `currentDate` 2027-12-31: avançar um dia → `world` gravado em `awards/2027.json` com `year: 2027`, `on: "2028-01-01"`; o vencedor tem `world_player` (`year: 2027`) na linha da temporada da lista curta e `awardBoost` 1,15; o técnico tem `world_manager`; inbox `awards`/`world`; avançar mais um dia não muda nada; num janeiro sem arquivo do ano anterior (ou com `leagues: []`) nada acontece.
- [ ] **Step 2:** `runWorldCeremony(service, saveId, date, playerClubId)`: se `date.slice(5, 7) === "01"`, lê `awards/{ano − 1}`; com ligas e sem `world`: `computeWorldAwards` (`managers` do `managerTracker`), grava; acha o jogador vencedor pelo `squadId` da lista curta (`getSquadById`; não está → varre `getSquadIndex`, depois livres e aposentados; não achou → só o arquivo e a mensagem), aplica `withAwardsOnRows` na linha da temporada (`season`/`league` da entrada) + `applyAwardBoost(["world_player"], liga atual dele, temporada da entrada)` + moral se é do clube do jogador; técnico via `managerTracker.apply(addManagerAward)`. Chamar no `advanceOneDay` depois do bloco de viradas; mensagem na fila adiada.
- [ ] **Step 3:** `bun test src/backend/awards.world.test.ts` → PASS. Commit `feat(prêmios): melhor jogador e melhor técnico do mundo em janeiro`.

---

### Task 12: Inbox

**Files:** Modify `src/GameInterface/InboxScreen.tsx` (+ `src/GameInterface/Awards/AwardsInboxBody.tsx`), `src/i18n/locales/en.json`, `pt-BR.json`.

- [ ] Corpo `league`: lista dos prêmios (selo + nome com link para a ficha + clube), os do clube do jogador destacados (`text-primary`), o XI em uma linha por setor, o técnico (posição × meta), o gol ("34' contra X · de cabeça" / "de 27 jardas"). Corpo `world`: os 3 primeiros de cada prêmio com a liga e a pontuação. Assunto traduzido (`inbox.awards.leagueSubject` "Prêmios da {{league}} {{season}}", `inbox.awards.worldSubject` "Prêmios mundiais {{year}}"). `bun run ui:audit` sem violações nos arquivos novos. `bun test src/GameInterface`. Commit `feat(prêmios): mensagens de prêmios na inbox`.

---

### Task 13: Rotas e olheiro

**Files:** Create `src/backend/awardsRoutes.ts` + `src/backend/awards.routes.test.ts`; Modify `src/index.ts` (registrar), `src/backend/managerRoutes.ts` (itens com `awards`), `src/Domain/scout/scoutFilterState.ts` (`onlyAwarded`), `src/Domain/scout/scoutQuery.ts` (linha `awarded`, filtro), `src/backend/scoutSearch.ts` (`awarded = player.history?.some(r => r.awards?.length)`; filtro do corpo), `src/Domain/scout/displayPlayer.ts`; tests `scoutSearch.test.ts`, `managers.routes.test.ts`.

- [ ] **Step 1: Testes** — `GET /api/saves/:id/awards`: 401/403 de outro dono, `year=abc` → 400, ano sem arquivo → 404, sem `year` = o mais recente com `years` crescente. `scout-search` com `onlyAwarded: true` devolve só jogadores com prêmio no histórico (e a linha traz `awarded: true`), qualquer conhecimento. `/managers` traz `awards` do técnico.
- [ ] **Step 2:** Implementar e rodar `bun test src/backend/awards.routes.test.ts src/backend/scoutSearch.test.ts src/backend/managers.routes.test.ts src/Domain/scout` → PASS. Commit `feat(prêmios): rota de prêmios, técnicos premiados e filtro do olheiro`.

---

### Task 14: Telas

**Files:** Create `src/GameInterface/Awards/AwardsView.tsx`, `AwardBadge.tsx`, `awardsApi.ts`; Modify `src/GameInterface/StatsScreen.tsx` (aba `awards`), `src/GameInterface/PlayerScreen.tsx` (selos no cabeçalho), `src/GameInterface/Components/CareerTable.tsx` (selos na coluna Títulos), `src/GameInterface/Components/ManagerRanking.tsx` (coluna e detalhe), `src/GameInterface/ScoutScreen.tsx` / filtros (chip "Só premiados"), i18n.

- [ ] **Aba Prêmios** (`?tab=awards`): `SegmentedTabs` com a aba nova; seletores com rótulo ("ANO", "LIGA" — `SelectCombobox` agrupado como o de competições, `statsCompetitionOptions` sem copas/continentais); cartão "Prêmios mundiais" do ano no topo quando houver; por liga: grade de cartões (`card-arcade`, título de seção, `AwardBadge`, jogador com link `/player?...` como a `StatsScreen` já faz, escudo 32px, número em `font-display font-bold tabular-nums`), XI em `TABLE_STYLE` (vaga com `getDetailedPositionColor`, jogador, clube, nota), técnico e gol da temporada. Estado vazio "Nenhuma temporada encerrada ainda". Carregando/erro como as outras abas.
- [ ] **`AwardBadge`**: ícone (`award` jogador, `medal` seleção/goleiro/revelação, `trophy` mundiais, `star` gol) + texto `text-sm` (`awards.kind.<kind>`), `title` com a liga/temporada; nunca < 13px.
- [ ] **Ficha:** até 6 selos (mais recentes) e "+N"; **CareerTable:** selos pequenos (só ícone 16px com `title`/`aria-label`) depois dos títulos; **ranking:** coluna "Prêmios" (contagem) e a lista no detalhe; **olheiro:** `<Chip selected>` "Só premiados".
- [ ] `bun run ui:audit` (0 duras, 0 leves nos arquivos tocados), `bun test src/GameInterface`; conferir no navegador com o servidor de dev (`DEV_AUTO_LOGIN=1`, `.claude/rules/dev-login.md`) num save que passou por uma virada (o do smoke da Task 15 serve, antes de ser apagado, ou um save de teste com `awards/2027.json` copiado). Commit `feat(prêmios): aba Prêmios, selos na ficha, ranking e olheiro`.

---

### Task 15: Smoke

**Files:** Modify `scripts/season-rollover-smoke.ts`.

- [ ] Seção **"Prêmios"** (spec §10), lendo depois de cada dia de virada: para cada liga virada, a entrada do arquivo do ano; XI com 11 ids únicos e as vagas do 4-3-3; mínimos de jogos de liga (das linhas de histórico) para melhor jogador, revelação, goleiro e XI (o complemento do XI é contado e só informado); revelação com idade na temporada ≤ 21; goleiro da linha GK; artilheiro = máximo de gols de liga das linhas da liga; `goalOfSeason` presente só em ligas de `{meta.leagueSlug} ∪ meta.followedLeagues` e ausente nas demais (presente na liga do jogador se houve ao menos um candidato no arquivo de gols); cada premiado com o prêmio na linha e `awardBoost`; premiado do clube do jogador com moral maior que no dia anterior; técnico premiado com o registro; mensagem `awards`/`league` na inbox do dia da virada do país do jogador. Mundial: se a corrida passar por janeiro, `world` gravado no arquivo do ano anterior; senão imprime "mundial: coberto por awards.world.test.ts".
- [ ] Rodar `bun scripts/season-rollover-smoke.ts` (~15 min, sozinho na máquina) e `bun test` completo. Commit `test(prêmios): seção Prêmios do smoke`.

---

### Task 16: Regras, changelog, versão, roadmap

**Files:** Create `.claude/rules/game/awards.md`; Modify `.claude/rules/game/history.md` (`awards` na linha), `managers.md` (`awards`, `ManagerTitle.on`), `stats.md` (aba Prêmios), `morale.md` (evento de prêmio), `scouting.md` (filtro), `negotiation.md` + `AI-clubs/transfer-needs.md` (valor com bônus, `IMPROVEMENT_BONUS`, proposta de clube maior), `game-engine/aerial.md` / `set-pieces-play.md` (o `goalScored` leva posição e minuto; `MatchEvent.goals`), `non-player-games.md` (o quickSim não grava gols), `responsibilities.md` (categoria `awards` → `competitions`), `docs/ROADMAP.md` (32 ✅), `src/GameInterface/changelog/changelog.ts` (**CRLF**), `package.json`.

- [ ] `awards.md`: regra, arquivos, prêmios e critérios, gol da temporada, mundiais, efeitos, telas, rotas, `/test` `/lab` (sem efeito de partida), smoke, medição do mercado (Task 7), pontos abertos da spec.
- [ ] Changelog **4.8** (data do dia): itens pt/en — "Prêmios de fim de temporada em todas as ligas: melhor jogador, revelação, artilheiro, melhor goleiro, seleção, melhor técnico e gol da temporada" / "End-of-season awards in every league: player, young player, top scorer, goalkeeper, team of the season, manager and goal of the season"; "Melhor jogador e melhor técnico do mundo, todo janeiro" / "World player and manager of the year, every January"; "Premiados ficam mais valorizados e mais procurados por clubes grandes; aba Prêmios em Estatísticas e filtro no olheiro" / "Award winners are worth more and wanted by bigger clubs; Awards tab in Stats and a scout filter". Em `upcoming`, remover o item de prêmios e colocar a próxima etapa do ROADMAP ainda não feita (33, olheiros por país: "Olheiros que conhecem países: missões rendem mais onde o olheiro conhece" / "Scouts who know countries: missions pay off more where the scout knows the ground"). Editar com a ferramenta Edit; conferir CRLF (`file src/GameInterface/changelog/changelog.ts`). `package.json` `"version": "4.8"`. `bun test src/GameInterface/changelog`.
- [ ] `git diff --stat` (nenhum arquivo convertido inteiro). Commit `chore: 4.8 — prêmios de fim de temporada`.
