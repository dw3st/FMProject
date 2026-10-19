# Rivais na liga de amigos (resultados, placar ao vivo, resenha) — plano de implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`
> para seguir este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhar.

**Spec:** `docs/superpowers/specs/2026-10-19-multiplayer-rivals-design.md`. Versão alvo **4.34**.

**Goal:** numa liga de amigos (`mode: "multi"` com `world`), cada técnico vê o resultado dos jogos dos amigos assim que o
dia roda, um painel com a situação de cada amigo, o placar ao vivo de quem está jogando (inclusive durante a própria
partida) e pode provocar com reações em ícone e frases prontas que caem no chat da liga. O solo não muda.

**Architecture:** regras puras em `src/Domain/rivals/` (resultados e situações, catálogo de frases, validação do placar
ao vivo); o executor do avanço em grupo grava o feed do mundo (`rivalsFeed.json`) depois de cada dia e manda
`world_results`; o placar ao vivo é estado em memória (`src/backend/rivals/liveScores.ts`) alimentado por um novo
`ClientEvent` `live_score` no socket `/api/ws` e repassado como `friend_live`; as provocações são mensagens da sala
`world:<saveId>` com a coluna nova `chat_messages.meta`. Telas: abas Rivais e Resultados em `/world`, cartão Rivais no
Painel, avisos no canto (mesma pilha do `ChatPopups`) e uma faixa na partida ao vivo com socket próprio.

**Tech Stack:** Bun + TypeScript, React 19, Tailwind v4, `bun:test`, SQLite (`bun:sqlite`), i18next.

**Regras do projeto que valem aqui:** imports sempre `@/…`; ícones só via `Icons.tsx`; UI no padrão de
`.claude/rules/ui-standard.md` (texto ≥ 13px, `tabular-nums`, `StatsTable`/`TABLE_STYLE`, `SegmentedTabs`,
`OptionChips`); nenhum emoji em lugar nenhum; nenhum texto livre do cliente na provocação; frame inválido do socket é
ignorado em silêncio. Nada de `/test` ou `/lab` (não é mecânica do motor).

## Ambiguidades da spec resolvidas aqui

1. **Feed "bufferizado na fase 1":** o executor roda o dia com `runBufferedDay` (que já faz o `flush`) e só depois lê
   `outcome.payload.events`. O feed é gravado logo em seguida, ainda dentro do `withSaveLock` do passo, pelo
   `SaveService` normal (como `appendPendingDay`). O DAL ganha `readRivalsFeed`/`writeRivalsFeed` também no
   `BufferingSaveDAL` (chave `rivalsFeed:<save>`), então qualquer código do dia pode gravá-lo bufferizado.
2. **Jogo do dia no `live_score`:** `seatMatchDates` só devolve datas; a validação procura o `Fixture` não jogado do dia
   atual do mundo cujo `id` é o `fixtureId` do frame e cujo `home`/`away` é o clube do assento. Jogo de seleção não
   tem placar ao vivo (o `MatchScreen` não manda nada com `data.national`).
3. **Autor do gol ao vivo:** para não aceitar texto livre, o `scorer` só é guardado quando é exatamente o nome de um
   jogador de um dos dois elencos (lidos no `start`); senão o gol vale sem autor.
4. **`friend_live` ganha `goal?: true`** (extensão da spec) para a tela saber que o evento foi um gol e mostrar o aviso.
5. **Prazos do ao vivo:** `end` fica 10 min como "terminado"; sem evento por 15 min vira "interrompido"; some aos 30 min
   sem evento (a spec diz "depois some"). A varredura roda junto da de presença (30 s).
6. **Reação "palmas":** o lucide não tem palmas; o ícone é `ThumbsUp` (nome interno `react-applause`). Fogo = `Flame`,
   risada = `Laugh`, lamento = `HeartCrack`. Ao vivo = `Radio`.
7. **Situações ao vivo:** frases só depois de um gol (`live_goal_for` / `live_goal_against`, pelo último gol do
   amigo); antes disso só as reações.
8. **Pênaltis:** um jogo empatado decidido nos pênaltis tem `draw` e mais `shootout_win`/`shootout_loss`.
9. **`taunts` sem sala:** o alvo é sempre outro assento, então o mundo tem 2+ membros e a sala existe; a rota não
   repete essa checagem.
10. **`TauntMeta`** guarda `clubId` (escudo), `clubName`, `opponentName` e `home` (para escrever "Vasco 0–3 Bahia" na
    ordem certa), além dos campos da spec.
11. **Gol anulado pelo VAR ao vivo:** o placar cai, o frame é recusado (só cresce); os frames seguintes voltam a valer
    quando o placar passar do guardado. Limitação documentada.

## Mapa de arquivos

| Arquivo | Novo/Muda | Papel |
|---|---|---|
| `src/types/rivalsTypes.ts` | novo | `SeatResult`, `ResultSituation`, `TauntGroup`, `LiveScoreFrame`, `LiveScoreView`, `TauntMeta`, `RivalRow`, `RivalsView`, `ResultsPage` |
| `src/Domain/rivals/rivalsConfig.ts` (+ teste) | novo | `RIVALS` |
| `src/Domain/rivals/results.ts` (+ teste) | novo | `scoreLineOf`, `resultSituations`, `buildSeatResults`, `resultLetter`, `formOf`, `mergeFeed`, `isSeatResult` |
| `src/Domain/rivals/taunts.ts` (+ teste) | novo | `REACTIONS`, `TAUNTS`, `ALL_TAUNT_IDS`, `tauntsFor`, `isTauntFor`, `liveGroups`, `tauntMeta`, `parseTauntMeta`, `tauntFallbackBody` |
| `src/Domain/rivals/liveScore.ts` (+ teste) | novo | `parseLiveFrame`, `applyLiveFrame`, `liveStatusAt`, `isLiveScoreView` |
| `src/types/socialTypes.ts` | muda | `ChatMessageView.taunt?`, `ClientEvent` `live_score`, `ServerEvent` `world_results` / `friend_live` |
| `src/types/multiplayerTypes.ts` | muda | `WorldErrorCode` + `self`, `invalidTaunt`, `rateLimited` |
| `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `SaveService.ts` | muda | `rivalsFeed.json` |
| `src/backend/rivals/rivalsWorld.ts` (+ teste) | novo | `appendRivalsFeed`, `recordDayResults` |
| `src/backend/groupAdvance.ts` (+ `groupAdvance.rivals.test.ts`) | muda | feed do dia, `world_results`, limpa o ao vivo |
| `src/backend/rivals/liveScores.ts` (+ teste) | novo | estado em memória, `acceptLiveScore`, `liveScoresOf`, `sweepLiveScores`, `clearLiveForDay` |
| `src/backend/social/realtime.ts` (+ teste) | muda | `live_score` no socket |
| `src/backend/social/maintenance.ts` | muda | varredura do ao vivo |
| `src/backend/rivals/rivalsView.ts` | novo | `rivalsView` (painel) |
| `src/backend/rivals/rivalsRoutes.ts` (+ testes) | novo | `rivals`, `live`, `results`, `taunts` |
| `src/backend/routes.ts` | muda | registra `rivalsRoutes` |
| `src/backend/db.ts`, `social/socialStore.ts`, `social/socialRoutes.ts` | muda | `chat_messages.meta`, `chatMessageView`, `allowChatSend` |
| `src/GameInterface/Icons.tsx` | muda | `react-applause`, `react-fire`, `react-laugh`, `react-sorry`, `radio` |
| `src/i18n/locales/{pt-BR,en}.json` (+ `src/i18n/rivals.keys.test.ts`) | muda | bloco `rivals`, `world.errors.*` |
| `src/GameInterface/World/worldApi.ts`, `rivalsApi.ts` | muda/novo | chamadas |
| `src/GameInterface/Social/socialState.ts` (+ teste), `useSocial.tsx`, `Components/Layout.tsx` | muda | eventos novos, avisos de rival, `rivalsVersion` |
| `src/GameInterface/World/reactionIcons.ts`, `RivalForm.tsx`, `liveText.ts` (+ teste), `TauntActions.tsx` | novo | peças de tela |
| `src/GameInterface/Social/TauntLine.tsx`, `ChatWindow.tsx`, `ChatPopups.tsx` | novo/muda | resenha no chat, avisos |
| `src/GameInterface/World/RivalsTable.tsx`, `ResultsFeed.tsx`, `WorldScreen.tsx` | novo/muda | abas Rivais e Resultados |
| `src/GameInterface/Dashboard/HomeCards.tsx`, `DashboardScreen.tsx` | muda | cartão Rivais |
| `src/GameInterface/World/useLiveRivals.ts`, `LiveRivalsStrip.tsx`, `MatchScreen.tsx` | novo/muda | faixa e envio do placar ao vivo |
| `.claude/rules/game/multiplayer.md`, `.claude/rules/social.md`, `.claude/rules/project-structure.md` | muda | documentação |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | muda | 4.34 |

---

## Task 1: tipos e configuração

**Files:**
- Create: `src/types/rivalsTypes.ts`
- Create: `src/Domain/rivals/rivalsConfig.ts`
- Test: `src/Domain/rivals/rivalsConfig.test.ts`
- Modify: `src/types/socialTypes.ts`
- Modify: `src/types/multiplayerTypes.ts`

- [ ] **Step 1: escrever o teste da configuração**

```ts
// src/Domain/rivals/rivalsConfig.test.ts
import { describe, expect, test } from "bun:test";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";

describe("RIVALS", () => {
  test("the live limits are coherent", () => {
    expect(RIVALS.FEED_MAX).toBe(300);
    expect(RIVALS.LIVE_MAX_EVENTS).toBe(40);
    expect(RIVALS.LIVE_MAX_MINUTE).toBe(130);
    expect(RIVALS.LIVE_STALE_MS).toBeLessThan(RIVALS.LIVE_DROP_MS);
    expect(RIVALS.LIVE_ENDED_KEEP_MS).toBe(10 * 60_000);
    expect(RIVALS.POPUP_MAX).toBe(3);
    expect(RIVALS.POPUP_MS).toBe(8_000);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/Domain/rivals/rivalsConfig.test.ts`
Expected: FAIL (`Cannot find module '@/Domain/rivals/rivalsConfig'`).

- [ ] **Step 3: criar a configuração**

```ts
// src/Domain/rivals/rivalsConfig.ts
/** Rivals in a friends' league (`.claude/rules/game/multiplayer.md`, part 6). */
export const RIVALS = {
  /** Results kept in `rivalsFeed.json`, newest first. */
  FEED_MAX: 300,
  /** Results in a friend's form line. */
  FORM_SIZE: 5,
  /** Goal difference of a big win / loss. */
  BIG_MARGIN: 3,
  /** A goal at this minute or later is "late". */
  LATE_MINUTE: 88,
  /** At most this many live events per game (the rest are ignored). */
  LIVE_MAX_EVENTS: 40,
  LIVE_MAX_MINUTE: 130,
  LIVE_MAX_GOALS: 30,
  /** `live_score` frames per socket per minute. */
  LIVE_PER_MINUTE: 30,
  /** A finished game stays this long as "full time". */
  LIVE_ENDED_KEEP_MS: 10 * 60_000,
  /** No event for this long: "interrupted". */
  LIVE_STALE_MS: 15 * 60_000,
  /** No event for this long: gone. */
  LIVE_DROP_MS: 30 * 60_000,
  SCORER_MAX: 40,
  FIXTURE_ID_MAX: 80,
  /** Result / goal notices in the corner. */
  POPUP_MS: 8_000,
  POPUP_MAX: 3,
  /** A friend's line in the live strip lights up this long after his goal. */
  STRIP_HIGHLIGHT_MS: 4_000,
  /** Results per page of `GET /results`. */
  RESULTS_PAGE: 50,
  /** Phrases shown in the menu. */
  MENU_PHRASES: 8,
} as const;
```

- [ ] **Step 4: criar os tipos**

```ts
// src/types/rivalsTypes.ts
// Rivals in a friends' league (multiplayer part 6). Nicknames only: never an e-mail or a user id.
import type { ManagerFace } from "@/Domain/faces/managerFace";

export type ResultSituation =
  | "win" | "draw" | "loss"
  | "big_win" | "big_loss" | "home_loss" | "away_win"
  | "comeback_win" | "blown_lead" | "late_equalizer" | "late_winner"
  | "shootout_win" | "shootout_loss";

export type LiveSituation = "live_goal_for" | "live_goal_against";
export type TauntGroup = ResultSituation | LiveSituation;

export interface SeatResultGoal {
  minute: number;
  side: "for" | "against";
  scorer: string;
}

/** One game of a human club (one per side when two seats meet). Score from the club's side. */
export interface SeatResult {
  /** `<date>:<competition>:<fixtureId>:<seatId>`. */
  id: string;
  date: string;
  seatId: string;
  nickname: string;
  clubId: string;
  clubName: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  competition: string;
  score: { for: number; against: number };
  decider?: { penalties: { for: number; against: number } };
  goals: SeatResultGoal[];
  situations: ResultSituation[];
}

export type LivePhase = "start" | "goal" | "half" | "end";
export type LiveStatus = "live" | "half" | "ended" | "stale";

/** `live_score` from the browser of who plays (score from his club's side). */
export interface LiveScoreFrame {
  saveId: string;
  fixtureId: string;
  phase: LivePhase;
  minute: number;
  score: { for: number; against: number };
  scorer?: string;
}

/** The fixed part of a live game (who, against whom, which fixture). */
export interface LiveBase {
  seatId: string;
  nickname: string;
  clubId: string;
  clubName: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  fixtureId: string;
  date: string;
}

export interface LiveScoreView extends LiveBase {
  status: LiveStatus;
  minute: number;
  score: { for: number; against: number };
  lastGoal: { minute: number; side: "for" | "against"; scorer: string | null } | null;
  events: number;
  updatedAt: number;
}

export type ReactionId = "applause" | "fire" | "laugh" | "sorry";
export type TauntKind = "reaction" | "phrase";
export type TauntTarget = { result: string } | { live: string };

/** Stored in `chat_messages.meta` as `{ taunt }`: ids and the real score only. */
export interface TauntMeta {
  kind: TauntKind;
  id: string;
  /** Nickname of the friend taunted. */
  target: string;
  clubId: string;
  clubName: string;
  opponentName: string;
  home: boolean;
  score: { for: number; against: number };
  live?: true;
  minute?: number;
}

export interface RivalNextMatch {
  date: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  competition: string;
}

export interface RivalRow {
  seatId: string;
  nickname: string | null;
  managerName: string;
  face: ManagerFace | null;
  nationalityIso: string | null;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  leagueSlug: string;
  leaguePosition: number | null;
  form: ("W" | "D" | "L")[];
  last: SeatResult | null;
  next: RivalNextMatch | null;
  friendsRank: number;
  friendsTotal: number;
  live: LiveScoreView | null;
  me: boolean;
}

export interface RivalsView { rows: RivalRow[] }
export interface ResultsPage { results: SeatResult[]; hasMore: boolean }
```

- [ ] **Step 5: estender os tipos do social**

Em `src/types/socialTypes.ts`:

1. No topo, `import type { LiveScoreFrame, LiveScoreView, SeatResult, TauntMeta } from "@/types/rivalsTypes";`
2. Em `ChatMessageView`, depois de `at: number;`:

```ts
  /** A taunt from the rivals (multiplayer part 6): the screens render it, `body` is the English fallback. */
  taunt?: TauntMeta;
```

3. `ClientEvent` ganha:

```ts
  | ({ type: "live_score" } & LiveScoreFrame);
```

4. No fim da união `ServerEvent` (antes do `;` final), acrescente:

```ts
  // Multiplayer part 6 (rivals): the human clubs' games of the day, and a friend's live score.
  | { type: "world_results"; saveId: string; results: SeatResult[] }
  | { type: "friend_live"; saveId: string; seatId: string; live: LiveScoreView | null; goal?: true }
```

- [ ] **Step 6: códigos de erro do mundo**

Em `src/types/multiplayerTypes.ts`, troque a última linha de `WorldErrorCode` por:

```ts
  | "notMember" | "tooLarge" | "ownerLimit" | "generic" | "lobby" | "self" | "invalidTaunt" | "rateLimited";
```

- [ ] **Step 7: rodar o teste e o typecheck**

Run: `bun test src/Domain/rivals/rivalsConfig.test.ts && bun run typecheck`
Expected: PASS; o typecheck pode acusar `switch` exaustivos sobre `ServerEvent` ou `ClientEvent` — se acusar, só
anote: as tarefas 6 e 10 tratam os casos novos. Se acusar em `realtime.ts` `withinLimits` (o `l[event.type]`), a
tarefa 6 resolve; para esta tarefa basta não haver erro novo fora desses dois pontos.

- [ ] **Step 8: commit**

```bash
git add src/types/rivalsTypes.ts src/Domain/rivals/rivalsConfig.ts src/Domain/rivals/rivalsConfig.test.ts src/types/socialTypes.ts src/types/multiplayerTypes.ts
git commit -m "feat(rivals): types and config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: resultados, situações e forma (puro)

**Files:**
- Create: `src/Domain/rivals/results.ts`
- Test: `src/Domain/rivals/results.test.ts`

- [ ] **Step 1: escrever os testes**

```ts
// src/Domain/rivals/results.test.ts
import { describe, expect, test } from "bun:test";
import {
  buildSeatResults, formOf, isSeatResult, mergeFeed, resultLetter, resultSituations, scoreLineOf,
} from "@/Domain/rivals/results";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { SeatResult, SeatResultGoal } from "@/types/rivalsTypes";

const g = (minute: number, side: "for" | "against"): SeatResultGoal => ({ minute, side, scorer: "" });

function match(over: Partial<MatchEvent>): MatchEvent {
  return {
    kind: "match", fixtureId: "f1", competition: "premier_league", round: 1, home: "c1", away: "c2",
    score: { home: 0, away: 0 }, playerNames: { p1: "Silva", p2: "Costa" }, ...over,
  } as unknown as MatchEvent;
}

describe("scoreLineOf", () => {
  test("home side first", () => {
    expect(scoreLineOf({ clubName: "Vasco", opponentName: "Bahia", home: true, score: { for: 0, against: 3 } })).toBe("Vasco 0–3 Bahia");
    expect(scoreLineOf({ clubName: "Vasco", opponentName: "Bahia", home: false, score: { for: 3, against: 0 } })).toBe("Bahia 0–3 Vasco");
  });
});

describe("resultSituations", () => {
  const base = { home: true, goals: [] as SeatResultGoal[] };
  test("always one of win / draw / loss", () => {
    expect(resultSituations({ ...base, score: { for: 1, against: 0 } })).toContain("win");
    expect(resultSituations({ ...base, score: { for: 1, against: 1 } })).toContain("draw");
    expect(resultSituations({ ...base, score: { for: 0, against: 1 } })).toContain("loss");
  });
  test("big margins, home loss, away win", () => {
    expect(resultSituations({ ...base, score: { for: 3, against: 0 } })).toContain("big_win");
    expect(resultSituations({ ...base, score: { for: 0, against: 3 } })).toEqual(["loss", "big_loss", "home_loss"]);
    expect(resultSituations({ home: false, goals: [], score: { for: 2, against: 1 } })).toContain("away_win");
    expect(resultSituations({ ...base, score: { for: 2, against: 0 } })).not.toContain("big_win");
  });
  test("comeback by the goals' minutes", () => {
    const s = resultSituations({ ...base, score: { for: 2, against: 1 }, goals: [g(10, "against"), g(50, "for"), g(70, "for")] });
    expect(s).toContain("comeback_win");
    expect(s).not.toContain("late_winner");
  });
  test("blown lead", () => {
    expect(resultSituations({ ...base, score: { for: 1, against: 1 }, goals: [g(20, "for"), g(60, "against")] })).toContain("blown_lead");
    expect(resultSituations({ ...base, score: { for: 1, against: 2 }, goals: [g(20, "for"), g(60, "against"), g(80, "against")] })).toContain("blown_lead");
  });
  test("late equalizer and late winner", () => {
    expect(resultSituations({ ...base, score: { for: 1, against: 1 }, goals: [g(30, "against"), g(89, "for")] })).toContain("late_equalizer");
    expect(resultSituations({ ...base, score: { for: 2, against: 1 }, goals: [g(10, "for"), g(40, "against"), g(90, "for")] })).toContain("late_winner");
    expect(resultSituations({ ...base, score: { for: 2, against: 0 }, goals: [g(10, "for"), g(90, "for")] })).not.toContain("late_winner");
  });
  test("shootout", () => {
    const s = resultSituations({ ...base, score: { for: 1, against: 1 }, decider: { penalties: { for: 4, against: 3 } } });
    expect(s).toContain("draw");
    expect(s).toContain("shootout_win");
    expect(resultSituations({ ...base, score: { for: 0, against: 0 }, decider: { penalties: { for: 2, against: 4 } } })).toContain("shootout_loss");
  });
});

describe("buildSeatResults", () => {
  const names = (id: string) => ({ c1: "Vasco", c2: "Bahia", c3: "Grêmio" }[id] ?? id);
  test("one side", () => {
    const events = [
      match({ score: { home: 0, away: 3 }, goals: [
        { playerId: "p2", team: "away", minute: 10, header: false, distance: 10, outsideBox: false },
      ] }),
      { kind: "training", squadId: "c1", effects: [] },
      match({ fixtureId: "f9", home: "c8", away: "c9" }),
    ];
    const r = buildSeatResults({ date: "2027-03-10", events, seats: [{ seatId: "a", clubId: "c1", nickname: "fabio" }], clubName: names });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: "2027-03-10:premier_league:f1:a", seatId: "a", nickname: "fabio", clubName: "Vasco", opponentId: "c2",
      opponentName: "Bahia", home: true, score: { for: 0, against: 3 }, goals: [{ minute: 10, side: "against", scorer: "Costa" }],
    });
    expect(r[0]!.situations).toContain("big_loss");
  });
  test("two seats meeting: one result each", () => {
    const events = [match({ score: { home: 2, away: 1 } })];
    const r = buildSeatResults({
      date: "2027-03-10", events, clubName: names,
      seats: [{ seatId: "a", clubId: "c1", nickname: "a" }, { seatId: "b", clubId: "c2", nickname: "b" }],
    });
    expect(r.map((x) => [x.seatId, x.home, x.score.for, x.score.against])).toEqual([["a", true, 2, 1], ["b", false, 1, 2]]);
  });
  test("penalties from the club's side", () => {
    const events = [match({ score: { home: 1, away: 1 }, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 3, away: 5 } } })];
    const r = buildSeatResults({ date: "2027-03-10", events, seats: [{ seatId: "b", clubId: "c2", nickname: "b" }], clubName: names });
    expect(r[0]!.decider).toEqual({ penalties: { for: 5, against: 3 } });
    expect(r[0]!.situations).toContain("shootout_win");
  });
  test("no events = nothing", () => {
    expect(buildSeatResults({ date: "d", events: undefined, seats: [], clubName: names })).toEqual([]);
  });
});

function result(id: string, date: string, seatId: string, f: number, a: number): SeatResult {
  return {
    id, date, seatId, nickname: seatId, clubId: "c", clubName: "C", opponentId: "o", opponentName: "O", home: true,
    competition: "x", score: { for: f, against: a }, goals: [], situations: [],
  };
}

describe("feed and form", () => {
  test("mergeFeed: newest first, no duplicate id, capped", () => {
    const cur = [result("2:a", "2027-03-02", "a", 1, 0)];
    const merged = mergeFeed(cur, [result("3:a", "2027-03-03", "a", 0, 0), result("2:a", "2027-03-02", "a", 9, 9)], 2);
    expect(merged.map((r) => r.id)).toEqual(["3:a", "2:a"]);
    expect(merged[1]!.score.for).toBe(1);
    expect(mergeFeed(merged, [result("1:a", "2027-03-01", "a", 0, 0)], 2).map((r) => r.id)).toEqual(["3:a", "2:a"]);
  });
  test("formOf: the seat's last five, oldest first", () => {
    const feed = [
      result("6", "2027-03-06", "a", 1, 0), result("5", "2027-03-05", "b", 0, 0), result("4", "2027-03-04", "a", 0, 1),
      result("3", "2027-03-03", "a", 1, 1), result("2", "2027-03-02", "a", 2, 0), result("1", "2027-03-01", "a", 3, 0),
      result("0", "2027-02-28", "a", 0, 2),
    ];
    expect(formOf(feed, "a")).toEqual(["W", "W", "D", "L", "W"]);
    expect(resultLetter(result("x", "d", "a", 1, 1))).toBe("D");
  });
  test("isSeatResult", () => {
    expect(isSeatResult(result("1", "2027-03-01", "a", 1, 0))).toBe(true);
    expect(isSeatResult({ id: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/Domain/rivals/results.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementar**

```ts
// src/Domain/rivals/results.ts
// The human clubs' games of a day and what they say (multiplayer part 6). Pure.
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { ResultSituation, SeatResult, SeatResultGoal } from "@/types/rivalsTypes";

export interface ResultSeat { seatId: string; clubId: string; nickname: string }

type Scored = { home: boolean; score: { for: number; against: number } };

/** "Vasco 0–3 Bahia": the home side first. */
export function scoreLineOf(r: Scored & { clubName: string; opponentName: string }): string {
  return r.home
    ? `${r.clubName} ${r.score.for}–${r.score.against} ${r.opponentName}`
    : `${r.opponentName} ${r.score.against}–${r.score.for} ${r.clubName}`;
}

/** What the game says about the club. Always one of win / draw / loss; the goals' minutes tell the story. */
export function resultSituations(r: Scored & {
  goals: readonly SeatResultGoal[];
  decider?: { penalties: { for: number; against: number } };
}): ResultSituation[] {
  const margin = r.score.for - r.score.against;
  const out: ResultSituation[] = [margin > 0 ? "win" : margin < 0 ? "loss" : "draw"];
  if (margin === 0 && r.decider) {
    out.push(r.decider.penalties.for > r.decider.penalties.against ? "shootout_win" : "shootout_loss");
  }
  if (margin >= RIVALS.BIG_MARGIN) out.push("big_win");
  if (margin <= -RIVALS.BIG_MARGIN) out.push("big_loss");
  if (r.home && margin < 0) out.push("home_loss");
  if (!r.home && margin > 0) out.push("away_win");
  const goals = [...r.goals].sort((a, b) => a.minute - b.minute);
  let diff = 0;
  let wasBehind = false;
  let wasAhead = false;
  let decisive: number | null = null;
  for (const goal of goals) {
    const before = diff;
    diff += goal.side === "for" ? 1 : -1;
    if (diff < 0) wasBehind = true;
    if (diff > 0) wasAhead = true;
    if (before <= 0 && diff > 0) decisive = goal.minute;
  }
  if (margin > 0 && wasBehind) out.push("comeback_win");
  if (margin <= 0 && wasAhead) out.push("blown_lead");
  const last = goals[goals.length - 1];
  if (margin === 0 && last?.side === "for" && last.minute >= RIVALS.LATE_MINUTE) out.push("late_equalizer");
  if (margin > 0 && decisive !== null && decisive >= RIVALS.LATE_MINUTE) out.push("late_winner");
  return out;
}

/** The games of the seats' clubs among the day's events (`MatchEvent`); a game between two seats gives two results. */
export function buildSeatResults(args: {
  date: string;
  events: unknown;
  seats: readonly ResultSeat[];
  clubName: (id: string) => string;
}): SeatResult[] {
  if (!Array.isArray(args.events)) return [];
  const out: SeatResult[] = [];
  for (const e of args.events as { kind?: unknown }[]) {
    if (!e || e.kind !== "match") continue;
    const m = e as MatchEvent;
    for (const seat of args.seats) {
      const home = m.home === seat.clubId;
      if (!home && m.away !== seat.clubId) continue;
      const opponentId = home ? m.away : m.home;
      const score = home ? { for: m.score.home, against: m.score.away } : { for: m.score.away, against: m.score.home };
      const goals: SeatResultGoal[] = (m.goals ?? []).map((goal) => ({
        minute: goal.minute,
        side: (goal.team === "home") === home ? "for" : "against",
        scorer: m.playerNames?.[goal.playerId] ?? "",
      }));
      const pens = m.decider?.penalties;
      const decider = pens
        ? { penalties: home ? { for: pens.home, against: pens.away } : { for: pens.away, against: pens.home } }
        : undefined;
      const base = { home, score, goals, ...(decider ? { decider } : {}) };
      out.push({
        id: `${args.date}:${m.competition}:${m.fixtureId}:${seat.seatId}`,
        date: args.date,
        seatId: seat.seatId,
        nickname: seat.nickname,
        clubId: seat.clubId,
        clubName: args.clubName(seat.clubId),
        opponentId,
        opponentName: args.clubName(opponentId),
        competition: m.competition,
        ...base,
        situations: resultSituations(base),
      });
    }
  }
  return out;
}

export function resultLetter(r: { score: { for: number; against: number } }): "W" | "D" | "L" {
  const margin = r.score.for - r.score.against;
  return margin > 0 ? "W" : margin < 0 ? "L" : "D";
}

/** The seat's last `n` results of the feed (newest first), oldest first for display. */
export function formOf(feed: readonly SeatResult[], seatId: string, n: number = RIVALS.FORM_SIZE): ("W" | "D" | "L")[] {
  return feed.filter((r) => r.seatId === seatId).slice(0, n).map(resultLetter).reverse();
}

/** Adds results to the feed: an id already there is kept as is (a re-run day never duplicates); newest first. */
export function mergeFeed(cur: readonly SeatResult[], fresh: readonly SeatResult[], max: number = RIVALS.FEED_MAX): SeatResult[] {
  const ids = new Set(cur.map((r) => r.id));
  const add = fresh.filter((r) => !ids.has(r.id));
  return [...add, ...cur]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, max);
}

/** Shape check for results coming from the socket. */
export function isSeatResult(v: unknown): v is SeatResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const s = r.score as Record<string, unknown> | undefined;
  return typeof r.id === "string" && typeof r.date === "string" && typeof r.seatId === "string"
    && typeof r.nickname === "string" && typeof r.clubId === "string" && typeof r.clubName === "string"
    && typeof r.opponentName === "string" && typeof r.home === "boolean"
    && !!s && typeof s.for === "number" && typeof s.against === "number"
    && Array.isArray(r.goals) && Array.isArray(r.situations);
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `bun test src/Domain/rivals/results.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/Domain/rivals/results.ts src/Domain/rivals/results.test.ts
git commit -m "feat(rivals): results, situations and form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: catálogo de reações e frases (puro)

**Files:**
- Create: `src/Domain/rivals/taunts.ts`
- Test: `src/Domain/rivals/taunts.test.ts`

- [ ] **Step 1: escrever os testes**

```ts
// src/Domain/rivals/taunts.test.ts
import { describe, expect, test } from "bun:test";
import {
  ALL_TAUNT_IDS, REACTIONS, TAUNT_GROUPS, TAUNTS, isReaction, isTauntFor, liveGroups, parseTauntMeta,
  tauntFallbackBody, tauntMeta, tauntsFor,
} from "@/Domain/rivals/taunts";
import type { LiveScoreView, SeatResult } from "@/types/rivalsTypes";

describe("taunt catalog", () => {
  test("every group has phrases and ids are unique", () => {
    for (const group of TAUNT_GROUPS) expect(TAUNTS[group].length, group).toBeGreaterThanOrEqual(3);
    expect(new Set(ALL_TAUNT_IDS).size).toBe(ALL_TAUNT_IDS.length);
  });
  test("tauntsFor keeps the specific situations first, without duplicates", () => {
    const ids = tauntsFor(["loss", "big_loss", "home_loss"]);
    expect(ids[0]!.startsWith("big_loss_")).toBe(true);
    expect(ids).toContain("loss_1");
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("a phrase only belongs to the target's situations", () => {
    expect(isTauntFor("home_loss_1", ["loss", "home_loss"])).toBe(true);
    expect(isTauntFor("big_win_1", ["loss", "home_loss"])).toBe(false);
    expect(isTauntFor("nope", ["loss"])).toBe(false);
  });
  test("reactions", () => {
    expect(REACTIONS).toEqual(["applause", "fire", "laugh", "sorry"]);
    expect(isReaction("fire")).toBe(true);
    expect(isReaction("heart")).toBe(false);
  });
  test("live groups follow the friend's last goal", () => {
    const live = { lastGoal: null } as unknown as LiveScoreView;
    expect(liveGroups(live)).toEqual([]);
    expect(liveGroups({ ...live, lastGoal: { minute: 10, side: "against", scorer: null } })).toEqual(["live_goal_against"]);
    expect(liveGroups({ ...live, lastGoal: { minute: 10, side: "for", scorer: null } })).toEqual(["live_goal_for"]);
  });
});

describe("taunt meta", () => {
  const result = {
    id: "r", date: "2027-03-10", seatId: "b", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2",
    opponentName: "Bahia", home: true, competition: "x", score: { for: 0, against: 3 }, goals: [], situations: ["loss"],
  } as SeatResult;
  test("from a result; round trip; fallback body", () => {
    const meta = tauntMeta({ kind: "phrase", id: "big_loss_1", from: result });
    expect(meta).toEqual({
      kind: "phrase", id: "big_loss_1", target: "fabio", clubId: "c1", clubName: "Vasco", opponentName: "Bahia",
      home: true, score: { for: 0, against: 3 },
    });
    expect(parseTauntMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
    expect(tauntFallbackBody(meta, "Three on the back.")).toBe("Three on the back. · Vasco 0–3 Bahia");
    expect(tauntFallbackBody({ ...meta, kind: "reaction", id: "laugh" }, null)).toBe("laughs · Vasco 0–3 Bahia");
  });
  test("from a live score carries live and the minute", () => {
    const live = { ...result, status: "live", minute: 67, lastGoal: null, events: 3, updatedAt: 1, fixtureId: "f" } as unknown as LiveScoreView;
    expect(tauntMeta({ kind: "reaction", id: "fire", from: live, live: true })).toMatchObject({ live: true, minute: 67 });
  });
  test("parseTauntMeta refuses junk", () => {
    expect(parseTauntMeta(null)).toBeNull();
    expect(parseTauntMeta({ kind: "phrase", id: "x" })).toBeNull();
    expect(parseTauntMeta({ kind: "shout", id: "x", target: "a", clubId: "c", clubName: "C", opponentName: "O", home: true, score: { for: 1, against: 0 } })).toBeNull();
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/Domain/rivals/taunts.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementar**

```ts
// src/Domain/rivals/taunts.ts
// Reactions and ready phrases (multiplayer part 6). Ids only: the texts live in `rivals.taunts.<id>` (pt-BR, en).
import { scoreLineOf } from "@/Domain/rivals/results";
import type { LiveScoreView, LiveSituation, ReactionId, SeatResult, TauntGroup, TauntKind, TauntMeta } from "@/types/rivalsTypes";

export const REACTIONS: readonly ReactionId[] = ["applause", "fire", "laugh", "sorry"];

/** Specific situations first: the menu shows them before win / draw / loss. */
export const TAUNT_GROUPS: readonly TauntGroup[] = [
  "live_goal_for", "live_goal_against",
  "big_win", "big_loss", "comeback_win", "blown_lead", "late_winner", "late_equalizer",
  "shootout_win", "shootout_loss", "home_loss", "away_win", "win", "draw", "loss",
];

const ids = (group: TauntGroup): string[] => [1, 2, 3, 4].map((n) => `${group}_${n}`);

export const TAUNTS: Record<TauntGroup, readonly string[]> = Object.fromEntries(
  TAUNT_GROUPS.map((g) => [g, ids(g)]),
) as Record<TauntGroup, readonly string[]>;

export const ALL_TAUNT_IDS: readonly string[] = TAUNT_GROUPS.flatMap((g) => TAUNTS[g]);

/** English fallback of a reaction in the stored `body`. */
const REACTION_FALLBACK: Record<ReactionId, string> = {
  applause: "applause", fire: "on fire", laugh: "laughs", sorry: "commiserations",
};

export function isReaction(id: string): id is ReactionId {
  return (REACTIONS as readonly string[]).includes(id);
}

/** Phrase ids for the target's situations, in `TAUNT_GROUPS` order, no duplicates. */
export function tauntsFor(groups: readonly TauntGroup[]): string[] {
  const want = new Set(groups);
  return TAUNT_GROUPS.filter((g) => want.has(g)).flatMap((g) => TAUNTS[g]);
}

export function isTauntFor(id: string, groups: readonly TauntGroup[]): boolean {
  return tauntsFor(groups).includes(id);
}

/** A live game's phrase groups: by the friend's last goal (none before the first goal). */
export function liveGroups(live: Pick<LiveScoreView, "lastGoal">): LiveSituation[] {
  if (!live.lastGoal) return [];
  return [live.lastGoal.side === "for" ? "live_goal_for" : "live_goal_against"];
}

type TauntSource = Pick<SeatResult, "nickname" | "clubId" | "clubName" | "opponentName" | "home" | "score"> & { minute?: number };

/** The meta stored with the chat message: ids and the real score, nothing the client wrote. */
export function tauntMeta(args: { kind: TauntKind; id: string; from: TauntSource; live?: boolean }): TauntMeta {
  const f = args.from;
  return {
    kind: args.kind, id: args.id, target: f.nickname, clubId: f.clubId, clubName: f.clubName,
    opponentName: f.opponentName, home: f.home, score: { for: f.score.for, against: f.score.against },
    ...(args.live ? { live: true as const, minute: f.minute ?? 0 } : {}),
  };
}

/** `taunt` read back from the database or the socket; null when it is not one. */
export function parseTauntMeta(raw: unknown): TauntMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const s = m.score as Record<string, unknown> | undefined;
  if (m.kind !== "reaction" && m.kind !== "phrase") return null;
  if (typeof m.id !== "string" || typeof m.target !== "string" || typeof m.clubId !== "string") return null;
  if (typeof m.clubName !== "string" || typeof m.opponentName !== "string" || typeof m.home !== "boolean") return null;
  if (!s || typeof s.for !== "number" || typeof s.against !== "number") return null;
  if (m.kind === "reaction" ? !isReaction(m.id) : !ALL_TAUNT_IDS.includes(m.id)) return null;
  return {
    kind: m.kind, id: m.id, target: m.target, clubId: m.clubId, clubName: m.clubName, opponentName: m.opponentName,
    home: m.home, score: { for: s.for, against: s.against },
    ...(m.live === true ? { live: true as const, minute: typeof m.minute === "number" ? m.minute : 0 } : {}),
  };
}

/** The stored `body` (English, for a client that does not know taunts). */
export function tauntFallbackBody(meta: TauntMeta, phraseEn: string | null): string {
  const what = meta.kind === "reaction" ? REACTION_FALLBACK[meta.id as ReactionId] : (phraseEn ?? meta.id);
  return `${what} · ${scoreLineOf(meta)}`;
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `bun test src/Domain/rivals/taunts.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/Domain/rivals/taunts.ts src/Domain/rivals/taunts.test.ts
git commit -m "feat(rivals): reactions and phrase catalog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: validação pura do placar ao vivo

**Files:**
- Create: `src/Domain/rivals/liveScore.ts`
- Test: `src/Domain/rivals/liveScore.test.ts`

- [ ] **Step 1: escrever os testes**

```ts
// src/Domain/rivals/liveScore.test.ts
import { describe, expect, test } from "bun:test";
import { applyLiveFrame, isLiveScoreView, liveStatusAt, parseLiveFrame } from "@/Domain/rivals/liveScore";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { LiveBase, LiveScoreFrame } from "@/types/rivalsTypes";

const BASE: LiveBase = {
  seatId: "a", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia",
  home: true, fixtureId: "f1", date: "2027-03-10",
};
const frame = (over: Partial<LiveScoreFrame>): LiveScoreFrame => ({
  saveId: "s1", fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 }, ...over,
});
const SCORERS = new Set(["Silva"]);

describe("parseLiveFrame", () => {
  test("a good frame", () => {
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: " Silva " }))
      .toEqual({ saveId: "s1", fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" });
  });
  test("refuses bad frames", () => {
    const ok = { saveId: "s1", fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 } };
    expect(parseLiveFrame({ ...ok, phase: "corner" })).toBeNull();
    expect(parseLiveFrame({ ...ok, minute: 131 })).toBeNull();
    expect(parseLiveFrame({ ...ok, minute: 1.5 })).toBeNull();
    expect(parseLiveFrame({ ...ok, score: { for: -1, against: 0 } })).toBeNull();
    expect(parseLiveFrame({ ...ok, saveId: "a b" })).toBeNull();
    expect(parseLiveFrame({ ...ok, fixtureId: "" })).toBeNull();
  });
});

describe("applyLiveFrame", () => {
  test("start, goal with a known scorer, half, end", () => {
    const s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    expect(s).toMatchObject({ status: "live", minute: 0, score: { for: 0, against: 0 }, events: 1, lastGoal: null });
    const g = applyLiveFrame(s, frame({ phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" }), BASE, SCORERS, 2)!;
    expect(g.lastGoal).toEqual({ minute: 12, side: "for", scorer: "Silva" });
    const g2 = applyLiveFrame(g, frame({ phase: "goal", minute: 30, score: { for: 1, against: 1 }, scorer: "Hacker <b>" }), BASE, SCORERS, 3)!;
    expect(g2.lastGoal).toEqual({ minute: 30, side: "against", scorer: null });
    const h = applyLiveFrame(g2, frame({ phase: "half", minute: 45, score: { for: 1, against: 1 } }), BASE, SCORERS, 4)!;
    expect(h.status).toBe("half");
    const e = applyLiveFrame(h, frame({ phase: "end", minute: 94, score: { for: 1, against: 1 } }), BASE, SCORERS, 5)!;
    expect(e).toMatchObject({ status: "ended", events: 5, updatedAt: 5 });
    expect(applyLiveFrame(e, frame({ phase: "goal", minute: 95, score: { for: 2, against: 1 } }), BASE, SCORERS, 6)).toBeNull();
  });
  test("the score never goes down and a goal must add one", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 5, score: { for: 1, against: 0 } }), BASE, SCORERS, 1)!;
    expect(applyLiveFrame(s, frame({ phase: "goal", minute: 6, score: { for: 0, against: 1 } }), BASE, SCORERS, 2)).toBeNull();
    expect(applyLiveFrame(s, frame({ phase: "goal", minute: 6, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
    expect(applyLiveFrame(s, frame({ phase: "half", minute: 45, score: { for: 2, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
  });
  test("the minute never goes back", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 40, score: { for: 1, against: 0 } }), BASE, SCORERS, 1)!;
    expect(applyLiveFrame(s, frame({ phase: "half", minute: 30, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
  });
  test("another fixture starts over", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 40, score: { for: 3, against: 0 } }), BASE, SCORERS, 1)!;
    const other = applyLiveFrame(s, frame({ fixtureId: "f2" }), { ...BASE, fixtureId: "f2" }, SCORERS, 2)!;
    expect(other).toMatchObject({ fixtureId: "f2", score: { for: 0, against: 0 }, events: 1 });
  });
  test("at most LIVE_MAX_EVENTS events", () => {
    let s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    for (let i = 1; i < RIVALS.LIVE_MAX_EVENTS; i++) s = applyLiveFrame(s, frame({ phase: "start", minute: 0 }), BASE, SCORERS, 1)!;
    expect(s.events).toBe(RIVALS.LIVE_MAX_EVENTS);
    expect(applyLiveFrame(s, frame({}), BASE, SCORERS, 1)).toBeNull();
  });
});

describe("liveStatusAt", () => {
  const live = applyLiveFrame(null, frame({}), BASE, SCORERS, 0)!;
  test("stale, then gone", () => {
    expect(liveStatusAt(live, RIVALS.LIVE_STALE_MS - 1)).toBe("live");
    expect(liveStatusAt(live, RIVALS.LIVE_STALE_MS + 1)).toBe("stale");
    expect(liveStatusAt(live, RIVALS.LIVE_DROP_MS + 1)).toBe("gone");
  });
  test("an ended game stays 10 minutes", () => {
    const ended = { ...live, status: "ended" as const };
    expect(liveStatusAt(ended, RIVALS.LIVE_ENDED_KEEP_MS - 1)).toBe("ended");
    expect(liveStatusAt(ended, RIVALS.LIVE_ENDED_KEEP_MS + 1)).toBe("gone");
  });
  test("isLiveScoreView", () => {
    expect(isLiveScoreView(live)).toBe(true);
    expect(isLiveScoreView({ seatId: "a" })).toBe(false);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/Domain/rivals/liveScore.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementar**

```ts
// src/Domain/rivals/liveScore.ts
// A friend's live score (multiplayer part 6): checked for coherence only, the official result is the day's. Pure.
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { LiveBase, LivePhase, LiveScoreFrame, LiveScoreView, LiveStatus } from "@/types/rivalsTypes";

const PHASES: ReadonlySet<string> = new Set<LivePhase>(["start", "goal", "half", "end"]);
const SAVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Trimmed, no control characters, at most `RIVALS.SCORER_MAX`; null when empty or not a string. */
function cleanScorer(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return s.length > 0 && s.length <= RIVALS.SCORER_MAX ? s : null;
}

/** The frame of a `live_score` socket event, or null (ignored in silence). */
export function parseLiveFrame(e: Record<string, unknown>): LiveScoreFrame | null {
  if (typeof e.saveId !== "string" || !SAVE_ID_RE.test(e.saveId)) return null;
  if (typeof e.fixtureId !== "string" || e.fixtureId.length === 0 || e.fixtureId.length > RIVALS.FIXTURE_ID_MAX) return null;
  if (typeof e.phase !== "string" || !PHASES.has(e.phase)) return null;
  if (!isInt(e.minute, 0, RIVALS.LIVE_MAX_MINUTE)) return null;
  const s = e.score as Record<string, unknown> | null | undefined;
  if (!s || typeof s !== "object") return null;
  if (!isInt(s.for, 0, RIVALS.LIVE_MAX_GOALS) || !isInt(s.against, 0, RIVALS.LIVE_MAX_GOALS)) return null;
  const scorer = cleanScorer(e.scorer);
  return {
    saveId: e.saveId, fixtureId: e.fixtureId, phase: e.phase as LivePhase, minute: e.minute,
    score: { for: s.for, against: s.against }, ...(scorer ? { scorer } : {}),
  };
}

/**
 * The next state of a live game, or null when the frame does not fit: the score only grows (a goal adds, nothing else
 * changes it), the minute never goes back, a finished game takes nothing more, at most `LIVE_MAX_EVENTS` events.
 * Another fixture starts over. The scorer stays only when he is one of `scorers` (no free text).
 */
export function applyLiveFrame(
  prevIn: LiveScoreView | null, frame: LiveScoreFrame, base: LiveBase, scorers: ReadonlySet<string>, now: number,
): LiveScoreView | null {
  const prev = prevIn && prevIn.fixtureId === frame.fixtureId ? prevIn : null;
  if (prev) {
    if (prev.status === "ended") return null;
    if (prev.events >= RIVALS.LIVE_MAX_EVENTS) return null;
    if (frame.score.for < prev.score.for || frame.score.against < prev.score.against) return null;
    if (frame.minute < prev.minute) return null;
  }
  const before = prev?.score ?? { for: 0, against: 0 };
  const added = frame.score.for + frame.score.against - (before.for + before.against);
  if (frame.phase === "goal" ? added < 1 : prev !== null && added !== 0) return null;
  const lastGoal = frame.phase === "goal"
    ? {
      minute: frame.minute,
      side: frame.score.for > before.for ? ("for" as const) : ("against" as const),
      scorer: frame.scorer && scorers.has(frame.scorer) ? frame.scorer : null,
    }
    : prev?.lastGoal ?? null;
  const status: LiveStatus = frame.phase === "end" ? "ended" : frame.phase === "half" ? "half" : "live";
  return {
    ...base,
    status,
    minute: frame.minute,
    score: { for: frame.score.for, against: frame.score.against },
    lastGoal,
    events: (prev?.events ?? 0) + 1,
    updatedAt: now,
  };
}

/** What a stored live game shows now: "stale" after `LIVE_STALE_MS` quiet, "gone" after `LIVE_DROP_MS` (ended: 10 min). */
export function liveStatusAt(view: LiveScoreView, now: number): LiveStatus | "gone" {
  const quiet = now - view.updatedAt;
  if (view.status === "ended") return quiet > RIVALS.LIVE_ENDED_KEEP_MS ? "gone" : "ended";
  if (quiet > RIVALS.LIVE_DROP_MS) return "gone";
  if (quiet > RIVALS.LIVE_STALE_MS) return "stale";
  return view.status;
}

/** Shape check for a live score from the socket or the API. */
export function isLiveScoreView(v: unknown): v is LiveScoreView {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  const s = l.score as Record<string, unknown> | undefined;
  return typeof l.seatId === "string" && typeof l.nickname === "string" && typeof l.clubId === "string"
    && typeof l.clubName === "string" && typeof l.opponentName === "string" && typeof l.home === "boolean"
    && typeof l.status === "string" && typeof l.minute === "number"
    && !!s && typeof s.for === "number" && typeof s.against === "number";
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `bun test src/Domain/rivals/liveScore.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/Domain/rivals/liveScore.ts src/Domain/rivals/liveScore.test.ts
git commit -m "feat(rivals): live score validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: feed no disco, resultados do dia no executor e `world_results`

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts`, `src/backend/dal/FileSystemDAL.ts`, `src/backend/dal/BufferingSaveDAL.ts`, `src/backend/SaveService.ts`
- Create: `src/backend/rivals/rivalsWorld.ts`
- Test: `src/backend/dal/rivalsFeed.dal.test.ts`, `src/backend/rivals/rivalsWorld.test.ts`
- Modify: `src/backend/groupAdvance.ts`
- Test: `src/backend/groupAdvance.rivals.test.ts`

- [ ] **Step 1: teste do DAL**

```ts
// src/backend/dal/rivalsFeed.dal.test.ts
import { describe, expect, test } from "bun:test";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatResult } from "@/types/rivalsTypes";

const r: SeatResult = {
  id: "2027-03-10:x:f1:a", date: "2027-03-10", seatId: "a", nickname: "a", clubId: "c1", clubName: "C1",
  opponentId: "c2", opponentName: "C2", home: true, competition: "x", score: { for: 1, against: 0 }, goals: [], situations: ["win"],
};

describe("rivals feed file", () => {
  test("absent = empty; write then read; buffered until flush", async () => {
    const fs = new FileSystemDAL();
    const id = `test-rivals-${crypto.randomUUID()}`;
    expect(await fs.readRivalsFeed(id)).toEqual([]);
    const buf = new BufferingSaveDAL(fs);
    await buf.writeRivalsFeed(id, [r]);
    expect(await buf.readRivalsFeed(id)).toEqual([r]);
    expect(await fs.readRivalsFeed(id)).toEqual([]);
    await buf.flush();
    expect(await fs.readRivalsFeed(id)).toEqual([r]);
    await fs.deleteSave(id);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/backend/dal/rivalsFeed.dal.test.ts`
Expected: FAIL (`readRivalsFeed is not a function`).

- [ ] **Step 3: DAL e SaveService**

`src/backend/dal/ISaveDAL.ts` — import `import type { SeatResult } from "@/types/rivalsTypes";` e, logo depois de
`writeSeatSeasons(...)`:

```ts
  // Rivals feed (multiplayer part 6): the human clubs' results, newest first.
  readRivalsFeed(saveId: string): Promise<SeatResult[]>;
  writeRivalsFeed(saveId: string, results: SeatResult[]): Promise<void>;
```

`src/backend/dal/FileSystemDAL.ts` — import do tipo; ao lado de `seatSeasonsPath`:

```ts
function rivalsFeedPath(saveId: string) { return `${SAVES_DIR}/${saveId}/rivalsFeed.json`; }
```

e depois de `writeSeatSeasons`:

```ts
  async readRivalsFeed(saveId: string): Promise<SeatResult[]> {
    const file = Bun.file(rivalsFeedPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<SeatResult[]>;
  }

  async writeRivalsFeed(saveId: string, results: SeatResult[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(rivalsFeedPath(saveId), JSON.stringify(results));
    bumpSaveDataVersion(saveId);
  }
```

`src/backend/dal/BufferingSaveDAL.ts` — import do tipo; depois de `writeSeatSeasons`:

```ts
  readRivalsFeed(saveId: string): Promise<SeatResult[]> {
    return this.readThrough(`rivalsFeed:${saveId}`, () => this.inner.readRivalsFeed(saveId));
  }
  async writeRivalsFeed(saveId: string, results: SeatResult[]): Promise<void> {
    this.buffer(`rivalsFeed:${saveId}`, results, () => this.inner.writeRivalsFeed(saveId, results));
  }
```

`src/backend/SaveService.ts` — import do tipo; depois de `writeSeatSeasons`:

```ts
  getRivalsFeed(saveId: string): Promise<SeatResult[]> {
    return this.dal.readRivalsFeed(saveId);
  }

  writeRivalsFeed(saveId: string, results: SeatResult[]): Promise<void> {
    return this.dal.writeRivalsFeed(saveId, results);
  }
```

Run: `bun test src/backend/dal/rivalsFeed.dal.test.ts` → PASS. Se o typecheck acusar outra classe que implementa
`ISaveDAL` (`grep -rn "implements ISaveDAL" src scripts`), acrescente os dois métodos nela do mesmo jeito.

- [ ] **Step 4: teste do `rivalsWorld`**

```ts
// src/backend/rivals/rivalsWorld.test.ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { appendRivalsFeed, recordDayResults } from "@/backend/rivals/rivalsWorld";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); }
});

const day = [{ kind: "match", fixtureId: "f1", competition: "premier_league", round: 1, home: "club-a", away: "club-b",
  score: { home: 2, away: 0 }, playerNames: {}, goals: [] }];

describe("rivals world", () => {
  test("records the human clubs' games once, with the nicknames", async () => {
    const id = await fakeWorld({ seatIds: ["a", "b", "c"], date: "2027-03-10", seats: { c: { unemployed: true } } });
    created.push(id);
    const ua = makeUser(uniqueNick());
    addSaveMember(id, ua.id, "a", "owner");
    const seats = (await saveService.listSeats(id)).map(({ seatId, seat }) => ({ seatId, seat }));
    const first = await recordDayResults(saveService, id, "2027-03-10", day, seats);
    expect(first.map((r) => [r.seatId, r.nickname, r.score.for])).toEqual([["a", ua.nickname, 2], ["b", "Manager b", 0]]);
    const again = await recordDayResults(saveService, id, "2027-03-10", day, seats);
    expect(again).toHaveLength(2);
    expect(await saveService.getRivalsFeed(id)).toHaveLength(2);
  });

  test("appendRivalsFeed with nothing writes nothing", async () => {
    const id = await fakeWorld({ seatIds: ["a"], date: "2027-03-10" });
    created.push(id);
    await appendRivalsFeed(saveService, id, []);
    expect(await saveService.getRivalsFeed(id)).toEqual([]);
  });
});
```

- [ ] **Step 5: rodar e ver falhar**

Run: `bun test src/backend/rivals/rivalsWorld.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 6: implementar `rivalsWorld.ts`**

```ts
// src/backend/rivals/rivalsWorld.ts
// The rivals feed I/O (multiplayer part 6): the day's human games into `rivalsFeed.json`. Pure rules: `@/Domain/rivals`.
import type { SaveService } from "@/backend/SaveService";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { buildSeatResults, mergeFeed, type ResultSeat } from "@/Domain/rivals/results";
import type { SeatResult } from "@/types/rivalsTypes";
import type { SeatState } from "@/types/seatTypes";

/** Adds results to the feed (idempotent by id, newest first, capped). */
export async function appendRivalsFeed(service: SaveService, saveId: string, results: readonly SeatResult[]): Promise<void> {
  if (results.length === 0) return;
  const cur = await service.getRivalsFeed(saveId);
  const next = mergeFeed(cur, results);
  if (next.length === cur.length && next.every((r, i) => r.id === cur[i]!.id)) return;
  await service.writeRivalsFeed(saveId, next);
}

/**
 * The human clubs' games among the day's events (`outcome.payload.events`), written to the feed. Returns them all
 * (also the ones a re-run day already had), for `world_results`. The seats are the ones before the day ran.
 */
export async function recordDayResults(
  service: SaveService, saveId: string, date: string, events: unknown, seats: readonly { seatId: string; seat: SeatState }[],
): Promise<SeatResult[]> {
  const members = listSaveMembers(saveId);
  const resultSeats: ResultSeat[] = seats
    .filter(({ seat }) => !!seat.clubId && !seat.unemployed)
    .map(({ seatId, seat }) => {
      const m = members.find((x) => x.seatId === seatId);
      const nickname = (m ? getSocialUser(m.userId)?.nickname : null) ?? seat.manager?.name ?? "?";
      return { seatId, clubId: seat.clubId, nickname };
    });
  if (resultSeats.length === 0) return [];
  const index = await service.getSquadIndex(saveId);
  const seatName = new Map(seats.map(({ seat }) => [seat.clubId, seat.clubName]));
  const results = buildSeatResults({
    date, events, seats: resultSeats, clubName: (id) => index.byId(id)?.name ?? seatName.get(id) ?? id,
  });
  await appendRivalsFeed(service, saveId, results);
  return results;
}
```

Run: `bun test src/backend/rivals/rivalsWorld.test.ts` → PASS.

- [ ] **Step 7: teste do executor**

```ts
// src/backend/groupAdvance.rivals.test.ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { kickWorld, waitWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { addDays } from "@/Domain/dates";
import type { ServerEvent } from "@/types/socialTypes";

const D = "2027-03-10";
const created: string[] = [];
afterAll(async () => {
  for (const id of created) { await waitWorld(id); deleteSaveMembers(id); await saveService.deleteSave(id); }
}, 60_000);

describe("group advance: rivals results", () => {
  test("after a day every member gets world_results and the feed has the games", async () => {
    const id = await fakeWorld({ seatIds: ["a", "b"], date: D, seats: { a: { readyUntil: "2027-03-11" }, b: { readyUntil: "2027-03-11" } } });
    created.push(id);
    const ua = makeUser(uniqueNick());
    const ub = makeUser(uniqueNick());
    addSaveMember(id, ua.id, "a", "owner");
    addSaveMember(id, ub.id, "b", "member");
    const events: { userId: string; event: ServerEvent }[] = [];
    const deps: GroupAdvanceDeps = {
      service: saveService,
      now: () => Date.now(),
      notify: (userId, event) => events.push({ userId, event }),
      matchDates: async () => [],
      matchOn: async () => null,
      runDay: async (saveId) => {
        const date = (await saveService.getMeta(saveId))!.currentDate!;
        await saveService.updateMeta(saveId, { currentDate: addDays(date, 1) });
        return {
          ok: true, seats: {},
          payload: {
            newDate: addDays(date, 1),
            events: [{ kind: "match", fixtureId: "f1", competition: "premier_league", round: 1, home: "club-a", away: "club-b",
              score: { home: 0, away: 3 }, playerNames: {}, goals: [] }],
          },
        };
      },
    };
    await kickWorld(id, deps);
    const results = events.filter((e) => e.event.type === "world_results");
    expect(new Set(results.map((e) => e.userId))).toEqual(new Set([ua.id, ub.id]));
    const ev = results[0]!.event as Extract<ServerEvent, { type: "world_results" }>;
    expect(ev.results.map((r) => [r.seatId, r.score.for, r.score.against])).toEqual([["a", 0, 3], ["b", 3, 0]]);
    expect((await saveService.getRivalsFeed(id)).map((r) => r.seatId).sort()).toEqual(["a", "b"]);
  });
});
```

Run: `bun test src/backend/groupAdvance.rivals.test.ts` → FAIL (nenhum `world_results`).

- [ ] **Step 8: integrar no executor**

Em `src/backend/groupAdvance.ts`:

1. Imports novos:

```ts
import { recordDayResults } from "@/backend/rivals/rivalsWorld";
import type { SeatResult } from "@/types/rivalsTypes";
```

2. O tipo `Step` passa a ser:

```ts
type Step =
  | { kind: "ran" | "stopped" | "idle"; date: string | null; target: string | null; waitingFor: string[]; results?: SeatResult[] }
  | { kind: "error"; date: string | null; target: string | null; waitingFor: string[]; error: string };
```

3. Em `stepWorld`, troque o final (as duas últimas linhas antes do `}` da função):

```ts
  await updateAdvance(service, saveId, noError(world.advance));
  return { kind: "ran", date: newDate, target: plan.target, waitingFor: [] };
```

por:

```ts
  // Rivals (part 6): the human clubs' games of the day go to the feed; the members get them after the step.
  const results = await recordDayResults(service, saveId, currentDate, outcome.payload.events, seats);
  await updateAdvance(service, saveId, noError(world.advance));
  return { kind: "ran", date: newDate, target: plan.target, waitingFor: [], results };
```

4. Depois de `broadcast(...)`, acrescente:

```ts
/** `world_results` to every member (each sees all results, the screens filter their own). */
function broadcastResults(saveId: string, deps: GroupAdvanceDeps, results: readonly SeatResult[]): void {
  if (results.length === 0) return;
  for (const m of listSaveMembers(saveId)) deps.notify(m.userId, { type: "world_results", saveId, results: [...results] });
}
```

5. Em `advanceGroup`, dentro do `while`, depois de
`await broadcast(saveId, deps, { date: step.date, target: step.target, running: true, waitingFor: [] });`:

```ts
    broadcastResults(saveId, deps, step.results ?? []);
```

Run: `bun test src/backend/groupAdvance.rivals.test.ts src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/groupAdvance.live.test.ts`
Expected: PASS (os testes antigos usam `payload` sem `events`: `recordDayResults` devolve `[]`).

- [ ] **Step 9: commit**

```bash
git add src/backend/dal/ISaveDAL.ts src/backend/dal/FileSystemDAL.ts src/backend/dal/BufferingSaveDAL.ts src/backend/SaveService.ts src/backend/dal/rivalsFeed.dal.test.ts src/backend/rivals/rivalsWorld.ts src/backend/rivals/rivalsWorld.test.ts src/backend/groupAdvance.ts src/backend/groupAdvance.rivals.test.ts
git commit -m "feat(rivals): day results feed and world_results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: placar ao vivo no servidor (`live_score`, `friend_live`)

**Files:**
- Create: `src/backend/rivals/liveScores.ts`
- Test: `src/backend/rivals/liveScores.test.ts`
- Modify: `src/backend/social/realtime.ts`, `src/backend/social/maintenance.ts`, `src/backend/groupAdvance.ts`
- Test: `src/backend/social/realtime.live.test.ts`

- [ ] **Step 1: testes do estado**

```ts
// src/backend/rivals/liveScores.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import {
  acceptLiveScore, clearLiveForDay, liveScoresOf, resetLiveScores, setLiveResolver, sweepLiveScores,
} from "@/backend/rivals/liveScores";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { ServerEvent } from "@/types/socialTypes";

const saveId = randomUUID();
const a = makeUser(uniqueNick());
const b = makeUser(uniqueNick());
addSaveMember(saveId, a.id, "a", "owner");
addSaveMember(saveId, b.id, "b", "member");

function setup() {
  const sent: { userId: string; event: ServerEvent }[] = [];
  const notify = (userId: string, event: ServerEvent) => sent.push({ userId, event });
  setLiveResolver(async (sid, userId, fixtureId) => (sid === saveId && userId === a.id && fixtureId === "f1"
    ? {
      base: { seatId: "a", nickname: a.nickname!, clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia",
        home: true, fixtureId: "f1", date: "2027-03-10" },
      scorers: ["Silva"],
    }
    : null));
  return { sent, notify };
}

afterEach(() => resetLiveScores());

describe("live scores", () => {
  test("a member's frame goes to the other members, with goal on a goal", async () => {
    const { sent, notify } = setup();
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(true);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" }, notify, 2)).toBe(true);
    expect(sent.every((s) => s.userId === b.id)).toBe(true);
    const last = sent.at(-1)!.event as Extract<ServerEvent, { type: "friend_live" }>;
    expect(last).toMatchObject({ type: "friend_live", saveId, seatId: "a", goal: true });
    expect(last.live?.lastGoal).toEqual({ minute: 12, side: "for", scorer: "Silva" });
    expect(liveScoresOf(saveId, 3).map((l) => l.score.for)).toEqual([1]);
  });

  test("a stranger, another fixture or a falling score are ignored", async () => {
    const { sent, notify } = setup();
    expect(await acceptLiveScore(b.id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(false);
    expect(await acceptLiveScore(makeUser().id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(false);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "zz", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 1)).toBe(false);
    await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "goal", minute: 5, score: { for: 1, against: 0 } }, notify, 1);
    expect(await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "half", minute: 45, score: { for: 0, against: 0 } }, notify, 2)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  test("the day running clears the game; the sweep marks stale then drops", async () => {
    const { sent, notify } = setup();
    await acceptLiveScore(a.id, { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, notify, 0);
    sweepLiveScores(RIVALS.LIVE_STALE_MS + 1, notify);
    expect(liveScoresOf(saveId, RIVALS.LIVE_STALE_MS + 1)[0]!.status).toBe("stale");
    clearLiveForDay(saveId, "2027-03-10", notify);
    expect(liveScoresOf(saveId, RIVALS.LIVE_STALE_MS + 2)).toEqual([]);
    expect(sent.at(-1)!.event).toEqual({ type: "friend_live", saveId, seatId: "a", live: null });
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `bun test src/backend/rivals/liveScores.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementar `liveScores.ts`**

```ts
// src/backend/rivals/liveScores.ts
// A friend's live score (multiplayer part 6): in memory, per world and seat. The browser of who plays sends it
// (`live_score` on `/api/ws`); the other members get `friend_live`. Provisional: the official result is the day's.
import { saveService } from "@/backend/SaveService";
import { listSaveMembers, memberOf } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { applyLiveFrame, liveStatusAt } from "@/Domain/rivals/liveScore";
import type { LiveBase, LiveScoreFrame, LiveScoreView } from "@/types/rivalsTypes";
import type { ServerEvent } from "@/types/socialTypes";

export type LiveNotify = (userId: string, event: ServerEvent) => void;

/** Who plays which game: null when the user is not a member, or the fixture is not his club's game of today. */
export type LiveResolver = (saveId: string, userId: string, fixtureId: string) => Promise<{ base: LiveBase; scorers: string[] } | null>;

interface Entry { view: LiveScoreView; scorers: Set<string> }

const worlds = new Map<string, Map<string, Entry>>();

const defaultResolver: LiveResolver = async (saveId, userId, fixtureId) => {
  const member = memberOf(saveId, userId);
  if (!member) return null;
  const meta = await saveService.getMeta(saveId);
  if (meta?.mode !== "multi" || meta.world?.phase !== "running" || !meta.currentDate) return null;
  const seat = await saveService.getSeat(saveId, member.seatId);
  if (!seat?.clubId || seat.unemployed) return null;
  const fixture = (await saveService.getFixturesForDate(saveId, meta.currentDate))
    .find((f) => f.id === fixtureId && !f.played && (f.home === seat.clubId || f.away === seat.clubId));
  if (!fixture) return null;
  const home = fixture.home === seat.clubId;
  const opponentId = home ? fixture.away : fixture.home;
  const [mine, opp] = await Promise.all([saveService.getSquadById(saveId, seat.clubId), saveService.getSquadById(saveId, opponentId)]);
  return {
    base: {
      seatId: member.seatId,
      nickname: getSocialUser(userId)?.nickname ?? seat.manager?.name ?? "?",
      clubId: seat.clubId, clubName: seat.clubName, opponentId, opponentName: opp?.name ?? opponentId,
      home, fixtureId, date: meta.currentDate,
    },
    scorers: [...(mine?.players ?? []), ...(opp?.players ?? [])].map((p) => p.name),
  };
};

let resolver: LiveResolver = defaultResolver;

/** Tests only. `null` restores the real resolver. */
export function setLiveResolver(fn: LiveResolver | null): void {
  resolver = fn ?? defaultResolver;
}

/** Tests only. */
export function resetLiveScores(): void {
  worlds.clear();
  resolver = defaultResolver;
}

function tellOthers(saveId: string, seatId: string, live: LiveScoreView | null, notify: LiveNotify, except?: string, goal?: boolean): void {
  for (const m of listSaveMembers(saveId)) {
    if (m.userId === except || m.seatId === seatId) continue;
    notify(m.userId, { type: "friend_live", saveId, seatId, live, ...(goal ? { goal: true as const } : {}) });
  }
}

/**
 * One `live_score` frame of `userId`. True when it was taken (and repeated to the other members); false, in
 * silence, for a stranger, someone else's game, or an incoherent frame.
 */
export async function acceptLiveScore(userId: string, frame: LiveScoreFrame, notify: LiveNotify, now = Date.now()): Promise<boolean> {
  const member = memberOf(frame.saveId, userId);
  if (!member) return false;
  const seats = worlds.get(frame.saveId) ?? new Map<string, Entry>();
  const cur = seats.get(member.seatId);
  const fresh = cur && liveStatusAt(cur.view, now) !== "gone" && cur.view.fixtureId === frame.fixtureId ? cur : null;
  let base: LiveBase;
  let scorers: Set<string>;
  if (fresh && frame.phase !== "start") {
    base = fresh.view;
    scorers = fresh.scorers;
  } else {
    const ctx = await resolver(frame.saveId, userId, frame.fixtureId);
    if (!ctx || ctx.base.seatId !== member.seatId) return false;
    base = ctx.base;
    scorers = new Set(ctx.scorers);
  }
  const next = applyLiveFrame(fresh?.view ?? null, frame, base, scorers, now);
  if (!next) return false;
  seats.set(member.seatId, { view: next, scorers });
  worlds.set(frame.saveId, seats);
  tellOthers(frame.saveId, member.seatId, next, notify, userId, frame.phase === "goal");
  return true;
}

/** The world's live games now (stale ones marked, gone ones left out). */
export function liveScoresOf(saveId: string, now = Date.now()): LiveScoreView[] {
  const out: LiveScoreView[] = [];
  for (const { view } of worlds.get(saveId)?.values() ?? []) {
    const status = liveStatusAt(view, now);
    if (status !== "gone") out.push({ ...view, status });
  }
  return out;
}

/** Every 30 s (with the presence sweep): a quiet game turns stale, then goes; the members are told. */
export function sweepLiveScores(now: number, notify: LiveNotify): void {
  for (const [saveId, seats] of worlds) {
    for (const [seatId, entry] of seats) {
      const status = liveStatusAt(entry.view, now);
      if (status === "gone") {
        seats.delete(seatId);
        tellOthers(saveId, seatId, null, notify);
      } else if (status === "stale" && entry.view.status !== "stale") {
        entry.view = { ...entry.view, status: "stale" };
        tellOthers(saveId, seatId, entry.view, notify);
      }
    }
    if (seats.size === 0) worlds.delete(saveId);
  }
}

/** The day `date` ran (group advance): its live games are official now and leave. */
export function clearLiveForDay(saveId: string, date: string, notify: LiveNotify): void {
  const seats = worlds.get(saveId);
  if (!seats) return;
  for (const [seatId, entry] of seats) {
    if (entry.view.date > date) continue;
    seats.delete(seatId);
    tellOthers(saveId, seatId, null, notify);
  }
  if (seats.size === 0) worlds.delete(saveId);
}
```

Observação: o teste final chama `clearLiveForDay` e espera `friend_live` com `live: null` para o membro `b`: o
`tellOthers` sem `except` pula só o próprio assento (`m.seatId === seatId`), então `b` recebe e `a` não.

Run: `bun test src/backend/rivals/liveScores.test.ts` → PASS.

- [ ] **Step 4: teste do socket**

```ts
// src/backend/social/realtime.live.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { handleClientEvent, onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { liveScoresOf, resetLiveScores, setLiveResolver } from "@/backend/rivals/liveScores";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[] };
function fakeSocket(userId: string): FakeSocket {
  const events: ServerEvent[] = [];
  return {
    data: { userId, session: "s", saveId: null, clubName: null }, events,
    send(m: string) { events.push(JSON.parse(m) as ServerEvent); }, close() {},
  };
}

afterEach(() => { resetRealtime(); resetLiveScores(); });

describe("live_score on the socket", () => {
  test("relayed as friend_live; junk and floods are ignored", async () => {
    const saveId = randomUUID();
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    addSaveMember(saveId, a.id, "a", "owner");
    addSaveMember(saveId, b.id, "b", "member");
    setLiveResolver(async () => ({
      base: { seatId: "a", nickname: a.nickname!, clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia",
        home: true, fixtureId: "f1", date: "2027-03-10" },
      scorers: [],
    }));
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    onSocketOpen(wa);
    onSocketOpen(wb);
    await handleClientEvent(wa, JSON.stringify({ type: "live_score", saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }));
    expect(wb.events.at(-1)).toMatchObject({ type: "friend_live", saveId, seatId: "a" });
    expect(wa.events).toEqual([]);
    await handleClientEvent(wa, JSON.stringify({ type: "live_score", saveId, fixtureId: "f1", phase: "goal", minute: 999, score: { for: 1, against: 0 } }));
    await handleClientEvent(wa, "{not json");
    expect(wb.events).toHaveLength(1);
    for (let i = 0; i < RIVALS.LIVE_PER_MINUTE + 5; i++) {
      await handleClientEvent(wa, JSON.stringify({ type: "live_score", saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }));
    }
    expect(liveScoresOf(saveId)[0]!.events).toBeLessThanOrEqual(RIVALS.LIVE_PER_MINUTE);
  });
});
```

Run: `bun test src/backend/social/realtime.live.test.ts` → FAIL.

- [ ] **Step 5: `live_score` no socket**

Em `src/backend/social/realtime.ts`:

1. Imports:

```ts
import { acceptLiveScore } from "@/backend/rivals/liveScores";
import { parseLiveFrame } from "@/Domain/rivals/liveScore";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
```

2. `SocketLimits` ganha `live: number[];` e a criação passa a `l = { hello: [], ping: [], live: [], typing: new Map() };`.
3. Em `withinLimits`, troque

```ts
  const max = event.type === "hello" ? HELLO_PER_MINUTE : PING_PER_MINUTE;
  const recent = l[event.type].filter((t) => now - t < MINUTE_MS);
  if (recent.length >= max) {
    l[event.type] = recent;
    return false;
  }
  recent.push(now);
  l[event.type] = recent;
  return true;
```

por

```ts
  const key = event.type === "live_score" ? "live" : event.type;
  const max = key === "hello" ? HELLO_PER_MINUTE : key === "live" ? RIVALS.LIVE_PER_MINUTE : PING_PER_MINUTE;
  const recent = l[key].filter((t) => now - t < MINUTE_MS);
  if (recent.length >= max) {
    l[key] = recent;
    return false;
  }
  recent.push(now);
  l[key] = recent;
  return true;
```

4. Em `parseClientEvent`, antes do `return null;` final:

```ts
  if (e.type === "live_score") {
    const frame = parseLiveFrame(e);
    return frame ? { type: "live_score", ...frame } : null;
  }
```

5. Em `handleClientEvent`, logo depois do bloco do `typing` (`relayTyping(...); return; }`):

```ts
  if (event.type === "live_score") {
    // Rivals (part 6): a friend's live score. Never a pong, never presence; a refused frame is silent.
    const { type: _type, ...frame } = event;
    await acceptLiveScore(userId, frame, notifyUser);
    return;
  }
```

6. `src/backend/social/maintenance.ts`: troque `import { sweepStatuses } from "@/backend/social/realtime";` por
   `import { notifyUser, sweepStatuses } from "@/backend/social/realtime";`, acrescente
   `import { sweepLiveScores } from "@/backend/rivals/liveScores";` e troque o `sweepTimer` por

```ts
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    sweepStatuses(now);
    sweepLiveScores(now, notifyUser);
  }, SWEEP_EVERY_MS);
```


- [ ] **Step 6: o dia rodado limpa o ao vivo**

Em `src/backend/groupAdvance.ts`, import `import { clearLiveForDay } from "@/backend/rivals/liveScores";` e, em
`stepWorld`, logo depois da linha `const results = await recordDayResults(...)` da tarefa 5:

```ts
  clearLiveForDay(saveId, currentDate, deps.notify);
```

Acrescente ao `groupAdvance.rivals.test.ts` (dentro do `describe`):

```ts
  test("the day running clears the live scores of that day", async () => {
    const { acceptLiveScore, liveScoresOf, setLiveResolver, resetLiveScores } = await import("@/backend/rivals/liveScores");
    const id = await fakeWorld({ seatIds: ["a", "b"], date: D, seats: { a: { readyUntil: "2027-03-11" }, b: { readyUntil: "2027-03-11" } } });
    created.push(id);
    const ua = makeUser(uniqueNick());
    const ub = makeUser(uniqueNick());
    addSaveMember(id, ua.id, "a", "owner");
    addSaveMember(id, ub.id, "b", "member");
    setLiveResolver(async () => ({
      base: { seatId: "a", nickname: "a", clubId: "club-a", clubName: "A", opponentId: "x", opponentName: "X", home: true, fixtureId: "f1", date: D },
      scorers: [],
    }));
    await acceptLiveScore(ua.id, { saveId: id, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, () => {});
    expect(liveScoresOf(id)).toHaveLength(1);
    const notified: ServerEvent[] = [];
    await kickWorld(id, {
      service: saveService, now: () => Date.now(), notify: (_u, e) => notified.push(e),
      matchDates: async () => [], matchOn: async () => null,
      runDay: async (saveId) => {
        const date = (await saveService.getMeta(saveId))!.currentDate!;
        await saveService.updateMeta(saveId, { currentDate: addDays(date, 1) });
        return { ok: true, seats: {}, payload: { newDate: addDays(date, 1) } };
      },
    });
    expect(liveScoresOf(id)).toEqual([]);
    expect(notified).toContainEqual({ type: "friend_live", saveId: id, seatId: "a", live: null });
    resetLiveScores();
  });
```

- [ ] **Step 7: rodar**

Run: `bun test src/backend/rivals src/backend/social src/backend/groupAdvance.rivals.test.ts src/backend/groupAdvance.test.ts`
Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add src/backend/rivals/liveScores.ts src/backend/rivals/liveScores.test.ts src/backend/social/realtime.ts src/backend/social/realtime.live.test.ts src/backend/social/maintenance.ts src/backend/groupAdvance.ts src/backend/groupAdvance.rivals.test.ts
git commit -m "feat(rivals): live score on the socket and friend_live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: rotas `rivals`, `live` e `results`

**Files:**
- Create: `src/backend/rivals/rivalsView.ts`
- Create: `src/backend/rivals/rivalsRoutes.ts`
- Modify: `src/backend/routes.ts`
- Test: `src/backend/rivals/rivalsRoutes.test.ts`

- [ ] **Step 1: testes (com helpers num arquivo à parte, reaproveitados pela tarefa 8)**

```ts
// src/backend/rivals/rivalsTestUtils.ts
// Test helpers for the rivals routes. Never imported by production code.
import { apiRoutes } from "@/backend/routes";
import type { SeatResult } from "@/types/rivalsTypes";

type Handler = { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response> };
export const call = (path: string, method: "GET" | "POST", saveId: string, token: string, query = "", body?: unknown) => {
  const handler = apiRoutes[path as keyof typeof apiRoutes] as unknown as Handler;
  const url = `http://localhost${path.replace(":saveId", saveId)}${query}`;
  return handler[method]!(Object.assign(
    new Request(url, {
      method, headers: { cookie: `fs_session=${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { params: { saveId } },
  ));
};

export const result = (seatId: string, date: string, f: number, a: number): SeatResult => ({
  id: `${date}:premier_league:f-${seatId}:${seatId}`, date, seatId, nickname: seatId, clubId: `club-${seatId}`,
  clubName: `Club ${seatId}`, opponentId: "x", opponentName: "X", home: true, competition: "premier_league",
  score: { for: f, against: a }, goals: [], situations: [f > a ? "win" : f < a ? "loss" : "draw", ...(f < a ? ["home_loss" as const] : [])],
});
```

```ts
// src/backend/rivals/rivalsRoutes.test.ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers, listSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { acceptLiveScore, resetLiveScores, setLiveResolver } from "@/backend/rivals/liveScores";
import { call, result } from "@/backend/rivals/rivalsTestUtils";
import type { ResultsPage, RivalsView } from "@/types/rivalsTypes";

const created: string[] = [];
afterAll(async () => {
  resetLiveScores();
  for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); }
});

async function league() {
  const id = await fakeWorld({ seatIds: ["a", "b"], date: "2027-03-10" });
  created.push(id);
  const ua = makeUser(uniqueNick());
  const ub = makeUser(uniqueNick());
  addSaveMember(id, ua.id, "a", "owner");
  addSaveMember(id, ub.id, "b", "member");
  await saveService.writeRivalsFeed(id, [result("b", "2027-03-09", 0, 3), result("a", "2027-03-09", 2, 0), result("b", "2027-03-08", 1, 1)]);
  return { id, ua, ub };
}

describe("rivals routes", () => {
  test("GET rivals: one row per member, form from the feed, live score", async () => {
    const { id, ua } = await league();
    setLiveResolver(async () => ({
      base: { seatId: "b", nickname: "b", clubId: "club-b", clubName: "Club b", opponentId: "x", opponentName: "X", home: true, fixtureId: "f", date: "2027-03-10" },
      scorers: [],
    }));
    const ub2 = listSaveMembers(id).find((m) => m.seatId === "b")!;
    await acceptLiveScore(ub2.userId, { saveId: id, fixtureId: "f", phase: "start", minute: 0, score: { for: 0, against: 0 } }, () => {});
    const res = await call("/api/worlds/:saveId/rivals", "GET", id, ua.token);
    expect(res.status).toBe(200);
    const view = (await res.json()) as RivalsView;
    const b = view.rows.find((r) => r.seatId === "b")!;
    expect(b.form).toEqual(["D", "L"]);
    expect(b.last?.score).toEqual({ for: 0, against: 3 });
    expect(b.live?.status).toBe("live");
    expect(view.rows.find((r) => r.seatId === "a")!.me).toBe(true);
    resetLiveScores();
  });

  test("GET results filters by seat and pages", async () => {
    const { id, ua } = await league();
    const res = await call("/api/worlds/:saveId/results", "GET", id, ua.token, "?seat=b&limit=1");
    const page = (await res.json()) as ResultsPage;
    expect(page.results.map((r) => r.seatId)).toEqual(["b"]);
    expect(page.hasMore).toBe(true);
    expect((await call("/api/worlds/:saveId/results", "GET", id, ua.token, "?limit=0")).status).toBe(400);
  });

  test("GET live lists the games in progress", async () => {
    const { id, ua } = await league();
    const res = await call("/api/worlds/:saveId/live", "GET", id, ua.token);
    expect(await res.json()).toEqual({ live: [] });
  });

  test("a stranger is 404; a solo save is 409", async () => {
    const { id } = await league();
    expect((await call("/api/worlds/:saveId/rivals", "GET", id, makeUser().token)).status).toBe(404);
    const solo = await fakeWorld({ seatIds: ["a"], date: "2027-03-10", world: null, mode: "solo" });
    created.push(solo);
    const u = makeUser(uniqueNick());
    addSaveMember(solo, u.id, "a", "owner");
    expect((await call("/api/worlds/:saveId/rivals", "GET", solo, u.token)).status).toBe(409);
  });
});
```

Run: `bun test src/backend/rivals/rivalsRoutes.test.ts` → FAIL.

- [ ] **Step 2: `rivalsView.ts`**

```ts
// src/backend/rivals/rivalsView.ts
// `GET /api/worlds/:saveId/rivals` (multiplayer part 6): one row per member.
import type { SaveService } from "@/backend/SaveService";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { seatMatchOn } from "@/backend/groupAdvance";
import { positionOf, standingsView } from "@/backend/standingsWorld";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { logError } from "@/Logger";
import { formOf } from "@/Domain/rivals/results";
import { rankOf } from "@/Domain/multiplayer/standings";
import type { RivalNextMatch, RivalRow, RivalsView } from "@/types/rivalsTypes";

async function nextMatchOf(
  service: SaveService, saveId: string, seatId: string, from: string, nameOf: (id: string) => string,
): Promise<RivalNextMatch | null> {
  try {
    const date = await seatNextMatchDate(service, saveId, seatId, from);
    if (!date) return null;
    const seat = await service.getSeat(saveId, seatId);
    const f = await seatMatchOn(service, saveId, seatId, date);
    if (!f) return null;
    const home = f.home === seat?.clubId;
    const opponentId = home ? f.away : f.home;
    return { date, opponentId, opponentName: nameOf(opponentId), home, competition: f.competition };
  } catch (e) {
    // Display only: a calendar read failure shows no next game.
    logError("world", `save ${saveId}: rivals next match of ${seatId} failed`, e);
    return null;
  }
}

export async function rivalsView(service: SaveService, saveId: string, viewerSeatId: string, now = Date.now()): Promise<RivalsView> {
  const meta = await service.getMeta(saveId);
  const today = meta?.currentDate ?? "";
  const feed = await service.getRivalsFeed(saveId);
  const standings = await standingsView(service, saveId);
  const live = liveScoresOf(saveId, now);
  const index = await service.getSquadIndex(saveId);
  const nameOf = (id: string) => index.byId(id)?.name ?? id;
  const rows: RivalRow[] = [];
  for (const e of standings.entries) {
    const seat = await service.getSeat(saveId, e.seatId);
    const employed = !!seat?.clubId && !seat.unemployed;
    rows.push({
      seatId: e.seatId,
      nickname: e.nickname,
      managerName: e.managerName,
      face: e.face,
      nationalityIso: e.nationalityIso,
      clubId: employed ? e.clubId : "",
      clubName: employed ? e.clubName : "",
      clubColors: e.clubColors,
      leagueSlug: seat?.leagueSlug ?? "",
      leaguePosition: employed && seat ? await positionOf(service, saveId, seat.leagueSlug, seat.clubId) : null,
      form: formOf(feed, e.seatId),
      last: feed.find((r) => r.seatId === e.seatId) ?? null,
      next: employed && today ? await nextMatchOf(service, saveId, e.seatId, today, nameOf) : null,
      friendsRank: rankOf(standings.entries, e.seatId),
      friendsTotal: e.total,
      live: live.find((l) => l.seatId === e.seatId) ?? null,
      me: e.seatId === viewerSeatId,
    });
  }
  return { rows };
}
```

- [ ] **Step 3: `rivalsRoutes.ts` (GETs; o POST `taunts` entra na tarefa 8)**

```ts
// src/backend/rivals/rivalsRoutes.ts
// Rivals in a friends' league (multiplayer part 6): the panel, the results feed, the live scores and the taunts.
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { fail, multiWorld } from "@/backend/worlds/worldRoutes";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { rivalsView } from "@/backend/rivals/rivalsView";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { ResultsPage } from "@/types/rivalsTypes";

type Req = Request & { params: Record<string, string> };

/** Member of a friends' league: the seat auth, or the failing response (404 stranger, 409 `notMulti`). */
async function memberOfWorld(req: Req): Promise<{ saveId: string; seatId: string; userId: string } | Response> {
  const saveId = req.params.saveId!;
  const auth = requireSeat(req, saveId);
  if (auth instanceof Response) return auth;
  if (!(await multiWorld(saveId))) return fail("notMulti", 409);
  return { saveId, seatId: auth.seatId, userId: auth.userId };
}

export const rivalsRoutes = {
  "/api/worlds/:saveId/rivals": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      return Response.json(await rivalsView(saveService, m.saveId, m.seatId));
    },
  },

  "/api/worlds/:saveId/live": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      return Response.json({ live: liveScoresOf(m.saveId) });
    },
  },

  /** The feed, newest first: `?seat=<seatId>&offset=&limit=` (limit 1..50). */
  "/api/worlds/:saveId/results": {
    GET: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      const url = new URL(req.url);
      const seat = url.searchParams.get("seat");
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? RIVALS.RESULTS_PAGE);
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > RIVALS.RESULTS_PAGE) {
        return fail("invalidBody", 400);
      }
      const feed = (await saveService.getRivalsFeed(m.saveId)).filter((r) => !seat || r.seatId === seat);
      const body: ResultsPage = { results: feed.slice(offset, offset + limit), hasMore: feed.length > offset + limit };
      return Response.json(body);
    },
  },
};
```

- [ ] **Step 4: registrar**

Em `src/backend/routes.ts`, import `import { rivalsRoutes } from "@/backend/rivals/rivalsRoutes";` e, logo depois de
`...groupAdvanceRoutes,`, `...rivalsRoutes,`.

Run: `bun test src/backend/rivals/rivalsRoutes.test.ts` → PASS.

- [ ] **Step 5: commit**

```bash
git add src/backend/rivals/rivalsView.ts src/backend/rivals/rivalsRoutes.ts src/backend/rivals/rivalsRoutes.test.ts src/backend/rivals/rivalsTestUtils.ts src/backend/routes.ts
git commit -m "feat(rivals): rivals, live and results routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: provocações (`POST taunts`, `chat_messages.meta`)

**Files:**
- Modify: `src/backend/db.ts`, `src/backend/social/socialStore.ts`, `src/backend/social/socialRoutes.ts`, `src/backend/social/realtime.ts`
- Modify: `src/backend/rivals/rivalsRoutes.ts`
- Test: `src/backend/db.social.test.ts` (acrescentar), `src/backend/rivals/taunts.routes.test.ts`

- [ ] **Step 1: teste da migração**

Acrescente a `src/backend/db.social.test.ts` (no `describe` existente que testa `migrateSocialSchema` num banco em
memória — leia o arquivo e siga o mesmo padrão de banco):

```ts
  test("chat_messages gets a meta column (additive, twice is fine)", () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT)");
    migrateSocialSchema(database);
    migrateSocialSchema(database);
    const cols = (database.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("meta");
  });
```

(Se o arquivo já cria `users` de outro jeito, reaproveite o helper dele.)

Run: `bun test src/backend/db.social.test.ts` → FAIL.

- [ ] **Step 2: migração**

Em `src/backend/db.ts`, em `migrateSocialSchema`, logo depois do `database.exec(\`...\`)` grande e antes de
`migrateSaveMembersSchema(database);`:

```ts
  // Rivals (multiplayer part 6): a taunt's ids and score as JSON (`{ taunt }`); null for a plain message.
  addColumnIfMissing(database, "chat_messages", "meta", "TEXT");
```

Run: `bun test src/backend/db.social.test.ts` → PASS.

- [ ] **Step 3: loja e visão da mensagem**

Em `src/backend/social/socialStore.ts`:

1. Imports: `import { parseTauntMeta } from "@/Domain/rivals/taunts";`,
   `import type { TauntMeta } from "@/types/rivalsTypes";`, e `ChatMessageView` no import de `@/types/socialTypes`.
2. `ChatMessageRow` ganha `meta: string | null;`.
3. `insertMessage` passa a ser:

```ts
export function insertMessage(room: string, fromUser: string, body: string, now: number, taunt?: TauntMeta): ChatMessageRow {
  const meta = taunt ? JSON.stringify({ taunt }) : null;
  const info = db
    .prepare("INSERT INTO chat_messages (room, from_user, body, created_at, meta) VALUES (?, ?, ?, ?, ?)")
    .run(room, fromUser, body, now, meta);
  return {
    id: Number(info.lastInsertRowid),
    room,
    fromUser,
    fromNickname: getSocialUser(fromUser)?.nickname ?? null,
    body,
    createdAt: now,
    meta,
  };
}
```

4. Em `listMessages`, o `SELECT` passa a terminar em `m.body, m.created_at AS createdAt, m.meta`.
5. Depois de `listMessages`:

```ts
/** A stored message as `viewerId` sees it (a taunt carries its meta; `body` is the English fallback). */
export function chatMessageView(row: ChatMessageRow, viewerId: string): ChatMessageView {
  let taunt: TauntMeta | null = null;
  if (row.meta) {
    try {
      taunt = parseTauntMeta((JSON.parse(row.meta) as { taunt?: unknown } | null)?.taunt);
    } catch {
      taunt = null;
    }
  }
  return {
    id: row.id, from: row.fromNickname ?? "", mine: row.fromUser === viewerId, body: row.body, at: row.createdAt,
    ...(taunt ? { taunt } : {}),
  };
}
```

Em `src/backend/social/socialRoutes.ts`: importe `chatMessageView` e troque o corpo de `messageView` por
`return chatMessageView(row, viewer);`. Acrescente, depois de `allow(...)`:

```ts
/** The chat's message rate (10 per 10 s per user), shared with the rivals' taunts. */
export function allowChatSend(userId: string, now: number): boolean {
  return allow(sendStamps, userId, now);
}
```

Em `src/backend/social/realtime.ts`, `deliverMessage` usa a visão comum: importe `chatMessageView` de
`@/backend/social/socialStore` e troque o `message: { id: row.id, ... }` por `message: chatMessageView(row, userId)`.

Run: `bun test src/backend/social` → PASS. Se algum teste compara a linha de `insertMessage` com `toEqual` sem `meta`,
acrescente `meta: null` à expectativa.

- [ ] **Step 4: testes da rota**

```ts
// src/backend/rivals/taunts.routes.test.ts
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { chatMessageView, listMessages } from "@/backend/social/socialStore";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { worldRoomId } from "@/Domain/social/rooms";
import { call, result } from "@/backend/rivals/rivalsTestUtils";

const created: string[] = [];
afterAll(async () => { for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); } });
beforeEach(() => resetSocialRateLimit());

async function league(phase: "running" | "lobby" = "running") {
  const id = await fakeWorld({ seatIds: ["a", "b"], date: "2027-03-10", world: { phase } });
  created.push(id);
  const ua = makeUser(uniqueNick());
  const ub = makeUser(uniqueNick());
  addSaveMember(id, ua.id, "a", "owner");
  addSaveMember(id, ub.id, "b", "member");
  const rb = result("b", "2027-03-09", 0, 3);
  const ra = result("a", "2027-03-09", 2, 0);
  await saveService.writeRivalsFeed(id, [rb, ra]);
  return { id, ua, ub, rb, ra };
}

const PATH = "/api/worlds/:saveId/taunts";

describe("POST taunts", () => {
  test("a phrase of the result's situations goes to the world room with its meta", async () => {
    const { id, ua, rb } = await league();
    const res = await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "phrase", id: "home_loss_1" });
    expect(res.status).toBe(200);
    const rows = listMessages(worldRoomId(id), ua.id, { limit: 10 });
    expect(rows).toHaveLength(1);
    const view = chatMessageView(rows[0]!, ua.id);
    expect(view.taunt).toMatchObject({ kind: "phrase", id: "home_loss_1", target: "b", score: { for: 0, against: 3 } });
    expect(view.body).toContain("Club b 0–3 X");
  });

  test("a reaction to a result works; 400 self / invalidTaunt / invalidBody; 404 unknown target", async () => {
    const { id, ua, ra, rb } = await league();
    expect((await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "reaction", id: "laugh" })).status).toBe(200);
    const self = await call(PATH, "POST", id, ua.token, "", { target: { result: ra.id }, kind: "reaction", id: "fire" });
    expect([self.status, (await self.json()).error]).toEqual([400, "self"]);
    const wrong = await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "phrase", id: "big_win_1" });
    expect([wrong.status, (await wrong.json()).error]).toEqual([400, "invalidTaunt"]);
    expect((await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "phrase", id: "free text" })).status).toBe(400);
    expect((await call(PATH, "POST", id, ua.token, "", { target: {}, kind: "reaction", id: "fire" })).status).toBe(400);
    expect((await call(PATH, "POST", id, ua.token, "", { target: { result: "nope" }, kind: "reaction", id: "fire" })).status).toBe(404);
  });

  test("409 lobby, 404 stranger, 429 over the chat rate", async () => {
    const lobby = await league("lobby");
    expect((await call(PATH, "POST", lobby.id, lobby.ua.token, "", { target: { result: lobby.rb.id }, kind: "reaction", id: "fire" })).status).toBe(409);
    const { id, ua, rb } = await league();
    expect((await call(PATH, "POST", id, makeUser().token, "", { target: { result: rb.id }, kind: "reaction", id: "fire" })).status).toBe(404);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call(PATH, "POST", id, ua.token, "", { target: { result: rb.id }, kind: "reaction", id: "fire" })).status;
    expect(last).toBe(429);
  });
});
```

Run: `bun test src/backend/rivals/taunts.routes.test.ts` → FAIL.

- [ ] **Step 5: a rota**

Em `src/backend/rivals/rivalsRoutes.ts`, acrescente imports:

```ts
import { readBody } from "@/backend/worlds/worldRoutes";
import { getSocialUser, chatMessageView, insertMessage, markRead } from "@/backend/social/socialStore";
import { deliverMessage } from "@/backend/social/realtime";
import { allowChatSend } from "@/backend/social/socialRoutes";
import { isReaction, isTauntFor, liveGroups, tauntFallbackBody, tauntMeta } from "@/Domain/rivals/taunts";
import { worldRoomId } from "@/Domain/social/rooms";
import en from "@/i18n/locales/en.json";
import type { TauntKind } from "@/types/rivalsTypes";
```

(troque o import de `fail, multiWorld` por `fail, multiWorld, readBody`.)

e a entrada no mapa `rivalsRoutes`:

```ts
  /** A reaction or a ready phrase to a friend's result or live game, into the league's chat. No free text. */
  "/api/worlds/:saveId/taunts": {
    POST: async (req: Req) => {
      const m = await memberOfWorld(req);
      if (m instanceof Response) return m;
      const meta = await multiWorld(m.saveId);
      if (meta?.world.phase === "lobby") return fail("lobby", 409);
      if (!getSocialUser(m.userId)?.nickname) return fail("noNickname", 409);
      const body = await readBody(req);
      if (body instanceof Response) return body;
      const kind = body.kind as TauntKind;
      const id = body.id;
      const target = body.target as Record<string, unknown> | null | undefined;
      const resultId = typeof target?.result === "string" ? target.result : null;
      const liveSeat = typeof target?.live === "string" ? target.live : null;
      if ((kind !== "reaction" && kind !== "phrase") || typeof id !== "string" || id.length > 40 || (!resultId === !liveSeat)) {
        return fail("invalidBody", 400);
      }
      let source;
      let groups;
      let live = false;
      if (resultId) {
        const r = (await saveService.getRivalsFeed(m.saveId)).find((x) => x.id === resultId);
        if (!r) return fail("notFound", 404);
        source = r;
        groups = r.situations;
      } else {
        const l = liveScoresOf(m.saveId).find((x) => x.seatId === liveSeat);
        if (!l) return fail("notFound", 404);
        source = l;
        groups = liveGroups(l);
        live = true;
      }
      if (source.seatId === m.seatId) return fail("self", 400);
      if (kind === "reaction" ? !isReaction(id) : !isTauntFor(id, groups)) return fail("invalidTaunt", 400);
      const now = Date.now();
      if (!allowChatSend(m.userId, now)) return fail("rateLimited", 429);
      const taunt = tauntMeta({ kind, id, from: source, live });
      const phrases = (en as { rivals?: { taunts?: Record<string, string> } }).rivals?.taunts ?? {};
      const row = insertMessage(worldRoomId(m.saveId), m.userId, tauntFallbackBody(taunt, phrases[id] ?? null), now, taunt);
      markRead(m.userId, row.room, row.id);
      deliverMessage(row);
      return Response.json({ message: chatMessageView(row, m.userId) });
    },
  },
```

O `tauntMeta` aceita um `LiveScoreView` porque ele tem `nickname`, `clubId`, `clubName`, `opponentName`,
`home`, `score` e `minute`.

Até a tarefa 9 o `en.json` não tem `rivals.taunts`: o corpo cai no id (`tauntFallbackBody` usa `meta.id`). O teste
da rota não depende do texto da frase.

Run: `bun test src/backend/rivals src/backend/social src/backend/db.social.test.ts`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/backend/db.ts src/backend/db.social.test.ts src/backend/social/socialStore.ts src/backend/social/socialRoutes.ts src/backend/social/realtime.ts src/backend/rivals/rivalsRoutes.ts src/backend/rivals/taunts.routes.test.ts
git commit -m "feat(rivals): taunts into the league chat with message meta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: ícones e textos (catálogo completo, pt-BR e en)

**Files:**
- Modify: `src/GameInterface/Icons.tsx`
- Modify: `src/i18n/locales/pt-BR.json`, `src/i18n/locales/en.json`
- Test: `src/i18n/rivals.keys.test.ts`

- [ ] **Step 1: teste das chaves**

```ts
// src/i18n/rivals.keys.test.ts
import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { ALL_TAUNT_IDS, REACTIONS } from "@/Domain/rivals/taunts";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  ...[
    "tabRivals", "tabResults", "rivalsTitle", "rivalsHint", "resultsTitle", "positionValue", "nextValue", "liveLine",
    "halfLine", "endedLine", "staleLine", "liveMinute", "goalPopup", "scorer", "pens", "filterLabel", "filterAll",
    "empty", "noRivals", "loadMore", "stripLabel", "actionsLabel", "phrases", "sent", "liveBadge",
    "col.rank", "col.position", "col.form", "col.last", "col.next", "col.live",
    "card.title", "card.link",
    ...REACTIONS.map((r) => `reactions.${r}`),
    ...ALL_TAUNT_IDS.map((id) => `taunts.${id}`),
  ].map((k) => `rivals.${k}`),
  ...["self", "invalidTaunt", "rateLimited"].map((k) => `world.errors.${k}`),
];

describe("rivals i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), `${name} ${k}`).toBe("string");
    });
    test(`${name} has no emoji in the rivals texts`, () => {
      expect(JSON.stringify(get(lang, "rivals"))).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  }
});
```

Run: `bun test src/i18n/rivals.keys.test.ts` → FAIL.

- [ ] **Step 2: ícones**

Em `src/GameInterface/Icons.tsx`:
1. No import do `lucide-react`, acrescente `ThumbsUp,`, `HeartCrack,` e `Radio,` (`Flame` e `Laugh` já estão).
2. Em `IconName`, antes de `| "ban"`:

```ts
  | "react-applause"
  | "react-fire"
  | "react-laugh"
  | "react-sorry"
  | "radio"
```

3. Em `ICON_MAP`, antes de `"ban": Ban,`:

```ts
  "react-applause": ThumbsUp,
  "react-fire":     Flame,
  "react-laugh":    Laugh,
  "react-sorry":    HeartCrack,
  "radio":          Radio,
```

- [ ] **Step 3: textos pt-BR**

Em `src/i18n/locales/pt-BR.json`, dentro do objeto `world.errors` (o de nível `world`, o mesmo de `"notFound": "Este
convite não vale mais."`), acrescente:

```json
      "self": "Não dá para provocar a si mesmo.",
      "invalidTaunt": "Essa frase não combina com este jogo.",
      "rateLimited": "Calma, espere um pouco."
```

e um bloco novo de nível raiz `"rivals"` (depois do bloco `"world"`, antes do `}` final do arquivo):

```json
  "rivals": {
    "tabRivals": "Rivais",
    "tabResults": "Resultados",
    "rivalsTitle": "Seus rivais",
    "rivalsHint": "Como cada amigo está indo. Clique numa linha para ver os resultados dele.",
    "resultsTitle": "Resultados",
    "col": { "rank": "#", "position": "Liga", "form": "Forma", "last": "Último", "next": "Próximo", "live": "Agora" },
    "positionValue": "{{position}}º",
    "nextValue": "{{date}} · {{opponent}}",
    "liveBadge": "ao vivo",
    "liveLine": "ao vivo · {{score}} · {{minute}}'",
    "halfLine": "intervalo · {{score}}",
    "endedLine": "terminou · {{score}}",
    "staleLine": "interrompido · {{score}}",
    "liveMinute": "{{minute}}'",
    "goalPopup": "{{nickname}} · gol · {{score}} · {{minute}}'",
    "scorer": "gol de {{name}}",
    "pens": "pên. {{for}}–{{against}}",
    "filterLabel": "Amigo",
    "filterAll": "Todos",
    "empty": "Nenhum resultado ainda.",
    "noRivals": "Nenhum amigo nesta liga ainda.",
    "loadMore": "Carregar mais",
    "card": { "title": "Rivais", "link": "Ver rivais" },
    "stripLabel": "Amigos jogando agora",
    "actionsLabel": "Resenha",
    "phrases": "Frase",
    "sent": "Enviado",
    "reactions": { "applause": "Palmas", "fire": "Fogo", "laugh": "Risada", "sorry": "Lamento" },
    "taunts": {
      "live_goal_for_1": "Saiu o gol.",
      "live_goal_for_2": "Agora vai.",
      "live_goal_for_3": "Comemorou cedo?",
      "live_goal_for_4": "Vamos ver se segura.",
      "live_goal_against_1": "Ih.",
      "live_goal_against_2": "Acordou não, né?",
      "live_goal_against_3": "A defesa foi tomar café.",
      "live_goal_against_4": "Tomou.",
      "big_win_1": "Tá voando.",
      "big_win_2": "Chegou chegando.",
      "big_win_3": "Atropelou.",
      "big_win_4": "Assim fica fácil.",
      "big_loss_1": "Três no lombo.",
      "big_loss_2": "Foi passeio.",
      "big_loss_3": "Foi atropelado.",
      "big_loss_4": "Pede pra sair.",
      "comeback_win_1": "Virou e calou geral.",
      "comeback_win_2": "Tava morto.",
      "comeback_win_3": "Ninguém botava fé.",
      "comeback_win_4": "Virada de respeito.",
      "blown_lead_1": "Quase, né.",
      "blown_lead_2": "Tinha o jogo na mão.",
      "blown_lead_3": "Deixou escapar.",
      "blown_lead_4": "Faltou segurar.",
      "late_winner_1": "No finzinho, hein.",
      "late_winner_2": "Sofreu, mas levou.",
      "late_winner_3": "Deixou pro último minuto.",
      "late_winner_4": "Coração não aguenta.",
      "late_equalizer_1": "Salvou no apagar das luzes.",
      "late_equalizer_2": "Já estava saindo do estádio.",
      "late_equalizer_3": "Na raça.",
      "late_equalizer_4": "Buscou no fim.",
      "shootout_win_1": "Nos pênaltis vale igual.",
      "shootout_win_2": "O goleiro salvou.",
      "shootout_win_3": "Na loteria deu bom.",
      "shootout_win_4": "Frieza na marca da cal.",
      "shootout_loss_1": "Pênalti é loteria.",
      "shootout_loss_2": "Bateu e não entrou.",
      "shootout_loss_3": "Morreu na praia.",
      "shootout_loss_4": "Faltou treinar pênalti.",
      "home_loss_1": "Em casa, hein.",
      "home_loss_2": "A torcida pediu o ingresso de volta.",
      "home_loss_3": "O estádio ficou mudo.",
      "home_loss_4": "Perder em casa dói mais.",
      "away_win_1": "Foi lá e buscou.",
      "away_win_2": "Calou a casa deles.",
      "away_win_3": "Fora de casa vale dobrado.",
      "away_win_4": "Viagem que valeu.",
      "win_1": "Fez o dever de casa.",
      "win_2": "Três pontos é três pontos.",
      "win_3": "Ganhou, mas sem brilho.",
      "win_4": "Tá embalando, hein.",
      "draw_1": "Empate com gosto de nada.",
      "draw_2": "Dividiu os pontos.",
      "draw_3": "Nem lá nem cá.",
      "draw_4": "Um pontinho, vai.",
      "loss_1": "Hoje não deu.",
      "loss_2": "Faz parte.",
      "loss_3": "Semana que vem tem mais.",
      "loss_4": "Lutou. Mais ou menos."
    }
  }
```

- [ ] **Step 4: textos en**

Em `src/i18n/locales/en.json`, em `world.errors`:

```json
      "self": "You can't wind yourself up.",
      "invalidTaunt": "That line doesn't fit this game.",
      "rateLimited": "Easy, wait a moment."
```

e o bloco raiz:

```json
  "rivals": {
    "tabRivals": "Rivals",
    "tabResults": "Results",
    "rivalsTitle": "Your rivals",
    "rivalsHint": "How each friend is doing. Click a row to see their results.",
    "resultsTitle": "Results",
    "col": { "rank": "#", "position": "League", "form": "Form", "last": "Last", "next": "Next", "live": "Now" },
    "positionValue": "#{{position}}",
    "nextValue": "{{date}} · {{opponent}}",
    "liveBadge": "live",
    "liveLine": "live · {{score}} · {{minute}}'",
    "halfLine": "half-time · {{score}}",
    "endedLine": "full time · {{score}}",
    "staleLine": "interrupted · {{score}}",
    "liveMinute": "{{minute}}'",
    "goalPopup": "{{nickname}} · goal · {{score}} · {{minute}}'",
    "scorer": "goal by {{name}}",
    "pens": "pens {{for}}–{{against}}",
    "filterLabel": "Friend",
    "filterAll": "Everyone",
    "empty": "No results yet.",
    "noRivals": "No friends in this league yet.",
    "loadMore": "Load more",
    "card": { "title": "Rivals", "link": "See rivals" },
    "stripLabel": "Friends playing now",
    "actionsLabel": "Banter",
    "phrases": "Line",
    "sent": "Sent",
    "reactions": { "applause": "Applause", "fire": "On fire", "laugh": "Laugh", "sorry": "Commiserations" },
    "taunts": {
      "live_goal_for_1": "There it is.",
      "live_goal_for_2": "Now we're talking.",
      "live_goal_for_3": "Celebrating early?",
      "live_goal_for_4": "Let's see if you hold it.",
      "live_goal_against_1": "Uh-oh.",
      "live_goal_against_2": "Still asleep?",
      "live_goal_against_3": "Defence went for a coffee.",
      "live_goal_against_4": "Conceded.",
      "big_win_1": "Flying.",
      "big_win_2": "Made an entrance.",
      "big_win_3": "Ran them over.",
      "big_win_4": "Made it look easy.",
      "big_loss_1": "Three on the back.",
      "big_loss_2": "That was a stroll for them.",
      "big_loss_3": "Got run over.",
      "big_loss_4": "Time to call it.",
      "comeback_win_1": "Turned it around and shut everyone up.",
      "comeback_win_2": "Was dead and buried.",
      "comeback_win_3": "Nobody believed it.",
      "comeback_win_4": "Proper comeback.",
      "blown_lead_1": "So close.",
      "blown_lead_2": "Had it in the bag.",
      "blown_lead_3": "Let it slip.",
      "blown_lead_4": "Couldn't hold on.",
      "late_winner_1": "Right at the end, huh.",
      "late_winner_2": "Made us suffer, but got it.",
      "late_winner_3": "Left it late.",
      "late_winner_4": "Not good for the heart.",
      "late_equalizer_1": "Saved it at the death.",
      "late_equalizer_2": "I was already leaving the ground.",
      "late_equalizer_3": "Pure grit.",
      "late_equalizer_4": "Got it back at the end.",
      "shootout_win_1": "Penalties count the same.",
      "shootout_win_2": "The keeper saved you.",
      "shootout_win_3": "Won the lottery.",
      "shootout_win_4": "Ice cold from the spot.",
      "shootout_loss_1": "Penalties are a lottery.",
      "shootout_loss_2": "Missed when it mattered.",
      "shootout_loss_3": "So close, yet so far.",
      "shootout_loss_4": "Should have practised penalties.",
      "home_loss_1": "At home, too.",
      "home_loss_2": "The fans want their money back.",
      "home_loss_3": "The stadium went quiet.",
      "home_loss_4": "Losing at home hurts more.",
      "away_win_1": "Went there and took it.",
      "away_win_2": "Silenced their ground.",
      "away_win_3": "Away wins count double.",
      "away_win_4": "Worth the trip.",
      "win_1": "Did the job.",
      "win_2": "Three points are three points.",
      "win_3": "Won it, nothing fancy.",
      "win_4": "Picking up steam, huh.",
      "draw_1": "A draw that tastes of nothing.",
      "draw_2": "Points shared.",
      "draw_3": "Neither here nor there.",
      "draw_4": "A point is a point.",
      "loss_1": "Not your day.",
      "loss_2": "It happens.",
      "loss_3": "There's always next week.",
      "loss_4": "Fought. Sort of."
    }
  }
```

- [ ] **Step 5: rodar**

Run: `bun test src/i18n src/Domain/rivals src/backend/rivals`
Expected: PASS (o JSON precisa continuar válido: um erro de vírgula quebra o teste de chaves inteiro).

- [ ] **Step 6: commit**

```bash
git add src/GameInterface/Icons.tsx src/i18n/locales/pt-BR.json src/i18n/locales/en.json src/i18n/rivals.keys.test.ts
git commit -m "feat(rivals): icons and texts (pt-BR, en)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: camada de dados do cliente (API, eventos, avisos)

**Files:**
- Modify: `src/GameInterface/World/worldApi.ts`
- Create: `src/GameInterface/World/rivalsApi.ts`
- Modify: `src/GameInterface/Social/socialState.ts`
- Test: `src/GameInterface/Social/socialState.rivals.test.ts`
- Modify: `src/GameInterface/Social/useSocial.tsx`, `src/GameInterface/Components/Layout.tsx`

- [ ] **Step 1: testes**

```ts
// src/GameInterface/Social/socialState.rivals.test.ts
import { describe, expect, test } from "bun:test";
import { parseServerEvent, pushRivalPopup, type RivalPopup } from "@/GameInterface/Social/socialState";
import type { SeatResult } from "@/types/rivalsTypes";

const result: SeatResult = {
  id: "r1", date: "2027-03-10", seatId: "b", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2",
  opponentName: "Bahia", home: true, competition: "x", score: { for: 0, against: 3 }, goals: [], situations: ["loss"],
};

describe("rivals socket events", () => {
  test("world_results keeps the well-formed results", () => {
    const ev = parseServerEvent(JSON.stringify({ type: "world_results", saveId: "s", results: [result, { id: 3 }] }));
    expect(ev).toEqual({ type: "world_results", saveId: "s", results: [result] });
  });
  test("friend_live with a view, with null, and junk", () => {
    const live = { ...result, fixtureId: "f", status: "live", minute: 10, lastGoal: null, events: 1, updatedAt: 1 };
    expect(parseServerEvent(JSON.stringify({ type: "friend_live", saveId: "s", seatId: "b", live, goal: true })))
      .toMatchObject({ type: "friend_live", seatId: "b", goal: true });
    expect(parseServerEvent(JSON.stringify({ type: "friend_live", saveId: "s", seatId: "b", live: null })))
      .toEqual({ type: "friend_live", saveId: "s", seatId: "b", live: null });
    expect(parseServerEvent(JSON.stringify({ type: "friend_live", saveId: "s", seatId: "b", live: { x: 1 } }))).toBeNull();
  });
  test("a message keeps its taunt", () => {
    const taunt = { kind: "reaction", id: "fire", target: "fabio", clubId: "c1", clubName: "Vasco", opponentName: "Bahia", home: true, score: { for: 0, against: 3 } };
    const ev = parseServerEvent(JSON.stringify({ type: "message", room: "world:s", message: { id: 1, from: "a", mine: false, body: "x", at: 1, taunt } }));
    expect(ev).toMatchObject({ message: { taunt } });
  });
  test("pushRivalPopup: newest first, one per key, at most max", () => {
    const p = (key: string): RivalPopup => ({ key, kind: "result", result });
    expect(pushRivalPopup([p("a"), p("b"), p("c")], p("d"), 3).map((x) => x.key)).toEqual(["d", "a", "b"]);
    expect(pushRivalPopup([p("a"), p("b")], p("a"), 3).map((x) => x.key)).toEqual(["a", "b"]);
  });
});
```

Run: `bun test src/GameInterface/Social/socialState.rivals.test.ts` → FAIL.

- [ ] **Step 2: `socialState.ts`**

1. Imports:

```ts
import { isSeatResult } from "@/Domain/rivals/results";
import { isLiveScoreView } from "@/Domain/rivals/liveScore";
import { parseTauntMeta } from "@/Domain/rivals/taunts";
import type { LiveScoreView, SeatResult } from "@/types/rivalsTypes";
```

2. No `case "message"`, troque o `return` por:

```ts
      const taunt = parseTauntMeta(m.taunt);
      return {
        type: "message", room: e.room,
        message: { id: m.id, from: m.from, mine: m.mine, body: m.body, at: m.at, ...(taunt ? { taunt } : {}) },
      };
```

3. Antes do `default:`:

```ts
    case "world_results":
      if (!str(e.saveId) || !Array.isArray(e.results)) return null;
      return { type: "world_results", saveId: e.saveId, results: (e.results as unknown[]).filter(isSeatResult) };
    case "friend_live": {
      if (!str(e.saveId) || !str(e.seatId)) return null;
      if (e.live !== null && !isLiveScoreView(e.live)) return null;
      return {
        type: "friend_live", saveId: e.saveId, seatId: e.seatId, live: e.live as LiveScoreView | null,
        ...(e.goal === true ? { goal: true as const } : {}),
      };
    }
```

4. Depois de `pushPopup`:

```ts
/** A friend's result or live goal in the corner (rivals, multiplayer part 6). */
export type RivalPopup =
  | { key: string; kind: "result"; result: SeatResult }
  | { key: string; kind: "goal"; live: LiveScoreView };

/** Newest on top, one per key, at most `max` (the rest only in the feed). */
export function pushRivalPopup(list: readonly RivalPopup[], popup: RivalPopup, max: number): RivalPopup[] {
  return [popup, ...list.filter((p) => p.key !== popup.key)].slice(0, max);
}
```

5. `ChatPopup` ganha `taunt?: import("@/types/rivalsTypes").TauntMeta;`.

Run: `bun test src/GameInterface/Social` → PASS.

- [ ] **Step 3: API do cliente**

Em `src/GameInterface/World/worldApi.ts`: acrescente `"self", "invalidTaunt", "rateLimited",` ao `KNOWN` e, no fim
do arquivo, `export const worldCall = call;`.

```ts
// src/GameInterface/World/rivalsApi.ts
import { worldCall as call } from "@/GameInterface/World/worldApi";
import type { ChatMessageView } from "@/types/socialTypes";
import type { LiveScoreView, ResultsPage, RivalsView, TauntKind, TauntTarget } from "@/types/rivalsTypes";

const seg = (s: string) => encodeURIComponent(s);

export const rivalsApi = {
  rivals: (saveId: string) => call<RivalsView>("GET", `/api/worlds/${seg(saveId)}/rivals`),
  live: (saveId: string) => call<{ live: LiveScoreView[] }>("GET", `/api/worlds/${seg(saveId)}/live`),
  results: (saveId: string, opts: { seat?: string | null; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.seat) q.set("seat", opts.seat);
    if (opts.offset) q.set("offset", String(opts.offset));
    const qs = q.toString();
    return call<ResultsPage>("GET", `/api/worlds/${seg(saveId)}/results${qs ? `?${qs}` : ""}`);
  },
  taunt: (saveId: string, body: { target: TauntTarget; kind: TauntKind; id: string }) =>
    call<{ message: ChatMessageView }>("POST", `/api/worlds/${seg(saveId)}/taunts`, body),
};
```

- [ ] **Step 4: `useSocial.tsx`**

1. Imports: `import { RIVALS } from "@/Domain/rivals/rivalsConfig";`, `pushRivalPopup` e `type RivalPopup` do
   `socialState`.
2. `SocialContextValue` ganha:

```ts
  /** Bumped on `world_results` / `friend_live` of the open world: rivals screens reload (multiplayer part 6). */
  rivalsVersion: number;
  /** Friends' results and live goals in the corner. */
  rivalPopups: RivalPopup[];
  dismissRivalPopup: (key: string) => void;
```

3. `SocialProvider({ saveId, seatId = null, children }: { saveId: string | null; seatId?: string | null; children: ReactNode })`.
4. Estado e helpers, logo depois de `popupTimers`:

```ts
  const [rivalsVersion, setRivalsVersion] = useState(0);
  const [rivalPopups, setRivalPopups] = useState<RivalPopup[]>([]);
  const rivalTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
```

e, depois de `showPopup`:

```ts
  const dismissRivalPopup = useCallback((key: string) => {
    clearTimeout(rivalTimers.current[key]);
    delete rivalTimers.current[key];
    setRivalPopups((prev) => prev.filter((p) => p.key !== key));
  }, []);

  const showRivalPopup = useCallback((popup: RivalPopup) => {
    setRivalPopups((prev) => pushRivalPopup(prev, popup, RIVALS.POPUP_MAX));
    clearTimeout(rivalTimers.current[popup.key]);
    rivalTimers.current[popup.key] = setTimeout(() => dismissRivalPopup(popup.key), RIVALS.POPUP_MS);
  }, [dismissRivalPopup]);
```

No `useEffect` de limpeza dos timers acrescente `const rt = rivalTimers.current;` e `Object.values(rt).forEach(clearTimeout);`.

5. Em `handleEvent`, o `showPopup` do `case "message"` passa `taunt: event.message.taunt`. Antes do `}` do
   `switch`:

```ts
        case "world_results":
          if (event.saveId !== saveId) break;
          setRivalsVersion((v) => v + 1);
          for (const r of event.results.filter((x) => x.seatId !== seatId).slice(0, RIVALS.POPUP_MAX)) {
            showRivalPopup({ key: `result:${r.id}`, kind: "result", result: r });
          }
          break;
        case "friend_live":
          if (event.saveId !== saveId) break;
          setRivalsVersion((v) => v + 1);
          if (event.goal && event.live && event.seatId !== seatId) {
            const l = event.live;
            showRivalPopup({ key: `goal:${l.seatId}:${l.score.for}-${l.score.against}`, kind: "goal", live: l });
          }
          break;
```

e acrescente `seatId, showRivalPopup` às dependências do `useCallback` do `handleEvent`. O `case "world_members"`
também faz `setRivalsVersion((v) => v + 1);`.

6. No `value` do `useMemo`: `rivalsVersion, rivalPopups, dismissRivalPopup` (e nas dependências).
7. `src/GameInterface/Components/Layout.tsx`: `<SocialProvider saveId={session?.saveId ?? null} seatId={session?.seatId ?? null}>`.

Run: `bun run typecheck && bun test src/GameInterface/Social`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/GameInterface/World/worldApi.ts src/GameInterface/World/rivalsApi.ts src/GameInterface/Social/socialState.ts src/GameInterface/Social/socialState.rivals.test.ts src/GameInterface/Social/useSocial.tsx src/GameInterface/Components/Layout.tsx
git commit -m "feat(rivals): client api, socket events and corner notices state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: peças de tela — forma, resenha, chat e avisos

**Files:**
- Create: `src/GameInterface/World/reactionIcons.ts`, `src/GameInterface/World/RivalForm.tsx`, `src/GameInterface/World/liveText.ts`, `src/GameInterface/World/TauntActions.tsx`, `src/GameInterface/Social/TauntLine.tsx`
- Test: `src/GameInterface/World/liveText.test.ts`
- Modify: `src/GameInterface/Social/ChatWindow.tsx`, `src/GameInterface/Social/ChatPopups.tsx`

- [ ] **Step 1: teste do texto ao vivo**

```ts
// src/GameInterface/World/liveText.test.ts
import { describe, expect, test } from "bun:test";
import { liveText } from "@/GameInterface/World/liveText";
import type { LiveScoreView } from "@/types/rivalsTypes";

const t = (k: string, o?: Record<string, unknown>) => `${k}|${JSON.stringify(o ?? {})}`;
const live = { status: "live", minute: 67, score: { for: 1, against: 0 } } as LiveScoreView;

describe("liveText", () => {
  test("by status", () => {
    expect(liveText(t, live)).toBe(`rivals.liveLine|${JSON.stringify({ score: "1–0", minute: 67 })}`);
    expect(liveText(t, { ...live, status: "half" })).toBe(`rivals.halfLine|${JSON.stringify({ score: "1–0" })}`);
    expect(liveText(t, { ...live, status: "ended" })).toContain("rivals.endedLine");
    expect(liveText(t, { ...live, status: "stale" })).toContain("rivals.staleLine");
  });
});
```

Run: `bun test src/GameInterface/World/liveText.test.ts` → FAIL.

- [ ] **Step 2: peças puras**

```ts
// src/GameInterface/World/liveText.ts
import type { LiveScoreView } from "@/types/rivalsTypes";

type T = (key: string, opts?: Record<string, unknown>) => string;

const KEY = { live: "rivals.liveLine", half: "rivals.halfLine", ended: "rivals.endedLine", stale: "rivals.staleLine" } as const;

/** "ao vivo · 1–0 · 67'" (or half-time / full time / interrupted). */
export function liveText(t: T, l: Pick<LiveScoreView, "status" | "minute" | "score">): string {
  const score = `${l.score.for}–${l.score.against}`;
  return l.status === "live" ? t(KEY.live, { score, minute: l.minute }) : t(KEY[l.status], { score });
}
```

```ts
// src/GameInterface/World/reactionIcons.ts
import type { IconName } from "@/GameInterface/Icons";
import type { ReactionId } from "@/types/rivalsTypes";

export const REACTION_ICON: Record<ReactionId, IconName> = {
  applause: "react-applause",
  fire: "react-fire",
  laugh: "react-laugh",
  sorry: "react-sorry",
};
```

Run: `bun test src/GameInterface/World/liveText.test.ts` → PASS.

- [ ] **Step 3: `RivalForm`**

```tsx
// src/GameInterface/World/RivalForm.tsx
import { useTranslation } from "react-i18next";
import { RESULT_PILL } from "@/GameInterface/formColors";

/** A friend's last results as five small markers (oldest first). */
export function RivalForm({ form }: { form: readonly ("W" | "D" | "L")[] }) {
  const { t } = useTranslation();
  if (form.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          title={t(`dashboard.home.formLong.${r}`)}
          className={`w-6 h-6 rounded text-sm font-display font-bold flex items-center justify-center ${RESULT_PILL[r]}`}
        >
          {t(`dashboard.home.form.${r}`)}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: `TauntActions`**

```tsx
// src/GameInterface/World/TauntActions.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { REACTION_ICON } from "@/GameInterface/World/reactionIcons";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { WorldApiError } from "@/GameInterface/World/worldApi";
import { REACTIONS, tauntsFor } from "@/Domain/rivals/taunts";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { TauntGroup, TauntKind, TauntTarget } from "@/types/rivalsTypes";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded bg-transparent border-0 cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-50";

/** Reactions (icons) and ready phrases for a friend's result or live game. Sent to the league chat. */
export function TauntActions({ saveId, target, groups }: { saveId: string; target: TauntTarget; groups: readonly TauntGroup[] }) {
  const { t } = useTranslation();
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"sent" | WorldApiError | null>(null);
  const phrases = tauntsFor(groups).slice(0, RIVALS.MENU_PHRASES);

  async function send(kind: TauntKind, id: string) {
    setBusy(true);
    const r = await rivalsApi.taunt(saveId, { target, kind, id });
    setBusy(false);
    setPhrasesOpen(false);
    setStatus(r.ok ? "sent" : r.error);
    setTimeout(() => setStatus(null), 2500);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1" role="group" aria-label={t("rivals.actionsLabel")}>
        {REACTIONS.map((id) => (
          <button
            key={id}
            type="button"
            className={ICON_BUTTON}
            disabled={busy}
            onClick={() => void send("reaction", id)}
            aria-label={t(`rivals.reactions.${id}`)}
            title={t(`rivals.reactions.${id}`)}
          >
            <Icon name={REACTION_ICON[id]} size={16} />
          </button>
        ))}
        {phrases.length > 0 && (
          <Button variant="secondary" flush className="h-8 ml-1" disabled={busy} onClick={() => setPhrasesOpen((o) => !o)} aria-expanded={phrasesOpen}>
            {t("rivals.phrases")}
          </Button>
        )}
        {status && (
          <span className={`text-sm ml-1 ${status === "sent" ? "text-muted-foreground" : "text-destructive"}`}>
            {status === "sent" ? t("rivals.sent") : t(`world.errors.${status}`)}
          </span>
        )}
      </div>
      {phrasesOpen && (
        <ul className="m-0 p-0 list-none flex flex-col">
          {phrases.map((id) => (
            <li key={id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("phrase", id)}
                className="w-full text-left text-sm text-foreground italic bg-transparent border-0 rounded px-2 py-1.5 cursor-pointer hover:bg-secondary/40"
              >
                {t(`rivals.taunts.${id}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `TauntLine` e o chat**

```tsx
// src/GameInterface/Social/TauntLine.tsx
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { REACTION_ICON } from "@/GameInterface/World/reactionIcons";
import { scoreLineOf } from "@/Domain/rivals/results";
import type { ReactionId, TauntMeta } from "@/types/rivalsTypes";

/** A taunt in the chat: crest, "Vasco 0–3 Bahia", and the reaction icon or the phrase, in the reader's language. */
export function TauntLine({ taunt }: { taunt: TauntMeta }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <ClubLogo logoUrl={squadLogoUrl(taunt.clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
        <span className="tabular-nums">{scoreLineOf(taunt)}</span>
        {taunt.live && <span className="text-muted-foreground tabular-nums">· {t("rivals.liveMinute", { minute: taunt.minute ?? 0 })}</span>}
      </span>
      {taunt.kind === "reaction" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon name={REACTION_ICON[taunt.id as ReactionId]} size={16} />
          <span>{t(`rivals.reactions.${taunt.id}`)}</span>
        </span>
      ) : (
        <span className="italic">{t(`rivals.taunts.${taunt.id}`)}</span>
      )}
    </span>
  );
}
```

Em `src/GameInterface/Social/ChatWindow.tsx`: importe `TauntLine` e troque a linha `{m.body}` por
`{m.taunt ? <TauntLine taunt={m.taunt} /> : m.body}`.

- [ ] **Step 6: avisos no canto**

Em `src/GameInterface/Social/ChatPopups.tsx`:

1. Imports:

```tsx
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TauntLine } from "@/GameInterface/Social/TauntLine";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { liveGroups } from "@/Domain/rivals/taunts";
import { resultLetter, scoreLineOf } from "@/Domain/rivals/results";
import { loadSession } from "@/GameInterface/gameSession";
import type { RivalPopup } from "@/GameInterface/Social/socialState";
```

2. No `PopupCard`, troque `{popup.body}` por `{popup.taunt ? <TauntLine taunt={popup.taunt} /> : popup.body}`.
3. Novo cartão:

```tsx
const RESULT_BORDER = { W: "border-primary", D: "border-muted-foreground", L: "border-destructive" } as const;

function RivalPopupCard({ popup }: { popup: RivalPopup }) {
  const { t } = useTranslation();
  const s = useSocial();
  const saveId = loadSession()?.saveId ?? "";
  const r = popup.kind === "result" ? popup.result : null;
  const l = popup.kind === "goal" ? popup.live : null;
  const nickname = r?.nickname ?? l!.nickname;
  const clubId = r?.clubId ?? l!.clubId;
  const border = r ? RESULT_BORDER[resultLetter(r)] : "border-border";
  const text = r
    ? `${nickname} · ${scoreLineOf(r)}`
    : t("rivals.goalPopup", { nickname, score: `${l!.score.for}–${l!.score.against}`, minute: l!.minute });
  return (
    <div className={`pointer-events-auto w-[300px] rounded-md border ${border} bg-card shadow-lg flex flex-col gap-2 p-3`}>
      <div className="flex items-start gap-2">
        <ClubLogo logoUrl={squadLogoUrl(clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
        <span className="flex-1 min-w-0 text-sm text-foreground tabular-nums break-words">{text}</span>
        <button
          type="button"
          onClick={() => s.dismissRivalPopup(popup.key)}
          aria-label={t("social.popup.dismiss")}
          className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {saveId && (
        <TauntActions
          saveId={saveId}
          target={r ? { result: r.id } : { live: l!.seatId }}
          groups={r ? r.situations : liveGroups(l!)}
        />
      )}
    </div>
  );
}
```

4. `ChatPopups` passa a mostrar os dois:

```tsx
export function ChatPopups() {
  const s = useSocial();
  if (s.popups.length === 0 && s.rivalPopups.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-14 left-6 z-50 flex flex-col gap-2 pointer-events-none">
      {s.rivalPopups.map((p) => (
        <RivalPopupCard key={p.key} popup={p} />
      ))}
      {s.popups.map((p) => (
        <PopupCard key={p.room} popup={p} />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: rodar**

Run: `bun run typecheck && bun test src/GameInterface && bun run ui:audit`
Expected: PASS e o relatório do `ui:audit` sem violação nos arquivos novos (se acusar `text-button` no botão "Frase",
ele já é `<Button>`; se acusar `icon-size`, os ícones têm 16px).

- [ ] **Step 8: commit**

```bash
git add src/GameInterface/World/reactionIcons.ts src/GameInterface/World/RivalForm.tsx src/GameInterface/World/liveText.ts src/GameInterface/World/liveText.test.ts src/GameInterface/World/TauntActions.tsx src/GameInterface/Social/TauntLine.tsx src/GameInterface/Social/ChatWindow.tsx src/GameInterface/Social/ChatPopups.tsx src/GameInterface/Icons.tsx
git commit -m "feat(rivals): taunt actions, taunts in the chat, result and goal notices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: abas Rivais e Resultados em `/world`

**Files:**
- Create: `src/GameInterface/World/RivalsTable.tsx`, `src/GameInterface/World/ResultsFeed.tsx`
- Modify: `src/GameInterface/World/WorldScreen.tsx`
- Modify: `src/GameInterface/World/worldNav.ts` (+ `worldNav.test.ts`)

- [ ] **Step 1: teste da aba pela URL**

Acrescente a `src/GameInterface/World/worldNav.test.ts`:

```ts
import { worldTabOf } from "@/GameInterface/World/worldNav";

describe("worldTabOf", () => {
  test("reads the tab from the query", () => {
    expect(worldTabOf("?tab=standings")).toBe("standings");
    expect(worldTabOf("?tab=rivals")).toBe("rivals");
    expect(worldTabOf("?tab=results")).toBe("results");
    expect(worldTabOf("?tab=nope")).toBe("league");
    expect(worldTabOf("")).toBe("league");
  });
});
```

(confira os imports de `describe`/`test`/`expect` no topo do arquivo.)

Run: `bun test src/GameInterface/World/worldNav.test.ts` → FAIL.

Em `src/GameInterface/World/worldNav.ts`:

```ts
export type WorldTab = "league" | "standings" | "rivals" | "results";

/** The `/world` tab from `location.search`. */
export function worldTabOf(search: string): WorldTab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "standings" || tab === "rivals" || tab === "results" ? tab : "league";
}
```

Run → PASS.

- [ ] **Step 2: `RivalsTable`**

```tsx
// src/GameInterface/World/RivalsTable.tsx
import { useTranslation } from "react-i18next";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { RivalForm } from "@/GameInterface/World/RivalForm";
import { liveText } from "@/GameInterface/World/liveText";
import { seatManagerId } from "@/Domain/seats/seats";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { scoreLineOf } from "@/Domain/rivals/results";
import type { RivalRow } from "@/types/rivalsTypes";

/** One row per friend (rivals, multiplayer part 6); a click opens the friend's results. */
export function RivalsTable({ rows, onSelect }: { rows: RivalRow[]; onSelect: (seatId: string) => void }) {
  const { t, i18n } = useTranslation();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("rivals.noRivals")}</p>;
  return (
    <StatsTable
      head={
        <>
          <StatsHead align="center">{t("rivals.col.rank")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.manager")}</span></StatsHead>
          <StatsHead>{t("world.members.manager")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.club")}</span></StatsHead>
          <StatsHead>{t("world.members.club")}</StatsHead>
          <StatsHead align="center">{t("rivals.col.position")}</StatsHead>
          <StatsHead>{t("rivals.col.form")}</StatsHead>
          <StatsHead>{t("rivals.col.last")}</StatsHead>
          <StatsHead>{t("rivals.col.next")}</StatsHead>
          <StatsHead>{t("rivals.col.live")}</StatsHead>
        </>
      }
    >
      {rows.map((r) => (
        <StatsRow key={r.seatId} highlight={r.me} onActivate={() => onSelect(r.seatId)}>
          <RankCell rank={r.friendsRank} />
          <StatsCell className="w-12">
            <ManagerFaceImage
              manager={{ id: seatManagerId(r.seatId), name: r.managerName, face: r.face, nationality: managerFaceCountry(r.nationalityIso) }}
              clubColors={r.clubColors}
              size={32}
            />
          </StatsCell>
          <NameCell highlight={r.me}>
            <span className="flex flex-col min-w-0">
              <span className="truncate">{r.nickname ?? r.managerName}</span>
              {r.nickname && <span className="text-sm font-normal text-muted-foreground truncate">{r.managerName}</span>}
            </span>
          </NameCell>
          <CrestCell squadId={r.clubId || null} />
          <ClubCell>{r.clubId ? r.clubName : t("world.members.unemployed")}</ClubCell>
          <NumberCell>{r.leaguePosition ? t("rivals.positionValue", { position: r.leaguePosition }) : "—"}</NumberCell>
          <StatsCell><RivalForm form={r.form} /></StatsCell>
          <StatsCell>
            <span className="text-sm tabular-nums">{r.last ? scoreLineOf(r.last) : "—"}</span>
          </StatsCell>
          <StatsCell>
            <span className="text-sm tabular-nums">
              {r.next ? t("rivals.nextValue", { date: formatDay(r.next.date, i18n.language), opponent: r.next.opponentName }) : "—"}
            </span>
          </StatsCell>
          <StatsCell>
            {r.live
              ? <span className="text-sm tabular-nums text-primary">{liveText(t, r.live)}</span>
              : <span className="text-sm text-muted-foreground">—</span>}
          </StatsCell>
        </StatsRow>
      ))}
    </StatsTable>
  );
}
```

- [ ] **Step 3: `ResultsFeed`**

```tsx
// src/GameInterface/World/ResultsFeed.tsx
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Label } from "@/GameInterface/ui/Label";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { WorldApiError } from "@/GameInterface/World/worldApi";
import { scoreLineOf } from "@/Domain/rivals/results";
import type { RivalRow, SeatResult } from "@/types/rivalsTypes";

/** The league's results by day, filtered by friend, each with the banter actions (multiplayer part 6). */
export function ResultsFeed({ saveId, mySeatId, rows, seat, onSeat, version }: {
  saveId: string;
  mySeatId: string | null;
  rows: RivalRow[];
  seat: string | null;
  onSeat: (seat: string | null) => void;
  version: number;
}) {
  const { t, i18n } = useTranslation();
  const [results, setResults] = useState<SeatResult[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<WorldApiError | null>(null);

  const load = useCallback(async (offset: number) => {
    const r = await rivalsApi.results(saveId, { seat, offset });
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setResults((prev) => (offset === 0 ? r.data.results : [...(prev ?? []), ...r.data.results]));
    setHasMore(r.data.hasMore);
  }, [saveId, seat]);

  useEffect(() => { void load(0); }, [load, version]);

  const byDay: [string, SeatResult[]][] = [];
  for (const r of results ?? []) {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === r.date) last[1].push(r);
    else byDay.push([r.date, [r]]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>{t("rivals.filterLabel")}</Label>
        <OptionChips<string>
          aria-label={t("rivals.filterLabel")}
          value={seat ?? "all"}
          onChange={(k) => onSeat(k === "all" ? null : k)}
          options={[
            { key: "all", label: t("rivals.filterAll") },
            ...rows.map((r) => ({ key: r.seatId, label: r.nickname ?? r.managerName })),
          ]}
        />
      </div>
      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!results && !error && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
      {results && results.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("rivals.empty")}</p>}
      {byDay.map(([date, list]) => (
        <section key={date} className="flex flex-col gap-2">
          <Label>{formatDay(date, i18n.language, "long")}</Label>
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-border/50 border border-border rounded-md">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <ClubLogo logoUrl={squadLogoUrl(r.clubId)} className="w-8 h-8 shrink-0" />
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-foreground truncate">{r.nickname}</span>
                  <span className="text-sm tabular-nums text-foreground">
                    {scoreLineOf(r)}
                    {r.decider && <span className="text-muted-foreground"> · {t("rivals.pens", r.decider.penalties)}</span>}
                  </span>
                </span>
                {r.seatId !== mySeatId && <TauntActions saveId={saveId} target={{ result: r.id }} groups={r.situations} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <Button variant="secondary" flush className="self-start" onClick={() => void load(results?.length ?? 0)}>
          {t("rivals.loadMore")}
        </Button>
      )}
    </div>
  );
}
```

(confira que `Label` existe em `@/GameInterface/ui/Label` — o `WorldScreen` já importa; e o tipo da prop `options`
de `OptionChips` — `{ key, label, title? }`.)

- [ ] **Step 4: `WorldScreen`**

Em `src/GameInterface/World/WorldScreen.tsx`:

1. Troque `type WorldTab = "league" | "standings";` e `initialTab` por:

```tsx
import { worldTabOf, type WorldTab } from "@/GameInterface/World/worldNav";
const initialTab = (): WorldTab => (typeof window !== "undefined" ? worldTabOf(window.location.search) : "league");
```

(junte o import ao de `joinLink` já existente de `worldNav`.)

2. Imports: `RivalsTable`, `ResultsFeed`, `rivalsApi`, `type RivalsView` (de `@/types/rivalsTypes`).
3. Estado, depois de `standingsError`:

```tsx
  const [rivals, setRivals] = useState<RivalsView | null>(null);
  const [rivalsError, setRivalsError] = useState<WorldApiError | null>(null);
  const [resultsSeat, setResultsSeat] = useState<string | null>(null);
```

4. Depois do efeito que carrega `standings`:

```tsx
  // Rivals (multiplayer part 6): reload with the league's results, live scores and member events.
  useEffect(() => {
    if (!saveId || (activeTab !== "rivals" && activeTab !== "results")) return;
    let cancelled = false;
    void rivalsApi.rivals(saveId).then((r) => {
      if (cancelled) return;
      if (r.ok) { setRivals(r.data); setRivalsError(null); } else setRivalsError(r.error);
    });
    return () => { cancelled = true; };
  }, [saveId, activeTab, social.worldVersion, social.rivalsVersion]);
```

5. `changeTab` passa a gravar qualquer aba diferente de `league`:

```tsx
    if (next === "league") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
```

6. As abas do `SegmentedTabs`:

```tsx
          tabs={[
            { key: "league", label: t("world.standings.tabLeague") },
            { key: "standings", label: t("world.standings.tab") },
            ...(view.phase !== "lobby"
              ? [{ key: "rivals" as const, label: t("rivals.tabRivals") }, { key: "results" as const, label: t("rivals.tabResults") }]
              : []),
          ]}
```

7. Depois da `section` da aba `standings`:

```tsx
      {view && activeTab === "rivals" && (
        <section className="flex flex-col gap-3">
          <SectionTitle>{t("rivals.rivalsTitle")}</SectionTitle>
          <p className="text-sm text-muted-foreground m-0">{t("rivals.rivalsHint")}</p>
          {rivalsError && <Notice kind="error">{t(`world.errors.${rivalsError}`)}</Notice>}
          {!rivals && !rivalsError && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
          {rivals && (
            <RivalsTable
              rows={rivals.rows}
              onSelect={(seatId) => { setResultsSeat(seatId); changeTab("results"); }}
            />
          )}
        </section>
      )}

      {view && activeTab === "results" && (
        <section className="flex flex-col gap-3">
          <SectionTitle>{t("rivals.resultsTitle")}</SectionTitle>
          <ResultsFeed
            saveId={saveId}
            mySeatId={view.mySeatId}
            rows={rivals?.rows ?? []}
            seat={resultsSeat}
            onSeat={setResultsSeat}
            version={social.rivalsVersion}
          />
        </section>
      )}
```

- [ ] **Step 5: rodar**

Run: `bun run typecheck && bun test src/GameInterface/World && bun run ui:audit`
Expected: PASS; `ui:audit` sem violação nova.

- [ ] **Step 6: commit**

```bash
git add src/GameInterface/World/RivalsTable.tsx src/GameInterface/World/ResultsFeed.tsx src/GameInterface/World/WorldScreen.tsx src/GameInterface/World/worldNav.ts src/GameInterface/World/worldNav.test.ts
git commit -m "feat(rivals): rivals and results tabs on the league screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 13: cartão Rivais no Painel

**Files:**
- Modify: `src/GameInterface/Dashboard/HomeCards.tsx`
- Modify: `src/GameInterface/DashboardScreen.tsx`

- [ ] **Step 1: o cartão**

Em `src/GameInterface/Dashboard/HomeCards.tsx`, imports `RivalForm`, `liveText` e `type RivalRow`; no fim do arquivo:

```tsx
// ── Rivals (multiplayer part 6) ──────────────────────────────────────────────

/** One line per friend: nickname, league place, form, and the live score while he plays. */
export function RivalsCard({ rows }: { rows: RivalRow[] }) {
  const { t } = useTranslation();
  const friends = rows.filter((r) => !r.me);
  return (
    <HomeCard title={t("rivals.card.title")} href="/world?tab=rivals" linkLabel={t("rivals.card.link")}>
      {friends.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("rivals.noRivals")}</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {friends.map((r) => (
            <li key={r.seatId} className="flex items-center gap-3 min-h-8">
              <span className="font-semibold text-foreground truncate flex-1 min-w-0">{r.nickname ?? r.managerName}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {r.leaguePosition ? t("rivals.positionValue", { position: r.leaguePosition }) : "—"}
              </span>
              <RivalForm form={r.form} />
              {r.live && <span className="text-sm tabular-nums text-primary">{liveText(t, r.live)}</span>}
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
```

- [ ] **Step 2: o Painel**

Em `src/GameInterface/DashboardScreen.tsx`:

1. Imports: `RivalsCard` (no import de `HomeCards`), `rivalsApi`, `useSocial`, `type RivalRow`.
2. Depois do efeito de `friendsRank`:

```tsx
  // Rivals card (multiplayer part 6): only in a friends' league; reloads with results and live scores.
  const social = useSocial();
  const [rivals, setRivals] = useState<RivalRow[] | null>(null);
  useEffect(() => {
    if (!saveId || !groupAdvance) { setRivals(null); return; }
    let cancelled = false;
    void rivalsApi.rivals(saveId).then((r) => { if (!cancelled) setRivals(r.ok ? r.data.rows : null); });
    return () => { cancelled = true; };
  }, [saveId, groupAdvance, currentDate, social.rivalsVersion]);
```

3. No JSX, logo depois do primeiro `div` em grade (`NextMatchCard` + liga), antes de `<WeekCard`:

```tsx
      {rivals && rivals.length >= 2 && <RivalsCard rows={rivals} />}
```

- [ ] **Step 3: rodar**

Run: `bun run typecheck && bun test src/GameInterface/Dashboard && bun run ui:audit`
Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add src/GameInterface/Dashboard/HomeCards.tsx src/GameInterface/DashboardScreen.tsx
git commit -m "feat(rivals): rivals card on the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 14: faixa ao vivo na partida e envio do placar

**Files:**
- Create: `src/GameInterface/World/useLiveRivals.ts`
- Create: `src/GameInterface/World/LiveRivalsStrip.tsx`
- Modify: `src/GameInterface/MatchScreen.tsx`

A partida ao vivo não fica dentro do `Layout` (sem `SocialProvider`): o hook abre um socket próprio, só num mundo em
grupo.

- [ ] **Step 1: o hook**

```ts
// src/GameInterface/World/useLiveRivals.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import { parseServerEvent } from "@/GameInterface/Social/socialState";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { ClientEvent } from "@/types/socialTypes";
import type { LiveScoreFrame, LiveScoreView } from "@/types/rivalsTypes";

const RETRY_MS = 3_000;
const MAX_RETRIES = 5;
const LOGOUT_CLOSE_CODE = 4001;

/**
 * Live scores of the friends during the user's own live match (rivals, multiplayer part 6): its own socket (the match
 * page has no social provider), the friends' `friend_live`, and `send` for this match's `live_score` frames.
 */
export function useLiveRivals(target: { saveId: string; seatId: string } | null) {
  const [live, setLive] = useState<Record<string, LiveScoreView>>({});
  const [highlight, setHighlight] = useState<Record<string, true>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<ClientEvent[]>([]);
  const saveId = target?.saveId ?? null;
  const seatId = target?.seatId ?? null;

  useEffect(() => {
    if (!saveId || !seatId) return;
    let stopped = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    void rivalsApi.live(saveId).then((r) => {
      if (stopped || !r.ok) return;
      setLive(Object.fromEntries(r.data.live.filter((l) => l.seatId !== seatId).map((l) => [l.seatId, l])));
    });

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retries = 0;
        ws.send(JSON.stringify({ type: "hello", saveId, hidden: false } satisfies ClientEvent));
        for (const e of pending.current.splice(0)) ws.send(JSON.stringify(e));
      };
      ws.onmessage = (m) => {
        const ev = parseServerEvent(m.data);
        if (!ev || ev.type !== "friend_live" || ev.saveId !== saveId || ev.seatId === seatId) return;
        setLive((prev) => {
          const next = { ...prev };
          if (ev.live) next[ev.seatId] = ev.live;
          else delete next[ev.seatId];
          return next;
        });
        if (ev.goal) {
          setHighlight((h) => ({ ...h, [ev.seatId]: true }));
          const t = setTimeout(() => {
            timers.delete(t);
            setHighlight((h) => { const n = { ...h }; delete n[ev.seatId]; return n; });
          }, RIVALS.STRIP_HIGHLIGHT_MS);
          timers.add(t);
        }
      };
      ws.onclose = (e) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped || e.code === LOGOUT_CLOSE_CODE || retries >= MAX_RETRIES) return;
        retries++;
        timer = setTimeout(connect, RETRY_MS);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const t of timers) clearTimeout(t);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [saveId, seatId]);

  const send = useCallback((frame: Omit<LiveScoreFrame, "saveId">) => {
    if (!saveId) return;
    const event: ClientEvent = { type: "live_score", saveId, ...frame };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
    else pending.current.push(event);
  }, [saveId]);

  const list = Object.values(live).sort((a, b) => a.nickname.localeCompare(b.nickname));
  return { live: list, highlight, send };
}
```

- [ ] **Step 2: a faixa**

```tsx
// src/GameInterface/World/LiveRivalsStrip.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { liveGroups } from "@/Domain/rivals/taunts";
import type { LiveScoreView } from "@/types/rivalsTypes";

/**
 * Friends playing now, above the pitch of the user's own live match: "Fabio · 1–0 · 67'". A friend's goal lights his
 * line for a few seconds with the scorer; a click opens the banter actions without pausing the match.
 */
export function LiveRivalsStrip({ saveId, live, highlight }: {
  saveId: string;
  live: LiveScoreView[];
  highlight: Record<string, true>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  if (live.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-border bg-card/60 px-4 py-1.5" aria-label={t("rivals.stripLabel")} role="region">
      <ul className="m-0 p-0 list-none max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <Icon name="radio" size={16} />
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t("rivals.liveBadge")}</span>
        </li>
        {live.map((l) => {
          const lit = !!highlight[l.seatId];
          return (
            <li key={l.seatId} className="relative">
              <button
                type="button"
                onClick={() => setOpen(open === l.seatId ? null : l.seatId)}
                aria-expanded={open === l.seatId}
                className={`flex items-center gap-1.5 min-h-8 px-2 rounded border-0 cursor-pointer text-sm tabular-nums transition-colors ${lit ? "bg-primary/15 text-primary" : "bg-transparent text-foreground hover:bg-secondary/40"}`}
              >
                <ClubLogo logoUrl={squadLogoUrl(l.clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                <span className="font-semibold">{l.nickname}</span>
                <span>· {l.score.for}–{l.score.against}</span>
                <span className="text-muted-foreground">· {l.status === "live" ? t("rivals.liveMinute", { minute: l.minute }) : t(`rivals.${l.status}Line`, { score: `${l.score.for}–${l.score.against}` })}</span>
                {lit && l.lastGoal?.scorer && <span>· {t("rivals.scorer", { name: l.lastGoal.scorer })}</span>}
              </button>
              {open === l.seatId && (
                <div className="absolute left-0 top-full mt-1 z-40 w-[280px] rounded-md border border-border bg-card shadow-lg p-2">
                  <TauntActions saveId={saveId} target={{ live: l.seatId }} groups={liveGroups(l)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: o `MatchScreen`**

Em `src/GameInterface/MatchScreen.tsx`:

1. Imports:

```tsx
import { useLiveRivals } from "@/GameInterface/World/useLiveRivals";
import { LiveRivalsStrip } from "@/GameInterface/World/LiveRivalsStrip";
import type { LivePhase } from "@/types/rivalsTypes";
```

2. Junto dos outros `useRef`/`useMemo` do topo do componente (perto de `matchContextRef`):

```tsx
  // Rivals (multiplayer part 6): in a friends' league the friends' live scores show above the pitch, and this
  // match's score goes to them (`live_score`). Never in solo, never in a national team's game.
  const liveTarget = useMemo(() => {
    const s = loadSession();
    return s?.groupAdvance && s.saveId && s.seatId ? { saveId: s.saveId, seatId: s.seatId } : null;
  }, []);
  const liveRivals = useLiveRivals(liveTarget);
  const sendLiveRef = useRef(liveRivals.send);
  sendLiveRef.current = liveRivals.send;
  const liveFixtureRef = useRef<string | null>(null);
```

3. No `.then((data) => { ... })` do `match-setup`, logo depois de `setMatchFixture(data.fixture);`:

```tsx
        liveFixtureRef.current = liveTarget && !data.national ? (data.matchDay?.fixtureId ?? data.fixture.id) : null;
```

4. Um efeito novo (depois do efeito do `goalScored` que faz `setGoalFlash`):

```tsx
  useEffect(() => {
    const send = (phase: LivePhase, minute: number, score: { A: number; B: number }, scorer?: string) => {
      const fixtureId = liveFixtureRef.current;
      if (!fixtureId) return;
      sendLiveRef.current({
        fixtureId, phase, minute: Math.max(0, Math.min(130, minute)),
        score: { for: score.A, against: score.B }, ...(scorer ? { scorer } : {}),
      });
    };
    const now = () => gameStateRef.current;
    const offs = [
      gameBus.on("matchStart", () => send("start", 0, now()?.score ?? { A: 0, B: 0 })),
      gameBus.on("goalScored", (e) => send("goal", e.minute, e.score, now()?.players.find((p) => p.id === e.scorerId)?.name)),
      gameBus.on("halfTime", (e) => send("half", 45, e.score)),
      gameBus.on("matchEnd", (e) => {
        const s = now();
        send("end", s ? matchMinute(s) : 90, e.score);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
```

(O time A é sempre o clube do usuário: `score.A` = a favor.)

5. No JSX, logo depois do `</header>` do placar (antes de `<main className="flex-1 flex justify-center overflow-hidden min-h-0">`):

```tsx
      {liveTarget && <LiveRivalsStrip saveId={liveTarget.saveId} live={liveRivals.live} highlight={liveRivals.highlight} />}
```

- [ ] **Step 4: rodar**

Run: `bun run typecheck && bun test src/GameInterface && bun run ui:audit`
Expected: PASS.

- [ ] **Step 5: conferir a partida ao vivo (memória "check the live match")**

Com dois usuários (`.claude/rules/dev-login.md`: `localhost` e `127.0.0.1?as=2`) numa liga de amigos com dois clubes
que jogam no mesmo dia: o usuário 1 joga ao vivo; o usuário 2 vê o placar no cartão Rivais e o aviso de gol; o usuário
1, numa partida ao vivo do mesmo dia, vê a faixa e consegue reagir sem a partida pausar. Abra `/match` numa carreira
solo e confirme que nada muda (sem faixa, sem socket extra). Anote no relatório o que foi visto.

- [ ] **Step 6: commit**

```bash
git add src/GameInterface/World/useLiveRivals.ts src/GameInterface/World/LiveRivalsStrip.tsx src/GameInterface/MatchScreen.tsx
git commit -m "feat(rivals): live friends strip in the match and live score sending

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: documentação

**Files:**
- Modify: `.claude/rules/game/multiplayer.md`, `.claude/rules/social.md`, `.claude/rules/project-structure.md`

- [ ] **Step 1: `multiplayer.md`**

Acrescente ao fim de `.claude/rules/game/multiplayer.md`:

```markdown
## Parte 6: rivais

Spec: `docs/superpowers/specs/2026-10-19-multiplayer-rivals-design.md`. Plano: `docs/superpowers/plans/2026-10-19-multiplayer-rivals.md`.
Versão **4.34**. Vale em mundos `mode: "multi"` com `world`; o solo não muda. Sem efeito de partida (`/test`, `/lab`: nada).

### Regra

- **Resultados do dia:** depois de cada dia que o executor roda (`stepWorld`, dentro do lock, depois do `flush` do dia),
  `recordDayResults` (`src/backend/rivals/rivalsWorld.ts`) monta os jogos dos clubes humanos a partir de
  `outcome.payload.events` (`buildSeatResults`, `src/Domain/rivals/results.ts`) e grava em `saves/{id}/rivalsFeed.json`
  (`SeatResult[]`, mais novos primeiro, até `RIVALS.FEED_MAX` 300, id `<data>:<competição>:<fixtureId>:<seatId>`, um id
  repetido não duplica). Um jogo entre dois assentos vira dois resultados. Todo membro recebe
  `world_results { saveId, results }`.
- **Situações** (`resultSituations`): `win`/`draw`/`loss` sempre; `big_win`/`big_loss` (saldo ≥ 3), `home_loss`,
  `away_win`, `comeback_win`, `blown_lead`, `late_equalizer` / `late_winner` (88' ou depois, pelos minutos dos gols),
  `shootout_win`/`shootout_loss` (empate decidido nos pênaltis).
- **Placar ao vivo:** o `MatchScreen` de um mundo em grupo manda `live_score { saveId, fixtureId, phase, minute, score:
  { for, against }, scorer? }` (`start`, `goal`, `half`, `end`; nada em jogo de seleção) por um socket próprio
  (`useLiveRivals`). O servidor (`src/backend/rivals/liveScores.ts`, em memória) aceita só de um membro, para o jogo não
  jogado do clube do assento na data do mundo; o placar só cresce (um gol soma, o resto não muda), o minuto não volta,
  0..130, até 40 eventos por jogo, 30 frames por minuto por socket; o autor só fica se for nome de um dos dois elencos.
  Frame recusado: silêncio. Repasse `friend_live { saveId, seatId, live, goal? }` aos outros membros; `end` fica 10 min,
  15 min sem evento = interrompido, 30 min = some (varredura de 30 s junto da presença); o dia rodado tira os jogos
  daquele dia (`clearLiveForDay`). Provisório: o oficial é o resultado do dia.
- **Resenha:** `POST /api/worlds/:saveId/taunts { target: { result } | { live: seatId }, kind, id }` (membro; 409
  `lobby` / `notMulti` / `noNickname`, 404 alvo inexistente, 400 `self` / `invalidTaunt` / `invalidBody`, 429
  `rateLimited` com o limite do chat). 4 reações (`applause`, `fire`, `laugh`, `sorry`) e frases do catálogo
  (`src/Domain/rivals/taunts.ts`, 4 por situação e por gol ao vivo, `rivals.taunts.<id>`); a frase tem que ser de uma
  situação do alvo. Vira mensagem da sala `world:<saveId>` com `chat_messages.meta = { taunt }` (ids e o placar real)
  e um `body` em inglês; nenhum texto livre.

### Rotas (`src/backend/rivals/rivalsRoutes.ts`, membro; solo 409 `notMulti`)

| Rota | Faz |
|---|---|
| `GET /api/worlds/:saveId/rivals` | `{ rows: RivalRow[] }`: apelido, rosto, clube, posição na liga, forma (5 do feed), último resultado, próximo jogo, posição e pontos na liga de amigos, placar ao vivo |
| `GET /api/worlds/:saveId/results?seat=&offset=&limit=` | Feed paginado (limite 1..50, 400 fora) |
| `GET /api/worlds/:saveId/live` | `{ live: LiveScoreView[] }` |
| `POST /api/worlds/:saveId/taunts` | Resenha (acima) |

### Telas

- `/world`: abas **Rivais** (`RivalsTable`, clicar abre os resultados do amigo) e **Resultados** (`ResultsFeed`, por
  dia, filtro por amigo, ações de resenha); `?tab=rivals|results`.
- Painel: cartão **Rivais** (`RivalsCard`) com 2+ técnicos.
- Avisos no canto (`ChatPopups`): resultado de amigo ("Fabio · Vasco 0–3 Bahia", borda primária / neutra / destrutiva)
  e gol ao vivo, com as ações; 8 s, no máximo 3.
- Partida ao vivo: faixa `LiveRivalsStrip` acima do campo; gol do amigo destaca 4 s com o autor; clique abre as ações
  sem pausar.
- Chat: `TauntLine` (escudo 20px, placar, ícone ou frase em itálico no idioma de quem lê). i18n `rivals.*`.

### Testes

```
bun test src/Domain/rivals src/backend/rivals src/backend/dal/rivalsFeed.dal.test.ts src/backend/groupAdvance.rivals.test.ts \
  src/backend/social src/backend/db.social.test.ts src/GameInterface/Social src/GameInterface/World src/i18n/rivals.keys.test.ts
```

### Limitações (parte 6)

- Placar ao vivo depende do navegador de quem joga: aba fechada vira "interrompido" até o dia rodar.
- O placar ao vivo é do cliente (só validado por coerência); um gol anulado pelo VAR derruba o placar e os frames
  seguintes são recusados até o placar passar do guardado.
- Estado ao vivo em memória (um processo só).
- O feed é gravado pelo executor logo depois do `flush` do dia, fora do buffer do dia: uma falha entre o `flush` e a
  gravação perde os resultados daquele dia no feed (o dia não roda de novo).
```

- [ ] **Step 2: `social.md`**

Em `.claude/rules/social.md`, na seção "Socket (`/api/ws`)", acrescente ao parágrafo dos eventos:

```markdown
Rivais (multiplayer parte 6): cliente → servidor `live_score` (só num mundo em grupo, 30 por minuto por socket,
inválido = ignorado); servidor → cliente `world_results { saveId, results }` e
`friend_live { saveId, seatId, live, goal? }`. A partida ao vivo abre um socket próprio (`useLiveRivals`), sem o
`SocialProvider`. Ver `.claude/rules/game/multiplayer.md` → "Parte 6: rivais".
```

e, na seção "Regra", uma linha:

```markdown
- `chat_messages.meta` (JSON, migração só aditiva): uma resenha guarda `{ taunt }` (ids e placar real) e
  `ChatMessageView.taunt`; o `body` é o fallback em inglês. Nenhum texto livre além do próprio chat.
```

- [ ] **Step 3: `project-structure.md`**

Em `.claude/rules/project-structure.md`, no fim da seção "Realtime: WebSocket `/api/ws`":

```markdown
Multiplayer part 6 (rivals) adds `live_score` (client → server) and `world_results` / `friend_live` (server → client);
the live match opens its own socket (`src/GameInterface/World/useLiveRivals.ts`). Live scores live in memory
(`src/backend/rivals/liveScores.ts`).
```

e na árvore de diretórios, ao lado de `worlds/`, `rivals/ (friends' results feed, live scores, taunts)` sob `backend/`.

- [ ] **Step 4: commit**

```bash
git add .claude/rules/game/multiplayer.md .claude/rules/social.md .claude/rules/project-structure.md
git commit -m "docs(rivals): multiplayer part 6 rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 16: changelog e versão 4.34

**Files:**
- Modify: `src/GameInterface/changelog/changelog.ts`
- Modify: `package.json`

- [ ] **Step 1: entrada nova**

No topo do array `changelog` (antes da entrada `4.33`):

```ts
  {
    version: "4.34",
    date: "2026-10-19",
    items: [
      {
        pt: "Liga de amigos: o resultado de cada jogo dos amigos aparece no canto da tela assim que o dia roda.",
        en: "Friends' league: each of your friends' results shows in the corner as soon as the day is played.",
      },
      {
        pt: "Nova aba Rivais na liga: posição, forma, último resultado e próximo jogo de cada amigo, e a aba Resultados com todos os jogos.",
        en: "New Rivals tab in the league: each friend's position, form, last result and next game, plus a Results tab with every game.",
      },
      {
        pt: "Placar ao vivo dos amigos que estão jogando, inclusive numa faixa acima do campo durante a sua partida.",
        en: "Live scores of friends who are playing, including a strip above the pitch during your own match.",
      },
      {
        pt: "Resenha: reaja aos jogos dos amigos com um ícone ou uma frase pronta, que vai para o chat da liga.",
        en: "Banter: react to your friends' games with an icon or a ready line, posted to the league chat.",
      },
    ],
  },
```

- [ ] **Step 2: `upcoming`**

Leia `docs/ROADMAP.md`: nada de rivais deve ficar em `upcoming`. Mantenha os itens que continuam pendentes (hoje
"Mundo público…" e "Pênaltis vistos de perto") e acrescente a próxima etapa do roadmap se ela não estiver lá, sempre em
texto de jogador, pt e en.

- [ ] **Step 3: versão**

Em `package.json`: `"version": "4.34",` (editar com a ferramenta de edição, nunca `Set-Content` do PowerShell — um BOM
quebra todas as páginas em produção).

- [ ] **Step 4: rodar**

Run: `bun test src/GameInterface/changelog`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/GameInterface/changelog/changelog.ts package.json
git commit -m "chore(release): 4.34 rivals in the friends' league

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 17: verificação final

- [ ] **Step 1: testes da etapa**

Run:

```
bun test src/Domain/rivals src/backend/rivals src/backend/dal src/backend/groupAdvance.rivals.test.ts src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/groupAdvance.live.test.ts src/backend/social src/backend/db.social.test.ts src/backend/worlds src/GameInterface src/i18n
```

Expected: tudo PASS.

- [ ] **Step 2: suíte inteira (um processo de cada vez; se faltar memória, repetir quando liberar)**

Run: `bun test`
Expected: PASS.

- [ ] **Step 3: tipos e auditoria visual**

Run: `bun run typecheck` → sem erros.
Run: `bun run ui:audit` → 0 duras e 0 leves nos arquivos novos ou alterados (`RivalsTable`, `ResultsFeed`,
`TauntActions`, `TauntLine`, `ChatPopups`, `LiveRivalsStrip`, `HomeCards`, `WorldScreen`).

- [ ] **Step 4: nenhum emoji**

Run: `git diff main --stat` e `git diff main | grep -P "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]"` → nenhuma linha.

- [ ] **Step 5: relatório**

Liste no relatório os comandos rodados e o resultado, o que foi visto no passo 5 da tarefa 14 (partida ao vivo com
dois usuários e a partida solo) e as limitações da seção "Limitações (parte 6)".
