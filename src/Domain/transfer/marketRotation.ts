import {
  evaluateTransferOffer,
  squadsAfterAcceptedTransfer,
} from "@/Domain/transfer/transferAcceptance";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type { MarketState, SellCandidate, SquadMarketProfile, TransferNeed } from "@/types/transferMarketTypes";
import { defaultRng, generateTransferNeeds, playerMatchesBand, playerOverallRating, processTeamTransferAttempt } from "@/Domain/transfer/transferNeeds";
import { generateSellList, getSellPriority } from "@/Domain/transfer/sellList";
import { Player } from "@/Domain/Player";
import { debugLog } from "@/Logger";
import { aiClubFinance, aiTransferBudgetOf, estimateWeeklyWage, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";

export const TEAMS_PER_DAY_NEEDS = 10;
export const TEAMS_PER_DAY_ATTEMPTS = 10;
export const PLAYER_SELL_LIST_MATCH_CHANCE = 1;

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

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
  const shuffledTeamIds = allSquads.map((s) => s.id);
  shuffleInPlace(shuffledTeamIds, rng);
  return { shuffledTeamIds, rotationIndex: 0, profiles: {}, playerSellList: [] };
}

/** Pick up to `count` distinct indices from 0..pool.length-1 using rng. */
function sampleIndices(poolLen: number, count: number, rng: () => number): number[] {
  if (poolLen === 0) return [];
  const idx = Array.from({ length: poolLen }, (_, i) => i);
  shuffleInPlace(idx, rng);
  return idx.slice(0, Math.min(count, poolLen));
}

export interface CompletedAITransfer {
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
  /** Human-managed sell list. When provided, a daily 10% roll can trigger an AI club to match against it. */
  playerSellList?: SellCandidate[];
  /** Squad object for the human's club (needed for sell-list matching). */
  playerSquad?: Squad | null;
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

/**
 * Attempts to match an AI buyer against a single player from the human's sell list.
 * The buyer is the AI club whose profile best covers the player's position.
 * Returns a completed transfer if successful, or null.
 */
function tryMatchPlayerSellList(
  playerSellList: SellCandidate[],
  playerSquad: Squad,
  squads: Map<string, Squad>,
  profiles: Record<string, SquadMarketProfile>,
  excludePlayerSquadId: string | null,
  rng: () => number,
): CompletedAITransfer | null {
  if (playerSellList.length === 0) return null;

  // Pick a random listed player
  const candidate = playerSellList[Math.floor(rng() * playerSellList.length)];
  if (!candidate) return null;

  const playerSquadCurrent = squads.get(playerSquad.id) ?? playerSquad;
  const listedPlayer = playerSquadCurrent.players.find((p) => p.id === candidate.playerId);
  if (!listedPlayer) return null;

  // Find an AI buyer whose needs include this player's position
  const buyerIds = Object.entries(profiles)
    .filter(([id, profile]) => {
      if (id === excludePlayerSquadId) return false;
      return profile.needs?.some((n) => playerMatchesBand(listedPlayer, n.position));
    })
    .map(([id]) => id);

  if (buyerIds.length === 0) return null;

  // Pick the best-scoring buyer (or random among top candidates)
  const buyerId = buyerIds[Math.floor(rng() * buyerIds.length)]!;
  const buyerSquad = squads.get(buyerId);
  if (!buyerSquad) return null;

  const buyerProfile = profiles[buyerId]!;
  const matchingNeed = buyerProfile.needs.find((n) => playerMatchesBand(listedPlayer, n.position));
  if (!matchingNeed) return null;

  const rating = playerOverallRating(listedPlayer);
  if (rating < matchingNeed.targetMin || rating > matchingNeed.targetMax) return null;

  const fee = new Player(rating, listedPlayer.age).price;
  // AI buyer finances (see src/Domain/aiFinance): seasonal transfer budget and wage cap.
  if (fee > aiTransferBudgetOf(buyerSquad)) return null;
  if (!passesWageGate(aiClubFinance(buyerSquad), estimateWeeklyWage(listedPlayer), fee)) return null;
  const sellPriority = candidate.priority;
  const { accepted } = evaluateTransferOffer(listedPlayer, playerSquadCurrent, fee, sellPriority, { humanSeller: true });
  if (!accepted) return null;

  const { selling, buying } = squadsAfterAcceptedTransfer(
    listedPlayer,
    playerSquadCurrent,
    buyerSquad,
    buyerId,
    listedPlayer.id,
  );

  squads.set(playerSquad.id, selling);
  squads.set(buyerId, buying);

  if (buyerProfile) {
    profiles[buyerId] = profileWithoutNeed(buyerProfile, matchingNeed);
  }

  return {
    player: listedPlayer,
    sellerSquad: playerSquadCurrent,
    buyerSquad,
    updatedSeller: selling,
    updatedBuyer: buying,
    fee,
    sellerMeta: squadRef(playerSquadCurrent),
    buyerMeta: squadRef(buyerSquad),
  };
}

export function dailyMarketTick(
  market: MarketState,
  allSquads: Squad[],
  currentDate: string,
  rng: () => number = defaultRng,
  options?: DailyMarketTickOptions,
): DailyMarketTickResult {
  if (options?.marketFrozen) return { updatedMarket: market, completedTransfers: [] };

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
        shuffleInPlace(shuffledTeamIds, rng);
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
  const pickIdx = sampleIndices(poolIds.length, TEAMS_PER_DAY_ATTEMPTS, rng);

  // Build sell list lookup for scoring
  const sellerSellLists = buildSellerSellLists(profiles);

  for (const pi of pickIdx) {
    const buyerId = poolIds[pi]!;
    const buyerSquad = squads.get(buyerId);
    if (!buyerSquad) continue;

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
    const { accepted } = evaluateTransferOffer(player, sellerSquad, fee, sellPriority);
    if (!accepted) continue;

    const { selling, buying } = squadsAfterAcceptedTransfer(
      player,
      sellerSquad,
      buyer,
      buyer.id,
      player.id,
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

  // 10% daily chance: an AI club attempts to match the human's sell list
  const playerSellList = options?.playerSellList ?? market.playerSellList ?? [];
  const playerSquad = options?.playerSquad ?? null;
  debugLog("transfers", "sell-list guard", {
    hasPlayerSquad: !!playerSquad,
    playerSquadName: playerSquad?.name ?? null,
    sellListLength: playerSellList.length,
    hasExcludeId: !!excludePlayerSquadId,
  });
  if (
    playerSquad &&
    playerSellList.length > 0 &&
    excludePlayerSquadId &&
    rng() < PLAYER_SELL_LIST_MATCH_CHANCE
  ) {
    debugLog(
      "transfers",
      "sell-list match triggered — checking",
      playerSellList.length,
      "listed player(s) for",
      playerSquad.name,
    );
    const matchResult = tryMatchPlayerSellList(
      playerSellList,
      playerSquad,
      squads,
      profiles,
      excludePlayerSquadId,
      rng,
    );
    if (matchResult) {
      debugLog(
        "transfers",
        `sell-list match SUCCESS: ${matchResult.player.name} → ${matchResult.buyerSquad.name} for €${matchResult.fee.toLocaleString()}`,
      );
      completedTransfers.push(matchResult);
    } else {
      debugLog("transfers", "sell-list match attempted but no deal completed (no buyer or offer rejected)");
    }
  }

  const soldPlayerIds = new Set(
    completedTransfers
      .filter((tx) => tx.sellerSquad.id === excludePlayerSquadId)
      .map((tx) => tx.player.id),
  );
  const updatedPlayerSellList =
    soldPlayerIds.size > 0
      ? (market.playerSellList ?? []).filter((c) => !soldPlayerIds.has(c.playerId))
      : market.playerSellList;

  return {
    updatedMarket: {
      shuffledTeamIds,
      rotationIndex,
      profiles,
      playerSellList: updatedPlayerSellList,
    },
    completedTransfers,
  };
}
