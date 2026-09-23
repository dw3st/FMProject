import { Player } from "@/Domain/Player";
import type { MainRole } from "@/GameInterface/positionHelpers";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type {
  SquadMarketProfile,
  TransferNeed,
  TransferBudgetTier,
  TransferIntentType,
  SellCandidate,
} from "@/types/transferMarketTypes";

const MAIN_BANDS: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

const BUDGET_HIGH = 50_000_000;
const BUDGET_MID = 15_000_000;
export const PRICE_CAP_MID = 40_000_000;
export const PRICE_CAP_LOW = 15_000_000;

// Caps on total needs per club per refresh
const MAX_COVER_NEEDS = 2;
const MAX_FUTURE_INVESTMENT_NEEDS = 1;
const MAX_IMPROVEMENT_NEEDS = 1;

export function defaultRng(): number {
  return Math.random();
}

export function playerOverallRating(player: RosterPlayer): number {
  return Player.overallAvg(player);
}

export function teamAvgRating(squad: Squad): number {
  if (squad.players.length === 0) return 5;
  const sum = squad.players.reduce((s, p) => s + playerOverallRating(p), 0);
  return sum / squad.players.length;
}

export function budgetTierFromBudget(budget: number): TransferBudgetTier {
  if (budget >= BUDGET_HIGH) return "high";
  if (budget >= BUDGET_MID) return "mid";
  return "low";
}

function playersInBand(squad: Squad, band: MainRole): RosterPlayer[] {
  return squad.players.filter((p) => getMainRole(p.positions[0] ?? "CM") === band);
}

// ─── Target range helpers per intent ────────────────────────────────────────

function coverNeedRange(
  teamAvg: number,
  tier: TransferBudgetTier,
  rng: () => number,
): { min: number; max: number } {
  const min = teamAvg - 0.3 + (rng() - 0.5) * 0.1;
  let max: number;
  switch (tier) {
    case "high": max = teamAvg + 1.0 + rng() * 0.4; break;
    case "mid":  max = teamAvg + 0.6 + rng() * 0.3; break;
    default:     max = teamAvg + 0.3 + rng() * 0.2; break;
  }
  return { min, max };
}

function futureInvestmentRange(
  teamAvg: number,
  rng: () => number,
): { min: number; max: number } {
  return {
    min: teamAvg - 0.8 + (rng() - 0.5) * 0.1,
    max: teamAvg + 0.2 + (rng() - 0.5) * 0.1,
  };
}

function improvementRange(
  teamAvg: number,
  rng: () => number,
): { min: number; max: number } {
  return {
    min: teamAvg + 0.4 + (rng() - 0.5) * 0.1,
    max: teamAvg + 1.5 + rng() * 0.2,
  };
}

// ─── Need generation ────────────────────────────────────────────────────────

/**
 * Generates transfer needs for a squad.
 * Each band can produce up to one need of each intent type.
 * Global caps: 2 cover_need, 1 future_investment, 1 improvement.
 */
export function generateTransferNeeds(
  squad: Squad,
  currentDate: string,
  rng: () => number = defaultRng,
): SquadMarketProfile {
  const teamAvg = teamAvgRating(squad);
  const budget = squad.finances?.budget ?? 0;
  const tier = budgetTierFromBudget(budget);

  type NeedCandidate = TransferNeed & { _bandUrgency: number };
  const coverCandidates: NeedCandidate[] = [];
  const futureCandidates: NeedCandidate[] = [];
  const improveCandidates: NeedCandidate[] = [];

  for (const band of MAIN_BANDS) {
    const players = playersInBand(squad, band);
    const count = players.length;
    const bandAvg =
      count > 0
        ? players.reduce((s, p) => s + playerOverallRating(p), 0) / count
        : 0;

    // ── cover_need ──
    let urgency = 0.2;
    if (count < 2) urgency = 1.0;
    else if (bandAvg < teamAvg - 0.3) urgency = 0.6;
    urgency += (rng() - 0.5) * 0.15;
    urgency = Math.max(0, Math.min(1, urgency));

    if (urgency >= 0.3) {
      const { min, max } = coverNeedRange(teamAvg, tier, rng);
      coverCandidates.push({
        position: band,
        targetMin: min,
        targetMax: max,
        urgency,
        budgetTier: tier,
        intentType: "cover_need",
        _bandUrgency: urgency,
      });
    }

    // ── future_investment ── (not low tier, band is safe, no emergency)
    if (tier !== "low" && count >= 2 && urgency < 1.0) {
      const futurePriority = 0.4 + (rng() - 0.5) * 0.2;
      const { min, max } = futureInvestmentRange(teamAvg, rng);
      futureCandidates.push({
        position: band,
        targetMin: min,
        targetMax: max,
        urgency: Math.max(0, Math.min(1, futurePriority)),
        budgetTier: tier,
        intentType: "future_investment",
        _bandUrgency: futurePriority,
      });
    }

    // ── improvement ── (mid or high tier, band safe, no emergency)
    if ((tier === "mid" || tier === "high") && count >= 2 && urgency < 1.0) {
      const improvePriority = 0.35 + (rng() - 0.5) * 0.2;
      const { min, max } = improvementRange(teamAvg, rng);
      improveCandidates.push({
        position: band,
        targetMin: min,
        targetMax: max,
        urgency: Math.max(0, Math.min(1, improvePriority)),
        budgetTier: tier,
        intentType: "improvement",
        _bandUrgency: improvePriority,
      });
    }
  }

  // Sort each group by urgency descending and apply global caps
  const sorted = (arr: NeedCandidate[]) =>
    [...arr].sort((a, b) => b._bandUrgency - a._bandUrgency);

  const needs: TransferNeed[] = [
    ...sorted(coverCandidates).slice(0, MAX_COVER_NEEDS),
    ...sorted(futureCandidates).slice(0, MAX_FUTURE_INVESTMENT_NEEDS),
    ...sorted(improveCandidates).slice(0, MAX_IMPROVEMENT_NEEDS),
  ].map(({ _bandUrgency: _, ...need }) => need);

  return {
    squadId: squad.id,
    needs,
    sellList: [],
    lastUpdateDay: currentDate,
  };
}

// ─── Candidate filtering ────────────────────────────────────────────────────

function priceCapForTier(tier: TransferBudgetTier): number | null {
  if (tier === "high") return null;
  if (tier === "mid") return PRICE_CAP_MID;
  return PRICE_CAP_LOW;
}

export function playerMatchesBand(player: RosterPlayer, band: MainRole): boolean {
  return getMainRole(player.positions[0] ?? "CM") === band;
}

/**
 * All players from other squads that fit the need (rating band + price cap + intent age filter).
 * `excludeSellerSquadId` excludes a squad from selling (e.g. human player club in AI market).
 */
export function findCandidates(
  need: TransferNeed,
  allSquads: Squad[],
  buyerSquadId: string,
  excludeSellerSquadId?: string | null,
): RosterPlayer[] {
  const cap = priceCapForTier(need.budgetTier);
  const out: RosterPlayer[] = [];

  for (const squad of allSquads) {
    if (squad.id === buyerSquadId) continue;
    if (excludeSellerSquadId && squad.id === excludeSellerSquadId) continue;
    for (const player of squad.players) {
      if (!playerMatchesBand(player, need.position)) continue;
      const rating = playerOverallRating(player);
      if (rating < need.targetMin || rating > need.targetMax) continue;
      // Hard age filter: future_investment only targets players ≤ 23
      if (need.intentType === "future_investment" && player.age > 23) continue;
      const price = new Player(rating, player.age).price;
      if (cap != null && price > cap) continue;
      out.push(player);
    }
  }
  return out;
}

// ─── Candidate scoring ──────────────────────────────────────────────────────

function priceScore(fee: number, buyerBudget: number): number {
  if (fee <= buyerBudget / 3) return 1.0;
  if (fee <= buyerBudget / 1.5) return 0.7;
  return 0.3;
}

function coverNeedAgeScore(age: number): number {
  if (age < 24) return 1.0;
  if (age < 28) return 0.85;
  if (age < 32) return 0.65;
  return 0.4;
}

function youthScore(age: number): number {
  if (age <= 19) return 1.0;
  if (age <= 21) return 0.85;
  if (age <= 23) return 0.55;
  return 0.1; // > 23 filtered by findCandidates, but guard just in case
}

function improvementAgeScore(age: number): number {
  if (age < 24) return 1.0;
  if (age < 28) return 0.90;
  if (age < 30) return 0.70;
  // > 30: strong penalty; kept alive only if clearly elite (handled by improvementScore)
  return 0.20;
}

function scoreCoverNeed(
  player: RosterPlayer,
  need: TransferNeed,
  fee: number,
  buyerBudget: number,
  rng: () => number,
  sellScore: number,
): number {
  const rating = playerOverallRating(player);
  const targetMid = (need.targetMin + need.targetMax) / 2;
  const fit = Math.max(0, 1 - Math.abs(rating - targetMid) / 2);
  const noise = (rng() - 0.5) * 0.05;

  return (
    fit * 0.35 +
    priceScore(fee, buyerBudget) * 0.25 +
    sellScore * 0.20 +
    coverNeedAgeScore(player.age) * 0.10 +
    need.urgency * 0.10 +
    noise
  );
}

function scoreFutureInvestment(
  player: RosterPlayer,
  need: TransferNeed,
  fee: number,
  buyerBudget: number,
  rng: () => number,
  sellScore: number,
): number {
  const rating = playerOverallRating(player);
  // Upside fit: how close to the upper end of the range (potential ceiling)
  const upsideFit = Math.max(0, 1 - Math.abs(rating - need.targetMax) / 2);
  // Current fit: general fit to range (less important for youth buys)
  const targetMid = (need.targetMin + need.targetMax) / 2;
  const currentFit = Math.max(0, 1 - Math.abs(rating - targetMid) / 2);
  const noise = (rng() - 0.5) * 0.05;

  return (
    youthScore(player.age) * 0.40 +
    upsideFit * 0.25 +
    priceScore(fee, buyerBudget) * 0.15 +
    sellScore * 0.10 +
    currentFit * 0.10 +
    noise
  );
}

function scoreImprovement(
  player: RosterPlayer,
  need: TransferNeed,
  fee: number,
  buyerBudget: number,
  rng: () => number,
  sellScore: number,
  buyerTeamAvg: number,
): number {
  const rating = playerOverallRating(player);
  const targetMid = (need.targetMin + need.targetMax) / 2;
  const fit = Math.max(0, 1 - Math.abs(rating - targetMid) / 2);
  // How much of an upgrade over current team level
  const improvementValue = Math.max(0, Math.min(1.5, rating - buyerTeamAvg)) / 1.5;
  const noise = (rng() - 0.5) * 0.05;

  return (
    improvementValue * 0.40 +
    fit * 0.25 +
    priceScore(fee, buyerBudget) * 0.15 +
    sellScore * 0.10 +
    improvementAgeScore(player.age) * 0.10 +
    noise
  );
}

/**
 * Score a transfer candidate for a buyer's need.
 * Dispatches to intent-specific scoring.
 * `sellerSellList` boosts listed players.
 * `buyerTeamAvg` is used by the `improvement` intent to measure the upgrade delta.
 */
export function scoreCandidate(
  player: RosterPlayer,
  need: TransferNeed,
  fee: number,
  buyerTransferBudget: number,
  rng: () => number = defaultRng,
  sellerSellList: SellCandidate[] = [],
  buyerTeamAvg = 0,
): number {
  const sellEntry = sellerSellList.find((c) => c.playerId === player.id);
  const sellScore = sellEntry ? sellEntry.priority : 0;

  switch (need.intentType) {
    case "future_investment":
      return scoreFutureInvestment(player, need, fee, buyerTransferBudget, rng, sellScore);
    case "improvement":
      return scoreImprovement(player, need, fee, buyerTransferBudget, rng, sellScore, buyerTeamAvg);
    default:
      return scoreCoverNeed(player, need, fee, buyerTransferBudget, rng, sellScore);
  }
}

// ─── Transfer attempt orchestration ─────────────────────────────────────────

export function findSquadContainingPlayer(
  playerId: string,
  allSquads: Squad[],
): Squad | null {
  for (const s of allSquads) {
    if (s.players.some((p) => p.id === playerId)) return s;
  }
  return null;
}

export interface TransferAttemptResult {
  player: RosterPlayer;
  sellerSquad: Squad;
  buyerSquad: Squad;
  fee: number;
  /** Need this attempt tried to fill (remove from profile after success). */
  fulfilledNeed: TransferNeed;
}

/**
 * Picks highest-urgency need, scores candidates, returns best bid if buyer can afford fee.
 * `sellerSellLists` maps squad id → sell list for sell-score boosting during scoring.
 */
export function processTeamTransferAttempt(
  buyerSquad: Squad,
  profile: SquadMarketProfile | null,
  allSquads: Squad[],
  rng: () => number = defaultRng,
  excludePlayerClubSquadId?: string | null,
  sellerSellLists: Record<string, SellCandidate[]> = {},
): TransferAttemptResult | null {
  if (!profile?.needs.length) return null;

  const buyerBudget = buyerSquad.finances?.budget ?? 0;
  const buyerAvg = teamAvgRating(buyerSquad);
  const need = [...profile.needs].sort((a, b) => b.urgency - a.urgency)[0]!;
  const candidates = findCandidates(need, allSquads, buyerSquad.id, excludePlayerClubSquadId);
  if (candidates.length === 0) return null;

  const squadByPlayerId = new Map<string, string>();
  for (const s of allSquads) {
    for (const p of s.players) squadByPlayerId.set(p.id, s.id);
  }

  let best: { player: RosterPlayer; score: number; fee: number } | null = null;
  for (const player of candidates) {
    const rating = playerOverallRating(player);
    const fairPrice = new Player(rating, player.age).price;
    const fee = Math.round(fairPrice * (0.9 + rng() * 0.25));
    if (fee > buyerBudget) continue;
    const sellerSquadId = squadByPlayerId.get(player.id) ?? "";
    const sellList = sellerSellLists[sellerSquadId] ?? [];
    const score = scoreCandidate(player, need, fee, buyerBudget, rng, sellList, buyerAvg);
    if (!best || score > best.score) best = { player, score, fee };
  }
  if (!best) return null;

  const sellerSquad = findSquadContainingPlayer(best.player.id, allSquads);
  if (!sellerSquad || sellerSquad.id === buyerSquad.id) return null;

  return {
    player: best.player,
    sellerSquad,
    buyerSquad: buyerSquad,
    fee: best.fee,
    fulfilledNeed: need,
  };
}
