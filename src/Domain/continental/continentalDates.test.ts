import { describe, expect, test } from "bun:test";
import { continentalDates, type ParticipantDates } from "@/Domain/continental/continentalDates";

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

/** A participant with a fixed set of exact dates. */
function participant(id: string, dates: string[]): ParticipantDates {
  return { id, dates: new Set(dates) };
}

/** 32 participants, each with the same `dates` — a "everyone plays this day" clash generator. */
function uniformParticipants(dates: string[], count = 32): ParticipantDates[] {
  return Array.from({ length: count }, (_, i) => participant(`p${i}`, dates));
}

/**
 * Every Wednesday and every Saturday between `startIso` and `endIso` is a fixture date for every
 * one of `count` participants — a realistic dense national-cup-plus-league calendar (every country's
 * cup on Wednesday, every league on Saturday).
 */
function denseParticipants(startIso: string, endIso: string, count = 32): ParticipantDates[] {
  const dates: string[] = [];
  for (let ms = toMs(startIso); ms <= toMs(endIso); ms += DAY) {
    const day = new Date(ms).getUTCDay();
    if (day === 3 || day === 6) dates.push(toIso(ms));
  }
  return uniformParticipants(dates, count);
}

describe("continentalDates — Europe", () => {
  const Y = 2026;
  const end = "2027-05-24";
  const weekday = 2; // Tuesday

  test("13 increasing dates, group window, knockout window, all on weekday (no participants)", () => {
    const dates = continentalDates("Europe", Y, end, weekday, []);
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

  test("a free Tuesday is preferred over an adjacent-day clash affecting many clubs", () => {
    // Every Friday in the group window is a fixture date for all 32 clubs, which only ever makes
    // Thursday and Saturday soft-busy — Tuesday is untouched (no participant plays Monday, Tuesday
    // or Wednesday). A fully clash-free Tuesday exists throughout, so the optimiser must land on it
    // rather than drift toward the Friday-adjacent days.
    const fridays: string[] = [];
    for (let ms = toMs("2026-09-01"); ms <= toMs("2026-12-15"); ms += DAY) {
      if (new Date(ms).getUTCDay() === 5) fridays.push(toIso(ms));
    }
    const dates = continentalDates("Europe", Y, end, weekday, uniformParticipants(fridays));
    const group = dates.slice(0, 6);
    for (const d of group) {
      expect(dow(d)).toBe(2);
      expect(fridays.includes(toIso(toMs(d) - DAY))).toBe(false);
      expect(fridays.includes(toIso(toMs(d) + DAY))).toBe(false);
    }
  });

  test("spacing: with no clashes at all, picks land close to their evenly-spaced ideal target", () => {
    const dates = continentalDates("Europe", Y, end, weekday, []);
    const group = dates.slice(0, 6);
    const lo = toMs("2026-09-15");
    const hi = toMs("2026-12-15");
    const span = hi - lo;
    for (let i = 0; i < group.length; i++) {
      const ideal = lo + Math.round((span * (i + 0.5)) / group.length);
      const actual = toMs(group[i]!);
      // Within a week of the ideal, once snapped to the nearest Tuesday.
      expect(Math.abs(actual - ideal)).toBeLessThanOrEqual(7 * DAY);
    }
  });

  test("never a hard (same-day) clash when a fully hard-free schedule exists", () => {
    // Dense enough that soft clashes are everywhere, but nobody ever plays exactly on the
    // competition's own weekday-adjacent-free days — a hard-free schedule remains possible.
    const participants = denseParticipants("2026-09-01", "2027-05-31");
    const dates = continentalDates("Europe", Y, end, weekday, participants);
    expect(dates).toHaveLength(13);
    const hardDates = new Set(participants.flatMap((p) => [...p.dates]));
    for (const d of dates) expect(hardDates.has(d)).toBe(false);
  });

  test("gap between consecutive dates is always >= 3 days", () => {
    const participants = denseParticipants("2026-09-01", "2027-05-31");
    const dates = continentalDates("Europe", Y, end, weekday, participants);
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(3 * DAY);
    }
  });

  test("min gap of 6 days is achieved when nothing forces it tighter", () => {
    const dates = continentalDates("Europe", Y, end, weekday, []);
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("knockout window is clamped to (seasonYear+1)-05-31 even when `end` is much later", () => {
    const dates = continentalDates("Europe", Y, "2027-11-30", weekday, []);
    const knockout = dates.slice(6);
    expect(knockout).toHaveLength(7);
    for (const d of knockout) expect(d <= "2027-05-31").toBe(true);
  });

  test("degenerate window (hi before lo): still 13 valid, strictly increasing dates, never past the knockout window's own end", () => {
    // end − 7d lands before the knockout window even opens — falls back to graceful packing.
    const dates = continentalDates("Europe", Y, "2027-02-11", weekday, []);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-02-04").toBe(true); // end − 7d
  });

  test("degenerate window (not enough room for 7 dates at >=3-day gaps): still 13 valid, strictly increasing dates", () => {
    const dates = continentalDates("Europe", Y, "2027-02-24", weekday, []);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-02-17").toBe(true); // end − 7d
  });
});

describe("continentalDates — South America", () => {
  const Y = 2027;
  const end = "2027-12-05";
  const weekday = 2; // Tuesday (CONTINENTAL.lib — see competitions.ts for why not Wednesday)

  test("group window Mar–May, knockout window Jul–Nov (no participants)", () => {
    const dates = continentalDates("South America", Y, end, weekday, []);
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

  test("min gap of 6 days is achieved when nothing forces it tighter", () => {
    const dates = continentalDates("South America", Y, end, weekday, []);
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(6 * DAY);
    }
  });

  test("strictly increasing across the group/knockout boundary", () => {
    const dates = continentalDates("South America", Y, end, weekday, []);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
  });

  test("dense realistic fixture calendar: never a hard clash, gap always >= 3, 13 dates", () => {
    const participants = denseParticipants("2027-03-01", "2027-11-30");
    const dates = continentalDates("South America", Y, end, weekday, participants);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    const hardDates = new Set(participants.flatMap((p) => [...p.dates]));
    for (const d of dates) expect(hardDates.has(d)).toBe(false);
    for (let i = 1; i < dates.length; i++) {
      expect(toMs(dates[i]!) - toMs(dates[i - 1]!)).toBeGreaterThanOrEqual(3 * DAY);
    }
  });

  test("knockout window is clamped to seasonYear-11-30 even when `end` is much later", () => {
    const dates = continentalDates("South America", Y, "2028-01-15", weekday, []);
    const knockout = dates.slice(6);
    expect(knockout).toHaveLength(7);
    for (const d of knockout) expect(d <= "2027-11-30").toBe(true);
  });

  test("degenerate window (hi before lo): still 13 valid, strictly increasing dates, never past the knockout window's own end", () => {
    const dates = continentalDates("South America", Y, "2027-07-16", weekday, []);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-07-09").toBe(true); // end − 7d
  });

  test("degenerate window (not enough room for 7 dates at >=3-day gaps): still 13 valid, strictly increasing dates", () => {
    const dates = continentalDates("South America", Y, "2027-07-29", weekday, []);
    expect(dates).toHaveLength(13);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    for (const d of dates.slice(6)) expect(d <= "2027-07-22").toBe(true); // end − 7d
  });
});

describe("continentalDates — optimality proofs", () => {
  const Y = 2026;
  const end = "2027-05-24";
  const weekday = 2;

  test("a single clashing club is outweighed by staying close to the ideal spacing", () => {
    // One participant (of many) has a fixture every Tuesday — landing on Tuesday costs 1 (soft,
    // since the clash is exact-day not adjacent... use adjacent instead): every Monday, so every
    // Tuesday is a 1-participant soft clash. With only 1 affected participant, the small W_ADJ
    // cost should NOT be enough to outweigh a multi-week deviation from the ideal spacing target
    // (W_SPACING accumulates fast over a week), so most picks should still land on Tuesday.
    const mondays: string[] = [];
    for (let ms = toMs("2026-09-01"); ms <= toMs("2026-12-15"); ms += DAY) {
      if (new Date(ms).getUTCDay() === 1) mondays.push(toIso(ms));
    }
    const dates = continentalDates("Europe", Y, end, weekday, [participant("solo", mondays)]);
    const group = dates.slice(0, 6);
    const onWeekday = group.filter((d) => dow(d) === weekday).length;
    expect(onWeekday).toBeGreaterThanOrEqual(5);
  });

  test("a huge number of clashing clubs on the target weekday pushes the pick off it", () => {
    // All 32 clubs play every Tuesday in the group window — landing on Tuesday is a guaranteed
    // same-day (hard) clash for all 32, while an off-weekday pick is free. HUGE must win.
    const tuesdays: string[] = [];
    for (let ms = toMs("2026-09-01"); ms <= toMs("2026-12-15"); ms += DAY) {
      if (new Date(ms).getUTCDay() === 2) tuesdays.push(toIso(ms));
    }
    const dates = continentalDates("Europe", Y, end, weekday, uniformParticipants(tuesdays));
    const group = dates.slice(0, 6);
    for (const d of group) expect(tuesdays.includes(d)).toBe(false);
  });

  test("deterministic: identical input always yields identical output", () => {
    const participants = denseParticipants("2026-09-01", "2027-05-31");
    const a = continentalDates("Europe", Y, end, weekday, participants);
    const b = continentalDates("Europe", Y, end, weekday, participants);
    expect(a).toEqual(b);
  });
});
