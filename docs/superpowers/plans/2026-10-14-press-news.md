# Imprensa e notícias (Etapa 42) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletivas de imprensa do técnico do jogador em momentos marcantes (convite na inbox, efeito escondido em moral,
diretoria e torcida, promessas) e uma página de notícias do mundo gerada do que o jogo já guarda.

**Architecture:** Lógica pura em `src/Domain/press/` (gatilhos, perguntas, efeitos, promessas) e `src/Domain/news/`
(montagem das notícias do dia). E/S em `src/backend/pressWorld.ts` (passo do dia + rotas) e `src/backend/newsWorld.ts`
(coleta do dia + gravação por mês). Estado da coletiva em `SaveMeta.press`; notícias em `saves/{id}/news/{AAAA-MM}.json`.
UI: modal da coletiva a partir da inbox, página `/news` e cartão no Painel.

**Tech Stack:** Bun, TypeScript, React 19, Tailwind v4, i18next. Testes `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-14-press-news-design.md` (ler antes de começar).

**Worktree:** `C:/Projects/FMProject-press`, branch `feat/press`. Rodar tudo a partir dele. Se `src/Data` não existir:
`bun install --frozen-lockfile && mkdir -p src/Data && cp -R src/example_data/. src/Data/`.

**Convenções do repo (obrigatórias):** imports sempre com `@/`; sem migração de save; textos de tela em i18n (en e
pt-BR); visual pelo `.claude/rules/ui-standard.md` (`bun run ui:audit` sem violações nos arquivos novos); commits
terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types/pressTypes.ts` (novo) | Tipos da coletiva, promessas, estado em `SaveMeta.press`, visão do cliente |
| `src/types/newsTypes.ts` (novo) | `NewsItem`, `NewsKind`, entrada de `buildDayNews` |
| `src/Domain/press/pressConfig.ts` (novo) | Todas as constantes (`PRESS`) |
| `src/Domain/press/triggers.ts` (+ teste) | Candidatos, prioridade, limite de 7 dias, reta final, sequência sem vitória |
| `src/Domain/press/questions.ts` (+ teste) | Monta a coletiva (perguntas, respostas com tom), visão sem tom |
| `src/Domain/press/effects.ts` (+ teste) | Aplica respostas, promessas, ignorada |
| `src/Domain/boardFans/boardFans.ts` | `applyPressEffect` (exporta o uso de `moveMeters`) |
| `src/Domain/morale/morale.ts` | `afterPressAnswer` |
| `src/Domain/news/buildDayNews.ts` (+ teste) | Notícias do dia, importância, tetos, ids |
| `src/Domain/inbox/inboxEvents.ts`, `inboxTopics.ts`, `inboxThemes.ts`, `src/types/inboxTypes.ts` | Categoria `press` |
| `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `src/backend/SaveService.ts` | `news/{AAAA-MM}.json`, `SaveMeta.press` |
| `src/backend/pressWorld.ts` (novo) | Passo do dia da coletiva |
| `src/backend/newsWorld.ts` (novo) | Coleta do dia → `buildDayNews` → gravação |
| `src/backend/advanceDay.ts` | Chama os dois passos |
| `src/backend/pressRoutes.ts`, `newsRoutes.ts` (novos) + `routes.ts` | Rotas |
| `src/GameInterface/Press/*` (novo) | `PressModal`, `PressInboxBody`, `pressApi` |
| `src/GameInterface/News/*` (novo), `src/pages/news/*`, `src/index.ts` | Página `/news` |
| `src/GameInterface/Dashboard/HomeCards.tsx`, `DashboardScreen.tsx` | Cartão Notícias |
| `src/i18n/locales/en.json`, `pt-BR.json` | `press.*`, `news.*` |
| `.claude/rules/game/press.md` (novo), changelog, `package.json`, `docs/ROADMAP.md` | Documentação e versão 4.23 |

---

### Task 1: Tipos e configuração

**Files:**
- Create: `src/types/pressTypes.ts`, `src/types/newsTypes.ts`, `src/Domain/press/pressConfig.ts`
- Modify: `src/backend/SaveService.ts` (interface `SaveMeta`, l.68-145)

- [ ] **Step 1: Criar `src/types/pressTypes.ts`**

```ts
/** Etapa 42 — coletivas de imprensa do técnico do jogador. Regra: `.claude/rules/game/press.md`. */

export type PressTrigger =
  | "derby" | "knockout" | "run_in" | "ultimatum"                       // antes do jogo
  | "title" | "promoted" | "relegated" | "heavy_defeat" | "eliminated" | "winless" | "upset_win" | "upset_loss"; // depois

export type PressKind = "pre" | "post";
export type PressTopic = "match" | "squad" | "player" | "job";
export type PressTone =
  | "confident" | "cautious" | "provocative" | "blame_self"
  | "defend_squad" | "demand_squad" | "neutral"
  | "praise" | "criticize" | "protect"
  | "job_confident" | "ask_signings" | "deflect";

/** Parâmetros de texto já resolvidos (nomes congelados na criação). */
export interface PressParams {
  opponent?: string;
  opponentId?: string;
  competition?: string;   // slug
  score?: string;         // "3–1", do ponto de vista do clube do jogador
  stage?: string;         // fase de copa/continental
  player?: string;
}

export interface PressAnswer { id: string; key: string; tone: PressTone }
export interface PressQuestion {
  id: string;
  topic: PressTopic;
  key: string;            // chave i18n da pergunta
  params: PressParams;
  playerId?: string;
  answers: PressAnswer[];
}

export interface PressConference {
  id: string;
  trigger: PressTrigger;
  kind: PressKind;
  date: string;           // dia do convite
  expires: string;        // vence ao INÍCIO deste dia sem resposta
  fixtureId?: string;     // jogo de referência (pré: o jogo que vem; pós: o jogo que passou)
  params: PressParams;
  questions: PressQuestion[];
}

export type PressPromiseKind = "win" | "win_bold" | "objective";
export interface PressPromise {
  id: string;
  kind: PressPromiseKind;
  from: string;           // data da coletiva
  fixtureId?: string;     // win/win_bold numa coletiva pré-jogo: o jogo prometido
  season?: string;        // objective: SeasonObjective.season
}

export interface PressRecord {
  id: string;
  date: string;
  trigger: PressTrigger;
  answers: { questionId: string; tone: PressTone }[] | "ignored";
}

export interface PressState {
  pending?: PressConference;
  lastDate?: string;
  winless: number;        // jogos oficiais seguidos sem vencer
  promises: PressPromise[];
  history: PressRecord[]; // últimas PRESS.HISTORY
}

/** O que o cliente recebe: sem `tone`. */
export interface PressQuestionView extends Omit<PressQuestion, "answers"> { answers: { id: string; key: string }[] }
export interface PressConferenceView extends Omit<PressConference, "questions"> { questions: PressQuestionView[] }
```

- [ ] **Step 2: Criar `src/types/newsTypes.ts`**

```ts
/** Etapa 42 — notícias do mundo. Regra: `.claude/rules/game/press.md` → "Notícias". */

export type NewsKind =
  | "thrashing" | "upset" | "champion" | "promoted" | "relegated" | "new_leader"
  | "big_transfer" | "manager_sacked" | "manager_hired" | "award"
  | "star_injury" | "star_retired" | "national" | "club_record"
  | "press_quote" | "press_absent" | "press_promise_kept" | "press_promise_broken";

export interface NewsItem {
  id: string;               // `${date}:${kind}:${chave}` — estável num dia refeito
  date: string;
  kind: NewsKind;
  importance: 1 | 2 | 3;
  country?: string;
  league?: string;          // slug da liga (filtro "minha liga" / "seguidas")
  competition?: string;     // slug de copa/continental/torneio de seleção
  clubIds: string[];
  playerIds: string[];
  /** Nomes e números do dia; o texto sai de `news.<kind>.<variante>`. */
  params: Record<string, string | number>;
}
```

- [ ] **Step 3: Criar `src/Domain/press/pressConfig.ts`**

```ts
import type { PressPromiseKind, PressTone, PressTrigger } from "@/types/pressTypes";

/** Etapa 42. Todas as constantes da imprensa. */
export const PRESS = {
  /** Uma coletiva a cada N dias (título fura). */
  MIN_GAP_DAYS: 7,
  /** Convite pré-jogo N dias antes (ou amanhã se perdeu a janela). */
  PRE_DAYS_BEFORE: 2,
  /** Pós-jogo vale N dias. */
  POST_VALID_DAYS: 3,
  HISTORY: 20,
  /** Reta final: últimas N rodadas do clube, a ≤ M pontos de uma fronteira. */
  RUN_IN_ROUNDS: 3,
  RUN_IN_POINTS: 3,
  HEAVY_DEFEAT_MARGIN: 3,
  WINLESS_STEP: 5,
  UPSET_EXPECTATION: 0.5,
  /** Maior prioridade primeiro. */
  PRIORITY: [
    "title", "promoted", "relegated", "ultimatum", "knockout", "eliminated", "derby",
    "heavy_defeat", "run_in", "winless", "upset_win", "upset_loss",
  ] as PressTrigger[],
  PRE: ["derby", "knockout", "run_in", "ultimatum"] as PressTrigger[],
  /** Gatilhos de fase ruim (para `defend_squad` custar diretoria e para a 3ª resposta do jogo virar `blame_self`). */
  BAD: ["heavy_defeat", "eliminated", "winless", "ultimatum", "relegated", "upset_loss"] as PressTrigger[],
  /** Efeito imediato de cada tom. `squad`/`player` = moral; `board`/`fans` = medidores. */
  TONE: {
    confident:     { squad: 1, board: 0, fans: 1 },
    cautious:      { squad: 0, board: 0, fans: 0 },
    provocative:   { squad: 1, board: -1, fans: 2 },
    blame_self:    { squad: 0, board: -0.5, fans: 1 },
    defend_squad:  { squad: 2, board: 0, fans: 0 },
    demand_squad:  { squad: -2, board: 1, fans: 1 },
    neutral:       { squad: 0, board: 0, fans: 0 },
    praise:        { player: 4, board: 0, fans: 0 },
    criticize:     { player: -4, board: 0, fans: 0 },
    protect:       { player: 2, board: 0, fans: 0 },
    job_confident: { squad: 0, board: 1, fans: 0 },
    ask_signings:  { squad: 0, board: -2, fans: 1 },
    deflect:       { squad: 0, board: 0, fans: 0 },
  } as Record<PressTone, { squad?: number; player?: number; board: number; fans: number }>,
  /** `defend_squad` numa fase ruim. */
  DEFEND_BAD_BOARD: -1,
  /** `criticize` num profissional (`takesDemandWell`). */
  CRITICIZE_PRO: 1,
  IGNORED_BOARD: -1,
  PROMISE_OF: { confident: "win", provocative: "win_bold", job_confident: "objective" } as Partial<Record<PressTone, PressPromiseKind>>,
  PROMISE: {
    win:       { kept: { board: 1, fans: 3 }, draw: { board: 0, fans: -1 }, broken: { board: -2, fans: -4 } },
    win_bold:  { kept: { board: 1, fans: 5 }, draw: { board: 0, fans: -1 }, broken: { board: -2, fans: -6 } },
    objective: { kept: { board: 3, fans: 3 }, draw: { board: 0, fans: 0 }, broken: { board: -4, fans: -4 } },
  } as Record<PressPromiseKind, Record<"kept" | "draw" | "broken", { board: number; fans: number }>>,
  /** Variantes de texto por pergunta e por resposta. */
  VARIANTS: 2,
  /** Tons que viram manchete `press_quote`. */
  QUOTE_TONES: ["provocative", "demand_squad", "criticize", "praise", "ask_signings"] as PressTone[],
} as const;
```

- [ ] **Step 4: `SaveMeta.press`**

Em `src/backend/SaveService.ts`, na interface `SaveMeta` (bloco "Board and manager status", perto de `board?: BoardState`), acrescentar:

```ts
  /** Etapa 42: coletivas do técnico do jogador (`.claude/rules/game/press.md`). Ausente = nenhuma ainda. */
  press?: import("@/types/pressTypes").PressState;
```

- [ ] **Step 5: Checar tipos e commitar**

Run: `bunx tsc --noEmit -p .` — Expected: sem erros novos (comparar com `git stash; bunx tsc --noEmit -p . | wc -l; git stash pop` se já houver erros antigos).

```bash
git add src/types/pressTypes.ts src/types/newsTypes.ts src/Domain/press/pressConfig.ts src/backend/SaveService.ts
git commit -m "feat(press): tipos e configuração da imprensa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ganchos na diretoria e na moral

**Files:**
- Modify: `src/Domain/boardFans/boardFans.ts` (depois de `applyManagerCard`, l.~228)
- Modify: `src/Domain/morale/morale.ts` (depois de `afterManagerComplaint`, l.~688)
- Test: `src/Domain/boardFans/boardFans.press.test.ts`, `src/Domain/morale/morale.press.test.ts`

- [ ] **Step 1: Testes que falham**

`src/Domain/boardFans/boardFans.press.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { applyPressEffect, initialBoardState } from "@/Domain/boardFans/boardFans";

describe("applyPressEffect", () => {
  test("move os dois medidores pelo mesmo amortecimento dos eventos", () => {
    const s = initialBoardState("2027-02-05", null); // 60/60
    const n = applyPressEffect(s, -2, 3);
    expect(n.board).toBe(58);
    expect(n.fans).toBe(63);
  });
  test("zero não muda nada", () => {
    const s = initialBoardState("2027-02-05", null);
    expect(applyPressEffect(s, 0, 0)).toEqual(s);
  });
  test("acima de 60 o ganho é amortecido", () => {
    const s = { ...initialBoardState("2027-02-05", null), fans: 90 };
    expect(applyPressEffect(s, 0, 5).fans).toBeLessThan(95);
  });
});
```

`src/Domain/morale/morale.press.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { afterPressAnswer } from "@/Domain/morale/morale";
import type { Squad } from "@/types/playerTypes";

const squad = (morales: number[]) =>
  ({ id: "s", players: morales.map((m, i) => ({ id: `p${i}`, name: `P${i}`, morale: m, personality: { ambition: 10, loyalty: 10, professionalism: 10, temperament: 10 } })) }) as unknown as Squad;

describe("afterPressAnswer", () => {
  test("elenco inteiro", () => {
    const out = afterPressAnswer(squad([60, 70]), "all", 2);
    expect(out.players.map((p) => p.morale)).toEqual([62, 72]);
  });
  test("um jogador só", () => {
    const out = afterPressAnswer(squad([60, 70]), "p1", -4);
    expect(out.players.map((p) => p.morale)).toEqual([60, 66]);
  });
  test("jogador fora do elenco ou delta 0: mesmo objeto", () => {
    const s = squad([60]);
    expect(afterPressAnswer(s, "nope", 4)).toBe(s);
    expect(afterPressAnswer(s, "all", 0)).toBe(s);
  });
});
```

(Temperamento 10 dá `moraleVolatility` ≈ 1 − 0,25 × (10 − 10,5)/9,5 ≈ 1,013; se o valor exato não fechar em inteiro, usar `toBeCloseTo(62, 0)` etc. — o teste confere o caminho, não a casa decimal. Conferir o formato do override `personality` em `src/types/personalityTypes.ts`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/boardFans/boardFans.press.test.ts src/Domain/morale/morale.press.test.ts`
Expected: FAIL (`applyPressEffect` / `afterPressAnswer` não exportados).

- [ ] **Step 3: Implementar**

Em `boardFans.ts`:

```ts
/** Etapa 42: efeito de uma resposta de coletiva, de uma ausência ou de uma promessa resolvida. */
export function applyPressEffect(state: BoardState, board: number, fans: number): BoardState {
  if (board === 0 && fans === 0) return state;
  return moveMeters(state, board, fans);
}
```

Em `morale.ts`:

```ts
/** Etapa 42: resposta de coletiva sobre o elenco (`"all"`) ou um jogador. Temperamento escala como todo evento. */
export function afterPressAnswer(squad: Squad, target: "all" | string, delta: number): Squad {
  if (delta === 0) return squad;
  if (target === "all") return { ...squad, players: squad.players.map((p) => withEventDelta(p, delta)) };
  if (!squad.players.some((p) => p.id === target)) return squad;
  return { ...squad, players: squad.players.map((p) => (p.id === target ? withEventDelta(p, delta) : p)) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/boardFans src/Domain/morale` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/boardFans src/Domain/morale
git commit -m "feat(press): efeito de coletiva na diretoria, torcida e moral

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gatilhos (puro)

**Files:**
- Create: `src/Domain/press/triggers.ts`
- Test: `src/Domain/press/triggers.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { pickTrigger, preMatchTriggers, postMatchTriggers, isRunIn, nextWinless } from "@/Domain/press/triggers";

describe("pré-jogo", () => {
  test("clássico, mata-mata, ultimato", () => {
    expect(preMatchTriggers({ derby: true, knockout: false, runIn: false, ultimatum: false })).toEqual(["derby"]);
    expect(preMatchTriggers({ derby: true, knockout: true, runIn: true, ultimatum: true }).sort())
      .toEqual(["derby", "knockout", "run_in", "ultimatum"]);
  });
});

describe("pós-jogo", () => {
  test("goleada sofrida e zebra", () => {
    expect(postMatchTriggers({ goalsFor: 0, goalsAgainst: 3, eliminated: false, title: false, expectation: 0.6, winless: 1 }))
      .toEqual(expect.arrayContaining(["heavy_defeat", "upset_loss"]));
    expect(postMatchTriggers({ goalsFor: 2, goalsAgainst: 1, eliminated: false, title: false, expectation: -0.5, winless: 0 }))
      .toEqual(["upset_win"]);
  });
  test("sequência sem vitória só no múltiplo de 5", () => {
    const base = { goalsFor: 1, goalsAgainst: 1, eliminated: false, title: false, expectation: 0 };
    expect(postMatchTriggers({ ...base, winless: 4 })).toEqual([]);
    expect(postMatchTriggers({ ...base, winless: 5 })).toEqual(["winless"]);
    expect(postMatchTriggers({ ...base, winless: 10 })).toEqual(["winless"]);
  });
  test("título e eliminação", () => {
    expect(postMatchTriggers({ goalsFor: 1, goalsAgainst: 0, eliminated: false, title: true, expectation: 0, winless: 0 })).toEqual(["title"]);
    expect(postMatchTriggers({ goalsFor: 0, goalsAgainst: 1, eliminated: true, title: false, expectation: 0, winless: 1 })).toEqual(["eliminated"]);
  });
  test("nextWinless", () => {
    expect(nextWinless(3, "D")).toBe(4);
    expect(nextWinless(3, "W")).toBe(0);
  });
});

describe("reta final", () => {
  const table = [30, 29, 27, 20, 18, 17, 10, 9].map((points, i) => ({ squadId: `c${i}`, points }));
  test("perto do título", () => {
    expect(isRunIn({ table, myId: "c1", roundsLeft: 3, boundaries: [1] })).toBe(true);
  });
  test("longe de toda fronteira", () => {
    expect(isRunIn({ table, myId: "c3", roundsLeft: 3, boundaries: [1, 6] })).toBe(false);
  });
  test("perto do rebaixamento (fronteira 6: 6º fica, 7º cai)", () => {
    expect(isRunIn({ table, myId: "c6", roundsLeft: 2, boundaries: [6] })).toBe(false); // 10 × 17 = 7 pontos
    expect(isRunIn({ table, myId: "c5", roundsLeft: 2, boundaries: [6] })).toBe(false); // ele está dentro e 17 × 10
    const tight = table.map((r) => (r.squadId === "c6" ? { ...r, points: 15 } : r));
    expect(isRunIn({ table: tight, myId: "c6", roundsLeft: 2, boundaries: [6] })).toBe(true);
  });
  test("fora das últimas rodadas", () => {
    expect(isRunIn({ table, myId: "c1", roundsLeft: 4, boundaries: [1] })).toBe(false);
  });
});

describe("pickTrigger", () => {
  test("prioridade", () => {
    expect(pickTrigger(["derby", "heavy_defeat", "knockout"], { today: "2027-03-10" })).toBe("knockout");
  });
  test("limite de 7 dias, título fura", () => {
    const st = { today: "2027-03-10", lastDate: "2027-03-05" };
    expect(pickTrigger(["derby"], st)).toBeNull();
    expect(pickTrigger(["title", "derby"], st)).toBe("title");
    expect(pickTrigger(["derby"], { today: "2027-03-12", lastDate: "2027-03-05" })).toBe("derby");
  });
  test("pendente bloqueia, salvo título", () => {
    expect(pickTrigger(["derby"], { today: "2027-03-20", pending: true })).toBeNull();
    expect(pickTrigger(["title"], { today: "2027-03-20", pending: true })).toBe("title");
  });
  test("vazio", () => expect(pickTrigger([], { today: "2027-03-20" })).toBeNull());
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/Domain/press/triggers.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `src/Domain/press/triggers.ts`**

```ts
import { PRESS } from "@/Domain/press/pressConfig";
import { daysBetween } from "@/Domain/dates";
import type { PressTrigger } from "@/types/pressTypes";

export interface PreMatchFacts { derby: boolean; knockout: boolean; runIn: boolean; ultimatum: boolean }

export function preMatchTriggers(f: PreMatchFacts): PressTrigger[] {
  const out: PressTrigger[] = [];
  if (f.derby) out.push("derby");
  if (f.knockout) out.push("knockout");
  if (f.runIn) out.push("run_in");
  if (f.ultimatum) out.push("ultimatum");
  return out;
}

export interface PostMatchFacts {
  goalsFor: number;
  goalsAgainst: number;   // placar final do jogo (com prorrogação); pênaltis decidem `eliminated`
  eliminated: boolean;
  title: boolean;
  expectation: number;    // matchExpectation do clube (−1..1)
  winless: number;        // sequência DEPOIS deste jogo
}

export function postMatchTriggers(f: PostMatchFacts): PressTrigger[] {
  const out: PressTrigger[] = [];
  if (f.title) out.push("title");
  if (f.eliminated) out.push("eliminated");
  if (f.goalsAgainst - f.goalsFor >= PRESS.HEAVY_DEFEAT_MARGIN) out.push("heavy_defeat");
  if (f.winless > 0 && f.winless % PRESS.WINLESS_STEP === 0) out.push("winless");
  if (f.goalsFor > f.goalsAgainst && f.expectation <= -PRESS.UPSET_EXPECTATION) out.push("upset_win");
  if (f.goalsFor < f.goalsAgainst && f.expectation >= PRESS.UPSET_EXPECTATION) out.push("upset_loss");
  return out;
}

export function nextWinless(current: number, result: "W" | "D" | "L"): number {
  return result === "W" ? 0 : current + 1;
}

/**
 * Reta final: `boundaries` = posições que fecham uma zona por dentro (1 = título, a última vaga continental, a última
 * de acesso, a última posição a salvo antes do rebaixamento). O clube está a ≤ RUN_IN_POINTS do time do outro lado de
 * alguma fronteira (dentro: o primeiro de fora; fora: o último de dentro).
 */
export function isRunIn(a: { table: { squadId: string; points: number }[]; myId: string; roundsLeft: number; boundaries: number[] }): boolean {
  if (a.roundsLeft < 1 || a.roundsLeft > PRESS.RUN_IN_ROUNDS) return false;
  const pos = a.table.findIndex((r) => r.squadId === a.myId) + 1;
  if (pos === 0) return false;
  const pts = a.table[pos - 1]!.points;
  return a.boundaries.some((b) => {
    if (b < 1 || b >= a.table.length) return false;
    const other = pos <= b ? a.table[b] : a.table[b - 1];   // dentro: 1º de fora (índice b); fora: último de dentro
    return !!other && Math.abs(pts - other.points) <= PRESS.RUN_IN_POINTS;
  });
}

export function pickTrigger(
  candidates: PressTrigger[],
  state: { today: string; lastDate?: string; pending?: boolean },
): PressTrigger | null {
  const sorted = [...new Set(candidates)].sort((x, y) => PRESS.PRIORITY.indexOf(x) - PRESS.PRIORITY.indexOf(y));
  const best = sorted[0];
  if (!best) return null;
  if (best === "title") return best;
  if (state.pending) return null;
  if (state.lastDate && daysBetween(state.lastDate, state.today) < PRESS.MIN_GAP_DAYS) return null;
  return best;
}
```

Conferir que `daysBetween(a, b)` em `src/Domain/dates.ts` devolve `b − a` em dias (é o que `displayPlayer.ts` usa para os dias de lesão); se a ordem for outra, ajustar a chamada.

O teste "perto do rebaixamento" com `c5` (17 pontos, posição 6 = dentro, fronteira 6): o primeiro de fora é `table[6]` (10 pontos), diferença 7 → falso. Correto.

- [ ] **Step 4: Rodar e ver passar** — `bun test src/Domain/press/triggers.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/press/triggers.ts src/Domain/press/triggers.test.ts
git commit -m "feat(press): gatilhos das coletivas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Perguntas (puro)

**Files:**
- Create: `src/Domain/press/questions.ts`
- Test: `src/Domain/press/questions.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { buildConference, conferenceView } from "@/Domain/press/questions";

const base = {
  id: "press-2027-03-10", date: "2027-03-10", expires: "2027-03-12", fixtureId: "f1",
  params: { opponent: "Rival FC", opponentId: "r", competition: "premier_league" }, seed: "save:press-2027-03-10",
};

describe("buildConference", () => {
  test("clássico pré-jogo: pergunta do jogo com provocação, e do elenco", () => {
    const c = buildConference({ ...base, trigger: "derby", kind: "pre" });
    expect(c.questions.map((q) => q.topic)).toEqual(["match", "squad"]);
    expect(c.questions[0]!.answers.map((a) => a.tone)).toEqual(["confident", "cautious", "provocative"]);
  });
  test("derrota: assumir a culpa; com destaque, pergunta do jogador", () => {
    const c = buildConference({ ...base, trigger: "heavy_defeat", kind: "post", player: { id: "p9", name: "Zé", angle: "culprit" } });
    expect(c.questions.map((q) => q.topic)).toEqual(["match", "player", "squad"]);
    expect(c.questions[0]!.answers.at(-1)!.tone).toBe("blame_self");
    expect(c.questions[1]!.playerId).toBe("p9");
    expect(c.questions[1]!.answers.map((a) => a.tone)).toEqual(["praise", "criticize", "protect"]);
  });
  test("ultimato: pergunta do cargo no lugar da do elenco", () => {
    const c = buildConference({ ...base, trigger: "ultimatum", kind: "pre" });
    expect(c.questions.map((q) => q.topic)).toEqual(["match", "job"]);
    expect(c.questions[1]!.answers.map((a) => a.tone)).toEqual(["job_confident", "ask_signings", "deflect"]);
  });
  test("determinístico pela semente e chaves com variante", () => {
    const a = buildConference({ ...base, trigger: "derby", kind: "pre" });
    const b = buildConference({ ...base, trigger: "derby", kind: "pre" });
    expect(a).toEqual(b);
    expect(a.questions[0]!.key).toMatch(/^press\.q\.match\.derby\.[01]$/);
    expect(a.questions[0]!.answers[0]!.key).toMatch(/^press\.a\.confident\.[01]$/);
    expect(new Set(a.questions.flatMap((q) => q.answers.map((x) => x.id))).size).toBe(a.questions.length * 3);
  });
  test("a visão do cliente não tem tom", () => {
    const v = conferenceView(buildConference({ ...base, trigger: "derby", kind: "pre" }));
    expect(JSON.stringify(v)).not.toContain("tone");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/Domain/press/questions.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/Domain/press/questions.ts`**

```ts
import { PRESS } from "@/Domain/press/pressConfig";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type {
  PressConference, PressConferenceView, PressKind, PressParams, PressQuestion, PressTone, PressTopic, PressTrigger,
} from "@/types/pressTypes";

export type PlayerAngle = "star" | "scorer" | "culprit";

export interface ConferenceInput {
  id: string;
  trigger: PressTrigger;
  kind: PressKind;
  date: string;
  expires: string;
  fixtureId?: string;
  params: PressParams;
  player?: { id: string; name: string; angle: PlayerAngle };
  seed: string;
}

function tonesOf(topic: PressTopic, trigger: PressTrigger): PressTone[] {
  switch (topic) {
    case "match":
      return ["confident", "cautious", PRESS.BAD.includes(trigger) ? "blame_self" : "provocative"];
    case "squad":
      return ["defend_squad", "demand_squad", "neutral"];
    case "player":
      return ["praise", "criticize", "protect"];
    case "job":
      return ["job_confident", "ask_signings", "deflect"];
  }
}

function questionKey(topic: PressTopic, trigger: PressTrigger, angle: PlayerAngle | undefined, v: number): string {
  if (topic === "match") return `press.q.match.${trigger}.${v}`;
  if (topic === "player") return `press.q.player.${angle}.${v}`;
  if (topic === "squad") return `press.q.squad.${PRESS.BAD.includes(trigger) ? "bad" : "good"}.${v}`;
  return `press.q.job.${v}`;
}

export function buildConference(input: ConferenceInput): PressConference {
  const rng = mulberry32(seedFrom(input.seed));
  const pick = () => Math.floor(rng() * PRESS.VARIANTS);
  const topics: PressTopic[] = ["match"];
  if (input.player) topics.push("player");
  topics.push(input.trigger === "ultimatum" || input.trigger === "winless" ? "job" : "squad");

  const questions: PressQuestion[] = topics.map((topic, qi) => {
    const qid = `${input.id}-q${qi}`;
    const params: PressParams = topic === "player" && input.player ? { ...input.params, player: input.player.name } : input.params;
    return {
      id: qid,
      topic,
      key: questionKey(topic, input.trigger, input.player?.angle, pick()),
      params,
      ...(topic === "player" && input.player ? { playerId: input.player.id } : {}),
      answers: tonesOf(topic, input.trigger).map((tone, ai) => ({ id: `${qid}-a${ai}`, key: `press.a.${tone}.${pick()}`, tone })),
    };
  });

  return {
    id: input.id, trigger: input.trigger, kind: input.kind, date: input.date, expires: input.expires,
    ...(input.fixtureId ? { fixtureId: input.fixtureId } : {}),
    params: input.params, questions,
  };
}

export function conferenceView(c: PressConference): PressConferenceView {
  return { ...c, questions: c.questions.map((q) => ({ ...q, answers: q.answers.map(({ id, key }) => ({ id, key })) })) };
}
```

(Conferir os nomes `mulberry32`/`seedFrom` em `src/Domain/rng.ts`.)

- [ ] **Step 4: Rodar e ver passar** — `bun test src/Domain/press/questions.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/press/questions.ts src/Domain/press/questions.test.ts
git commit -m "feat(press): perguntas e respostas das coletivas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Efeitos e promessas (puro)

**Files:**
- Create: `src/Domain/press/effects.ts`
- Test: `src/Domain/press/effects.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { answerConference, ignoreConference, resolveMatchPromises, resolveObjectivePromise, validateAnswers, emptyPressState } from "@/Domain/press/effects";
import { buildConference } from "@/Domain/press/questions";
import { initialBoardState } from "@/Domain/boardFans/boardFans";
import type { Squad } from "@/types/playerTypes";

const squad = { id: "me", players: [
  { id: "p1", name: "A", morale: 60, personality: { ambition: 10, loyalty: 10, professionalism: 10, temperament: 10 } },
  { id: "p9", name: "Zé", morale: 60, personality: { ambition: 10, loyalty: 10, professionalism: 18, temperament: 10 } },
] } as unknown as Squad;
const board = initialBoardState("2027-03-01", null);
const conf = buildConference({ id: "c1", trigger: "derby", kind: "pre", date: "2027-03-10", expires: "2027-03-12",
  fixtureId: "f1", params: { opponent: "Rival" }, player: { id: "p9", name: "Zé", angle: "culprit" }, seed: "s" });
const ans = (tones: number[]) => Object.fromEntries(conf.questions.map((q, i) => [q.id, q.answers[tones[i]!]!.id]));

describe("validateAnswers", () => {
  test("exige todas as perguntas com ids válidos", () => {
    expect(validateAnswers(conf, ans([0, 0, 0]))).toBe(true);
    expect(validateAnswers(conf, { [conf.questions[0]!.id]: conf.questions[0]!.answers[0]!.id })).toBe(false);
    expect(validateAnswers(conf, { ...ans([0, 0, 0]), [conf.questions[0]!.id]: "x" })).toBe(false);
  });
});

describe("answerConference", () => {
  test("provocador: torcida +2, diretoria −1, elenco +1, promessa win_bold do jogo", () => {
    const r = answerConference({ conference: conf, answers: ans([2, 2, 2]), squad, board, state: emptyPressState() });
    expect(r.board.fans).toBeGreaterThan(board.fans);
    expect(r.board.board).toBeLessThan(board.board);
    expect(r.state.promises).toEqual([{ id: "c1-win_bold", kind: "win_bold", from: "2027-03-10", fixtureId: "f1" }]);
    expect(r.state.pending).toBeUndefined();
    expect(r.state.lastDate).toBe("2027-03-10");
    expect(r.state.history[0]!.answers).not.toBe("ignored");
    expect(r.quotes.map((q) => q.tone)).toContain("provocative");
  });
  test("cobrar um profissional dá +1, não −4", () => {
    const r = answerConference({ conference: conf, answers: ans([1, 1, 2]), squad, board, state: emptyPressState() });
    expect(r.squad.players.find((p) => p.id === "p9")!.morale).toBeGreaterThan(60);
  });
  test("cauteloso e neutro: nada muda", () => {
    const r = answerConference({ conference: conf, answers: ans([1, 2, 2]), squad, board, state: emptyPressState() });
    expect(r.board).toEqual(board);
  });
});

describe("ignorar e promessas", () => {
  test("ignorada: diretoria −1 e histórico 'ignored'", () => {
    const r = ignoreConference({ conference: conf, board, state: { ...emptyPressState(), pending: conf } });
    expect(r.board.board).toBe(59);
    expect(r.state.pending).toBeUndefined();
    expect(r.state.history[0]!.answers).toBe("ignored");
  });
  test("promessa de jogo cumprida, empatada, quebrada", () => {
    const st = { ...emptyPressState(), promises: [{ id: "x", kind: "win" as const, from: "d", fixtureId: "f1" }] };
    const won = resolveMatchPromises(st, board, { fixtureId: "f1", result: "W" });
    expect(won.board.fans).toBe(63); expect(won.state.promises).toEqual([]); expect(won.outcomes[0]!.outcome).toBe("kept");
    expect(resolveMatchPromises(st, board, { fixtureId: "f1", result: "L" }).outcomes[0]!.outcome).toBe("broken");
    expect(resolveMatchPromises(st, board, { fixtureId: "other", result: "W" }).state.promises).toHaveLength(1);
  });
  test("promessa sem jogo vale o próximo oficial", () => {
    const st = { ...emptyPressState(), promises: [{ id: "x", kind: "win" as const, from: "d" }] };
    expect(resolveMatchPromises(st, board, { fixtureId: "zz", result: "D" }).outcomes[0]!.outcome).toBe("draw");
  });
  test("meta da temporada", () => {
    const st = { ...emptyPressState(), promises: [{ id: "o", kind: "objective" as const, from: "d", season: "2026-27" }] };
    const r = resolveObjectivePromise(st, board, false);
    expect(r.board.board).toBe(56); expect(r.outcomes[0]!.outcome).toBe("broken"); expect(r.state.promises).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/Domain/press/effects.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/Domain/press/effects.ts`**

```ts
import { PRESS } from "@/Domain/press/pressConfig";
import { applyPressEffect } from "@/Domain/boardFans/boardFans";
import { afterPressAnswer } from "@/Domain/morale/morale";
import { takesDemandWell } from "@/Domain/personality/personality";
import type { BoardState } from "@/types/boardTypes";
import type { Squad } from "@/types/playerTypes";
import type { PressConference, PressPromise, PressRecord, PressState, PressTone } from "@/types/pressTypes";

export function emptyPressState(): PressState {
  return { winless: 0, promises: [], history: [] };
}

export function validateAnswers(c: PressConference, answers: Record<string, string>): boolean {
  if (Object.keys(answers).length !== c.questions.length) return false;
  return c.questions.every((q) => q.answers.some((a) => a.id === answers[q.id]));
}

export interface PressQuote { tone: PressTone; playerId?: string; player?: string }

const pushHistory = (st: PressState, rec: PressRecord): PressRecord[] => [rec, ...st.history].slice(0, PRESS.HISTORY);

/** Aplica as respostas (já validadas). */
export function answerConference(a: {
  conference: PressConference; answers: Record<string, string>; squad: Squad; board: BoardState; state: PressState;
}): { squad: Squad; board: BoardState; state: PressState; quotes: PressQuote[] } {
  const c = a.conference;
  let squad = a.squad;
  let board = a.board;
  let promises = [...a.state.promises];
  const quotes: PressQuote[] = [];
  const chosen: { questionId: string; tone: PressTone }[] = [];

  for (const q of c.questions) {
    const tone = q.answers.find((x) => x.id === a.answers[q.id])!.tone;
    chosen.push({ questionId: q.id, tone });
    const fx = PRESS.TONE[tone];
    if (fx.squad) squad = afterPressAnswer(squad, "all", fx.squad);
    if (fx.player && q.playerId) {
      const target = squad.players.find((p) => p.id === q.playerId);
      const delta = tone === "criticize" && target && takesDemandWell(target) ? PRESS.CRITICIZE_PRO : fx.player;
      squad = afterPressAnswer(squad, q.playerId, delta);
    }
    let boardDelta = fx.board;
    if (tone === "defend_squad" && PRESS.BAD.includes(c.trigger)) boardDelta += PRESS.DEFEND_BAD_BOARD;
    board = applyPressEffect(board, boardDelta, fx.fans);

    const kind = PRESS.PROMISE_OF[tone];
    if (kind && !promises.some((p) => p.kind === kind)) {
      const p: PressPromise = { id: `${c.id}-${kind}`, kind, from: c.date };
      if (kind !== "objective" && c.kind === "pre" && c.fixtureId) p.fixtureId = c.fixtureId;
      if (kind === "objective" && board.objective) p.season = board.objective.season;
      if (kind !== "objective" || p.season) promises.push(p);
    }
    if (PRESS.QUOTE_TONES.includes(tone)) {
      quotes.push({ tone, ...(q.playerId ? { playerId: q.playerId, player: q.params.player } : {}) });
    }
  }

  const { pending: _p, ...rest } = a.state;
  return {
    squad, board, quotes,
    state: { ...rest, lastDate: c.date, promises, history: pushHistory(a.state, { id: c.id, date: c.date, trigger: c.trigger, answers: chosen }) },
  };
}

export function ignoreConference(a: { conference: PressConference; board: BoardState; state: PressState }): { board: BoardState; state: PressState } {
  const { pending: _p, ...rest } = a.state;
  return {
    board: applyPressEffect(a.board, PRESS.IGNORED_BOARD, 0),
    state: { ...rest, lastDate: a.conference.date,
      history: pushHistory(a.state, { id: a.conference.id, date: a.conference.date, trigger: a.conference.trigger, answers: "ignored" }) },
  };
}

export type PromiseOutcome = { promise: PressPromise; outcome: "kept" | "draw" | "broken" };

/** Um jogo oficial do clube do jogador terminou. */
export function resolveMatchPromises(st: PressState, board: BoardState, m: { fixtureId: string; result: "W" | "D" | "L" }):
  { state: PressState; board: BoardState; outcomes: PromiseOutcome[] } {
  const outcomes: PromiseOutcome[] = [];
  const left: PressPromise[] = [];
  let b = board;
  for (const p of st.promises) {
    const due = p.kind !== "objective" && (!p.fixtureId || p.fixtureId === m.fixtureId);
    if (!due) { left.push(p); continue; }
    const outcome = m.result === "W" ? "kept" : m.result === "D" ? "draw" : "broken";
    const fx = PRESS.PROMISE[p.kind][outcome];
    b = applyPressEffect(b, fx.board, fx.fans);
    outcomes.push({ promise: p, outcome });
  }
  return { state: { ...st, promises: left }, board: b, outcomes };
}

/** Virada do país do clube do jogador (`playerObjectiveMet`). */
export function resolveObjectivePromise(st: PressState, board: BoardState, met: boolean):
  { state: PressState; board: BoardState; outcomes: PromiseOutcome[] } {
  const outcomes: PromiseOutcome[] = [];
  let b = board;
  for (const p of st.promises.filter((x) => x.kind === "objective")) {
    const outcome = met ? "kept" : "broken";
    const fx = PRESS.PROMISE.objective[outcome];
    b = applyPressEffect(b, fx.board, fx.fans);
    outcomes.push({ promise: p, outcome });
  }
  return { state: { ...st, promises: st.promises.filter((x) => x.kind !== "objective") }, board: b, outcomes };
}
```

Uma promessa `win` de coletiva **pré-jogo** que chega a um jogo diferente do prometido (ex.: o jogo foi remarcado e outro jogo veio antes) continua aberta até o jogo prometido; se ele nunca acontecer, a troca de clube ou a virada a limpam (Task 9).

- [ ] **Step 4: Rodar e ver passar** — `bun test src/Domain/press` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/press/effects.ts src/Domain/press/effects.test.ts
git commit -m "feat(press): efeitos das respostas e promessas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Notícias do dia (puro)

**Files:**
- Create: `src/Domain/news/buildDayNews.ts`
- Test: `src/Domain/news/buildDayNews.test.ts`
- Modify: `src/types/newsTypes.ts` (entrada)

- [ ] **Step 1: Acrescentar a entrada a `src/types/newsTypes.ts`**

```ts
export interface NewsClub { id: string; name: string }
export interface NewsScope { country?: string; league?: string; competition?: string; tier?: number | null }

export interface DayNewsInput {
  date: string;
  humanClubId?: string;
  humanLeague?: string;
  followed: string[];
  results: (NewsScope & {
    fixtureId: string; home: NewsClub; away: NewsClub; score: { home: number; away: number };
    /** Nível de cada lado (`clubLevel`); ausente = sem checagem de zebra. */
    levels?: { home: number; away: number };
  })[];
  champions: (NewsScope & { club: NewsClub })[];
  moves: (NewsScope & { club: NewsClub; kind: "promoted" | "relegated" })[];
  newLeaders: (NewsScope & { club: NewsClub })[];
  transfers: (NewsScope & { playerId: string; player: string; from: NewsClub | null; to: NewsClub; fee: number; star: boolean; clubRecord: boolean })[];
  managers: (NewsScope & { kind: "sacked" | "hired"; club: NewsClub; manager: string })[];
  awards: (NewsScope & { kind: "league_best" | "world_player" | "world_manager"; name: string; personId: string; club?: NewsClub })[];
  stars: (NewsScope & { kind: "injury" | "retired"; playerId: string; player: string; club?: NewsClub })[];
  national: { kind: "champion" | "favourite_out"; competition: string; team: string; teamId: string }[];
  clubRecords: (NewsScope & { club: NewsClub; record: string })[];
  press: { kind: "press_quote" | "press_absent" | "press_promise_kept" | "press_promise_broken"; club: NewsClub; manager: string; key: string; player?: string; playerId?: string; scope: NewsScope }[];
}
```

- [ ] **Step 2: Teste que falha** (`src/Domain/news/buildDayNews.test.ts`)

```ts
import { describe, expect, test } from "bun:test";
import { buildDayNews, emptyDayNewsInput, NEWS } from "@/Domain/news/buildDayNews";

const club = (id: string) => ({ id, name: id.toUpperCase() });
const res = (fixtureId: string, league: string, h: number, a: number, tier = 1, levels?: { home: number; away: number }) =>
  ({ fixtureId, league, country: "England", tier, home: club(`h${fixtureId}`), away: club(`a${fixtureId}`), score: { home: h, away: a }, ...(levels ? { levels } : {}) });

describe("buildDayNews", () => {
  test("goleada só na primeira divisão; ids estáveis", () => {
    const input = { ...emptyDayNewsInput("2027-03-10"), results: [res("1", "pl", 5, 0), res("2", "ch", 5, 0, 2), res("3", "pl", 2, 1)] };
    const out = buildDayNews(input);
    expect(out.map((n) => n.kind)).toEqual(["thrashing"]);
    expect(out[0]!.id).toBe("2027-03-10:thrashing:1");
    expect(buildDayNews(input)).toEqual(out);
  });
  test("zebra pelo nível", () => {
    const out = buildDayNews({ ...emptyDayNewsInput("d"), results: [res("1", "pl", 0, 1, 1, { home: 5.5, away: 4.8 })] });
    expect(out.map((n) => n.kind)).toEqual(["upset"]);
  });
  test("teto por liga e no mundo; coletiva sempre entra", () => {
    const results = Array.from({ length: 10 }, (_, i) => res(`${i}`, "pl", 6, 0));
    const press = [{ kind: "press_quote" as const, club: club("me"), manager: "Eu", key: "provocative", scope: { league: "pl" } }];
    const out = buildDayNews({ ...emptyDayNewsInput("d"), results, press });
    expect(out.filter((n) => n.league === "pl" && !n.kind.startsWith("press")).length).toBe(NEWS.PER_LEAGUE);
    expect(out.some((n) => n.kind === "press_quote")).toBe(true);
    const many = Array.from({ length: 50 }, (_, i) => res(`${i}`, `l${i}`, 6, 0));
    expect(buildDayNews({ ...emptyDayNewsInput("d"), results: many }).length).toBe(NEWS.PER_DAY);
  });
  test("acesso/rebaixamento só até o nível 2, campeão de qualquer nível", () => {
    const out = buildDayNews({ ...emptyDayNewsInput("d"),
      moves: [{ league: "x", tier: 3, club: club("a"), kind: "promoted" }, { league: "y", tier: 2, club: club("b"), kind: "relegated" }],
      champions: [{ league: "z", tier: 4, club: club("c") }] });
    expect(out.map((n) => n.kind).sort()).toEqual(["champion", "relegated"]);
  });
  test("importância: título 3, transferência ≥ €60M 3, liga do jogador 2, resto 1", () => {
    const out = buildDayNews({ ...emptyDayNewsInput("d"), humanLeague: "pl",
      champions: [{ league: "it", tier: 1, club: club("c") }],
      transfers: [{ league: "es", playerId: "p", player: "P", from: club("x"), to: club("y"), fee: 70_000_000, star: true, clubRecord: false }],
      results: [res("1", "pl", 4, 0), res("2", "fr", 4, 0)] });
    const imp = Object.fromEntries(out.map((n) => [n.id.split(":").slice(1).join(":"), n.importance]));
    expect(imp["champion:it:c"]).toBe(3);
    expect(imp["big_transfer:p"]).toBe(3);
    expect(imp["thrashing:1"]).toBe(2);
    expect(imp["thrashing:2"]).toBe(1);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `bun test src/Domain/news` → FAIL.

- [ ] **Step 4: Implementar `src/Domain/news/buildDayNews.ts`**

```ts
import type { DayNewsInput, NewsItem, NewsKind, NewsScope } from "@/types/newsTypes";

export const NEWS = {
  THRASHING_MARGIN: 4,
  UPSET_LEVEL_GAP: 0.6,
  BIG_FEE: 20_000_000,
  HUGE_FEE: 60_000_000,
  PER_LEAGUE: 3,
  PER_DAY: 30,
  MOVES_MAX_TIER: 2,
  MONTHS_KEPT: 12,
  VARIANTS: 3,
} as const;

export function emptyDayNewsInput(date: string): DayNewsInput {
  return { date, followed: [], results: [], champions: [], moves: [], newLeaders: [], transfers: [], managers: [],
    awards: [], stars: [], national: [], clubRecords: [], press: [] };
}

const PRESS_KINDS: NewsKind[] = ["press_quote", "press_absent", "press_promise_kept", "press_promise_broken"];

export function buildDayNews(input: DayNewsInput): NewsItem[] {
  const near = (s: NewsScope) => !!s.league && (s.league === input.humanLeague || input.followed.includes(s.league));
  const out: NewsItem[] = [];
  const add = (kind: NewsKind, key: string, scope: NewsScope, base: 1 | 2 | 3,
    clubIds: string[], playerIds: string[], params: Record<string, string | number>) => {
    const importance = (base === 3 ? 3 : near(scope) || !!scope.competition ? Math.max(base, 2) : base) as 1 | 2 | 3;
    out.push({
      id: `${input.date}:${kind}:${key}`, date: input.date, kind, importance,
      ...(scope.country ? { country: scope.country } : {}), ...(scope.league ? { league: scope.league } : {}),
      ...(scope.competition ? { competition: scope.competition } : {}),
      clubIds, playerIds, params,
    });
  };
  const score = (h: number, a: number) => `${h}–${a}`;

  for (const r of input.results) {
    const topFlight = r.tier === 1 || !!r.competition;
    const diff = r.score.home - r.score.away;
    if (topFlight && Math.abs(diff) >= NEWS.THRASHING_MARGIN && (r.tier === 1 || r.competition)) {
      const [w, l] = diff > 0 ? [r.home, r.away] : [r.away, r.home];
      add("thrashing", r.fixtureId, r, 1, [w.id, l.id], [], { winner: w.name, loser: l.name, score: score(Math.max(r.score.home, r.score.away), Math.min(r.score.home, r.score.away)) });
      continue;
    }
    if (topFlight && diff !== 0 && r.levels) {
      const winnerLevel = diff > 0 ? r.levels.home : r.levels.away;
      const loserLevel = diff > 0 ? r.levels.away : r.levels.home;
      if (loserLevel - winnerLevel >= NEWS.UPSET_LEVEL_GAP) {
        const [w, l] = diff > 0 ? [r.home, r.away] : [r.away, r.home];
        add("upset", r.fixtureId, r, 1, [w.id, l.id], [], { winner: w.name, loser: l.name, score: `${r.score.home}–${r.score.away}` });
      }
    }
  }
  for (const c of input.champions) add("champion", `${c.league ?? c.competition}:${c.club.id}`, c, 3, [c.club.id], [], { club: c.club.name, competition: c.league ?? c.competition ?? "" });
  for (const m of input.moves) {
    if (m.tier != null && m.tier > NEWS.MOVES_MAX_TIER) continue;
    add(m.kind, `${m.league}:${m.club.id}`, m, 1, [m.club.id], [], { club: m.club.name, league: m.league ?? "" });
  }
  for (const l of input.newLeaders) add("new_leader", `${l.league}:${l.club.id}`, l, 2, [l.club.id], [], { club: l.club.name, league: l.league ?? "" });
  for (const t of input.transfers) {
    if (t.fee < NEWS.BIG_FEE && !t.star && !t.clubRecord) continue;
    add("big_transfer", t.playerId, t, t.fee >= NEWS.HUGE_FEE ? 3 : 1, [t.to.id, ...(t.from ? [t.from.id] : [])], [t.playerId],
      { player: t.player, from: t.from?.name ?? "", to: t.to.name, fee: t.fee });
  }
  for (const m of input.managers) add(m.kind === "sacked" ? "manager_sacked" : "manager_hired", `${m.club.id}:${m.manager}`, m, 1, [m.club.id], [], { club: m.club.name, manager: m.manager });
  for (const a of input.awards) add("award", `${a.kind}:${a.personId}`, a, a.kind === "league_best" ? 1 : 3, a.club ? [a.club.id] : [], [a.personId], { kind: a.kind, name: a.name, club: a.club?.name ?? "", league: a.league ?? "" });
  for (const s of input.stars) add(s.kind === "injury" ? "star_injury" : "star_retired", s.playerId, s, 1, s.club ? [s.club.id] : [], [s.playerId], { player: s.player, club: s.club?.name ?? "" });
  for (const n of input.national) add("national", `${n.kind}:${n.competition}:${n.teamId}`, { competition: n.competition }, n.kind === "champion" ? 3 : 2, [], [], { kind: n.kind, team: n.team, competition: n.competition });
  for (const r of input.clubRecords) add("club_record", `${r.club.id}:${r.record}`, r, 1, [r.club.id], [], { club: r.club.name, record: r.record });
  for (const p of input.press) add(p.kind, `${p.club.id}:${p.key}`, p.scope, 3, [p.club.id], p.playerId ? [p.playerId] : [], { club: p.club.name, manager: p.manager, key: p.key, player: p.player ?? "" });

  // Tetos: imprensa sempre entra; o resto por importância (desempate id), no máximo PER_LEAGUE por liga e PER_DAY no total.
  const pressItems = out.filter((n) => PRESS_KINDS.includes(n.kind));
  const rest = out.filter((n) => !PRESS_KINDS.includes(n.kind)).sort((a, b) => b.importance - a.importance || (a.id < b.id ? -1 : 1));
  const perLeague = new Map<string, number>();
  const kept: NewsItem[] = [...pressItems];
  for (const n of rest) {
    if (kept.length >= NEWS.PER_DAY) break;
    const k = n.league ?? n.competition ?? "_";
    const used = perLeague.get(k) ?? 0;
    if (k !== "_" && used >= NEWS.PER_LEAGUE) continue;
    perLeague.set(k, used + 1);
    kept.push(n);
  }
  return kept;
}

/** Variante do texto (`news.<kind>.<n>`), estável pelo id. */
export function newsVariant(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % NEWS.VARIANTS;
}
```

Nota: o teste da goleada na liga `ch` (tier 2) não pode gerar notícia — a condição `topFlight` cobre. Ajustar o código se algum teste da Step 2 falhar por leitura diferente, sem mudar a regra da spec.

- [ ] **Step 5: Rodar e ver passar** — `bun test src/Domain/news` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/newsTypes.ts src/Domain/news
git commit -m "feat(news): notícias do dia a partir dos eventos do mundo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Arquivos de notícias (DAL)

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `src/backend/SaveService.ts`
- Test: `src/backend/dal/news.dal.test.ts`

Seguir o padrão dos prêmios (`readAwardsYear`/`writeAwardsYear`/`listAwardYears`: ISaveDAL l.155-158, FileSystemDAL l.589-609, BufferingSaveDAL l.473-483, SaveService l.428-436).

- [ ] **Step 1: Teste que falha**

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { SaveService } from "@/backend/SaveService";
import type { NewsItem } from "@/types/newsTypes";

const item = (id: string, date: string): NewsItem => ({ id, date, kind: "thrashing", importance: 1, clubIds: [], playerIds: [], params: {} });

describe("news DAL", () => {
  const saveId = `news-dal-${Date.now()}`;
  const fs = new FileSystemDAL();
  afterAll(async () => { await fs.deleteSave(saveId); });

  test("append por mês, sem duplicar id, lista os meses", async () => {
    const buf = new BufferingSaveDAL(new FileSystemDAL());
    const svc = new SaveService(buf);
    await svc.appendNews(saveId, [item("a", "2027-03-10"), item("b", "2027-04-01")]);
    await svc.appendNews(saveId, [item("a", "2027-03-10")]);
    expect(await fs.listNewsMonths(saveId)).toEqual([]);          // nada sem flush
    await buf.flush();
    const svc2 = new SaveService(new FileSystemDAL());
    expect((await svc2.getNewsMonth(saveId, "2027-03")).map((n) => n.id)).toEqual(["a"]);
    expect(await svc2.listNewsMonths(saveId)).toEqual(["2027-03", "2027-04"]);
  });
  test("apaga meses antigos", async () => {
    const svc = new SaveService(new FileSystemDAL());
    await svc.pruneNews(saveId, "2027-04");
    expect(await svc.listNewsMonths(saveId)).toEqual(["2027-04"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/backend/dal/news.dal.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`ISaveDAL.ts`:
```ts
  /** Etapa 42: notícias do mundo por mês (`YYYY-MM`). `null` quando o mês não tem arquivo. */
  readNewsMonth(saveId: string, month: string): Promise<NewsItem[] | null>;
  writeNewsMonth(saveId: string, month: string, items: NewsItem[]): Promise<void>;
  /** Meses com arquivo, em ordem crescente. */
  listNewsMonths(saveId: string): Promise<string[]>;
  deleteNewsMonth(saveId: string, month: string): Promise<void>;
```

`FileSystemDAL.ts` (perto de `awardsPath`):
```ts
function newsPath(saveId: string, month: string) { return `${SAVES_DIR}/${saveId}/news/${month}.json`; }
...
  async readNewsMonth(saveId: string, month: string): Promise<NewsItem[] | null> {
    const file = Bun.file(newsPath(saveId, month));
    if (!(await file.exists())) return null;
    return file.json() as Promise<NewsItem[]>;
  }
  async writeNewsMonth(saveId: string, month: string, items: NewsItem[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}/news`, { recursive: true });
    await Bun.write(newsPath(saveId, month), JSON.stringify(items));
  }
  async listNewsMonths(saveId: string): Promise<string[]> {
    const names = await readdir(`${SAVES_DIR}/${saveId}/news`).catch(() => [] as string[]);
    return names.map((n) => /^(\d{4}-\d{2})\.json$/.exec(n)?.[1]).filter((m): m is string => !!m).sort();
  }
  async deleteNewsMonth(saveId: string, month: string): Promise<void> {
    await rm(newsPath(saveId, month), { force: true });
  }
```
(`readdir`/`rm` já vêm de `node:fs/promises` no arquivo — conferir os imports.)

`BufferingSaveDAL.ts` (perto dos prêmios). O delete fica fora do buffer: só acontece pela poda, que roda fora do avanço do dia (Task 10, rota e passo de virada de mês na própria unidade — ver lá):
```ts
  readNewsMonth(saveId: string, month: string): Promise<NewsItem[] | null> {
    return this.readThrough(`news:${saveId}:${month}`, () => this.inner.readNewsMonth(saveId, month));
  }
  async writeNewsMonth(saveId: string, month: string, items: NewsItem[]): Promise<void> {
    this.buffer(`news:${saveId}:${month}`, items, () => this.inner.writeNewsMonth(saveId, month, items));
  }
  async listNewsMonths(saveId: string): Promise<string[]> {
    const disk = await this.inner.listNewsMonths(saveId);
    const prefix = `news:${saveId}:`;
    const cached = [...this.cache.keys()].filter((k) => k.startsWith(prefix) && this.cache.get(k) != null).map((k) => k.slice(prefix.length));
    return [...new Set([...disk, ...cached])].sort();
  }
  deleteNewsMonth(saveId: string, month: string): Promise<void> {
    return this.inner.deleteNewsMonth(saveId, month);
  }
```
(Conferir o nome do mapa de cache em `BufferingSaveDAL` — `listAwardYears` faz o mesmo; copiar o jeito dele.)

`SaveService.ts`:
```ts
  async getNewsMonth(saveId: string, month: string): Promise<NewsItem[]> {
    return (await this.dal.readNewsMonth(saveId, month)) ?? [];
  }
  listNewsMonths(saveId: string): Promise<string[]> { return this.dal.listNewsMonths(saveId); }
  /** Junta por mês, sem repetir id (um dia refeito não duplica). */
  async appendNews(saveId: string, items: NewsItem[]): Promise<void> {
    const byMonth = new Map<string, NewsItem[]>();
    for (const n of items) byMonth.set(n.date.slice(0, 7), [...(byMonth.get(n.date.slice(0, 7)) ?? []), n]);
    for (const [month, add] of byMonth) {
      const cur = await this.getNewsMonth(saveId, month);
      const ids = new Set(cur.map((n) => n.id));
      const fresh = add.filter((n) => !ids.has(n.id));
      if (fresh.length > 0) await this.dal.writeNewsMonth(saveId, month, [...cur, ...fresh]);
    }
  }
  /** Apaga os meses anteriores a `keepFrom` (`YYYY-MM`). */
  async pruneNews(saveId: string, keepFrom: string): Promise<void> {
    for (const m of await this.listNewsMonths(saveId)) if (m < keepFrom) await this.dal.deleteNewsMonth(saveId, m);
  }
```

Se algum outro `ISaveDAL` existir (procurar `implements ISaveDAL`), implementar lá também.

- [ ] **Step 4: Rodar e ver passar** — `bun test src/backend/dal` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/dal src/backend/SaveService.ts
git commit -m "feat(news): arquivos de notícias por mês

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Categoria `press` na inbox

**Files:**
- Modify: `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxTopics.ts`, `src/Domain/inbox/inboxThemes.ts`, `src/Domain/inbox/inboxEvents.ts`, `src/GameInterface/InboxScreen.tsx` (só `CATEGORY_META`, para compilar)
- Test: `src/Domain/inbox/pressMessage.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { buildPressInviteMessage } from "@/Domain/inbox/inboxEvents";
import { inboxAllowed, inboxTopicOf } from "@/Domain/inbox/inboxTopics";

describe("press invite", () => {
  test("mensagem de ação, nunca filtrada", () => {
    const m = buildPressInviteMessage("2027-03-10", { pressId: "c1", trigger: "derby", kind: "pre", opponent: "Rival", expires: "2027-03-12" });
    expect(m.category).toBe("press");
    expect(m.id).toBe("press-c1");
    expect(inboxTopicOf(m)).toBe("actions");
    expect(inboxAllowed(m, { actions: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar**

`inboxTypes.ts`: acrescentar `| "press"` ao `InboxCategory`, e:
```ts
export interface PressInboxMessage extends InboxMessageBase {
  category: "press";
  kind: "invite";
  pressId: string;
  trigger: import("@/types/pressTypes").PressTrigger;
  pressKind: import("@/types/pressTypes").PressKind;
  opponent?: string;
  expires: string;
}
```
e incluir `| PressInboxMessage` no union `InboxMessage`.

`inboxTopics.ts`: `CATEGORY_TOPIC.press = "actions"`. `inboxThemes.ts`: `THEME_OF.press = "club"`.

`inboxEvents.ts`:
```ts
export function buildPressInviteMessage(date: string, p: {
  pressId: string; trigger: PressTrigger; kind: PressKind; opponent?: string; expires: string;
}): PressInboxMessage {
  return {
    id: `press-${p.pressId}`, date, createdAt: date, read: false,
    category: "press", kind: "invite", pressId: p.pressId, trigger: p.trigger, pressKind: p.kind,
    ...(p.opponent ? { opponent: p.opponent } : {}), expires: p.expires,
    subject: "Press conference", preview: p.opponent ?? "",
  };
}
```

`InboxScreen.tsx` `CATEGORY_META`: entrada `press` com `labelKey: "inbox.categories.press"`, cor `text-chart-2` / `bg-chart-2/15` / `border-chart-2/30` e um ícone novo `mic` (adicionar `mic` a `IconName`/`ICON_MAP` em `src/GameInterface/Icons.tsx` com o `Mic` do lucide). O corpo vem na Task 12; por enquanto só compilar.

- [ ] **Step 4: Rodar** — `bun test src/Domain/inbox && bunx tsc --noEmit -p .` → PASS, sem erros novos (os `Record<InboxCategory, …>` exaustivos devem acusar qualquer esquecimento).

- [ ] **Step 5: Commit**

```bash
git add src/types/inboxTypes.ts src/Domain/inbox src/GameInterface/InboxScreen.tsx src/GameInterface/Icons.tsx
git commit -m "feat(press): categoria press na caixa de entrada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Passo do dia da coletiva (`pressWorld`)

**Files:**
- Create: `src/backend/pressWorld.ts`
- Modify: `src/backend/advanceDay.ts`
- Test: `src/backend/press.advanceDay.test.ts`

**Desenho do passo** (`pressDay`), chamado em `advanceOneDay` **depois** da moral (l.~2781) e **antes** do `clearInbox`/mensagens adiadas, só com `humanActive`:

```ts
export interface PressDayInput {
  saveId: string;
  service: SaveService;
  meta: SaveMeta;                    // a meta do início do dia
  date: string;                      // currentDate
  clubId: string;
  board: BoardState;                 // o `board` local já atualizado pelo dia
  myMatches: MatchEvent[];           // jogos oficiais do clube hoje (liga/copa/continental)
  titlesToday: string[];             // títulos do clube decididos hoje ("cup:…", "continental:…", "league:…")
  eliminatedToday: string[];         // competições (slug) em que o clube caiu hoje
  rollover?: { objectiveMet: boolean; move: "promoted" | "relegated" | null; champion: boolean };
  /** Contexto já calculado pelo boardWorld: expectativa e clássico de cada jogo de hoje. */
  matchContext: Map<string, { expectation: number; derby: boolean }>;
}
export interface PressDayResult {
  press: PressState;
  board: BoardState;
  squad?: Squad;                     // nunca muda no passo do dia (só a rota mexe na moral)
  invite?: PressInboxMessage;        // emitir depois do clearInbox
  news: DayNewsInput["press"];       // ausência e promessas resolvidas
}
```

Ordem dentro do passo:
1. `state = meta.press ?? emptyPressState()`.
2. **Vencida:** `state.pending && date >= state.pending.expires` → `ignoreConference`; notícia `press_absent`.
3. **Promessas e sequência:** para cada jogo de `myMatches` em ordem: resultado W/D/L do clube (placar com prorrogação; empate decidido nos pênaltis conta como D); `resolveMatchPromises`; `state.winless = nextWinless(...)`. Cada outcome vira notícia `press_promise_kept`/`press_promise_broken` (draw não vira notícia).
4. **Virada:** `rollover` → `resolveObjectivePromise(state, board, rollover.objectiveMet)`; promessas `win`/`win_bold` com `fixtureId` de um jogo que não existe mais são descartadas aqui (sem efeito).
5. **Candidatos pós-jogo** (dia do jogo; o convite é para "amanhã", data do convite = `date + 1`): para cada jogo de hoje, `postMatchTriggers({ goalsFor, goalsAgainst, eliminated: eliminatedToday.includes(m.competition), title: titlesToday.some(t => t.endsWith(":"+m.competition)), expectation: matchContext.get(m.fixtureId)?.expectation ?? 0, winless: state.winless })`; mais `title` (liga, na virada), `promoted`/`relegated` da virada.
6. **Candidatos pré-jogo:** próximos jogos do clube em `date + 2` (e em `date + 1` quando o de `date + 2` de ontem não existia — basta checar `date + 1` também e pular se já houve convite para aquele `fixtureId` em `state.history`/`pending`). Ler os jogos pelo `season.calendar` não serve no backend: usar `readAdvancePosition`/`nextPlayerFixtureDate` de `src/backend/advanceUntil.ts` ou ler o `date-index` de liga, copa e continental do clube (mesmo que `advanceUntil` faz) para as duas datas. Para cada jogo:
   - `derby`: `isDerby` com as cidades (`venue.city`) dos dois elencos e o líder da liga (`getLeagueStandings`), igual a `boardWorld`.
   - `knockout`: `fixture.knockout && (isCupSlug(c) ? ["qf","sf","final"].includes(stageName) : isContinentalSlug(c))`; o nome da fase vem da meta da copa (`stages.find(s => s.round === fixture.round)?.name`).
   - `run_in`: só liga do clube; `roundsLeft` = rodadas do clube ainda não jogadas a partir desta (`fixtures` da liga); `boundaries` das zonas do `leagueData` da liga (`prom`/`ucl`/`uel`/`uecl`/`lib`/`sud` → maior `to`; `rel` → `from − 1`; 1 sempre) — procurar onde `objectiveFor` lê as zonas e reaproveitar o mesmo helper.
   - `ultimatum`: `!!board.ultimatum`.
7. `pickTrigger(candidatos, { today: inviteDate, lastDate: state.lastDate, pending: !!state.pending })`. Se o vencedor for `title` com outra pendente, ignorar a pendente primeiro (passo 2 forçado).
8. Montar a coletiva: `id = press-${inviteDate}`; `expires` = pré: data do jogo; pós: `inviteDate + PRESS.POST_VALID_DAYS`; jogador citado: pós-jogo → `culprit` na derrota (pior nota do clube no último jogo, `playerRatings`), senão `star` (melhor nota ≥ 7,5); pré-jogo → `scorer` (artilheiro da temporada do elenco pelo `seasonLog.goals`, ≥ 5 gols); ausente quando nada passa. `params`: `opponent`, `opponentId`, `competition`, `score` ("2–1" do ponto de vista do clube), `stage`. `seed = ${saveId}:${id}`.
   - **Data do convite pós-jogo:** a coletiva pós-jogo nasce no dia do jogo com `date = inviteDate = date + 1`; o convite só é emitido nesse avanço (fica na inbox com a data de amanhã). Simples e sem estado extra.
9. Gravar `metaPatch.press = state` e `metaPatch.board = board` (o `board` local do `advanceOneDay` recebe o resultado).

Troca de clube e demissão: em `releaseHumanClub`/`takeOverClub` (`src/backend/jobWorld.ts`) e na demissão do `advanceDay`, `press` vai para `undefined` (descarta pendente e promessas). Procurar onde `jobOffers`/`rotationOverride` são limpos e pôr junto.

- [ ] **Step 1: Teste de integração que falha** (`src/backend/press.advanceDay.test.ts`)

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { buildConference } from "@/Domain/press/questions";

describe("press in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); });
  const create = async () => {
    const meta = await saveService.createSave({ leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"] });
    created.push(meta.id);
    return meta;
  };

  test("coletiva vencida é ignorada: diretoria −1, histórico e notícia", async () => {
    const meta = await create();
    const today = meta.currentDate!;
    const pending = buildConference({ id: "press-x", trigger: "derby", kind: "pre", date: today, expires: today,
      params: { opponent: "Rival" }, seed: "s" });
    await saveService.updateMeta(meta.id, { press: { pending, winless: 0, promises: [], history: [] } });
    const before = meta.board!.board;
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    const after = await saveService.getMeta(meta.id);
    expect(after!.press!.pending?.id).not.toBe("press-x");
    expect(after!.press!.history[0]).toMatchObject({ id: "press-x", answers: "ignored" });
    expect(after!.board!.board).toBeLessThan(before + 1);  // outros efeitos do dia podem somar; a ausência tirou 1
    const month = await saveService.getNewsMonth(meta.id, today.slice(0, 7));
    expect(month.some((n) => n.kind === "press_absent")).toBe(true);
  }, 180_000);

  test("convite pré-jogo de um clássico 2 dias antes", async () => {
    const meta = await create();
    // Achar o próximo jogo de liga do clube e forçar o clássico: dar ao adversário a cidade do clube.
    const fixtures = await saveService.getLeagueFixtures(meta.id, "premier_league");   // conferir o nome real
    const next = fixtures.filter((f) => !f.played && (f.home === "33" || f.away === "33")).sort((a, b) => a.date.localeCompare(b.date))[0]!;
    const oppId = next.home === "33" ? next.away : next.home;
    const me = await saveService.getSquadById(meta.id, "33");
    const opp = await saveService.getSquadById(meta.id, oppId);
    await saveService.saveSquadById(meta.id, { ...opp!, venue: { ...opp!.venue!, city: me!.venue!.city } });
    // Avançar até a véspera de 2 dias.
    let date = meta.currentDate!;
    const target = new Date(Date.parse(next.date) - 2 * 86_400_000).toISOString().slice(0, 10);
    while (date < target) {
      const r = await advanceOneDay(saveService, meta.id);
      expect(r.ok).toBe(true);
      date = (await saveService.getMeta(meta.id))!.currentDate!;
    }
    await advanceOneDay(saveService, meta.id);
    const m = await saveService.getMeta(meta.id);
    expect(m!.press?.pending?.trigger).toBe("derby");
    const inbox = await saveService.getInbox(meta.id);
    expect(inbox.some((x) => x.category === "press")).toBe(true);
  }, 600_000);
});
```

(Os nomes `getLeagueFixtures`, `saveSquadById` e `venue.city` precisam ser conferidos no `SaveService`/tipos; use os que existem — por exemplo, ler as rodadas pelo `date-index` como `advanceUntil.ts` faz. Se a carreira começar longe do primeiro jogo, o segundo teste pode demorar: limite de 600 s.)

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/backend/press.advanceDay.test.ts` → FAIL.

- [ ] **Step 3: Implementar `pressWorld.ts` e a chamada no `advanceDay`**

Pontos no `advanceDay.ts`:
- **Títulos e eliminações do clube hoje:** no bloco de copa (l.1112-1125) e continental (l.1203-1208), onde o board recebe `title`/`early_exit`/`eliminated`, empurrar o slug em `pressTitles: string[]` / `pressEliminated: string[]` (locais novos, declarados perto de `boardMessages`, l.441). A eliminação de copa que não é "precoce" também conta: empurrar sempre que o clube do jogador perdeu um jogo de mata-mata decisivo hoje (o perdedor de `fixtureWinner` numa fase decidida).
- **Expectativa e clássico:** `boardAfterMatches` (`src/backend/boardWorld.ts`) já calcula os dois por jogo; fazer ele devolver também `context: Map<fixtureId, { expectation, derby }>` (mudar o retorno para `{ board, context }` e ajustar a chamada na l.993-1004).
- **Virada:** onde `playerObjectiveMet`/`playerMove`/`playerChampionOf` são definidos (l.2050-2060, 2331-2394), montar `pressRollover = { objectiveMet: playerObjectiveMet, move: playerMove?.kind ?? null, champion: playerChampionOf === meta.clubId }`.
- **Chamada:** depois de `applyMoraleDay` (l.2781), `if (humanActive && board)`: `const pressOut = await pressDay({...})`; `board = pressOut.board`; guardar `pressOut.invite` e `pressOut.news` em locais.
- **Inbox:** depois do bloco de mensagens adiadas (perto de `deferredAwardsMessages`, l.2871): `if (pressInvite) await emitInboxMessage(saveId, pressInvite, saveService);`.
- **Meta:** `metaPatch.press = pressOut.press` quando o passo rodou; na demissão (`ended`), `metaPatch.press = undefined` (conferir como os outros campos são limpos: provavelmente atribuindo `undefined`).

- [ ] **Step 4: Rodar** — `bun test src/backend/press.advanceDay.test.ts src/backend/board.advanceDay.test.ts src/Domain/press` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/pressWorld.ts src/backend/advanceDay.ts src/backend/boardWorld.ts src/backend/jobWorld.ts src/backend/press.advanceDay.test.ts
git commit -m "feat(press): coletivas no avanço do dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Coleta e gravação das notícias (`newsWorld`)

**Files:**
- Create: `src/backend/newsWorld.ts`
- Modify: `src/backend/advanceDay.ts`, `src/backend/scoutingWorld.ts` (exportar `famousIds`)
- Test: `src/backend/news.advanceDay.test.ts`

**Coleta** (`collectDayNews(args): Promise<DayNewsInput>`), chamada no fim do `advanceOneDay` (depois de `aiDesk.news()`, l.~2895). Com `marketFrozen` (pré-simulação do kit) o passo não roda: o kit é genérico e as datas são de antes da carreira.

Fontes (todas já em memória no `advanceOneDay`; não reler o mundo inteiro):

| Campo | De onde |
|---|---|
| `results` | `dayEvents` do tipo `match` com `competition` de liga de nível 1 (`tierOfLeague` / pirâmide, `index`), copa ou continental. Nome dos clubes pelo `index.byId(id)`. `levels`: só para vitórias (placar diferente), `clubLevel` dos dois elencos (`squadWrites.get(id)?.squad ?? getSquadById`), memoizado por clube no dia, envolvido em try/catch (como `safeLevel` do `boardWorld`) |
| `champions` | rollover: `table[0]` de cada liga virada (l.~1893); copa: `recordTitle(winnerId, "cup:…")`; continental: `recordTitle(ev.clubId, "continental:…")` — empurrar num array local `newsChampions` nesses três pontos |
| `moves` | `plan.moves` de cada unidade virada (`ClubMove`: clube, liga de destino, `kind`) com o nível da liga de origem |
| `newLeaders` | liga do jogador e `meta.followedLeagues`: `getLeagueStandings` no começo do dia (antes dos jogos; ler junto do `importanceStandings`, l.614) e no fim; líder diferente e ≥ 5 jogos (`mp`) |
| `transfers` | `dayMoves` + `routeLog.transfers` com `fee > 0` e `kind` `transfer`; nomes pelo índice e pelo elenco comprador; `star` = id em `famousIds` (exportar de `scoutingWorld.ts`); `clubRecord` = o histórico do clube comprador marcou recorde (`recordTransferHistory` devolve os recordes batidos — empurrar num array local quando o recorde for `recordSigning`) |
| `managers` | `aiDesk.news()` só traz a liga do jogador; para o mundo, mudar `createAiManagerDesk` para guardar também `worldNews` (todas as demissões/contratações de clubes de nível 1) e expor `worldNews()`; seleções: incluir se o desk de seleções já devolver algo parecido, senão fica de fora |
| `awards` | `recordLeagueAwards` → `res.awards` (melhor jogador de ligas de nível 1); cerimônia mundial (`runWorldCeremony`) → os vencedores de jogador e técnico (ler os tipos em `src/types/awardTypes.ts`) |
| `stars` | lesões: `MatchEvent.injuries` com `severity === "severe"` e jogador em `famousIds`; aposentados: a lista de aposentadorias da virada (procurar `processRetirements` no `advanceDay`) filtrada por `wasWorldClass` |
| `national` | `nationalDay` (resultado de `playNationalDay`): campeão de torneio e favorito eliminado, se o resultado expuser; se não expuser, acrescentar ao retorno de `playNationalDay` uma lista `headlines` com `{ kind, competition, team, teamId }` no ponto em que o torneio fecha / um time do top 8 do Elo cai |
| `clubRecords` | `clubRecordMessages` (clube do jogador) e os recordes que `recordLeagueSeasonHistory` devolve para clubes de nível 1 |
| `press` | `pressOut.news` + as citações da rota (a rota grava direto, Task 11) |

Depois: `const items = buildDayNews(input); await saveService.appendNews(saveId, items);` e, no primeiro dia de um mês, `await saveService.pruneNews(saveId, monthMinus(currentDate, NEWS.MONTHS_KEPT - 1))` — **fora** do buffer não dá (o dia é uma unidade): `pruneNews` chama `deleteNewsMonth`, que o `BufferingSaveDAL` repassa direto ao disco; aceitável porque apagar um mês antigo não depende do resto do dia.

Custo: medir com `bun scripts/bench-advance-day.ts --days 14 --buffered` antes e depois; aceitar até +5% no dia sem motor completo. Se passar, cortar o `clubLevel` (zebra só pela tabela: vencedor na metade de baixo, perdedor no top 3 da liga, só liga) e anotar a mudança no `press.md`.

- [ ] **Step 1: Teste que falha** (`src/backend/news.advanceDay.test.ts`)

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";

describe("news in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); });

  test("dias com jogos geram notícias, nenhum dia acima dos tetos, ids únicos", async () => {
    const meta = await saveService.createSave({ leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"] });
    created.push(meta.id);
    for (let i = 0; i < 10; i++) expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    const months = await saveService.listNewsMonths(meta.id);
    const all = (await Promise.all(months.map((m) => saveService.getNewsMonth(meta.id, m)))).flat();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
    const perDay = new Map<string, number>();
    for (const n of all) perDay.set(n.date, (perDay.get(n.date) ?? 0) + 1);
    for (const c of perDay.values()) expect(c).toBeLessThanOrEqual(30);
  }, 600_000);
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar** (`newsWorld.ts` + pontos no `advanceDay.ts`, `managerWorld.ts`, `scoutingWorld.ts`, `nationalWorld.ts` se preciso).

- [ ] **Step 4: Rodar** — `bun test src/backend/news.advanceDay.test.ts src/backend/press.advanceDay.test.ts src/Domain/news` → PASS. Rodar o bench (antes/depois) e anotar os números para o `press.md`.

- [ ] **Step 5: Commit**

```bash
git add src/backend src/Domain
git commit -m "feat(news): notícias do mundo gravadas a cada dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Rotas

**Files:**
- Create: `src/backend/pressRoutes.ts`, `src/backend/newsRoutes.ts`
- Modify: `src/backend/routes.ts` (spread em `apiRoutes`, l.91-120)
- Test: `src/backend/press.routes.test.ts`, `src/backend/news.routes.test.ts`

**`GET /api/saves/:saveId/press`** → `{ pending: PressConferenceView | null, history }`.

**`POST /api/saves/:saveId/press/:pressId`** com `{ answers: { questionId, answerId }[] }`:
1. `requireSaveOwner`; 405 se não for POST; corpo inválido → 400 `invalidAnswers`.
2. `withSaveLock(saveId, () => inUnit(saveId, async (service) => { … }))` (copiar `inUnit` de `facilityRoutes.ts:143`).
3. `meta.clubId` vazio → 409 `noClub`. `meta.press?.pending?.id !== pressId` ou `currentDate >= pending.expires` → 409 `pressClosed`.
4. `answers` em mapa; ids repetidos, pergunta faltando ou id desconhecido → 400 `invalidAnswers` (`validateAnswers`).
5. `answerConference({ conference, answers, squad: getSquadById(clubId), board: meta.board, state: meta.press })`; gravar o elenco (`saveSquadById`), `updateMeta({ press, board })`.
6. Notícias: cada `quote` vira um `press_quote` (`buildDayNews({ ...emptyDayNewsInput(currentDate), press: [...] })` → `appendNews`), com `key` = tom e o jogador citado.
7. Resposta `{ ok: true }` (nunca o efeito).

**`GET /api/saves/:saveId/news?scope=all|club|league|followed&competition=&before=&limit=`**:
- Validar: `scope` na lista, `limit` 1..100 (padrão 40), `before` `YYYY-MM-DD` real (`isRealIsoDate`) ou ausente; senão 400.
- Ler os meses do mais novo para o mais velho (`listNewsMonths`), filtrar: `club` → `clubIds.includes(meta.clubId)`; `league` → `league === meta.leagueSlug`; `followed` → `league` em `meta.followedLeagues ?? []`; `competition` → `league === c || competition === c`; `before` → `date < before`. Ordenar por data desc, depois importância desc, depois id. Cortar em `limit`.
- Resposta `{ items, nextBefore }` (`nextBefore` = data do último item quando cortou, senão `null`). Como o corte por data pode partir um dia ao meio, usar `before` como "data menor que" e devolver o dia inteiro do último item cortado (sobe o limite até fechar o dia).

- [ ] **Step 1: Testes que falham**

`src/backend/press.routes.test.ts` (padrão de rota: chamar o handler com um `Request` + `params` e o cookie de sessão; copiar o jeito de `src/backend/achievements.test.ts` ou `facilities.routes.test.ts` — eles criam usuário/sessão e um save do dono):

```ts
// casos:
// 1. GET sem dono → 401/403; GET com dono e sem pendente → { pending: null, history: [] }
// 2. GET com pendente: a resposta não contém "tone" (JSON.stringify)
// 3. POST com respostas válidas → 200; meta.press.pending some; history[0].answers é array; um press_quote gravado quando houve provocação
// 4. POST de novo com o mesmo id → 409 pressClosed
// 5. POST faltando pergunta → 400 invalidAnswers; com id desconhecido → 400
// 6. POST depois de vencer (currentDate >= expires) → 409 pressClosed
```

Escrever cada caso como `test(...)` completo, montando a pendente com `buildConference` + `updateMeta`, como no teste da Task 9.

`src/backend/news.routes.test.ts`:

```ts
// casos:
// 1. dono; scope inválido → 400; limit 0 ou 101 → 400; before "2027-02-30" → 400
// 2. gravar com appendNews 5 itens (2 do clube "33", 1 da liga do save, 1 de outra liga seguida, 1 de outra) e conferir cada scope
// 3. limit 2 → nextBefore definido; a página seguinte com before=nextBefore traz o resto
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar** os dois módulos e espalhar em `apiRoutes` (`...pressRoutes, ...newsRoutes`).

- [ ] **Step 4: Rodar** — `bun test src/backend/press.routes.test.ts src/backend/news.routes.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/pressRoutes.ts src/backend/newsRoutes.ts src/backend/routes.ts src/backend/press.routes.test.ts src/backend/news.routes.test.ts
git commit -m "feat(press): rotas da coletiva e das notícias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Modal da coletiva e corpo na inbox (UI + textos da coletiva)

**Files:**
- Create: `src/GameInterface/Press/pressApi.ts`, `PressModal.tsx`, `PressInboxBody.tsx`
- Modify: `src/GameInterface/InboxScreen.tsx` (dispatch do corpo, subject/preview em `leaguePrizeTexts`), `src/i18n/locales/en.json`, `pt-BR.json`

- [ ] **Step 1: `pressApi.ts`**

```ts
import type { PressConferenceView, PressRecord } from "@/types/pressTypes";

export async function fetchPress(saveId: string): Promise<{ pending: PressConferenceView | null; history: PressRecord[] }> {
  const res = await fetch(`/api/saves/${saveId}/press`);
  if (!res.ok) throw new Error(`press ${res.status}`);
  return res.json();
}

export async function answerPress(saveId: string, pressId: string, answers: Record<string, string>): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`/api/saves/${saveId}/press/${pressId}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, answerId]) => ({ questionId, answerId })) }),
  });
  return res.ok ? { ok: true } : ((await res.json().catch(() => ({ error: "unknown" }))) as { error: string });
}
```

- [ ] **Step 2: `PressModal.tsx`** — no `Modal` compartilhado (o mesmo do `TalkModal`), título `t("press.modal.title", { trigger: t(\`press.trigger.${c.trigger}\`) })` no estilo de título de seção; para cada pergunta: rótulo "PERGUNTA N" (estilo rótulo), o texto `t(q.key, q.params)` e as 3 respostas como **cartões de escolha** (`rounded-md border border-border bg-card p-3`, selecionado `border-primary ring-1 ring-primary`, texto `t(a.key, q.params)`); `Button` primário "Enviar respostas" desligado até responder todas; depois do envio, "Respostas enviadas" e fechar; erro 409 → `t("press.closed")`. Sem nenhum texto de efeito.

- [ ] **Step 3: `PressInboxBody.tsx`** (mesmo molde do `PlayerTalkBody`): texto `t(\`press.inbox.${message.pressKind}\`, { trigger: …, opponent })`, validade `t("press.inbox.until", { date })`; se `fetchPress(...).pending?.id === message.pressId` e não respondida → `Button` "Responder" (ícone `mic`) abre o `PressModal`; senão `t("press.inbox.closed")`. No `InboxScreen`: `{message.category === "press" && <PressInboxBody message={message} />}`, e em `leaguePrizeTexts`: `if (message.category === "press") return { subject: t("press.inbox.subject", { trigger: t(\`press.trigger.${message.trigger}\`) }), preview: message.opponent ?? "" };`.

- [ ] **Step 4: Textos** (`en.json` e `pt-BR.json`). Blocos novos de topo `press` e `inbox.categories.press`. Cada chave de pergunta tem 2 variantes (`.0`, `.1`), cada resposta 2 variantes. Lista completa a escrever (em pt-BR abaixo; em inglês, a tradução natural):

```json
"press": {
  "closed": "Esta coletiva já foi encerrada.",
  "sent": "Respostas enviadas",
  "send": "Enviar respostas",
  "question": "PERGUNTA {{n}}",
  "modal": { "title": "Coletiva · {{trigger}}" },
  "inbox": {
    "subject": "Coletiva de imprensa · {{trigger}}",
    "pre": "A imprensa quer ouvir você antes do jogo contra o {{opponent}}.",
    "post": "A imprensa quer ouvir você depois do jogo contra o {{opponent}}.",
    "postNoOpponent": "A imprensa quer ouvir você.",
    "until": "Vale até {{date}}",
    "answer": "Responder",
    "closed": "Coletiva encerrada"
  },
  "trigger": {
    "derby": "Clássico", "knockout": "Mata-mata", "run_in": "Reta final", "ultimatum": "Ultimato",
    "title": "Título", "promoted": "Acesso", "relegated": "Rebaixamento", "heavy_defeat": "Goleada sofrida",
    "eliminated": "Eliminação", "winless": "Sequência sem vitória", "upset_win": "Zebra", "upset_loss": "Tropeço"
  },
  "q": {
    "match": {
      "derby": ["O clássico contra o {{opponent}} vale muito para a torcida. Como você chega?", "Que jogo você espera contra o {{opponent}}?"],
      "knockout": ["É mata-mata contra o {{opponent}}. O time está pronto?", "Uma vaga em jogo contra o {{opponent}}. Qual é o plano?"],
      "run_in": ["Faltam poucas rodadas. Dá para chegar lá?", "Cada ponto conta agora. Como o time encara o {{opponent}}?"],
      "ultimatum": ["A diretoria pressiona. O jogo contra o {{opponent}} é decisivo?", "Seu cargo está em risco?"],
      "title": ["Campeão! O que esse título significa?", "Que temporada! Qual foi o segredo?"],
      "promoted": ["O acesso veio. O time está pronto para a divisão de cima?", "Como foi chegar ao acesso?"],
      "relegated": ["O rebaixamento foi confirmado. O que deu errado?", "Como o clube se reergue depois da queda?"],
      "heavy_defeat": ["Derrota pesada para o {{opponent}} ({{score}}). O que aconteceu?", "Como explicar o {{score}}?"],
      "eliminated": ["Eliminados pelo {{opponent}}. Qual é a sensação?", "A eliminação foi justa?"],
      "winless": ["Cinco jogos sem vencer. O que falta?", "A sequência ruim preocupa?"],
      "upset_win": ["Vitória sobre o {{opponent}} ({{score}}). Você esperava?", "Ninguém apostava nesse resultado. Como foi?"],
      "upset_loss": ["Derrota para o {{opponent}}. Era um jogo para vencer?", "Como perder para o {{opponent}}?"]
    },
    "squad": { "good": ["O que você diz do elenco?", "O grupo está unido?"], "bad": ["Os jogadores estão à altura?", "O elenco tem culpa?"] },
    "player": {
      "star": ["{{player}} foi o melhor em campo. Merece elogios?", "O que achou da atuação de {{player}}?"],
      "scorer": ["{{player}} é o artilheiro do time. Ele decide?", "Quanto o time depende de {{player}}?"],
      "culprit": ["{{player}} teve uma noite difícil. O que houve?", "{{player}} falhou?"]
    },
    "job": ["A diretoria ainda confia em você?", "Você se sente seguro no cargo?"]
  },
  "a": {
    "confident": ["Vamos vencer.", "Estamos prontos e vamos sair com a vitória."],
    "cautious": ["Um jogo de cada vez.", "Respeitamos o adversário; vamos trabalhar."],
    "provocative": ["Eles que se preocupem com a gente.", "Em campo vai ficar claro quem é melhor."],
    "blame_self": ["A responsabilidade é minha.", "Errei na preparação; assumo."],
    "defend_squad": ["Confio totalmente nesse grupo.", "Os jogadores deram tudo."],
    "demand_squad": ["Espero muito mais deles.", "Esse desempenho não serve."],
    "neutral": ["Vamos analisar com calma.", "Não é hora de falar disso."],
    "praise": ["{{player}} está voando.", "{{player}} merece todos os elogios."],
    "criticize": ["{{player}} precisa render mais.", "{{player}} sabe que deve mais."],
    "protect": ["{{player}} tem todo o meu apoio.", "Ninguém vai crucificar {{player}}."],
    "job_confident": ["Vamos cumprir a meta da temporada.", "Tenho certeza de que vamos alcançar o objetivo."],
    "ask_signings": ["Precisamos de reforços.", "Com esse elenco é difícil; a diretoria sabe."],
    "deflect": ["Meu foco é o próximo jogo.", "Isso não depende de mim."]
  }
}
```

**Formato i18n:** o i18next usa chaves com índice (`press.q.match.derby.0`) sobre arrays só com `returnObjects`; para `t("press.q.match.derby.0")` funcionar, gravar como **objetos** `{ "0": "...", "1": "..." }` em vez de arrays (converter o bloco acima). Conferir com um teste rápido (`src/i18n/press.keys.test.ts`): para todo gatilho, tópico, ângulo e tom do código, as chaves `.0` e `.1` existem em en e pt-BR.

```ts
import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { PRESS } from "@/Domain/press/pressConfig";

const get = (o: any, path: string) => path.split(".").reduce((x, k) => x?.[k], o);
const keys = [
  ...PRESS.PRIORITY.map((t) => `press.q.match.${t}`),
  "press.q.squad.good", "press.q.squad.bad", "press.q.player.star", "press.q.player.scorer", "press.q.player.culprit", "press.q.job",
  ...Object.keys(PRESS.TONE).map((t) => `press.a.${t}`),
];
describe("press i18n", () => {
  for (const lang of [en, pt]) for (const k of keys) for (const v of ["0", "1"])
    test(`${k}.${v}`, () => expect(typeof get(lang, `${k}.${v}`)).toBe("string"));
});
```

- [ ] **Step 5: Rodar** — `bun test src/i18n src/GameInterface && bun run ui:audit` → PASS, 0 violações nos arquivos novos.

- [ ] **Step 6: Commit**

```bash
git add src/GameInterface src/i18n
git commit -m "feat(press): modal da coletiva e convite na caixa de entrada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Página `/news` e cartão do Painel

**Files:**
- Create: `src/pages/news/index.html`, `src/pages/news/entry.tsx`, `src/GameInterface/News/NewsScreen.tsx`, `src/GameInterface/News/newsApi.ts`, `src/GameInterface/News/NewsList.tsx`, `src/GameInterface/News/newsText.ts`
- Modify: `src/index.ts` (import + rota `/news`), `src/GameInterface/Dashboard/HomeCards.tsx` (`NewsCard`), `src/GameInterface/DashboardScreen.tsx`, `en.json`, `pt-BR.json`

- [ ] **Step 1: Página** — copiar `src/pages/achievements/index.html` (título "FMProject - News") e:

```tsx
import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { NewsScreen } from "@/GameInterface/News/NewsScreen";

function NewsPage() {
  return (
    <Layout>
      <NewsScreen />
    </Layout>
  );
}

createPage(NewsPage);
```

Em `src/index.ts`: `import newsPage from "./pages/news/index.html";` e `"/news": newsPage,` junto de `/achievements`.

- [ ] **Step 2: `newsApi.ts`**

```ts
import type { NewsItem } from "@/types/newsTypes";
export type NewsScopeFilter = "all" | "club" | "league" | "followed";
export async function fetchNews(saveId: string, q: { scope: NewsScopeFilter; competition?: string; before?: string; limit?: number }):
  Promise<{ items: NewsItem[]; nextBefore: string | null }> {
  const p = new URLSearchParams({ scope: q.scope, limit: String(q.limit ?? 40) });
  if (q.competition) p.set("competition", q.competition);
  if (q.before) p.set("before", q.before);
  const res = await fetch(`/api/saves/${saveId}/news?${p}`);
  if (!res.ok) throw new Error(`news ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: `newsText.ts`** — `newsHeadline(item, t, leagues, lang)` e `newsLine(...)`: `t(\`news.${item.kind}.${newsVariant(item.id)}.title\`, params)` e `.text`, com `competition`/`league` traduzidos por `competitionName(slug, leagues, lang)` (`src/Domain/world/labels.ts`), valores com o formatador de dinheiro de `@/Domain/money`, `press_quote` com `t(\`news.pressQuote.${params.key}\`, …)`.

- [ ] **Step 4: `NewsScreen.tsx`** — dentro de `<ScreenContainer>`: `<ScreenTitle accent={t("screenTitles.news.accent")}>{t("screenTitles.news.main")}</ScreenTitle>`; linha de filtros: `OptionChips` (Tudo, Meu clube, Minha liga, Seguidas) + `SelectCombobox` com `label` "COMPETIÇÃO" (opções: "Todas" + `statsCompetitionOptions` ou a mesma lista da tela de Estatísticas); lista (`NewsList`) agrupada por data (rótulo de dia no estilo rótulo, `Intl` longo), cada item: `ClubLogo` 32px do primeiro `clubIds` (ou `Flag` para `national`), manchete `font-semibold`, linha `text-sm text-muted-foreground`, importância 3 com `border-l-2 border-primary pl-3`; `Button` secundário "Carregar mais" com `nextBefore`. Estado vazio: `t("news.empty")`. Desempregado: as notícias continuam (só "Meu clube" fica vazio).

- [ ] **Step 5: `NewsCard`** em `HomeCards.tsx`: `HomeCard` com `title={t("dashboard.home.news")}`, `href="/news"`, `linkLabel={t("dashboard.home.newsAll")}`; busca `fetchNews(saveId, { scope: "all", limit: 20 })`, ordena importância ≥ 2 primeiro, mostra 5 (escudo 32px + manchete). No `DashboardScreen`, logo depois do par Destaques | Caixa de entrada (l.319-329) e antes de `WeekFinancesCard`.

- [ ] **Step 6: Textos** — `screenTitles.news { main: "NOTÍCIAS DO", accent: "MUNDO" }` / `{ main: "WORLD", accent: "NEWS" }`; `news.filters.{all,club,league,followed,competition,allCompetitions}`, `news.empty`, `news.more`, `dashboard.home.news`, `dashboard.home.newsAll`; e por tipo `news.<kind>.{0,1,2}.{title,text}` para todos os `NewsKind` (18), com os parâmetros de `buildDayNews` (`winner`, `loser`, `score`, `club`, `competition`, `league`, `player`, `from`, `to`, `fee`, `manager`, `name`, `team`, `record`). Exemplo pt-BR:

```json
"thrashing": {
  "0": { "title": "{{winner}} atropela o {{loser}}", "text": "Goleada de {{score}}." },
  "1": { "title": "Show do {{winner}}: {{score}} no {{loser}}", "text": "Uma noite para esquecer para o {{loser}}." },
  "2": { "title": "{{winner}} {{score}} {{loser}}", "text": "Placar elástico na rodada." }
}
```

`news.pressQuote.<tom>` com a manchete da repercussão (ex.: `provocative`: "{{manager}} provoca o rival antes do clássico"; `criticize`: "{{manager}} cobra {{player}} publicamente"). Teste de chaves como na Task 12 (`src/i18n/news.keys.test.ts`, todos os `NewsKind` × 3 variantes × title/text, en e pt-BR; mais `pressQuote` para cada tom de `PRESS.QUOTE_TONES`).

- [ ] **Step 7: Rodar** — `bun test src/i18n src/GameInterface && bun run ui:audit` → PASS; subir o dev server (`DEV_AUTO_LOGIN=1 bun run dev` a partir do worktree com a grafia real do caminho), logar por `/api/auth/dev-login`, criar uma carreira, avançar alguns dias e abrir `/news` e o Painel; conferir que as notícias aparecem e que os filtros funcionam. Matar só o processo iniciado, pelo PID.

- [ ] **Step 8: Commit**

```bash
git add src/pages/news src/index.ts src/GameInterface src/i18n
git commit -m "feat(news): página de notícias e cartão no Painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Documentação, smoke, versão

**Files:**
- Create: `.claude/rules/game/press.md`
- Modify: `scripts/season-rollover-smoke.ts` (seção "Imprensa"), `src/GameInterface/changelog/changelog.ts`, `package.json`, `docs/ROADMAP.md`, `.claude/rules/game/responsibilities.md` (tópico `actions` inclui `press`), `.claude/rules/game/board-fans.md` e `morale.md` (uma seção curta cada, "Imprensa (Etapa 42)")

- [ ] **Step 1: `.claude/rules/game/press.md`** — regra, arquivos, gatilhos, tabela de efeitos e promessas, notícias (fontes, tetos, importância, gravação), rotas, telas, testes, números do bench (Task 10) e limitações, no formato dos outros arquivos de `.claude/rules/game/`.

- [ ] **Step 2: Smoke** — seção "Imprensa" em `scripts/season-rollover-smoke.ts`: quando aparecer uma coletiva pendente, responder pela rota alternando os tons (`answers` com o índice `n % 3`), e deixar uma em cada quatro vencer; no fim: houve coletivas; nenhuma resposta dupla (cada `history.id` único); promessas abertas só do clube atual; notícias em todo mês da corrida; nenhum dia com mais de 30 e nenhuma liga com mais de 3 num dia (fora `press_*`); `GET /news` responde para os quatro escopos. **Não rodar o smoke** (só quando o usuário pedir).

- [ ] **Step 3: Versão e changelog** — `package.json` `"version": "4.23"`; nova entrada no topo de `changelog`:

```ts
  {
    version: "4.23",
    date: "<data do merge>",
    items: [
      { pt: "Coletivas de imprensa nos momentos marcantes (clássicos, mata-matas, reta final, títulos, goleadas): suas respostas mexem na moral, na diretoria e na torcida, e o que você promete é cobrado depois", en: "Press conferences at key moments (derbies, knockouts, run-in, titles, heavy defeats): your answers move morale, the board and the fans, and your promises are held against you later" },
      { pt: "Página de notícias do mundo: goleadas, zebras, campeões, grandes transferências, técnicos demitidos, prêmios e a repercussão das suas coletivas", en: "World news page: thrashings, upsets, champions, big transfers, sacked managers, awards and how your press conferences landed" },
    ],
  },
```

`upcoming`: tirar o item da Imprensa; ficam Multiplayer, Chat e amigos, Pênaltis vistos de perto (regra `keep-upcoming-current`).

- [ ] **Step 4: Roadmap** — linha 42 com ✅, versão 4.23 e resumo; "Onde estamos" com a 4.23.

- [ ] **Step 5: Suíte completa** (em partes, uma de cada vez):
  1. `bun test src/Domain src/GameEngine src/GameInterface src/GraficsEngine src/types src/i18n src/repoHygiene.test.ts scripts`
  2. backend em blocos de 30 arquivos (`ls src/backend/**/*.test.ts` dividido)
  3. `bun test src/lab src/mcp`

  Tudo verde; `bun run ui:audit` limpo.

- [ ] **Step 6: Commit**

```bash
git add .claude/rules docs/ROADMAP.md scripts/season-rollover-smoke.ts src/GameInterface/changelog/changelog.ts package.json
git commit -m "docs(press): regra da imprensa, smoke, changelog e versão 4.23

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
