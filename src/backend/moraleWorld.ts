/**
 * Morale I/O (`.claude/rules/game/morale.md`): one day of the human club's morale (called by
 * `advanceDay` after the matches, training and market of the day) and the sell-list side effects of
 * a transfer request. The model itself is pure (`src/Domain/morale/morale.ts`).
 */
import { randomUUID } from "node:crypto";
import type { SaveService } from "@/backend/SaveService";
import { emptyMarket } from "@/backend/negotiationWorld";
import { computeMinutesPlayed } from "@/Domain/advanceDay/matches";
import { moraleDay, type ClubMatchSummary, type PlayerNews } from "@/Domain/morale/morale";
import { teamAvgRating } from "@/Domain/transfer/transferNeeds";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { MarketState, SellCandidate } from "@/types/transferMarketTypes";

/** The human club's side of a played match: result (penalties decide a level knockout) and minutes. */
export function clubMatchSummary(event: MatchEvent, clubId: string): ClubMatchSummary | null {
  const side = event.home === clubId ? "home" : event.away === clubId ? "away" : null;
  if (!side) return null;
  const mine = event.score[side];
  const theirs = event.score[side === "home" ? "away" : "home"];
  let result: ClubMatchSummary["result"] = mine > theirs ? "W" : mine < theirs ? "L" : "D";
  const pens = event.decider?.penalties;
  if (result === "D" && pens && pens.home !== pens.away) {
    result = (side === "home" ? pens.home > pens.away : pens.away > pens.home) ? "W" : "L";
  }
  const ids = Object.keys(event.playerStats).filter((id) => event.playerTeams[id] === side);
  const minutes = computeMinutesPlayed(ids, event.substitutions ?? [], event.decider ? 120 : 90);
  const goals: Record<string, number> = {};
  const ratings: Record<string, number> = {};
  for (const id of ids) {
    goals[id] = event.playerStats[id]!.goals;
    const r = event.playerRatings[id];
    if (r !== undefined) ratings[id] = r;
  }
  return { result, minutes, goals, ratings };
}

/** Puts requested players on the sell list (flagged) and takes withdrawn requests off it. */
export function marketAfterRequests(market: MarketState, add: string[], remove: string[]): MarketState {
  if (add.length === 0 && remove.length === 0) return market;
  const drop = new Set(remove);
  const list: SellCandidate[] = (market.playerSellList ?? []).filter((c) => !(drop.has(c.playerId) && c.requested));
  for (const id of add) {
    const i = list.findIndex((c) => c.playerId === id);
    if (i >= 0) list[i] = { ...list[i]!, requested: true };
    else list.push({ playerId: id, priority: 1, requested: true });
  }
  return { ...market, playerSellList: list };
}

/**
 * One day of morale for the human club `clubId`: today's matches, bids that arrived today, the
 * Monday update. Writes the squad (and the market when a transfer request changes the sell list)
 * and returns the inbox news (emitted by the caller after any `clearInbox`).
 */
export async function applyMoraleDay(
  service: SaveService,
  saveId: string,
  args: {
    clubId: string;
    date: string;
    events: MatchEvent[];
    bids: { playerId: string; clubId: string; clubName: string }[];
  },
): Promise<PlayerNews[]> {
  const squad = await service.getSquadById(saveId, args.clubId);
  if (!squad) return [];
  const matches = args.events
    .map((e) => clubMatchSummary(e, args.clubId))
    .filter((m): m is ClubMatchSummary => m !== null);
  const avg = teamAvgRating(squad);
  const bids: { playerId: string; clubName: string; stronger: boolean }[] = [];
  for (const b of args.bids) {
    const buyer = await service.getSquadById(saveId, b.clubId);
    bids.push({ playerId: b.playerId, clubName: b.clubName, stronger: buyer ? teamAvgRating(buyer) > avg : false });
  }
  const market = await service.getMarket(saveId);
  const out = moraleDay({
    squad,
    date: args.date,
    monday: new Date(`${args.date}T12:00:00Z`).getUTCDay() === 1,
    matches,
    bids,
    sellList: market?.playerSellList ?? [],
    newId: () => randomUUID(),
  });
  await service.saveSquadById(saveId, out.squad);
  if (market && (out.listRequested.length > 0 || out.unlistRequested.length > 0)) {
    await service.saveMarket(saveId, marketAfterRequests(market, out.listRequested, out.unlistRequested));
  } else if (!market && out.listRequested.length > 0) {
    // No market file yet (first days): the next tick builds one from this list.
    await service.saveMarket(saveId, marketAfterRequests(emptyMarket(), out.listRequested, []));
  }
  return out.news;
}
