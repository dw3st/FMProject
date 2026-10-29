import type { StoredDayLog } from "@/types/dayLogTypes";

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
