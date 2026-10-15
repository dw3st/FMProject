import type { SaveService, SeatMeta, SaveMeta } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { MatchContext } from "@/backend/boardWorld";
import type { scoutingDay } from "@/backend/scoutingWorld";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { BoardState, CareerEnded, SackReason } from "@/types/boardTypes";
import type { SeatState } from "@/types/seatTypes";
import type { RegistrationNotice } from "@/types/registrationTypes";
import type { StandingRow } from "@/types/playerTypes";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import type { AwardsInboxMessage, PressInboxMessage } from "@/types/inboxTypes";
import type { ClubMove } from "@/types/pyramidTypes";
import type { JobOffer, Unemployment } from "@/types/jobTypes";
import type { PressState } from "@/types/pressTypes";
import type { DayNewsInput } from "@/types/newsTypes";
import type { ManagerCardRecord } from "@/Domain/advanceDay/matches";
import type { GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { ManagerContract, ManagerRenewalOffer } from "@/Domain/managers/managerContract";
import type { DirectorDecision, DirectorOutcome } from "@/Domain/responsibilities/director";
import type { PlayerNews } from "@/Domain/morale/morale";
import type { StaffContractNews } from "@/Domain/staff/staffContracts";
import type { ManagerBan } from "@/Domain/referees/managerBan";
import type { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import type {
  buildBoardMessage, buildContinentalMessage, buildContractMessage, buildInjuryMessage, buildRetirementMessage,
  buildSeasonMessage, buildTransferNegotiationMessage, buildYouthMessage,
} from "@/Domain/inbox/inboxEvents";
import { metaForSeat } from "@/Domain/seats/seats";
import { logError } from "@/Logger";

type Msg<F extends (...a: never[]) => unknown> = Parameters<F>[0];

/**
 * One seat during a day advance (`.claude/rules/game/multiplayer.md`): its club, its tactics, the board kept in
 * memory, and every accumulator the day used to keep for "the" human club. Built by `loadDaySeats` at the start
 * of `advanceOneDay`; the seat patch (`patch`) is written at the end with `updateSeat`.
 */
export interface DaySeat {
  seatId: string;
  /** World + seat as they were at the start of the day (read-only view for the helpers). */
  meta: SeatMeta;
  /** The seat's club (squad id); undefined while unemployed or when the club left the world. */
  clubId: string | undefined;
  entry: ReturnType<SquadIndex["byId"]>;
  tactics: TacticsSave | null;
  board: BoardState | undefined;
  sackedReason: SackReason | null;
  boardMessages: Msg<typeof buildBoardMessage>[];
  press: { titles: string[]; eliminated: string[]; matchContext: Map<string, MatchContext> };
  registrationNotices: RegistrationNotice[];
  managerCards: ManagerCardRecord[];
  managerBan: ManagerBan | undefined;
  managerBanGiven: number | null;
  moraleUnavailable: Set<string>;
  moraleBids: { playerId: string; clubId: string; clubName: string }[];
  homeFixtures: Array<{ competition: string; kind: GateKind; neutral?: boolean; opponentId: string; importance?: number }>;
  importanceStandings: StandingRow[] | null | undefined;
  /** The seat's ledger season (year of its league), read once. */
  ledgerSeason: number | null;
  scouting: Awaited<ReturnType<typeof scoutingDay>> | null;
  deferred: {
    injury: Msg<typeof buildInjuryMessage>[];
    contract: Msg<typeof buildContractMessage>[];
    youth: Msg<typeof buildYouthMessage>[];
    facility: Msg<typeof buildFacilityMessage>[];
    retirement: Msg<typeof buildRetirementMessage>[];
    clubRecords: ClubRecordBroken[];
    awards: AwardsInboxMessage[];
    negotiation: Msg<typeof buildTransferNegotiationMessage>[];
    continental: Msg<typeof buildContinentalMessage>[];
    season: Msg<typeof buildSeasonMessage>[];
    negativeBalance: Msg<typeof buildSeasonMessage> | null;
  };
  managerEarned: number;
  rollover: {
    seasonEnded: boolean;
    archiveYear?: number;
    moves: ClubMove[];
    move: ClubMove | null;
    championOf: string | null;
    objectiveMet: boolean;
    followersChange: { before: number; after: number; leagueSlug: string } | null;
    leaguePrize: number;
    boardBonusEntry: LedgerEntry | null;
    boardAtSeasonEnd?: number;
  };
  job: {
    ended?: CareerEnded;
    contract?: ManagerContract;
    unemployed?: Unemployment;
    offers: JobOffer[];
    offersBefore: JobOffer[];
    kept: JobOffer[];
    newOffers: JobOffer[];
    midSeason?: string;
    renewal?: ManagerRenewalOffer;
    notices?: string[];
  };
  director: { decided?: Record<string, DirectorDecision>; outcomes: DirectorOutcome[]; news: PlayerNews[] };
  staffNews: StaffContractNews[];
  moraleNews: PlayerNews[];
  pressOut: { state?: PressState; invite?: PressInboxMessage; news: DayNewsInput["press"] };
  achievementsUnlocked: number;
  /** Seat fields to write at the end of the day. */
  patch: Partial<SeatState>;
}

export function newDaySeat(args: {
  seatId: string; world: SaveMeta; seat: SeatState; index: SquadIndex; tactics: TacticsSave | null;
}): DaySeat {
  const { seatId, world, seat, index } = args;
  const entry = !seat.unemployed && seat.clubId ? index.byId(seat.clubId) : undefined;
  const offers = seat.jobOffers ?? [];
  return {
    seatId,
    meta: metaForSeat(world, seatId, seat),
    clubId: entry?.squadId,
    entry,
    tactics: args.tactics,
    board: seat.board,
    sackedReason: null,
    boardMessages: [],
    press: { titles: [], eliminated: [], matchContext: new Map() },
    registrationNotices: [],
    managerCards: [],
    managerBan: seat.managerBan,
    managerBanGiven: null,
    moraleUnavailable: new Set(),
    moraleBids: [],
    homeFixtures: [],
    importanceStandings: undefined,
    ledgerSeason: null,
    scouting: null,
    deferred: {
      injury: [], contract: [], youth: [], facility: [], retirement: [], clubRecords: [], awards: [],
      negotiation: [], continental: [], season: [], negativeBalance: null,
    },
    managerEarned: 0,
    rollover: {
      seasonEnded: false, moves: [], move: null, championOf: null, objectiveMet: false, followersChange: null,
      leaguePrize: 0, boardBonusEntry: null,
    },
    job: {
      offers, offersBefore: offers, kept: offers, newOffers: [],
      ...(seat.jobsMidSeason ? { midSeason: seat.jobsMidSeason } : {}),
      ...(seat.unemployed ? { unemployed: seat.unemployed } : {}),
      ...(seat.managerRenewal ? { renewal: seat.managerRenewal } : {}),
      ...(seat.managerContractNotices ? { notices: seat.managerContractNotices } : {}),
      ...(entry && seat.managerContract?.squadId === entry.squadId ? { contract: seat.managerContract } : {}),
    },
    director: { outcomes: [], news: [] },
    staffNews: [],
    moraleNews: [],
    pressOut: { news: [] },
    achievementsUnlocked: 0,
    patch: {},
  };
}

/** Every seat of the world for today's advance, in seat order (a seat without its file is logged and skipped). */
export async function loadDaySeats(
  service: SaveService, saveId: string, world: SaveMeta, index: SquadIndex,
): Promise<DaySeat[]> {
  const out: DaySeat[] = [];
  for (const seatId of world.seats ?? []) {
    const seat = await service.getSeat(saveId, seatId);
    if (!seat) {
      logError("seats", `save ${saveId}: seat ${seatId} is listed in the meta but has no seat.json`);
      continue;
    }
    out.push(newDaySeat({ seatId, world, seat, index, tactics: await service.getTactics(saveId, seatId) }));
  }
  return out;
}

/** The clubs with a human manager today (the AI never acts on these). */
export function humanClubSet(seats: readonly DaySeat[]): Set<string> {
  return new Set(seats.flatMap((s) => (s.clubId ? [s.clubId] : [])));
}

/** club id → its seat. */
export function seatByClub(seats: readonly DaySeat[]): Map<string, DaySeat> {
  return new Map(seats.flatMap((s) => (s.clubId ? [[s.clubId, s] as const] : [])));
}
