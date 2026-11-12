import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { getLeagueData } from "@/backend/advanceDay";
import { objectiveFromSquads } from "@/backend/boardWorld";
import { securityLevel } from "@/Domain/jobs/application";
import { clubKeepsManager, recentClubTitle } from "@/Domain/jobs/jobs";
import { formPpg } from "@/Domain/managers/aiManagers";
import { seasonLabel } from "@/Domain/history/history";
import { daysBetween } from "@/Domain/dates";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Whether an AI club is happy with its manager and so makes no job offer (10.6.4, tester report: the champions and
 * leaders of the Premier League offered their job). Same reading as the Jobs tab (`jobPosts`): the security level from
 * the table, the board's target and the form; a title won with him in the last year also keeps him.
 * A club with an interim or an open vacancy is never happy.
 */
export async function clubHappyWithManager(
  service: SaveService, saveId: string,
  args: {
    squadId: string; date: string; index: SquadIndex; activeLeagues: readonly LeagueSeasonState[];
    managers: readonly ManagerRecord[]; vacant?: ReadonlySet<string>;
  },
): Promise<boolean> {
  const { squadId, date } = args;
  const m = args.managers.find((x) => x.squadId === squadId && !x.seatId && !x.retired);
  if (!m || m.interim || args.vacant?.has(squadId)) return false;
  const title = recentClubTitle(m, squadId, date);
  const league = args.index.byId(squadId)?.leagueSlug;
  if (!league) return clubKeepsManager({ level: null, recentTitle: title });
  const teams = args.index.inLeague(league);
  const state = args.activeLeagues.find((l) => l.leagueSlug === league);
  const table = (await service.getLeagueStandings(saveId, league)) ?? [];
  const i = table.findIndex((r) => r.squadId === squadId);
  const row = i >= 0 ? table[i]! : null;
  const played = table.length > 0 ? Math.max(...table.map((r) => r.mp)) : 0;
  const progress = state && state.totalRounds > 0 ? played / state.totalRounds : 0;
  const season = state ? seasonLabel(state.year, state.start, state.end) : "";
  let target = m.target?.season === season ? m.target.target : null;
  if (target === null) {
    const squads = (await Promise.all(teams.map((t) => service.getSquadById(saveId, t.squadId)))).filter((s): s is Squad => !!s);
    const zones = (await getLeagueData()).find((l) => l.slug === league)?.zones ?? [];
    target = objectiveFromSquads({ squads, playerSquadId: squadId, leagueSlug: league, zones, season })?.target ?? Math.ceil(teams.length / 2);
  }
  const level = securityLevel({
    ...(row && row.mp > 0 ? { position: i + 1 } : {}),
    target, size: teams.length, form: formPpg(row?.form), progress,
    ...(m.hiredOn ? { daysInCharge: daysBetween(m.hiredOn, date) } : {}),
  });
  return clubKeepsManager({ level, recentTitle: title });
}
