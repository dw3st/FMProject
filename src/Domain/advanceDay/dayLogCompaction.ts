import type { MatchTeamStats, StoredDayLog } from "@/types/dayLogTypes";

/**
 * Day logs older than this many days are slimmed (tester-report save analysis, 4.39; 2026-11-16 soak: a 20-season
 * world reached 3 GB, 2 GB of it day logs). Within the current season the Leagues screen still opens an AI match
 * (result and scorers); its cards, players and referee are not needed any more.
 */
export const DAY_LOG_KEEP_FULL_DAYS = 60;
/**
 * Past this, an AI game leaves the log altogether: no screen reads an AI match of a past season (the Leagues
 * fixtures are the current season's only, the calendar is rebuilt at the rollover). A human club's games stay.
 */
export const DAY_LOG_KEEP_DAYS = 400;
/** Logs rewritten per day at most (per pass), so a world with a long backlog catches up over a few days. */
export const DAY_LOG_COMPACT_PER_DAY = 40;
/** Oldest date looked at when a world has never compacted (no cursor yet). */
export const DAY_LOG_COMPACT_LOOKBACK_DAYS = 900;

const humanGame = (humanClubs: ReadonlySet<string>, home: string, away: string) => humanClubs.has(home) || humanClubs.has(away);

/**
 * The slim log: training and rest lines dropped (they never stored their effects); a match of clubs without a
 * human seat keeps only the result, the knockout decider, the scorers (with their names) and the five required
 * team numbers; AI youth games keep the result only. A human club's games stay whole (its match pages).
 * `null` when there was nothing to slim.
 */
export function slimDayLog(log: StoredDayLog, humanClubs: ReadonlySet<string>): StoredDayLog | null {
  let changed = false;
  const events: StoredDayLog["events"] = [];
  for (const e of log.events) {
    if (e.kind === "training" || e.kind === "rest") { changed = true; continue; }
    if (e.kind !== "match" || e.slim || humanGame(humanClubs, e.home, e.away)) { events.push(e); continue; }
    changed = true;
    const names: Record<string, string> = {};
    for (const s of e.scorers) names[s.playerId] = s.playerName;
    const team = (t: MatchTeamStats): MatchTeamStats => ({
      shots: t.shots, passesCompleted: t.passesCompleted, passesAttempted: t.passesAttempted,
      tackles: t.tackles, interceptions: t.interceptions,
    });
    events.push({
      kind: "match", fixtureId: e.fixtureId, competition: e.competition, round: e.round, home: e.home, away: e.away,
      score: e.score, teamStats: { home: team(e.teamStats.home), away: team(e.teamStats.away) },
      playerStats: {}, playerRatings: {}, playerNames: names, playerTeams: {}, scorers: e.scorers,
      substitutions: [], developmentChanges: [], durationMs: 0,
      ...(e.decider ? { decider: e.decider } : {}), compact: true, slim: true,
    });
  }
  let youthMatches = log.youthMatches;
  const fullYouth = (y: NonNullable<StoredDayLog["youthMatches"]>[number]) =>
    !humanGame(humanClubs, y.home, y.away) && (y.best !== null || y.scorers.length > 0 || y.players.home.length + y.players.away.length > 0);
  if (youthMatches?.some(fullYouth)) {
    changed = true;
    youthMatches = youthMatches.map((y) => fullYouth(y) ? { ...y, scorers: [], best: null, players: { home: [], away: [] } } : y);
  }
  return changed ? { ...log, events, ...(youthMatches ? { youthMatches } : {}) } : null;
}

/**
 * The pruned log, past `DAY_LOG_KEEP_DAYS`: only a human club's games (first team, youth) and the seats' national
 * games stay; AI games, the day's transfers and the counters go. `null` when there was nothing to prune.
 */
export function pruneDayLog(log: StoredDayLog, humanClubs: ReadonlySet<string>): StoredDayLog | null {
  const events = log.events.filter((e) => e.kind === "match" && humanGame(humanClubs, e.home, e.away));
  const youthMatches = (log.youthMatches ?? []).filter((y) => humanGame(humanClubs, y.home, y.away));
  const changed = events.length !== log.events.length
    || youthMatches.length !== (log.youthMatches?.length ?? 0)
    || log.transfers !== undefined || log.registrationViolations !== undefined;
  if (!changed) return null;
  return {
    saveId: log.saveId, date: log.date, events,
    ...(youthMatches.length > 0 ? { youthMatches } : {}),
    ...(log.nationalMatches ? { nationalMatches: log.nationalMatches } : {}),
  };
}
