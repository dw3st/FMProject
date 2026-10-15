import { randomUUID } from "crypto";
import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import type { MemberRole, SaveManager, SeatContext, SeatState } from "@/types/seatTypes";
import type { LeagueData } from "@/types/playerTypes";
import { addSaveMember, memberOf } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { takeOverClub } from "@/backend/jobWorld";
import { applyBroadcasting } from "@/backend/FinancialService";
import { getLeagueData } from "@/backend/advanceDay";
import { competitionName } from "@/Domain/world/labels";
import { metaForSeat } from "@/Domain/seats/seats";
import { placeSeatManager } from "@/Domain/managers/seatManagers";
import { managerReputation } from "@/Domain/jobs/jobs";
import { contractUntil, managerWeeklyWage, MANAGER_CONTRACT } from "@/Domain/managers/managerContract";
import { defaultSeasonEnd } from "@/Domain/contracts/contracts";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { buildBoardMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { generateRestDays } from "@/Domain/season/generateRestDays";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";

/**
 * A new seat in an existing world (`.claude/rules/game/multiplayer.md`): tests and scripts only in part 1 (the invite
 * screen is part 2). The club becomes human the way a job switch does (`takeOverClub`: staff, facilities, morale,
 * familiarity, tactic, board), without the arrival line; its balance starts at 0 plus the season's broadcasting, like
 * a new career. The club's AI manager goes to the free pool and the seat's manager takes the job. The user joins the
 * world as a member with this seat.
 */
export async function addSeat(
  saveId: string,
  args: { userId: string; clubId: string; manager: SaveManager; role?: MemberRole },
  service: SaveService = defaultService,
): Promise<SeatContext> {
  return withSaveLock(saveId, async () => {
    const world = await service.getMeta(saveId);
    if (!world?.currentDate) throw new Error(`addSeat: save ${saveId} not found or without a date`);
    if (memberOf(saveId, args.userId)) throw new Error(`addSeat: user ${args.userId} already has a seat in ${saveId}`);
    if ((await service.humanClubIds(saveId)).has(args.clubId)) throw new Error(`addSeat: club ${args.clubId} already has a seat`);
    const index = await service.getSquadIndex(saveId);
    const entry = index.byId(args.clubId);
    if (!entry) throw new Error(`addSeat: club ${args.clubId} is not in save ${saveId}`);

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
      sackingEnabled: true,
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
    return { seatId, seat: finalSeat };
  });
}
