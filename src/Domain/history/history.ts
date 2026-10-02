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

/** Season counters a history row is made of (also the shape of an open partial row's stats). */
interface RowStats {
  apps: number; goals: number; assists: number; ratingSum: number;
  cupApps: number; cupGoals: number; contApps: number; contGoals: number;
}

function statsOfLog(log: PlayerSeasonLog): RowStats {
  return {
    apps: log.appearances, goals: log.goals, assists: log.assists,
    ratingSum: log.avgRating > 0 ? log.avgRating * log.appearances : 0,
    cupApps: log.cup?.appearances ?? 0, cupGoals: log.cup?.goals ?? 0,
    contApps: log.continental?.appearances ?? 0, contGoals: log.continental?.goals ?? 0,
  };
}

/**
 * Partial rows written since the last season reset (`open: true`): their stats are still inside the
 * player's `seasonLog`, so every later row of the same log subtracts them.
 */
function openPartials(history: PlayerHistoryRow[] | undefined): PlayerHistoryRow[] {
  return (history ?? []).filter((r) => r.open);
}

/** `log` minus the open partial rows (never below 0). */
function remainingStats(log: PlayerSeasonLog, history: PlayerHistoryRow[] | undefined): RowStats {
  const s = statsOfLog(log);
  for (const r of openPartials(history)) {
    s.apps -= r.apps; s.goals -= r.goals; s.assists -= r.assists;
    s.ratingSum -= (r.avgRating ?? 0) * r.apps;
    s.cupApps -= r.cupApps; s.cupGoals -= r.cupGoals; s.contApps -= r.contApps; s.contGoals -= r.contGoals;
  }
  for (const k of Object.keys(s) as (keyof RowStats)[]) s[k] = Math.max(0, s[k]);
  return s;
}

function rowFromStats(s: RowStats, club: HistoryClub, season: string, titles: string[]): PlayerHistoryRow | null {
  if (s.apps <= 0) return null;
  const avg = s.ratingSum > 0 ? s.ratingSum / s.apps : 0;
  return {
    season, squadId: club.squadId, clubName: club.clubName, league: club.league,
    apps: s.apps, goals: s.goals, assists: s.assists,
    avgRating: avg > 0 ? Math.round(avg * 100) / 100 : null,
    cupApps: s.cupApps, cupGoals: s.cupGoals, contApps: s.contApps, contGoals: s.contGoals,
    titles: [...titles],
  };
}

/**
 * The row of the player's current club from a season log: the log totals minus the open partial
 * rows (stints at clubs he left earlier this season). `null` when nothing is left (no games here).
 */
export function historyRowFromLog(
  log: PlayerSeasonLog | undefined, club: HistoryClub, season: string, titles: string[] = [],
  history?: PlayerHistoryRow[],
): PlayerHistoryRow | null {
  if (!log) return null;
  return rowFromStats(remainingStats(log, history), club, season, titles);
}

/** Appends `row` (if any) to the player's history. Returns the same player when nothing changes. */
export function appendHistoryRow(player: RosterPlayer, row: PlayerHistoryRow | null): RosterPlayer {
  if (!row) return player;
  return { ...player, history: [...(player.history ?? []), row] };
}

/**
 * A player leaves a club mid-season (transfer): appends an open partial row with his stats at the
 * old club so far. The `seasonLog` is NOT touched — the engine reads its form/training data and the
 * league archive, rankings, stars and retirement read its totals; the next season row subtracts
 * the open partials instead (`.claude/rules/game/history.md`).
 */
export function closePartialSeason(player: RosterPlayer, club: HistoryClub, season: string): RosterPlayer {
  const row = historyRowFromLog(player.seasonLog, club, season, [], player.history);
  return row ? appendHistoryRow(player, { ...row, partial: true, open: true }) : player;
}

/** The season log was reset (rollover): its open partial rows are settled. */
function settleOpenPartials(history: PlayerHistoryRow[] | undefined): PlayerHistoryRow[] | undefined {
  if (!history?.some((r) => r.open)) return history;
  return history.map((r) => {
    if (!r.open) return r;
    const { open: _, ...rest } = r;
    return rest;
  });
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
 * archive, since the squad is already reset) minus his open partial rows (stints at clubs he left
 * this season), plus `titles` (league + pending titles). The open partials are then settled. A
 * player without games here gets no row (and no title).
 */
export function closeSeasonForPlayers(
  players: RosterPlayer[], logs: Record<string, PlayerSeasonLog>, club: HistoryClub, season: string, titles: string[],
): RosterPlayer[] {
  return players.map((p) => {
    const row = historyRowFromLog(logs[p.id], club, season, titles, p.history);
    const history = settleOpenPartials(p.history);
    const settled = history === p.history ? p : { ...p, history };
    return appendHistoryRow(settled, row);
  });
}
