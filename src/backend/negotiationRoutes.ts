import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { logError } from "@/Logger";
import { emitInboxMessage, buildTransferNegotiationMessage } from "@/Domain/inbox/inboxEvents";
import {
  activeCounter, parseSellOnPct, pruneTalks, recordRound, respondToHumanCounter, talkGate, talkKey,
} from "@/Domain/negotiation/negotiation";
import { loanUntil, loanWeeks, respondToLoanRequest } from "@/Domain/negotiation/loans";
import { liveBids } from "@/Domain/negotiation/bids";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { aiClubFinance, aiTransferBudgetOf, estimateWeeklyWage, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { currentWage, wageFactorOf } from "@/Domain/finance/wages";
import { squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import { getSellPriority } from "@/Domain/transfer/sellList";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import {
  completeHumanSale, emptyMarket, findLiveBid, humanRosterSize, seasonEndOf, startLoan,
} from "@/backend/negotiationWorld";
import type { MarketState } from "@/types/transferMarketTypes";

type Req = Request & { params: Record<string, string> };

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Negotiation, AI bids and loans (`.claude/rules/game/negotiation.md`). */
export const negotiationRoutes = {
  /** `GET` - pending AI bids, active loans, the loan list and the sell-on clauses held. */
  "/api/saves/:saveId/negotiation": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    const meta = await saveService.getMeta(saveId);
    if (!meta) return json({ error: "save not found" }, 404);
    const market = await saveService.getMarket(saveId);
    const squad = meta.clubId ? await saveService.getSquadById(saveId, meta.clubId) : null;
    const date = meta.currentDate ?? "";
    return json({
      clubId: meta.clubId,
      bids: liveBids(market?.pendingBids, date, squad),
      loans: (market?.loans ?? []).filter((l) => l.fromClubId === meta.clubId || l.toClubId === meta.clubId),
      loanList: market?.playerLoanList ?? [],
      sellOnHeld: market?.sellOnHeld ?? [],
    });
  },

  /** `GET ?kind=transfer|loan` - today's talks about a player (rounds left, last counter, ban). */
  "/api/saves/:saveId/negotiation/:playerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    const kind = new URL(req.url).searchParams.get("kind") === "loan" ? "loan" : "transfer";
    const meta = await saveService.getMeta(saveId);
    if (!meta) return json({ error: "save not found" }, 404);
    const market = await saveService.getMarket(saveId);
    const talk = market?.talks?.[talkKey(kind, req.params.playerId!)];
    const date = meta.currentDate ?? "";
    const today = talk && (talk.date === date || (talk.closedUntil && talk.closedUntil >= date)) ? talk : null;
    return json({ talk: today, gate: talkGate(today ?? undefined, date) });
  },

  /**
   * `POST { action: "accept" | "reject" | "counter", fee?, sellOnPct? }` - answer an AI bid.
   * 409 `offerClosed` when it expired, is gone or the club can no longer complete it; 409
   * `noRounds` on a second counter above the club's maximum (the bid is withdrawn).
   */
  "/api/saves/:saveId/bids/:bidId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const bidId = req.params.bidId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as { action?: unknown; fee?: unknown; sellOnPct?: unknown } | null;
    const action = body?.action;
    if (action !== "accept" && action !== "reject" && action !== "counter") return json({ error: "action required" }, 400);
    const sellOnPct = parseSellOnPct(body?.sellOnPct);
    if (action === "counter" && (typeof body?.fee !== "number" || !Number.isFinite(body.fee) || body.fee <= 0 || sellOnPct === null)) {
      return json({ error: "missing or invalid fields" }, 400);
    }
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const date = meta.currentDate ?? "";
      const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
      const bid = findLiveBid(market, bidId, date);
      if (!bid) return json({ error: "offerClosed" }, 409);
      const withoutBid = { ...market, pendingBids: (market.pendingBids ?? []).filter((b) => b.id !== bidId) };

      if (action === "reject") {
        await saveService.saveMarket(saveId, withoutBid);
        return json({ ok: true, status: "rejected" });
      }

      const seller = await saveService.getSquadById(saveId, meta.clubId);
      const buyer = await saveService.getSquadById(saveId, bid.clubId);
      const player = seller?.players.find((p) => p.id === bid.playerId && !p.loan);
      // The human club never lets a player go below its squad / position / role minimums.
      if (seller && player && squadDepthBlocked(player, seller, false)) return json({ error: "squadDepth" }, 409);
      if (!seller || !buyer || !player || buyer.players.length >= MAX_SQUAD) {
        await saveService.saveMarket(saveId, withoutBid);
        return json({ error: "offerClosed" }, 409);
      }

      let fee = bid.fee;
      let pct = bid.sellOnPct ?? 0;
      if (action === "counter" && bid.kind === "transfer") {
        const r = respondToHumanCounter(bid, body!.fee as number, sellOnPct ?? 0, player.age);
        if (r.kind === "closed") {
          await saveService.saveMarket(saveId, withoutBid);
          return json({ error: "noRounds" }, 409);
        }
        if (r.kind === "counter") {
          await saveService.saveMarket(saveId, { ...market, pendingBids: (market.pendingBids ?? []).map((b) => (b.id === bidId ? r.bid : b)) });
          return json({ ok: true, status: "countered", bid: r.bid });
        }
        fee = r.fee;
        pct = r.sellOnPct;
      } else if (action === "counter") {
        return json({ error: "loan bids cannot be countered" }, 400);
      }

      try {
        if (bid.kind === "transfer") {
          if (fee > aiTransferBudgetOf(buyer) || !passesWageGate(aiClubFinance(buyer), estimateWeeklyWage(player, wageFactorOf(buyer)), fee)) {
            await saveService.saveMarket(saveId, withoutBid);
            return json({ error: "offerClosed" }, 409);
          }
          const done = await completeHumanSale(saveService, saveId, meta, withoutBid, { player, seller, buyer, fee, sellOnPct: pct });
          await saveService.saveMarket(saveId, done.market);
          return json({ ok: true, status: "sold", record: done.record });
        }
        const share = bid.wageShare ?? 1;
        if (!passesWageGate(aiClubFinance(buyer), Math.round(currentWage(player, wageFactorOf(seller)) * share), 0)) {
          await saveService.saveMarket(saveId, withoutBid);
          return json({ error: "offerClosed" }, 409);
        }
        const next = await startLoan(saveService, saveId, meta, withoutBid, {
          player, parent: seller, borrower: buyer, wageShare: bid.wageShare ?? 1,
          until: bid.until ?? seasonEndOf(meta.activeLeagues, buyer.leagueSlug, date), fee: bid.fee,
        });
        await saveService.saveMarket(saveId, next);
        return json({ ok: true, status: "loaned" });
      } catch (err) {
        logError("negotiation", `save ${saveId}: failed to complete bid ${bidId}`, err);
        return json({ error: "failed to complete" }, 500);
      }
    });
  },

  /**
   * `POST { playerId, fromSquadId, wageShare (0..100), fee }` - the human asks an AI club for a
   * loan. Answers `accept` (the player joins), `counter` (wage share and/or loan fee) or `reject`.
   */
  "/api/saves/:saveId/loans": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const { playerId, fromSquadId, wageShare: rawShare, fee: rawFee } = body ?? {};
    if (typeof playerId !== "string" || !playerId || typeof fromSquadId !== "string" || !fromSquadId) {
      return json({ error: "missing or invalid fields" }, 400);
    }
    if (typeof rawShare !== "number" || !Number.isInteger(rawShare) || rawShare < 0 || rawShare > 100) {
      return json({ error: "missing or invalid fields" }, 400);
    }
    const fee = rawFee === undefined ? 0 : rawFee;
    if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0) return json({ error: "missing or invalid fields" }, 400);
    const wageShare = rawShare / 100;

    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const date = meta.currentDate ?? "";
      const borrower = await saveService.getSquadById(saveId, meta.clubId);
      const parent = await saveService.getSquadById(saveId, fromSquadId);
      if (!borrower || !parent) return json({ error: "squad not found" }, 404);
      if (parent.id === borrower.id) return json({ error: "not for loan" }, 400);
      const player = parent.players.find((p) => p.id === playerId);
      if (!player) return json({ error: "player not found" }, 404);
      if ((await humanRosterSize(saveService, saveId, borrower)) >= MAX_SQUAD) return json({ error: "squadFull" }, 400);
      if (fee > (borrower.finances?.budget ?? 0)) return json({ error: "Insufficient funds" }, 400);

      const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
      const key = talkKey("loan", playerId);
      const counter = activeCounter(market.talks?.[key], date);
      const meetsCounter = !!counter && wageShare >= (counter.wageShare ?? 1) && fee >= counter.fee;
      const gate = talkGate(market.talks?.[key], date, meetsCounter);
      if (gate === "closed") return json({ error: "talksClosed", until: market.talks?.[key]?.closedUntil }, 409);
      if (gate === "noRounds") return json({ error: "noRounds" }, 409);

      const until = loanUntil(date, seasonEndOf(meta.activeLeagues, borrower.leagueSlug, date));
      const listed = getSellPriority(playerId, market.profiles?.[parent.id]?.sellList ?? []) !== null;
      const answer = meetsCounter
        ? { kind: "accept" as const }
        : respondToLoanRequest({
          player, parent, wageShare, fee, weeks: loanWeeks(date, until),
          starterIds: new Set(autoLineupDefaultFormation(parent)), listed,
        });
      const talk = recordRound(
        market.talks?.[key], { playerId, kind: "loan", date }, { fee, wageShare },
        answer.kind === "accept" ? { by: "club", fee, wageShare, outcome: "accepted" }
        : answer.kind === "counter" ? { by: "club", fee: answer.fee, wageShare: answer.wageShare, outcome: "counter" }
        : { by: "club", outcome: "rejected" },
      );
      let next: MarketState = { ...market, talks: { ...pruneTalks(market.talks, date), [key]: talk } };
      if (answer.kind === "accept") {
        try {
          next = await startLoan(saveService, saveId, meta, next, { player, parent, borrower, wageShare, until, fee });
        } catch (err) {
          logError("negotiation", `save ${saveId}: failed to start loan of ${playerId}`, err);
          return json({ error: "failed to complete" }, 500);
        }
      }
      await saveService.saveMarket(saveId, next);
      return json({ response: answer, talk, until });
    });
  },

  /** `GET` the human's loan list, `POST { playerId }` toggles a player on it. */
  "/api/saves/:saveId/loan-list": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      return json((await saveService.getMarket(saveId))?.playerLoanList ?? []);
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as { playerId?: unknown } | null;
    const playerId = body?.playerId;
    if (typeof playerId !== "string" || !playerId) return json({ error: "missing playerId" }, 400);
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
      const list = market.playerLoanList ?? [];
      if (list.includes(playerId)) {
        const next = list.filter((id) => id !== playerId);
        await saveService.saveMarket(saveId, { ...market, playerLoanList: next });
        return json({ playerLoanList: next });
      }
      const own = (await saveService.getSquadById(saveId, meta.clubId))?.players.find((p) => p.id === playerId);
      if (!own) return json({ error: "not your player" }, 400);
      if (own.loan) return json({ error: "onLoan" }, 400);
      const next = [...list, playerId];
      await saveService.saveMarket(saveId, { ...market, playerLoanList: next });
      return json({ playerLoanList: next });
    });
  },
};

/** Emits the human club's negotiation news (used by the day advance after `clearInbox`). */
export async function emitNegotiationNews(
  saveId: string,
  news: Parameters<typeof buildTransferNegotiationMessage>[0][],
  service = saveService,
): Promise<void> {
  for (const n of news) await emitInboxMessage(saveId, buildTransferNegotiationMessage(n), service);
}
