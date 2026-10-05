/**
 * I/O of Etapa 21 (`.claude/rules/game/negotiation.md`): loans starting and ending, sell-on
 * clauses paid on a sale, and the human club accepting an AI bid. The rules live in
 * `src/Domain/negotiation/`; this module reads and writes squads, the market and the ledger.
 */
import { randomUUID } from "crypto";
import type { SaveMeta, SaveService } from "@/backend/SaveService";
import { executeTransferFee, paySellOnReceiver } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import { seasonLabel } from "@/Domain/history/history";
import { sellOnOwed } from "@/Domain/negotiation/negotiation";
import { dueLoans, squadsAfterLoanEnd, squadsAfterLoanStart } from "@/Domain/negotiation/loans";
import { squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import { aiRenewalYears, contractEndFor, defaultSeasonEnd, renewalContract } from "@/Domain/contracts/contracts";
import { currentWage, wageFactorOf } from "@/Domain/finance/wages";
import { applyTransferSale, isIdol } from "@/Domain/boardFans/boardFans";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { PlayerLoan, RosterPlayer, Squad } from "@/types/playerTypes";
import type { ActiveLoan, MarketBid, MarketState } from "@/types/transferMarketTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { TransferInboxMessage } from "@/types/inboxTypes";

type NewsArgs = {
  date: string;
  kind: TransferInboxMessage["kind"];
  playerId: string;
  playerName: string;
  clubName: string;
  fee?: number;
};

/** League + season label of a squad's league, for history rows. */
export function historyFromOf(
  activeLeagues: LeagueSeasonState[] | undefined, leagueSlug: string | undefined,
): { league: string; season: string } | null {
  const l = (activeLeagues ?? []).find((x) => x.leagueSlug === leagueSlug);
  return l ? { league: l.leagueSlug, season: seasonLabel(l.year, l.start, l.end) } : null;
}

/** End of a squad's league season (contract and loan dates). */
export function seasonEndOf(activeLeagues: LeagueSeasonState[] | undefined, leagueSlug: string | undefined, date: string): string {
  return (activeLeagues ?? []).find((l) => l.leagueSlug === leagueSlug)?.end ?? defaultSeasonEnd(date);
}

/** An empty market file (only the human-facing lists are used before the first tick). */
export function emptyMarket(): MarketState {
  return { shuffledTeamIds: [], rotationIndex: 0, profiles: {}, playerSellList: [] };
}

/** The human's lists without `playerId` (sold / loaned / gone). */
export function marketWithoutPlayer(market: MarketState, playerId: string): MarketState {
  return {
    ...market,
    playerSellList: (market.playerSellList ?? []).filter((c) => c.playerId !== playerId),
    playerLoanList: (market.playerLoanList ?? []).filter((id) => id !== playerId),
    pendingBids: (market.pendingBids ?? []).filter((b) => b.playerId !== playerId),
  };
}

/** Takes a player who left the human club out of its saved lineup (the slot stays, empty). */
export async function dropFromLineup(service: SaveService, saveId: string, playerId: string): Promise<void> {
  const tac = await service.getTactics(saveId);
  if (tac && tac.lineup.includes(playerId)) {
    await service.saveTactics(saveId, { ...tac, lineup: tac.lineup.map((id) => (id === playerId ? "" : id)) });
  }
}

/**
 * Starts a loan: the player moves to `borrower` with `loan`, a loan fee (if any) goes from the
 * borrower to the parent, and the loan is recorded in `market.loans`. Returns the updated market
 * (the caller saves it).
 */
export async function startLoan(
  service: SaveService,
  saveId: string,
  meta: SaveMeta,
  market: MarketState,
  args: { player: RosterPlayer; parent: Squad; borrower: Squad; wageShare: number; until: string; fee: number },
): Promise<MarketState> {
  const { player, parent, borrower } = args;
  const date = meta.currentDate ?? "";
  const parentRef = await service.resolveSquadId(saveId, parent.id);
  const borrowerRef = await service.resolveSquadId(saveId, borrower.id);
  if (!parentRef || !borrowerRef) throw new Error(`startLoan: squads ${parent.id}/${borrower.id} not found`);
  // Never past the contract (it stays the parent's).
  const until = player.contract?.until && player.contract.until < args.until ? player.contract.until : args.until;
  const loan: PlayerLoan = { fromClubId: parent.id, fromClubName: parent.name, until, wageShare: args.wageShare };
  const moved = squadsAfterLoanStart(player, parent, borrower, loan, historyFromOf(meta.activeLeagues, parentRef.leagueSlug));
  await executeTransferFee(
    saveId, meta,
    { squad: moved.borrower, ...borrowerRef, isPlayerClub: borrower.id === meta.clubId },
    { squad: moved.parent, ...parentRef, isPlayerClub: parent.id === meta.clubId },
    args.fee, service, { loan: true, playerName: player.name, playerId: player.id },
  );
  const record: ActiveLoan = {
    playerId: player.id, playerName: player.name,
    fromClubId: parent.id, fromClubName: parent.name, toClubId: borrower.id, toClubName: borrower.name,
    until, wageShare: args.wageShare, wage: currentWage(player, wageFactorOf(parent)), fee: args.fee, start: date,
  };
  if (parent.id === meta.clubId) await dropFromLineup(service, saveId, player.id);
  return { ...marketWithoutPlayer(market, player.id), loans: [...(market.loans ?? []).filter((l) => l.playerId !== player.id), record] };
}

/**
 * Ends every loan due on `date` (`graceDays` ahead at a rollover; `onlyBorrowers` limits it to
 * loans held by those squads): the player goes back to his parent club. Returns the market without
 * those loans and the human club's news (the caller emits it, after any `clearInbox`).
 */
export async function returnDueLoans(
  service: SaveService,
  saveId: string,
  meta: SaveMeta,
  market: MarketState,
  date: string,
  opts: { graceDays?: number; onlyBorrowers?: ReadonlySet<string> } = {},
): Promise<{ market: MarketState; news: NewsArgs[] }> {
  const due = dueLoans(market.loans, date, opts.graceDays ?? 0)
    .filter((l) => !opts.onlyBorrowers || opts.onlyBorrowers.has(l.toClubId));
  if (due.length === 0) return { market, news: [] };
  const news: NewsArgs[] = [];
  const ended = new Set<string>();
  for (const l of due) {
    ended.add(l.playerId);
    const borrower = await service.getSquadById(saveId, l.toClubId);
    const parent = await service.getSquadById(saveId, l.fromClubId);
    const player = borrower?.players.find((p) => p.id === l.playerId && p.loan);
    if (!borrower || !parent || !player) continue; // retired, released or gone: nothing to move back
    const back = squadsAfterLoanEnd(player, borrower, parent, historyFromOf(meta.activeLeagues, borrower.leagueSlug));
    await service.saveSquadById(saveId, back.borrower);
    await service.saveSquadById(saveId, back.parent);
    if (l.toClubId === meta.clubId) {
      await dropFromLineup(service, saveId, l.playerId);
      news.push({ date, kind: "loan_back", playerId: l.playerId, playerName: l.playerName, clubName: l.fromClubName });
    } else if (l.fromClubId === meta.clubId) {
      news.push({ date, kind: "loan_home", playerId: l.playerId, playerName: l.playerName, clubName: l.toClubName });
    }
  }
  return { market: { ...market, loans: (market.loans ?? []).filter((l) => !ended.has(l.playerId)) }, news };
}

/**
 * Settles a sell-on clause owed on a sale for `fee`: returns the amount to pass to
 * `executeTransferFee` (the seller keeps the rest), and after the squads are saved pays the
 * receiver. Returns the human club's news when it was the receiver.
 */
export function sellOnFor(player: RosterPlayer, sellerId: string, fee: number) {
  return sellOnOwed(player, sellerId, fee);
}

export async function settleSellOn(
  service: SaveService,
  saveId: string,
  meta: SaveMeta,
  owed: ReturnType<typeof sellOnOwed>,
  player: RosterPlayer,
  sellerName: string,
  date: string,
): Promise<NewsArgs | null> {
  if (!owed) return null;
  await paySellOnReceiver(service, saveId, meta, owed.clubId, owed.amount, {
    playerName: player.name, playerId: player.id, fromClubName: sellerName,
  });
  if (owed.clubId !== meta.clubId) return null;
  return { date, kind: "sell_on", playerId: player.id, playerName: player.name, clubName: sellerName, fee: owed.amount };
}

/** Contract an AI club gives a signing: the curve wage at its factor, length by age. */
export function aiContractFor(player: RosterPlayer, buyer: Squad, date: string, seasonEnd: string) {
  const years = aiRenewalYears(player);
  const contract = renewalContract(player, buyer, seasonEnd, years);
  return { ...contract, until: contractEndFor(date, seasonEnd, years) };
}

/**
 * The human club sells a player to an AI club on an accepted bid: player moved (with the human's
 * new sell-on clause if the bid had one), fee exchanged (a clause the player carried paid out of
 * it), club history, board and transfer log. Returns the market (bids and lists cleaned) and the
 * human's sell-on news, if any.
 */
export async function completeHumanSale(
  service: SaveService,
  saveId: string,
  meta: SaveMeta,
  market: MarketState,
  args: { player: RosterPlayer; seller: Squad; buyer: Squad; fee: number; sellOnPct: number },
): Promise<{ market: MarketState; record: TransferRecord; meta: SaveMeta }> {
  const { player, seller, buyer, fee } = args;
  const date = meta.currentDate ?? "";
  const sellerRef = await service.resolveSquadId(saveId, seller.id);
  const buyerRef = await service.resolveSquadId(saveId, buyer.id);
  if (!sellerRef || !buyerRef) throw new Error("completeHumanSale: squad not found");
  const newClause = args.sellOnPct > 0 ? { clubId: seller.id, clubName: seller.name, pct: args.sellOnPct } : null;
  const { selling, buying } = squadsAfterAcceptedTransfer(
    player, seller, buyer, buyer.id, player.id,
    aiContractFor(player, buyer, date, seasonEndOf(meta.activeLeagues, buyerRef.leagueSlug, date)),
    historyFromOf(meta.activeLeagues, sellerRef.leagueSlug),
    newClause,
  );
  const owed = sellOnFor(player, seller.id, fee);
  let nextMeta = await executeTransferFee(
    saveId, meta,
    { squad: buying, ...buyerRef, isPlayerClub: false },
    { squad: selling, ...sellerRef, isPlayerClub: true },
    fee, service,
    { playerName: player.name, playerId: player.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) },
  );
  await settleSellOn(service, saveId, nextMeta, owed, player, seller.name, date);

  const seasonOf = (slug: string) => historyFromOf(meta.activeLeagues, slug)?.season ?? date.slice(0, 4);
  await recordTransferHistory(service, saveId, {
    buyer: buying, seller: selling, playerId: player.id, fee, date,
    buyerSeason: seasonOf(buyerRef.leagueSlug), sellerSeason: seasonOf(sellerRef.leagueSlug),
  });
  if (nextMeta.board) {
    nextMeta = await service.updateMeta(saveId, {
      board: applyTransferSale(nextMeta.board, { fee, annualRevenue: wageRevenueBasisOf(seller), idol: isIdol(player, seller) }),
    });
  }
  await dropFromLineup(service, saveId, player.id);

  const record: TransferRecord = {
    id: randomUUID(), date, playerId: player.id, playerName: player.name,
    playerPosition: player.positions[0] ?? "—", playerAge: player.age,
    fromSquadId: seller.id, fromSquadName: seller.name, toSquadId: buyer.id, toSquadName: buyer.name,
    fee, direction: "out", status: "accepted", reason: "bidAccepted",
  };
  await service.appendTransfer(saveId, record);
  await service.appendDayEvent(saveId, date, { kind: "transfer_ref", transferId: record.id });

  const cleaned = marketWithoutPlayer(market, player.id);
  return {
    market: {
      ...cleaned,
      sellOnHeld: newClause
        ? [...(market.sellOnHeld ?? []), { playerId: player.id, playerName: player.name, pct: newClause.pct, toClubName: buyer.name, date }]
        : market.sellOnHeld,
    },
    record,
    meta: nextMeta,
  };
}

/** The held clause was paid: drop it from the human's receivables. */
export function marketAfterSellOnPaid(market: MarketState, playerId: string): MarketState {
  return { ...market, sellOnHeld: (market.sellOnHeld ?? []).filter((h) => h.playerId !== playerId) };
}

/** A pending bid by id that can still be answered on `date`. */
export function findLiveBid(market: MarketState | null, bidId: string, date: string): MarketBid | null {
  const b = (market?.pendingBids ?? []).find((x) => x.id === bidId);
  return b && b.expires >= date ? b : null;
}
