import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { ACHIEVEMENTS } from "@/Domain/achievements/achievementsConfig";
import { applyAchievementDay } from "@/Domain/achievements/day";
import { matchFacts, type MatchFacts } from "@/Domain/achievements/matchFacts";
import type { AchievementSnapshot, RolloverFacts } from "@/Domain/achievements/progress";
import { normCity } from "@/Domain/boardFans/boardFans";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { rankManagers } from "@/Domain/managers/managers";
import { buildAchievementMessage } from "@/Domain/inbox/achievementMessage";
import type { AchievementKey } from "@/types/achievementTypes";
import type { ClubMove } from "@/types/pyramidTypes";
import type { DayTransfer, MatchEvent } from "@/types/dayLogTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * I/O of the achievements (`.claude/rules/game/achievements.md`): gathers the day's facts of the human
 * manager from what the save already keeps and runs the pure day step once. Called at the end of
 * `advanceOneDay`, inside the day's buffered unit.
 */
export interface AchievementsDayArgs {
  date: string;
  /** The human club at the start of the day ("" / undefined: unemployed). */
  clubId: string | undefined;
  events: MatchEvent[];
  managers: ManagerRecord[];
  index: SquadIndex;
  squadOf: (id: string) => Promise<Squad | null>;
  /** The human club's country rolled today. */
  rollover?: {
    championOf: string | null;
    moves: ClubMove[];
    objectiveMet: boolean;
  };
  /** Sacked (or the contract ended) today. */
  sacked: boolean;
}

function officialCompetition(slug: string, index: SquadIndex): "league" | "cup" | "continental" | null {
  if (isCupSlug(slug)) return "cup";
  if (isContinentalSlug(slug)) return "continental";
  return index.leagues().includes(slug) ? "league" : null;
}

/** The club had the lowest wage bill of `league` before today's moves. */
async function cheapestOfLeague(args: AchievementsDayArgs, clubId: string, league: string): Promise<boolean> {
  const ids = new Set(args.index.inLeague(league).map((e) => e.squadId));
  for (const m of args.rollover?.moves ?? []) {
    if (m.to === league) ids.delete(m.squadId);
    if (m.from === league) ids.add(m.squadId);
  }
  const bills: { id: string; bill: number }[] = [];
  for (const id of ids) {
    const sq = await args.squadOf(id);
    if (sq) bills.push({ id, bill: squadWeeklyWages(sq.players, wageFactorOf(sq)) });
  }
  if (bills.length < 2) return false;
  const mine = bills.find((b) => b.id === clubId);
  return !!mine && bills.every((b) => b.id === clubId || b.bill > mine.bill);
}

export async function achievementsDay(service: SaveService, saveId: string, args: AchievementsDayArgs): Promise<InboxMessage | null> {
  const state = await service.getAchievements(saveId);
  if (state.lastDay && state.lastDay >= args.date) return null;
  const clubId = args.clubId || null;
  const club = clubId ? await args.squadOf(clubId) : null;
  const player = args.managers.find((m) => m.isPlayer) ?? null;

  // Today's official matches of the club.
  const matches: MatchFacts[] = [];
  if (club) {
    const keeper = new Set(club.players.filter((p) => (p.naturalPosition ?? p.positions[0]) === "GK").map((p) => p.id));
    for (const ev of args.events) {
      const side = ev.home === club.id ? "home" : ev.away === club.id ? "away" : null;
      if (!side) continue;
      const kind = officialCompetition(ev.competition, args.index);
      if (!kind) continue;
      const opp = await args.squadOf(side === "home" ? ev.away : ev.home);
      const myCity = normCity(club.venue?.city ?? "");
      const derby = !!myCity && myCity === normCity(opp?.venue?.city ?? "");
      matches.push(matchFacts(ev, side, { league: kind === "league", derby, isKeeper: (id) => keeper.has(id) }));
    }
  }

  const transfers: DayTransfer[] = (await service.getDayLog(saveId, args.date))?.transfers ?? [];

  const ranked = rankManagers(args.managers.filter((m) => !m.retired));
  const pos = ranked.findIndex((m) => m.isPlayer);
  const snapshot: AchievementSnapshot = {
    manager: player,
    rank: pos >= 0 && (player?.points ?? 0) > 0 ? pos + 1 : null,
    balance: club?.finances?.budget ?? null,
    extraSeats: club ? (club.venue?.capacity ?? 0) - (state.clubs[club.id]?.baseCapacity ?? club.venue?.capacity ?? 0) : 0,
    facilityItems: club?.facilities
      ? Object.values(club.facilities.items ?? {}).filter((it) => it.level >= ACHIEVEMENTS.FACILITY_LEVEL).length
      : 0,
  };

  // Season awards of the club's players (recorded at the club's rollover).
  const awards: { key: string; kind: "young_player" | "top_scorer" }[] = [];
  let rollover: RolloverFacts | undefined;
  if (club && args.rollover) {
    const year = await service.getAwardsYear(saveId, Number(args.date.slice(0, 4)));
    for (const l of year?.leagues ?? []) {
      if (l.youngPlayer?.squadId === club.id) awards.push({ key: `${l.league}:${l.season}:young_player`, kind: "young_player" });
      if (l.topScorer?.squadId === club.id) awards.push({ key: `${l.league}:${l.season}:top_scorer`, kind: "top_scorer" });
    }
    const history = await service.getClubHistory(saveId, club.id);
    const rows = history?.seasons ?? [];
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const champion = !!args.rollover.championOf;
    rollover = {
      squadId: club.id,
      champion,
      cheapest: champion ? await cheapestOfLeague(args, club.id, args.rollover.championOf!) : false,
      bounceBack: last?.move === "promoted" && prev?.move === "relegated",
      objectiveMet: args.rollover.objectiveMet,
    };
  }

  const hiredOn = clubId
    ? [...(player?.clubs ?? [])].reverse().find((c) => c.squadId === clubId)?.from
    : undefined;
  const result = applyAchievementDay(state, {
    date: args.date,
    squadId: club?.id ?? null,
    capacity: club?.venue?.capacity ?? 0,
    matches,
    transfers,
    snapshot,
    awards,
    ...(rollover ? { rollover } : {}),
    ...(args.sacked ? { sacked: { hiredOn } } : {}),
  });
  await service.writeAchievements(saveId, result.state);
  return result.unlocked.length > 0 ? buildAchievementMessage(args.date, result.unlocked as AchievementKey[]) : null;
}
