/**
 * I/O of the competition for the same target (Etapa 25, `.claude/rules/game/negotiation.md` →
 * "Disputa"): rival AI bids appear while the human negotiates an AI player, and the seller sells to
 * the rival on the deadline. The rules live in `src/Domain/negotiation/rivals.ts`.
 */
import { randomUUID } from "crypto";
import type { SaveMeta, SaveService } from "@/backend/SaveService";
import type { WindowContext } from "@/backend/marketWindowWorld";
import { executeTransferFee } from "@/backend/FinancialService";
import { recordTransferHistory } from "@/backend/clubHistoryWorld";
import { historyFromOf, humanRosterSize, seasonEndOf, sellOnFor, settleSellOn } from "@/backend/negotiationWorld";
import { worldPrestige } from "@/backend/managerWorld";
import { squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import { aiRenewalYears, contractEndFor } from "@/Domain/contracts/contracts";
import { aiTransferBudgetOf } from "@/Domain/aiFinance/aiClubFinance";
import { liveRivals, rivalCandidates, rollRival } from "@/Domain/negotiation/rivals";
import { talkKey } from "@/Domain/negotiation/negotiation";
import { seasonLabel } from "@/Domain/history/history";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MarketState, RivalBid } from "@/types/transferMarketTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { DayTransfer } from "@/types/dayLogTypes";
import type { TransferInboxMessage } from "@/types/inboxTypes";

type News = {
  date: string; kind: TransferInboxMessage["kind"]; playerId: string; playerName: string; clubName: string;
  fee?: number; expires?: string;
};

/**
 * Maybe one more rival for `player` today (the first offer of the day on a live conversation).
 * Returns the market with it and the inbox news (only when the seller would accept it).
 */
export async function rollRivalFor(
  service: SaveService, saveId: string,
  args: { market: MarketState; player: RosterPlayer; seller: Squad; humanId: string; date: string; windows: WindowContext },
): Promise<{ market: MarketState; rival: RivalBid | null; news: News | null }> {
  const { market, player, seller, date, windows } = args;
  const existing = liveRivals(market.rivalBids, player.id, date);
  const cache = new Map<string, Squad | null>();
  // Profiles hold the needs; only clubs with a need on his line are read from disk.
  const squads = new Map<string, Squad>();
  for (const [id, prof] of Object.entries(market.profiles ?? {})) {
    if (!prof.needs?.length || id === seller.id || id === args.humanId) continue;
    if (!cache.has(id)) cache.set(id, await service.getSquadById(saveId, id));
    const sq = cache.get(id);
    if (sq) squads.set(id, sq);
  }
  const candidates = rivalCandidates({
    player, sellerId: seller.id, humanId: args.humanId, profiles: market.profiles ?? {},
    squadOf: (id) => squads.get(id) ?? null,
    windowOpen: (sq) => windows.ofLeague(sq.leagueSlug ?? "").open,
  });
  const rival = rollRival({
    player, seller, candidates, existing, date,
    closesOn: (sq) => windows.ofLeague(sq.leagueSlug ?? "").until,
    rng: mulberry32(seedFrom(`${saveId}:${player.id}:${date}:rival`)),
  });
  if (!rival) return { market, rival: null, news: null };
  return {
    market: { ...market, rivalBids: [...(market.rivalBids ?? []).filter((r) => r.deadline >= date), rival] },
    rival,
    news: rival.sellerAccepts
      ? { date, kind: "rival_bid", playerId: player.id, playerName: player.name, clubName: rival.clubName, fee: rival.fee, expires: rival.deadline }
      : null,
  };
}

/**
 * Rivals whose deadline is today: when the seller accepts the rival's fee, the player goes there
 * (an AI × AI transfer, same path as the market), the human's talk closes as "lost". Rivals the
 * seller would not accept just lapse.
 */
export async function resolveRivalDeadlines(
  service: SaveService, saveId: string, meta: SaveMeta,
  args: { market: MarketState; date: string; windows: WindowContext },
): Promise<{ market: MarketState; meta: SaveMeta; news: News[]; moves: DayTransfer[] }> {
  const { date } = args;
  let market = args.market;
  let workingMeta = meta;
  const news: News[] = [];
  const moves: DayTransfer[] = [];
  const due = (market.rivalBids ?? []).filter((r) => r.deadline <= date);
  if (due.length === 0) return { market, meta, news, moves };
  const done = new Set<string>();
  for (const r of [...due].sort((a, b) => b.fee - a.fee)) {
    if (done.has(r.playerId) || !r.sellerAccepts) continue;
    const seller = await service.getSquadById(saveId, r.fromClubId);
    const buyer = await service.getSquadById(saveId, r.clubId);
    const player = seller?.players.find((p) => p.id === r.playerId && !p.loan);
    if (!seller || !buyer || !player || buyer.players.length >= MAX_SQUAD) continue;
    if (!args.windows.ofLeague(buyer.leagueSlug ?? "").open || aiTransferBudgetOf(buyer) < r.fee) continue;
    const sellerRef = await service.resolveSquadId(saveId, seller.id);
    const buyerRef = await service.resolveSquadId(saveId, buyer.id);
    if (!sellerRef || !buyerRef) continue;
    const end = seasonEndOf(meta.activeLeagues, buyerRef.leagueSlug, date);
    const contract = { wage: r.wage, until: contractEndFor(date, end, aiRenewalYears(player)) };
    const { selling, buying } = squadsAfterAcceptedTransfer(
      player, seller, buyer, buyer.id, player.id, contract, historyFromOf(meta.activeLeagues, sellerRef.leagueSlug),
    );
    const owed = sellOnFor(player, seller.id, r.fee);
    workingMeta = await executeTransferFee(
      saveId, workingMeta,
      { squad: buying, ...buyerRef, isPlayerClub: false },
      { squad: selling, ...sellerRef, isPlayerClub: false },
      r.fee, service,
      { playerName: player.name, playerId: player.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) },
    );
    const sellOnNews = await settleSellOn(service, saveId, workingMeta, owed, player, seller.name, date);
    if (sellOnNews) news.push(sellOnNews);
    const seasonOf = (slug: string) => {
      const l = (meta.activeLeagues ?? []).find((x) => x.leagueSlug === slug);
      return l ? seasonLabel(l.year, l.start, l.end) : date.slice(0, 4);
    };
    await recordTransferHistory(service, saveId, {
      buyer: buying, seller: selling, playerId: player.id, fee: r.fee, date,
      buyerSeason: seasonOf(buyerRef.leagueSlug), sellerSeason: seasonOf(sellerRef.leagueSlug),
    });
    const record: TransferRecord = {
      id: randomUUID(), date, playerId: player.id, playerName: player.name, playerPosition: player.positions[0] ?? "—",
      playerAge: player.age, fromSquadId: seller.id, fromSquadName: seller.name, toSquadId: buyer.id, toSquadName: buyer.name,
      fee: r.fee, direction: "in", status: "accepted", reason: "AI transfer",
    };
    await service.appendTransfer(saveId, record);
    await service.appendDayEvent(saveId, date, { kind: "transfer_ref", transferId: record.id });
    moves.push({ playerId: player.id, from: seller.id, to: buyer.id, fee: r.fee, kind: "transfer", date });
    done.add(r.playerId);
    news.push({ date, kind: "lost_to_rival", playerId: player.id, playerName: player.name, clubName: buyer.name, fee: r.fee });
    const key = talkKey("transfer", player.id);
    const talk = market.talks?.[key];
    market = {
      ...market,
      lostTargets: [...(market.lostTargets ?? []).slice(-9), { playerId: player.id, clubName: buyer.name, fee: r.fee, date }],
      ...(talk ? { talks: { ...market.talks, [key]: { ...talk, date, history: [...talk.history, { by: "club" as const, fee: r.fee, outcome: "lost" as const }].slice(-12) } } } : {}),
    };
  }
  market = { ...market, rivalBids: (market.rivalBids ?? []).filter((r) => r.deadline > date && !done.has(r.playerId)) };
  return { market, meta: workingMeta, news, moves };
}

/** Prestige 0..1 of two clubs (world percentile, cached per month). */
export async function prestigeOf(service: SaveService, saveId: string, date: string, ids: string[]): Promise<Map<string, number>> {
  const index = await service.getSquadIndex(saveId);
  const map = await worldPrestige(service, saveId, date, index);
  return new Map(ids.map((id) => [id, map.get(id) ?? 0.5] as const));
}

/**
 * Pre-contracts of players whose club rolls today (D2): before the AI renewals, each player leaves
 * his club for free and joins the human club with the agreed contract. Falls through (inbox) when
 * he is gone from that club, the human squad is full or the manager changed club.
 */
export async function applyDuePreContracts(
  service: SaveService, saveId: string, meta: SaveMeta,
  args: { unitIds: Set<string>; date: string; humanClubId: string | null },
): Promise<{ news: News[]; moves: DayTransfer[] }> {
  const market = await service.getMarket(saveId);
  const due = (market?.preContracts ?? []).filter((p) => args.unitIds.has(p.fromClubId));
  if (!market || due.length === 0) return { news: [], moves: [] };
  const news: News[] = [];
  const moves: DayTransfer[] = [];
  for (const pc of due) {
    const from = await service.getSquadById(saveId, pc.fromClubId);
    const player = from?.players.find((p) => p.id === pc.playerId && !p.loan);
    const human = args.humanClubId === pc.toClubId ? await service.getSquadById(saveId, pc.toClubId) : null;
    const full = human ? (await humanRosterSize(service, saveId, human)) >= MAX_SQUAD : true;
    if (!from || !player || !human || full) {
      news.push({ date: args.date, kind: "pre_contract_failed", playerId: pc.playerId, playerName: pc.playerName, clubName: pc.fromClubName });
      continue;
    }
    const end = seasonEndOf(meta.activeLeagues, human.leagueSlug, args.date);
    const contract = { wage: pc.wage, until: contractEndFor(args.date, end, pc.years) };
    const { selling, buying } = squadsAfterAcceptedTransfer(
      player, from, human, human.id, player.id, contract, historyFromOf(meta.activeLeagues, from.leagueSlug),
    );
    await service.saveSquadById(saveId, selling);
    await service.saveSquadById(saveId, buying);
    moves.push({ playerId: player.id, from: from.id, to: human.id, fee: 0, kind: "pre_contract", date: args.date });
    news.push({ date: args.date, kind: "pre_contract_joined", playerId: player.id, playerName: player.name, clubName: from.name });
  }
  const latest = (await service.getMarket(saveId)) ?? market;
  const doneIds = new Set(due.map((p) => p.playerId));
  await service.saveMarket(saveId, { ...latest, preContracts: (latest.preContracts ?? []).filter((p) => !doneIds.has(p.playerId)) });
  return { news, moves };
}
