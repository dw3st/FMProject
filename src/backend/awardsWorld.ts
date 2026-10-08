/**
 * Season awards I/O (`.claude/rules/game/awards.md`): goal-of-the-season candidates of the day,
 * the league awards at a rollover and the world ceremony in January. Pure logic lives in
 * `src/Domain/awards/`; everything here goes through the day's `SaveService` (buffered), and every
 * write is idempotent on a retried day.
 */
import type { SaveService } from "@/backend/SaveService";
import { addManagerAward, applyAwardBoost, awardKindsByPlayer, clearAwardBoost, withAwardsOnRows } from "@/Domain/awards/awardEffects";
import { buildAwardsMessage } from "@/Domain/awards/awardMessages";
import { appendGoals, goalCandidatesOfMatch, pickGoalOfSeason } from "@/Domain/awards/goalOfSeason";
import { computeLeagueAwards } from "@/Domain/awards/leagueAwards";
import { computeWorldAwards } from "@/Domain/awards/worldAwards";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { addDays, daysBetween } from "@/Domain/dates";
import { afterAward } from "@/Domain/morale/morale";
import type { LeagueSeasonAwards } from "@/types/awardTypes";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { AwardsInboxMessage } from "@/types/inboxTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { RosterPlayer, Squad, StandingRow } from "@/types/playerTypes";

type ManagersFn = (ms: ManagerRecord[]) => ManagerRecord[];

/**
 * Appends the day's goal-of-the-season candidates (headers and shots from outside the box of
 * full-engine league matches) to `seasonGoals/{league}-{year}.json`. Quick-sim matches carry no
 * `goals` and add nothing; cups and continental competitions never count.
 */
export async function recordSeasonGoals(
  service: SaveService,
  saveId: string,
  date: string,
  events: MatchEvent[],
  states: LeagueSeasonState[],
): Promise<void> {
  const byLeague = new Map<string, MatchEvent[]>();
  for (const e of events) {
    if (!e.goals?.length || isCupSlug(e.competition) || isContinentalSlug(e.competition)) continue;
    if (!states.some((s) => s.leagueSlug === e.competition)) continue;
    byLeague.set(e.competition, [...(byLeague.get(e.competition) ?? []), e]);
  }
  for (const [league, evs] of byLeague) {
    const add = evs.flatMap((e) => goalCandidatesOfMatch(e, date));
    if (add.length === 0) continue;
    const year = states.find((s) => s.leagueSlug === league)!.year;
    const cur = (await service.getSeasonGoals(saveId, league, year))?.goals ?? [];
    const next = appendGoals(cur, add);
    if (next.length !== cur.length) await service.writeSeasonGoals(saveId, { league, year, goals: next });
  }
}

/**
 * League awards at the league's rollover (passo 3, after `closeSeasonForPlayers`): clears the old
 * value boosts of the league's squads, computes the awards, writes them on the closing history rows
 * (+ boost, + morale on the human club), upserts the league entry of `awards/{year of closedOn}.json`
 * and drops older goal files of the league. Idempotent on a retried day (same entry, same rows).
 */
export async function recordLeagueAwards(service: SaveService, saveId: string, args: {
  league: string;
  season: string;
  closedOn: string;
  country: string | null;
  tier: number;
  weight: number;
  state: LeagueSeasonState;
  /** The league's squads, already with the closing rows. */
  squads: Squad[];
  table: StandingRow[];
  /** Managers in charge during the season (before the rollover sackings). */
  managers: ManagerRecord[];
  targets: Map<string, number>;
  tierChanges: Record<string, { from: number; to: number }>;
  playerClubId: string | null;
  leagueName: string;
}): Promise<{ squads: Squad[]; awards: LeagueSeasonAwards; managers: ManagersFn; message?: AwardsInboxMessage }> {
  const { league, season, state } = args;
  const cleared = args.squads.map((s) => (s.players.some((p) => p.awardBoost) ? { ...s, players: s.players.map(clearAwardBoost) } : s));
  const goals = (await service.getSeasonGoals(saveId, league, state.year))?.goals ?? [];
  const picked = pickGoalOfSeason(goals, `${saveId}:${league}:${season}`);
  const opponentName = picked ? args.squads.find((s) => s.id === picked.opponentId)?.name : undefined;
  const goalOfSeason = picked && opponentName ? { ...picked, opponentName } : picked;
  const seasonMid = addDays(state.start, Math.floor(daysBetween(state.start, state.end) / 2));
  const awards = computeLeagueAwards({
    league, season, closedOn: args.closedOn, country: args.country, tier: args.tier, weight: args.weight,
    totalRounds: state.totalRounds, squads: cleared, table: args.table, managers: args.managers,
    targets: args.targets, tierChanges: args.tierChanges, seasonMid,
    ...(goalOfSeason ? { goalOfSeason } : {}),
  });

  const kinds = awardKindsByPlayer(awards);
  const squads = cleared.map((s) => {
    if (!s.players.some((p) => kinds.has(p.id))) return s;
    let next: Squad = {
      ...s,
      players: s.players.map((p) => {
        const k = kinds.get(p.id);
        if (!k) return p;
        return applyAwardBoost(withAwardsOnRows(p, league, season, k.map((kind) => ({ kind, league }))), k, league, season);
      }),
    };
    if (s.id === args.playerClubId) {
      for (const p of s.players) if (kinds.has(p.id)) next = afterAward(next, p.id, kinds.get(p.id)!, `league:${league}:${season}`);
    }
    return next;
  });

  // The league entry of the year file (replaced on a retried day) + older goal files of the league.
  const year = Number(args.closedOn.slice(0, 4));
  const file = (await service.getAwardsYear(saveId, year)) ?? { year, leagues: [] };
  await service.writeAwardsYear(saveId, {
    ...file,
    leagues: [...file.leagues.filter((l) => !(l.league === league && l.season === season)), awards],
  });
  for (const f of await service.listSeasonGoalFiles(saveId)) {
    if (f.league === league && f.year < state.year) await service.deleteSeasonGoals(saveId, league, f.year);
  }

  const bm = awards.bestManager;
  const managers: ManagersFn = bm
    ? (ms) => addManagerAward(ms, bm.managerId, { season, kind: "best_manager", competition: league, squadId: bm.squadId })
    : (ms) => ms;
  const mine = args.playerClubId && args.squads.some((s) => s.id === args.playerClubId) ? args.playerClubId : null;
  return {
    squads, awards, managers,
    ...(mine ? { message: buildAwardsMessage({ kind: "league", date: args.closedOn, awards, leagueName: args.leagueName, myClubId: mine }) } : {}),
  };
}

/**
 * World player and manager of the year (`awards.md` §5): on a January day, over the league seasons
 * closed in the previous year, once (the `world` entry of the year file is the marker). The winner
 * gets `world_player` on the history row of the season that put him on the shortlist (looked up by
 * the shortlist club, then every squad, the free agents and the retired), the value boost and, on
 * the human club, morale; the manager gets `world_manager`.
 */
export async function runWorldCeremony(service: SaveService, saveId: string, date: string, args: {
  managers: () => Promise<ManagerRecord[]>;
  applyManagers: (fn: ManagersFn) => Promise<void>;
  playerClubId: string | null;
}): Promise<AwardsInboxMessage | null> {
  if (date.slice(5, 7) !== "01") return null;
  const year = Number(date.slice(0, 4)) - 1;
  const file = await service.getAwardsYear(saveId, year);
  if (!file || file.leagues.length === 0 || file.world) return null;
  const world = computeWorldAwards({ year, on: date, leagues: file.leagues, managers: await args.managers() });
  await service.writeAwardsYear(saveId, { ...file, world });

  const wp = world.player[0];
  if (wp) {
    const entry = file.leagues.find((l) => l.league === wp.league && l.shortlist.players.some((p) => p.playerId === wp.id));
    const season = entry?.season ?? String(year);
    const award = [{ kind: "world_player" as const, year }];
    const update = (p: RosterPlayer, currentLeague: string | null): RosterPlayer => {
      const withRow = withAwardsOnRows(p, wp.league, season, award);
      return currentLeague ? applyAwardBoost(withRow, ["world_player"], currentLeague, season) : withRow;
    };
    let squad = await service.getSquadById(saveId, wp.squadId);
    if (!squad?.players.some((p) => p.id === wp.id)) {
      squad = (await service.getAllSquads(saveId)).find((s) => s.players.some((p) => p.id === wp.id)) ?? null;
    }
    if (squad) {
      const sq = squad;
      let next: Squad = { ...sq, players: sq.players.map((p) => (p.id === wp.id ? update(p, sq.leagueSlug ?? wp.league) : p)) };
      if (sq.id === args.playerClubId) next = afterAward(next, wp.id, ["world_player"], `world:${year}`);
      await service.saveSquadById(saveId, next);
    } else {
      const free = await service.getFreeAgents(saveId);
      if (free.some((f) => f.player.id === wp.id)) {
        await service.writeFreeAgents(saveId, free.map((f) => (f.player.id === wp.id ? { ...f, player: update(f.player, null) } : f)));
      } else {
        const retired = await service.getRetired(saveId);
        const r = retired.find((x) => x.id === wp.id);
        if (r) {
          const rows = withAwardsOnRows({ history: r.history } as RosterPlayer, wp.league, season, award).history;
          await service.writeRetired(saveId, retired.map((x) => (x.id === wp.id ? { ...x, history: rows } : x)));
        }
      }
    }
  }
  const wm = world.manager[0];
  if (wm) {
    await args.applyManagers((ms) => addManagerAward(ms, wm.id, {
      season: String(year), kind: "world_manager", competition: "world", squadId: wm.squadId, year,
    }));
  }
  return buildAwardsMessage({ kind: "world", date, world });
}
