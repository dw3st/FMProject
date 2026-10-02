import { emptySeasonLog } from "@/types/playerTypes";
import type { PlayerHistoryRow, PlayerSeasonLog, RosterPlayer } from "@/types/playerTypes";

/** Pure player-history helpers (`.claude/rules/game/history.md`). No I/O. */

export interface HistoryClub {
  squadId: string;
  clubName: string;
  league: string;
}

/** "2026-27" for a league crossing the year, "2027" otherwise. */
export function seasonLabel(year: number, start: string, end: string): string {
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  return String(year);
}

/** One history row from a season log; `null` when the player did not play. */
export function historyRowFromLog(
  log: PlayerSeasonLog | undefined, club: HistoryClub, season: string, titles: string[] = [],
): PlayerHistoryRow | null {
  if (!log || log.appearances <= 0) return null;
  return {
    season, squadId: club.squadId, clubName: club.clubName, league: club.league,
    apps: log.appearances, goals: log.goals, assists: log.assists,
    avgRating: log.avgRating > 0 ? Math.round(log.avgRating * 100) / 100 : null,
    cupApps: log.cup?.appearances ?? 0, cupGoals: log.cup?.goals ?? 0,
    contApps: log.continental?.appearances ?? 0, contGoals: log.continental?.goals ?? 0,
    titles: [...titles],
  };
}

/** Appends `row` (if any) to the player's history. Returns the same player when nothing changes. */
export function appendHistoryRow(player: RosterPlayer, row: PlayerHistoryRow | null): RosterPlayer {
  if (!row) return player;
  return { ...player, history: [...(player.history ?? []), row] };
}

/** Adds a title to the last row; never creates a row. Returns the same player when there is no row or it's already there. */
export function addTitle(player: RosterPlayer, title: string): RosterPlayer {
  const h = player.history;
  if (!h || h.length === 0) return player;
  const last = h[h.length - 1]!;
  if (last.titles.includes(title)) return player;
  return { ...player, history: [...h.slice(0, -1), { ...last, titles: [...last.titles, title] }] };
}

/**
 * Closes a partial row at the old club when a player leaves mid-season (transfer, release) and
 * zeroes the season counters. Fitness, load and morale are kept.
 */
export function closePartialSeason(player: RosterPlayer, club: HistoryClub, season: string): RosterPlayer {
  const log = player.seasonLog;
  if (!log) return player;
  const withRow = appendHistoryRow(player, historyRowFromLog(log, club, season));
  const fresh = emptySeasonLog();
  return {
    ...withRow,
    seasonLog: { ...fresh, fitness: log.fitness, morale: log.morale, ...(log.load !== undefined ? { load: log.load } : {}) },
  };
}

/** Merges new titles into a pending map (no duplicates). */
export function addPendingTitle(
  pending: Record<string, string[]>, squadId: string, title: string,
): Record<string, string[]> {
  const cur = pending[squadId] ?? [];
  if (cur.includes(title)) return pending;
  return { ...pending, [squadId]: [...cur, title] };
}

/**
 * Season-end rows for one squad at rollover: every player gets the row of his closed log (from the
 * archive, since the squad is already reset), plus `titles` (league + pending titles). A player
 * without games gets no row (and no title).
 */
export function closeSeasonForPlayers(
  players: RosterPlayer[], logs: Record<string, PlayerSeasonLog>, club: HistoryClub, season: string, titles: string[],
): RosterPlayer[] {
  return players.map((p) => {
    return appendHistoryRow(p, historyRowFromLog(logs[p.id], club, season, titles));
  });
}
