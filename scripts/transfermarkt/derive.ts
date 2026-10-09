import type { MainRole } from "@/Domain/roles";
import type { DetailedRole } from "@/types/playerTypes";
import { fitSeedAgeEffects, levelOf, type SeedFit } from "@/../scripts/transfermarkt/level";
import { COVERAGE_MIN, MIN_VALUED_PLAYERS, reorderLeague, youthCaps } from "@/../scripts/transfermarkt/reorder";

/** What the Transfermarkt says about one matched player (already parsed; nationality already in world spelling). */
export interface MatchInfo {
  tmId: string;
  value: number | null;
  position: DetailedRole | null;
  birthDate: string | null;
  heightCm: number | null;
  /** Only for a player with no nationality in the world, and only when it resolves to a flag. */
  nationality?: string | null;
}

export interface LeaguePlayer {
  id: string;
  squadId: string;
  league: string;
  age: number;
  /** Current overall (`computeOverallAvg`). */
  overall: number;
  /** Main line for the line premium: the Transfermarkt position's line when known, else positions[0]. */
  line: MainRole;
  /** Line before the recalibration (positions[0]); the reorder keeps each line's old notes. Defaults to `line`. */
  fromLine?: MainRole;
  /** Overall before the recalibration, at the old position (the old multiset of `fromLine`). Defaults to `overall`. */
  fromOverall?: number;
  /** open-football seed overall, when the player comes from the seed (covariate of the age fit). */
  seedOverall?: number;
  match?: MatchInfo;
}

export interface DerivedEntry {
  targetOverall?: number;
  naturalPosition?: DetailedRole;
  birthDate?: string;
  heightCm?: number;
  nationality?: string;
}

export interface LeagueSummary { players: number; matched: number; valued: number; coverage: number; reordered: boolean }

export interface DerivedResult {
  players: Record<string, DerivedEntry>;
  leagues: Record<string, LeagueSummary>;
  /** Unrounded new overall of every player whose note changes (reordered or youth-capped). */
  targets: Map<string, number>;
  effects: SeedFit;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (x: number) => Math.round(x * 100) / 100;
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/**
 * Age and line effects (seed covariate) over every valued match, then per league: coverage = valued ÷ players; at or above
 * `COVERAGE_MIN` (and with at least `MIN_VALUED_PLAYERS` valued) the valued players are reordered by level, line by line, and unmatched youths capped. Positions, birth
 * date, height and nationality are taken from every match regardless of coverage.
 */
export function buildDerived(
  players: LeaguePlayer[],
  coverageMin = COVERAGE_MIN,
  minValued = MIN_VALUED_PLAYERS,
): DerivedResult {
  const valued = players.filter((p) => p.match?.value != null && p.match.value > 0);
  const effects = fitSeedAgeEffects(valued
    .filter((p) => p.seedOverall != null)
    .map((p) => ({ league: p.league, age: p.age, line: p.line, value: p.match!.value!, seedOverall: p.seedOverall! })));
  const level = new Map(valued.map((p) => [p.id, levelOf({ age: p.age, line: p.line, value: p.match!.value! }, effects)]));

  const byLeague = new Map<string, LeaguePlayer[]>();
  for (const p of players) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);

  const targets = new Map<string, number>();
  const leagues: Record<string, LeagueSummary> = {};
  for (const [slug, list] of [...byLeague].sort(([a], [b]) => a.localeCompare(b))) {
    const inLeague = list.filter((p) => level.has(p.id));
    const coverage = list.length ? inLeague.length / list.length : 0;
    const reordered = inLeague.length > 0 && inLeague.length >= minValued && coverage >= coverageMin;
    leagues[slug] = {
      players: list.length,
      matched: list.filter((p) => p.match).length,
      valued: inLeague.length,
      coverage: round4(coverage),
      reordered,
    };
    if (!reordered) continue;
    const order = reorderLeague(inLeague.map((p) => ({
      id: p.id, overall: p.fromOverall ?? p.overall, fromLine: p.fromLine ?? p.line, line: p.line, level: level.get(p.id)!,
    })));
    for (const [id, t] of order) targets.set(id, t);
    const caps = youthCaps(
      list.map((p) => ({ id: p.id, squadId: p.squadId, age: p.age, overall: p.overall, matched: level.has(p.id) })),
      order,
    );
    for (const [id, t] of caps) targets.set(id, t);
  }

  const out: Record<string, DerivedEntry> = {};
  for (const p of players) {
    const e: DerivedEntry = {};
    const t = targets.get(p.id);
    if (t !== undefined) e.targetOverall = round2(t);
    const m = p.match;
    if (m?.position) e.naturalPosition = m.position;
    if (m?.birthDate && ISO_DATE.test(m.birthDate)) e.birthDate = m.birthDate;
    if (m?.heightCm != null && m.heightCm >= 140 && m.heightCm <= 220) e.heightCm = m.heightCm;
    if (m?.nationality) e.nationality = m.nationality;
    if (Object.keys(e).length) out[p.id] = e;
  }
  return { players: out, leagues, targets, effects };
}
