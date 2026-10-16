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
  | { action: "accept" }
  | { action: "reject" }
  | { action: "withdraw" }
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
