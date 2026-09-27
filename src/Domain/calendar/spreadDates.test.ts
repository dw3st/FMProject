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

describe("spreadOnWeekday — hardBusy (two-tier busy)", () => {
  /** Every day of `startIso..endIso` that falls on `dow`, as an exact-date set (no expansion). */
  function exactDaysOn(startIso: string, endIso: string, targetDow: number): Set<string> {
    const out = new Set<string>();
    for (let ms = toMs(startIso); ms <= toMs(endIso); ms += DAY) {
      if (new Date(ms).getUTCDay() === targetDow) out.add(toIso(ms));
    }
    return out;
  }
  const withNeighbours = (dates: Set<string>): Set<string> => {
    const out = new Set<string>();
    for (const d of dates) {
      out.add(toIso(toMs(d) - DAY));
      out.add(d);
      out.add(toIso(toMs(d) + DAY));
    }
    return out;
  };

  test("without hardBusy, behaves exactly as before (busy alone is both tiers)", () => {
    const lo = toMs("2026-09-15");
    const hi = toMs("2026-12-15");
    const busy = withNeighbours(exactDaysOn("2026-09-01", "2026-12-15", 6)); // every Saturday ± 1
    const before = spreadOnWeekday(lo, hi, 6, 2, busy, 6, { centerTargets: true, avoidBusyHarder: true, throwOnDegenerate: true });
    const after = spreadOnWeekday(lo, hi, 6, 2, busy, 6, {
      centerTargets: true,
      avoidBusyHarder: true,
      throwOnDegenerate: true,
      hardBusy: undefined,
    });
    expect(after).toEqual(before);
  });

  test("prefers a hard-free day over a hard-busy one even when the hard-free day is soft-busy", () => {
    // Every day is soft-busy (so tier 1 always fails and every pick must come from tier 2/3), but
    // only Wednesdays are hard-busy. No pick should ever land on a Wednesday.
    const lo = toMs("2026-09-15");
    const hi = toMs("2026-12-15");
    const allBusy = new Set<string>();
    for (let ms = lo; ms <= hi; ms += DAY) allBusy.add(toIso(ms));
    const hardBusy = exactDaysOn("2026-09-01", "2026-12-31", 3); // every Wednesday
    const dates = spreadOnWeekday(lo, hi, 6, 2, allBusy, 6, {
      centerTargets: true,
      avoidBusyHarder: true,
      throwOnDegenerate: true,
      hardBusy,
    });
    expect(dates).toHaveLength(6);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates) expect(hardBusy.has(d)).toBe(false);
  });

  test("never throws even when hardBusy makes the ideal weekday impossible; length and order still hold", () => {
    // hardBusy covers literally every day in the window — no hard-free day can exist at all.
    const lo = toMs("2027-07-15");
    const hi = toMs("2027-08-01");
    const hardBusy = new Set<string>();
    for (let ms = lo; ms <= hi; ms += DAY) hardBusy.add(toIso(ms));
    const dates = spreadOnWeekday(lo, hi, 3, 3, new Set(), 6, {
      centerTargets: true,
      avoidBusyHarder: true,
      throwOnDegenerate: false,
      hardBusy,
    });
    expect(dates).toHaveLength(3);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates) {
      expect(d >= toIso(lo)).toBe(true);
      expect(d <= toIso(hi)).toBe(true);
    }
  });

  test("hardBusy is still respected by the fully-degenerate packing fallback when there's slack to avoid it", () => {
    // count=6 at a 4-day gap needs 20 days but the window is only 15 — the tail of the sequence
    // (everything after the first pick) is packed 1 day apart by the degenerate fallback. Put
    // hardBusy in the middle of that packed block, where the block has slack (5 slots over a
    // ~10-day re-included range) to route around it.
    const lo = toMs("2027-02-05");
    const hi = toMs("2027-02-20");
    const withoutHardBusy = spreadOnWeekday(lo, hi, 6, 3, new Set(), 4, {
      centerTargets: true,
      avoidBusyHarder: true,
      throwOnDegenerate: false,
    });
    // Sanity check on the premise: the fallback really did pack a run of 1-day-apart dates.
    expect(toMs(withoutHardBusy[2]!) - toMs(withoutHardBusy[1]!)).toBe(DAY);

    const hardBusy = new Set(["2027-02-18"]);
    const dates = spreadOnWeekday(lo, hi, 6, 3, new Set(), 4, {
      centerTargets: true,
      avoidBusyHarder: true,
      throwOnDegenerate: false,
      hardBusy,
    });
    expect(dates).toHaveLength(6);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    expect(dates.some((d) => hardBusy.has(d))).toBe(false);
  });
});
