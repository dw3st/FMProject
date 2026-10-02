import type { Squad } from "@/types/playerTypes";

export type CompetitionKind = "league" | "cup" | "continental";

export interface RankingRow {
  playerId: string;
  name: string;
  squadId: string;
  clubName: string;
  value: number;
  games: number;
}

export interface CompetitionRankings {
  scorers: RankingRow[];
  assists: RankingRow[];
  /** Season-wide average rating; empty for cups and continental competitions. */
  ratings: RankingRow[];
  appearances: RankingRow[];
}

/** Competition slug of the world-wide ranking: every league of the world combined (league games only). */
export const ALL_COMPETITIONS = "all";

export const RANKING_SIZE = 20;
export const MIN_RATED_GAMES = 5;

interface Counts { appearances: number; goals: number; assists: number }

/** Counts of the games played in the given competition kind only (league = total - cup - continental). */
function countsFor(kind: CompetitionKind, log: NonNullable<Squad["players"][number]["seasonLog"]>): Counts {
  if (kind === "cup") return log.cup ?? { appearances: 0, goals: 0, assists: 0 };
  if (kind === "continental") return log.continental ?? { appearances: 0, goals: 0, assists: 0 };
  const cup = log.cup ?? { appearances: 0, goals: 0, assists: 0 };
  const cont = log.continental ?? { appearances: 0, goals: 0, assists: 0 };
  return {
    appearances: Math.max(0, log.appearances - cup.appearances - cont.appearances),
    goals: Math.max(0, log.goals - cup.goals - cont.goals),
    assists: Math.max(0, log.assists - cup.assists - cont.assists),
  };
}

function top(rows: RankingRow[]): RankingRow[] {
  return rows
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.games - b.games || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, RANKING_SIZE);
}

/**
 * Top-20 tables for one competition. `clubIds` are the clubs taking part (league members,
 * clubs of the cup's country, or the continental competition's clubs). Pure.
 */
export function buildCompetitionRankings(
  squads: Squad[],
  competition: { kind: CompetitionKind; clubIds: ReadonlySet<string> },
): CompetitionRankings {
  const scorers: RankingRow[] = [];
  const assists: RankingRow[] = [];
  const ratings: RankingRow[] = [];
  const appearances: RankingRow[] = [];
  for (const squad of squads) {
    if (!competition.clubIds.has(squad.id)) continue;
    for (const p of squad.players) {
      const log = p.seasonLog;
      if (!log) continue;
      const c = countsFor(competition.kind, log);
      const base = { playerId: p.id, name: p.name, squadId: squad.id, clubName: squad.name, games: c.appearances };
      scorers.push({ ...base, value: c.goals });
      assists.push({ ...base, value: c.assists });
      appearances.push({ ...base, value: c.appearances });
      if (competition.kind === "league" && c.appearances >= MIN_RATED_GAMES && log.avgRating > 0) {
        ratings.push({ ...base, value: Math.round(log.avgRating * 100) / 100 });
      }
    }
  }
  return { scorers: top(scorers), assists: top(assists), ratings: top(ratings), appearances: top(appearances) };
}
