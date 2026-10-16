import type {
  AdvanceDayResponse, DayEvent, DayLog, RestEffect, RestEvent, TrainingEffect, TrainingEvent,
} from "@/types/dayLogTypes";
import type { PendingDay, PendingSummaryAggregate } from "@/types/groupAdvanceTypes";

/** Per-player training effects of several days summed (fitness, training points, DP, attribute changes). */
export function sumTrainingEffects(lists: readonly (readonly TrainingEffect[])[]): TrainingEffect[] {
  const byId = new Map<string, TrainingEffect>();
  for (const list of lists) {
    for (const e of list) {
      const prev = byId.get(e.playerId);
      if (!prev) {
        byId.set(e.playerId, { ...e, ...(e.levelChanges ? { levelChanges: [...e.levelChanges] } : {}) });
        continue;
      }
      prev.fitnessDelta += e.fitnessDelta;
      prev.trainingPoints += e.trainingPoints;
      if (e.dpGained !== undefined) prev.dpGained = (prev.dpGained ?? 0) + e.dpGained;
      if (e.levelChanges) prev.levelChanges = [...(prev.levelChanges ?? []), ...e.levelChanges];
    }
  }
  return [...byId.values()];
}

/** Per-player rest effects of several days summed. */
export function sumRestEffects(lists: readonly (readonly RestEffect[])[]): RestEffect[] {
  const byId = new Map<string, RestEffect>();
  for (const list of lists) {
    for (const e of list) {
      const prev = byId.get(e.playerId);
      if (!prev) byId.set(e.playerId, { ...e });
      else {
        prev.fitnessDelta += e.fitnessDelta;
        prev.pointsDelta += e.pointsDelta;
      }
    }
  }
  return [...byId.values()];
}

/**
 * One summary for every day the executor ran while the seat was away (`.claude/rules/game/multiplayer.md`, part 3):
 * the club's games and transfers of all the days, the club's training and rest of all the days summed per player
 * (from the effects kept in each pending day; without them, the last day's log), the seat's part summed
 * (achievements, press invite) and the stops that cleared his "ready until". `logs[i]` is the day log of `days[i]`
 * (null when it is gone). Null without days.
 */
export function aggregatePendingDays(
  days: readonly PendingDay[], logs: readonly (DayLog | null)[], clubId: string,
): PendingSummaryAggregate | null {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return null;
  const withEffects = days.some((d) => d.club && d.club.length > 0);
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
      } else if (!withEffects && isLast && e.squadId === clubId) {
        events.push(e);
      }
    }
  });

  let trainingDays = 0;
  let restDays = 0;
  if (withEffects) {
    const training: TrainingEffect[][] = [];
    const rest: RestEffect[][] = [];
    let squadId = clubId;
    for (const d of days) {
      for (const e of d.club ?? []) {
        squadId = e.squadId;
        if (e.kind === "training") { trainingDays++; training.push(e.effects ?? []); }
        else { restDays++; rest.push(e.effects ?? []); }
      }
    }
    if (trainingDays > 0) events.push({ kind: "training", squadId, effects: sumTrainingEffects(training) } satisfies TrainingEvent);
    if (restDays > 0) events.push({ kind: "rest", squadId, effects: sumRestEffects(rest) } satisfies RestEvent);
  }

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
    range: {
      from: first.date, to: last.date, days: days.length,
      ...(withEffects ? { trainingDays, restDays } : {}),
    },
    log,
    matchReportDate,
    notices: { jobOffers, sacked, seasonEnded, pressInvite, readyCleared: jobOffers > 0 || sacked || seasonEnded },
  };
}
