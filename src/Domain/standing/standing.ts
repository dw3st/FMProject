import { legendTier } from "@/Domain/clubHistory/clubHistory";
import { historyRowFromLog } from "@/Domain/history/history";
import { suggestedStatuses } from "@/Domain/morale/morale";
import { overallAvg } from "@/Domain/playerRating";
import { clamp } from "@/Domain/math";
import type { SquadStatus } from "@/types/moraleTypes";
import type { PlayerHistoryRow, PlayerStanding, RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * Player standing bars (9.2, `.claude/rules/game/standing.md`): with the fans, at the club and in the world,
 * each 0..10, recomputed every Monday for every squad. Together they move the market value by up to ±15%.
 */
export const STANDING = {
  /** Fans: average rating at the club, 5.8 = 0 … 7.2 = full part. */
  RATING_FLOOR: 5.8,
  RATING_SPAN: 1.4,
  RATING_POINTS: 5,
  /** Rating used before he has 5 games at the club. */
  RATING_UNKNOWN: 2.5,
  MIN_APPS: 5,
  /** (goals + 0.5 × assists) per game at the club that fills the part. */
  CONTRIB_FULL: 0.5,
  CONTRIB_POINTS: 2,
  /** Seasons at the club that fill the tenure part. */
  TENURE_SEASONS: 5,
  TENURE_POINTS: 3,
  /** Club bar by squad role; idol and legend by the club-history rules. */
  ROLE: { key: 7, starter: 6, rotation: 4, youth: 3, backup: 2 } satisfies Record<SquadStatus, number>,
  IDOL_MIN: 8,
  IDOL_BONUS: 2,
  LEGEND: 10,
  /** World bar by world rank (overall): rank at most `[0]` gives `[1]`. */
  WORLD_RANKS: [[10, 10], [25, 9], [50, 8], [100, 7], [250, 6], [500, 5], [1000, 4], [2500, 3], [5000, 2], [10000, 1]] as const,
  /** +1 per award in his last two seasons, up to 3; a world player award ever = at least 9. */
  AWARD_BONUS_MAX: 3,
  WORLD_PLAYER_MIN: 9,
  /** Value: each bar moves it by `weight × (bar − mid) / 5`; the total is capped at ±15%. */
  VALUE: { fansMid: 3, clubMid: 4, fans: 0.05, club: 0.05, world: 0.05, cap: 0.15 },
} as const;

/** Rank (1 = best) of every player in the world by overall. */
export function worldRanks(squads: readonly Pick<Squad, "players">[]): Map<string, number> {
  const all: { id: string; v: number }[] = [];
  for (const s of squads) for (const p of s.players) all.push({ id: p.id, v: overallAvg(p) });
  all.sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  return new Map(all.map((x, i) => [x.id, i + 1]));
}

interface ClubTotals { apps: number; goals: number; assists: number; titles: number; awards: number; seasons: number; avgRating: number | null }

/** His numbers at `squadId`: closed rows there plus the current season (open partials discounted). */
export function clubTotals(p: RosterPlayer, squadId: string): ClubTotals {
  const rows: PlayerHistoryRow[] = (p.history ?? []).filter((r) => r.squadId === squadId);
  const current = historyRowFromLog(p.seasonLog, { squadId, clubName: "", league: "" }, "", [], p.history);
  const seasons = new Set(rows.map((r) => r.season));
  const t: ClubTotals = { apps: 0, goals: 0, assists: 0, titles: 0, awards: 0, seasons: seasons.size, avgRating: null };
  for (const r of [...rows, ...(current ? [current] : [])]) {
    t.apps += r.apps;
    t.goals += r.goals;
    t.assists += r.assists;
    t.titles += r.titles.length;
    t.awards += r.awards?.length ?? 0;
  }
  if (current && current.apps > 0) t.seasons += 1;
  // Rating: this season with enough games, else the last season there that had them.
  const recent = [...(current ? [current] : []), ...[...rows].reverse()].find((r) => r.apps >= STANDING.MIN_APPS && r.avgRating !== null);
  t.avgRating = recent?.avgRating ?? null;
  return t;
}

export function fansBar(t: ClubTotals): number {
  const S = STANDING;
  const rating = t.avgRating === null ? S.RATING_UNKNOWN : clamp((t.avgRating - S.RATING_FLOOR) / S.RATING_SPAN, 0, 1) * S.RATING_POINTS;
  const contrib = t.apps > 0 ? clamp((t.goals + 0.5 * t.assists) / t.apps / S.CONTRIB_FULL, 0, 1) * S.CONTRIB_POINTS : 0;
  const tenure = Math.min(t.seasons, S.TENURE_SEASONS) / S.TENURE_SEASONS * S.TENURE_POINTS;
  return clamp(Math.round(rating + contrib + tenure), 0, 10);
}

export function clubBar(status: SquadStatus, t: ClubTotals): number {
  const tier = legendTier({ name: "", apps: t.apps, goals: t.goals, assists: t.assists, titles: t.titles, awards: t.awards });
  const base = STANDING.ROLE[status];
  if (tier === "legend") return STANDING.LEGEND;
  if (tier === "idol") return Math.min(9, Math.max(STANDING.IDOL_MIN, base + STANDING.IDOL_BONUS));
  return base;
}

export function worldBar(rank: number | undefined, history: readonly PlayerHistoryRow[] | undefined): number {
  let bar = 0;
  if (rank !== undefined) for (const [max, v] of STANDING.WORLD_RANKS) if (rank <= max) { bar = v; break; }
  const rows = history ?? [];
  const lastSeasons = new Set(rows.map((r) => r.season).slice(-2));
  const recentAwards = rows.filter((r) => lastSeasons.has(r.season)).reduce((n, r) => n + (r.awards?.length ?? 0), 0);
  bar += Math.min(recentAwards, STANDING.AWARD_BONUS_MAX);
  if (rows.some((r) => r.awards?.some((a) => a.kind === "world_player"))) bar = Math.max(bar, STANDING.WORLD_PLAYER_MIN);
  return clamp(bar, 0, 10);
}

/** The three bars of every player of a squad. */
export function squadStandings(squad: Squad, ranks: ReadonlyMap<string, number>): Map<string, PlayerStanding> {
  const suggested = suggestedStatuses(squad);
  const out = new Map<string, PlayerStanding>();
  for (const p of squad.players) {
    const t = clubTotals(p, squad.id);
    const status = p.squadStatus ?? suggested[p.id] ?? "rotation";
    out.set(p.id, { fans: fansBar(t), club: clubBar(status, t), world: worldBar(ranks.get(p.id), p.history) });
  }
  return out;
}

/** The squad with the bars written; the same object when nothing changed (no write needed). */
export function withStandings(squad: Squad, ranks: ReadonlyMap<string, number>): Squad {
  const bars = squadStandings(squad, ranks);
  let changed = false;
  const players = squad.players.map((p) => {
    const s = bars.get(p.id)!;
    const o = p.standing;
    if (o && o.fans === s.fans && o.club === s.club && o.world === s.world) return p;
    changed = true;
    return { ...p, standing: s };
  });
  return changed ? { ...squad, players } : squad;
}

/** Market multiplier of the bars (1 without them), capped at ±15%. */
export function standingValueMult(p: Pick<RosterPlayer, "standing">): number {
  const s = p.standing;
  if (!s) return 1;
  const V = STANDING.VALUE;
  const delta = V.fans * (s.fans - V.fansMid) / 5 + V.club * (s.club - V.clubMid) / 5 + V.world * s.world / 10;
  return 1 + clamp(delta, -V.cap, V.cap);
}
