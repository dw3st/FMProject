import { spreadOnWeekday } from "@/Domain/calendar/spreadDates";

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

const GROUP_STAGES = 6;
/** r16 (leg 1 + leg 2) + qf (leg 1 + leg 2) + sf (leg 1 + leg 2) + final. */
const KNOCKOUT_STAGES = 7;
const FINAL_BEFORE_END_DAYS = 7;
/** ≥ 6 days between two continental match dates — see the plan's "Ajuste consciente da spec". */
const MIN_GAP_DAYS = 6;

const CONTINENTAL_OPTIONS_BASE = {
  centerTargets: true,
  avoidBusyHarder: true,
  minGapFloor: 3,
  lastResortGapDays: 2,
  // Not `true`: measured against the real world (see `continentalWorld.ts`'s `createContinentalSeason`
  // busy-set comment), a handful of countries whose domestic calendar already rotates through 2-3
  // weekdays (e.g. Brazil and Argentina playing some rounds on the same weekday national cups always
  // use) is enough, once unioned with a ±1-day buffer across a whole continent's worth of countries,
  // to leave a knockout window with no fully soft-clash-free day left for every one of the 13 dates.
  // That is a real scarcity, not a bug in the picker, so this falls back to the same graceful "pack
  // the remaining picks a day apart, ending at the window's end" degradation `scheduleStageDates`
  // (cups) already uses by default, instead of throwing and failing the whole competition's
  // generation. `hardBusy` (an exact-day, same-day-double-booking clash) is never accepted this way
  // except in a should-not-happen scarcity `spreadOnWeekday` itself cannot avoid — see its own
  // `hardBusy` option doc.
  throwOnDegenerate: false,
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
 * each window, snapped to the competition's `weekday` (0=Sun..6=Sat), at least `MIN_GAP_DAYS` after
 * the previous continental date. Two tiers of clash:
 * - `hardBusy` (the caller passes the EXACT dates of every participant's league/cup fixtures,
 *   including undrawn future cup-stage dates): a pick may never land on one of these — a same-day
 *   double-booking is never acceptable. Omit it (or pass an empty set) to fall back to the single-
 *   tier behaviour below, unchanged.
 * - `busy` (the caller fills this with the day before, the day itself and the day after each of
 *   those same fixtures — a superset of `hardBusy`): merely avoided when possible, accepted once the
 *   whole remaining window has been scanned at every gap down to 3 days and no fully clash-free day
 *   exists — landing on one only means an adjacent-day clash for the participant, not a double
 *   booking.
 *
 * A window with truly no clash-free day left for one of its dates falls back to packing the
 * remaining dates a day apart ending exactly at the window's end (never dropped, never duplicated,
 * never out of order), still respecting `hardBusy` wherever the fallback has any room to — see
 * `spreadOnWeekday`'s `avoidBusyHarder`/`throwOnDegenerate`/`hardBusy` options and
 * `continentalWorld.ts`'s busy-set comment for why any of this happens with real-world data.
 */
export function continentalDates(
  continent: "Europe" | "South America",
  seasonYear: number,
  end: string,
  weekday: number,
  busy: Set<string>,
  hardBusy?: Set<string>,
): string[] {
  const Y = seasonYear;
  const groupStart = continent === "Europe" ? `${Y}-09-15` : `${Y}-03-01`;
  const groupEnd = continent === "Europe" ? `${Y}-12-15` : `${Y}-05-31`;
  const knockoutStart = continent === "Europe" ? `${Y + 1}-02-10` : `${Y}-07-15`;
  const knockoutWindowEnd = continent === "Europe" ? `${Y + 1}-05-31` : `${Y}-11-30`;
  const options = { ...CONTINENTAL_OPTIONS_BASE, hardBusy };

  const groupDates = spreadOnWeekday(
    toMs(groupStart),
    toMs(groupEnd),
    GROUP_STAGES,
    weekday,
    busy,
    MIN_GAP_DAYS,
    options,
  );

  const knockoutHi = Math.min(toMs(end) - FINAL_BEFORE_END_DAYS * DAY, toMs(knockoutWindowEnd));

  const knockoutDates = spreadOnWeekday(
    toMs(knockoutStart),
    knockoutHi,
    KNOCKOUT_STAGES,
    weekday,
    busy,
    MIN_GAP_DAYS,
    options,
  );

  return [...groupDates, ...knockoutDates];
}
