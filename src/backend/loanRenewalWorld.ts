import { contractCoveringLoan } from "@/Domain/negotiation/loans";
import { randomUUID } from "crypto";
import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { executeTransferFee } from "@/backend/FinancialService";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { getSellPriority } from "@/Domain/transfer/sellList";
import { wageFactorOf } from "@/Domain/finance/wages";
import {
  inboundRenewalTerms, liveLoanRenewals, loanRenewalOffer, outboundRenewalWanted, renewalDue, renewedLoan, renewedUntil,
} from "@/Domain/negotiation/loanRenewal";
import type { buildTransferNegotiationMessage } from "@/Domain/inbox/inboxEvents";
import type { Squad } from "@/types/playerTypes";
import type { LoanRenewalOffer, MarketState } from "@/types/transferMarketTypes";

type News = Parameters<typeof buildTransferNegotiationMessage>[0];

/** The inbox news of an offer (deferred by the day, emitted after any `clearInbox`). */
export function loanRenewalNews(o: LoanRenewalOffer): News {
  return {
    date: o.date, kind: o.direction === "in" ? "loan_renewal_in" : "loan_renewal_out", offerId: o.id,
    playerId: o.playerId, playerName: o.playerName, clubName: o.clubName,
    fee: o.fee, wageShare: o.wageShare, until: o.until, expires: o.expires,
  };
}

/**
 * Daily, for one seat (12.29): every loan of its club with an AI club on the other side, LEAD_DAYS before it ends,
 * gets one offer to run one more season when the rules allow (`Domain/negotiation/loanRenewal.ts`). Each loan is
 * looked at once (`renewalOffered`). Returns the market with the new offers and their news; the caller saves it.
 */
export async function offerLoanRenewals(
  service: SaveService,
  saveId: string,
  meta: SeatMeta,
  market: MarketState,
  date: string,
  opts: { humanClubs: ReadonlySet<string>; squadOf?: (id: string) => Squad | undefined },
): Promise<{ market: MarketState; news: News[] }> {
  const clubId = meta.clubId;
  if (!clubId || !market.loans?.length) return { market, news: [] };
  const read = async (id: string) => opts.squadOf?.(id) ?? (await service.getSquadById(saveId, id)) ?? undefined;
  const offers: LoanRenewalOffer[] = [];
  const loans = [];
  for (const loan of market.loans) {
    const inbound = loan.toClubId === clubId;
    const outbound = loan.fromClubId === clubId;
    const other = inbound ? loan.fromClubId : loan.toClubId;
    if ((!inbound && !outbound) || opts.humanClubs.has(other) || !renewalDue(loan, date)) { loans.push(loan); continue; }
    loans.push({ ...loan, renewalOffered: true as const });
    const borrower = await read(loan.toClubId);
    const parent = await read(loan.fromClubId);
    const player = borrower?.players.find((p) => p.id === loan.playerId && p.loan);
    if (!borrower || !parent || !player) continue;
    const until = renewedUntil(loan, player.contract?.until, inbound);
    if (!until) continue;
    if (inbound) {
      const terms = inboundRenewalTerms({
        player, parent, loan, until, starterIds: new Set(autoLineupDefaultFormation(parent)),
        listed: getSellPriority(player.id, market.profiles?.[parent.id]?.sellList ?? []) !== null,
      });
      if (!terms) continue;
      offers.push(loanRenewalOffer({ id: randomUUID(), direction: "in", player, club: parent, date, loanUntil: loan.until, until, ...terms }));
    } else {
      const wanted = outboundRenewalWanted({
        player, borrower, loan, profile: market.profiles?.[borrower.id],
        starterIds: new Set(autoLineupDefaultFormation(borrower)), parentWageFactor: wageFactorOf(parent),
      });
      if (!wanted) continue;
      offers.push(loanRenewalOffer({
        id: randomUUID(), direction: "out", player, club: borrower, date, loanUntil: loan.until, until, wageShare: loan.wageShare, fee: 0,
      }));
    }
  }
  const live = liveLoanRenewals(market.loanRenewals, loans, date);
  const changed = offers.length > 0 || live.length !== (market.loanRenewals ?? []).length
    || loans.some((l, i) => l !== market.loans![i]);
  if (!changed) return { market, news: [] };
  return {
    market: { ...market, loans, loanRenewals: [...live, ...offers] },
    news: offers.map(loanRenewalNews),
  };
}

export type RenewalAnswer = { ok: true; market: MarketState } | { ok: false; error: "offerClosed" | "noMoney" };

/**
 * The human accepts an offer: the loan and the player's loan mark run to `offer.until` with the offer's terms; a loan
 * fee (inbound only) goes from the human club to the parent. Refused when the loan or the player is gone, the other
 * club got a manager, or the human club cannot pay the fee.
 */
export async function acceptLoanRenewal(
  service: SaveService,
  saveId: string,
  seatId: string,
  meta: SeatMeta,
  market: MarketState,
  offer: LoanRenewalOffer,
): Promise<RenewalAnswer> {
  const loan = (market.loans ?? []).find((l) => l.playerId === offer.playerId
    && (offer.direction === "in" ? l.toClubId === meta.clubId && l.fromClubId === offer.clubId : l.fromClubId === meta.clubId && l.toClubId === offer.clubId));
  if (!loan || (await service.humanClubIds(saveId)).has(offer.clubId)) return { ok: false, error: "offerClosed" };
  const borrowerRef = await service.resolveSquadId(saveId, loan.toClubId);
  const parentRef = await service.resolveSquadId(saveId, loan.fromClubId);
  const borrower = await service.getSquadById(saveId, loan.toClubId);
  const parent = await service.getSquadById(saveId, loan.fromClubId);
  const player = borrower?.players.find((p) => p.id === loan.playerId && p.loan);
  if (!borrowerRef || !parentRef || !borrower || !parent || !player?.loan) return { ok: false, error: "offerClosed" };
  if (offer.direction === "in" && offer.fee > (borrower.finances?.budget ?? 0)) return { ok: false, error: "noMoney" };
  const renewed: Squad = {
    ...borrower,
    players: borrower.players.map((p) => (p.id === player.id ? {
      ...p,
      loan: { ...player.loan!, until: offer.until, wageShare: offer.wageShare },
      // The AI parent renews him to cover the new season (report 98afd1e0).
      ...(offer.direction === "in" ? { contract: contractCoveringLoan(p.contract, offer.until) } : {}),
    } : p)),
  };
  if (offer.fee > 0) {
    await executeTransferFee(
      saveId, meta,
      { squad: renewed, ...borrowerRef, ...(renewed.id === meta.clubId ? { seatId } : {}) },
      { squad: parent, ...parentRef, ...(parent.id === meta.clubId ? { seatId } : {}) },
      offer.fee, service, { loan: true, playerName: player.name, playerId: player.id },
    );
  } else {
    await service.saveSquadById(saveId, renewed);
  }
  return {
    ok: true,
    market: {
      ...market,
      // The next season's end may offer again.
      loans: (market.loans ?? []).map((l) => {
        if (l !== loan) return l;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { renewalOffered: _o, ...rest } = renewedLoan(l, offer);
        return rest;
      }),
      loanRenewals: (market.loanRenewals ?? []).filter((o) => o.id !== offer.id),
    },
  };
}
