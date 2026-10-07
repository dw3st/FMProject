/**
 * Squad lines after the market recalibration. `applyDerived` moves a player to his Transfermarkt line
 * (`positions[0]`), which runs after importEspn's own squad validation, so a squad can end up below a line minimum
 * (or above MAX_SQUAD once filled). This pass repairs it with the importer's own tools: `fillSquad` (deterministic
 * filler youth up to MIN_BY_ROLE, then `trimSquad` to MAX_SQUAD keeping each line's minimum). Pure.
 */
import { fillSquad, LINES, lineMedians } from "@/../scripts/espn/estimate";
import { MIN_LINE_FOR_CLUB_BASE } from "@/../scripts/espn/apply";
import { MAX_SQUAD, MIN_BY_ROLE, MIN_SQUAD, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import { getMainRole } from "@/Domain/roles";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const lineOf = (p: RosterPlayer): MainRole => getMainRole(p.positions[0] ?? "") as MainRole;

/** Problems of a squad's lines (empty = fine): a line below its minimum, too few or too many players. */
export function squadLineIssues(players: RosterPlayer[]): string[] {
  const out: string[] = [];
  for (const line of LINES) {
    const n = players.filter((p) => lineOf(p) === line).length;
    if (n < MIN_BY_ROLE[line]) out.push(`${line} ${n} < ${MIN_BY_ROLE[line]}`);
  }
  if (players.length < MIN_SQUAD) out.push(`${players.length} players < ${MIN_SQUAD}`);
  if (players.length > MAX_SQUAD) out.push(`${players.length} players > ${MAX_SQUAD}`);
  return out;
}

export interface BalanceInput {
  squadId: string;
  players: RosterPlayer[];
  /** First/last names of the squad's country (filler youth). */
  pool: NamePool;
  country: string;
  /** Per-line attribute medians of the squad's league, then of the world (stats base of a filler youth). */
  leagueBase: Partial<Record<MainRole, PlayerStatsRecord>>;
  worldBase: Partial<Record<MainRole, PlayerStatsRecord>>;
  /** Overall (0..10) of a player, for the youth's profile adjective. */
  overall: (p: RosterPlayer) => number;
  /** Ranking of the MAX_SQUAD cut (the recalibrated / curated note). */
  rank: (p: RosterPlayer) => number;
}

/**
 * Same `players` (by reference) when the squad already respects the line minimums and the size limits; otherwise
 * the importer's fill + cut. A youth's stats base is the squad's own line median (with at least
 * MIN_LINE_FOR_CLUB_BASE players there), else the league's, else the world's — as in importEspn.
 */
export function balanceSquadLines(a: BalanceInput): { players: RosterPlayer[]; added: RosterPlayer[]; cut: RosterPlayer[] } {
  if (squadLineIssues(a.players).length === 0) return { players: a.players, added: [], cut: [] };
  const baseFor = (line: MainRole): PlayerStatsRecord => {
    const own = a.players.filter((p) => lineOf(p) === line);
    if (own.length >= MIN_LINE_FOR_CLUB_BASE) return lineMedians(own)[line]!;
    return a.leagueBase[line] ?? a.worldBase[line] ?? a.worldBase.Midfielder!;
  };
  const filled = fillSquad(a.squadId, a.players, a.pool, a.country, baseFor, a.overall, a.rank);
  const before = new Set(a.players.map((p) => p.id));
  const after = new Set(filled.map((p) => p.id));
  return {
    players: filled,
    added: filled.filter((p) => !before.has(p.id)),
    cut: a.players.filter((p) => !after.has(p.id)),
  };
}
