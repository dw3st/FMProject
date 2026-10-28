/**
 * I/O of Etapa 21 (`.claude/rules/game/negotiation.md`): loans starting and ending, sell-on
 * clauses paid on a sale, and the human club accepting an AI bid. The rules live in
 * `src/Domain/negotiation/`; this module reads and writes squads, the market and the ledger.
 */
import { randomUUID } from "crypto";
import { rememberPlayers } from "@/backend/scoutingWorld";
import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { executeTransferFee, paySellOnReceiver } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import { seasonLabel } from "@/Domain/history/history";
import { sellOnOwed } from "@/Domain/negotiation/negotiation";
import { dueLoans, outgoingLoanCount, squadsAfterLoanEnd, squadsAfterLoanStart } from "@/Domain/negotiation/loans";
import { isExpired } from "@/Domain/contracts/contracts";
import { MAX_SQUAD, MIN_BY_ROLE, refillSquad, roleOf, toFreeAgent, trimSquadToCap } from "@/Domain/contracts/freeAgents";
import { overallAvg } from "@/Domain/playerRating";
import type { FreeAgent } from "@/types/playerTypes";
import { squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import { aiRenewalYears, contractEndFor, defaultSeasonEnd, renewalContract } from "@/Domain/contracts/contracts";
import { currentWage, wageFactorOf } from "@/Domain/finance/wages";
import { applyTransferSale, isIdol } from "@/Domain/boardFans/boardFans";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { PlayerLoan, RosterPlayer, Squad } from "@/types/playerTypes";
import type { ActiveLoan, MarketBid, MarketState } from "@/types/transferMarketTypes";
import type { StoredTransferRecord, TransferRecord } from "@/types/transferTypes";
import { withDirection } from "@/Domain/transfer/transferView";
import { splitMarket } from "@/Domain/market/seatMarket";
import type { TransferInboxMessage } from "@/types/inboxTypes";
import { withFormerClub } from "@/Domain/transfer/formerClub";

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

/**
 * True when `clubId` is another seat's club (`.claude/rules/game/multiplayer.md`): its players are not for the
 * AI rule to sell, lend or let go on a pre-contract — human × human deals are part 4.
 */
export async function isOtherSeatClub(service: SaveService, saveId: string, clubId: string, ownClubId: string): Promise<boolean> {
  return clubId !== ownClubId && (await service.humanClubIds(saveId)).has(clubId);
}

/** An empty market file (only the human-facing lists are used before the first tick). */
export function emptyMarket(): MarketState {
  return { shuffledTeamIds: [], rotationIndex: 0, profiles: {}, playerSellList: [] };
}

/** The human's lists without `playerId` (sold / loaned / gone). */
function marketWithoutPlayer(market: MarketState, playerId: string): MarketState {
  return {
    ...market,
    playerSellList: (market.playerSellList ?? []).filter((c) => c.playerId !== playerId),
    playerLoanList: (market.playerLoanList ?? []).filter((id) => id !== playerId),
    pendingBids: (market.pendingBids ?? []).filter((b) => b.playerId !== playerId),
  };
}

/**
 * Takes a player who left the human club out of its saved lineup (the slot stays, empty). The
 * manager keeps knowing him fully (`.claude/rules/game/scouting.md`, decaying as usual).
 */
export async function dropFromLineup(service: SaveService, saveId: string, seatId: string, playerId: string): Promise<void> {
  const tac = await service.getTactics(saveId, seatId);
  if (tac && tac.lineup.includes(playerId)) {
    await service.saveTactics(saveId, { ...tac, lineup: tac.lineup.map((id) => (id === playerId ? "" : id)) }, seatId);
  }
  const date = (await service.getMeta(saveId))?.currentDate;
  if (date) await rememberPlayers(service, saveId, seatId, [playerId], date);
}

/**
 * Starts a loan: the player moves to `borrower` with `loan`, a loan fee (if any) goes from the
 * borrower to the parent, and the loan is recorded in `market.loans`. Returns the updated market
 * (the caller saves it).
 */
export async function startLoan(
  service: SaveService,
  saveId: string,
  seatId: string,
  meta: SeatMeta,
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
  // Each side's seat (`.claude/rules/game/multiplayer.md`): the caller's own club, another seat's club, or the AI.
  const seatOfSide = async (clubId: string) => (clubId === meta.clubId ? seatId : await service.seatOfClub(saveId, clubId));
  const parentSeat = await seatOfSide(parent.id);
  const borrowerSeat = await seatOfSide(borrower.id);
  await executeTransferFee(
    saveId, meta,
    { squad: moved.borrower, ...borrowerRef, ...(borrowerSeat ? { seatId: borrowerSeat } : {}) },
    { squad: moved.parent, ...parentRef, ...(parentSeat ? { seatId: parentSeat } : {}) },
    args.fee, service, { loan: true, playerName: player.name, playerId: player.id },
  );
  const record: ActiveLoan = {
    playerId: player.id, playerName: player.name,
    fromClubId: parent.id, fromClubName: parent.name, toClubId: borrower.id, toClubName: borrower.name,
    until, wageShare: args.wageShare, wage: currentWage(player, wageFactorOf(parent)), fee: args.fee, start: date,
  };
  if (parent.id === meta.clubId) await dropFromLineup(service, saveId, seatId, player.id);
  // The other side is another seat: the loan goes in its market too (wages line, return, screens). Only the
  // seat part is written, so the world's AI rotation is not rewritten from a stale copy.
  const otherSeat = parent.id === meta.clubId ? borrowerSeat : parentSeat;
  if (otherSeat && otherSeat !== seatId) {
    const other = (await service.getMarket(saveId, otherSeat)) ?? emptyMarket();
    const next: MarketState = {
      ...marketWithoutPlayer(other, player.id),
      loans: [...(other.loans ?? []).filter((l) => l.playerId !== player.id), record],
    };
    await service.saveSeatMarket(saveId, otherSeat, splitMarket(next).seat);
    if (parentSeat === otherSeat) await dropFromLineup(service, saveId, otherSeat, player.id);
  }
  return { ...marketWithoutPlayer(market, player.id), loans: [...(market.loans ?? []).filter((l) => l.playerId !== player.id), record] };
}

/**
 * Ends every loan due on `date` (`graceDays` ahead at a rollover; `onlyBorrowers` limits it to
 * loans held by those squads). `parentUnit` + `contractGraceDays` (rollover): a loan whose PARENT is
 * rolling also ends when the player's contract ends within the grace window, so the contract expiry
 * sees him at his club. The player goes back to his parent club; an AI parent above 30 releases its
 * worst player, and a borrower left below a role minimum is refilled (`refillSquad`). Returns the
 * market without those loans and the human club's news (the caller emits it, after any `clearInbox`).
 */
export async function returnDueLoans(
  service: SaveService,
  saveId: string,
  seatId: string,
  meta: SeatMeta,
  market: MarketState,
  date: string,
  opts: {
    graceDays?: number;
    onlyBorrowers?: ReadonlySet<string>;
    parentUnit?: ReadonlySet<string>;
    contractGraceDays?: number;
    /** Every seat's club (`service.humanClubIds`); read here when absent. */
    humanClubs?: ReadonlySet<string>;
  } = {},
): Promise<{ market: MarketState; news: NewsArgs[] }> {
  const dueIds = new Set(dueLoans(market.loans, date, opts.graceDays ?? 0)
    .filter((l) => !opts.onlyBorrowers || opts.onlyBorrowers.has(l.toClubId))
    .map((l) => l.playerId));
  if (opts.parentUnit) {
    for (const l of market.loans ?? []) {
      if (dueIds.has(l.playerId) || !opts.parentUnit.has(l.fromClubId)) continue;
      const holder = await service.getSquadById(saveId, l.toClubId);
      const p = holder?.players.find((x) => x.id === l.playerId);
      if (!p || isExpired(p.contract, date, opts.contractGraceDays ?? 0)) dueIds.add(l.playerId);
    }
  }
  const due = (market.loans ?? []).filter((l) => dueIds.has(l.playerId));
  if (due.length === 0) return { market, news: [] };
  const humans = opts.humanClubs ?? (await service.humanClubIds(saveId));
  const news: NewsArgs[] = [];
  const ended = new Set<string>();
  let pool: FreeAgent[] | null = null;
  for (const l of due) {
    ended.add(l.playerId);
    const borrower = await service.getSquadById(saveId, l.toClubId);
    const parent = await service.getSquadById(saveId, l.fromClubId);
    const player = borrower?.players.find((p) => p.id === l.playerId && p.loan);
    if (!borrower || !parent || !player) {
      // Retired, released or gone: nothing to move back. A loan with another seat may already be back (that
      // seat's loop ran first): this seat still gets its news.
      const home = parent?.players.find((p) => p.id === l.playerId && !p.loan);
      if (home && parent && (parent.id === meta.clubId || l.toClubId === meta.clubId)) {
        if (parent.id === meta.clubId) {
          news.push({ date, kind: "loan_home", playerId: l.playerId, playerName: l.playerName, clubName: l.toClubName });
        } else {
          await dropFromLineup(service, saveId, seatId, l.playerId);
          news.push({ date, kind: "loan_back", playerId: l.playerId, playerName: l.playerName, clubName: l.fromClubName });
        }
      }
      continue;
    }
    const back = squadsAfterLoanEnd(player, borrower, parent, historyFromOf(meta.activeLeagues, borrower.leagueSlug));
    let borrowerAfter = back.borrower;
    let parentAfter = back.parent;
    const ownParent = parent.id === meta.clubId;
    const ownBorrower = borrower.id === meta.clubId;
    const humanParent = humans.has(parent.id) || ownParent;
    const humanBorrower = humans.has(borrower.id) || ownBorrower;
    // AI parent above the cap: the worst player (never the one coming back) goes to the free pool.
    if (!humanParent && parentAfter.players.length > MAX_SQUAD) {
      pool ??= await service.getFreeAgents(saveId);
      const extra = [...parentAfter.players].filter((p) => p.id !== player.id && !p.loan)
        .sort((x, y) => overallAvg(x) - overallAvg(y))
        .slice(0, parentAfter.players.length - MAX_SQUAD);
      const gone = new Set(extra.map((p) => p.id));
      parentAfter = { ...parentAfter, players: parentAfter.players.filter((p) => !gone.has(p.id)) };
      pool = [...pool, ...extra.map((p) => toFreeAgent(p, date))];
    }
    // The borrower keeps its role minimums (the same refill as the rollover; the human only gets youth).
    const role = roleOf(player);
    if (borrowerAfter.players.filter((p) => roleOf(p) === role).length < MIN_BY_ROLE[role]) {
      pool ??= await service.getFreeAgents(saveId);
      const r = refillSquad({
        squad: borrowerAfter, pool, isHuman: humanBorrower, tagPrefix: `loan${date.replace(/-/g, "")}`,
        nextSeasonEnd: seasonEndOf(meta.activeLeagues, borrower.leagueSlug, date),
      });
      const signed = new Set(r.signed.map((p) => p.id));
      pool = pool.filter((f) => !signed.has(f.player.id));
      // The refill may take an AI borrower past 30 for a role minimum: its weakest surplus leaves.
      const trimmed = humanBorrower ? { squad: r.squad, released: [] } : trimSquadToCap(r.squad);
      borrowerAfter = trimmed.squad;
      pool = [...pool, ...trimmed.released.map((p) => toFreeAgent(p, date))];
    }
    await service.saveSquadById(saveId, borrowerAfter);
    await service.saveSquadById(saveId, parentAfter);
    if (ownBorrower) {
      await dropFromLineup(service, saveId, seatId, l.playerId);
      news.push({ date, kind: "loan_back", playerId: l.playerId, playerName: l.playerName, clubName: l.fromClubName });
    } else if (ownParent) {
      news.push({ date, kind: "loan_home", playerId: l.playerId, playerName: l.playerName, clubName: l.toClubName });
    }
  }
  if (pool) await service.writeFreeAgents(saveId, pool);
  return { market: { ...market, loans: (market.loans ?? []).filter((l) => !ended.has(l.playerId)) }, news };
}

/** Squad size for the human club's 30-player cap: its players plus those out on loan. */
export async function humanRosterSize(service: SaveService, saveId: string, seatId: string, squad: Squad): Promise<number> {
  return squad.players.length + outgoingLoanCount((await service.getMarket(saveId, seatId))?.loans, squad.id);
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
  seatId: string,
  meta: SeatMeta,
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
function aiContractFor(player: RosterPlayer, buyer: Squad, date: string, seasonEnd: string) {
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
  seatId: string,
  meta: SeatMeta,
  market: MarketState,
  args: { player: RosterPlayer; seller: Squad; buyer: Squad; fee: number; sellOnPct: number },
): Promise<{ market: MarketState; record: TransferRecord; meta: SeatMeta }> {
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
  // The buyer will not sell him back to this club for a while (`Domain/transfer/formerClub.ts`).
  buying.players = buying.players.map((p) => (p.id === player.id ? withFormerClub(p, seller.id, date) : p));
  const owed = sellOnFor(player, seller.id, fee);
  let nextMeta = await executeTransferFee(
    saveId, meta,
    { squad: buying, ...buyerRef },
    { squad: selling, ...sellerRef, seatId },
    fee, service,
    { playerName: player.name, playerId: player.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) },
  );
  await settleSellOn(service, saveId, seatId, nextMeta, owed, player, seller.name, date);

  const seasonOf = (slug: string) => historyFromOf(meta.activeLeagues, slug)?.season ?? date.slice(0, 4);
  await recordTransferHistory(service, saveId, {
    buyer: buying, seller: selling, playerId: player.id, fee, date,
    buyerSeason: seasonOf(buyerRef.leagueSlug), sellerSeason: seasonOf(sellerRef.leagueSlug),
  });
  if (nextMeta.board) {
    const board = applyTransferSale(nextMeta.board, { fee, annualRevenue: wageRevenueBasisOf(seller), idol: isIdol(player, seller) });
    await service.updateSeat(saveId, seatId, { board });
    nextMeta = { ...nextMeta, board };
  }
  await dropFromLineup(service, saveId, seatId, player.id);

  const record: StoredTransferRecord = {
    id: randomUUID(), date, playerId: player.id, playerName: player.name,
    playerPosition: player.positions[0] ?? "—", playerAge: player.age,
    fromSquadId: seller.id, fromSquadName: seller.name, toSquadId: buyer.id, toSquadName: buyer.name,
    fee, status: "accepted", reason: "bidAccepted",
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
    record: withDirection(record, seller.id),
    meta: nextMeta,
  };
}

/** Players retired or released free: their clauses can never be paid, so they leave the receivables. */
export async function pruneSellOnHeld(service: SaveService, saveId: string, seatId: string, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;
  const market = await service.getMarket(saveId, seatId);
  if (!market?.sellOnHeld?.length) return;
  const gone = new Set(playerIds);
  if (!market.sellOnHeld.some((h) => gone.has(h.playerId))) return;
  await service.saveMarket(saveId, { ...market, sellOnHeld: market.sellOnHeld.filter((h) => !gone.has(h.playerId)) }, seatId);
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
