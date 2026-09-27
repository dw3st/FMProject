import { spreadOnWeekday } from "@/Domain/calendar/spreadDates";

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

const GROUP_STAGES = 6;
/** r16 (leg 1 + leg 2) + qf (leg 1 + leg 2) + sf (leg 1 + leg 2) + final. */
const KNOCKOUT_STAGES = 7;
const FINAL_BEFORE_END_DAYS = 7;
/** ≥ 6 days between two continental match dates — see the plan's "Ajuste consciente da spec". */
const MIN_GAP_DAYS = 6;

const CONTINENTAL_OPTIONS = {
  centerTargets: true,
  avoidBusyHarder: true,
  minGapFloor: 3,
  lastResortGapDays: 2,
  throwOnDegenerate: true,
} as const;

/**
 * 13 dates for a continental competition's season: 6 group-stage rounds, then the 7 knockout
 * rounds (r16 × 2 legs, qf × 2 legs, sf × 2 legs, final × 1).
 *
 * - Europe (season starting year `seasonYear`): groups in `[seasonYear-09-15, seasonYear-12-15]`;
 *   knockout in `[(seasonYear+1)-02-10, min(end − 7 days, (seasonYear+1)-05-31)]`. The spec's
 *   knockout window is Feb–May; without the upper clamp a calendar-year league finishing in
 *   November (part of the same continent's tier-1 set) would push `end` — and the whole knockout
 *   window — well past May.
 * - South America (calendar year `seasonYear`): groups in `[seasonYear-03-01, seasonYear-05-31]`;
 *   knockout in `[seasonYear-07-15, min(end − 7 days, seasonYear-11-30)]` (spec window Jul–Nov).
 *
 * `end` is the latest end date among the continent's top-tier leagues. Dates spread evenly inside
 * each window, snapped to the competition's `weekday` (0=Sun..6=Sat); a date is invalid if it is
 * in `busy` (the caller fills `busy` with the day before, the day itself and the day after each
 * participant's league/cup fixture) or less than `MIN_GAP_DAYS` after the previous continental
 * date. The group and knockout windows are searched harder than a cup's stage dates
 * (`avoidBusyHarder`): a busy day is only ever accepted once the *entire* remaining window has
 * been scanned at every gap down to 3 days, because landing on a busy day here means double-
 * booking a participant club, not just a tight cup schedule. A window with no room left for its
 * dates throws instead of silently packing/dropping one — see `spreadOnWeekday`.
 */
export function continentalDates(
  continent: "Europe" | "South America",
  seasonYear: number,
  end: string,
  weekday: number,
  busy: Set<string>,
): string[] {
  const Y = seasonYear;
  const groupStart = continent === "Europe" ? `${Y}-09-15` : `${Y}-03-01`;
  const groupEnd = continent === "Europe" ? `${Y}-12-15` : `${Y}-05-31`;
  const knockoutStart = continent === "Europe" ? `${Y + 1}-02-10` : `${Y}-07-15`;
  const knockoutWindowEnd = continent === "Europe" ? `${Y + 1}-05-31` : `${Y}-11-30`;

  const groupDates = spreadOnWeekday(
    toMs(groupStart),
    toMs(groupEnd),
    GROUP_STAGES,
    weekday,
    busy,
    MIN_GAP_DAYS,
    CONTINENTAL_OPTIONS,
  );

  const knockoutHi = Math.min(toMs(end) - FINAL_BEFORE_END_DAYS * DAY, toMs(knockoutWindowEnd));

  const knockoutDates = spreadOnWeekday(
    toMs(knockoutStart),
    knockoutHi,
    KNOCKOUT_STAGES,
    weekday,
    busy,
    MIN_GAP_DAYS,
    CONTINENTAL_OPTIONS,
  );

  return [...groupDates, ...knockoutDates];
}
