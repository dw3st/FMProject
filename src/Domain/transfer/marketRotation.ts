import {
  evaluateTransferOffer,
  squadsAfterAcceptedTransfer,
} from "@/Domain/transfer/transferAcceptance";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type { MarketBid, MarketState, SellCandidate, SquadMarketProfile, TransferNeed } from "@/types/transferMarketTypes";
import { generateBidsForHuman, liveBids } from "@/Domain/negotiation/bids";
import { defaultRng, generateTransferNeeds, processTeamTransferAttempt } from "@/Domain/transfer/transferNeeds";
import { generateSellList, getSellPriority } from "@/Domain/transfer/sellList";
import { logDebug } from "@/Logger";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { aiRenewalYears, contractEndFor, defaultSeasonEnd, renewalContract } from "@/Domain/contracts/contracts";
import { shuffle } from "@/Domain/rng";
import { WINDOWS } from "@/Domain/market/windowConfig";

export const TEAMS_PER_DAY_NEEDS = 10;
/** Legacy (no windows): attempts per day, all year (`dailyMarketTick` without `windows`). */
const TEAMS_PER_DAY_ATTEMPTS = 10;

function cloneSquad(s: Squad): Squad {
  return { ...s, players: [...s.players] };
}

function squadRef(s: Squad): { leagueSlug: string; clubSlug: string } {
  const leagueSlug = s.leagueSlug ?? "";
  const clubSlug = s.slug ?? s.id;
  return { leagueSlug, clubSlug };
}

/**
 * Fisher–Yates shuffle of squad IDs; empty profiles.
 */
export function initMarketState(allSquads: Squad[], rng: () => number = defaultRng): MarketState {
  const shuffledTeamIds = shuffle(allSquads.map((s) => s.id), rng);
  return { shuffledTeamIds, rotationIndex: 0, profiles: {}, playerSellList: [] };
}

/** Pick up to `count` distinct indices from 0..pool.length-1 using rng. */
function sampleIndices(poolLen: number, count: number, rng: () => number): number[] {
  if (poolLen === 0) return [];
  const idx = shuffle(Array.from({ length: poolLen }, (_, i) => i), rng);
  return idx.slice(0, Math.min(count, poolLen));
}

interface CompletedAITransfer {
  player: RosterPlayer;
  sellerSquad: Squad;
  buyerSquad: Squad;
  updatedSeller: Squad;
  updatedBuyer: Squad;
  fee: number;
  sellerMeta: { leagueSlug: string; clubSlug: string };
  buyerMeta: { leagueSlug: string; clubSlug: string };
}

export interface DailyMarketTickResult {
  updatedMarket: MarketState;
  completedTransfers: CompletedAITransfer[];
  /** Bids made today for the human's players (already in `updatedMarket.pendingBids`). */
  newBids: MarketBid[];
}

export interface DailyMarketTickOptions {
  /** Human-controlled club: excluded from AI needs refresh, buying, and selling in this tick. */
  excludePlayerSquadId?: string | null;
  /**
   * The whole market sits out this tick: no needs refresh, no buying, no selling, no sell-list
   * matching, for every club. Used by the start-kit pre-simulation — every club is pickable for
   * a new career, so none of them may trade before the player ever gets to choose one. Returns
   * the market unchanged.
   */
  marketFrozen?: boolean;
  /** Human-managed sell list. AI clubs bid for these players through the inbox. */
  playerSellList?: SellCandidate[];
  /** Squad object for the human's club (needed for the bids). */
  playerSquad?: Squad | null;
  /** Id of a new bid (default: a counter). */
  newBidId?: () => string;
  /** Last day of the squad's league season (contract end). Falls back to the next May 31. */
  seasonEndOf?: (squad: Squad) => string | undefined;
  /** League + season label of a selling squad, for the player's partial history row. */
  historyFrom?: (squad: Squad) => { league: string; season: string } | null;
  /**
   * Transfer windows (`.claude/rules/game/transfer-windows.md`): only buyers whose country has an
   * open window try to buy or bid for the human's players. Absent = the legacy all-year market.
   */
  windows?: {
    /** The buyer's window is open today. */
    isOpen: (squad: Squad) => boolean;
    /** Last open day of the buyer's window (a bid for the human expires by then). */
    closesOn?: (squad: Squad) => string | undefined;
    /** Deadline rush (last days of the buyer's window): weight `DEADLINE_MULT`. */
    rush?: (squad: Squad) => boolean;
  };
}

/** Rounds `x` to an integer, the fraction as a probability. */
function stochasticRound(x: number, rng: () => number): number {
  const f = Math.floor(x);
  return f + (rng() < x - f ? 1 : 0);
}

/**
 * Buyers that try today. Legacy: TEAMS_PER_DAY_ATTEMPTS from the whole pool. With windows: the
 * world rate ATTEMPTS_PER_OPEN_DAY × (weighted share of the pool with an open window), drawn from
 * the open buyers (deadline rush weighs DEADLINE_MULT).
 */
function pickBuyers(poolIds: string[], squads: Map<string, Squad>, rng: () => number, windows?: DailyMarketTickOptions["windows"]): string[] {
  if (!windows) return sampleIndices(poolIds.length, TEAMS_PER_DAY_ATTEMPTS, rng).map((i) => poolIds[i]!);
  const open: { id: string; w: number }[] = [];
  for (const id of poolIds) {
    const sq = squads.get(id);
    if (!sq || !windows.isOpen(sq)) continue;
    open.push({ id, w: windows.rush?.(sq) ? WINDOWS.DEADLINE_MULT : 1 });
  }
  if (open.length === 0 || poolIds.length === 0) return [];
  const weight = open.reduce((s, o) => s + o.w, 0);
  const count = Math.min(open.length, stochasticRound((WINDOWS.ATTEMPTS_PER_OPEN_DAY * weight) / poolIds.length, rng));
  const out: string[] = [];
  const pool = [...open];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((s, o) => s + o.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i]!.w; if (r < 0) break; }
    out.push(pool[i]!.id);
    pool.splice(i, 1);
  }
  return out;
}

/** Contract an AI club gives a signing: the curve wage at its factor, length by age. */
function aiSigningContract(player: RosterPlayer, buyer: Squad, date: string, options?: DailyMarketTickOptions) {
  const end = options?.seasonEndOf?.(buyer) ?? defaultSeasonEnd(date);
  const contract = renewalContract(player, buyer, end, aiRenewalYears(player));
  return { ...contract, until: contractEndFor(date, end, aiRenewalYears(player)) };
}

/** Strip needs that pre-date the intentType field so old saves don't feed stale data into scoring. */
function sanitizeProfile(profile: SquadMarketProfile): SquadMarketProfile {
  return {
    ...profile,
    needs: profile.needs.filter((n) => n.intentType != null),
  };
}

function profileWithoutNeed(profile: SquadMarketProfile, fulfilled: TransferNeed): SquadMarketProfile {
  return {
    ...profile,
    needs: profile.needs.filter((n) => n.position !== fulfilled.position),
  };
}

/** Build a map of squadId → sellList from all profiles (for fast lookup during scoring). */
function buildSellerSellLists(profiles: Record<string, SquadMarketProfile>): Record<string, SellCandidate[]> {
  const out: Record<string, SellCandidate[]> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    out[id] = profile.sellList ?? [];
  }
  return out;
}

export function dailyMarketTick(
  market: MarketState,
  allSquads: Squad[],
  currentDate: string,
  rng: () => number = defaultRng,
  options?: DailyMarketTickOptions,
): DailyMarketTickResult {
  if (options?.marketFrozen) return { updatedMarket: market, completedTransfers: [], newBids: [] };

  const excludePlayerSquadId = options?.excludePlayerSquadId ?? null;
  const squadById = new Map(allSquads.map((s) => [s.id, s] as const));
  let shuffledTeamIds = [...market.shuffledTeamIds];
  let rotationIndex = market.rotationIndex;
  const profiles: Record<string, SquadMarketProfile> = Object.fromEntries(
    Object.entries(market.profiles).map(([id, p]) => [id, sanitizeProfile(p)]),
  );

  for (let n = 0; n < TEAMS_PER_DAY_NEEDS; n++) {
    let id: string | undefined;
    let guard = 0;
    while (guard < shuffledTeamIds.length) {
      if (rotationIndex >= shuffledTeamIds.length) {
        shuffledTeamIds = shuffle(shuffledTeamIds, rng);
        rotationIndex = 0;
      }
      const candidate = shuffledTeamIds[rotationIndex]!;
      rotationIndex++;
      guard++;
      if (excludePlayerSquadId && candidate === excludePlayerSquadId) continue;
      id = candidate;
      break;
    }
    if (!id) continue;
    const squad = squadById.get(id);
    if (squad) {
      const needsProfile = generateTransferNeeds(squad, currentDate, rng);
      const sellList = generateSellList(squad, rng);
      profiles[id] = { ...needsProfile, sellList };
    }
  }

  const squads = new Map<string, Squad>();
  for (const s of allSquads) {
    squads.set(s.id, cloneSquad(s));
  }

  const completedTransfers: CompletedAITransfer[] = [];

  const poolIds = allSquads
    .map((s) => s.id)
    .filter(
      (id) =>
        (profiles[id]?.needs?.length ?? 0) > 0 &&
        (!excludePlayerSquadId || id !== excludePlayerSquadId),
    );
  const buyers = pickBuyers(poolIds, squads, rng, options?.windows);

  // Build sell list lookup for scoring
  const sellerSellLists = buildSellerSellLists(profiles);

  for (const buyerId of buyers) {
    const buyerSquad = squads.get(buyerId);
    if (!buyerSquad || buyerSquad.players.length >= MAX_SQUAD) continue;

    const profile = profiles[buyerId] ?? null;
    const latestList = Array.from(squads.values());
    const attempt = processTeamTransferAttempt(
      buyerSquad,
      profile,
      latestList,
      rng,
      excludePlayerSquadId,
      sellerSellLists,
    );
    if (!attempt) continue;

    const { player, fee } = attempt;
    const sellerSquad = squads.get(attempt.sellerSquad.id);
    const buyer = squads.get(attempt.buyerSquad.id);
    if (!sellerSquad || !buyer) continue;

    const sellPriority = getSellPriority(player.id, profiles[sellerSquad.id]?.sellList ?? []) ?? undefined;
    const { accepted } = evaluateTransferOffer(player, sellerSquad, fee, sellPriority, { buyer });
    if (!accepted) continue;

    const { selling, buying } = squadsAfterAcceptedTransfer(
      player,
      sellerSquad,
      buyer,
      buyer.id,
      player.id,
      aiSigningContract(player, buyer, currentDate, options),
      options?.historyFrom?.(sellerSquad) ?? null,
    );

    squads.set(sellerSquad.id, selling);
    squads.set(buyer.id, buying);

    const buyerProfile = profiles[buyerId];
    if (buyerProfile) {
      profiles[buyerId] = profileWithoutNeed(buyerProfile, attempt.fulfilledNeed);
    }

    // Remove the sold player from the seller's sell list
    const sellerProfile = profiles[sellerSquad.id];
    if (sellerProfile) {
      profiles[sellerSquad.id] = {
        ...sellerProfile,
        sellList: (sellerProfile.sellList ?? []).filter((c) => c.playerId !== player.id),
      };
    }

    completedTransfers.push({
      player,
      sellerSquad,
      buyerSquad: buyer,
      updatedSeller: selling,
      updatedBuyer: buying,
      fee,
      sellerMeta: squadRef(sellerSquad),
      buyerMeta: squadRef(buyer),
    });
  }

  // Bids for the human club's players (`.claude/rules/game/negotiation.md`): AI clubs no longer
  // buy from the human's sell list on their own — they send a bid the player answers in the inbox.
  const playerSellList = options?.playerSellList ?? market.playerSellList ?? [];
  const playerSquad = options?.playerSquad ?? null;
  const pending = playerSquad ? liveBids(market.pendingBids, currentDate, squads.get(playerSquad.id) ?? playerSquad) : [];
  let bidSeq = 0;
  const newBids = playerSquad && excludePlayerSquadId
    ? generateBidsForHuman({
      date: currentDate,
      rng,
      humanSquad: squads.get(playerSquad.id) ?? playerSquad,
      squads,
      profiles,
      sellList: playerSellList,
      loanList: market.playerLoanList ?? [],
      pending,
      seasonEndOf: (sq) => options?.seasonEndOf?.(sq) ?? defaultSeasonEnd(currentDate),
      ...(options?.windows ? { buyerOpen: options.windows.isOpen, ...(options.windows.closesOn ? { buyerClosesOn: options.windows.closesOn } : {}) } : {}),
      newId: options?.newBidId ?? (() => `bid-${currentDate}-${++bidSeq}`),
    })
    : [];
  if (newBids.length > 0) logDebug("transfers", `${newBids.length} bid(s) for the human club's players`);

  return {
    updatedMarket: {
      ...market,
      shuffledTeamIds,
      rotationIndex,
      profiles,
      playerSellList: market.playerSellList ?? [],
      pendingBids: [...pending, ...newBids],
    },
    completedTransfers,
    newBids,
  };
}
