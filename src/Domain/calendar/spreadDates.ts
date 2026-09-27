const DAY = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const OFFSETS = [0, 1, -1, 2, -2, 3, -3];

export interface SpreadOnWeekdayOptions {
  /**
   * Use `(i + 0.5) / count` instead of `(i + 1) / count` as each pick's fractional target — keeps
   * the last pick from being pinned right against `hi`. Off by default so cups (which pin the
   * last pick near the window end intentionally) are unaffected. Used only by `continentalDates`.
   */
  centerTargets?: boolean;
  /**
   * Before falling back to the plain single-day clamp, scan the *whole* remaining window
   * `[prev + gap, hi]` for the day nearest the target that is not in `busy`, trying `gap` from
   * `minGapDays` down to `minGapFloor`; only if every day in that window is busy at every gap
   * level does it fall through to a last-resort pick that may land on a busy day (still preferring
   * one at least `lastResortGapDays` after the previous pick, when one exists). Off by default —
   * cups keep the original ±3-day / ±3-week local search only. Used only by `continentalDates`,
   * where landing on a busy day means double-booking a participant club.
   */
  avoidBusyHarder?: boolean;
  /** Floor for the relaxed-gap retry in `avoidBusyHarder` mode. Default 3. */
  minGapFloor?: number;
  /** Minimum gap from the previous pick still preferred in the `avoidBusyHarder` last resort. Default 2. */
  lastResortGapDays?: number;
  /**
   * Throw instead of silently packing the remaining picks one day apart when the window has no
   * room left for `count` picks even at `minGapFloor`-day spacing. Off by default — cups keep the
   * packing fallback (a cup stage never disappears from `date-index`; it just gets a tighter
   * gap). Used only by `continentalDates`, where a dropped/duplicated date would silently corrupt
   * `dateIndex`.
   */
  throwOnDegenerate?: boolean;
}

/**
 * Scans `[max(lo, prev + gap*DAY), hi]` for the day nearest `target`, trying `gap` from
 * `gapStart` down to `gapFloor` (inclusive), skipping days in `busy` unless `allowBusy`. Ignores
 * the weekday entirely — this is the harder fallback used once the weekday-snapped local search
 * (`OFFSETS`) has already failed. Returns `null` if no day qualifies at any gap level.
 */
function scanForFreeDay(
  lo: number,
  hi: number,
  prev: number,
  target: number,
  gapStart: number,
  gapFloor: number,
  busy: Set<string>,
  allowBusy: boolean,
): number | null {
  for (let gap = gapStart; gap >= gapFloor; gap--) {
    const rangeLo = Math.max(lo, prev + gap * DAY);
    if (rangeLo > hi) continue;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let ms = rangeLo; ms <= hi; ms += DAY) {
      if (!allowBusy && busy.has(toIso(ms))) continue;
      const dist = Math.abs(ms - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = ms;
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * Spreads `count` dates evenly inside `[lo, hi]` (epoch ms), snapped to the nearest occurrence of
 * `weekday` (0=Sun..6=Sat), each at least `minGapDays` after the previous pick, skipping any date
 * present in `busy` (ISO `yyyy-mm-dd`, checked for the exact date only — a caller that needs to
 * also block neighbouring days pre-expands the set before calling this).
 *
 * Searches neighbouring weeks (±1..±3) around the weekday-snapped target before falling back to
 * the plain daily target (still respecting the gap/busy rules), and degrades gracefully in a
 * window too narrow to fit `count` picks by packing the remaining picks one day apart ending
 * exactly at `hi` — never past `hi`, never before the previous pick.
 *
 * `options` (all off by default) opt into stricter behaviour for `continentalDates` without
 * changing anything for `scheduleStageDates` (cups), which calls this with no options and must
 * keep producing byte-identical output.
 *
 * Extracted from `src/Domain/cups/cupDates.ts` (`scheduleStageDates`) so cup and continental
 * calendars share one spreading algorithm.
 */
export function spreadOnWeekday(
  lo: number,
  hi: number,
  count: number,
  weekday: number,
  busy: Set<string>,
  minGapDays: number,
  options: SpreadOnWeekdayOptions = {},
): string[] {
  const {
    centerTargets = false,
    avoidBusyHarder = false,
    minGapFloor = 3,
    lastResortGapDays = 2,
    throwOnDegenerate = false,
  } = options;

  if (throwOnDegenerate) {
    if (hi < lo) {
      throw new Error(`spreadOnWeekday: window end (${toIso(hi)}) is before its start (${toIso(lo)})`);
    }
    if (count > 1 && hi - lo < (count - 1) * minGapFloor * DAY) {
      throw new Error(
        `spreadOnWeekday: window [${toIso(lo)}, ${toIso(hi)}] has no room for ${count} dates ` +
          `at >= ${minGapFloor}-day gaps`,
      );
    }
  }

  const span = Math.max(0, hi - lo);
  const picks: number[] = [];
  let prev = -Infinity;

  const ok = (ms: number, wantWeekday: boolean) =>
    ms >= lo && ms <= hi && ms >= prev + minGapDays * DAY &&
    (!wantWeekday || new Date(ms).getUTCDay() === weekday) &&
    !busy.has(toIso(ms));

  for (let i = 0; i < count; i++) {
    const frac = centerTargets ? (i + 0.5) / count : (i + 1) / count;
    const target = lo + Math.round((span * frac) / DAY) * DAY;
    // Nearest target weekday to the target, then search around it.
    const toWeekday = (weekday - new Date(target).getUTCDay() + 7) % 7;
    const snapped = target + (toWeekday <= 3 ? toWeekday : toWeekday - 7) * DAY;
    let pick: number | null = null;
    for (const o of OFFSETS) if (pick === null && ok(snapped + o * 7 * DAY, true)) pick = snapped + o * 7 * DAY;
    for (const o of OFFSETS) if (pick === null && ok(target + o * DAY, false)) pick = target + o * DAY;

    if (pick === null && avoidBusyHarder) {
      // Scan the whole remaining window for a free day before accepting anything busy, relaxing
      // the gap down to the floor only if the window is entirely busy at tighter gaps.
      pick = scanForFreeDay(lo, hi, prev, target, minGapDays, minGapFloor, busy, false);
      if (pick === null) {
        // Last resort: accept a busy day, but still prefer one at least `lastResortGapDays` after
        // the previous pick when such a day exists.
        pick = scanForFreeDay(lo, hi, prev, target, lastResortGapDays, lastResortGapDays, busy, true);
      }
    }

    if (pick === null) {
      // Fallback: nothing above satisfied the gap/busy rules — relax both and just clamp to the
      // window, still never past `hi` and never before `prev`.
      const clamped = Math.min(hi, Math.max(target, prev + DAY));
      if (clamped > prev) {
        pick = clamped;
      } else if (throwOnDegenerate) {
        throw new Error(
          `spreadOnWeekday: no room left in [${toIso(lo)}, ${toIso(hi)}] for pick ${i + 1} of ${count}`,
        );
      } else {
        // Degenerate: the window ran out of distinct days for even the 1-day-apart fallback —
        // greedily consuming 1 day per pick since some earlier point left no room for this pick
        // before `hi`. Relax the gap/busy rules further and walk backward, re-including however
        // many already-placed picks are needed until the block fits, then pack that whole block
        // one day apart ending exactly at `hi`. Still strictly increasing throughout and never
        // past `hi` — the trade-off is some of those earlier picks move earlier too.
        let windowStart = i;
        let remaining = count - i;
        while (windowStart > 0 && hi - picks[windowStart - 1]! < remaining * DAY) {
          windowStart--;
          remaining++;
        }
        for (let k = 0; k < remaining; k++) picks[windowStart + k] = hi - (remaining - 1 - k) * DAY;
        return picks.map(toIso);
      }
    }
    picks.push(pick);
    prev = pick;
  }
  return picks.map(toIso);
}
