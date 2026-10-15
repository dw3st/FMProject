# Multiplayer parte 3: avanço em grupo — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** num mundo `mode: "multi"` em `world.phase === "running"`, cada técnico marca "pronto até" e o servidor avança o mundo sozinho (dia a dia, sem aba aberta) enquanto todos estão prontos, parando no dia de jogo de quem ainda não decidiu (ao vivo ou simular) e seguindo pelo assistente quando o prazo do dono vence.

**Architecture:** a regra do alvo, do prazo e do assistente é pura (`src/Domain/groupAdvance/`), testada sem disco. O executor (`src/backend/groupAdvance.ts`) roda um dia por vez com `runBufferedDay` dentro de `withSaveLock`, relê o alvo a cada dia, aplica as paradas (`payloadForSeat`), guarda o resumo por assento e avisa os membros pelo socket (`world_progress`). As rotas novas ficam em `src/backend/groupAdvanceRoutes.ts` (arquivo próprio, separado das rotas de mundo da parte 2). O cliente troca o Continuar por "Pronto até…" / "Jogar" e mostra a faixa do grupo.

**Tech Stack:** Bun, TypeScript, `bun:test`, React 19, Tailwind v4, i18next, SQLite (`bun:sqlite`), WebSocket do `Bun.serve`.

**Spec:** `docs/superpowers/specs/2026-10-15-multiplayer-group-advance-design.md`. Depende da parte 2 (`docs/superpowers/specs/2026-10-15-multiplayer-world-design.md`), cujo plano roda **antes** deste.

> Tarefa 1 conferida (2026-10-15): `WorldState` em `@/types/multiplayerTypes` (já tem `deadlineHours: WorldDeadline`), `removeSeat` em `src/backend/seats.ts`, rotas em `src/backend/worlds/worldRoutes.ts`, tela `src/GameInterface/World/WorldScreen.tsx`, `listWorldCodeIds()` em `src/backend/worlds/worldStore.ts` (usar na Tarefa 11 em vez de consultar `world_codes`), eventos `world_*` em `socialTypes.ts` (`world_invite`, `world_started`, `world_removed`, `world_deleted`, `world_members`), `notifyWorld`/`notifyUser` em `src/backend/worlds/worldNotify.ts`, `useSocial` expõe `worldVersion` (não há `subscribe`: para `world_progress` na Tarefa 18, estender o mesmo mecanismo). Helper de teste existente: `src/backend/worlds/worldTestUtils.ts` (`callApi`, `TEST_MANAGER`); `fakeWorld` da Tarefa 2 continua necessário.

---

## Pressupostos da parte 2 (conferidos na Tarefa 1)

Este plano usa os nomes abaixo. A Tarefa 1 confere cada um no código que a parte 2 deixou e, se o nome real for outro,
anota no topo deste arquivo e troca em todas as tarefas antes de começar.

| O quê | Nome assumido |
|---|---|
| Estado do mundo | `interface WorldState` em `@/types/multiplayerTypes`, campo `SaveMeta.world?: WorldState` com `phase: "lobby" \| "running"`, `inviteCode`, `deadlineHours: 12 \| 24 \| 48 \| null`, `createdBy` |
| Tabela de códigos | SQLite `world_codes(code, save_id)` |
| Rotas de mundo | `src/backend/worlds/worldRoutes.ts`, com `POST /api/worlds/join`, `/api/worlds/:saveId/start`, `/members/:seatId/remove`, `/leave`, `PUT /settings` |
| Saída de assento | `removeSeat(saveId, seatId)` em `src/backend/seats.ts` |
| Tela da liga | `src/GameInterface/World/WorldScreen.tsx` (página `/world`) com a lista de membros |
| Socket | `ServerEvent` com os `world_*` da parte 2 em `src/types/socialTypes.ts`; `parseServerEvent` em `src/GameInterface/Social/socialState.ts` |
| Inbox | categoria `"world"` em `InboxCategory` (mensagens de entrada/saída de membro) |

`src/backend/worldRoutes.ts` **não existe** (só há o teste `worldRoutes.member.test.ts`, das rotas do mundo da parte 1);
por isso as rotas da parte 3 vão em `groupAdvanceRoutes.ts`, sem conflito com o arquivo da parte 2.

## Interpretações deste plano

1. `readyUntil` guarda a **data em que o mundo para** (o `currentDate` alvo), não o último dia rodado. "Amanhã" = `currentDate + 1` (roda um dia). "Meu próximo jogo" = o dia do jogo `D` (o último dia rodado é a véspera, como a spec pede, e o mundo para **no** dia do jogo). Datas antes de amanhã → 400.
2. Decidir o jogo do dia (`live` ou `simulate`) conta como pronto até `D + 1` (o `readyUntil` sobe para pelo menos `D + 1`); sem isso o técnico teria de marcar de novo logo depois de jogar.
3. O jogo da **seleção** do técnico (Etapa 41b) também é parada de jogo (como já é no avanço rápido); um assento sem clube não para por jogo.
4. O assistente do prazo leva o atrasado até o menor `readyUntil` dos outros (ou amanhã, se ninguém estiver pronto) e decide `simulate` o primeiro jogo dele nesse trecho; o próximo jogo dele é outra parada (e outro prazo).
5. Toda parada começa o prazo (`waitingSince`), inclusive quando todos chegam ao próprio `readyUntil`.
6. Se o dia recusar uma gravação ao vivo (ex. jogador não inscrito), o executor registra o erro, troca a decisão por `simulate` e roda o dia de novo, em vez de travar o mundo.
7. `pendingSummary.json` guarda só a parte do assento de cada dia (`outcome.seats[seatId]`) e as datas; o Painel busca o log do último dia em `/api/saves/:id/days/:date` (o log inteiro de 30 dias passaria de MBs).
8. O "fluxo de 3 assentos, 30 dias" da spec vira o script de medição (Tarefa 24), não um `bun test` (≈ 3 s por dia de mundo).

---

## Mapa de arquivos

**Novos**

| Arquivo | Papel |
|---|---|
| `src/types/groupAdvanceTypes.ts` | `MatchDecision`, `WorldAdvance`, `LiveRecordingFile`, `PendingDay`, `GroupAdvanceView`, `MemberAdvanceStatus` |
| `src/Domain/groupAdvance/groupAdvanceConfig.ts` | Constantes (`GROUP_ADVANCE`) |
| `src/Domain/groupAdvance/groupAdvance.ts` (+ teste) | Puro: `isGroupWorld`, `resolveReadyUntil`, `seatLimit`, `computeGroupTarget`, `memberStatus`, `deadlineAt`, `deadlinePassed`, `assistantPatches`, `seatStops`, `laterDate` |
| `src/Domain/inbox/worldAdvanceMessage.ts` (+ teste) | `buildAutoAdvancedMessage` |
| `src/backend/playedMatchValidation.ts` (+ teste) | `validatePlayedMatch`, `knockoutRecordingDecided` (tirados da rota `/api/advance-day`) |
| `src/backend/groupAdvance.ts` | Executor: `kickWorld`, `scheduleKick`, `setKickScheduler`, `seatMatchOn`, `groupAdvanceView`, `worldClockTick`, `resumeWorlds`, `startWorldClock` |
| `src/backend/groupAdvance.test.ts` | Executor com `runDay` falso (rápido) |
| `src/backend/groupAdvance.live.test.ts` | Executor com dias de verdade (gravação ao vivo, 3 dias; Tarefa 14) |
| `src/backend/groupAdvanceRoutes.ts` (+ `groupAdvance.routes.test.ts`) | `/api/worlds/:saveId/{ready,match-decision,live-recording,advance,summary}` |
| `src/backend/testing/worldFixtures.ts` | `fakeWorld`, `runningWorld` (testes) |
| `src/GameInterface/World/groupAdvanceApi.ts` | Chamadas das rotas |
| `src/GameInterface/World/groupAdvanceText.ts` (+ teste) | Puro de tela: prazo restante, desfecho do resumo |
| `src/GameInterface/World/GroupAdvanceProvider.tsx` | Contexto: estado do grupo, socket, resumo pendente, modais |
| `src/GameInterface/World/ReadyControl.tsx` | Botão da barra superior (Pronto até… / Jogar / Simular) |
| `src/GameInterface/World/GroupAdvanceBand.tsx` | Faixa do grupo e status por membro |
| `src/i18n/groupAdvance.keys.test.ts` | Chaves `world.advance.*` nas duas línguas |
| `scripts/group-advance-measure.ts` | Medição e fluxo de 3 assentos |

**Alterados**

`src/types/seatTypes.ts` · `src/types/socialTypes.ts` · `src/types/inboxTypes.ts` · `src/backend/dal/ISaveDAL.ts` · `src/backend/dal/FileSystemDAL.ts` · `src/backend/dal/BufferingSaveDAL.ts` · `src/backend/dal/seats.dal.test.ts` · `src/backend/SaveService.ts` · `src/backend/advanceDay.ts` · `src/backend/advanceUntil.ts` · `src/backend/nationalCoachWorld.ts` · `src/backend/routes.ts` · `src/backend/worlds/worldRoutes.ts` (parte 2) · `src/index.ts` · `src/Domain/inbox/inboxTopics.ts` · `src/Domain/inbox/inboxThemes.ts` · `src/GameInterface/gameSession.ts` · `src/GameInterface/Social/useSocial.tsx` · `src/GameInterface/Social/socialState.ts` · `src/GameInterface/useAdvanceDay.ts` · `src/GameInterface/Components/Layout.tsx` · `src/GameInterface/Components/TopNavigation.tsx` · `src/GameInterface/DashboardScreen.tsx` · `src/GameInterface/World/WorldScreen.tsx` (parte 2) · `src/GameInterface/MatchScreen.tsx` · `src/GameInterface/MatchPreviewScreen.tsx` · `src/GameInterface/MatchResultScreen.tsx` · `src/GameInterface/InboxScreen.tsx` · `src/i18n/locales/en.json` · `src/i18n/locales/pt-BR.json` · `scripts/ui-audit.ts` · `.claude/rules/game/multiplayer.md`

**Convenções:** imports sempre `@/`; os arquivos do repositório estão em CRLF no disco (`core.autocrlf=true`): edite com a ferramenta Edit, nunca `sed -i`; sem migração de save; testes de backend usam `createSave`/`addSeat` só onde precisam de dias de verdade.

---

## Tarefa 1: Conferir o que a parte 2 deixou

**Files:** nenhum código; só a anotação no topo deste plano, se algo mudar.

- [ ] **Step 1: Conferir os nomes da tabela "Pressupostos"**

```bash
cd /c/Projects/FMProject-mpw
grep -rn "interface WorldState" src
grep -rn "world_codes" src/backend | head
ls src/backend | grep -i world
grep -rn "export async function removeSeat" src/backend
grep -rn "\"/api/worlds" src/backend | head -20
ls src/GameInterface/World 2>/dev/null
grep -n "world_" src/types/socialTypes.ts
grep -n "\"world\"" src/types/inboxTypes.ts src/Domain/inbox/inboxTopics.ts src/Domain/inbox/inboxThemes.ts
grep -rn "subscribe" src/GameInterface/Social/useSocial.tsx
grep -rn "groupAdvance\|world?" src/GameInterface/gameSession.ts
```

Esperado: cada nome da tabela existe. Para cada divergência, escreva no topo deste arquivo uma linha
`> Nome real: <assumido> → <real>` e use o nome real nas tarefas seguintes. Se a parte 2 já tiver:
- um jeito de assinar eventos do socket no cliente (ex. `onWorldEvent`), use-o na Tarefa 18 em vez de criar `subscribe`;
- um helper de teste de mundo (ex. em `src/backend/testing/`), use-o na Tarefa 2 em vez de `fakeWorld`;
- uma função que lista os mundos (ex. `listWorldSaveIds()`), use-a na Tarefa 11 (`loadKnownWorlds`) em vez da consulta a `world_codes`.

Confira também que `seatNextMatchDate`/`seatMatchOn` (Tarefas 8 e 11) não lançam num save sem pastas de liga (o
`fakeWorld` dos testes de rota): se algum leitor lançar, envolva a chamada em `groupAdvanceView` com `try/catch` → `null`.

- [ ] **Step 2: Linha de base**

```bash
bun test src/backend/seats.twoSeats.test.ts src/backend/seats.review.test.ts src/backend/advanceUntil.test.ts
bunx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Esperado: testes passando; o `tsc` mostra só o erro antigo em `src/GameEngine/Domain/DecisionTree.ts:750` (anote a
contagem: ela é a referência dos marcos de verificação).

---

## Tarefa 2: Tipos do avanço em grupo

**Files:**
- Create: `src/types/groupAdvanceTypes.ts`
- Create: `src/backend/testing/worldFixtures.ts`
- Modify: `src/types/seatTypes.ts`
- Test: `src/Domain/seats/seats.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente ao fim de `src/Domain/seats/seats.test.ts`:

```ts
import { splitSeatPatch } from "@/Domain/seats/seats";

describe("group advance fields are seat fields (part 3)", () => {
  test("readyUntil and matchDecision go to the seat", () => {
    const { world, seat } = splitSeatPatch({
      readyUntil: "2027-03-12",
      matchDecision: { date: "2027-03-12", fixtureId: "f1", mode: "simulate" },
    });
    expect(world).toEqual({});
    expect(seat).toEqual({
      readyUntil: "2027-03-12",
      matchDecision: { date: "2027-03-12", fixtureId: "f1", mode: "simulate" },
    });
  });
});
```

(Se `describe`/`test`/`expect` ainda não estiverem importados do `bun:test` no arquivo, mantenha o import que já existe.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/seats/seats.test.ts`
Esperado: FAIL (erro de tipo/`readyUntil` vai para `world`).

- [ ] **Step 3: Tipos**

Crie `src/types/groupAdvanceTypes.ts`:

```ts
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";

/** The seat's own game of day `date` already settled (`.claude/rules/game/multiplayer.md`, part 3). */
export interface MatchDecision {
  date: string;
  fixtureId: string;
  mode: "live" | "simulate";
}

/** The world's group advance (`SaveMeta.world.advance`). */
export interface WorldAdvance {
  /** An executor is running days. */
  running: boolean;
  /** Real-time ISO of the stop the world is waiting on (the deadline counts from it); null while it runs. */
  waitingSince: string | null;
  /** The date the current/last advance aims at. */
  target: string | null;
}

/** `seats/{seatId}/liveRecording.json`: the seat's live match of `date`, kept until the executor runs that day. */
export interface LiveRecordingFile {
  date: string;
  fixtureId: string;
  recording: PlayedMatchRecording;
}

/** One day the executor ran while the seat was away (`seats/{seatId}/pendingSummary.json`). */
export interface PendingDay {
  /** The day that ran. */
  date: string;
  /** The world's date after it. */
  newDate: string;
  /** The seat's part of the day (`outcome.seats[seatId]`: seasonEnded, sacked, jobOffers…). */
  seat: Record<string, unknown>;
}

export type MemberAdvanceStatus = "ready" | "match" | "late" | "no_club";

export interface GroupMemberView {
  seatId: string;
  nickname: string | null;
  managerName: string;
  clubName: string;
  status: MemberAdvanceStatus;
  readyUntil: string | null;
  me: boolean;
}

/** `GET /api/worlds/:saveId/advance`. */
export interface GroupAdvanceView {
  currentDate: string;
  target: string | null;
  running: boolean;
  deadlineHours: 12 | 24 | 48 | null;
  /** When the world goes on without the late ones (ISO), or null. */
  deadlineAt: string | null;
  /** Nicknames (or manager names) holding the world. */
  waitingFor: string[];
  members: GroupMemberView[];
  me: {
    readyUntil: string | null;
    /** The seat's game today, still to decide or decided. */
    matchToday: { fixtureId: string; humanOpponent: boolean } | null;
    decision: MatchDecision | null;
  };
}
```

Em `src/types/seatTypes.ts`, acrescente o import e os campos ao `SeatState` (depois de `directorDecisions?`):

```ts
import type { MatchDecision } from "@/types/groupAdvanceTypes";
```

```ts
  /** Group advance (part 3): the date the seat lets the world reach without him; null = not ready. */
  readyUntil?: string | null;
  /** Group advance (part 3): his game of `date` already settled (live recording kept, or simulate). */
  matchDecision?: MatchDecision;
```

e em `SEAT_KEYS`, depois de `"directorDecisions"`:

```ts
  "readyUntil", "matchDecision",
```

No `WorldState` da parte 2 (Tarefa 1), acrescente:

```ts
import type { WorldAdvance } from "@/types/groupAdvanceTypes";
```

```ts
  /** Group advance (part 3). Absent until the first stop. */
  advance?: WorldAdvance;
```

- [ ] **Step 4: Helper de teste**

Crie `src/backend/testing/worldFixtures.ts`:

```ts
import { randomUUID } from "crypto";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import type { SaveMeta } from "@/backend/SaveService";
import type { SeatState } from "@/types/seatTypes";
import type { WorldState } from "@/types/multiplayerTypes";

/** Tests: a running world (`SaveMeta.world`, part 2) with the given overrides. */
export function runningWorld(createdBy: string, over: Partial<WorldState> = {}): WorldState {
  return { phase: "running", inviteCode: "ABCDEFGHJK", deadlineHours: 24, createdBy, ...over };
}

/**
 * Tests: a bare multi world on disk (meta + one seat.json per id), no league data. Fast; enough for the executor with a
 * fake `runDay` and for the routes that never read fixtures. Delete with `saveService.deleteSave`.
 */
export async function fakeWorld(args: {
  seatIds: string[];
  date: string;
  world?: Partial<WorldState> | null;
  seats?: Record<string, Partial<SeatState>>;
  mode?: "solo" | "multi";
}): Promise<string> {
  const dal = new FileSystemDAL();
  const id = `test-ga-${randomUUID()}`;
  const now = new Date().toISOString();
  const meta = {
    id, name: "Group advance test", createdAt: now, updatedAt: now,
    mode: args.mode ?? "multi", seats: args.seatIds, currentDate: args.date,
    ...(args.world === null ? {} : { world: runningWorld("test-user", args.world ?? {}) }),
  } as SaveMeta;
  await dal.writeMeta(meta);
  for (const seatId of args.seatIds) {
    await dal.writeSeat(id, seatId, {
      clubId: `club-${seatId}`, clubName: `Club ${seatId}`, clubColors: ["#000000", "#ffffff"],
      leagueSlug: "premier_league", leagueName: "Premier League",
      manager: { name: `Manager ${seatId}`, nationalityIso: "br", backgroundId: "former-player" },
      ...(args.seats?.[seatId] ?? {}),
    });
  }
  return id;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test src/Domain/seats/seats.test.ts`
Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/groupAdvanceTypes.ts src/types/seatTypes.ts src/backend/testing/worldFixtures.ts src/Domain/seats/seats.test.ts
git commit -m "feat(group-advance): tipos do avanço em grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 3: Puro — "pronto até"

**Files:**
- Create: `src/Domain/groupAdvance/groupAdvanceConfig.ts`
- Create: `src/Domain/groupAdvance/groupAdvance.ts`
- Test: `src/Domain/groupAdvance/groupAdvance.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { isGroupWorld, laterDate, resolveReadyUntil } from "@/Domain/groupAdvance/groupAdvance";

describe("isGroupWorld", () => {
  test("only a multi world with a world state", () => {
    expect(isGroupWorld({ mode: "multi", world: { phase: "running" } })).toBe(true);
    expect(isGroupWorld({ mode: "multi", world: { phase: "lobby" } })).toBe(true);
    expect(isGroupWorld({ mode: "multi" })).toBe(false);
    expect(isGroupWorld({ mode: "solo" })).toBe(false);
  });
});

describe("resolveReadyUntil", () => {
  const today = "2027-03-10";
  test("null unmarks", () => {
    expect(resolveReadyUntil(null, today, null)).toEqual({ ok: true, readyUntil: null });
  });
  test("tomorrow is one day", () => {
    expect(resolveReadyUntil("tomorrow", today, "2027-03-14")).toEqual({ ok: true, readyUntil: "2027-03-11" });
  });
  test("next_match stops ON the match day", () => {
    expect(resolveReadyUntil("next_match", today, "2027-03-14")).toEqual({ ok: true, readyUntil: "2027-03-14" });
  });
  test("next_match without a match is tomorrow", () => {
    expect(resolveReadyUntil("next_match", today, null)).toEqual({ ok: true, readyUntil: "2027-03-11" });
  });
  test("a date from tomorrow on", () => {
    expect(resolveReadyUntil("2027-03-20", today, null)).toEqual({ ok: true, readyUntil: "2027-03-20" });
  });
  test("today, the past, an impossible date, a far date and garbage are refused", () => {
    for (const bad of ["2027-03-10", "2027-03-01", "2027-02-30", "2029-01-01", "soon", 42, undefined]) {
      expect(resolveReadyUntil(bad, today, null)).toEqual({ ok: false, error: "invalidDate" });
    }
  });
});

describe("laterDate", () => {
  test("the later of two dates, null-safe", () => {
    expect(laterDate("2027-03-11", "2027-03-12")).toBe("2027-03-12");
    expect(laterDate(null, "2027-03-12")).toBe("2027-03-12");
    expect(laterDate(undefined, "2027-03-12")).toBe("2027-03-12");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/groupAdvance/groupAdvance.test.ts`
Esperado: FAIL (módulo não existe).

- [ ] **Step 3: Implementação**

`src/Domain/groupAdvance/groupAdvanceConfig.ts`:

```ts
/** Group advance (multiplayer part 3, `.claude/rules/game/multiplayer.md`). */
export const GROUP_ADVANCE = {
  /** Furthest "ready until" a manager can pick, in game days. */
  MAX_READY_DAYS: 400,
  /** Safety cap of days one executor run may advance. */
  MAX_DAYS_PER_RUN: 400,
  /** Real-time interval of the deadline clock. */
  CLOCK_MS: 60_000,
  /** Days kept in a seat's pending summary. */
  PENDING_SUMMARY_MAX: 120,
} as const;
```

`src/Domain/groupAdvance/groupAdvance.ts`:

```ts
import { addDays, isRealIsoDate } from "@/Domain/dates";
import { GROUP_ADVANCE } from "@/Domain/groupAdvance/groupAdvanceConfig";

/** A world advanced by the group (part 3): multi with a world state (lobby or running). */
export function isGroupWorld(meta: { mode: string; world?: unknown }): boolean {
  return meta.mode === "multi" && !!meta.world;
}

/** The later of two dates (`undefined`/`null` lose). */
export function laterDate(a: string | null | undefined, b: string): string {
  return a && a > b ? a : b;
}

export type ResolveReady = { ok: true; readyUntil: string | null } | { ok: false; error: "invalidDate" };

/**
 * `POST /ready` body → the stop date. `next_match` stops ON the seat's next game after today (the eve is the last day
 * run); without one it is tomorrow. A date must be real, from tomorrow on, at most `MAX_READY_DAYS` ahead.
 */
export function resolveReadyUntil(req: unknown, currentDate: string, nextMatchAfterToday: string | null): ResolveReady {
  if (req === null) return { ok: true, readyUntil: null };
  const tomorrow = addDays(currentDate, 1);
  if (req === "tomorrow") return { ok: true, readyUntil: tomorrow };
  if (req === "next_match") return { ok: true, readyUntil: laterDate(nextMatchAfterToday, tomorrow) };
  if (typeof req !== "string" || !isRealIsoDate(req)) return { ok: false, error: "invalidDate" };
  if (req < tomorrow || req > addDays(currentDate, GROUP_ADVANCE.MAX_READY_DAYS)) return { ok: false, error: "invalidDate" };
  return { ok: true, readyUntil: req };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/groupAdvance/groupAdvance.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/groupAdvance
git commit -m "feat(group-advance): pronto até (regra pura)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 4: Puro — alvo do grupo e status por membro

**Files:**
- Modify: `src/Domain/groupAdvance/groupAdvance.ts`
- Test: `src/Domain/groupAdvance/groupAdvance.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente:

```ts
import { computeGroupTarget, memberStatus, type GroupSeatInput } from "@/Domain/groupAdvance/groupAdvance";

const seat = (seatId: string, over: Partial<GroupSeatInput> = {}): GroupSeatInput => ({
  seatId, readyUntil: null, nextMatch: null, decisionDate: null, unemployed: false, ...over,
});

describe("computeGroupTarget", () => {
  const today = "2027-03-10";
  test("the smallest ready date of all seats", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-14" }), seat("b", { readyUntil: "2027-03-12" })]);
    expect(plan).toEqual({ target: "2027-03-12", waitingFor: [], matchWaiting: [] });
  });
  test("a seat not ready holds the world today", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-14" }), seat("b")]);
    expect(plan).toEqual({ target: today, waitingFor: ["b"], matchWaiting: [] });
  });
  test("a readyUntil in the past counts as not ready", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-09" })]);
    expect(plan.waitingFor).toEqual(["a"]);
  });
  test("an undecided game stops ON its day", () => {
    const plan = computeGroupTarget(today, [
      seat("a", { readyUntil: "2027-03-20", nextMatch: "2027-03-13" }),
      seat("b", { readyUntil: "2027-03-20" }),
    ]);
    expect(plan.target).toBe("2027-03-13");
  });
  test("an undecided game today holds the world and is a match wait", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-20", nextMatch: today })]);
    expect(plan).toEqual({ target: today, waitingFor: ["a"], matchWaiting: ["a"] });
  });
  test("a decided game does not stop", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-20", nextMatch: today, decisionDate: today })]);
    expect(plan.target).toBe("2027-03-20");
  });
  test("an unemployed seat has no game stop but still needs a date", () => {
    expect(computeGroupTarget(today, [seat("a", { unemployed: true, nextMatch: today, readyUntil: "2027-03-15" })]).target)
      .toBe("2027-03-15");
    expect(computeGroupTarget(today, [seat("a", { unemployed: true })]).waitingFor).toEqual(["a"]);
  });
  test("no seats: no target", () => {
    expect(computeGroupTarget(today, [])).toEqual({ target: today, waitingFor: [], matchWaiting: [] });
  });
});

describe("memberStatus", () => {
  const today = "2027-03-10";
  test("ready, match, late, no club", () => {
    expect(memberStatus(seat("a", { readyUntil: "2027-03-12" }), today)).toBe("ready");
    expect(memberStatus(seat("a", { readyUntil: "2027-03-12", nextMatch: today }), today)).toBe("match");
    expect(memberStatus(seat("a"), today)).toBe("late");
    expect(memberStatus(seat("a", { unemployed: true }), today)).toBe("no_club");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/groupAdvance/groupAdvance.test.ts`
Esperado: FAIL (`computeGroupTarget` não existe).

- [ ] **Step 3: Implementação**

Acrescente a `groupAdvance.ts`:

```ts
import type { MemberAdvanceStatus } from "@/types/groupAdvanceTypes";

/** One seat as the group target sees it. */
export interface GroupSeatInput {
  seatId: string;
  /** Stop date the seat accepts; null/absent or ≤ today = not ready. */
  readyUntil: string | null | undefined;
  /** The seat's next unplayed official game (club or national) on or after today; null when none or unemployed. */
  nextMatch: string | null;
  /** Date of his settled game (`matchDecision.date`), or null. */
  decisionDate: string | null;
  unemployed: boolean;
}

export interface GroupPlan {
  /** The `currentDate` the world advances to (days before it run). */
  target: string;
  /** Seats holding the world today (empty while it can run). */
  waitingFor: string[];
  /** The ones of `waitingFor` held by a game of today to decide. */
  matchWaiting: string[];
}

/** The seat's own stop date and whether today's undecided game is what stops him. */
export function seatLimit(s: GroupSeatInput, currentDate: string): { limit: string; matchToday: boolean } {
  const ready = s.readyUntil && s.readyUntil > currentDate ? s.readyUntil : currentDate;
  const matchStop = !s.unemployed && s.nextMatch && s.nextMatch >= currentDate && s.decisionDate !== s.nextMatch
    ? s.nextMatch
    : null;
  const limit = matchStop && matchStop < ready ? matchStop : ready;
  return { limit, matchToday: matchStop === currentDate };
}

/** `target = min(stop of every seat)`; when it is today, the seats at today hold the world. */
export function computeGroupTarget(currentDate: string, seats: readonly GroupSeatInput[]): GroupPlan {
  if (seats.length === 0) return { target: currentDate, waitingFor: [], matchWaiting: [] };
  const limits = seats.map((s) => ({ seatId: s.seatId, ...seatLimit(s, currentDate) }));
  const target = limits.reduce((min, l) => (l.limit < min ? l.limit : min), limits[0]!.limit);
  const blocking = target <= currentDate ? limits.filter((l) => l.limit <= currentDate) : [];
  return {
    target,
    waitingFor: blocking.map((l) => l.seatId),
    matchWaiting: blocking.filter((l) => l.matchToday).map((l) => l.seatId),
  };
}

/** Status of a member on the league screen. */
export function memberStatus(s: GroupSeatInput, currentDate: string): MemberAdvanceStatus {
  if (s.unemployed) return "no_club";
  const { limit, matchToday } = seatLimit(s, currentDate);
  if (matchToday) return "match";
  return limit > currentDate ? "ready" : "late";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/groupAdvance/groupAdvance.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/groupAdvance
git commit -m "feat(group-advance): alvo do grupo e status por membro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 5: Puro — prazo, assistente e paradas do dia

**Files:**
- Modify: `src/Domain/groupAdvance/groupAdvance.ts`
- Test: `src/Domain/groupAdvance/groupAdvance.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { assistantPatches, deadlineAt, deadlinePassed, seatStops } from "@/Domain/groupAdvance/groupAdvance";

describe("deadline", () => {
  const since = "2027-01-01T10:00:00.000Z";
  test("deadlineAt adds the hours; null without a deadline or a wait", () => {
    expect(deadlineAt(since, 24)).toBe("2027-01-02T10:00:00.000Z");
    expect(deadlineAt(since, null)).toBeNull();
    expect(deadlineAt(null, 24)).toBeNull();
  });
  test("deadlinePassed from the exact instant", () => {
    expect(deadlinePassed(since, 12, Date.parse("2027-01-01T21:59:59.000Z"))).toBe(false);
    expect(deadlinePassed(since, 12, Date.parse("2027-01-01T22:00:00.000Z"))).toBe(true);
    expect(deadlinePassed(since, null, Date.parse("2030-01-01T00:00:00.000Z"))).toBe(false);
    expect(deadlinePassed(null, 12, Date.parse("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("assistantPatches", () => {
  const today = "2027-03-10";
  test("the late seat goes to the others' smallest stop and simulates his game in it", () => {
    const seats = [
      seat("a", { readyUntil: "2027-03-15" }),
      seat("b", { readyUntil: "2027-03-13" }),
      seat("late", { nextMatch: "2027-03-12" }),
    ];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-13", decisionDate: "2027-03-12" }]);
  });
  test("nobody ready: tomorrow; a game today is simulated", () => {
    const seats = [seat("a", { nextMatch: today }), seat("b")];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([
      { seatId: "a", readyUntil: "2027-03-11", decisionDate: today },
      { seatId: "b", readyUntil: "2027-03-11", decisionDate: null },
    ]);
  });
  test("a game on the stop date is not decided (it is the next stop)", () => {
    const seats = [seat("a", { readyUntil: "2027-03-13" }), seat("late", { nextMatch: "2027-03-13" })];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-13", decisionDate: null }]);
  });
});

describe("seatStops", () => {
  test("sacked, job or national offers, season end", () => {
    expect(seatStops({ sacked: true })).toBe(true);
    expect(seatStops({ jobOffers: 1 })).toBe(true);
    expect(seatStops({ seasonEnded: true })).toBe(true);
    expect(seatStops({ jobOffers: 0, pressInvite: true })).toBe(false);
    expect(seatStops({})).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/groupAdvance/groupAdvance.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

```ts
const HOUR_MS = 3_600_000;

/** When the world goes on without the late ones, or null (no deadline, or not waiting). */
export function deadlineAt(waitingSince: string | null, hours: number | null): string | null {
  if (!waitingSince || hours == null) return null;
  return new Date(Date.parse(waitingSince) + hours * HOUR_MS).toISOString();
}

export function deadlinePassed(waitingSince: string | null, hours: number | null, nowMs: number): boolean {
  const at = deadlineAt(waitingSince, hours);
  return at !== null && nowMs >= Date.parse(at);
}

export interface AssistantPatch {
  seatId: string;
  readyUntil: string;
  /** The game the assistant simulates for him (the executor finds the fixture), or null. */
  decisionDate: string | null;
}

/**
 * Deadline passed: each late seat goes to the smallest stop of the seats that are ready (tomorrow when nobody is) and
 * the assistant simulates his first game before that stop. A game ON the stop date is the next stop.
 */
export function assistantPatches(currentDate: string, seats: readonly GroupSeatInput[], plan: GroupPlan): AssistantPatch[] {
  const late = new Set(plan.waitingFor);
  const others = seats.filter((s) => !late.has(s.seatId)).map((s) => seatLimit(s, currentDate).limit);
  const tomorrow = addDays(currentDate, 1);
  const until = laterDate(others.length > 0 ? others.reduce((m, d) => (d < m ? d : m)) : null, tomorrow);
  return seats.filter((s) => late.has(s.seatId)).map((s) => ({
    seatId: s.seatId,
    readyUntil: until,
    decisionDate: !s.unemployed && s.nextMatch && s.nextMatch >= currentDate && s.nextMatch < until
      && s.decisionDate !== s.nextMatch ? s.nextMatch : null,
  }));
}

/** The seat's part of a day asks him to look before the world goes on: sacked, a job/national offer, his season end. */
export function seatStops(part: Record<string, unknown>): boolean {
  return part.sacked === true
    || (typeof part.jobOffers === "number" && part.jobOffers > 0)
    || part.seasonEnded === true;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/groupAdvance/groupAdvance.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/groupAdvance
git commit -m "feat(group-advance): prazo, assistente e paradas do dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 6: Arquivos do assento — gravação ao vivo e resumo pendente

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts`, `src/backend/dal/FileSystemDAL.ts`, `src/backend/dal/BufferingSaveDAL.ts`, `src/backend/SaveService.ts`
- Test: `src/backend/dal/seats.dal.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente a `src/backend/dal/seats.dal.test.ts`:

```ts
import type { LiveRecordingFile, PendingDay } from "@/types/groupAdvanceTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";

describe("group advance seat files", () => {
  test("liveRecording.json round-trips and null deletes it; pendingSummary.json defaults to []", async () => {
    const saveId = `test-seat-${randomUUID()}`;
    created.push(saveId);
    const seatId = randomUUID();
    await dal.writeSeat(saveId, seatId, seat);
    expect(await dal.readSeatLiveRecording(saveId, seatId)).toBeNull();
    const file: LiveRecordingFile = {
      date: "2027-03-10", fixtureId: "f1",
      recording: { fixtureId: "f1", score: { home: 1, away: 0 } } as unknown as PlayedMatchRecording,
    };
    await dal.writeSeatLiveRecording(saveId, seatId, file);
    expect(await dal.readSeatLiveRecording(saveId, seatId)).toEqual(file);
    await dal.writeSeatLiveRecording(saveId, seatId, null);
    expect(await dal.readSeatLiveRecording(saveId, seatId)).toBeNull();
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${saveId}/seats/${seatId}/liveRecording.json`).exists()).toBe(false);

    expect(await dal.readSeatPendingSummary(saveId, seatId)).toEqual([]);
    const days: PendingDay[] = [{ date: "2027-03-10", newDate: "2027-03-11", seat: { sacked: true } }];
    await dal.writeSeatPendingSummary(saveId, seatId, days);
    expect(await dal.readSeatPendingSummary(saveId, seatId)).toEqual(days);
  });

  test("the BufferingSaveDAL holds them until flush", async () => {
    const saveId = `test-seat-${randomUUID()}`;
    created.push(saveId);
    const seatId = randomUUID();
    await dal.writeSeat(saveId, seatId, seat);
    const buffered = new BufferingSaveDAL(dal);
    await buffered.writeSeatPendingSummary(saveId, seatId, [{ date: "2027-03-10", newDate: "2027-03-11", seat: {} }]);
    expect(await dal.readSeatPendingSummary(saveId, seatId)).toEqual([]);
    expect((await buffered.readSeatPendingSummary(saveId, seatId)).length).toBe(1);
    await buffered.flush();
    expect((await dal.readSeatPendingSummary(saveId, seatId)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/dal/seats.dal.test.ts`
Esperado: FAIL (métodos inexistentes).

- [ ] **Step 3: Interface e implementações**

`ISaveDAL.ts`, no bloco "Seats":

```ts
  readSeatLiveRecording(saveId: string, seatId: string): Promise<LiveRecordingFile | null>;
  /** `null` deletes the file. */
  writeSeatLiveRecording(saveId: string, seatId: string, file: LiveRecordingFile | null): Promise<void>;
  readSeatPendingSummary(saveId: string, seatId: string): Promise<PendingDay[]>;
  writeSeatPendingSummary(saveId: string, seatId: string, days: PendingDay[]): Promise<void>;
```

com `import type { LiveRecordingFile, PendingDay } from "@/types/groupAdvanceTypes";`.

`FileSystemDAL.ts` (depois de `writeSeatMarket`; `rm` já é importado de `fs/promises`):

```ts
  async readSeatLiveRecording(saveId: string, seatId: string): Promise<LiveRecordingFile | null> {
    return readJsonFile<LiveRecordingFile>(`${seatDir(saveId, seatId)}/liveRecording.json`);
  }

  async writeSeatLiveRecording(saveId: string, seatId: string, file: LiveRecordingFile | null): Promise<void> {
    const dir = seatDir(saveId, seatId);
    if (file === null) {
      await rm(`${dir}/liveRecording.json`, { force: true });
      return;
    }
    await writeJsonFile(dir, `${dir}/liveRecording.json`, file);
  }

  async readSeatPendingSummary(saveId: string, seatId: string): Promise<PendingDay[]> {
    return (await readJsonFile<PendingDay[]>(`${seatDir(saveId, seatId)}/pendingSummary.json`)) ?? [];
  }

  async writeSeatPendingSummary(saveId: string, seatId: string, days: PendingDay[]): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/pendingSummary.json`, days);
  }
```

`BufferingSaveDAL.ts` (depois de `writeSeatMarket`):

```ts
  readSeatLiveRecording(saveId: string, seatId: string): Promise<LiveRecordingFile | null> {
    return this.readThrough(`seatLive:${saveId}:${seatId}`, () => this.inner.readSeatLiveRecording(saveId, seatId));
  }
  async writeSeatLiveRecording(saveId: string, seatId: string, file: LiveRecordingFile | null): Promise<void> {
    this.buffer(`seatLive:${saveId}:${seatId}`, file, () => this.inner.writeSeatLiveRecording(saveId, seatId, file));
  }
  readSeatPendingSummary(saveId: string, seatId: string): Promise<PendingDay[]> {
    return this.readThrough(`seatPending:${saveId}:${seatId}`, () => this.inner.readSeatPendingSummary(saveId, seatId));
  }
  async writeSeatPendingSummary(saveId: string, seatId: string, days: PendingDay[]): Promise<void> {
    this.buffer(`seatPending:${saveId}:${seatId}`, days, () => this.inner.writeSeatPendingSummary(saveId, seatId, days));
  }
```

`SaveService.ts` (perto de `getAchievements`):

```ts
  // ── Group advance (`.claude/rules/game/multiplayer.md`, part 3) ─────────────
  getLiveRecording(saveId: string, seatId: string): Promise<LiveRecordingFile | null> {
    return this.dal.readSeatLiveRecording(saveId, seatId);
  }

  writeLiveRecording(saveId: string, seatId: string, file: LiveRecordingFile | null): Promise<void> {
    return this.dal.writeSeatLiveRecording(saveId, seatId, file);
  }

  getPendingSummary(saveId: string, seatId: string): Promise<PendingDay[]> {
    return this.dal.readSeatPendingSummary(saveId, seatId);
  }

  /** Appends one day to the seat's pending summary, keeping the last `max`. */
  async appendPendingDay(saveId: string, seatId: string, day: PendingDay, max: number): Promise<void> {
    const days = await this.dal.readSeatPendingSummary(saveId, seatId);
    await this.dal.writeSeatPendingSummary(saveId, seatId, [...days, day].slice(-max));
  }

  clearPendingSummary(saveId: string, seatId: string): Promise<void> {
    return this.dal.writeSeatPendingSummary(saveId, seatId, []);
  }
```

com `import type { LiveRecordingFile, PendingDay } from "@/types/groupAdvanceTypes";`.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/dal/seats.dal.test.ts src/backend/dal/BufferingSaveDAL.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/dal src/backend/SaveService.ts
git commit -m "feat(group-advance): gravação ao vivo e resumo pendente por assento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 7: Validação da gravação ao vivo em um lugar só

**Files:**
- Create: `src/backend/playedMatchValidation.ts`
- Modify: `src/backend/advanceDay.ts` (rota `/api/advance-day/:saveId` e o bloco da gravação em `advanceOneDay`)
- Test: `src/backend/playedMatchValidation.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";
import type { Fixture } from "@/types/calendarTypes";

const ok = {
  fixtureId: "f1", score: { home: 1, away: 1 },
  teamStats: { home: {}, away: {} }, playerStats: { p1: {} }, playerRatings: {}, playerEnergy: { p1: 80 },
  substitutions: [], durationMs: 5,
};

describe("validatePlayedMatch", () => {
  test("a well-formed recording passes", () => {
    expect(validatePlayedMatch(ok)?.fixtureId).toBe("f1");
  });
  test("missing parts or an energy hole fail", () => {
    expect(validatePlayedMatch(null)).toBeNull();
    expect(validatePlayedMatch({ ...ok, score: { home: "1", away: 0 } })).toBeNull();
    expect(validatePlayedMatch({ ...ok, playerEnergy: {} })).toBeNull();
    expect(validatePlayedMatch({ ...ok, durationMs: undefined })).toBeNull();
  });
});

describe("knockoutRecordingDecided", () => {
  const league = { id: "f1", knockout: undefined } as unknown as Fixture;
  const cup = { id: "f1", knockout: true } as unknown as Fixture;
  test("a league draw is fine; a knockout draw needs a shootout winner", () => {
    const rec = validatePlayedMatch(ok)!;
    expect(knockoutRecordingDecided(league, rec)).toBe(true);
    expect(knockoutRecordingDecided(cup, rec)).toBe(false);
    expect(knockoutRecordingDecided(cup, { ...rec, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 4, away: 3 } } })).toBe(true);
    expect(knockoutRecordingDecided({ ...cup, aggregate: { home: 1, away: 0 } } as Fixture, rec)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/playedMatchValidation.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

`src/backend/playedMatchValidation.ts` (a mesma checagem que a rota `/api/advance-day` faz hoje, linhas do `peOk`):

```ts
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Fixture } from "@/types/calendarTypes";

/** A live recording sent by the client, or null when it fails the shape check (the server never simulates it then). */
export function validatePlayedMatch(raw: unknown): PlayedMatchRecording | null {
  const pm = raw as PlayedMatchRecording | null | undefined;
  const pe = pm?.playerEnergy;
  const peOk = !!pe && typeof pe === "object" && !!pm?.playerStats
    && Object.keys(pm.playerStats).every((id) => typeof (pe as Record<string, unknown>)[id] === "number");
  if (
    !pm
    || typeof pm.fixtureId !== "string"
    || !pm.score
    || typeof pm.score.home !== "number"
    || typeof pm.score.away !== "number"
    || !pm.teamStats?.home
    || !pm.teamStats?.away
    || !pm.playerStats
    || !pm.playerRatings
    || !peOk
    || typeof pm.durationMs !== "number"
  ) return null;
  return pm;
}

/** A knockout recording level on score + aggregate needs a shootout winner (`.claude/rules/match-flow.md`). */
export function knockoutRecordingDecided(fixture: Fixture, recording: PlayedMatchRecording): boolean {
  if (!fixture.knockout) return true;
  const level = recording.score.home + (fixture.aggregate?.home ?? 0) === recording.score.away + (fixture.aggregate?.away ?? 0);
  if (!level) return true;
  const pens = recording.decider?.penalties;
  return !!pens && pens.home !== pens.away;
}
```

Em `src/backend/advanceDay.ts`:
1. Importe `import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";`.
2. Na rota `/api/advance-day/:saveId`, troque o bloco que vai de `const pm = parsed.playedMatch;` até `playedMatchOverride = pm;` por:

```ts
        const pm = validatePlayedMatch(parsed.playedMatch);
        if (!pm) {
          return Response.json(
            { error: "playedMatch payload failed validation — refusing to simulate headlessly" },
            { status: 400 },
          );
        }
        playedMatchOverride = pm;
```

3. Em `advanceOneDay`, no bloco `if (recording && recSeat) {`, troque o cálculo de `level`/`pens` por:

```ts
            if (!knockoutRecordingDecided(fixture, recording)) {
              return { ok: false, status: 400, error: "knockout recording without a winner" };
            }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/playedMatchValidation.test.ts src/backend/var.advanceDay.test.ts src/backend/advanceDay.payload.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/playedMatchValidation.ts src/backend/playedMatchValidation.test.ts src/backend/advanceDay.ts
git commit -m "refactor(advance-day): validação da gravação ao vivo num módulo só

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 8: Próximo jogo e jogo do dia de um assento

**Files:**
- Modify: `src/backend/advanceUntil.ts`, `src/backend/nationalCoachWorld.ts`
- Test: `src/backend/advanceUntil.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente a `src/backend/advanceUntil.test.ts` (o arquivo já cria saves reais; reaproveite o save/clube que ele usa — se ele não tiver um, use o bloco abaixo inteiro):

```ts
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { soloSeatId } from "@/backend/testing/seatFixtures";

describe("seatNextMatchDate", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });
  test("the seat's next unplayed club game from a date", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const seatId = await soloSeatId(saveId);
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    const mine = all.filter((f) => !f.played && (f.home === "33" || f.away === "33")).map((f) => f.date).sort();
    expect(await seatNextMatchDate(saveService, saveId, seatId, meta.currentDate!)).toBe(mine[0]!);
    expect(await seatNextMatchDate(saveService, saveId, seatId, addDays(mine[0]!, 1))).toBe(mine[1]!);
  }, 120_000);
});
```

(Use os imports de `saveService`, `addDays`, `afterAll` já presentes no arquivo ou acrescente-os.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/advanceUntil.test.ts`
Esperado: FAIL (`seatNextMatchDate` não exportado).

- [ ] **Step 3: Implementação**

Em `advanceUntil.ts`, acrescente (antes de `readAdvancePosition`):

```ts
/**
 * The seat's next unplayed official game (club league/cup/continental, or his national team's) on or after `from`;
 * null when there is none. Unemployed: only his national team's.
 */
export async function seatNextMatchDate(
  service: SaveService, saveId: string, seatId: string, from: string,
): Promise<string | null> {
  const meta = await service.getSeatMeta(saveId, seatId);
  if (!meta) return null;
  const national = await nextNationalFixtureDate(service, saveId, seatId, from);
  if (meta.unemployed || !meta.clubId) return national;
  const cup = await playerCupSlug(meta.leagueSlug);
  const continental = await playerContinentalSlug(service, saveId, meta.clubId);
  const competitions = [meta.leagueSlug, cup, continental].filter((s): s is string => s !== null);
  const club = await nextPlayerFixtureDate(service, saveId, competitions, meta.clubId, from);
  return [club, national].filter((d): d is string => !!d).sort()[0] ?? null;
}
```

e em `readAdvancePosition` troque as linhas de `const cup = …` até `const matchDate = …` por:

```ts
  const matchDate = await seatNextMatchDate(service, saveId, seatId, currentDate);
```

Em `nationalCoachWorld.ts`, depois de `nextNationalFixtureDate`:

```ts
/** His national team's unplayed game of `date` (Etapa 41b), or null. */
export async function nationalFixtureOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null> {
  const state = await service.getNationalState(saveId);
  if (!state?.human?.[seatId]) return null;
  return (await humanGames(service, saveId, state, seatId)).find((f) => !f.played && f.date === date) ?? null;
}
```

(`Fixture` já é importado no arquivo; se não, `import type { Fixture } from "@/types/calendarTypes";`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/advanceUntil.test.ts src/backend/advanceUntil.continental.test.ts src/backend/national.coach.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/advanceUntil.ts src/backend/advanceUntil.test.ts src/backend/nationalCoachWorld.ts
git commit -m "refactor(advance-until): próximo jogo de um assento reaproveitável

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 9: Evento de socket `world_progress`

**Files:**
- Modify: `src/types/socialTypes.ts`, `src/GameInterface/Social/socialState.ts`
- Test: `src/GameInterface/Social/socialState.test.ts`

- [ ] **Step 1: Teste que falha**

Em `socialState.test.ts`, dentro de `describe("parseServerEvent", …)`:

```ts
  test("world_progress", () => {
    const ev = { type: "world_progress", saveId: "s1", date: "2027-03-11", target: "2027-03-14", running: true, waitingFor: ["ana"] };
    expect(parseServerEvent(JSON.stringify(ev))).toEqual(ev);
    expect(parseServerEvent(JSON.stringify({ ...ev, error: "boom" }))).toEqual({ ...ev, error: "boom" });
    expect(parseServerEvent(JSON.stringify({ ...ev, waitingFor: [1] }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ ...ev, target: 3 }))).toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameInterface/Social/socialState.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

`socialTypes.ts`, no `ServerEvent` (junto dos `world_*` da parte 2):

```ts
  | {
    type: "world_progress";
    saveId: string;
    /** The world's date now. */
    date: string;
    target: string | null;
    running: boolean;
    /** Nicknames (or manager names) holding the world. */
    waitingFor: string[];
    error?: string;
  }
```

`socialState.ts`, no `switch` de `parseServerEvent`:

```ts
    case "world_progress": {
      const okTarget = e.target === null || str(e.target);
      const okWaiting = Array.isArray(e.waitingFor) && (e.waitingFor as unknown[]).every(str);
      if (!str(e.saveId) || !str(e.date) || !okTarget || typeof e.running !== "boolean" || !okWaiting) return null;
      if (e.error !== undefined && !str(e.error)) return null;
      return {
        type: "world_progress", saveId: e.saveId, date: e.date, target: e.target as string | null,
        running: e.running, waitingFor: e.waitingFor as string[], ...(str(e.error) ? { error: e.error } : {}),
      };
    }
```

No `handleEvent` de `useSocial.tsx`, se o `switch` for exaustivo (erro de tipo), acrescente `case "world_progress": break;` (quem trata é o `GroupAdvanceProvider`, Tarefa 18).

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/GameInterface/Social/socialState.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/socialTypes.ts src/GameInterface/Social
git commit -m "feat(group-advance): evento world_progress no socket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 10: Mensagem "o assistente avançou por você"

**Files:**
- Modify: `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxTopics.ts`, `src/Domain/inbox/inboxThemes.ts`, `src/GameInterface/InboxScreen.tsx`
- Create: `src/Domain/inbox/worldAdvanceMessage.ts`
- Test: `src/Domain/inbox/worldAdvanceMessage.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { buildAutoAdvancedMessage } from "@/Domain/inbox/worldAdvanceMessage";
import { inboxTopicOf } from "@/Domain/inbox/inboxTopics";

describe("buildAutoAdvancedMessage", () => {
  test("world / auto_advanced with the stop date and the simulated game, never dropped", () => {
    const m = buildAutoAdvancedMessage({ date: "2027-03-10", until: "2027-03-13", simulated: "2027-03-12" });
    expect(m.category).toBe("world");
    expect(m.kind).toBe("auto_advanced");
    expect(m.until).toBe("2027-03-13");
    expect(m.simulated).toBe("2027-03-12");
    expect(m.id).toBe("world-auto-2027-03-10-2027-03-13");
    expect(inboxTopicOf(m)).toBe("actions");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/inbox/worldAdvanceMessage.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

`inboxTypes.ts`: se `"world"` ainda não estiver em `InboxCategory`, acrescente `| "world"`. Depois de `PressInboxMessage`:

```ts
/** Group advance (part 3): the deadline passed and the assistant moved the seat on. */
export interface WorldAdvanceInboxMessage extends InboxMessageBase {
  category:  "world";
  kind:      "auto_advanced";
  /** His new stop date. */
  until:     string;
  /** The game the assistant simulated for him, or null. */
  simulated: string | null;
}
```

e acrescente `| WorldAdvanceInboxMessage` à união `InboxMessage`.

`src/Domain/inbox/worldAdvanceMessage.ts`:

```ts
import type { WorldAdvanceInboxMessage } from "@/types/inboxTypes";

/** Inbox `world` / `auto_advanced` (the screen translates `world.advance.inbox.*`; the subject is the fallback). */
export function buildAutoAdvancedMessage(a: { date: string; until: string; simulated: string | null }): WorldAdvanceInboxMessage {
  return {
    id: `world-auto-${a.date}-${a.until}`,
    date: a.date,
    createdAt: new Date().toISOString(),
    read: false,
    category: "world",
    kind: "auto_advanced",
    subject: "The assistant advanced for you",
    preview: `Ready until ${a.until}`,
    until: a.until,
    simulated: a.simulated,
  };
}
```

`inboxTopics.ts`: se `world` não estiver em `CATEGORY_TOPIC`, acrescente `world: "actions",`; acrescente em `KIND_TOPIC` `"world:auto_advanced": "actions",` (nunca descartada).
`inboxThemes.ts`: se faltar, `world: "club",` (use um tema que já existe no arquivo; confira os nomes).
`InboxScreen.tsx`:
- no mapa de categorias, se faltar `world`, acrescente (mesmo formato de `national_coach`, ícone `UsersIcon` se existir no arquivo; senão o componente de ícone de grupo que a parte 2 usou);
- na função de assunto, antes do `if (message.category === "board")`:

```ts
  if (message.category === "world" && message.kind === "auto_advanced") {
    return {
      subject: t("world.advance.inbox.subject"),
      preview: message.simulated
        ? t("world.advance.inbox.previewSimulated", { until: formatGameDate(message.until, i18nLang(), "dayMonth"), match: formatGameDate(message.simulated, i18nLang(), "dayMonth") })
        : t("world.advance.inbox.preview", { until: formatGameDate(message.until, i18nLang(), "dayMonth") }),
    };
  }
```

(importe `formatGameDate` de `@/GameInterface/formatDate` se faltar; as chaves entram na Tarefa 23.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/inbox`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/inboxTypes.ts src/Domain/inbox src/GameInterface/InboxScreen.tsx
git commit -m "feat(group-advance): mensagem do assistente no prazo vencido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 11: Executor

**Files:**
- Create: `src/backend/groupAdvance.ts`
- Test: `src/backend/groupAdvance.test.ts`

- [ ] **Step 1: Teste que falha**

`src/backend/groupAdvance.test.ts` (sem dias de verdade: `runDay` só move a data):

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { kickWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addDays } from "@/Domain/dates";
import type { ServerEvent } from "@/types/socialTypes";
import type { Fixture } from "@/types/calendarTypes";

const D = "2027-03-10";
const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const created: string[] = [];
afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 60_000);

function stubDeps(over: Partial<GroupAdvanceDeps> = {}): GroupAdvanceDeps & { days: string[]; events: ServerEvent[] } {
  const days: string[] = [];
  const events: ServerEvent[] = [];
  return {
    service: saveService,
    now: () => NOW,
    notify: (_userId, e) => events.push(e),
    nextMatch: async () => null,
    matchOn: async () => null,
    runDay: async (saveId) => {
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      days.push(date);
      const next = addDays(date, 1);
      await saveService.updateMeta(saveId, { currentDate: next });
      return { ok: true, payload: { newDate: next }, seats: {} };
    },
    days, events,
    ...over,
  };
}

async function world(seats: Record<string, Record<string, unknown>>, world: Record<string, unknown> = {}) {
  const id = await fakeWorld({ seatIds: Object.keys(seats), date: D, world, seats });
  created.push(id);
  return id;
}

describe("group advance executor", () => {
  test("runs to the smallest ready date and waits there for everybody", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" }, b: { readyUntil: "2027-03-15" } });
    const deps = stubDeps();
    const r = await kickWorld(id, deps);
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11", "2027-03-12"]);
    expect(r).toMatchObject({ days: 3, date: "2027-03-13", target: "2027-03-13", waitingFor: ["a"] });
    const adv = (await saveService.getMeta(id))!.world!.advance!;
    expect(adv.running).toBe(false);
    expect(adv.waitingSince).toBe(new Date(NOW).toISOString());
  });

  test("stops ON an undecided game and goes on once it is decided", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" }, b: { readyUntil: "2027-03-15" } });
    const game = { id: "fx", date: "2027-03-12" } as Fixture;
    const deps = stubDeps({
      nextMatch: async (_s, _id, seatId, from) => (seatId === "a" && from <= "2027-03-12" && !(await saveService.getSeat(id, "a"))?.matchDecision ? "2027-03-12" : null),
      matchOn: async (_s, _id, seatId, date) => (seatId === "a" && date === "2027-03-12" ? game : null),
    });
    expect((await kickWorld(id, deps)).date).toBe("2027-03-12");
    await saveService.updateSeat(id, "a", { matchDecision: { date: "2027-03-12", fixtureId: "fx", mode: "simulate" } });
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-15");
    expect((await saveService.getSeat(id, "a"))!.matchDecision).toBeUndefined();
  });

  test("a stop of the day (job offer) unmarks the seat", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" }, b: { readyUntil: "2027-03-15" } });
    const deps = stubDeps();
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      const out = await base(saveId, recs);
      return out.ok ? { ...out, seats: { a: { jobOffers: 1 } } } : out;
    };
    const r = await kickWorld(id, deps);
    expect(r.days).toBe(1);
    expect((await saveService.getSeat(id, "a"))!.readyUntil).toBeNull();
    expect((await saveService.getPendingSummary(id, "a"))[0]).toEqual({ date: D, newDate: "2027-03-11", seat: { jobOffers: 1 } });
  });

  test("an error stops and frees the world", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" } });
    const deps = stubDeps({ runDay: async () => ({ ok: false, status: 500, error: "boom" }) });
    const r = await kickWorld(id, deps);
    expect(r.error).toBe("boom");
    const meta = (await saveService.getMeta(id))!;
    expect(meta.currentDate).toBe(D);
    expect(meta.world!.advance!.running).toBe(false);
  });

  test("two kicks run one executor", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const deps = stubDeps();
    const [p1, p2] = [kickWorld(id, deps), kickWorld(id, deps)];
    expect(p1).toBe(p2);
    await p1;
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11"]);
  });

  test("deadline passed: the assistant takes the late seat to the others' stop", async () => {
    const since = new Date(NOW - 25 * 3_600_000).toISOString();
    const id = await world(
      { a: { readyUntil: "2027-03-13" }, late: {} },
      { deadlineHours: 24, advance: { running: false, waitingSince: since, target: D } },
    );
    const deps = stubDeps();
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-13");
    const inbox = await saveService.getInbox(id, "late");
    expect(inbox.some((m) => m.category === "world" && (m as { kind?: string }).kind === "auto_advanced")).toBe(true);
  });

  test("deadline not passed, or no deadline: nothing runs", async () => {
    const since = new Date(NOW - 3_600_000).toISOString();
    for (const hours of [24, null]) {
      const id = await world({ a: { readyUntil: "2027-03-13" }, late: {} }, { deadlineHours: hours, advance: { running: false, waitingSince: since, target: D } });
      const deps = stubDeps();
      expect((await kickWorld(id, deps)).days).toBe(0);
      expect((await saveService.getMeta(id))!.world!.advance!.waitingSince).toBe(since);
    }
  });

  test("a world in the lobby never advances", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" } }, { phase: "lobby" });
    expect((await kickWorld(id, stubDeps())).days).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/groupAdvance.test.ts`
Esperado: FAIL (módulo não existe).

- [ ] **Step 3: Implementação**

`src/backend/groupAdvance.ts`:

```ts
import { saveService as defaultService, type SaveMeta, type SaveService } from "@/backend/SaveService";
import { withSaveLock } from "@/backend/saveLock";
import { runBufferedDay, type AdvanceDayOutcome } from "@/backend/advanceDay";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { nationalFixtureOn } from "@/backend/nationalCoachWorld";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { db } from "@/backend/db";
import { logError } from "@/Logger";
import { addDays } from "@/Domain/dates";
import {
  assistantPatches, computeGroupTarget, deadlineAt, deadlinePassed, isGroupWorld, memberStatus, seatStops,
  type GroupPlan, type GroupSeatInput,
} from "@/Domain/groupAdvance/groupAdvance";
import { GROUP_ADVANCE } from "@/Domain/groupAdvance/groupAdvanceConfig";
import { buildAutoAdvancedMessage } from "@/Domain/inbox/worldAdvanceMessage";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { ServerEvent } from "@/types/socialTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { SeatState } from "@/types/seatTypes";
import type { GroupAdvanceView, MatchDecision, WorldAdvance } from "@/types/groupAdvanceTypes";

/** What the executor needs (tests swap `runDay` and the calendar readers). */
export interface GroupAdvanceDeps {
  service: SaveService;
  runDay(saveId: string, recordings: Record<string, PlayedMatchRecording>): Promise<AdvanceDayOutcome>;
  notify(userId: string, event: ServerEvent): void;
  now(): number;
  nextMatch(service: SaveService, saveId: string, seatId: string, from: string): Promise<string | null>;
  matchOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null>;
}

/** The seat's unplayed official game of `date`: his club's, else his national team's (Etapa 41b). */
export async function seatMatchOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null> {
  const seat = await service.getSeat(saveId, seatId);
  if (seat?.clubId && !seat.unemployed) {
    const club = (await service.getFixturesForDate(saveId, date))
      .find((f) => !f.played && (f.home === seat.clubId || f.away === seat.clubId));
    if (club) return club;
  }
  return nationalFixtureOn(service, saveId, seatId, date);
}

export const defaultGroupDeps: GroupAdvanceDeps = {
  service: defaultService,
  runDay: (saveId, recordings) => runBufferedDay(saveId, recordings),
  notify: notifyUser,
  now: () => Date.now(),
  nextMatch: seatNextMatchDate,
  matchOn: seatMatchOn,
};

export interface GroupRunResult {
  days: number;
  date: string | null;
  target: string | null;
  /** Seat ids holding the world when the run stopped. */
  waitingFor: string[];
  error?: string;
}

interface GroupSeat { seatId: string; seat: SeatState; input: GroupSeatInput }

async function loadGroupSeats(deps: GroupAdvanceDeps, saveId: string, currentDate: string): Promise<GroupSeat[]> {
  const out: GroupSeat[] = [];
  for (const { seatId, seat } of await deps.service.listSeats(saveId)) {
    const unemployed = !!seat.unemployed || !seat.clubId;
    out.push({
      seatId, seat,
      input: {
        seatId,
        readyUntil: seat.readyUntil ?? null,
        nextMatch: unemployed ? null : await deps.nextMatch(deps.service, saveId, seatId, currentDate),
        decisionDate: seat.matchDecision?.date ?? null,
        unemployed,
      },
    });
  }
  return out;
}

async function setAdvance(service: SaveService, saveId: string, advance: WorldAdvance): Promise<void> {
  const meta = await service.getMeta(saveId);
  if (!meta?.world) return;
  await service.updateMeta(saveId, { world: { ...meta.world, advance } });
}

/** Deadline passed: the assistant moves every late seat on (`assistantPatches`) and tells him. */
async function applyAssistant(deps: GroupAdvanceDeps, saveId: string, currentDate: string, seats: GroupSeat[], plan: GroupPlan) {
  for (const p of assistantPatches(currentDate, seats.map((s) => s.input), plan)) {
    let matchDecision: MatchDecision | undefined;
    if (p.decisionDate) {
      const fixture = await deps.matchOn(deps.service, saveId, p.seatId, p.decisionDate);
      if (fixture) matchDecision = { date: p.decisionDate, fixtureId: fixture.id, mode: "simulate" };
    }
    await deps.service.updateSeat(saveId, p.seatId, { readyUntil: p.readyUntil, ...(matchDecision ? { matchDecision } : {}) });
    await deps.service.appendInbox(
      saveId, buildAutoAdvancedMessage({ date: currentDate, until: p.readyUntil, simulated: matchDecision?.date ?? null }), p.seatId,
    );
  }
}

/** Live recordings of `date` kept by the seats that chose to play it live. */
async function liveRecordingsFor(service: SaveService, saveId: string, date: string, seats: GroupSeat[]) {
  const out: Record<string, PlayedMatchRecording> = {};
  for (const s of seats) {
    const d = s.seat.matchDecision;
    if (d?.mode !== "live" || d.date !== date) continue;
    const file = await service.getLiveRecording(saveId, s.seatId);
    if (file && file.date === date && file.fixtureId === d.fixtureId) out[s.seatId] = file.recording;
  }
  return out;
}

type Step =
  | { kind: "ran" | "stopped" | "idle"; date: string | null; target: string | null; waitingFor: string[] }
  | { kind: "error"; date: string | null; target: string | null; waitingFor: string[]; error: string };

/** One step under the save lock: compute the target, then run one day or stop. */
async function stepWorld(saveId: string, deps: GroupAdvanceDeps): Promise<Step> {
  const { service } = deps;
  const meta = await service.getMeta(saveId);
  if (!meta?.currentDate || !isGroupWorld(meta) || meta.world!.phase !== "running") {
    return { kind: "idle", date: meta?.currentDate ?? null, target: null, waitingFor: [] };
  }
  const currentDate = meta.currentDate;
  const world = meta.world!;
  let seats = await loadGroupSeats(deps, saveId, currentDate);
  let plan = computeGroupTarget(currentDate, seats.map((s) => s.input));

  if (plan.target <= currentDate && deadlinePassed(world.advance?.waitingSince ?? null, world.deadlineHours, deps.now())) {
    await applyAssistant(deps, saveId, currentDate, seats, plan);
    seats = await loadGroupSeats(deps, saveId, currentDate);
    plan = computeGroupTarget(currentDate, seats.map((s) => s.input));
  }

  if (plan.target <= currentDate) {
    const waitingSince = plan.waitingFor.length > 0
      ? (world.advance?.waitingSince ?? new Date(deps.now()).toISOString())
      : null;
    await setAdvance(service, saveId, { running: false, waitingSince, target: plan.target });
    return { kind: "stopped", date: currentDate, target: plan.target, waitingFor: plan.waitingFor };
  }

  await setAdvance(service, saveId, { running: true, waitingSince: null, target: plan.target });
  const recordings = await liveRecordingsFor(service, saveId, currentDate, seats);
  let outcome = await deps.runDay(saveId, recordings);
  if (!outcome.ok && outcome.status === 400 && Object.keys(recordings).length > 0) {
    // A refused live recording must not lock the world: the assistant simulates that game instead.
    logError("world", `save ${saveId}: live recordings of ${currentDate} refused (${outcome.error}); simulating them`);
    for (const seatId of Object.keys(recordings)) {
      await service.writeLiveRecording(saveId, seatId, null);
      const d = seats.find((s) => s.seatId === seatId)!.seat.matchDecision!;
      await service.updateSeat(saveId, seatId, { matchDecision: { ...d, mode: "simulate" } });
    }
    outcome = await deps.runDay(saveId, {});
  }
  if (!outcome.ok) {
    logError("world", `save ${saveId}: day ${currentDate} failed (${outcome.status} ${outcome.error})`);
    await setAdvance(service, saveId, { running: false, waitingSince: null, target: plan.target });
    return { kind: "error", date: currentDate, target: plan.target, waitingFor: [], error: outcome.error };
  }

  const newDate = typeof outcome.payload.newDate === "string" ? outcome.payload.newDate : addDays(currentDate, 1);
  for (const s of seats) {
    const part = outcome.seats[s.seatId] ?? {};
    const patch: Partial<SeatState> = {};
    if (seatStops(part)) patch.readyUntil = null;
    if (s.seat.matchDecision && s.seat.matchDecision.date <= currentDate) patch.matchDecision = undefined;
    if (Object.keys(patch).length > 0) await service.updateSeat(saveId, s.seatId, patch);
    const live = await service.getLiveRecording(saveId, s.seatId);
    if (live && live.date <= currentDate) await service.writeLiveRecording(saveId, s.seatId, null);
    await service.appendPendingDay(saveId, s.seatId, { date: currentDate, newDate, seat: part }, GROUP_ADVANCE.PENDING_SUMMARY_MAX);
  }
  return { kind: "ran", date: newDate, target: plan.target, waitingFor: [] };
}

/** Nicknames of the seats (the manager's name when the user has none). */
async function namesOf(service: SaveService, saveId: string, seatIds: string[]): Promise<string[]> {
  const members = listSaveMembers(saveId);
  const out: string[] = [];
  for (const seatId of seatIds) {
    const m = members.find((x) => x.seatId === seatId);
    const nick = m ? getSocialUser(m.userId)?.nickname : null;
    out.push(nick ?? (await service.getSeat(saveId, seatId))?.manager?.name ?? "?");
  }
  return out;
}

async function broadcast(
  saveId: string, deps: GroupAdvanceDeps,
  ev: { date: string | null; target: string | null; running: boolean; waitingFor: string[]; error?: string },
): Promise<void> {
  if (!ev.date) return;
  const waitingFor = await namesOf(deps.service, saveId, ev.waitingFor);
  for (const m of listSaveMembers(saveId)) {
    deps.notify(m.userId, {
      type: "world_progress", saveId, date: ev.date, target: ev.target, running: ev.running, waitingFor,
      ...(ev.error ? { error: ev.error } : {}),
    });
  }
}

async function advanceGroup(saveId: string, deps: GroupAdvanceDeps): Promise<GroupRunResult> {
  const result: GroupRunResult = { days: 0, date: null, target: null, waitingFor: [] };
  for (let guard = 0; guard < GROUP_ADVANCE.MAX_DAYS_PER_RUN; guard++) {
    const step = await withSaveLock(saveId, () => stepWorld(saveId, deps));
    result.date = step.date;
    result.target = step.target;
    result.waitingFor = step.waitingFor;
    if (step.kind === "ran") {
      result.days++;
      await broadcast(saveId, deps, { date: step.date, target: step.target, running: true, waitingFor: [] });
      continue;
    }
    if (step.kind === "error") {
      result.error = step.error;
      await broadcast(saveId, deps, { date: step.date, target: step.target, running: false, waitingFor: [], error: step.error });
      return result;
    }
    if (step.kind === "stopped") {
      await broadcast(saveId, deps, { date: step.date, target: step.target, running: false, waitingFor: step.waitingFor });
    }
    return result;
  }
  return result;
}

const runningWorlds = new Map<string, Promise<GroupRunResult>>();
const kickAgain = new Set<string>();
const knownWorlds = new Set<string>();

/** Remember a world for the deadline clock. */
export function rememberWorld(saveId: string): void {
  knownWorlds.add(saveId);
}

export function isWorldAdvancing(saveId: string): boolean {
  return runningWorlds.has(saveId);
}

/**
 * Runs the world's days in the background while every seat is ready (`.claude/rules/game/multiplayer.md`, part 3).
 * One executor per world: a kick while one runs only asks it to look once more when it stops.
 */
export function kickWorld(saveId: string, deps: GroupAdvanceDeps = defaultGroupDeps): Promise<GroupRunResult> {
  rememberWorld(saveId);
  const current = runningWorlds.get(saveId);
  if (current) {
    kickAgain.add(saveId);
    return current;
  }
  const run = (async () => {
    let last: GroupRunResult;
    do {
      kickAgain.delete(saveId);
      last = await advanceGroup(saveId, deps);
    } while (kickAgain.has(saveId) && !last.error);
    return last;
  })().finally(() => runningWorlds.delete(saveId));
  runningWorlds.set(saveId, run);
  return run;
}

const defaultScheduler = (saveId: string) => {
  void kickWorld(saveId).catch((e) => logError("world", `save ${saveId}: group advance crashed`, e));
};
let scheduler: (saveId: string) => void = defaultScheduler;

/** Routes call this (tests swap it with `setKickScheduler`). */
export function scheduleKick(saveId: string): void {
  scheduler(saveId);
}

export function setKickScheduler(fn: ((saveId: string) => void) | null): void {
  scheduler = fn ?? defaultScheduler;
}

/** `GET /api/worlds/:saveId/advance` for one seat. */
export async function groupAdvanceView(
  service: SaveService, saveId: string, seatId: string, nowMs: number, deps: GroupAdvanceDeps = defaultGroupDeps,
): Promise<GroupAdvanceView | null> {
  const meta = await service.getMeta(saveId);
  if (!meta?.currentDate || !meta.world) return null;
  const currentDate = meta.currentDate;
  const seats = await loadGroupSeats({ ...deps, service }, saveId, currentDate);
  const plan = computeGroupTarget(currentDate, seats.map((s) => s.input));
  const members = listSaveMembers(saveId);
  const names = await namesOf(service, saveId, seats.map((s) => s.seatId));
  const mine = seats.find((s) => s.seatId === seatId);
  const today = mine && !mine.input.unemployed ? await deps.matchOn(service, saveId, seatId, currentDate) : null;
  const humans = await service.humanClubIds(saveId);
  const advance = meta.world.advance;
  return {
    currentDate,
    target: advance?.running ? advance.target : plan.target,
    running: !!advance?.running || isWorldAdvancing(saveId),
    deadlineHours: meta.world.deadlineHours,
    deadlineAt: deadlineAt(advance?.waitingSince ?? null, meta.world.deadlineHours),
    waitingFor: plan.waitingFor.map((id) => names[seats.findIndex((s) => s.seatId === id)]!),
    members: seats.map((s, i) => ({
      seatId: s.seatId,
      nickname: (() => { const m = members.find((x) => x.seatId === s.seatId); return m ? getSocialUser(m.userId)?.nickname ?? null : null; })(),
      managerName: s.seat.manager?.name ?? names[i]!,
      clubName: s.input.unemployed ? "" : s.seat.clubName,
      status: memberStatus(s.input, currentDate),
      readyUntil: s.seat.readyUntil ?? null,
      me: s.seatId === seatId,
    })),
    me: {
      readyUntil: mine?.seat.readyUntil ?? null,
      matchToday: today
        ? { fixtureId: today.id, humanOpponent: [today.home, today.away].some((c) => c !== mine?.seat.clubId && humans.has(c)) }
        : null,
      decision: mine?.seat.matchDecision ?? null,
    },
  };
}

/** World ids from the invite codes (part 2), for the deadline clock. */
function loadKnownWorlds(): void {
  for (const row of db.prepare("SELECT save_id AS saveId FROM world_codes").all() as { saveId: string }[]) {
    knownWorlds.add(row.saveId);
  }
}

function isRunningWorld(meta: SaveMeta | null): boolean {
  return !!meta && isGroupWorld(meta) && meta.world!.phase === "running";
}

/** One tick of the deadline clock: kicks every world whose deadline passed. Returns the kicked ids. */
export async function worldClockTick(deps: GroupAdvanceDeps = defaultGroupDeps): Promise<string[]> {
  const kicked: string[] = [];
  for (const saveId of [...knownWorlds]) {
    if (runningWorlds.has(saveId)) continue;
    const meta = await deps.service.getMeta(saveId);
    if (!meta) { knownWorlds.delete(saveId); continue; }
    const adv = meta.world?.advance;
    if (!isRunningWorld(meta) || !adv?.waitingSince) continue;
    if (!deadlinePassed(adv.waitingSince, meta.world!.deadlineHours, deps.now())) continue;
    kicked.push(saveId);
    void kickWorld(saveId, deps).catch((e) => logError("world", `save ${saveId}: group advance crashed`, e));
  }
  return kicked;
}

/** Server start: an executor that died with the process is freed, then every running world looks again. */
export async function resumeWorlds(deps: GroupAdvanceDeps = defaultGroupDeps): Promise<void> {
  loadKnownWorlds();
  for (const saveId of knownWorlds) {
    const meta = await deps.service.getMeta(saveId);
    if (meta?.world?.advance?.running) await setAdvance(deps.service, saveId, { ...meta.world.advance, running: false });
    if (isRunningWorld(meta)) void kickWorld(saveId, deps).catch((e) => logError("world", `save ${saveId}: resume failed`, e));
  }
}

let clock: ReturnType<typeof setInterval> | null = null;

/** Deadline clock (`GROUP_ADVANCE.CLOCK_MS`) plus the resume of the worlds. Called once at server start. */
export function startWorldClock(): void {
  if (clock) return;
  void resumeWorlds().catch((e) => logError("world", "failed to resume the worlds", e));
  clock = setInterval(() => {
    void worldClockTick().catch((e) => logError("world", "deadline clock failed", e));
  }, GROUP_ADVANCE.CLOCK_MS);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/groupAdvance.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/groupAdvance.ts src/backend/groupAdvance.test.ts
git commit -m "feat(group-advance): executor do avanço em grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 12: Relógio do prazo e retomada

**Files:**
- Modify: `src/index.ts`
- Test: `src/backend/groupAdvance.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente a `groupAdvance.test.ts`:

```ts
import { rememberWorld, worldClockTick, resumeWorlds } from "@/backend/groupAdvance";

describe("deadline clock", () => {
  test("kicks only the worlds whose deadline passed", async () => {
    const late = new Date(NOW - 25 * 3_600_000).toISOString();
    const early = new Date(NOW - 3_600_000).toISOString();
    const due = await world({ a: { readyUntil: "2027-03-12" }, b: {} }, { deadlineHours: 24, advance: { running: false, waitingSince: late, target: D } });
    const notYet = await world({ a: {} }, { deadlineHours: 24, advance: { running: false, waitingSince: early, target: D } });
    rememberWorld(due);
    rememberWorld(notYet);
    const deps = stubDeps();
    const kicked = await worldClockTick(deps);
    expect(kicked).toContain(due);
    expect(kicked).not.toContain(notYet);
    await kickWorld(due, deps); // joins the kicked run
    expect((await saveService.getMeta(due))!.currentDate).toBe("2027-03-12");
  });

  test("resume frees an executor stuck by a dead process", async () => {
    const id = await world({ a: {} }, { advance: { running: true, waitingSince: null, target: "2027-03-12" } });
    rememberWorld(id);
    await resumeWorlds(stubDeps());
    await kickWorld(id, stubDeps());
    expect((await saveService.getMeta(id))!.world!.advance!.running).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `bun test src/backend/groupAdvance.test.ts`
Esperado: PASS (as funções já existem da Tarefa 11; se `world_codes` não existir no banco de teste, `resumeWorlds` lança — nesse caso confirme que a migração da parte 2 roda no `db.ts` e corrija a consulta para o nome real da tabela).

- [ ] **Step 3: Ligar na subida do servidor**

Em `src/index.ts`:

```ts
import { startWorldClock } from "@/backend/groupAdvance";
```

e depois de `startSocialMaintenance();`:

```ts
startWorldClock();
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/groupAdvance.test.ts src/index.ts
git commit -m "feat(group-advance): relógio do prazo e retomada na subida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 13: Rotas do grupo

**Files:**
- Create: `src/backend/groupAdvanceRoutes.ts`
- Modify: `src/backend/routes.ts`
- Test: `src/backend/groupAdvance.routes.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { setKickScheduler } from "@/backend/groupAdvance";
import { fakeWorld } from "@/backend/testing/worldFixtures";

const D = "2027-03-10";
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

describe("group advance routes", () => {
  const created: string[] = [];
  const kicks: string[] = [];
  let user: ReturnType<typeof devAutoLogin>;
  let multi = "";
  let solo = "";
  beforeAll(async () => {
    setKickScheduler((id) => kicks.push(id));
    user = devAutoLogin("ga-routes@test.local");
    multi = await fakeWorld({ seatIds: ["a"], date: D });
    solo = await fakeWorld({ seatIds: ["s"], date: D, world: null, mode: "solo" });
    created.push(multi, solo);
    addSaveMember(multi, user.user.id, "a", "owner");
    addSaveMember(solo, user.user.id, "s", "owner");
  });
  afterEach(() => { kicks.length = 0; });
  afterAll(async () => {
    setKickScheduler(null);
    for (const id of created) await saveService.deleteSave(id);
  }, 60_000);

  const ready = (saveId: string, body: unknown) =>
    call("/api/worlds/:saveId/ready", `/api/worlds/${saveId}/ready`, "POST", user.session.token, { saveId }, body);

  test("solo answers 409 notMulti", async () => {
    const res = await ready(solo, { until: "tomorrow" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("notMulti");
  });

  test("ready tomorrow is stored and kicks the world; null unmarks", async () => {
    const res = await ready(multi, { until: "tomorrow" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ readyUntil: "2027-03-11" });
    expect((await saveService.getSeat(multi, "a"))!.readyUntil).toBe("2027-03-11");
    expect(kicks).toEqual([multi]);
    expect((await (await ready(multi, { until: null })).json()).readyUntil).toBeNull();
  });

  test("invalid dates 400", async () => {
    for (const until of ["2027-03-10", "2027-02-30", "later", undefined]) {
      const res = await ready(multi, { until });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalidDate");
    }
  });

  test("match-decision without a game today 400 notYourMatch; another day 409 dayClosed", async () => {
    const decide = (body: unknown) =>
      call("/api/worlds/:saveId/match-decision", `/api/worlds/${multi}/match-decision`, "POST", user.session.token, { saveId: multi }, body);
    expect((await (await decide({ date: D, fixtureId: "x", mode: "simulate" })).json()).error).toBe("notYourMatch");
    const other = await decide({ date: "2027-03-11", fixtureId: "x", mode: "simulate" });
    expect(other.status).toBe(409);
    expect((await other.json()).error).toBe("dayClosed");
    expect((await decide({ date: D, fixtureId: "x", mode: "live" })).status).toBe(400);
  });

  test("live-recording: invalid recording 400, wrong fixture 400", async () => {
    const send = (body: unknown) =>
      call("/api/worlds/:saveId/live-recording", `/api/worlds/${multi}/live-recording`, "POST", user.session.token, { saveId: multi }, body);
    expect((await (await send({ date: D, fixtureId: "x", recording: { nope: 1 } })).json()).error).toBe("invalidRecording");
    const rec = {
      fixtureId: "y", score: { home: 0, away: 0 }, teamStats: { home: {}, away: {} },
      playerStats: {}, playerRatings: {}, playerEnergy: {}, substitutions: [], durationMs: 1,
    };
    expect((await (await send({ date: D, fixtureId: "x", recording: rec })).json()).error).toBe("notYourMatch");
  });

  test("GET advance: the seat's view", async () => {
    const res = await call("/api/worlds/:saveId/advance", `/api/worlds/${multi}/advance`, "GET", user.session.token, { saveId: multi });
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.currentDate).toBe(D);
    expect(view.members).toHaveLength(1);
    expect(view.members[0].me).toBe(true);
  });

  test("summary: GET then DELETE clears", async () => {
    await saveService.appendPendingDay(multi, "a", { date: D, newDate: "2027-03-11", seat: {} }, 10);
    const path = `/api/worlds/${multi}/summary`;
    expect((await (await call("/api/worlds/:saveId/summary", path, "GET", user.session.token, { saveId: multi })).json()).days).toHaveLength(1);
    expect((await call("/api/worlds/:saveId/summary", path, "DELETE", user.session.token, { saveId: multi })).status).toBe(200);
    expect(await saveService.getPendingSummary(multi, "a")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/groupAdvance.routes.test.ts`
Esperado: FAIL (rotas não existem).

- [ ] **Step 3: Implementação**

`src/backend/groupAdvanceRoutes.ts`:

```ts
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { requireSeat, type SeatAuth } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { groupAdvanceView, scheduleKick, seatMatchOn } from "@/backend/groupAdvance";
import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";
import { addDays } from "@/Domain/dates";
import { isGroupWorld, laterDate, resolveReadyUntil } from "@/Domain/groupAdvance/groupAdvance";
import { buildMatchEventFromRecording } from "@/Domain/advanceDay/matches";

type Req = Request & { params: Record<string, string> };

/** Body cap of a live recording (a whole match: stats of ~40 players). */
const MAX_BODY_BYTES = 512 * 1024;

async function worldSeat(req: Req): Promise<{ auth: SeatAuth; meta: SaveMeta; saveId: string } | Response> {
  const saveId = req.params.saveId!;
  const auth = requireSeat(req, saveId);
  if (auth instanceof Response) return auth;
  const meta = await saveService.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (!isGroupWorld(meta)) return Response.json({ error: "notMulti" }, { status: 409 });
  if (meta.world!.phase !== "running") return Response.json({ error: "lobby" }, { status: 409 });
  return { auth, meta, saveId };
}

async function jsonBody(req: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "tooLarge" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "tooLarge" }, { status: 413 });
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, unknown>) : Response.json({ error: "invalid JSON body" }, { status: 400 });
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
}

const methodNotAllowed = () => Response.json({ error: "method not allowed" }, { status: 405 });

export const groupAdvanceRoutes = {
  "/api/worlds/:saveId/ready": async (req: Req) => {
    if (req.method !== "POST") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const body = await jsonBody(req);
    if (body instanceof Response) return body;
    const { saveId, auth } = ctx;
    const res = await withSaveLock(saveId, async () => {
      const current = (await saveService.getMeta(saveId))!.currentDate!;
      const seat = await saveService.getSeat(saveId, auth.seatId);
      const next = seat?.unemployed ? null : await seatNextMatchDate(saveService, saveId, auth.seatId, addDays(current, 1));
      const r = resolveReadyUntil("until" in body ? body.until : undefined, current, next);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      await saveService.updateSeat(saveId, auth.seatId, { readyUntil: r.readyUntil });
      return Response.json({ readyUntil: r.readyUntil });
    });
    if (res.ok) scheduleKick(saveId);
    return res;
  },

  "/api/worlds/:saveId/match-decision": async (req: Req) => {
    if (req.method !== "POST") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const body = await jsonBody(req);
    if (body instanceof Response) return body;
    if (body.mode !== "simulate" || typeof body.date !== "string" || typeof body.fixtureId !== "string") {
      return Response.json({ error: "invalidDecision" }, { status: 400 });
    }
    const { saveId, auth } = ctx;
    const date = body.date;
    const fixtureId = body.fixtureId;
    const res = await withSaveLock(saveId, async () => {
      if ((await saveService.getMeta(saveId))!.currentDate !== date) return Response.json({ error: "dayClosed" }, { status: 409 });
      const fixture = await seatMatchOn(saveService, saveId, auth.seatId, date);
      if (!fixture || fixture.id !== fixtureId) return Response.json({ error: "notYourMatch" }, { status: 400 });
      const seat = await saveService.getSeat(saveId, auth.seatId);
      await saveService.writeLiveRecording(saveId, auth.seatId, null);
      await saveService.updateSeat(saveId, auth.seatId, {
        matchDecision: { date, fixtureId, mode: "simulate" },
        readyUntil: laterDate(seat?.readyUntil, addDays(date, 1)),
      });
      return Response.json({ ok: true });
    });
    if (res.ok) scheduleKick(saveId);
    return res;
  },

  "/api/worlds/:saveId/live-recording": async (req: Req) => {
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const { saveId, auth } = ctx;
    if (req.method === "GET") {
      // The provisional result of the seat's live match, until the executor runs that day.
      const file = await saveService.getLiveRecording(saveId, auth.seatId);
      if (!file) return Response.json({ error: "not found" }, { status: 404 });
      const fixture = await seatMatchOn(saveService, saveId, auth.seatId, file.date);
      const home = fixture ? await saveService.getSquadById(saveId, fixture.home) : null;
      const away = fixture ? await saveService.getSquadById(saveId, fixture.away) : null;
      const event = fixture && home && away ? buildMatchEventFromRecording(fixture, home, away, file.recording).event : null;
      return Response.json({ date: file.date, fixtureId: file.fixtureId, event });
    }
    if (req.method !== "POST") return methodNotAllowed();
    const body = await jsonBody(req);
    if (body instanceof Response) return body;
    const recording = validatePlayedMatch(body.recording);
    if (!recording || typeof body.date !== "string" || typeof body.fixtureId !== "string") {
      return Response.json({ error: "invalidRecording" }, { status: 400 });
    }
    const date = body.date;
    const fixtureId = body.fixtureId;
    if (recording.fixtureId !== fixtureId) return Response.json({ error: "notYourMatch" }, { status: 400 });
    const res = await withSaveLock(saveId, async () => {
      if ((await saveService.getMeta(saveId))!.currentDate !== date) return Response.json({ error: "dayClosed" }, { status: 409 });
      const fixture = await seatMatchOn(saveService, saveId, auth.seatId, date);
      if (!fixture || fixture.id !== fixtureId) return Response.json({ error: "notYourMatch" }, { status: 400 });
      const seat = await saveService.getSeat(saveId, auth.seatId);
      const humans = await saveService.humanClubIds(saveId);
      if ([fixture.home, fixture.away].some((c) => c !== seat?.clubId && humans.has(c))) {
        return Response.json({ error: "seatOpponent" }, { status: 409 });
      }
      if (!knockoutRecordingDecided(fixture, recording)) return Response.json({ error: "noWinner" }, { status: 400 });
      await saveService.writeLiveRecording(saveId, auth.seatId, { date, fixtureId, recording });
      await saveService.updateSeat(saveId, auth.seatId, {
        matchDecision: { date, fixtureId, mode: "live" },
        readyUntil: laterDate(seat?.readyUntil, addDays(date, 1)),
      });
      return Response.json({ ok: true });
    });
    if (res.ok) scheduleKick(saveId);
    return res;
  },

  "/api/worlds/:saveId/advance": async (req: Req) => {
    if (req.method !== "GET") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const view = await groupAdvanceView(saveService, ctx.saveId, ctx.auth.seatId, Date.now());
    if (!view) return Response.json({ error: "save not found" }, { status: 404 });
    return Response.json(view);
  },

  "/api/worlds/:saveId/summary": async (req: Req) => {
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    if (req.method === "GET") return Response.json({ days: await saveService.getPendingSummary(ctx.saveId, ctx.auth.seatId) });
    if (req.method !== "DELETE") return methodNotAllowed();
    await withSaveLock(ctx.saveId, () => saveService.clearPendingSummary(ctx.saveId, ctx.auth.seatId));
    return Response.json({ ok: true });
  },
};
```

Em `src/backend/routes.ts`: `import { groupAdvanceRoutes } from "@/backend/groupAdvanceRoutes";` e `...groupAdvanceRoutes,` logo depois de `...socialRoutes,` (e depois das rotas de mundo da parte 2, se elas estiverem depois).

> Atenção: `/api/worlds/:saveId/summary` e as outras não podem colidir com uma rota `/api/worlds/:saveId` genérica da parte 2 (o `Bun.serve` casa pela rota exata; confira na Tarefa 1).

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/groupAdvance.routes.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/groupAdvanceRoutes.ts src/backend/groupAdvance.routes.test.ts src/backend/routes.ts
git commit -m "feat(group-advance): rotas pronto, decisão do jogo, gravação ao vivo, estado e resumo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 14: Executor com dias de verdade (gravação ao vivo)

**Files:**
- Test: `src/backend/groupAdvance.live.test.ts`

- [ ] **Step 1: Teste**

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { kickWorld, setKickScheduler } from "@/backend/groupAdvance";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { addDays } from "@/Domain/dates";
import type { Fixture } from "@/types/calendarTypes";

const call = (key: string, path: string, token: string, saveId: string, body: unknown) => {
  const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost${path}`, {
      method: "POST", headers: { cookie: `fs_session=${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: { saveId } },
  ));
};

/**
 * Two seats in the Premier League, the world one day before a round where both play the AI. Real days (≈ 3 s each):
 * the eve, the match day (A live, B simulated) and the day after.
 */
describe("group advance with real days", () => {
  let saveId = "";
  let seatA = "";
  let seatB = "";
  let matchA: Fixture;
  let matchB: Fixture;
  let a: ReturnType<typeof devAutoLogin>;
  let b: ReturnType<typeof devAutoLogin>;

  beforeAll(async () => {
    setKickScheduler(() => {});
    a = devAutoLogin("ga-live-a@test.local");
    b = devAutoLogin("ga-live-b@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    saveId = meta.id;
    seatA = await ownSolo(saveId, a.user.id);
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    matchA = all
      .filter((f) => !f.played && (f.home === "33" || f.away === "33") && f.date > addDays(meta.currentDate!, 3))
      .sort((x, y) => x.date.localeCompare(y.date))[0]!;
    const oppA = matchA.home === "33" ? matchA.away : matchA.home;
    matchB = all.find((f) => f.date === matchA.date && ![f.home, f.away].some((c) => c === "33" || c === oppA))!;
    seatB = (await addSeat(saveId, {
      userId: b.user.id, clubId: matchB.home,
      manager: { name: "Técnico B", nationalityIso: "br", backgroundId: "former-player" },
    })).seatId;
    await saveService.updateMeta(saveId, { currentDate: addDays(matchA.date, -1), world: runningWorld(a.user.id) });
    await saveService.updateSeat(saveId, seatA, { readyUntil: addDays(matchA.date, 2) });
    await saveService.updateSeat(saveId, seatB, { readyUntil: addDays(matchA.date, 2) });
  }, 300_000);

  afterAll(async () => {
    setKickScheduler(null);
    await saveService.deleteSave(saveId);
  }, 120_000);

  test("stops on the match day, plays the live recording there and goes on", async () => {
    const first = await kickWorld(saveId);
    expect(first.days).toBe(1);
    expect(first.date).toBe(matchA.date);
    expect(first.waitingFor.sort()).toEqual([seatA, seatB].sort());

    const recording = {
      fixtureId: matchA.id, score: { home: 2, away: 1 },
      teamStats: { home: {}, away: {} }, playerStats: {}, playerRatings: {}, playerEnergy: {},
      substitutions: [], durationMs: 1,
    };
    const live = await call("/api/worlds/:saveId/live-recording", `/api/worlds/${saveId}/live-recording`, a.session.token, saveId,
      { date: matchA.date, fixtureId: matchA.id, recording });
    expect(live.status).toBe(200);
    const sim = await call("/api/worlds/:saveId/match-decision", `/api/worlds/${saveId}/match-decision`, b.session.token, saveId,
      { date: matchA.date, fixtureId: matchB.id, mode: "simulate" });
    expect(sim.status).toBe(200);

    const second = await kickWorld(saveId);
    expect(second.error).toBeUndefined();
    expect(second.date).toBe(addDays(matchA.date, 2));

    const played = (await saveService.getAllFixturesForLeague(saveId, "premier_league")).find((f) => f.id === matchA.id)!;
    expect(played.played).toBe(true);
    expect(played.result).toEqual({ home: 2, away: 1 });
    expect(await saveService.getLiveRecording(saveId, seatA)).toBeNull();
    expect((await saveService.getSeat(saveId, seatA))!.matchDecision).toBeUndefined();
    expect((await saveService.getPendingSummary(saveId, seatA)).map((d) => d.date))
      .toEqual([addDays(matchA.date, -1), matchA.date, addDays(matchA.date, 1)]);
  }, 300_000);
});
```

- [ ] **Step 2: Rodar**

Run: `bun test src/backend/groupAdvance.live.test.ts`
Esperado: PASS (≈ 1–2 min).

- [ ] **Step 3: Commit**

```bash
git add src/backend/groupAdvance.live.test.ts
git commit -m "test(group-advance): gravação ao vivo usada no dia certo com dias de verdade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 15: Só o executor avança um mundo em grupo

**Files:**
- Modify: `src/backend/advanceDay.ts`, `src/backend/advanceUntil.ts`
- Test: `src/backend/groupAdvance.routes.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescente ao `describe` de rotas:

```ts
  test("advance-day and advance-until answer 409 groupAdvance in a group world", async () => {
    const day = await call("/api/advance-day/:saveId", `/api/advance-day/${multi}`, "POST", user.session.token, { saveId: multi });
    expect(day.status).toBe(409);
    expect((await day.json()).error).toBe("groupAdvance");
    const until = await call("/api/saves/:saveId/advance-until", `/api/saves/${multi}/advance-until`, "POST", user.session.token, { saveId: multi });
    expect(until.status).toBe(409);
    expect((await until.json()).error).toBe("groupAdvance");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/groupAdvance.routes.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

`advanceDay.ts`, rota `/api/advance-day/:saveId`, logo depois de `if (auth instanceof Response) return auth;`:

```ts
    // A world advanced by the group: only the executor runs its days (`.claude/rules/game/multiplayer.md`, part 3).
    const worldMeta = await saveService.getMeta(req.params.saveId!);
    if (worldMeta && isGroupWorld(worldMeta)) return Response.json({ error: "groupAdvance" }, { status: 409 });
```

com `import { isGroupWorld } from "@/Domain/groupAdvance/groupAdvance";`.

`advanceUntil.ts`, troque o bloco do `multiSeat` por:

```ts
    const worldMeta = await defaultSaveService.getMeta(saveId);
    // A world advanced by the group: only the executor runs its days (part 3).
    if (worldMeta && isGroupWorld(worldMeta)) return Response.json({ error: "groupAdvance" }, { status: 409 });
    // A multi world without the group advance (tests, scripts): still one day at a time.
    if ((worldMeta?.seats.length ?? 0) > 1) {
      return Response.json({ error: "multiSeat" }, { status: 409 });
    }
```

com o mesmo import.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/groupAdvance.routes.test.ts src/backend/seats.review.test.ts`
Esperado: PASS (o teste 9 do `seats.review` continua com `multiSeat`: o mundo dele não tem `world`).

- [ ] **Step 5: Commit**

```bash
git add src/backend/advanceDay.ts src/backend/advanceUntil.ts src/backend/groupAdvance.routes.test.ts
git commit -m "feat(group-advance): avanço manual fechado num mundo em grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 16: `match-setup` com a data e o jogo

**Files:**
- Modify: `src/backend/routes.ts`
- Test: `src/backend/matchSetup.career.test.ts`

- [ ] **Step 1: Teste que falha**

No teste existente de `matchSetup.career.test.ts` que recebe 200 do `match-setup` de um jogo do clube, acrescente:

```ts
    expect(body.matchDay).toEqual({ date: body.fixture.date, fixtureId: body.fixture.id });
```

(use o nome da variável de resposta que o teste já tem).

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/matchSetup.career.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

Em `routes.ts`, na resposta do jogo da seleção (`national: { … }`), acrescente:

```ts
            matchDay: { date: nat.fixture.date, fixtureId: nat.fixture.id },
```

e na resposta final do `match-setup` (o `Response.json({ … fixture: matchFixture, … })` do caminho do clube), acrescente:

```ts
      matchDay: matchFixture ? { date: matchFixture.date, fixtureId: matchFixture.id } : null,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/matchSetup.career.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/routes.ts src/backend/matchSetup.career.test.ts
git commit -m "feat(group-advance): match-setup devolve a data e o jogo do dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 17: O executor olha de novo quando o grupo muda (rotas da parte 2)

**Files:**
- Modify: `src/backend/worlds/worldRoutes.ts` (parte 2)

- [ ] **Step 1: Ganchos**

Em cada rota da parte 2 abaixo, depois do sucesso (fora do `withSaveLock`, como as rotas da Tarefa 13), chame `scheduleKick(saveId)`
(`import { rememberWorld, scheduleKick } from "@/backend/groupAdvance";`):

| Rota (parte 2) | Por quê |
|---|---|
| `POST /api/worlds/:saveId/start` | O mundo passa a `running`: grava a parada inicial e começa o prazo |
| `POST /api/worlds/join` | Um assento novo (não pronto) entra: o mundo para por ele |
| `POST /api/worlds/:saveId/members/:seatId/remove` e `/leave` | Quem saiu pode ser o único que faltava |
| `PUT /api/worlds/:saveId/settings` | O prazo mudou (o relógio decide; o kick só recalcula) |

Na criação do mundo multi (`POST /api/saves` com `mode: "multi"`, parte 2), chame `rememberWorld(meta.id)`.

- [ ] **Step 2: Teste**

No teste de rotas da parte 2 que começa o mundo (`start`), troque o agendador e confira o kick:

```ts
import { setKickScheduler } from "@/backend/groupAdvance";
// antes de chamar /start:
const kicks: string[] = [];
setKickScheduler((id) => kicks.push(id));
// depois:
expect(kicks).toContain(saveId);
setKickScheduler(null);
```

Run: `bun test src/backend/<teste de rotas de mundo da parte 2>`
Esperado: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/backend/worlds/worldRoutes.ts src/backend/worlds/*.test.ts
git commit -m "feat(group-advance): entrar, sair, começar e prazo chamam o executor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Marco de verificação A (backend)

- [ ] Run: `bun test src/Domain/groupAdvance src/Domain/inbox src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/playedMatchValidation.test.ts src/backend/dal src/backend/seats.review.test.ts src/backend/seats.twoSeats.test.ts`
  Esperado: PASS.
- [ ] Run: `bunx tsc --noEmit -p . 2>&1 | grep "error TS"`
  Esperado: só o erro antigo em `src/GameEngine/Domain/DecisionTree.ts:750`.

---

## Tarefa 18: Cliente — API, sessão e assinatura do socket

**Files:**
- Create: `src/GameInterface/World/groupAdvanceApi.ts`, `src/GameInterface/World/groupAdvanceText.ts`, `src/GameInterface/World/groupAdvanceText.test.ts`
- Modify: `src/GameInterface/gameSession.ts`, `src/GameInterface/gameSession.seat.test.ts`, `src/GameInterface/Social/useSocial.tsx`

- [ ] **Step 1: Teste que falha**

`src/GameInterface/World/groupAdvanceText.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { deadlineLeft, summaryOutcome } from "@/GameInterface/World/groupAdvanceText";

describe("deadlineLeft", () => {
  const now = Date.parse("2027-01-01T10:00:00.000Z");
  test("hours (rounded up) and minutes in the last hour; null when none or passed", () => {
    expect(deadlineLeft("2027-01-01T15:30:00.000Z", now)).toEqual({ hours: 6, minutes: null });
    expect(deadlineLeft("2027-01-01T10:20:00.000Z", now)).toEqual({ hours: null, minutes: 20 });
    expect(deadlineLeft(null, now)).toBeNull();
    expect(deadlineLeft("2027-01-01T09:00:00.000Z", now)).toBeNull();
  });
});

describe("summaryOutcome", () => {
  test("last day, the last season notice, sacked and offers", () => {
    const out = summaryOutcome([
      { date: "2027-05-17", newDate: "2027-05-18", seat: { seasonEnded: true, archiveYear: 2027, moves: [], playerMove: null, playerChampionOf: "premier_league" } },
      { date: "2027-05-18", newDate: "2027-05-19", seat: { jobOffers: 2 } },
    ]);
    expect(out).toEqual({
      lastDate: "2027-05-18", newDate: "2027-05-19", sacked: false, jobOffers: true,
      notice: { archiveYear: 2027, moves: [], playerMove: null, playerChampionOf: "premier_league" },
    });
    expect(summaryOutcome([])).toBeNull();
  });
});
```

Em `gameSession.seat.test.ts`, acrescente:

```ts
test("groupAdvance comes from a multi world with a world state", () => {
  const base = { id: "s", seatId: "a", leagueSlug: "l", leagueName: "L", clubId: "c", clubName: "C", clubColors: ["#000", "#fff"] };
  expect(sessionFromSave({ ...base, mode: "multi", world: { phase: "running" } }).groupAdvance).toBe(true);
  expect(sessionFromSave({ ...base, mode: "multi" }).groupAdvance).toBe(false);
  expect(sessionFromSave({ ...base, mode: "solo" }).groupAdvance).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameInterface/World src/GameInterface/gameSession.seat.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementação**

`groupAdvanceText.ts`:

```ts
import type { PendingDay } from "@/types/groupAdvanceTypes";
import type { SeasonNotice } from "@/GameInterface/useAdvanceDay";
import type { ClubMove } from "@/types/pyramidTypes";

/** Time left until the deadline: hours (rounded up), or minutes in the last hour; null when none or passed. */
export function deadlineLeft(deadlineAt: string | null, nowMs: number): { hours: number | null; minutes: number | null } | null {
  if (!deadlineAt) return null;
  const ms = Date.parse(deadlineAt) - nowMs;
  if (ms <= 0) return null;
  if (ms < 3_600_000) return { hours: null, minutes: Math.max(1, Math.ceil(ms / 60_000)) };
  return { hours: Math.ceil(ms / 3_600_000), minutes: null };
}

export interface SummaryOutcome {
  lastDate: string;
  newDate: string;
  notice: SeasonNotice | null;
  sacked: boolean;
  jobOffers: boolean;
}

/** What the dashboard shows after the days that ran without the seat looking. */
export function summaryOutcome(days: readonly PendingDay[]): SummaryOutcome | null {
  const last = days[days.length - 1];
  if (!last) return null;
  const season = [...days].reverse().find((d) => d.seat.seasonEnded === true)?.seat;
  return {
    lastDate: last.date,
    newDate: last.newDate,
    sacked: days.some((d) => d.seat.sacked === true),
    jobOffers: days.some((d) => typeof d.seat.jobOffers === "number" && d.seat.jobOffers > 0),
    notice: season
      ? {
        archiveYear: typeof season.archiveYear === "number" ? season.archiveYear : undefined,
        moves: (season.moves as ClubMove[] | undefined) ?? [],
        playerMove: (season.playerMove as ClubMove | null | undefined) ?? null,
        playerChampionOf: (season.playerChampionOf as string | null | undefined) ?? null,
      }
      : null,
  };
}
```

`groupAdvanceApi.ts`:

```ts
import type { GroupAdvanceView, PendingDay } from "@/types/groupAdvanceTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { MatchEvent } from "@/types/dayLogTypes";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init ? { ...init, headers: { "Content-Type": "application/json" } } : undefined);
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data: body } : { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

const base = (saveId: string) => `/api/worlds/${encodeURIComponent(saveId)}`;

export const groupAdvanceApi = {
  view: (saveId: string) => call<GroupAdvanceView>(`${base(saveId)}/advance`),
  ready: (saveId: string, until: string | null) =>
    call<{ readyUntil: string | null }>(`${base(saveId)}/ready`, { method: "POST", body: JSON.stringify({ until }) }),
  simulate: (saveId: string, date: string, fixtureId: string) =>
    call<{ ok: true }>(`${base(saveId)}/match-decision`, { method: "POST", body: JSON.stringify({ date, fixtureId, mode: "simulate" }) }),
  liveRecording: (saveId: string, date: string, fixtureId: string, recording: PlayedMatchRecording) =>
    call<{ ok: true }>(`${base(saveId)}/live-recording`, { method: "POST", body: JSON.stringify({ date, fixtureId, recording }) }),
  pendingLive: (saveId: string) =>
    call<{ date: string; fixtureId: string; event: MatchEvent | null }>(`${base(saveId)}/live-recording`),
  summary: (saveId: string) => call<{ days: PendingDay[] }>(`${base(saveId)}/summary`),
  clearSummary: (saveId: string) => call<{ ok: true }>(`${base(saveId)}/summary`, { method: "DELETE" }),
};
```

`gameSession.ts`: no `GameSession`,

```ts
  /** Multiplayer part 3: the world advances by the group (no Continuar, no fast-forward). */
  groupAdvance?: boolean;
```

e em `sessionFromSave`:

```ts
    groupAdvance: save.mode === "multi" && !!save.world,
```

`useSocial.tsx` (se a parte 2 não deixou um mecanismo de assinatura — Tarefa 1):
- no `SocialContextValue`: `subscribe: (fn: (event: ServerEvent) => void) => () => void;`
- no provider: `const listenersRef = useRef(new Set<(event: ServerEvent) => void>());`
- em `ws.onmessage`, depois de `handleRef.current(event)`: `for (const fn of listenersRef.current) fn(event);`
- `const subscribe = useCallback((fn: (event: ServerEvent) => void) => { listenersRef.current.add(fn); return () => { listenersRef.current.delete(fn); }; }, []);`
- acrescente `subscribe` ao `value` e às dependências do `useMemo`.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/GameInterface/World src/GameInterface/gameSession.seat.test.ts src/GameInterface/Social`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/World src/GameInterface/gameSession.ts src/GameInterface/gameSession.seat.test.ts src/GameInterface/Social/useSocial.tsx
git commit -m "feat(group-advance): API, sessão e assinatura do socket no cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 19: Provedor do grupo e resumo dos dias

**Files:**
- Create: `src/GameInterface/World/GroupAdvanceProvider.tsx`
- Modify: `src/GameInterface/Components/Layout.tsx`, `src/GameInterface/useAdvanceDay.ts`

- [ ] **Step 1: Provedor**

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { summaryOutcome } from "@/GameInterface/World/groupAdvanceText";
import { DaySummaryModal } from "@/GameInterface/Components/DaySummaryModal";
import { SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import type { SeasonNotice } from "@/GameInterface/useAdvanceDay";
import type { AdvanceDayResponse } from "@/types/dayLogTypes";
import type { GroupAdvanceView } from "@/types/groupAdvanceTypes";
import type { LeagueData } from "@/types/playerTypes";

export interface GroupAdvanceContextValue {
  enabled: boolean;
  view: GroupAdvanceView | null;
  busy: boolean;
  error: string | null;
  markReady: (until: string | null) => Promise<void>;
  simulateToday: () => Promise<void>;
  refresh: () => Promise<void>;
}

const OFF: GroupAdvanceContextValue = {
  enabled: false, view: null, busy: false, error: null,
  markReady: async () => {}, simulateToday: async () => {}, refresh: async () => {},
};

const GroupAdvanceContext = createContext<GroupAdvanceContextValue>(OFF);

export function useGroupAdvance(): GroupAdvanceContextValue {
  return useContext(GroupAdvanceContext);
}

/** Group advance of a multi world (`.claude/rules/game/multiplayer.md`, part 3): state, socket, pending summary. */
export function GroupAdvanceProvider({ leagues, mySquadId, children }: { leagues: LeagueData[]; mySquadId: string; children: ReactNode }) {
  const { session, refresh: refreshSave } = useGameSave();
  const { subscribe } = useSocial();
  const enabled = !!session?.groupAdvance;
  const saveId = session?.saveId ?? "";
  const [view, setView] = useState<GroupAdvanceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayLog, setDayLog] = useState<AdvanceDayResponse | null>(null);
  const [notice, setNotice] = useState<SeasonNotice | null>(null);
  const lastDate = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const r = await groupAdvanceApi.view(saveId);
    if (r.ok) setView(r.data);
  }, [enabled, saveId]);

  // The days that ran while the seat was away: only on the dashboard, once the world stopped.
  const showSummary = useCallback(async () => {
    if (!enabled || window.location.pathname !== "/dashboard") return;
    const r = await groupAdvanceApi.summary(saveId);
    if (!r.ok) return;
    const out = summaryOutcome(r.data.days);
    if (!out) return;
    if (out.sacked) {
      await groupAdvanceApi.clearSummary(saveId);
      window.location.href = "/fired";
      return;
    }
    const res = await fetch(`/api/saves/${encodeURIComponent(saveId)}/days/${encodeURIComponent(out.lastDate)}`);
    if (res.ok) setDayLog({ ...(await res.json()), newDate: out.newDate } as AdvanceDayResponse);
    if (out.notice) setNotice(out.notice);
    if (!res.ok && !out.notice) await groupAdvanceApi.clearSummary(saveId);
  }, [enabled, saveId]);

  useEffect(() => { void refresh().then(() => showSummary()); }, [refresh, showSummary]);

  useEffect(() => {
    if (!enabled) return;
    return subscribe((event) => {
      if (event.type !== "world_progress" || event.saveId !== saveId) return;
      setView((v) => (v ? { ...v, currentDate: event.date, target: event.target, running: event.running, waitingFor: event.waitingFor } : v));
      if (event.error) setError(event.error);
      if (!event.running) {
        updateSessionCurrentDate(event.date);
        void refresh();
        if (lastDate.current !== event.date) {
          lastDate.current = event.date;
          void refreshSave({ background: true }).then(() => showSummary());
        }
      }
    });
  }, [enabled, saveId, subscribe, refresh, refreshSave, showSummary]);

  const markReady = useCallback(async (until: string | null) => {
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.ready(saveId, until);
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  }, [saveId, refresh]);

  const simulateToday = useCallback(async () => {
    const today = view?.me.matchToday;
    if (!today || !view) return;
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.simulate(saveId, view.currentDate, today.fixtureId);
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  }, [saveId, view, refresh]);

  const dismissDay = () => {
    setDayLog(null);
    if (!notice) void groupAdvanceApi.clearSummary(saveId);
    void refreshSave();
  };
  const dismissNotice = () => {
    setNotice(null);
    void groupAdvanceApi.clearSummary(saveId);
    void refreshSave();
  };

  const value: GroupAdvanceContextValue = enabled
    ? { enabled, view, busy, error, markReady, simulateToday, refresh }
    : OFF;

  return (
    <GroupAdvanceContext.Provider value={value}>
      {children}
      {dayLog && <DaySummaryModal dayLog={dayLog} onDismiss={dismissDay} mySquadId={mySquadId} leagues={leagues} />}
      {notice && !dayLog && (
        <SeasonNoticeModal notice={notice} leagues={leagues} currentLeagueName={session?.leagueName ?? ""} onDismiss={dismissNotice} />
      )}
    </GroupAdvanceContext.Provider>
  );
}
```

- [ ] **Step 2: Layout**

Em `Layout.tsx`, dentro do `<SocialProvider>`, envolva o `<div className="h-screen …">` com
`<GroupAdvanceProvider leagues={leagues} mySquadId={mySquadId}>…</GroupAdvanceProvider>` e, na `TopNavigation`:

```tsx
        <TopNavigation
          onAdvanceDay={session?.groupAdvance ? undefined : handleAdvanceDay}
          onFastForward={!session?.groupAdvance && canFastForward ? handleFastForward : undefined}
          dayAction={session?.groupAdvance ? <ReadyControl /> : undefined}
          advancing={advancing}
          leagues={leagues}
        />
```

(imports: `GroupAdvanceProvider` de `@/GameInterface/World/GroupAdvanceProvider`, `ReadyControl` de `@/GameInterface/World/ReadyControl` — criado na Tarefa 20.)

Em `useAdvanceDay.ts`, no começo de `handleAdvanceDay` e de `handleFastForward`:

```ts
    // A world advanced by the group: the executor runs the days (part 3).
    if (session?.groupAdvance) return;
```

- [ ] **Step 3: Verificação de tipos**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "error TS"`
Esperado: só o erro antigo (o import de `ReadyControl` falha até a Tarefa 20 — faça as Tarefas 19 e 20 no mesmo commit se preferir).

- [ ] **Step 4: Commit** (junto da Tarefa 20)

---

## Tarefa 20: Barra superior — Pronto até… / Jogar / Simular

**Files:**
- Create: `src/GameInterface/World/ReadyControl.tsx`
- Modify: `src/GameInterface/Components/TopNavigation.tsx`, `scripts/ui-audit.ts`

- [ ] **Step 1: Componente**

```tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { formatGameDate } from "@/GameInterface/formatDate";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { addDays } from "@/Domain/dates";

const PRIMARY = "flex items-center gap-1 h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 whitespace-nowrap shrink-0";
const SECONDARY = "flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0";
const MENU_ITEM = "w-full text-left h-10 px-3 rounded text-sm font-semibold text-foreground hover:bg-secondary/40 cursor-pointer bg-transparent border-0";

/** The day block's action in a group world (`.claude/rules/game/multiplayer.md`, part 3). */
export function ReadyControl() {
  const { t, i18n } = useTranslation();
  const { view, busy, error, markReady, simulateToday } = useGroupAdvance();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const fmt = (d: string | null) => (d ? formatGameDate(d, i18n.language, "dayMonth") : "—");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  if (!view) return null;

  if (view.running) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground whitespace-nowrap tabular-nums" role="status">
        <Icon name="clock" size={16} />
        {t("world.advance.running", { date: fmt(view.currentDate), target: fmt(view.target) })}
      </span>
    );
  }

  const today = view.me.matchToday;
  if (today && !view.me.decision) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className={SECONDARY} onClick={() => void simulateToday()} disabled={busy}>
          {t("world.advance.simulate")}
        </button>
        {!today.humanOpponent && (
          <button type="button" className={PRIMARY} onClick={() => { window.location.href = "/match-preview"; }} disabled={busy}>
            <Icon name="play" size={16} />
            {t("world.advance.play")}
          </button>
        )}
      </div>
    );
  }

  const choose = async (until: string) => {
    setOpen(false);
    await markReady(until);
  };

  if (view.me.readyUntil && view.me.readyUntil > view.currentDate) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
          {t("world.advance.readyUntil", { date: fmt(view.me.readyUntil) })}
          {view.waitingFor.length > 0 && <span className="text-muted-foreground"> · {t("world.advance.waiting", { count: view.waitingFor.length })}</span>}
        </span>
        <button
          type="button"
          className={`${SECONDARY} w-9 px-0 justify-center`}
          onClick={() => void markReady(null)}
          disabled={busy}
          title={t("world.advance.unmark")}
          aria-label={t("world.advance.unmark")}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" className={PRIMARY} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} disabled={busy}>
        {t("world.advance.readyButton")}
        <Icon name="chevron-down" size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-card p-2 shadow-sm flex flex-col gap-1">
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => void choose("tomorrow")}>{t("world.advance.readyTomorrow")}</button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => void choose("next_match")}>{t("world.advance.readyNextMatch")}</button>
          <label htmlFor="ready-until-date" className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground px-3 pt-2">
            {t("world.advance.readyDate")}
          </label>
          <div className="flex items-center gap-1 px-1">
            <input
              id="ready-until-date"
              type="date"
              min={addDays(view.currentDate, 1)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 flex-1 rounded border border-border bg-transparent px-2 text-sm"
            />
            <button type="button" className={SECONDARY} disabled={!date} onClick={() => void choose(date)}>{t("world.advance.readyConfirm")}</button>
          </div>
        </div>
      )}
      {error && <span className="sr-only" role="alert">{t(`world.advance.errors.${error}`, { defaultValue: t("world.advance.errors.generic") })}</span>}
    </div>
  );
}
```

- [ ] **Step 2: TopNavigation**

Em `TopNavigation.tsx`, no `Props`:

```ts
  /** Replaces fast-forward + Continue (group world, part 3). */
  dayAction?: ReactNode;
```

(importe `type ReactNode` de `react`), desestruture `dayAction` e, no bloco do dia, envolva os botões de avanço rápido e Continuar:

```tsx
          {dayAction ?? (
            <>
              {onFastForward && ( /* botão de avanço rápido, como está */ )}
              {onAdvanceDay && ( /* Continuar, como está */ )}
            </>
          )}
```

(mova os dois blocos existentes para dentro do fragmento, sem mudar as classes).

- [ ] **Step 3: Allowlist do ui-audit**

Em `scripts/ui-audit.ts`, no `ALLOWLIST`:

```ts
  {
    file: "src/GameInterface/World/ReadyControl.tsx",
    rule: "button",
    match: "h-9 px-4 rounded bg-primary",
    reason: "Ready/Play in the top bar's day block (group world): 36px tall like Continue, which it replaces",
  },
```

- [ ] **Step 4: Verificar**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "error TS"` → só o erro antigo.
Run: `bun run ui:audit --hard` → 0 violações duras.
Run: `bun run ui:audit 2>&1 | grep -A3 "World/"` → sem violações leves nos arquivos novos (corrija ou justifique na allowlist).

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/World src/GameInterface/Components/Layout.tsx src/GameInterface/Components/TopNavigation.tsx src/GameInterface/useAdvanceDay.ts scripts/ui-audit.ts
git commit -m "feat(group-advance): Pronto até, Jogar e Simular na barra superior e resumo dos dias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 21: Faixa do grupo e status dos membros

**Files:**
- Create: `src/GameInterface/World/GroupAdvanceBand.tsx`
- Modify: `src/GameInterface/DashboardScreen.tsx`, `src/GameInterface/World/WorldScreen.tsx` (parte 2)

- [ ] **Step 1: Componente**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatGameDate } from "@/GameInterface/formatDate";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { deadlineLeft } from "@/GameInterface/World/groupAdvanceText";
import type { GroupMemberView } from "@/types/groupAdvanceTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** The group's date, target, who is missing and the deadline (Painel and league screen). */
export function GroupAdvanceBand() {
  const { t, i18n } = useTranslation();
  const { enabled, view } = useGroupAdvance();
  const now = useNow(60_000);
  if (!enabled || !view) return null;
  const fmt = (d: string | null) => (d ? formatGameDate(d, i18n.language, "dayMonth") : "—");
  const left = deadlineLeft(view.deadlineAt, now);

  let state: string;
  if (view.running) state = t("world.advance.running", { date: fmt(view.currentDate), target: fmt(view.target) });
  else if (view.waitingFor.length > 0) state = t("world.advance.band.waitingFor", { names: view.waitingFor.join(", ") });
  else state = t("world.advance.band.allReady");

  return (
    <section aria-label={t("world.advance.band.title")} className="border border-border rounded-md px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div>
        <div className={LABEL}>{t("world.advance.band.date")}</div>
        <div className="font-display font-bold tabular-nums text-xl">{fmt(view.currentDate)}</div>
      </div>
      <div>
        <div className={LABEL}>{t("world.advance.band.target")}</div>
        <div className="font-display font-bold tabular-nums text-xl">{fmt(view.target)}</div>
      </div>
      <p className="text-sm m-0 flex-1 min-w-[200px]">{state}</p>
      {!view.running && view.waitingFor.length > 0 && (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {view.deadlineHours === null
            ? t("world.advance.band.noDeadline")
            : left?.hours != null
              ? t("world.advance.band.deadlineHours", { count: left.hours })
              : left?.minutes != null
                ? t("world.advance.band.deadlineMinutes", { count: left.minutes })
                : t("world.advance.band.deadlineNow")}
        </p>
      )}
    </section>
  );
}

/** One member's advance status (league screen members list). */
export function MemberAdvanceStatus({ seatId }: { seatId: string }) {
  const { t, i18n } = useTranslation();
  const { view } = useGroupAdvance();
  const m: GroupMemberView | undefined = view?.members.find((x) => x.seatId === seatId);
  if (!m) return null;
  const color = m.status === "ready" ? "text-primary" : m.status === "late" ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`text-sm font-semibold ${color} tabular-nums whitespace-nowrap`}>
      {t(`world.advance.status.${m.status}`)}
      {m.status === "ready" && m.readyUntil ? ` · ${formatGameDate(m.readyUntil, i18n.language, "dayMonth")}` : ""}
    </span>
  );
}
```

- [ ] **Step 2: Ligar nas telas**

`DashboardScreen.tsx`: logo depois do título da tela (dentro do `ScreenContainer`), `<GroupAdvanceBand />`
(`import { GroupAdvanceBand } from "@/GameInterface/World/GroupAdvanceBand";`). Fora do multi ele não desenha nada.

`WorldScreen.tsx` (parte 2): `<GroupAdvanceBand />` no topo (em `running`) e, em cada linha da lista de membros, uma
coluna "AVANÇO" (`t("world.advance.status.column")`) com `<MemberAdvanceStatus seatId={member.seatId} />`. A
`WorldScreen` está dentro do `Layout` (portanto dentro do `GroupAdvanceProvider`).

- [ ] **Step 3: Verificar**

Run: `bun run ui:audit --hard` → 0 duras; `bun run ui:audit 2>&1 | grep -A3 "World/"` → limpo.
Run: `bunx tsc --noEmit -p . 2>&1 | grep "error TS"` → só o erro antigo.

- [ ] **Step 4: Commit**

```bash
git add src/GameInterface/World src/GameInterface/DashboardScreen.tsx
git commit -m "feat(group-advance): faixa do grupo no Painel e status dos membros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 22: Partida ao vivo, prévia e resultado no mundo em grupo

**Files:**
- Modify: `src/GameInterface/MatchScreen.tsx`, `src/GameInterface/MatchPreviewScreen.tsx`, `src/GameInterface/MatchResultScreen.tsx`

- [ ] **Step 1: MatchScreen grava a partida em vez de avançar o dia**

No `setTimeout` do fim da partida (onde hoje faz `fetch(\`/api/advance-day/…\`)`), monte a gravação uma vez e desvie no mundo em grupo:

```ts
              const ctx = matchContextRef.current;
              const gs = gameStateRef.current;
              const recording = ctx && gs
                ? {
                  ...buildPlayedMatchRecording(gs, ctx.fixture, ctx.mySquadId, ctx.homeSquad, ctx.awaySquad, managerCardsRef.current),
                  ...(complaintMoraleRef.current ? { complaintMorale: true as const } : {}),
                }
                : null;
              if (session?.groupAdvance && ctx && recording) {
                // Group world (part 3): the recording waits for the executor; the day runs with the group.
                const r = await groupAdvanceApi.liveRecording(saveId, matchDate, ctx.fixture.id, recording);
                if (!r.ok) {
                  window.location.href = `/match-result?error=${encodeURIComponent(r.error)}`;
                  return;
                }
                recordedRef.current = true;
                clearMatchSnapshot();
                window.location.href = `/match-result?date=${encodeURIComponent(matchDate)}&pending=1`;
                return;
              }
              const payload = recording ? JSON.stringify({ playedMatch: recording }) : null;
```

e mantenha o resto do caminho solo (o `fetch` de `/api/advance-day` com `payload`). Importe `groupAdvanceApi` de
`@/GameInterface/World/groupAdvanceApi`. O `match-setup` com 409 `seatOpponent` na partida continua como está.

- [ ] **Step 2: MatchPreviewScreen — Simular no mundo em grupo**

No começo de `handleSendAssistant`:

```ts
    if (session.groupAdvance) {
      // Group world (part 3): the decision is stored; the day runs with the group.
      setCommencing(true);
      clearMatchSnapshot();
      const v = await groupAdvanceApi.view(session.saveId);
      const today = v.ok ? v.data.me.matchToday : null;
      if (v.ok && today) await groupAdvanceApi.simulate(session.saveId, v.data.currentDate, today.fixtureId);
      window.location.href = "/dashboard";
      return;
    }
```

(antes do `setCommencing(true)` que já existe; `session` já é checado na primeira linha da função).

- [ ] **Step 3: MatchResultScreen — resultado provisório**

Acrescente o estado `const [pendingResult, setPendingResult] = useState(false);`. No carregamento, antes da checagem
`lastDayForResult` (a que redireciona para o Painel), acrescente:

```ts
        if (new URLSearchParams(window.location.search).get("pending") === "1" && session.groupAdvance) {
          const live = await groupAdvanceApi.pendingLive(session.saveId);
          if (live.ok && live.data.event && live.data.date === date) {
            const ev = live.data.event;
            const [hs, as] = await Promise.all([
              fetch(`/api/saves/${session.saveId}/squad/${session.leagueSlug}/${encodeURIComponent(ev.home)}`).then((r) => (r.ok ? (r.json() as Promise<Squad>) : null)),
              fetch(`/api/saves/${session.saveId}/squad/${session.leagueSlug}/${encodeURIComponent(ev.away)}`).then((r) => (r.ok ? (r.json() as Promise<Squad>) : null)),
            ]);
            if (cancelled) return;
            setMatchEvent(ev);
            setResolvedDate(date);
            setHomeSquad(hs);
            setAwaySquad(as);
            setPendingResult(true);
            return;
          }
          // The executor already ran that day: the official result is in the day log.
        }
```

e no topo do resultado renderizado, quando `pendingResult`:

```tsx
        {pendingResult && <Notice className="mb-4">{t("world.advance.result.pending")}</Notice>}
```

(`import { Notice } from "@/GameInterface/ui/Notice";`). O botão de saída do resultado continua indo para o Painel.

- [ ] **Step 4: Verificar**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "error TS"` → só o erro antigo.
Run: `bun run ui:audit --hard` → 0 duras.
Run: `bun test src/GameInterface` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/MatchScreen.tsx src/GameInterface/MatchPreviewScreen.tsx src/GameInterface/MatchResultScreen.tsx
git commit -m "feat(group-advance): partida ao vivo grava para o grupo; simular e resultado provisório

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 23: Textos (en, pt-BR)

**Files:**
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`
- Create: `src/i18n/groupAdvance.keys.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  "readyButton", "readyTomorrow", "readyNextMatch", "readyDate", "readyConfirm", "readyUntil", "waiting_one",
  "waiting_other", "unmark", "play", "simulate", "running", "band.title", "band.date", "band.target",
  "band.waitingFor", "band.allReady", "band.noDeadline", "band.deadlineHours_one", "band.deadlineHours_other",
  "band.deadlineMinutes_one", "band.deadlineMinutes_other", "band.deadlineNow", "status.column", "status.ready",
  "status.match", "status.late", "status.no_club", "inbox.subject", "inbox.preview", "inbox.previewSimulated",
  "result.pending", "errors.generic", "errors.invalidDate", "errors.dayClosed", "errors.notYourMatch",
  "errors.seatOpponent", "errors.notMulti", "errors.network",
].map((k) => `world.advance.${k}`);

describe("group advance i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), k).toBe("string");
    });
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/i18n/groupAdvance.keys.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Textos**

Dentro do objeto `world` que a parte 2 criou (crie-o no nível raiz se não existir), acrescente `advance`:

`en.json`:

```json
    "advance": {
      "readyButton": "Ready until…",
      "readyTomorrow": "Tomorrow",
      "readyNextMatch": "My next match",
      "readyDate": "A date",
      "readyConfirm": "Set",
      "readyUntil": "Ready until {{date}}",
      "waiting_one": "waiting for {{count}}",
      "waiting_other": "waiting for {{count}}",
      "unmark": "Not ready",
      "play": "Play",
      "simulate": "Simulate",
      "running": "Advancing… {{date}} of {{target}}",
      "band": {
        "title": "Group advance",
        "date": "World date",
        "target": "Target",
        "waitingFor": "Waiting for {{names}}",
        "allReady": "Everyone is ready",
        "noDeadline": "No deadline: the league waits for everyone",
        "deadlineHours_one": "Goes on without them in {{count}} hour",
        "deadlineHours_other": "Goes on without them in {{count}} hours",
        "deadlineMinutes_one": "Goes on without them in {{count}} minute",
        "deadlineMinutes_other": "Goes on without them in {{count}} minutes",
        "deadlineNow": "Goes on without them now"
      },
      "status": {
        "column": "Advance",
        "ready": "Ready",
        "match": "Match to play",
        "late": "Late",
        "no_club": "No club"
      },
      "inbox": {
        "subject": "The assistant moved on for you",
        "preview": "Ready until {{until}}",
        "previewSimulated": "Ready until {{until}} · match of {{match}} simulated"
      },
      "result": {
        "pending": "Provisional result: it counts when the world reaches this day."
      },
      "errors": {
        "generic": "Could not save. Try again.",
        "invalidDate": "Pick a date from tomorrow on.",
        "dayClosed": "That day has already been played.",
        "notYourMatch": "That is not your match today.",
        "seatOpponent": "Against another manager the match is simulated.",
        "notMulti": "This save is not a friends league.",
        "network": "No connection."
      }
    }
```

`pt-BR.json`:

```json
    "advance": {
      "readyButton": "Pronto até…",
      "readyTomorrow": "Amanhã",
      "readyNextMatch": "Meu próximo jogo",
      "readyDate": "Uma data",
      "readyConfirm": "Marcar",
      "readyUntil": "Pronto até {{date}}",
      "waiting_one": "esperando {{count}}",
      "waiting_other": "esperando {{count}}",
      "unmark": "Desmarcar",
      "play": "Jogar",
      "simulate": "Simular",
      "running": "Avançando… {{date}} de {{target}}",
      "band": {
        "title": "Avanço do grupo",
        "date": "Data do mundo",
        "target": "Alvo",
        "waitingFor": "Falta: {{names}}",
        "allReady": "Todos prontos",
        "noDeadline": "Sem prazo: a liga espera todos",
        "deadlineHours_one": "Avança sem eles em {{count}} hora",
        "deadlineHours_other": "Avança sem eles em {{count}} horas",
        "deadlineMinutes_one": "Avança sem eles em {{count}} minuto",
        "deadlineMinutes_other": "Avança sem eles em {{count}} minutos",
        "deadlineNow": "Avança sem eles agora"
      },
      "status": {
        "column": "Avanço",
        "ready": "Pronto",
        "match": "Jogo a decidir",
        "late": "Atrasado",
        "no_club": "Sem clube"
      },
      "inbox": {
        "subject": "O assistente avançou por você",
        "preview": "Pronto até {{until}}",
        "previewSimulated": "Pronto até {{until}} · jogo de {{match}} simulado"
      },
      "result": {
        "pending": "Resultado provisório: vale quando o mundo chegar a este dia."
      },
      "errors": {
        "generic": "Não foi possível salvar. Tente de novo.",
        "invalidDate": "Escolha uma data a partir de amanhã.",
        "dayClosed": "Esse dia já foi jogado.",
        "notYourMatch": "Esse não é o seu jogo de hoje.",
        "seatOpponent": "Contra outro técnico o jogo é simulado.",
        "notMulti": "Este jogo não é uma liga de amigos.",
        "network": "Sem conexão."
      }
    }
```

(Edite com a ferramenta Edit; os dois arquivos ficam JSON válido.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/i18n`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n
git commit -m "feat(group-advance): textos do avanço em grupo (en, pt-BR)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 24: Medição e fluxo de 3 assentos

**Files:**
- Create: `scripts/group-advance-measure.ts`

- [ ] **Step 1: Script**

```ts
/**
 * Group advance (multiplayer part 3): real time to the next stop with 3 seats in 3 leagues, and a ~30-day flow with a
 * live match, simulated matches and an expired deadline. `bun scripts/group-advance-measure.ts [days=30]`.
 * The save is always deleted at the end.
 */
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { kickWorld, seatMatchOn, setKickScheduler } from "@/backend/groupAdvance";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { addDays } from "@/Domain/dates";

const DAYS = Number(process.argv[2] ?? 30);
setKickScheduler(() => {});

const owner = devAutoLogin("ga-measure-a@test.local");
const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League",
  clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
});
const saveId = meta.id;
try {
  const a = await ownSolo(saveId, owner.user.id);
  const index = await saveService.getSquadIndex(saveId);
  const b = (await addSeat(saveId, {
    userId: devAutoLogin("ga-measure-b@test.local").user.id, clubId: index.inLeague("la_liga")[0]!.squadId,
    manager: { name: "B", nationalityIso: "es", backgroundId: "former-player" },
  })).seatId;
  const c = (await addSeat(saveId, {
    userId: devAutoLogin("ga-measure-c@test.local").user.id, clubId: index.inLeague("bundesliga")[0]!.squadId,
    manager: { name: "C", nationalityIso: "de", backgroundId: "former-player" },
  })).seatId;
  const seats = [a, b, c];
  await saveService.updateMeta(saveId, { world: runningWorld(owner.user.id, { deadlineHours: 12 }) });
  const start = (await saveService.getMeta(saveId))!.currentDate!;
  const stops: { days: number; ms: number; waiting: number }[] = [];
  let liveUsed = false;
  let deadlineUsed = false;

  while ((await saveService.getMeta(saveId))!.currentDate! < addDays(start, DAYS)) {
    const today = (await saveService.getMeta(saveId))!.currentDate!;
    for (const seatId of seats) {
      const game = await seatMatchOn(saveService, saveId, seatId, today);
      if (game && !(await saveService.getSeat(saveId, seatId))!.matchDecision) {
        if (!liveUsed && seatId === a) {
          await saveService.writeLiveRecording(saveId, a, {
            date: today, fixtureId: game.id,
            recording: {
              fixtureId: game.id, score: { home: 1, away: 0 }, teamStats: { home: {} as never, away: {} as never },
              playerStats: {}, playerRatings: {}, playerEnergy: {}, substitutions: [], durationMs: 1,
            },
          });
          await saveService.updateSeat(saveId, a, { matchDecision: { date: today, fixtureId: game.id, mode: "live" } });
          liveUsed = true;
        } else {
          await saveService.updateSeat(saveId, seatId, { matchDecision: { date: today, fixtureId: game.id, mode: "simulate" } });
        }
      }
      const next = await seatNextMatchDate(saveService, saveId, seatId, addDays(today, 1));
      const late = !deadlineUsed && seatId === c && stops.length === 2;
      await saveService.updateSeat(saveId, seatId, { readyUntil: late ? null : (next ?? addDays(today, 7)) });
    }
    if (!deadlineUsed && stops.length === 2) {
      const w = (await saveService.getMeta(saveId))!.world!;
      await saveService.updateMeta(saveId, { world: { ...w, advance: { running: false, target: today, waitingSince: new Date(Date.now() - 13 * 3_600_000).toISOString() } } });
      deadlineUsed = true;
    }
    const t0 = performance.now();
    const r = await kickWorld(saveId);
    const ms = performance.now() - t0;
    if (r.error) throw new Error(`stop ${stops.length + 1}: ${r.error}`);
    stops.push({ days: r.days, ms, waiting: r.waitingFor.length });
    console.log(`stop ${stops.length}: ${r.days} days to ${r.date} in ${(ms / 1000).toFixed(1)} s (${r.days ? (ms / r.days / 1000).toFixed(2) : "-"} s/day), waiting ${r.waitingFor.length}`);
    if (r.days === 0 && stops.length > 40) throw new Error("the world does not move");
  }

  const days = stops.reduce((s, x) => s + x.days, 0);
  const ms = stops.reduce((s, x) => s + x.ms, 0);
  const auto = (await saveService.getInbox(saveId, c)).filter((m) => m.category === "world").length;
  console.log(`\n${days} days, ${stops.length} stops, ${(ms / 1000).toFixed(1)} s, ${(ms / days / 1000).toFixed(2)} s/day, ` +
    `${(ms / stops.length / 1000).toFixed(1)} s per stop; live used ${liveUsed}; deadline messages for C: ${auto}`);
} finally {
  await saveService.deleteSave(saveId);
}
```

- [ ] **Step 2: Rodar**

Run: `bun scripts/group-advance-measure.ts 30`
Esperado: termina sem erro; "live used true"; "deadline messages for C: ≥ 1". Anote a última linha e a média de
segundos por parada para a Tarefa 25.

- [ ] **Step 3: Commit**

```bash
git add scripts/group-advance-measure.ts
git commit -m "chore(group-advance): medição e fluxo de 3 assentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 25: Regra do multiplayer — parte 3

**Files:**
- Modify: `.claude/rules/game/multiplayer.md`

- [ ] **Step 1: Seção nova**

Acrescente ao fim do arquivo (com os números da Tarefa 24):

```markdown
## Parte 3: avanço em grupo

Spec: `docs/superpowers/specs/2026-10-15-multiplayer-group-advance-design.md`. Plano:
`docs/superpowers/plans/2026-10-15-multiplayer-group-advance.md`. Vale com `mode: "multi"` e `world` (parte 2); só anda
em `world.phase === "running"`. O solo não muda.

- **Pronto até:** `SeatState.readyUntil` = a data em que o mundo pode parar sem ele (o `currentDate` alvo). "Amanhã" =
  um dia; "meu próximo jogo" = o dia do jogo (a véspera é o último dia rodado); datas antes de amanhã → 400. `null` =
  não está pronto.
- **Alvo:** `min(readyUntil)` de todos os assentos (`computeGroupTarget`, `src/Domain/groupAdvance/groupAdvance.ts`);
  um jogo oficial do assento (clube ou seleção) sem `matchDecision` para o mundo **no** dia do jogo. Sem clube: só a
  data. Decidir o jogo (`live`/`simulate`) conta como pronto até o dia seguinte.
- **Paradas do dia:** demissão, proposta de emprego ou de seleção, fim da temporada do país do assento
  (`seatStops`): o `readyUntil` dele volta a `null`.
- **Prazo:** toda parada grava `world.advance.waitingSince`. Passadas `deadlineHours` (12/24/48; `null` = espera todos),
  o assistente leva cada atrasado ao menor `readyUntil` dos outros (ou amanhã), simula o primeiro jogo dele no trecho e
  manda a mensagem `world` / `auto_advanced`. O prazo recomeça na próxima parada.
- **Executor** (`src/backend/groupAdvance.ts`): `kickWorld` roda em segundo plano, um por mundo (um segundo chamado só
  pede uma nova olhada no fim), um dia por vez com `runBufferedDay` dentro de `withSaveLock`, relendo o alvo a cada dia;
  as gravações ao vivo do dia entram como `recordings[seatId]`; uma gravação recusada vira `simulate` (não trava o
  mundo). Depois de cada dia: limpa decisões e gravações usadas, guarda a parte do assento em `pendingSummary.json` e
  manda `world_progress { saveId, date, target, running, waitingFor (apelidos), error? }` a todos os membros. Erro num
  dia: `logError("world", …)`, `advance.running = false`; o próximo kick tenta de novo.
- **Relógio:** `startWorldClock()` (subida do servidor, `src/index.ts`) libera um `advance.running` preso, dá um kick em
  todo mundo `running` e, a cada 60 s, chama `kickWorld` nos mundos com prazo vencido (lista de `world_codes`).
- **Rotas** (`src/backend/groupAdvanceRoutes.ts`, `requireSeat`; solo → 409 `notMulti`, lobby → 409 `lobby`):
  `POST /api/worlds/:saveId/ready { until }`, `POST …/match-decision { date, fixtureId, mode: "simulate" }`,
  `POST …/live-recording { date, fixtureId, recording }` (valida forma, dia, jogo, adversário humano 409, mata-mata sem
  vencedor 400), `GET …/live-recording` (resultado provisório), `GET …/advance` (estado do grupo), `GET/DELETE …/summary`.
  `POST /api/advance-day` e `/advance-until` → 409 `groupAdvance`. `match-setup` devolve `matchDay { date, fixtureId }`.
- **Arquivos do assento:** `liveRecording.json` (apagado quando o dia roda), `pendingSummary.json` (até 120 dias).
- **Telas:** a barra superior troca o Continuar por **Pronto até…** (amanhã, meu próximo jogo, uma data) e, marcado,
  "Pronto até 12/03 · esperando 2" com desmarcar; no dia de jogo **Jogar** (prévia → partida) e **Simular**; durante o
  avanço "Avançando… 14/03 de 20/03". Faixa do grupo no Painel e na tela da liga (data, alvo, quem falta, prazo
  restante); status por membro (pronto, jogo a decidir, atrasado, sem clube). No Painel, depois de um avanço, o resumo
  do último dia, o aviso de fim de temporada e a demissão. A partida ao vivo grava para o grupo e mostra o resultado
  provisório (`/match-result?pending=1`). i18n `world.advance.*`.

### Medição (`bun scripts/group-advance-measure.ts 30`, AAAA-MM-DD)

| Assentos | Ligas | Dias | Paradas | Tempo total | Por dia | Por parada |
|---|---|---|---|---|---|---|
| 3 | Premier, La Liga, Bundesliga | (da saída) | (da saída) | (da saída) | (da saída) | (da saída) |

### Testes (parte 3)

```
bun test src/Domain/groupAdvance src/Domain/inbox/worldAdvanceMessage.test.ts src/backend/playedMatchValidation.test.ts \
  src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/groupAdvance.live.test.ts \
  src/backend/dal/seats.dal.test.ts src/GameInterface/World src/i18n/groupAdvance.keys.test.ts
```
```

Substitua cada "(da saída)" pelo número medido (e `AAAA-MM-DD` pela data da medição) antes do commit.

- [ ] **Step 2: Limitações**

Na seção "Limitações" da parte 1, apague a linha
"- Avanço rápido desligado com dois ou mais assentos até a parte 3." e troque
"- Sem convites, "pronto"/prazo, humano × humano ao vivo nem classificação (partes 2–5)." por
"- Sem humano × humano ao vivo nem classificação (partes 4–5)." (se a parte 2 já tiver mexido nessa linha, só tire
"pronto"/prazo dela). Na seção "Regra" da parte 1, troque a frase do avanço rápido por:
"- Avanço manual (`/advance-day`, `/advance-until`) num mundo em grupo: 409 `groupAdvance` (só o executor avança,
parte 3); num mundo multi sem `world` (testes), o avanço rápido dá 409 `multiSeat`." Acrescente às limitações da
parte 3:

```markdown
- O executor e o relógio do prazo vivem em memória, num processo só (a subida do servidor retoma).
- O resultado oficial do jogo ao vivo só aparece no mundo quando o executor roda aquele dia.
- O jogo da seleção ao vivo não tem resultado provisório (só o do clube).
- Sem pausa da liga pelo dono (o "sem prazo" já espera todos).
```

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/game/multiplayer.md
git commit -m "docs(multiplayer): regra da parte 3 (avanço em grupo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Marco de verificação B (final)

- [ ] Run (um de cada vez, por memória):

```bash
bun test src/Domain/groupAdvance src/Domain/inbox src/Domain/seats src/backend/playedMatchValidation.test.ts \
  src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/dal \
  src/GameInterface src/i18n
bun test src/backend/groupAdvance.live.test.ts
bun test src/backend/seats.twoSeats.test.ts src/backend/seats.review.test.ts src/backend/advanceUntil.test.ts \
  src/backend/var.advanceDay.test.ts src/backend/matchSetup.career.test.ts
```

Esperado: PASS.
- [ ] Run: `bun test` (suíte inteira) → PASS.
- [ ] Run: `bunx tsc --noEmit -p . 2>&1 | grep "error TS"` → só `src/GameEngine/Domain/DecisionTree.ts:750`.
- [ ] Run: `bun run ui:audit --hard` → 0 violações duras; `bun run ui:audit` sem violações leves nos arquivos novos.
- [ ] Navegador (`DEV_AUTO_LOGIN=1 bun run dev` a partir de `C:\Projects\FMProject-mpw`; aba 1 `localhost`, aba 2
  `127.0.0.1` com `?as=2`, `.claude/rules/dev-login.md`): criar a liga com amigos, o segundo entra, começar; os dois
  marcam "pronto até amanhã" e o mundo avança um dia nas duas abas (faixa "Avançando…", depois a data nova); no dia
  de jogo, "Jogar" leva à prévia e à partida, que grava e mostra o resultado provisório; o outro simula; o mundo segue.

Versão e changelog **não** entram neste plano (saem junto da parte 2, num passo de release à parte). Smoke de temporada
com 2 assentos: só quando o usuário pedir.
