import { addDays } from "@/Domain/dates";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MarketBid, NegotiationRound, NegotiationTalk } from "@/types/transferMarketTypes";
import {
  feeForSaleScore,
  saleContext,
  saleDecisionScore,
  squadDepthBlocked,
  type TransferAcceptReason,
  type TransferRejectReason,
} from "@/Domain/transfer/transferAcceptance";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";

/** Valid sell-on percentage (0, 10, 20 or 30), else null. */
export function parseSellOnPct(raw: unknown): number | null {
  if (raw === undefined || raw === null) return 0;
  return typeof raw === "number" && (NEGOTIATION.SELL_ON_PCTS as readonly number[]).includes(raw) ? raw : null;
}

/** What a sell-on clause of `pct`% is worth to the selling club, as a share of the fee. */
export function sellOnValueFraction(pct: number, age: number): number {
  const per10 = age <= NEGOTIATION.YOUNG_AGE ? NEGOTIATION.SELL_ON_VALUE_PER_10_YOUNG : NEGOTIATION.SELL_ON_VALUE_PER_10;
  return (Math.max(0, pct) / 10) * per10;
}

/** Rounds a fee up: €0,1M steps below €10M, €1M steps from there. */
export function roundFeeUp(fee: number): number {
  const step = fee < 10_000_000 ? 100_000 : 1_000_000;
  return Math.ceil(fee / step - 1e-9) * step;
}

/** Rounds a fee down (the most a club pays). */
export function roundFeeDown(fee: number): number {
  const step = fee < 10_000_000 ? 100_000 : 1_000_000;
  return Math.max(0, Math.floor(fee / step + 1e-9) * step);
}

export type OfferResponse =
  | { kind: "accept"; reason: TransferAcceptReason }
  | { kind: "counter"; counterFee: number }
  | { kind: "reject"; reason: TransferRejectReason | "insulted" };

/**
 * The AI seller's answer to a bid (`docs/superpowers/specs/2026-10-04-negotiation-loans-design.md` §1):
 * accept at decision score ≥ 0,8; counter with the smallest fee that reaches it when the score is
 * 0,45..0,8 (or the player is a star); refuse below, or on the squad-depth rules. A sell-on clause
 * given to the seller makes the fee worth `1 + sellOnValueFraction` to it.
 */
export function respondToOffer(args: {
  player: RosterPlayer;
  seller: Squad;
  fee: number;
  sellOnPct?: number;
  sellPriority?: number;
}): OfferResponse {
  const { player, seller, fee } = args;
  if (squadDepthBlocked(player, seller, false)) return { kind: "reject", reason: "squadDepth" };
  const ctx = saleContext(player, seller, args.sellPriority);
  const mult = 1 + sellOnValueFraction(args.sellOnPct ?? 0, player.age);
  const effective = fee * mult;
  if (effective < ctx.value * NEGOTIATION.LOWBALL_RATIO) return { kind: "reject", reason: "insulted" };

  const score = saleDecisionScore(ctx, effective);
  const star = ctx.relativeStrength > NEGOTIATION.STAR_GAP;
  const starFloor = star ? ctx.value * NEGOTIATION.STAR_MIN_OFFER : 0;
  if (score >= NEGOTIATION.ACCEPT_SCORE && effective >= starFloor) {
    const offerScore = effective / ctx.value;
    return { kind: "accept", reason: offerScore >= 1.2 ? "strongOffer" : ctx.priorityBonus > 0 ? "willingToSell" : "financial" };
  }
  if (score >= NEGOTIATION.COUNTER_MIN_SCORE || star) {
    const needed = Math.max(feeForSaleScore(ctx, NEGOTIATION.ACCEPT_SCORE), starFloor) / mult;
    return { kind: "counter", counterFee: Math.max(roundFeeUp(fee), roundFeeUp(needed)) };
  }
  return { kind: "reject", reason: effective / ctx.value < 0.8 ? "offerTooLow" : "clubRejected" };
}

// ── Talks (patience) ──────────────────────────────────────────────────────────

export function talkKey(kind: "transfer" | "loan", playerId: string): string {
  return `${kind}:${playerId}`;
}

export type TalkGate = "ok" | "closed" | "noRounds";

/**
 * Can the human make another offer today? `closed` while the talks are off after a lowball,
 * `noRounds` once the day's rounds are spent. Matching the club's counter of the day is always
 * allowed (`meetsCounter`).
 */
export function talkGate(talk: NegotiationTalk | undefined, date: string, meetsCounter = false): TalkGate {
  if (!talk) return "ok";
  if (talk.closedUntil && date <= talk.closedUntil) return "closed";
  if (talk.date !== date) return "ok";
  if (meetsCounter) return "ok";
  return talk.rounds >= NEGOTIATION.ROUNDS_PER_DAY ? "noRounds" : "ok";
}

/** Counter of the club that is still valid today, if any. */
export function activeCounter(talk: NegotiationTalk | undefined, date: string): NegotiationTalk["counter"] | undefined {
  return talk && talk.date === date ? talk.counter : undefined;
}

/** Records one round (the human's offer + the club's answer). Rounds reset on a new day. */
export function recordRound(
  talk: NegotiationTalk | undefined,
  init: { playerId: string; kind: "transfer" | "loan"; date: string },
  offer: Omit<NegotiationRound, "by" | "outcome">,
  answer: NegotiationRound,
): NegotiationTalk {
  const sameDay = talk?.date === init.date;
  const base: NegotiationTalk = talk && sameDay
    ? talk
    : { playerId: init.playerId, kind: init.kind, date: init.date, rounds: 0, history: [], ...(talk?.closedUntil ? { closedUntil: talk.closedUntil } : {}) };
  const history = [...base.history, { by: "you" as const, ...offer, outcome: "offer" as const }, answer].slice(-12);
  const counter = answer.outcome === "counter"
    ? { fee: answer.fee ?? 0, ...(answer.sellOnPct !== undefined ? { sellOnPct: answer.sellOnPct } : {}), ...(answer.wageShare !== undefined ? { wageShare: answer.wageShare } : {}) }
    : undefined;
  return {
    ...base,
    rounds: base.rounds + 1,
    history,
    counter,
    ...(answer.outcome === "insulted" ? { closedUntil: addDays(init.date, NEGOTIATION.LOWBALL_BAN_DAYS) } : {}),
  };
}

/** Drops talks of past days that carry no ban (keeps the market file small). */
export function pruneTalks(talks: Record<string, NegotiationTalk> | undefined, date: string): Record<string, NegotiationTalk> {
  const out: Record<string, NegotiationTalk> = {};
  for (const [k, t] of Object.entries(talks ?? {})) {
    if (t.date === date || (t.closedUntil && t.closedUntil >= date)) out[k] = t;
  }
  return out;
}

// ── Human answers an AI bid ───────────────────────────────────────────────────

export type BidCounterResponse =
  | { kind: "accept"; fee: number; sellOnPct: number }
  | { kind: "counter"; bid: MarketBid }
  | { kind: "closed" };

/**
 * The human counters an AI transfer bid with `fee` (and optionally asks for a sell-on clause).
 * The club accepts up to its maximum (lower when it gives a clause); above it, it answers once with
 * its maximum, and a second counter above it ends the talks (`closed`).
 */
export function respondToHumanCounter(bid: MarketBid, fee: number, sellOnPct: number, age: number): BidCounterResponse {
  const base = bid.maxFee ?? bid.fee;
  const max = roundFeeDown(base / (1 + sellOnValueFraction(sellOnPct, age)));
  if (fee <= max) return { kind: "accept", fee, sellOnPct };
  if (bid.countered) return { kind: "closed" };
  return { kind: "counter", bid: { ...bid, fee: max, sellOnPct, countered: true } };
}

/** Share of a fee owed under a sell-on clause. */
export function sellOnShare(fee: number, pct: number): number {
  return Math.round((fee * Math.max(0, pct)) / 100);
}

/**
 * What the seller owes under the player's sell-on clause on a sale for `fee`, or null (no clause,
 * or the clause is the seller's own).
 */
export function sellOnOwed(
  player: RosterPlayer,
  sellerId: string,
  fee: number,
): { clubId: string; clubName: string; pct: number; amount: number } | null {
  const c = player.sellOn;
  if (!c || c.clubId === sellerId || fee <= 0) return null;
  const amount = sellOnShare(fee, c.pct);
  return amount > 0 ? { clubId: c.clubId, clubName: c.clubName, pct: c.pct, amount } : null;
}
