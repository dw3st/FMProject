import type {
  ContinentalMetaData,
  ContinentalStage,
  ContinentalStageName,
  Fixture,
  LeagueSeasonMeta,
  RoundFixtures,
  SeasonArchive,
} from "@/types/calendarTypes";
import { seedFrom } from "@/Domain/cups/cupIds";
import { groupTable } from "@/Domain/continental/groupTable";
import { drawFree, drawRoundOf16, finalWinner, tieWinner, twoLegFixtures, withAggregate } from "@/Domain/continental/knockout";
import { mulberry32 } from "@/Domain/rng";

/** One tie of a freshly drawn stage — the first leg (or the single neutral match for the final). */
export interface ContinentalDrawnTie {
  home: string;
  away: string;
  /** Absent only for the final, which has no `tieId` (single neutral match, no aggregate). */
  tieId?: string;
  firstLegDate: string;
}

/**
 * Inbox-relevant thing that happened while advancing a continental competition. Consumers (Plan 3)
 * turn these into inbox messages; `advanceContinentalStages` (backend) turns an `undecidedTie` into
 * a `logError`, mirroring how `advanceCupStages` handles a cup tie that finished level and undecided.
 */
export type ContinentalEvent =
  | { kind: "drawn"; stage: ContinentalStageName; round: number; ties: ContinentalDrawnTie[] }
  | { kind: "advanced"; clubId: string; stage: ContinentalStageName }
  | { kind: "eliminated"; clubId: string; stage: ContinentalStageName }
  /** A two-legged tie (or the final) finished level with no penalties recorded — should not happen. */
  | { kind: "undecidedTie"; tieId: string }
  | { kind: "champion"; clubId: string };

/** Stage order, group first — used to find "the stage right after this one" without array-index luck. */
const STAGE_ORDER: ContinentalStageName[] = ["group", "r16", "qf", "sf", "final"];

/** Looks a stage up by name; throws instead of returning undefined on malformed meta. */
function stageByName(cont: ContinentalMetaData, name: ContinentalStageName): ContinentalStage {
  const stage = cont.stages.find((s) => s.name === name);
  if (!stage) {
    throw new Error(`advanceContinental: meta.continental.stages is missing a "${name}" stage — malformed meta`);
  }
  return stage;
}

/** The stage that follows `current` in `STAGE_ORDER`; throws for "final" (nothing follows it) or malformed meta. */
function nextStageName(current: ContinentalStageName): ContinentalStageName {
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(current) + 1];
  if (!next) throw new Error(`advanceContinental: no stage follows "${current}" — malformed meta`);
  return next;
}

/** Builds the `ties` payload of a "drawn" event from the fixtures of the stage's first round. */
function tiesEventFrom(fixtures: Fixture[]): ContinentalDrawnTie[] {
  return fixtures.map((f) => ({ home: f.home, away: f.away, tieId: f.tieId, firstLegDate: f.date }));
}

export interface ContinentalAdvanceResult {
  meta: LeagueSeasonMeta;
  /** Updated/new round files to persist. Empty when nothing needed writing (e.g. an undecided tie). */
  writes: RoundFixtures[];
  /** Only present when the final was just decided. */
  championId?: string;
  events: ContinentalEvent[];
}

/**
 * Advances a continental competition (UCL/UEL/Lib/Sud) by one played round. `roundsById` must hold
 * the fixtures of every round this step needs to read (see below) — missing entries throw, since
 * that's always a caller bug, not a legitimate "nothing to do yet" state.
 *
 * - `playedRound` is the last round of the group stage (6): once all group rounds are complete,
 *   builds each group's table (`groupTable`), draws the round of 16 (`drawRoundOf16`) from the
 *   winners/runners-up, and writes both r16 legs (`twoLegFixtures`). Requires rounds 1..6.
 * - `playedRound` is a first-leg round of a two-legged stage (7, 9, 11): writes `aggregate` onto
 *   every matching second-leg fixture (`withAggregate`). Requires `playedRound` and the next round
 *   (the second leg, already drawn but unplayed).
 * - `playedRound` is a second-leg round (8, 10, 12): resolves each tie (`tieWinner`). If every tie
 *   has a winner, draws the next stage (`drawFree`; sf → final is a single neutral fixture). If any
 *   tie is level with no penalties recorded, does nothing beyond reporting it via `events` — the
 *   caller decides what to do (mirrors `advanceCupStages`' `logError` for the same cup situation).
 *   Requires `playedRound` and the matching first-leg round.
 * - `playedRound` is the final (13): resolves the champion (`finalWinner`). Requires `playedRound`.
 *
 * Returns `null` when `playedRound` doesn't complete anything (an in-progress round, or a stage
 * that was already drawn/decided — safe to call more than once for the same round).
 *
 * `seedKey` must be unique per save + season + competition — callers pass `${saveId}:${year}:${slug}`
 * (mirrors the cup's `${saveId}:${year}:${country}`, see `cupWorld.ts`). It seeds every draw made
 * here (r16/qf/sf/final), each under its own suffix (e.g. `${seedKey}:r16`), so two competitions or
 * two seasons never share a draw even if called with the same `playedRound`.
 */
export function advanceContinental(
  meta: LeagueSeasonMeta,
  roundsById: Map<number, Fixture[]>,
  playedRound: number,
  seedKey: string,
): ContinentalAdvanceResult | null {
  const cont = meta.continental;
  if (!cont) throw new Error("advanceContinental: meta.continental is missing");

  const fixturesOf = (round: number): Fixture[] => {
    const f = roundsById.get(round);
    if (!f) throw new Error(`advanceContinental: round ${round} fixtures not provided in roundsById`);
    return f;
  };
  const roundComplete = (round: number): boolean => {
    const f = fixturesOf(round);
    return f.length > 0 && f.every((x) => x.played);
  };

  const group = stageByName(cont, "group");
  const r16 = stageByName(cont, "r16");
  const final = stageByName(cont, "final");

  // 1. Group stage complete -> group tables -> draw round of 16.
  if (playedRound === group.rounds.at(-1)) {
    if (r16.drawn) return null;
    if (!group.rounds.every(roundComplete)) return null;

    const allGroupFixtures = group.rounds.flatMap(fixturesOf);
    const groupOf: Record<string, string> = {};
    for (const g of cont.groups) for (const club of g.clubs) groupOf[club] = g.name;

    const winners: string[] = [];
    const runnersUp: string[] = [];
    const events: ContinentalEvent[] = [];
    for (const g of cont.groups) {
      const table = groupTable(g.clubs, allGroupFixtures);
      winners.push(table[0]!.squadId);
      runnersUp.push(table[1]!.squadId);
      events.push({ kind: "advanced", clubId: table[0]!.squadId, stage: "group" });
      events.push({ kind: "advanced", clubId: table[1]!.squadId, stage: "group" });
      events.push({ kind: "eliminated", clubId: table[2]!.squadId, stage: "group" });
      events.push({ kind: "eliminated", clubId: table[3]!.squadId, stage: "group" });
    }

    const rng = mulberry32(seedFrom(`${seedKey}:r16`));
    const pairing = drawRoundOf16(winners, runnersUp, groupOf, cont.countryOf, rng);
    const fixtures = twoLegFixtures(meta.leagueSlug, meta.year, "r16", pairing, r16.rounds, r16.dates);
    const writes: RoundFixtures[] = r16.rounds.map((round) => ({
      leagueSlug: meta.leagueSlug,
      round,
      fixtures: fixtures.filter((f) => f.round === round),
    }));
    const firstLegFixtures = fixtures.filter((f) => f.round === r16.rounds[0]);
    events.push({ kind: "drawn", stage: "r16", round: r16.rounds[0]!, ties: tiesEventFrom(firstLegFixtures) });

    const stages = cont.stages.map((s) => (s.name === "r16" ? { ...s, drawn: true } : s));
    return { meta: { ...meta, continental: { ...cont, stages } }, writes, events };
  }

  // 2. First leg of a two-legged stage complete -> write aggregate onto the second leg.
  const legStage1 = cont.stages.find((s) => s.rounds.length === 2 && s.rounds[0] === playedRound);
  if (legStage1) {
    if (!roundComplete(playedRound)) return null;

    const leg2Round = legStage1.rounds[1]!;
    const leg2 = fixturesOf(leg2Round);
    if (leg2.length > 0 && leg2[0]!.aggregate !== undefined) return null; // already processed

    const leg1 = fixturesOf(playedRound);
    const leg1ByTie = new Map(leg1.map((f) => [f.tieId, f]));
    const updated = leg2.map((f) => {
      const l1 = leg1ByTie.get(f.tieId);
      if (!l1) throw new Error(`advanceContinental: no leg1 fixture for tieId "${f.tieId}"`);
      return withAggregate(f, l1);
    });

    return {
      meta,
      writes: [{ leagueSlug: meta.leagueSlug, round: leg2Round, fixtures: updated }],
      events: [],
    };
  }

  // 3. Second leg of a two-legged stage complete -> tie winners -> draw the next stage.
  const legStage2 = cont.stages.find((s) => s.rounds.length === 2 && s.rounds[1] === playedRound);
  if (legStage2) {
    if (!roundComplete(playedRound)) return null;

    const next = stageByName(cont, nextStageName(legStage2.name));
    if (next.drawn) return null;

    const leg2 = fixturesOf(playedRound);
    const leg1 = fixturesOf(legStage2.rounds[0]!);
    const leg1ByTie = new Map(leg1.map((f) => [f.tieId, f]));
    const outcomes = leg2.map((l2) => {
      const l1 = leg1ByTie.get(l2.tieId);
      if (!l1) throw new Error(`advanceContinental: no leg1 fixture for tieId "${l2.tieId}"`);
      return { l2, winner: tieWinner(l1, l2) };
    });

    const undecided = outcomes.filter((o) => o.winner === null);
    if (undecided.length > 0) {
      return {
        meta,
        writes: [],
        events: undecided.map((o) => ({ kind: "undecidedTie" as const, tieId: o.l2.tieId! })),
      };
    }

    const winners: string[] = [];
    const events: ContinentalEvent[] = [];
    for (const { l2, winner } of outcomes) {
      const w = winner!;
      const loser = w === l2.home ? l2.away : l2.home;
      winners.push(w);
      events.push({ kind: "advanced", clubId: w, stage: legStage2.name });
      events.push({ kind: "eliminated", clubId: loser, stage: legStage2.name });
    }

    const rng = mulberry32(seedFrom(`${seedKey}:${next.name}`));
    const pairing = drawFree(winners, rng);
    const fixtures = twoLegFixtures(meta.leagueSlug, meta.year, next.name, pairing, next.rounds, next.dates);
    const writes: RoundFixtures[] = next.rounds.map((round) => ({
      leagueSlug: meta.leagueSlug,
      round,
      fixtures: fixtures.filter((f) => f.round === round),
    }));
    const firstLegFixtures = fixtures.filter((f) => f.round === next.rounds[0]);
    events.push({ kind: "drawn", stage: next.name, round: next.rounds[0]!, ties: tiesEventFrom(firstLegFixtures) });

    const stages = cont.stages.map((s) => (s.name === next.name ? { ...s, drawn: true } : s));
    return { meta: { ...meta, continental: { ...cont, stages } }, writes, events };
  }

  // 4. Final complete -> champion.
  if (playedRound === final.rounds[0]) {
    if (cont.championId) return null;
    if (!roundComplete(playedRound)) return null;

    const finalFixture = fixturesOf(playedRound)[0]!;
    const champ = finalWinner(finalFixture);
    if (!champ) {
      return { meta, writes: [], events: [{ kind: "undecidedTie", tieId: finalFixture.id }] };
    }
    const loser = champ === finalFixture.home ? finalFixture.away : finalFixture.home;

    return {
      meta: { ...meta, continental: { ...cont, championId: champ } },
      writes: [],
      championId: champ,
      events: [
        { kind: "advanced", clubId: champ, stage: "final" },
        { kind: "eliminated", clubId: loser, stage: "final" },
        { kind: "champion", clubId: champ },
      ],
    };
  }

  return null;
}

// --- Continent rollover (Task 11) ---

export interface ContinentalTier1LeagueState {
  continent: "Europe" | "South America";
  year: number;
  /** Whether this league's season crosses the calendar year (e.g. "2026-27"), as opposed to a single-year season. */
  crossYear: boolean;
}

export interface ContinentalToRegenerate {
  continent: "Europe" | "South America";
  year: number;
}

const CONTINENTS: ("Europe" | "South America")[] = ["Europe", "South America"];

/**
 * Continents whose primary (UCL/Lib) and secondary (UEL/Sud) competitions must be regenerated:
 * every one of the continent's season-defining tier-1 leagues has moved to a season later than the
 * competition's current year. "Season-defining" is cross-year leagues only in Europe (the domestic
 * leagues UCL/UEL actually track), and every tier-1 league in South America (calendar-year leagues,
 * all season-defining). The new year is the earliest of those leagues' years — mirrors
 * `countriesToRegenerate` (`src/Domain/cups/cupRollover.ts`).
 */
export function continentsToRegenerate(
  tier1: ContinentalTier1LeagueState[],
  compYear: Partial<Record<"Europe" | "South America", number>>,
): ContinentalToRegenerate[] {
  const out: ContinentalToRegenerate[] = [];
  for (const continent of CONTINENTS) {
    const year = compYear[continent];
    if (year === undefined) continue;

    const seasonDefining = tier1.filter(
      (l) => l.continent === continent && (continent === "Europe" ? l.crossYear : true),
    );
    if (seasonDefining.length === 0) continue;
    if (!seasonDefining.every((l) => l.year > year)) continue;

    out.push({ continent, year: Math.min(...seasonDefining.map((l) => l.year)) });
  }
  return out;
}

/**
 * Season archive of a finished continental competition (no table; one title for the champion) —
 * the continental equivalent of `buildCupArchive` (`src/Domain/cups/cupRollover.ts`), reading
 * `meta.continental.championId` instead of `meta.cup.championId`.
 */
export function buildContinentalArchive(
  meta: LeagueSeasonMeta,
  clubInfo: (squadId: string) => { name: string; coachId: number | null; coachName: string },
): SeasonArchive {
  const champ = meta.continental?.championId ?? null;
  return {
    leagueSlug: meta.leagueSlug,
    year: meta.year,
    start: meta.start,
    end: meta.end,
    standings: [],
    titles: champ
      ? [(() => {
          const info = clubInfo(champ);
          return {
            competition: meta.leagueSlug,
            clubId: champ,
            clubName: info.name,
            coachId: info.coachId,
            coachName: info.coachName,
          };
        })()]
      : [],
    playerLogs: {},
  };
}
