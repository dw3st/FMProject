# Multiplayer parte 4 (humano × humano) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** jogo entre dois técnicos humanos com prévia e "Simular"; propostas de transferência e empréstimo entre humanos pela caixa de entrada.

**Architecture:** (1) `match-setup` deixa de recusar o jogo entre assentos e devolve a prévia com `seatOpponent: true`, tratando o adversário humano como a IA (formação e XI automáticos, nunca a tática salva); só `?live=1` (a tela da partida) continua 409. (2) Propostas entre assentos num arquivo do mundo `seatOffers.json`; regras puras em `src/Domain/seatOffers/`, E/S em `src/backend/seatOfferWorld.ts`, rotas em `src/backend/seatOfferRoutes.ts`; o aceite reaproveita `executeTransferFee`, `squadsAfterAcceptedTransfer`, `startLoan` e `returnDueLoans`, que passam a saber que o outro clube é humano.

**Tech Stack:** Bun + TypeScript, `bun test`, React 19 + Tailwind, i18next.

Spec: `docs/superpowers/specs/2026-10-16-multiplayer-h2h-design.md`. Worktree `C:/Projects/FMProject-h2h`, branch `feat/mp-h2h`. Imports sempre `@/`. Nunca `git stash`/`checkout`/`reset`. Arquivos em CRLF: editar com a ferramenta Edit, nunca `sed -i`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/backend/routes.ts` (match-setup) | `seatOpponent: true` na prévia; `?live=1` → 409 |
| `src/GameInterface/MatchPreviewScreen.tsx`, `MatchScreen.tsx` | Botão "Simular" no lugar de "Jogar"; `&live=1` |
| `src/types/seatOfferTypes.ts` (novo) | `SeatOffer`, `SeatOfferTerms`, `SeatOfferAction`, `SeatOfferView` |
| `src/Domain/seatOffers/seatOfferConfig.ts` (novo) | `SEAT_OFFERS` (validade, contrapropostas, limite) |
| `src/Domain/seatOffers/seatOffers.ts` (+ teste, novo) | Puro: criar, responder, vencer, de quem é a vez, visão por assento |
| `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `SaveService.ts` | `readSeatOffers`/`writeSeatOffers` |
| `src/backend/negotiationWorld.ts` | `startLoan` e `returnDueLoans` com o outro clube humano |
| `src/backend/seatOfferWorld.ts` (novo) | Concluir transferência/empréstimo, fechar e vencer propostas, mensagens e socket |
| `src/backend/seatOfferRoutes.ts` (+ teste, novo) | `GET/POST /api/saves/:saveId/seat-offers`, `POST …/seat-offers/:offerId` |
| `src/backend/routes.ts`, `worlds/worldLobbyGuard.ts` | Monta as rotas; guarda de lobby |
| `src/backend/advanceDay.ts`, `seats.ts`, `jobWorld.ts` | Vencimento diário; fechar ao sair/trocar de clube |
| `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts` | `TransferInboxMessage.kind = "seat_offer"` |
| `src/types/socialTypes.ts`, `src/GameInterface/Social/socialState.ts` | `ServerEvent` `seat_offer` |
| `src/GameInterface/Negotiation/SeatOfferCard.tsx`, `seatOfferApi.ts` (novos) | Cartão na caixa e cliente da API |
| `src/GameInterface/Components/PlayerOfferModal.tsx`, `InboxScreen.tsx`, `Negotiation/NegotiationOverview.tsx`, `TransfersScreen.tsx` | Telas |
| `src/i18n/locales/{en,pt-BR}.json` | `seatOffers.*`, `inbox.transfer.*.seat_offer`, `matchPreview.seatSimulate*` |
| `.claude/rules/game/multiplayer.md`, changelog, `package.json`, `docs/ROADMAP.md` | Documentação e versão 4.26 |

---

### Task 1: `match-setup` devolve a prévia contra outro assento

**Files:**
- Modify: `src/backend/routes.ts` (bloco "Against another seat", ~linha 470, e a resposta ~linha 622)
- Test: `src/backend/seats.review.test.ts` (teste "8.")

- [ ] **Step 1: Reescrever o teste "8." (falha primeiro)**

Substituir o corpo do teste `8. match-setup of a game between two seats answers 409 seatOpponent` por:

```ts
  test("8. match-setup of a game between two seats: the preview, without the other seat's tactics; live is 409", async () => {
    const id = meta.id;
    const world = (await saveService.getMeta(id))!;
    const game = (await saveService.getAllFixturesForLeague(id, "premier_league"))
      .find((f) => !f.played && ((f.home === meta.clubId && f.away === clubD) || (f.home === clubD && f.away === meta.clubId)))!;
    expect(game).toBeDefined();
    await saveService.updateMeta(id, { currentDate: game.date });
    // Seat D saves a lineup with its 11 last players: the preview must never show it.
    const squadD = (await saveService.getSquadById(id, clubD))!;
    const savedD = squadD.players.slice(-11).map((p) => p.id);
    const tacticsD = await saveService.getTactics(id, seatD);
    await saveService.saveTactics(id, { ...tacticsD!, lineup: savedD }, seatD);
    try {
      for (const token of [a.session.token, d.session.token]) {
        const res = await call("/api/match-setup", `/api/match-setup?saveId=${id}`, "GET", token, {});
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.seatOpponent).toBe(true);
        expect(body.matchDay).toEqual({ date: game.date, fixtureId: game.id });
      }
      const resA = await (await call("/api/match-setup", `/api/match-setup?saveId=${id}`, "GET", a.session.token, {})).json();
      expect(resA.oppLineup).not.toEqual(savedD);
      expect(resA.oppTactics).toBeUndefined();
      const live = await call("/api/match-setup", `/api/match-setup?saveId=${id}&live=1`, "GET", a.session.token, {});
      expect(live.status).toBe(409);
      expect((await live.json()).error).toBe("seatOpponent");
    } finally {
      await saveService.saveTactics(id, tacticsD!, seatD);
      await saveService.updateMeta(id, { currentDate: world.currentDate });
    }
  });
```

Se `saveService.saveTactics` tiver outra assinatura, conferir em `src/backend/SaveService.ts` (`grep -n "saveTactics\|writeTactics" src/backend/SaveService.ts`) e usar a que existe (último parâmetro = `seatId`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/seats.review.test.ts -t "8."`
Expected: FAIL (status 409, esperado 200).

- [ ] **Step 3: Implementar em `routes.ts`**

Trocar o bloco:

```ts
      if ((await saveService.humanClubIds(save.id)).has(oppId)) {
        // matchDay: a group world still records the "Simular" decision for this game.
        return Response.json(
          { error: "seatOpponent", matchDay: { date: todayFixture.date, fixtureId: todayFixture.id } },
          { status: 409 },
        );
      }
```

por:

```ts
      // Against another seat (multiplayer part 4): the preview is the normal one, the opponent read like an AI club
      // (its own formation and auto XI, never the other seat's saved tactics); only the live match (`?live=1`) is
      // refused — the day's advance plays it in the full engine with both seats' tactics.
      if ((await saveService.humanClubIds(save.id)).has(oppId)) {
        if (url.searchParams.get("live") === "1") {
          return Response.json(
            { error: "seatOpponent", matchDay: { date: todayFixture.date, fixtureId: todayFixture.id } },
            { status: 409 },
          );
        }
        seatOpponent = true;
      }
```

Declarar `let seatOpponent = false;` junto das outras variáveis do handler (antes do `if (saveIdParam)`), e usar o mesmo objeto `url` com que o handler lê `saveId` (linha ~390; se ele se chamar outro nome, usar esse). Na resposta (~linha 622) acrescentar `seatOpponent,` ao objeto. Garantir que `matchDay` já é preenchido para o jogo de clube (é: `{ date, fixtureId }` do `matchFixture`); se for `null` fora de mundo em grupo, preencher sempre que `seatOpponent` for verdadeiro: `matchDay: seatOpponent && matchFixture ? { date: matchFixture.date, fixtureId: matchFixture.id } : matchDay`.

- [ ] **Step 4: Rodar**

Run: `bun test src/backend/seats.review.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/backend/routes.ts src/backend/seats.review.test.ts
git commit -m "feat(h2h): match-setup devolve a prévia contra outro técnico (live=1 continua 409)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: prévia com "Simular" e a tela da partida com `live=1`

**Files:**
- Modify: `src/GameInterface/MatchPreviewScreen.tsx` (~631-731, ~874-888, ~1337-1357, e o `fetch` da linha ~1002)
- Modify: `src/GameInterface/MatchScreen.tsx` (~338)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json` (`matchPreview`)

- [ ] **Step 1: `MatchScreen` pede a partida ao vivo**

Em `MatchScreen.tsx` trocar
```ts
    const url = `/api/match-setup?saveId=${encodeURIComponent(session.saveId)}`;
```
por
```ts
    // live=1: against another seat the server refuses (multiplayer part 4, simulated only).
    const url = `/api/match-setup?saveId=${encodeURIComponent(session.saveId)}&live=1`;
```

- [ ] **Step 2: tipo e estado na prévia**

Em `MatchPreviewScreen.tsx`, no tipo `MatchSetupData` acrescentar `seatOpponent?: boolean;`. Depois de `setMatchSetup(setupR);` acrescentar:
```ts
        if (setupR.seatOpponent) setSeatOpponent(true);
```
Mudar o `if (seatOpponent) { return (...) }` (tela de aviso cheia) para só acontecer quando a prévia não carregou: `if (seatOpponent && !matchSetup) {`. Assim um servidor antigo (409) ainda mostra o aviso, e o novo mostra a prévia completa.

- [ ] **Step 3: barra de ações**

Na barra de ações (~1337) envolver os dois botões "Mandar o auxiliar" e "Jogar":
```tsx
        {seatOpponent ? (
          <>
            <p className="text-sm text-muted-foreground m-0 basis-full text-center">{t("matchPreview.seatSimulateNote")}</p>
            {groupError && <p className="text-sm text-destructive m-0 basis-full text-center" role="alert">{t(groupAdvanceErrorKey(groupError))}</p>}
            <Button variant="primary" onClick={() => void handleSendAssistant()} disabled={commencing}>
              {commencing ? t("matchPreview.simulating") : t("matchPreview.seatSimulate")}
              {!commencing && <Icon name="play" size={16} />}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleSendAssistant} disabled={commencing}>
              {commencing ? t("matchPreview.simulating") : t("matchPreview.sendAssistant")}
              {!commencing && <Icon name="chevron-right" size={16} />}
            </Button>
            <Button variant="primary" onClick={handleStartGame} disabled={commencing}>
              {t("matchPreview.startGame")}
              <Icon name="play" size={16} />
            </Button>
          </>
        )}
```
(os botões "Editar tática" e "Trocas de última hora" ficam como estão).

- [ ] **Step 4: i18n**

Em `matchPreview` (en.json e pt-BR.json, mesmo lugar de `seatOpponentText`):
- en: `"seatSimulate": "Simulate"`, `"seatSimulateNote": "Against another manager the match is simulated with both teams' tactics."`
- pt-BR: `"seatSimulate": "Simular"`, `"seatSimulateNote": "Contra outro técnico o jogo é simulado com a tática dos dois."`

- [ ] **Step 5: verificar**

Run: `bunx tsc --noEmit` → só o erro antigo de `DecisionTree.ts:750`.
Run: `bun test src/i18n src/GameInterface` → PASS.
Run: `bun run ui:audit --hard` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/GameInterface/MatchPreviewScreen.tsx src/GameInterface/MatchScreen.tsx src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(h2h): prévia do jogo contra outro técnico com o botão Simular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: resultado para os dois lados (teste)

**Files:**
- Test: `src/backend/seats.review.test.ts` (novo teste "8b.")

`MatchResultScreen` já escolhe "meu time" pelo clube do assento (`mySquadId`), e o log do dia é do mundo. Este teste prova que o log do dia tem o jogo entre os dois assentos com os dois clubes.

- [ ] **Step 1: Escrever o teste**

```ts
  test("8b. after the day, the game between two seats is in the day log for both clubs", async () => {
    const id = meta.id;
    const game = (await saveService.getAllFixturesForLeague(id, "premier_league"))
      .find((f) => !f.played && ((f.home === meta.clubId && f.away === clubD) || (f.home === clubD && f.away === meta.clubId)))!;
    const world = (await saveService.getMeta(id))!;
    const { runBufferedDay } = await import("@/backend/advanceDay");
    await saveService.updateMeta(id, { currentDate: game.date });
    try {
      const r = await runBufferedDay(id);
      expect(r.ok).toBe(true);
      const log = await saveService.getDayLog(id, game.date);
      const ev = log!.events.find((e) => e.kind === "match" && e.home === game.home && e.away === game.away);
      expect(ev).toBeDefined();
    } finally {
      await saveService.updateMeta(id, { currentDate: world.currentDate });
    }
  }, 300_000);
```

Conferir o nome/assinatura de `runBufferedDay` e de `getDayLog` antes (`grep -n "export async function runBufferedDay\|getDayLog(" src/backend/advanceDay.ts src/backend/SaveService.ts`) e ajustar a chamada. Este teste avança o mundo: deixe-o **por último** no arquivo, para não mudar os testes seguintes.

- [ ] **Step 2: Rodar**

Run: `bun test src/backend/seats.review.test.ts -t "8b."`
Expected: PASS (nada a implementar; se falhar, o jogo entre assentos não está sendo jogado — investigar `computeSeatedMatchLineups` em `advanceDay.ts` antes de seguir).

- [ ] **Step 3: Commit**

```bash
git add src/backend/seats.review.test.ts
git commit -m "test(h2h): o jogo entre dois técnicos fica no log do dia para os dois

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: tipos e regras puras das propostas entre técnicos

**Files:**
- Create: `src/types/seatOfferTypes.ts`
- Create: `src/Domain/seatOffers/seatOfferConfig.ts`
- Create: `src/Domain/seatOffers/seatOffers.ts`
- Test: `src/Domain/seatOffers/seatOffers.test.ts`

- [ ] **Step 1: Tipos**

`src/types/seatOfferTypes.ts`:
```ts
/** Offers between two human seats (multiplayer part 4, `.claude/rules/game/multiplayer.md`). */
export type SeatOfferKind = "transfer" | "loan";
export type SeatOfferSide = "seller" | "buyer";
export type SeatOfferAction = "offer" | "counter" | "accept" | "reject" | "withdraw" | "expired" | "closed";

export interface SeatOfferTerms {
  /** EUR; loan: the loan fee (can be 0). */
  fee: number;
  /** Transfer: sell-on clause for the seller (0/10/20/30). */
  sellOnPct?: number;
  /** Transfer: the player's contract, fixed at the offer. */
  wage?: number;
  years?: number;
  /** Loan: share of the wage the borrower pays (0..1, steps of 0.1) and the return date. */
  wageShare?: number;
  until?: string;
}

export interface SeatOfferParty { seatId: string; clubId: string; clubName: string }

export interface SeatOffer {
  id: string;
  kind: SeatOfferKind;
  playerId: string;
  playerName: string;
  seller: SeatOfferParty;
  buyer: SeatOfferParty;
  date: string;
  /** Last day it can be answered. */
  expires: string;
  turn: SeatOfferSide;
  counters: number;
  terms: SeatOfferTerms;
  history: { by: SeatOfferSide; action: SeatOfferAction; date: string; terms?: SeatOfferTerms }[];
}

/** An offer as one seat sees it. */
export interface SeatOfferView extends SeatOffer {
  side: SeatOfferSide;
  myTurn: boolean;
  /** The other seat's manager name. */
  otherManager: string;
}
```

- [ ] **Step 2: Config**

`src/Domain/seatOffers/seatOfferConfig.ts`:
```ts
export const SEAT_OFFERS = {
  /** Days an offer stays open after it is made (or countered). */
  VALID_DAYS: 5,
  /** Counters in one negotiation (both sides together). */
  MAX_COUNTERS: 3,
  /** Open offers one seat can have sent at once. */
  MAX_OPEN_SENT: 10,
} as const;
```

- [ ] **Step 3: Testes das regras (falham primeiro)**

`src/Domain/seatOffers/seatOffers.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { createSeatOffer, respondSeatOffer, offerExpiry, expiredOffers, seatOfferView, offersOfPlayer } from "@/Domain/seatOffers/seatOffers";
import type { SeatOffer } from "@/types/seatOfferTypes";

const seller = { seatId: "s", clubId: "c-s", clubName: "Seller FC" };
const buyer = { seatId: "b", clubId: "c-b", clubName: "Buyer FC" };
const base = (over: Partial<SeatOffer> = {}): SeatOffer => createSeatOffer({
  id: "o1", kind: "transfer", playerId: "p1", playerName: "P One", seller, buyer, date: "2027-01-10",
  terms: { fee: 5_000_000, sellOnPct: 10, wage: 20_000, years: 3 }, windowUntil: null,
  ...over,
} as never);

describe("seat offers", () => {
  test("a new offer is the seller's turn and expires in 5 days", () => {
    const o = base();
    expect(o.turn).toBe("seller");
    expect(o.expires).toBe("2027-01-15");
    expect(o.counters).toBe(0);
    expect(o.history).toEqual([{ by: "buyer", action: "offer", date: "2027-01-10", terms: o.terms }]);
  });

  test("the expiry never passes the buyer's window", () => {
    expect(offerExpiry("2027-01-10", "2027-01-12")).toBe("2027-01-12");
    expect(offerExpiry("2027-01-10", null)).toBe("2027-01-15");
  });

  test("only the side whose turn it is answers; the buyer always withdraws", () => {
    const o = base();
    expect(respondSeatOffer(o, "buyer", { action: "accept" }, "2027-01-11")).toEqual({ ok: false, error: "notYourTurn" });
    expect(respondSeatOffer(o, "buyer", { action: "withdraw" }, "2027-01-11")).toMatchObject({ ok: true, closed: "withdraw" });
    expect(respondSeatOffer(o, "seller", { action: "withdraw" }, "2027-01-11")).toEqual({ ok: false, error: "notYourTurn" });
  });

  test("a counter changes fee and clause only, swaps the turn and renews the expiry", () => {
    const r = respondSeatOffer(base(), "seller", { action: "counter", fee: 8_000_000, sellOnPct: 20 }, "2027-01-12");
    expect(r.ok).toBe(true);
    if (!r.ok || r.closed) throw new Error("unexpected");
    expect(r.offer.turn).toBe("buyer");
    expect(r.offer.counters).toBe(1);
    expect(r.offer.terms).toEqual({ fee: 8_000_000, sellOnPct: 20, wage: 20_000, years: 3 });
    expect(r.offer.expires).toBe("2027-01-17");
  });

  test("after 3 counters only accept or reject", () => {
    let o = base();
    const sides = ["seller", "buyer", "seller"] as const;
    for (const s of sides) {
      const r = respondSeatOffer(o, s, { action: "counter", fee: o.terms.fee + 1_000_000 }, "2027-01-11");
      if (!r.ok || r.closed) throw new Error("unexpected");
      o = r.offer;
    }
    expect(respondSeatOffer(o, "buyer", { action: "counter", fee: 1 }, "2027-01-11")).toEqual({ ok: false, error: "noRounds" });
    expect(respondSeatOffer(o, "buyer", { action: "accept" }, "2027-01-11")).toMatchObject({ ok: true, closed: "accept" });
  });

  test("invalid counters are refused", () => {
    expect(respondSeatOffer(base(), "seller", { action: "counter", fee: -1 }, "2027-01-11")).toEqual({ ok: false, error: "invalidTerms" });
    expect(respondSeatOffer(base(), "seller", { action: "counter", fee: 1, sellOnPct: 15 }, "2027-01-11")).toEqual({ ok: false, error: "invalidTerms" });
    const loan = base({ kind: "loan", terms: { fee: 0, wageShare: 0.5, until: "2027-05-30" } } as never);
    expect(respondSeatOffer(loan, "seller", { action: "counter", fee: 0, wageShare: 1.2 }, "2027-01-11")).toEqual({ ok: false, error: "invalidTerms" });
    const ok = respondSeatOffer(loan, "seller", { action: "counter", fee: 100_000, wageShare: 0.8 }, "2027-01-11");
    expect(ok.ok && !ok.closed && ok.offer.terms).toEqual({ fee: 100_000, wageShare: 0.8, until: "2027-05-30" });
  });

  test("an offer past its day is expired", () => {
    expect(respondSeatOffer(base(), "seller", { action: "accept" }, "2027-01-16")).toEqual({ ok: false, error: "offerClosed" });
    expect(expiredOffers([base()], "2027-01-15").map((o) => o.id)).toEqual([]);
    expect(expiredOffers([base()], "2027-01-16").map((o) => o.id)).toEqual(["o1"]);
  });

  test("view and per-player lookup", () => {
    const v = seatOfferView(base(), "s", "Manager B");
    expect(v).toMatchObject({ side: "seller", myTurn: true, otherManager: "Manager B" });
    expect(seatOfferView(base(), "x", "")).toBeNull();
    expect(offersOfPlayer([base(), base({ id: "o2", playerId: "p2" } as never)], "p1").map((o) => o.id)).toEqual(["o1"]);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `bun test src/Domain/seatOffers`
Expected: FAIL (módulo não existe).

- [ ] **Step 5: Implementar `seatOffers.ts`**

```ts
import { addDays } from "@/Domain/dates";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { SEAT_OFFERS } from "@/Domain/seatOffers/seatOfferConfig";
import type { SeatOffer, SeatOfferParty, SeatOfferSide, SeatOfferTerms, SeatOfferView } from "@/types/seatOfferTypes";

/** Last day to answer: `VALID_DAYS` after `date`, never after the buyer's window closes (`windowUntil`). */
export function offerExpiry(date: string, windowUntil: string | null): string {
  const d = addDays(date, SEAT_OFFERS.VALID_DAYS);
  return windowUntil && windowUntil < d ? windowUntil : d;
}

export function createSeatOffer(args: {
  id: string; kind: SeatOffer["kind"]; playerId: string; playerName: string;
  seller: SeatOfferParty; buyer: SeatOfferParty; date: string; terms: SeatOfferTerms; windowUntil: string | null;
}): SeatOffer {
  return {
    id: args.id, kind: args.kind, playerId: args.playerId, playerName: args.playerName,
    seller: args.seller, buyer: args.buyer, date: args.date,
    expires: offerExpiry(args.date, args.windowUntil),
    turn: "seller", counters: 0, terms: args.terms,
    history: [{ by: "buyer", action: "offer", date: args.date, terms: args.terms }],
  };
}

export type SeatOfferAnswer =
  | { action: "accept" | "reject" | "withdraw" }
  | { action: "counter"; fee: number; sellOnPct?: number; wageShare?: number };

export type SeatOfferResult =
  | { ok: false; error: "notYourTurn" | "noRounds" | "invalidTerms" | "offerClosed" }
  | { ok: true; closed: "accept" | "reject" | "withdraw"; offer: SeatOffer }
  | { ok: true; closed?: undefined; offer: SeatOffer };

const isPct = (v: unknown): v is number => typeof v === "number" && (NEGOTIATION.SELL_ON_PCTS as readonly number[]).includes(v);
const isShare = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
const isFee = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Validates new terms (a counter only moves the fee and the clause, or the loan share and fee). */
export function counterTerms(offer: SeatOffer, a: { fee: number; sellOnPct?: number; wageShare?: number }): SeatOfferTerms | null {
  if (!isFee(a.fee)) return null;
  if (offer.kind === "transfer") {
    const pct = a.sellOnPct ?? 0;
    if (!isPct(pct)) return null;
    return { ...offer.terms, fee: a.fee, sellOnPct: pct };
  }
  const share = a.wageShare ?? offer.terms.wageShare;
  if (!isShare(share)) return null;
  return { ...offer.terms, fee: a.fee, wageShare: share };
}

/** One side answers. Pure: the caller rechecks the world and applies an accept. */
export function respondSeatOffer(offer: SeatOffer, by: SeatOfferSide, a: SeatOfferAnswer, date: string): SeatOfferResult {
  if (date > offer.expires) return { ok: false, error: "offerClosed" };
  if (a.action === "withdraw") {
    if (by !== "buyer") return { ok: false, error: "notYourTurn" };
    return { ok: true, closed: "withdraw", offer: withHistory(offer, by, "withdraw", date) };
  }
  if (by !== offer.turn) return { ok: false, error: "notYourTurn" };
  if (a.action === "accept" || a.action === "reject") return { ok: true, closed: a.action, offer: withHistory(offer, by, a.action, date) };
  if (offer.counters >= SEAT_OFFERS.MAX_COUNTERS) return { ok: false, error: "noRounds" };
  const terms = counterTerms(offer, a);
  if (!terms) return { ok: false, error: "invalidTerms" };
  const next: SeatOffer = {
    ...offer, terms, turn: by === "seller" ? "buyer" : "seller", counters: offer.counters + 1,
    expires: addDays(date, SEAT_OFFERS.VALID_DAYS) > offer.expires ? addDays(date, SEAT_OFFERS.VALID_DAYS) : offer.expires,
    history: [...offer.history, { by, action: "counter", date, terms }],
  };
  return { ok: true, offer: next };
}

function withHistory(o: SeatOffer, by: SeatOfferSide, action: SeatOffer["history"][number]["action"], date: string): SeatOffer {
  return { ...o, history: [...o.history, { by, action, date }] };
}

/** Offers whose last day is before `date`. */
export function expiredOffers(offers: readonly SeatOffer[], date: string): SeatOffer[] {
  return offers.filter((o) => o.expires < date);
}

export function offersOfPlayer(offers: readonly SeatOffer[], playerId: string): SeatOffer[] {
  return offers.filter((o) => o.playerId === playerId);
}

/** The offer as `seatId` sees it; null when the seat is not a party. */
export function seatOfferView(o: SeatOffer, seatId: string, otherManager: string): SeatOfferView | null {
  const side: SeatOfferSide | null = o.seller.seatId === seatId ? "seller" : o.buyer.seatId === seatId ? "buyer" : null;
  if (!side) return null;
  return { ...o, side, myTurn: o.turn === side, otherManager };
}
```

Nota sobre a validade após contraproposta: a contraproposta renova para `data + 5`, mas o teto da janela do comprador é reaplicado pelo backend (Task 7) com `offerExpiry`. Conferir o nome do helper `addDays` em `src/Domain/dates.ts` (`grep -n "export function addDays" src/Domain/dates.ts`).

- [ ] **Step 6: Rodar**

Run: `bun test src/Domain/seatOffers`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/seatOfferTypes.ts src/Domain/seatOffers
git commit -m "feat(h2h): regras puras das propostas entre técnicos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: arquivo `seatOffers.json` no DAL

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts`, `src/backend/dal/FileSystemDAL.ts`, `src/backend/dal/BufferingSaveDAL.ts`, `src/backend/SaveService.ts`
- Test: `src/backend/dal/seatOffers.dal.test.ts` (novo)

- [ ] **Step 1: Teste (falha primeiro)**

```ts
import { describe, expect, test } from "bun:test";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatOffer } from "@/types/seatOfferTypes";

const offer = { id: "o1", kind: "transfer", playerId: "p", playerName: "P", seller: { seatId: "s", clubId: "a", clubName: "A" },
  buyer: { seatId: "b", clubId: "c", clubName: "C" }, date: "2027-01-01", expires: "2027-01-06", turn: "seller", counters: 0,
  terms: { fee: 1 }, history: [] } as SeatOffer;

describe("seat offers file", () => {
  test("absent = empty; write then read; buffered until flush", async () => {
    const fs = new FileSystemDAL();
    const id = `test-offers-${crypto.randomUUID()}`;
    expect(await fs.readSeatOffers(id)).toEqual([]);
    const buf = new BufferingSaveDAL(fs);
    await buf.writeSeatOffers(id, [offer]);
    expect(await buf.readSeatOffers(id)).toEqual([offer]);
    expect(await fs.readSeatOffers(id)).toEqual([]);
    await buf.flush();
    expect(await fs.readSeatOffers(id)).toEqual([offer]);
    await fs.deleteSave?.(id);
  });
});
```
(Se `deleteSave` não existir no `FileSystemDAL`, apagar a pasta com `rm(\`${RUNTIME_DATA_DIR}/saves/${id}\`, { recursive: true, force: true })` de `node:fs/promises` e `RUNTIME_DATA_DIR` de `@/backend/runtimeDir`.)

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/backend/dal/seatOffers.dal.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`ISaveDAL.ts`, perto de `readFreeAgents`:
```ts
  // ── Offers between seats (multiplayer part 4) ─────────────────────────────
  readSeatOffers(saveId: string): Promise<SeatOffer[]>;
  writeSeatOffers(saveId: string, offers: SeatOffer[]): Promise<void>;
```
(import `type { SeatOffer } from "@/types/seatOfferTypes"`).

`FileSystemDAL.ts`:
```ts
function seatOffersPath(saveId: string) { return `${SAVES_DIR}/${saveId}/seatOffers.json`; }
...
  async readSeatOffers(saveId: string): Promise<SeatOffer[]> {
    const file = Bun.file(seatOffersPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<SeatOffer[]>;
  }
  async writeSeatOffers(saveId: string, offers: SeatOffer[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(seatOffersPath(saveId), JSON.stringify(offers));
    bumpSaveDataVersion(saveId);
  }
```

`BufferingSaveDAL.ts`:
```ts
  readSeatOffers(saveId: string): Promise<SeatOffer[]> {
    return this.readThrough(`seatOffers:${saveId}`, () => this.inner.readSeatOffers(saveId));
  }
  async writeSeatOffers(saveId: string, offers: SeatOffer[]): Promise<void> {
    this.buffer(`seatOffers:${saveId}`, offers, () => this.inner.writeSeatOffers(saveId, offers));
  }
```

`SaveService.ts`:
```ts
  getSeatOffers(saveId: string): Promise<SeatOffer[]> { return this.dal.readSeatOffers(saveId); }
  writeSeatOffers(saveId: string, offers: SeatOffer[]): Promise<void> { return this.dal.writeSeatOffers(saveId, offers); }
```

Se houver outra implementação de `ISaveDAL` em testes (`grep -rn "implements ISaveDAL\|: ISaveDAL = {" src`), acrescentar os dois métodos lá também.

- [ ] **Step 4: Rodar** — `bun test src/backend/dal` → PASS; `bunx tsc --noEmit` → só o erro antigo.

- [ ] **Step 5: Commit**

```bash
git add src/backend/dal src/backend/SaveService.ts
git commit -m "feat(h2h): arquivo seatOffers.json do mundo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: empréstimo com o outro clube humano

**Files:**
- Modify: `src/backend/negotiationWorld.ts` (`startLoan` linhas 93–123, `returnDueLoans` 133–210)
- Test: `src/backend/seatOffers.loans.test.ts` (novo)

Hoje `startLoan` e `returnDueLoans` comparam só com `meta.clubId`: o clube do outro assento é tratado como IA (sem extrato, verba da IA, corte a 30, sem mensagem, o empréstimo só no mercado de um assento).

- [ ] **Step 1: Teste (falha primeiro)**

Montar um mundo de 2 assentos como em `seats.review.test.ts` (`createSave` Premier, `ownSolo`, `addSeat` com outro clube da Premier). Usar dois jogadores reservas do clube B (do assento B):

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { returnDueLoans, startLoan, emptyMarket } from "@/backend/negotiationWorld";
import { addDays } from "@/Domain/dates";

describe("loan between two seats", () => {
  let id = ""; let seatA = ""; let seatB = ""; let clubA = ""; let clubB = "";
  beforeAll(async () => {
    const a = devAutoLogin("h2h-loan-a@test.local");
    const b = devAutoLogin("h2h-loan-b@test.local");
    const meta = await saveService.createSave({ leagueSlug: "premier_league", leagueName: "Premier League", clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"] });
    id = meta.id; clubA = meta.clubId;
    seatA = await ownSolo(id, a.user.id);
    clubB = (await saveService.getSquadIndex(id)).inLeague("premier_league").find((e) => e.squadId !== clubA)!.squadId;
    seatB = await addSeat(id, { userId: b.user.id, clubId: clubB, manager: { name: "B", nationalityIso: "gb", backgroundId: "former-player" } });
  }, 900_000);
  afterAll(async () => { await saveService.deleteSave(id); }, 120_000);

  test("start: fee in both ledgers, the loan in both markets; return: back home, news for both", async () => {
    const metaA = (await saveService.getSeatMeta(id, seatA))!;
    const parent = (await saveService.getSquadById(id, clubB))!;
    const borrower = (await saveService.getSquadById(id, clubA))!;
    const player = parent.players[parent.players.length - 1]!;
    const budgetB = parent.finances?.budget ?? 0;
    const until = addDays(metaA.currentDate!, 10);
    const market = await startLoan(saveService, id, seatA, metaA, (await saveService.getMarket(id, seatA)) ?? emptyMarket(),
      { player, parent, borrower, wageShare: 0.5, until, fee: 200_000 });
    await saveService.saveMarket(id, market, seatA);
    expect(market.loans?.some((l) => l.playerId === player.id)).toBe(true);
    expect((await saveService.getMarket(id, seatB))!.loans?.some((l) => l.playerId === player.id)).toBe(true);
    expect((await saveService.getSquadById(id, clubB))!.finances?.budget).toBe(budgetB + 200_000);
    // Return: seat A's loop runs first, then seat B's.
    const day = addDays(until, 1);
    const ra = await returnDueLoans(saveService, id, seatA, metaA, (await saveService.getMarket(id, seatA))!, day);
    const metaB = (await saveService.getSeatMeta(id, seatB))!;
    const rb = await returnDueLoans(saveService, id, seatB, metaB, (await saveService.getMarket(id, seatB))!, day);
    expect((await saveService.getSquadById(id, clubB))!.players.find((p) => p.id === player.id)?.loan).toBeUndefined();
    expect(ra.news.map((n) => n.kind)).toEqual(["loan_back"]);
    expect(rb.news.map((n) => n.kind)).toEqual(["loan_home"]);
    expect(ra.market.loans?.some((l) => l.playerId === player.id)).toBe(false);
    expect(rb.market.loans?.some((l) => l.playerId === player.id)).toBe(false);
  }, 300_000);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/backend/seatOffers.loans.test.ts` → FAIL (o mercado do assento B não tem o empréstimo; o saldo de B não recebe a taxa).

- [ ] **Step 3: `startLoan`**

Depois de resolver `parentRef`/`borrowerRef`, achar o assento de cada lado:
```ts
  const seatOfSide = async (clubId: string) => (clubId === meta.clubId ? seatId : await service.seatOfClub(saveId, clubId));
  const parentSeat = await seatOfSide(parent.id);
  const borrowerSeat = await seatOfSide(borrower.id);
```
e trocar os `ClubRef` do `executeTransferFee` para
```ts
    { squad: moved.borrower, ...borrowerRef, ...(borrowerSeat ? { seatId: borrowerSeat } : {}) },
    { squad: moved.parent, ...parentRef, ...(parentSeat ? { seatId: parentSeat } : {}) },
```
Depois de montar `record`, se o outro lado é outro assento, gravar o empréstimo no mercado dele (só a parte do assento, para não reescrever a rotação do mundo):
```ts
  const otherSeat = parent.id === meta.clubId ? borrowerSeat : parentSeat;
  if (otherSeat && otherSeat !== seatId) {
    const other = (await service.getMarket(saveId, otherSeat)) ?? emptyMarket();
    const next = { ...marketWithoutPlayer(other, player.id), loans: [...(other.loans ?? []).filter((l) => l.playerId !== player.id), record] };
    await service.saveSeatMarket(saveId, otherSeat, splitMarket(next).seat);
    if (parentSeat === otherSeat) await dropFromLineup(service, saveId, otherSeat, player.id);
  }
```
(`splitMarket` de `@/Domain/market/seatMarket`.) Manter `if (parent.id === meta.clubId) await dropFromLineup(...)` como está.

- [ ] **Step 4: `returnDueLoans`**

Acrescentar à `opts` `humanClubs?: ReadonlySet<string>`, e calcular no início: `const humans = opts.humanClubs ?? (await service.humanClubIds(saveId));`. Trocar:
```ts
    const humanParent = parent.id === meta.clubId;
    const humanBorrower = borrower.id === meta.clubId;
```
por
```ts
    const ownParent = parent.id === meta.clubId;
    const ownBorrower = borrower.id === meta.clubId;
    const humanParent = humans.has(parent.id);
    const humanBorrower = humans.has(borrower.id);
```
Usar `humanParent`/`humanBorrower` nas regras de corte (`!humanParent && … > MAX_SQUAD`, `isHuman: humanBorrower`, `humanBorrower ? … : trimSquadToCap`), e `ownBorrower`/`ownParent` só para `dropFromLineup` e as mensagens:
```ts
    if (ownBorrower) {
      await dropFromLineup(service, saveId, seatId, l.playerId);
      news.push({ date, kind: "loan_back", playerId: l.playerId, playerName: l.playerName, clubName: l.fromClubName });
    } else if (ownParent) {
      news.push({ date, kind: "loan_home", playerId: l.playerId, playerName: l.playerName, clubName: l.toClubName });
    }
```
E, no laço, quando o jogador já não está emprestado no clube que o pegou (o laço do outro assento já o devolveu), em vez de só `continue`, dar a mensagem a este assento se o jogador está de volta no clube de origem:
```ts
    if (!borrower || !parent || !player) {
      const home = parent?.players.find((p) => p.id === l.playerId && !p.loan);
      if (home && parent && (parent.id === meta.clubId || l.toClubId === meta.clubId)) {
        news.push(parent.id === meta.clubId
          ? { date, kind: "loan_home", playerId: l.playerId, playerName: l.playerName, clubName: l.toClubName }
          : { date, kind: "loan_back", playerId: l.playerId, playerName: l.playerName, clubName: l.fromClubName });
      }
      continue;
    }
```
(o `ended.add(l.playerId)` antes do `getSquadById` continua tirando o empréstimo do mercado deste assento).

- [ ] **Step 5: Rodar**

Run: `bun test src/backend/seatOffers.loans.test.ts src/backend/negotiation.routes.test.ts src/backend/seats.review.test.ts src/backend/seats.removeSeat.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/backend/negotiationWorld.ts src/backend/seatOffers.loans.test.ts
git commit -m "feat(h2h): empréstimo entre dois técnicos humanos (extratos, mercados e volta)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: concluir, fechar e vencer propostas (`seatOfferWorld.ts`) + mensagens

**Files:**
- Create: `src/backend/seatOfferWorld.ts`
- Modify: `src/types/inboxTypes.ts` (`TransferInboxMessage`), `src/Domain/inbox/inboxEvents.ts` (`buildTransferNegotiationMessage`), `src/types/socialTypes.ts` (`ServerEvent`), `src/GameInterface/Social/socialState.ts` (parse)
- Test: coberto na Task 8 (rotas) e na Task 9 (dia)

- [ ] **Step 1: Mensagem e evento**

Em `TransferInboxMessage.kind` acrescentar `| "seat_offer"`, e os campos opcionais:
```ts
  /** seat_offer: the offer, what just happened, its kind and whose turn it is now. */
  offerId?: string;
  offerAction?: "offer" | "counter" | "accept" | "reject" | "withdraw" | "expired" | "closed";
  offerKind?: "transfer" | "loan";
  myTurn?: boolean;
```
Em `buildTransferNegotiationMessage`, para `kind === "seat_offer"` o id deve ser único por evento: `transfer-seat_offer-${offerId}-${offerAction}-${history length}`; aceitar `offerId`, `offerAction`, `offerKind`, `myTurn` nos argumentos e copiá-los para a mensagem; assunto em inglês "Offer from <club> for <player>" (a tela traduz). Seguir o padrão das outras kinds do mesmo arquivo.

`ServerEvent`: `| { type: "seat_offer"; saveId: string }`. Em `socialState.ts` (`parseServerEvent`), acrescentar `case "seat_offer":` à lista de `world_started`/`world_members` (só `saveId`). Adicionar um teste em `socialState.test.ts` igual ao de `world_members`.

- [ ] **Step 2: `seatOfferWorld.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { memberBySeat } from "@/backend/auth/saveOwnership";
import { notifyUser } from "@/backend/social/realtime";
import { executeTransferFee } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import { emptyMarket, marketAfterSellOnPaid, sellOnFor, settleSellOn, startLoan, seasonEndOf, humanRosterSize } from "@/backend/negotiationWorld";
import { squadsAfterAcceptedTransfer, squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import { contractEndFor } from "@/Domain/contracts/contracts";
import { splitMarket } from "@/Domain/market/seatMarket";
import { emitInboxMessage, buildTransferNegotiationMessage } from "@/Domain/inbox/inboxEvents";
import { seasonLabel } from "@/Domain/history/history";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/contractConfig";
import type { SeatOffer, SeatOfferAction } from "@/types/seatOfferTypes";
```
(conferir cada caminho de import com `grep -rn "export function <nome>\|export const <nome>" src` e corrigir; `HUMAN_MAX_SQUAD` está onde `transfers.ts` o importa.)

Funções (exportadas):

```ts
/** Message to one side of the offer + a socket nudge to that seat's user. */
export async function tellSeat(service: SaveService, saveId: string, o: SeatOffer, toSide: "seller" | "buyer", action: SeatOfferAction, date: string): Promise<void> {
  const to = toSide === "seller" ? o.seller : o.buyer;
  const other = toSide === "seller" ? o.buyer : o.seller;
  await emitInboxMessage(saveId, buildTransferNegotiationMessage({
    date, kind: "seat_offer", playerId: o.playerId, playerName: o.playerName, clubName: other.clubName,
    fee: o.terms.fee, sellOnPct: o.terms.sellOnPct, wageShare: o.terms.wageShare, until: o.terms.until, expires: o.expires,
    wage: o.terms.wage, years: o.terms.years,
    offerId: o.id, offerAction: action, offerKind: o.kind, myTurn: o.turn === toSide && (action === "offer" || action === "counter"),
    historyLength: o.history.length,
  }), service, to.seatId);
  const m = memberBySeat(saveId, to.seatId);
  if (m) notifyUser(m.userId, { type: "seat_offer", saveId });
}

/** Closes every open offer for `playerId` except `keepId`, telling both sides. Returns the offers left. */
export async function closeOffersForPlayer(service: SaveService, saveId: string, offers: SeatOffer[], playerId: string, date: string, keepId?: string): Promise<SeatOffer[]> {
  const left: SeatOffer[] = [];
  for (const o of offers) {
    if (o.playerId !== playerId || o.id === keepId) { left.push(o); continue; }
    await tellSeat(service, saveId, o, "seller", "closed", date);
    await tellSeat(service, saveId, o, "buyer", "closed", date);
  }
  return left;
}

/** Closes the offers where `seatId` is a party (club change, sacking, leaving the league). */
export async function closeOffersOfSeat(service: SaveService, saveId: string, seatId: string, date: string): Promise<void> {
  const offers = await service.getSeatOffers(saveId);
  const mine = offers.filter((o) => o.seller.seatId === seatId || o.buyer.seatId === seatId);
  if (mine.length === 0) return;
  for (const o of mine) {
    const otherSide = o.seller.seatId === seatId ? "buyer" : "seller";
    await tellSeat(service, saveId, o, otherSide, "closed", date);
  }
  await service.writeSeatOffers(saveId, offers.filter((o) => !mine.includes(o)));
}
```

Validação do mundo para uma proposta (usada ao propor e ao aceitar):
```ts
export type OfferCheck = { ok: true; seller: Squad; buyer: Squad; player: RosterPlayer } | { ok: false; status: number; error: string };

/** The world still allows the deal: both clubs still the seats', the player at the seller and not on loan, buyer's cap, seller's minimums. */
export async function checkOfferWorld(service: SaveService, saveId: string, o: Pick<SeatOffer, "kind" | "playerId" | "seller" | "buyer">): Promise<OfferCheck> {
  const [sellerSeat, buyerSeat] = await Promise.all([service.getSeat(saveId, o.seller.seatId), service.getSeat(saveId, o.buyer.seatId)]);
  if (!sellerSeat || sellerSeat.unemployed || sellerSeat.clubId !== o.seller.clubId) return { ok: false, status: 409, error: "offerClosed" };
  if (!buyerSeat || buyerSeat.unemployed || buyerSeat.clubId !== o.buyer.clubId) return { ok: false, status: 409, error: "offerClosed" };
  const seller = await service.getSquadById(saveId, o.seller.clubId);
  const buyer = await service.getSquadById(saveId, o.buyer.clubId);
  const player = seller?.players.find((p) => p.id === o.playerId);
  if (!seller || !buyer || !player) return { ok: false, status: 409, error: "offerClosed" };
  if (player.loan) return { ok: false, status: 400, error: "onLoan" };
  if ((await humanRosterSize(service, saveId, o.buyer.seatId, buyer)) >= HUMAN_MAX_SQUAD) return { ok: false, status: 409, error: "squadFull" };
  if (squadDepthBlocked(player, seller, false)) return { ok: false, status: 409, error: "squadDepth" };
  return { ok: true, seller, buyer, player };
}
```
Conferir a assinatura de `squadDepthBlocked` (`grep -n "export function squadDepthBlocked" src/Domain/transfer/transferAcceptance.ts`); o terceiro argumento é o mesmo usado em `negotiationRoutes.ts` para a venda do humano (`false`).

Concluir a transferência (o mesmo caminho de `transfers.ts`, com os dois lados humanos):
```ts
export async function completeSeatTransfer(service: SaveService, saveId: string, o: SeatOffer, c: Extract<OfferCheck, { ok: true }>, date: string): Promise<void> {
  const buyerMeta = (await service.getSeatMeta(saveId, o.buyer.seatId))!;
  const sellerMeta = (await service.getSeatMeta(saveId, o.seller.seatId))!;
  const sellerRef = (await service.resolveSquadId(saveId, c.seller.id))!;
  const buyerRef = (await service.resolveSquadId(saveId, c.buyer.id))!;
  const fee = o.terms.fee;
  const pct = o.terms.sellOnPct ?? 0;
  const seasonEnd = seasonEndOf(buyerMeta.activeLeagues, buyerRef.leagueSlug, date);
  const contract = { until: contractEndFor(date, seasonEnd, o.terms.years ?? 1), wage: o.terms.wage ?? c.player.contract?.wage ?? 0 };
  const sellerLeague = (buyerMeta.activeLeagues ?? []).find((l) => l.leagueSlug === sellerRef.leagueSlug);
  const { selling, buying } = squadsAfterAcceptedTransfer(
    c.player, c.seller, c.buyer, c.buyer.id, c.player.id, contract,
    sellerLeague ? { league: sellerLeague.leagueSlug, season: seasonLabel(sellerLeague.year, sellerLeague.start, sellerLeague.end) } : null,
    pct > 0 ? { clubId: c.seller.id, clubName: c.seller.name, pct } : null,
  );
  const owed = sellOnFor(c.player, c.seller.id, fee);
  await executeTransferFee(saveId, buyerMeta,
    { squad: buying, ...buyerRef, seatId: o.buyer.seatId },
    { squad: selling, ...sellerRef, seatId: o.seller.seatId },
    fee, service,
    { playerName: c.player.name, playerId: c.player.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) });
  await settleSellOn(service, saveId, o.seller.seatId, sellerMeta, owed, c.player, c.seller.name, date);
  const seasonOf = (slug: string) => {
    const l = (buyerMeta.activeLeagues ?? []).find((x) => x.leagueSlug === slug);
    return l ? seasonLabel(l.year, l.start, l.end) : date.slice(0, 4);
  };
  await recordTransferHistory(service, saveId, { buyer: buying, seller: selling, playerId: c.player.id, fee, date,
    buyerSeason: seasonOf(buyerRef.leagueSlug), sellerSeason: seasonOf(sellerRef.leagueSlug) });
  // Seller's market: the player leaves the lists, the AI bids for him close, the new clause is held.
  const sm = (await service.getMarket(saveId, o.seller.seatId)) ?? emptyMarket();
  const cleaned = {
    ...sm,
    playerSellList: (sm.playerSellList ?? []).filter((x) => x.playerId !== c.player.id),
    playerLoanList: (sm.playerLoanList ?? []).filter((x) => x !== c.player.id),
    pendingBids: (sm.pendingBids ?? []).filter((b) => b.playerId !== c.player.id),
    sellOnHeld: pct > 0 ? [...(sm.sellOnHeld ?? []), { playerId: c.player.id, playerName: c.player.name, pct, toClubName: c.buyer.name, date }] : sm.sellOnHeld,
  };
  await service.saveSeatMarket(saveId, o.seller.seatId, splitMarket(cleaned).seat);
  await dropFromSeatLineup(service, saveId, o.seller.seatId, c.player.id);
  await service.appendDayTransfers(saveId, date, [{ playerId: c.player.id, from: c.seller.id, to: c.buyer.id, fee, kind: "transfer", date }]);
}
```
`dropFromSeatLineup`: exportar o `dropFromLineup` privado de `negotiationWorld.ts` (renomear a exportação para `dropFromLineup` e importá-lo aqui). A moral do jogador: `squadsAfterAcceptedTransfer` já remove os campos de moral (`stripPlayerMorale`); conferir com `grep -n "stripPlayerMorale" src/Domain/transfer/transferAcceptance.ts` e, se não estiver lá, aplicar `stripPlayerMorale` ao jogador em `buying` antes do `executeTransferFee`.

Concluir o empréstimo:
```ts
export async function completeSeatLoan(service: SaveService, saveId: string, o: SeatOffer, c: Extract<OfferCheck, { ok: true }>, date: string): Promise<void> {
  const buyerMeta = (await service.getSeatMeta(saveId, o.buyer.seatId))!;
  const market = (await service.getMarket(saveId, o.buyer.seatId)) ?? emptyMarket();
  const next = await startLoan(service, saveId, o.buyer.seatId, buyerMeta, market, {
    player: c.player, parent: c.seller, borrower: c.buyer, wageShare: o.terms.wageShare ?? 1,
    until: o.terms.until ?? seasonEndOf(buyerMeta.activeLeagues, buyerMeta.leagueSlug, date), fee: o.terms.fee,
  });
  await service.saveMarket(saveId, next, o.buyer.seatId);
  // The lender's lists and AI bids for the player close (startLoan already cleans the lender's copy it writes).
  const sm = (await service.getMarket(saveId, o.seller.seatId)) ?? emptyMarket();
  await service.saveSeatMarket(saveId, o.seller.seatId, splitMarket({
    ...sm,
    playerSellList: (sm.playerSellList ?? []).filter((x) => x.playerId !== c.player.id),
    playerLoanList: (sm.playerLoanList ?? []).filter((x) => x !== c.player.id),
    pendingBids: (sm.pendingBids ?? []).filter((b) => b.playerId !== c.player.id),
  }).seat);
  await service.appendDayTransfers(saveId, date, [{ playerId: c.player.id, from: c.seller.id, to: c.buyer.id, fee: o.terms.fee, kind: "loan", date }]);
}
```

Vencimento diário (chamado no avanço do dia):
```ts
/** Drops expired offers and the ones the world no longer allows; tells both sides. */
export async function expireSeatOffers(service: SaveService, saveId: string, date: string, buyerWindowOpen: (seatId: string) => boolean): Promise<void> {
  const offers = await service.getSeatOffers(saveId);
  if (offers.length === 0) return;
  const left: SeatOffer[] = [];
  for (const o of offers) {
    const expired = o.expires < date || !buyerWindowOpen(o.buyer.seatId);
    const world = expired ? null : await checkOfferWorld(service, saveId, o);
    if (!expired && world?.ok) { left.push(o); continue; }
    const action = expired ? "expired" : "closed";
    await tellSeat(service, saveId, o, "seller", action, date);
    await tellSeat(service, saveId, o, "buyer", action, date);
  }
  if (left.length !== offers.length) await service.writeSeatOffers(saveId, left);
}
```
`squadDepth`/`squadFull` no vencimento diário não devem fechar a proposta (só bloqueiam o aceite): no laço acima, tratar `world.ok === false` com `error` em `["squadFull", "squadDepth"]` como ainda válida (`left.push(o)`).

- [ ] **Step 3: Rodar** — `bunx tsc --noEmit` (só o erro antigo); `bun test src/GameInterface/Social src/Domain/inbox` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/backend/seatOfferWorld.ts src/backend/negotiationWorld.ts src/types/inboxTypes.ts src/Domain/inbox/inboxEvents.ts src/types/socialTypes.ts src/GameInterface/Social/socialState.ts src/GameInterface/Social/socialState.test.ts
git commit -m "feat(h2h): concluir, fechar e vencer propostas entre técnicos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: rotas `seat-offers`

**Files:**
- Create: `src/backend/seatOfferRoutes.ts`
- Modify: `src/backend/routes.ts` (spread em `apiRoutes`), `src/backend/worlds/worldLobbyGuard.ts` (`LOBBY_GUARDED_PATHS`)
- Test: `src/backend/seatOffers.routes.test.ts`

- [ ] **Step 1: Teste (falha primeiro)**

Mundo de 2 assentos (como na Task 6, com 3 usuários: A, B e um terceiro C sem relação, `addSeat` com um terceiro clube). Helper `call` igual ao de `seats.review.test.ts`. Antes de cada teste, garantir janela aberta para os dois: pôr `currentDate` no primeiro dia da janela de pré-temporada da Inglaterra (`windowStatus`; ou procurar um dia aberto com `loadWindowContext(...).seat(seatA).today.open` andando `addDays` de `meta.currentDate`). Testes:

```ts
  test("transfer: offer, counter, accept — player moves, both ledgers sum to the balance", async () => {
    const p = reserveOf(clubB);                     // um jogador de B que não é o último da linha
    const demand = await demandFor(p, clubA);       // GET /api/saves/:id/players/:pid/demand?from=clubB (token A)
    const r1 = await call(POST, "/api/saves/:saveId/seat-offers", tokenA, { kind: "transfer", playerId: p.id, fromSquadId: clubB, fee: 3_000_000, sellOnPct: 0, wage: demand, years: 2 });
    expect(r1.status).toBe(200);
    const offerId = r1.json.offer.id;
    expect((await call(POST, "/api/saves/:saveId/seat-offers/:offerId", tokenA, { action: "accept" }, { offerId })).status).toBe(403);
    expect((await call(POST, "/api/saves/:saveId/seat-offers/:offerId", tokenB, { action: "counter", fee: 4_000_000, sellOnPct: 10 }, { offerId })).status).toBe(200);
    const acc = await call(POST, "/api/saves/:saveId/seat-offers/:offerId", tokenA, { action: "accept" }, { offerId });
    expect(acc.status).toBe(200);
    expect((await saveService.getSquadById(id, clubA))!.players.some((x) => x.id === p.id)).toBe(true);
    expect((await saveService.getMarket(id, seatB))!.sellOnHeld?.some((h) => h.playerId === p.id && h.pct === 10)).toBe(true);
    for (const seat of [seatA, seatB]) expect(await ledgerSum(seat)).toBe(await balanceOf(seat));
    expect(await saveService.getSeatOffers(id)).toEqual([]);
  });
  test("loan: offer and accept — in both markets", ...);           // wageShare 0.5, fee 0
  test("refusals: alreadyOffered, contract (lowWage), notFound for an AI club and for own club, third seat cannot answer (404)", ...);
  test("withdraw by the buyer; 3 counters then noRounds", ...);
  test("accept closes the other seat's offer and the AI bid for the same player", ...);
  test("a lobby world refuses with 409 lobby", ...);              // usar createMultiWorld de worldTestUtils
```
Escrever os corpos completos seguindo o primeiro teste: `ledgerSum(seat)` soma `getLedger` de todas as temporadas de `listLedgerSeasons(id, seat)`; `balanceOf(seat)` lê o `finances.budget` do clube do assento. Para "fecha a proposta da IA", inserir antes um `MarketBid` em `pendingBids` do mercado de B pelo mesmo jogador (`saveSeatMarket`) e conferir que sumiu depois do aceite.

- [ ] **Step 2: Rodar e ver falhar** — `bun test src/backend/seatOffers.routes.test.ts` → FAIL.

- [ ] **Step 3: Implementar `seatOfferRoutes.ts`**

```ts
export const seatOfferRoutes = {
  "/api/saves/:saveId/seat-offers": async (req: Req) => { /* GET list, POST create */ },
  "/api/saves/:saveId/seat-offers/:offerId": async (req: Req) => { /* POST respond */ },
};
```
Usar o mesmo molde de `negotiationRoutes.ts` (`requireSeat`, `json`, `withSaveLock`, corpo até 8 KB com `Content-Length`/bytes → 413 como nas rotas de mundo).

GET: `{ offers: SeatOfferView[], seatClubs: { clubId, managerName }[] }` — as propostas em que o assento é parte (`seatOfferView` com o nome do técnico do outro lado de `getSeat(...).manager?.name`), e os clubes de **outros** assentos (`listSeats`, sem desempregados), para a tela saber quando abrir a proposta entre técnicos.

POST criar (ordem dos erros da spec §2.3): `meta` do assento; `noClub`; `fromSquadId` tem de ser clube de outro assento (`seatOfClub(saveId, fromSquadId)` diferente do próprio) senão 404 `notFound`; jogador no elenco senão 404; janela do comprador (`loadWindowContext(meta, index, undefined, [seatWindowRef(meta)]).seat(auth.seatId).today`) → `windowClosedResponse`; `checkOfferWorld` (sem `kind` especial); `alreadyOffered` (mesmo comprador, jogador e `kind`); `tooManyOffers` (`>= SEAT_OFFERS.MAX_OPEN_SENT` com `buyer.seatId === auth.seatId`); termos:
- transferência: `fee` número ≥ 0 → `roundFeeUp`; `parseSellOnPct` (null → 400 `invalidTerms`); `wage`/`years` números; `evaluateContractOffer({ wage, years }, player, buyer, date, { fromSquad: seller, negotiation })` (`negotiation` de `getAchievements(saveId, auth.seatId).attributes.negotiation`) → 400 `{ error: reason, demand }`;
- empréstimo: `wageShare` inteiro 0..100 → `/100`; `fee` ≥ 0; `until = loanUntil(date, seasonEndOf(meta.activeLeagues, meta.leagueSlug, date))`, limitado ao `contract.until` do jogador.
Depois `createSeatOffer({ id: randomUUID(), ..., windowUntil: today.until ?? null })`, `writeSeatOffers`, `tellSeat(..., "seller", "offer", date)`. Resposta `{ offer: seatOfferView(offer, auth.seatId, nomeDoVendedor) }`.

POST responder: proposta não achada ou o assento não é parte → 404; `side`; `respondSeatOffer(offer, side, body, date)` → erro: `notYourTurn` 403, `noRounds` 409, `invalidTerms` 400, `offerClosed` 409 (e tira do arquivo + `tellSeat` dos dois lados com `expired`). Contraproposta: reaplicar o teto da janela do comprador (`offerExpiry(date, janelaDoComprador.until)` se menor), gravar, `tellSeat` ao outro lado com `counter`. `reject`/`withdraw`: tirar do arquivo, `tellSeat` ao outro lado. `accept`: janela do comprador aberta (senão `windowClosedResponse`); `checkOfferWorld` (falhou → tirar do arquivo, avisar os dois com `closed`, responder com o erro); transferência: `evaluateContractOffer` de novo com os termos guardados (falhou → `closed`, 409 `contractRefused`); concluir numa unidade bufferizada:
```ts
const buffer = new BufferingSaveDAL(new FileSystemDAL());
const unit = new SaveService(buffer);
if (offer.kind === "transfer") await completeSeatTransfer(unit, saveId, accepted, check, date);
else await completeSeatLoan(unit, saveId, accepted, check, date);
const rest = await closeOffersForPlayer(unit, saveId, offers.filter((x) => x.id !== offer.id), offer.playerId, date);
await unit.writeSeatOffers(saveId, rest);
await tellSeat(unit, saveId, accepted, side === "seller" ? "buyer" : "seller", "accept", date);
await buffer.flush();
```
Resposta `{ ok: true, status: "accepted" | "countered" | "rejected" | "withdrawn", offer? }`.

Montar: em `routes.ts`, `...seatOfferRoutes` dentro de `withLobbyGuard({ ... })`; em `LOBBY_GUARDED_PATHS` acrescentar `"/api/saves/:saveId/seat-offers"` e `"/api/saves/:saveId/seat-offers/:offerId"`.

- [ ] **Step 4: Rodar** — `bun test src/backend/seatOffers.routes.test.ts src/backend/worlds` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/seatOfferRoutes.ts src/backend/seatOffers.routes.test.ts src/backend/routes.ts src/backend/worlds/worldLobbyGuard.ts
git commit -m "feat(h2h): rotas de propostas entre técnicos (propor, contrapropor, aceitar, recusar, retirar)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: vencimento no dia, saída da liga e troca de clube

**Files:**
- Modify: `src/backend/advanceDay.ts` (bloco do mercado ~1456–1741), `src/backend/seats.ts` (`removeSeat`, antes de `deleteSeat`), `src/backend/jobWorld.ts` (`releaseHumanClub`, junto da limpeza do mercado)
- Test: `src/backend/seatOffers.day.test.ts`

- [ ] **Step 1: Teste (falha primeiro)**

No mundo de 2 assentos, gravar direto (`writeSeatOffers`) uma proposta com `expires` = hoje − 1 e outra válida; rodar um dia (`runBufferedDay`); conferir que só a válida ficou e que a caixa dos dois assentos tem a mensagem `seat_offer` com `offerAction: "expired"`. Depois `releaseHumanClub` do assento B (como numa demissão) e conferir que a proposta válida sumiu e a caixa de A tem `closed`. Por fim, nova proposta e `removeSeat` do B: proposta some.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`advanceDay.ts`, dentro de `if (!options.marketFrozen)`, logo depois do laço (c) de lances/conversas por assento:
```ts
      // Offers between seats (multiplayer part 4): expired, or the buyer's window closed, or the world moved on.
      await expireSeatOffers(saveService, saveId, currentDate, (seatId) => windows.seat(seatId).today.open);
```
Como roda antes do `clearInbox` da virada: guardar as mensagens adiadas. Mudar `tellSeat` para aceitar um `sink` opcional `(seatId, msg) => void`; no avanço do dia passar um que empurra para `daySeats.find((d) => d.seatId === seatId)?.deferred.negotiation` (os argumentos do `buildTransferNegotiationMessage`), que já são gravados depois do `clearInbox` (linha ~3022). Fora do dia (rotas), sem `sink` grava na hora.

`seats.ts` (`removeSeat`), antes de `service.deleteSeat(saveId, seatId)`:
```ts
    await closeOffersOfSeat(service, saveId, seatId, date);
```
`jobWorld.ts` (`releaseHumanClub`), depois da limpeza do mercado:
```ts
  await closeOffersOfSeat(service, saveId, seatId, args.date);
```
(`takeOverClub` também: o assento que muda de clube já passou por `releaseHumanClub` na troca; um assento novo não tem propostas.)

- [ ] **Step 4: Rodar** — `bun test src/backend/seatOffers.day.test.ts src/backend/seats.removeSeat.test.ts src/backend/jobs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/advanceDay.ts src/backend/seats.ts src/backend/jobWorld.ts src/backend/seatOfferWorld.ts src/backend/seatOffers.day.test.ts
git commit -m "feat(h2h): propostas entre técnicos vencem no dia e fecham com a saída do clube

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: telas

**Files:**
- Create: `src/GameInterface/Negotiation/seatOfferApi.ts`, `src/GameInterface/Negotiation/SeatOfferCard.tsx`
- Modify: `src/GameInterface/Components/PlayerOfferModal.tsx`, `src/GameInterface/InboxScreen.tsx` (`TransferNegotiationBody`, assunto), `src/GameInterface/Negotiation/NegotiationOverview.tsx`, `src/GameInterface/TransfersScreen.tsx`, `src/GameInterface/World/GroupAdvanceProvider.tsx` (recarregar no evento), i18n

- [ ] **Step 1: cliente da API**

`seatOfferApi.ts`:
```ts
import type { SeatOfferView } from "@/types/seatOfferTypes";
type R<T> = { ok: true; data: T } | { ok: false; status: number; error: string; demand?: number };
async function call<T>(url: string, init?: RequestInit): Promise<R<T>> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: body as T } : { ok: false, status: res.status, error: String(body.error ?? "generic"), demand: body.demand };
}
const base = (saveId: string) => `/api/saves/${encodeURIComponent(saveId)}/seat-offers`;
export const seatOfferApi = {
  list: (saveId: string) => call<{ offers: SeatOfferView[]; seatClubs: { clubId: string; managerName: string }[] }>(base(saveId)),
  create: (saveId: string, body: Record<string, unknown>) => call<{ offer: SeatOfferView }>(base(saveId), { method: "POST", body: JSON.stringify(body) }),
  respond: (saveId: string, offerId: string, body: Record<string, unknown>) =>
    call<{ ok: true; status: string; offer?: SeatOfferView }>(`${base(saveId)}/${encodeURIComponent(offerId)}`, { method: "POST", body: JSON.stringify(body) }),
};
```

- [ ] **Step 2: `PlayerOfferModal`**

Ao abrir, chamar `seatOfferApi.list(saveId)` (só em mundo `multi`; o `session` sabe o modo — usar o campo que o `groupAdvance` usa, ex. `session.groupAdvance`, ou sempre chamar e tratar 404). Se `activePlayer.squadId` está em `seatClubs`:
- esconder a aba Pré-contrato;
- no envio da transferência, `seatOfferApi.create(saveId, { kind: "transfer", playerId, fromSquadId, fee, sellOnPct: pct, wage, years })`; no do empréstimo, `{ kind: "loan", playerId, fromSquadId, wageShare: share, fee }`;
- sucesso: texto `seatOffers.sent` ("Proposta enviada a {{manager}}") e fechar o formulário; erro: `seatOffers.errors.<code>` com fallback em `negotiation.errors.generic` (códigos: `alreadyOffered`, `tooManyOffers`, `windowClosed`, `squadFull`, `squadDepth`, `onLoan`, `invalidTerms`, e as recusas de contrato que já têm texto em `contracts.refusal.*`);
- se já existe proposta aberta minha por esse jogador (`offers.find((o) => o.playerId === id && o.side === "buyer")`), mostrar `SeatOfferCard` no lugar do formulário.

- [ ] **Step 3: `SeatOfferCard`**

Props `{ saveId: string; offer: SeatOfferView; onChanged?: () => void }`. Mostra: tipo (Transferência/Empréstimo), clube e técnico do outro lado, termos (taxa com `formatFee`, cláusula %, salário/semana e anos; no empréstimo % do salário e a volta), "Vale até <data>", de quem é a vez, histórico curto (última ação). Botões só com `myTurn`: Aceitar, Contrapropor (abre os mesmos controles do `BidCard`: faixa de taxa e chips 0/10/20/30, ou chips de % no empréstimo; desligado quando `counters >= 3`), Recusar; para o comprador sempre "Retirar". Erros por `seatOffers.errors.<code>`. Seguir o visual do `BidCard.tsx` (mesmas classes, `OptionChips`, `Button`).

- [ ] **Step 4: caixa de entrada**

`TransferNegotiationBody`: com `message.kind === "seat_offer"`, buscar `seatOfferApi.list` e achar `offerId`; se ainda aberta, renderizar `SeatOfferCard`; senão só o texto. i18n: `inbox.transfer.subject.seat_offer` / `inbox.transfer.body.seat_offer` com as variantes por `offerAction` — usar chaves `inbox.transfer.seatOffer.<action>.subject|body` e escolher em `transferVars`/no componente pelo `offerAction` (en e pt-BR, com `{{club}}`, `{{player}}`, `{{fee}}`).

- [ ] **Step 5: Transferências**

`NegotiationOverview`: nova `Section` `"seatOffers"`: bloco "Propostas com técnicos" com `DataTable` (jogador, tipo, outro clube, termos, de quem é a vez, validade) e o `SeatOfferCard` ao clicar na linha. `TransfersScreen.tsx:90`: acrescentar `"seatOffers"` como primeira seção.

- [ ] **Step 6: evento**

`GroupAdvanceProvider`: no `subscribe`, `if (event.type === "seat_offer" && event.saveId === saveId) void refreshSave();` usando o `refresh` de `useGameSave()` (recarrega caixa e elenco).

- [ ] **Step 7: i18n**

`seatOffers.*` (en, pt-BR): `title` ("Propostas com técnicos"), `transfer`, `loan`, `sent`, `yourTurn` ("Sua vez"), `theirTurn` ("Vez de {{manager}}"), `validUntil`, `accept`, `counter`, `reject`, `withdraw`, `lastCounter` ("Última contraproposta"), `errors.{alreadyOffered,tooManyOffers,notYourTurn,noRounds,invalidTerms,offerClosed,contractRefused,squadDepth,squadFull,onLoan,windowClosed}`. Acrescentar um teste de chaves em `src/i18n/seatOffers.keys.test.ts` no molde de `src/i18n/groupAdvance.keys.test.ts`.

- [ ] **Step 8: verificar** — `bunx tsc --noEmit` (só o erro antigo); `bun test src/GameInterface src/i18n` → PASS; `bun run ui:audit --hard` → 0.

- [ ] **Step 9: Commit**

```bash
git add src/GameInterface src/i18n
git commit -m "feat(h2h): telas das propostas entre técnicos (negociação, caixa, transferências)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: documentação, changelog e versão 4.26

**Files:**
- Modify: `.claude/rules/game/multiplayer.md`, `.claude/rules/game/negotiation.md` (seção "Assentos"), `src/GameInterface/changelog/changelog.ts`, `package.json`, `docs/ROADMAP.md`

- [ ] **Step 1: regra** — em `multiplayer.md`: (a) na "Regra" da parte 1, trocar "Humano × humano é a parte 4" e o 409 `seatOpponent` do `match-setup` pela regra nova; (b) seção nova "## Parte 4: humano × humano" com: prévia (`seatOpponent: true`, adversário pela regra da IA, `?live=1` 409), mercado (`seatOffers.json`, `SeatOffer`, rotas e erros, aceite, empréstimo nos dois mercados, vencimento, fechamento por `releaseHumanClub`/`removeSeat`), arquivos, testes (`bun test src/Domain/seatOffers src/backend/seatOffers.*.test.ts src/backend/seats.review.test.ts`) e limitações da spec §4. Em `negotiation.md` → "Assentos": uma linha apontando para a parte 4.
- [ ] **Step 2: changelog** — entrada `4.26` (data de hoje) com `items` pt/en: "Jogo contra outro técnico: prévia completa e o botão Simular" e "Propostas de transferência e empréstimo entre técnicos da liga, pela caixa de entrada"; `upcoming`: tirar o que saiu e pôr a parte 5 ("Classificação dos técnicos da liga"). `package.json` `"version": "4.26"` (sem BOM: editar com a ferramenta Edit).
- [ ] **Step 3: roadmap** — linha 43 do `docs/ROADMAP.md`: "Multiplayer (partes 1–4 de 5)" com o resumo; parágrafo da linha ~199 atualizado.
- [ ] **Step 4: verificar** — `bun test src/GameInterface/changelog src/repoHygiene.test.ts` → PASS.
- [ ] **Step 5: Commit**

```bash
git add .claude/rules/game/multiplayer.md .claude/rules/game/negotiation.md src/GameInterface/changelog/changelog.ts package.json docs/ROADMAP.md
git commit -m "docs(h2h): regra da parte 4, changelog e versão 4.26

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verificação final (antes do merge)

Suíte em partes, uma de cada vez:
1. `bun test src/Domain src/GameEngine src/GameInterface src/GraficsEngine src/types src/i18n src/repoHygiene.test.ts scripts`
2. backend em blocos de 5 arquivos (`ls src/backend/**/*.test.ts`)
3. `bun test src/lab src/mcp`
4. `bunx tsc --noEmit` (só `DecisionTree.ts:750`)
5. `bun run ui:audit --hard`

Navegador (dev server local, dois usuários: `localhost` e `127.0.0.1?as=2`, `.claude/rules/dev-login.md`): liga de amigos com dois clubes da mesma liga; no dia do jogo entre os dois, a prévia mostra "Simular"; os dois simulam e veem o resultado; proposta de transferência de A por um jogador de B, contraproposta de B, aceite de A; empréstimo.
