import { describe, expect, test } from "bun:test";
import { generateCalendar, generateLeagueCalendar } from "@/Domain/season";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";

function pairKey(home: string, away: string): string {
  return [home, away].sort().join("|");
}

describe("generateCalendar", () => {
  test("double round-robin for 4 teams yields 12 fixtures", () => {
    const teams = ["a", "b", "c", "d"];
    const fixtures = generateCalendar("prem", teams, "2025-08-15", "2026-05-20");

    expect(fixtures.length).toBe(12);
  });

  test("each league pair meets twice (home and away once each)", () => {
    const teams = ["a", "b", "c", "d"];
    const fixtures = generateCalendar("prem", teams, "2025-08-15", "2026-05-20");

    const counts = new Map<string, number>();
    for (const f of fixtures) {
      const k = pairKey(f.home, f.away);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const pairCount = (teams.length * (teams.length - 1)) / 2;
    expect(counts.size).toBe(pairCount);
    for (const n of counts.values()) {
      expect(n).toBe(2);
    }
  });

  test("second leg reverses home and away for the same structural pairing", () => {
    const teams = ["a", "b", "c", "d"];
    const fixtures = generateCalendar("prem", teams, "2025-08-15", "2026-05-20");

    const roundsPerLeg = teams.length - 1;
    const firstLeg = fixtures.filter((f) => f.round <= roundsPerLeg);
    const secondLeg = fixtures.filter((f) => f.round > roundsPerLeg);

    expect(firstLeg.length).toBe(6);
    expect(secondLeg.length).toBe(6);

    const firstByPair = new Map<string, { home: string; away: string }>();
    for (const f of firstLeg) {
      firstByPair.set(pairKey(f.home, f.away), { home: f.home, away: f.away });
    }
    for (const f of secondLeg) {
      const k = pairKey(f.home, f.away);
      const first = firstByPair.get(k);
      expect(first).toBeDefined();
      expect(f.home).toBe(first!.away);
      expect(f.away).toBe(first!.home);
    }
  });

  test("assigns sequential ids and competition slug on every fixture", () => {
    const teams = ["x", "y"];
    const fixtures = generateCalendar("liga", teams, "2025-08-15", "2026-05-20");

    expect(fixtures.length).toBe(2);
    for (let i = 0; i < fixtures.length; i++) {
      expect(fixtures[i]!.id).toBe(`fix_${String(i + 1).padStart(4, "0")}`);
      expect(fixtures[i]!.competition).toBe("liga");
      expect(fixtures[i]!.played).toBe(false);
      expect(fixtures[i]!.result).toBeNull();
    }
  });

  test("round numbers run 1 .. 2*(n-1) and dates are ordered by round", () => {
    const teams = ["a", "b", "c", "d"];
    const start = "2025-08-15";
    const end = "2026-05-20";
    const fixtures = generateCalendar("prem", teams, start, end);

    const roundsPerLeg = teams.length - 1;
    const totalRounds = roundsPerLeg * 2;

    const byRound = new Map<number, string[]>();
    for (const f of fixtures) {
      const list = byRound.get(f.round) ?? [];
      list.push(f.date);
      byRound.set(f.round, list);
    }

    for (let r = 1; r <= totalRounds; r++) {
      expect(byRound.has(r)).toBe(true);
    }

    let prev = "";
    for (let r = 1; r <= totalRounds; r++) {
      const dates = byRound.get(r)!;
      const d = dates[0]!;
      if (prev) expect(d >= prev).toBe(true);
      prev = d;
    }

    expect(fixtures[0]!.date).toBe(start);
    expect(fixtures[fixtures.length - 1]!.date).toBe(end);
  });

  test("odd team count uses bye without emitting bye in fixtures", () => {
    const teams = ["a", "b", "c"];
    const fixtures = generateCalendar("div", teams, "2025-08-15", "2026-05-20");

    for (const f of fixtures) {
      expect(f.home).not.toBe("__bye__");
      expect(f.away).not.toBe("__bye__");
    }

    // 3 teams: 3*2 = 6 fixtures
    expect(fixtures.length).toBe(6);
  });
});

describe("generateLeagueCalendar season window", () => {
  const dateOf = (d: string) => Date.parse(d + "T12:00:00Z");

  // Regression (season-rollover smoke): baseWeekOffset + match-day snapping pushed the last rounds
  // past the league's `end` (and Brazil's first round before `start`). The country rollover runs
  // on `end`, so rounds dated after it were never played and silently lost.
  test("every round of every configured league falls inside [start, end], in round order", () => {
    const outside: string[] = [];
    for (const config of LEAGUE_SCHEDULE_CONFIGS) {
      for (const size of [8, 11, 16, 18, 19, 20, 22, 30]) {
        for (const year of [2024, 2025, 2026]) {
          const teams = Array.from({ length: size }, (_, i) => `t${i}`);
          const { meta, rounds } = generateLeagueCalendar(config, teams, year);
          let prev = "";
          for (const r of rounds) {
            const d = r.fixtures[0]!.date;
            if (d < meta.start || d > meta.end || (prev && d <= prev)) {
              outside.push(`${config.slug} ${year} n=${size} round ${r.round} ${d} (${meta.start}..${meta.end}, prev ${prev})`);
            }
            prev = d;
          }
          expect(rounds.length).toBe(2 * ((size % 2 ? size + 1 : size) - 1));
        }
      }
    }
    expect(outside.slice(0, 5)).toEqual([]);
  });

  test("Serie A 2024 ends by 2025-05-18 and Brazil 2024 starts on or after 2024-02-05", () => {
    const serieA = LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === "serie_a")!;
    const brazil = LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === "brazil_serie_a")!;
    const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const a = generateLeagueCalendar(serieA, teams, 2024).rounds.flatMap((r) => r.fixtures.map((f) => f.date)).sort();
    const b = generateLeagueCalendar(brazil, teams, 2024).rounds.flatMap((r) => r.fixtures.map((f) => f.date)).sort();
    expect(a.at(-1)! <= "2025-05-18").toBe(true);
    expect(b[0]! >= "2024-02-05").toBe(true);
    // Still spread over the season, not piled up at the end.
    expect(dateOf(a.at(-1)!) - dateOf(a[0]!)).toBeGreaterThan(250 * 86_400_000);
  });
});
