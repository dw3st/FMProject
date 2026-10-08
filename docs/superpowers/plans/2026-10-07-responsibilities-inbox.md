# Responsabilidades e caixa de entrada mais limpa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o diretor cuida das renovações e das conversas de contrato do clube do jogador (padrão), e o jogador escolhe quais tipos de notícia chegam à caixa de entrada.

**Architecture:** lógica pura em `src/Domain/responsibilities/` (decisão do diretor) e `src/Domain/inbox/inboxTopics.ts` (tópico de cada mensagem, padrões, travados). O avanço do dia chama a decisão toda segunda; o filtro de notícias fica num ponto só, `SaveService.appendInbox`. Duas rotas novas e dois painéis na tela.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; arquivos em CRLF no disco e LF no índice — conferir `git diff --stat` (nenhum arquivo convertido inteiro); commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Trabalho num worktree `C:/Projects/FMProject-resp`, branch `feat/responsibilities` (criar a partir do `main`, copiar `src/Data`, `bun install --frozen-lockfile`).

---

### Task 1: Tópicos da caixa de entrada (puro)

**Files:** Create `src/Domain/inbox/inboxTopics.ts`, `src/Domain/inbox/inboxTopics.test.ts`.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { INBOX_TOPICS, inboxAllowed, inboxTopicOf, sanitizeInboxPrefs, topicDefault, topicLocked } from "@/Domain/inbox/inboxTopics";
import type { InboxMessage } from "@/types/inboxTypes";

const msg = (category: string, kind?: string) => ({ category, kind } as unknown as InboxMessage);

describe("inboxTopicOf", () => {
  test("maps categories and kinds", () => {
    expect(inboxTopicOf(msg("manager_news"))).toBe("manager_news");
    expect(inboxTopicOf(msg("scouting", "report"))).toBe("scouting_reports");
    expect(inboxTopicOf(msg("scouting", "shortlist"))).toBe("scouting_alerts");
    expect(inboxTopicOf(msg("transfer", "bid"))).toBe("actions");
    expect(inboxTopicOf(msg("transfer", "loan_back"))).toBe("transfer_news");
    expect(inboxTopicOf(msg("player", "talk"))).toBe("actions");
    expect(inboxTopicOf(msg("season", "negative_balance"))).toBe("actions");
    expect(inboxTopicOf(msg("retirement", "reborn"))).toBe("actions");
    expect(inboxTopicOf(msg("retirement", "retired"))).toBe("retirement");
  });
});

describe("prefs", () => {
  test("defaults: manager news and scouting reports off, the rest on", () => {
    expect(topicDefault("manager_news")).toBe(false);
    expect(topicDefault("scouting_reports")).toBe(false);
    for (const t of INBOX_TOPICS.filter((x) => x !== "manager_news" && x !== "scouting_reports")) expect(topicDefault(t)).toBe(true);
  });
  test("actions can never be switched off", () => {
    expect(topicLocked("actions")).toBe(true);
    expect(inboxAllowed(msg("transfer", "bid"), { actions: false })).toBe(true);
  });
  test("a switched-off topic is dropped, a default-off topic too", () => {
    expect(inboxAllowed(msg("injury", "injured"), { injuries: false })).toBe(false);
    expect(inboxAllowed(msg("manager_news"), {})).toBe(false);
    expect(inboxAllowed(msg("manager_news"), { manager_news: true })).toBe(true);
  });
  test("sanitize rejects unknown topics and locked ones", () => {
    expect(() => sanitizeInboxPrefs({ nope: true })).toThrow();
    expect(() => sanitizeInboxPrefs({ actions: false })).toThrow();
    expect(sanitizeInboxPrefs({ injuries: false })).toEqual({ injuries: false });
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/inbox/inboxTopics.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementação**

```ts
import type { InboxCategory, InboxMessage } from "@/types/inboxTypes";

/** Reader-facing switchable groups of inbox messages (`.claude/rules/game/responsibilities.md`). */
export const INBOX_TOPICS = [
  "actions", "contracts", "transfer_news", "injuries", "development", "youth", "retirement",
  "competitions", "club_records", "facilities", "scouting_alerts", "scouting_reports", "manager_news",
] as const;
export type InboxTopic = (typeof INBOX_TOPICS)[number];
export type InboxPrefs = Partial<Record<InboxTopic, boolean>>;

const DEFAULT_OFF = new Set<InboxTopic>(["manager_news", "scouting_reports"]);
const LOCKED = new Set<InboxTopic>(["actions"]);

/** Category → topic; a few kinds inside a category are actions or a different topic (KIND_TOPIC). */
const CATEGORY_TOPIC: Record<InboxCategory, InboxTopic> = {
  development: "development", youth: "youth", injury: "injuries", retirement: "retirement",
  season: "competitions", cup: "competitions", continental: "competitions",
  club_record: "club_records", facilities: "facilities", contract: "contracts",
  transfer: "transfer_news", transfer_in: "transfer_news", transfer_out: "transfer_news",
  scouting: "scouting_alerts", manager_news: "manager_news",
  board: "actions", job: "actions", player: "actions",
};

/** `${category}:${kind}` that leave the category's topic. */
const KIND_TOPIC: Record<string, InboxTopic> = {
  "transfer:bid": "actions", "transfer:loan_bid": "actions", "transfer:rival_bid": "actions",
  "season:negative_balance": "actions", "retirement:reborn": "actions",
  "scouting:report": "scouting_reports", "scouting:mission_done": "scouting_reports",
  "scouting:recommendation": "scouting_reports", "scouting:gem": "scouting_reports",
};

export function inboxTopicOf(m: InboxMessage): InboxTopic {
  const kind = (m as { kind?: string }).kind;
  return (kind && KIND_TOPIC[`${m.category}:${kind}`]) || CATEGORY_TOPIC[m.category];
}
export function topicDefault(t: InboxTopic): boolean { return !DEFAULT_OFF.has(t); }
export function topicLocked(t: InboxTopic): boolean { return LOCKED.has(t); }

export function inboxAllowed(m: InboxMessage, prefs: InboxPrefs | undefined): boolean {
  const t = inboxTopicOf(m);
  if (topicLocked(t)) return true;
  return prefs?.[t] ?? topicDefault(t);
}

/** Validates a PUT body; throws on unknown or locked topics or non-boolean values. */
export function sanitizeInboxPrefs(raw: unknown): InboxPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid");
  const out: InboxPrefs = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(INBOX_TOPICS as readonly string[]).includes(k)) throw new Error(`unknown topic ${k}`);
    if (typeof v !== "boolean") throw new Error(`invalid value for ${k}`);
    if (topicLocked(k as InboxTopic)) throw new Error(`locked topic ${k}`);
    out[k as InboxTopic] = v;
  }
  return out;
}
```

Confira os `kind` reais em `src/types/inboxTypes.ts` (ex. do contrato do técnico em `board`, propostas de emprego em `job`) e ajuste `KIND_TOPIC` para a tabela da spec. `CATEGORY_TOPIC` é exaustivo: uma categoria nova não compila sem tópico.

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** — `feat(inbox): tópicos das notícias com padrões e travados`.

---

### Task 2: Filtro no `appendInbox` e rota de preferências

**Files:** Modify `src/backend/SaveService.ts` (`appendInbox`, `SaveMeta.inboxPrefs?: InboxPrefs`); Create `src/backend/responsibilityRoutes.ts` (+ registrar como as outras rotas em `src/index.ts`/`routes.ts`); Test `src/backend/responsibilities.routes.test.ts`.

- [ ] **Step 1: Teste de rota** (siga o molde de outro teste de rota, ex. `src/backend/staff.routes.test.ts`): cria save; `GET /api/saves/:id/inbox-prefs` devolve `{ prefs: {}, topics: [{ topic, enabled, locked }] }` com os padrões; `PUT` com `{ injuries: false }` grava; `PUT` com `{ actions: false }` ou tópico desconhecido → 400; outro usuário → 403/404 como as demais; depois do PUT, `appendInbox` de uma mensagem `injury` não grava e a de `transfer:bid` grava.
- [ ] **Step 2: Implementação**
  - `appendInbox(saveId, message)`: lê a meta (cache simples por instância do `SaveService`, invalidado quando a meta é gravada — o dia usa um `SaveService` novo sobre o `BufferingSaveDAL`), e só grava se `inboxAllowed(message, meta.inboxPrefs)`.
  - Rotas `GET/PUT /api/saves/:id/inbox-prefs` com `requireSaveOwner` e `withSaveLock` no PUT; `sanitizeInboxPrefs` (400 com `{ error }`).
- [ ] **Step 3: Rodar** `bun test src/backend/responsibilities.routes.test.ts src/Domain/inbox` → PASS. **Step 4: Commit** — `feat(inbox): preferências de notícias por tipo, filtradas na gravação`.

---

### Task 3: Decisão do diretor (puro)

**Files:** Create `src/Domain/responsibilities/director.ts`, `director.test.ts`, `src/Domain/responsibilities/responsibilitiesConfig.ts` (`DIRECTOR_DECIDE_DAYS = 120`).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { directorDecisions } from "@/Domain/responsibilities/director";
// Monte um elenco pequeno com o helper de squad que outros testes de contrato usam
// (ex. src/Domain/contracts/*.test.ts) — leia-os e reaproveite.

describe("directorDecisions", () => {
  test("renews a regular starter whose contract ends within 120 days", () => { /* renew: true, contract novo */ });
  test("lets an old or weak player go", () => { /* renew: false */ });
  test("a furious player who refuses becomes 'refused'", () => { /* outcome "refused" */ });
  test("players already decided this season or renewed by the manager are skipped", () => { /* nada */ });
  test("a player on loan from another club is never touched", () => { /* nada */ });
});
```

Escreva os corpos com os helpers reais de teste de contratos.

- [ ] **Step 2: Implementação** — assinatura:

```ts
export interface DirectorOutcome { playerId: string; name: string; outcome: "renewed" | "leaving" | "refused"; years?: number; wage?: number }
export function directorDecisions(args: {
  squad: Squad; date: string; seasonEnd: string; seasonKey: string;
  decided: Record<string, { season: string }>; maxWageBudget: number;
}): { squad: Squad; outcomes: DirectorOutcome[]; decided: Record<string, { season: string; renew: boolean }> }
```

Para cada jogador (não `loan`) com `daysBetween(date, contract.until) <= DIRECTOR_DECIDE_DAYS`, sem decisão na `seasonKey` e cujo contrato não foi renovado depois de entrar na janela (o técnico renovou = `until` já fora da janela, então nem entra):
1. `years` = regra de idade da IA (a mesma usada na renovação da virada; extraia para uma função exportada em `contracts.ts` se ainda não for); `newContract = renewalContract(player, squad, seasonEnd, years)`.
2. `aiShouldRenew(player, squad, newContract.wage, billWithoutHim, maxWageBudget)` falso → `leaving`.
3. Verdadeiro → `evaluateContractOffer({ wage: newContract.wage, years }, player, squad, date, { renewal: true })` e `refusesRenewal` da moral (`src/Domain/morale/morale.ts`): recusa → `refused`; aceita → aplicar o contrato como a rota `renew` faz (`renewalWithinLimits`, `until` pela mesma conta de `contractRoutes.ts`) e `renewed`.
- [ ] **Step 3: Rodar** → PASS. **Step 4: Commit** — `feat(contratos): decisão do diretor sobre renovações`.

---

### Task 4: Diretor no avanço do dia, conversas e avisos

**Files:** Modify `src/backend/SaveService.ts` (`SaveMeta.responsibilities?`, `SaveMeta.directorDecisions?`), `src/backend/advanceDay.ts`, `src/backend/moraleWorld.ts`/`src/Domain/morale/morale.ts` (conversas de contrato), `src/types/inboxTypes.ts` (`ContractInboxMessage.kind` + `"director_summary"` e os campos do resumo), `src/Domain/inbox/inboxEvents.ts` (builder do resumo), rotas `GET/PUT /api/saves/:id/responsibilities` no `responsibilityRoutes.ts`.

- [ ] **Step 1: Testes** (rota/serviço, molde de `src/backend/contracts.renew.test.ts` / `board.advanceDay.test.ts`):
  - com o diretor (padrão), avançar até uma segunda com um titular a ≤ 120 dias do fim: contrato renovado, moral +6, uma mensagem `director_summary`, nenhuma `expiring`;
  - conversa de contrato não vira mensagem `player`; o pedido é respondido (moral como `promise_renewal` se renovado, `refuse` senão);
  - com `PUT /responsibilities { contracts: "manager" }`: nada é renovado sozinho, o aviso `expiring` e as conversas voltam.
- [ ] **Step 2: Implementação**
  - Toda segunda, se há clube do jogador e `responsibilities?.contracts !== "manager"`: `directorDecisions` com o teto de folha do clube (`maxWageBudget` como `aiClubFinance` calcula para o elenco; ver `src/Domain/aiFinance/aiClubFinance.ts`), grava o elenco e `meta.directorDecisions`, empilha o resumo (adiado, como as outras mensagens, depois do `clearInbox`).
  - Aviso de 90 dias (`advanceDay.ts` ~linha 761) só com o técnico responsável.
  - Moral: onde o pedido de conversa `contract` é criado (`talkReasonOf` → pedidos da segunda), com o diretor responsável, responder na hora com `answerTalk` (`promise_renewal` se a decisão do diretor é renovar ou o jogador já foi renovado, senão `refuse`) em vez de abrir o pedido.
  - Rotas `GET/PUT /api/saves/:id/responsibilities` (`{ contracts: "director" | "manager" }`, 400 para outro valor; dono do save; `withSaveLock`).
- [ ] **Step 3: Rodar** `bun test src/backend/responsibilities.routes.test.ts src/Domain/morale src/Domain/contracts src/Domain/responsibilities` → PASS. **Step 4: Commit** — `feat(contratos): diretor renova e responde as conversas de contrato`.

---

### Task 5: Telas

**Files:** `src/GameInterface/StaffScreen.tsx` (aba Responsabilidades), `src/GameInterface/InboxScreen.tsx` (botão Preferências + painel), corpo do `director_summary` na inbox, i18n `responsibilities.*`, `inbox.prefs.*`, `inbox.contract.directorSummary*` (en, pt-BR).

- [ ] Aba **Responsabilidades** (`SegmentedTabs` existente da tela): "Contratos" com `OptionChips` Diretor / Técnico, uma linha explicando cada um; grava com o PUT.
- [ ] **Preferências** na inbox: botão (`Button` secundário) que abre um painel/modal com um `Chip` por tópico (rótulo + descrição de uma linha); travados ligados e desabilitados com "pede ação".
- [ ] Corpo do resumo: listas renovados (nome com link para a ficha, anos, salário), sairão, recusaram.
- [ ] `bunx tsc --noEmit -p .`, `bun test src/GameInterface`, `bun run ui:audit` (0 duras, 0 leves); conferir no navegador com o servidor de dev do worktree (dev-login; porta livre ≠ 3000; parar só o próprio processo pelo PID). Commit — `feat(ui): responsabilidades e preferências da caixa de entrada`.

---

### Task 6: Smoke, regras, changelog

- [ ] `scripts/season-rollover-smoke.ts`, seção "Responsabilidades": com o diretor (padrão) houve ≥ 1 renovação e ≥ 1 `director_summary`; nenhuma mensagem de `manager_news` nem `scouting_reports` na inbox do jogador; nenhuma conversa `contract` aberta. Sem ligar nada, nenhuma mensagem `scouting:report` chega; antes das checagens de relatório da seção "Olheiros", o smoke liga `scouting_reports` no próprio save (`PUT /inbox-prefs`). A joia (`scouting:gem`) é `scouting_alerts`, ligada por padrão.
- [ ] Regra nova `.claude/rules/game/responsibilities.md` (tópicos, padrões, diretor, rotas, telas, testes); atualizar `contracts.md`, `morale.md`, `scouting.md`.
- [ ] Changelog: entrada nova **4.6** (pt/en): o diretor cuida das renovações e das conversas de contrato; você escolhe quais notícias recebe. Tirar o item correspondente de `upcoming`. `package.json` "4.6" (o teste amarra os dois; o arquivo é CRLF — conferir que a entrada entrou).
- [ ] `bun test` completo e o smoke, **um de cada vez** (memória). Commit — `docs: responsabilidades e caixa de entrada (4.6)`.
