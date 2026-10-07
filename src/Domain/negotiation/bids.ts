import { addDays } from "@/Domain/dates";
import { Player } from "@/Domain/Player";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { aiClubFinance, aiTransferBudgetOf, passesWageGate, transferBudgetTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { currentWage, wageFactorOf } from "@/Domain/finance/wages";
import { playerMatchesBand, playerOverallRating, priceCapForTier, teamAvgRating } from "@/Domain/transfer/transferNeeds";
import { buildAiLoanBid } from "@/Domain/negotiation/loans";
import { feeForSaleScore, saleContext, squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";

/** Score at which a seller accepts (`evaluateTransferOffer`). */
const ACCEPT_SCORE = 0.8;
import { roundFeeDown, sellOnValueFraction } from "@/Domain/negotiation/negotiation";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { refusesSmallerClub, tierStepsDown } from "@/Domain/personality/personality";
import { askingBandExtra, askingFreqMult, askingOpening, askingRatio, playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { renewalContract } from "@/Domain/contracts/contracts";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MarketBid, SellCandidate, SquadMarketProfile } from "@/types/transferMarketTypes";

const B = NEGOTIATION.BID;
/** Rating slack around a need's band when an AI club considers a player the human listed. */
const BAND_SLACK = 0.5;

/** A transfer bid of `buyer` for `player`, or null when it cannot afford a fair price. */
export function buildAiTransferBid(args: {
  id: string;
  player: RosterPlayer;
  buyer: Squad;
  date: string;
  rng: () => number;
  /** The selling (human) squad: prices a player with a transfer request as a LOW-tier sale. */
  seller?: Squad;
  /** Asking price the human set on the sell list (#88), EUR; absent = his value. */
  askingPrice?: number;
}): MarketBid | null {
  const { player, buyer, rng } = args;
  if (buyer.players.length >= MAX_SQUAD) return null;
  // A very ambitious player turns down a much smaller club (`personality.md`).
  if (args.seller && refusesSmallerClub(player, tierStepsDown(args.seller, buyer))) return null;
  const value = new Player(playerOverallRating(player), player.age).price;
  // Asking price (#88): below the value a club never needs more room than for a plain listing (nor
  // more than close to the asking price); above it, it must afford at least the value.
  const r = askingRatio(args.askingPrice, value);
  const ref = r < 1 ? args.askingPrice! : value;
  const minAfford = r < 1
    ? Math.min(value * B.MIN_MAX_RATIO, ref * NEGOTIATION.ASKING.DISCOUNT_FEE_MIN)
    : r > 1 ? value : value * B.MIN_MAX_RATIO;
  const cap = priceCapForTier(transferBudgetTierOf(buyer));
  const maxFee = roundFeeDown(Math.min(aiTransferBudgetOf(buyer), cap ?? Infinity, value * B.MAX_RATIO));
  if (maxFee <= 0 || maxFee < minAfford) return null;
  // The wage the buyer would pay (curve × personality, `renewalContract`).
  if (!passesWageGate(aiClubFinance(buyer), renewalContract(player, buyer, args.date, 1).wage, Math.min(maxFee, ref))) return null;
  const sellOnPct = rng() < B.SELL_ON_CHANCE ? (rng() < 0.5 ? 10 : 20) : 0;
  const mult = 1 + sellOnValueFraction(sellOnPct, player.age);
  const u = rng();
  const base = (args.askingPrice !== undefined ? askingOpening(args.askingPrice, value, u) : null) ?? value * (B.FEE_MIN + u * B.FEE_SPREAD);
  let opening = roundFeeDown(Math.min(base, maxFee) / mult);
  // With an asking price the club never goes above it (the human can still counter up to it).
  let ceiling = r === 1 ? maxFee : Math.min(maxFee, Math.max(opening, roundFeeDown(args.askingPrice!)));
  // Transfer request (`.claude/rules/game/morale.md`): the buyer knows he wants out and prices the
  // human club as an AI LOW-tier seller (pressure 1.0) — the fee such a seller accepts caps the bid.
  if (args.seller && player.moraleLog?.transferRequest) {
    const lowTierFee = roundFeeDown(Math.max(value * B.MIN_MAX_RATIO, feeForSaleScore(saleContext(player, args.seller, 1, { humanSeller: true }), ACCEPT_SCORE)));
    opening = Math.min(opening, roundFeeDown(lowTierFee / mult));
    ceiling = Math.min(maxFee, Math.max(opening, lowTierFee));
  }
  if (opening <= 0) return null;
  return {
    id: args.id,
    kind: "transfer",
    playerId: player.id,
    playerName: player.name,
    clubId: buyer.id,
    clubName: buyer.name,
    date: args.date,
    expires: addDays(args.date, B.VALID_DAYS),
    fee: opening,
    maxFee: ceiling,
    sellOnPct,
  };
}

function hasBid(bids: MarketBid[], playerId: string, kind: MarketBid["kind"]): boolean {
  return bids.some((b) => b.playerId === playerId && b.kind === kind);
}

/**
 * D6 (Etapa 25): up to MAX_TRANSFER_BIDS_PER_PLAYER live transfer bids for the same player, never two
 * from one club — a small auction through the inbox.
 */
function transferBidsFull(bids: MarketBid[], playerId: string): boolean {
  return bids.filter((b) => b.playerId === playerId && b.kind === "transfer").length >= B.MAX_PER_PLAYER;
}
const bidClubs = (bids: MarketBid[], playerId: string) =>
  new Set(bids.filter((b) => b.playerId === playerId).map((b) => b.clubId));

/**
 * The day's new AI bids for the human club's players (`.claude/rules/game/negotiation.md`):
 * - one transfer bid for a random sell-listed player, from a club whose needs cover his role;
 * - now and then (`UNLISTED_CHANCE`), a bid of a bigger club for the human's best player;
 * - per loan-listed player (`LOAN.BID_CHANCE`), a loan bid from a club with a `cover_need` there.
 * Never a second bid of the same kind for a player with one pending; at most `MAX_PENDING` pending.
 */
export function generateBidsForHuman(args: {
  date: string;
  rng: () => number;
  humanSquad: Squad;
  squads: ReadonlyMap<string, Squad>;
  profiles: Record<string, SquadMarketProfile>;
  sellList: SellCandidate[];
  loanList: string[];
  pending: MarketBid[];
  seasonEndOf: (squad: Squad) => string;
  newId: () => string;
  /** Transfer windows: only buyers whose window is open bid (absent = every buyer). */
  buyerOpen?: (squad: Squad) => boolean;
  /** Last open day of the buyer's window: the bid expires by then. */
  buyerClosesOn?: (squad: Squad) => string | undefined;
}): MarketBid[] {
  const { rng, humanSquad, squads, profiles, date } = args;
  const pushed: MarketBid[] = [];
  const out = {
    push(bid: MarketBid) {
      const close = args.buyerClosesOn?.(squads.get(bid.clubId) ?? humanSquad);
      pushed.push(close && close < bid.expires ? { ...bid, expires: close } : bid);
    },
    get length() { return pushed.length; },
  };
  const all = () => [...args.pending, ...pushed];
  const room = () => all().length < B.MAX_PENDING;
  // Never a player the human club could not let go (squad of 15+, cover at the position, role minimums: the strict, AI-seller rule).
  const owned = (id: string) =>
    humanSquad.players.find((p) => p.id === id && !p.loan && !squadDepthBlocked(p, humanSquad, false)) ?? null;
  const buyersFor = (player: RosterPlayer, needKind?: "cover_need") =>
    Object.entries(profiles)
      .filter(([id]) => id !== humanSquad.id && squads.has(id) && !bidClubs(all(), player.id).has(id))
      .filter(([id]) => !args.buyerOpen || args.buyerOpen(squads.get(id)!))
      .filter(([, prof]) => prof.needs?.some((n) => playerMatchesBand(player, n.position) && (!needKind || n.intentType === needKind)))
      // A transfer (not a loan): a very ambitious player refuses a much smaller club (`personality.md`).
      .filter(([id]) => needKind !== undefined || !refusesSmallerClub(player, tierStepsDown(humanSquad, squads.get(id)!)))
      .map(([id]) => squads.get(id)!);

  // Asking price of a listed player (#88): r = asking / value (1 without a price).
  const askingOf = (player: RosterPlayer) => args.sellList.find((c) => c.playerId === player.id)?.askingPrice;
  const ratioOf = (player: RosterPlayer) =>
    askingRatio(askingOf(player), playerMarketValue(player));
  /**
   * A transfer bid from a random club whose need band (± slack) covers him. Priced below his value
   * (#88), a club that cannot bid (budget, wage room) gives way to another, up to DISCOUNT_TRIES.
   */
  const tryBid = (player: RosterPlayer, slack: number, discounted = false) => {
    const rating = playerOverallRating(player);
    const buyers = buyersFor(player).filter((b) => {
      const need = profiles[b.id]!.needs.find((n) => playerMatchesBand(player, n.position))!;
      return rating >= need.targetMin - slack && rating <= need.targetMax + slack;
    });
    const asking = askingOf(player);
    for (let tries = discounted ? NEGOTIATION.ASKING.DISCOUNT_TRIES : 1; tries > 0 && buyers.length > 0; tries--) {
      const buyer = buyers.splice(Math.floor(rng() * buyers.length), 1)[0]!;
      const bid = buildAiTransferBid({ id: args.newId(), player, buyer, date, rng, seller: humanSquad, ...(asking !== undefined ? { askingPrice: asking } : {}) });
      if (bid) { out.push(bid); return; }
    }
  };

  // Listed player: one transfer bid per day (an asking price above his value lets it through less often).
  const listed = args.sellList.map((c) => owned(c.playerId)).filter((p): p is RosterPlayer => !!p && !transferBidsFull(all(), p.id));
  if (listed.length > 0 && room()) {
    const player = listed[Math.floor(rng() * listed.length)]!;
    const r = ratioOf(player);
    if (r <= 1 || rng() < askingFreqMult(r)) tryBid(player, BAND_SLACK + askingBandExtra(r), r < 1);
  }

  // Priced below his value: an extra daily chance (freqMult − 1) for each such player.
  for (const c of args.sellList) {
    if (!room()) break;
    const player = owned(c.playerId);
    if (!player || transferBidsFull(all(), player.id)) continue;
    const r = ratioOf(player);
    if (r >= 1 || rng() >= askingFreqMult(r) - 1) continue;
    tryBid(player, BAND_SLACK + askingBandExtra(r), true);
  }

  // Transfer request (`.claude/rules/game/morale.md`): he wants out, so clubs come in more often
  // and from a wider rating band than for a plain listing.
  for (const c of args.sellList) {
    if (!c.requested || !room()) continue;
    const player = owned(c.playerId);
    if (!player || transferBidsFull(all(), player.id)) continue;
    const r = ratioOf(player);
    if (rng() >= Math.min(1, MORALE.REQUEST_BID_CHANCE * askingFreqMult(r))) continue;
    tryBid(player, MORALE.REQUEST_BAND_SLACK + askingBandExtra(r), r < 1);
  }

  // Unlisted standout: a bigger club tries its luck.
  if (room() && rng() < B.UNLISTED_CHANCE) {
    const free = humanSquad.players.filter((p) => !p.loan && !squadDepthBlocked(p, humanSquad, false) && !hasBid(all(), p.id, "transfer") && !args.sellList.some((c) => c.playerId === p.id));
    const best = free.sort((a, b) => playerOverallRating(b) - playerOverallRating(a))[0];
    if (best) {
      const humanAvg = teamAvgRating(humanSquad);
      const buyers = buyersFor(best).filter((b) => transferBudgetTierOf(b) === "high" && teamAvgRating(b) > humanAvg);
      if (buyers.length > 0) {
        const buyer = buyers[Math.floor(rng() * buyers.length)]!;
        const bid = buildAiTransferBid({ id: args.newId(), player: best, buyer, date, rng, seller: humanSquad });
        if (bid) out.push(bid);
      }
    }
  }

  // Loan-listed players.
  for (const id of args.loanList) {
    if (!room()) break;
    const player = owned(id);
    if (!player || hasBid(all(), id, "loan")) continue;
    if (rng() >= NEGOTIATION.LOAN.BID_CHANCE) continue;
    const buyers = buyersFor(player, "cover_need");
    if (buyers.length === 0) continue;
    const buyer = buyers[Math.floor(rng() * buyers.length)]!;
    const bid = buildAiLoanBid({
      id: args.newId(), player, playerWage: currentWage(player, wageFactorOf(humanSquad)), buyer, date,
      seasonEnd: args.seasonEndOf(buyer), rng,
    });
    if (bid) out.push(bid);
  }
  return pushed;
}

/** Bids still answerable on `date` whose player is still at the human club. */
export function liveBids(bids: MarketBid[] | undefined, date: string, humanSquad: Squad | null): MarketBid[] {
  if (!humanSquad) return [];
  const ids = new Set(humanSquad.players.filter((p) => !p.loan).map((p) => p.id));
  return (bids ?? []).filter((b) => b.expires >= date && ids.has(b.playerId));
}
