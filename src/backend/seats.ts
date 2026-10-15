import { logError } from "@/Logger";
import { randomUUID } from "crypto";
import { saveService as defaultService, SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import type { MemberRole, SaveManager, SeatContext, SeatState } from "@/types/seatTypes";
import type { LeagueData } from "@/types/playerTypes";
import { addSaveMember, memberBySeat, memberOf, removeSaveMember } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { releaseHumanClub, takeOverClub } from "@/backend/jobWorld";
import { leaveNationalTeam } from "@/backend/nationalWorld";
import { returnDueLoans } from "@/backend/negotiationWorld";
import { applyBroadcasting } from "@/backend/FinancialService";
import { getLeagueData } from "@/backend/advanceDay";
import { competitionName } from "@/Domain/world/labels";
import { metaForSeat } from "@/Domain/seats/seats";
import { placeSeatManager } from "@/Domain/managers/seatManagers";
import { managerReputation, sackHumanManager } from "@/Domain/jobs/jobs";
import { vacancyHireOn } from "@/Domain/managers/aiManagers";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { contractUntil, managerWeeklyWage, MANAGER_CONTRACT } from "@/Domain/managers/managerContract";
import { defaultSeasonEnd } from "@/Domain/contracts/contracts";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { buildBoardMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { generateRestDays } from "@/Domain/season/generateRestDays";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";

export type SeatErrorCode = "notFound" | "alreadyMember" | "clubTaken" | "clubNotFound" | "full" | "ownerOrLast";

/** A seat could not be added or removed; the routes turn `code` into the response. */
export class SeatError extends Error {
  constructor(readonly code: SeatErrorCode, message: string) {
    super(message);
    this.name = "SeatError";
  }
}

/**
 * A new seat in an existing world (`.claude/rules/game/multiplayer.md`): tests and scripts only in part 1 (the invite
 * screen is part 2). The club becomes human the way a job switch does (`takeOverClub`: staff, facilities, morale,
 * familiarity, tactic, board), without the arrival line; its balance starts at 0 plus the season's broadcasting, like
 * a new career. The club's AI manager goes to the free pool and the seat's manager takes the job. The user joins the
 * world as a member with this seat.
 */
export async function addSeat(
  saveId: string,
  args: {
    userId: string; clubId: string; manager: SaveManager; role?: MemberRole;
    /** The board may sack the manager (`.claude/rules/game/board-fans.md`); default true. */
    sackingEnabled?: boolean;
    /** Seats the world may have; checked inside the lock (the join route passes `WORLD.MAX_MEMBERS`). */
    maxSeats?: number;
    /** Runs first inside the lock; `false` aborts with `SeatError("notFound")` (the join route rechecks the invite code). */
    guard?: () => boolean | Promise<boolean>;
    /** Runs inside the lock after the seat exists (invite cleanup, inbox and news: they must not race the day advance). */
    onLocked?: (ctx: SeatContext) => Promise<void> | void;
  },
  service: SaveService = defaultService,
): Promise<SeatContext> {
  return withSaveLock(saveId, async () => {
    if (args.guard && !(await args.guard())) throw new SeatError("notFound", `addSeat: guard refused ${saveId}`);
    const world = await service.getMeta(saveId);
    if (!world?.currentDate) throw new SeatError("notFound", `addSeat: save ${saveId} not found or without a date`);
    if (memberOf(saveId, args.userId)) throw new SeatError("alreadyMember", `addSeat: user ${args.userId} already has a seat in ${saveId}`);
    if (args.maxSeats !== undefined && world.seats.length >= args.maxSeats) throw new SeatError("full", `addSeat: save ${saveId} is full`);
    if ((await service.humanClubIds(saveId)).has(args.clubId)) throw new SeatError("clubTaken", `addSeat: club ${args.clubId} already has a seat`);
    const index = await service.getSquadIndex(saveId);
    const entry = index.byId(args.clubId);
    if (!entry) throw new SeatError("clubNotFound", `addSeat: club ${args.clubId} is not in save ${saveId}`);

    const date = world.currentDate;
    const activeLeagues = world.activeLeagues ?? [];
    const catalog = await getLeagueData();
    const leagueName = competitionName(entry.leagueSlug, catalog as unknown as LeagueData[], "en");
    const seatId = randomUUID();
    const seat: SeatState = {
      clubId: entry.squadId,
      clubName: entry.name,
      clubColors: entry.colors,
      leagueSlug: entry.leagueSlug,
      leagueName,
      manager: args.manager,
      formation: "4-3-3",
      tactical_style: DEFAULT_TACTICAL_STYLE,
      min_energy_to_train: DEFAULT_MIN_ENERGY_TO_TRAIN,
      training_intensity: DEFAULT_TRAINING_INTENSITY,
      sackingEnabled: args.sackingEnabled !== false,
      careerStart: date,
      // The day before and after the club's own league games (its calendar, moved games included).
      restDays: generateRestDays((await service.getAllFixturesForLeague(saveId, entry.leagueSlug))
        .filter((f) => f.home === entry.squadId || f.away === entry.squadId)),
      managerEarnings: 0,
    };
    await service.insertSeat(saveId, seatId, seat);

    // The club's manager: the AI one leaves for the free pool, the seat's takes over; no vacancy.
    await service.writeManagers(saveId, placeSeatManager(await service.getManagers(saveId), {
      seatId, name: args.manager.name.trim() || entry.name, squadId: entry.squadId, date,
    }));
    if (world.managerVacancies?.[entry.squadId]) {
      const { [entry.squadId]: _gone, ...vacancies } = world.managerVacancies;
      await service.updateMeta(saveId, { managerVacancies: vacancies });
    }

    const taken = await takeOverClub(service, saveId, seatId, {
      squadId: entry.squadId, date, activeLeagues, startBalance: 0, arriveEntry: false,
    });
    const squad = await service.getSquadById(saveId, entry.squadId);
    const rep = managerReputation(await service.getManagers(saveId), 60, parseInt(date.slice(0, 4), 10), seatId);
    const seasonEnd = activeLeagues.find((l) => l.leagueSlug === entry.leagueSlug)?.end ?? defaultSeasonEnd(date);
    const finalSeat = await service.updateSeat(saveId, seatId, {
      formation: taken.formation,
      board: taken.board,
      managerContract: {
        squadId: entry.squadId,
        wage: managerWeeklyWage(squad ? wageRevenueBasisOf(squad) : 0, rep),
        until: contractUntil(seasonEnd, MANAGER_CONTRACT.INITIAL_SEASONS),
        signed: date,
      },
    });
    await applyBroadcasting(saveId, metaForSeat(world, seatId, finalSeat), entry.leagueSlug, entry.stem, seatId);
    if (taken.board.objective) {
      await emitInboxMessage(saveId, buildBoardMessage({
        date, kind: "objective", objective: taken.board.objective, leagueName,
      }), service, seatId);
    }
    addSaveMember(saveId, args.userId, seatId, args.role ?? "member");
    const ctx = { seatId, seat: finalSeat };
    await runAnnounce("addSeat", saveId, () => args.onLocked?.(ctx));
    return ctx;
  });
}

/** An announcement that fails (inbox, news, socket) must not turn a done operation into a 500: it is only logged. */
async function runAnnounce(op: string, saveId: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    logError("world", `${op}: announcement failed for ${saveId}`, e);
  }
}

/** What `removeSeat` hands back to the routes (the announcement and the socket). */
export interface RemovedSeat {
  userId: string | null;
  managerName: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
}

/**
 * A manager leaves the world (`.claude/rules/game/multiplayer.md`, part 2): his club goes back to the AI as after a
 * sacking (`releaseHumanClub`, interim + vacancy), his manager stays in the ranking as free (`left: "left_world"`),
 * a national team he coaches gets an interim, and his seat's files and `save_members` row go. One buffered unit,
 * flushed with the meta last.
 */
export async function removeSeat(
  saveId: string,
  seatId: string,
  opts: {
    /** Runs first inside the lock; `false` aborts with `SeatError("notFound")` (the caller is still the owner). */
    guard?: () => boolean | Promise<boolean>;
    /** Runs inside the lock after the seat is gone (socket, inbox and news must not race the day advance). */
    onLocked?: (removed: RemovedSeat) => Promise<void> | void;
  } = {},
): Promise<RemovedSeat> {
  return withSaveLock(saveId, async () => {
    if (opts.guard && !(await opts.guard())) throw new SeatError("notFound", `removeSeat: guard refused ${saveId}`);
    const buffer = new BufferingSaveDAL(new FileSystemDAL());
    const service = new SaveService(buffer);
    const world = await service.getMeta(saveId);
    if (!world?.currentDate || !world.seats.includes(seatId)) throw new SeatError("notFound", `removeSeat: seat ${seatId} not in save ${saveId}`);
    const member = memberBySeat(saveId, seatId);
    // The owner hands the world over first (`transferOwnership`); the last seat deletes the world instead.
    if (member?.role === "owner" || world.seats.length <= 1) throw new SeatError("ownerOrLast", `removeSeat: seat ${seatId} is the owner or the last seat`);
    const seat = await service.getSeat(saveId, seatId);
    if (!seat) {
      // Broken world (the id is in `seats` but the folder is gone): just drop the id and the member row.
      await service.deleteSeat(saveId, seatId);
      await buffer.flush();
      removeSaveMember(saveId, seatId);
      const gone: RemovedSeat = { userId: member?.userId ?? null, managerName: "", clubId: "", clubName: "", leagueSlug: "" };
      await runAnnounce("removeSeat", saveId, () => opts.onLocked?.(gone));
      return gone;
    }
    const date = world.currentDate;
    const managerName = seat.manager?.name?.trim() || seat.clubName;

    // Every loan the seat's market tracks ends now (lent and borrowed): the market file goes with the seat,
    // so nothing would end them later.
    const market = await service.getMarket(saveId, seatId);
    if (market?.loans?.length) {
      await returnDueLoans(service, saveId, seatId, metaForSeat(world, seatId, seat), market, date, { graceDays: 100_000 });
    }

    // A national team he coaches (Etapa 41b) gets an interim and a vacancy (no "resigned" message); his job offers go
    // and the vacancies they were holding reopen on the offer's date.
    const natState = await service.getNationalState(saveId);
    if (natState) {
      let st = (await leaveNationalTeam(service, saveId, seatId, natState, date, "left_world")).state;
      const mine = st.offers?.[seatId] ?? [];
      if (mine.length > 0) {
        const { [seatId]: _o, ...offers } = st.offers ?? {};
        const vacancies = { ...st.vacancies };
        for (const o of mine) {
          const v = vacancies[o.teamId];
          const held = Object.values(offers).some((l) => l.some((x) => x.teamId === o.teamId));
          if (v && !held && v.hireOn > o.date) vacancies[o.teamId] = { ...v, hireOn: o.date };
        }
        st = { ...st, offers, vacancies };
      }
      if (st !== natState) await service.writeNationalState(saveId, st);
    }

    if (seat.clubId && !seat.unemployed) {
      await releaseHumanClub(service, saveId, seatId, { squadId: seat.clubId, date });
      await service.writeManagers(saveId, sackHumanManager(await service.getManagers(saveId), {
        seatId, date, clubName: seat.clubName, left: "left_world",
      }));
      const meta = (await service.getMeta(saveId))!;
      const rng = mulberry32(seedFrom(`${saveId}:${seat.clubId}:${date}:vacancy`));
      await service.updateMeta(saveId, {
        managerVacancies: { ...(meta.managerVacancies ?? {}), [seat.clubId]: { since: date, hireOn: vacancyHireOn(date, rng) } },
      });
    }
    await service.deleteSeat(saveId, seatId);
    await buffer.flush();
    removeSaveMember(saveId, seatId);
    const removed: RemovedSeat = {
      userId: member?.userId ?? null,
      managerName,
      clubId: seat.unemployed ? "" : seat.clubId,
      clubName: seat.clubName,
      leagueSlug: seat.leagueSlug,
    };
    await runAnnounce("removeSeat", saveId, () => opts.onLocked?.(removed));
    return removed;
  });
}
