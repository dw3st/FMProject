const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const WEDNESDAY = 3;
const FINAL_BEFORE_END_DAYS = 7;
const MIN_GAP_DAYS = 3;
const OFFSETS = [0, 1, -1, 2, -2, 3, -3];

/**
 * Dates for `stages` cup stages inside [start, end − 7d]: spread evenly, snapped to a Wednesday
 * with no league game that day or the day before (`busy` = dates any club of the country plays
 * a league game).
 */
export function scheduleStageDates(start: string, end: string, stages: number, busy: Set<string>): string[] {
  const lo = toMs(start);
  const hi = toMs(end) - FINAL_BEFORE_END_DAYS * DAY;
  const span = Math.max(0, hi - lo);
  const out: string[] = [];
  let prev = -Infinity;

  const ok = (ms: number, wantWednesday: boolean) =>
    ms >= lo && ms <= hi && ms >= prev + MIN_GAP_DAYS * DAY &&
    (!wantWednesday || new Date(ms).getUTCDay() === WEDNESDAY) &&
    !busy.has(toIso(ms)) && !busy.has(toIso(ms - DAY));

  for (let i = 0; i < stages; i++) {
    const target = lo + Math.round((span * (i + 1)) / stages / DAY) * DAY;
    // Nearest Wednesday to the target, then search around it.
    const toWed = ((WEDNESDAY - new Date(target).getUTCDay() + 7) % 7);
    const wed = target + (toWed <= 3 ? toWed : toWed - 7) * DAY;
    let pick: number | null = null;
    for (const o of OFFSETS) if (pick === null && ok(wed + o * 7 * DAY, true)) pick = wed + o * 7 * DAY;
    for (const o of OFFSETS) if (pick === null && ok(target + o * DAY, false)) pick = target + o * DAY;
    if (pick === null) pick = Math.max(target, prev + DAY);
    out.push(toIso(pick));
    prev = pick;
  }
  return out;
}
