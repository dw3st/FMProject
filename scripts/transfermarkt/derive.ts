import type { MainRole } from "@/Domain/roles";
import type { DetailedRole } from "@/types/playerTypes";
import { fitEffects, levelOf, type Effects, type ValuedPlayer } from "@/../scripts/transfermarkt/level";
import { COVERAGE_MIN, reorderLeague, youthCaps } from "@/../scripts/transfermarkt/reorder";

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
  /** Main line for the value effects: the Transfermarkt position's line when known, else positions[0]. */
  line: MainRole;
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
  effects: Effects;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (x: number) => Math.round(x * 100) / 100;
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/**
 * Value effects over every valued match, then per league: coverage = valued ÷ players; at or above
 * `COVERAGE_MIN` the valued players are reordered by level and unmatched youths capped. Positions, birth
 * date, height and nationality are taken from every match regardless of coverage.
 */
export function buildDerived(players: LeaguePlayer[], coverageMin = COVERAGE_MIN): DerivedResult {
  const valued: ValuedPlayer[] = players
    .filter((p) => p.match?.value != null && p.match.value > 0)
    .map((p) => ({ id: p.id, league: p.league, age: p.age, line: p.line, value: p.match!.value! }));
  const effects = fitEffects(valued);
  const level = new Map(valued.map((v) => [v.id, levelOf(v, effects)]));

  const byLeague = new Map<string, LeaguePlayer[]>();
  for (const p of players) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);

  const targets = new Map<string, number>();
  const leagues: Record<string, LeagueSummary> = {};
  for (const [slug, list] of [...byLeague].sort(([a], [b]) => a.localeCompare(b))) {
    const inLeague = list.filter((p) => level.has(p.id));
    const coverage = list.length ? inLeague.length / list.length : 0;
    const reordered = inLeague.length > 0 && coverage >= coverageMin;
    leagues[slug] = {
      players: list.length,
      matched: list.filter((p) => p.match).length,
      valued: inLeague.length,
      coverage: round4(coverage),
      reordered,
    };
    if (!reordered) continue;
    const order = reorderLeague(inLeague.map((p) => ({ id: p.id, overall: p.overall, level: level.get(p.id)! })));
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
