import { positionAptitudes, preferredRole, type Aptitude, type DetailedRole } from "@/Domain/positions/positionAptitude";
import type { RosterPlayer, PlayerStatsRecord } from "@/types/playerTypes";
import { Player, type StatusLevel } from "@/Domain/Player";
import { FITNESS } from "@/Domain/fitness/fitnessConfig";
import { isInjured } from "@/Domain/injury/injury";
import { isSuspended } from "@/Domain/discipline/discipline";

/** Capitalizes an injury severity string ("light" → "Light") for i18n key lookup. */
export function capitalizeSeverity(severity: "light" | "medium" | "severe"): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** Whole days between two `YYYY-MM-DD` dates (`to − from`, may be negative). */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type { StatusLevel };

/** Threshold for the "high load" UI indicator — 70% of `FITNESS.LOAD_HIGH` (see `game/fitness.md`). */
const HIGH_LOAD_THRESHOLD = FITNESS.LOAD_HIGH * 0.7;

/** Whether a player's accumulated `load` warrants the high-load icon (slower recovery, faster in-match drain). */
export function isHighLoad(load: number): boolean {
  return load >= HIGH_LOAD_THRESHOLD;
}

export interface DisplayPlayer {
  id: string;
  /** Reborn academy star (own badge). */
  reborn?: boolean;
  squadId?: string;
  /** Primary position (first in list), used for sorting. */
  pos: string;
  /** Natural detailed role (aptitude model, `src/Domain/positions`). */
  natural?: DetailedRole;
  /** Aptitude per detailed role. */
  aptitudes?: Record<DetailedRole, Aptitude>;
  /** All positions the player can play, in preference order. */
  positions: string[];
  name: string;
  age: number;
  avg: number;
  energy: number;
  /** Minutes-equivalent accumulated fatigue (`seasonLog.load`, absent = 0). See `FITNESS.LOAD_HIGH`. */
  load: number;
  salary: string;
  /** Scout only: a free agent (no club). */
  free?: boolean;
  /** Year the contract ends ("—" when none). */
  contractUntil?: string;
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
  /**
   * Scout rows of players outside the user's own squad: the overall shown as a range when the
   * chief scout's uncertainty is large (`overallRange`, `src/Domain/staff`). Absent = exact.
   */
  avgRange?: [number, number];
  /** Active injury details, when `status === "injured"` and `currentDate` was supplied. */
  injury?: { severity: "light" | "medium" | "severe"; returnDate: string; daysLeft: number };
  /** Matches of a ban still to serve, when `status === "suspended"`. */
  suspendedMatches?: number;
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

/** Weekly wage label (same format as `Player.salaryLabel`). */
function formatWeeklyWage(weekly: number): string {
  const w = Math.round(weekly);
  return w >= 1000 ? `${(w / 1000).toFixed(0)}k` : `${w}`;
}

export function toDisplayPlayer(
  player: RosterPlayer,
  clubName: string,
  options?: { squadCountry?: string | null; wageFactor?: number; currentDate?: string },
): DisplayPlayer {
  const avg = Player.overallAvg(player);
  const domain = new Player(avg, player.age);
  const log = player.seasonLog;
  const nat =
    (player.nationality && String(player.nationality).trim()) ||
    (options?.squadCountry && String(options.squadCountry).trim()) ||
    "";
  const injured = options?.currentDate ? isInjured(player, options.currentDate) : false;
  const injuryInfo =
    injured && player.injury && options?.currentDate
      ? {
          severity: player.injury.severity,
          returnDate: player.injury.returnDate,
          daysLeft: Math.max(0, daysBetween(options.currentDate, player.injury.returnDate)),
        }
      : undefined;
  return {
    id: player.id,
    squadId: player.squadId,
    pos: player.positions[0] ?? "—",
    ...(player.stats ? { natural: preferredRole(player), aptitudes: positionAptitudes(player) } : {}),
    positions: player.positions.length > 0 ? player.positions : ["—"],
    name: player.name,
    age: player.age,
    avg: Math.round(avg * 10) / 10,
    energy: log ? Math.round(log.fitness) : 100,
    load: log?.load ?? 0,
    salary: player.contract ? formatWeeklyWage(player.contract.wage) : domain.salaryLabel(options?.wageFactor),
    contractUntil: player.contract ? player.contract.until.slice(0, 4) : "—",
    value: domain.priceLabel,
    valueMillions: domain.valueMillions,
    nationality: nat,
    goals: log?.goals ?? 0,
    assists: log?.assists ?? 0,
    avgRating: log ? Math.round((log.avgRating ?? 0) * 10) / 10 : 0,
    phase: Player.formToStatus(log?.recentRatings ?? []),
    training: log ? Player.trainingToStatus(log.trainingSessions) : (3 as StatusLevel),
    moral: log ? Player.moraleToStatus(log.morale) : (3 as StatusLevel),
    status: injured ? "injured" : isSuspended(player) ? "suspended" : "fit",
    ...(!injured && isSuspended(player) ? { suspendedMatches: player.suspension!.matches } : {}),
    club: clubName,
    stats: player.stats,
    preferredFoot: player.preferredFoot,
    injury: injuryInfo,
    ...(player.reborn ? { reborn: true } : {}),
  };
}
