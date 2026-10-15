import type { AdvanceDayResponse, DayEvent, DayLog } from "@/types/dayLogTypes";
import type { PendingDay, PendingSummaryAggregate } from "@/types/groupAdvanceTypes";

/**
 * One summary for every day the executor ran while the seat was away (`.claude/rules/game/multiplayer.md`, part 3):
 * the club's games and transfers of all the days, the club's training/rest of the last day, the seat's part summed
 * (achievements, press invite) and the stops that cleared his "ready until". `logs[i]` is the day log of `days[i]`
 * (null when it is gone). Null without days.
 */
export function aggregatePendingDays(
  days: readonly PendingDay[], logs: readonly (DayLog | null)[], clubId: string,
): PendingSummaryAggregate | null {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return null;
  const events: DayEvent[] = [];
  let matchReportDate: string | null = null;
  days.forEach((d, i) => {
    const isLast = i === days.length - 1;
    for (const e of logs[i]?.events ?? []) {
      if (e.kind === "match") {
        if (e.home !== clubId && e.away !== clubId) continue;
        events.push(e);
        matchReportDate = d.date;
      } else if (e.kind === "transfer") {
        if (e.fromSquadId === clubId || e.toSquadId === clubId) events.push(e);
      } else if (isLast && e.squadId === clubId) {
        events.push(e);
      }
    }
  });
  const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  const achievements = days.reduce((n, d) => n + num(d.seat.achievements), 0);
  const jobOffers = days.reduce((n, d) => n + num(d.seat.jobOffers), 0);
  const sacked = days.some((d) => d.seat.sacked === true);
  const seasonEnded = days.some((d) => d.seat.seasonEnded === true);
  const pressInvite = days.some((d) => d.seat.pressInvite === true);
  const log: AdvanceDayResponse = {
    saveId: logs.find((l) => l)?.saveId ?? "",
    date: last.date,
    newDate: last.newDate,
    events,
    ...(achievements > 0 ? { achievements } : {}),
    ...(pressInvite ? { pressInvite: true as const } : {}),
  };
  return {
    range: { from: first.date, to: last.date, days: days.length },
    log,
    matchReportDate,
    notices: { jobOffers, sacked, seasonEnded, pressInvite, readyCleared: jobOffers > 0 || sacked || seasonEnded },
  };
}
