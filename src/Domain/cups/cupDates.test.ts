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

describe("scheduleStageDates — fallback avoids blocked and busy days", () => {
  const range = (a: string, b: string) => {
    const out: string[] = [];
    for (let ms = toMs(a); ms <= toMs(b); ms += 86_400_000) out.push(toIso(ms));
    return out;
  };

  test("last stage with every day around its target taken: lands on a free day, never a blocked one", () => {
    // Before: the clamp put the final on 2027-11-23, inside the November FIFA window (Argentina/USA 2027).
    const blocked = new Set(range("2027-11-15", "2027-11-24"));
    const busy = new Set([...range("2027-10-20", "2027-11-30"), ...blocked]);
    const dates = scheduleStageDates("2027-02-05", "2027-11-30", 3, busy, blocked);
    expect(dates).toHaveLength(3);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates) {
      expect(d >= "2027-02-05" && d <= "2027-11-23").toBe(true);
      expect(busy.has(d)).toBe(false);
    }
  });

  test("degenerate window: stages skip blocked days and league days while free days remain", () => {
    // [2027-11-01, 2027-11-23]: 4 stages, most days taken; free days: 11-02, 11-05, 11-09, 11-11.
    const blocked = new Set(range("2027-11-15", "2027-11-23"));
    const league = new Set(range("2027-11-01", "2027-11-14").filter((d) => !["2027-11-02", "2027-11-05", "2027-11-09", "2027-11-11"].includes(d)));
    const busy = new Set([...league, ...blocked]);
    const dates = scheduleStageDates("2027-11-01", "2027-11-30", 4, busy, blocked);
    expect(dates).toEqual(["2027-11-02", "2027-11-05", "2027-11-09", "2027-11-11"]);
  });

  test("a blocked day is used only when nothing else exists", () => {
    const blocked = new Set(range("2027-11-10", "2027-11-23"));
    const busy = new Set([...range("2027-11-01", "2027-11-09"), ...blocked]);
    const dates = scheduleStageDates("2027-11-01", "2027-11-30", 3, busy, blocked);
    expect(dates).toHaveLength(3);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    // Every day is busy; the league days (11-01..11-09) win over the blocked ones.
    for (const d of dates) expect(blocked.has(d)).toBe(false);
  });

  test("everything blocked: still `stages` valid, strictly increasing dates in the window", () => {
    const blocked = new Set(range("2027-02-01", "2027-03-01"));
    const dates = scheduleStageDates("2027-02-05", "2027-03-01", 8, new Set(blocked), blocked);
    expect(dates).toHaveLength(8);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates) expect(d >= "2027-02-05" && d <= "2027-02-22").toBe(true);
  });

  test("normal windows: `blocked` changes nothing", () => {
    const busy = new Set(range("2026-10-05", "2026-10-14"));
    const plain = scheduleStageDates("2026-08-15", "2027-05-20", 6, busy);
    expect(scheduleStageDates("2026-08-15", "2027-05-20", 6, busy, new Set(busy))).toEqual(plain);
    expect(plain).toEqual(scheduleStageDates("2026-08-15", "2027-05-20", 6, busy, new Set(["2026-10-07"])));
  });
});
