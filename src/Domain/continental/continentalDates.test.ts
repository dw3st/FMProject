import { describe, expect, test } from "bun:test";
import { continentalDates } from "@/Domain/continental/continentalDates";

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

/**
 * A realistic dense fixture calendar: matches on every Wednesday and every Saturday between
 * `startIso` and `endIso`, each blocking the day before/of/after (the same neighbour-expansion
 * `advanceDay.ts` applies before calling `continentalDates`). Wed±1 covers Tue/Wed/Thu, Sat±1
 * covers Fri/Sat/Sun — together every day except Monday is busy, every single week, throughout
 * the whole window.
 */
function denseBusy(startIso: string, endIso: string): Set<string> {
  const busy = new Set<string>();
  for (let ms = toMs(startIso); ms <= toMs(endIso); ms += DAY) {
    const day = new Date(ms).getUTCDay();
    if (day === 3 || day === 6) {
      busy.add(toIso(ms - DAY));
      busy.add(toIso(ms));
      busy.add(toIso(ms + DAY));
    }
  }
  return busy;
}

describe("continentalDates — Europe", () => {
  const Y = 2026;
  const end = "2027-05-24";
  const weekday = 2; // Tuesday

  test("13 increasing dates, group window, knockout window, all on weekday", () => {
    const dates = continentalDates("Europe", Y, end, weekday, new Set());
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);

    const group = dates.slice(0, 6);
    const knockout = dates.slice(6);
    expect(knockout).toHaveLength(7);

    for (const d of group) {
      expect(d >= "2026-09-15").toBe(true);
      expect(d <= "2026-12-15").toBe(true);
    }
    for (const d of knockout) {
      expect(d >= "2027-02-10").toBe(true);
      expect(d <= "2027-05-17").toBe(true); // end − 7 days
    }
    for (const d of dates) expect(dow(d)).toBe(weekday);
  });

  test("busy September Tuesdays (±1 day) push group dates off those days", () => {
    const busy = new Set<string>();
    for (let d = new Date("2026-09-01T00:00:00Z"); d.getUTCMonth() === 8; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === 2) {
        const ms = d.getTime();
        busy.add(new Date(ms - DAY).toISOString().slice(0, 10));
        busy.add(new Date(ms).toISOString().slice(0, 10));
        busy.add(new Date(ms + DAY).toISOString().slice(0, 10));
      }
    }
    const dates = continentalDates("Europe", Y, end, weekday, busy);
    expect(dates).toHaveLength(13);
    for (const d of dates) {
      if (d.startsWith("2026-09")) expect(busy.has(d)).toBe(false);
    }
  });

  test("min gap of at least 6 days between every consecutive date", () => {
    const dates = continentalDates("Europe", Y, end, weekday, new Set());
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("dense realistic fixture calendar: never lands on a busy day (Monday is always free), never double-books", () => {
    const busy = denseBusy("2026-09-01", "2027-05-31");
    const dates = continentalDates("Europe", Y, end, weekday, busy);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates) expect(busy.has(d)).toBe(false);
    // Monday recurs every week, so a free day always exists within these multi-month windows —
    // the ≥6-day gap should always be achievable, never just the 3-day relaxed floor.
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("knockout window is clamped to (seasonYear+1)-05-31 even when `end` is much later", () => {
    const dates = continentalDates("Europe", Y, "2027-11-30", weekday, new Set());
    const knockout = dates.slice(6);
    expect(knockout).toHaveLength(7);
    for (const d of knockout) expect(d <= "2027-05-31").toBe(true);
  });

  test("degenerate window (hi before lo): still 13 valid, strictly increasing dates, never past the knockout window's own end", () => {
    // end − 7d lands before the knockout window even opens — the knockout half degrades to a
    // tight pack ending at its own `hi`, rather than throwing (see continentalDates.ts's
    // `throwOnDegenerate` comment — this is a real scarcity case, not just this contrived window).
    const dates = continentalDates("Europe", Y, "2027-02-11", weekday, new Set());
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-02-04").toBe(true); // end − 7d
  });

  test("degenerate window (not enough room for 7 dates at >=3-day gaps): still 13 valid, strictly increasing dates", () => {
    const dates = continentalDates("Europe", Y, "2027-02-24", weekday, new Set());
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-02-17").toBe(true); // end − 7d
  });
});

describe("continentalDates — South America", () => {
  const Y = 2027;
  const end = "2027-12-05";
  const weekday = 3; // Wednesday

  test("group window Mar–May, knockout window Jul–Nov", () => {
    const dates = continentalDates("South America", Y, end, weekday, new Set());
    expect(dates).toHaveLength(13);

    const group = dates.slice(0, 6);
    const knockout = dates.slice(6);
    expect(knockout).toHaveLength(7);

    for (const d of group) {
      expect(d >= "2027-03-01").toBe(true);
      expect(d <= "2027-05-31").toBe(true);
    }
    for (const d of knockout) {
      expect(d >= "2027-07-15").toBe(true);
      expect(d <= "2027-11-28").toBe(true); // end − 7 days
    }
    for (const d of dates) expect(dow(d)).toBe(weekday);
  });

  test("min gap of at least 6 days between every consecutive date", () => {
    const dates = continentalDates("South America", Y, end, weekday, new Set());
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("strictly increasing across the group/knockout boundary", () => {
    const dates = continentalDates("South America", Y, end, weekday, new Set());
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
  });

  test("dense realistic fixture calendar: never lands on a busy day, never double-books", () => {
    const busy = denseBusy("2027-03-01", "2027-11-30");
    const dates = continentalDates("South America", Y, end, weekday, busy);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates) expect(busy.has(d)).toBe(false);
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("knockout window is clamped to seasonYear-11-30 even when `end` is much later", () => {
    const dates = continentalDates("South America", Y, "2028-01-15", weekday, new Set());
    const knockout = dates.slice(6);
    expect(knockout).toHaveLength(7);
    for (const d of knockout) expect(d <= "2027-11-30").toBe(true);
  });

  test("degenerate window (hi before lo): still 13 valid, strictly increasing dates, never past the knockout window's own end", () => {
    const dates = continentalDates("South America", Y, "2027-07-16", weekday, new Set());
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-07-09").toBe(true); // end − 7d
  });

  test("degenerate window (not enough room for 7 dates at >=3-day gaps): still 13 valid, strictly increasing dates", () => {
    const dates = continentalDates("South America", Y, "2027-07-29", weekday, new Set());
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-07-22").toBe(true); // end − 7d
  });
});
