import type { PendingDay } from "@/types/groupAdvanceTypes";
import type { SeasonNotice } from "@/GameInterface/useAdvanceDay";
import type { ClubMove } from "@/types/pyramidTypes";

/** Time left until the deadline: hours (rounded up), or minutes in the last hour; null when none or passed. */
export function deadlineLeft(deadlineAt: string | null, nowMs: number): { hours: number | null; minutes: number | null } | null {
  if (!deadlineAt) return null;
  const ms = Date.parse(deadlineAt) - nowMs;
  if (ms <= 0) return null;
  if (ms < 3_600_000) return { hours: null, minutes: Math.max(1, Math.ceil(ms / 60_000)) };
  return { hours: Math.ceil(ms / 3_600_000), minutes: null };
}

export interface SummaryOutcome {
  lastDate: string;
  newDate: string;
  notice: SeasonNotice | null;
  sacked: boolean;
  jobOffers: boolean;
}

/** What the dashboard shows after the days that ran without the seat looking. */
export function summaryOutcome(days: readonly PendingDay[]): SummaryOutcome | null {
  const last = days[days.length - 1];
  if (!last) return null;
  const season = [...days].reverse().find((d) => d.seat.seasonEnded === true)?.seat;
  return {
    lastDate: last.date,
    newDate: last.newDate,
    sacked: days.some((d) => d.seat.sacked === true),
    jobOffers: days.some((d) => typeof d.seat.jobOffers === "number" && d.seat.jobOffers > 0),
    notice: season
      ? {
        archiveYear: typeof season.archiveYear === "number" ? season.archiveYear : undefined,
        moves: (season.moves as ClubMove[] | undefined) ?? [],
        playerMove: (season.playerMove as ClubMove | null | undefined) ?? null,
        playerChampionOf: (season.playerChampionOf as string | null | undefined) ?? null,
      }
      : null,
  };
}
