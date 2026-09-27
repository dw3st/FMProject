import { spreadOnWeekday } from "@/Domain/calendar/spreadDates";
import { logError } from "@/Logger";

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const GROUP_STAGES = 6;
/** r16 (leg 1 + leg 2) + qf (leg 1 + leg 2) + sf (leg 1 + leg 2) + final. */
const KNOCKOUT_STAGES = 7;
const FINAL_BEFORE_END_DAYS = 7;

/** Hard constraint: two continental dates of the same competition are never closer than this. */
const MIN_GAP_DAYS = 3;
/** Soft target: a gap under this is penalised (`W_GAP` per missing day), not forbidden. */
const PREFERRED_GAP_DAYS = 6;

// Cost weights for the optimiser (`scheduleOptimal`). Tuned against the real world (33 European /
// 8 South American countries — see `continentalWorld.test.ts`'s reported rates) rather than derived
// analytically; re-tune here if the reported numbers drift after a data change.
//
// HUGE dominates every other term by 4-5 orders of magnitude (a realistic hard[d] tops out around
// 30, and every other term together rarely exceeds a few hundred), so the optimiser always picks a
// hard-free schedule when one exists at all — same-day double-booking only happens when literally
// no combination of `k` hard-free days satisfies the >= 3-day gap constraint, which is the same
// "should not happen" scarcity the previous design detected post-hoc.
const HUGE = 1_000_000;
/** Per participant with a fixture the day before or after (soft/adjacent clash). */
const W_ADJ = 1;
/** Flat cost for landing off the competition's usual weekday — worth about 6 clubs' worth of soft clash. */
const W_WEEKDAY = 6;
/** Per day of distance from a pick's evenly-spaced "ideal" position. */
const W_SPACING = 0.3;
/** Per day short of the preferred 6-day gap (e.g. a 4-day gap costs `2 * W_GAP`). */
const W_GAP = 4;

/** A continental competition's participant and every exact date (league + cup, any stage) it plays. */
export interface ParticipantDates {
  /** Opaque id — only used to tell participants apart, never read back. */
  id: string;
  dates: ReadonlySet<string>;
}

/** Per-day clash costs derived from every participant's dates, over `[lo, hi]` inclusive. */
interface DayCosts {
  /** Number of days in `[lo, hi]`. */
  length: number;
  /** `hard[j]`: participants with a fixture exactly on day `j`. */
  hard: number[];
  /** `soft[j]`: participants with a fixture on day `j - 1` OR `j + 1` (not double-counted). */
  soft: number[];
}

function buildDayCosts(lo: number, hi: number, participants: readonly ParticipantDates[]): DayCosts {
  const length = Math.round((hi - lo) / DAY) + 1;
  const hard = new Array<number>(length).fill(0);
  const soft = new Array<number>(length).fill(0);
  for (let j = 0; j < length; j++) {
    const dayIso = toIso(lo + j * DAY);
    const beforeIso = toIso(lo + j * DAY - DAY);
    const afterIso = toIso(lo + j * DAY + DAY);
    for (const p of participants) {
      if (p.dates.has(dayIso)) hard[j]!++;
      if (p.dates.has(beforeIso) || p.dates.has(afterIso)) soft[j]!++;
    }
  }
  return { length, hard, soft };
}

/**
 * `k` dates in `[lo, hi]` (epoch ms) minimising, over the whole selection:
 * `Σ HUGE·hard[d] + W_ADJ·soft[d] + W_WEEKDAY·(weekday(d) ≠ weekday) + W_SPACING·|d − ideal_i| + gapPenalty`,
 * where `gapPenalty` adds `W_GAP` per day a consecutive gap falls short of `PREFERRED_GAP_DAYS`, and
 * `ideal_i` is the evenly-spaced, centred target for pick `i` (mirrors the old `centerTargets`
 * fraction `(i + 0.5) / k`). Hard constraint: consecutive picks are never closer than `MIN_GAP_DAYS`
 * — dynamic programming over day-index `j` for each pick `i` (`O(k · D²)`, trivial for the ~90-140
 * day windows here). Returns `null` only when the window has no room at all for `k` picks at the
 * `MIN_GAP_DAYS` floor (`(k - 1) · MIN_GAP_DAYS > D - 1`) — genuinely degenerate, not a clash issue.
 */
function scheduleOptimal(
  lo: number,
  hi: number,
  k: number,
  weekday: number,
  participants: readonly ParticipantDates[],
): string[] | null {
  const D = Math.round((hi - lo) / DAY) + 1;
  if (D < 1 || (k - 1) * MIN_GAP_DAYS > D - 1) return null;

  const { hard, soft } = buildDayCosts(lo, hi, participants);
  const dayCost = new Array<number>(D);
  for (let j = 0; j < D; j++) {
    const dow = new Date(lo + j * DAY).getUTCDay();
    dayCost[j] = HUGE * hard[j]! + W_ADJ * soft[j]! + (dow === weekday ? 0 : W_WEEKDAY);
  }
  const idealIndex = (i: number) => Math.round(((D - 1) * (i + 0.5)) / k);
  const gapPenalty = (gapDays: number) => (gapDays < PREFERRED_GAP_DAYS ? W_GAP * (PREFERRED_GAP_DAYS - gapDays) : 0);

  // dp[i][j] = min cost of picks 0..i with pick i at day index j; back[i][j] = the previous pick's
  // day index that achieved it (for backtracking the actual selection).
  const dp: number[][] = Array.from({ length: k }, () => new Array<number>(D).fill(Infinity));
  const back: number[][] = Array.from({ length: k }, () => new Array<number>(D).fill(-1));

  for (let j = 0; j < D; j++) dp[0]![j] = dayCost[j]! + W_SPACING * Math.abs(j - idealIndex(0));

  for (let i = 1; i < k; i++) {
    const ideal = idealIndex(i);
    for (let j = 0; j < D; j++) {
      let best = Infinity;
      let bestPrev = -1;
      for (let jp = 0; jp <= j - MIN_GAP_DAYS; jp++) {
        const prevCost = dp[i - 1]![jp]!;
        if (prevCost === Infinity) continue;
        const total = prevCost + gapPenalty(j - jp);
        if (total < best) {
          best = total;
          bestPrev = jp;
        }
      }
      if (bestPrev === -1) continue; // no valid predecessor yet for this j
      dp[i]![j] = best + dayCost[j]! + W_SPACING * Math.abs(j - ideal);
      back[i]![j] = bestPrev;
    }
  }

  let bestLast = -1;
  let bestVal = Infinity;
  for (let j = 0; j < D; j++) {
    if (dp[k - 1]![j]! < bestVal) {
      bestVal = dp[k - 1]![j]!;
      bestLast = j;
    }
  }
  if (bestLast === -1) return null; // shouldn't happen given the feasibility check above

  const picks = new Array<number>(k);
  let cur = bestLast;
  for (let i = k - 1; i >= 0; i--) {
    picks[i] = cur;
    cur = back[i]![cur]!;
  }
  return picks.map((j) => toIso(lo + j * DAY));
}

/**
 * Degenerate-window fallback: the window has no room for `k` dates even at the `MIN_GAP_DAYS`
 * floor, so `scheduleOptimal` can't run at all. Falls back to `spreadOnWeekday`'s graceful packing
 * (same one `scheduleStageDates`, national cups, uses by default) — still hard/soft aware via its
 * own `hardBusy` option — and logs it, since a window this tight for a continental competition
 * should not happen with real-world windows (only contrived/tiny ones in tests).
 */
function fallbackPack(
  lo: number,
  hi: number,
  k: number,
  weekday: number,
  participants: readonly ParticipantDates[],
  label: string,
): string[] {
  logError(
    "continental",
    `continentalDates: window [${toIso(lo)}, ${toIso(hi)}] has no room for ${k} dates at >= ${MIN_GAP_DAYS}-day ` +
      `gaps (${label}) — falling back to graceful packing`,
  );
  const hardBusy = new Set<string>();
  const softBusy = new Set<string>();
  for (let ms = lo; ms <= hi; ms += DAY) {
    const iso = toIso(ms);
    for (const p of participants) {
      if (p.dates.has(iso)) {
        hardBusy.add(iso);
        softBusy.add(toIso(ms - DAY));
        softBusy.add(iso);
        softBusy.add(toIso(ms + DAY));
      }
    }
  }
  return spreadOnWeekday(lo, hi, k, weekday, softBusy, MIN_GAP_DAYS, {
    centerTargets: true,
    avoidBusyHarder: true,
    minGapFloor: MIN_GAP_DAYS,
    lastResortGapDays: MIN_GAP_DAYS,
    throwOnDegenerate: false,
    hardBusy,
  });
}

function scheduleWindow(
  lo: number,
  hi: number,
  k: number,
  weekday: number,
  participants: readonly ParticipantDates[],
  label: string,
): string[] {
  return scheduleOptimal(lo, hi, k, weekday, participants) ?? fallbackPack(lo, hi, k, weekday, participants, label);
}

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
 * - The knockout window opens more than `MIN_GAP_DAYS`/`PREFERRED_GAP_DAYS` after the group
 *   window's own end by construction (Feb 10 vs. Dec 15; Jul 15 vs. May 31), so the "≥ 6 days
 *   before the first knockout date" rule the group's last date must respect is automatic — the two
 *   windows never need to coordinate directly.
 *
 * `end` is the latest end date among the continent's top-tier leagues. `participants` are the
 * competition's OWN 32 qualifying clubs (not the continent's other competition, and not every
 * country in the continent) — each carries every exact date (league fixture, national cup fixture,
 * or cup stage not yet drawn) its country plays. Dates are chosen by `scheduleOptimal`: an exact
 * dynamic program minimising domestic clashes (same-day dominant, adjacent-day secondary),
 * weekday drift, and deviation from an evenly-spaced target, subject to a hard ≥ `MIN_GAP_DAYS`-day
 * gap between the competition's own dates — see that function's doc for the full cost model. A
 * window with no room at all for its dates even at the gap floor (never observed with real windows,
 * only in contrived/tiny test ones) falls back to graceful packing via `fallbackPack`.
 */
export function continentalDates(
  continent: "Europe" | "South America",
  seasonYear: number,
  end: string,
  weekday: number,
  participants: readonly ParticipantDates[],
): string[] {
  const Y = seasonYear;
  const groupStart = continent === "Europe" ? `${Y}-09-15` : `${Y}-03-01`;
  const groupEnd = continent === "Europe" ? `${Y}-12-15` : `${Y}-05-31`;
  const knockoutStart = continent === "Europe" ? `${Y + 1}-02-10` : `${Y}-07-15`;
  const knockoutWindowEnd = continent === "Europe" ? `${Y + 1}-05-31` : `${Y}-11-30`;

  const groupDates = scheduleWindow(toMs(groupStart), toMs(groupEnd), GROUP_STAGES, weekday, participants, "group");

  const knockoutHi = Math.min(toMs(end) - FINAL_BEFORE_END_DAYS * DAY, toMs(knockoutWindowEnd));
  const knockoutDates = scheduleWindow(
    toMs(knockoutStart),
    knockoutHi,
    KNOCKOUT_STAGES,
    weekday,
    participants,
    "knockout",
  );

  return [...groupDates, ...knockoutDates];
}
