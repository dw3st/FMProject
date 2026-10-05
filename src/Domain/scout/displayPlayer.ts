import { positionAptitudes, preferredRole, type Aptitude, type DetailedRole } from "@/Domain/positions/positionAptitude";
import type { RosterPlayer, PlayerStatsRecord } from "@/types/playerTypes";
import { Player, type StatusLevel } from "@/Domain/Player";
import { isInjured } from "@/Domain/injury/injury";
import { isSuspended } from "@/Domain/discipline/discipline";
import { daysBetween } from "@/Domain/dates";
import { formatWageShort } from "@/Domain/money";
import { weeklyWage } from "@/Domain/finance/wages";

/** A player row as the squad, scout and player screens show it (built on the server for the scout search). */
export interface DisplayPlayer {
  id: string;
  /** Reborn academy star (own badge). */
  reborn?: boolean;
  /** On loan here (`.claude/rules/game/negotiation.md`): parent club name and return date. */
  loan?: { fromClubName: string; until: string };
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
  /** Weekly wage in EUR behind `salary` (for sorting; the label is text). */
  wage: number;
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
  /** Market value in millions of € (same basis as `value` label). */
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
    salary: player.contract ? formatWageShort(player.contract.wage) : domain.salaryLabel(options?.wageFactor),
    wage: player.contract?.wage ?? weeklyWage(domain.overallRating) * (options?.wageFactor ?? 1),
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
    ...(player.loan ? { loan: { fromClubName: player.loan.fromClubName, until: player.loan.until } } : {}),
  };
}
