/**
 * Offers between two human seats (multiplayer part 4, `.claude/rules/game/multiplayer.md`): messages and the
 * socket nudge to each side, closing the offers of a player or of a seat, rechecking the world, completing a
 * transfer or a loan, and the daily expiry. The pure rules live in `src/Domain/seatOffers/`.
 */
import { topIdsOf } from "@/backend/starLimitWorld";
import { breaksStarLimit } from "@/Domain/squad/starLimit";
import { randomUUID } from "crypto";
import type { SaveService } from "@/backend/SaveService";
import { memberBySeat } from "@/backend/auth/saveOwnership";
import { notifyUser } from "@/backend/social/realtime";
import { executeTransferFee } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import {
  dropFromLineup, emptyMarket, historyFromOf, humanRosterSize, seasonEndOf, sellOnFor, settleSellOn, startLoan,
} from "@/backend/negotiationWorld";
import { squadsAfterAcceptedTransfer, squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import { contractEndFor } from "@/Domain/contracts/contracts";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { splitMarket } from "@/Domain/market/seatMarket";
import { buildTransferNegotiationMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { buildClubRecordMessage } from "@/Domain/clubHistory/recordMessage";
import { applyPurchase, applyTransferSale, isIdol } from "@/Domain/boardFans/boardFans";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type { StoredTransferRecord } from "@/types/transferTypes";
import type { SeatOffer, SeatOfferAction, SeatOfferSide } from "@/types/seatOfferTypes";

/** Arguments of one seat-offer message (`buildTransferNegotiationMessage`). */
export type SeatOfferMessageArgs = Parameters<typeof buildTransferNegotiationMessage>[0];

/**
 * Where a message goes instead of the inbox: the day advance collects them and writes them after its
 * `clearInbox`. Without a sink the message is written at once.
 */
export type SeatOfferSink = (seatId: string, args: SeatOfferMessageArgs) => void;

/**
 * Seats to nudge by socket once the unit of work is written: a route or the day that writes through a
 * `BufferingSaveDAL` collects them and calls `nudgeSeats` after its `flush`. Without one the nudge goes at once.
 */
export type SeatNudges = Set<string>;

/** Socket nudge (`seat_offer`) to the user of each seat. */
export function nudgeSeats(saveId: string, seatIds: Iterable<string>): void {
  for (const seatId of seatIds) {
    const m = memberBySeat(saveId, seatId);
    if (m) notifyUser(m.userId, { type: "seat_offer", saveId });
  }
}

/** The message args for one side of the offer, after `action`. */
export function seatOfferMessageArgs(o: SeatOffer, toSide: SeatOfferSide, action: SeatOfferAction, date: string): SeatOfferMessageArgs {
  const other = toSide === "seller" ? o.buyer : o.seller;
  return {
    date, kind: "seat_offer", playerId: o.playerId, playerName: o.playerName, clubName: other.clubName,
    fee: o.terms.fee,
    ...(o.terms.sellOnPct !== undefined ? { sellOnPct: o.terms.sellOnPct } : {}),
    ...(o.terms.wageShare !== undefined ? { wageShare: o.terms.wageShare } : {}),
    ...(o.terms.until !== undefined ? { until: o.terms.until } : {}),
    ...(o.terms.wage !== undefined ? { wage: o.terms.wage } : {}),
    ...(o.terms.years !== undefined ? { years: o.terms.years } : {}),
    expires: o.expires,
    offerId: o.id, offerAction: action, offerKind: o.kind,
    myTurn: o.turn === toSide && (action === "offer" || action === "counter"),
    historyLength: o.history.length,
  };
}

/** Message to one side of the offer (inbox, or `sink`) + a socket nudge to that seat's user. */
export async function tellSeat(
  service: SaveService, saveId: string, o: SeatOffer, toSide: SeatOfferSide, action: SeatOfferAction, date: string,
  sink?: SeatOfferSink, nudges?: SeatNudges,
): Promise<void> {
  const to = toSide === "seller" ? o.seller : o.buyer;
  const args = seatOfferMessageArgs(o, toSide, action, date);
  if (sink) sink(to.seatId, args);
  else await emitInboxMessage(saveId, buildTransferNegotiationMessage(args), service, to.seatId);
  if (nudges) nudges.add(to.seatId);
  else nudgeSeats(saveId, [to.seatId]);
}

/**
 * Closes every open offer for `playerId` except `keepId`, telling both sides. Returns the offers left (the
 * caller writes them).
 */
export async function closeOffersForPlayer(
  service: SaveService, saveId: string, offers: SeatOffer[], playerId: string, date: string, keepId?: string,
  sink?: SeatOfferSink, nudges?: SeatNudges,
): Promise<SeatOffer[]> {
  const left: SeatOffer[] = [];
  for (const o of offers) {
    if (o.playerId !== playerId || o.id === keepId) { left.push(o); continue; }
    await tellSeat(service, saveId, o, "seller", "closed", date, sink, nudges);
    await tellSeat(service, saveId, o, "buyer", "closed", date, sink, nudges);
  }
  return left;
}

/** Closes the offers where `seatId` is a party (club change, sacking, leaving the league); tells the other side. */
export async function closeOffersOfSeat(
  service: SaveService, saveId: string, seatId: string, date: string, sink?: SeatOfferSink, nudges?: SeatNudges,
): Promise<void> {
  const offers = await service.getSeatOffers(saveId);
  const mine = offers.filter((o) => o.seller.seatId === seatId || o.buyer.seatId === seatId);
  if (mine.length === 0) return;
  for (const o of mine) {
    const otherSide: SeatOfferSide = o.seller.seatId === seatId ? "buyer" : "seller";
    await tellSeat(service, saveId, o, otherSide, "closed", date, sink, nudges);
  }
  const gone = new Set(mine.map((o) => o.id));
  await service.writeSeatOffers(saveId, offers.filter((o) => !gone.has(o.id)));
}

export type OfferCheck =
  | { ok: true; seller: Squad; buyer: Squad; player: RosterPlayer }
  | { ok: false; status: number; error: "offerClosed" | "onLoan" | "squadFull" | "squadDepth" | "starLimit" };

/**
 * The world still allows the deal: both clubs are still the seats', the player is at the seller and not on
 * loan there, the buyer is under its cap and the seller keeps its minimums.
 */
export async function checkOfferWorld(
  service: SaveService, saveId: string, o: Pick<SeatOffer, "kind" | "playerId" | "seller" | "buyer">,
): Promise<OfferCheck> {
  const [sellerSeat, buyerSeat] = await Promise.all([service.getSeat(saveId, o.seller.seatId), service.getSeat(saveId, o.buyer.seatId)]);
  if (!sellerSeat || sellerSeat.unemployed || sellerSeat.clubId !== o.seller.clubId) return { ok: false, status: 409, error: "offerClosed" };
  if (!buyerSeat || buyerSeat.unemployed || buyerSeat.clubId !== o.buyer.clubId) return { ok: false, status: 409, error: "offerClosed" };
  const [seller, buyer] = await Promise.all([service.getSquadById(saveId, o.seller.clubId), service.getSquadById(saveId, o.buyer.clubId)]);
  const player = seller?.players.find((p) => p.id === o.playerId);
  if (!seller || !buyer || !player) return { ok: false, status: 409, error: "offerClosed" };
  if (player.loan) return { ok: false, status: 400, error: "onLoan" };
  if ((await humanRosterSize(service, saveId, o.buyer.seatId, buyer)) >= HUMAN_MAX_SQUAD) return { ok: false, status: 409, error: "squadFull" };
  if (squadDepthBlocked(player, seller, false)) return { ok: false, status: 409, error: "squadDepth" };
  if (breaksStarLimit(buyer, player.id, await topIdsOf(saveId))) return { ok: false, status: 409, error: "starLimit" };
  return { ok: true, seller, buyer, player };
}

/** The player leaves the seat's lists and the AI bids for him close (the world part of the market is untouched). */
function withoutPlayer(m: MarketState, playerId: string): MarketState {
  return {
    ...m,
    playerSellList: (m.playerSellList ?? []).filter((x) => x.playerId !== playerId),
    playerLoanList: (m.playerLoanList ?? []).filter((x) => x !== playerId),
    pendingBids: (m.pendingBids ?? []).filter((b) => b.playerId !== playerId),
  };
}

/**
 * An accepted transfer between two seats: the player moves with the contract fixed in the offer (and the
 * seller's new sell-on clause), the fee goes from the buyer's ledger to the seller's (a clause the player
 * carried is paid out of it), club history and records, both boards, the seller's lists and lineup, the
 * transfer log.
 */
export async function completeSeatTransfer(
  service: SaveService, saveId: string, o: SeatOffer, c: Extract<OfferCheck, { ok: true }>, date: string,
): Promise<void> {
  const buyerMeta = await service.getSeatMeta(saveId, o.buyer.seatId);
  const sellerMeta = await service.getSeatMeta(saveId, o.seller.seatId);
  const sellerRef = await service.resolveSquadId(saveId, c.seller.id);
  const buyerRef = await service.resolveSquadId(saveId, c.buyer.id);
  if (!buyerMeta || !sellerMeta || !sellerRef || !buyerRef) throw new Error(`completeSeatTransfer: offer ${o.id} lost a side`);
  const fee = o.terms.fee;
  const pct = o.terms.sellOnPct ?? 0;
  const seasonEnd = seasonEndOf(buyerMeta.activeLeagues, buyerRef.leagueSlug, date);
  const contract = {
    until: contractEndFor(date, seasonEnd, o.terms.years ?? 1),
    wage: o.terms.wage ?? c.player.contract?.wage ?? 0,
  };
  const newClause = pct > 0 ? { clubId: c.seller.id, clubName: c.seller.name, pct } : null;
  // `squadsAfterAcceptedTransfer` writes the seller's partial history row and strips the old club's morale.
  const { selling, buying } = squadsAfterAcceptedTransfer(
    c.player, c.seller, c.buyer, c.buyer.id, c.player.id, contract,
    historyFromOf(buyerMeta.activeLeagues, sellerRef.leagueSlug), newClause,
  );
  const owed = sellOnFor(c.player, c.seller.id, fee);
  await executeTransferFee(
    saveId, buyerMeta,
    { squad: buying, ...buyerRef, seatId: o.buyer.seatId },
    { squad: selling, ...sellerRef, seatId: o.seller.seatId },
    fee, service,
    { playerName: c.player.name, playerId: c.player.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) },
  );
  // A clause the buyer held (buying back) is paid to it and leaves its receivables (`paySellOnReceiver`).
  await settleSellOn(service, saveId, o.seller.seatId, sellerMeta, owed, c.player, c.seller.name, date);
  if (owed && owed.clubId === c.buyer.id) {
    await emitInboxMessage(saveId, buildTransferNegotiationMessage({
      date, kind: "sell_on", playerId: c.player.id, playerName: c.player.name, clubName: c.seller.name, fee: owed.amount,
    }), service, o.buyer.seatId);
  }

  // Club history: both sides are human, each gets its broken records.
  const seasonOf = (slug: string) => historyFromOf(buyerMeta.activeLeagues, slug)?.season ?? date.slice(0, 4);
  const changes = await recordTransferHistory(service, saveId, {
    buyer: buying, seller: selling, playerId: c.player.id, fee, date,
    buyerSeason: seasonOf(buyerRef.leagueSlug), sellerSeason: seasonOf(sellerRef.leagueSlug),
  });
  for (const ch of changes) {
    const seatId = ch.squadId === c.buyer.id ? o.buyer.seatId : ch.squadId === c.seller.id ? o.seller.seatId : null;
    if (!seatId) continue;
    for (const r of ch.broken) await emitInboxMessage(saveId, buildClubRecordMessage(date, r), service, seatId);
  }

  // Boards (`.claude/rules/game/board-fans.md`): a purchase past the balance; a big sale or an idol sold.
  const budgetAfter = (c.buyer.finances?.budget ?? 0) - fee;
  if (buyerMeta.board && budgetAfter < 0) {
    await service.updateSeat(saveId, o.buyer.seatId, { board: applyPurchase(buyerMeta.board, { balanceAfter: budgetAfter }) });
  }
  if (sellerMeta.board) {
    const board = applyTransferSale(sellerMeta.board, { fee, annualRevenue: wageRevenueBasisOf(c.seller), idol: isIdol(c.player, c.seller) });
    await service.updateSeat(saveId, o.seller.seatId, { board });
  }

  // Seller's market (seat part only): lists and AI bids for him close, the new clause is held.
  const sm = withoutPlayer((await service.getMarket(saveId, o.seller.seatId)) ?? emptyMarket(), c.player.id);
  await service.saveSeatMarket(saveId, o.seller.seatId, splitMarket({
    ...sm,
    sellOnHeld: newClause
      ? [...(sm.sellOnHeld ?? []).filter((h) => h.playerId !== c.player.id), { playerId: c.player.id, playerName: c.player.name, pct, toClubName: c.buyer.name, date }]
      : sm.sellOnHeld,
  }).seat);
  await dropFromLineup(service, saveId, o.seller.seatId, c.player.id);

  const record: StoredTransferRecord = {
    id: randomUUID(), date, playerId: c.player.id, playerName: c.player.name,
    playerPosition: c.player.positions[0] ?? "—", playerAge: c.player.age,
    fromSquadId: c.seller.id, fromSquadName: c.seller.name, toSquadId: c.buyer.id, toSquadName: c.buyer.name,
    fee, status: "accepted", reason: "seatOffer",
  };
  await service.appendTransfer(saveId, record);
  await service.appendDayEvent(saveId, date, { kind: "transfer_ref", transferId: record.id });
  await service.appendDayTransfers(saveId, date, [{ playerId: c.player.id, from: c.seller.id, to: c.buyer.id, fee, kind: "transfer", date }]);
}

/**
 * An accepted loan between two seats. `startLoan` (from the buyer's seat) moves the player, exchanges the
 * loan fee in both ledgers, writes the loan in both markets and cleans the lender's lists and lineup.
 */
export async function completeSeatLoan(
  service: SaveService, saveId: string, o: SeatOffer, c: Extract<OfferCheck, { ok: true }>, date: string,
): Promise<void> {
  const buyerMeta = await service.getSeatMeta(saveId, o.buyer.seatId);
  if (!buyerMeta) throw new Error(`completeSeatLoan: offer ${o.id} lost its buyer`);
  const market = (await service.getMarket(saveId, o.buyer.seatId)) ?? emptyMarket();
  const next = await startLoan(service, saveId, o.buyer.seatId, { ...buyerMeta, currentDate: date }, market, {
    player: c.player, parent: c.seller, borrower: c.buyer, wageShare: o.terms.wageShare ?? 1,
    until: o.terms.until ?? seasonEndOf(buyerMeta.activeLeagues, buyerMeta.leagueSlug, date), fee: o.terms.fee,
  });
  await service.saveMarket(saveId, next, o.buyer.seatId);
  await service.appendDayTransfers(saveId, date, [{ playerId: c.player.id, from: c.seller.id, to: c.buyer.id, fee: o.terms.fee, kind: "loan", date }]);
}

/**
 * Daily: drops the expired offers (past their day, or the buyer's window closed) and the ones the world no
 * longer allows; tells both sides. A full squad or the seller's minimums only block the accept: those stay.
 */
export async function expireSeatOffers(
  service: SaveService, saveId: string, date: string, buyerWindowOpen: (seatId: string) => boolean, sink?: SeatOfferSink,
  nudges?: SeatNudges,
): Promise<void> {
  const offers = await service.getSeatOffers(saveId);
  if (offers.length === 0) return;
  const left: SeatOffer[] = [];
  for (const o of offers) {
    const expired = o.expires < date || !buyerWindowOpen(o.buyer.seatId);
    if (!expired) {
      const world = await checkOfferWorld(service, saveId, o);
      if (world.ok || world.error === "squadFull" || world.error === "squadDepth" || world.error === "starLimit") { left.push(o); continue; }
    }
    const action: SeatOfferAction = expired ? "expired" : "closed";
    await tellSeat(service, saveId, o, "seller", action, date, sink, nudges);
    await tellSeat(service, saveId, o, "buyer", action, date, sink, nudges);
  }
  if (left.length !== offers.length) await service.writeSeatOffers(saveId, left);
}
