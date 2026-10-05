import type { SaveService } from "@/backend/SaveService";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import {
  applySeason, applyTransfer, clubMatchesOf, emptyClubHistory, type ClubPlayerRow,
} from "@/Domain/clubHistory/clubHistory";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";

/**
 * Club-history I/O (`.claude/rules/game/club-history.md`): the season rows at a country rollover
 * and the transfer records at a fee transfer. Writes go through the caller's service (the day's
 * buffered DAL in `advanceOneDay`).
 */

/** Fixtures of the country's cup and of every continental competition (read once per rollover unit). */
export async function cupAndContinentalFixtures(
  service: SaveService, saveId: string, country: string | null,
): Promise<Fixture[]> {
  const slugs = [...(country ? [cupSlugOf(country)] : []), ...CONTINENTAL_SLUGS];
  const all = await Promise.all(slugs.map((s) => service.getAllFixturesForLeague(saveId, s)));
  return all.flat();
}

export interface LeagueSeasonHistoryArgs {
  league: string;
  tier: number;
  season: string;
  /** League season window (other competitions' matches inside it count for the records). */
  start: string;
  end: string;
  table: StandingRow[];
  /** The league's fixtures + the cup/continental ones (`cupAndContinentalFixtures`). */
  fixtures: Fixture[];
  /** Squads of the league at the rollover, with this season's history rows already appended. */
  squads: Squad[];
  /** League + pending cup/continental titles per club (the same map the player history rows use). */
  titlesByClub: Record<string, string[]>;
  tierChanges: Record<string, { from: number; to: number }>;
  nameOf: (squadId: string) => string;
  /** Club whose broken records the caller wants back (the player's club). */
  watchSquadId?: string | null;
}

/**
 * Adds the closed season to the history of every club of a rolled league. Returns the records
 * of `watchSquadId` that were beaten.
 */
export async function recordLeagueSeasonHistory(
  service: SaveService, saveId: string, a: LeagueSeasonHistoryArgs,
): Promise<ClubRecordBroken[]> {
  const managers = await service.getManagers(saveId);
  let watched: ClubRecordBroken[] = [];
  for (const squad of a.squads) {
    const tablePos = a.table.findIndex((r) => r.squadId === squad.id);
    const standing = tablePos >= 0 ? a.table[tablePos]! : null;
    const tc = a.tierChanges[squad.id];
    const move = tc ? (tc.to < tc.from ? "promoted" : tc.to > tc.from ? "relegated" : undefined) : undefined;
    const players: ClubPlayerRow[] = [];
    for (const p of squad.players) {
      const row = [...(p.history ?? [])].reverse()
        .find((r) => r.season === a.season && r.squadId === squad.id && !r.partial);
      if (row) players.push({ playerId: p.id, name: p.name, row });
    }
    const manager = managers.find((m) => m.squadId === squad.id)?.name;
    const current = (await service.getClubHistory(saveId, squad.id)) ?? emptyClubHistory(squad.id);
    const { history, broken } = applySeason(current, {
      season: a.season, league: a.league, tier: a.tier, standing,
      position: standing && standing.mp > 0 ? tablePos + 1 : null,
      titles: [...(a.titlesByClub[squad.id] ?? []), ...(move === "promoted" ? [`promotion:${a.league}`] : [])],
      ...(move ? { move } : {}),
      ...(manager ? { manager } : {}),
      players,
      matches: clubMatchesOf(a.fixtures, squad.id, a.nameOf, { from: a.start, to: a.end }),
    });
    if (history !== current) await service.writeClubHistory(saveId, history);
    if (squad.id === a.watchSquadId) watched = broken;
  }
  return watched;
}

/**
 * A fee transfer (human or AI): the buyer's signing record, the seller's sale record and the
 * player's stats at the seller this season (his open partial row). `buyer` is the squad after the
 * move (the player is in it, with his partial row). Returns the beaten records per club.
 */
export async function recordTransferHistory(
  service: SaveService, saveId: string,
  t: { buyer: Squad; seller: Squad; playerId: string; fee: number; date: string; buyerSeason: string; sellerSeason: string },
): Promise<{ squadId: string; broken: ClubRecordBroken[] }[]> {
  const player = t.buyer.players.find((p) => p.id === t.playerId);
  if (!player) return [];
  const partialRow = [...(player.history ?? [])].reverse().find((r) => r.squadId === t.seller.id && r.open);
  const out: { squadId: string; broken: ClubRecordBroken[] }[] = [];

  const buyerHist = (await service.getClubHistory(saveId, t.buyer.id)) ?? emptyClubHistory(t.buyer.id);
  const bought = applyTransfer(buyerHist, {
    side: "signing",
    record: { playerId: player.id, name: player.name, fee: t.fee, season: t.buyerSeason, date: t.date, clubId: t.seller.id, clubName: t.seller.name },
  });
  if (bought.history !== buyerHist) await service.writeClubHistory(saveId, bought.history);
  out.push({ squadId: t.buyer.id, broken: bought.broken });

  const sellerHist = (await service.getClubHistory(saveId, t.seller.id)) ?? emptyClubHistory(t.seller.id);
  const sold = applyTransfer(sellerHist, {
    side: "sale",
    record: { playerId: player.id, name: player.name, fee: t.fee, season: t.sellerSeason, date: t.date, clubId: t.buyer.id, clubName: t.buyer.name },
    ...(partialRow ? { partial: { playerId: player.id, name: player.name, season: partialRow.season, row: partialRow } } : {}),
  });
  if (sold.history !== sellerHist) await service.writeClubHistory(saveId, sold.history);
  out.push({ squadId: t.seller.id, broken: sold.broken });
  return out;
}
