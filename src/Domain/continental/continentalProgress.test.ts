import { describe, expect, test } from "bun:test";
import { generateContinental } from "@/Domain/continental/generateContinental";
import { advanceContinental, continentsToRegenerate } from "@/Domain/continental/continentalProgress";
import { seedFrom } from "@/Domain/cups/cupIds";
import type { DrawClub } from "@/Domain/continental/groupDraw";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";

const clubs: DrawClub[] = Array.from({ length: 32 }, (_, i) => ({
  id: `c${i}`,
  country: ["England", "Spain", "Italy", "Germany", "France", "Portugal", "Netherlands", "Turkey"][i % 8]!,
  level: 6 - i * 0.05,
}));

const dates = [
  "2026-09-15", "2026-10-06", "2026-10-27", "2026-11-17", "2026-12-01", "2026-12-15",
  "2027-02-10", "2027-02-24", "2027-03-10", "2027-03-24", "2027-04-07", "2027-04-21", "2027-05-12",
];

const seedKey = "save1:2026:ucl";
const args = { slug: "ucl" as const, year: 2026, clubs, dates, seedKey };

/** Deterministic 0..2 "goals" from a fixture id + tag — same inputs always give the same score. */
function goals(id: string, tag: string): number {
  return seedFrom(`${id}:${tag}`) % 3;
}

function playGroupFixture(f: Fixture): Fixture {
  return { ...f, played: true, result: { home: goals(f.id, "h"), away: goals(f.id, "a") } };
}

/** Plays a first-leg fixture with a plain score (no decider needed — only the second leg resolves the tie). */
function playLeg1(f: Fixture): Fixture {
  return { ...f, played: true, result: { home: goals(f.id, "l1h"), away: goals(f.id, "l1a") } };
}

/**
 * Plays a second-leg fixture (or the neutral final) whose own score is deterministic; when the
 * aggregate (own score + `f.aggregate`, absent for the final) is level, attaches `decider.penalties`
 * with a deterministic, non-level winner so `tieWinner`/`finalWinner` always resolve.
 */
function playDecisive(f: Fixture): Fixture {
  const own = { home: goals(f.id, "l2h"), away: goals(f.id, "l2a") };
  const totalHome = own.home + (f.aggregate?.home ?? 0);
  const totalAway = own.away + (f.aggregate?.away ?? 0);
  if (totalHome !== totalAway) return { ...f, played: true, result: own };
  const homeWins = seedFrom(`${f.id}:pen`) % 2 === 0;
  return {
    ...f,
    played: true,
    result: own,
    decider: { extraTime: { home: 0, away: 0 }, penalties: homeWins ? { home: 5, away: 4 } : { home: 4, away: 5 } },
  };
}

describe("advanceContinental — full competition", () => {
  test("32 clubs -> 16 qualifiers -> r16 (never same group) -> aggregates -> qf/sf/final -> exactly one champion", () => {
    const gen = generateContinental(args);
    let meta = gen.meta;
    const roundsById = new Map<number, Fixture[]>(gen.rounds.map((r) => [r.round, r.fixtures]));
    const groupOf: Record<string, string> = {};
    for (const g of meta.continental!.groups) for (const club of g.clubs) groupOf[club] = g.name;

    // Group stage: play all 6 rounds.
    for (let round = 1; round <= 6; round++) {
      roundsById.set(round, roundsById.get(round)!.map(playGroupFixture));
    }

    // Round 6 complete -> draw round of 16.
    const afterGroups = advanceContinental(meta, roundsById, 6, seedKey)!;
    expect(afterGroups).not.toBeNull();
    meta = afterGroups.meta;
    expect(meta.continental!.stages.find((s) => s.name === "r16")!.drawn).toBe(true);
    for (const w of afterGroups.writes) roundsById.set(w.round, w.fixtures);

    const round7 = roundsById.get(7)!;
    const round8 = roundsById.get(8)!;
    expect(round7).toHaveLength(8);
    expect(round8).toHaveLength(8);

    // 16 distinct qualifiers, and no round-of-16 tie pits two clubs from the same group.
    const qualifiers = new Set(round7.flatMap((f) => [f.home, f.away]));
    expect(qualifiers.size).toBe(16);
    for (const f of round7) expect(groupOf[f.home]).not.toBe(groupOf[f.away]);

    expect(afterGroups.events.filter((e) => e.kind === "advanced")).toHaveLength(16);
    expect(afterGroups.events.filter((e) => e.kind === "eliminated")).toHaveLength(16);
    expect(afterGroups.events).toContainEqual({ kind: "drawn", stage: "r16", round: 7 });

    // Calling it again for the same round is a no-op (already drawn).
    expect(advanceContinental(meta, roundsById, 6, seedKey)).toBeNull();

    // Play through r16 -> qf -> sf -> final.
    const legRounds: [number, number][] = [[7, 8], [9, 10], [11, 12]];
    for (const [leg1Round, leg2Round] of legRounds) {
      roundsById.set(leg1Round, roundsById.get(leg1Round)!.map(playLeg1));
      const aggResult = advanceContinental(meta, roundsById, leg1Round, seedKey)!;
      expect(aggResult).not.toBeNull();
      meta = aggResult.meta;
      expect(aggResult.writes).toHaveLength(1);
      expect(aggResult.writes[0]!.round).toBe(leg2Round);
      for (const f of aggResult.writes[0]!.fixtures) expect(f.aggregate).toBeDefined();
      roundsById.set(leg2Round, aggResult.writes[0]!.fixtures);

      roundsById.set(leg2Round, roundsById.get(leg2Round)!.map(playDecisive));
      const drawResult = advanceContinental(meta, roundsById, leg2Round, seedKey)!;
      expect(drawResult).not.toBeNull();
      meta = drawResult.meta;
      for (const w of drawResult.writes) roundsById.set(w.round, w.fixtures);
    }

    expect(roundsById.get(13)).toHaveLength(1);
    expect(meta.continental!.stages.find((s) => s.name === "final")!.drawn).toBe(true);

    // Final.
    roundsById.set(13, roundsById.get(13)!.map(playDecisive));
    const finalResult = advanceContinental(meta, roundsById, 13, seedKey)!;
    expect(finalResult).not.toBeNull();
    expect(typeof finalResult.championId).toBe("string");
    const championId = finalResult.championId!;
    expect(finalResult.events).toEqual([{ kind: "champion", clubId: championId }]);
    meta = finalResult.meta;
    expect(meta.continental!.championId).toBe(championId);

    // Champion is one of the 16 original qualifiers (sanity — nobody was invented along the way).
    expect(qualifiers.has(championId)).toBe(true);

    // Calling it again is a no-op (champion already crowned).
    expect(advanceContinental(meta, roundsById, 13, seedKey)).toBeNull();
  });

  test("incomplete round -> null", () => {
    const gen = generateContinental(args);
    const roundsById = new Map<number, Fixture[]>(gen.rounds.map((r) => [r.round, r.fixtures]));
    for (let round = 1; round <= 5; round++) roundsById.set(round, roundsById.get(round)!.map(playGroupFixture));
    // Round 6: all but the last fixture played.
    const round6 = roundsById.get(6)!.map(playGroupFixture);
    round6[round6.length - 1] = { ...round6[round6.length - 1]!, played: false, result: null };
    roundsById.set(6, round6);

    expect(advanceContinental(gen.meta, roundsById, 6, seedKey)).toBeNull();
  });

  test("a played round that isn't the last group round, a leg, or the final does nothing", () => {
    const gen = generateContinental(args);
    const roundsById = new Map<number, Fixture[]>(gen.rounds.map((r) => [r.round, r.fixtures]));
    roundsById.set(3, roundsById.get(3)!.map(playGroupFixture));
    expect(advanceContinental(gen.meta, roundsById, 3, seedKey)).toBeNull();
  });
});

describe("advanceContinental — undecided tie", () => {
  const dates6 = dates.slice(0, 6);

  function minimalMeta(): LeagueSeasonMeta {
    return {
      leagueSlug: "ucl",
      year: 2026,
      start: dates[0]!,
      end: dates[12]!,
      totalRounds: 13,
      kind: "continental",
      continental: {
        competition: "ucl",
        continent: "Europe",
        groups: [],
        stages: [
          { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: dates6, drawn: true },
          { name: "r16", rounds: [7, 8], dates: [dates[6]!, dates[7]!], drawn: true },
          { name: "qf", rounds: [9, 10], dates: [dates[8]!, dates[9]!], drawn: false },
          { name: "sf", rounds: [11, 12], dates: [dates[10]!, dates[11]!], drawn: false },
          { name: "final", rounds: [13], dates: [dates[12]!], drawn: false },
        ],
        countryOf: {},
        level: {},
        championId: null,
      },
    };
  }

  test("second leg complete but one tie level with no penalties -> reported, no draw", () => {
    const meta = minimalMeta();

    // Tie A: decided outright (Xa wins 2-0 on aggregate 1-2).
    const leg1A: Fixture = {
      id: "ucl_2026_r7_1", date: dates[6]!, competition: "ucl", round: 7,
      home: "Ya", away: "Xa", played: true, result: { home: 1, away: 0 }, tieId: "tieA", leg: 1,
    };
    const leg2A: Fixture = {
      id: "ucl_2026_r8_1", date: dates[7]!, competition: "ucl", round: 8,
      home: "Xa", away: "Ya", played: true, result: { home: 2, away: 0 },
      tieId: "tieA", leg: 2, knockout: true, aggregate: { home: 0, away: 1 },
    };

    // Tie B: level on aggregate (1-1), no penalties recorded — undecided.
    const leg1B: Fixture = {
      id: "ucl_2026_r7_2", date: dates[6]!, competition: "ucl", round: 7,
      home: "Qb", away: "Pb", played: true, result: { home: 1, away: 1 }, tieId: "tieB", leg: 1,
    };
    const leg2B: Fixture = {
      id: "ucl_2026_r8_2", date: dates[7]!, competition: "ucl", round: 8,
      home: "Pb", away: "Qb", played: true, result: { home: 0, away: 0 },
      tieId: "tieB", leg: 2, knockout: true, aggregate: { home: 1, away: 1 },
    };

    const roundsById = new Map<number, Fixture[]>([
      [7, [leg1A, leg1B]],
      [8, [leg2A, leg2B]],
    ]);

    const result = advanceContinental(meta, roundsById, 8, seedKey)!;
    expect(result).not.toBeNull();
    expect(result.writes).toEqual([]);
    expect(result.events).toEqual([{ kind: "undecidedTie", tieId: "tieB" }]);
    expect(result.meta).toBe(meta);
    expect(result.meta.continental!.stages.find((s) => s.name === "qf")!.drawn).toBe(false);
  });
});

describe("continentsToRegenerate", () => {
  test("regenerates only when every season-defining tier-1 league moved past the competition's year", () => {
    const leagues = [
      { continent: "Europe" as const, year: 2027, crossYear: true }, // e.g. Premier League "2026-27" -> "2027-28"
      { continent: "Europe" as const, year: 2027, crossYear: true }, // Bundesliga
      { continent: "Europe" as const, year: 2026, crossYear: false }, // calendar-year Europe league — never season-defining
      { continent: "South America" as const, year: 2028, crossYear: true },
      { continent: "South America" as const, year: 2028, crossYear: true },
    ];
    const out = continentsToRegenerate(leagues, { Europe: 2026, "South America": 2027 });
    expect(out).toEqual([
      { continent: "Europe", year: 2027 },
      { continent: "South America", year: 2028 },
    ]);
  });

  test("a continent with no competition year yet is ignored", () => {
    expect(continentsToRegenerate([{ continent: "Europe", year: 2027, crossYear: true }], {})).toEqual([]);
  });

  test("not every season-defining league has advanced -> not regenerated", () => {
    const leagues = [
      { continent: "Europe" as const, year: 2027, crossYear: true },
      { continent: "Europe" as const, year: 2026, crossYear: true }, // still on the old season
    ];
    expect(continentsToRegenerate(leagues, { Europe: 2026 })).toEqual([]);
  });

  test("Europe with no cross-year leagues has nothing season-defining -> not regenerated", () => {
    const leagues = [{ continent: "Europe" as const, year: 2027, crossYear: false }];
    expect(continentsToRegenerate(leagues, { Europe: 2026 })).toEqual([]);
  });
});
