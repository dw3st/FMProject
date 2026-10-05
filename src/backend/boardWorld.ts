import type { SaveService } from "@/backend/SaveService";
import { clubLevel } from "@/backend/continentalWorld";
import { financialTierOf, naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { applyMatchResult, expectedRank, isDerby, matchExpectation, objectiveFor, type ObjectiveClub } from "@/Domain/boardFans/boardFans";
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import type { BoardState, SeasonObjective } from "@/types/boardTypes";
import type { Fixture, LeagueSeasonState } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { LeagueZone, Squad, StandingRow } from "@/types/playerTypes";
import { logError } from "@/Logger";

/**
 * I/O glue for the human club's board and fans (`.claude/rules/game/board-fans.md`). The model
 * itself is pure (`src/Domain/boardFans`); this file only gathers its inputs from the save.
 */

/** League strength of every club of the league (`clubLevel`) plus its financial tier. */
/** `clubLevel`, or null when the XI cannot be built (logged). */
function safeLevel(squad: Squad | null): number | null {
  if (!squad) return null;
  try {
    return clubLevel(squad);
  } catch (e) {
    logError("board", `clubLevel failed for ${squad.id}`, e);
    return null;
  }
}

function objectiveClubs(squads: Squad[], playerSquadId: string): ObjectiveClub[] {
  return squads.map((s) => {
    let level = 0;
    try {
      level = clubLevel(s);
    } catch (e) {
      logError("board", `clubLevel failed for ${s.id}`, e);
    }
    const tier = s.id === playerSquadId ? naturalFinancialTier(s.finances) : financialTierOf(s);
    return { squadId: s.id, level, tier };
  });
}

/** The season objective of the human club from the squads of its league. */
export function objectiveFromSquads(args: {
  squads: Squad[];
  playerSquadId: string;
  leagueSlug: string;
  zones: LeagueZone[];
  season: string;
  /** Current table position (mid-season takeover); absent = by squad strength. */
  rank?: number;
}): SeasonObjective | null {
  if (!args.squads.some((s) => s.id === args.playerSquadId)) return null;
  return objectiveFor({
    squadId: args.playerSquadId,
    clubs: objectiveClubs(args.squads, args.playerSquadId),
    zones: args.zones,
    leagueSlug: args.leagueSlug,
    season: args.season,
    ...(args.rank !== undefined ? { rank: args.rank } : {}),
  });
}

/** Expected league position of a club from the squads of its league (strength + tier). */
export function expectedPositionFromSquads(squads: Squad[], squadId: string): number {
  return expectedRank(squadId, objectiveClubs(squads, squadId));
}

/**
 * Every official match the human club played today (league, cup, continental) moves the meters:
 * the result, home/derby weights, the form, and — league only — the table position vs. the objective.
 */
export async function boardAfterMatches(args: {
  board: BoardState;
  service: SaveService;
  saveId: string;
  playerSquadId: string;
  playerLeagueSlug: string;
  playerLeagueState: LeagueSeasonState | undefined;
  events: MatchEvent[];
  fixtureOf: (competition: string, round: number, fixtureId: string) => Fixture | undefined;
  squadOf: (squadId: string) => Promise<Squad | null>;
}): Promise<BoardState> {
  let board = args.board;
  const mine = args.events.filter((e) => e.home === args.playerSquadId || e.away === args.playerSquadId);
  if (mine.length === 0) return board;

  let standings: StandingRow[] | null = null;
  const me = await args.squadOf(args.playerSquadId);
  const myLevel = safeLevel(me);
  for (const e of mine) {
    const home = e.home === args.playerSquadId;
    const opponentId = home ? e.away : e.home;
    let goalsFor = home ? e.score.home : e.score.away;
    let goalsAgainst = home ? e.score.away : e.score.home;
    // A knockout level after extra time was decided on penalties: the winner takes it as a win.
    if (goalsFor === goalsAgainst) {
      const f = args.fixtureOf(e.competition, e.round, e.fixtureId);
      const winner = f?.knockout ? fixtureWinner(f) : null;
      if (winner) {
        if (winner === args.playerSquadId) goalsFor += 1;
        else goalsAgainst += 1;
      }
    }
    const isLeague = e.competition === args.playerLeagueSlug;
    if (isLeague && standings === null) {
      standings = (await args.service.getLeagueStandings(args.saveId, args.playerLeagueSlug)) ?? [];
    }
    const table = isLeague ? (standings ?? []) : [];
    const leader = table[0];
    const opponent = await args.squadOf(opponentId);
    const derby = isDerby({
      myCity: me?.venue?.city ?? "",
      opponentCity: opponent?.venue?.city ?? "",
      opponentIsLeader: isLeague && !!leader && leader.mp > 0 && leader.squadId === opponentId,
    });
    const myRow = table.findIndex((r) => r.squadId === args.playerSquadId);
    const league = isLeague && myRow >= 0
      ? {
          position: myRow + 1,
          size: table.length,
          played: table[myRow]!.mp,
          total: Math.max(table[myRow]!.mp, args.playerLeagueState?.totalRounds ?? (table.length - 1) * 2),
        }
      : undefined;
    // Expectation from both clubs' strength: beating weaker sides is worth little, losing to them costs more.
    const oppLevel = safeLevel(opponent);
    const expectation = myLevel !== null && oppLevel !== null ? matchExpectation(myLevel, oppLevel, home) : 0;
    board = applyMatchResult(board, { goalsFor, goalsAgainst, home, derby, expectation, ...(league ? { league } : {}) });
  }
  return board;
}
