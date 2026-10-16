# Multiplayer parte 5a (classificação dos técnicos) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** classificação dos técnicos humanos de uma liga de amigos, por temporada, relativa à meta da diretoria, com o parcial da temporada em andamento.

**Architecture:** cada assento tem uma **passagem** aberta (`SeatState.standing`: clube, temporada, meta e os pontos "extras" já conquistados — copa, continental, prêmios, seleção). O parcial = pontos da posição de hoje contra a meta + extras. A passagem fecha (linha em `saves/{id}/seatSeasons.json`) na virada do país do clube, numa troca de clube, numa demissão ou no fim do contrato. Regras puras em `src/Domain/multiplayer/standings.ts`; E/S em `src/backend/standingsWorld.ts`; ganchos no avanço do dia, na troca de clube, no `addSeat` e no começo do mundo; rota `GET /api/worlds/:saveId/standings`; aba na tela `/world` e uma linha no Painel.

**Tech Stack:** Bun + TypeScript, `bun test`, React 19 + Tailwind, i18next.

Spec: `docs/superpowers/specs/2026-10-16-multiplayer-standings-design.md`. Worktree `C:/Projects/FMProject-standings`, branch `feat/mp-standings`. Imports sempre `@/`. Nunca `git stash`/`checkout`/`reset`. Arquivos em CRLF: preserve o fim de linha. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Decisão de implementação (dentro da spec):** copa e continental não são recalculadas das tabelas: o ponto entra como "extra" no dia do evento (final da copa, avanço/título continental), guardando o **maior** valor por competição. Assim a passagem não depende de a copa/continental ainda estar em disco na virada.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/standingsTypes.ts` (novo) | `StandingItemKey`, `StandingItem`, `SeatStanding`, `SeatSeasonRow`, `StandingsView` |
| `src/Domain/multiplayer/standingsConfig.ts` (novo) | `STANDINGS` (todas as constantes) |
| `src/Domain/multiplayer/standings.ts` (+ teste, novo) | Puro: pontos da meta, extras (máximo/soma), itens de uma passagem, fechamento, ordenação |
| `src/types/seatTypes.ts` | `SeatState.standing?` + `SEAT_KEYS` |
| `src/backend/dal/*`, `SaveService.ts` | `readSeatSeasons`/`writeSeatSeasons` (`seatSeasons.json`) |
| `src/backend/standingsWorld.ts` (novo) | `openPassage`, `closePassageRow`, `withExtra`, `standingsView` |
| `src/backend/advanceDay.ts` | Virada (fecha/abre), prêmios, copa, continental, seleção, demissão/fim de contrato, mensagens e aviso por socket |
| `src/backend/nationalWorld.ts` | Marca `title: true` na notícia `result` do campeão |
| `src/backend/jobWorld.ts` (`acceptJobOffer`), `seats.ts` (`addSeat`), `advanceDay.ts` (`presimulateWorld`) | Abrir/fechar passagem |
| `src/backend/worlds/worldRoutes.ts` | `GET /api/worlds/:saveId/standings` |
| `src/types/inboxTypes.ts`, `src/Domain/multiplayer/worldMessages.ts` | Mensagem `world` / `season_closed` |
| `src/GameInterface/World/*`, `InboxScreen.tsx`, `Dashboard/HomeCards.tsx`, `DashboardScreen.tsx` | Telas |
| i18n, regra, changelog, `package.json`, roadmap | Documentação e versão 4.27 |

---

### Task 1: regras puras

**Files:**
- Create: `src/types/standingsTypes.ts`, `src/Domain/multiplayer/standingsConfig.ts`, `src/Domain/multiplayer/standings.ts`
- Test: `src/Domain/multiplayer/standings.test.ts`

- [ ] **Step 1: Tipos**

```ts
// src/types/standingsTypes.ts
/** Friends' league standings (multiplayer part 5a, `.claude/rules/game/multiplayer.md`). */
export type StandingItemKey =
  | "objective_met" | "above_target" | "below_target" | "league_title" | "promoted" | "relegated"
  | "cup" | "continental" | "best_manager" | "world_manager" | "national_title" | "national_objective"
  | "half" | "sacked";

export interface StandingItem { key: StandingItemKey; points: number; detail?: string }

/** The seat's open passage at a club in a season. */
export interface SeatStanding {
  from: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
  /** Season label of the club's league ("2026-27" / "2027"). */
  season: string;
  /** Board target (worst position that still meets the objective); null without an objective. */
  target: number | null;
  /** Points already won in the passage that the table can't rebuild (cup, continental, awards, national team). */
  extras: StandingItem[];
}

export type PassageEnd = "rollover" | "club_change" | "sacked" | "contract";

export interface SeatSeasonRow {
  id: string;
  seatId: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
  season: string;
  from: string;
  closedOn: string;
  reason: PassageEnd;
  position: number | null;
  target: number | null;
  items: StandingItem[];
  total: number;
}

export interface StandingsEntry {
  seatId: string;
  nickname: string | null;
  managerName: string;
  face: unknown;
  nationalityIso: string | null;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  partial: { total: number; items: StandingItem[]; position: number | null; target: number | null } | null;
  closedTotal: number;
  total: number;
  seasons: number;
}

export interface StandingsView { entries: StandingsEntry[]; rows: SeatSeasonRow[] }
```
(No `face`, use o tipo real `ManagerFace | null` de `@/Domain/faces/managerFace` se `types` puder importá-lo; senão `unknown` como acima e o tipo certo na tela.)

- [ ] **Step 2: Config**

```ts
// src/Domain/multiplayer/standingsConfig.ts
export const STANDINGS = {
  OBJECTIVE_MET: 10,
  PER_POSITION: 1,
  MAX_POSITIONS: 10,
  LEAGUE_TITLE: 15,
  PROMOTED: 8,
  RELEGATED: -8,
  CUP: { champion: 8, finalist: 3 },
  CONTINENTAL: { champion: 15, finalist: 6, semifinal: 3, groups: 1 },
  BEST_MANAGER: 4,
  WORLD_MANAGER: 8,
  NATIONAL_TITLE: 6,
  NATIONAL_OBJECTIVE: 2,
  SACKED: -5,
} as const;
```

- [ ] **Step 3: Testes (falham primeiro)**

```ts
// src/Domain/multiplayer/standings.test.ts
import { describe, expect, test } from "bun:test";
import { objectiveItems, withExtra, passageItems, closePassage, rankEntries, sumItems } from "@/Domain/multiplayer/standings";
import type { SeatStanding } from "@/types/standingsTypes";

const open = (over: Partial<SeatStanding> = {}): SeatStanding => ({
  from: "2026-08-15", clubId: "c", clubName: "C", leagueSlug: "premier_league", season: "2026-27", target: 14, extras: [], ...over,
});

describe("standings", () => {
  test("objective: met + positions above, capped at 10", () => {
    expect(objectiveItems(8, 14)).toEqual([{ key: "objective_met", points: 10 }, { key: "above_target", points: 6 }]);
    expect(sumItems(objectiveItems(1, 20))).toBe(10 + 10);
  });
  test("objective: missed, positions below capped at -10", () => {
    expect(objectiveItems(2, 1)).toEqual([{ key: "below_target", points: -1 }]);
    expect(sumItems(objectiveItems(20, 4))).toBe(-10);
  });
  test("no games or no target: nothing", () => {
    expect(objectiveItems(null, 14)).toEqual([]);
    expect(objectiveItems(5, null)).toEqual([]);
  });
  test("extras keep the highest per key for cup/continental, sum the others", () => {
    let s = open();
    s = withExtra(s, { key: "continental", points: 1 });
    s = withExtra(s, { key: "continental", points: 3 });
    s = withExtra(s, { key: "continental", points: 1 });
    s = withExtra(s, { key: "national_objective", points: 2 });
    s = withExtra(s, { key: "national_objective", points: 2 });
    expect(s.extras).toEqual([{ key: "continental", points: 3 }, { key: "national_objective", points: 4 }]);
  });
  test("rollover close: objective, title, promotion and extras, full value", () => {
    const s = withExtra(open({ target: 4 }), { key: "cup", points: 8 });
    const row = closePassage(s, { seatId: "a", closedOn: "2027-05-20", reason: "rollover", position: 1, leagueTitle: true, move: "promoted" });
    expect(row.items.map((i) => i.key)).toEqual(["objective_met", "above_target", "league_title", "promoted", "cup"]);
    expect(row.total).toBe(10 + 3 + 15 + 8 + 8);
    expect(row.id).toBe("a:c:2026-27:2027-05-20");
  });
  test("club change: objective part halved (toward zero), extras whole", () => {
    const s = withExtra(open({ target: 14 }), { key: "continental", points: 1 });
    const row = closePassage(s, { seatId: "a", closedOn: "2026-12-01", reason: "club_change", position: 9 });
    // objective 10 + above 5 = 15 → half 7 (−8)
    expect(row.items).toEqual([
      { key: "objective_met", points: 10 }, { key: "above_target", points: 5 }, { key: "half", points: -8 }, { key: "continental", points: 1 },
    ]);
    expect(row.total).toBe(8);
  });
  test("sacked: halved and -5; negative objective halves toward zero", () => {
    const row = closePassage(open({ target: 4 }), { seatId: "a", closedOn: "2026-12-01", reason: "sacked", position: 13 });
    // below 9 → -9, half → -4 (+5), sacked -5 → total -9
    expect(row.items).toEqual([{ key: "below_target", points: -9 }, { key: "half", points: 5 }, { key: "sacked", points: -5 }]);
    expect(row.total).toBe(-9);
  });
  test("contract end: halved without -5", () => {
    const row = closePassage(open({ target: 4 }), { seatId: "a", closedOn: "2027-05-20", reason: "contract", position: 4 });
    expect(row.items.map((i) => i.key)).toEqual(["objective_met", "half"]);
    expect(row.total).toBe(5);
  });
  test("partial = the same items with today's position, nothing halved", () => {
    const s = withExtra(open({ target: 10 }), { key: "best_manager", points: 4 });
    expect(passageItems(s, { position: 7 })).toEqual([
      { key: "objective_met", points: 10 }, { key: "above_target", points: 3 }, { key: "best_manager", points: 4 },
    ]);
  });
  test("ranking: total, then partial, then name", () => {
    const e = (seatId: string, total: number, partial: number, managerName: string) => ({ seatId, total, managerName, partial: { total: partial } });
    expect(rankEntries([e("a", 10, 1, "Zé"), e("b", 10, 5, "Ana"), e("c", 12, 0, "Bia"), e("d", 10, 1, "Ana")]).map((x) => x.seatId))
      .toEqual(["c", "b", "d", "a"]);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar** — `bun test src/Domain/multiplayer/standings.test.ts` → FAIL (módulo não existe).

- [ ] **Step 5: Implementar**

```ts
// src/Domain/multiplayer/standings.ts
import { STANDINGS } from "@/Domain/multiplayer/standingsConfig";
import type { PassageEnd, SeatSeasonRow, SeatStanding, StandingItem, StandingItemKey } from "@/types/standingsTypes";

/** Keys where only the best result of the passage counts (one cup, one continental campaign). */
const MAX_KEYS: ReadonlySet<StandingItemKey> = new Set(["cup", "continental"]);

export const sumItems = (items: readonly StandingItem[]): number => items.reduce((n, i) => n + i.points, 0);

/** Points of a league position against the board's target (none without games or target). */
export function objectiveItems(position: number | null, target: number | null): StandingItem[] {
  if (position === null || target === null) return [];
  const cap = STANDINGS.MAX_POSITIONS;
  if (position <= target) {
    const above = Math.min(cap, target - position) * STANDINGS.PER_POSITION;
    return above > 0
      ? [{ key: "objective_met", points: STANDINGS.OBJECTIVE_MET }, { key: "above_target", points: above }]
      : [{ key: "objective_met", points: STANDINGS.OBJECTIVE_MET }];
  }
  return [{ key: "below_target", points: -Math.min(cap, position - target) * STANDINGS.PER_POSITION }];
}

/** Adds an extra: cup/continental keep the highest, the others add up. */
export function withExtra(s: SeatStanding, item: StandingItem): SeatStanding {
  const i = s.extras.findIndex((x) => x.key === item.key);
  if (i < 0) return { ...s, extras: [...s.extras, item] };
  const cur = s.extras[i]!;
  const next = MAX_KEYS.has(item.key)
    ? (item.points > cur.points ? item : cur)
    : { ...cur, points: cur.points + item.points };
  return next === cur ? s : { ...s, extras: s.extras.map((x, k) => (k === i ? next : x)) };
}

/** The passage's items with a position (the partial: today's; the close: the final one). */
export function passageItems(s: SeatStanding, at: { position: number | null }): StandingItem[] {
  return [...objectiveItems(at.position, s.target), ...s.extras];
}

/** Closes a passage into a season row. */
export function closePassage(s: SeatStanding, end: {
  seatId: string; closedOn: string; reason: PassageEnd; position: number | null;
  leagueTitle?: boolean; move?: "promoted" | "relegated" | null;
}): SeatSeasonRow {
  const objective = objectiveItems(end.position, s.target);
  const items: StandingItem[] = [...objective];
  if (end.reason === "rollover") {
    if (end.leagueTitle) items.push({ key: "league_title", points: STANDINGS.LEAGUE_TITLE });
    if (end.move === "promoted") items.push({ key: "promoted", points: STANDINGS.PROMOTED });
    if (end.move === "relegated") items.push({ key: "relegated", points: STANDINGS.RELEGATED });
  } else {
    const o = sumItems(objective);
    const half = Math.trunc(o / 2) - o;              // the objective part counts half, rounded toward zero
    if (half !== 0) items.push({ key: "half", points: half });
    if (end.reason === "sacked") items.push({ key: "sacked", points: STANDINGS.SACKED });
  }
  items.push(...s.extras);
  return {
    id: `${end.seatId}:${s.clubId}:${s.season}:${end.closedOn}`,
    seatId: end.seatId, clubId: s.clubId, clubName: s.clubName, leagueSlug: s.leagueSlug, season: s.season,
    from: s.from, closedOn: end.closedOn, reason: end.reason, position: end.position, target: s.target,
    items, total: sumItems(items),
  };
}

/** Standings order: total, then the partial, then the manager's name. */
export function rankEntries<T extends { total: number; managerName: string; partial: { total: number } | null }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    b.total - a.total || (b.partial?.total ?? 0) - (a.partial?.total ?? 0) || a.managerName.localeCompare(b.managerName));
}

/** Points of a continental campaign stage (the best one counts). */
export function continentalPoints(reached: "groups" | "semifinal" | "finalist" | "champion"): number {
  return STANDINGS.CONTINENTAL[reached];
}
```
Ajuste o teste "sacked" ao arredondamento: `Math.trunc(-9 / 2)` = −4, então `half` = −4 − (−9) = +5 (como no teste).

- [ ] **Step 6: Rodar** — `bun test src/Domain/multiplayer` → PASS; `bunx tsc --noEmit` → só o erro antigo em `DecisionTree.ts:750`.

- [ ] **Step 7: Commit** — `git add src/types/standingsTypes.ts src/Domain/multiplayer/standings*.ts` + `git commit -m "feat(standings): regras puras da classificação dos técnicos"`.

---

### Task 2: dados (`SeatState.standing` e `seatSeasons.json`)

**Files:** `src/types/seatTypes.ts`, `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `src/backend/SaveService.ts`; test `src/backend/dal/seatSeasons.dal.test.ts`.

- [ ] `SeatState` (`src/types/seatTypes.ts:41-82`): `standing?: SeatStanding;` (import de `@/types/standingsTypes`) e `"standing"` em `SEAT_KEYS` (L85-91).
- [ ] DAL no molde exato de `seatOffers` (4.26): `readSeatSeasons(saveId): Promise<SeatSeasonRow[]>` / `writeSeatSeasons(saveId, rows)` em `ISaveDAL`; `FileSystemDAL` com `seatSeasonsPath = ${SAVES_DIR}/${saveId}/seatSeasons.json`, ausente = `[]`, escrita com `bumpSaveDataVersion`; `BufferingSaveDAL` com a chave `seatSeasons:${saveId}`; `SaveService.getSeatSeasons`/`writeSeatSeasons`.
- [ ] Teste no molde de `src/backend/dal/seatOffers.dal.test.ts` (ausente = vazio; escrita bufferizada só aparece depois do `flush`).
- [ ] `bun test src/backend/dal`, `bunx tsc --noEmit`. Commit `feat(standings): passagem no assento e arquivo seatSeasons.json`.

---

### Task 3: E/S da passagem e os pontos de entrada fora do dia

**Files:** Create `src/backend/standingsWorld.ts`; Modify `src/backend/seats.ts` (`addSeat`), `src/backend/jobWorld.ts` (`acceptJobOffer`), `src/backend/advanceDay.ts` (`presimulateWorld`); Test `src/backend/standings.world.test.ts`.

- [ ] **`standingsWorld.ts`:**

```ts
import type { SaveService } from "@/backend/SaveService";
import { closePassage, withExtra } from "@/Domain/multiplayer/standings";
import type { BoardState } from "@/types/boardTypes";
import type { PassageEnd, SeatSeasonRow, SeatStanding, StandingItem } from "@/types/standingsTypes";

/** A new passage at a club, from the board's objective (target and season). */
export function newPassage(args: { date: string; clubId: string; clubName: string; leagueSlug: string; board: BoardState | null | undefined }): SeatStanding {
  const o = args.board?.objective ?? null;
  return {
    from: args.date, clubId: args.clubId, clubName: args.clubName, leagueSlug: args.leagueSlug,
    season: o?.season ?? "", target: o?.target ?? null, extras: [],
  };
}

/** Only friends' leagues keep standings. */
export async function standingsOn(service: SaveService, saveId: string): Promise<boolean> {
  const meta = await service.getMeta(saveId);
  return meta?.mode === "multi" && !!meta.world;
}

/** Adds rows (idempotent by id). */
export async function appendSeatSeasons(service: SaveService, saveId: string, rows: readonly SeatSeasonRow[]): Promise<void> {
  if (rows.length === 0) return;
  const cur = await service.getSeatSeasons(saveId);
  const ids = new Set(cur.map((r) => r.id));
  const fresh = rows.filter((r) => !ids.has(r.id));
  if (fresh.length > 0) await service.writeSeatSeasons(saveId, [...cur, ...fresh]);
}

/** The league position of a club today (null without games). */
export async function positionOf(service: SaveService, saveId: string, leagueSlug: string, clubId: string): Promise<number | null> {
  const table = (await service.getLeagueStandings(saveId, leagueSlug)) ?? [];
  const i = table.findIndex((r) => r.squadId === clubId);
  return i >= 0 && table[i]!.mp > 0 ? i + 1 : null;
}

/** Closes the seat's open passage outside the day (club change): writes the row, clears `standing`. */
export async function closeSeatPassage(service: SaveService, saveId: string, seatId: string, date: string, reason: PassageEnd): Promise<SeatSeasonRow | null> {
  const seat = await service.getSeat(saveId, seatId);
  const s = seat?.standing;
  if (!s) return null;
  const row = closePassage(s, { seatId, closedOn: date, reason, position: await positionOf(service, saveId, s.leagueSlug, s.clubId) });
  await appendSeatSeasons(service, saveId, [row]);
  await service.updateSeat(saveId, seatId, { standing: undefined });
  return row;
}

export { withExtra };
export type { StandingItem };
```
(Confira os nomes reais: `getLeagueStandings`, `StandingRow.mp`/`squadId`, `getMeta`.)

- [ ] **`addSeat`** (`src/backend/seats.ts`, o `updateSeat` depois de `takeOverClub`, ~L114): acrescente `standing: newPassage({ date, clubId: entry.squadId, clubName: taken.clubName, leagueSlug: taken.leagueSlug, board: taken.board })` (`addSeat` só existe em mundos `multi`).
- [ ] **Começo do mundo** (`presimulateWorld`, `src/backend/advanceDay.ts` ~L3341, depois do kit, antes de `presimulated: true`): para cada assento de `listSeats` sem `standing` e com clube, grave `standing: newPassage({ date: world.currentDate, ... board: seat.board })` — só se `standingsOn`. (O kit pode mudar a data e a meta: por isso aqui, depois do kit.)
- [ ] **Troca de clube** (`acceptJobOffer`, `src/backend/jobWorld.ts`): antes do `releaseHumanClub` (L455), se `employedAt` e `standingsOn`: `await closeSeatPassage(service, saveId, seatId, date, "club_change")`. Depois do `updateSeat` final (L495-521): se `standingsOn`, `updateSeat(..., { standing: newPassage({ date, clubId: offer.squadId, clubName: taken.clubName, leagueSlug: taken.leagueSlug, board: taken.board }) })`. Desempregado aceitando: só abre.
- [ ] **Teste** `src/backend/standings.world.test.ts`: mundo `multi` com `world` (use `createMultiWorld`/o caminho de `src/backend/worlds/worldTestUtils.ts` e `addSeat`, como em `src/backend/seats.addSeat.test.ts`; leia esses arquivos): o membro entra com `standing` (meta e temporada da diretoria); o começo do mundo dá `standing` ao dono; `acceptJobOffer` de um clube para outro grava uma linha `club_change` com o meio-valor e abre a passagem nova; num solo (`createSave` sem `mode`) nada é gravado.
- [ ] `bun test src/backend/standings.world.test.ts src/backend/seats.addSeat.test.ts src/backend/jobs.test.ts` (um por vez), `bunx tsc --noEmit`. Commit `feat(standings): passagem aberta na entrada, no começo do mundo e na troca de clube`.

---

### Task 4: o avanço do dia

**Files:** `src/backend/advanceDay.ts`, `src/backend/nationalWorld.ts`, `src/backend/daySeats.ts`; Test `src/backend/standings.advanceDay.test.ts`.

Trabalhe com uma cópia de trabalho por assento: em `DaySeat` (`src/backend/daySeats.ts`) acrescente `standing?: SeatStanding` (iniciado em `newDaySeat` a partir de `meta.standing`) e grave no fim do dia com `ds.patch.standing = ds.standing` quando mudou (o `updateSeat` do fim do dia, L3238-3240, já grava o `patch`). Linhas fechadas no dia vão para uma lista `standingRows: SeatSeasonRow[]` do dia, gravada uma vez com `appendSeatSeasons` antes do flush. Tudo só quando o mundo é `multi` com `world` (calcule uma vez no começo do dia: `const standingsActive = world.mode === "multi" && !!world.world`).

- [ ] **Copa** (L1140-1185, onde a final é decidida com `fixtureWinner`): na final, `winnerSeat` ganha `withExtra(ds.standing, { key: "cup", points: STANDINGS.CUP.champion })` e o assento perdedor (o outro clube da final, `seatOf.get(loserId)`) `STANDINGS.CUP.finalist`.
- [ ] **Continental** (L1252-1275, `ev.kind`): `advanced` de `"group"` → `continentalPoints("groups")`; `advanced` de `"qf"` (chegou à semi) → `"semifinal"`; `advanced` de `"sf"` (chegou à final) → `"finalist"`; `champion` → `"champion"`. Só o assento do clube (`seatOf.get(ev.clubId)`); `withExtra` guarda o maior.
- [ ] **Melhor técnico da liga** (L2092-2101, depois de `recordLeagueAwards`): `const bmSeat = seatIdOfManager(res.awards.bestManager?.managerId ?? "")`; se for um assento do dia, `withExtra(..., { key: "best_manager", points: STANDINGS.BEST_MANAGER })` — antes do fechamento da passagem (que vem logo abaixo, no bloco da diretoria).
- [ ] **Fechamento na virada** (bloco da diretoria, L2166-2186, ainda com a meta antiga): se `ds.standing`, `const row = closePassage(ds.standing, { seatId: ds.seatId, closedOn: currentDate, reason: "rollover", position, leagueTitle: position === 1, move: ds.rollover.move?.kind ?? null })`; empilhe em `standingRows`, guarde `ds.standingClosed = row` (para a mensagem) e `ds.standing = undefined`.
- [ ] **Abertura na virada** (L2466-2485, depois de `carryIntoNewSeason`, só sem demissão): `ds.standing = newPassage({ date: currentDate, clubId: ds.clubId, clubName: ds.meta.clubName, leagueSlug: newLeague, board: ds.board })`.
- [ ] **Demissão e fim de contrato** (L2706-2756, quando `ended` e antes do `releaseHumanClub`): se `ds.standing` e `ds.standing.from !== currentDate` (uma passagem aberta hoje na virada é descartada sem linha), feche com `reason: ended.reason === "contract" ? "contract" : "sacked"` e a posição de hoje (`positionOf`); em todo caso `ds.standing = undefined`.
- [ ] **Melhor técnico do mundo** (L2842-2851): `seatIdOfManager(msg?.world?.manager[0]?.id ?? "")` → `withExtra(..., { key: "world_manager", points: STANDINGS.WORLD_MANAGER })` se o assento tem passagem.
- [ ] **Seleção:** em `nationalWorld.ts` (L684-688) acrescente `title: true` à notícia `result` do campeão (e o campo opcional `title?: boolean` em `NationalCoachNews`, `src/Domain/inbox/nationalCoachMessage.ts`). No `advanceDay`, depois de `playNationalDay` (L817), para cada assento: cada `coachNews` `kind: "result"` com `met` soma `national_objective` (+2); com `title`, soma também `national_title` (+6).
- [ ] **Mensagem e aviso:** guarde no dia as linhas `rollover` fechadas; depois do bloco do `clearInbox` (depois da L2978), para cada linha, mande a todos os assentos do dia a mensagem `season_closed` (Task 5) com o nome do técnico, o total da temporada e a posição dele na classificação (calcule com as linhas gravadas + as do dia). Devolva no `AdvanceDayOutcome` um `standingsChanged: true` quando houve linha, e em `runBufferedDay` (depois do flush, junto do `nudgeSeats`, L289) chame `notifyWorld(saveId, { type: "world_members", saveId })`.
- [ ] **Teste** `src/backend/standings.advanceDay.test.ts` (mundo `multi` de 2 assentos; leia `src/backend/seats.twoSeats.test.ts`/`seatOffers.day.test.ts` para montar e achar dias): (a) um dia comum não mexe na passagem; (b) virada do país do assento (avance até a data de fim da liga ou force o fim como os testes de virada existentes fazem — `grep -rn "rollover" src/backend/*.test.ts`) grava uma linha `rollover` e abre a passagem nova da temporada nova; refazer o mesmo dia não duplica a linha; (c) demissão forçada (diretoria a 0 com demissão ligada, como `board.advanceDay.test.ts`) fecha com `sacked` e −5; (d) `withExtra` de copa/continental pelo dia: injete o evento chamando a função de pontuação diretamente se montar uma final for caro, mas cubra o caminho do `advanceDay` ao menos para a virada e a demissão.
- [ ] Testes um por vez: `bun test src/backend/standings.advanceDay.test.ts`, `src/backend/board.advanceDay.test.ts`, `src/backend/national.coach.test.ts`, `src/backend/groupAdvance.test.ts`; `bunx tsc --noEmit`. Commit `feat(standings): virada, demissão, prêmios, copa, continental e seleção no avanço do dia`.

---

### Task 5: rota e mensagem

**Files:** `src/backend/worlds/worldRoutes.ts`, `src/backend/standingsWorld.ts` (`standingsView`), `src/types/inboxTypes.ts`, `src/Domain/multiplayer/worldMessages.ts`; Test `src/backend/standings.routes.test.ts`.

- [ ] **`standingsView(service, saveId)`** em `standingsWorld.ts`: para cada membro (mesmo laço de `worldView`, `src/backend/worlds/worldLifecycle.ts:23-55`: `listSaveMembers`, `listSeats`, `getSocialUser`), `closed = rows.filter(seatId)`, `closedTotal = sum(total)`, `partial` = `passageItems(seat.standing, { position: await positionOf(...) })` (null sem `standing`), `total = closedTotal + (partial?.total ?? 0)`, `seasons = closed.length`; ordene com `rankEntries`. Devolve `{ entries, rows }` (`rows` ordenadas por `closedOn` desc).
- [ ] **Rota** `"/api/worlds/:saveId/standings": { GET }`: `requireSeat` (não membro = 404 do próprio `requireSeat`), mundo sem `multi`/`world` → `fail("notMulti", 409)`; resposta `standingsView`.
- [ ] **Mensagem** `WorldSeasonClosedInboxMessage { category: "world"; kind: "season_closed"; managerName; clubName; season; points; rank; of }` no union de `src/types/inboxTypes.ts` (L485-487) e o construtor `buildSeasonClosedMessage(date, args)` em `worldMessages.ts` (id `world-season_closed-${seatId}-${season}-${date}`; assunto em inglês de fallback). Use-o no passo da Task 4.
- [ ] **Teste da rota:** membros veem as entradas na ordem; não membro 404; solo 409; o parcial muda com a tabela (grave uma tabela com o clube do assento em outra posição e confira `partial.position` e os itens).
- [ ] `bun test src/backend/standings.routes.test.ts src/backend/worlds`, `bunx tsc --noEmit`. Commit `feat(standings): rota da classificação e mensagem de temporada fechada`.

---

### Task 6: telas

**Files:** `src/GameInterface/World/worldApi.ts`, `WorldScreen.tsx`, `src/GameInterface/World/StandingsTable.tsx` (novo), `InboxScreen.tsx`, `Dashboard/HomeCards.tsx` (`ClubCard`), `DashboardScreen.tsx`, i18n.

- [ ] `worldApi.standings(saveId) → call<StandingsView>("GET", /api/worlds/${seg(saveId)}/standings)`.
- [ ] **`/world`:** `SegmentedTabs` (`src/GameInterface/ui/SegmentedTabs.tsx`) no topo do conteúdo com "Liga" (o conteúdo atual) e "Classificação" (`?tab=standings` abre direto); só com 2+ membros. A aba carrega `worldApi.standings` e recarrega com `social.worldVersion` (já bumpado pelo evento `world_members`).
- [ ] **`StandingsTable.tsx`:** peças de `src/GameInterface/Components/StatsTable.tsx` (`StatsTable`, `StatsHead`, `StatsRow` clicável com `expanded`, `StatsDetailRow`, `RankCell`, `CrestCell`, `NameCell`, `NumberCell strong`); colunas: #, rosto 32px (`ManagerFaceImage` como no `WorldScreen` L142-146), técnico + apelido, escudo + clube, "Temporada atual" (parcial, com o selo "parcial"), "Fechadas", "Total" (`strong`); linha do próprio assento destacada. Detalhe ao clicar: a passagem aberta e cada linha fechada daquele técnico (temporada, clube, motivo), cada item com o texto `world.standings.items.<key>` e os pontos com sinal. Padrão visual `.claude/rules/ui-standard.md`.
- [ ] **Inbox:** ramo `season_closed` antes dos genéricos de `category === "world"` (assunto/preview ~L742, corpo ~L914; exclua o kind dos genéricos): "Temporada de {{manager}} fechada: {{points}} pontos, {{rank}}º de {{of}}" com link para `/world?tab=standings`.
- [ ] **Painel:** em `DashboardScreen`, com `session.groupAdvance`, busque `worldApi.standings` (molde do `managerRank`, L127-136) e passe `friendsRank: { rank, of } | null` ao `ClubCard`; no `ClubCard`, depois do link do ranking de técnicos (L234-241), `<a href="/world?tab=standings" …>{t("world.standings.dashboardLine", { rank, of })}</a>` no mesmo estilo.
- [ ] **i18n** en/pt-BR: `world.standings.{tab, tabLeague, title, partial, closed, total, season, empty, dashboardLine, reason.*, items.*}` e `world.inbox.season_closed.{subject, body}`; teste de chaves `src/i18n/standings.keys.test.ts` no molde de `src/i18n/seatOffers.keys.test.ts`.
- [ ] `bunx tsc --noEmit`, `bun test src/GameInterface src/i18n`, `bun run ui:audit --hard` (0) e sem leves nos arquivos tocados. Commit `feat(standings): aba Classificação, linha no Painel e mensagem`.

---

### Task 7: documentação e versão 4.27

- [ ] `.claude/rules/game/multiplayer.md`: seção "## Parte 5a: classificação dos técnicos" (Regra, Dados, Onde grava, Rota, Telas, Testes com o comando, Limitações), no estilo das partes 2–4.
- [ ] `src/GameInterface/changelog/changelog.ts`: entrada `4.27` (data do dia) com `items` pt/en para o jogador ("Classificação dos técnicos na liga de amigos, por temporada, com a temporada atual ao vivo"); `upcoming`: tirar a classificação, pôr o mundo público (5b).
- [ ] `package.json` `"version": "4.27"` (sem BOM).
- [ ] `docs/ROADMAP.md`: etapa 43 com as partes 1–5a e a 5b pendente.
- [ ] `bun test src/GameInterface/changelog src/repoHygiene.test.ts`. Commit `docs(standings): regra da parte 5a, changelog e versão 4.27`.

---

## Verificação final

Suíte em partes, uma de cada vez (parte 1; backend em blocos de 5 arquivos; `src/lab src/mcp`; `bunx tsc --noEmit`; `bun run ui:audit --hard`). Navegador (dev server local, dois usuários `localhost` e `127.0.0.1?as=2`): liga de amigos com dois técnicos, aba Classificação com o parcial dos dois e a linha no Painel.
