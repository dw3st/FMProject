import type { MatchTeamStats, StoredDayLog } from "@/types/dayLogTypes";

/**
 * Day logs older than this many days are compacted (tester-report save analysis, 4.39): a two-season world had
 * 170 MB of day logs, ~130 MB per season, almost all of it the full player stats of every engine match and one
 * training/rest line per club per day.
 */
export const DAY_LOG_KEEP_FULL_DAYS = 60;
/** Logs compacted per day at most, so a world with a long backlog catches up over a few days. */
export const DAY_LOG_COMPACT_PER_DAY = 40;
/** Oldest date looked at when a world has never compacted (no cursor yet). */
export const DAY_LOG_COMPACT_LOOKBACK_DAYS = 900;

/**
 * The compacted log: training and rest lines dropped (they never stored their effects), and the matches of clubs
 * without a human seat reduced to the result, scorers, cards, injuries, substitutions, goals and referee (the
 * `compact` form the quickSim already writes). A human club's matches stay whole (its match pages).
 * `null` when there was nothing to compact.
 */
export function compactDayLog(log: StoredDayLog, humanClubs: ReadonlySet<string>): StoredDayLog | null {
  let changed = false;
  const events: StoredDayLog["events"] = [];
  for (const e of log.events) {
    if (e.kind === "training" || e.kind === "rest") { changed = true; continue; }
    if (e.kind === "match" && !e.compact && !humanClubs.has(e.home) && !humanClubs.has(e.away)) {
      changed = true;
      events.push({ ...e, playerStats: {}, playerRatings: {}, developmentChanges: [], compact: true });
      continue;
    }
    events.push(e);
  }
  return changed ? { ...log, events } : null;
}

/**
 * Day logs older than this are slimmed a second time (2026-11-16 soak: compacted logs still grew ~105 MB a
 * season). No screen reads an AI match of a past season: the league fixtures of the Leagues screen are the
 * current season's only (the calendar is rebuilt at the rollover) and the match pages are the human's.
 */
export const DAY_LOG_KEEP_COMPACT_DAYS = 400;

/**
 * The slim log: a match of clubs without a human seat keeps only the result, the knockout decider, the scorers
 * (with their names) and the five required team numbers; cards, substitutions, injuries, referee, VAR, weather
 * and pitch go. Youth games keep the result only (nothing reads past ones). A human club's games stay whole.
 * `null` when there was nothing to slim.
 */
export function slimDayLog(log: StoredDayLog, humanClubs: ReadonlySet<string>): StoredDayLog | null {
  let changed = false;
  const events: StoredDayLog["events"] = [];
  for (const e of log.events) {
    if (e.kind === "training" || e.kind === "rest") { changed = true; continue; }
    if (e.kind !== "match" || e.slim || humanClubs.has(e.home) || humanClubs.has(e.away)) { events.push(e); continue; }
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
    !humanClubs.has(y.home) && !humanClubs.has(y.away) && (y.best !== null || y.scorers.length > 0 || y.players.home.length + y.players.away.length > 0);
  if (youthMatches?.some(fullYouth)) {
    changed = true;
    youthMatches = youthMatches.map((y) => fullYouth(y) ? { ...y, scorers: [], best: null, players: { home: [], away: [] } } : y);
  }
  return changed ? { ...log, events, ...(youthMatches ? { youthMatches } : {}) } : null;
}
