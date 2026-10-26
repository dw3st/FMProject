# Mundo público (Etapa 43, parte 5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um mundo multiplayer oficial do servidor, sem dono, que anda em horários fixos (9h, 13h, 18h, 22h de Brasília), um dia de jogo por horário, até 40 técnicos nas 10 ligas principais, recriado a cada versão com hall da fama.

**Architecture:** o mundo público é um mundo em grupo comum (`mode: "multi"` + `world`) com `world.kind = "public"`. O executor de `src/backend/groupAdvance.ts` roda os dias; no público o alvo vem de `world.advance.slotTarget`, gravado pelo relógio quando um horário vence (em vez do "pronto até" e do prazo). A criação usa `createSave` sem clube humano (`worldOnly`). Spec: `docs/superpowers/specs/2026-10-26-multiplayer-public-world-design.md`.

**Tech Stack:** Bun + TypeScript, `bun:sqlite`, `bun test`, React 19 + Tailwind (telas), i18next (en, pt-BR).

**Regras do projeto:** imports sempre `@/…`; nada de migração de save; textos curtos e sem cara de IA; toda tela segue `.claude/rules/ui-standard.md` (`bun run ui:audit` limpo); commits só com os arquivos da tarefa (pathspec), mensagem terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rodar suítes grandes uma de cada vez (memória).

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| Create `src/Domain/multiplayer/publicWorldConfig.ts` | Constantes `PUBLIC_WORLD` |
| Create `src/Domain/multiplayer/publicWorld.ts` (+ `.test.ts`) | Puro: horários (`slotAt`, `dueSlot`, `nextSlotAt`), alvo do passo (`publicStepTarget`), inatividade (`inactivityAction`), `isPublicLeague`, `isPublicWorld` |
| Modify `src/types/multiplayerTypes.ts` | `WorldState.kind`, `edition`; `WorldErrorCode` `publicWorld`; `PublicWorldInfo`, `PublicEditionView`; `WorldView.kind`, `nextSlotAt` |
| Modify `src/types/groupAdvanceTypes.ts` | `WorldAdvance.lastSlot`, `slotTarget`; `GroupAdvanceView.kind`, `nextSlotAt` |
| Modify `src/types/seatTypes.ts` | `SeatState.lastSeenAt`, `inactiveWarnedAt` |
| Modify `src/backend/SaveService.ts` | `createSave({ worldOnly })` sem assento |
| Modify `src/backend/advanceDay.ts` | `presimulateWorld(saveId, ownerSeatId: string \| null)`; o que mais quebrar com zero assentos (Tarefa 4) |
| Modify `src/backend/db.ts` | tabela `public_editions` em `migrateWorldSchema` |
| Create `src/backend/worlds/publicStore.ts` (+ teste) | SQLite do hall da fama |
| Create `src/backend/worlds/publicWorld.ts` (+ teste) | `ensurePublicWorld`, `publicWorldId`, `publicSlotTick`, `markSeen`, `flushSeen`, `inactivityPass`, `updateHall` |
| Modify `src/backend/groupAdvance.ts` | alvo do público em `stepWorld`; relógio chama `publicSlotTick`; `startWorldClock` chama `ensurePublicWorld`; hall depois de cada execução; `groupAdvanceView` com `kind`/`nextSlotAt` |
| Modify `src/backend/seats.ts` | `removeSeat` aceita o último assento num mundo público |
| Modify `src/backend/worlds/worldRoutes.ts` | `GET /api/worlds/public`, `POST /api/worlds/public/join`, `GET /api/worlds/public/hall`; rotas de dono 409 `publicWorld`; `by-code`/`join` 404 no público; `leave` não apaga o público |
| Modify `src/backend/worlds/worldLifecycle.ts` | `worldView` com `kind`/`nextSlotAt` |
| Modify `src/backend/auth/middleware.ts` | `requireSeat` chama `markSeen` |
| Modify `src/backend/social/socialRoutes.ts` | sala do mundo público sem texto livre (403 `publicRoom`) |
| Modify `src/types/socialTypes.ts` | código `publicRoom` |
| Modify `src/types/inboxTypes.ts`, `src/Domain/inbox/worldAdvanceMessage.ts` | mensagem `world` / `inactive_warning` |
| Modify `src/GameInterface/NewGameWizard.tsx`, `World/worldApi.ts`, `World/JoinScreen.tsx` (ou nova `World/PublicJoin.tsx`) | modo "Mundo público" |
| Modify `src/GameInterface/StartScreen.tsx` | card do mundo público |
| Modify `src/GameInterface/World/WorldScreen.tsx`, `World/GroupAdvanceBand.tsx`, `World/ReadyControl.tsx`, `Social/ChatWindow.tsx` | variante pública; aba Hall da fama; sem texto livre |
| Modify `src/i18n/locales/en.json`, `pt-BR.json` (+ teste de chaves) | textos |
| Modify docs | `.claude/rules/game/multiplayer.md`, `.claude/rules/social.md`, `docs/ROADMAP.md`, changelog 4.35, `package.json` |

---

### Task 1: Constantes e lógica pura

**Files:**
- Create: `src/Domain/multiplayer/publicWorldConfig.ts`
- Create: `src/Domain/multiplayer/publicWorld.ts`
- Test: `src/Domain/multiplayer/publicWorld.test.ts`

- [ ] **Step 1: constantes**

```ts
// src/Domain/multiplayer/publicWorldConfig.ts
/** Multiplayer part 5b: the server's public world (`.claude/rules/game/multiplayer.md`). */
export const PUBLIC_WORLD = {
  /** Local times (America/Sao_Paulo) at which the world takes one step. */
  SLOTS: ["09:00", "13:00", "18:00", "22:00"] as const,
  /** Brasília has no daylight saving since 2019: a fixed UTC offset, in minutes. */
  UTC_OFFSET_MIN: -180,
  MAX_MEMBERS: 40,
  /** The 10 main leagues (same list as `scripts/faces/wikidata.ts` → `LEAGUES`). */
  LEAGUES: [
    "premier_league", "la_liga", "bundesliga", "serie_a", "ligue_1", "brazil_serie_a",
    "of_portuguese_primeira_liga", "of_eredivisie", "of_argentine_premier_division", "of_major_league_soccer",
  ] as const,
  /** The league whose start date the world starts on (the earliest European kickoff). */
  START_LEAGUE: "premier_league",
  WARN_DAYS: 5,
  INACTIVE_DAYS: 7,
  /** Seats' "last seen" is written at most once per this many real minutes. */
  SEEN_WRITE_MIN: 60,
  HALL_TOP: 10,
} as const;
```

- [ ] **Step 2: teste que falha**

```ts
// src/Domain/multiplayer/publicWorld.test.ts
import { describe, expect, test } from "bun:test";
import { dueSlot, inactivityAction, isPublicLeague, isPublicWorld, nextSlotAt, publicStepTarget, slotAt } from "@/Domain/multiplayer/publicWorld";

const ms = (iso: string) => Date.parse(iso);

describe("slots", () => {
  test("slotAt turns a Brasília time of a UTC day into an instant", () => {
    expect(slotAt("2026-10-26", "09:00")).toBe("2026-10-26T12:00:00.000Z");
    expect(slotAt("2026-10-26", "22:00")).toBe("2026-10-27T01:00:00.000Z");
  });
  test("dueSlot: the latest slot already passed and newer than lastSlot, else null", () => {
    const now = ms("2026-10-26T16:30:00.000Z"); // 13:30 Brasília
    expect(dueSlot(now, null)).toBe("2026-10-26T16:00:00.000Z");
    expect(dueSlot(now, "2026-10-26T16:00:00.000Z")).toBeNull();
    expect(dueSlot(now, "2026-10-26T12:00:00.000Z")).toBe("2026-10-26T16:00:00.000Z");
  });
  test("dueSlot: several missed slots are one step (the latest)", () => {
    const now = ms("2026-10-27T02:00:00.000Z"); // 23:00 Brasília
    expect(dueSlot(now, "2026-10-25T12:00:00.000Z")).toBe("2026-10-27T01:00:00.000Z");
  });
  test("dueSlot: just after midnight UTC the 22:00 of the day before still counts", () => {
    const now = ms("2026-10-27T01:30:00.000Z"); // 22:30 Brasília of the 26th
    expect(dueSlot(now, null)).toBe("2026-10-27T01:00:00.000Z");
  });
  test("nextSlotAt: the first slot after now", () => {
    expect(nextSlotAt(ms("2026-10-26T16:30:00.000Z"))).toBe("2026-10-26T21:00:00.000Z");
    expect(nextSlotAt(ms("2026-10-27T01:30:00.000Z"))).toBe("2026-10-27T12:00:00.000Z");
  });
});

describe("publicStepTarget", () => {
  test("plays the parked day and stops on the next seat game day", () => {
    expect(publicStepTarget("2026-09-12", ["2026-09-12", "2026-09-15", "2026-09-19"], [])).toBe("2026-09-15");
  });
  test("parked on a day without games: still stops on the next game day after today", () => {
    expect(publicStepTarget("2026-09-10", ["2026-09-12"], [])).toBe("2026-09-12");
  });
  test("no seat games: the next world league round day after today", () => {
    expect(publicStepTarget("2026-09-10", [], ["2026-09-10", "2026-09-13"])).toBe("2026-09-13");
  });
  test("nothing ahead: one day", () => {
    expect(publicStepTarget("2026-09-10", [], [])).toBe("2026-09-11");
  });
});

describe("inactivity", () => {
  const now = ms("2026-10-26T12:00:00.000Z");
  test("seen recently: nothing", () => {
    expect(inactivityAction("2026-10-24T12:00:00.000Z", null, now)).toBe("none");
  });
  test("5 days: warn once", () => {
    expect(inactivityAction("2026-10-21T11:00:00.000Z", null, now)).toBe("warn");
    expect(inactivityAction("2026-10-21T11:00:00.000Z", "2026-10-26T10:00:00.000Z", now)).toBe("none");
  });
  test("7 days: remove", () => {
    expect(inactivityAction("2026-10-19T11:00:00.000Z", "2026-10-24T10:00:00.000Z", now)).toBe("remove");
  });
  test("never seen counts from null: nothing (the join sets lastSeenAt)", () => {
    expect(inactivityAction(null, null, now)).toBe("none");
  });
});

test("isPublicLeague / isPublicWorld", () => {
  expect(isPublicLeague("premier_league")).toBe(true);
  expect(isPublicLeague("of_championship")).toBe(false);
  expect(isPublicWorld({ mode: "multi", world: { kind: "public" } })).toBe(true);
  expect(isPublicWorld({ mode: "multi", world: {} })).toBe(false);
  expect(isPublicWorld({ mode: "solo" })).toBe(false);
});
```

- [ ] **Step 3: rodar e ver falhar**

Run: `bun test src/Domain/multiplayer/publicWorld.test.ts`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 4: implementar**

```ts
// src/Domain/multiplayer/publicWorld.ts
import { addDays } from "@/Domain/dates";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";

const DAY_MS = 86_400_000;

/** The instant (ISO, UTC) of a Brasília local time on the Brasília day `localDay` (YYYY-MM-DD). */
export function slotAt(localDay: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const utc = Date.parse(`${localDay}T00:00:00.000Z`) + ((h! * 60 + m!) - PUBLIC_WORLD.UTC_OFFSET_MIN) * 60_000;
  return new Date(utc).toISOString();
}

/** Slot instants of the Brasília days around `nowMs` (yesterday, today, tomorrow), ascending. */
function slotsAround(nowMs: number): string[] {
  const localToday = new Date(nowMs + PUBLIC_WORLD.UTC_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
  const out: string[] = [];
  for (const d of [-1, 0, 1]) {
    const day = new Date(Date.parse(`${localToday}T00:00:00.000Z`) + d * DAY_MS).toISOString().slice(0, 10);
    for (const s of PUBLIC_WORLD.SLOTS) out.push(slotAt(day, s));
  }
  return out;
}

/** The latest slot at or before `nowMs` when it is newer than `lastSlot`; else null (several missed = one step). */
export function dueSlot(nowMs: number, lastSlot: string | null): string | null {
  const passed = slotsAround(nowMs).filter((s) => Date.parse(s) <= nowMs);
  const latest = passed.at(-1) ?? null;
  if (!latest) return null;
  return lastSlot && lastSlot >= latest ? null : latest;
}

/** The first slot after `nowMs`. */
export function nextSlotAt(nowMs: number): string {
  return slotsAround(nowMs).find((s) => Date.parse(s) > nowMs)!;
}

/**
 * Where one step stops: the first seat game day after `currentDate` (the parked day is played); without seat games,
 * the first round day of the world's leagues after it; nothing ahead = one day. Dates ascending.
 */
export function publicStepTarget(currentDate: string, seatGameDays: readonly string[], worldRoundDays: readonly string[]): string {
  return seatGameDays.find((d) => d > currentDate)
    ?? worldRoundDays.find((d) => d > currentDate)
    ?? addDays(currentDate, 1);
}

export type InactivityAction = "none" | "warn" | "remove";

/** Real days since the manager last opened the world: warn once at `WARN_DAYS`, remove at `INACTIVE_DAYS`. */
export function inactivityAction(lastSeenAt: string | null, warnedAt: string | null, nowMs: number): InactivityAction {
  if (!lastSeenAt) return "none";
  const days = (nowMs - Date.parse(lastSeenAt)) / DAY_MS;
  if (days >= PUBLIC_WORLD.INACTIVE_DAYS) return "remove";
  if (days >= PUBLIC_WORLD.WARN_DAYS && !(warnedAt && warnedAt > lastSeenAt)) return "warn";
  return "none";
}

export function isPublicLeague(slug: string): boolean {
  return (PUBLIC_WORLD.LEAGUES as readonly string[]).includes(slug);
}

export function isPublicWorld(meta: { mode?: string; world?: { kind?: string } | null }): boolean {
  return meta.mode === "multi" && meta.world?.kind === "public";
}
```

- [ ] **Step 5: rodar e ver passar**

Run: `bun test src/Domain/multiplayer/publicWorld.test.ts`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/Domain/multiplayer/publicWorldConfig.ts src/Domain/multiplayer/publicWorld.ts src/Domain/multiplayer/publicWorld.test.ts
git commit -m "feat(public-world): slots, step target and inactivity rules"
```

---

### Task 2: Tipos

**Files:**
- Modify: `src/types/multiplayerTypes.ts`, `src/types/groupAdvanceTypes.ts`, `src/types/seatTypes.ts`

- [ ] **Step 1: `WorldState` e visões**

Em `src/types/multiplayerTypes.ts`, dentro de `WorldState` (depois de `advance?`):

```ts
  /** Absent = a world of friends. `public` = the server's world (part 5b): no owner, fixed slots. */
  kind?: "friends" | "public";
  /** Public world only: the game version it was created for and the real day it started. */
  edition?: { version: string; startedOn: string };
```

Acrescentar `"publicWorld"` ao union `WorldErrorCode`. Em `WorldView` acrescentar `kind: "friends" | "public"` e `nextSlotAt: string | null`. Novos tipos no fim do arquivo:

```ts
/** `GET /api/worlds/public`: the public world for the lobby screens. */
export interface PublicWorldInfo {
  saveId: string;
  members: number;
  max: number;
  /** ISO of the next step. */
  nextSlotAt: string;
  takenClubs: string[];
  edition: { version: string; startedOn: string };
  /** The caller already has a seat there. */
  joined: boolean;
  currentDate: string | null;
}

/** One finished or current edition of the public world (hall of fame). */
export interface PublicEditionView {
  version: string;
  startedAt: string;
  endedAt: string | null;
  standings: { rank: number; nickname: string | null; clubName: string; total: number; seasons: number }[];
}
```

- [ ] **Step 2: `WorldAdvance` e `GroupAdvanceView`**

Em `src/types/groupAdvanceTypes.ts`, dentro de `WorldAdvance`:

```ts
  /** Public world: ISO of the last slot the clock took. */
  lastSlot?: string | null;
  /** Public world: the date the current step runs to (exclusive); set by the clock, read by the executor. */
  slotTarget?: string | null;
```

Em `GroupAdvanceView` acrescentar `kind: "friends" | "public"` e `nextSlotAt: string | null`.

- [ ] **Step 3: `SeatState`**

Em `src/types/seatTypes.ts`, dentro de `SeatState`:

```ts
  /** Public world: ISO of the last time the manager opened the world (written at most hourly). */
  lastSeenAt?: string;
  /** Public world: ISO of the inactivity warning (5 days). */
  inactiveWarnedAt?: string;
```

- [ ] **Step 4: typecheck**

Run: `bunx tsc --noEmit -p .`
Expected: erros só onde `WorldView`/`GroupAdvanceView` são montados (`worldLifecycle.ts`, `groupAdvance.ts`) e em mocks de teste. Corrigir já: em `worldView` acrescentar `kind: meta.world.kind ?? "friends", nextSlotAt: null` (a Tarefa 9 preenche) e em `groupAdvanceView` acrescentar `kind: meta.world.kind ?? "friends", nextSlotAt: null`. Nos testes que constroem esses objetos à mão, acrescentar os dois campos. Rodar de novo até 0 erros.

- [ ] **Step 5: commit**

```bash
git add src/types/multiplayerTypes.ts src/types/groupAdvanceTypes.ts src/types/seatTypes.ts src/backend/worlds/worldLifecycle.ts src/backend/groupAdvance.ts
git commit -m "feat(public-world): types"
```

(Acrescentar ao `git add` os testes que precisaram dos campos novos.)

---

### Task 3: `createSave` sem clube humano

**Files:**
- Modify: `src/backend/SaveService.ts` (`createSave`)
- Modify: `src/backend/advanceDay.ts` (`presimulateWorld`)
- Test: `src/backend/publicWorld.create.test.ts`

- [ ] **Step 1: teste que falha**

```ts
// src/backend/publicWorld.create.test.ts
import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { presimulateWorld } from "@/backend/advanceDay";

let saveId = "";
afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

test("createSave worldOnly: the whole world, no seat, no human club", async () => {
  const meta = await saveService.createSave({ worldOnly: true, leagueSlug: "premier_league" });
  saveId = meta.id;
  const world = await saveService.getMeta(saveId);
  expect(world!.seats).toEqual([]);
  expect(world!.currentDate).toBe(world!.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.start);
  expect((await saveService.humanClubIds(saveId)).size).toBe(0);
  const managers = await saveService.getManagers(saveId);
  expect(managers.some((m) => m.seatId)).toBe(false);
  expect(await saveService.getLeagueMeta(saveId, "ucl")).not.toBeNull();
  const r = await presimulateWorld(saveId, null);
  expect(r.reason).not.toBe("already presimulated");
}, 120_000);
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/backend/publicWorld.create.test.ts`
Expected: FAIL (tipo: `worldOnly` não existe / `clubId` obrigatório).

- [ ] **Step 3: implementar**

Em `createSave`, trocar a assinatura por uma união:

```ts
  async createSave(body:
    | { worldOnly: true; leagueSlug: string }
    | {
      worldOnly?: false;
      leagueSlug: string; leagueName: string; clubId: string; clubName: string; clubColors: [string, string];
      formation?: string; tactical_style?: TacticalStyle; database?: SaveDatabase; manager?: SaveManager; sackingEnabled?: boolean;
    }): Promise<SeatMeta> {
    const human = body.worldOnly ? null : body;
```

Regras dentro da função (manter o resto igual):
- `seatId`/`seat`: só com `human`. `world.seats = human ? [seatId] : []`; `world.name = human ? human.clubName : "Public world"`; `world.database = human?.database`.
- `writeSeat` só com `human`. O retorno: com `human`, `metaForSeat(world, seatId, seat)` como hoje; sem, `metaForSeat(world, "", {} as SeatState)`? **Não**: devolver `{ ...world, seatId: "" } as SeatMeta` (o chamador do público só lê `id`).
- `isPlayerClub` = `!!human && league === body.leagueSlug && clubSlug === human.clubId`.
- Bloco da diretoria, contrato do técnico e `buildInitialManagers`: já checam `playerSquadId` (fica `null`).
- Pool da comissão: usar `body.leagueSlug` para o ano (como hoje).
- Remarcação: `if (human) await syncPlayerRestDays(...)`.
- `meta.tactical_style` usado em `initialFamiliarity`: só roda com `isPlayerClub`.

Em `presimulateWorld(saveId, ownerSeatId: string | null)`: o bloco "The owner's first board objective" só roda com `ownerSeatId`. O chamador existente (`worldRoutes` `start` e a rota `/presimulate`) continua passando o id.

- [ ] **Step 4: rodar e ver passar**

Run: `bun test src/backend/publicWorld.create.test.ts`
Expected: PASS. Depois `bunx tsc --noEmit -p .` com 0 erros.

- [ ] **Step 5: commit**

```bash
git add src/backend/SaveService.ts src/backend/advanceDay.ts src/backend/publicWorld.create.test.ts
git commit -m "feat(public-world): create a world with no human club"
```

---

### Task 4: o dia com zero assentos

**Files:**
- Modify: `src/backend/advanceDay.ts` (e o que o teste apontar)
- Test: `src/backend/publicWorld.days.test.ts`

- [ ] **Step 1: teste**

```ts
// src/backend/publicWorld.days.test.ts
import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { presimulateWorld, runBufferedDay } from "@/backend/advanceDay";

let saveId = "";
afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

test("a world with no seat advances days (league rounds included)", async () => {
  saveId = (await saveService.createSave({ worldOnly: true, leagueSlug: "premier_league" })).id;
  await saveService.updateMeta(saveId, { mode: "multi" });
  await presimulateWorld(saveId, null);
  const start = (await saveService.getMeta(saveId))!.currentDate!;
  for (let i = 0; i < 4; i++) {
    const out = await runBufferedDay(saveId, {});
    expect(out.ok).toBe(true);
  }
  const meta = (await saveService.getMeta(saveId))!;
  expect(meta.currentDate! > start).toBe(true);
  const played = (await saveService.getFixturesForDate(saveId, start)).filter((f) => f.played);
  expect(played.length).toBeGreaterThan(0);
}, 300_000);
```

- [ ] **Step 2: rodar**

Run: `bun test src/backend/publicWorld.days.test.ts`

Se passar, pular para o Step 4. Se falhar, ler o erro e o stack: o dia lê algo de "o assento" que não existe (ex. `meta.leagueSlug` da visão de assento, `loadDaySeats` vazio usado com `[0]!`). Corrigir **no ponto que falha**, tratando "nenhum assento" como "nenhum clube humano" (o caminho que a IA já usa). Não inventar assento falso.

- [ ] **Step 3: repetir até passar**

Cada correção com um comentário de uma linha onde a ausência de assento é tratada.

- [ ] **Step 4: commit**

```bash
git add src/backend/advanceDay.ts src/backend/publicWorld.days.test.ts
git commit -m "fix(public-world): the day runs with no seat"
```

(Acrescentar ao `git add` os outros arquivos corrigidos.)

---

### Task 5: hall da fama no SQLite

**Files:**
- Modify: `src/backend/db.ts` (`migrateWorldSchema`)
- Create: `src/backend/worlds/publicStore.ts`
- Test: `src/backend/worlds/publicStore.test.ts`

- [ ] **Step 1: tabela**

Dentro do `database.exec` de `migrateWorldSchema`, depois de `world_invites`:

```sql
    CREATE TABLE IF NOT EXISTS public_editions (
      version        TEXT PRIMARY KEY,
      save_id        TEXT NOT NULL,
      started_at     TEXT NOT NULL,
      ended_at       TEXT,
      standings_json TEXT NOT NULL DEFAULT '[]'
    );
```

- [ ] **Step 2: teste que falha**

```ts
// src/backend/worlds/publicStore.test.ts
import { beforeEach, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { closeOpenEditions, editionOf, listEditions, openEdition, saveEditionStandings } from "@/backend/worlds/publicStore";

beforeEach(() => db.prepare("DELETE FROM public_editions").run());

test("open, update, close and list editions (newest first)", () => {
  openEdition("4.35.0", "save-a", "2026-10-26T12:00:00.000Z");
  saveEditionStandings("4.35.0", [{ rank: 1, nickname: "emy", clubName: "Arsenal", total: 12, seasons: 0 }]);
  expect(editionOf("4.35.0")!.saveId).toBe("save-a");
  closeOpenEditions("2026-11-01T12:00:00.000Z", "4.36.0");
  openEdition("4.36.0", "save-b", "2026-11-01T12:00:00.000Z");
  const all = listEditions();
  expect(all.map((e) => e.version)).toEqual(["4.36.0", "4.35.0"]);
  expect(all[1]!.endedAt).toBe("2026-11-01T12:00:00.000Z");
  expect(all[1]!.standings[0]!.nickname).toBe("emy");
  expect(all[0]!.endedAt).toBeNull();
});
```

- [ ] **Step 3: rodar e ver falhar**

Run: `bun test src/backend/worlds/publicStore.test.ts` → FAIL (módulo).

- [ ] **Step 4: implementar**

```ts
// src/backend/worlds/publicStore.ts
import { db } from "@/backend/db";
import type { PublicEditionView } from "@/types/multiplayerTypes";

type Row = { version: string; saveId: string; startedAt: string; endedAt: string | null; standings: string };
const SELECT = "SELECT version, save_id AS saveId, started_at AS startedAt, ended_at AS endedAt, standings_json AS standings FROM public_editions";

export function openEdition(version: string, saveId: string, startedAt: string): void {
  db.prepare("INSERT OR REPLACE INTO public_editions (version, save_id, started_at, ended_at, standings_json) VALUES (?, ?, ?, NULL, '[]')")
    .run(version, saveId, startedAt);
}

export function editionOf(version: string): (PublicEditionView & { saveId: string }) | null {
  const r = db.prepare(`${SELECT} WHERE version = ?`).get(version) as Row | null;
  return r ? toView(r) : null;
}

/** Ends every open edition except `keepVersion`. */
export function closeOpenEditions(endedAt: string, keepVersion: string): void {
  db.prepare("UPDATE public_editions SET ended_at = ? WHERE ended_at IS NULL AND version <> ?").run(endedAt, keepVersion);
}

export function saveEditionStandings(version: string, standings: PublicEditionView["standings"]): void {
  db.prepare("UPDATE public_editions SET standings_json = ? WHERE version = ?").run(JSON.stringify(standings), version);
}

export function listEditions(): (PublicEditionView & { saveId: string })[] {
  return (db.prepare(`${SELECT} ORDER BY started_at DESC`).all() as Row[]).map(toView);
}

function toView(r: Row): PublicEditionView & { saveId: string } {
  return { version: r.version, saveId: r.saveId, startedAt: r.startedAt, endedAt: r.endedAt, standings: JSON.parse(r.standings) };
}
```

- [ ] **Step 5: rodar e ver passar**, depois commit

```bash
git add src/backend/db.ts src/backend/worlds/publicStore.ts src/backend/worlds/publicStore.test.ts
git commit -m "feat(public-world): hall of fame table"
```

---

### Task 6: criação na subida (`ensurePublicWorld`)

**Files:**
- Create: `src/backend/worlds/publicWorld.ts`
- Modify: `src/backend/seats.ts` (`removeSeat` aceita o último num público)
- Test: `src/backend/worlds/publicWorld.test.ts`

- [ ] **Step 1: teste que falha**

```ts
// src/backend/worlds/publicWorld.test.ts
import { afterAll, beforeEach, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { saveService } from "@/backend/SaveService";
import { ensurePublicWorld, publicWorldId } from "@/backend/worlds/publicWorld";
import { listEditions } from "@/backend/worlds/publicStore";

const made: string[] = [];
beforeEach(() => db.prepare("DELETE FROM public_editions").run());
afterAll(async () => { for (const id of made) await saveService.deleteSave(id).catch(() => {}); });

test("creates one public world per version, running, with no seat", async () => {
  const a = await ensurePublicWorld({ version: "9.0.0", now: () => Date.parse("2026-10-26T12:00:00.000Z") });
  made.push(a);
  const meta = (await saveService.getMeta(a))!;
  expect(meta.mode).toBe("multi");
  expect(meta.world!.kind).toBe("public");
  expect(meta.world!.phase).toBe("running");
  expect(meta.world!.edition).toEqual({ version: "9.0.0", startedOn: "2026-10-26T12:00:00.000Z" });
  expect(meta.presimulated).toBe(true);
  expect(await ensurePublicWorld({ version: "9.0.0" })).toBe(a);
  expect(publicWorldId()).toBe(a);
}, 300_000);

test("a new version closes the previous edition and deletes its save", async () => {
  const a = await ensurePublicWorld({ version: "9.0.0" });
  const b = await ensurePublicWorld({ version: "9.1.0" });
  made.push(b);
  expect(b).not.toBe(a);
  expect(await saveService.getMeta(a)).toBeNull();
  const eds = listEditions();
  expect(eds.find((e) => e.version === "9.0.0")!.endedAt).not.toBeNull();
  expect(eds.find((e) => e.version === "9.1.0")!.endedAt).toBeNull();
}, 600_000);
```

- [ ] **Step 2: rodar e ver falhar** (`bun test src/backend/worlds/publicWorld.test.ts`).

- [ ] **Step 3: implementar a criação**

```ts
// src/backend/worlds/publicWorld.ts
import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import { presimulateWorld } from "@/backend/advanceDay";
import { withSaveLock } from "@/backend/saveLock";
import { deleteWorld } from "@/backend/worlds/worldLifecycle";
import { newWorldCode, setWorldCode } from "@/backend/worlds/worldStore";
import { closeOpenEditions, editionOf, listEditions, openEdition } from "@/backend/worlds/publicStore";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";
import { GAME_VERSION } from "@/Domain/saveVersion";
import { logError } from "@/Logger";
import type { WorldState } from "@/types/multiplayerTypes";

export interface PublicDeps { version?: string; now?: () => number; service?: SaveService }

/** The current public world's save id (the open edition of this version), or null. */
export function publicWorldId(version: string = GAME_VERSION): string | null {
  return editionOf(version)?.saveId ?? null;
}

/**
 * Server start: the public world of this version, created if missing (`.claude/rules/game/multiplayer.md`, part 5b).
 * Older editions are closed in the hall of fame and their saves deleted.
 */
export async function ensurePublicWorld(deps: PublicDeps = {}): Promise<string> {
  const version = deps.version ?? GAME_VERSION;
  const service = deps.service ?? defaultService;
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  const existing = editionOf(version);
  if (existing && (await service.getMeta(existing.saveId))) return existing.saveId;

  for (const old of listEditions()) {
    if (old.version === version) continue;
    if (await service.getMeta(old.saveId)) {
      await deleteWorld(old.saveId, "server", service).catch((e) => logError("world", `public world ${old.saveId}: delete failed`, e));
    }
  }
  closeOpenEditions(nowIso, version);

  const meta = await service.createSave({ worldOnly: true, leagueSlug: PUBLIC_WORLD.START_LEAGUE });
  const saveId = meta.id;
  // The code only lets the deadline clock find the world (`listWorldCodeIds`); the join routes refuse it.
  const code = newWorldCode();
  setWorldCode(saveId, code);
  const world: WorldState = {
    phase: "running", inviteCode: code, deadlineHours: null, createdBy: "server",
    kind: "public", edition: { version, startedOn: nowIso },
  };
  await service.updateMeta(saveId, { mode: "multi", world });
  await withSaveLock(saveId, () => presimulateWorld(saveId, null));
  await service.updateMeta(saveId, { presimulated: true });
  openEdition(version, saveId, nowIso);
  return saveId;
}
```

Notas: se `presimulateWorld` já grava `presimulated`, remover a linha redundante. Se `deleteWorld` exigir um usuário real, passar `"server"` funciona (só filtra quem não recebe o aviso).

- [ ] **Step 4: `removeSeat` aceita o último no público**

Em `src/backend/seats.ts`, na checagem `ownerOrLast`:

```ts
    const lastSeatKeepsWorld = isPublicWorld(world);
    if (member?.role === "owner" || (world.seats.length <= 1 && !lastSeatKeepsWorld)) throw new SeatError("ownerOrLast", `removeSeat: seat ${seatId} is the owner or the last seat`);
```

(import `isPublicWorld` de `@/Domain/multiplayer/publicWorld`). No público ninguém é `owner` (a Tarefa 8 entra todos como `member`).

- [ ] **Step 5: rodar e ver passar**, depois commit

```bash
git add src/backend/worlds/publicWorld.ts src/backend/worlds/publicWorld.test.ts src/backend/seats.ts
git commit -m "feat(public-world): create the public world at server start"
```

---

### Task 7: o relógio dos horários e o alvo do executor

**Files:**
- Modify: `src/backend/worlds/publicWorld.ts` (`publicSlotTick`, `updateHall`)
- Modify: `src/backend/groupAdvance.ts` (`stepWorld`, `worldClockTick`, `startWorldClock`, fim de `advanceGroup`)
- Test: `src/backend/publicWorld.clock.test.ts`

- [ ] **Step 1: alvo no `stepWorld`**

Em `stepWorld`, logo depois de `let seats = …` e antes do cálculo de `plan`:

```ts
  if (world.kind === "public") {
    // Public world (part 5b): the clock set the target; nothing holds the world (no "ready", no deadline).
    const target = world.advance?.slotTarget ?? currentDate;
    if (target <= currentDate) {
      await updateAdvance(service, saveId, { running: false, waitingSince: null, target, slotTarget: null, ...noError(world.advance) });
      return { kind: "stopped", date: currentDate, target, waitingFor: [] };
    }
    plan = { target, waitingFor: [] } as GroupPlan;
  }
```

Para isso `plan` precisa ser `let` (já é) e o bloco do prazo (`deadlinePassed`) e o `if (plan.target <= currentDate)` seguintes ficam como estão (no público `plan.target > currentDate`, então não entram). Em `updateAdvance`, `ADVANCE_KEYS` ganha `"lastSlot"` e `"slotTarget"`.

O tipo `GroupPlan` (em `src/Domain/groupAdvance/groupAdvance.ts`) tem os campos `target` e `waitingFor`: conferir e montar o objeto com todos os campos obrigatórios em vez do `as`.

Os jogos de assento sem decisão rodam simulados: `liveRecordingsFor` só pega gravações `live`; sem gravação o dia simula. Os `readyUntil` antigos não são lidos.

- [ ] **Step 2: teste do relógio (falha)**

```ts
// src/backend/publicWorld.clock.test.ts
import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { defaultGroupDeps, waitWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { ensurePublicWorld, publicSlotTick } from "@/backend/worlds/publicWorld";

let saveId = "";
afterAll(async () => { if (saveId) await saveService.deleteSave(saveId).catch(() => {}); });

test("a due slot runs the world to the next round day, once", async () => {
  saveId = await ensurePublicWorld({ version: "9.9.0" });
  const start = (await saveService.getMeta(saveId))!.currentDate!;
  let now = Date.parse("2026-10-26T16:30:00.000Z");
  const deps: GroupAdvanceDeps = { ...defaultGroupDeps, now: () => now };
  expect(await publicSlotTick(saveId, deps)).toBe(true);
  await waitWorld(saveId);
  const after = (await saveService.getMeta(saveId))!;
  expect(after.currentDate! > start).toBe(true);
  expect(after.world!.advance!.lastSlot).toBe("2026-10-26T16:00:00.000Z");
  expect(await publicSlotTick(saveId, deps)).toBe(false);
  now = Date.parse("2026-10-26T21:05:00.000Z");
  expect(await publicSlotTick(saveId, deps)).toBe(true);
  await waitWorld(saveId);
}, 600_000);
```

- [ ] **Step 3: implementar `publicSlotTick`**

Em `src/backend/worlds/publicWorld.ts`:

```ts
import { kickWorld, type GroupAdvanceDeps, defaultGroupDeps, isWorldAdvancing } from "@/backend/groupAdvance";
import { dueSlot, publicStepTarget } from "@/Domain/multiplayer/publicWorld";
import { addDays } from "@/Domain/dates";

/** Days with an unplayed round of any public league after `from`, up to `until`. */
async function worldRoundDays(service: SaveService, saveId: string, from: string, until: string): Promise<string[]> {
  const out = new Set<string>();
  for (const slug of PUBLIC_WORLD.LEAGUES) {
    const idx = await service.getDateIndex(saveId, slug).catch(() => null);
    for (const d of Object.keys(idx ?? {})) if (d > from && d <= until) out.add(d);
  }
  return [...out].sort();
}

/**
 * One clock tick for the public world: a due slot sets the step's target (the next seat game day, else the next
 * round day of the 10 leagues) and kicks the executor. Returns whether a step started.
 */
export async function publicSlotTick(saveId: string, deps: GroupAdvanceDeps = defaultGroupDeps): Promise<boolean> {
  if (isWorldAdvancing(saveId)) return false;
  const started = await withSaveLock(saveId, async () => {
    const meta = await deps.service.getMeta(saveId);
    if (!meta?.currentDate || meta.world?.kind !== "public" || meta.world.phase !== "running") return false;
    const slot = dueSlot(deps.now(), meta.world.advance?.lastSlot ?? null);
    if (!slot) return false;
    const horizon = addDays(meta.currentDate, 60);
    const seatDays = new Set<string>();
    for (const { seatId, seat } of await deps.service.listSeats(saveId)) {
      if (!seat.clubId || seat.unemployed) continue;
      for (const d of await deps.matchDates(deps.service, saveId, seatId, meta.currentDate, horizon)) seatDays.add(d);
    }
    const target = publicStepTarget(
      meta.currentDate, [...seatDays].sort(), await worldRoundDays(deps.service, saveId, meta.currentDate, horizon),
    );
    const prev = meta.world.advance ?? { running: false, waitingSince: null, target: null };
    await deps.service.updateMeta(saveId, { world: { ...meta.world, advance: { ...prev, lastSlot: slot, slotTarget: target } } });
    return true;
  });
  if (started) void kickWorld(saveId, deps).catch((e) => logError("world", `public world ${saveId}: step crashed`, e));
  return started;
}
```

Conferir o nome real do leitor de `date-index` no `SaveService` (`grep -n "DateIndex" src/backend/SaveService.ts`) e trocar `getDateIndex` se for outro. As chaves do `date-index` são datas `YYYY-MM-DD`.

- [ ] **Step 4: ligar ao relógio**

Em `src/backend/groupAdvance.ts`:
- `worldClockTick`: no laço, depois de `if (!isRunningWorld(meta)) continue;`, acrescentar:

```ts
    if (meta.world!.kind === "public") {
      // Fixed slots (part 5b): retries after a failure wait for the next slot.
      if (await publicSlotTick(saveId, deps)) kicked.push(saveId);
      continue;
    }
```

- `startWorldClock`: antes de `resumeWorlds`, `void ensurePublicWorld().then((id) => rememberWorld(id)).catch((e) => logError("world", "public world failed", e));`.
- Import circular: `publicWorld.ts` importa de `groupAdvance.ts` e vice-versa. Para evitar, `groupAdvance.ts` importa `publicSlotTick`/`ensurePublicWorld` com `await import("@/backend/worlds/publicWorld")` dentro das duas funções.
- `resumeWorlds` não deve dar kick no público fora de horário: no `if (kick)`, pular quando `meta.world.kind === "public"` (o `stepWorld` pararia de qualquer forma, mas evita uma escrita). Fazer o `withSaveLock` devolver `isRunningWorld(meta) && meta!.world!.kind !== "public"`.

- [ ] **Step 5: rodar e ver passar**

Run: `bun test src/backend/publicWorld.clock.test.ts`, depois `bun test src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/groupAdvance.live.test.ts` (nada mudou para os mundos de amigos).

- [ ] **Step 6: commit**

```bash
git add src/backend/worlds/publicWorld.ts src/backend/groupAdvance.ts src/backend/publicWorld.clock.test.ts
git commit -m "feat(public-world): fixed slots drive the group executor"
```

---

### Task 8: rotas (lista, entrar, hall, dono 409)

**Files:**
- Modify: `src/backend/worlds/worldRoutes.ts`
- Test: `src/backend/worlds/publicRoutes.test.ts`

- [ ] **Step 1: teste que falha**

Seguir o molde de `src/backend/worlds/worldRoutes.test.ts` (login de teste, `call()` com cookie). Casos:

```ts
// src/backend/worlds/publicRoutes.test.ts — casos (montar os helpers como em worldRoutes.test.ts)
// 1. GET /api/worlds/public → 200 { saveId, members: 0, max: 40, joined: false, takenClubs: [] }
// 2. POST /api/worlds/public/join sem apelido → 409 noNickname
// 3. join com clubId de of_championship → 400 invalidClub
// 4. join com clube da premier_league → 201 { saveId, seatId }; GET de novo → joined: true, members: 1
// 5. segundo usuário no mesmo clube → 409 clubTaken; o mesmo usuário de novo → 409 alreadyMember
// 6. POST /api/worlds/:saveId/invite-code, /settings, /start, /owner, /members/:id/remove → 409 publicWorld
// 7. GET /api/worlds/by-code/<código interno do público> → 404 notFound
// 8. POST /api/worlds/:saveId/leave → 200; o save continua (getMeta não é null); members volta a 0
// 9. GET /api/worlds/public/hall → 200 { editions: [{ version, standings: [] , endedAt: null }] }
```

Escrever cada caso como um `test(...)` com `expect` no status e no corpo. O save público do teste vem de `ensurePublicWorld({ version: "9.8.0" })` e é apagado no `afterAll`.

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar**

No topo de `worldRoutes.ts`, um helper:

```ts
/** Owner actions do not exist in the public world (part 5b). */
async function refusePublic(saveId: string): Promise<Response | null> {
  const meta = await saveService.getMeta(saveId);
  return meta && isPublicWorld(meta) ? fail("publicWorld", 409) : null;
}
```

Chamar `const pub = await refusePublic(saveId); if (pub) return pub;` no começo das rotas `invite-code`, `settings`, `invites` (POST), `start`, `members/:seatId/remove` e `owner`, logo depois de `requireSeat`.

Em `by-code` e `join`: depois de achar `meta`, `if (isPublicWorld(meta)) return fail("notFound", 404);`.

Em `leave`: no público, sempre `removeSeat` (nunca `deleteWorld` nem `transferFirst`).

Rotas novas no objeto `worldRoutes`:

```ts
  "/api/worlds/public": {
    GET: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const saveId = publicWorldId();
      const meta = saveId ? await saveService.getMeta(saveId) : null;
      if (!saveId || !meta?.world?.edition) return fail("notFound", 404);
      const info: PublicWorldInfo = {
        saveId, members: meta.seats.length, max: PUBLIC_WORLD.MAX_MEMBERS,
        nextSlotAt: nextSlotAt(Date.now()), takenClubs: [...(await saveService.humanClubIds(saveId))],
        edition: meta.world.edition, joined: !!memberOf(saveId, auth.userId), currentDate: meta.currentDate ?? null,
      };
      return Response.json(info);
    },
  },

  "/api/worlds/public/join": {
    POST: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      if (!getSocialUser(auth.userId)?.nickname) return fail("noNickname", 409);
      const body = await readBody(req);
      if (body instanceof Response) return body;
      const saveId = publicWorldId();
      if (!saveId) return fail("notFound", 404);
      const manager = parseSeatManager(body.manager);
      if (!manager) return fail("invalidManager", 400);
      if (typeof body.clubId !== "string" || !body.clubId || body.clubId.length > MAX_CLUB_ID) return fail("invalidClub", 400);
      if (body.sackingEnabled !== undefined && typeof body.sackingEnabled !== "boolean") return fail("invalidBody", 400);
      const entry = (await saveService.getSquadIndex(saveId)).byId(body.clubId);
      if (!entry || !isPublicLeague(entry.leagueSlug)) return fail("invalidClub", 400);
      try {
        const { seatId } = await addSeat(saveId, {
          userId: auth.userId, clubId: body.clubId, manager, role: "member",
          sackingEnabled: body.sackingEnabled !== false, maxSeats: PUBLIC_WORLD.MAX_MEMBERS,
          onLocked: async ({ seatId: id, seat }) => {
            await saveService.updateSeat(saveId, id, { lastSeenAt: new Date().toISOString() });
            await announceMemberChange(saveId, {
              seatId: id, event: "joined", managerName: manager.name,
              clubId: seat.clubId, clubName: seat.clubName, leagueSlug: seat.leagueSlug,
            });
          },
        });
        return Response.json({ saveId, seatId, phase: "running" }, { status: 201 });
      } catch (e) {
        if (!(e instanceof SeatError)) throw e;
        if (e.code === "alreadyMember") return fail("alreadyMember", 409, { saveId });
        if (e.code === "full") return fail("full", 409);
        if (e.code === "clubTaken") return fail("clubTaken", 409);
        if (e.code === "clubNotFound") return fail("invalidClub", 400);
        return fail("notFound", 404);
      }
    },
  },

  "/api/worlds/public/hall": {
    GET: (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return Response.json({ editions: listEditions().map(({ saveId: _s, ...e }) => e) });
    },
  },
```

Se `addSeat` com `role` diferente de `owner` não for o padrão, conferir a assinatura (`role?: MemberRole`). Conferir também que o `addSeat` não exige `phase: "lobby"`. Registrar estas rotas **antes** de `/api/worlds/:saveId` no objeto (o roteador do Bun prefere rotas estáticas, mas manter a ordem evita dúvida). Conferir que `src/index.ts` espalha `worldRoutes` (já espalha).

- [ ] **Step 4: rodar e ver passar**, e `bun test src/backend/worlds` inteiro.

- [ ] **Step 5: commit**

```bash
git add src/backend/worlds/worldRoutes.ts src/backend/worlds/publicRoutes.test.ts
git commit -m "feat(public-world): list, join and hall routes; no owner actions"
```

---

### Task 9: visões (`worldView`, `groupAdvanceView`) e hall atualizado

**Files:**
- Modify: `src/backend/worlds/worldLifecycle.ts`, `src/backend/groupAdvance.ts`, `src/backend/worlds/publicWorld.ts`
- Test: acrescentar em `src/backend/worlds/publicRoutes.test.ts`

- [ ] **Step 1: testes**

Acrescentar: `GET /api/worlds/:saveId` (membro do público) → `kind: "public"`, `nextSlotAt` ISO, `max: 40`; `GET /api/worlds/:saveId/advance` → `kind: "public"`, `nextSlotAt` ISO, `deadlineAt: null`. Depois de um `publicSlotTick` com `waitWorld`, `listEditions()[0].standings` tem o técnico do teste (`nickname` dele).

- [ ] **Step 2: implementar**

- `worldView`: `kind: meta.world.kind ?? "friends"`, `max: meta.world.kind === "public" ? PUBLIC_WORLD.MAX_MEMBERS : WORLD.MAX_MEMBERS`, `nextSlotAt: meta.world.kind === "public" ? nextSlotAt(Date.now()) : null`, `owner: meta.world.kind === "public" ? "" : await worldOwnerName(...)`, `inviteCode: meta.world.kind === "public" ? "" : meta.world.inviteCode`.
- `groupAdvanceView`: `kind` e `nextSlotAt` como acima; no público, `waitingFor` = os técnicos com jogo hoje sem decisão (`seats.filter(s => s.input.matchDates.includes(currentDate) && s.input.decisionDate !== currentDate)`), `deadlineAt: null`, `target: advance?.slotTarget ?? currentDate`.
- `updateHall(saveId)` em `publicWorld.ts`:

```ts
/** The open edition's top of the standings (hall of fame), after each step. */
export async function updateHall(saveId: string, service: SaveService = defaultService): Promise<void> {
  const meta = await service.getMeta(saveId);
  const version = meta?.world?.edition?.version;
  if (!version) return;
  const { entries } = await standingsView(service, saveId);
  saveEditionStandings(version, entries.slice(0, PUBLIC_WORLD.HALL_TOP).map((e, i) => ({
    rank: i + 1, nickname: e.nickname, clubName: e.clubName, total: e.total, seasons: e.seasons,
  })));
}
```

  Conferir os nomes dos campos de `StandingsEntry` (`total`, `seasons`) em `src/types/standingsTypes.ts`. Usar o `rank` da entrada se ela tiver um (empate compartilhado, `rankOf`).
- Em `advanceGroup` (`finish`), quando `result.days > 0`: `const m = await deps.service.getMeta(saveId); if (m?.world?.kind === "public") await (await import("@/backend/worlds/publicWorld")).updateHall(saveId, deps.service).catch((e) => logError("world", "hall update failed", e));`.
- `standingsOn` (`src/backend/standingsWorld.ts`): conferir que vale para o público (é `mode: "multi"` com `world`). Se exigir 2+ assentos, manter (a classificação aparece com 2+).

- [ ] **Step 3: rodar e ver passar**; commit

```bash
git add src/backend/worlds/worldLifecycle.ts src/backend/groupAdvance.ts src/backend/worlds/publicWorld.ts src/backend/worlds/publicRoutes.test.ts
git commit -m "feat(public-world): views and hall of fame updates"
```

---

### Task 10: última vez visto e inatividade

**Files:**
- Modify: `src/backend/worlds/publicWorld.ts` (`markSeen`, `flushSeen`, `inactivityPass`)
- Modify: `src/backend/auth/middleware.ts` (`requireSeat`)
- Modify: `src/types/inboxTypes.ts`, `src/Domain/inbox/worldAdvanceMessage.ts`
- Modify: `src/backend/groupAdvance.ts` (`publicSlotTick` chamada do relógio roda `flushSeen` + `inactivityPass` antes)
- Test: `src/backend/publicWorld.inactivity.test.ts`

- [ ] **Step 1: mensagem**

Em `src/types/inboxTypes.ts`, novo tipo e entrada no union `world`:

```ts
/** Public world (part 5b): 5 days without opening the world; 2 more and the club goes back to the AI. */
export interface WorldInactiveInboxMessage extends InboxMessageBase {
  category: "world";
  kind:     "inactive_warning";
  /** Real ISO day the seat will be removed. */
  removeOn: string;
}
```

Em `src/Domain/inbox/worldAdvanceMessage.ts`, `buildInactiveWarningMessage({ date, removeOn })` no molde de `buildAutoAdvancedMessage` (mesmo `id`/`subject` em inglês de fallback: "You have not opened the public world for 5 days"). Na tela da caixa de entrada (`InboxScreen.tsx`, onde `auto_advanced` é traduzido) acrescentar o caso com `inbox.world.inactiveWarning` (en: "You have not opened the public world for 5 days. In 2 more days your club goes back to the AI." / pt-BR: "Você não abre o mundo público há 5 dias. Em mais 2 dias o seu clube volta para a IA.").

- [ ] **Step 2: teste que falha**

```ts
// src/backend/publicWorld.inactivity.test.ts — com um público de teste e dois assentos (addSeat direto, role member)
// 1. markSeen(saveId, seatA, t0) e flushSeen(saveId, t0) → seat.lastSeenAt === ISO(t0)
// 2. markSeen de novo 10 min depois + flushSeen → lastSeenAt não muda (SEEN_WRITE_MIN 60)
// 3. lastSeenAt de seatB há 5,5 dias → inactivityPass(saveId, now) → inbox de seatB tem inactive_warning; seatB.inactiveWarnedAt definido
// 4. inactivityPass de novo → nenhuma mensagem nova
// 5. lastSeenAt de seatB há 7,5 dias → inactivityPass → seatB fora de meta.seats; o clube dele fora de humanClubIds; seatA continua
```

- [ ] **Step 3: implementar**

```ts
// em src/backend/worlds/publicWorld.ts
const seen = new Map<string, number>(); // `${saveId}:${seatId}` → last request (ms)

/** Called by `requireSeat`: memory only (cheap); `flushSeen` writes it at most hourly. */
export function markSeen(saveId: string, seatId: string, nowMs: number = Date.now()): void {
  seen.set(`${saveId}:${seatId}`, nowMs);
}

/** Writes "last seen" of the public world's seats when it moved by an hour or more. Under the save lock. */
export async function flushSeen(saveId: string, nowMs: number, service: SaveService = defaultService): Promise<void> {
  await withSaveLock(saveId, async () => {
    for (const { seatId, seat } of await service.listSeats(saveId)) {
      const t = seen.get(`${saveId}:${seatId}`);
      if (!t) continue;
      const prev = seat.lastSeenAt ? Date.parse(seat.lastSeenAt) : 0;
      if (t - prev < PUBLIC_WORLD.SEEN_WRITE_MIN * 60_000) continue;
      await service.updateSeat(saveId, seatId, { lastSeenAt: new Date(t).toISOString() });
    }
  });
}

/** Warns at 5 days, removes at 7 (`removeSeat`, the club back to the AI). */
export async function inactivityPass(saveId: string, nowMs: number, service: SaveService = defaultService): Promise<void> {
  const date = (await service.getMeta(saveId))?.currentDate;
  if (!date) return;
  for (const { seatId, seat } of await service.listSeats(saveId)) {
    const action = inactivityAction(seat.lastSeenAt ?? null, seat.inactiveWarnedAt ?? null, nowMs);
    if (action === "warn") {
      const removeOn = new Date(Date.parse(seat.lastSeenAt!) + PUBLIC_WORLD.INACTIVE_DAYS * 86_400_000).toISOString().slice(0, 10);
      await withSaveLock(saveId, async () => {
        await service.appendInbox(saveId, buildInactiveWarningMessage({ date, removeOn }), seatId);
        await service.updateSeat(saveId, seatId, { inactiveWarnedAt: new Date(nowMs).toISOString() });
      });
    } else if (action === "remove") {
      await removeSeat(saveId, seatId, {
        onLocked: async (removed) => {
          if (removed.userId) notifyUser(removed.userId, { type: "world_removed", saveId });
          await announceMemberChange(saveId, {
            seatId, event: "removed", managerName: removed.managerName,
            clubId: removed.clubId, clubName: removed.clubName, leagueSlug: removed.leagueSlug,
          });
        },
      }).catch((e) => logError("world", `public world ${saveId}: inactive seat ${seatId} not removed`, e));
    }
  }
}
```

(Conferir em `worldRoutes.ts` o formato exato de `announceMemberChange` para uma remoção e copiar; `removeSeat` já pega o lock — não chamar dentro de outro `withSaveLock`.)

`requireSeat` (`src/backend/auth/middleware.ts`): depois de achar `member`, `markSeen(saveId, member.seatId)` com import dinâmico evitado — importar `markSeen` direto de `@/backend/worlds/publicWorld` só se não criar ciclo (`publicWorld.ts` importa `SaveService`, não `middleware`). Se criar, mover `markSeen`/`seen` para um arquivo pequeno `src/backend/worlds/publicSeen.ts` sem imports e importar dele nos dois lados. A chamada é barata para mundos de amigos (só um `Map.set`).

No relógio (`worldClockTick`, ramo público da Tarefa 7): antes de `publicSlotTick`, `await flushSeen(saveId, deps.now(), deps.service); await inactivityPass(saveId, deps.now(), deps.service);` (a cada minuto: `flushSeen` só escreve quando passa de uma hora; `inactivityPass` só age em quem venceu o prazo).

- [ ] **Step 4: rodar e ver passar**; commit

```bash
git add src/backend/worlds/publicWorld.ts src/backend/auth/middleware.ts src/types/inboxTypes.ts src/Domain/inbox/worldAdvanceMessage.ts src/GameInterface/InboxScreen.tsx src/backend/groupAdvance.ts src/backend/publicWorld.inactivity.test.ts src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(public-world): last seen and inactivity removal"
```

---

### Task 11: sala do mundo público sem texto livre

**Files:**
- Modify: `src/backend/social/socialRoutes.ts`, `src/types/socialTypes.ts`
- Test: acrescentar em `src/backend/social/socialRoutes.test.ts` (ou no arquivo de rotas de sala existente)

- [ ] **Step 1: teste**

Membro do público com apelido: `POST /api/social/rooms/world:<saveId>/messages { body: "oi" }` → 403 `{ error: "publicRoom" }`. Num mundo de amigos o mesmo POST continua 200 (caso já coberto).

- [ ] **Step 2: implementar**

`SocialErrorCode` (`src/types/socialTypes.ts`) ganha `"publicRoom"`. No POST de mensagens, depois de `canWrite`:

```ts
      if (room.startsWith("world:") && isPublicWorld((await saveService.getMeta(room.slice(6))) ?? {})) {
        return fail("publicRoom", 403);
      }
```

(conferir o formato da sala interna devolvida por `resolveRoom`: `world:<saveId>`). A resenha (`POST /api/worlds/:saveId/taunts`) não passa por aqui e continua.

- [ ] **Step 3: rodar, commit**

```bash
git add src/backend/social/socialRoutes.ts src/types/socialTypes.ts src/backend/social/socialRoutes.test.ts
git commit -m "feat(public-world): no free text in the public world room"
```

---

### Task 12: telas

**Files:**
- Modify: `src/GameInterface/World/worldApi.ts`, `src/GameInterface/NewGameWizard.tsx`, `src/GameInterface/StartScreen.tsx`, `src/GameInterface/World/WorldScreen.tsx`, `src/GameInterface/World/GroupAdvanceBand.tsx`, `src/GameInterface/World/ReadyControl.tsx`, `src/GameInterface/Social/ChatWindow.tsx`
- Modify: `src/i18n/locales/en.json`, `pt-BR.json`; Test: `src/i18n/publicWorld.keys.test.ts`

- [ ] **Step 1: API**

Em `worldApi.ts`: `publicInfo(): Promise<Result<PublicWorldInfo>>` (`GET /api/worlds/public`), `joinPublic(body: { clubId; manager; sackingEnabled })` (`POST /api/worlds/public/join`), `publicHall(): Promise<Result<{ editions: PublicEditionView[] }>>`, no mesmo molde de `join`.

- [ ] **Step 2: novo jogo**

- `playMode` passa a `"solo" | "multi" | "public"`. Terceiro `ChoiceCard` ("Mundo público", descrição `newGame.mode.publicDetail` com `max: 40` e os horários). A grade vira `sm:grid-cols-3`.
- Escolher "Mundo público": ao avançar do passo `mode`, ler `worldApi.publicInfo()`; com `joined: true`, ir direto para o mundo (`loadGameSave(saveId)` e `/dashboard`); senão montar um `JoinContext` interno com `kind: "public"`, `takenClubs` e `allowedLeagues: PUBLIC_WORLD.LEAGUES`.
- `JoinContext` ganha `kind?: "friends" | "public"` e `allowedLeagues?: readonly string[]`; o passo do clube filtra `leagues` por `allowedLeagues` quando presente (e os países pelas ligas que sobram).
- `handleStartCareer`: com `join?.kind === "public"`, chamar `worldApi.joinPublic(...)` no lugar de `worldApi.join(...)`; erros pelos mesmos `world.errors.*` (acrescentar `noNickname` se faltar texto, e `publicWorld`).

- [ ] **Step 3: tela inicial**

Em `StartScreen.tsx`, um bloco acima da lista de saves: `Mundo público · N/40` e "Próximo passo às HH:MM" (`Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"`, `hour: "2-digit", minute: "2-digit"`), botão "Entrar" (vai ao novo jogo no modo público: `/new-game?mode=public`, e o wizard lê o parâmetro para abrir já com `playMode = "public"`) ou "Continuar" quando `joined`. Um save público na lista mostra "Mundo público" no lugar de "Com amigos · N/8".

- [ ] **Step 4: tela do mundo**

`WorldScreen.tsx` com `view.kind === "public"`: título `screenTitles.publicWorld` ("MUNDO **PÚBLICO**" / "PUBLIC **WORLD**"); sem bloco de convite, sem prazo, sem "Começar", sem botões de dono; membros só leitura; linha "Próximo passo às HH:MM"; aba nova "Hall da fama" (`SegmentedTabs`, tabela com `TABLE_STYLE`: versão, período, top 10 com #, apelido, clube, pontos). `?tab=hall` abre direto.

`GroupAdvanceBand` e `ReadyControl` com `kind === "public"`: sem "Pronto até"; num dia de jogo, Jogar / Simular como hoje; fora dele, "Próximo passo às HH:MM". A barra superior mantém a faixa de 184px.

`ChatWindow.tsx`: na sala `world:<saveId>` de um mundo público (o painel de amigos já sabe o mundo: passar `publicRoom` pela lista `worlds` de `GET /api/social/friends` — acrescentar `kind` em `WorldRoomView` no `socialRoutes.ts`), esconder o campo de texto e mostrar uma linha "Só resenha neste mundo".

- [ ] **Step 5: i18n e teste de chaves**

Chaves novas em en e pt-BR (`newGame.mode.public`, `newGame.mode.publicDetail`, `startScreen.publicWorld`, `startScreen.publicNext`, `world.public.*`, `world.hall.*`, `world.errors.publicWorld`, `social.publicRoom`, `screenTitles.publicWorld.{main,accent}`, `inbox.world.inactiveWarning`). Teste:

```ts
// src/i18n/publicWorld.keys.test.ts
import { expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const KEYS = [
  "newGame.mode.public", "newGame.mode.publicDetail", "startScreen.publicWorld", "startScreen.publicNext",
  "world.public.nextStep", "world.hall.tab", "world.hall.empty", "world.errors.publicWorld", "social.publicRoom",
  "screenTitles.publicWorld.main", "screenTitles.publicWorld.accent", "inbox.world.inactiveWarning",
];
const get = (o: Record<string, unknown>, k: string) => k.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], o);

test.each(KEYS)("%s exists in en and pt-BR", (k) => {
  expect(typeof get(en, k)).toBe("string");
  expect(typeof get(pt, k)).toBe("string");
});
```

Textos curtos, sem cara de IA. Mostrar ao usuário a lista de textos novos antes de publicar.

- [ ] **Step 6: verificar**

`bunx tsc --noEmit -p .`, `bun test src/GameInterface src/i18n`, `bun run ui:audit` (0 duras, 0 leves nos arquivos tocados).

- [ ] **Step 7: commit**

```bash
git add src/GameInterface src/i18n src/backend/social/socialRoutes.ts src/types/socialTypes.ts
git commit -m "feat(public-world): screens"
```

---

### Task 13: medição

- [ ] **Step 1:** um script de medição (`scripts/public-world-measure.ts`): cria um público de teste, entra 10 assentos (um clube por liga das 10, `addSeat` direto), roda 6 passos (`publicSlotTick` com `now` avançando de horário em horário + `waitWorld`), imprime o tempo de cada passo, os dias rodados e `process.memoryUsage().rss`, e apaga o save no fim.
- [ ] **Step 2:** rodar `bun scripts/public-world-measure.ts` sozinho (sem outra suíte rodando) e anotar a tabela no `multiplayer.md`.
- [ ] **Step 3:** commit do script.

---

### Task 14: documentação, changelog, versão

- [ ] `.claude/rules/game/multiplayer.md`: seção "Parte 5b: mundo público" (regra, arquivos, rotas, telas, medição, testes, limitações), no estilo das outras partes.
- [ ] `.claude/rules/social.md`: a sala do mundo público só aceita resenha (403 `publicRoom`).
- [ ] `docs/ROADMAP.md`: etapa 43 concluída; "Onde estamos".
- [ ] `src/GameInterface/changelog/changelog.ts`: entrada 4.35 (itens em pt/en curtos) e `upcoming` sem o mundo público; `package.json` `"version": "4.35.0"` (sem BOM).
- [ ] `bun test src/GameInterface/changelog`.
- [ ] Commit.

---

### Task 15: verificação final

- [ ] `bunx tsc --noEmit -p .`
- [ ] `bun test` (sozinho; repetir se for morto por memória)
- [ ] `bun run ui:audit --hard`
- [ ] Navegador (Chrome): dev-login, novo jogo → Mundo público → entrar num clube; Painel; `/world` com próximo passo e Hall da fama; a sala do mundo sem campo de texto; segundo usuário (`?as=2`) entra em outro clube; prévia → Simular.
- [ ] Merge, push, deploy (memória `homelab-deploy`), conferir que o servidor criou o mundo público na subida (`GET /api/worlds/public`).
