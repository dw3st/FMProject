import type { SaveService } from "@/backend/SaveService";
import { isDerby } from "@/Domain/boardFans/boardFans";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { matchImportanceMult, type ImportanceCompetition } from "@/Domain/facilities/matchImportance";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad, StandingRow } from "@/types/playerTypes";

export interface MatchImportanceCtx {
  /** The human club's league (a fixture of this competition can be against the league leader). */
  leagueSlug: string;
  /** League table to use for the leader; absent = read once from the save; null = no table. */
  standings?: StandingRow[] | null;
  /** Squad reader (cache); absent = `service.getSquadById`. */
  squadOf?: (id: string) => Promise<Squad | null>;
}

export function importanceCompetition(slug: string): ImportanceCompetition {
  return isContinentalSlug(slug) ? "continental" : isCupSlug(slug) ? "cup" : "league";
}

/**
 * Big-match multiplier of a home game of the human club (spec 2026-10-08-match-visual §6): derby =
 * same city (accents and case ignored) or, in a league game, the league leader (with games played),
 * as the board sees it (`boardWorld.ts`); cup and continental knockouts by `fixture.knockout`.
 */
export async function homeMatchImportance(
  service: SaveService,
  saveId: string,
  fixture: Fixture,
  clubId: string,
  ctx: MatchImportanceCtx,
): Promise<{ derby: boolean; mult: number }> {
  const squadOf = ctx.squadOf ?? ((id: string) => service.getSquadById(saveId, id));
  const opponentId = fixture.home === clubId ? fixture.away : fixture.home;
  const [me, opponent] = await Promise.all([squadOf(clubId), squadOf(opponentId)]);
  const isLeague = fixture.competition === ctx.leagueSlug;
  let table: StandingRow[] = [];
  if (isLeague) {
    table = ctx.standings === undefined
      ? (await service.getLeagueStandings(saveId, ctx.leagueSlug)) ?? []
      : ctx.standings ?? [];
  }
  const leader = table[0];
  const derby = isDerby({
    myCity: me?.venue?.city ?? "",
    opponentCity: opponent?.venue?.city ?? "",
    opponentIsLeader: isLeague && !!leader && leader.mp > 0 && leader.squadId === opponentId && opponentId !== clubId,
  });
  const mult = matchImportanceMult({
    derby,
    competition: importanceCompetition(fixture.competition),
    knockout: fixture.knockout === true,
  });
  return { derby, mult };
}
