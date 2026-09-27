const DAY = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const OFFSETS = [0, 1, -1, 2, -2, 3, -3];
/** Safety cap for backtracking away from a hard-busy day when `prev` is far away (or `-Infinity`). */
const MAX_HARD_FREE_BACKTRACK_DAYS = 400;
/**
 * When `hardBusy` is given, how far past `target` tier 1 (full softBusy avoidance) is allowed to
 * reach before giving up and falling to tier 2 (hard-free only). Without this cap, a softBusy set
 * dense enough to leave only a handful of fully-free days across a whole multi-month window (e.g.
 * every country's national cup, all on the same weekday, folded into `busy`) can make tier 1 return
 * the ONE such day it finds anywhere in `[prev, hi]` even when it lands months past `target` — a
 * far worse outcome than accepting a nearby hard-free (merely soft-clashing) day instead. 3 weeks
 * matches the existing local-search convention (`OFFSETS`'s ±3-week reach).
 */
const TIER1_MAX_LOOKAHEAD_DAYS = 21;

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
  /**
   * Dates a pick may NEVER land on — an exact-day clash with a participant's league/cup fixture
   * (same-day double-booking), as opposed to `busy` (here read as "soft": the day before/of/after,
   * merely avoided when possible). When given, `avoidBusyHarder`'s busy-accepting last resort tries
   * much harder (relaxing the gap down to a single day) to find a day that is at least hard-free
   * before ever accepting a hard-busy day; when omitted, `busy` alone plays both roles exactly as
   * before (cups, and any continental call that doesn't pass this). Used only by `continentalDates`.
   */
  hardBusy?: Set<string>;
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
 * `count` distinct, strictly increasing day values in `(lowerExclusive, hi]`, preferring hard-free
 * days over hard-busy ones — used only by the fully-degenerate packing fallback, where every
 * softer search has already failed and the picks must be fabricated from whatever room is left.
 * Without `hardBusy` (or with fewer hard-free days than `count`), behaves exactly like the plain
 * "last `count` consecutive days ending at `hi`" packing this replaces: it still returns those same
 * days, just reordered to prefer the hard-free ones among them when there's a shortfall.
 */
function selectDaysPreferHardFree(
  lowerExclusive: number,
  hi: number,
  count: number,
  hardBusy: Set<string> | undefined,
): number[] {
  const all: number[] = [];
  for (let ms = lowerExclusive + DAY; ms <= hi; ms += DAY) all.push(ms);
  if (!hardBusy || hardBusy.size === 0) return all.slice(all.length - count);

  const free = all.filter((ms) => !hardBusy.has(toIso(ms)));
  const busy = all.filter((ms) => hardBusy.has(toIso(ms)));
  const chosen = free.length >= count ? free.slice(free.length - count) : [...free, ...busy.slice(busy.length - (count - free.length))];
  return chosen.sort((a, b) => a - b);
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
    hardBusy,
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
      // Tier 1: scan the remaining window for a day free of `busy` (softBusy — a superset of
      // `hardBusy` when both are given), relaxing the gap down to the floor only if the window is
      // entirely busy at tighter gaps. Ignores the weekday (as `scanForFreeDay` always does):
      // preferring to land the right weekday over avoiding a clash was tried and made the overall
      // clash count worse, not better — a window's tail (its last one or two picks, squeezed
      // against `hi`) can have only a single weekday-matching candidate left, and insisting on it
      // regardless of `busy` just relocates the clash instead of avoiding it. Avoiding a domestic
      // clash matters more here than which day of the week the match lands on.
      //
      // With `hardBusy`, this tier's reach past `target` is capped (`TIER1_MAX_LOOKAHEAD_DAYS`) —
      // without a cap, a `busy` set dense enough to leave only a handful of fully-free days across
      // the whole window (every country's cup on the same weekday, folded in ±1 day) can make this
      // tier grab the one such day it finds anywhere, however many months past `target` that is —
      // worse than falling to tier 2's nearby, merely soft-clashing day. Without `hardBusy` (cups,
      // and any continental call that omits it) this cap never applies, so behaviour there is
      // unchanged.
      const tier1Hi = hardBusy ? Math.min(hi, target + TIER1_MAX_LOOKAHEAD_DAYS * DAY) : hi;
      pick = scanForFreeDay(lo, tier1Hi, prev, target, minGapDays, minGapFloor, busy, false);

      if (pick === null && hardBusy) {
        // Tier 2: a same-day double-booking must never happen, so this searches much harder than
        // the soft floor above — relaxing the gap all the way down to 1 day — for a day that is at
        // least hard-free, before ever accepting a hard-busy (exact clash) day. An adjacent-day
        // (soft) clash is tolerated here; only the exact day matters at this tier.
        pick = scanForFreeDay(lo, hi, prev, target, minGapDays, 1, hardBusy, false);
      }

      if (pick === null) {
        // Tier 3: accept a busy day, preferring the widest gap after the previous pick that still
        // leaves room (from `minGapDays` down to `lastResortGapDays`) rather than only ever trying
        // the single tightest gap — a single fixed gap can pick a date needlessly close to `prev`
        // early on, one that then starves a later pick of room before `hi` even though the window
        // overall has plenty of days left. Reached with `hardBusy` set only when tier 2 found
        // nothing at all — a real bug-level scarcity the caller detects and logs by comparing the
        // final dates against its own `hardBusy` set (this function stays pure, no logging here).
        pick = scanForFreeDay(lo, hi, prev, target, minGapDays, lastResortGapDays, busy, true);
      }
    }

    if (pick === null) {
      // Fallback: nothing above satisfied the gap/busy rules — relax both and just clamp to the
      // window, still never past `hi` and never before `prev`. Even here, a `hardBusy` day is only
      // ever used when no hard-free day exists at or before it, back to `prev` (`prev` may be
      // `-Infinity` on the very first pick, so this walks back a bounded number of days rather than
      // reusing `selectDaysPreferHardFree`'s unbounded `(lowerExclusive, hi]` range).
      const clampCeiling = Math.min(hi, Math.max(target, prev + DAY));
      if (clampCeiling > prev) {
        pick = clampCeiling;
        if (hardBusy?.has(toIso(pick))) {
          const cappedLower = Math.max(lo, prev, clampCeiling - MAX_HARD_FREE_BACKTRACK_DAYS * DAY);
          for (let ms = clampCeiling - DAY; ms > cappedLower; ms -= DAY) {
            if (!hardBusy.has(toIso(ms))) {
              pick = ms;
              break;
            }
          }
        }
      } else if (throwOnDegenerate) {
        throw new Error(
          `spreadOnWeekday: no room left in [${toIso(lo)}, ${toIso(hi)}] for pick ${i + 1} of ${count}`,
        );
      } else {
        // Degenerate: the window ran out of distinct days for even the 1-day-apart fallback —
        // greedily consuming 1 day per pick since some earlier point left no room for this pick
        // before `hi`. Relax the gap/busy rules further and walk backward, re-including however
        // many already-placed picks are needed until the block fits, then pack that whole block
        // one day apart ending exactly at `hi` (or, when `hardBusy` leaves room to spare in the
        // re-included block, preferring hard-free days within it over the exact "1 day apart" tail
        // — see `selectDaysPreferHardFree`). Still strictly increasing throughout and never past
        // `hi` — the trade-off is some of those earlier picks move earlier too.
        let windowStart = i;
        let remaining = count - i;
        while (windowStart > 0 && hi - picks[windowStart - 1]! < remaining * DAY) {
          windowStart--;
          remaining++;
        }
        const lowerExclusive = windowStart > 0 ? picks[windowStart - 1]! : hi - remaining * DAY;
        const chosen = selectDaysPreferHardFree(lowerExclusive, hi, remaining, hardBusy);
        for (let k = 0; k < remaining; k++) picks[windowStart + k] = chosen[k]!;
        return picks.map(toIso);
      }
    }
    picks.push(pick);
    prev = pick;
  }
  return picks.map(toIso);
}
