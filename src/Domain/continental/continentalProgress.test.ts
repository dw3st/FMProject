import { describe, expect, test } from "bun:test";
import { generateContinental } from "@/Domain/continental/generateContinental";
import {
  advanceContinental,
  buildContinentalArchive,
  continentsToRegenerate,
  type ContinentalEvent,
} from "@/Domain/continental/continentalProgress";
import { seedFrom } from "@/Domain/cups/cupIds";
import type { DrawClub } from "@/Domain/continental/groupDraw";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";

/** Narrows an event list to its "drawn" entries — used to inspect the `ties` payload. */
function drawnEvents(events: ContinentalEvent[]): Extract<ContinentalEvent, { kind: "drawn" }>[] {
  return events.filter((e): e is Extract<ContinentalEvent, { kind: "drawn" }> => e.kind === "drawn");
}

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

    const r16Drawn = drawnEvents(afterGroups.events);
    expect(r16Drawn).toHaveLength(1);
    expect(r16Drawn[0]!.stage).toBe("r16");
    expect(r16Drawn[0]!.round).toBe(7);
    expect(r16Drawn[0]!.ties).toHaveLength(8);
    for (const t of r16Drawn[0]!.ties) {
      expect(t.firstLegDate).toBe(dates[6]!); // r16 stage's first date
      const match = round7.find((f) => f.tieId === t.tieId);
      expect(match).toBeDefined();
      expect(match!.home).toBe(t.home);
      expect(match!.away).toBe(t.away);
    }

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

      // The "drawn" event's ties match the actual first-leg (or single-final) fixtures written.
      const [drawn] = drawnEvents(drawResult.events);
      expect(drawn).toBeDefined();
      const firstLegWrite = drawResult.writes.find((w) => w.round === drawn!.round)!;
      expect(drawn!.ties).toHaveLength(firstLegWrite.fixtures.length);
      for (const t of drawn!.ties) {
        const match = firstLegWrite.fixtures.find((f) => f.home === t.home && f.away === t.away);
        expect(match).toBeDefined();
        expect(t.tieId).toBe(match!.tieId);
        expect(t.firstLegDate).toBe(match!.date);
      }
    }

    expect(roundsById.get(13)).toHaveLength(1);
    expect(meta.continental!.stages.find((s) => s.name === "final")!.drawn).toBe(true);

    // Final.
    const finalFixtureBeforePlay = roundsById.get(13)![0]!;
    roundsById.set(13, roundsById.get(13)!.map(playDecisive));
    const finalResult = advanceContinental(meta, roundsById, 13, seedKey)!;
    expect(finalResult).not.toBeNull();
    expect(typeof finalResult.championId).toBe("string");
    const championId = finalResult.championId!;
    const loserId = championId === finalFixtureBeforePlay.home ? finalFixtureBeforePlay.away : finalFixtureBeforePlay.home;
    expect(finalResult.events).toEqual([
      { kind: "advanced", clubId: championId, stage: "final" },
      { kind: "eliminated", clubId: loserId, stage: "final" },
      { kind: "champion", clubId: championId },
    ]);
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

const dates6 = dates.slice(0, 6);

const FULL_STAGES: NonNullable<LeagueSeasonMeta["continental"]>["stages"] = [
  { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: dates6, drawn: true },
  { name: "r16", rounds: [7, 8], dates: [dates[6]!, dates[7]!], drawn: true },
  { name: "qf", rounds: [9, 10], dates: [dates[8]!, dates[9]!], drawn: false },
  { name: "sf", rounds: [11, 12], dates: [dates[10]!, dates[11]!], drawn: false },
  { name: "final", rounds: [13], dates: [dates[12]!], drawn: false },
];

/** Minimal r16-onward meta, with `stages` overridable to build malformed-meta fixtures. */
function minimalMeta(stages = FULL_STAGES): LeagueSeasonMeta {
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
      stages,
      countryOf: {},
      level: {},
      championId: null,
    },
  };
}

describe("advanceContinental — undecided tie", () => {
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

describe("advanceContinental — malformed meta", () => {
  test("missing a required stage (group/r16/final) throws, naming the stage", () => {
    const withoutFinal = FULL_STAGES.filter((s) => s.name !== "final");
    const meta = minimalMeta(withoutFinal);
    const roundsById = new Map<number, Fixture[]>();
    expect(() => advanceContinental(meta, roundsById, 13, seedKey)).toThrow(/"final"/);
  });

  test("a decided second leg with no stage after it (malformed meta) throws, naming the missing stage", () => {
    // group, r16 (drawn, decided below), final — "qf" (the stage that should follow r16) is missing.
    const withoutQfAndSf = FULL_STAGES.filter((s) => s.name === "group" || s.name === "r16" || s.name === "final");
    const meta = minimalMeta(withoutQfAndSf);

    const leg1: Fixture = {
      id: "ucl_2026_r7_1", date: dates[6]!, competition: "ucl", round: 7,
      home: "Ya", away: "Xa", played: true, result: { home: 1, away: 0 }, tieId: "tieA", leg: 1,
    };
    const leg2: Fixture = {
      id: "ucl_2026_r8_1", date: dates[7]!, competition: "ucl", round: 8,
      home: "Xa", away: "Ya", played: true, result: { home: 2, away: 0 },
      tieId: "tieA", leg: 2, knockout: true, aggregate: { home: 0, away: 1 },
    };
    const roundsById = new Map<number, Fixture[]>([[7, [leg1]], [8, [leg2]]]);

    expect(() => advanceContinental(meta, roundsById, 8, seedKey)).toThrow(/"qf"/);
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

describe("buildContinentalArchive", () => {
  const baseMeta = (championId: string | null): LeagueSeasonMeta => ({
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
      stages: [],
      countryOf: {},
      level: {},
      championId,
    },
  });

  test("title for the champion", () => {
    const a = buildContinentalArchive(baseMeta("c7"), (id) => ({ name: `Club ${id}`, coachId: null, coachName: "" }));
    expect(a.leagueSlug).toBe("ucl");
    expect(a.year).toBe(2026);
    expect(a.standings).toEqual([]);
    expect(a.titles).toEqual([{ competition: "ucl", clubId: "c7", clubName: "Club c7", coachId: null, coachName: "" }]);
  });

  test("no champion -> no titles", () => {
    const a = buildContinentalArchive(baseMeta(null), () => ({ name: "unused", coachId: null, coachName: "" }));
    expect(a.titles).toEqual([]);
    expect(a.standings).toEqual([]);
  });
});
