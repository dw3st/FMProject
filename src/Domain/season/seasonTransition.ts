import type { SeasonArchive, SeasonData, SeasonTitle, LeagueCalendarResult } from "@/types/calendarTypes";
import type { LeagueTeam, PlayerSeasonLog, Squad } from "@/types/playerTypes";
import { emptyDevelopmentProgress, emptySeasonLog } from "@/types/playerTypes";
import { computeStandings } from "@/Domain/season/computeStandings";
import { generateCalendar } from "@/Domain/season/generateCalendar";
import { generateLeagueCalendar } from "@/Domain/season/generateCalendar";
import { generateRestDays } from "@/Domain/season/generateRestDays";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";

export interface SeasonTransitionInput {
  endingSeason: SeasonData;
  leagueSlug: string;
  leagueTeams: LeagueTeam[];
  squadsInLeague: Squad[];
  playerClubSquadId: string;
  /** If provided, next season uses this config for schedule; otherwise falls back to Aug-May European default */
  leagueConfig?: LeagueScheduleConfig;
}

export interface SquadSaveRef {
  leagueSlug: string;
  clubSlug:   string;
  squad:      Squad;
}

export interface SeasonTransitionResult {
  archive: SeasonArchive;
  newSeason: SeasonData;  // kept for backward compat
  newLeagueCalendar: LeagueCalendarResult;  // use this for writing round files
  /** Squads to write after transition (same league as input). */
  squadsToSave: SquadSaveRef[];
  /** Credit to squad budget for the human club (annual broadcasting). */
  playerBroadcastingCredit: number;
}

function clubFileSlug(s: Squad): string {
  return s.slug ?? s.id;
}

function snapshotPlayerLogs(squads: Squad[]): Record<string, PlayerSeasonLog> {
  const out: Record<string, PlayerSeasonLog> = {};
  for (const squad of squads) {
    for (const p of squad.players) {
      const log = p.seasonLog ?? emptySeasonLog();
      out[p.id] = { ...log };
    }
  }
  return out;
}

function buildLeagueTitle(
  leagueSlug: string,
  champion: LeagueTeam | undefined,
  championSquad: Squad | undefined,
): SeasonTitle[] {
  if (!champion) return [];
  const coach = championSquad?.coach;
  return [
    {
      competition: leagueSlug,
      clubId: champion.squadId,
      clubName: champion.name,
      coachId: coach?.id ?? null,
      coachName: coach?.name ?? "",
    },
  ];
}

function resetSquadForNewSeason(squad: Squad, isPlayerClub: boolean): { squad: Squad; playerBroadcasting: number } {
  const broadcasting = squad.finances?.broadcasting ?? 0;
  const players = squad.players.map((p) => ({
    ...p,
    age: p.age + 1,
    seasonLog: emptySeasonLog(),
    progress: emptyDevelopmentProgress(),
  }));

  if (isPlayerClub) {
    return {
      squad: { ...squad, players },
      playerBroadcasting: broadcasting,
    };
  }

  const baseFin = squad.finances ?? {
    broadcasting: 0,
    commercial: 0,
    total: 0,
    budget: 0,
    followers: 0,
  };
  const finances = {
    ...baseFin,
    budget: baseFin.budget + broadcasting,
  };

  return {
    squad: { ...squad, players, finances },
    playerBroadcasting: 0,
  };
}

/**
 * Pure season rollover: archive ending season, compute champion, reset rosters, build next calendar.
 */
export function runSeasonTransition(input: SeasonTransitionInput): SeasonTransitionResult {
  const { endingSeason, leagueSlug, leagueTeams, squadsInLeague, playerClubSquadId, leagueConfig } = input;

  const standings = computeStandings(leagueTeams, endingSeason.calendar, leagueSlug);
  const championRow = standings[0];
  const championSquad = squadsInLeague.find((s) => s.id === championRow?.squadId);

  const archive: SeasonArchive = {
    leagueSlug,
    year: endingSeason.year,
    start: endingSeason.start,
    end: endingSeason.end,
    // Don't embed full calendar in archive (too large); standings+playerLogs are the record
    standings,
    titles: buildLeagueTitle(leagueSlug, championRow, championSquad),
    playerLogs: snapshotPlayerLogs(squadsInLeague),
  };

  const nextYear = endingSeason.year + 1;
  const teamIds = leagueTeams.map((t) => t.squadId);

  // Generate next season with round-based calendar
  let newLeagueCalendar: LeagueCalendarResult;
  if (leagueConfig) {
    newLeagueCalendar = generateLeagueCalendar(leagueConfig, teamIds, nextYear);
  } else {
    // Fallback: use a synthetic config with European defaults for leagues not in LEAGUE_SCHEDULE_CONFIGS
    const fallbackConfig: LeagueScheduleConfig = {
      slug: leagueSlug,
      seasonStartMMDD: "08-15",
      seasonEndMMDD: "05-20",
      crossYear: true,
      matchDays: [6, 0],
      baseWeekOffset: 0,
    };
    newLeagueCalendar = generateLeagueCalendar(fallbackConfig, teamIds, nextYear);
  }

  // Build SeasonData from new calendar (for backward compat)
  const allNewFixtures = newLeagueCalendar.rounds.flatMap((r) => r.fixtures);
  const newSeason: SeasonData = {
    year: newLeagueCalendar.meta.year,
    start: newLeagueCalendar.meta.start,
    end: newLeagueCalendar.meta.end,
    calendar: allNewFixtures,
    restDays: newLeagueCalendar.meta.restDays,
  };

  let playerBroadcastingCredit = 0;
  const squadsToSave: SquadSaveRef[] = [];

  for (const s of squadsInLeague) {
    const isPlayer = s.id === playerClubSquadId;
    const { squad: updated, playerBroadcasting } = resetSquadForNewSeason(s, isPlayer);
    playerBroadcastingCredit += playerBroadcasting;
    squadsToSave.push({
      leagueSlug,
      clubSlug: clubFileSlug(s),
      squad: updated,
    });
  }

  return {
    archive,
    newSeason,
    newLeagueCalendar,
    squadsToSave,
    playerBroadcastingCredit,
  };
}
