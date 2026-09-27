import { describe, expect, test } from "bun:test";
import { continentalDates } from "@/Domain/continental/continentalDates";

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const DAY = 86_400_000;

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
});
