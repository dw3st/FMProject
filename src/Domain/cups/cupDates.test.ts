import { describe, expect, test } from "bun:test";
import { scheduleStageDates } from "@/Domain/cups/cupDates";

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("scheduleStageDates", () => {
  test("F dates, strictly increasing, inside the window, final ≥ 7 days before end", () => {
    const dates = scheduleStageDates("2026-08-15", "2027-05-20", 6, new Set());
    expect(dates).toHaveLength(6);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    expect(dates[0]! >= "2026-08-15").toBe(true);
    expect(dates[5]! <= "2027-05-13").toBe(true);
    for (const d of dates) expect(dow(d)).toBe(3); // Wednesday
  });

  test("avoids busy days and the day after a busy day", () => {
    const free = scheduleStageDates("2026-08-15", "2027-05-20", 4, new Set());
    const busy = new Set(free);                                    // block every chosen Wednesday
    for (const d of free) busy.add(new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
    const dates = scheduleStageDates("2026-08-15", "2027-05-20", 4, busy);
    for (const d of dates) {
      expect(busy.has(d)).toBe(false);
      const prev = new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      expect(busy.has(prev)).toBe(false);
    }
  });

  test("calendar-year window", () => {
    const dates = scheduleStageDates("2027-02-05", "2027-11-30", 3, new Set());
    expect(dates[0]! >= "2027-02-05").toBe(true);
    expect(dates[2]! <= "2027-11-23").toBe(true);
  });

  const assertValidWindow = (dates: string[], start: string, end: string, stages: number) => {
    const hi = toIso(toMs(end) - 7 * 86_400_000);
    expect(dates).toHaveLength(stages);
    expect(dates[0]! >= start).toBe(true);
    expect(dates[dates.length - 1]! <= hi).toBe(true);
    for (const d of dates) expect(d <= hi).toBe(true);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
  };

  test("degenerate window: fallback never overflows past end − 7d (many stages, narrow gap)", () => {
    // Only 2 Wednesdays exist in [2027-02-05, 2027-02-22] (the −7d window), and the greedy
    // 1-day-apart fallback for the remaining 6 stages runs out of room by exactly one day —
    // this used to push the final stage to 2027-02-23, one day past the window end.
    const dates = scheduleStageDates("2027-02-05", "2027-03-01", 8, new Set());
    assertValidWindow(dates, "2027-02-05", "2027-03-01", 8);
  });

  test("degenerate window: fallback never overflows past end − 7d (short window)", () => {
    const dates = scheduleStageDates("2027-02-05", "2027-02-20", 3, new Set());
    assertValidWindow(dates, "2027-02-05", "2027-02-20", 3);
  });
});
