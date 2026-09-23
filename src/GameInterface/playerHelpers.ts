import type { RosterPlayer, PlayerStatsRecord } from "@/types/playerTypes";
import { Player, type StatusLevel } from "@/Domain/Player";

export type { StatusLevel };

export interface DisplayPlayer {
  id: string;
  squadId?: string;
  /** Primary position (first in list), used for sorting. */
  pos: string;
  /** All positions the player can play, in preference order. */
  positions: string[];
  name: string;
  age: number;
  avg: number;
  energy: number;
  salary: string;
  value: string;
  goals: number;
  assists: number;
  avgRating: number;
  phase: StatusLevel;
  training: StatusLevel;
  moral: StatusLevel;
  status: "fit" | "injured" | "suspended";
  club: string;
  stats: PlayerStatsRecord;
  preferredFoot: "left" | "right";
  /** When set (e.g. scout), used for `/player/:leagueSlug/:clubSlug/:id`. */
  leagueSlug?: string;
  clubSlug?: string;
  /** Market value in millions of £ (same basis as `value` label). */
  valueMillions: number;
  /** Nationality label for lists / filters; may be inferred from club country. */
  nationality: string;
}

/** Split `squadId` (e.g. `premier_league_arsenal`) using known league slugs (longest match first). */
export function resolveSquadIdFromLeagues(
  squadId: string,
  leagueSlugs: string[],
): { leagueSlug: string; clubSlug: string } | null {
  const sorted = [...leagueSlugs].sort((a, b) => b.length - a.length);
  for (const league of sorted) {
    const prefix = `${league}_`;
    if (squadId.startsWith(prefix)) {
      return { leagueSlug: league, clubSlug: squadId.slice(prefix.length) };
    }
  }
  return null;
}

export function toDisplayPlayer(
  player: RosterPlayer,
  clubName: string,
  options?: { squadCountry?: string | null },
): DisplayPlayer {
  const avg = Player.overallAvg(player);
  const domain = new Player(avg, player.age);
  const log = player.seasonLog;
  const nat =
    (player.nationality && String(player.nationality).trim()) ||
    (options?.squadCountry && String(options.squadCountry).trim()) ||
    "";
  return {
    id: player.id,
    squadId: player.squadId,
    pos: player.positions[0] ?? "—",
    positions: player.positions.length > 0 ? player.positions : ["—"],
    name: player.name,
    age: player.age,
    avg: Math.round(avg * 10) / 10,
    energy: log ? Math.round(log.fitness) : 100,
    salary: domain.salaryLabel,
    value: domain.priceLabel,
    valueMillions: domain.valueMillions,
    nationality: nat,
    goals: log?.goals ?? 0,
    assists: log?.assists ?? 0,
    avgRating: log ? Math.round((log.avgRating ?? 0) * 10) / 10 : 0,
    phase: Player.formToStatus(log?.recentRatings ?? []),
    training: log ? Player.trainingToStatus(log.trainingSessions) : (3 as StatusLevel),
    moral: log ? Player.moraleToStatus(log.morale) : (3 as StatusLevel),
    status: "fit",
    club: clubName,
    stats: player.stats,
    preferredFoot: player.preferredFoot,
  };
}
