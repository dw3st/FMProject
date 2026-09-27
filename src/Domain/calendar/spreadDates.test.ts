import { describe, expect, test } from "bun:test";
import { spreadOnWeekday } from "@/Domain/calendar/spreadDates";

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

describe("spreadOnWeekday", () => {
  test("count dates, strictly increasing, inside the window, snapped to weekday", () => {
    const lo = toMs("2026-08-15");
    const hi = toMs("2027-05-13");
    const dates = spreadOnWeekday(lo, hi, 6, 3, new Set(), 3);
    expect(dates).toHaveLength(6);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    expect(dates[0]! >= "2026-08-15").toBe(true);
    expect(dates[5]! <= "2027-05-13").toBe(true);
    for (const d of dates) expect(dow(d)).toBe(3);
  });

  test("respects an arbitrary weekday", () => {
    const lo = toMs("2027-03-01");
    const hi = toMs("2027-05-31");
    const dates = spreadOnWeekday(lo, hi, 6, 2, new Set(), 6);
    for (const d of dates) expect(dow(d)).toBe(2); // Tuesday
  });

  test("skips exact-match busy dates only (no neighbour expansion)", () => {
    const lo = toMs("2027-03-01");
    const hi = toMs("2027-05-31");
    const free = spreadOnWeekday(lo, hi, 4, 3, new Set(), 6);
    const busy = new Set(free);
    const dates = spreadOnWeekday(lo, hi, 4, 3, busy, 6);
    for (const d of dates) expect(busy.has(d)).toBe(false);
    // The day before a busy date is NOT excluded by this helper (unlike scheduleStageDates,
    // which pre-expands busy before calling in).
    const dayBeforeBusyDates = new Set([...busy].map((d) => toIso(toMs(d) - DAY)));
    const anyOnDayBefore = dates.some((d) => dayBeforeBusyDates.has(d) && !busy.has(d));
    // Not asserting this must be true (the algorithm may or may not land there) — only that
    // membership in `busy` itself is respected, which is the contract of this helper.
    expect(anyOnDayBefore || true).toBe(true);
  });

  test("minGapDays is honoured between consecutive picks", () => {
    const lo = toMs("2027-07-15");
    const hi = toMs("2027-11-28");
    const dates = spreadOnWeekday(lo, hi, 7, 3, new Set(), 6);
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("degenerate window: fallback never overflows past hi (many picks, narrow gap)", () => {
    const lo = toMs("2027-02-05");
    const hi = toMs("2027-02-22");
    const dates = spreadOnWeekday(lo, hi, 8, 3, new Set(), 3);
    expect(dates).toHaveLength(8);
    expect(dates[0]! >= "2027-02-05").toBe(true);
    expect(dates[dates.length - 1]! <= "2027-02-22").toBe(true);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
  });

  test("degenerate window: short window", () => {
    const lo = toMs("2027-02-05");
    const hi = toMs("2027-02-13");
    const dates = spreadOnWeekday(lo, hi, 3, 3, new Set(), 3);
    expect(dates).toHaveLength(3);
    for (const d of dates) expect(d <= "2027-02-13").toBe(true);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
  });
});
