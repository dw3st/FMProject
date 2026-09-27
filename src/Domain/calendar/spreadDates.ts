const DAY = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const OFFSETS = [0, 1, -1, 2, -2, 3, -3];

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
): string[] {
  const span = Math.max(0, hi - lo);
  const picks: number[] = [];
  let prev = -Infinity;

  const ok = (ms: number, wantWeekday: boolean) =>
    ms >= lo && ms <= hi && ms >= prev + minGapDays * DAY &&
    (!wantWeekday || new Date(ms).getUTCDay() === weekday) &&
    !busy.has(toIso(ms));

  for (let i = 0; i < count; i++) {
    const target = lo + Math.round((span * (i + 1)) / count / DAY) * DAY;
    // Nearest target weekday to the target, then search around it.
    const toWeekday = (weekday - new Date(target).getUTCDay() + 7) % 7;
    const snapped = target + (toWeekday <= 3 ? toWeekday : toWeekday - 7) * DAY;
    let pick: number | null = null;
    for (const o of OFFSETS) if (pick === null && ok(snapped + o * 7 * DAY, true)) pick = snapped + o * 7 * DAY;
    for (const o of OFFSETS) if (pick === null && ok(target + o * DAY, false)) pick = target + o * DAY;
    if (pick === null) {
      // Fallback: no weekday/OFFSETS candidate satisfied the gap/busy rules — relax both and just
      // clamp to the window, still never past `hi` and never before `prev`.
      const clamped = Math.min(hi, Math.max(target, prev + DAY));
      if (clamped > prev) {
        pick = clamped;
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
