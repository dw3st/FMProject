import type { SeasonArchive, SeasonData, SeasonTitle, LeagueCalendarResult } from "@/types/calendarTypes";
import type { LeagueTeam, PlayerSeasonLog, Squad } from "@/types/playerTypes";
import { emptyDevelopmentProgress, emptySeasonLog } from "@/types/playerTypes";
import { computeStandings } from "@/Domain/season/computeStandings";
import { generateLeagueCalendar } from "@/Domain/season/generateCalendar";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";

export interface SeasonTransitionInput {
  endingSeason: SeasonData;
  leagueSlug: string;
  /** The league's clubs during the ENDING season (old membership): archive standings use them. */
  leagueTeams: LeagueTeam[];
  squadsInLeague: Squad[];
  playerClubSquadId: string;
}

/**
 * A reset squad to persist. Addressed by id only: the caller writes it wherever the club currently
 * lives (`SaveService.saveSquadById`), so a club moved by promotion/relegation is never written back
 * into its old league.
 */
export interface SquadSaveRef {
  squadId: string;
  squad:   Squad;
}

export interface SeasonTransitionResult {
  archive: SeasonArchive;
  /** Squads to write after transition, by id (see SquadSaveRef). */
  squadsToSave: SquadSaveRef[];
  /** Credit to squad budget for the human club (annual broadcasting). */
  playerBroadcastingCredit: number;
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
 * Pure close of a league season: archive the ending season (standings, champion, player logs) and
 * reset the rosters (age + 1, seasonLog/progress cleared, AI broadcasting into budget), all on the
 * ENDING season's membership. The next calendar is built separately (`buildNextSeasonCalendar`)
 * because promotion/relegation changes the team list between the two steps.
 */
export function runSeasonTransition(input: SeasonTransitionInput): SeasonTransitionResult {
  const { endingSeason, leagueSlug, leagueTeams, squadsInLeague, playerClubSquadId } = input;

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

  let playerBroadcastingCredit = 0;
  const squadsToSave: SquadSaveRef[] = [];

  for (const s of squadsInLeague) {
    const isPlayer = s.id === playerClubSquadId;
    const { squad: updated, playerBroadcasting } = resetSquadForNewSeason(s, isPlayer);
    playerBroadcastingCredit += playerBroadcasting;
    squadsToSave.push({ squadId: s.id, squad: updated });
  }

  return { archive, squadsToSave, playerBroadcastingCredit };
}

/**
 * Pure: the round-based calendar of `year` for the given clubs (the NEW membership after
 * promotion/relegation). Leagues without a schedule config use a European Aug–May default.
 */
export function buildNextSeasonCalendar(args: {
  leagueSlug: string;
  teamIds: string[];
  year: number;
  leagueConfig?: LeagueScheduleConfig;
}): LeagueCalendarResult {
  const { leagueSlug, teamIds, year, leagueConfig } = args;
  const config: LeagueScheduleConfig = leagueConfig ?? {
    slug: leagueSlug,
    seasonStartMMDD: "08-15",
    seasonEndMMDD: "05-20",
    crossYear: true,
    matchDays: [6, 0],
    baseWeekOffset: 0,
  };
  return generateLeagueCalendar(config, teamIds, year);
}

/**
 * Credit the human club's annual broadcasting to its budget on the RESET squad the
 * transition produced (`squadsToSave`), so the new-season write carries both the
 * reset roster and the credit. Pure: returns new refs, never mutates the input.
 */
export function applyPlayerBroadcastingCredit(
  squadsToSave: SquadSaveRef[],
  playerSquadId: string,
  credit: number,
): SquadSaveRef[] {
  if (credit <= 0) return squadsToSave;
  return squadsToSave.map((ref) => {
    if (ref.squad.id !== playerSquadId) return ref;
    const fin = ref.squad.finances ?? { broadcasting: 0, commercial: 0, total: 0, budget: 0, followers: 0 };
    return { ...ref, squad: { ...ref.squad, finances: { ...fin, budget: (fin.budget ?? 0) + credit } } };
  });
}
