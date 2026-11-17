/**
 * I/O of the fee transfers agreed with the buyer's window closed (tester report 0a35192c): the
 * fee is paid at agreement, the player stays at his club (`RosterPlayer.deferredTo`) and joins the
 * human club on the day its window opens. Pure rules: `src/Domain/negotiation/deferredTransfer.ts`.
 */
import { randomUUID } from "crypto";
import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { recordMoney, type SquadRef } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import { historyFromOf, humanRosterSize, seasonEndOf, sellOnFor, settleSellOn } from "@/backend/negotiationWorld";
import { applyAITransferSale } from "@/Domain/aiFinance/aiClubFinance";
import { applyPurchase } from "@/Domain/boardFans/boardFans";
import { contractEndFor } from "@/Domain/contracts/contracts";
import { HUMAN_MAX_SQUAD, replaceAfterSale } from "@/Domain/contracts/freeAgents";
import { seasonLabel } from "@/Domain/history/history";
import { dueDeferred, markDeferred } from "@/Domain/negotiation/deferredTransfer";
import { squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { DeferredTransfer } from "@/types/transferMarketTypes";
import type { StoredTransferRecord } from "@/types/transferTypes";
import type { DayTransfer, TransferRef } from "@/types/dayLogTypes";
import type { TransferInboxMessage } from "@/types/inboxTypes";

type News = {
  date: string; kind: TransferInboxMessage["kind"]; playerId: string; playerName: string; clubName: string;
  fee?: number; opensOn?: string;
};

async function ledgerSeason(service: SaveService, saveId: string, ref: SquadRef, date: string): Promise<number> {
  return (await service.getLeagueMeta(saveId, ref.leagueSlug))?.year ?? parseInt(date.slice(0, 4), 10);
}

/**
 * The deal is agreed with the window closed: the human club pays the fee now (ledger `transfer_out`),
 * the seller keeps the player marked as sold, and the seat's market lists the signing.
 */
export async function agreeDeferredTransfer(
  service: SaveService, saveId: string, seatId: string, meta: SeatMeta,
  args: {
    player: RosterPlayer; seller: Squad; buyer: Squad; buyerRef: SquadRef;
    fee: number; wage: number; years: number; sellOnPct: number; clause: boolean; joinsOn: string;
  },
): Promise<DeferredTransfer> {
  const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
  const { player, seller, buyer, fee } = args;
  await recordMoney(service, saveId, await ledgerSeason(service, saveId, args.buyerRef, date), args.buyerRef, {
    date, kind: "transfer_out", amount: -fee, label: `Transfer fee paid to ${seller.name}`,
    ref: { opponentId: seller.id, clubName: seller.name, playerName: player.name, playerId: player.id },
  }, seatId);
  // Board (`.claude/rules/game/board-fans.md`): spending past the balance costs confidence.
  const budgetAfter = (buyer.finances?.budget ?? 0) - fee;
  if (meta.board && budgetAfter < 0) await service.updateSeat(saveId, seatId, { board: applyPurchase(meta.board, { balanceAfter: budgetAfter }) });

  const sellerNow = (await service.getSquadById(saveId, seller.id)) ?? seller;
  await service.saveSquadById(saveId, markDeferred(sellerNow, player.id, buyer.id));

  const entry: DeferredTransfer = {
    playerId: player.id, playerName: player.name, fromClubId: seller.id, fromClubName: seller.name, toClubId: buyer.id,
    fee, wage: args.wage, years: args.years, ...(args.sellOnPct > 0 ? { sellOnPct: args.sellOnPct } : {}),
    ...(args.clause ? { clause: true } : {}), agreedOn: date, joinsOn: args.joinsOn,
  };
  const market = await service.getMarket(saveId, seatId);
  if (market) {
    const profile = market.profiles?.[seller.id];
    await service.saveMarket(saveId, {
      ...market,
      deferredTransfers: [...(market.deferredTransfers ?? []).filter((d) => d.playerId !== player.id), entry],
      ...(profile ? { profiles: { ...market.profiles, [seller.id]: { ...profile, sellList: (profile.sellList ?? []).filter((c) => c.playerId !== player.id) } } } : {}),
    }, seatId);
  }
  return entry;
}

/** Refund of a deal that fell through (ledger `transfer_in`, stage `deferred_refund`) to a club the seat still runs. */
async function refund(service: SaveService, saveId: string, seatId: string, meta: SeatMeta, d: DeferredTransfer, date: string): Promise<void> {
  if (d.fee <= 0) return;
  if (d.toClubId === meta.clubId) {
    const ref = await service.resolveSquadId(saveId, d.toClubId);
    if (!ref) return;
    await recordMoney(service, saveId, await ledgerSeason(service, saveId, ref, date), ref, {
      date, kind: "transfer_in", amount: d.fee, label: `Refund: ${d.playerName}`,
      ref: { opponentId: d.fromClubId, clubName: d.fromClubName, stage: "deferred_refund", playerName: d.playerName, playerId: d.playerId },
    }, seatId);
    return;
  }
  // The manager left that club: it is an AI club now, the money goes back to its transfer budget.
  const club = await service.getSquadById(saveId, d.toClubId);
  if (club && !(await service.seatOfClub(saveId, club.id))) await service.saveSquadById(saveId, applyAITransferSale(club, d.fee));
}

/**
 * The deferred signings due today join their new club with the agreed contract, through the same
 * path as a normal purchase (history row, arrival, settling, sell-on clause, club records, the
 * seller's replacement). A player who is gone, or a squad that is full, cancels the deal and the
 * fee comes back.
 */
export async function applyDueDeferredTransfers(
  service: SaveService, saveId: string, seatId: string, meta: SeatMeta, date: string,
): Promise<{ news: News[]; moves: DayTransfer[] }> {
  const market = await service.getMarket(saveId, seatId);
  const due = dueDeferred(market?.deferredTransfers, date);
  if (!market || due.length === 0) return { news: [], moves: [] };
  const news: News[] = [];
  const moves: DayTransfer[] = [];
  const seasonOf = (slug: string | undefined) => {
    const l = (meta.activeLeagues ?? []).find((x) => x.leagueSlug === slug);
    return l ? seasonLabel(l.year, l.start, l.end) : date.slice(0, 4);
  };
  for (const d of due) {
    const from = await service.getSquadById(saveId, d.fromClubId);
    const player = from?.players.find((p) => p.id === d.playerId && !p.loan);
    const buyer = await service.getSquadById(saveId, d.toClubId);
    const ownClub = d.toClubId === meta.clubId;
    const full = buyer && ownClub ? (await humanRosterSize(service, saveId, seatId, buyer)) >= HUMAN_MAX_SQUAD : false;
    if (!from || !player || !buyer || full) {
      if (from && player) await service.saveSquadById(saveId, markDeferred(from, player.id, null));
      await refund(service, saveId, seatId, meta, d, date);
      if (ownClub) news.push({ date, kind: "deferred_cancelled", playerId: d.playerId, playerName: d.playerName, clubName: d.fromClubName, fee: d.fee });
      continue;
    }
    const end = seasonEndOf(meta.activeLeagues, buyer.leagueSlug, date);
    const contract = { wage: d.wage, until: contractEndFor(date, end, d.years) };
    const { selling, buying } = squadsAfterAcceptedTransfer(
      player, from, buyer, buyer.id, player.id, contract, historyFromOf(meta.activeLeagues, from.leagueSlug),
      d.sellOnPct ? { clubId: from.id, clubName: from.name, pct: d.sellOnPct } : null,
      { kind: d.clause ? "clause" : "transfer", fee: d.fee, on: date },
    );
    // The seller is paid now (a clause the player carried comes out of the fee).
    const owed = sellOnFor(player, from.id, d.fee);
    const net = d.fee - (owed?.amount ?? 0);
    const sellerSeat = await service.seatOfClub(saveId, from.id);
    await service.saveSquadById(saveId, sellerSeat ? selling : applyAITransferSale(selling, net));
    await service.saveSquadById(saveId, buying);
    if (sellerSeat && net > 0) {
      const ref = await service.resolveSquadId(saveId, from.id);
      if (ref) {
        await recordMoney(service, saveId, await ledgerSeason(service, saveId, ref, date), ref, {
          date, kind: "transfer_in", amount: net, label: `Transfer fee from ${buyer.name}`,
          ref: { opponentId: buyer.id, clubName: buyer.name, playerName: player.name, playerId: player.id },
        }, sellerSeat);
      }
    }
    const sellOnNews = await settleSellOn(service, saveId, seatId, meta, owed, player, from.name, date);
    if (sellOnNews) news.push(sellOnNews);
    await recordTransferHistory(service, saveId, {
      buyer: buying, seller: selling, playerId: player.id, fee: d.fee, date,
      buyerSeason: seasonOf(buying.leagueSlug), sellerSeason: seasonOf(selling.leagueSlug),
    });
    // An AI seller left below a role minimum signs a replacement today.
    if (!sellerSeat) {
      const sellerNow = await service.getSquadById(saveId, from.id);
      if (sellerNow) {
        const pool = await service.getFreeAgents(saveId);
        const r = replaceAfterSale(sellerNow, pool, seasonEndOf(meta.activeLeagues, sellerNow.leagueSlug, date), `d${date.replaceAll("-", "")}`);
        if (r) {
          await service.saveSquadById(saveId, r.squad);
          if (r.signed.length > 0) {
            const ids = new Set(r.signed.map((x) => x.id));
            await service.writeFreeAgents(saveId, pool.filter((f) => !ids.has(f.player.id)));
          }
        }
      }
    }
    const record: StoredTransferRecord = {
      id: randomUUID(), date, playerId: player.id, playerName: player.name,
      playerPosition: player.positions[0] ?? "—", playerAge: player.age,
      fromSquadId: from.id, fromSquadName: from.name, toSquadId: buyer.id, toSquadName: buyer.name,
      fee: d.fee, status: "accepted", reason: "financial",
    };
    await service.appendTransfer(saveId, record);
    const tref: TransferRef = { kind: "transfer_ref", transferId: record.id };
    await service.appendDayEvent(saveId, date, tref);
    moves.push({ playerId: player.id, from: from.id, to: buyer.id, fee: d.fee, kind: "transfer", date });
    if (ownClub) news.push({ date, kind: "deferred_joined", playerId: player.id, playerName: player.name, clubName: from.name, fee: d.fee });
  }
  const latest = (await service.getMarket(saveId, seatId)) ?? market;
  const doneIds = new Set(due.map((d) => d.playerId));
  await service.saveMarket(saveId, { ...latest, deferredTransfers: (latest.deferredTransfers ?? []).filter((d) => !doneIds.has(d.playerId)) }, seatId);
  return { news, moves };
}
