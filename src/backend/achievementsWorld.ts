import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { applyAchievementDay } from "@/Domain/achievements/day";
import { matchFacts, type MatchFacts } from "@/Domain/achievements/matchFacts";
import type { AchievementSnapshot, ClubArrival, RolloverFacts } from "@/Domain/achievements/progress";
import { normCity } from "@/Domain/boardFans/boardFans";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { rankManagers } from "@/Domain/managers/managers";
import { buildAchievementMessage } from "@/Domain/inbox/achievementMessage";
import type { AchievementKey, AchievementsState } from "@/types/achievementTypes";
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
  /** Today's game of the national team he coaches (Etapa 41b), with the nations of both sides. */
  nationalMatch?: { event: MatchEvent; teamId: string; homeland: string | null; nationOf: (teamId: string) => string };
  /** Sacked today (not a contract that ran out). */
  sacked: boolean;
  /** The manager left the club today (sacked or out of contract): the club is an AI club now. */
  leftClub: boolean;
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

/** What the game keeps that the tracks read (titles, ranking, money, stadium, facilities). */
export function achievementSnapshot(state: AchievementsState, club: Squad | null, managers: ManagerRecord[], seatId: string): AchievementSnapshot {
  const player = managers.find((m) => m.seatId === seatId) ?? null;
  const ranked = rankManagers(managers.filter((m) => !m.retired));
  const pos = ranked.findIndex((m) => m.seatId === seatId);
  return {
    manager: player,
    rank: pos >= 0 && (player?.points ?? 0) > 0 ? pos + 1 : null,
    ...builtSince(state, club),
  };
}

/** What the club has today (the baseline when the manager is first seen there). */
export function clubArrival(club: Squad | null): ClubArrival {
  return {
    capacity: club?.venue?.capacity ?? 0,
    balance: club?.finances?.budget ?? 0,
    facilityLevels: Object.fromEntries(Object.entries(club?.facilities?.items ?? {}).map(([id, it]) => [id, (it as { level: number }).level])),
  };
}

/**
 * What the manager built at his club: balance, seats and facility levels above the club's on his first day
 * (nothing on that day; a club never seen counts from today). The finance tracks never unlock on a rich club's
 * starting state.
 */
function builtSince(state: AchievementsState, club: Squad | null): Pick<AchievementSnapshot, "balanceGain" | "extraSeats" | "facilityLevels"> {
  if (!club) return { balanceGain: 0, extraSeats: 0, facilityLevels: 0 };
  const now = clubArrival(club);
  const base = state.clubs[club.id];
  if (!base) return { balanceGain: 0, extraSeats: 0, facilityLevels: 0 };
  let levels = 0;
  for (const [id, level] of Object.entries(now.facilityLevels) as [string, number][]) levels += Math.max(0, level - (base.baseFacilityLevels?.[id] ?? level));
  return {
    balanceGain: now.balance - (base.baseBalance ?? now.balance),
    extraSeats: now.capacity - base.baseCapacity,
    facilityLevels: levels,
  };
}

export async function achievementsDay(service: SaveService, saveId: string, seatId: string, args: AchievementsDayArgs): Promise<InboxMessage | null> {
  const state = await service.getAchievements(saveId, seatId);
  if (state.lastDay && state.lastDay >= args.date) return null;
  const clubId = args.clubId || null;
  const club = clubId ? await args.squadOf(clubId) : null;
  const player = args.managers.find((m) => m.seatId === seatId) ?? null;

  // Today's official matches of the club.
  const matches: MatchFacts[] = [];
  const continentalStages: { key: string; stage: "sf" | "final" }[] = [];
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
      if (kind === "continental") {
        // Campaign points for a continental semi-final / final reached (shop, `achievementsConfig.CAMPAIGN`).
        const meta = await service.getLeagueMeta(saveId, ev.competition);
        const stage = meta?.continental?.stages.find((st) => st.rounds.includes(ev.round))?.name;
        if (stage === "sf" || stage === "final") {
          continentalStages.push({ key: `continental:${ev.competition}:${meta!.year}:${stage}:${club.id}`, stage });
        }
      }
    }
  }

  const transfers: DayTransfer[] = (await service.getDayLog(saveId, args.date))?.transfers ?? [];

  const snapshot = achievementSnapshot(state, club, args.managers, seatId);

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
    arrival: clubArrival(club),
    matches,
    transfers,
    snapshot,
    awards,
    continentalStages,
    ...(rollover ? { rollover } : {}),
    ...(args.sacked ? { sacked: { hiredOn } } : {}),
    ...(args.nationalMatch ? { national: [nationalGameOf(args.nationalMatch)] } : {}),
  });
  await service.writeAchievements(saveId, result.state, seatId);
  // The copy of the attributes on his club (DP, familiarity, fouls read it there).
  if (club && !args.leftClub && JSON.stringify(club.managerAttributes) !== JSON.stringify(result.state.attributes)) {
    await service.saveSquadById(saveId, { ...club, managerAttributes: result.state.attributes });
  }
  return result.unlocked.length > 0 ? buildAchievementMessage(args.date, result.unlocked as AchievementKey[]) : null;
}

/** His national game: won (shootout included), and whether the opponent is the team of his own nationality. */
function nationalGameOf(n: NonNullable<AchievementsDayArgs["nationalMatch"]>): { won: boolean; homeland: boolean } {
  const ev = n.event;
  const mine = ev.home === n.teamId ? "home" : "away";
  const opp = mine === "home" ? ev.away : ev.home;
  const pens = ev.decider?.penalties;
  const gf = ev.score[mine];
  const ga = ev.score[mine === "home" ? "away" : "home"];
  const won = gf > ga || (gf === ga && !!pens && pens[mine] > pens[mine === "home" ? "away" : "home"]);
  return { won, homeland: !!n.homeland && n.nationOf(opp) === n.homeland && n.nationOf(n.teamId) !== n.homeland };
}
