# Multiplayer parte 1 (assentos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o save passa a guardar N técnicos humanos ("assentos") num mesmo mundo, cada um com arquivos próprios
(`saves/{id}/seats/{seatId}/`), o mundo comum na meta, membros por usuário em `save_members`, e o avanço do dia age
sobre todos os assentos; o solo vira um save com um assento e nada visível muda para o jogador.

**Spec:** `docs/superpowers/specs/2026-10-14-multiplayer-design.md` (visão geral e §2, parte 1). Este plano cobre só a
parte 1 (§2.1–§2.6), na ordem das fatias da §2.5.

**Architecture:**
- **Dados.** `SaveMeta` fica só com o mundo (`mode`, `seats` e o que já era do mundo). O que era do técnico vai para
  `seats/{seatId}/seat.json` (`SeatState`), e os arquivos do técnico (`tactics.json`, `achievements.json`,
  `scouting.json`, `inbox.json`, `ledger/{temporada}.json`, a parte humana do `market.json`) vão para a pasta do
  assento. A visão mesclada `SeatMeta = SaveMeta & SeatState & { seatId }` (`metaForSeat`) tem o mesmo formato da meta
  de hoje: o frontend e a maior parte do backend leem a mesma coisa.
- **Estrangulamento (strangler) para manter a suíte verde em toda tarefa.** A Tarefa 4 grava o formato final no disco
  logo de cara, mas deixa uma camada de transição no `SaveService`: `getMeta`/`updateMeta` mesclam/separam o
  **primeiro assento**, e os métodos de arquivo do assento aceitam um `seatId` opcional no fim (ausente = primeiro
  assento). As tarefas seguintes convertem os chamadores, grupo por grupo, para passar o assento de forma explícita. A
  Tarefa 29 apaga a transição: `seatId` vira obrigatório, `getMeta` devolve só o mundo e o `tsc` aponta qualquer
  chamador que sobrou.
- **Rotas.** `requireSeat(req, saveId)` lê `save_members` e devolve `{ userId, email, seatId, role }` (404 se o
  usuário não é membro). Toda rota "do técnico" age sobre o assento da requisição; as do mundo aceitam qualquer membro.
- **Avanço do dia.** `advanceOneDay` carrega a meta do mundo e uma lista de `DaySeat` (um por assento, com o clube, a
  tática, a diretoria e todos os acumuladores do dia). Os passos que hoje usam `playerSquadId` viram exclusão (a IA
  ignora o conjunto de clubes humanos) ou laço por assento; a gravação ao vivo vira um mapa por assento; a virada limpa
  só a caixa do assento cujo país virou. Os clubes da IA folgam pela própria agenda.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun:sqlite`), React 19 no frontend; `tsc --noEmit` como rede de segurança
dos refactors (`bun run typecheck`).

## Convenções (valem para todas as tarefas)

- Imports sempre `@/…` (nunca relativos).
- Sem migração de save: saves antigos (sem `seats`, sem linha em `save_members`) somem da lista do usuário. Nenhum
  código de compatibilidade com o formato antigo.
- **Sem versão nova nem changelog:** nada visível ao jogador muda nesta parte (a versão e o "Em breve" sobem na parte 2,
  junto com a primeira coisa visível). `package.json`, `changelog.ts` e `MIN_COMPATIBLE_SAVE_VERSION` não mudam.
- Nunca commitar `src/Data` (é cópia de runtime) nem saves.
- Commits: mensagem curta em português, terminando com a linha
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use `-m "<título>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`).
- Setup do worktree (uma vez, antes da Tarefa 1):

  ```bash
  cd C:/Projects/FMProject-mp
  bun install --frozen-lockfile && mkdir -p src/Data && cp -R src/example_data/. src/Data/
  ```

- **Linha de base do `tsc`:** a `main` tem exatamente 1 erro pré-existente
  (`src/GameEngine/Domain/DecisionTree.ts(750,11): error TS2353`). "tsc limpo" neste plano = só esse erro:

  ```bash
  bun run typecheck 2>&1 | grep "error TS" | grep -v "DecisionTree.ts(750"
  ```

  Esperado: nenhuma linha.

- **A suíte inteira tem de ficar verde ao fim de CADA tarefa**, rodada em partes (a suíte toda de uma vez estoura a
  memória):

  ```bash
  bun test src/Domain src/GameEngine src/GameInterface src/GraficsEngine src/types src/i18n src/repoHygiene.test.ts scripts
  find src/backend -name "*.test.ts" | sort | xargs -n 10 sh -c 'bun test "$@" || exit 255' _
  bun test src/lab src/mcp
  ```

  O segundo comando roda o backend em blocos de 10 arquivos, um bloco de cada vez, e para no primeiro bloco que falhar.
  Se um bloco morrer por falta de memória (processo morto, sem falha de teste), rode o mesmo bloco de novo sozinho.

- Antes de cada commit: tsc limpo + a suíte verde. Os passos de cada tarefa repetem isso como "Verificação final".

## Mapa de arquivos

**Novos**

| Arquivo | Papel |
|---|---|
| `src/types/seatTypes.ts` | `SeatState`, `SeatContext`, `SaveManager`, `RotationOverride`, `MemberRole`, `SEAT_KEYS`, `SEAT_ID_PATTERN` |
| `src/Domain/seats/seats.ts` (+ teste) | `metaForSeat`, `splitSeatPatch`, `isSeatKey`, `seatManagerId`, `seatIdOfManager`, `isValidSeatId` |
| `src/Domain/market/seatMarket.ts` (+ teste) | `emptySeatMarket`, `emptyWorldMarket`, `joinMarket`, `splitMarket` |
| `src/backend/dal/seats.dal.test.ts` | Arquivos do assento no `FileSystemDAL` e no `BufferingSaveDAL` |
| `src/backend/auth/saveMembers.test.ts` | Tabela `save_members` |
| `src/backend/testing/seatFixtures.ts` | `ownSolo` (testes: o usuário vira dono do único assento de um save) |
| `src/backend/seats.saveService.test.ts` | Meta do mundo + assento no `SaveService` e no `createSave` |
| `src/backend/saves.seat.routes.test.ts` | `GET/PUT /api/saves/:id` pelo assento |
| `src/backend/daySeats.ts` (+ teste) | `DaySeat`, `loadDaySeats`, `humanClubSet`, `seatByClub` |
| `src/Domain/advanceDay/aiRest.ts` (+ teste) | `aiRestingClubs` (folga da IA pela própria agenda) |
| `src/Domain/managers/seatManagers.ts` (+ teste) | `placeSeatManager`, `managerOfSeat` |
| `src/backend/seats.ts` | `addSeat` (helper de teste/script: assento extra) |
| `src/backend/seats.twoSeats.test.ts` | Os testes de dois assentos da spec §2.4 |
| `scripts/ai-rest-measure.ts` | Medição da folga da IA (fôlego, lesões, folgas) |
| `.claude/rules/game/multiplayer.md` | Regra da parte 1 |

**Modificados (principais)**

| Arquivo | O que muda |
|---|---|
| `src/backend/SaveService.ts` | `WorldMeta`/`SeatMeta`, API do assento, `createSave` com o primeiro assento, métodos de arquivo do assento |
| `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts` | Arquivos do assento; `readMeta`/`writeMeta` do mundo; `market.json` do mundo |
| `src/backend/db.ts`, `src/backend/auth/saveOwnership.ts`, `src/backend/auth/middleware.ts` | `save_members`, `requireSeat` |
| `src/types/transferMarketTypes.ts` | `WorldMarketState`, `SeatMarketState` |
| `src/types/calendarTypes.ts` | `LeagueSeasonState.restDays` sai |
| `src/types/managerTypes.ts` | `ManagerRecord.seatId` no lugar de `isPlayer` |
| `src/types/nationalTypes.ts` | `NationalState.human`/`offers` por assento |
| `src/types/playerTypes.ts` | `RetiredPlayer.rebornSeatId` |
| `src/types/transferTypes.ts` | `TransferRecord.direction` só na resposta |
| `src/types/newsTypes.ts` | `humanClubIds`/`humanLeagues` |
| `src/backend/advanceDay.ts` | Laço por assento, exclusão, mapa de gravações, virada por assento, folga da IA |
| `src/backend/advanceUntil.ts` | Para no jogo do assento que pediu |
| `src/Domain/transfer/marketRotation.ts`, `transferNeeds.ts`, `src/Domain/contracts/freeAgents.ts` | Exclusão por conjunto; lances pelos jogadores humanos por assento |
| `src/backend/managerWorld.ts`, `registrationWorld.ts`, `marketWindowWorld.ts`, `youthCompWorld.ts`, `nationalWorld.ts`, `nationalCoachWorld.ts`, `jobWorld.ts`, `newsWorld.ts`, `scoutingWorld.ts`, `moraleWorld.ts`, `negotiationWorld.ts`, `rivalWorld.ts`, `pressWorld.ts`, `achievementsWorld.ts`, `directorWorld.ts`, `FinancialService.ts`, `reschedulingWorld.ts`, `startKits.ts` | Recebem o assento ou o conjunto de clubes humanos |
| `src/Domain/season/seasonTransition.ts`, `countryRollover.ts`, `src/Domain/retirement/retirement.ts`, `src/Domain/jobs/jobs.ts`, `src/Domain/managers/managers.ts`, `src/Domain/national/nationalCoach.ts`, `src/Domain/inbox/inboxEvents.ts`, `src/Domain/advanceDay/simMode.ts`, `matchSimulationLineups.ts` | Conjuntos de humanos / assento explícito |
| ~23 módulos de rota (`saves.ts`, `inbox.ts`, `transfers.ts`, …) | `requireSeat` e o assento da requisição |
| `src/GameInterface/gameSession.ts`, `GameSaveProvider.tsx`, `Dashboard/HomeCards.tsx`, `Achievements/AchievementsScreen.tsx` | `seatId` na sessão; resposta `SeatMeta` |
| `scripts/bench-advance-day.ts`, `scripts/season-rollover-smoke.ts` | `--seats 2` |
| `.claude/rules/*` (membership, jobs, managers, board-fans, national-teams, negotiation, transfers, project-structure), `docs/ROADMAP.md` | Documentação |

## Decisões tomadas onde a spec não detalhava

1. **Estrangulamento em vez de troca de assinatura de uma vez** (Arquitetura acima): a camada de transição vive da
   Tarefa 4 à Tarefa 29 e some antes do merge (a Tarefa 29 tem grep que prova).
2. **`seatId` no fim dos métodos do `SaveService`** (`getTactics(saveId, seatId)`, `getLedger(saveId, season, seatId)`,
   `appendInbox(saveId, message, seatId)`…): é o que permite o parâmetro opcional na transição; na Tarefa 29 ele fica
   obrigatório na mesma posição. Nos helpers do backend (fora do `SaveService`) o `seatId` entra logo depois do
   `saveId` e já nasce obrigatório.
3. **Nomes no DAL:** os arquivos do assento ganham métodos próprios (`readSeatTactics`, `readSeatInbox`, …); os antigos
   (`readTactics`, `readInbox`, …) saem na Tarefa 5. `readMarket`/`writeMarket` ficam com a parte do mundo.
4. **`market.json` do assento** guarda os campos humanos de hoje com o tipo `SeatMarketState`; `MarketState`
   continua o tipo **juntado** (mundo + assento) que o domínio já usa (`joinMarket`/`splitMarket`), para não mexer em
   dezenas de funções puras.
5. **Ids:** `seatId = randomUUID()`; técnico humano `seat:<seatId>`; validação de caminho `SEAT_ID_PATTERN`
   (`^[a-z0-9][a-z0-9-]{0,63}$`).
6. **`save_members`:** chave `(save_id, user_id)` e índice único `(save_id, seat_id)`; a tabela antiga `saves` **fica no banco e deixa de
   ser usada** (nunca `DROP` no banco de produção; sem migração — os saves são apagados a cada versão). Só o dono apaga o save
   (`DELETE` de um `member` = 403).
7. **Lista de saves:** `GET /api/saves` devolve, para cada mundo de que o usuário é membro, a meta mesclada com o
   assento dele, mais `role`.
8. **Resposta do avanço do dia:** `AdvanceDayOutcome` ok ganha `seats: Record<seatId, …>` com o que é do assento
   (`seasonEnded`, `sacked`, `jobOffers`, `achievements`, `pressInvite`, a parte de virada); `payloadForSeat` monta a
   resposta de hoje para o assento da requisição. A rota e o `advance-until` usam isso.
9. **Folga da IA:** um clube da IA folga hoje quando tem jogo oficial ontem ou amanhã e não joga hoje
   (`aiRestingClubs`, das datas de jogo do próprio clube). O assento folga nos `seat.restDays` (semeados pela liga do
   clube na criação, na virada do país do assento e depois do kit, e seguindo as remarcações).
10. **Humano × humano na parte 1:** dois assentos na mesma liga se enfrentam no motor completo com as táticas dos dois
    (`computeSeatedMatchLineups`), sem partida ao vivo (a partida ao vivo de humano × humano é a parte 4). A gravação
    ao vivo de um assento só vale para um jogo contra a IA.
11. **`transfers.json`:** não é mais zerado; na virada de qualquer país, registros anteriores ao início mais antigo
    das temporadas em curso saem (poda). O arquivo de cada liga recebe só os registros da janela da temporada dela.
12. **`addSeat`** usa o mesmo caminho da troca de clube (`takeOverClub`), sem o lançamento de chegada, mais a TV
    inicial (`applyBroadcasting`), como o `createSave`. Fica em `src/backend/seats.ts` (usado por testes e scripts).

## Riscos

- **Tamanho do refactor do dia** (3 280 linhas, ~48 pontos só do humano). Mitigado pelas tarefas por grupo de passos e
  pelos testes de dois assentos da Tarefa 31; mesmo assim, a lógica de N assentos só é exercitada de verdade a partir
  da Tarefa 28 (`addSeat`). As Tarefas 13–22 rodam só com 1 assento.
- **Camada de transição esquecida:** o `primarySeatId` escolhe o assento 0 em silêncio. A Tarefa 29 remove a camada e
  tem grep obrigatório; o merge não pode acontecer antes dela.
- **Ordem de gravação:** `seat.json` vai na fase 1 do `flush` (antes da meta). Um dia que falha no meio pode gravar
  o assento e não a data (o dia é refeito) — a mesma limitação de não atomicidade da fase 1 que já vale para o
  extrato e os elencos.
- **Desempenho:** mais assentos em ligas diferentes = mais ligas no motor completo por dia (medido na Tarefa 32).

---

# Fatia 1 — Tipos e DAL do assento; `save_members`

### Tarefa 1: Tipos do assento e helpers puros

**Files:**
- Create: `src/types/seatTypes.ts`
- Create: `src/Domain/seats/seats.ts`
- Create: `src/Domain/seats/seats.test.ts`
- Create: `src/Domain/market/seatMarket.ts`
- Create: `src/Domain/market/seatMarket.test.ts`
- Modify: `src/types/transferMarketTypes.ts` (depois da interface `MarketState`, ~l.58)

- [ ] **Passo 1: escrever os testes que falham**

`src/Domain/seats/seats.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SEAT_KEYS, type SeatState } from "@/types/seatTypes";
import { isSeatKey, isValidSeatId, metaForSeat, seatIdOfManager, seatManagerId, splitSeatPatch } from "@/Domain/seats/seats";

const seat: SeatState = {
  clubId: "33", clubName: "Man Utd", clubColors: ["#c00", "#fff"], leagueSlug: "premier_league", leagueName: "Premier League",
  formation: "4-3-3", board: { board: 60, fans: 60, history: [] } as unknown as SeatState["board"],
};

describe("seats: meta merge and patch split", () => {
  test("metaForSeat keeps the world fields and adds the seat and its id", () => {
    const world = { id: "s1", name: "World", currentDate: "2027-02-05", mode: "solo" as const, seats: ["a"] };
    const merged = metaForSeat(world, "a", seat);
    expect(merged.id).toBe("s1");
    expect(merged.currentDate).toBe("2027-02-05");
    expect(merged.clubId).toBe("33");
    expect(merged.seatId).toBe("a");
  });

  test("splitSeatPatch routes seat keys to the seat, the rest to the world, drops seatId", () => {
    const { world, seat: s } = splitSeatPatch({ currentDate: "2027-02-06", board: undefined, clubId: "40", seatId: "a" });
    expect(world).toEqual({ currentDate: "2027-02-06" });
    expect(Object.keys(s).sort()).toEqual(["board", "clubId"]);
    // an explicit undefined clears the field: the key must survive the split
    expect("board" in s).toBe(true);
    expect(s.clubId).toBe("40");
  });

  test("every SeatState key is a seat key", () => {
    for (const k of SEAT_KEYS) expect(isSeatKey(k)).toBe(true);
    expect(isSeatKey("currentDate")).toBe(false);
    expect(isSeatKey("activeLeagues")).toBe(false);
  });

  test("seat manager ids round-trip", () => {
    expect(seatManagerId("abc-1")).toBe("seat:abc-1");
    expect(seatIdOfManager("seat:abc-1")).toBe("abc-1");
    expect(seatIdOfManager("coach_33")).toBeNull();
  });

  test("seat ids are path-safe", () => {
    expect(isValidSeatId("3f2b1c9e-0d4a-4c1b-9e7f-1234567890ab")).toBe(true);
    expect(isValidSeatId("../x")).toBe(false);
    expect(isValidSeatId("")).toBe(false);
    expect(isValidSeatId("A")).toBe(false);
  });
});
```

`src/Domain/market/seatMarket.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { emptySeatMarket, joinMarket, splitMarket } from "@/Domain/market/seatMarket";
import type { MarketState } from "@/types/transferMarketTypes";

describe("seat market: join and split", () => {
  test("join of nothing is null; world or seat alone fills the other side", () => {
    expect(joinMarket(null, null)).toBeNull();
    const fromSeat = joinMarket(null, { playerSellList: [{ playerId: "p1", priority: 1 }] })!;
    expect(fromSeat.shuffledTeamIds).toEqual([]);
    expect(fromSeat.playerSellList).toHaveLength(1);
    const fromWorld = joinMarket({ shuffledTeamIds: ["a"], rotationIndex: 1, profiles: {} }, null)!;
    expect(fromWorld.playerSellList).toEqual([]);
    expect(fromWorld.rotationIndex).toBe(1);
  });

  test("split separates the world rotation from the human fields", () => {
    const market: MarketState = {
      shuffledTeamIds: ["a", "b"], rotationIndex: 1, profiles: {},
      playerSellList: [{ playerId: "p1", priority: 1 }], playerLoanList: ["p2"], talks: {},
    };
    const { world, seat } = splitMarket(market);
    expect(world).toEqual({ shuffledTeamIds: ["a", "b"], rotationIndex: 1, profiles: {} });
    expect(seat).toEqual({ playerSellList: [{ playerId: "p1", priority: 1 }], playerLoanList: ["p2"], talks: {} });
    expect(joinMarket(world, seat)).toEqual(market);
  });

  test("an empty seat market has an empty sell list", () => {
    expect(emptySeatMarket()).toEqual({ playerSellList: [] });
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/Domain/seats src/Domain/market/seatMarket.test.ts`
Expected: FAIL (módulos `@/types/seatTypes`, `@/Domain/seats/seats`, `@/Domain/market/seatMarket` não existem).

- [ ] **Passo 3: implementar**

`src/types/seatTypes.ts`:

```ts
import type { BoardState } from "@/types/boardTypes";
import type { PressState } from "@/types/pressTypes";
import type { JobOffer, Unemployment } from "@/types/jobTypes";
import type { MatchMarking, TacticalStyle } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import type { FamiliarityKey } from "@/types/familiarityTypes";
import type { ManagerFace } from "@/Domain/faces/managerFace";
import type { ManagerBan } from "@/Domain/referees/managerBan";
import type { ManagerContract, ManagerRenewalOffer } from "@/Domain/managers/managerContract";
import type { InboxPrefs } from "@/Domain/inbox/inboxTopics";
import type { DirectorDecision, Responsibilities } from "@/Domain/responsibilities/director";
import type { YouthCallUps } from "@/Domain/youthComps/callUps";

/** Manager identity picked at new-game time (moved here from `SaveService`, which re-exports it). */
export interface SaveManager {
  name:           string;
  nationalityIso: string;   // e.g. "br", "pt"
  backgroundId:   string;   // e.g. "former-player"
  /** Avatar picked in the new game (Etapa 31b); absent = the face drawn from the manager id. */
  face?:          ManagerFace;
}

/** Rotation swaps the user accepted (or opted out of) for the match played on `date`. */
export interface RotationOverride {
  date: string;
  swaps: { out: string; in: string }[];
  optOut?: boolean;
}

/** Call-ups of the last youth game of each competition who did not play (shown on the call-up panel). */
export interface YouthCallUpsSkipped {
  u21?: { date: string; players: string[] };
  u19?: { date: string; players: string[] };
}

/**
 * One human manager of a world (`saves/{saveId}/seats/{seatId}/seat.json`, `.claude/rules/game/multiplayer.md`):
 * everything that was the player's in the save meta. The world (date, leagues, calendar) stays in `SaveMeta`.
 */
export interface SeatState {
  clubId:     string;
  clubName:   string;
  clubColors: [string, string];
  leagueSlug: string;
  leagueName: string;
  manager?:   SaveManager;
  formation?: string;
  tactical_style?: TacticalStyle;
  /** Minimum fitness (0–100) for a player to take part in a training day. */
  min_energy_to_train?: number;
  training_intensity?: TrainingIntensity;
  /** Style the seat's club drills on training days; absent = the tactics style. */
  style_focus?: FamiliarityKey;
  /** Leagues (besides the seat's own) resolved by the full engine. Max 3 — see simMode.ts. */
  followedLeagues?: string[];
  /** Rest days of the seat's club (pre-seeded around its matches, toggled by the player). */
  restDays?: string[];
  rotationOverride?: RotationOverride;
  /** Man-marking chosen for the match on `date`; cleared by the next advance. */
  matchMarking?: MatchMarking;
  youthCallUps?: YouthCallUps;
  youthCallUpsSkipped?: YouthCallUpsSkipped;
  board?: BoardState;
  press?: PressState;
  managerBan?: ManagerBan;
  sackingEnabled?: boolean;
  unemployed?: Unemployment;
  jobOffers?: JobOffer[];
  jobsMidSeason?: string;
  careerStart?: string;
  managerContract?: ManagerContract;
  managerEarnings?: number;
  managerRenewal?: ManagerRenewalOffer;
  managerContractNotices?: string[];
  inboxPrefs?: InboxPrefs;
  responsibilities?: Responsibilities;
  directorDecisions?: Record<string, DirectorDecision>;
}

/** Every key of `SeatState` (the split of a merged patch, `splitSeatPatch`). */
export const SEAT_KEYS = [
  "clubId", "clubName", "clubColors", "leagueSlug", "leagueName", "manager", "formation", "tactical_style",
  "min_energy_to_train", "training_intensity", "style_focus", "followedLeagues", "restDays", "rotationOverride",
  "matchMarking", "youthCallUps", "youthCallUpsSkipped", "board", "press", "managerBan", "sackingEnabled",
  "unemployed", "jobOffers", "jobsMidSeason", "careerStart", "managerContract", "managerEarnings", "managerRenewal",
  "managerContractNotices", "inboxPrefs", "responsibilities", "directorDecisions",
] as const satisfies readonly (keyof SeatState)[];

type MissingSeatKeys = Exclude<keyof SeatState, (typeof SEAT_KEYS)[number]>;
/** Compile-time guard: a `SeatState` key missing from `SEAT_KEYS` turns this into a type error. */
export const SEAT_KEYS_COMPLETE: [MissingSeatKeys] extends [never] ? true : MissingSeatKeys = true;

/** A seat of a world: its id and its state (club, league, career). */
export interface SeatContext {
  seatId: string;
  seat: SeatState;
}

/** Role of a user in a world (`save_members.role`). */
export type MemberRole = "owner" | "member";

/** Seat ids become folder names: lower-case letters, digits and dashes only (a `randomUUID()` fits). */
export const SEAT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
```

`src/Domain/seats/seats.ts`:

```ts
import { SEAT_ID_PATTERN, SEAT_KEYS, type SeatState } from "@/types/seatTypes";

const SEAT_KEY_SET: ReadonlySet<string> = new Set<string>(SEAT_KEYS);

/** True for a key that lives in `seat.json` (not in the world meta). */
export function isSeatKey(key: string): key is keyof SeatState {
  return SEAT_KEY_SET.has(key);
}

/** The world meta merged with one seat: the shape the meta had before seats (plus `seatId`). */
export function metaForSeat<W extends object>(world: W, seatId: string, seat: SeatState): W & SeatState & { seatId: string } {
  return { ...world, ...seat, seatId };
}

/**
 * Splits a merged patch into the world part and the seat part. A key set to `undefined` is kept (it clears
 * the field when spread); `seatId` is dropped (it is never stored).
 */
export function splitSeatPatch(patch: object): { world: Record<string, unknown>; seat: Partial<SeatState> } {
  const world: Record<string, unknown> = {};
  const seat: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === "seatId") continue;
    (isSeatKey(key) ? seat : world)[key] = (patch as Record<string, unknown>)[key];
  }
  return { world, seat: seat as Partial<SeatState> };
}

const SEAT_MANAGER_PREFIX = "seat:";

/** Id of a seat's manager in `managers.json`. */
export function seatManagerId(seatId: string): string {
  return `${SEAT_MANAGER_PREFIX}${seatId}`;
}

/** The seat behind a manager id, or null for an AI / national-team manager. */
export function seatIdOfManager(managerId: string): string | null {
  return managerId.startsWith(SEAT_MANAGER_PREFIX) ? managerId.slice(SEAT_MANAGER_PREFIX.length) : null;
}

export function isValidSeatId(id: string): boolean {
  return SEAT_ID_PATTERN.test(id);
}
```

Em `src/types/transferMarketTypes.ts`, logo depois do fechamento de `interface MarketState` (~l.58):

```ts
/** The world's part of `market.json`: the AI rotation and profiles (`saves/{id}/market.json`). */
export type WorldMarketState = Pick<MarketState, "shuffledTeamIds" | "rotationIndex" | "profiles">;

/** A seat's part of the market (`seats/{seatId}/market.json`): lists, bids, talks, loans, clauses of its club. */
export type SeatMarketState = Omit<MarketState, keyof WorldMarketState>;
```

`src/Domain/market/seatMarket.ts`:

```ts
import type { MarketState, SeatMarketState, WorldMarketState } from "@/types/transferMarketTypes";

export function emptySeatMarket(): SeatMarketState {
  return { playerSellList: [] };
}

export function emptyWorldMarket(): WorldMarketState {
  return { shuffledTeamIds: [], rotationIndex: 0, profiles: {} };
}

/**
 * The market as the domain functions read it: the world's rotation + one seat's fields. Null only when
 * neither file exists (a market written by a route before the first tick has no rotation yet).
 */
export function joinMarket(world: WorldMarketState | null, seat: SeatMarketState | null): MarketState | null {
  if (!world && !seat) return null;
  return { ...(world ?? emptyWorldMarket()), ...(seat ?? emptySeatMarket()) };
}

export function splitMarket(market: MarketState): { world: WorldMarketState; seat: SeatMarketState } {
  const { shuffledTeamIds, rotationIndex, profiles, ...seat } = market;
  return { world: { shuffledTeamIds, rotationIndex, profiles }, seat };
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/Domain/seats src/Domain/market/seatMarket.test.ts`
Expected: PASS (8 testes).

- [ ] **Passo 5: verificação final** — tsc limpo (comando das Convenções) e a suíte verde (três comandos das Convenções).

- [ ] **Passo 6: commit**

```bash
git add src/types/seatTypes.ts src/Domain/seats src/Domain/market/seatMarket.ts src/Domain/market/seatMarket.test.ts src/types/transferMarketTypes.ts
git commit -m "feat(seats): tipos do assento e helpers puros" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Arquivos do assento no DAL (aditivo)

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts` (novo bloco no fim da interface, antes do `}` final, ~l.171)
- Modify: `src/backend/dal/FileSystemDAL.ts` (helpers de caminho ~l.30–106; métodos no fim da classe)
- Modify: `src/backend/dal/BufferingSaveDAL.ts` (métodos no fim da classe, ~l.524)
- Create: `src/backend/dal/seats.dal.test.ts`

Nada existente muda nesta tarefa: só métodos novos.

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/dal/seats.dal.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatState } from "@/types/seatTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { TacticsSave } from "@/types/tacticsTypes";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

const dal = new FileSystemDAL();
const created: string[] = [];
afterAll(async () => { for (const id of created) await dal.deleteSave(id); });

const seat: SeatState = {
  clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], leagueSlug: "premier_league", leagueName: "Premier League",
};
const msg = (id: string): InboxMessage => ({ id, category: "season", read: false, createdAt: "2027-01-01T00:00:00Z" } as unknown as InboxMessage);
const entry = (amount: number): LedgerEntry => ({ date: "2027-01-01", kind: "prize", amount, label: "x" });

describe("seat files in the FileSystemDAL", () => {
  test("seat.json and every seat file round-trip under seats/{seatId}", async () => {
    const saveId = `test-seat-${randomUUID()}`;
    created.push(saveId);
    const seatId = randomUUID();
    expect(await dal.readSeat(saveId, seatId)).toBeNull();
    await dal.writeSeat(saveId, seatId, seat);
    expect(await dal.readSeat(saveId, seatId)).toEqual(seat);
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${saveId}/seats/${seatId}/seat.json`).exists()).toBe(true);

    const tactics: TacticsSave = { formation: "4-4-2", tactical_style: "balanced", lineup: [] };
    await dal.writeSeatTactics(saveId, seatId, tactics);
    expect(await dal.readSeatTactics(saveId, seatId)).toEqual(tactics);

    expect(await dal.readSeatInbox(saveId, seatId)).toEqual([]);
    await dal.appendSeatInboxMessage(saveId, seatId, msg("m1"));
    await dal.appendSeatInboxMessage(saveId, seatId, msg("m2"));
    expect((await dal.readSeatInbox(saveId, seatId)).map((m) => m.id)).toEqual(["m1", "m2"]);

    await dal.appendSeatLedger(saveId, seatId, 2027, [entry(5)]);
    await dal.appendSeatLedger(saveId, seatId, 2026, [entry(1)]);
    expect(await dal.listSeatLedgerSeasons(saveId, seatId)).toEqual([2026, 2027]);
    expect((await dal.readSeatLedger(saveId, seatId, 2027)).map((e) => e.amount)).toEqual([5]);

    await dal.writeSeatMarket(saveId, seatId, { playerSellList: [{ playerId: "p1", priority: 1 }] });
    expect((await dal.readSeatMarket(saveId, seatId))?.playerSellList).toHaveLength(1);

    expect(await dal.readSeatScouting(saveId, seatId)).toBeNull();
    expect(await dal.readSeatAchievements(saveId, seatId)).toBeNull();
  });

  test("a seat id that is not path-safe throws", async () => {
    await expect(dal.readSeat("x", "../evil")).rejects.toThrow("invalid seat id");
    await expect(dal.writeSeatTactics("x", "A B", { formation: "4-3-3", tactical_style: "balanced", lineup: [] }))
      .rejects.toThrow("invalid seat id");
  });

  test("the BufferingSaveDAL holds seat writes until flush and writes them before the meta", async () => {
    const saveId = `test-seat-buf-${randomUUID()}`;
    created.push(saveId);
    const seatId = randomUUID();
    const buffer = new BufferingSaveDAL(dal);
    await buffer.writeSeat(saveId, seatId, seat);
    await buffer.appendSeatInboxMessage(saveId, seatId, msg("m1"));
    await buffer.appendSeatLedger(saveId, seatId, 2027, [entry(3)]);
    expect(await buffer.readSeat(saveId, seatId)).toEqual(seat);
    expect(await dal.readSeat(saveId, seatId)).toBeNull();
    await buffer.flush();
    expect(await dal.readSeat(saveId, seatId)).toEqual(seat);
    expect((await dal.readSeatInbox(saveId, seatId)).map((m) => m.id)).toEqual(["m1"]);
    expect((await dal.readSeatLedger(saveId, seatId, 2027)).map((e) => e.amount)).toEqual([3]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/dal/seats.dal.test.ts`
Expected: FAIL (`dal.readSeat is not a function`).

- [ ] **Passo 3: implementar**

Em `src/backend/dal/ISaveDAL.ts`, imports no topo:

```ts
import type { SeatState } from "@/types/seatTypes";
import type { SeatMarketState } from "@/types/transferMarketTypes";
```

e, no fim da interface `ISaveDAL`:

```ts
  // ── Seats (`.claude/rules/game/multiplayer.md`): `saves/{saveId}/seats/{seatId}/` ──────────────
  readSeat(saveId: string, seatId: string): Promise<SeatState | null>;
  writeSeat(saveId: string, seatId: string, seat: SeatState): Promise<void>;
  readSeatTactics(saveId: string, seatId: string): Promise<TacticsSave | null>;
  writeSeatTactics(saveId: string, seatId: string, tactics: TacticsSave): Promise<void>;
  readSeatAchievements(saveId: string, seatId: string): Promise<AchievementsState | null>;
  writeSeatAchievements(saveId: string, seatId: string, state: AchievementsState): Promise<void>;
  readSeatScouting(saveId: string, seatId: string): Promise<ScoutingState | null>;
  writeSeatScouting(saveId: string, seatId: string, state: ScoutingState): Promise<void>;
  readSeatInbox(saveId: string, seatId: string): Promise<InboxMessage[]>;
  writeSeatInbox(saveId: string, seatId: string, messages: InboxMessage[]): Promise<void>;
  appendSeatInboxMessage(saveId: string, seatId: string, message: InboxMessage): Promise<void>;
  listSeatLedgerSeasons(saveId: string, seatId: string): Promise<number[]>;
  readSeatLedger(saveId: string, seatId: string, season: number): Promise<LedgerEntry[]>;
  appendSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void>;
  writeSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void>;
  readSeatMarket(saveId: string, seatId: string): Promise<SeatMarketState | null>;
  writeSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void>;
```

Em `src/backend/dal/FileSystemDAL.ts`, imports:

```ts
import type { SeatState } from "@/types/seatTypes";
import { SEAT_ID_PATTERN } from "@/types/seatTypes";
import type { SeatMarketState } from "@/types/transferMarketTypes";
```

e, junto dos outros helpers de caminho (depois de `dayLogPath`, ~l.84):

```ts
/** A seat's folder; the id is validated before it reaches a path. */
function seatDir(saveId: string, seatId: string): string {
  if (!SEAT_ID_PATTERN.test(seatId)) throw new Error(`invalid seat id: ${seatId}`);
  return `${SAVES_DIR}/${saveId}/seats/${seatId}`;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json() as Promise<T>;
}

async function writeJsonFile(dir: string, path: string, value: unknown, pretty = false): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Bun.write(path, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}
```

e os métodos, no fim da classe `FileSystemDAL`:

```ts
  // ── Seats ─────────────────────────────────────────────────────────────────

  async readSeat(saveId: string, seatId: string): Promise<SeatState | null> {
    return readJsonFile<SeatState>(`${seatDir(saveId, seatId)}/seat.json`);
  }

  async writeSeat(saveId: string, seatId: string, seat: SeatState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/seat.json`, seat, true);
  }

  async readSeatTactics(saveId: string, seatId: string): Promise<TacticsSave | null> {
    return readJsonFile<TacticsSave>(`${seatDir(saveId, seatId)}/tactics.json`);
  }

  async writeSeatTactics(saveId: string, seatId: string, tactics: TacticsSave): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/tactics.json`, tactics, true);
  }

  async readSeatAchievements(saveId: string, seatId: string): Promise<AchievementsState | null> {
    return readJsonFile<AchievementsState>(`${seatDir(saveId, seatId)}/achievements.json`);
  }

  async writeSeatAchievements(saveId: string, seatId: string, state: AchievementsState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/achievements.json`, state);
  }

  async readSeatScouting(saveId: string, seatId: string): Promise<ScoutingState | null> {
    return readJsonFile<ScoutingState>(`${seatDir(saveId, seatId)}/scouting.json`);
  }

  async writeSeatScouting(saveId: string, seatId: string, state: ScoutingState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/scouting.json`, state);
    // The scout search blurs every player by this file's knowledge: rebuild its index.
    bumpSaveDataVersion(saveId);
  }

  async readSeatInbox(saveId: string, seatId: string): Promise<InboxMessage[]> {
    return (await readJsonFile<InboxMessage[]>(`${seatDir(saveId, seatId)}/inbox.json`)) ?? [];
  }

  async writeSeatInbox(saveId: string, seatId: string, messages: InboxMessage[]): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/inbox.json`, messages, true);
  }

  async appendSeatInboxMessage(saveId: string, seatId: string, message: InboxMessage): Promise<void> {
    const existing = await this.readSeatInbox(saveId, seatId);
    existing.push(message);
    await this.writeSeatInbox(saveId, seatId, existing);
  }

  async listSeatLedgerSeasons(saveId: string, seatId: string): Promise<number[]> {
    let names: string[];
    try {
      names = await readdir(`${seatDir(saveId, seatId)}/ledger`);
    } catch {
      return [];
    }
    return names
      .map((n) => /^(\d+)\.json$/.exec(n)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }

  async readSeatLedger(saveId: string, seatId: string, season: number): Promise<LedgerEntry[]> {
    return (await readJsonFile<LedgerEntry[]>(`${seatDir(saveId, seatId)}/ledger/${season}.json`)) ?? [];
  }

  async appendSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const existing = await this.readSeatLedger(saveId, seatId, season);
    await this.writeSeatLedger(saveId, seatId, season, [...existing, ...entries]);
  }

  async writeSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    if (!Number.isInteger(season)) throw new Error(`invalid ledger season: ${season}`);
    const dir = `${seatDir(saveId, seatId)}/ledger`;
    await writeJsonFile(dir, `${dir}/${season}.json`, entries, true);
  }

  async readSeatMarket(saveId: string, seatId: string): Promise<SeatMarketState | null> {
    return readJsonFile<SeatMarketState>(`${seatDir(saveId, seatId)}/market.json`);
  }

  async writeSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/market.json`, market, true);
    bumpSaveDataVersion(saveId);
  }
```

(`readSeat` é `async` e chama `seatDir` dentro: um id inválido vira promessa rejeitada, como o teste espera.)

Em `src/backend/dal/BufferingSaveDAL.ts`, imports:

```ts
import type { SeatState } from "@/types/seatTypes";
import type { SeatMarketState } from "@/types/transferMarketTypes";
```

e, no fim da classe (antes do `}` final, depois de `listSeasonGoalFiles`):

```ts
  // ── Seats: plain buffered resources (phase 1 of the flush, before the meta) ─────────────────
  // Seat ids are validated by the inner DAL when the thunk runs; a bad id never reaches the cache
  // because every caller gets it from `SaveMeta.seats` / `save_members`.

  readSeat(saveId: string, seatId: string): Promise<SeatState | null> {
    return this.readThrough(`seat:${saveId}:${seatId}`, () => this.inner.readSeat(saveId, seatId));
  }
  async writeSeat(saveId: string, seatId: string, seat: SeatState): Promise<void> {
    this.buffer(`seat:${saveId}:${seatId}`, seat, () => this.inner.writeSeat(saveId, seatId, seat));
  }
  readSeatTactics(saveId: string, seatId: string): Promise<TacticsSave | null> {
    return this.readThrough(`seatTactics:${saveId}:${seatId}`, () => this.inner.readSeatTactics(saveId, seatId));
  }
  async writeSeatTactics(saveId: string, seatId: string, tactics: TacticsSave): Promise<void> {
    this.buffer(`seatTactics:${saveId}:${seatId}`, tactics, () => this.inner.writeSeatTactics(saveId, seatId, tactics));
  }
  readSeatAchievements(saveId: string, seatId: string): Promise<AchievementsState | null> {
    return this.readThrough(`seatAchievements:${saveId}:${seatId}`, () => this.inner.readSeatAchievements(saveId, seatId));
  }
  async writeSeatAchievements(saveId: string, seatId: string, state: AchievementsState): Promise<void> {
    this.buffer(`seatAchievements:${saveId}:${seatId}`, state, () => this.inner.writeSeatAchievements(saveId, seatId, state));
  }
  readSeatScouting(saveId: string, seatId: string): Promise<ScoutingState | null> {
    return this.readThrough(`seatScouting:${saveId}:${seatId}`, () => this.inner.readSeatScouting(saveId, seatId));
  }
  async writeSeatScouting(saveId: string, seatId: string, state: ScoutingState): Promise<void> {
    this.buffer(`seatScouting:${saveId}:${seatId}`, state, () => this.inner.writeSeatScouting(saveId, seatId, state));
  }
  readSeatInbox(saveId: string, seatId: string): Promise<InboxMessage[]> {
    return this.readThrough(`seatInbox:${saveId}:${seatId}`, () => this.inner.readSeatInbox(saveId, seatId));
  }
  async writeSeatInbox(saveId: string, seatId: string, messages: InboxMessage[]): Promise<void> {
    this.buffer(`seatInbox:${saveId}:${seatId}`, messages, () => this.inner.writeSeatInbox(saveId, seatId, messages));
  }
  async appendSeatInboxMessage(saveId: string, seatId: string, message: InboxMessage): Promise<void> {
    const key = `seatInbox:${saveId}:${seatId}`;
    await this.readSeatInbox(saveId, seatId);
    // The cache AFTER the await (a concurrent append may have landed while this call waited).
    const current = (this.cache.get(key) as InboxMessage[] | undefined) ?? [];
    await this.writeSeatInbox(saveId, seatId, [...current, message]);
  }
  /** Not buffered (same reason as `listLedgerSeasons`). */
  listSeatLedgerSeasons(saveId: string, seatId: string): Promise<number[]> {
    return this.inner.listSeatLedgerSeasons(saveId, seatId);
  }
  readSeatLedger(saveId: string, seatId: string, season: number): Promise<LedgerEntry[]> {
    return this.readThrough(`seatLedger:${saveId}:${seatId}:${season}`, () => this.inner.readSeatLedger(saveId, seatId, season));
  }
  async writeSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    this.buffer(`seatLedger:${saveId}:${seatId}:${season}`, entries, () => this.inner.writeSeatLedger(saveId, seatId, season, entries));
  }
  async appendSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const key = `seatLedger:${saveId}:${seatId}:${season}`;
    await this.readSeatLedger(saveId, seatId, season);
    const current = (this.cache.get(key) as LedgerEntry[] | undefined) ?? [];
    await this.writeSeatLedger(saveId, seatId, season, [...current, ...entries]);
  }
  readSeatMarket(saveId: string, seatId: string): Promise<SeatMarketState | null> {
    return this.readThrough(`seatMarket:${saveId}:${seatId}`, () => this.inner.readSeatMarket(saveId, seatId));
  }
  async writeSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void> {
    this.buffer(`seatMarket:${saveId}:${seatId}`, market, () => this.inner.writeSeatMarket(saveId, seatId, market));
  }
```

Os testes do `BufferingSaveDAL` usam um `fakeInner` tipado `Partial<ISaveDAL>`: métodos novos não quebram nada.

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/backend/dal`
Expected: PASS (inclusive os 3 testes novos).

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src/backend/dal
git commit -m "feat(seats): arquivos do assento no DAL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Tabela `save_members` (aditivo)

**Files:**
- Modify: `src/backend/db.ts` (dentro do `db.exec`, depois do índice `idx_saves_user`, ~l.36)
- Modify: `src/backend/auth/saveOwnership.ts` (funções novas no fim; as antigas ficam até a Tarefa 6)
- Create: `src/backend/auth/saveMembers.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/auth/saveMembers.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import {
  addSaveMember, countOwnedSaves, deleteSaveMembers, isSaveMember, listSaveMembers, listUserSaveIds, memberOf,
} from "@/backend/auth/saveOwnership";

describe("save_members", () => {
  test("owner and member of a world, each with one seat", () => {
    const saveId = `w-${randomUUID()}`;
    const owner = devAutoLogin(`owner-${randomUUID()}@test.local`).user;
    const friend = devAutoLogin(`friend-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, owner.id, "seat-a", "owner");
    addSaveMember(saveId, friend.id, "seat-b", "member");

    expect(memberOf(saveId, owner.id)).toMatchObject({ seatId: "seat-a", role: "owner" });
    expect(memberOf(saveId, friend.id)).toMatchObject({ seatId: "seat-b", role: "member" });
    expect(isSaveMember(saveId, friend.id)).toBe(true);
    expect(listSaveMembers(saveId).map((m) => m.seatId).sort()).toEqual(["seat-a", "seat-b"]);
    expect(listUserSaveIds(friend.id)).toContain(saveId);
    expect(countOwnedSaves(owner.id)).toBe(1);
    expect(countOwnedSaves(friend.id)).toBe(0);
  });

  test("one seat per user per world, one user per seat", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    const b = devAutoLogin(`b-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    expect(() => addSaveMember(saveId, a.id, "seat-z", "member")).toThrow();
    expect(() => addSaveMember(saveId, b.id, "seat-a", "member")).toThrow();
  });

  test("deleting a world removes every member; a non-member gets null", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    deleteSaveMembers(saveId);
    expect(memberOf(saveId, a.id)).toBeNull();
    expect(isSaveMember(saveId, a.id)).toBe(false);
    expect(listUserSaveIds(a.id)).not.toContain(saveId);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/auth/saveMembers.test.ts`
Expected: FAIL (`addSaveMember` não existe).

- [ ] **Passo 3: implementar**

Em `src/backend/db.ts`, dentro do template do `db.exec`, logo depois de
`CREATE INDEX IF NOT EXISTS idx_saves_user ON saves(user_id);`:

```sql
  CREATE TABLE IF NOT EXISTS save_members (
    save_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id),
    seat_id    TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (save_id, user_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_save_members_seat ON save_members(save_id, seat_id);
  CREATE INDEX IF NOT EXISTS idx_save_members_user ON save_members(user_id);
```

No fim de `src/backend/auth/saveOwnership.ts`:

```ts
import type { MemberRole } from "@/types/seatTypes";

/** A user's seat in a world (`.claude/rules/game/multiplayer.md`). */
export interface SaveMember {
  saveId: string;
  userId: string;
  seatId: string;
  role: MemberRole;
  createdAt: number;
}

type MemberRow = { saveId: string; userId: string; seatId: string; role: MemberRole; createdAt: number };
const MEMBER_COLUMNS = "save_id AS saveId, user_id AS userId, seat_id AS seatId, role, created_at AS createdAt";

/** Adds a user to a world with his seat. Throws when he already has a seat there or the seat is taken. */
export function addSaveMember(saveId: string, userId: string, seatId: string, role: MemberRole): void {
  db.prepare(
    "INSERT INTO save_members (save_id, user_id, seat_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(saveId, userId, seatId, role, Date.now());
}

export function memberOf(saveId: string, userId: string): SaveMember | null {
  const row = db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM save_members WHERE save_id = ? AND user_id = ?`)
    .get(saveId, userId) as MemberRow | null;
  return row ?? null;
}

export function isSaveMember(saveId: string, userId: string): boolean {
  return memberOf(saveId, userId) !== null;
}

export function listSaveMembers(saveId: string): SaveMember[] {
  return db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM save_members WHERE save_id = ? ORDER BY created_at`)
    .all(saveId) as MemberRow[];
}

/** Worlds the user takes part in (owner or member), newest first. */
export function listMemberSaveIds(userId: string): string[] {
  const rows = db
    .prepare("SELECT save_id AS saveId FROM save_members WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { saveId: string }[];
  return rows.map((r) => r.saveId);
}

/** Worlds the user owns (the per-user save limit counts only these). */
export function countOwnedSaves(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM save_members WHERE user_id = ? AND role = 'owner'")
    .get(userId) as { n: number };
  return row.n;
}

export function deleteSaveMembers(saveId: string): void {
  db.prepare("DELETE FROM save_members WHERE save_id = ?").run(saveId);
}
```

Mova o `import type { MemberRole }` para o topo do arquivo, junto do `import { db }`. Atenção: a função antiga
`listUserSaveIds` (tabela `saves`) continua até a Tarefa 6; a nova se chama `listMemberSaveIds` e o teste do Passo 1
usa `listUserSaveIds`: troque, no teste, `listUserSaveIds` por `listMemberSaveIds` (as duas linhas que a usam e o
import). Na Tarefa 6 `listMemberSaveIds` é renomeada para `listUserSaveIds` (e o teste junto).

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/backend/auth/saveMembers.test.ts`
Expected: PASS (3 testes).

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src/backend/db.ts src/backend/auth/saveOwnership.ts src/backend/auth/saveMembers.test.ts
git commit -m "feat(seats): tabela save_members" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Fatia 2 — `SaveService` e `createSave` com um assento; `metaForSeat`

### Tarefa 4: Meta do mundo, API do assento e `createSave` com o primeiro assento

**Files:**
- Modify: `src/backend/SaveService.ts` (interfaces ~l.55–148; classe; `createSave` ~l.838–1203)
- Modify: `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts` (tipos de `listSaves`/`readMeta`/`writeMeta`)
- Create: `src/backend/seats.saveService.test.ts`
- Modify (tsc): testes que montam um `SaveMeta` literal (lista no Passo 3.6)

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/seats.saveService.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";

describe("SaveService: world meta + seats", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("createSave writes a solo world with one seat and returns the merged meta", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    expect(meta.seatId).toBeTruthy();
    expect(meta.clubId).toBe("33");
    expect(meta.mode).toBe("solo");
    expect(meta.seats).toEqual([meta.seatId]);

    // On disk: the world meta has no club, the seat has it.
    const dal = new FileSystemDAL();
    const world = (await dal.readMeta(meta.id))!;
    expect("clubId" in world).toBe(false);
    expect("board" in world).toBe(false);
    expect(world.currentDate).toBe(meta.currentDate);
    const seat = (await dal.readSeat(meta.id, meta.seatId))!;
    expect(seat.clubId).toBe("33");
    expect(seat.board?.objective).toBeTruthy();
    expect(seat.managerContract?.squadId).toBe("33");

    // API of the seat
    expect((await saveService.getSeat(meta.id, meta.seatId))?.clubName).toBe("Test");
    expect((await saveService.getSeatMeta(meta.id, meta.seatId))?.clubId).toBe("33");
    expect((await saveService.listSeats(meta.id)).map((s) => s.seatId)).toEqual([meta.seatId]);
    expect([...(await saveService.humanClubIds(meta.id))]).toEqual(["33"]);
    expect(await saveService.seatOfClub(meta.id, "33")).toBe(meta.seatId);
    expect(await saveService.seatOfClub(meta.id, "34")).toBeNull();

    // updateSeat writes only the seat; the world meta keeps its date.
    await saveService.updateSeat(meta.id, meta.seatId, { formation: "4-4-2" });
    expect((await dal.readSeat(meta.id, meta.seatId))?.formation).toBe("4-4-2");
    expect((await saveService.getWorldMeta(meta.id))?.currentDate).toBe(meta.currentDate);
  }, 300_000);

  test("transition: getMeta merges the first seat and updateMeta splits the patch", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const merged = (await saveService.getMeta(meta.id))!;
    expect(merged.clubId).toBe("33");
    await saveService.updateMeta(meta.id, { training_intensity: "heavy", freeAgentsRetiredYear: 2030 });
    const dal = new FileSystemDAL();
    expect((await dal.readSeat(meta.id, meta.seatId))?.training_intensity).toBe("heavy");
    expect((await dal.readMeta(meta.id))?.freeAgentsRetiredYear).toBe(2030);
    expect("training_intensity" in (await dal.readMeta(meta.id))!).toBe(false);
  }, 300_000);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/seats.saveService.test.ts`
Expected: FAIL (`meta.seatId` indefinido / `getSeat` não existe).

- [ ] **Passo 3: implementar**

3.1 — Em `src/backend/SaveService.ts`, troque a interface `SaveManager` (~l.62–69) por um re-export e defina os novos
tipos no lugar da interface `SaveMeta` (~l.71–148, apague-a inteira):

```ts
export type { SaveManager } from "@/types/seatTypes";
import type { SaveManager, SeatContext, SeatState } from "@/types/seatTypes";
import { metaForSeat, splitSeatPatch } from "@/Domain/seats/seats";

/**
 * The world meta stored in `{saveId}.json` (`.claude/rules/game/multiplayer.md`): the date, the leagues and
 * everything shared by the seats. What belonged to the player lives in `seats/{seatId}/seat.json`.
 */
export interface WorldMeta {
  id:         string;
  name:       string;
  createdAt:  string;
  updatedAt:  string;
  /** Game version that created the save (`GAME_VERSION`). See `@/Domain/saveVersion`. */
  gameVersion?: string;
  /** Database picked at new-game time. */
  database?: SaveDatabase;
  /** "solo": one seat; "multi": a world of friends (seats added later). */
  mode:  "solo" | "multi";
  /** Seat ids, in creation order. */
  seats: string[];
  /** Current in-game date "YYYY-MM-DD". */
  currentDate?: string;
  /** State for all active leagues in this save. */
  activeLeagues?: LeagueSeasonState[];
  /** World year whose free-agent retirement draw already ran. */
  freeAgentsRetiredYear?: number;
  /** Cup/continental titles won but not yet written to a history row: squadId -> titles. */
  pendingTitles?: Record<string, string[]>;
  /** Manager-ranking country weights, computed once per country per season. */
  managerWeights?: Record<string, CountryWeight>;
  /** AI clubs without a manager (interim in charge) and the day they hire. */
  managerVacancies?: Record<string, { since: string; hireOn: string }>;
}

/** The world meta merged with one seat (`metaForSeat`): the shape the meta had before seats, plus `seatId`. */
export type SeatMeta = WorldMeta & SeatState & { seatId: string };

/**
 * TRANSITIONAL (Tasks 4–29 of the seats plan): the merged meta of the FIRST seat. Task 29 turns `SaveMeta`
 * into the world meta (renaming `WorldMeta`) and deletes this alias.
 */
export type SaveMeta = SeatMeta;
```

Remova os imports que ficaram sem uso na interface antiga (o `tsc` aponta: `BoardState`, `JobOffer`,
`Unemployment`, `ManagerContract`, `ManagerRenewalOffer`, `DirectorDecision`, `Responsibilities`, `TrainingIntensity`,
`FamiliarityKey`, `MatchMarking`, `InboxPrefs`, `ManagerFace` — mantenha os que o resto do arquivo ainda usa).

3.2 — DAL: em `ISaveDAL.ts`, `FileSystemDAL.ts` e `BufferingSaveDAL.ts`, troque o tipo `SaveMeta` por `WorldMeta` em
`listSaves(): Promise<WorldMeta[]>`, `readMeta(saveId): Promise<WorldMeta | null>` e `writeMeta(meta: WorldMeta)`
(e no import: `import type { WorldMeta } from "@/backend/SaveService";`).

3.3 — Métodos novos na classe `SaveService`, logo depois de `deleteSave` (~l.207):

```ts
  // ── Seats (`.claude/rules/game/multiplayer.md`) ──────────────────────────────

  /** The world meta as stored (no seat merged). */
  getWorldMeta(saveId: string): Promise<WorldMeta | null> {
    return this.dal.readMeta(saveId);
  }

  getSeat(saveId: string, seatId: string): Promise<SeatState | null> {
    return this.dal.readSeat(saveId, seatId);
  }

  /** The world meta merged with the seat; null when the save or the seat does not exist. */
  async getSeatMeta(saveId: string, seatId: string): Promise<SeatMeta | null> {
    const world = await this.dal.readMeta(saveId);
    if (!world || !world.seats.includes(seatId)) return null;
    const seat = await this.dal.readSeat(saveId, seatId);
    return seat ? metaForSeat(world, seatId, seat) : null;
  }

  async updateSeat(saveId: string, seatId: string, patch: Partial<SeatState>): Promise<SeatState> {
    const seat = await this.dal.readSeat(saveId, seatId);
    if (!seat) throw new Error(`Seat not found: ${saveId}/${seatId}`);
    const updated: SeatState = { ...seat, ...patch };
    await this.dal.writeSeat(saveId, seatId, updated);
    return updated;
  }

  /** Every seat of the world, in creation order (a seat whose file is missing is skipped). */
  async listSeats(saveId: string): Promise<SeatContext[]> {
    const world = await this.dal.readMeta(saveId);
    const out: SeatContext[] = [];
    for (const seatId of world?.seats ?? []) {
      const seat = await this.dal.readSeat(saveId, seatId);
      if (seat) out.push({ seatId, seat });
    }
    return out;
  }

  /** Clubs with a human manager (a seat that is not unemployed). The AI never acts on these. */
  async humanClubIds(saveId: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (const { seat } of await this.listSeats(saveId)) if (seat.clubId && !seat.unemployed) out.add(seat.clubId);
    return out;
  }

  /** The seat managing `clubId`, or null for an AI club. */
  async seatOfClub(saveId: string, clubId: string): Promise<string | null> {
    for (const { seatId, seat } of await this.listSeats(saveId)) {
      if (seat.clubId === clubId && !seat.unemployed) return seatId;
    }
    return null;
  }

  /** Writes a new seat and appends it to the world (`addSeat` builds the rest). */
  async insertSeat(saveId: string, seatId: string, seat: SeatState): Promise<void> {
    const world = await this.dal.readMeta(saveId);
    if (!world) throw new Error(`Save not found: ${saveId}`);
    if (world.seats.includes(seatId)) throw new Error(`Seat already exists: ${seatId}`);
    await this.dal.writeSeat(saveId, seatId, seat);
    await this.dal.writeMeta({ ...world, mode: "multi", seats: [...world.seats, seatId], updatedAt: new Date().toISOString() });
  }

  /** TRANSITIONAL (removed in Task 29): the first seat of the world. */
  private async primarySeatId(saveId: string): Promise<string> {
    const world = await this.dal.readMeta(saveId);
    const seatId = world?.seats?.[0];
    if (!seatId) throw new Error(`save ${saveId} has no seat`);
    return seatId;
  }

  /** TRANSITIONAL (removed in Task 29): `seatId`, or the first seat when absent. */
  protected async seatOr(saveId: string, seatId: string | undefined): Promise<string> {
    return seatId ?? this.primarySeatId(saveId);
  }
```

3.4 — Troque `getMeta` e `updateMeta` (~l.181–203) pelas versões de transição:

```ts
  /** TRANSITIONAL (Task 29 makes it return the world meta only): the world merged with the FIRST seat. */
  async getMeta(saveId: string): Promise<SaveMeta | null> {
    const world = await this.dal.readMeta(saveId);
    if (!world) return null;
    const seatId = world.seats?.[0];
    const seat = seatId ? await this.dal.readSeat(saveId, seatId) : null;
    // A world without a seat only exists in tests that write a bare meta: it has no seat fields.
    return seat && seatId ? metaForSeat(world, seatId, seat) : (world as SaveMeta);
  }

  /**
   * TRANSITIONAL (Task 29 makes it world-only): seat keys of the patch go to the FIRST seat, the rest to the
   * world meta (`splitSeatPatch`).
   */
  async updateMeta(
    saveId: string,
    patch: Partial<Omit<SaveMeta, "id" | "createdAt" | "seatId">>,
  ): Promise<SaveMeta> {
    const meta = await this.dal.readMeta(saveId);
    if (!meta) throw new Error(`Save not found: ${saveId}`);
    const split = splitSeatPatch(patch);
    const world: WorldMeta = {
      ...meta,
      ...(split.world as Partial<WorldMeta>),
      id:        meta.id,
      createdAt: meta.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.dal.writeMeta(world);
    const seatId = world.seats?.[0];
    if (!seatId) return world as SaveMeta;
    const seat = Object.keys(split.seat).length > 0
      ? await this.updateSeat(saveId, seatId, split.seat)
      : await this.dal.readSeat(saveId, seatId);
    return seat ? metaForSeat(world, seatId, seat) : (world as SaveMeta);
  }
```

3.5 — `createSave` (~l.838): devolve `Promise<SeatMeta>` e grava o mundo e o primeiro assento. Troque o bloco
`const meta: SaveMeta = { … }; await this.dal.writeMeta(meta);` (~l.917–939) por:

```ts
    const seatId = randomUUID();
    const world: WorldMeta = {
      id,
      name:        body.clubName ?? "Unnamed Save",
      createdAt:   now,
      updatedAt:   now,
      gameVersion: GAME_VERSION,
      database:    body.database,
      mode:        "solo",
      seats:       [seatId],
      currentDate: playerLeagueStart,
      activeLeagues,
    };
    const seat: SeatState = {
      clubId:     body.clubId,
      clubName:   body.clubName,
      clubColors: body.clubColors,
      leagueSlug: body.leagueSlug,
      leagueName: body.leagueName,
      manager:    body.manager,
      formation:      body.formation      ?? "4-3-3",
      tactical_style: body.tactical_style ?? DEFAULT_TACTICAL_STYLE,
      ...(playerLeagueStart ? { careerStart: playerLeagueStart } : {}),
      min_energy_to_train: DEFAULT_MIN_ENERGY_TO_TRAIN,
      training_intensity: DEFAULT_TRAINING_INTENSITY,
      sackingEnabled: body.sackingEnabled !== false,
    };
    // The merged view the rest of createSave (and its caller) reads: same shape as before seats.
    const meta: SeatMeta = metaForSeat(world, seatId, seat);
    await this.dal.writeMeta(world);
    await this.dal.writeSeat(id, seatId, seat);
```

Nos dois pontos que depois mexem na meta do jogador (`meta.board = …; await this.dal.writeMeta(meta);` ~l.1032–1033 e
`meta.managerContract = …; meta.managerEarnings = 0; await this.dal.writeMeta(meta);` ~l.1092–1099), grave o assento
em vez da meta:

```ts
        seat.board = initialBoardState(playerLeagueStart ?? now.slice(0, 10), objective);
        meta.board = seat.board;
        await this.dal.writeSeat(id, seatId, seat);
```

```ts
        seat.managerContract = {
          squadId: playerSquadId,
          wage: managerWeeklyWage(squad?.wageRevenueBasis ?? 0, rep),
          until: contractUntil(seasonEnd, MANAGER_CONTRACT.INITIAL_SEASONS),
          signed: start,
        };
        seat.managerEarnings = 0;
        meta.managerContract = seat.managerContract;
        meta.managerEarnings = 0;
        await this.dal.writeSeat(id, seatId, seat);
```

O resto do `createSave` lê `meta.currentDate`, `meta.tactical_style` etc. da visão mesclada e não muda. O
`return meta;` final devolve o `SeatMeta`.

3.6 — tsc. Rode o `typecheck`. Os erros esperados são de testes/scripts que montam um `SaveMeta` literal sem `mode`,
`seats` e `seatId` (hoje: `src/backend/dal/BufferingSaveDAL.test.ts`, `src/backend/managerFace.newgame.test.ts`,
`src/backend/matchSetup.crowd.test.ts`, `src/backend/saveVersion.routes.test.ts`, `src/backend/scoutSearch.test.ts`,
`src/backend/starsIndex.test.ts`, `src/GameInterface/gameSession.ts`). Regra: num literal de meta acrescente
`mode: "solo", seats: ["seat-1"], seatId: "seat-1"`; num `as SaveMeta` nada muda; em código de produção que monta
uma meta (`gameSession.ts`), use o tipo `SeatMeta` importado de `@/backend/SaveService` (type-only).

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/backend/seats.saveService.test.ts src/backend/dal`
Expected: PASS.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde. Se algum teste de rota ou do dia falhar, o motivo é
  quase sempre um `updateMeta` com chave do assento num save sem assento (meta montada à mão): monte o save com
  `createSave` em vez de escrever a meta direto.

- [ ] **Passo 6: commit**

```bash
git add src/backend src/GameInterface/gameSession.ts
git commit -m "feat(seats): meta do mundo, API do assento e createSave com o primeiro assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Arquivos do técnico pelo assento no `SaveService`

**Files:**
- Modify: `src/backend/SaveService.ts` (métodos de tática ~l.219–234, olheiros ~l.329–337, conquistas ~l.339–348,
  caixa ~l.374–418, extrato ~l.420–429 e ~l.480–482)
- Modify: `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts` (apagar `readTactics`,
  `writeTactics`, `readAchievements`, `writeAchievements`, `readScouting`, `writeScouting`, `readInbox`, `writeInbox`,
  `appendInboxMessage`, `listLedgerSeasons`, `readLedger`, `appendLedger`, `writeLedger` e as funções de caminho
  `tacticsPath`, `achievementsPath`, `scoutingPath`, `inboxPath`, `ledgerPath`; `readMarket`/`writeMarket` passam a
  ser do mundo)
- Modify: `src/Domain/inbox/inboxEvents.ts` (`InboxSink`, `emitInboxMessage` ~l.30–46)
- Modify: `src/backend/FinancialService.ts` (`recordMoney` ~l.217–232, `applyBroadcasting` ~l.48–67)
- Modify: `src/backend/dal/BufferingSaveDAL.test.ts`, `src/backend/dal/FileSystemDAL.test.ts` (métodos apagados)
- Create: teste novo dentro de `src/backend/seats.saveService.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — acrescente ao `describe` de `src/backend/seats.saveService.test.ts`:

```ts
  test("the manager's files live in the seat folder", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const s = meta.seatId;
    await saveService.saveTactics(meta.id, { formation: "4-4-2", tactical_style: "balanced", lineup: [] }, s);
    await saveService.appendInbox(meta.id, { id: "m1", category: "season", read: false, createdAt: "2027-01-01T00:00:00Z" } as never, s);
    await saveService.appendLedger(meta.id, 2027, [{ date: "2027-01-01", kind: "prize", amount: 7, label: "x" }], s);
    await saveService.saveMarket(meta.id, { shuffledTeamIds: ["a"], rotationIndex: 0, profiles: {}, playerSellList: [{ playerId: "p", priority: 1 }] }, s);

    const dal = new FileSystemDAL();
    expect((await dal.readSeatTactics(meta.id, s))?.formation).toBe("4-4-2");
    expect((await dal.readSeatInbox(meta.id, s)).map((m) => m.id)).toEqual(["m1"]);
    expect((await dal.readSeatLedger(meta.id, s, 2027)).map((e) => e.amount)).toEqual([7]);
    expect((await dal.readSeatMarket(meta.id, s))?.playerSellList).toHaveLength(1);
    expect(await dal.readMarket(meta.id)).toEqual({ shuffledTeamIds: ["a"], rotationIndex: 0, profiles: {} });
    // the joined view
    expect((await saveService.getMarket(meta.id, s))?.playerSellList).toHaveLength(1);
    // transitional: without a seat id, the first seat
    expect((await saveService.getTactics(meta.id))?.formation).toBe("4-4-2");
  }, 300_000);
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/seats.saveService.test.ts`
Expected: FAIL (`saveTactics` grava em `tactics.json` do save, não no assento).

- [ ] **Passo 3: implementar**

3.1 — Em `SaveService.ts`, substitua os métodos de tática, mercado, olheiros, conquistas, caixa e extrato por estes
(o `seatId` final é opcional só durante a transição; a Tarefa 29 o torna obrigatório):

```ts
  // ── Tactics (seat) ───────────────────────────────────────────────────────────

  async getTactics(saveId: string, seatId?: string): Promise<TacticsSave | null> {
    return this.dal.readSeatTactics(saveId, await this.seatOr(saveId, seatId));
  }

  async saveTactics(saveId: string, tactics: TacticsSave, seatId?: string): Promise<void> {
    return this.dal.writeSeatTactics(saveId, await this.seatOr(saveId, seatId), tactics);
  }

  // ── Market: the world's rotation + the seat's lists (`src/Domain/market/seatMarket.ts`) ──────────

  getWorldMarket(saveId: string): Promise<WorldMarketState | null> {
    return this.dal.readMarket(saveId);
  }

  saveWorldMarket(saveId: string, market: WorldMarketState): Promise<void> {
    return this.dal.writeMarket(saveId, market);
  }

  /** The market as the domain reads it: the world's rotation joined with the seat's fields. */
  async getMarket(saveId: string, seatId?: string): Promise<MarketState | null> {
    const seat = await this.seatOr(saveId, seatId);
    return joinMarket(await this.dal.readMarket(saveId), await this.dal.readSeatMarket(saveId, seat));
  }

  /** Writes both parts of a joined market. */
  async saveMarket(saveId: string, market: MarketState, seatId?: string): Promise<void> {
    const seat = await this.seatOr(saveId, seatId);
    const parts = splitMarket(market);
    await this.dal.writeMarket(saveId, parts.world);
    await this.dal.writeSeatMarket(saveId, seat, parts.seat);
  }

  async saveSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void> {
    return this.dal.writeSeatMarket(saveId, seatId, market);
  }

  // ── Scouting (seat, `.claude/rules/game/scouting.md`) ─────────────────────────

  async getScouting(saveId: string, seatId?: string): Promise<ScoutingState> {
    return (await this.dal.readSeatScouting(saveId, await this.seatOr(saveId, seatId))) ?? emptyScoutingState();
  }

  async writeScouting(saveId: string, state: ScoutingState, seatId?: string): Promise<void> {
    return this.dal.writeSeatScouting(saveId, await this.seatOr(saveId, seatId), state);
  }

  // ── Achievements (seat, `.claude/rules/game/achievements.md`) ─────────────────

  async getAchievements(saveId: string, seatId?: string): Promise<AchievementsState> {
    return normalizeAchievements(await this.dal.readSeatAchievements(saveId, await this.seatOr(saveId, seatId)));
  }

  async writeAchievements(saveId: string, state: AchievementsState, seatId?: string): Promise<void> {
    return this.dal.writeSeatAchievements(saveId, await this.seatOr(saveId, seatId), state);
  }

  // ── Inbox (seat) ─────────────────────────────────────────────────────────────

  async getInbox(saveId: string, seatId?: string): Promise<InboxMessage[]> {
    return this.dal.readSeatInbox(saveId, await this.seatOr(saveId, seatId));
  }

  /**
   * The single write point of a seat's inbox: a message whose topic the seat switched off (`seat.inboxPrefs`)
   * is dropped; topics that ask for an action are always written. The seat is read through the DAL on every
   * call (the day's `BufferingSaveDAL` caches it), so a preference saved mid-session holds for the next append.
   */
  async appendInbox(saveId: string, message: InboxMessage, seatId?: string): Promise<void> {
    const seat = await this.seatOr(saveId, seatId);
    const state = await this.dal.readSeat(saveId, seat);
    if (!inboxAllowed(message, state?.inboxPrefs)) return;
    return this.dal.appendSeatInboxMessage(saveId, seat, message);
  }

  async markInboxRead(saveId: string, ids: string[], seatId?: string): Promise<InboxMessage[]> {
    const seat = await this.seatOr(saveId, seatId);
    const set = new Set(ids);
    const current = await this.dal.readSeatInbox(saveId, seat);
    const updated = current.map((m) => (set.has(m.id) ? { ...m, read: true } : m));
    await this.dal.writeSeatInbox(saveId, seat, updated);
    return updated;
  }

  async markAllInboxRead(saveId: string, seatId?: string): Promise<InboxMessage[]> {
    const seat = await this.seatOr(saveId, seatId);
    const current = await this.dal.readSeatInbox(saveId, seat);
    const updated = current.map((m) => (m.read ? m : { ...m, read: true }));
    await this.dal.writeSeatInbox(saveId, seat, updated);
    return updated;
  }

  async writeInbox(saveId: string, messages: InboxMessage[], seatId?: string): Promise<void> {
    return this.dal.writeSeatInbox(saveId, await this.seatOr(saveId, seatId), messages);
  }

  async clearInbox(saveId: string, seatId?: string): Promise<void> {
    return this.dal.writeSeatInbox(saveId, await this.seatOr(saveId, seatId), []);
  }

  // ── Ledger (the seat's club cash extract) ────────────────────────────────────

  async getLedger(saveId: string, season: number, seatId?: string): Promise<LedgerEntry[]> {
    return this.dal.readSeatLedger(saveId, await this.seatOr(saveId, seatId), season);
  }

  async listLedgerSeasons(saveId: string, seatId?: string): Promise<number[]> {
    return this.dal.listSeatLedgerSeasons(saveId, await this.seatOr(saveId, seatId));
  }

  async appendLedger(saveId: string, season: number, entries: LedgerEntry[], seatId?: string): Promise<void> {
    return this.dal.appendSeatLedger(saveId, await this.seatOr(saveId, seatId), season, entries);
  }
```

Imports novos em `SaveService.ts`: `joinMarket`, `splitMarket` de `@/Domain/market/seatMarket`;
`WorldMarketState`, `SeatMarketState` de `@/types/transferMarketTypes`.

3.2 — DAL: apague os métodos e caminhos antigos listados em **Files**; `readMarket`/`writeMarket` passam a ter o tipo
`WorldMarketState` nas três implementações (FileSystem, Buffering, interface). No `FileSystemDAL.writeMarket`, grave
só o objeto recebido (já é a parte do mundo).

3.3 — `src/Domain/inbox/inboxEvents.ts`:

```ts
/** Where inbox messages are written (the backend's `SaveService`). */
export interface InboxSink {
  appendInbox(saveId: string, message: InboxMessage, seatId?: string): Promise<void>;
}

/**
 * Append a message to a seat's inbox. Pass the unit of work's service (e.g. the buffered day service in
 * advanceOneDay) so the message is persisted — or not — together with the rest of that unit of work.
 * TRANSITIONAL: `seatId` becomes required in Task 29.
 */
export async function emitInboxMessage(
  saveId: string,
  message: InboxMessage,
  service: InboxSink,
  seatId?: string,
): Promise<void> {
  await service.appendInbox(saveId, message, seatId);
}
```

3.4 — `src/backend/FinancialService.ts`: `recordMoney(service, saveId, season, squadRef, entry, seatId?: string)`
passa o `seatId` para `service.appendLedger(saveId, season, [entry], seatId)`;
`applyBroadcasting(saveId, meta, leagueSlug, clubSlug, seatId?: string)` repassa a `recordMoney`.
`executeTransferFee` ainda chama `service.appendLedger(saveId, season, entries)` (primeiro assento; a Tarefa 10 o
converte).

3.5 — Testes do DAL: em `src/backend/dal/BufferingSaveDAL.test.ts` e `FileSystemDAL.test.ts`, todo uso dos métodos
apagados vira a versão do assento com uma constante `const SEAT = "seat-1";` logo depois de `const SAVE`:
`readInbox(s)` → `readSeatInbox(s, SEAT)`, `writeInbox(s, m)` → `writeSeatInbox(s, SEAT, m)`, `readLedger(s, y)` →
`readSeatLedger(s, SEAT, y)`, `writeLedger(s, y, e)` → `writeSeatLedger(s, SEAT, y, e)`, `appendLedger(s, y, e)` →
`appendSeatLedger(s, SEAT, y, e)`, e o mesmo para tática/olheiros/conquistas. Nas chaves esperadas dos testes do
buffer, `inbox:` vira `seatInbox:` e `ledger:` vira `seatLedger:` (com `:${SEAT}` depois do save).

3.6 — Os chamadores de `getTactics(saveId)`, `getInbox(saveId)`, `getLedger(saveId, season)` etc. continuam
compilando: o `seatId` é opcional e cai no primeiro assento. Não mude chamadores nesta tarefa.

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/backend/seats.saveService.test.ts src/backend/dal`
Expected: PASS.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

Grep que prova que os métodos antigos do DAL sumiram:

```bash
grep -rnE "\.(readTactics|writeTactics|readInbox|writeInbox|appendInboxMessage|readLedger|writeLedger|readAchievements|writeAchievements|readScouting|writeScouting)\(" src scripts --include=*.ts | grep -v "Seat"
```

Expected: nenhuma linha.

- [ ] **Passo 6: commit**

```bash
git add src scripts
git commit -m "feat(seats): tática, caixa, extrato, olheiros, conquistas e mercado no assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: `save_members` em uso; o dono é o assento

**Files:**
- Modify: `src/backend/auth/saveOwnership.ts` (apagar `recordSaveOwnership`, `deleteSaveOwnership`, `isSaveOwner`,
  o `listUserSaveIds` antigo; renomear `listMemberSaveIds` → `listUserSaveIds`)
- Modify: `src/backend/db.ts` (acrescentar `save_members` com `CREATE TABLE IF NOT EXISTS`, no mesmo esquema que a
  branch `feat/friends-chat` já cria; o bloco da tabela `saves` fica como está, sem uso)
- Modify: `src/backend/auth/middleware.ts` (`requireSeat` + alias de transição `requireSaveOwner`)
- Modify: `src/backend/saves.ts` (`POST/GET/DELETE /api/saves`)
- Modify: `src/backend/reports.ts` (usa `isSaveOwner` → `isSaveMember`)
- Create: `src/backend/testing/seatFixtures.ts`
- Modify: os 38 arquivos que chamam `recordSaveOwnership` (lista:
  `grep -rln "recordSaveOwnership(" src scripts --include=*.ts`)
- Modify: `src/backend/auth/saveMembers.test.ts` (`listMemberSaveIds` → `listUserSaveIds`)
- Create: `src/backend/auth/requireSeat.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/auth/requireSeat.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { requireSeat } from "@/backend/auth/middleware";

const req = (token?: string) => new Request("http://localhost/x", { headers: token ? { cookie: `fs_session=${token}` } : {} });

describe("requireSeat", () => {
  test("a member gets his seat and role; a stranger gets 404; no session gets 401", () => {
    const saveId = `w-${randomUUID()}`;
    const owner = devAutoLogin(`o-${randomUUID()}@test.local`);
    const friend = devAutoLogin(`f-${randomUUID()}@test.local`);
    const stranger = devAutoLogin(`s-${randomUUID()}@test.local`);
    addSaveMember(saveId, owner.user.id, "seat-a", "owner");
    addSaveMember(saveId, friend.user.id, "seat-b", "member");

    const a = requireSeat(req(owner.session.token), saveId);
    expect(a instanceof Response).toBe(false);
    expect(a).toMatchObject({ seatId: "seat-a", role: "owner", userId: owner.user.id });
    expect(requireSeat(req(friend.session.token), saveId)).toMatchObject({ seatId: "seat-b", role: "member" });

    const s = requireSeat(req(stranger.session.token), saveId);
    expect(s instanceof Response && s.status).toBe(404);
    const anon = requireSeat(req(), saveId);
    expect(anon instanceof Response && anon.status).toBe(401);
  });
});
```

(`devAutoLogin(...).session.token` é o valor do cookie `fs_session`, como no `jobs.test.ts`.)

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/auth/requireSeat.test.ts`
Expected: FAIL (`requireSeat` não existe).

- [ ] **Passo 3: implementar**

3.1 — `src/backend/auth/middleware.ts` (troque `requireSaveOwner` e o import de `isSaveOwner`):

```ts
import { memberOf } from "@/backend/auth/saveOwnership";
import type { MemberRole } from "@/types/seatTypes";

/** The authenticated user acting as his seat of a world (`.claude/rules/game/multiplayer.md`). */
export interface SeatAuth extends AuthContext {
  seatId: string;
  role: MemberRole;
}

/**
 * 401 without a session; 404 when the user is not a member of the world (the save "does not exist" for him).
 * Every route of the manager acts on `seatId`; the world's routes accept any member.
 */
export function requireSeat(req: Request, saveId: string): SeatAuth | Response {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  const member = memberOf(saveId, auth.userId);
  if (!member) return Response.json({ error: "save not found" }, { status: 404 });
  return { ...auth, seatId: member.seatId, role: member.role };
}

/** TRANSITIONAL (renamed away in Task 8). */
export const requireSaveOwner = requireSeat;
```

3.2 — `src/backend/testing/seatFixtures.ts`:

```ts
import { saveService } from "@/backend/SaveService";
import { addSaveMember } from "@/backend/auth/saveOwnership";

/** Tests: makes `userId` the owner of the only seat of a solo save; returns the seat id. */
export async function ownSolo(saveId: string, userId: string): Promise<string> {
  const world = await saveService.getWorldMeta(saveId);
  const seatId = world?.seats[0];
  if (!seatId) throw new Error(`ownSolo: save ${saveId} has no seat`);
  addSaveMember(saveId, userId, seatId, "owner");
  return seatId;
}
```

3.3 — `src/backend/saves.ts`:
- imports: troque `recordSaveOwnership, deleteSaveOwnership, listUserSaveIds` por
  `addSaveMember, countOwnedSaves, deleteSaveMembers, listUserSaveIds, memberOf`.
- `GET /api/saves`:

```ts
      const ids = listUserSaveIds(auth.userId);
      const metas = [];
      for (const id of ids) {
        const member = memberOf(id, auth.userId);
        const meta = member ? await saveService.getSeatMeta(id, member.seatId) : null;
        if (meta && member) metas.push({ ...meta, role: member.role, compatible: saveCompatibility(meta.gameVersion) === "ok" });
      }
      return Response.json(metas);
```

- `POST /api/saves`: o limite usa `countOwnedSaves(auth.userId)` (no corpo do 409, `current: owned`); depois do
  `createSave`, `addSaveMember(meta.id, auth.userId, meta.seatId, "owner")`; o resto igual.
- `DELETE /api/saves/:id`: só o dono:

```ts
    if (req.method === "DELETE") {
      if (auth.role !== "owner") return Response.json({ error: "only the owner deletes a world" }, { status: 403 });
      const existing = await saveService.getWorldMeta(id);
      if (!existing) return Response.json({ error: "save not found" }, { status: 404 });
      await saveService.deleteSave(id);
      deleteSaveMembers(id);
      return Response.json({ ok: true });
    }
```

3.4 — `src/backend/auth/saveOwnership.ts`: apague `recordSaveOwnership`, `deleteSaveOwnership`, `isSaveOwner` e o
`listUserSaveIds` antigo; renomeie `listMemberSaveIds` → `listUserSaveIds`. `src/backend/db.ts`: mantenha o bloco
`CREATE TABLE IF NOT EXISTS saves (…)` (tabela antiga, sem uso; nunca `DROP` no banco de produção) e acrescente
`save_members` com `CREATE TABLE IF NOT EXISTS` (o mesmo esquema da branch `feat/friends-chat`, para o merge não
conflitar). `src/backend/reports.ts`: `isSaveOwner(saveId, userId)` →
`isSaveMember(saveId, userId)`.

3.5 — Testes: regra mecânica para os 38 arquivos. Toda chamada `recordSaveOwnership(<saveId>, <userId>)` vira
`await ownSolo(<saveId>, <userId>)` (import `ownSolo` de `@/backend/testing/seatFixtures`; tire o import de
`recordSaveOwnership`). Se a chamada estiver numa função não `async`, torne a função `async`. Exemplo
(`src/backend/achievements.test.ts:37`):

Antes:

```ts
    const { user, session } = devAutoLogin("ach@test.local");
    recordSaveOwnership(saveId, user.id);
```

Depois:

```ts
    const { user, session } = devAutoLogin("ach@test.local");
    await ownSolo(saveId, user.id);
```

Um teste que dava acesso a um **segundo** usuário ao mesmo save (dois `recordSaveOwnership` com o mesmo `saveId`) não
existe hoje; se aparecer, o segundo vira `addSaveMember(saveId, otherId, <seatId do segundo assento>, "member")` e o
teste precisa de um segundo assento — deixe para a Tarefa 31.

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/backend/auth`
Expected: PASS.

Grep:

```bash
grep -rnE "recordSaveOwnership|deleteSaveOwnership|isSaveOwner|listMemberSaveIds" src scripts --include=*.ts --include=*.tsx
```

Expected: nenhuma linha.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src scripts
git commit -m "feat(seats): save_members no lugar de saves; requireSeat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: `GET/PUT /api/saves/:id` pelo assento (`metaForSeat`)

**Files:**
- Modify: `src/backend/saves.ts` (`"/api/saves/:id"`, ~l.95–203)
- Create: `src/backend/saves.seat.routes.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/saves.seat.routes.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";

const call = (saveId: string, method: string, token: string, body?: unknown) => {
  const handler = apiRoutes["/api/saves/:id"] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost/api/saves/${saveId}`, {
      method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: { id: saveId } },
  ));
};

describe("/api/saves/:id acts on the requester's seat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("GET returns the merged meta with seatId; PUT writes the seat and ignores currentDate", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const { user, session } = devAutoLogin("seat-route@test.local");
    await ownSolo(meta.id, user.id);
    const token = session.token;

    const got = await (await call(meta.id, "GET", token)).json();
    expect(got.seatId).toBe(meta.seatId);
    expect(got.clubId).toBe("33");
    expect(got.season?.restDays).toBeArray();

    const put = await call(meta.id, "PUT", token, { training_intensity: "heavy", currentDate: "2099-01-01" });
    expect(put.status).toBe(200);
    expect((await saveService.getSeat(meta.id, meta.seatId))?.training_intensity).toBe("heavy");
    expect((await saveService.getWorldMeta(meta.id))?.currentDate).toBe(meta.currentDate);
  }, 300_000);
});
```


- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/saves.seat.routes.test.ts`
Expected: FAIL (o `PUT` muda `currentDate`).

- [ ] **Passo 3: implementar** — em `"/api/saves/:id"`:

- `GET`: `const meta = await saveService.getSeatMeta(id, auth.seatId);` (no lugar de `getMeta(id)`); o resto do bloco
  já lê `meta.leagueSlug`/`meta.clubId`/`meta.activeLeagues` da visão mesclada. Resposta:
  `return Response.json({ ...meta, role: auth.role, season });`.
- `PUT`: `const existing = await saveService.getSeatMeta(id, auth.seatId);`; o `patch` vira
  `const patch: Partial<SeatState> = {};` (import `SeatState` de `@/types/seatTypes`); **apague** a linha
  `if (body.currentDate !== undefined) patch.currentDate = …`; no fim
  `await saveService.updateSeat(id, auth.seatId, patch);` e
  `return Response.json(await saveService.getSeatMeta(id, auth.seatId));`.

- [ ] **Passo 4: rodar e ver passar**

Run: `bun test src/backend/saves.seat.routes.test.ts`
Expected: PASS.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src/backend/saves.ts src/backend/saves.seat.routes.test.ts
git commit -m "feat(seats): GET/PUT do save pelo assento; PUT sem currentDate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

# Fatia 3 — Rotas pelo assento (`requireSeat`)

## Regra de conversão (RC) — vale para as Tarefas 9–12

Num arquivo da lista da tarefa:

1. **Autorização.** A rota usa `const auth = requireSeat(req, saveId); if (auth instanceof Response) return auth;`.
2. **Meta.** Toda leitura de meta que usa um campo do assento (qualquer chave de `SEAT_KEYS`: `clubId`, `clubName`,
   `leagueSlug`, `board`, `press`, `unemployed`, `jobOffers`, `managerContract`, `inboxPrefs`, …) vira
   `await saveService.getSeatMeta(saveId, auth.seatId)`; uma leitura que só usa campos do mundo (`currentDate`,
   `activeLeagues`, `managerVacancies`, …) vira `await saveService.getWorldMeta(saveId)`. Ao fim da tarefa o arquivo
   não tem `saveService.getMeta(`.
3. **Escrita da meta.** `saveService.updateMeta(saveId, p)` com chaves do assento vira
   `saveService.updateSeat(saveId, auth.seatId, p)`; com chaves do mundo continua `updateMeta`. Um patch que mistura
   os dois vira duas chamadas. A resposta que devolvia a meta atualizada devolve
   `await saveService.getSeatMeta(saveId, auth.seatId)`.
4. **Arquivos do técnico.** Os métodos do `SaveService` com `seatId` opcional recebem `auth.seatId` como último
   argumento: `getTactics`, `saveTactics`, `getScouting`, `writeScouting`, `getAchievements`, `writeAchievements`,
   `getInbox`, `appendInbox`, `markInboxRead`, `markAllInboxRead`, `writeInbox`, `clearInbox`, `getLedger`,
   `listLedgerSeasons`, `appendLedger`, `getMarket`, `saveMarket`. Também `emitInboxMessage(saveId, msg, service,
   auth.seatId)`, `recordMoney(service, saveId, season, ref, entry, auth.seatId)` e
   `applyBroadcasting(saveId, meta, league, club, auth.seatId)`.
5. **Helpers do backend** chamados pela rota que leem o estado do técnico (meta do assento ou os arquivos do item 4)
   ganham um parâmetro `seatId: string` **obrigatório logo depois do `saveId`** e aplicam os itens 2–4 com ele. Um
   parâmetro `meta: SaveMeta` que lê campos do assento passa a ser `meta: SeatMeta`. Os outros chamadores do helper
   passam o assento que têm; dentro de `advanceOneDay`, enquanto a Fatia 4 não chega, passam `meta.seatId` (o `meta`
   do dia é a visão mesclada do primeiro assento).
6. **Nunca** `meta.seats[0]`, nunca "o primeiro assento" fora do `SaveService` de transição.
7. **Grep de saída** (rode com a lista de arquivos da tarefa no lugar de `$FILES`):

   ```bash
   grep -nE "saveService\.getMeta\(|requireSaveOwner|\.(getTactics|getScouting|getAchievements|getInbox|listLedgerSeasons|getMarket|clearInbox|markAllInboxRead)\([^,()]*\)" $FILES
   ```

   Expected: nenhuma linha. (As chamadas de dois argumentos — `saveTactics`, `appendInbox`, `getLedger`,
   `saveMarket`… — não cabem num grep confiável; a Tarefa 29 torna o `seatId` obrigatório e o `tsc` acha qualquer uma
   que tenha escapado.)

**Exemplo completo (antes/depois)** — `src/backend/responsibilityRoutes.ts`, rota `"/api/saves/:saveId/responsibilities"`:

Antes:

```ts
  "/api/saves/:saveId/responsibilities": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      return Response.json(responsibilitiesView(meta.responsibilities));
    }

    if (req.method === "PUT") {
      let body: unknown;
      try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
      const patch = parseResponsibilitiesPatch(body);
      if (!patch) return Response.json({ error: "invalid responsibilities" }, { status: 400 });
      return withSaveLock(saveId, async () => {
        const meta = await saveService.getMeta(saveId);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
        const next: Responsibilities = { ...responsibilitiesOf(meta.responsibilities), ...patch };
        const updated = await saveService.updateMeta(saveId, { responsibilities: next });
        return Response.json(responsibilitiesView(updated.responsibilities));
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },
```

Depois:

```ts
  "/api/saves/:saveId/responsibilities": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const seat = await saveService.getSeat(saveId, auth.seatId);
      if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
      return Response.json(responsibilitiesView(seat.responsibilities));
    }

    if (req.method === "PUT") {
      let body: unknown;
      try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
      const patch = parseResponsibilitiesPatch(body);
      if (!patch) return Response.json({ error: "invalid responsibilities" }, { status: 400 });
      return withSaveLock(saveId, async () => {
        const seat = await saveService.getSeat(saveId, auth.seatId);
        if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
        const next: Responsibilities = { ...responsibilitiesOf(seat.responsibilities), ...patch };
        const updated = await saveService.updateSeat(saveId, auth.seatId, { responsibilities: next });
        return Response.json(responsibilitiesView(updated.responsibilities));
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },
```

(Quando a rota só precisa do assento, `getSeat` basta; quando precisa também de `currentDate`/`activeLeagues`, use
`getSeatMeta`.)

---

### Tarefa 8: `requireSeat` em todas as rotas; rotas do mundo para qualquer membro

**Files:**
- Modify: todo arquivo de `grep -rln "requireSaveOwner" src --include=*.ts` (30 arquivos + `auth/middleware.ts`)
- Create: `src/backend/worldRoutes.member.test.ts`

- [ ] **Passo 1: escrever o teste** — `src/backend/worldRoutes.member.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";

const get = (key: string, path: string, saveId: string, token: string, params: Record<string, string> = {}) => {
  const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost${path}`, { headers: { cookie: `fs_session=${token}` } }),
    { params: { saveId, ...params } },
  ));
};

describe("world routes answer any member of the world", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("news and standings: owner and member 200, stranger 404", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const owner = devAutoLogin("world-owner@test.local");
    const friend = devAutoLogin("world-friend@test.local");
    const stranger = devAutoLogin("world-stranger@test.local");
    await ownSolo(meta.id, owner.user.id);
    // A member of the world (his seat file comes with `addSeat`, Task 28; the world routes never read it).
    addSaveMember(meta.id, friend.user.id, "seat-friend", "member");

    for (const token of [owner.session.token, friend.session.token]) {
      expect((await get("/api/saves/:saveId/news", `/api/saves/${meta.id}/news`, meta.id, token)).status).toBe(200);
      expect((await get("/api/saves/:saveId/leagues/:leagueSlug/standings", `/api/saves/${meta.id}/leagues/premier_league/standings`,
        meta.id, token, { leagueSlug: "premier_league" })).status).toBe(200);
    }
    const s = await get("/api/saves/:saveId/news", `/api/saves/${meta.id}/news`, meta.id, stranger.session.token);
    expect(s.status).toBe(404);
  }, 300_000);
});
```

- [ ] **Passo 2: rodar** — `bun test src/backend/worldRoutes.member.test.ts`. Com o alias da Tarefa 6 ele já deve
  passar; se a rota de notícias ler a meta do primeiro assento (transição) também passa. O teste existe para travar o
  comportamento depois da Tarefa 29 (quando `getMeta` passa a ser só o mundo). Se falhar, a rota está tratando o
  membro como dono de outro assento: corrija pela RC.

- [ ] **Passo 3: implementar** — renomeação mecânica:

```bash
grep -rln "requireSaveOwner" src --include=*.ts | grep -v "auth/middleware.ts" | xargs sed -i 's/requireSaveOwner/requireSeat/g'
```

Depois apague, em `src/backend/auth/middleware.ts`, o alias `export const requireSaveOwner = requireSeat;`. Leia cada
rota do mundo — `newsRoutes`, `awardsRoutes`, `clubHistoryRoutes`, `refereeRoutes`; em `routes.ts`: `standings`,
`fixtures`, `cups`, `continental`, `stats`, `stars`, `leagues`, `squad/:league/:club` sem `scouted`, `all-squads`;
`youthCompRoutes` (`youth-comps`, `youth-comps/:slug`); `nationalRoutes` (ranking, competição, seleção) — e confira que
nenhuma age sobre o clube do assento. Uma rota do mundo que lia `meta.leagueSlug` só para escolher um padrão usa
`getSeatMeta(saveId, auth.seatId)` (RC item 2).

- [ ] **Passo 4: rodar e ver passar** — `bun test src/backend/worldRoutes.member.test.ts src/backend/auth` → PASS.
  Grep: `grep -rn "requireSaveOwner" src scripts --include=*.ts` → nenhuma linha.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "refactor(seats): requireSeat em todas as rotas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Rotas do técnico, grupo A (save, caixa, responsabilidades, conquistas, imprensa, empregos, dia)

**Files** (`$FILES` da RC): `src/backend/saves.ts`, `src/backend/inbox.ts`, `src/backend/responsibilityRoutes.ts`,
`src/backend/achievementRoutes.ts`, `src/backend/achievementsWorld.ts` (as funções que as rotas chamam:
`achievementSnapshot`, perfil, enfeites, loja), `src/backend/pressRoutes.ts`, `src/backend/pressWorld.ts` (responder a
coletiva), `src/backend/jobRoutes.ts`, `src/backend/jobWorld.ts` (`acceptJobOffer`, `reputationOf`,
`releaseHumanClub`, `takeOverClub`), `src/backend/advanceDay.ts` (só as rotas `days/:date`, `day-type/:date` e
`presimulate`, e o helper `emitContinentalSeasonStartNews`), `src/backend/advanceUntil.ts` (só a rota).

- [ ] **Passo 1: teste** — acrescente a `src/backend/saves.seat.routes.test.ts` (mesmo `describe`):

```ts
  test("the inbox route reads the requester's seat", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const { user, session } = devAutoLogin("seat-inbox@test.local");
    await ownSolo(meta.id, user.id);
    await saveService.appendInbox(meta.id, { id: "only-mine", category: "season", read: false, createdAt: "2027-01-01T00:00:00Z" } as never, meta.seatId);
    const handler = apiRoutes["/api/saves/:saveId/inbox"] as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${meta.id}/inbox`, { headers: { cookie: `fs_session=${session.token}` } }),
      { params: { saveId: meta.id } },
    ));
    expect((await res.json()).map((m: { id: string }) => m.id)).toContain("only-mine");
  }, 300_000);
```

Run: `bun test src/backend/saves.seat.routes.test.ts` → passa já pela transição; é a trava para a Tarefa 29.

- [ ] **Passo 2: aplicar a RC** a cada arquivo da lista. Pontos específicos:
  - `saves.ts`: tática (`/tactics`) com `getTactics(id, auth.seatId)`/`saveTactics(id, t, auth.seatId)`;
    `rotationOverride` e `matchMarking` por `updateSeat`.
  - `jobWorld.ts`: `acceptJobOffer(service, saveId, seatId, meta: SeatMeta, offer)`;
    `releaseHumanClub(service, saveId, seatId, args)`; `takeOverClub(service, saveId, seatId, args)` — exportada e com
    `args.arriveEntry?: boolean` (padrão `true`; com `false` não grava o `club_change` de chegada, envolvendo a chamada
    `recordMoney(… "club_change" …)` num `if (args.arriveEntry !== false)`; usado pelo `addSeat` da Tarefa 28);
    `reputationOf(service, saveId, meta: SeatMeta)`. `acceptJobOffer` grava o patch do assento com `updateSeat` e
    `managerVacancies` com `updateMeta`, e devolve `getSeatMeta(saveId, seatId)`.
  - `advanceDay.ts`: rota `day-type/:date` só troca `getMeta` por `getSeatMeta(saveId, auth.seatId)` (a folga sai da
    meta na Tarefa 21); `presimulate` emite as mensagens de início no assento do pedido:
    `emitContinentalSeasonStartNews(saveId, seatId, clubId, date)` (o helper ganha `seatId` e passa-o a cada
    `emitInboxMessage`) e a mensagem da diretoria com `emitInboxMessage(…, saveService, auth.seatId)`.
  - Chamadores dentro de `advanceOneDay` passam `meta.seatId` a `releaseHumanClub`.

- [ ] **Passo 3: grep da RC** nos `$FILES` (em `advanceDay.ts`, confira à mão só as três rotas e o helper; o corpo de
  `advanceOneDay` é a Fatia 4).

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src
git commit -m "refactor(seats): rotas do técnico (grupo A) pelo assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Rotas do técnico, grupo B (mercado e negociação) e janelas por assento

**Files:** `src/backend/transfers.ts`, `src/backend/marketRoutes.ts`, `src/backend/negotiationRoutes.ts`,
`src/backend/contractRoutes.ts`, `src/backend/rebornRoutes.ts`, `src/backend/negotiationWorld.ts`,
`src/backend/rivalWorld.ts`, `src/backend/FinancialService.ts` (`executeTransferFee`, `ClubRef`),
`src/backend/marketWindowWorld.ts`, `src/backend/registrationWorld.ts` (só a chamada a `loadWindowContext`),
`src/backend/advanceDay.ts` (só os pontos que chamam o que muda aqui)
- Create: `src/backend/marketWindow.seats.test.ts`

- [ ] **Passo 1: teste que falha** — `src/backend/marketWindow.seats.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";

describe("transfer windows per seat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("the seat's window follows its club's country, with the career grace", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const index = await saveService.getSquadIndex(meta.id);
    const w = await loadWindowContext(meta, index, meta.currentDate, [seatWindowRef(meta)]);
    const mine = w.seat(meta.seatId);
    expect(mine.country).toBe(w.countryOfLeague("premier_league"));
    // new career: 30-day arrival grace (`transfer-windows.md`)
    expect(mine.today.open).toBe(true);
    expect(w.seat("not-a-seat").today.open).toBe(true);
  }, 300_000);
});
```

Run: `bun test src/backend/marketWindow.seats.test.ts` → FAIL (`seatWindowRef` não existe).

- [ ] **Passo 2: janelas por assento** — em `src/backend/marketWindowWorld.ts`:

```ts
import type { SeatMeta, WorldMeta } from "@/backend/SaveService";

/** A seat's club and career start, for its transfer window (`.claude/rules/game/transfer-windows.md`). */
export interface SeatWindowRef {
  seatId: string;
  /** Absent while the seat is unemployed. */
  clubId?: string;
  careerStart?: string;
}

/** The window of one seat's club: today, any day, and its country. */
export interface SeatWindows {
  today: WindowStatus;
  on: (day: string) => WindowStatus;
  country: string;
}

export function seatWindowRef(meta: SeatMeta): SeatWindowRef {
  return {
    seatId: meta.seatId,
    ...(meta.unemployed || !meta.clubId ? {} : { clubId: meta.clubId }),
    ...(meta.careerStart ? { careerStart: meta.careerStart } : {}),
  };
}
```

Na interface `WindowContext`, troque `human`, `humanOn` e `humanCountry` por `seat: (seatId: string) => SeatWindows;`.
Em `buildWindowContext`, troque os argumentos `humanClubId`/`careerStart` por `seats?: SeatWindowRef[]`, e o bloco
`const humanOn = …` mais as três entradas do objeto devolvido por:

```ts
  const seatRefs = new Map((args.seats ?? []).map((s) => [s.seatId, s] as const));
  const seat = (seatId: string): SeatWindows => {
    const ref = seatRefs.get(seatId);
    const league = ref?.clubId ? args.index?.byId(ref.clubId)?.leagueSlug : undefined;
    if (!league) return { today: { open: true }, on: () => ({ open: true }), country: "" };
    const country = countryOf.get(league) ?? "";
    const on = (day: string): WindowStatus => humanWindowStatus(seasonOfCountry(country, league), day, ref?.careerStart);
    return { today: on(date), on, country };
  };
```

e, no objeto devolvido, `seat,`. `loadWindowContext`:

```ts
/** The window context of a world on `date`, with the windows of the given seats. */
export async function loadWindowContext(
  world: Pick<WorldMeta, "activeLeagues" | "currentDate">,
  index: SquadIndex | null,
  date = world.currentDate ?? "",
  seats: SeatWindowRef[] = [],
): Promise<WindowContext> {
  return buildWindowContext({
    date,
    activeLeagues: world.activeLeagues ?? [],
    catalog: await getLeagueData(),
    pyramids: await getPyramids(),
    index,
    seats,
  });
}
```

Chamadores (`grep -rn "\.human()\|\.humanOn(\|\.humanCountry()\|loadWindowContext(" src --include=*.ts`):
- rotas: `loadWindowContext(meta, index, undefined, [seatWindowRef(meta)])` com
  `meta = await saveService.getSeatMeta(saveId, auth.seatId)`; `windows.human()` → `windows.seat(auth.seatId).today`;
  `windows.humanCountry()` → `windows.seat(auth.seatId).country`.
- `advanceOneDay` (ainda um assento): `loadWindowContext(meta, index, currentDate, [seatWindowRef(meta)])`;
  `windows.human()` → `windows.seat(meta.seatId).today`; `windows.humanOn(d)` → `windows.seat(meta.seatId).on(d)`;
  `windows.humanCountry()` → `windows.seat(meta.seatId).country`.
- `registrationWorld.ts`: `loadWindowContext(meta, index, date, [seatWindowRef(meta)])` e `w.human()` →
  `w.seat(meta.seatId).today` (a Tarefa 11 generaliza para N assentos).

- [ ] **Passo 3: `executeTransferFee` por assento** — em `src/backend/FinancialService.ts`, `ClubRef.isPlayerClub:
  boolean` vira `seatId?: string` (o assento dono do clube; ausente = IA). Troque o bloco que começa em
  `if (buyer.isPlayerClub || seller.isPlayerClub) {` e vai até o `return meta;` final por um laço por lado, cada um
  no extrato do seu assento:

```ts
  const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
  const stage = opts.loan ? { stage: "loan_fee" } : {};
  const who = opts.playerName ? { playerName: opts.playerName, ...(opts.playerId ? { playerId: opts.playerId } : {}) } : {};
  if (buyer.seatId !== undefined && fee > 0) {
    const season = await ledgerSeasonFor(service, saveId, buyer.leagueSlug, date);
    await service.appendLedger(saveId, season, [{
      date, kind: "transfer_out", amount: -fee,
      label: opts.loan ? `Loan fee paid to ${seller.squad.name}` : `Transfer fee paid to ${seller.squad.name}`,
      ref: { opponentId: seller.squad.id, clubName: seller.squad.name, ...stage, ...who },
    }], buyer.seatId);
  }
  if (seller.seatId !== undefined && fee > 0) {
    const season = await ledgerSeasonFor(service, saveId, seller.leagueSlug, date);
    const entries: LedgerEntry[] = [{
      date, kind: "transfer_in", amount: fee,
      label: opts.loan ? `Loan fee from ${buyer.squad.name}` : `Transfer fee from ${buyer.squad.name}`,
      ref: { opponentId: buyer.squad.id, clubName: buyer.squad.name, ...stage, ...who },
    }];
    if (sellOnAmount > 0) {
      entries.push({
        date, kind: "transfer_out", amount: -sellOnAmount,
        label: `Sell-on clause paid to ${opts.sellOn!.clubName}${opts.playerName ? `: ${opts.playerName}` : ""}`,
        ref: { clubName: opts.sellOn!.clubName, stage: "sell_on", ...who },
      });
    }
    await service.appendLedger(saveId, season, entries, seller.seatId);
  }
  return meta;
```

  Chamadores: `isPlayerClub: isBuyerPlayer` → `...(isBuyerPlayer ? { seatId: meta.seatId } : {})` no dia (por enquanto)
  e, nas rotas, `...(<é o clube do assento> ? { seatId: auth.seatId } : {})`. `negotiationWorld.ts`
  (`completeHumanSale`, `startLoan`, `returnDueLoans`, `settleSellOn`, `paySellOnReceiver`, `pruneSellOnHeld`) e
  `rivalWorld.ts` (`rollRivalFor`, `resolveRivalDeadlines`, `applyDuePreContracts`) ganham `seatId` (RC item 5) e usam
  `getMarket(saveId, seatId)`/`saveMarket(saveId, m, seatId)`; o dia passa `meta.seatId`.

- [ ] **Passo 4: aplicar a RC** ao resto da lista (`transfers.ts`: `GET` usa `getSeatMeta` para o clube; `POST` compra
  com `getMarket(saveId, auth.seatId)` etc.; `rebornRoutes.ts`: `getSeatMeta` para o clube — o filtro do
  `retired.json` por assento é a Tarefa 25).

- [ ] **Passo 5: rodar** — `bun test src/backend/marketWindow.seats.test.ts src/backend/negotiation.routes.test.ts src/backend/windows.routes.test.ts src/backend/FinancialService.test.ts` → PASS. Grep da RC na lista e:

```bash
grep -rn "\.human()\|\.humanOn(\|\.humanCountry()\|isPlayerClub: is" src --include=*.ts
```

Expected: nenhuma linha.

- [ ] **Passo 6: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 7: commit**

```bash
git add src
git commit -m "refactor(seats): mercado, negociação e janelas pelo assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Rotas do técnico, grupo C (comissão, instalações, olheiros, base, moral, inscrição)

**Files:** `src/backend/staffRoutes.ts`, `src/backend/facilityRoutes.ts`, `src/backend/scoutingRoutes.ts`,
`src/backend/scoutingWorld.ts` (`loadViewer`, `viewFor`, `obscureSquadForViewer`, `rememberPlayers`,
`scoutingOnClubLeft`, `cancelScoutMissions`, `missionLeagues`, `scoutingDay`), `src/backend/scoutSearch.ts`,
`src/backend/youthRoutes.ts`, `src/backend/youthCompRoutes.ts` (`youth-callups`), `src/backend/moraleRoutes.ts`,
`src/backend/moraleWorld.ts`, `src/backend/registrationRoutes.ts`, `src/backend/registrationWorld.ts`,
`src/backend/achievementsWorld.ts` (`achievementsDay`), `src/backend/directorWorld.ts`

- [ ] **Passo 1: linha de base** — `bun test src/backend/staff.routes.test.ts src/backend/facilities.routes.test.ts src/backend/scouting.routes.test.ts src/backend/scoutSearch.test.ts src/backend/youth.routes.test.ts src/backend/youthComps.routes.test.ts src/backend/morale.routes.test.ts src/backend/registration.routes.test.ts src/backend/registrationWorld.test.ts` → PASS (a trava de dois assentos é a Tarefa 31).

- [ ] **Passo 2: inscrição por assento** — em `src/backend/registrationWorld.ts`, `registrationDayCtx` passa a
  receber o mundo e as referências dos assentos:

```ts
export async function registrationDayCtx(
  service: SaveService,
  saveId: string,
  world: Pick<WorldMeta, "activeLeagues" | "currentDate">,
  index: SquadIndex | null,
  /** The seats (their clubs are human: their lists follow the seat's window and send it the notices). */
  seats: SeatWindowRef[],
  date = world.currentDate ?? "",
  windows?: WindowContext,
): Promise<RegistrationDayCtx> {
  const w = windows ?? (await loadWindowContext(world, index, date, seats));
  const seatByClub: ReadonlyMap<string, string> = new Map(
    seats.filter((s) => s.clubId).map((s) => [s.clubId!, s.seatId] as const),
  );
```

  `RegistrationDayCtx.humanClubId?: string` vira `seatByClub: ReadonlyMap<string, string>` (e o `return` devolve
  `seatByClub` no lugar de `humanClubId`); `squad.id === humanClubId ? w.human() : w.ofLeague(leagueSlug)` vira
  `seatByClub.has(squad.id) ? w.seat(seatByClub.get(squad.id)!).today : w.ofLeague(leagueSlug)`;
  `notices: squad.id === dctx.humanClubId ? r.notices : []` vira `notices: dctx.seatByClub.has(squad.id) ? r.notices : []`;
  em `refreshAiRegistrations`, `if (squad.id === dctx.humanClubId) continue;` vira
  `if (dctx.seatByClub.has(squad.id)) continue;`. `humanMatchRegistrationToday(service, saveId, seatId, …)` lê
  `getSeatMeta` e chama `registrationDayCtx(service, saveId, meta, index, [seatWindowRef(meta)], date)`. No dia:
  `registrationDayCtx(saveService, saveId, meta, index, [seatWindowRef(meta)], currentDate, windows)`.

- [ ] **Passo 3: aplicar a RC** ao resto. Pontos: `scoutingWorld.loadViewer(service, saveId, seatId, …)` lê
  `getScouting(saveId, seatId)` e o clube do assento (exato para o próprio clube); `scoutingDay(service, saveId,
  seatId, args)`; `scoutSearch.ts`: a chave do cache do índice da busca ganha o assento
  (`${saveId}:${seatId}:${date}#${version}`), porque o borrão depende do conhecimento do assento;
  `moraleWorld.applyMoraleDay(service, saveId, seatId, args)`; `achievementsWorld.achievementsDay(service, saveId,
  seatId, args)`; `directorWorld.applyDirectorDay(service, saveId, seatId, args)`. O dia passa `meta.seatId` a todos.

- [ ] **Passo 4: grep da RC** com a lista.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "refactor(seats): comissão, instalações, olheiros, base, moral e inscrição pelo assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Rotas do técnico, grupo D (`routes.ts`, técnicos, seleções, partida, kits)

**Files:** `src/backend/routes.ts` (`/squad/:league/:club?scouted=1`, `/scout-search`, `/match-setup`, `/ledger`,
`/leagues/:slug/ai-finances`, `/import-squads`), `src/backend/managerRoutes.ts`, `src/backend/nationalRoutes.ts` (só as
leituras da meta; o estado da seleção por assento é a Tarefa 24), `src/backend/refereeRoutes.ts`,
`src/backend/matchCrowd.ts`, `src/backend/matchImportance.ts`, `src/backend/statsRankings.ts`,
`src/backend/starsIndex.ts`, `src/backend/startKits.ts`, `src/backend/reschedulingWorld.ts`
(`syncPlayerRestDays`), `src/backend/clubHistoryRoutes.ts`, `src/backend/awardsRoutes.ts`, `src/backend/newsRoutes.ts`,
`src/backend/youthCompRoutes.ts` (rotas do mundo)

- [ ] **Passo 1: linha de base** — `bun test src/backend/routes.ledger.test.ts src/backend/matchSetup.crowd.test.ts src/backend/managers.routes.test.ts src/backend/startKits.test.ts src/backend/routes.squadFinances.test.ts` → PASS.

- [ ] **Passo 2: aplicar a RC**. Pontos:
  - `/match-setup`: o corpo traz `saveId`; tudo do lado do usuário lê do assento (`getSeatMeta`,
    `getTactics(saveId, auth.seatId)`, `rotationOverride`, `matchMarking`, `managerBan`).
  - `/ledger`: `getLedger(saveId, season, auth.seatId)` e `listLedgerSeasons(saveId, auth.seatId)`; a temporada padrão é
    a da liga do assento.
  - `managerRoutes.ts`: o perfil (`shownProfile(await saveService.getAchievements(saveId, auth.seatId))`) e os ganhos
    (`managerEarnings`) do assento; o campo `isPlayer` da resposta continua `m.isPlayer` até a Tarefa 23.
  - `startKits.ts` (`applyRandomStartKit(saveId)`): o orçamento preservado é o de cada clube de assento — troque o
    `meta.clubId` por um laço sobre `await saveService.listSeats(saveId)` (guarda o `finances.budget` de cada clube
    humano antes do kit e restaura depois, como hoje faz com um); instalações, moral, staff e familiaridade
    restaurados também por clube de assento.
  - `syncPlayerRestDays(service, saveId, seatId, moves)` lê o clube do assento (a folga continua em `activeLeagues`
    até a Tarefa 21).
- [ ] **Passo 3: grep da RC** com a lista.
- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.
- [ ] **Passo 5: commit**

```bash
git add src
git commit -m "refactor(seats): partida, extrato, técnicos, kits e rotas do mundo pelo assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Fatia 4 — Avanço do dia: exclusão, laço por assento, mapa de partidas, virada por assento, folga da IA

## Regra do dia (RD) — vale para as Tarefas 14–22

O corpo de `advanceOneDay` (`src/backend/advanceDay.ts`) é convertido por grupos de passos. As âncoras abaixo são os
comentários `// ── … ──` que já existem no arquivo (os números de linha são da `main` de 2026-10-14 e andam a cada
tarefa; procure pelo texto do comentário).

1. **Variáveis do humano viram campos do `DaySeat`** (`src/backend/daySeats.ts`, Tarefa 13). Tabela de troca:

| Hoje | Depois |
|---|---|
| `playerSquadId`, `playerClubSquadId`, `resolvedPlayerSquadId`, `meta.clubId` (como clube do jogador) | `ds.clubId` |
| `playerEntry` | `ds.entry` |
| `tactics` | `ds.tactics` |
| `board`, `boardMessages`, `sackedReason` | `ds.board`, `ds.boardMessages`, `ds.sackedReason` |
| `pressTitles`, `pressEliminated`, `pressMatchContext` | `ds.press.titles`, `ds.press.eliminated`, `ds.press.matchContext` |
| `registrationNotices` | `ds.registrationNotices` |
| `humanManagerCards`, `managerBan`, `managerBanGiven` | `ds.managerCards`, `ds.managerBan`, `ds.managerBanGiven` |
| `moraleUnavailable`, `moraleBids` | `ds.moraleUnavailable`, `ds.moraleBids` |
| `playerHomeFixturesToday`, `importanceStandings` | `ds.homeFixtures`, `ds.importanceStandings` |
| `deferredInjuryMessages`, `deferredContractMessages`, `deferredYouthMessages`, `facilityMessages`, `deferredRetirementMessages`, `clubRecordMessages`, `deferredAwardsMessages`, `negotiationNews`, `continentalMessages`, `seasonMessages`, `negativeBalanceMessage` | `ds.deferred.injury`, `.contract`, `.youth`, `.facility`, `.retirement`, `.clubRecords`, `.awards`, `.negotiation`, `.continental`, `.season`, `.negativeBalance` |
| `managerEarned` | `ds.managerEarned` |
| `seasonEnded`, `archiveYear`, `playerCountryMoves`, `playerMove`, `playerChampionOf`, `playerObjectiveMet`, `playerFollowersChange`, `playerLeaguePrizeThisRollover`, `playerBoardBonusEntry`, `boardAtSeasonEnd` | `ds.rollover.seasonEnded`, `.archiveYear`, `.moves`, `.move`, `.championOf`, `.objectiveMet`, `.followersChange`, `.leaguePrize`, `.boardBonusEntry`, `.boardAtSeasonEnd` |
| `ended`, `contract`, `unemployed`, `jobOffers`, `offersBefore`, `keptOffers`, `newOffers`, `jobsMidSeason`, `managerRenewal`, `managerContractNotices` | `ds.job.ended`, `.contract`, `.unemployed`, `.offers`, `.offersBefore`, `.kept`, `.newOffers`, `.midSeason`, `.renewal`, `.notices` |
| `directorDecided`, `directorOutcomes`, `directorNews` | `ds.director.decided`, `.outcomes`, `.news` |
| `staffContractNews`, `moraleNews` | `ds.staffNews`, `ds.moraleNews` |
| `pressState`, `pressInvite`, `pressNews` | `ds.pressOut.state`, `.invite`, `.news` |
| `achievementsUnlocked` | `ds.achievementsUnlocked` |
| `meta.<campo do assento>` | `ds.meta.<campo>` |
| `meta.<campo do mundo>` | `world.<campo>` |
| `emitInboxMessage(saveId, m, saveService)` | `emitInboxMessage(saveId, m, saveService, ds.seatId)` |
| `recordMoney(…, entry)` | `recordMoney(…, entry, ds.seatId)` |
| `saveService.getMarket(saveId)` / `saveMarket(saveId, m)` | `getMarket(saveId, ds.seatId)` / `saveMarket(saveId, m, ds.seatId)` |

2. **Exclusão** (a IA ignora todos os humanos): onde hoje há um só clube excluído, passe `humanClubs`
   (`humanClubSet(daySeats)`), um `ReadonlySet<string>`.
3. **Laço:** um bloco `if (playerSquadId) { … }` vira `for (const ds of daySeats) { if (!ds.clubId) continue; … }`;
   um bloco que hoje roda para todo clube e testa `x === playerSquadId` dentro passa a usar
   `seatOf.get(x)` (`seatByClub(daySeats)`, um `Map<clubId, DaySeat>`).
4. **Ordem:** a ordem dos passos do dia não muda; um laço por assento fica no mesmo lugar do bloco que substitui.
5. **Grep de saída de cada tarefa:** os nomes antigos do grupo da tarefa não aparecem mais no corpo de
   `advanceOneDay`, por exemplo, para a Tarefa 16:
   `grep -nE "\b(board|boardMessages|sackedReason|pressTitles|pressEliminated|pressMatchContext|managerEarned)\b" src/backend/advanceDay.ts`
   → só ocorrências dentro de `ds.` (ex.: `ds.board`) ou em outras funções do arquivo.

---

### Tarefa 13: `DaySeat` e carga dos assentos no dia

**Files:**
- Create: `src/backend/daySeats.ts`
- Create: `src/backend/daySeats.test.ts`
- Modify: `src/backend/advanceDay.ts` (início de `advanceOneDay`, ~l.411–486; `metaPatch`/`updateMeta` no fim, ~l.3001–3067)

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/daySeats.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildSquadIndex } from "@/backend/squadIndex";
import { humanClubSet, loadDaySeats, seatByClub } from "@/backend/daySeats";
import type { SaveService, WorldMeta } from "@/backend/SaveService";
import type { SeatState } from "@/types/seatTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (id: string) => ({ id, name: `Club ${id}`, players: [] }) as unknown as Squad;
const index = buildSquadIndex([
  { leagueSlug: "pl", clubSlug: "1", squad: squad("1") },
  { leagueSlug: "pl", clubSlug: "2", squad: squad("2") },
  { leagueSlug: "ll", clubSlug: "3", squad: squad("3") },
]);
const seat = (clubId: string, extra: Partial<SeatState> = {}): SeatState => ({
  clubId, clubName: `Club ${clubId}`, clubColors: ["#000", "#fff"], leagueSlug: "pl", leagueName: "PL", ...extra,
});
const world: WorldMeta = {
  id: "w", name: "w", createdAt: "", updatedAt: "", mode: "multi", seats: ["a", "b", "c", "gone"], currentDate: "2027-03-01",
};
const seats: Record<string, SeatState> = {
  a: seat("1", { board: { board: 70, fans: 50 } as SeatState["board"] }),
  b: seat("3", { leagueSlug: "ll" }),
  c: seat("2", { unemployed: { since: "2027-01-01" } as SeatState["unemployed"] }),
};
const service = {
  getSeat: async (_s: string, id: string) => seats[id] ?? null,
  getTactics: async (_s: string, id: string) => (id === "a" ? { formation: "4-4-2", tactical_style: "balanced", lineup: [] } : null),
} as unknown as SaveService;

describe("day seats", () => {
  test("one DaySeat per seat file, with its club, tactics and board; an unemployed seat has no club", async () => {
    const day = await loadDaySeats(service, "w", world, index);
    expect(day.map((d) => d.seatId)).toEqual(["a", "b", "c"]);
    expect(day[0]!.clubId).toBe("1");
    expect(day[0]!.entry?.leagueSlug).toBe("pl");
    expect(day[0]!.tactics?.formation).toBe("4-4-2");
    expect(day[0]!.board?.board).toBe(70);
    expect(day[0]!.meta.currentDate).toBe("2027-03-01");
    expect(day[0]!.meta.seatId).toBe("a");
    expect(day[2]!.clubId).toBeUndefined();
    expect([...humanClubSet(day)].sort()).toEqual(["1", "3"]);
    expect(seatByClub(day).get("3")?.seatId).toBe("b");
    expect(seatByClub(day).has("2")).toBe(false);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/backend/daySeats.test.ts` → FAIL (módulo não existe).

- [ ] **Passo 3: implementar** — `src/backend/daySeats.ts`:

```ts
import type { SaveService, SeatMeta, WorldMeta } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { MatchContext } from "@/backend/boardWorld";
import type { scoutingDay } from "@/backend/scoutingWorld";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { BoardState, CareerEnded, SackReason } from "@/types/boardTypes";
import type { SeatState } from "@/types/seatTypes";
import type { RegistrationNotice } from "@/types/registrationTypes";
import type { StandingRow } from "@/types/playerTypes";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import type { AwardsInboxMessage, PressInboxMessage } from "@/types/inboxTypes";
import type { ClubMove } from "@/types/pyramidTypes";
import type { JobOffer, Unemployment } from "@/types/jobTypes";
import type { PressState } from "@/types/pressTypes";
import type { DayNewsInput } from "@/types/newsTypes";
import type { ManagerCardRecord } from "@/Domain/advanceDay/matches";
import type { GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { ManagerContract, ManagerRenewalOffer } from "@/Domain/managers/managerContract";
import type { DirectorDecision, DirectorOutcome } from "@/Domain/responsibilities/director";
import type { PlayerNews } from "@/Domain/morale/morale";
import type { StaffContractNews } from "@/Domain/staff/staffContracts";
import type { ManagerBan } from "@/Domain/referees/managerBan";
import type { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import type {
  buildBoardMessage, buildContinentalMessage, buildContractMessage, buildInjuryMessage, buildRetirementMessage,
  buildSeasonMessage, buildTransferNegotiationMessage, buildYouthMessage,
} from "@/Domain/inbox/inboxEvents";
import { metaForSeat } from "@/Domain/seats/seats";
import { logError } from "@/Logger";

type Msg<F extends (...a: never[]) => unknown> = Parameters<F>[0];

/**
 * One seat during a day advance (`.claude/rules/game/multiplayer.md`): its club, its tactics, the board kept in
 * memory, and every accumulator the day used to keep for "the" human club. Built by `loadDaySeats` at the start
 * of `advanceOneDay`; the seat patch (`patch`) is written at the end with `updateSeat`.
 */
export interface DaySeat {
  seatId: string;
  /** World + seat as they were at the start of the day (read-only view for the helpers). */
  meta: SeatMeta;
  /** The seat's club (squad id); undefined while unemployed or when the club left the world. */
  clubId: string | undefined;
  entry: ReturnType<SquadIndex["byId"]>;
  tactics: TacticsSave | null;
  board: BoardState | undefined;
  sackedReason: SackReason | null;
  boardMessages: Msg<typeof buildBoardMessage>[];
  press: { titles: string[]; eliminated: string[]; matchContext: Map<string, MatchContext> };
  registrationNotices: RegistrationNotice[];
  managerCards: ManagerCardRecord[];
  managerBan: ManagerBan | undefined;
  managerBanGiven: number | null;
  moraleUnavailable: Set<string>;
  moraleBids: { playerId: string; clubId: string; clubName: string }[];
  homeFixtures: Array<{ competition: string; kind: GateKind; neutral?: boolean; opponentId: string; importance?: number }>;
  importanceStandings: StandingRow[] | null | undefined;
  /** The seat's ledger season (year of its league), read once. */
  ledgerSeason: number | null;
  scouting: Awaited<ReturnType<typeof scoutingDay>> | null;
  deferred: {
    injury: Msg<typeof buildInjuryMessage>[];
    contract: Msg<typeof buildContractMessage>[];
    youth: Msg<typeof buildYouthMessage>[];
    facility: Msg<typeof buildFacilityMessage>[];
    retirement: Msg<typeof buildRetirementMessage>[];
    clubRecords: ClubRecordBroken[];
    awards: AwardsInboxMessage[];
    negotiation: Msg<typeof buildTransferNegotiationMessage>[];
    continental: Msg<typeof buildContinentalMessage>[];
    season: Msg<typeof buildSeasonMessage>[];
    negativeBalance: Msg<typeof buildSeasonMessage> | null;
  };
  managerEarned: number;
  rollover: {
    seasonEnded: boolean;
    archiveYear?: number;
    moves: ClubMove[];
    move: ClubMove | null;
    championOf: string | null;
    objectiveMet: boolean;
    followersChange: { before: number; after: number; leagueSlug: string } | null;
    leaguePrize: number;
    boardBonusEntry: LedgerEntry | null;
    boardAtSeasonEnd?: number;
  };
  job: {
    ended?: CareerEnded;
    contract?: ManagerContract;
    unemployed?: Unemployment;
    offers: JobOffer[];
    offersBefore: JobOffer[];
    kept: JobOffer[];
    newOffers: JobOffer[];
    midSeason?: string;
    renewal?: ManagerRenewalOffer;
    notices?: string[];
  };
  director: { decided?: Record<string, DirectorDecision>; outcomes: DirectorOutcome[]; news: PlayerNews[] };
  staffNews: StaffContractNews[];
  moraleNews: PlayerNews[];
  pressOut: { state?: PressState; invite?: PressInboxMessage; news: DayNewsInput["press"] };
  achievementsUnlocked: number;
  /** Seat fields to write at the end of the day. */
  patch: Partial<SeatState>;
}

export function newDaySeat(args: {
  seatId: string; world: WorldMeta; seat: SeatState; index: SquadIndex; tactics: TacticsSave | null;
}): DaySeat {
  const { seatId, world, seat, index } = args;
  const entry = !seat.unemployed && seat.clubId ? index.byId(seat.clubId) : undefined;
  const offers = seat.jobOffers ?? [];
  return {
    seatId,
    meta: metaForSeat(world, seatId, seat),
    clubId: entry?.squadId,
    entry,
    tactics: args.tactics,
    board: seat.board,
    sackedReason: null,
    boardMessages: [],
    press: { titles: [], eliminated: [], matchContext: new Map() },
    registrationNotices: [],
    managerCards: [],
    managerBan: seat.managerBan,
    managerBanGiven: null,
    moraleUnavailable: new Set(),
    moraleBids: [],
    homeFixtures: [],
    importanceStandings: undefined,
    ledgerSeason: null,
    scouting: null,
    deferred: {
      injury: [], contract: [], youth: [], facility: [], retirement: [], clubRecords: [], awards: [],
      negotiation: [], continental: [], season: [], negativeBalance: null,
    },
    managerEarned: 0,
    rollover: {
      seasonEnded: false, moves: [], move: null, championOf: null, objectiveMet: false, followersChange: null,
      leaguePrize: 0, boardBonusEntry: null,
    },
    job: {
      offers, offersBefore: offers, kept: offers, newOffers: [],
      ...(seat.jobsMidSeason ? { midSeason: seat.jobsMidSeason } : {}),
      ...(seat.unemployed ? { unemployed: seat.unemployed } : {}),
      ...(seat.managerRenewal ? { renewal: seat.managerRenewal } : {}),
      ...(seat.managerContractNotices ? { notices: seat.managerContractNotices } : {}),
      ...(entry && seat.managerContract?.squadId === entry.squadId ? { contract: seat.managerContract } : {}),
    },
    director: { outcomes: [], news: [] },
    staffNews: [],
    moraleNews: [],
    pressOut: { news: [] },
    achievementsUnlocked: 0,
    patch: {},
  };
}

/** Every seat of the world for today's advance, in seat order (a seat without its file is logged and skipped). */
export async function loadDaySeats(
  service: SaveService, saveId: string, world: WorldMeta, index: SquadIndex,
): Promise<DaySeat[]> {
  const out: DaySeat[] = [];
  for (const seatId of world.seats) {
    const seat = await service.getSeat(saveId, seatId);
    if (!seat) {
      logError("seats", `save ${saveId}: seat ${seatId} is listed in the meta but has no seat.json`);
      continue;
    }
    out.push(newDaySeat({ seatId, world, seat, index, tactics: await service.getTactics(saveId, seatId) }));
  }
  return out;
}

/** The clubs with a human manager today (the AI never acts on these). */
export function humanClubSet(seats: readonly DaySeat[]): Set<string> {
  return new Set(seats.flatMap((s) => (s.clubId ? [s.clubId] : [])));
}

/** club id → its seat. */
export function seatByClub(seats: readonly DaySeat[]): Map<string, DaySeat> {
  return new Map(seats.flatMap((s) => (s.clubId ? [[s.clubId, s] as const] : [])));
}
```

- [ ] **Passo 4: plugar no dia (ainda com um assento)** — em `advanceOneDay`:

  4.1 No começo, troque

```ts
    const meta = await saveService.getMeta(saveId);
    if (!meta) return { ok: false, status: 404, error: "save not found" };
    if (!meta.currentDate) return { ok: false, status: 400, error: "save has no currentDate" };
```

  por

```ts
    const world = await saveService.getWorldMeta(saveId);
    if (!world) return { ok: false, status: 404, error: "save not found" };
    if (!world.currentDate) return { ok: false, status: 400, error: "save has no currentDate" };
```

  e, logo depois de `let index = await saveService.getSquadIndex(saveId);` (~l.462), acrescente:

```ts
    // The seats of the world (`.claude/rules/game/multiplayer.md`). TRANSITIONAL (Tasks 13–22): `solo` and `meta`
    // keep the single-seat code running until each group of steps loops over `daySeats`.
    const daySeats = await loadDaySeats(saveService, saveId, world, index);
    const solo = daySeats[0];
    if (!solo) return { ok: false, status: 400, error: "save has no seat" };
    const meta = solo.meta;
```

  Use `world.currentDate`/`world.activeLeagues` para `currentDate`/`activeLeagues` e mova as declarações que liam
  `meta` antes do índice (`currentDate`, `nextDate`, `activeLeagues`) para ler de `world`. As linhas
  `const tactics = await saveService.getTactics(saveId);` e `let board = meta.board;` viram
  `const tactics = solo.tactics;` e `let board = solo.board;`.

  4.2 No fim, troque a gravação da meta (`const updatedMeta = await saveService.updateMeta(saveId, { ...metaPatch, currentDate: nextDate, activeLeagues: … });`) por:

```ts
    // World and seat written apart (the seat in phase 1 of the flush, the world meta last).
    const split = splitSeatPatch(metaPatch);
    if (Object.keys(split.seat).length > 0) await saveService.updateSeat(saveId, solo.seatId, split.seat);
    const updatedMeta = await saveService.updateMeta(saveId, {
      ...(split.world as Partial<WorldMeta>),
      currentDate: nextDate,
      activeLeagues: updatedActiveLeagues.length > 0 ? updatedActiveLeagues : undefined,
    });
```

  Imports: `loadDaySeats` de `@/backend/daySeats`, `splitSeatPatch` de `@/Domain/seats/seats`, `WorldMeta` de
  `@/backend/SaveService`.

- [ ] **Passo 5: rodar e ver passar** — `bun test src/backend/daySeats.test.ts src/backend/board.advanceDay.test.ts src/backend/jobs.test.ts` → PASS.

- [ ] **Passo 6: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 7: commit**

```bash
git add src/backend/daySeats.ts src/backend/daySeats.test.ts src/backend/advanceDay.ts
git commit -m "feat(seats): DaySeat e carga dos assentos no avanço do dia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 14: Exclusão — a IA ignora o conjunto de clubes humanos

**Files:**
- Modify: `src/Domain/transfer/marketRotation.ts` (`DailyMarketTickOptions`, `dailyMarketTick`, `initMarketState`;
  extrair `humanBidsTick`)
- Modify: `src/Domain/transfer/transferNeeds.ts` (`findCandidates` ~l.198, `processTeamTransferAttempt` ~l.397)
- Modify: `src/Domain/contracts/freeAgents.ts` (`freeAgentTick`, ~l.149)
- Modify: `src/backend/managerWorld.ts` (`createAiManagerDesk`, ~l.157–410)
- Modify: `src/backend/advanceDay.ts` (chamadas acima; a gravação de `newBids` fica no assento `solo` até a Tarefa 17)
- Modify: `src/Domain/transfer/marketRotation.test.ts`, `src/Domain/contracts/freeAgents.test.ts`, scripts que
  chamam `dailyMarketTick`/`initMarketState` (`grep -rln "dailyMarketTick\|initMarketState" scripts src`)

- [ ] **Passo 1: escrever o teste que falha** — em `src/Domain/transfer/marketRotation.test.ts`, no `describe`
  "dailyMarketTick — marketFrozen / excludePlayerSquadId", troque o último teste (o que usa
  `{ excludePlayerSquadId: humanId }`) por:

```ts
  test("two human clubs: the AI never buys from or sells to either", async () => {
    const england = await loadLeague("premier_league");
    const humans = new Set([england[0]!.id, england[1]!.id]);
    const moves = runTicks(england, 90, { excludeSquadIds: humans });
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some(([s, b]) => humans.has(s) || humans.has(b))).toBe(false);
  });
```

  e, no teste da l.112–119, `excludePlayerSquadId: "human"` → `excludeSquadIds: new Set(["human"])`. Em
  `src/Domain/contracts/freeAgents.test.ts`, todo `excludeSquadId: "<id>"` → `excludeSquadIds: new Set(["<id>"])`.

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/transfer/marketRotation.test.ts src/Domain/contracts/freeAgents.test.ts` → FAIL (tipo/opção desconhecida; o teste de dois humanos vê compras do segundo clube).

- [ ] **Passo 3: implementar**

  3.1 `transferNeeds.ts`: `findCandidates(need, allSquads, buyerId, excludeSellerSquadIds?: ReadonlySet<string>)`
  com `if (excludeSellerSquadIds?.has(squad.id)) continue;`; `processTeamTransferAttempt(…, excludeSquadIds?:
  ReadonlySet<string>, …)` repassa o conjunto a `findCandidates`. Ajuste os outros chamadores de `findCandidates`
  (`grep -rn "findCandidates(" src scripts`) para passar um `Set` (ou nada).

  3.2 `marketRotation.ts`: em `DailyMarketTickOptions`, troque `excludePlayerSquadId?: string | null`,
  `playerSellList?`, `playerSquad?` e `newBidId?` por:

```ts
  /** Clubs with a human manager (every seat): never refreshed, never buying, never selling to the AI. */
  excludeSquadIds?: ReadonlySet<string>;
```

  Em `dailyMarketTick`, `const excludePlayerSquadId = options?.excludePlayerSquadId ?? null;` vira
  `const excluded = options?.excludeSquadIds ?? new Set<string>();`; `if (excludePlayerSquadId && candidate === excludePlayerSquadId) continue;`
  vira `if (excluded.has(candidate)) continue;`; o filtro do `poolIds` vira `&& !excluded.has(id)`; a chamada a
  `processTeamTransferAttempt` recebe `excluded`. A assinatura passa a receber e devolver só a parte do mundo:

```ts
export function dailyMarketTick(
  market: WorldMarketState,
  allSquads: Squad[],
  currentDate: string,
  rng: () => number = defaultRng,
  options?: DailyMarketTickOptions,
): DailyMarketTickResult {
```

  com `DailyMarketTickResult = { updatedMarket: WorldMarketState; completedTransfers: CompletedAITransfer[] }`
  (sem `newBids`); o `return` do `marketFrozen` vira `{ updatedMarket: market, completedTransfers: [] }`; apague o
  bloco "Bids for the human club's players" do fim e devolva
  `{ updatedMarket: { shuffledTeamIds, rotationIndex, profiles }, completedTransfers }`. `initMarketState` devolve
  `WorldMarketState`: `return { shuffledTeamIds, rotationIndex: 0, profiles: {} };`. Acrescente, no fim do arquivo,
  os lances pelos jogadores de um assento:

```ts
export interface HumanBidsArgs {
  /** The joined market: the world's profiles + the seat's lists and pending bids. */
  market: MarketState;
  /** The squads after today's AI tick. */
  squads: Squad[];
  humanSquad: Squad;
  currentDate: string;
  rng?: () => number;
  seasonEndOf?: (squad: Squad) => string | undefined;
  windows?: DailyMarketTickOptions["windows"];
  newBidId?: () => string;
}

/**
 * AI bids for one seat's players (`.claude/rules/game/negotiation.md`): AI clubs never buy from a human sell
 * list on their own — they send a bid the seat answers in its inbox. Returns the seat's market with the live
 * bids (expired ones dropped) plus today's.
 */
export function humanBidsTick(args: HumanBidsArgs): { market: MarketState; newBids: MarketBid[] } {
  const rng = args.rng ?? defaultRng;
  const squads = new Map(args.squads.map((s) => [s.id, s] as const));
  const human = squads.get(args.humanSquad.id) ?? args.humanSquad;
  const pending = liveBids(args.market.pendingBids, args.currentDate, human);
  let seq = 0;
  const newBids = generateBidsForHuman({
    date: args.currentDate,
    rng,
    humanSquad: human,
    squads,
    profiles: args.market.profiles ?? {},
    sellList: args.market.playerSellList ?? [],
    loanList: args.market.playerLoanList ?? [],
    pending,
    seasonEndOf: (sq) => args.seasonEndOf?.(sq) ?? defaultSeasonEnd(args.currentDate),
    ...(args.windows ? { buyerOpen: args.windows.isOpen, ...(args.windows.closesOn ? { buyerClosesOn: args.windows.closesOn } : {}) } : {}),
    newId: args.newBidId ?? (() => `bid-${args.currentDate}-${++seq}`),
  });
  if (newBids.length > 0) logDebug("transfers", `${newBids.length} bid(s) for the human club's players`);
  return { market: { ...args.market, pendingBids: [...pending, ...newBids] }, newBids };
}
```

  (A versão antiga passava a `generateBidsForHuman` o `Map` de cópias `cloneSquad` do tick; aqui o `Map` é dos
  squads já atualizados pelo tick, que o dia passa — o mesmo conteúdo. Confira a assinatura de
  `generateBidsForHuman` em `src/Domain/negotiation/bids.ts` e ajuste os nomes se diferirem.)

  3.3 `freeAgents.ts`: `excludeSquadId?: string | null` → `excludeSquadIds?: ReadonlySet<string>`; o filtro
  `squads[i]!.id !== excludeSquadId` → `!excludeSquadIds?.has(squads[i]!.id)`.

  3.4 `managerWorld.ts` (`createAiManagerDesk`): `humanClubId: string | null` → `humanClubIds: ReadonlySet<string>`
  (todo `row.squadId === args.humanClubId` / `m.squadId !== args.humanClubId` / `squadId === args.humanClubId` vira
  `args.humanClubIds.has(…)` com a negação certa); apague `playerLeague`, `inPlayerLeague`, o array `news` e o
  método `news()`; `pushNews` só alimenta `worldNews`. As notícias de técnicos da liga de cada assento passam a ser
  filtradas de `worldNews()` no fim do dia (Tarefa 20); nesta tarefa, no lugar de `aiDesk?.news()`, o dia usa
  `(aiDesk?.worldNews() ?? []).filter((i) => index.byId(i.squadId)?.leagueSlug === meta.leagueSlug)`.

  3.5 `advanceDay.ts`: `const humanClubs = humanClubSet(daySeats);` logo depois do `solo`; `createAiManagerDesk({ …,
  humanClubIds: humanClubs })`; `dailyMarketTick(world part, allSquadsMarket, currentDate, defaultRng, { excludeSquadIds: humanClubs, seasonEndOf, historyFrom, windows })`
  — onde o `marketForTick` hoje junta mundo e humano, passe só `{ shuffledTeamIds, rotationIndex, profiles }`
  (leia o mundo com `saveService.getWorldMarket(saveId)`); logo depois do tick, para o `solo` (a Tarefa 17 faz o
  laço):

```ts
      const soloMarket = await saveService.getMarket(saveId, solo.seatId);
      const soloSquad = solo.clubId ? allSquadsMarket.find((s) => s.id === solo.clubId) : undefined;
      const { market: soloAfterBids, newBids } = soloSquad && soloMarket
        ? humanBidsTick({
            market: { ...soloMarket, ...updatedMarket }, squads: allSquadsMarket, humanSquad: soloSquad, currentDate,
            rng: defaultRng, seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end,
            windows: { isOpen: (sq) => windows.ofLeague(sq.leagueSlug ?? "").open, closesOn: (sq) => windows.ofLeague(sq.leagueSlug ?? "").until },
            newBidId: () => randomUUID(),
          })
        : { market: soloMarket ? { ...soloMarket, ...updatedMarket } : null, newBids: [] as MarketBid[] };
```

  e o restante do bloco usa `soloAfterBids` como antes usava `updatedMarket` (talks, rivais); a gravação vira
  `saveService.saveWorldMarket(saveId, updatedMarket)` + `saveService.saveMarket(saveId, marketAfterTick, solo.seatId)`.
  `freeAgentTick({ …, excludeSquadIds: humanClubs })`. A partir daqui o dia não usa mais `resolvedPlayerSquadId` nem
  `findPlayerSquad`.

  3.6 Scripts e outros chamadores: `grep -rln "dailyMarketTick\|initMarketState\|excludePlayerSquadId\|excludeSquadId\b" src scripts`
  — troque as opções e, onde o script lia `newBids`, chame `humanBidsTick` ou apague a leitura se o script não tem
  clube humano (`market-sim.ts`, `contracts-sim.ts` rodam sem humano).

- [ ] **Passo 4: rodar e ver passar** — `bun test src/Domain/transfer src/Domain/contracts src/backend/negotiation.routes.test.ts src/backend/managers.market.test.ts` → PASS.

  Grep: `grep -rnE "excludePlayerSquadId|excludeSquadId\b|humanClubId\b" src/Domain/transfer src/Domain/contracts src/backend/managerWorld.ts` → nenhuma linha.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src scripts
git commit -m "feat(seats): a IA ignora o conjunto de clubes humanos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 15: Partidas do dia — mapa de gravações, modo de simulação, escalações, base

**Files:**
- Modify: `src/Domain/advanceDay/simMode.ts` (+ teste `simMode.test.ts`)
- Modify: `src/Domain/advanceDay/matchSimulationLineups.ts` (+ teste novo `src/Domain/advanceDay/seatedLineups.test.ts`)
- Modify: `src/backend/youthCompWorld.ts` (`playYouthDay`, ~l.334–530)
- Modify: `src/backend/advanceDay.ts` (assinatura de `advanceOneDay`/`runBufferedDay`; laço das partidas, ~l.522–789;
  base, ~l.769–782; inscrição da manhã, ~l.479–491; moral pré-jogo, ~l.495–500; mensagens de evolução, ~l.812–864;
  rota `advance-day`, ~l.3167)

- [ ] **Passo 1: escrever os testes que falham**

  Em `src/Domain/advanceDay/simMode.test.ts`, acrescente:

```ts
  test("seats: full when any seat's league or followed league", () => {
    const seats = [{ leagueSlug: "pl", followedLeagues: ["ll"] }, { leagueSlug: "sa" }];
    expect(resolveSimModeForSeats("pl", seats)).toBe("full");
    expect(resolveSimModeForSeats("ll", seats)).toBe("full");
    expect(resolveSimModeForSeats("sa", seats)).toBe("full");
    expect(resolveSimModeForSeats("bl", seats)).toBe("fast");
    expect(resolveSimModeForSeats("pl", [])).toBe("fast");
  });
```

  (import `resolveSimModeForSeats` junto do `resolveSimMode`.)

  `src/Domain/advanceDay/seatedLineups.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { computeSeatedMatchLineups } from "@/Domain/advanceDay/matchSimulationLineups";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import { formationForSimId } from "@/Domain/matchFormations";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (id: string, extra: Partial<Squad> = {}): Squad =>
  ({ id, name: id, colors: ["#000", "#fff"], money: 0, players: [], ...extra }) as Squad;
const fixture = { home: "h", away: "a", date: "2027-03-01", competition: "x", round: 1, played: false } as unknown as Fixture;

describe("lineups with seats on either side", () => {
  test("two seats meet: each side plays its own tactics and familiarity, no AI formation", () => {
    const r = computeSeatedMatchLineups(fixture, squad("h", { styleFamiliarity: { possession: 92 } }), squad("a", { styleFamiliarity: { direct_play: 81 } }), {
      home: { tactics: { formation: "4-3-3", tactical_style: "possession", lineup: [] } },
      away: { tactics: { formation: "4-4-2", tactical_style: "direct_play", lineup: [] } },
    });
    expect(r.tactics.A.style).toBe("possession");
    expect(r.tactics.B.style).toBe("direct_play");
    expect(r.tactics.A.familiarity?.possession).toBe(92);
    expect(r.tactics.B.familiarity?.direct_play).toBe(81);
    expect(r.awayFormation).toEqual(formationForSimId("4-4-2"));
    expect(r.aiFormations).toEqual({});
  });

  test("one seat: the same as the single-human lineups; no seat: both sides on the AI rule", () => {
    const one = computeSeatedMatchLineups(fixture, squad("h"), squad("a"), {
      away: { tactics: { formation: "4-4-2", tactical_style: "possession", lineup: [] } },
    });
    expect(one.tactics.B.style).toBe("possession");
    expect(one.tactics.A.familiarity).toEqual(aiFamiliarity("balanced"));
    const none = computeSeatedMatchLineups(fixture, squad("h"), squad("a"), {});
    expect(none.tactics.A.familiarity).toEqual(aiFamiliarity("balanced"));
    expect(none.tactics.B.familiarity).toEqual(aiFamiliarity("balanced"));
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/advanceDay/simMode.test.ts src/Domain/advanceDay/seatedLineups.test.ts` → FAIL (funções não existem).

- [ ] **Passo 3: implementar os helpers**

  `simMode.ts`, no fim:

```ts
/** Sim mode with several seats: full when any seat would resolve the league in the full engine. */
export function resolveSimModeForSeats(
  leagueSlug: string,
  seats: readonly { leagueSlug: string; followedLeagues?: string[] }[],
): SimMode {
  return seats.some((s) => resolveSimMode(leagueSlug, s) === "full") ? "full" : "fast";
}
```

  `matchSimulationLineups.ts`, no fim:

```ts
/** A seat's side of a fixture: its saved tactics, the rotation it accepted and its man-marking. */
export interface HumanMatchSide {
  tactics: TacticsSave | null;
  rotationOverride?: RotationOverride | null;
  matchMarking?: MatchMarking | null;
}

/**
 * Lineups for a fixture with up to two seats (`.claude/rules/game/multiplayer.md`). One seat is exactly
 * `computeMatchSimulationLineups`; two seats meeting (part 1: simulated in the full engine) resolve each side the
 * way the single human side is resolved.
 */
export function computeSeatedMatchLineups(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  humans: { home?: HumanMatchSide; away?: HumanMatchSide },
  registration?: { home?: MatchRegistration; away?: MatchRegistration },
): ReturnType<typeof computeMatchSimulationLineups> {
  if (!humans.home || !humans.away) {
    const side = humans.home ?? humans.away;
    const humanId = humans.home ? homeSquad.id : humans.away ? awaySquad.id : undefined;
    return computeMatchSimulationLineups(
      fixture, homeSquad, awaySquad, humanId, side?.tactics ?? null, side?.rotationOverride, side?.matchMarking, registration,
    );
  }
  const date = fixture.date;
  const resolveSide = (squad: Squad, side: HumanMatchSide, reg: MatchRegistration | undefined) => {
    const t = side.tactics ?? ({
      formation: DEFAULT_SIM_FORMATION_ID,
      tactical_style: DEFAULT_TACTICAL_STYLE,
      lineup: [],
    } satisfies TacticsSave);
    const formation = formationForTactics(t);
    const tactics: TeamTactics = {
      style: t.tactical_style,
      axesOverride: t.axesOverride,
      familiarity: squadFamiliarityLevels(squad, t.tactical_style),
      ...(t.setPieceTakers ? { setPieceTakers: t.setPieceTakers } : {}),
      ...userInstructions(formation, t, side.matchMarking, date),
    };
    const user = resolveUserLineup(
      squad, formation, t.lineup ?? [], date, { assistantRotation: t.assistantRotation, override: side.rotationOverride }, reg,
    );
    return { formation, tactics, user };
  };
  const h = resolveSide(homeSquad, humans.home, registration?.home);
  const a = resolveSide(awaySquad, humans.away, registration?.away);
  return {
    homeFormation: h.formation,
    homeLineup: h.user.lineup,
    awayFormation: a.formation,
    awayLineup: a.user.lineup,
    userInjuredReplaced: [...h.user.injuredReplaced, ...a.user.injuredReplaced],
    userRotationApplied: [...h.user.rotationApplied, ...a.user.rotationApplied],
    tactics: { A: h.tactics, B: a.tactics },
    aiFormations: {},
    pools: {
      ...(h.user.pool ? { home: h.user.pool } : {}),
      ...(a.user.pool ? { away: a.user.pool } : {}),
    },
  };
}
```

  (`MatchRegistration` é o tipo do 8º parâmetro de `computeMatchSimulationLineups`; se ele vier de outro módulo,
  importe-o de lá. `resolveUserLineup` e `userInstructions` são do próprio arquivo.)

- [ ] **Passo 4: o dia com o mapa de gravações** — em `advanceDay.ts`:

  4.1 Assinaturas: `advanceOneDay(saveService, saveId, recordings: Record<string, PlayedMatchRecording> = {}, options = {})`
  e `runBufferedDay(saveId, recordings: Record<string, PlayedMatchRecording> = {}, options = {})`; a rota
  `/api/advance-day/:saveId` monta `const recordings = playedMatchOverride ? { [auth.seatId]: playedMatchOverride } : {};`
  e chama `runBufferedDay(saveId, recordings)`. `presimulatePreStart` chama `advanceOneDay(service, saveId, {}, { marketFrozen: true })`.
  Outros chamadores (`grep -rn "runBufferedDay(\|advanceOneDay(" src scripts`): troque `null` por `{}` e um
  `PlayedMatchRecording` por `{ [seatId]: rec }` (nos testes, `meta.seatId`).

  4.2 Antes do laço das rodadas, `const pending = new Map(Object.entries(recordings));` e
  `const seatOf = seatByClub(daySeats);` e
  `const humanLeagueClubs = new Set(daySeats.flatMap((ds) => ds.clubId ? index.inLeague(ds.meta.leagueSlug).map((t) => t.squadId) : []));`
  (substitui `playerLeagueClubs`).

  4.3 Dentro do laço de fixtures, o trecho de `const userPlaysThis = …` até `const useRecording = …` vira:

```ts
          const homeSeat = seatOf.get(fixture.home);
          const awaySeat = seatOf.get(fixture.away);
          if (homeSeat) {
            const gateKind: GateKind = isContinentalSlug(leagueSlug) ? "continental" : isCupSlug(leagueSlug) ? "cup" : "league";
            if (homeSeat.importanceStandings === undefined) {
              homeSeat.importanceStandings = await saveService.getLeagueStandings(saveId, homeSeat.meta.leagueSlug);
            }
            const importance = await homeMatchImportance(saveService, saveId, fixture, homeSeat.clubId!, {
              leagueSlug: homeSeat.meta.leagueSlug,
              standings: homeSeat.importanceStandings,
              squadOf: async (id) => (id === homeSquad.id ? homeSquad : id === awaySquad.id ? awaySquad : saveService.getSquadById(saveId, id)),
            });
            homeSeat.homeFixtures.push({
              competition: leagueSlug, kind: gateKind, neutral: fixture.neutral === true, opponentId: fixture.away,
              ...(importance.mult !== 1 ? { importance: importance.mult } : {}),
            });
          }
          // A seat's live recording of this fixture (only against the AI; human × human live is part 4).
          const recSeat = [homeSeat, awaySeat].find((ds) => ds && pending.get(ds.seatId)?.fixtureId === fixture.id);
          const recording = recSeat ? pending.get(recSeat.seatId)! : null;
          if (recording && homeSeat && awaySeat) {
            return { ok: false, status: 400, error: "a match between two seats has no live recording" };
          }
```

  e o ramo `if (useRecording && playedMatchOverride) { … }` vira `if (recording && recSeat) { … }` usando
  `recording` no lugar de `playedMatchOverride`, `recSeat.clubId` no lugar de `playerSquadId` em `backed`, e
  `recSeat.managerCards = sanitizeManagerCards(recording.managerCards);` no lugar de `humanManagerCards = …`; a
  última linha do ramo, `playedMatchOverride = null;`, vira `pending.delete(recSeat.seatId);`.

  4.4 No ramo simulado:

```ts
            const humanSide = (ds: DaySeat): HumanMatchSide => ({
              tactics: ds.tactics, rotationOverride: ds.meta.rotationOverride, matchMarking: ds.meta.matchMarking,
            });
            const sim = computeSeatedMatchLineups(fixture, homeSquad, awaySquad, {
              ...(homeSeat ? { home: humanSide(homeSeat) } : {}),
              ...(awaySeat ? { away: humanSide(awaySeat) } : {}),
            }, registration);
            const mode = homeSeat || awaySeat
              ? "full"
              : isKnockoutComp(leagueSlug)
                ? (humanLeagueClubs.has(fixture.home) || humanLeagueClubs.has(fixture.away) ? "full" : "fast")
                : resolveSimModeForSeats(leagueSlug, daySeats.map((ds) => ds.meta));
```

  4.5 Depois do laço: `const nationalRecordings = Object.fromEntries(pending);` no lugar de
  `const nationalRecording = playedMatchOverride; playedMatchOverride = null;`. Até a Tarefa 24 a seleção tem um só
  técnico humano: passe `playedMatch: nationalRecordings[solo.seatId] ?? null` a `playNationalDay`, e o erro
  "playedMatch fixture does not match …" dispara quando `Object.keys(nationalRecordings).length > 0` e o dia nacional
  não consumiu (`!nationalDay.consumedRecording`).

  4.6 Inscrição da manhã e moral pré-jogo: os blocos `if (playerSquadId && playerEntry && !options.marketFrozen) { … humanRegistrationDay … }`
  e `if (playerSquadId && !options.marketFrozen) { … moraleUnavailable … }` viram laços
  `for (const ds of daySeats) { if (!ds.clubId || !ds.entry || options.marketFrozen) continue; … }` gravando em
  `ds.registrationNotices` e `ds.moraleUnavailable`. As notas de inscrição do jogo (`regHome?.notices`,
  `regAway?.notices`) vão para `seatOf.get(fixture.home)?.registrationNotices` / `seatOf.get(fixture.away)?…`. O
  `registrationDayCtx` recebe `daySeats.map((ds) => seatWindowRef(ds.meta))` e o `loadWindowContext` do dia também.

  4.7 Base (`playYouthDay`): em `youthCompWorld.ts`, troque `humanClubId: string`, `callUps?` e `tactics` por

```ts
  /** The seats' clubs (squad id → its seat's call-ups and tactics). */
  humans: ReadonlyMap<string, { seatId: string; callUps?: YouthCallUps; tactics: TacticsSave | null }>;
```

  e, em `YouthDayResult`, `consumedCallUps`, `skippedCallUps` e `humanRatings` passam a ser por assento:
  `bySeat: Record<string, { consumedCallUps: YouthCompAge[]; skippedCallUps: Partial<Record<YouthCompAge, string[]>>; humanRatings: Partial<Record<YouthCompAge, Record<string, number>>> }>`
  (crie a entrada do assento na primeira vez que ele aparece). Dentro: `fx.home === humanClubId || fx.away === humanClubId`
  → `args.humans.has(fx.home) || args.humans.has(fx.away)`, e o `consume(age)` vale para o(s) assento(s) do jogo;
  `squad.id === humanClubId` → `args.humans.get(squad.id)` (tática e convocados do assento daquele clube). No dia:
  `humans: new Map(daySeats.filter((ds) => ds.clubId).map((ds) => [ds.clubId!, { seatId: ds.seatId, callUps: ds.meta.youthCallUps, tactics: ds.tactics }]))`;
  o bloco do `metaPatch` que consome as convocações (`if (youthDay.consumedCallUps.length > 0) { … }`) vira um laço
  por assento lendo `youthDay.bySeat[ds.seatId]` e gravando em `ds.patch.youthCallUps` / `ds.patch.youthCallUpsSkipped`.
  Ajuste `src/backend/youthComps.advanceDay.test.ts` e `youthCompWorld.test.ts` (chamadas diretas a `playYouthDay`).

  4.8 Mensagens de evolução (`// ── Aggregate development messages for user's club ──`): o bloco `if (playerSquadId) { … }`
  vira `for (const ds of daySeats) { if (!ds.clubId) continue; … }` com `ds.clubId` no lugar de `playerSquadId` e
  `emitInboxMessage(saveId, …, saveService, ds.seatId)`.

- [ ] **Passo 5: rodar e ver passar** — `bun test src/Domain/advanceDay src/backend/advanceDay.doubleBooking.test.ts src/backend/youthComps.advanceDay.test.ts src/backend/youthCompWorld.test.ts src/backend/var.advanceDay.test.ts src/backend/registration.advanceDay.test.ts` → PASS.

  Grep: `grep -nE "playedMatchOverride|userPlaysThis|playerLeagueClubs|humanManagerCards|playerHomeFixturesToday|importanceStandings\b" src/backend/advanceDay.ts`
  → só `playedMatchOverride` dentro da rota `advance-day` (o nome da variável do corpo do pedido).

- [ ] **Passo 6: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 7: commit**

```bash
git add src scripts
git commit -m "feat(seats): partidas do dia com gravações e escalações por assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 16: Diretoria, banimento, prêmios, finanças, instalações, olheiros, moral, diretor, comissão e imprensa por assento

**Files:**
- Modify: `src/backend/advanceDay.ts`, blocos (âncoras): `// ── Board and fans: today's official matches of the human club`
  (~l.1009), `// ── The manager's ban` (~l.1024), `// ── Prize money: cup + continental` (~l.1034–1083,
  `awardClubPrize`/`playerLedgerSeason`), os `if (… winnerId === playerSquadId …)` dentro dos prêmios de copa
  (~l.1132–1176) e continentais (~l.1215–1225), `// ── Scouting (human manager` (~l.1708),
  `// ── Financial updates (player's club ledger)` (~l.1720–1856), `// ── Board and fans: daily review` (~l.2574–2612),
  `// ── The director's Monday` / `// ── Coaching-staff contracts` / morale (~l.2752–2840), `// ── Press conferences`
  (~l.2833–2862)
- Modify: `src/backend/pressWorld.ts` (`pressDay` recebe `seatId` e `meta: SeatMeta`)

- [ ] **Passo 1: teste** — as travas são os testes existentes (`board.advanceDay.test.ts`,
  `facilities.advanceDay.test.ts`, `staff.advanceDay.test.ts`, `press*.test.ts`, `responsibilities.routes.test.ts`,
  `morale.routes.test.ts`, `scouting.routes.test.ts`) e os de dois assentos da Tarefa 31. Rode-os antes para a linha
  de base: `bun test src/backend/board.advanceDay.test.ts src/backend/facilities.advanceDay.test.ts src/backend/staff.advanceDay.test.ts src/backend/responsibilities.routes.test.ts` → PASS.

- [ ] **Passo 2: converter pela RD**, bloco a bloco:
  - **Diretoria pós-jogo:** `if (board && playerSquadId) { … boardAfterMatches … }` → laço por assento com
    `ds.board`, `ds.clubId`, `playerLeagueSlug: ds.meta.leagueSlug`, `ds.press.matchContext = boardOut.context`.
  - **Banimento:** exemplo completo da conversão (antes/depois):

    Antes:

```ts
    let managerBan = meta.managerBan;
    let managerBanGiven: number | null = null;
    if (playerSquadId) {
      const step = nextManagerBan(meta.managerBan, teamsPlayingToday.has(playerSquadId), humanManagerCards, currentDate);
      managerBan = step.ban;
      managerBanGiven = step.given;
      if (board) for (const c of humanManagerCards) board = applyManagerCard(board, c.card);
    }
```

    Depois:

```ts
    for (const ds of daySeats) {
      if (!ds.clubId) continue;
      const step = nextManagerBan(ds.meta.managerBan, teamsPlayingToday.has(ds.clubId), ds.managerCards, currentDate);
      ds.managerBan = step.ban;
      ds.managerBanGiven = step.given;
      if (ds.board) for (const c of ds.managerCards) ds.board = applyManagerCard(ds.board, c.card);
    }
```

  - **Prêmios:** `awardClubPrize` — o ramo `if (clubId === playerSquadId)` vira `const ds = seatOf.get(clubId); if (ds) { … }`
    com a temporada do extrato do assento (`ds.ledgerSeason ??= (await saveService.getLeagueMeta(saveId, ds.meta.leagueSlug))?.year ?? new Date(currentDate).getFullYear();`)
    e `recordMoney(…, ds.seatId)`; apague `playerLedgerSeason`/`playerLedgerSeasonCache`. Nos prêmios de copa e
    continentais, os testes `winnerId === playerSquadId` / `loserId === playerSquadId` / `ev.clubId === playerSquadId`
    viram `seatOf.get(winnerId)`, `seatOf.get(loserId)`, `seatOf.get(ev.clubId)`, agindo no `ds.board` e em
    `ds.press.titles`/`ds.press.eliminated` daquele assento.
  - **Mensagens de copa do humano** (`// ── National cup inbox news for the human club`): laço por assento; `myCup`
    = `await playerCupSlug(ds.meta.leagueSlug)`; `emitInboxMessage(…, ds.seatId)`.
  - **Mensagens continentais do humano**: laço por assento enfileirando em `ds.deferred.continental`.
  - **Olheiros:** `const scouting = await scoutingDay(…)` vira, por assento ativo,
    `ds.scouting = await scoutingDay(saveService, saveId, ds.seatId, { date: currentDate, meta: ds.meta, matchEvents })`.
  - **Finanças/instalações:** o bloco `if (playerEntry && playerSquadId) { … }` inteiro vira
    `for (const ds of daySeats) { if (!ds.entry || !ds.clubId) continue; … }` com `ds.homeFixtures` no lugar de
    `playerHomeFixturesToday`, a folga do assento (`isRestDay` → `restToday(ds)`, ver abaixo), `ds.board`,
    `ds.deferred.facility`, `ds.deferred.negativeBalance`, `ds.managerEarned`,
    `loanedOutWages: parentLoanWages((await saveService.getMarket(saveId, ds.seatId))?.loans, playerSquad.id)`,
    `managerWage` do contrato do assento (`ds.meta.managerContract?.squadId === playerSquad.id`), as linhas de
    olheiros `...(ds.scouting?.entries ?? [])`, a temporada do extrato do assento e `recordMoney(…, ds.seatId)`.
    Até a Tarefa 21 a folga do assento é a de hoje: defina, antes do laço,
    `const restToday = (ds: DaySeat) => (updatedActiveLeagues.find((l) => l.leagueSlug === ds.meta.leagueSlug)?.restDays ?? []).includes(currentDate);`
    — a Tarefa 21 troca a fonte para `ds.meta.restDays`.
  - **Revisão diária da diretoria** (`// ── Board and fans: daily review`): laço por assento; o `CareerEnded` vai para
    `ds.job.ended` (a demissão em si é a Tarefa 19; aqui só a revisão e o `ended` da diretoria).
  - **Diretor, comissão, moral:** `humanActive` vira, por assento,
    `const active = !ds.job.ended && !!ds.clubId && !ds.job.unemployed && !options.marketFrozen;`; o diretor
    (`applyDirectorDay(saveService, saveId, ds.seatId, …)`), os contratos da comissão (o squad do assento) e a moral
    (`applyMoraleDay(saveService, saveId, ds.seatId, { clubId: ds.clubId, …, bids: ds.moraleBids, unavailable: ds.moraleUnavailable, seasonRolled: ds.rollover.seasonEnded })`)
    gravam em `ds.director`, `ds.staffNews`, `ds.moraleNews`. A renovação do pool da comissão
    (`if (seasonEnded) { … refreshPool … }`) roda uma vez se **algum** assento virou a temporada, com o ano da liga
    do primeiro assento que virou (o pool é do mundo; o `refreshPool` é idempotente por data).
  - **Imprensa:** `pressDay({ saveId, seatId: ds.seatId, service, meta: ds.meta, …, board: ds.board, …,
    titlesToday: ds.press.titles, eliminatedToday: ds.press.eliminated, matchContext: ds.press.matchContext,
    rollover: ds.rollover.seasonEnded ? { objectiveMet: ds.rollover.objectiveMet, move: …, championOf: ds.rollover.championOf } : undefined })`
    e o resultado em `ds.board`, `ds.pressOut`. Em `pressWorld.ts`, `pressDay` lê o estado de imprensa de
    `input.meta.press` (já é do assento pela visão mesclada) e passa `input.seatId` a qualquer gravação de arquivo do
    técnico.
  - **Patch:** no fim do dia (bloco do `metaPatch`), por assento:
    `if (ds.board) ds.patch.board = ds.board; if (ds.pressOut.state) ds.patch.press = ds.pressOut.state;
    if (ds.managerBan !== ds.meta.managerBan) ds.patch.managerBan = ds.managerBan;
    if (ds.director.decided) ds.patch.directorDecisions = ds.director.decided;`
    e `managerEarnings` com `ds.managerEarned` (a parte da seleção entra na Tarefa 24). Grave cada `ds.patch` com
    `updateSeat` (o `splitSeatPatch(metaPatch)` da Tarefa 13 continua só para o que ainda estiver em `metaPatch`).

- [ ] **Passo 3: grep da RD** para o grupo:
  `grep -nE "\b(board|boardMessages|sackedReason|pressTitles|pressEliminated|pressMatchContext|managerEarned|managerBan|managerBanGiven|scouting|playerLedgerSeason|humanActive|directorInCharge|directorDecided|directorOutcomes|directorNews|staffContractNews|moraleNews|pressState|pressInvite|pressNews)\b" src/backend/advanceDay.ts`
  → só dentro de `ds.`/`ds.press.`/`ds.pressOut.`/`ds.director.` ou em nomes de chave (`board:` num objeto).

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src
git commit -m "feat(seats): diretoria, finanças, instalações, olheiros, moral e imprensa por assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 17: Mercado e negociação por assento

**Files:**
- Modify: `src/backend/advanceDay.ts` (bloco `// ── Transfer market tick` ~l.1452–1688 e
  `// ── Transfer windows: news for the human club's country` ~l.1690–1700)

- [ ] **Passo 1: linha de base** — `bun test src/backend/negotiation.routes.test.ts src/backend/windows.routes.test.ts src/backend/morale.routes.test.ts` → PASS.

- [ ] **Passo 2: converter.** O tick da IA roda uma vez para o mundo (Tarefa 14); o que é do humano roda por assento,
  na ordem de hoje:

```ts
    if (!options.marketFrozen) {
      // Loans due back today go home first (each seat's market lists its loans).
      for (const ds of daySeats) {
        const seatMarket = await saveService.getMarket(saveId, ds.seatId);
        if (!seatMarket?.loans?.length) continue;
        const back = await returnDueLoans(saveService, saveId, ds.seatId, ds.meta, seatMarket, currentDate);
        if (back.market !== seatMarket) await saveService.saveMarket(saveId, back.market, ds.seatId);
        ds.deferred.negotiation.push(...back.news);
      }
      const allSquadsMarket = await saveService.getAllSquads(saveId);
      const worldMarket = await saveService.getWorldMarket(saveId);
      const marketForTick = worldMarket?.shuffledTeamIds?.length
        ? { ...worldMarket, profiles: worldMarket.profiles ?? {} }
        : initMarketState(allSquadsMarket);
      const { updatedMarket, completedTransfers } = dailyMarketTick(marketForTick, allSquadsMarket, currentDate, defaultRng, {
        excludeSquadIds: humanClubs,
        seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end,
        historyFrom: (sq) => {
          const l = activeLeagues.find((x) => x.leagueSlug === sq.leagueSlug);
          return l ? { league: l.leagueSlug, season: seasonLabel(l.year, l.start, l.end) } : null;
        },
        windows: {
          isOpen: (sq) => windows.ofLeague(sq.leagueSlug ?? "").open,
          closesOn: (sq) => windows.ofLeague(sq.leagueSlug ?? "").until,
          rush: (sq) => windows.rush(sq.leagueSlug ?? ""),
        },
      });
      await saveService.saveWorldMarket(saveId, updatedMarket);
      const sellOnPaidTo = new Set<string>();
      // … the AI × AI transfers loop (unchanged, see below) …
      for (const ds of daySeats) {
        if (!ds.clubId) continue;
        const humanSquad = allSquadsMarket.find((s) => s.id === ds.clubId);
        const seatMarket = (await saveService.getMarket(saveId, ds.seatId)) ?? { ...updatedMarket, playerSellList: [] };
        let market: MarketState = { ...seatMarket, ...updatedMarket };
        if (humanSquad) {
          const bids = humanBidsTick({
            market, squads: allSquadsMarket, humanSquad, currentDate, rng: defaultRng,
            seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end,
            windows: { isOpen: (sq) => windows.ofLeague(sq.leagueSlug ?? "").open, closesOn: (sq) => windows.ofLeague(sq.leagueSlug ?? "").until },
            newBidId: () => randomUUID(),
          });
          market = bids.market;
          for (const bid of bids.newBids) {
            if (bid.kind === "transfer") ds.moraleBids.push({ playerId: bid.playerId, clubId: bid.clubId, clubName: bid.clubName });
            ds.deferred.negotiation.push({
              date: currentDate, kind: bid.kind === "loan" ? "loan_bid" : "bid", bidId: bid.id,
              playerId: bid.playerId, playerName: bid.playerName, clubName: bid.clubName, fee: bid.fee,
              ...(bid.sellOnPct ? { sellOnPct: bid.sellOnPct } : {}),
              ...(bid.wageShare !== undefined ? { wageShare: bid.wageShare } : {}),
              ...(bid.until ? { until: bid.until } : {}),
              expires: bid.expires,
            });
          }
        }
        market = { ...market, talks: pruneTalks(market.talks, currentDate) };
        // A closed window ends the seat's open conversations (bans stay).
        if (!windows.seat(ds.seatId).today.open && market.talks) {
          market = { ...market, talks: Object.fromEntries(Object.entries(market.talks).filter(([, t]) => t.closedUntil && t.closedUntil >= currentDate)) };
        }
        // Rivals for the seat's targets (`.claude/rules/game/negotiation.md` → "Disputa").
        if (market.rivalBids?.length) {
          const res = await resolveRivalDeadlines(saveService, saveId, ds.seatId, ds.meta, { market, date: currentDate, windows });
          market = res.market;
          ds.deferred.negotiation.push(...res.news);
          dayMoves.push(...res.moves);
          for (const m of res.moves) { sellOnPaidTo.add(m.from); sellOnPaidTo.add(m.to); }
          for (const id of new Set((market.rivalBids ?? []).map((r) => r.playerId))) {
            const first = liveRivals(market.rivalBids, id, currentDate)[0];
            if (!first) continue;
            const seller = allSquadsMarket.find((sq) => sq.id === first.fromClubId);
            const target = seller?.players.find((p) => p.id === id);
            if (!seller || !target) continue;
            const more = await rollRivalFor(saveService, saveId, ds.seatId, {
              market, player: target, seller, humanId: ds.clubId, date: currentDate, windows,
            });
            market = more.market;
            if (more.news) ds.deferred.negotiation.push(more.news);
          }
        }
        await saveService.saveSeatMarket(saveId, ds.seatId, splitMarket(market).seat);
      }
```

  Pontos que ficam como hoje mas por assento:
  - No laço das transferências IA × IA (`for (const tx of completedTransfers)`): `isBuyerPlayer`/`isSellerPlayer` viram
    `const buyerSeat = seatOf.get(tx.buyerSquad.id); const sellerSeat = seatOf.get(tx.sellerSquad.id);` (com a
    exclusão eles são sempre `undefined`, mas o código continua correto se um dia não forem); `executeTransferFee`
    recebe `...(buyerSeat ? { seatId: buyerSeat.seatId } : {})` em cada lado; `settleSellOn(saveService, saveId,
    owed, …)` paga a cláusula ao assento dono dela — `settleSellOn` procura o assento pelo `owed.clubId`
    (`await service.seatOfClub(saveId, owed.clubId)`), e o `marketAfterSellOnPaid` passa a valer no mercado daquele
    assento; os recordes do clube (`recordTransferHistory`) vão para `seatOf.get(c.squadId)?.deferred.clubRecords`;
    as mensagens `buildTransferInMessage`/`buildTransferOutMessage` saem com `emitInboxMessage(…, buyerSeat.seatId)`
    / `(…, sellerSeat.seatId)` e a diretoria do vendedor é `sellerSeat.board`.
  - `freeAgentTick` com `excludeSquadIds: humanClubs` (Tarefa 14).
  - Inscrição da IA: `refreshAiRegistrations(regCtx, regSquads)` já pula os clubes de assento (Tarefa 11).
  - Notícias da janela (`// ── Transfer windows: news for the human club's country`): laço por assento ativo com
    `windows.seat(ds.seatId).today`, `.on(addDays(currentDate, -1))` e `.country`, enfileirando em
    `ds.deferred.negotiation`.

- [ ] **Passo 3: grep da RD** —
  `grep -nE "negotiationNews|moraleBids\b|resolvedPlayerSquadId|playerSquadForMarket|marketAfterTick|isBuyerPlayer|isSellerPlayer|workingMeta" src/backend/advanceDay.ts`
  → nenhuma linha fora de `ds.` (o `workingMeta` some: `executeTransferFee` devolve a meta que recebeu e o dia não
  precisa dela; passe `ds?.meta ?? (world as SeatMeta)` só se o helper exigir — prefira tirar o parâmetro `meta` de
  `executeTransferFee` e passar `date: currentDate`, ajustando os chamadores das rotas).

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src
git commit -m "feat(seats): mercado e negociação do dia por assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 18: Virada por país com N assentos

**Files:**
- Modify: `src/Domain/season/seasonTransition.ts` (`SeasonTransitionInput`, `runSeasonTransition`,
  `applyPlayerBroadcastingCredit`)
- Modify: `src/Domain/season/countryRollover.ts` (novo `clubRolloverOutcome`)
- Modify: `src/Domain/retirement/retirement.ts` (`processRetirements`)
- Modify: `src/backend/awardsWorld.ts` (`recordLeagueAwards`, `runWorldCeremony`)
- Modify: `src/backend/clubHistoryWorld.ts` (`recordLeagueSeasonHistory`)
- Modify: `src/backend/advanceDay.ts` (bloco `// ── Season rollover, per country` ~l.1858–2440, mais
  `queueQualificationMessage` ~l.2450 e o reagendamento de folgas ~l.2560)
- Modify: testes de `seasonTransition`, `countryRollover`, `retirement`, `awards*` que chamam essas funções

- [ ] **Passo 1: escrever os testes que falham**

  Em `src/Domain/season/seasonTransition.test.ts` (crie o bloco se não houver um parecido):

```ts
import { applyHumanBroadcastingCredit } from "@/Domain/season/seasonTransition";

  test("every human club gets its own broadcasting credit on the reset squad", () => {
    const refs = [
      { squadId: "a", squad: { id: "a", finances: { broadcasting: 0, commercial: 0, total: 0, budget: 10, followers: 0 } } },
      { squadId: "b", squad: { id: "b", finances: { broadcasting: 0, commercial: 0, total: 0, budget: 20, followers: 0 } } },
      { squadId: "c", squad: { id: "c", finances: { broadcasting: 0, commercial: 0, total: 0, budget: 30, followers: 0 } } },
    ] as never;
    const out = applyHumanBroadcastingCredit(refs, { a: 5, b: 7 });
    expect(out.map((r: { squad: { finances: { budget: number } } }) => r.squad.finances.budget)).toEqual([15, 27, 30]);
  });
```

  Em `src/Domain/season/countryRollover.test.ts`:

```ts
import { clubRolloverOutcome } from "@/Domain/season/countryRollover";

  test("a club's move and title out of a planned unit", () => {
    const unit = { country: "X", leagues: ["a1", "a2"], pyramid: null, partial: false } as never;
    const standings = {
      a1: [{ squadId: "c1", mp: 3 }, { squadId: "c2", mp: 3 }],
      a2: [{ squadId: "c3", mp: 0 }],
    } as never;
    const moves = [{ squadId: "c2", from: "a1", to: "a2", kind: "relegated" }] as never;
    expect(clubRolloverOutcome(unit, standings, moves, "c1")).toEqual({ move: null, championOf: "a1" });
    expect(clubRolloverOutcome(unit, standings, moves, "c2").move).toMatchObject({ squadId: "c2", kind: "relegated" });
    // a table nobody played does not crown anyone
    expect(clubRolloverOutcome(unit, standings, moves, "c3").championOf).toBeNull();
  });
```

  (Confira os campos de `RolloverUnit` em `countryRollover.ts` e use os nomes reais no literal.)

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/season` → FAIL.

- [ ] **Passo 3: implementar os helpers puros**

  `seasonTransition.ts`: `SeasonTransitionInput.playerClubSquadId: string` → `humanClubIds: ReadonlySet<string>`;
  `SeasonTransitionResult.playerBroadcastingCredit: number` → `humanBroadcastingCredit: Record<string, number>`; em
  `runSeasonTransition`:

```ts
  const humanBroadcastingCredit: Record<string, number> = {};
  const squadsToSave: SquadSaveRef[] = [];
  for (const s of squadsInLeague) {
    const isHuman = humanClubIds.has(s.id);
    const { squad: updated, playerBroadcasting } = resetSquadForNewSeason(s, isHuman);
    if (isHuman && playerBroadcasting > 0) humanBroadcastingCredit[s.id] = playerBroadcasting;
    squadsToSave.push({ squadId: s.id, squad: updated });
  }
  return { archive, squadsToSave, humanBroadcastingCredit };
```

  e troque `applyPlayerBroadcastingCredit` por:

```ts
/**
 * Credit each human club's annual broadcasting to its budget on the RESET squad the transition produced, so the
 * new-season write carries both the reset roster and the credit. Pure.
 */
export function applyHumanBroadcastingCredit(
  squadsToSave: SquadSaveRef[],
  credits: Readonly<Record<string, number>>,
): SquadSaveRef[] {
  return squadsToSave.map((ref) => {
    const credit = credits[ref.squad.id] ?? 0;
    if (credit <= 0) return ref;
    const fin = ref.squad.finances ?? { broadcasting: 0, commercial: 0, total: 0, budget: 0, followers: 0 };
    return { ...ref, squad: { ...ref.squad, finances: { ...fin, budget: (fin.budget ?? 0) + credit } } };
  });
}
```

  `countryRollover.ts`, depois de `planCountryRollover`:

```ts
/** A club's promotion/relegation and league title out of a unit's plan (one per seat at the rollover). */
export function clubRolloverOutcome(
  unit: RolloverUnit,
  standings: Record<string, StandingRow[]>,
  moves: ClubMove[],
  squadId: string,
): { move: ClubMove | null; championOf: string | null } {
  return {
    move: moves.find((m) => m.squadId === squadId) ?? null,
    championOf: unit.leagues.find((slug) => {
      const top = standings[slug]?.[0];
      return top?.squadId === squadId && (top.mp ?? 0) > 0;
    }) ?? null,
  };
}
```

  `retirement.ts` (`processRetirements`): `humanSquadId: string | null` → `humanSeats: ReadonlyMap<string, string>`
  (clube → assento) e `const seatId = humanSeats.get(sq.id); const isHuman = seatId !== undefined;`. O registro de
  classe mundial de um clube humano ganha `rebornOffer: "pending"` **e** `rebornSeatId: seatId` (campo novo
  `RetiredPlayer.rebornSeatId?: string` em `playerTypes.ts`). `humanRetired` continua uma lista (cada registro tem
  `squadId`; o dia reparte por assento). Em `retirement.test.ts`: `humanSquadId: "s1"` →
  `humanSeats: new Map([["s1", "seat-1"]])`, `humanSquadId: null` → `humanSeats: new Map()`, e o teste do renascido
  confere `expect(rec.rebornSeatId).toBe("seat-1")`.

  `awardsWorld.ts`: `recordLeagueAwards({ …, humanClubIds: ReadonlySet<string> })` (no lugar de `playerClubId`) —
  o `afterAward` vale para todo clube humano da liga, e o retorno troca `message?` por
  `messages: Record<string, AwardsInboxMessage>` (uma mensagem por clube humano da liga, com `myClubId` dele);
  `runWorldCeremony(…, { …, humanClubIds })` aplica o `afterAward` a cada clube humano e devolve a mesma mensagem
  (o dia a envia a todo assento ativo). `clubHistoryWorld.ts`: `recordLeagueSeasonHistory({ …, watchSquadIds:
  ReadonlySet<string> })` devolve `Record<string, ClubRecordBroken[]>` (recordes batidos por clube vigiado).

- [ ] **Passo 4: converter o bloco da virada pela RD**:
  - `const playerClubSquadId = playerSquadId ?? meta.clubId;` sai; use `humanClubs`.
  - `planCountryRollover(unit, standings, undefined)` e, para cada assento cujo clube está na unidade
    (`unit.leagues.includes(index.byId(ds.clubId)?.leagueSlug ?? "")`, lido **antes** dos movimentos), guarde
    `clubRolloverOutcome(unit, standings, plan.moves, ds.clubId)` em `ds.rollover.move`/`.championOf`.
  - `runSeasonTransition({ …, humanClubIds: humanClubs })`; `applyHumanBroadcastingCredit(transition.squadsToSave,
    transition.humanBroadcastingCredit)`; o laço `for (const { squad } of refs)`: o ramo
    `if (squad.id !== playerClubSquadId)` vira `const ds = seatOf.get(squad.id); if (!ds) { …IA… } else { …humano com ds… }`
    (seguidores, `ds.board`, `ds.rollover.objectiveMet`, bônus da diretoria em `ds.rollover.boardBonusEntry`,
    prêmio em `ds.rollover.leaguePrize`, `ds.rollover.followersChange`); o lançamento de TV/prêmio/bônus da temporada
    nova vai para `appendLedger(saveId, closedYear.get(slug)! + 1, newSeasonEntries, ds.seatId)` usando
    `transition.humanBroadcastingCredit[squad.id]`.
  - `awardTargets`: as metas de todos os assentos da liga (`for (const ds of daySeats) if (ds.board?.objective?.leagueSlug === slug && ds.clubId) awardTargets.set(ds.clubId, ds.board.objective.target);`).
  - `recordLeagueAwards({ …, humanClubIds: humanClubs })` e
    `for (const [clubId, msg] of Object.entries(res.messages)) seatOf.get(clubId)?.deferred.awards.push(msg);`.
  - `recordLeagueSeasonHistory({ …, watchSquadIds: humanClubs })` e
    `for (const [clubId, broken] of Object.entries(records)) seatOf.get(clubId)?.deferred.clubRecords.push(...broken);`.
  - Empréstimos (7a), aposentadoria (7b), pré-contratos (8a), contratos (8), base (9): `returnDueLoans`,
    `applyDuePreContracts` por assento (cada um com o seu mercado); `processRetirements({ …, humanSeats: seatIdByClub })` (com `seatIdByClub = new Map(daySeats.filter((d) => d.clubId).map((d) => [d.clubId!, d.seatId]))`);
    `expireOffers` só se um assento da unidade (a Tarefa 25 torna isso por assento); as mensagens
    `res.humanRetired` vão para `seatOf.get(r.squadId)?.deferred.retirement`; `isHuman = humanClubs.has(sq.id)` nos
    contratos/reposição/base, e o que hoje grava a tática/lista de venda/mensagens do humano usa o assento do
    clube (`const ds = seatOf.get(sq.id)!`).
  - O fim da unidade (`if (unit.leagues.includes(meta.leagueSlug)) { seasonEnded = true; … }`) vira um laço:
    para cada assento com `unit.leagues.includes(ds.meta.leagueSlug)`, `ds.rollover.seasonEnded = true`, a meta nova
    da diretoria do clube do assento, `ds.rollover.archiveYear`, `ds.rollover.moves = plan.moves` e as mensagens de
    temporada em `ds.deferred.season`.
  - `queueQualificationMessage` (continentais regeneradas): para cada assento ativo,
    `continentalQualificationOf(ds.clubId, result)` → `ds.deferred.continental`.
  - Folgas remarcadas (`// The human club's seeded rest days … follow its rescheduled games`): fica por assento,
    mas a fonte passa a ser o assento na Tarefa 21; aqui troque `playerSquadId`/`meta.leagueSlug` pelo assento num
    laço e mantenha a escrita em `updatedActiveLeagues` (é a Tarefa 21 que move a folga).
  - **Caixa e transferências na virada**, até as Tarefas 20 e 26: troque o `if (seasonEnded) { writeTransfers([]); clearInbox(); … }`
    por `for (const ds of daySeats) if (ds.rollover.seasonEnded) { … }` com `clearInbox(saveId, ds.seatId)` e as
    mensagens desse assento; `writeTransfers([])` roda uma vez se algum assento virou (a Tarefa 26 tira isso).

- [ ] **Passo 5: rodar e ver passar** — `bun test src/Domain/season src/Domain/retirement src/backend/awards.rollover.test.ts src/backend/managers.rollover.test.ts src/backend/contracts.rollover.test.ts src/backend/clubHistory.routes.test.ts` → PASS.

  Grep: `grep -nE "playerClubSquadId|seasonEnded\b|archiveYear\b|playerCountryMoves|playerMove\b|playerChampionOf|playerObjectiveMet|playerFollowersChange|playerLeaguePrizeThisRollover|playerBoardBonusEntry|boardAtSeasonEnd|seasonMessages" src/backend/advanceDay.ts`
  → só dentro de `ds.rollover.`/`ds.deferred.` e nas chaves da resposta (`seasonEnded: true`).

- [ ] **Passo 6: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 7: commit**

```bash
git add src
git commit -m "feat(seats): virada por país com N assentos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 19: Demissão, propostas de emprego e contrato do técnico por assento

**Files:**
- Modify: `src/backend/advanceDay.ts` (da demissão, ~l.2614, até o fim de `// ── The manager's contract`, ~l.2743)
- Modify: `src/backend/jobWorld.ts` (`generateJobOffers`: `humanSquadId` passa a ser do assento; o conjunto de clubes
  humanos sai das ofertas)

- [ ] **Passo 1: teste que falha** — acrescente ao `describe` de `src/backend/jobs.test.ts` (o `create` e o
  `addDays` já existem no arquivo; importe `generateJobOffers` de `@/backend/jobWorld`):

```ts
  test("job offers never come from a club with a seat", async () => {
    const meta = await create();
    const index = await saveService.getSquadIndex(meta.id);
    const world = (await saveService.getWorldMeta(meta.id))!;
    // the seat's club and every other club of its league stand for "clubs with a seat"
    const excluded = new Set([meta.clubId, ...index.inLeague("premier_league").map((t) => t.squadId)]);
    const offers = await generateJobOffers(saveService, meta.id, {
      window: "unemployed", date: meta.currentDate!, expires: addDays(meta.currentDate!, 14),
      managers: await saveService.getManagers(meta.id), board: 90, humanSquadId: null,
      unemployed: { lastClubId: meta.clubId, since: meta.currentDate! },
      activeLeagues: world.activeLeagues ?? [], index, excludeClubs: excluded,
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => !excluded.has(o.squadId))).toBe(true);
  }, 300_000);
```

  Run: `bun test src/backend/jobs.test.ts` → FAIL (`excludeClubs` não existe no `OfferRequest`).

  As demais mudanças desta tarefa são refactor do dia: a trava do solo são os testes existentes
  (`jobs.test.ts`, `board.advanceDay.test.ts`, `windows.routes.test.ts`) e a de dois assentos, a Tarefa 31.

- [ ] **Passo 2: implementar** — `OfferRequest` ganha `excludeClubs?: ReadonlySet<string>` (os clubes com assento:
  nenhum clube humano oferece emprego); em `generateJobOffers`, `const exclude = new Set([fromId]);` vira
  `const exclude = new Set([fromId, ...(req.excludeClubs ?? [])]);` (vale também para a oferta garantida, que já filtra
  por `exclude`). No dia:
  - Demissão: `if (ds.job.ended && ds.board && ds.clubId) { … }` por assento — `severancePay` com `ds.job.contract`,
    `recordMoney(…, ds.seatId)`, `releaseHumanClub(saveService, saveId, ds.seatId, { squadId: ds.clubId, date })`,
    `managerTracker.apply((ms) => sackHumanManager(ms, { … }))` (a Tarefa 23 põe o `seatId` aqui),
    `aiDesk?.openVacancy(ds.clubId)`, `ds.job.unemployed = { … }`.
  - Propostas: laço por assento com `ds.job.*`, `excludeClubs: humanClubs` em toda chamada de `generateJobOffers`,
    `humanSquadId: ds.clubId`.
  - Contrato do técnico: laço por assento com `ds.job.contract`, `ds.job.renewal`, `ds.job.notices`,
    `ds.boardMessages`.
  - Patch por assento (no bloco do fim): `jobOffers`, `jobsMidSeason`, `unemployed`, `managerRenewal`,
    `managerContract`, `managerContractNotices` e, com `ds.job.ended`, o que hoje o `if (ended) { metaPatch… }` limpa
    (`clubId: ""`, `board`, `press`, `rotationOverride`, `youthCallUps`, `youthCallUpsSkipped`, os três do contrato).
  - A liga do assento segue o clube (`const playerHome = index.byId(meta.clubId)?.leagueSlug; …`): por assento, em
    `ds.patch.leagueSlug`/`leagueName`/`followedLeagues`.

- [ ] **Passo 3: grep da RD** —
  `grep -nE "\b(ended|unemployed|jobOffers|offersBefore|keptOffers|newOffers|jobsMidSeason|managerRenewal|managerContractNotices|contract)\b" src/backend/advanceDay.ts | grep -v "ds\.job\." | grep -v "^\s*//"`
  → só chaves de objeto e a rota.

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src
git commit -m "feat(seats): demissão, propostas e contrato do técnico por assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 20: Mensagens adiadas, caixa, patch e resposta por assento

**Files:**
- Modify: `src/backend/advanceDay.ts` (do `// Transfers + inbox are cleared` ~l.2857 até o `return` final;
  `AdvanceDayOutcome`, `runBufferedDay`, rotas `advance-day`)
- Modify: `src/backend/advanceUntil.ts` (`runDay`)
- Create: `src/backend/advanceDay.payload.test.ts`

- [ ] **Passo 1: teste que falha** — `src/backend/advanceDay.payload.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { payloadForSeat } from "@/backend/advanceDay";

describe("day payload per seat", () => {
  test("world payload + the seat's part; another seat's part is not mixed in", () => {
    const outcome = {
      ok: true as const,
      payload: { newDate: "2027-03-02", events: [] },
      seats: { a: { seasonEnded: true, archiveYear: 2026 }, b: { sacked: true } },
    };
    expect(payloadForSeat(outcome, "a")).toEqual({ newDate: "2027-03-02", events: [], seasonEnded: true, archiveYear: 2026 });
    expect(payloadForSeat(outcome, "b")).toEqual({ newDate: "2027-03-02", events: [], sacked: true });
    expect(payloadForSeat(outcome, "z")).toEqual({ newDate: "2027-03-02", events: [] });
  });
});
```

  Run: `bun test src/backend/advanceDay.payload.test.ts` → FAIL.

- [ ] **Passo 2: implementar**

```ts
export type AdvanceDayOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; payload: Record<string, unknown>; seats: Record<string, Record<string, unknown>> };

/** The response of a day for one seat: the world's part plus that seat's (season end, sacking, offers…). */
export function payloadForSeat(
  outcome: { payload: Record<string, unknown>; seats: Record<string, Record<string, unknown>> },
  seatId: string,
): Record<string, unknown> {
  return { ...outcome.payload, ...(outcome.seats[seatId] ?? {}) };
}
```

  No corpo:
  - O bloco "Transfers + inbox are cleared" e todas as emissões que vêm depois dele viram um laço
    `for (const ds of daySeats) { … }` na ordem de hoje: `if (ds.rollover.seasonEnded) await saveService.clearInbox(saveId, ds.seatId)`,
    as mensagens de temporada (`ds.deferred.season`), o convite pendente de imprensa do assento, `ds.deferred.continental`,
    os jogos remarcados do clube do assento (`rescheduledGamesOf(rescheduleMoves, ds.clubId, …)`),
    `ds.deferred.negativeBalance`, injúrias — `ds.deferred.injury` é montado aqui a partir de `injuryInboxEvents`
    filtrando `inj.squadId === ds.clubId` (substitui o bloco `if (playerSquadId) { for (const inj of injuryInboxEvents) … }`),
    contratos (`ds.deferred.contract`; o aviso de 90 dias é calculado por assento com
    `directorHandlesContracts(ds.meta.responsibilities)`), comissão (`ds.staffNews`), o resumo do diretor, base,
    seleção (até a Tarefa 24, `nationalDay.news`/`coachNews` vão para o `solo`), inscrição
    (`ds.registrationNotices`), instalações, aposentadoria, olheiros (`ds.scouting?.messages`), negociação,
    moral, as conversas reabertas depois da limpeza (`if (ds.rollover.seasonEnded && ds.clubId && !ds.job.ended)`),
    as propostas pendentes (`liveBids` do mercado do assento), diretoria (`ds.boardMessages`), banimento,
    ofertas mantidas e novas, recordes (`ds.deferred.clubRecords`), prêmios (`ds.deferred.awards` + a mensagem
    mundial `msg` para todo assento ativo), o convite de imprensa, as conquistas
    (`achievementsDay(saveService, saveId, ds.seatId, { … clubId: ds.clubId ?? "", rollover: ds.rollover.seasonEnded ? { championOf: ds.rollover.championOf, moves: ds.rollover.moves, objectiveMet: ds.rollover.objectiveMet } : undefined, sacked: !!ds.job.ended && ds.job.ended.reason !== "contract", leftClub: !!ds.job.ended })`,
    contando `ds.achievementsUnlocked`) e as notícias de técnicos da liga do assento
    (`(aiDesk?.worldNews() ?? []).filter((i) => index.byId(i.squadId)?.leagueSlug === ds.meta.leagueSlug)`).
  - `collectDayNews` recebe os assentos (Tarefa 27); até lá, passe `meta` do `solo`.
  - Patch: cada `ds.patch` é gravado com `updateSeat(saveId, ds.seatId, ds.patch)` quando não está vazio; o
    `metaPatch` restante só tem chaves do mundo (`freeAgentsRetiredYear`, `pendingTitles`, `managerWeights`,
    `managerVacancies`) — tire o `splitSeatPatch` da Tarefa 13 e grave `metaPatch` direto no `updateMeta`.
    `matchMarking` é limpo em todo assento que tinha uma (`ds.patch.matchMarking = undefined`).
  - Resposta:

```ts
    const seats: Record<string, Record<string, unknown>> = {};
    for (const ds of daySeats) {
      seats[ds.seatId] = {
        ...(ds.rollover.seasonEnded
          ? { seasonEnded: true as const, archiveYear: ds.rollover.archiveYear, moves: ds.rollover.moves, playerMove: ds.rollover.move, playerChampionOf: ds.rollover.championOf }
          : {}),
        ...(ds.job.ended ? { sacked: true as const } : {}),
        ...(ds.job.newOffers.length > 0 ? { jobOffers: ds.job.newOffers.length } : {}),
        ...(ds.achievementsUnlocked > 0 ? { achievements: ds.achievementsUnlocked } : {}),
        ...(ds.pressOut.invite ? { pressInvite: true as const } : {}),
      };
    }
    return {
      ok: true,
      payload: { ...dayLog, events: [...dayLog.events, ...transferEvents], newDate: updatedMeta.currentDate },
      seats,
    };
```

    (As ofertas de seleção somam em `jobOffers` do assento na Tarefa 24.)
  - Rota `/api/advance-day/:saveId`: `return Response.json(payloadForSeat(outcome, auth.seatId));`.
  - `advanceUntil.ts`: `runDay: async () => { const o = await runBufferedDay(saveId); return o.ok ? { ok: true as const, payload: payloadForSeat(o, auth.seatId) } : o; }`
    (o tipo de `runAdvanceBatch` continua recebendo `{ ok, payload }`; ajuste o tipo do `runDay` se ele exigir
    `AdvanceDayOutcome`).
  - `scripts/bench-advance-day.ts`, `scripts/season-rollover-smoke.ts` e testes que leem `outcome.payload.seasonEnded`
    (ou `sacked`, `jobOffers`…) passam a ler `payloadForSeat(outcome, meta.seatId)`.

- [ ] **Passo 3: rodar e ver passar** — `bun test src/backend/advanceDay.payload.test.ts src/backend/advanceUntil.test.ts src/backend/jobs.test.ts src/backend/board.advanceDay.test.ts` → PASS.

  Grep: `grep -nE "deferredInjuryMessages|deferredContractMessages|deferredYouthMessages|facilityMessages|deferredRetirementMessages|clubRecordMessages|deferredAwardsMessages|continentalMessages|negativeBalanceMessage|metaPatch\.(board|press|jobOffers|unemployed|managerContract|clubId)" src/backend/advanceDay.ts`
  → nenhuma linha.

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src scripts
git commit -m "feat(seats): caixa, mensagens, patch e resposta do dia por assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 21: Folga do assento no assento; a IA folga pela própria agenda

**Files:**
- Create: `src/Domain/advanceDay/aiRest.ts`, `src/Domain/advanceDay/aiRest.test.ts`
- Modify: `src/types/calendarTypes.ts` (`LeagueSeasonState.restDays` sai, ~l.180; `SeasonData.restDays` fica — é da resposta)
- Modify: `src/backend/SaveService.ts` (`createSave`: o assento recebe `restDays`; `activeLeagues.push` sem
  `restDays`; novo `getClubsWithFixtureOn`)
- Modify: `src/backend/advanceDay.ts` (treino/descanso ~l.866–906; virada: `restDays: cal.meta.restDays` e o resync;
  folgas remarcadas ~l.2560; rota `day-type/:date`)
- Modify: `src/backend/reschedulingWorld.ts` (`syncPlayerRestDays`, `playerRestDaysAfterMoves`)
- Modify: `src/backend/saves.ts` (`season.restDays` do assento)
- Modify: `src/backend/startKits.ts` (folga de cada assento depois do kit)

- [ ] **Passo 1: escrever o teste que falha** — `src/Domain/advanceDay/aiRest.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { aiRestingClubs } from "@/Domain/advanceDay/aiRest";

describe("AI clubs rest by their own calendar", () => {
  test("a club rests the day after and the day before its own official match, never on a match day", () => {
    const yesterday = new Set(["a", "b"]);
    const tomorrow = new Set(["c", "b"]);
    const today = new Set(["b", "d"]);
    const rest = aiRestingClubs({ playedYesterday: yesterday, playsTomorrow: tomorrow, playsToday: today });
    expect([...rest].sort()).toEqual(["a", "c"]);
  });

  test("no match around the day: nobody rests", () => {
    expect(aiRestingClubs({ playedYesterday: new Set(), playsTomorrow: new Set(), playsToday: new Set(["x"]) }).size).toBe(0);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/advanceDay/aiRest.test.ts` → FAIL.

- [ ] **Passo 3: implementar**

  `src/Domain/advanceDay/aiRest.ts`:

```ts
/**
 * AI clubs rest by their own calendar (`.claude/rules/game/multiplayer.md`): the day before and the day after each
 * of their official matches, unless they play that day. Before seats every club rested on the human league's
 * seeded rest days. Seats rest on their own `restDays`.
 */
export function aiRestingClubs(args: {
  playedYesterday: ReadonlySet<string>;
  playsTomorrow: ReadonlySet<string>;
  playsToday: ReadonlySet<string>;
}): Set<string> {
  const out = new Set<string>();
  for (const id of [...args.playedYesterday, ...args.playsTomorrow]) {
    if (!args.playsToday.has(id)) out.add(id);
  }
  return out;
}
```

  `SaveService.ts`, novo método (perto de `getFixturesForDate`):

```ts
  /** Clubs with an official (non-youth) fixture on `date`, played or not. */
  async getClubsWithFixtureOn(saveId: string, date: string): Promise<Set<string>> {
    const activeRounds = await this.getActiveRoundsForDate(saveId, date);
    const out = new Set<string>();
    await Promise.all(
      Array.from(activeRounds.entries()).map(async ([slug, rounds]) => {
        const roundData = await Promise.all(rounds.map((r) => this.dal.readRound(saveId, slug, r)));
        for (const rd of roundData) {
          for (const f of rd?.fixtures ?? []) if (f.date === date) { out.add(f.home); out.add(f.away); }
        }
      }),
    );
    return out;
  }
```

  No dia, o bloco `// ── Training / rest for non-playing teams in ALL active leagues` troca:

```ts
    const playerLeagueState = activeLeagues.find((l) => l.leagueSlug === meta.leagueSlug);
    const isRestDay = (playerLeagueState?.restDays ?? []).includes(currentDate);
```

  por

```ts
    const aiResting = aiRestingClubs({
      playedYesterday: await saveService.getClubsWithFixtureOn(saveId, addDays(currentDate, -1)),
      playsTomorrow: await saveService.getClubsWithFixtureOn(saveId, nextDate),
      playsToday: teamsPlayingToday,
    });
    const isRestDay = (squadId: string): boolean => {
      const ds = seatOf.get(squadId);
      return ds ? (ds.meta.restDays ?? []).includes(currentDate) : aiResting.has(squadId);
    };
```

  e, dentro do laço, `if (isRestDay)` → `if (isRestDay(row.squadId))`; a política de treino do clube de um assento
  usa a meta do assento:
  `resolveTrainingPolicy({ ...(seatOf.get(row.squadId)?.meta ?? world), style_focus: … }, club, row.squadId)` (para a
  IA, a política padrão — confira em `dailyTraining.ts` que `resolveTrainingPolicy` só usa os campos do humano
  quando o clube é o do jogador e ajuste para receber o assento do clube: `resolveTrainingPolicy(seatMeta | null, club, squadId)`).
  No desgaste das instalações (Tarefa 16), `restToday(ds)` passa a ser `(ds.meta.restDays ?? []).includes(currentDate)`.

  Folga semeada:
  - `createSave`: `seat.restDays = <restDays da liga do jogador>` — guarde `meta.restDays` do calendário da liga do
    jogador no laço que gera os calendários (`if (config.slug === body.leagueSlug) { playerLeagueStart = meta.start; playerLeagueRestDays = meta.restDays ?? []; }`)
    e não ponha mais `restDays` no `activeLeagues.push`.
  - Virada: na unidade, para cada assento que virou, `ds.patch.restDays = cal.meta.restDays ?? []` do calendário novo
    da liga do clube (depois dos movimentos); tire `restDays` dos `updatedActiveLeagues[i] = { … }` (virada e resync).
  - Remarcação: `playerRestDaysAfterMoves({ service, saveId, state: { leagueSlug, restDays: ds.meta.restDays }, clubId, moves })`
    por assento, gravando em `ds.patch.restDays`; `syncPlayerRestDays(service, saveId, seatId, moves)` grava no assento
    (`updateSeat(saveId, seatId, { restDays })`) em vez de `activeLeagues`.
  - `startKits.ts`: depois do kit, para cada assento, `restDays = (await saveService.getLeagueMeta(saveId, seat.leagueSlug))?.restDays ?? []`
    gravado no assento (o kit reescreve as ligas; a folga do assento acompanha).
  - Rota `day-type/:date`:

```ts
    const seat = await saveService.getSeat(saveId!, auth.seatId);
    if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
    const current = new Set(seat.restDays ?? []);
    if (body.type === "rest") current.add(date!);
    else current.delete(date!);
    const restDays = Array.from(current).sort();
    await saveService.updateSeat(saveId!, auth.seatId, { restDays });
    return Response.json({ restDays });
```

  - `saves.ts` (`GET`): `restDays: meta.restDays ?? []` (do assento) no `season`.
  - `calendarTypes.ts`: apague `restDays?: string[];` de `LeagueSeasonState`. Rode o tsc: os erros restantes são os
    pontos acima (e testes que montam `LeagueSeasonState` com `restDays` — tire o campo).

- [ ] **Passo 4: rodar e ver passar** — `bun test src/Domain/advanceDay src/backend/fitness.congestion.test.ts src/backend/facilities.advanceDay.test.ts src/backend/startKits.test.ts` → PASS.

  Grep: `grep -rn "restDays" src/backend src/types --include=*.ts | grep -v "seat\|Seat\|SeasonData\|LeagueSeasonMeta\|\.test\."`
  → só `LeagueSeasonMeta.restDays` (o calendário da liga) e a leitura `cal.meta.restDays`.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "feat(seats): folga do assento no assento; a IA folga pela própria agenda" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 22: `advance-until` pelo assento e fim do `solo` no dia

**Files:**
- Modify: `src/backend/advanceUntil.ts` (`readAdvancePosition`, ~l.177–206; rota)
- Modify: `src/backend/advanceDay.ts` (apagar `solo` e `meta` do corpo de `advanceOneDay`)
- Modify: `src/backend/advanceUntil.test.ts`

- [ ] **Passo 1: teste** — em `src/backend/advanceUntil.test.ts`, as chamadas a `readAdvancePosition(saveId)` passam
  a `readAdvancePosition(saveId, seatId)` (a fake do teste ganha um assento). Acrescente:

```ts
  test("the position follows the seat that asks", async () => {
    // fake service with two seats: seat "a" plays on day 3, seat "b" on day 6 (see the existing fake in this file)
    const posA = await readAdvancePosition(SAVE, "a", fake);
    const posB = await readAdvancePosition(SAVE, "b", fake);
    expect(posA.target).not.toEqual(posB.target);
  });
```

  Monte a fake com dois assentos: `getWorldMeta` devolve `{ …, seats: ["a", "b"] }`, `getSeatMeta(saveId, id)`
  devolve um clube diferente por assento, e os `date-index` têm o jogo do clube de "a" no dia 3 e o de "b" no dia 6.

- [ ] **Passo 2: implementar** — `readAdvancePosition(saveId: string, seatId: string, service = defaultSaveService)`
  lê `getSeatMeta(saveId, seatId)` no lugar de `getMeta`; a rota passa `auth.seatId` em
  `readPosition: () => readAdvancePosition(saveId, auth.seatId)`.

  Em `advanceOneDay`, apague as linhas `const solo = daySeats[0]; if (!solo) …; const meta = solo.meta;` e o que ainda
  depender delas: todo uso restante de `meta.` passa a `world.` (campos do mundo) ou está num laço por assento.
  Única sobra permitida: a chamada de `playNationalDay` (o técnico de seleção ainda é um só) passa a usar
  `daySeats[0]` de forma explícita, com o comentário `// Task 24 makes national coaching per seat`; a Tarefa 24 a
  remove.

- [ ] **Passo 3: grep** —

```bash
grep -nE "\bsolo\b|\bmeta\.(clubId|leagueSlug|board|press|unemployed|jobOffers|managerContract|tactical_style|followedLeagues|youthCallUps|rotationOverride|matchMarking|responsibilities|directorDecisions|manager)\b|playerSquadId|playerEntry" src/backend/advanceDay.ts
```

  Expected: nenhuma linha no corpo de `advanceOneDay` (a única referência a `daySeats[0]` é a da seleção, com o
  comentário).

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src
git commit -m "feat(seats): advance-until pelo assento; o dia sem o assento solo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Fatia 5 — Arquivos do mundo com assentos (`managers.json`, `national/state.json`, `retired.json`, `transfers.json`, notícias) e `addSeat`

### Tarefa 23: `managers.json` — o técnico humano é `seat:<seatId>`

**Files:**
- Modify: `src/types/managerTypes.ts` (`ManagerRecord.isPlayer` → `seatId?`, ~l.34)
- Create: `src/Domain/managers/seatManagers.ts`, `src/Domain/managers/seatManagers.test.ts`
- Modify: `src/Domain/managers/managers.ts` (`buildInitialManagers` ~l.71, `rankingPage` ~l.106)
- Modify: `src/Domain/managers/managerRecords.ts` (`makeInterim`: sem `isPlayer`)
- Modify: `src/Domain/jobs/jobs.ts` (`managerReputation` ~l.69, `moveHumanManager` ~l.298, `sackHumanManager` ~l.324)
- Modify: `src/Domain/managers/aiManagers.ts` (`!m.isPlayer` → `!m.seatId`)
- Modify: `src/Domain/national/nationalCoach.ts` (`takeNationalJob`, `leaveNationalTeam` ~l.200–217)
- Modify: `src/backend/managerWorld.ts`, `src/backend/achievementsWorld.ts`, `src/backend/managerRoutes.ts`,
  `src/backend/matchCrowd.ts`, `src/backend/nationalWorld.ts`, `src/backend/nationalRoutes.ts`,
  `src/backend/jobWorld.ts`, `src/backend/SaveService.ts` (`createSave`), `src/backend/advanceDay.ts`
- Modify: testes de `managers`, `jobs`, `aiManagers`, `nationalCoach`, `achievements` que montam `ManagerRecord`

- [ ] **Passo 1: escrever o teste que falha** — `src/Domain/managers/seatManagers.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { managerOfSeat, placeSeatManager } from "@/Domain/managers/seatManagers";
import { buildInitialManagers, rankingPage } from "@/Domain/managers/managers";
import type { ManagerRecord } from "@/types/managerTypes";

const ai = (id: string, squadId: string, extra: Partial<ManagerRecord> = {}): ManagerRecord =>
  ({ id, name: id, squadId, points: 0, seasons: 0, titles: [], ...extra });

describe("seat managers", () => {
  test("createSave's first seat replaces its club's coach with seat:<id>", () => {
    const ms = buildInitialManagers(
      [{ id: "33", name: "Utd", coach: { id: 7, name: "Old" } }, { id: "40", name: "City", coach: { id: 8, name: "Pep" } }] as never,
      { squadId: "33", name: "Me", seatId: "s1", from: "2026-08-15" },
    );
    expect(ms.find((m) => m.squadId === "33")).toMatchObject({ id: "seat:s1", seatId: "s1", name: "Me" });
    expect(ms.find((m) => m.squadId === "40")?.seatId).toBeUndefined();
    expect(managerOfSeat(ms, "s1")?.id).toBe("seat:s1");
  });

  test("a new seat takes a club: the AI coach goes free, an empty interim disappears", () => {
    const ms = [ai("coach_8", "40", { points: 30 }), ai("interim_41", "41", { interim: true }), ai("seat:s1", "33", { seatId: "s1" })];
    const a = placeSeatManager(ms, { seatId: "s2", name: "Friend", squadId: "40", date: "2027-01-10" });
    expect(a.find((m) => m.squadId === "40")).toMatchObject({ id: "seat:s2", seatId: "s2" });
    const freed = a.find((m) => m.id === "coach_8")!;
    expect(freed.squadId).toBe("");
    expect(freed.freeSince).toBe("2027-01-10");
    const b = placeSeatManager(ms, { seatId: "s3", name: "Other", squadId: "41", date: "2027-01-10" });
    expect(b.some((m) => m.id === "interim_41")).toBe(false);
    expect(() => placeSeatManager(ms, { seatId: "s1", name: "Again", squadId: "40", date: "2027-01-10" })).toThrow();
  });

  test("the ranking's own rank is the asking seat's", () => {
    const ms = [ai("a", "1", { points: 50 }), ai("seat:s1", "2", { seatId: "s1", points: 40 }), ai("seat:s2", "3", { seatId: "s2", points: 60 })];
    expect(rankingPage([...ms].sort((x, y) => y.points - x.points), () => true, 0, 10, "s1").playerRank).toBe(3);
    expect(rankingPage([...ms].sort((x, y) => y.points - x.points), () => true, 0, 10, "s2").playerRank).toBe(1);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/managers/seatManagers.test.ts` → FAIL.

- [ ] **Passo 3: implementar**

  `managerTypes.ts`: troque `isPlayer: boolean;` por

```ts
  /** The seat of a human manager (`.claude/rules/game/multiplayer.md`); his id is `seat:<seatId>`. Absent = AI. */
  seatId?: string;
```

  `src/Domain/managers/seatManagers.ts`:

```ts
import type { ManagerRecord } from "@/types/managerTypes";
import { seatManagerId } from "@/Domain/seats/seats";
import { toFree } from "@/Domain/managers/managerRecords";

/** The record of a seat's manager. */
export function managerOfSeat(managers: readonly ManagerRecord[], seatId: string): ManagerRecord | null {
  return managers.find((m) => m.seatId === seatId) ?? null;
}

/**
 * A new seat takes `squadId` (`addSeat`): the club's AI manager goes to the free pool (`left: "moved"`), an
 * interim without points or titles just disappears, and the seat's manager starts his first passage. Throws when
 * the seat already has a manager (one record per seat).
 */
export function placeSeatManager(
  managers: ManagerRecord[],
  args: { seatId: string; name: string; squadId: string; date: string },
): ManagerRecord[] {
  if (managerOfSeat(managers, args.seatId)) throw new Error(`placeSeatManager: seat ${args.seatId} already has a manager`);
  const out: ManagerRecord[] = [];
  for (const m of managers) {
    if (!m.seatId && m.squadId === args.squadId) {
      if (!(m.interim && m.points === 0 && m.titles.length === 0)) out.push(toFree(m, args.date, m.interim ? "interim" : "moved"));
      continue;
    }
    out.push(m);
  }
  out.push({
    id: seatManagerId(args.seatId), seatId: args.seatId, name: args.name, squadId: args.squadId,
    points: 0, seasons: 0, titles: [], clubs: [{ squadId: args.squadId, from: args.date }],
  });
  return out;
}
```

  `managers.ts`:
  - `buildInitialManagers(squads, player: { squadId: string; name: string; seatId: string; from?: string } | null, from?)`:
    o registro humano vira
    `{ id: seatManagerId(player.seatId), seatId: player.seatId, name: player.name, squadId: s.id, points: 0, seasons: 0, titles: [], ...clubs }`
    e `used.add(seatManagerId(player.seatId))`; os da IA perdem `isPlayer: false`.
  - `rankingPage(ranked, inScope, offset, limit, seatId?: string)`: `const p = seatId ? scoped.findIndex((m) => m.seatId === seatId) : -1;`.
  - `createSave` passa `seatId` no objeto do jogador.

  Regra para os demais usos (`grep -rn "isPlayer" src --include=*.ts`):
  - **"é um humano"** (exclusão da IA, pool de livres, revisão, contratação, aposentadoria): `m.isPlayer` → `!!m.seatId`,
    `!m.isPlayer` → `!m.seatId`. Arquivos: `aiManagers.ts`, `managerWorld.ts`, `nationalWorld.ts`, `matchCrowd.ts`
    (`!m.isPlayer` no adversário).
  - **"sou eu"** (o técnico de um assento): a função ganha `seatId: string` e usa `m.seatId === seatId`:
    `managerReputation(managers, board, year, seatId)`; `moveHumanManager(managers, { seatId, toSquadId, fromSquadId, fromClubName, date })`;
    `sackHumanManager(managers, { seatId, date, clubName, left })`; `takeNationalJob(managers, { seatId, teamId, date })`
    e `leaveNationalTeam(managers, { seatId, … })` em `nationalCoach.ts`; em `achievementsWorld.ts` o técnico do
    assento (`managers.find((m) => m.seatId === seatId)` e o rank `ranked.findIndex((m) => m.seatId === seatId)`).
    Chamadores: o dia passa `ds.seatId`; as rotas, `auth.seatId`; `generateJobOffers` recebe `seatId` no `OfferRequest`
    (campo novo, obrigatório) e o repassa a `managerReputation`.
  - **`matchCrowd.ts`**: `mine: { id: seatManagerId(seatId), … }` (a função recebe `seatId`).
  - **`managerRoutes.ts`**: o item da resposta mantém o campo `isPlayer` para o frontend, calculado
    `isPlayer: m.seatId === auth.seatId`; o filtro `free` usa `!m.seatId`; `rankingPage(…, auth.seatId)`.
  - **`nationalRoutes.ts`** (`manager: { …, isPlayer: manager.isPlayer }`): `isPlayer: manager.seatId === auth.seatId`.
  - **`nationalCoachWorld.ts:60`**: `managerId: "player"` → `managerId: seatManagerId(seatId)` (a função ganha
    `seatId`; a Tarefa 24 completa a seleção por assento).
  - Testes: literais de `ManagerRecord` perdem `isPlayer: false` e trocam `isPlayer: true, id: "player"` por
    `seatId: "s1", id: "seat:s1"`; chamadas às funções acima ganham o `seatId`.

- [ ] **Passo 4: rodar e ver passar** — `bun test src/Domain/managers src/Domain/jobs src/Domain/national src/backend/managers.routes.test.ts src/backend/managers.rollover.test.ts src/backend/managers.market.test.ts src/backend/jobs.test.ts src/backend/achievements.test.ts` → PASS.

  Grep: `grep -rnE "isPlayer\b|\"player\"" src/backend src/Domain src/types --include=*.ts | grep -v "kind\|topic\|target\|player:\|isPlayer:"`
  → nenhuma linha (os `isPlayer:` restantes são o campo da resposta das rotas, calculado pelo assento).

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "feat(seats): técnico humano seat:<seatId> no managers.json" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 24: Seleção do técnico por assento (`national/state.json`)

**Files:**
- Modify: `src/types/nationalTypes.ts` (`NationalState.offers`, `human`, ~l.69–72)
- Modify: `src/backend/nationalWorld.ts` (`playNationalDay` ~l.334–670, `offerCoachJob` ~l.830–855, saída do técnico ~l.860–870, ~l.712)
- Modify: `src/backend/nationalCoachWorld.ts` (todas as funções exportadas)
- Modify: `src/backend/nationalRoutes.ts`, `src/backend/saves.ts` (calendário da seleção), `src/backend/routes.ts`
  (`match-setup` de seleção), `src/backend/advanceUntil.ts` (`nextNationalFixtureDate`), `src/backend/advanceDay.ts`
  (chamada de `playNationalDay`, mensagens, `managerEarned`, conquistas)
- Create: `src/backend/national.seats.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/national.seats.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { answerNationalOffer } from "@/backend/nationalCoachWorld";
import { ensureNationalWorld } from "@/backend/nationalWorld";
import { seatManagerId } from "@/Domain/seats/seats";

describe("national coaching per seat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("accepting an offer gives the team to that seat and closes the team's offers to every seat", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ensureNationalWorld({ service: saveService, saveId: meta.id, today: meta.currentDate!, index: await saveService.getSquadIndex(meta.id) });
    const state = (await saveService.getNationalState(meta.id))!;
    const teamId = Object.keys(state.teams)[0]!;
    const date = meta.currentDate!;
    const offer = (id: string) => ({ id, teamId, nation: state.teams[teamId]!.nation, date, expires: date, prestige: 0.5, rank: 10, wage: 20_000 });
    await saveService.writeNationalState(meta.id, {
      ...state,
      vacancies: { ...state.vacancies, [teamId]: { since: date, hireOn: date } as never },
      offers: { [meta.seatId]: [offer("o1")], "seat-other": [offer("o2")] },
    });

    const r = await answerNationalOffer(saveService, meta.id, meta.seatId, "o1", true, date);
    expect(r.ok).toBe(true);
    const after = (await saveService.getNationalState(meta.id))!;
    expect(after.human?.[meta.seatId]?.teamId).toBe(teamId);
    expect(after.teams[teamId]!.managerId).toBe(seatManagerId(meta.seatId));
    expect(after.offers?.[meta.seatId] ?? []).toEqual([]);
    // the team is gone: the other seat's offer for it closes too
    expect(after.offers?.["seat-other"] ?? []).toEqual([]);
    const me = (await saveService.getManagers(meta.id)).find((m) => m.seatId === meta.seatId)!;
    expect(me.national?.at(-1)?.to).toBeUndefined();
  }, 300_000);
});
```

  (Confira em `nationalTypes.ts` o tipo de `NationalVacancy` e monte o literal com os campos reais em vez do
  `as never`, se ele tiver outros obrigatórios.)

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/backend/national.seats.test.ts` → FAIL (tipo de `offers`/assinatura).

- [ ] **Passo 3: implementar**

  `nationalTypes.ts`:

```ts
  /** Job offers of national teams to each seat's manager (`.claude/rules/game/national-teams.md` → 41b). */
  offers?: Record<string, NationalCoachOffer[]>;
  /** The national team each seat's manager coaches (41b); a seat without one has no entry. */
  human?: Record<string, NationalHumanCoach>;
```

  `nationalCoachWorld.ts`: toda função exportada ganha `seatId` depois do `saveId` e lê/grava
  `state.human?.[seatId]` / `state.offers?.[seatId]`. Em `answerNationalOffer`, o aceite exige
  `!state.human?.[seatId]` (um assento treina no máximo uma seleção) e grava
  `teams[team.id].managerId = seatManagerId(seatId)`, `human: { ...state.human, [seatId]: { teamId, since, wage, tactics } }`
  e tira a seleção das ofertas de **todos** os assentos:

```ts
  const offers = Object.fromEntries(
    Object.entries(state.offers ?? {}).map(([sid, list]) => [sid, list.filter((o) => o.teamId !== team.id)]),
  );
```

  A recusa só tira a oferta daquele assento. As mensagens saem com `emitInboxMessage(…, service, seatId)`.

  `nationalWorld.ts` (`playNationalDay`): troque `humanClubId: string` e `human?: {…}` e `playedMatch?` por

```ts
  /** The seats' clubs (squad id → seat): their players' call-up news go to that seat. */
  humanClubs: ReadonlyMap<string, string>;
  /** Each active seat's manager (offers when a vacancy opens); absent seat = no offers for it. */
  humans?: Record<string, { reputation: number; nationality: string | null }>;
  /** Today's live recordings of a seat's national game, by seat. */
  playedMatches?: Record<string, PlayedMatchRecording>;
```

  e, em `NationalDayResult`, o que era do humano vira por assento:
  `bySeat: Record<string, { news: NationalNews[]; coachNews: NationalCoachNews[]; earned: number; offers: number; humanMatch?: MatchEvent; humanTeamId?: string; consumedRecording: boolean }>`
  (com os tipos de hoje dos campos `news`, `coachNews`, `humanMatch`). Regras dentro da função:
  - o atalho `if (!loaded || (!loaded.human && !(loaded.offers?.length) && !isNationalDate(loaded, date))) return out;`
    vira `if (!loaded || (!Object.keys(loaded.human ?? {}).length && !Object.values(loaded.offers ?? {}).some((l) => l.length) && !isNationalDate(loaded, date))) return out;`;
  - ofertas vencidas caem por assento; o salário de segunda é `bySeat[sid].earned` para cada `[sid, h]` de `state.human`;
  - os avisos de convocação (`h.notified`) e a convocação escolhida (`h.callUp`) são de cada assento cuja seleção
    convoca;
  - o jogo da seleção de um assento usa a tática dele (`state.human[sid].tactics`) e a gravação `playedMatches[sid]`;
  - `pl.squadId === humanClubId` → `humanClubs.has(pl.squadId)` e a notícia vai para `bySeat[humanClubs.get(pl.squadId)!].news`;
  - fim de competição/meta/demissão: por assento que treina uma seleção da competição;
  - `offerCoachJob` (vaga aberta): para cada assento em `humans` sem seleção e sem oferta daquela seleção, a regra de
    hoje com a reputação e a nacionalidade dele, gravando em `state.offers[sid]`.

  `advanceDay.ts`: a chamada vira

```ts
    const nationalDay = await playNationalDay({
      service: saveService, saveId, date: currentDate, index,
      humanClubs: new Map(daySeats.filter((ds) => ds.clubId).map((ds) => [ds.clubId!, ds.seatId] as const)),
      squadOf: async (id) => squadWrites.get(id)?.squad ?? (await saveService.getSquadById(saveId, id)),
      ...(options.marketFrozen ? {} : {
        humans: Object.fromEntries(daySeats.map((ds) => [ds.seatId, {
          reputation: managerReputation(await saveService.getManagers(saveId), ds.job.unemployed ? ds.job.unemployed.board : (ds.board?.board ?? 60), parseInt(currentDate.slice(0, 4), 10), ds.seatId),
          nationality: managerNation(ds.meta.manager?.nationalityIso),
        }])),
      }),
      playedMatches: nationalRecordings,
    });
    for (const sid of Object.keys(nationalRecordings)) {
      if (!nationalDay.bySeat[sid]?.consumedRecording) {
        return { ok: false, status: 400, error: "playedMatch fixture does not match today's calendar or was already consumed" };
      }
    }
```

  (o `await` dentro do `map` não compila: leia `const managersToday = await saveService.getManagers(saveId);` antes e
  use-o.) Depois, por assento: `ds.managerEarned += nationalDay.bySeat[ds.seatId]?.earned ?? 0`; as mensagens
  `news`/`coachNews` do assento no laço das mensagens (Tarefa 20); o `nationalMatch` do day log passa a ser
  `nationalMatches: Record<seatId, MatchEvent>` (`StoredDayLog`, `src/types/dayLogTypes.ts`; a tela de resultado lê
  o do seu assento — `GET /api/saves/:id/days/:date` devolve `nationalMatch: log.nationalMatches?.[auth.seatId]`
  para não mudar o frontend); as conquistas recebem o jogo da seleção do assento; o `jobOffers` da resposta do
  assento soma `nationalDay.bySeat[ds.seatId]?.offers ?? 0`. Apague o `daySeats[0]` explícito deixado na Tarefa 22.

  `saves.ts` (`playerNationalCalendar(service, saveId, seatId, clubId)`), `routes.ts`
  (`nationalMatchSetup(service, saveId, seatId, date)`), `advanceUntil.ts`
  (`nextNationalFixtureDate(service, saveId, seatId, from)`), `nationalRoutes.ts` (rotas do técnico com
  `auth.seatId`; a visão `nationalCoachView(service, saveId, seatId, meta)`).

- [ ] **Passo 4: rodar e ver passar** — `bun test src/backend/national.seats.test.ts src/backend/national.coach.test.ts src/backend/national.advanceDay.test.ts src/Domain/national` → PASS (ajuste `national.coach.test.ts` às assinaturas novas: cada chamada ganha `meta.seatId`; leituras de `state.human` viram `state.human?.[meta.seatId]`).

  Grep: `grep -rnE "state\.human\b[^?]|\.human\?\.(teamId|tactics|callUp)|humanClubId|daySeats\[0\]" src/backend --include=*.ts`
  → nenhuma linha.

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "feat(seats): seleção do técnico por assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 25: `retired.json` — a oferta de renascido é do assento

**Files:**
- Modify: `src/Domain/retirement/retirement.ts` (`expireOffers` ~l.148)
- Modify: `src/backend/rebornRoutes.ts`, `src/backend/jobWorld.ts` (`releaseHumanClub`, ~l.311), `src/backend/advanceDay.ts` (7b)
- Modify: `src/Domain/retirement/retirement.test.ts`

(O `rebornSeatId` é gravado desde a Tarefa 18, pelo `processRetirements` com `humanSeats`.)

- [ ] **Passo 1: escrever o teste que falha** — em `retirement.test.ts`, troque o teste
  "percentile bounds and expireOffers" por:

```ts
  test("percentile bounds and expireOffers of one seat", () => {
    expect(levelPercentile([1, 2, 3, 4], 0)).toBe(0);
    expect(levelPercentile([1, 2, 3, 4], 10)).toBe(1);
    const rec = { id: "x", rebornOffer: "pending", rebornSeatId: "s1" } as RetiredPlayer;
    const out = expireOffers([rec, { ...rec, id: "y", rebornSeatId: "s2" }, { ...rec, id: "z", rebornOffer: "accepted" }], "s1");
    expect(out.map((r) => r.rebornOffer)).toEqual(["expired", "pending", "accepted"]);
  });
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/retirement` → FAIL.

- [ ] **Passo 3: implementar**

```ts
/** The pending reborn offers of one seat expire (its country's next rollover, or the seat leaving the club). */
export function expireOffers(retired: RetiredPlayer[], seatId: string): RetiredPlayer[] {
  return retired.map((r) => (r.rebornOffer === "pending" && r.rebornSeatId === seatId ? { ...r, rebornOffer: "expired" as const } : r));
}
```

  - Dia (7b): `if (humanInUnit) retiredAll = expireOffers(retiredAll);` vira, para cada assento cujo clube está na
    unidade, `retiredAll = expireOffers(retiredAll, ds.seatId)`.
  - `releaseHumanClub(service, saveId, seatId, …)`: o bloco que expira as ofertas do clube vira
    `r.rebornSeatId === seatId && r.rebornOffer === "pending"`.
  - `rebornRoutes.ts`: `GET /reborn` lista só `r.rebornSeatId === auth.seatId && r.rebornOffer === "pending"`;
    `POST /reborn/:retiredId` devolve 409 `offerClosed` quando `rec.rebornSeatId !== auth.seatId`; o jovem
    renascido entra na base do clube do assento.
- [ ] **Passo 4: rodar e ver passar** — `bun test src/Domain/retirement src/backend/reborn.routes.test.ts` → PASS.
- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.
- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "feat(seats): oferta de renascido do assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 26: `transfers.json` sem limpeza na virada; `direction` na resposta

**Files:**
- Modify: `src/types/transferTypes.ts` (`StoredTransferRecord`)
- Modify: `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `src/backend/SaveService.ts`
  (`readTransfers`/`writeTransfers`/`appendTransfer`/arquivos com `StoredTransferRecord`)
- Modify: `src/backend/transfers.ts` (`GET`, `splitTransfersByClub`), `src/backend/advanceDay.ts` (registros e virada),
  `src/backend/negotiationWorld.ts`, `src/backend/rivalWorld.ts`, `src/backend/startKits.ts`
- Create: `src/Domain/transfer/transferView.ts`, `src/Domain/transfer/transferView.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/Domain/transfer/transferView.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { pruneTransferLog, seasonTransfers, withDirection } from "@/Domain/transfer/transferView";
import type { StoredTransferRecord } from "@/types/transferTypes";

const rec = (id: string, date: string, from: string, to: string): StoredTransferRecord => ({
  id, date, playerId: id, playerName: id, playerPosition: "CB", playerAge: 25,
  fromSquadId: from, fromSquadName: from, toSquadId: to, toSquadName: to, fee: 1, status: "accepted", reason: "x",
});

describe("transfer log view", () => {
  test("direction is computed for the asking seat's club", () => {
    expect(withDirection(rec("a", "2027-01-01", "x", "me"), "me").direction).toBe("in");
    expect(withDirection(rec("b", "2027-01-01", "me", "x"), "me").direction).toBe("out");
    expect(withDirection(rec("c", "2027-01-01", "x", "y"), "me").direction).toBe("in");
  });
  test("the screen shows the seat's season; the rollover prunes what no running season still covers", () => {
    const log = [rec("old", "2026-05-01", "x", "y"), rec("new", "2026-09-01", "x", "y")];
    expect(seasonTransfers(log, "2026-08-15").map((r) => r.id)).toEqual(["new"]);
    expect(pruneTransferLog(log, ["2026-08-15", "2027-02-05"]).map((r) => r.id)).toEqual(["new"]);
    expect(pruneTransferLog(log, []).map((r) => r.id)).toEqual(["old", "new"]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/transfer/transferView.test.ts` → FAIL.

- [ ] **Passo 3: implementar**

  `transferTypes.ts`, depois de `TransferRecord`:

```ts
/** A transfer as stored in `transfers.json`: the direction is computed per seat in the response. */
export type StoredTransferRecord = Omit<TransferRecord, "direction">;
```

  `src/Domain/transfer/transferView.ts`:

```ts
import type { StoredTransferRecord, TransferRecord } from "@/types/transferTypes";

/** The record as the asking seat sees it: "in" when its club bought, "out" when it sold ("in" for AI × AI). */
export function withDirection(r: StoredTransferRecord, clubId: string): TransferRecord {
  return { ...r, direction: r.fromSquadId === clubId && r.toSquadId !== clubId ? "out" : "in" };
}

/** The records of the season that started on `seasonStart` (the seat's league). */
export function seasonTransfers<T extends { date: string }>(log: T[], seasonStart: string): T[] {
  return log.filter((r) => r.date >= seasonStart);
}

/** At a rollover: drop what no running season still covers (older than the earliest season start). */
export function pruneTransferLog<T extends { date: string }>(log: T[], seasonStarts: string[]): T[] {
  if (seasonStarts.length === 0) return log;
  const earliest = [...seasonStarts].sort()[0]!;
  return log.filter((r) => r.date >= earliest);
}
```

  - DAL/`SaveService`: `readTransfers`/`writeTransfers`/`appendTransfer`/`readTransfersArchive`/
    `writeTransfersArchive`/`writeLeagueTransfersArchive` passam a usar `StoredTransferRecord`. Os registros novos
    (dia, `negotiationWorld`, `rivalWorld`, `transfers.ts`) deixam de ter `direction` (o tsc aponta o excesso de
    propriedade).
  - `transfers.ts` (`GET`): `const raw = seasonTransfers(await saveService.getTransfers(saveId), seasonStart)` com
    `seasonStart` = `start` da liga do assento em `activeLeagues`; `enrichTransfersWithLogos` recebe e devolve
    `TransferRecord[]` já com `withDirection(r, meta.clubId)`; `splitTransfersByClub` não muda.
  - Dia (virada): apague a limpeza `writeTransfers(saveId, [])` (a Tarefa 18 a deixou "uma vez se algum assento
    virou"); no lugar, depois do laço das unidades, se houve virada:
    `await saveService.writeTransfers(saveId, pruneTransferLog(await saveService.getTransfers(saveId), updatedActiveLeagues.map((l) => l.start)));`.
    O arquivo de cada liga (`writeLeagueTransfersArchive(saveId, slug, year, …)`) recebe só a janela da temporada que
    fecha: `transfersAtSeasonEnd.filter((t) => t.date >= state.start && t.date <= state.end)`.
- [ ] **Passo 4: rodar e ver passar** — `bun test src/Domain/transfer src/backend/transfers.sellList.test.ts src/backend/negotiation.routes.test.ts` → PASS.
  Grep: `grep -rn "writeTransfers(saveId, \[\])\|direction: \"in\"\|direction: \"out\"\|direction: isBuyer" src/backend --include=*.ts` → nenhuma linha.
- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.
- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "feat(seats): transfers.json do mundo; direção calculada pelo assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 27: Notícias — clubes e ligas dos assentos

**Files:**
- Modify: `src/types/newsTypes.ts` (`DayNewsInput.humanClubId`/`humanLeague`, ~l.28–29)
- Modify: `src/Domain/news/buildDayNews.ts` (~l.25, ~l.63), `src/Domain/news/buildDayNews.test.ts` (~l.36, ~l.49)
- Modify: `src/backend/newsWorld.ts` (`collectDayNews`, ~l.160–205; `readLeaders`), `src/backend/pressRoutes.ts`
  (notícia da coletiva), `src/backend/advanceDay.ts` (coletor)

- [ ] **Passo 1: escrever o teste que falha** — em `buildDayNews.test.ts`, as entradas
  `humanLeague: "pl"` e `humanClubId: "me"` viram `humanLeagues: ["pl"]` e `humanClubIds: ["me"]`, e acrescente:

```ts
  test("two seats: news near either seat's league count as near", () => {
    const base = { ...emptyDayNewsInput("d"), humanLeagues: ["pl", "ll"] };
    const near = (league: string) => buildDayNews({
      ...base,
      results: [{ scope: { league }, home: { id: "a", name: "A" }, away: { id: "b", name: "B" }, score: { home: 5, away: 0 } }],
    } as never);
    expect(near("ll").length).toBe(near("pl").length);
  });
```

  (Ajuste o literal de `results` ao formato real de `DayNewsInput["results"]` — leia o tipo em `newsTypes.ts`; o
  teste compara as duas ligas dos assentos com o mesmo jogo.)

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/Domain/news` → FAIL.

- [ ] **Passo 3: implementar** — `newsTypes.ts`: `humanClubIds?: string[]; humanLeagues?: string[];` no lugar dos dois;
  `buildDayNews.ts`: `s.league === input.humanLeague` → `(input.humanLeagues ?? []).includes(s.league)` e
  `t.to.id === input.humanClubId` → `(input.humanClubIds ?? []).includes(t.to.id)`; `newsWorld.collectDayNews` recebe
  `seats: { clubId?: string; leagueSlug: string; followedLeagues?: string[] }[]` no lugar de `meta`, monta
  `humanClubIds`, `humanLeagues` e o `followed` como a união dos assentos; `readLeaders` no início do dia recebe as
  ligas de todos os assentos mais as seguidas. No dia: `collectDayNews({ …, seats: daySeats.map((ds) => ({ clubId: ds.clubId, leagueSlug: ds.meta.leagueSlug, followedLeagues: ds.meta.followedLeagues })) })`.
  `pressRoutes.ts` (citação da coletiva) não muda de forma (o `scope` já é a liga do assento).
- [ ] **Passo 4: rodar e ver passar** — `bun test src/Domain/news src/backend/news*.test.ts` → PASS.
- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.
- [ ] **Passo 6: commit**

```bash
git add src
git commit -m "feat(seats): notícias com os clubes e ligas de todos os assentos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 28: `addSeat` (assento extra para testes e scripts)

**Files:**
- Create: `src/backend/seats.ts`
- Create: `src/backend/seats.addSeat.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/backend/seats.addSeat.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { seatManagerId } from "@/Domain/seats/seats";

describe("addSeat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("a second seat takes a club: seat file, member, manager, staff, ledger = budget", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const owner = devAutoLogin("addseat-owner@test.local");
    const friend = devAutoLogin("addseat-friend@test.local");
    await ownSolo(meta.id, owner.user.id);
    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("la_liga")[0]!.squadId;

    const b = await addSeat(meta.id, { userId: friend.user.id, clubId: clubB, manager: { name: "Friend", nationalityIso: "es", backgroundId: "former-player" } });

    const world = (await saveService.getMeta(meta.id))!;
    expect(world.mode).toBe("multi");
    expect(world.seats).toEqual([meta.seatId, b.seatId]);
    expect(memberOf(meta.id, friend.user.id)).toMatchObject({ seatId: b.seatId, role: "member" });
    expect(b.seat.clubId).toBe(clubB);
    expect(b.seat.board?.objective?.leagueSlug).toBe("la_liga");
    expect(b.seat.managerContract?.squadId).toBe(clubB);
    expect(b.seat.restDays?.length).toBeGreaterThan(0);
    expect([...(await saveService.humanClubIds(meta.id))].sort()).toEqual([meta.clubId, clubB].sort());

    const managers = await saveService.getManagers(meta.id);
    expect(managers.filter((m) => m.squadId === clubB).map((m) => m.id)).toEqual([seatManagerId(b.seatId)]);

    const squad = (await saveService.getSquadById(meta.id, clubB))!;
    expect(squad.staff).toBeDefined();
    expect(squad.facilities).toBeDefined();
    expect(squad.financialTier).toBeUndefined();
    let sum = 0;
    for (const season of await saveService.listLedgerSeasons(meta.id, b.seatId)) {
      for (const e of await saveService.getLedger(meta.id, season, b.seatId)) sum += e.amount;
    }
    expect(sum).toBe(squad.finances?.budget ?? 0);
    expect((await saveService.getTactics(meta.id, b.seatId))?.lineup.length).toBeGreaterThan(0);

    await expect(addSeat(meta.id, { userId: devAutoLogin("addseat-3@test.local").user.id, clubId: clubB, manager: { name: "X", nationalityIso: "es", backgroundId: "former-player" } }))
      .rejects.toThrow("already has a seat");
  }, 300_000);
});
```

  (Este teste roda depois da Tarefa 29? Não: a Tarefa 28 vem antes; ele usa `getMeta` lendo só campos do mundo —
  `mode` e `seats` — e funciona nas duas formas.)

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/backend/seats.addSeat.test.ts` → FAIL (módulo não existe).

- [ ] **Passo 3: implementar** — `src/backend/seats.ts`:

```ts
import { randomUUID } from "crypto";
import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import type { SaveManager, SeatContext, SeatState, MemberRole } from "@/types/seatTypes";
import { addSaveMember, memberOf } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { takeOverClub } from "@/backend/jobWorld";
import { applyBroadcasting } from "@/backend/FinancialService";
import { getLeagueData } from "@/backend/advanceDay";
import { competitionName } from "@/Domain/world/labels";
import { metaForSeat } from "@/Domain/seats/seats";
import { placeSeatManager } from "@/Domain/managers/seatManagers";
import { managerReputation } from "@/Domain/jobs/jobs";
import { contractUntil, managerWeeklyWage, MANAGER_CONTRACT } from "@/Domain/managers/managerContract";
import { defaultSeasonEnd } from "@/Domain/contracts/contracts";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { buildBoardMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";
import type { LeagueData } from "@/types/playerTypes";

/**
 * A new seat in an existing world (`.claude/rules/game/multiplayer.md`): tests and scripts only in part 1 (the invite
 * screen is part 2). The club becomes human the way a job switch does (`takeOverClub`: staff, facilities, morale,
 * familiarity, tactic, board), without the arrival line; its balance starts at 0 plus the season's broadcasting, like
 * a new career. The club's AI manager goes to the free pool and the seat's manager takes the job. The user joins the
 * world as a member with this seat.
 */
export async function addSeat(
  saveId: string,
  args: { userId: string; clubId: string; manager: SaveManager; role?: MemberRole },
  service: SaveService = defaultService,
): Promise<SeatContext> {
  return withSaveLock(saveId, async () => {
    const world = await service.getWorldMeta(saveId);
    if (!world?.currentDate) throw new Error(`addSeat: save ${saveId} not found or without a date`);
    if (memberOf(saveId, args.userId)) throw new Error(`addSeat: user ${args.userId} already has a seat in ${saveId}`);
    if ((await service.humanClubIds(saveId)).has(args.clubId)) throw new Error(`addSeat: club ${args.clubId} already has a seat`);
    const index = await service.getSquadIndex(saveId);
    const entry = index.byId(args.clubId);
    if (!entry) throw new Error(`addSeat: club ${args.clubId} is not in save ${saveId}`);

    const date = world.currentDate;
    const activeLeagues = world.activeLeagues ?? [];
    const catalog = await getLeagueData();
    const leagueName = competitionName(entry.leagueSlug, catalog as unknown as LeagueData[], "en");
    const seatId = randomUUID();
    const seat: SeatState = {
      clubId: entry.squadId,
      clubName: entry.name,
      clubColors: entry.colors,
      leagueSlug: entry.leagueSlug,
      leagueName,
      manager: args.manager,
      formation: "4-3-3",
      tactical_style: DEFAULT_TACTICAL_STYLE,
      min_energy_to_train: DEFAULT_MIN_ENERGY_TO_TRAIN,
      training_intensity: DEFAULT_TRAINING_INTENSITY,
      sackingEnabled: true,
      careerStart: date,
      restDays: (await service.getLeagueMeta(saveId, entry.leagueSlug))?.restDays ?? [],
      managerEarnings: 0,
    };
    await service.insertSeat(saveId, seatId, seat);

    // The club's manager: the AI one leaves for the free pool, the seat's takes over; no vacancy.
    await service.writeManagers(saveId, placeSeatManager(await service.getManagers(saveId), {
      seatId, name: args.manager.name.trim() || entry.name, squadId: entry.squadId, date,
    }));
    if (world.managerVacancies?.[entry.squadId]) {
      const { [entry.squadId]: _gone, ...vacancies } = world.managerVacancies;
      await service.updateMeta(saveId, { managerVacancies: vacancies });
    }

    const taken = await takeOverClub(service, saveId, seatId, {
      squadId: entry.squadId, date, activeLeagues, startBalance: 0, arriveEntry: false,
    });
    const squad = await service.getSquadById(saveId, entry.squadId);
    const rep = managerReputation(await service.getManagers(saveId), 60, parseInt(date.slice(0, 4), 10), seatId);
    const seasonEnd = activeLeagues.find((l) => l.leagueSlug === entry.leagueSlug)?.end ?? defaultSeasonEnd(date);
    const finalSeat = await service.updateSeat(saveId, seatId, {
      formation: taken.formation,
      board: taken.board,
      managerContract: {
        squadId: entry.squadId,
        wage: managerWeeklyWage(squad ? wageRevenueBasisOf(squad) : 0, rep),
        until: contractUntil(seasonEnd, MANAGER_CONTRACT.INITIAL_SEASONS),
        signed: date,
      },
    });
    await applyBroadcasting(saveId, metaForSeat(world, seatId, finalSeat), entry.leagueSlug, entry.stem, seatId);
    if (taken.board.objective) {
      await emitInboxMessage(saveId, buildBoardMessage({
        date, kind: "objective", objective: taken.board.objective, leagueName,
      }), service, seatId);
    }
    addSaveMember(saveId, args.userId, seatId, args.role ?? "member");
    return { seatId, seat: finalSeat };
  });
}
```

  (`takeOverClub` ganhou `seatId` e `arriveEntry` na Tarefa 9; `managerReputation` ganhou `seatId` na Tarefa 23;
  `applyBroadcasting` grava no extrato do assento desde a Tarefa 5. Se `wageRevenueBasisOf` ficar em outro módulo,
  importe-o de lá — hoje é `@/Domain/finance/wages`.)

- [ ] **Passo 4: rodar e ver passar** — `bun test src/backend/seats.addSeat.test.ts` → PASS.
- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.
- [ ] **Passo 6: commit**

```bash
git add src/backend/seats.ts src/backend/seats.addSeat.test.ts
git commit -m "feat(seats): addSeat para testes e scripts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 29: Fim da camada de transição

**Files:**
- Modify: `src/backend/SaveService.ts`, `src/Domain/inbox/inboxEvents.ts`, `src/backend/FinancialService.ts`
- Modify: todo arquivo que o `tsc` apontar (código, testes e scripts)

- [ ] **Passo 1: tornar o assento obrigatório**
  - `SaveService.ts`: apague `primarySeatId` e `seatOr`; nos métodos `getTactics`, `saveTactics`, `getScouting`,
    `writeScouting`, `getAchievements`, `writeAchievements`, `getInbox`, `appendInbox`, `markInboxRead`,
    `markAllInboxRead`, `writeInbox`, `clearInbox`, `getLedger`, `listLedgerSeasons`, `appendLedger`, `getMarket`,
    `saveMarket` o último parâmetro vira `seatId: string` e o corpo usa `seatId` direto (sem `await this.seatOr(…)`).
  - `inboxEvents.ts`: `InboxSink.appendInbox(saveId, message, seatId: string)`; `emitInboxMessage(saveId, message, service, seatId: string)`.
  - `FinancialService.ts`: `recordMoney(…, entry, seatId: string)`; `applyBroadcasting(…, seatId: string)`.

- [ ] **Passo 2: a meta é só o mundo**
  - Apague, em `SaveService.ts`, `export type SaveMeta = SeatMeta;` e o `getMeta`/`updateMeta` de transição; o novo
    `getMeta` é o antigo `getWorldMeta` e `updateMeta` aceita só o mundo:

```ts
  getMeta(saveId: string): Promise<WorldMeta | null> {
    return this.dal.readMeta(saveId);
  }

  async updateMeta(saveId: string, patch: Partial<Omit<WorldMeta, "id" | "createdAt">>): Promise<WorldMeta> {
    const meta = await this.dal.readMeta(saveId);
    if (!meta) throw new Error(`Save not found: ${saveId}`);
    const updated: WorldMeta = {
      ...meta,
      ...patch,
      id: meta.id,
      createdAt: meta.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.dal.writeMeta(updated);
    return updated;
  }
```

  - Renomeações mecânicas, nesta ordem:

```bash
grep -rl "getWorldMeta(" src scripts --include=*.ts --include=*.tsx | xargs sed -i 's/getWorldMeta(/getMeta(/g'
grep -rlw "WorldMeta" src scripts --include=*.ts --include=*.tsx | xargs sed -i 's/\bWorldMeta\b/SaveMeta/g'
```

    Depois, em `SaveService.ts`, apague o método duplicado `getMeta` que sobrar (o `getWorldMeta` renomeado e o
    `getMeta` acima são o mesmo: fique com um).
  - Rode o `tsc`. Cada erro restante é um leitor de campo do assento numa meta do mundo, um patch do assento em
    `updateMeta` ou uma chamada sem o `seatId`. Regra: no backend, use o assento que a função já recebe (ou receba-o,
    RC item 5); nos testes, `getMeta(id)` que lê campo do assento → `getSeatMeta(id, meta.seatId)`, `updateMeta(id, { campoDoAssento })`
    → `updateSeat(id, meta.seatId, { … })`, e as chamadas dos métodos do item 1 ganham `meta.seatId`; nos scripts, o
    assento do save que o script criou (`meta.seatId`).

- [ ] **Passo 3: greps de saída**

```bash
grep -rnE "seatOr\(|primarySeatId|TRANSITIONAL|getWorldMeta|\bWorldMeta\b|seats\[0\]" src scripts --include=*.ts --include=*.tsx
```

  Expected: nenhuma linha (a única exceção aceita é `world.seats[0]` dentro de `src/backend/testing/seatFixtures.ts`,
  que é o "solo" por definição — renomeie a variável do helper para deixar isso explícito:
  `const [onlySeat] = world?.seats ?? []; if (!onlySeat || world!.seats.length !== 1) throw …`).

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 5: commit**

```bash
git add src scripts
git commit -m "refactor(seats): fim da camada de transição; a meta é só o mundo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Fatia 6 — Frontend com `seatId`

### Tarefa 30: Sessão com `seatId`; resposta `SeatMeta`

**Files:**
- Modify: `src/GameInterface/gameSession.ts` (`GameSession`, `sessionFromSave`)
- Modify: `src/GameInterface/GameSaveProvider.tsx` (`GameSaveApiResponse`, `sessionFromSaveJson`)
- Modify: `src/GameInterface/Dashboard/HomeCards.tsx` (~l.212), `src/GameInterface/Achievements/AchievementsScreen.tsx` (~l.207)
- Modify: o que o `tsc` apontar em `src/GameInterface` (imports de `SaveMeta` que leem campos do técnico → `SeatMeta`)
- Create: `src/GameInterface/gameSession.seat.test.ts`

- [ ] **Passo 1: escrever o teste que falha** — `src/GameInterface/gameSession.seat.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { sessionFromSave } from "@/GameInterface/gameSession";

describe("game session carries the seat", () => {
  test("the seat id comes from the save response", () => {
    const s = sessionFromSave({
      id: "w1", seatId: "s1", leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000", "#fff"], formation: "4-3-3",
    });
    expect(s.seatId).toBe("s1");
    expect(s.saveId).toBe("w1");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `bun test src/GameInterface/gameSession.seat.test.ts` → FAIL (`sessionFromSave` não é
  exportado / não tem `seatId`).

- [ ] **Passo 3: implementar**
  - `gameSession.ts`: `GameSession` ganha `seatId: string;`; `sessionFromSave` vira `export function` e põe
    `seatId: save.seatId as string`; `loadSession` devolve a sessão salva como está (uma sessão antiga sem `seatId`
    ganha o assento no próximo `refresh`, que remonta a sessão a partir do servidor). Os tipos de resposta usam
    `SeatMeta` (`import type { SeatMeta, SaveDatabase, SaveManager } from "@/backend/SaveService"`).
  - `GameSaveProvider.tsx`: `export type GameSaveApiResponse = SeatMeta & { season?: SeasonData; role?: MemberRole };`
    e, em `sessionFromSaveJson`, `seatId: raw.seatId ?? s.seatId,`.
  - `HomeCards.tsx` e `AchievementsScreen.tsx`: o técnico do jogador no rosto é
    `id: session?.seatId ? seatManagerId(session.seatId) : ""` (import `seatManagerId` de `@/Domain/seats/seats`), o
    mesmo id que o ranking devolve (`seat:<seatId>`), para o rosto sorteado ser igual nas duas telas.
  - `toggleDayType` já chama a rota que grava no assento (Tarefa 21); nada muda nele.
- [ ] **Passo 4: rodar e ver passar** — `bun test src/GameInterface` → PASS.
- [ ] **Passo 5: verificação final** — tsc limpo, a suíte verde e `bun run ui:audit --hard` sem violação nova.
- [ ] **Passo 6: commit**

```bash
git add src/GameInterface
git commit -m "feat(seats): sessão do frontend com o assento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Fatia 7 — Testes de dois assentos, medições e regra

### Tarefa 31: Testes de dois assentos no mesmo mundo (spec §2.4)

**Files:**
- Create: `src/backend/seats.twoSeats.test.ts`

- [ ] **Passo 1: escrever os testes** — `src/backend/seats.twoSeats.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SeatMeta } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { getLeagueData, getPyramids, runBufferedDay } from "@/backend/advanceDay";
import { seatManagerId } from "@/Domain/seats/seats";
import { addDays } from "@/Domain/dates";
import type { SeatContext } from "@/types/seatTypes";
import type { InboxMessage } from "@/types/inboxTypes";

type Login = ReturnType<typeof devAutoLogin>;

const call = (key: string, path: string, method: string, token: string, params: Record<string, string>, body?: unknown) => {
  const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost${path}`, {
      method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params },
  ));
};

const marker = (id: string): InboxMessage =>
  ({ id, category: "season", kind: "followers", read: false, createdAt: "2027-01-01T00:00:00Z", date: "2027-01-01", subject: id } as unknown as InboxMessage);

describe("two seats in one world (spec §2.4)", () => {
  let meta: SeatMeta;   // seat A: Premier League, club 33 (createSave)
  let seatB: SeatContext; // seat B: first club of La Liga (addSeat)
  let a: Login;
  let b: Login;
  let stranger: Login;
  const DAYS = 8;

  beforeAll(async () => {
    a = devAutoLogin("two-seats-a@test.local");
    b = devAutoLogin("two-seats-b@test.local");
    stranger = devAutoLogin("two-seats-x@test.local");
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    await ownSolo(meta.id, a.user.id);
    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("la_liga")[0]!.squadId;
    seatB = await addSeat(meta.id, {
      userId: b.user.id, clubId: clubB, manager: { name: "Técnico B", nationalityIso: "es", backgroundId: "former-player" },
    });
    for (let i = 0; i < DAYS; i++) {
      const out = await runBufferedDay(meta.id);
      if (!out.ok) throw new Error(`day ${i}: ${out.error}`);
    }
  }, 900_000);

  afterAll(async () => { await saveService.deleteSave(meta.id); }, 120_000);

  test("each human club gets its own board, press, manager wage, inbox and ledger", async () => {
    const seats = [
      { seatId: meta.seatId, clubId: meta.clubId, league: "premier_league" },
      { seatId: seatB.seatId, clubId: seatB.seat.clubId, league: "la_liga" },
    ];
    for (const s of seats) {
      const seat = (await saveService.getSeat(meta.id, s.seatId))!;
      expect(seat.board?.objective?.leagueSlug).toBe(s.league);
      expect(seat.press).toBeDefined();
      expect(seat.managerContract?.squadId).toBe(s.clubId);
      // a Monday fell inside the 8 days: the manager was paid
      expect(seat.managerEarnings ?? 0).toBeGreaterThan(0);
      let sum = 0;
      let wageLines = 0;
      for (const season of await saveService.listLedgerSeasons(meta.id, s.seatId)) {
        for (const e of await saveService.getLedger(meta.id, season, s.seatId)) {
          sum += e.amount;
          if (e.kind === "manager") wageLines++;
        }
      }
      expect(wageLines).toBeGreaterThan(0);
      const squad = (await saveService.getSquadById(meta.id, s.clubId))!;
      expect(Math.round(sum)).toBe(Math.round(squad.finances?.budget ?? 0));
      expect((await saveService.getInbox(meta.id, s.seatId)).length).toBeGreaterThan(0);
    }
    // the inboxes are apart
    const idsA = new Set((await saveService.getInbox(meta.id, meta.seatId)).map((m) => m.id));
    const idsB = (await saveService.getInbox(meta.id, seatB.seatId)).map((m) => m.id);
    expect(idsB.some((id) => idsA.has(id))).toBe(false);
  });

  test("the AI never buys from, sells to, hires for or sacks at a human club", async () => {
    const humans = new Set([meta.clubId, seatB.seat.clubId]);
    let date = meta.currentDate!;
    for (let i = 0; i < DAYS; i++) {
      const log = await saveService.getDayLog(meta.id, date);
      for (const m of log?.transfers ?? []) {
        expect(humans.has(m.from)).toBe(false);
        expect(humans.has(m.to)).toBe(false);
      }
      date = addDays(date, 1);
    }
    const managers = await saveService.getManagers(meta.id);
    expect(managers.filter((m) => m.squadId === meta.clubId).map((m) => m.id)).toEqual([seatManagerId(meta.seatId)]);
    expect(managers.filter((m) => m.squadId === seatB.seat.clubId).map((m) => m.id)).toEqual([seatManagerId(seatB.seatId)]);
    const world = (await saveService.getMeta(meta.id))!;
    for (const id of humans) expect(world.managerVacancies?.[id]).toBeUndefined();
  });

  test("one seat's actions never touch the other (tactics, press, sell list, preferences, rest days, youth call-ups)", async () => {
    const before = {
      tactics: await saveService.getTactics(meta.id, seatB.seatId),
      seat: await saveService.getSeat(meta.id, seatB.seatId),
      market: await saveService.getMarket(meta.id, seatB.seatId),
    };
    const p = { saveId: meta.id };
    const id = meta.id;
    // tactics
    expect((await call("/api/saves/:id/tactics", `/api/saves/${id}/tactics`, "PUT", a.session.token, { id }, { formation: "4-4-2", tactical_style: "possession" })).status).toBe(200);
    // inbox preferences
    expect((await call("/api/saves/:saveId/inbox-prefs", `/api/saves/${id}/inbox-prefs`, "PUT", a.session.token, p, { manager_news: true })).status).toBe(200);
    // sell list: one of A's players
    const playerA = (await saveService.getSquadById(id, meta.clubId))!.players[5]!.id;
    expect((await call("/api/saves/:saveId/sell-list", `/api/saves/${id}/sell-list`, "POST", a.session.token, p, { playerId: playerA })).status).toBe(200);
    // rest day
    const day = addDays((await saveService.getMeta(id))!.currentDate!, 3);
    expect((await call("/api/saves/:saveId/day-type/:date", `/api/saves/${id}/day-type/${day}`, "PATCH", a.session.token, { saveId: id, date: day }, { type: "rest" })).status).toBe(200);
    // press conference, when A has one open
    const seatA = (await saveService.getSeat(id, meta.seatId))!;
    const pending = seatA.press?.pending;
    if (pending && pending.expires >= (await saveService.getMeta(id))!.currentDate!) {
      const answers = pending.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id }));
      expect((await call("/api/saves/:saveId/press/:pressId", `/api/saves/${id}/press/${pending.id}`, "POST", a.session.token, { saveId: id, pressId: pending.id }, { answers })).status).toBe(200);
    }
    // youth call-up of a B player by A: not A's player
    const playerB = (await saveService.getSquadById(id, seatB.seat.clubId))!.players[0]!.id;
    expect((await call("/api/saves/:saveId/youth-callups", `/api/saves/${id}/youth-callups`, "PUT", a.session.token, p, { u21: [{ id: playerB, duration: "next" }] })).status).toBe(400);

    expect(await saveService.getTactics(id, seatB.seatId)).toEqual(before.tactics);
    expect(await saveService.getSeat(id, seatB.seatId)).toEqual(before.seat);
    expect(await saveService.getMarket(id, seatB.seatId)).toEqual(before.market);
    expect((await saveService.getMarket(id, meta.seatId))?.playerSellList.some((c) => c.playerId === playerA)).toBe(true);
  });

  test("routes: a member acting on the other seat's club gets 404; world routes answer both; a stranger gets 404", async () => {
    const id = meta.id;
    const playerB = (await saveService.getSquadById(id, seatB.seat.clubId))!.players[0]!.id;
    const asA = await call("/api/saves/:saveId/players/:playerId/squad-status", `/api/saves/${id}/players/${playerB}/squad-status`, "PUT",
      a.session.token, { saveId: id, playerId: playerB }, { status: "key" });
    expect(asA.status).toBe(404);
    const asB = await call("/api/saves/:saveId/players/:playerId/squad-status", `/api/saves/${id}/players/${playerB}/squad-status`, "PUT",
      b.session.token, { saveId: id, playerId: playerB }, { status: "key" });
    expect(asB.status).toBe(200);

    for (const who of [a, b]) {
      expect((await call("/api/saves/:saveId/news", `/api/saves/${id}/news`, "GET", who.session.token, { saveId: id })).status).toBe(200);
    }
    const meB = await (await call("/api/saves/:id", `/api/saves/${id}`, "GET", b.session.token, { id })).json();
    expect(meB.seatId).toBe(seatB.seatId);
    expect(meB.clubId).toBe(seatB.seat.clubId);
    expect((await call("/api/saves/:saveId/inbox", `/api/saves/${id}/inbox`, "GET", stranger.session.token, { saveId: id })).status).toBe(404);
  });

  test("the rollover of one seat's country clears only that seat's inbox", async () => {
    const id = meta.id;
    const world = (await saveService.getMeta(id))!;
    const catalog = await getLeagueData();
    const pyramids = await getPyramids();
    const index = await saveService.getSquadIndex(id);
    // a league of a country without a pyramid rolls alone (`membership.md`)
    const lone = (world.activeLeagues ?? []).find((l) => {
      const country = catalog.find((c) => c.slug === l.leagueSlug)?.country;
      return !!country && !pyramids[country] && index.inLeague(l.leagueSlug).length >= 2;
    })!;
    expect(lone).toBeDefined();
    const c = devAutoLogin("two-seats-c@test.local");
    const seatC = await addSeat(id, {
      userId: c.user.id, clubId: index.inLeague(lone.leagueSlug)[0]!.squadId,
      manager: { name: "Técnico C", nationalityIso: "br", backgroundId: "former-player" },
    });
    await saveService.appendInbox(id, marker("keep-a"), meta.seatId);
    await saveService.appendInbox(id, marker("wipe-c"), seatC.seatId);
    // the lone league ends today: tomorrow's advance rolls its country over
    await saveService.updateMeta(id, {
      activeLeagues: world.activeLeagues!.map((l) => (l.leagueSlug === lone.leagueSlug ? { ...l, end: world.currentDate! } : l)),
    });
    const out = await runBufferedDay(id);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.seats[seatC.seatId]?.seasonEnded).toBe(true);
    expect(out.seats[meta.seatId]?.seasonEnded).toBeUndefined();
    expect((await saveService.getInbox(id, meta.seatId)).some((m) => m.id === "keep-a")).toBe(true);
    expect((await saveService.getInbox(id, seatC.seatId)).some((m) => m.id === "wipe-c")).toBe(false);
    expect((await saveService.getSeat(id, seatC.seatId))?.restDays?.length).toBeGreaterThan(0);
  }, 300_000);
});
```

  Pontos a conferir ao escrever: o formato do corpo de `PUT /youth-callups` (Tarefa 11 e
  `.claude/rules/game/youth-competitions.md`: `{ u21: [{ id, duration }] }`, 400 `invalidPlayers` para jogador de fora
  do clube); a chave `manager_news` é um tópico desligável de `inboxTopics.ts`; o `kind` do `marker` precisa passar no
  filtro de tópicos do `appendInbox` (a categoria `season` está ligada por padrão).

- [ ] **Passo 2: rodar e ver passar** — `bun test src/backend/seats.twoSeats.test.ts` → PASS (5 testes; leva alguns
  minutos: um mundo inteiro e 9 dias). Se um teste falhar, a causa está numa das Tarefas 13–28: corrija lá (no código
  do dia ou da rota), nunca no teste.

- [ ] **Passo 3: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 4: commit**

```bash
git add src/backend/seats.twoSeats.test.ts
git commit -m "test(seats): dois assentos no mesmo mundo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 32: Medições — folga da IA e custo do dia com dois assentos

**Files:**
- Create: `scripts/ai-rest-measure.ts`
- Modify: `scripts/bench-advance-day.ts` (flag `--seats 2`)

- [ ] **Passo 1: script da folga** — `scripts/ai-rest-measure.ts` (roda igual na `main` e no branch, porque só usa
  `createSave`, `runBufferedDay(saveId)`, `getAllSquads` e `deleteSave`):

```ts
/**
 * AI rest by its own calendar (multiplayer part 1, `.claude/rules/game/multiplayer.md`): advances N days of a fresh
 * Premier League career and reports, for the AI clubs, the share of rest days among the non-match club-days, the
 * mean fitness of their players and the injury prevalence (injured player-days / player-days).
 *
 * Before/after: run it on this branch and on the merge base (copy this file into a worktree of `main`).
 *
 *   bun scripts/ai-rest-measure.ts [--days 28]
 */
import { fileURLToPath } from "node:url";

process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const DAYS = Math.max(1, parseInt(daysArg >= 0 ? args[daysArg + 1] ?? "28" : "28", 10) || 28);

const { saveService } = await import("@/backend/SaveService");
const { runBufferedDay } = await import("@/backend/advanceDay");

const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League",
  clubId: "33", clubName: "Rest measure", clubColors: ["#000000", "#ffffff"],
});
const human = meta.clubId;
let rest = 0;
let training = 0;
let fitnessSum = 0;
let playerDays = 0;
let injuredDays = 0;
try {
  for (let d = 0; d < DAYS; d++) {
    const out = await runBufferedDay(meta.id);
    if (!out.ok) throw new Error(out.error);
    const events = (out.payload.events as { kind: string; squadId?: string }[] | undefined) ?? [];
    for (const e of events) {
      if (!e.squadId || e.squadId === human) continue;
      if (e.kind === "rest") rest++;
      else if (e.kind === "training") training++;
    }
    const date = out.payload.newDate as string;
    for (const sq of await saveService.getAllSquads(meta.id)) {
      if (sq.id === human) continue;
      for (const p of sq.players) {
        fitnessSum += p.seasonLog?.fitness ?? 75;
        playerDays++;
        if (p.injury && p.injury.returnDate > date) injuredDays++;
      }
    }
    process.stdout.write(`day ${d + 1}/${DAYS}\r`);
  }
} finally {
  await saveService.deleteSave(meta.id);
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`\nAI clubs over ${DAYS} days from ${meta.currentDate}`);
console.log(`rest share of non-match club-days: ${pct(rest / Math.max(1, rest + training))} (${rest} rest, ${training} training)`);
console.log(`mean fitness of AI players:       ${(fitnessSum / Math.max(1, playerDays)).toFixed(2)}`);
console.log(`injured player-days:              ${pct(injuredDays / Math.max(1, playerDays))}`);
```

- [ ] **Passo 2: medir a folga** — no branch:
  `bun scripts/ai-rest-measure.ts --days 28 | tee /tmp/rest-after.txt`; na base:

```bash
git -C C:/Projects/FMProject-mp worktree add ../FMProject-mp-base $(git -C C:/Projects/FMProject-mp merge-base HEAD main)
cp C:/Projects/FMProject-mp/scripts/ai-rest-measure.ts C:/Projects/FMProject-mp-base/scripts/
cd C:/Projects/FMProject-mp-base && bun install --frozen-lockfile && mkdir -p src/Data && cp -R src/example_data/. src/Data/
bun scripts/ai-rest-measure.ts --days 28 | tee /tmp/rest-before.txt
cd C:/Projects/FMProject-mp && git worktree remove ../FMProject-mp-base --force
```

  Critério: anotar os números (a folga da IA muda por desenho: a IA passa a descansar na véspera e no dia seguinte
  dos próprios jogos); se o fôlego médio da IA cair mais de 3 pontos ou as lesões subirem mais de 15% relativos,
  pare e reporte ao usuário antes de seguir (é uma mudança de equilíbrio do mundo).

- [ ] **Passo 3: bench com dois assentos** — em `scripts/bench-advance-day.ts`, acrescente a flag:

```ts
const SEATS = Math.max(1, parseInt(argValue("--seats") ?? "1", 10) || 1);
```

  e, logo depois de criar o save (onde o script chama `createSave` + `applyBroadcasting` + `applyRandomStartKit`),
  quando `SEATS >= 2`:

```ts
  if (SEATS >= 2) {
    const { addSeat } = await import("@/backend/seats");
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    const index = await saveService.getSquadIndex(meta.id);
    const leagues = ["la_liga", "bundesliga", "serie_a", "ligue_1"];
    for (let n = 2; n <= SEATS; n++) {
      const league = leagues[(n - 2) % leagues.length]!;
      const clubId = index.inLeague(league)[0]!.squadId;
      await addSeat(meta.id, {
        userId: devAutoLogin(`bench-seat-${n}@local`).user.id, clubId,
        manager: { name: `Bench ${n}`, nationalityIso: "gb", backgroundId: "former-player" },
      });
    }
  }
```

  (Use os nomes de variáveis do script — o save criado pode se chamar `meta` ou `created`; leia o trecho antes.)
  Rode `bun scripts/bench-advance-day.ts --buffered --days 14` e `bun scripts/bench-advance-day.ts --buffered --days 14 --seats 2`
  e anote o tempo médio por dia, separando dias de rodada e os demais (a tabela que o script imprime).

- [ ] **Passo 4: verificação final** — tsc limpo e a suíte verde (os scripts não têm teste; o tsc os cobre).

- [ ] **Passo 5: commit**

```bash
git add scripts/ai-rest-measure.ts scripts/bench-advance-day.ts
git commit -m "chore(seats): medição da folga da IA e bench com dois assentos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 33: Regra `multiplayer.md`, regras afetadas, smoke `--seats 2` e ROADMAP

**Files:**
- Create: `.claude/rules/game/multiplayer.md`
- Modify: `.claude/rules/project-structure.md`, `.claude/rules/game/membership.md`, `.claude/rules/game/jobs.md`,
  `.claude/rules/game/managers.md`, `.claude/rules/game/board-fans.md`, `.claude/rules/game/national-teams.md`,
  `.claude/rules/game/negotiation.md`, `.claude/rules/game/transfers.md`, `.claude/rules/game/finances.md`,
  `.claude/rules/game/fitness.md`, `.claude/rules/game/retirement.md`
- Modify: `scripts/season-rollover-smoke.ts` (flag `--seats 2`)
- Modify: `docs/ROADMAP.md` (linha 43, ~l.125, e o parágrafo ~l.199)

- [ ] **Passo 1: a regra** — `.claude/rules/game/multiplayer.md` com este conteúdo, preenchendo a tabela de medições
  com os números da Tarefa 32:

```markdown
# Multiplayer — parte 1: assentos

Spec: `docs/superpowers/specs/2026-10-14-multiplayer-design.md` (visão geral e §2). Plano:
`docs/superpowers/plans/2026-10-14-multiplayer-seats.md`. Etapa 43 (#106). Sem versão nova: nada visível mudou.

## Regra

- Um save é um **mundo** com N técnicos humanos (**assentos**). O solo é um mundo com um assento (`mode: "solo"`);
  `addSeat` (testes e scripts, `src/backend/seats.ts`) acrescenta assentos (`mode: "multi"`). Convites e tela de mundo
  são a parte 2.
- Um técnico humano por clube; um usuário tem no máximo um assento por mundo (`save_members`).
- A IA nunca age sobre um clube humano: não compra, não vende, não contrata livres, não demite o técnico, não abre
  vaga, não convoca para a base (as convocações são do assento) e nenhum clube humano oferece emprego.
- Cada assento só age sobre o próprio clube; data, ligas, calendário, notícias, árbitros, histórico, prêmios,
  livres, aposentados e o pool da comissão são do mundo.
- Sem migração: saves de antes da parte 1 não têm membros e somem da lista.

## Dados

| Onde | O quê |
|---|---|
| `saves/{id}.json` (`SaveMeta`) | Mundo: `mode`, `seats`, data, ligas ativas, títulos pendentes, pesos e vagas de técnicos, ano da aposentadoria dos livres |
| `saves/{id}/seats/{seatId}/seat.json` (`SeatState`) | O que era do jogador na meta: clube, liga, técnico, preferências, folgas, diretoria, imprensa, banimento, emprego, contrato, caixa (preferências), responsabilidades, decisões do diretor |
| `seats/{seatId}/tactics.json`, `achievements.json`, `scouting.json`, `inbox.json`, `ledger/{temporada}.json`, `market.json` | Tática, conquistas, olheiros, caixa, extrato e a parte humana do mercado (`SeatMarketState`) |
| `saves/{id}/market.json` | Rotação e perfis da IA (`WorldMarketState`) |
| `managers.json` | Técnico humano `seat:<seatId>` com `seatId` |
| `national/state.json` | `human` e `offers` por assento; seleção de um humano com `managerId = "seat:<seatId>"` |
| `retired.json` | `rebornSeatId` na oferta de renascido |
| `transfers.json` | Do mundo, podado na virada; `direction` só na resposta |
| SQLite `save_members(save_id, user_id, seat_id, role)` | `owner` / `member`; o limite de 5 saves conta só os de dono |

`SeatMeta = SaveMeta & SeatState & { seatId }` (`metaForSeat`) é a visão de um assento, com o formato da meta de antes.

## Código

- `requireSeat(req, saveId)` → `{ userId, email, seatId, role }` ou 404; toda rota do técnico age sobre `seatId`, as
  do mundo aceitam qualquer membro. Só o dono apaga o mundo.
- `SaveService`: `getMeta` (mundo), `getSeat`, `getSeatMeta`, `updateSeat`, `listSeats`, `humanClubIds`,
  `seatOfClub`, `insertSeat`; os arquivos do técnico pedem o `seatId` (último parâmetro).
- Avanço do dia (`advanceOneDay`): `loadDaySeats` (`src/backend/daySeats.ts`) dá um `DaySeat` por assento; a IA exclui
  `humanClubSet`; diretoria, imprensa, moral, diretor, comissão, contratos, emprego, contrato do técnico, finanças,
  instalações, olheiros, base, inscrição, seleção, conquistas e mensagens rodam por assento; as gravações ao vivo são
  `Record<seatId, PlayedMatchRecording>`; a virada do país de um assento limpa só a caixa dele; a resposta é
  `payload` (mundo) + `seats[seatId]` (`payloadForSeat`).
- Dois assentos que se enfrentam: motor completo com a tática de cada um (`computeSeatedMatchLineups`); partida ao vivo
  só contra a IA (humano × humano ao vivo é a parte 4).
- Folga: cada assento folga nos seus `restDays`; um clube da IA folga na véspera e no dia seguinte dos próprios jogos
  oficiais (`aiRestingClubs`).

## Medições (Tarefa 32)

| Medição | Antes (main) | Depois |
|---|---|---|
| Folga da IA: parcela de dias de folga entre os dias sem jogo (28 dias, Premier) | | |
| Fôlego médio dos jogadores da IA | | |
| Dias-jogador lesionados | | |
| Custo do dia, `bench-advance-day --buffered --days 14`, 1 assento (rodada / demais) | | |
| Idem com 2 assentos (Premier + La Liga) | | |

## Testes

`bun test src/Domain/seats src/Domain/market/seatMarket.test.ts src/backend/dal/seats.dal.test.ts src/backend/auth src/backend/seats.saveService.test.ts src/backend/saves.seat.routes.test.ts src/backend/worldRoutes.member.test.ts src/backend/daySeats.test.ts src/backend/seats.addSeat.test.ts src/backend/seats.twoSeats.test.ts src/backend/national.seats.test.ts src/Domain/advanceDay/aiRest.test.ts`

Smoke de temporada com dois assentos: `bun scripts/season-rollover-smoke.ts --seats 2` (só quando o usuário pedir).

## Limitações

- Mais assentos em ligas diferentes = mais ligas no motor completo por dia (ver medições).
- `withSaveLock` é local ao processo: um servidor só por mundo.
- Sem convites, "pronto"/prazo, humano × humano ao vivo nem classificação (partes 2–5).
```

  Na tabela, escreva os números medidos nas células vazias (não deixe célula vazia no commit).

- [ ] **Passo 2: regras afetadas** — uma frase ou um parágrafo curto em cada, apontando para `multiplayer.md`:
  - `project-structure.md`: na árvore, `src/backend/daySeats.ts` e `src/backend/seats.ts`; na seção "Save version",
    que o formato mudou na parte 1 sem versão nova (os saves antigos não têm `save_members` e somem da lista).
  - `membership.md`: "Clube do jogador" vira "Clubes dos assentos" (a liga e o clube de cada assento seguem o índice
    na virada do país do assento).
  - `jobs.md`, `board-fans.md`, `negotiation.md`, `finances.md`: o estado do jogador é do assento (diretoria, emprego,
    contrato, mercado, extrato em `seats/{seatId}/`); "o clube do jogador" = "o clube do assento".
  - `managers.md`: o técnico humano é `seat:<seatId>` com `seatId` (no lugar de `id: "player"`/`isPlayer`).
  - `national-teams.md` (técnico do jogador): `human`/`offers` por assento; aceitar fecha as ofertas daquela seleção
    para todos os assentos.
  - `transfers.md`/`negotiation.md`: a IA ignora o conjunto de clubes humanos; os lances pelos jogadores de um
    assento (`humanBidsTick`) saem por assento.
  - `fitness.md`: a folga da IA pela própria agenda (com os números da Tarefa 32).
  - `retirement.md`: a oferta de renascido é do assento (`rebornSeatId`).

- [ ] **Passo 3: smoke `--seats 2`** — em `scripts/season-rollover-smoke.ts`:
  - leia a flag junto das outras: `const SEATS = Math.max(1, parseInt(argValue("--seats") ?? "1", 10) || 1);`;
  - em `createSmokeSave`, depois do kit, quando `SEATS >= 2`, crie o segundo assento num clube da La Liga (ou da
    Bundesliga se a liga do jogador for a La Liga) com `addSeat` e um usuário `devAutoLogin("smoke-seat2@local")`, e
    guarde `seat2 = { seatId, clubId }` numa variável do módulo;
  - acrescente a seção, chamada antes do resumo final de falhas (procure o bloco que imprime `failures.length`):

```ts
async function checkSecondSeat(saveId: string, seat2: { seatId: string; clubId: string }, firstClubId: string, from: string, to: string): Promise<void> {
  console.log("\n── Assentos (--seats 2) ──");
  const svc = plain();
  const seat = await svc.getSeat(saveId, seat2.seatId);
  check(!!seat, "o segundo assento existe");
  check(!!seat?.board && seat.board.board >= 0 && seat.board.board <= 100 && seat.board.fans >= 0 && seat.board.fans <= 100,
    "diretoria e torcida do segundo assento em 0..100");
  let sum = 0;
  for (const season of await svc.listLedgerSeasons(saveId, seat2.seatId)) {
    for (const e of await svc.getLedger(saveId, season, seat2.seatId)) sum += e.amount;
  }
  const squad = await svc.getSquadById(saveId, seat2.clubId);
  check(Math.round(sum) === Math.round(squad?.finances?.budget ?? 0), "extrato do segundo assento = saldo do clube dele");
  check((await svc.getInbox(saveId, seat2.seatId)).length > 0, "caixa de entrada do segundo assento não está vazia");
  const humans = new Set([firstClubId, seat2.clubId]);
  let leaks = 0;
  for (let d = from; d <= to; d = addOneDay(d)) {
    for (const m of (await svc.getDayLog(saveId, d))?.transfers ?? []) if (humans.has(m.from) || humans.has(m.to)) leaks++;
  }
  check(leaks === 0, `a IA nunca negociou com um clube humano (${leaks} movimentos)`);
  const managers = await svc.getManagers(saveId);
  check(managers.filter((m) => m.squadId === seat2.clubId).length === 1 && managers.find((m) => m.squadId === seat2.clubId)?.seatId === seat2.seatId,
    "um técnico, o do assento, no clube do segundo assento");
}
```

    (As movimentações feitas pelas rotas do próprio smoke — compras, vendas, empréstimos do jogador — envolvem o
    primeiro clube de propósito: filtre `kind` `transfer`/`free`/`loan` vindas do mercado da IA, ou só conte
    movimentos que tocam o **segundo** clube se o smoke já negociar com o primeiro. Leia a seção "Negociação" do smoke
    antes e escolha o filtro que não pega as rotas.)
  - Não rode o smoke nesta tarefa (spec §2.4: só quando o usuário pedir); garanta só o `tsc`.

- [ ] **Passo 4: ROADMAP** — linha da etapa 43:
  `| 43 | Multiplayer | #106 | Parte 1 (assentos) feita: o save guarda N técnicos num mundo; partes 2–5 (mundo de amigos, avanço em grupo, humano × humano, competição) a seguir — spec docs/superpowers/specs/2026-10-14-multiplayer-design.md |`;
  no parágrafo "**43–44 · Multiplayer e chat**", uma frase: "a parte 1 (fundação de assentos, sem nada visível) saiu sem
  versão nova; a 2 traz a primeira tela".

- [ ] **Passo 5: verificação final** — tsc limpo e a suíte verde.

- [ ] **Passo 6: commit**

```bash
git add .claude/rules docs/ROADMAP.md scripts/season-rollover-smoke.ts
git commit -m "docs(seats): regra do multiplayer (assentos), regras afetadas, smoke --seats 2 e ROADMAP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Autorrevisão

**Cobertura da spec (§2):**

| Spec | Tarefa(s) |
|---|---|
| §2.1 `SaveMeta.mode`/`seats`; `seat.json` com todos os campos listados | 1 (`SeatState`, `SEAT_KEYS` com checagem de tipo), 4 |
| §2.1 tática, conquistas, olheiros, caixa, extrato, `market.json` do assento | 2, 5 |
| §2.1 o resto é do mundo; campos só do clube humano ficam no squad | 4 (meta), Decisão 4 (mercado), nenhum campo de squad muda |
| §2.1 `managers.json` `seat:<seatId>` | 23 |
| §2.1 `national/state.json` por assento | 24 |
| §2.1 `retired.json` `rebornSeatId` | 18 (gravação), 25 (rotas e expiração) |
| §2.1 `transfers.json` sem zerar, `direction` na resposta | 26 |
| §2.1 `restDays` fora da meta; IA pela própria agenda | 21 |
| §2.1 notícias com os conjuntos dos assentos | 27 |
| §2.1 `save_members`, `listUserSaveIds`, limite só de dono | 3, 6 |
| §2.2 `SeatContext`, `getSeat`/`listSeats`/`updateSeat`, DAL FS + Buffering fase 1 | 1, 2, 4 |
| §2.2 `humanClubIds`, `clubLookup` por assento | 4 (`humanClubIds`, `seatOfClub`), 13 (`seatByClub`); `src/Domain/clubLookup.ts` sai de uso no dia (Tarefa 14) — se sobrar chamador depois da Tarefa 29, troque por `seatOfClub` |
| §2.2 `requireSeat`, rotas do técnico pelo assento, do mundo para membros, `metaForSeat` + `seatId`, `PUT` sem `currentDate` | 6, 7, 8–12 |
| §2.2 avanço do dia: exclusão, laço, partidas (`Record<seatId>`, modo de simulação), virada por assento | 13–20 |
| §2.2 `advance-until` pelo assento | 22 |
| §2.2 frontend `seatId`, `toggleDayType` no assento | 21 (rota), 30 |
| §2.2 `createSave` com o primeiro assento; `addSeat` | 4, 28 |
| §2.4 testes de dois assentos (diretoria, imprensa, salário, caixa, extrato; IA; ações; rotas; virada) | 31 |
| §2.4 medição da folga e do custo do dia; smoke `--seats 2` | 32, 33 |
| §2.5 ordem das fatias | Fatias 1–7 na ordem |
| §2.6 limitações | regra `multiplayer.md` (Tarefa 33) |

**Placeholders:** nenhum passo diz "TBD"/"implementar depois". Os pontos em que o executor precisa ler o código antes
de escrever estão marcados com o que conferir (nome real de um campo, formato de um corpo de rota) e com o critério,
não deixados em aberto. A tabela de medições da regra é preenchida com os números da Tarefa 32 no Passo 1 da
Tarefa 33.

**Consistência de nomes:** `SeatState`, `SeatContext`, `SeatMeta`, `WorldMeta` (só até a Tarefa 29, quando vira
`SaveMeta`), `MemberRole`, `SeatAuth`, `requireSeat`, `metaForSeat`, `splitSeatPatch`, `seatManagerId`,
`WorldMarketState`, `SeatMarketState`, `joinMarket`/`splitMarket`, `DaySeat`, `loadDaySeats`, `humanClubSet`,
`seatByClub`, `SeatWindowRef`/`seatWindowRef`/`windows.seat(seatId)`, `humanBidsTick`, `computeSeatedMatchLineups`,
`resolveSimModeForSeats`, `aiRestingClubs`, `getClubsWithFixtureOn`, `clubRolloverOutcome`,
`applyHumanBroadcastingCredit`, `placeSeatManager`/`managerOfSeat`, `payloadForSeat`, `addSeat`, `ownSolo` — cada um
definido uma vez e usado com a mesma assinatura nas tarefas seguintes. O `seatId` vai no fim dos métodos do
`SaveService` e logo depois do `saveId` nos helpers do backend (Decisão 2).
