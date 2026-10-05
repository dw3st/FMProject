import { afterListedForSale } from "@/Domain/morale/morale";
import { randomUUID } from "crypto";
import { seasonLabel } from "@/Domain/history/history";
import { saveService } from "@/backend/SaveService";
import { executeTransferFee } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import { buildClubRecordMessage } from "@/Domain/clubHistory/recordMessage";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { isPlayerSquadId } from "@/Domain/clubLookup";
import type { TransferRecord, TransfersSplitResponse } from "@/types/transferTypes";
import type { TransferRef } from "@/types/dayLogTypes";
import type { SellCandidate } from "@/types/transferMarketTypes";
import { collectSellListedIds } from "@/Domain/scout/scoutQuery";
import {
  squadsAfterAcceptedTransfer,
} from "@/Domain/transfer/transferAcceptance";
import { getSellPriority } from "@/Domain/transfer/sellList";
import {
  activeCounter, parseSellOnPct, pruneTalks, recordRound, respondToOffer, talkGate, talkKey, type OfferResponse,
} from "@/Domain/negotiation/negotiation";
import { humanRosterSize, marketAfterSellOnPaid, sellOnFor, settleSellOn } from "@/backend/negotiationWorld";
import { buildTransferNegotiationMessage } from "@/Domain/inbox/inboxEvents";
import { applyPurchase } from "@/Domain/boardFans/boardFans";
import { initMarketState } from "@/Domain/transfer/marketRotation";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { contractEndFor, contractDemand, defaultSeasonEnd, evaluateContractOffer } from "@/Domain/contracts/contracts";
import { loadWindowContext, windowClosedResponse } from "@/backend/marketWindowWorld";
import { prestigeOf, rollRivalFor } from "@/backend/rivalWorld";
import { liveRivals, preferredClub, rivalFloor, starterChance } from "@/Domain/negotiation/rivals";

function splitTransfersByClub(
  transfers: TransferRecord[],
  playerSquadId: string | null,
): TransfersSplitResponse {
  if (!playerSquadId) {
    return { club: transfers, world: [], playerSquadId: null };
  }
  const club: TransferRecord[] = [];
  const world: TransferRecord[] = [];
  for (const t of transfers) {
    if (t.fromSquadId === playerSquadId || t.toSquadId === playerSquadId) club.push(t);
    else world.push(t);
  }
  return { club, world, playerSquadId };
}

async function enrichTransfersWithLogos(
  saveId: string,
  transfers: TransferRecord[],
): Promise<TransferRecord[]> {
  const ids = new Set<string>();
  for (const t of transfers) {
    ids.add(t.fromSquadId);
    ids.add(t.toSquadId);
  }
  const resolved = new Map<string, { leagueSlug: string; clubSlug: string }>();
  for (const id of ids) {
    const r = await saveService.resolveSquadId(saveId, id);
    if (r) resolved.set(id, r);
  }
  return transfers.map((t) => {
    const from = resolved.get(t.fromSquadId);
    const to = resolved.get(t.toSquadId);
    return {
      ...t,
      fromLeagueSlug: from?.leagueSlug,
      fromClubSlug: from?.clubSlug,
      toLeagueSlug: to?.leagueSlug,
      toClubSlug: to?.clubSlug,
    };
  });
}

export const transferRoutes = {
  "/api/saves/:saveId/transfers": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const raw = await saveService.getTransfers(saveId);
      const enriched = await enrichTransfersWithLogos(saveId, raw);
      const playerSquadId = meta.clubId;
      const body: TransfersSplitResponse = splitTransfersByClub(enriched, playerSquadId);
      return Response.json(body);
    }

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }

      if (!body || typeof body !== "object") {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }

      const { playerId, fromSquadId, fee, wage: offeredWage, years: offeredYears, sellOnPct: rawSellOn } = body as Record<string, unknown>;
      const sellOnPct = parseSellOnPct(rawSellOn);
      if (sellOnPct === null) return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      if (typeof playerId !== "string" || playerId.length === 0) {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }
      if (typeof fromSquadId !== "string" || fromSquadId.length === 0) {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }
      if (typeof fee !== "number" || !Number.isFinite(fee) || fee <= 0) {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }

      // Serialise the whole read-decide-mutate sequence per save: reading squads/budget,
      // deciding acceptance, exchanging the fee (executeTransferFee: saveSquad + appendLedger)
      // and appending the transfer/day-event must not interleave with a concurrent advance-day
      // on the same save (which also touches finances and the transfer log).
      return withSaveLock(saveId, async () => {
        const meta = await saveService.getMeta(saveId);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
        // Without a club (`.claude/rules/game/jobs.md`) there is nobody to buy for.
        if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });

        // Transfer window of the buyer — the human club (`.claude/rules/game/transfer-windows.md`).
        const windows = await loadWindowContext(meta, await saveService.getSquadIndex(saveId));
        if (!windows.human().open) return windowClosedResponse(windows.human());

        // ── Resolve squads ────────────────────────────────────────────────────
        const buyerResolved = { leagueSlug: meta.leagueSlug, clubSlug: meta.clubId };
        const sellerResolved = await saveService.resolveSquadId(saveId, fromSquadId);
        if (!sellerResolved) return Response.json({ error: "selling squad not found" }, { status: 404 });

        const [sellerSquad, buyerSquad] = await Promise.all([
          saveService.getSquad(saveId, sellerResolved.leagueSlug, sellerResolved.clubSlug),
          saveService.getSquad(saveId, buyerResolved.leagueSlug, buyerResolved.clubSlug),
        ]);
        if (!sellerSquad) return Response.json({ error: "selling squad not found" }, { status: 404 });
        if (!buyerSquad) return Response.json({ error: "buying squad not found" }, { status: 404 });

        if ((await humanRosterSize(saveService, saveId, buyerSquad)) >= HUMAN_MAX_SQUAD) return Response.json({ error: "squadFull" }, { status: 400 });

        // ── Budget check ──────────────────────────────
        const budget = buyerSquad.finances?.budget ?? 0;
        if (budget < fee) {
          return Response.json({ error: "Insufficient funds" }, { status: 400 });
        }

        const player = sellerSquad.players.find((p) => p.id === playerId);
        if (!player) {
          // Sold to a rival on the deadline (`.claude/rules/game/negotiation.md` → "Disputa").
          const lost = (await saveService.getMarket(saveId))?.lostTargets?.find((l) => l.playerId === playerId);
          if (lost) return Response.json({ response: { kind: "lost", clubName: lost.clubName, fee: lost.fee } });
          return Response.json({ error: "player not found" }, { status: 404 });
        }
        if (sellerSquad.id === buyerSquad.id) return Response.json({ error: "not for sale" }, { status: 400 });
        // On loan at that club: not its player to sell (`.claude/rules/game/negotiation.md`).
        if (player.loan) return Response.json({ error: "onLoan" }, { status: 400 });

        // ── Look up seller's sell list for acceptance boost ───────────────────
        const rawMarket = await saveService.getMarket(saveId);
        const market = rawMarket ? { ...rawMarket, playerSellList: rawMarket.playerSellList ?? [] } : null;
        const sellerProfile = market?.profiles[fromSquadId];
        const sellPriority = sellerProfile
          ? (getSellPriority(playerId, sellerProfile.sellList ?? []) ?? undefined)
          : undefined;

        // ── Contract offer to the player ──────────────────────────────────────
        // Every signing creates a contract. `wage` defaults to the player's demand and `years`
        // to 3 (shortened to fit the age limit) when the client sends neither.
        // Personality (`personality.md`): the seller's club is where he comes from (smaller-club premium / refusal).
        const demandCtx = { fromSquad: sellerSquad };
        const demand = contractDemand(player, buyerSquad, meta.currentDate ?? "", demandCtx);
        const contractYears = typeof offeredYears === "number"
          ? offeredYears
          : Math.min(3, Math.max(1, 36 - player.age));
        const contractWage = typeof offeredWage === "number" ? offeredWage : demand;
        const contractCheck = evaluateContractOffer(
          { wage: contractWage, years: contractYears }, player, buyerSquad, meta.currentDate ?? "", demandCtx,
        );
        if (!contractCheck.accepted) {
          return Response.json({ error: contractCheck.reason, demand: contractCheck.demand }, { status: 400 });
        }
        const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end
          ?? defaultSeasonEnd(meta.currentDate ?? new Date().toISOString().slice(0, 10));
        const newContract = { until: contractEndFor(meta.currentDate ?? new Date().toISOString().slice(0, 10), seasonEnd, contractYears), wage: contractWage };

        // ── Negotiation (`.claude/rules/game/negotiation.md`): patience, then accept / counter / refuse ──
        const date0 = meta.currentDate ?? new Date().toISOString().slice(0, 10);
        const talks = market?.talks ?? {};
        const key = talkKey("transfer", playerId);
        const counter = activeCounter(talks[key], date0);
        const meetsCounter = !!counter && fee >= counter.fee && (counter.sellOnPct ?? 0) === sellOnPct;
        const gate = talkGate(talks[key], date0, meetsCounter);
        if (gate === "closed") return Response.json({ error: "talksClosed", until: talks[key]?.closedUntil }, { status: 409 });
        if (gate === "noRounds") return Response.json({ error: "noRounds" }, { status: 409 });
        // Rivals (Etapa 25): the first offer of the day may bring another AI club in; the seller then
        // asks the human for at least the best rival fee it accepts x 1,05.
        let marketWithRivals = market;
        if (market && talks[key]?.date !== date0) {
          const rolled = await rollRivalFor(saveService, saveId, {
            market, player, seller: sellerSquad, humanId: buyerSquad.id, date: date0, windows,
          });
          marketWithRivals = rolled.market;
          if (rolled.news) await emitInboxMessage(saveId, buildTransferNegotiationMessage(rolled.news), saveService);
        }
        const rivals = liveRivals(marketWithRivals?.rivalBids, playerId, date0);
        const floor = rivalFloor(rivals);
        let answer: OfferResponse = meetsCounter && fee >= floor
          ? { kind: "accept", reason: "financial" }
          : respondToOffer({ player, seller: sellerSquad, buyer: buyerSquad, fee, sellOnPct, ...(sellPriority !== undefined ? { sellPriority } : {}) });
        if (floor > 0 && answer.kind === "accept" && fee < floor) answer = { kind: "counter", counterFee: floor };
        if (floor > 0 && answer.kind === "counter" && answer.counterFee < floor) answer = { kind: "counter", counterFee: floor };
        // The seller accepts: with a live rival it also accepts, the player chooses (preferenceScore).
        let preference: { winner: string; clubName: string; reason: string } | null = null;
        const accepting = rivals.filter((r) => r.sellerAccepts);
        if (answer.kind === "accept" && accepting.length > 0) {
          const prestige = await prestigeOf(saveService, saveId, date0, [buyerSquad.id, ...accepting.map((r) => r.clubId)]);
          const options = [
            { id: buyerSquad.id, name: buyerSquad.name, pref: { wage: contractWage, demand, prestige: prestige.get(buyerSquad.id) ?? 0.5, starter: starterChance(player, buyerSquad) } },
            ...(await Promise.all(accepting.map(async (r) => {
              const club = await saveService.getSquadById(saveId, r.clubId);
              return {
                id: r.clubId, name: r.clubName,
                pref: { wage: r.wage, demand: club ? contractDemand(player, club, date0, demandCtx) : demand, prestige: prestige.get(r.clubId) ?? 0.5, starter: club ? starterChance(player, club) : 0.5 },
              };
            }))),
          ];
          const pick = preferredClub(options);
          if (pick) {
            preference = { winner: pick.winner.id, clubName: pick.winner.name, reason: pick.reason };
            if (pick.winner.id !== buyerSquad.id) answer = { kind: "prefers_rival", clubName: pick.winner.name, reason: pick.reason };
          }
        }
        const rivalInfo = rivals.length > 0
          ? [...rivals].sort((a, b) => b.fee - a.fee).map((r) => ({ clubId: r.clubId, clubName: r.clubName, fee: r.fee, deadline: r.deadline, sellerAccepts: r.sellerAccepts }))
          : undefined;
        const talk = recordRound(
          talks[key], { playerId, kind: "transfer", date: date0 }, { fee, sellOnPct },
          answer.kind === "accept" ? { by: "club", fee, sellOnPct, outcome: "accepted" }
          : answer.kind === "counter" ? { by: "club", fee: answer.counterFee, sellOnPct, outcome: "counter" }
          : answer.kind === "prefers_rival" ? { by: "club", fee, outcome: "prefers_rival" }
          : { by: "club", outcome: answer.reason === "insulted" ? "insulted" : "rejected" },
        );
        const marketBase = marketWithRivals ?? initMarketState(await saveService.getAllSquads(saveId));
        await saveService.saveMarket(saveId, {
          ...marketBase,
          talks: { ...pruneTalks(marketBase.talks, date0), [key]: talk },
          // Bought: the rivals for him are gone.
          ...(answer.kind === "accept" ? { rivalBids: (marketBase.rivalBids ?? []).filter((r) => r.playerId !== playerId) } : {}),
        });
        if (answer.kind === "counter" || answer.kind === "prefers_rival") {
          return Response.json({ response: answer, talk, ...(rivalInfo ? { rival: rivalInfo } : {}), ...(preference ? { preference } : {}) });
        }
        const accepted = answer.kind === "accept";
        const reason = answer.kind === "accept" || answer.kind === "reject" ? answer.reason : "clubRejected";

        const transferId = randomUUID();
        const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);

        const record: TransferRecord = {
          id: transferId,
          date,
          playerId,
          playerName: player.name,
          playerPosition: player.positions[0] ?? "—",
          playerAge: player.age,
          fromSquadId,
          fromSquadName: sellerSquad.name,
          toSquadId: buyerSquad.id,
          toSquadName: buyerSquad.name,
          fee,
          direction: "in",
          status: accepted ? "accepted" : "rejected",
          reason,
        };

        let updatedMeta = meta;

        if (accepted) {
          // Move player between squads (no money here — FinancialService handles that)
          const { selling, buying } = squadsAfterAcceptedTransfer(
            player,
            sellerSquad,
            buyerSquad,
            buyerSquad.id,
            playerId,
            newContract,
            (() => {
              const l = (meta.activeLeagues ?? []).find((x) => x.leagueSlug === sellerResolved.leagueSlug);
              return l ? { league: l.leagueSlug, season: seasonLabel(l.year, l.start, l.end) } : null;
            })(),
            sellOnPct > 0 ? { clubId: sellerSquad.id, clubName: sellerSquad.name, pct: sellOnPct } : null,
          );
          // A clause the player already carried is paid out of this fee (the seller keeps the rest).
          const owed = sellOnFor(player, sellerSquad.id, fee);

          // Exchange money via FinancialService — it also persists both squads (roster + money).
          // Saving `selling` / `buying` again here would overwrite the fee exchange.
          const isSellerPlayerClub = isPlayerSquadId(fromSquadId, meta);
          updatedMeta = await executeTransferFee(
            saveId,
            meta,
            { squad: buying, ...buyerResolved, isPlayerClub: true },
            { squad: selling, ...sellerResolved, isPlayerClub: isSellerPlayerClub },
            fee,
            saveService,
            { playerName: player.name, playerId, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) },
          );
          const sellOnNews = await settleSellOn(saveService, saveId, updatedMeta, owed, player, sellerSquad.name, date);
          if (sellOnNews) {
            await emitInboxMessage(saveId, buildTransferNegotiationMessage(sellOnNews), saveService);
            // Buying back a player whose clause we held: it was paid (to us), drop the receivable.
            const held = await saveService.getMarket(saveId);
            if (held) await saveService.saveMarket(saveId, marketAfterSellOnPaid(held, playerId));
          }

          // Club history (`.claude/rules/game/club-history.md`): transfer records of both clubs.
          {
            const seasonOf = (leagueSlug: string) => {
              const l = (meta.activeLeagues ?? []).find((x) => x.leagueSlug === leagueSlug);
              return l ? seasonLabel(l.year, l.start, l.end) : date.slice(0, 4);
            };
            const changes = await recordTransferHistory(saveService, saveId, {
              buyer: buying, seller: selling, playerId, fee, date,
              buyerSeason: seasonOf(buyerResolved.leagueSlug), sellerSeason: seasonOf(sellerResolved.leagueSlug),
            });
            // The buyer is the human club here.
            for (const c of changes) {
              if (c.squadId !== buyerSquad.id) continue;
              for (const r of c.broken) await emitInboxMessage(saveId, buildClubRecordMessage(date, r), saveService);
            }
          }

          // Board (`.claude/rules/game/board-fans.md`): spending past the balance costs confidence.
          const budgetAfter = (buyerSquad.finances?.budget ?? 0) - fee;
          if (updatedMeta.board && budgetAfter < 0) {
            updatedMeta = await saveService.updateMeta(saveId, {
              board: applyPurchase(updatedMeta.board, { balanceAfter: budgetAfter }),
            });
          }

          // Remove the sold player from the seller's sell list in the market profile
          const latest = await saveService.getMarket(saveId);
          if (latest && sellerProfile) {
            const updatedProfile = {
              ...sellerProfile,
              sellList: (sellerProfile.sellList ?? []).filter((c) => c.playerId !== playerId),
            };
            await saveService.saveMarket(saveId, {
              ...latest,
              profiles: { ...latest.profiles, [fromSquadId]: updatedProfile },
            });
          }
        }

        await saveService.appendTransfer(saveId, record);
        const ref: TransferRef = { kind: "transfer_ref", transferId };
        await saveService.appendDayEvent(saveId, date, ref);
        if (accepted) {
          await saveService.appendDayTransfers(saveId, date, [{ playerId, from: fromSquadId, to: buyerSquad.id, fee, kind: "transfer", date }]);
        }

        // No clamp (see .claude/rules/game/finances.md) — this is only the response's echo of the
        // new budget, the real value already comes from executeTransferFee's persisted squad.
        const oldBudget = buyerSquad.finances?.budget ?? 0;
        const newBudget = accepted ? oldBudget - fee : oldBudget;
        return Response.json({ record, newBudget, response: answer, talk, ...(rivalInfo ? { rival: rivalInfo } : {}), ...(preference ? { preference } : {}) });
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  // ── Sell list routes ───────────────────────────────────────────────────────

  "/api/saves/:saveId/sell-list": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const rawMarket = await saveService.getMarket(saveId);
      const market = rawMarket ? { ...rawMarket, playerSellList: (rawMarket.playerSellList ?? []) as SellCandidate[] } : null;
      return Response.json(market?.playerSellList ?? []);
    }

    if (req.method === "POST") {
      let body: unknown;
      try { body = await req.json(); } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }
      const { playerId } = body as Record<string, unknown>;
      if (typeof playerId !== "string" || playerId.length === 0) {
        return Response.json({ error: "missing playerId" }, { status: 400 });
      }

      // Serialise the read-decide-write of the market's sell list per save: a concurrent
      // dailyMarketTick (advance-day) or another sell-list toggle on the same save must not
      // interleave with this read-modify-write, or one toggle can silently undo another.
      return withSaveLock(saveId, async () => {
        const meta = await saveService.getMeta(saveId);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
        // Without a club (`.claude/rules/game/jobs.md`) there is nothing to sell.
        if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
        const rawMarket = await saveService.getMarket(saveId);
        const market = rawMarket ? { ...rawMarket, playerSellList: (rawMarket.playerSellList ?? []) as SellCandidate[] } : null;
        const listed = (market?.playerSellList ?? []).some((c) => c.playerId === playerId);
        // Only the human club's own players can be listed (toggling one off always works).
        const own = (await saveService.getSquadById(saveId, meta.clubId))?.players.find((p) => p.id === playerId);
        if (!listed && !own) {
          return Response.json({ error: "not your player" }, { status: 400 });
        }
        // A borrowed player is not the human's to sell (`.claude/rules/game/negotiation.md`).
        if (!listed && own?.loan) return Response.json({ error: "onLoan" }, { status: 400 });

        const allSquads = await saveService.getAllSquads(saveId);
        const baseMarket = market ?? initMarketState(allSquads);
        const currentList: SellCandidate[] = baseMarket.playerSellList;

        let newList: SellCandidate[];
        const existingIdx = currentList.findIndex((c) => c.playerId === playerId);
        if (existingIdx >= 0) {
          // Toggle off
          newList = currentList.filter((c) => c.playerId !== playerId);
        } else {
          // Add with max priority (human explicitly listed it)
          newList = [...currentList, { playerId, priority: 1.0 }];
        }

        const updatedMarket = { ...baseMarket, playerSellList: newList };
        await saveService.saveMarket(saveId, updatedMarket);
        // Listed without asking for it: −8 morale (`.claude/rules/game/morale.md`).
        if (existingIdx < 0 && own) {
          const human = await saveService.getSquadById(saveId, meta.clubId);
          if (human) {
            const after = afterListedForSale(human, playerId);
            if (after !== human) await saveService.saveSquadById(saveId, after);
          }
        }
        return Response.json({ playerSellList: newList });
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  "/api/saves/:saveId/sell-listed-players": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }

    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    // Same source as the scout search `onlyForSale` filter: every AI sell list + the human one.
    const ids = collectSellListedIds(await saveService.getMarket(saveId));

    return Response.json(ids);
  },
};
