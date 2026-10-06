import { addDays } from "@/Domain/dates";
import { Player } from "@/Domain/Player";
import { getMainRole } from "@/Domain/roles";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { contractDemand } from "@/Domain/contracts/contracts";
import { aiClubFinance, aiTransferBudgetOf, passesWageGate, transferBudgetTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { playerMatchesBand, playerOverallRating, priceCapForTier, teamAvgRating } from "@/Domain/transfer/transferNeeds";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { respondToOffer, roundFeeDown, roundFeeUp } from "@/Domain/negotiation/negotiation";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { refusesSmallerClub, tierStepsDown } from "@/Domain/personality/personality";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { RivalBid, SquadMarketProfile } from "@/types/transferMarketTypes";

/**
 * Competition for the same target (`.claude/rules/game/negotiation.md` → "Disputa", Etapa 25): when
 * the human negotiates an AI player, other AI clubs may bid too. The seller picks the fee (a floor
 * for the human), the player picks the club (`preferenceScore`). Pure.
 */

const R = NEGOTIATION.RIVAL;
const P = NEGOTIATION.PREFERENCE;
/** Rating slack around a need's band (as for the bids on the human's players). */
const BAND_SLACK = 0.5;

export interface RivalCandidate {
  squad: Squad;
  urgency: number;
}

/**
 * AI clubs that could compete for `player`: a need on his line covering his rating (± 0,5), the
 * budget for ~his value, room in the wage bill and the squad. Never the seller nor the human club.
 */
export function rivalCandidates(args: {
  player: RosterPlayer;
  sellerId: string;
  humanId: string;
  profiles: Record<string, SquadMarketProfile>;
  squadOf: (id: string) => Squad | null | undefined;
  /** The buyer's transfer window is open. */
  windowOpen?: (squad: Squad) => boolean;
  exclude?: Set<string>;
}): RivalCandidate[] {
  const { player } = args;
  const rating = playerOverallRating(player);
  const value = new Player(rating, player.age).price;
  const out: RivalCandidate[] = [];
  const seller = args.squadOf(args.sellerId) ?? null;
  for (const [id, prof] of Object.entries(args.profiles)) {
    if (id === args.sellerId || id === args.humanId || args.exclude?.has(id)) continue;
    const need = prof.needs?.find((n) => playerMatchesBand(player, n.position)
      && rating >= n.targetMin - BAND_SLACK && rating <= n.targetMax + BAND_SLACK);
    if (!need) continue;
    const squad = args.squadOf(id);
    if (!squad || squad.players.length >= MAX_SQUAD) continue;
    if (args.windowOpen && !args.windowOpen(squad)) continue;
    // A very ambitious player turns down a much smaller club (`personality.md`).
    if (refusesSmallerClub(player, tierStepsDown(seller, squad))) continue;
    if (aiTransferBudgetOf(squad) < value * R.BUDGET_RATIO) continue;
    if (!passesWageGate(aiClubFinance(squad), contractDemand(player, squad, "", { fromSquad: seller }), value)) continue;
    out.push({ squad, urgency: need.urgency });
  }
  return out;
}

/** Rating of the target relative to the buyer's average, mapped to 0..1 (−1 → 0, +1 → 1). */
function relativeRating(player: RosterPlayer, buyer: Squad): number {
  return Math.min(1, Math.max(0, (playerOverallRating(player) - teamAvgRating(buyer) + 1) / 2));
}

/**
 * At most one new rival per call (one roll a day): a candidate drawn by the urgency of its need
 * enters with BASE × urgency × (0,5 + 0,5 × relative rating). Null when it does not or the cap is
 * reached.
 */
export function rollRival(args: {
  player: RosterPlayer;
  seller: Squad;
  candidates: RivalCandidate[];
  existing: RivalBid[];
  date: string;
  /** Last open day of the buyer's window (the deadline never passes it). */
  closesOn?: (squad: Squad) => string | undefined;
  rng: () => number;
}): RivalBid | null {
  const { player, seller, rng } = args;
  const mine = args.existing.filter((b) => b.playerId === player.id);
  if (mine.length >= R.MAX_PER_TARGET) return null;
  const taken = new Set(mine.map((b) => b.clubId));
  const pool = args.candidates.filter((c) => !taken.has(c.squad.id));
  if (pool.length === 0) return null;
  // One candidate a day, weighted by the urgency of its need, rolls its chance to enter.
  const total = pool.reduce((t, c) => t + Math.max(0.05, c.urgency), 0);
  let r = rng() * total;
  let c = pool[pool.length - 1]!;
  for (const x of pool) {
    r -= Math.max(0.05, x.urgency);
    if (r < 0) { c = x; break; }
  }
  const chance = R.BASE * Math.min(1, Math.max(0, c.urgency)) * (0.5 + 0.5 * relativeRating(player, c.squad));
  if (rng() >= chance) return null;
  const value = new Player(playerOverallRating(player), player.age).price;
  const cap = priceCapForTier(transferBudgetTierOf(c.squad)) ?? Infinity;
  const fee = roundFeeDown(Math.min(value * (R.FEE_MIN + rng() * R.FEE_SPREAD), aiTransferBudgetOf(c.squad), cap));
  if (fee <= 0) return null;
  const wage = Math.round(contractDemand(player, c.squad, args.date, { fromSquad: seller }) * (1 + rng() * R.WAGE_SPREAD));
  let deadline = addDays(args.date, R.DEADLINE_DAYS);
  const close = args.closesOn?.(c.squad);
  if (close && close < deadline) deadline = close;
  return {
    playerId: player.id, playerName: player.name, fromClubId: seller.id,
    clubId: c.squad.id, clubName: c.squad.name, fee, wage, date: args.date, deadline,
    sellerAccepts: respondToOffer({ player, seller, buyer: c.squad, fee }).kind === "accept",
  };
}

/** Rival bids for `playerId` still alive on `date`. */
export function liveRivals(rivals: RivalBid[] | undefined, playerId: string, date: string): RivalBid[] {
  return (rivals ?? []).filter((r) => r.playerId === playerId && r.deadline >= date);
}

/** The human's minimum fee: the best rival fee the seller accepts × FLOOR_MULT (0 without one). */
export function rivalFloor(rivals: RivalBid[]): number {
  const best = rivals.filter((r) => r.sellerAccepts).reduce((m, r) => Math.max(m, r.fee), 0);
  return best > 0 ? roundFeeUp(best * R.FLOOR_MULT) : 0;
}

/**
 * Chance he starts at `squad` once he joins: 1 if he makes the automatic XI, 0,5 if he is one of
 * the two best reserves of his line, 0 otherwise.
 */
export function starterChance(player: RosterPlayer, squad: Squad): number {
  const withHim: Squad = squad.players.some((p) => p.id === player.id)
    ? squad
    : { ...squad, players: [...squad.players, player] };
  let xi: string[];
  try {
    xi = autoLineupDefaultFormation(withHim);
  } catch {
    return 0.5;
  }
  if (xi.includes(player.id)) return 1;
  const line = getMainRole(player.positions[0] ?? "");
  const reserves = withHim.players
    .filter((p) => !xi.includes(p.id) && getMainRole(p.positions[0] ?? "") === line)
    .sort((a, b) => playerOverallRating(b) - playerOverallRating(a));
  const i = reserves.findIndex((p) => p.id === player.id);
  return i >= 0 && i < 2 ? 0.5 : 0;
}

export interface PreferenceInput {
  wage: number;
  demand: number;
  /** Club prestige 0..1. */
  prestige: number;
  /** `starterChance`. */
  starter: number;
}

/** How much the player wants to join a club: wage 45%, prestige 35%, chance of starting 20%. */
export function preferenceScore(i: PreferenceInput): number {
  const wage = i.demand > 0 ? Math.min(P.WAGE_CAP, i.wage / i.demand) : P.WAGE_CAP;
  return P.WAGE * wage + P.PRESTIGE * i.prestige + P.STARTER * i.starter;
}

/** Which club wins the player: the higher preference, ties to the more prestigious club. */
export function preferredClub<T extends { id: string; pref: PreferenceInput }>(options: T[]): { winner: T; reason: "wage" | "prestige" | "starter" } | null {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) =>
    preferenceScore(b.pref) - preferenceScore(a.pref) || b.pref.prestige - a.pref.prestige);
  const winner = sorted[0]!;
  const runner = sorted[1];
  if (!runner) return { winner, reason: "wage" };
  const d = {
    wage: P.WAGE * (Math.min(P.WAGE_CAP, winner.pref.wage / Math.max(1, winner.pref.demand)) - Math.min(P.WAGE_CAP, runner.pref.wage / Math.max(1, runner.pref.demand))),
    prestige: P.PRESTIGE * (winner.pref.prestige - runner.pref.prestige),
    starter: P.STARTER * (winner.pref.starter - runner.pref.starter),
  };
  const reason = (Object.entries(d).sort((a, b) => b[1] - a[1])[0]![0]) as "wage" | "prestige" | "starter";
  return { winner, reason };
}
