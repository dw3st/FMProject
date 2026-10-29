import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";
import { worldTopIds } from "@/Domain/squad/starLimit";
import { appendSeatSeasons, newPassage, positionOf, standingsOn, standingsView } from "@/backend/standingsWorld";
import { closePassage, rankOf, sumItems, withExtra } from "@/Domain/multiplayer/standings";
import { continentalEventItem, cupTieItems, nationalNewsItems } from "@/Domain/multiplayer/standingsEvents";
import { buildSeasonClosedMessage } from "@/Domain/multiplayer/worldMessages";
import { STANDINGS } from "@/Domain/multiplayer/standingsConfig";
import type { SeatSeasonRow, StandingItem } from "@/types/standingsTypes";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import { nextManagerBan, sanitizeManagerCards } from "@/Domain/referees/managerBan";
import { buildManagerBanMessage } from "@/Domain/inbox/disciplineMessage";
import { applyManagerCard, applyPressEffect } from "@/Domain/boardFans/boardFans";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { afterManagerComplaint, aiFormMorale } from "@/Domain/morale/morale";
import { roundAttr } from "@/Domain/attributes";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { applyMoraleDay } from "@/backend/moraleWorld";
import { achievementsDay } from "@/backend/achievementsWorld";
import { applyDirectorDay } from "@/backend/directorWorld";
import type { RosterPlayer } from "@/types/playerTypes";
import { directorHandlesContracts } from "@/Domain/responsibilities/director";
import { fileURLToPath } from "node:url";
import { randomUUID } from "crypto";
import { saveService, SaveService, type SeatMeta, type SaveMeta } from "@/backend/SaveService";
import { metaForSeat, seatIdOfManager } from "@/Domain/seats/seats";
import { humanClubSet, loadDaySeats, seatByClub, type DaySeat } from "@/backend/daySeats";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { withSaveLock } from "@/backend/saveLock";
import { applyRandomStartKit } from "@/backend/startKits";
import { executeTransferFee, recordMoney } from "@/backend/FinancialService";
import type { FreeAgent, LeagueData, LeagueTeam, LeagueZone, Squad, StandingRow } from "@/types/playerTypes";
import { CONTRACT_CONFIG } from "@/Domain/contracts/contractConfig";
import { processContractExpiries } from "@/Domain/contracts/expiry";
import { processYouthRollover } from "@/Domain/youth/youth";
import { buildWorldLevels, expireOffers, processRetirements } from "@/Domain/retirement/retirement";
import { overallAvg } from "@/Domain/playerRating";
import type { Pyramids } from "@/types/pyramidTypes";
import type { MatchEvent, StoredDayLog, TrainingEvent, RestEvent } from "@/types/dayLogTypes";
import type { StoredTransferRecord } from "@/types/transferTypes";
import { pruneTransferLog } from "@/Domain/transfer/transferView";
import type { ContinentalSlug, Fixture, LeagueSeasonMeta, LeagueSeasonState } from "@/types/calendarTypes";
import {
  emitInboxMessage,
  buildContinentalMessage,
  buildCupMessage,
  buildDevelopmentMessage,
  buildInjuryMessage,
  buildContractMessage,
  buildDirectorSummaryMessage,
  buildRetirementMessage,
  buildTransferNegotiationMessage,
  buildPlayerMessage,
  buildYouthMessage,
  buildTransferInMessage,
  buildTransferOutMessage,
  buildSeasonMessage,
  buildBoardMessage,
  buildJobMessage,
} from "@/Domain/inbox/inboxEvents";
import {
  applyCompetitionEvent,
  applyTransferSale,
  applyWeekly,
  boardBonus,
  carryIntoNewSeason,
  evaluateSeason,
  followersAfterMood,
  isIdol,
  reviewBoardStatus,
  snapshotBoard,
  stadiumFillRate,
} from "@/Domain/boardFans/boardFans";
import { boardAfterMatches, objectiveFromSquads } from "@/backend/boardWorld";
import { pressDay } from "@/backend/pressWorld";
import { collectDayNews, newNewsCollector, readLeaders, writeDayNews } from "@/backend/newsWorld";
import type { JobOffer } from "@/types/jobTypes";
import { JOBS } from "@/Domain/jobs/jobsConfig";
import { mergeOffers, pruneOffers, sackHumanManager } from "@/Domain/jobs/jobs";
import { generateJobOffers, releaseHumanClub, seasonEndExpiry } from "@/backend/jobWorld";
import { cancelScoutMissions, rememberPlayers, scoutingDay } from "@/backend/scoutingWorld";
import { buildScoutingMessage } from "@/Domain/scouting/scoutingMessages";
import { addDays, addOneDay } from "@/Domain/dates";
import { compactDayLog, DAY_LOG_COMPACT_LOOKBACK_DAYS, DAY_LOG_COMPACT_PER_DAY, DAY_LOG_KEEP_FULL_DAYS } from "@/Domain/advanceDay/dayLogCompaction";
import { isGroupWorld } from "@/Domain/groupAdvance/groupAdvance";
import {
  buildMatchEvent,
  buildMatchEventFromRecording,
  buildQuickMatchEvent,
  type PlayedMatchRecording,
} from "@/Domain/advanceDay/matches";
import { resolveSimModeForSeats } from "@/Domain/advanceDay/simMode";
import { buildTrainingEvent, resolveTrainingPolicy } from "@/Domain/advanceDay/dailyTraining";
import { buildRestEvent } from "@/Domain/advanceDay/dailyRest";
import { aiRestingClubs } from "@/Domain/advanceDay/aiRest";
import { computeAdvanceDayMoney, type PlayerHomeFixtureToday } from "@/Domain/advanceDay/financial";
import { advanceFacilities, comfortPriceMult, facilitiesMatchday, seasonFraction, withFacilities } from "@/Domain/facilities/facilities";
import { wearDay } from "@/Domain/facilities/facilityItems";
import { matchPitch } from "@/Domain/facilities/pitch";
import { homeMatchImportance } from "@/backend/matchImportance";
import { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import { leagueTierOf } from "@/backend/facilityWorld";
import { computeSeatedMatchLineups, type HumanMatchSide } from "@/Domain/advanceDay/matchSimulationLineups";
import { defaultRng } from "@/Domain/transfer/transferNeeds";
import { dailyMarketTick, humanBidsTick, initMarketState, squadsAfterTick } from "@/Domain/transfer/marketRotation";
import { splitMarket } from "@/Domain/market/seatMarket";
import { pruneTalks } from "@/Domain/negotiation/negotiation";
import type { MarketState } from "@/types/transferMarketTypes";
import { parentLoanWages } from "@/Domain/negotiation/loans";
import { marketAfterSellOnPaid, pruneSellOnHeld, returnDueLoans, sellOnFor, settleSellOn } from "@/backend/negotiationWorld";
import { liveBids } from "@/Domain/negotiation/bids";
import { expireSeatOffers, nudgeSeats, type SeatNudges } from "@/backend/seatOfferWorld";
import { freeAgentTick, pruneFreeAgents, refillSquad, toFreeAgent, trimSquadToCap } from "@/Domain/contracts/freeAgents";
import { defaultSeasonEnd } from "@/Domain/contracts/contracts";
import { ensureNationalWorld, playNationalDay } from "@/backend/nationalWorld";
import { buildNationalMessage } from "@/Domain/inbox/nationalMessage";
import { buildNationalCoachMessage } from "@/Domain/inbox/nationalCoachMessage";
import { managerNation } from "@/Domain/national/nationalCoach";
import { applyHumanBroadcastingCredit, buildNextSeasonCalendar, runSeasonTransition } from "@/Domain/season/seasonTransition";
import { clubRolloverOutcome, findDueRollovers, planCountryRollover, tierOfLeague } from "@/Domain/season/countryRollover";
import { applyTierFinanceChange } from "@/Domain/advanceDay/tierFinances";
import { applyAISeasonReaction, applyHumanSeasonReaction, clubSeasonOutcome } from "@/Domain/aiFinance/seasonReaction";
import {
  aiTransferBudgetOf, financialTierOf, popularityFromFollowers, seasonalTransferBudgetFor,
} from "@/Domain/aiFinance/aiClubFinance";
import {
  aiBudgetWithPrize, continentalPrize, continentalStagePrizesFromEvents, cupRunnerUpPrize, cupStagePrize, leaguePrize,
} from "@/Domain/finance/prizes";
import { applyMoney, type LedgerEntry } from "@/Domain/finance/ledger";
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";
import { requireSeat } from "@/backend/auth/middleware";
import { computeStandings } from "@/Domain/season/computeStandings";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import { logDebug, logError, logSeason, LOG_NS_SEASON } from "@/Logger";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import { countriesToRegenerate, buildCupArchive } from "@/Domain/cups/cupRollover";
import { advanceCupStages, countryByLeague, createCountryCup, cupPrizeBase, playerCupSlug } from "@/backend/cupWorld";
import { engineReferee, ensureAssignments, ensureTomorrow, recordRefereeDay, rolloverReferees, varLookup } from "@/backend/refereeWorld";
import { fixtureKey } from "@/Domain/referees/assign";
import { withRefereeLog, withWeatherLog } from "@/Domain/advanceDay/matches";
import { matchWeatherOf } from "@/backend/stadiumData";
import { ensureYouthCompetitions, playYouthDay, regenerateYouthComps } from "@/backend/youthCompWorld";
import { advanceCallUps, callUpEligibleIds } from "@/Domain/youthComps/callUps";
import { competitionName } from "@/Domain/world/labels";
import type { GateKind } from "@/Domain/finance/gate";
import { carryForwardWageFactor, clubAnnualRevenue, clubWageFactor, pullWageFactorToTarget, squadCurveBill, wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import { impliedStars, staffEffectsOf } from "@/Domain/staff/staff";
import { isContinentalSlug, competitionsOf } from "@/Domain/continental/competitions";
import { withAggregate } from "@/Domain/continental/knockout";
import { addPendingTitle, closeSeasonForPlayers, seasonLabel } from "@/Domain/history/history";
import { continentalPoints, cupPoints, leaguePoints, promotionPoints } from "@/Domain/managers/managers";
import { createAiManagerDesk, createManagerTracker } from "@/backend/managerWorld";
import { recordLeagueAwards, recordSeasonGoals, runWorldCeremony } from "@/backend/awardsWorld";
import { tierFactor } from "@/Domain/awards/awardsConfig";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";
import {
  humanRegistrationDay, matchRegistration, refreshAiRegistrations, registrationDayCtx,
} from "@/backend/registrationWorld";
import { buildRegistrationMessage } from "@/Domain/inbox/registrationMessage";
import { applyDuePreContracts, resolveRivalDeadlines, rollRivalFor } from "@/backend/rivalWorld";
import { getCountries } from "@/backend/continentalWorld";
import { buildManagerNewsMessage, buildPressInviteMessage, buildScheduleMessage, buildStaffContractMessages } from "@/Domain/inbox/inboxEvents";
import { drawnLeaguesOf, playerRestDaysAfterMoves, rescheduleFixtureConflicts, syncPlayerRestDays } from "@/backend/reschedulingWorld";
import { firstMatchAfterMoves, rescheduledGamesOf, type FixtureMove } from "@/Domain/calendar/rescheduling";
import { ageStaff, staffContractDay } from "@/Domain/staff/staffContracts";
import { refreshPool, returnToPool } from "@/Domain/staff/staffPool";
import { WINDOWS } from "@/Domain/market/windowConfig";
import { daysToClose } from "@/Domain/market/windows";
import { liveRivals } from "@/Domain/negotiation/rivals";
import { contractDay, managerWeeklyWage, reanchorContract, renewalPending, renewedContract, severancePay } from "@/Domain/managers/managerContract";
import { managerReputation } from "@/Domain/jobs/jobs";
import type { DayTransfer } from "@/types/dayLogTypes";
import { cupAndContinentalFixtures, recordLeagueSeasonHistory, recordTransferHistory } from "@/backend/clubHistoryWorld";
import { buildClubRecordMessage } from "@/Domain/clubHistory/recordMessage";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import { continentsToRegenerate as continentsToRegenerateContinental, buildContinentalArchive } from "@/Domain/continental/continentalProgress";
import {
  advanceContinentalStages,
  createContinentalSeason,
  continentalClubStatus,
  continentalGoodClubsThisSeason,
  continentalQualificationOf,
  continentalTier1LeagueStates,
  seasonDefiningYear,
} from "@/backend/continentalWorld";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

/** A national cup or a continental competition: no table, sim mode gated on the player's league. */
function isKnockoutComp(slug: string): boolean {
  return isCupSlug(slug) || isContinentalSlug(slug);
}

/** "1st", "2nd", "3rd", "4th"… for the league prize ledger label (design spec §3 "Liga"). */
function ordinalPosition(position: number): string {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  switch (position % 10) {
    case 1: return `${position}st`;
    case 2: return `${position}nd`;
    case 3: return `${position}rd`;
    default: return `${position}th`;
  }
}

function withDefaultFinances(s: Squad): Squad {
  if (s.finances) return s;
  return {
    ...s,
    finances: {
      broadcasting: 0,
      commercial: 0,
      total: 0,
      budget: 0,
      followers: 0,
    },
  };
}

export type LeagueDataEntry = {
  slug: string;
  name?: string;
  country?: string;
  standings: LeagueTeam[];
  zones?: LeagueZone[];
};

let _leagueDataCache: LeagueDataEntry[] | null = null;

export async function getLeagueData(): Promise<LeagueDataEntry[]> {
  if (_leagueDataCache) return _leagueDataCache;
  const file = Bun.file(`${DATA_DIR}/leagueData.json`);
  if (!(await file.exists())) return [];
  _leagueDataCache = (await file.json()) as LeagueDataEntry[];
  return _leagueDataCache;
}

let _pyramidsCache: Pyramids | null = null;

/** Country pyramids (promotion/relegation), keyed by leagueData country. Missing file → none. */
export async function getPyramids(): Promise<Pyramids> {
  if (_pyramidsCache) return _pyramidsCache;
  const file = Bun.file(`${DATA_DIR}/pyramids.json`);
  _pyramidsCache = (await file.exists()) ? ((await file.json()) as Pyramids) : {};
  return _pyramidsCache;
}

/** League display name: leagueData catalog first, then the save's league state, then the slug. */
async function leagueNameResolver(states: LeagueSeasonState[]): Promise<(slug: string) => string> {
  const catalog = await getLeagueData();
  return (slug) =>
    catalog.find((l) => l.slug === slug)?.name ?? states.find((l) => l.leagueSlug === slug)?.leagueName ?? slug;
}

export type AdvanceDayOutcome =
  | { ok: false; status: number; error: string }
  | {
      ok: true; payload: Record<string, unknown>; seats: Record<string, Record<string, unknown>>;
      /** Seats whose offers with another seat changed today: nudged by socket once the day is written. */
      seatOfferNudges?: string[];
      /** A friends' league standings row was closed today: the members' screens reload once the day is written. */
      standingsChanged?: boolean;
    };

/** One seat's view of a day: the world's payload merged with that seat's part (`payloadForSeat`). */
export type SeatDayOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; payload: Record<string, unknown> };

/** The response of a day for one seat: the world's part plus that seat's (season end, sacking, offers…). */
export function payloadForSeat(
  outcome: { payload: Record<string, unknown>; seats: Record<string, Record<string, unknown>> },
  seatId: string,
): Record<string, unknown> {
  return { ...outcome.payload, ...(outcome.seats[seatId] ?? {}) };
}

/**
 * One day as a unit of work: a fresh BufferingSaveDAL, `advanceOneDay` against it, then one
 * flush (meta last). A failed day (`!ok`) flushes nothing; a flush error is a 500 and, since meta
 * is written last, `currentDate` was not advanced. The caller holds `withSaveLock`.
 * Shared by `POST /api/advance-day/:saveId` and `POST /api/saves/:saveId/advance-until`.
 */
export async function runBufferedDay(
  saveId: string,
  recordings: Record<string, PlayedMatchRecording> = {},
  options: AdvanceOneDayOptions = {},
  /**
   * Writes of the caller that belong to the same day (the rivals feed of a group world): run on the day's buffered
   * service before the flush, so they land with the day or not at all (the meta goes last). A throw fails the day.
   */
  beforeFlush?: (dayService: SaveService, outcome: AdvanceDayOutcome) => Promise<void>,
): Promise<AdvanceDayOutcome> {
  // Each squad is read at most once and written once.
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const dayService = new SaveService(buffer);
  const outcome = await advanceOneDay(dayService, saveId, recordings, options);
  if (!outcome.ok) return outcome;
  if (beforeFlush) {
    try {
      await beforeFlush(dayService, outcome);
    } catch (err) {
      logError("advance-day", `failed to prepare the day's writes for save ${saveId}`, err);
      return { ok: false, status: 500, error: "failed to persist day" };
    }
  }
  try {
    await buffer.flush();
  } catch (err) {
    const errors = err instanceof AggregateError ? err.errors : [err];
    for (const e of errors) logError("advance-day", `failed to persist day for save ${saveId}`, e);
    return { ok: false, status: 500, error: "failed to persist day" };
  }
  if (outcome.seatOfferNudges?.length) nudgeSeats(saveId, outcome.seatOfferNudges);
  if (outcome.standingsChanged) notifyWorld(saveId, { type: "world_members", saveId });
  return outcome;
}

/**
 * Pre-simulate the world from the earliest league's kickoff up to the player's
 * season start.
 *
 * When a save is created, calendars are generated for ALL leagues but currentDate
 * is set to the player's league start. Leagues that kick off earlier (e.g. the
 * Brazilian season starts months before the European one) therefore have unplayed
 * fixtures sitting in the past. This runs the FULL daily pipeline — matches, AI
 * training/rest, the transfer market, finances, day logs — exactly as a normal day
 * advance would, so the world is genuinely alive when the player begins.
 *
 * To avoid the per-day disk churn (re-reading/writing every squad for ~130 days),
 * the whole catch-up runs against a BufferingSaveDAL: every read is cached and every
 * write is held in memory, then flushed to disk once at the end. The on-disk
 * currentDate is only mutated by that flush, and the flush writes the save meta
 * last — only after every other file was persisted. A run interrupted before the
 * flush leaves the save untouched; a flush that fails part-way may leave some
 * world files written but never records the save as caught up (currentDate stays
 * at the player's start).
 *
 * Idempotent enough for safety: if worldStart >= playerStart there is nothing to do.
 */
export async function presimulatePreStart(
  saveId: string,
): Promise<{ days: number; leagues: string[] }> {
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const service = new SaveService(buffer);

  const meta = await service.getMeta(saveId);
  if (!meta?.currentDate) return { days: 0, leagues: [] };
  const activeLeagues = meta.activeLeagues ?? [];
  if (activeLeagues.length === 0) return { days: 0, leagues: [] };

  const playerStart = meta.currentDate;
  const worldStart = activeLeagues.reduce(
    (earliest, l) => (l.start < earliest ? l.start : earliest),
    playerStart,
  );
  if (worldStart >= playerStart) return { days: 0, leagues: [] };

  // Rewind the world (in the buffer only) to the earliest kickoff, then run the
  // full daily pipeline forward until we reach the player's start date.
  await service.updateMeta(saveId, { currentDate: worldStart });

  // Every club in every league is pickable for a new career (not just the one that kicks
  // off on the player's start date), and the rosters are already current — so the whole
  // transfer market sits out the pre-simulation. Only matches/training/development run.
  let days = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const current = (await service.getMeta(saveId))?.currentDate;
    if (!current || current >= playerStart) break;
    const outcome = await advanceOneDay(service, saveId, {}, { marketFrozen: true });
    if (!outcome.ok) break;
    days++;
  }

  await buffer.flush();

  return {
    days,
    leagues: activeLeagues.filter((l) => l.start < playerStart).map((l) => l.leagueSlug),
  };
}

/**
 * Season-start continental inbox news ("qualified" for the club's continent + wherever it
 * actually stands on disk right now) for the human club. Called once, from the
 * `/api/saves/:saveId/presimulate` route, AFTER the start-kit decision (`applyRandomStartKit`) —
 * never from `createSave` itself, because a start kit overwrites the season's ucl/uel/lib/sud
 * metas with a different (pre-simulated) draw, and by its cutoff date the group stage has always
 * finished with the r16 already drawn (see `.claude/rules/game/continental.md`). Reading
 * `continentalClubStatus` after the kit decision — instead of the group `createSave` originally
 * generated — covers both paths (kit applied, no kit) with one read of what's on disk.
 */
export async function emitContinentalSeasonStartNews(
  saveId: string,
  seatId: string,
  clubId: string,
  date: string,
): Promise<void> {
  const found = await continentalClubStatus(saveService, saveId, clubId);
  if (!found) return;
  const { slug, status } = found;

  const catalog = await getLeagueData();
  const compName = competitionName(slug, catalog as unknown as LeagueData[], "en");
  const index = await saveService.getSquadIndex(saveId);

  await emitInboxMessage(saveId, buildContinentalMessage({
    date, kind: "qualified", competition: slug, competitionName: compName, stage: "group",
  }), saveService, seatId);

  if (status.kind === "group") {
    const opponentNames = status.opponentIds.map((id) => index.byId(id)?.name ?? id);
    await emitInboxMessage(saveId, buildContinentalMessage({
      date, kind: "group", competition: slug, competitionName: compName, stage: "group",
      group: status.group, opponentNames,
    }), saveService, seatId);
  } else if (status.kind === "eliminatedGroup") {
    await emitInboxMessage(saveId, buildContinentalMessage({
      date, kind: "eliminated", competition: slug, competitionName: compName, stage: "group",
    }), saveService, seatId);
  } else {
    const opponentName = index.byId(status.opponentId)?.name ?? status.opponentId;
    await emitInboxMessage(saveId, buildContinentalMessage({
      date, kind: "draw", competition: slug, competitionName: compName, stage: status.stage,
      opponentName, firstLegDate: status.firstLegDate, venue: status.venue,
    }), saveService, seatId);
  }
}

export interface AdvanceOneDayOptions {
  /**
   * The whole transfer market sits out today (no AI buying, no AI selling, no sell-list
   * matching). Only the start-kit pre-simulation sets it: every club is pickable for a new
   * career, so none of them may trade before the player ever gets to choose one.
   */
  marketFrozen?: boolean;
}

/**
 * Advance a single in-game day for one save: simulate the day's fixtures, train/rest
 * non-playing teams, tick the transfer market, apply finances, roll the season over
 * if it ended, and persist everything — all through the supplied `service`.
 *
 * The `service` param is named `saveService` so the body reads identically to the
 * original route handler; the daily route passes the real singleton, while the
 * pre-season catch-up passes a buffered service. Returns a result the caller maps
 * to an HTTP response.
 */
export async function advanceOneDay(
  saveService: SaveService,
  saveId: string,
  /** Live recordings of today's matches, by seat id (`.claude/rules/game/multiplayer.md`). */
  recordings: Record<string, PlayedMatchRecording> = {},
  options: AdvanceOneDayOptions = {},
): Promise<AdvanceDayOutcome> {
    // ── Load core state ──────────────────────────────────────────────────────
    const world = await saveService.getMeta(saveId);
    if (!world) return { ok: false, status: 404, error: "save not found" };
    if (!world.currentDate) return { ok: false, status: 400, error: "save has no currentDate" };

    const currentDate = world.currentDate;
    const nextDate = addOneDay(currentDate);
    const activeLeagues = world.activeLeagues ?? [];

    const dayEvents: Array<StoredDayLog["events"][number] | TrainingEvent | RestEvent> = [];
    // Keyed by squadId (not appended) so a club with two fixtures today (should not normally
    // happen, but the calendar has no hard guarantee across every competition folder) chains: the
    // second fixture reads the first match's updated squad instead of the stale pre-day snapshot,
    // and only one, final write per squad reaches disk — a plain array here would let the two
    // parallel `saveSquad` calls race and the loser's energy/seasonLog/development silently vanish.
    const squadWrites = new Map<string, { league: string; club: string; squad: Squad }>();
    const teamsPlayingToday = new Set<string>(); // squadIds that have a match today
    // Injury news for the human club, collected as the day is built (matches + training/rest) and
    // emitted to the inbox once, after everything else — see `.claude/rules/game/injuries.md`.
    const injuryInboxEvents: Array<
      | { kind: "injured"; squadId: string; playerId: string; playerName: string; severity: "light" | "medium" | "severe"; returnDate: string }
      | { kind: "returned"; squadId: string; playerId: string; playerName: string }
      | { kind: "suspended"; squadId: string; playerId: string; playerName: string; matches: number }
    > = [];
    // Each seat's home fixtures today (`DaySeat.homeFixtures`, for the gate and the facilities) and its
    // big-match table (`DaySeat.importanceStandings`, read once before today's games) are filled by the match loop.

    // Membership comes from the save's squad folders. Built once for the day's matches and
    // training; only the season rollover changes it, and it re-reads the index right after.
    let index = await saveService.getSquadIndex(saveId);

    // The seats of the world (`.claude/rules/game/multiplayer.md`): every step of the day loops over them.
    const daySeats = await loadDaySeats(saveService, saveId, world, index);
    // No seat (the public world) is "no human club": every loop below is empty and the AI plays the whole world.
    // The world as no seat sees it (AI-only flows that need a meta: the date of an AI fee, a clause paid to AI).
    const noSeat: SeatMeta = metaForSeat(world, "", {
      clubId: "", clubName: "", clubColors: ["#000000", "#ffffff"], leagueSlug: "", leagueName: "",
    });
    // The clubs with a human manager: the AI never acts on these (market, free agents, manager desk).
    const humanClubs = humanClubSet(daySeats);
    // Friends' league standings (multiplayer part 5a): each seat's open passage (`DaySeat.standing`) gains its
    // extras through the day; the rows closed today are written once, before the seats.
    const standingsActive = world.mode === "multi" && !!world.world;
    const standingRows: SeatSeasonRow[] = [];
    const standingExtra = (ds: DaySeat | undefined, item: StandingItem): void => {
      if (standingsActive && ds?.standing) ds.standing = withExtra(ds.standing, item);
    };
    // Seats whose offers with another seat change today: nudged by socket after the day is written (`runBufferedDay`).
    const seatOfferNudges: SeatNudges = new Set();


    // Board and fans of each seat's club (`.claude/rules/game/board-fans.md`): `DaySeat.board`, updated in memory
    // through the day and written with the seat patch at the end; messages deferred like the rest. Press conferences
    // (Etapa 42, `.claude/rules/game/press.md`): `DaySeat.press` keeps the club's titles and knockout exits of the day
    // and the expectation/derby of each of its matches (from the board), read by `pressDay` at the end of the day.

    // World news of the day (Etapa 42, `press.md` → "Notícias"): pushed as the day goes, written at the end. Never in
    // the start-kit pre-simulation (the kit is generic; its dates are before the career).
    const newsCollector = options.marketFrozen ? null : newNewsCollector();
    if (newsCollector) {
      newsCollector.startLeaders = await readLeaders(saveService, saveId, [
        ...new Set(daySeats.flatMap((ds) => [ds.meta.leagueSlug ?? "", ...(ds.meta.followedLeagues ?? [])])),
      ]);
    }


    // Transfer windows of the day (`.claude/rules/game/transfer-windows.md`), from today's seasons.
    const seatRefs = daySeats.map((ds) => seatWindowRef(ds.meta));
    const windows = await loadWindowContext(world, index, currentDate, seatRefs);
    // Player moves of the day, written to the day log (`StoredDayLog.transfers`) after the market.
    const dayMoves: DayTransfer[] = [];

    // Competition registration (`.claude/rules/game/registration.md`): the human club's lists move in the
    // morning (before the matches, so a signing made today by a route can play today with the deadline open);
    // every club's list is ensured at match time; the AI refreshes after the market. News deferred past `clearInbox`.
    const regCtx = await registrationDayCtx(saveService, saveId, world, index, seatRefs, currentDate, windows);
    let registrationViolations = 0;
    for (const ds of daySeats) {
      if (!ds.clubId || !ds.entry || options.marketFrozen) continue;
      const humanReg = await saveService.getSquadById(saveId, ds.clubId);
      if (humanReg) {
        const r = await humanRegistrationDay(regCtx, humanReg, ds.entry.leagueSlug);
        if (r.changed) await saveService.saveSquadById(saveId, r.squad);
        ds.registrationNotices.push(...r.notices);
      }
      // Morale (`.claude/rules/game/morale.md`): who could not play today (injured / suspended before
      // the matches) — those matches never count against his minutes.
      for (const p of humanReg?.players ?? []) if (isUnavailable(p, currentDate)) ds.moraleUnavailable.add(p.id);
    }

    // Cup ties run in the full engine only when a club of a seat's league is involved.
    const humanLeagueClubs = new Set(
      daySeats.flatMap((ds) => (ds.clubId ? index.inLeague(ds.meta.leagueSlug).map((t) => t.squadId) : [])),
    );
    // The seat of each human club; the live recordings not yet taken by a match (a leftover is the national game).
    const seatOf = seatByClub(daySeats);
    const pending = new Map(Object.entries(recordings));
    // A seat's ledger season: the year of its league, read once (prizes and the money block).
    const ledgerSeasonOf = async (ds: DaySeat): Promise<number> =>
      (ds.ledgerSeason ??= (await saveService.getLeagueMeta(saveId, ds.meta.leagueSlug))?.year ?? new Date(currentDate).getFullYear());
    // A seat rests on its own rest days (`seat.restDays`, seeded from its league's calendar, edited by the manager).
    const restToday = (ds: DaySeat) => (ds.meta.restDays ?? []).includes(currentDate);

    // ── Get today's fixtures across all leagues ──────────────────────────────
    const activeRoundsForDate = await saveService.getActiveRoundsForDate(saveId, currentDate);

    // Referees of today's matches (`.claude/rules/game/referees.md`): the appointments the match preview and the live
    // match already read; a save without referees plays without (neutral rigor).
    const refereesToday = await ensureAssignments(saveService, saveId, currentDate);
    const refereePool = Object.keys(refereesToday).length > 0 ? await saveService.getRefereePool(saveId) : null;
    const refereeById = new Map((refereePool?.referees ?? []).map((r) => [r.id, r]));
    const fixtureHasVar = varLookup(saveService, saveId);
    // The referee with his quality (errors) and the fixture's VAR (`.claude/rules/game/var.md`).
    const refereeOf = async (f: Fixture) => {
      const a = refereesToday[fixtureKey(f.competition, f.id)];
      const r = a ? refereeById.get(a.refereeId) : undefined;
      return r ? engineReferee(r, await fixtureHasVar(f)) : undefined;
    };

    // An AI club's morale against a human club: its league form before today's games (`aiFormMorale`).
    const formByLeague = new Map<string, Map<string, StandingRow["form"]>>();
    const aiMoraleOf = async (squadId: string): Promise<number> => {
      const league = (await saveService.getSquadIndex(saveId)).byId(squadId)?.leagueSlug;
      if (!league) return aiFormMorale(undefined);
      let forms = formByLeague.get(league);
      if (!forms) {
        forms = new Map(((await saveService.getLeagueStandings(saveId, league)) ?? []).map((r) => [r.squadId, r.form]));
        formByLeague.set(league, forms);
      }
      return aiFormMorale(forms.get(squadId));
    };

    // Group updates per league for round file writes
    const roundUpdates = new Map<string, Map<number, Fixture[]>>();

    for (const [leagueSlug, roundNumbers] of activeRoundsForDate.entries()) {
      // Load all relevant round files for this league
      const roundDataArray = await Promise.all(
        roundNumbers.map((r) => saveService.getRound(saveId, leagueSlug, r)),
      );

      for (let ri = 0; ri < roundNumbers.length; ri++) {
        const roundNum = roundNumbers[ri]!;
        const roundData = roundDataArray[ri];
        if (!roundData) continue;

        const todayFixtures = roundData.fixtures.filter((f) => f.date === currentDate && !f.played);

        const updatedFixtures = [...roundData.fixtures];

        for (const rawFixture of todayFixtures) {
          const homeEntry = index.byId(rawFixture.home);
          const awayEntry = index.byId(rawFixture.away);
          if (!homeEntry || !awayEntry) {
            // A skipped cup/continental tie never completes its stage — make the stall visible.
            if (isKnockoutComp(leagueSlug)) {
              logError(
                isContinentalSlug(leagueSlug) ? "continental" : "cups",
                `save ${saveId}: ${rawFixture.id} skipped — club missing from the world`,
                { home: rawFixture.home, away: rawFixture.away },
              );
            }
            continue;
          }

          // A club already updated earlier today (any competition) reads its chained, in-memory
          // squad instead of the stale on-disk snapshot — see the `squadWrites` comment above.
          // This should never happen (the calendar is built to avoid same-day double-booking),
          // so it's logged when it does rather than silently dropping one match's effects.
          for (const squadId of [rawFixture.home, rawFixture.away]) {
            if (squadWrites.has(squadId)) {
              logError(
                "calendar",
                `save ${saveId}: club ${squadId} has more than one fixture on ${currentDate} — ${rawFixture.id} (${leagueSlug}) plays after an earlier match today`,
                { squadId, fixtureId: rawFixture.id, competition: leagueSlug },
              );
            }
          }

          const [homeSquadRaw, awaySquadRaw] = await Promise.all([
            squadWrites.has(rawFixture.home)
              ? Promise.resolve<Squad | null>(squadWrites.get(rawFixture.home)!.squad)
              : saveService.getSquadById(saveId, rawFixture.home),
            squadWrites.has(rawFixture.away)
              ? Promise.resolve<Squad | null>(squadWrites.get(rawFixture.away)!.squad)
              : saveService.getSquadById(saveId, rawFixture.away),
          ]);
          if (!homeSquadRaw || !awaySquadRaw) continue;
          // Registered players of each side for this competition (first list built on need).
          const regHome = await matchRegistration(regCtx, homeSquadRaw, homeEntry.leagueSlug, leagueSlug);
          const regAway = await matchRegistration(regCtx, awaySquadRaw, awayEntry.leagueSlug, leagueSlug);
          const homeSquad = regHome?.squad ?? homeSquadRaw;
          const awaySquad = regAway?.squad ?? awaySquadRaw;
          if (!options.marketFrozen) {
            seatOf.get(rawFixture.home)?.registrationNotices.push(...(regHome?.notices ?? []));
            seatOf.get(rawFixture.away)?.registrationNotices.push(...(regAway?.notices ?? []));
          }
          const registration = { ...(regHome ? { home: regHome.reg } : {}), ...(regAway ? { away: regAway.reg } : {}) };
          // Ids of a side that are not registered for this competition (always 0 — checked by the season smoke).
          const unregisteredOf = (ids: Iterable<string>) => {
            let n = 0;
            for (const id of ids) {
              if (!id) continue;
              const reg = homeSquad.players.some((p) => p.id === id) ? regHome?.reg : awaySquad.players.some((p) => p.id === id) ? regAway?.reg : undefined;
              if (reg && !reg.ids.has(id)) n++;
            }
            return n;
          };

          // Continental second leg with no aggregate yet: the first-leg round's advanceContinental
          // step normally writes it the day the first leg completes, but a failure there (or a
          // stale round file) would leave the engine to decide extra time/penalties off the wrong
          // total. Compute it from the played first leg before kicking this leg off.
          let fixture = rawFixture;
          if (isContinentalSlug(leagueSlug) && fixture.leg === 2 && fixture.aggregate === undefined) {
            const leg1Round = await saveService.getRound(saveId, leagueSlug, fixture.round - 1);
            const leg1Fixture = leg1Round?.fixtures.find((f) => f.tieId === fixture.tieId && f.played);
            if (leg1Fixture) {
              try {
                fixture = withAggregate(fixture, leg1Fixture);
                const patchIdx = updatedFixtures.findIndex((f) => f.id === fixture.id);
                if (patchIdx !== -1) updatedFixtures[patchIdx] = fixture;
                logError(
                  "continental",
                  `save ${saveId}: ${fixture.id} (tie ${fixture.tieId}) had no aggregate before kickoff — computed it from the first leg (${leg1Fixture.id})`,
                );
              } catch (err) {
                // Corrupt data (e.g. a mismatched tieId pairing) must not brick every future
                // advance — play the leg as-is (no aggregate) rather than throwing the whole day.
                logError(
                  "continental",
                  `save ${saveId}: ${fixture.id} (tie ${fixture.tieId ?? "?"}) failed to compute its aggregate from leg 1 (${leg1Fixture.id}) — playing without it`,
                  err,
                );
              }
            } else {
              logError(
                "continental",
                `save ${saveId}: ${fixture.id} (tie ${fixture.tieId ?? "?"}) is a second leg with no played first leg to compute the aggregate from`,
              );
            }
          }

          const homeSeat = seatOf.get(fixture.home);
          const awaySeat = seatOf.get(fixture.away);
          if (homeSeat) {
            const gateKind: GateKind = isContinentalSlug(leagueSlug) ? "continental" : isCupSlug(leagueSlug) ? "cup" : "league";
            if (homeSeat.importanceStandings === undefined) {
              homeSeat.importanceStandings = homeSeat.meta.leagueSlug
                ? await saveService.getLeagueStandings(saveId, homeSeat.meta.leagueSlug)
                : null;
            }
            const importance = await homeMatchImportance(saveService, saveId, fixture, fixture.home, {
              leagueSlug: homeSeat.meta.leagueSlug ?? "",
              standings: homeSeat.importanceStandings,
              squadOf: async (id) => (id === homeSquad.id ? homeSquad : id === awaySquad.id ? awaySquad : saveService.getSquadById(saveId, id)),
            });
            homeSeat.homeFixtures.push({
              competition: leagueSlug, kind: gateKind, neutral: fixture.neutral === true, opponentId: fixture.away,
              ...(importance.mult !== 1 ? { importance: importance.mult } : {}),
            });
          }
          // A seat's live recording of this fixture. Between two seats only the server's (part 7): the home seat's
          // recording, with both seats' `live` decision for this game; any other is refused.
          const recSeat = [homeSeat, awaySeat].find((ds) => ds && pending.get(ds.seatId)?.fixtureId === fixture.id);
          const recording = recSeat ? pending.get(recSeat.seatId)! : null;
          const liveFor = (ds: DaySeat) => {
            const d = ds.meta.matchDecision;
            return d?.mode === "live" && d.date === currentDate && d.fixtureId === fixture.id;
          };
          if (recording && homeSeat && awaySeat && !(recSeat === homeSeat && liveFor(homeSeat) && liveFor(awaySeat))) {
            return { ok: false, status: 400, error: "a match between two seats has no live recording" };
          }

          if (recording && recSeat) {
            if (!knockoutRecordingDecided(fixture, recording)) {
              return { ok: false, status: 400, error: "knockout recording without a winner" };
            }
            const recorded = new Set([...Object.keys(recording.playerStats), ...Object.keys(recording.playerEnergy ?? {})]);
            if (unregisteredOf(recorded) > 0) {
              return { ok: false, status: 400, error: "unregistered player in recording" };
            }
            const r = buildMatchEventFromRecording(fixture, homeSquad, awaySquad, recording);
            r.event = withWeatherLog(withRefereeLog(r.event, await refereeOf(fixture)), matchWeatherOf(fixture, homeSquad));
            dayEvents.push(r.event);
            const complained = recording.complaintMorale === true;
            const backed = (sq: Squad) => (complained && sq.id === recSeat.clubId ? afterManagerComplaint(sq) : sq);
            squadWrites.set(rawFixture.home, { league: homeEntry.leagueSlug, club: homeEntry.stem, squad: backed(r.updatedHome) });
            squadWrites.set(rawFixture.away, { league: awayEntry.leagueSlug, club: awayEntry.stem, squad: backed(r.updatedAway) });
            recSeat.managerCards = sanitizeManagerCards(recording.managerCards);
            teamsPlayingToday.add(fixture.home);
            teamsPlayingToday.add(fixture.away);
            for (const inj of r.injuriesApplied) {
              injuryInboxEvents.push({
                kind: "injured",
                squadId: inj.team === "home" ? fixture.home : fixture.away,
                playerId: inj.playerId,
                playerName: inj.playerName,
                severity: inj.severity,
                returnDate: inj.returnDate,
              });
            }
            for (const sus of r.suspensionsApplied) {
              injuryInboxEvents.push({ kind: "suspended", ...sus });
            }
            for (const playerId of r.healedPlayerIds) {
              const onHome = homeSquad.players.some((p) => p.id === playerId);
              const squadId = onHome ? fixture.home : fixture.away;
              const roster = onHome ? homeSquad : awaySquad;
              const playerName = roster.players.find((p) => p.id === playerId)?.name ?? playerId;
              injuryInboxEvents.push({ kind: "returned", squadId, playerId, playerName });
            }

            const idx = updatedFixtures.findIndex((f) => f.id === fixture.id);
            if (idx !== -1) updatedFixtures[idx] = {
              ...updatedFixtures[idx]!, played: true, result: r.event.score,
              ...(r.event.decider ? { decider: r.event.decider } : {}),
            };
            pending.delete(recSeat.seatId);
          } else {
            const humanSide = (ds: DaySeat): HumanMatchSide => ({
              tactics: ds.tactics, rotationOverride: ds.meta.rotationOverride, matchMarking: ds.meta.matchMarking,
            });
            const sim = computeSeatedMatchLineups(fixture, homeSquad, awaySquad, {
              ...(homeSeat ? { home: humanSide(homeSeat) } : {}),
              ...(awaySeat ? { away: humanSide(awaySeat) } : {}),
            }, registration);
            const mode = homeSeat || awaySeat
              ? "full"
              : isKnockoutComp(leagueSlug)
                ? (humanLeagueClubs.has(fixture.home) || humanLeagueClubs.has(fixture.away) ? "full" : "fast")
                : resolveSimModeForSeats(leagueSlug, daySeats.map((ds) => ds.meta));
            // Pitch of the home stadium (`src/Domain/facilities/pitch.ts`): human club, its stadium pitch; AI, tier and season.
            const pitch = matchPitch(homeSquad, fixture, activeLeagues.find((l) => l.leagueSlug === homeEntry.leagueSlug), currentDate);
            const pitchCondition = pitch.condition;
            const turf = pitch.turf;
            const referee = await refereeOf(fixture);
            // Weather of the match (`.claude/rules/game/weather.md`): a closed roof plays it neutral.
            const weather = matchWeatherOf(fixture, homeSquad);
            // The AI side against one human club plays at its form's morale (`aiFormMorale`, 4.39).
            const aiMorale = homeSeat && !awaySeat
              ? { away: await aiMoraleOf(fixture.away) }
              : awaySeat && !homeSeat ? { home: await aiMoraleOf(fixture.home) } : undefined;
            const r = mode === "full"
              ? buildMatchEvent(fixture, homeSquad, awaySquad, { ...sim, pitchCondition, turf, referee, weather, ...(aiMorale ? { aiMorale } : {}) })
              : buildQuickMatchEvent(fixture, homeSquad, awaySquad, { ...sim, pitchCondition, turf, referee, weather });
            registrationViolations += unregisteredOf(new Set([...sim.homeLineup, ...sim.awayLineup, ...Object.keys(r.event.playerStats ?? {})]));
            dayEvents.push(r.event);
            // AI sides keep their season formation (`src/Domain/formation/aiFormation.ts`).
            const homeOut = sim.aiFormations.home ? { ...r.updatedHome, aiFormation: sim.aiFormations.home } : r.updatedHome;
            const awayOut = sim.aiFormations.away ? { ...r.updatedAway, aiFormation: sim.aiFormations.away } : r.updatedAway;
            squadWrites.set(rawFixture.home, { league: homeEntry.leagueSlug, club: homeEntry.stem, squad: homeOut });
            squadWrites.set(rawFixture.away, { league: awayEntry.leagueSlug, club: awayEntry.stem, squad: awayOut });
            teamsPlayingToday.add(fixture.home);
            teamsPlayingToday.add(fixture.away);
            for (const inj of r.injuriesApplied) {
              injuryInboxEvents.push({
                kind: "injured",
                squadId: inj.team === "home" ? fixture.home : fixture.away,
                playerId: inj.playerId,
                playerName: inj.playerName,
                severity: inj.severity,
                returnDate: inj.returnDate,
              });
            }
            for (const sus of r.suspensionsApplied) {
              injuryInboxEvents.push({ kind: "suspended", ...sus });
            }
            for (const playerId of r.healedPlayerIds) {
              const onHome = homeSquad.players.some((p) => p.id === playerId);
              const squadId = onHome ? fixture.home : fixture.away;
              const roster = onHome ? homeSquad : awaySquad;
              const playerName = roster.players.find((p) => p.id === playerId)?.name ?? playerId;
              injuryInboxEvents.push({ kind: "returned", squadId, playerId, playerName });
            }

            const idx = updatedFixtures.findIndex((f) => f.id === fixture.id);
            if (idx !== -1) updatedFixtures[idx] = {
              ...updatedFixtures[idx]!, played: true, result: r.event.score,
              ...(r.event.decider ? { decider: r.event.decider } : {}),
            };
          }
        }

        // Track round update
        if (!roundUpdates.has(leagueSlug)) roundUpdates.set(leagueSlug, new Map());
        roundUpdates.get(leagueSlug)!.set(roundNum, updatedFixtures);
      }
    }

    // A recording no club fixture took may be the human manager's national game (Etapa 41b): the national day
    // below takes it, or the day fails.
    const nationalRecordings = Object.fromEntries(pending);

    // ── Goal of the season candidates (`.claude/rules/game/awards.md`) ───────────
    // Full-engine league matches only (quickSim events carry no `goals`); idempotent by key.
    await recordSeasonGoals(saveService, saveId, currentDate, dayEvents.filter((e): e is MatchEvent => e.kind === "match"), activeLeagues);

    // ── Youth competitions (under-21 / under-19, `.claude/rules/game/youth-competitions.md`) ──
    // After the first-team matches (the day knows `teamsPlayingToday`) and before training: who
    // played a youth game neither trains nor rests; the games stay out of `dayEvents`.
    const youthDay = await playYouthDay({
      service: saveService, saveId, date: currentDate, index,
      humans: new Map(daySeats.flatMap((ds) => (ds.clubId
        ? [[ds.clubId, { seatId: ds.seatId, callUps: ds.meta.youthCallUps, tactics: ds.tactics }] as const]
        : []))),
      teamsPlayingToday,
      squadOf: async (id) => squadWrites.get(id)?.squad ?? (await saveService.getSquadById(saveId, id)),
    });
    for (const [id, squad] of youthDay.squads) {
      const e = index.byId(id);
      if (e) squadWrites.set(id, { league: e.leagueSlug, club: e.stem, squad });
    }
    for (const inj of youthDay.injuries) injuryInboxEvents.push({ kind: "injured", ...inj });
    for (const h of youthDay.healed) injuryInboxEvents.push({ kind: "returned", ...h });

    // ── National teams (`.claude/rules/game/national-teams.md`): returns, draws, call-ups, today's games ──
    // After the club games (no club plays in a FIFA window) and before training: who is with his national
    // team today neither trains nor rests at the club.
    const managersToday = options.marketFrozen ? [] : await saveService.getManagers(saveId);
    const nationalDay = await playNationalDay({
      service: saveService, saveId, date: currentDate, index,
      humanClubs: new Map(daySeats.filter((ds) => ds.clubId).map((ds) => [ds.clubId!, ds.seatId] as const)),
      squadOf: async (id) => squadWrites.get(id)?.squad ?? (await saveService.getSquadById(saveId, id)),
      ...(options.marketFrozen ? {} : {
        humans: Object.fromEntries(daySeats.map((ds) => [ds.seatId, {
          reputation: managerReputation(managersToday, ds.meta.unemployed ? ds.meta.unemployed.board : (ds.meta.board?.board ?? 60), parseInt(currentDate.slice(0, 4), 10), ds.seatId),
          nationality: managerNation(ds.meta.manager?.nationalityIso),
        }])),
      }),
      playedMatches: nationalRecordings,
    });
    for (const sid of Object.keys(nationalRecordings)) {
      if (!nationalDay.bySeat[sid]?.consumedRecording) {
        return {
          ok: false,
          status: 400,
          error: "playedMatch fixture does not match today's calendar or was already consumed",
        };
      }
    }
    // The seat manager's national team: objective met (+2), a tournament title (+6 more).
    for (const ds of daySeats) {
      for (const news of nationalDay.bySeat[ds.seatId]?.coachNews ?? []) {
        for (const item of nationalNewsItems(news)) standingExtra(ds, item);
      }
    }
    for (const [id, squad] of nationalDay.squads) {
      const e = index.byId(id);
      if (e) squadWrites.set(id, { league: e.leagueSlug, club: e.stem, squad });
    }
    for (const inj of nationalDay.injuries) injuryInboxEvents.push({ kind: "injured", ...inj });
    const clubDayOff = new Set([...youthDay.participants, ...nationalDay.participants]);

    // ── Aggregate development messages for each seat's club ───────────────────
    // One message per player per day, merging stat changes across multiple matches.
    for (const ds of daySeats) {
      if (!ds.clubId) continue;
      const aggregated = new Map<
        string,
        { playerName: string; changes: Map<string, { from: number; to: number }> }
      >();

      for (const event of dayEvents) {
        if (event.kind !== "match") continue;
        const userSide =
          event.home === ds.clubId ? "home" :
          event.away === ds.clubId ? "away" : null;
        if (!userSide) continue;

        for (const dc of event.developmentChanges) {
          if (event.playerTeams[dc.playerId] !== userSide) continue;

          let entry = aggregated.get(dc.playerId);
          if (!entry) {
            entry = { playerName: dc.playerName, changes: new Map() };
            aggregated.set(dc.playerId, entry);
          }

          for (const ch of dc.changes) {
            const existing = entry.changes.get(ch.stat);
            if (existing) {
              existing.to = ch.newValue;
            } else {
              entry.changes.set(ch.stat, { from: roundAttr(ch.newValue - ch.delta), to: ch.newValue });
            }
          }
        }
      }

      for (const [playerId, { playerName, changes }] of aggregated) {
        const net = Array.from(changes.entries())
          .map(([attribute, v]) => ({ attribute, from: v.from, to: v.to }))
          .filter((c) => c.from !== c.to);
        if (net.length === 0) continue;

        await emitInboxMessage(
          saveId,
          buildDevelopmentMessage({
            date: currentDate,
            playerId,
            playerName,
            changes: net,
          }),
          saveService,
          ds.seatId,
        );
      }
    }

    // ── Training / rest for non-playing teams in ALL active leagues ──────────
    // A seat's club rests on the seat's rest days; an AI club the day before and after each of its own official
    // matches (`aiRestingClubs`, `.claude/rules/game/multiplayer.md`).
    const aiResting = aiRestingClubs({
      playedYesterday: await saveService.getClubsWithFixtureOn(saveId, addDays(currentDate, -1)),
      playsTomorrow: await saveService.getClubsWithFixtureOn(saveId, nextDate),
      playsToday: teamsPlayingToday,
    });
    const isRestDay = (squadId: string): boolean => {
      const ds = seatOf.get(squadId);
      return ds ? restToday(ds) : aiResting.has(squadId);
    };

    for (const leagueState of activeLeagues) {
      const league = leagueState.leagueSlug;
      for (const row of index.inLeague(league)) {
        if (teamsPlayingToday.has(row.squadId)) continue;
        const club = index.byId(row.squadId)!.stem;
        // A youth game today already changed this squad: build on it, never on the disk copy.
        const squad = squadWrites.get(row.squadId)?.squad ?? await saveService.getSquad(saveId, league, club);
        if (!squad) continue;

        if (isRestDay(row.squadId)) {
          const { event, updatedSquad, healedPlayerIds } = buildRestEvent(row.squadId, squad, currentDate, { skipPlayerIds: clubDayOff });
          dayEvents.push(event);
          squadWrites.set(row.squadId, { league, club, squad: updatedSquad });
          for (const playerId of healedPlayerIds) {
            const playerName = squad.players.find((p) => p.id === playerId)?.name ?? playerId;
            injuryInboxEvents.push({ kind: "returned", squadId: row.squadId, playerId, playerName });
          }
        } else {
          // No explicit focus: a seat's club drills the style it plays (its tactics.json); an AI club the default.
          const ds = seatOf.get(row.squadId);
          const policy = resolveTrainingPolicy(
            ds ? { ...ds.meta, style_focus: ds.meta.style_focus ?? ds.tactics?.tactical_style } : { clubId: "" },
            club, row.squadId,
          );
          const { event, updatedSquad, healedPlayerIds, newInjuries } =
            buildTrainingEvent(row.squadId, squad, policy, currentDate, Math.random, { skipPlayerIds: clubDayOff });
          dayEvents.push(event);
          squadWrites.set(row.squadId, { league, club, squad: updatedSquad });
          for (const playerId of healedPlayerIds) {
            const playerName = squad.players.find((p) => p.id === playerId)?.name ?? playerId;
            injuryInboxEvents.push({ kind: "returned", squadId: row.squadId, playerId, playerName });
          }
          for (const inj of newInjuries) {
            injuryInboxEvents.push({ kind: "injured", squadId: row.squadId, ...inj });
          }
        }
      }
    }

    // ── Injury news for each seat's club (match + training + return-to-play) ───
    // Not emitted yet — `clearInbox` (season rollover, further below) would wipe it if it landed
    // now. Queued into `DaySeat.deferred.injury` and flushed after `clearInbox`, like the other deferred news:
    // contracts (90-day warning, released at the rollover), academy (intake, released at 19), facilities,
    // retirement, club records (`.claude/rules/game/club-history.md`), season awards (the seat's league at its
    // rollover, the world ceremony in January, `.claude/rules/game/awards.md`).
    // Negotiation news (`.claude/rules/game/negotiation.md`): bids, loans back, sell-on money, per seat
    // (`DaySeat.deferred.negotiation`), emitted after any `clearInbox` this day.
    // New AI transfer bids for a seat's players today (`DaySeat.moraleBids`): a player who wants the move asks
    // to talk (`.claude/rules/game/morale.md`).
    // World levels (retirement odds) read every squad of the world: computed once per day, lazily,
    // not once per rolling unit. Units are disjoint, so a day-start-ish snapshot is fine.
    let worldLevelsMemo: ReturnType<typeof buildWorldLevels> | undefined;
    // With the director in charge of contracts there is no 90-day warning (he decides them himself).
    for (const ds of daySeats) {
      if (!ds.clubId || directorHandlesContracts(ds.meta.responsibilities)) continue;
      const leagueEnd = activeLeagues.find((l) => l.leagueSlug === ds.meta.leagueSlug)?.end;
      if (leagueEnd && currentDate === addDays(leagueEnd, -CONTRACT_CONFIG.WARNING_DAYS_BEFORE)) {
        const humanSquad = await saveService.getSquadById(saveId, ds.clubId);
        const ending = (humanSquad?.players ?? []).filter((p) => p.contract && p.contract.until <= leagueEnd);
        if (ending.length > 0) {
          ds.deferred.contract.push({
            date: currentDate, kind: "expiring", players: ending.map((p) => ({ id: p.id, name: p.name })),
          });
        }
      }
    }
    for (const ds of daySeats) {
      if (!ds.clubId) continue;
      for (const inj of injuryInboxEvents) {
        if (inj.squadId !== ds.clubId) continue;
        ds.deferred.injury.push(
          inj.kind === "injured"
            ? {
                date: currentDate, kind: "injured", playerId: inj.playerId, playerName: inj.playerName,
                severity: inj.severity, returnDate: inj.returnDate,
              }
            : inj.kind === "suspended"
              ? { date: currentDate, kind: "suspended", playerId: inj.playerId, playerName: inj.playerName, matches: inj.matches }
              : { date: currentDate, kind: "returned", playerId: inj.playerId, playerName: inj.playerName },
        );
      }
    }

    // ── Write all squad updates in parallel ──────────────────────────────────
    await Promise.all(
      [...squadWrites.values()].map((sw) => saveService.saveSquad(saveId, sw.league, sw.club, sw.squad)),
    );

    // ── Write updated round files + recompute standings per league ────────────
    for (const [leagueSlug, rounds] of roundUpdates.entries()) {
      const leagueTeams = index.inLeague(leagueSlug);

      for (const [roundNum, fixtures] of rounds.entries()) {
        await saveService.writeRound(saveId, leagueSlug, roundNum, { leagueSlug, round: roundNum, fixtures });
      }

      // Cups and continental competitions have no table — group standings (continental) and the
      // draw/champion progression (both) are handled below.
      if (isKnockoutComp(leagueSlug)) continue;

      // Recompute standings from all rounds for accuracy
      const allFixtures = await saveService.getAllFixturesForLeague(saveId, leagueSlug);
      const updatedStandings = computeStandings(leagueTeams, allFixtures, leagueSlug);
      await saveService.writeLeagueStandings(saveId, leagueSlug, updatedStandings);
    }

    // ── National cups: draw the next stage / crown the champion ──────────────
    const cupPlayed = new Map<string, number[]>();
    for (const [slug, rounds] of roundUpdates) if (isCupSlug(slug)) cupPlayed.set(slug, [...rounds.keys()]);
    const cupChanges = await advanceCupStages(saveService, saveId, cupPlayed);

    // ── Continental competitions: group table completion → r16 draw, leg1 → aggregate, leg2 →
    // next stage draw / champion (see `advanceContinental`) ───────────────────
    const continentalPlayed = new Map<string, number[]>();
    for (const [slug, rounds] of roundUpdates) if (isContinentalSlug(slug)) continentalPlayed.set(slug, [...rounds.keys()]);
    const continentalChanges = await advanceContinentalStages(saveService, saveId, continentalPlayed);

    // ── League games that clash with the dates just drawn (same day or the day before/after for a club) move
    // to a free midweek day (`.claude/rules/game/rescheduling.md`). Scope: the leagues of the drawn clubs. ──
    const rescheduleMoves: FixtureMove[] = [];
    {
      const scope = await drawnLeaguesOf({ service: saveService, saveId, index, cupChanges, continentalChanges });
      if (scope.size > 0) {
        const r = await rescheduleFixtureConflicts({
          service: saveService, saveId, minDate: addOneDay(currentDate), catalog: await getLeagueData(), scope,
        });
        rescheduleMoves.push(...r.moves);
      }
    }

    // ── Board and fans: today's official matches of each seat's club (standings already written) ──
    for (const ds of daySeats) {
      if (!ds.board || !ds.clubId) continue;
      const boardOut = await boardAfterMatches({
        board: ds.board, service: saveService, saveId, playerSquadId: ds.clubId,
        playerLeagueSlug: ds.meta.leagueSlug,
        playerLeagueState: activeLeagues.find((l) => l.leagueSlug === ds.meta.leagueSlug),
        events: dayEvents.filter((e): e is MatchEvent => e.kind === "match"),
        fixtureOf: (competition, round, fixtureId) =>
          roundUpdates.get(competition)?.get(round)?.find((f) => f.id === fixtureId),
        squadOf: async (id) => squadWrites.get(id)?.squad ?? (await saveService.getSquadById(saveId, id)),
      });
      ds.board = boardOut.board;
      ds.press.matchContext = boardOut.context;
    }

    // ── The manager's ban (`.claude/rules/game/var.md` §4): served by an official match, a red starts one ──
    for (const ds of daySeats) {
      if (!ds.clubId) continue;
      const step = nextManagerBan(ds.meta.managerBan, teamsPlayingToday.has(ds.clubId), ds.managerCards, currentDate);
      ds.managerBan = step.ban;
      ds.managerBanGiven = step.given;
      if (ds.board) for (const c of ds.managerCards) ds.board = applyManagerCard(ds.board, c.card);
    }

    // ── Prize money: cup + continental (league prize is at rollover, further down) ───────────
    // Player's club → ledger `prize` entry; AI club → `aiTransferBudget`, capped
    // (`aiBudgetWithPrize` — see `.claude/rules/AI-clubs/finance.md`, design spec §3 "Premiação").
    // Read-then-write per club, sequential (never Promise.all): a club can receive more than one
    // prize the same day (e.g. continental participation + a group result), and this always runs
    // AFTER the day's match writes are flushed (`squadWrites`, above) — never races or clobbers
    // them, and any market-tick write later this same day (below) re-reads the squad fresh.
    const awardClubPrize = async (
      clubId: string, amount: number, label: string, ref?: LedgerEntry["ref"],
    ): Promise<number> => {
      if (amount <= 0) return 0;
      const entry = index.byId(clubId);
      if (!entry) return 0;
      const ds = seatOf.get(clubId);
      if (ds) {
        await recordMoney(
          saveService, saveId, await ledgerSeasonOf(ds),
          { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
          { date: currentDate, kind: "prize", amount, label, ...(ref ? { ref } : {}) },
          ds.seatId,
        );
        return amount;
      }
      const squad = await saveService.getSquadById(saveId, clubId);
      if (!squad) return 0;
      const tier = financialTierOf(squad);
      const seasonalGrant = seasonalTransferBudgetFor(tier, popularityFromFollowers(squad.finances?.followers ?? 0));
      const current = aiTransferBudgetOf(squad);
      const next = aiBudgetWithPrize(current, amount, seasonalGrant);
      if (next !== current) await saveService.saveSquadById(saveId, { ...squad, aiTransferBudget: next });
      return amount;
    };

    // Cup/continental titles won today wait in meta.pendingTitles until the club's next country
    // rollover writes its history row (`.claude/rules/game/history.md`).
    let pendingTitles: Record<string, string[]> = world.pendingTitles ?? {};
    let pendingTitlesChanged = false;
    // Manager ranking (`.claude/rules/game/managers.md`): titles and seasons of the day, written once at the end.
    const managerTracker = createManagerTracker({
      service: saveService, saveId, getIndex: () => index, catalog: getLeagueData, pyramids: getPyramids,
      weights: world.managerWeights, date: currentDate,
    });
    // AI managers (`.claude/rules/game/managers.md` → "Técnicos da IA"): Monday review, rollover
    // sackings, vacancies and hirings. Not in the start-kit pre-simulation (no career yet).
    const aiDesk = options.marketFrozen ? null : createAiManagerDesk({
      service: saveService, saveId, date: currentDate, tracker: managerTracker, getIndex: () => index,
      catalog: getLeagueData, countries: getCountries, vacancies: world.managerVacancies,
      humanClubIds: humanClubs,
    });
    const recordTitle = (squadId: string, title: string) => {
      newsCollector?.champions.push({ competition: title.slice(title.indexOf(":") + 1), squadId });
      const next = addPendingTitle(pendingTitles, squadId, title);
      if (next !== pendingTitles) { pendingTitles = next; pendingTitlesChanged = true; }
    };

    // ── National cup prizes: every country, every tie decided today ──────────
    // `cupPrizeAwardedTo` feeds the player's own cup inbox messages below (champion / eliminated).
    const cupPrizeAwardedTo = new Map<string, number>();
    if (cupPlayed.size > 0) {
      const catalogForCupPrizes = await getLeagueData();
      const countryOfForCupPrizes = countryByLeague(catalogForCupPrizes);
      const pyramidsForCupPrizes = await getPyramids();
      const cupBaseCache = new Map<string, number>();
      const cupBaseFor = async (country: string): Promise<number> => {
        const cached = cupBaseCache.get(country);
        if (cached !== undefined) return cached;
        const v = await cupPrizeBase(saveService, saveId, country, index, countryOfForCupPrizes, pyramidsForCupPrizes);
        cupBaseCache.set(country, v);
        return v;
      };
      const cupMetaCache = new Map<string, LeagueSeasonMeta | null>();
      for (const event of dayEvents) {
        if (event.kind !== "match" || !isCupSlug(event.competition)) continue;
        const cSlug = event.competition;
        let cupMeta = cupMetaCache.get(cSlug);
        if (cupMeta === undefined) {
          cupMeta = await saveService.getLeagueMeta(saveId, cSlug);
          cupMetaCache.set(cSlug, cupMeta);
        }
        if (!cupMeta?.cup) continue;
        const fixture = roundUpdates.get(cSlug)?.get(event.round)?.find((f) => f.id === event.fixtureId);
        if (!fixture) continue;
        const winnerId = fixtureWinner(fixture);
        if (winnerId === null) continue;
        const loserId = winnerId === fixture.home ? fixture.away : fixture.home;
        const stage = cupMeta.cup.stages.find((s) => s.round === event.round)?.name;
        if (!stage) continue;
        const label = competitionName(cSlug, catalogForCupPrizes as unknown as LeagueData[], "en");
        const base = await cupBaseFor(cupMeta.cup.country);

        const winnerSeat = seatOf.get(winnerId);
        const loserSeat = seatOf.get(loserId);
        if (winnerSeat && stage === "final") winnerSeat.press.titles.push(`cup:${cSlug}`);
        if (loserSeat) loserSeat.press.eliminated.push(cSlug);
        if (winnerSeat?.board) {
          winnerSeat.board = applyCompetitionEvent(
            winnerSeat.board, stage === "final" ? { kind: "title", title: `cup:${cSlug}` } : { kind: "stage" },
          );
        }
        if (loserSeat?.board && !["qf", "sf", "final"].includes(stage)) {
          loserSeat.board = applyCompetitionEvent(loserSeat.board, { kind: "early_exit" });
        }
        const cupStanding = cupTieItems(stage, cSlug);
        if (cupStanding) {
          standingExtra(winnerSeat, cupStanding.winner);
          standingExtra(loserSeat, cupStanding.loser);
        }

        const winnerPrize = cupStagePrize(base, stage);
        const paidToWinner = await awardClubPrize(winnerId, winnerPrize, `${label} · ${stage}`, { competition: cSlug, stage });
        if (paidToWinner > 0) cupPrizeAwardedTo.set(winnerId, (cupPrizeAwardedTo.get(winnerId) ?? 0) + paidToWinner);

        if (stage === "final") {
          recordTitle(winnerId, `cup:${cSlug}`);
          await managerTracker.credit({
            season: seasonLabel(cupMeta.year, cupMeta.start, cupMeta.end), kind: "cup", competition: cSlug,
            squadId: winnerId,
            points: cupPoints(await managerTracker.weightOf(cupMeta.cup.country, seasonLabel(cupMeta.year, cupMeta.start, cupMeta.end))),
          });
          const loserPrize = cupRunnerUpPrize(base);
          const paidToLoser = await awardClubPrize(loserId, loserPrize, `${label} · runner-up`, { competition: cSlug, stage: "runner_up" });
          if (paidToLoser > 0) cupPrizeAwardedTo.set(loserId, (cupPrizeAwardedTo.get(loserId) ?? 0) + paidToLoser);
        }
      }
    }

    // ── Continental prizes: every competition, everything that happened today ─────────────────
    // `continentalPrizeAwardedTo` covers participation, group win/draw, stage-reached and the
    // title — used for the "champion" inbox message below. It is DELIBERATELY NOT used for
    // "eliminated" — continental has no runner-up/elimination payout (unlike cups), and a
    // group-stage elimination lands on the SAME day as that club's round-6 win/draw prize, which
    // would otherwise look (wrongly) like a payout for being knocked out.
    // `continentalR16PrizeAwardedTo` is kept SEPARATE for the same reason: reaching r16 (an
    // "advanced" event) and a group-stage round-6 result (win/draw) can land on the SAME day —
    // conflating them would inflate the "classificação às oitavas" inbox amount.
    const continentalPrizeAwardedTo = new Map<string, number>();
    const continentalR16PrizeAwardedTo = new Map<string, number>();
    if (continentalPlayed.size > 0) {
      const catalogForContinentalPrizes = await getLeagueData();
      const add = (map: Map<string, number>, clubId: string, amount: number) => {
        if (amount > 0) map.set(clubId, (map.get(clubId) ?? 0) + amount);
      };

      for (const [cSlug, rounds] of continentalPlayed) {
        if (!isContinentalSlug(cSlug)) continue;
        const contMeta = await saveService.getLeagueMeta(saveId, cSlug);
        const cont = contMeta?.continental;
        if (!cont) continue;
        const compSlug = cSlug as ContinentalSlug;
        const label = competitionName(cSlug, catalogForContinentalPrizes as unknown as LeagueData[], "en");
        const groupStage = cont.stages.find((s) => s.name === "group")!;

        // Participation: every one of the 32 clubs, the day round 1 of the group stage is played.
        if (rounds.includes(groupStage.rounds[0]!)) {
          const amount = continentalPrize(compSlug, "participation");
          for (const clubId of cont.groups.flatMap((g) => g.clubs)) {
            const paid = await awardClubPrize(clubId, amount, `${label} · participation`, { competition: cSlug, stage: "participation" });
            add(continentalPrizeAwardedTo, clubId, paid);
          }
        }

        // Group win / draw: every group-stage match played today.
        for (const round of rounds) {
          if (!groupStage.rounds.includes(round)) continue;
          for (const f of roundUpdates.get(cSlug)?.get(round) ?? []) {
            if (!f.played || f.date !== currentDate || !f.result) continue;
            if (f.result.home === f.result.away) {
              const amount = continentalPrize(compSlug, "groupDraw");
              for (const clubId of [f.home, f.away]) {
                const paid = await awardClubPrize(clubId, amount, `${label} · group draw`, { competition: cSlug, stage: "group_draw" });
                add(continentalPrizeAwardedTo, clubId, paid);
              }
            } else {
              const winnerId = f.result.home > f.result.away ? f.home : f.away;
              const amount = continentalPrize(compSlug, "groupWin");
              const paid = await awardClubPrize(winnerId, amount, `${label} · group win`, { competition: cSlug, stage: "group_win" });
              add(continentalPrizeAwardedTo, winnerId, paid);
            }
          }
        }
      }

      // Stage advancement + title, from the events advanceContinentalStages already produced —
      // the mapping itself (which stage was REACHED, the champion's "title") is pure and unit
      // tested independently: `continentalStagePrizesFromEvents` (src/Domain/finance/prizes.ts).
      for (const { slug: cSlug, events } of continentalChanges) {
        if (!isContinentalSlug(cSlug)) continue;
        const compSlug = cSlug as ContinentalSlug;
        const label = competitionName(cSlug, catalogForContinentalPrizes as unknown as LeagueData[], "en");
        for (const ev of events) {
          const evSeat = "clubId" in ev ? seatOf.get(ev.clubId) : undefined;
          if (evSeat) {
            if (ev.kind === "champion") evSeat.press.titles.push(`continental:${cSlug}`);
            else if (ev.kind === "eliminated") evSeat.press.eliminated.push(cSlug);
          }
          if (evSeat?.board) {
            if (ev.kind === "champion") evSeat.board = applyCompetitionEvent(evSeat.board, { kind: "title", title: `continental:${cSlug}` });
            else if (ev.kind === "advanced") evSeat.board = applyCompetitionEvent(evSeat.board, { kind: "stage" });
            else if (ev.kind === "eliminated" && ev.stage === "group") evSeat.board = applyCompetitionEvent(evSeat.board, { kind: "early_exit" });
          }
          const contStanding = evSeat ? continentalEventItem(ev, cSlug) : null;
          if (contStanding) standingExtra(evSeat, contStanding);
          if (ev.kind !== "champion") continue;
          recordTitle(ev.clubId, `continental:${cSlug}`);
          const contMeta = await saveService.getLeagueMeta(saveId, cSlug);
          if (contMeta) {
            await managerTracker.credit({
              season: seasonLabel(contMeta.year, contMeta.start, contMeta.end), kind: "continental",
              competition: cSlug, squadId: ev.clubId, points: continentalPoints(cSlug),
            });
          }
        }
        for (const award of continentalStagePrizesFromEvents(compSlug, events)) {
          const paid = await awardClubPrize(
            award.clubId, award.amount, `${label} · ${award.reason}`, { competition: cSlug, stage: award.reason },
          );
          add(continentalPrizeAwardedTo, award.clubId, paid);
          if (award.reason === "r16") add(continentalR16PrizeAwardedTo, award.clubId, paid);
        }
      }
    }

    // ── National cup inbox news for each seat's club ───────────────────────────
    // These messages are emitted on the same day the tie/draw happens, before the "Transfers +
    // inbox are cleared" block further down (only runs when `seasonEnded`). They never collide
    // with that clear because no cup tie can fall on the rollover day itself: every cup stage's
    // date window ends at least FINAL_BEFORE_END_DAYS (7) days before the league window end
    // (src/Domain/cups/cupDates.ts), so the final is always played and read well before the
    // season rolls.
    for (const ds of daySeats) {
      if (!ds.clubId) continue;
      const myClub = ds.clubId;
      const myCup = await playerCupSlug(ds.meta.leagueSlug);
      const cupMeta = myCup ? await saveService.getLeagueMeta(saveId, myCup) : null;
      if (myCup && cupMeta?.cup) {
        const catalogForCups = await getLeagueData();
        const cupDisplayName = competitionName(myCup, catalogForCups as unknown as LeagueData[], "en");
        // Returns null when the round isn't in this cup's stage list (should not happen, but a
        // silent "final" fallback here would risk a false champion/eliminated message for the
        // wrong stage) — callers skip the event rather than guess.
        const stageNameOf = (round: number): string | null => cupMeta.cup!.stages.find((s) => s.round === round)?.name ?? null;

        // Elimination / champion: from today's played fixtures in the player's cup.
        for (const event of dayEvents) {
          if (event.kind !== "match" || event.competition !== myCup) continue;
          if (event.home !== myClub && event.away !== myClub) continue;
          const roundFixtures = roundUpdates.get(myCup)?.get(event.round) ?? [];
          const fixture = roundFixtures.find((f) => f.id === event.fixtureId);
          if (!fixture) continue;
          const winner = fixtureWinner(fixture);
          if (winner === null) continue;
          const stage = stageNameOf(event.round);
          if (stage === null) continue;

          if (winner === myClub) {
            if (stage === "final") {
              await emitInboxMessage(
                saveId,
                buildCupMessage({
                  date: currentDate, kind: "champion", cupSlug: myCup, cupName: cupDisplayName, stage,
                  prize: cupPrizeAwardedTo.get(myClub),
                }),
                saveService,
                ds.seatId,
              );
            }
          } else {
            const opponentId = event.home === myClub ? event.away : event.home;
            const opponentName = index.byId(opponentId)?.name ?? opponentId;
            await emitInboxMessage(
              saveId,
              buildCupMessage({
                date: currentDate, kind: "eliminated", cupSlug: myCup, cupName: cupDisplayName, stage, opponentName,
                prize: cupPrizeAwardedTo.get(myClub),
              }),
              saveService,
              ds.seatId,
            );
          }
        }

        // Draw: a new stage was drawn today and the player's club is in it.
        for (const change of cupChanges) {
          if (change.slug !== myCup || change.drawnRound === undefined) continue;
          const drawnStage = stageNameOf(change.drawnRound);
          if (drawnStage === null) continue;
          const round = await saveService.getRound(saveId, myCup, change.drawnRound);
          const fixture = round?.fixtures.find((f) => f.home === myClub || f.away === myClub);
          if (!fixture) continue;
          const opponentId = fixture.home === myClub ? fixture.away : fixture.home;
          const opponentName = index.byId(opponentId)?.name ?? opponentId;
          const venue = fixture.neutral ? "neutral" : fixture.home === myClub ? "home" : "away";
          await emitInboxMessage(
            saveId,
            buildCupMessage({
              date: currentDate, kind: "draw", cupSlug: myCup, cupName: cupDisplayName,
              stage: drawnStage, opponentName, tieDate: fixture.date, venue,
            }),
            saveService,
            ds.seatId,
          );
        }
      }
    }

    // ── Continental competition inbox news for the human club ─────────────────
    // Unlike the national-cup block above, this is NEVER emitted directly — it is only QUEUED
    // into each seat's `DaySeat.deferred.continental`, flushed after the "Transfers + inbox are cleared" block further
    // down. A national cup's window always ends >= FINAL_BEFORE_END_DAYS before its own country's
    // league end, so a cup tie can never land on that country's own rollover day. A continental
    // competition has no such guarantee against a DIFFERENT country's rollover: the European
    // calendar-year leagues (Belarus, Finland, Georgia, Iceland, Norway, Sweden — see
    // .claude/rules/game/continental.md) roll over on their own December schedule while the UCL/UEL
    // group stage runs to 12-15, with no coordination between the two — so a group-stage draw/
    // elimination for a club in one of those leagues CAN fall on that same country's rollover day,
    // right before `clearInbox` runs later in this same function call.
    for (const ds of continentalChanges.some(({ events }) => events.length > 0) ? daySeats : []) {
      if (!ds.clubId) continue;
      const myClub = ds.clubId;
      const catalogForContinental = await getLeagueData();
      for (const { slug, events } of continentalChanges) {
        if (events.length === 0) continue;
        // `advanceContinentalStages` types `slug` as `string`, but `continentalPlayed` (the map it
        // was called with) only ever holds slugs that passed `isContinentalSlug` above.
        const compSlug = slug as ContinentalSlug;
        const compDisplayName = competitionName(slug, catalogForContinental as unknown as LeagueData[], "en");
        const slugRounds = roundUpdates.get(slug);
        const opponentOfTodaysFixture = (): string | undefined => {
          if (!slugRounds) return undefined;
          for (const fixtures of slugRounds.values()) {
            const f = fixtures.find((x) => x.played && (x.home === myClub || x.away === myClub));
            if (f) return f.home === myClub ? f.away : f.home;
          }
          return undefined;
        };

        for (const event of events) {
          if (event.kind === "eliminated" && event.clubId === myClub) {
            const opponentId = event.stage === "group" ? undefined : opponentOfTodaysFixture();
            const opponentName = opponentId ? (index.byId(opponentId)?.name ?? opponentId) : undefined;
            // No prize field here — the design table has no continental runner-up/elimination
            // payout (unlike cups). A group-stage elimination happens the SAME day as that club's
            // round-6 result (win/draw), which DOES pay via `continentalPrizeAwardedTo` — but that
            // money is for the match result, not for being eliminated, so it must never be shown
            // on this message (review fix — see `.claude/rules/game/finances.md`).
            ds.deferred.continental.push({
              date: currentDate, kind: "eliminated", competition: compSlug, competitionName: compDisplayName,
              stage: event.stage, opponentName,
            });
          } else if (event.kind === "champion" && event.clubId === myClub) {
            ds.deferred.continental.push({
              date: currentDate, kind: "champion", competition: compSlug, competitionName: compDisplayName, stage: "final",
              prize: continentalPrizeAwardedTo.get(myClub),
            });
          } else if (event.kind === "drawn") {
            const myTie = event.ties.find((tie) => tie.home === myClub || tie.away === myClub);
            if (!myTie) continue;
            const opponentId = myTie.home === myClub ? myTie.away : myTie.home;
            const opponentName = index.byId(opponentId)?.name ?? opponentId;
            const venue: "home" | "away" | "neutral" =
              !myTie.tieId ? "neutral" : myTie.home === myClub ? "home" : "away";
            // Only the r16 draw (classificação às oitavas) carries a prize — see the separate
            // `continentalR16PrizeAwardedTo` map above (kept apart from group-stage match prizes
            // paid the same day).
            ds.deferred.continental.push({
              date: currentDate, kind: "draw", competition: compSlug, competitionName: compDisplayName,
              stage: event.stage, opponentName, firstLegDate: myTie.firstLegDate, venue,
              ...(event.stage === "r16" ? { prize: continentalR16PrizeAwardedTo.get(myClub) } : {}),
            });
          }
        }
      }
    }

    // ── Write day log ────────────────────────────────────────────────────────
    // Strip per-player effects from training/rest events before persisting — effects
    // are only needed for the immediate API response, not stored on disk.
    const storedEvents: StoredDayLog["events"] = dayEvents.map((e) => {
      if (e.kind === "training" || e.kind === "rest") {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { effects: _drop, ...stored } = e as (TrainingEvent | RestEvent);
        return stored;
      }
      return e as StoredDayLog["events"][number];
    });
    await recordRefereeDay(saveService, saveId, currentDate, dayEvents.filter((e): e is MatchEvent => e.kind === "match"));
    const dayLog = { saveId, date: currentDate, events: dayEvents };
    // Each seat's national game of the day (the result screen reads its own).
    const nationalMatchList = Object.entries(nationalDay.bySeat).flatMap(([sid, d]) => (d.humanMatch ? [[sid, d.humanMatch] as const] : []));
    const nationalMatches = nationalMatchList.length > 0 ? Object.fromEntries(nationalMatchList) : null;
    // Keep what the routes already logged today (transfers bought / sold / loaned before advancing):
    // their `transfer_ref` events and `transfers` moves.
    const routeLog = await saveService.getDayLog(saveId, currentDate);
    await saveService.writeDayLog(saveId, currentDate, {
      saveId, date: currentDate,
      events: [...(routeLog?.events ?? []).filter((e) => e.kind === "transfer_ref"), ...storedEvents],
      ...(routeLog?.transfers?.length ? { transfers: routeLog.transfers } : {}),
      ...(youthDay.logs.length > 0 ? { youthMatches: youthDay.logs } : {}),
      ...(nationalMatches ? { nationalMatches } : {}),
      registrationViolations,
    });

    // ── Transfer market tick ─────────────────────────────────────────────────
    // When the whole market is frozen (start-kit pre-simulation), dailyMarketTick would be a
    // guaranteed no-op — skip loading every squad + the market file for it (~25 MB/day).
    // The AI tick runs once for the world; what is a seat's (loans, bids, talks, rivals) runs per seat.
    if (!options.marketFrozen) {
      // Loans due back today go home first (each seat's market lists its loans), so the market below sees the
      // squads as they are.
      for (const ds of daySeats) {
        const seatMarket = await saveService.getMarket(saveId, ds.seatId);
        if (!seatMarket?.loans?.length) continue;
        const back = await returnDueLoans(saveService, saveId, ds.seatId, ds.meta, seatMarket, currentDate);
        if (back.market !== seatMarket) await saveService.saveMarket(saveId, back.market, ds.seatId);
        ds.deferred.negotiation.push(...back.news);
      }
      const allSquadsMarket = await saveService.getAllSquads(saveId);
      // The world's rotation + AI profiles; a market written before the first tick (a seat's lists from a route)
      // has no rotation yet: give it one instead of crashing or never refreshing.
      const worldMarket = await saveService.getWorldMarket(saveId);
      const marketForTick = worldMarket?.shuffledTeamIds?.length
        ? { ...worldMarket, profiles: worldMarket.profiles ?? {} }
        : { ...initMarketState(allSquadsMarket), profiles: worldMarket?.profiles ?? {} };

      // Clubs credited a sell-on clause today: their in-memory copy is stale, so they sit out the
      // free-agent tick below (it would save that copy over the credit).
      const sellOnPaidTo = new Set<string>();
      // Sell-on clauses a seat held and was paid today (their entries leave the seat's market below).
      const sellOnPaidOf = new Map<string, Set<string>>();
      const { updatedMarket, completedTransfers } = dailyMarketTick(
        marketForTick,
        allSquadsMarket,
        currentDate,
        defaultRng,
        {
          excludeSquadIds: humanClubs,
          // Contract end for every signing: the buyer's league season end.
          seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end,
          historyFrom: (sq) => {
            const l = activeLeagues.find((x) => x.leagueSlug === sq.leagueSlug);
            return l ? { league: l.leagueSlug, season: seasonLabel(l.year, l.start, l.end) } : null;
          },
          // Only buyers whose country has an open window buy (`.claude/rules/game/transfer-windows.md`).
          windows: {
            isOpen: (sq) => windows.ofLeague(sq.leagueSlug ?? "").open,
            closesOn: (sq) => windows.ofLeague(sq.leagueSlug ?? "").until,
            rush: (sq) => windows.rush(sq.leagueSlug ?? ""),
          },
        },
      );
      await saveService.saveWorldMarket(saveId, updatedMarket);

      for (const tx of completedTransfers) {
        const buyerResolved = await saveService.resolveSquadId(saveId, tx.buyerSquad.id);
        const sellerResolved = await saveService.resolveSquadId(saveId, tx.sellerSquad.id);
        if (!buyerResolved || !sellerResolved) continue;

        const buying = withDefaultFinances(tx.updatedBuyer);
        const selling = withDefaultFinances(tx.updatedSeller);

        // The AI never trades with a human club (`excludeSquadIds`): both are always undefined, the code stays
        // correct if that ever changes.
        const buyerSeat = seatOf.get(tx.buyerSquad.id);
        const sellerSeat = seatOf.get(tx.sellerSquad.id);
        // A sell-on clause the player carried comes out of this fee (`.claude/rules/game/negotiation.md`).
        const owed = sellOnFor(tx.player, tx.sellerSquad.id, tx.fee);

        await executeTransferFee(
          saveId,
          noSeat,
          {
            squad: buying,
            leagueSlug: buyerResolved.leagueSlug,
            clubSlug: buyerResolved.clubSlug,
            ...(buyerSeat ? { seatId: buyerSeat.seatId } : {}),
          },
          {
            squad: selling,
            leagueSlug: sellerResolved.leagueSlug,
            clubSlug: sellerResolved.clubSlug,
            ...(sellerSeat ? { seatId: sellerSeat.seatId } : {}),
          },
          tx.fee,
          saveService,
          { playerName: tx.player.name, playerId: tx.player.id, ...(owed ? { sellOn: { amount: owed.amount, clubName: owed.clubName } } : {}) },
        );
        // The clause is paid to the seat holding it (its ledger), or to the AI club's transfer budget.
        const ownerSeat = owed ? seatOf.get(owed.clubId) : undefined;
        const sellOnNews = ownerSeat
          ? await settleSellOn(saveService, saveId, ownerSeat.seatId, ownerSeat.meta, owed, tx.player, tx.sellerSquad.name, currentDate)
          : await settleSellOn(saveService, saveId, "", noSeat, owed, tx.player, tx.sellerSquad.name, currentDate);
        if (owed) sellOnPaidTo.add(owed.clubId);
        if (sellOnNews && ownerSeat) {
          ownerSeat.deferred.negotiation.push(sellOnNews);
          const paid = sellOnPaidOf.get(ownerSeat.seatId) ?? new Set<string>();
          paid.add(tx.player.id);
          sellOnPaidOf.set(ownerSeat.seatId, paid);
        }
        // Club history: transfer records + the player's stats at the seller (`.claude/rules/game/club-history.md`).
        {
          const seasonOf = (leagueSlug: string) => {
            const l = activeLeagues.find((x) => x.leagueSlug === leagueSlug);
            return l ? seasonLabel(l.year, l.start, l.end) : currentDate.slice(0, 4);
          };
          const changes = await recordTransferHistory(saveService, saveId, {
            buyer: buying, seller: selling, playerId: tx.player.id, fee: tx.fee, date: currentDate,
            buyerSeason: seasonOf(buyerResolved.leagueSlug), sellerSeason: seasonOf(sellerResolved.leagueSlug),
          });
          for (const c of changes) seatOf.get(c.squadId)?.deferred.clubRecords.push(...c.broken);
          if (newsCollector) {
            newsCollector.transferNames.set(tx.player.id, tx.player.name);
            for (const c of changes) {
              if (c.broken.length === 0) continue;
              newsCollector.clubRecords.push(c);
              if (c.squadId === tx.buyerSquad.id && c.broken.some((b) => b.kind === "recordSigning")) newsCollector.recordSignings.add(tx.player.id);
            }
          }
        }

        dayMoves.push({ playerId: tx.player.id, from: tx.sellerSquad.id, to: tx.buyerSquad.id, fee: tx.fee, kind: "transfer", date: currentDate });
        const transferId = randomUUID();
        const record: StoredTransferRecord = {
          id: transferId,
          date: currentDate,
          playerId: tx.player.id,
          playerName: tx.player.name,
          playerPosition: tx.player.positions[0] ?? "—",
          playerAge: tx.player.age,
          fromSquadId: tx.sellerSquad.id,
          fromSquadName: tx.sellerSquad.name,
          toSquadId: tx.buyerSquad.id,
          toSquadName: tx.buyerSquad.name,
          fee: tx.fee,
          status: "accepted",
          reason: "AI transfer",
        };
        await saveService.appendTransfer(saveId, record);
        await saveService.appendDayEvent(saveId, currentDate, {
          kind: "transfer_ref",
          transferId,
        });

        if (buyerSeat) {
          await emitInboxMessage(
            saveId,
            buildTransferInMessage({
              date:       currentDate,
              transferId,
              playerId:   tx.player.id,
              playerName: tx.player.name,
              fromClub:   tx.sellerSquad.name,
              feeEuros:   tx.fee,
            }),
            saveService,
            buyerSeat.seatId,
          );
        } else if (sellerSeat) {
          if (sellerSeat.board) {
            sellerSeat.board = applyTransferSale(sellerSeat.board, {
              fee: tx.fee,
              annualRevenue: wageRevenueBasisOf(tx.sellerSquad),
              idol: isIdol(tx.player, tx.sellerSquad),
            });
          }
          await emitInboxMessage(
            saveId,
            buildTransferOutMessage({
              date:       currentDate,
              transferId,
              playerId:   tx.player.id,
              playerName: tx.player.name,
              toClub:     tx.buyerSquad.name,
              feeEuros:   tx.fee,
            }),
            saveService,
            sellerSeat.seatId,
          );
        }
      }

      // What is each seat's: the AI's bids for its players, its talks, the rivals for its targets.
      const squadsNow = squadsAfterTick(allSquadsMarket, completedTransfers);
      // Top players of the world (`STAR_LIMIT`), read once: a rival at its limit never enters.
      let dayTop: Set<string> | undefined;
      for (const ds of daySeats) {
        if (!ds.clubId) continue;
        const seatMarket = await saveService.getMarket(saveId, ds.seatId);
        let market: MarketState = { ...(seatMarket ?? { playerSellList: [] }), ...updatedMarket };
        // AI bids for the seat's players (`.claude/rules/game/negotiation.md`), on the squads after today's tick.
        const humanSquad = squadsNow.find((s) => s.id === ds.clubId);
        if (humanSquad) {
          const bids = humanBidsTick({
            market, squads: squadsNow, humanSquad, currentDate, rng: defaultRng,
            seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end,
            windows: {
              isOpen: (sq) => windows.ofLeague(sq.leagueSlug ?? "").open,
              closesOn: (sq) => windows.ofLeague(sq.leagueSlug ?? "").until,
            },
            newBidId: () => randomUUID(),
            humanClubIds: humanClubs,
          });
          market = bids.market;
          for (const bid of bids.newBids) {
            if (bid.kind === "transfer") ds.moraleBids.push({ playerId: bid.playerId, clubId: bid.clubId, clubName: bid.clubName });
            ds.deferred.negotiation.push({
              date: currentDate, kind: bid.kind === "loan" ? "loan_bid" : "bid", bidId: bid.id,
              playerId: bid.playerId, playerName: bid.playerName, clubName: bid.clubName, fee: bid.fee,
              ...(bid.sellOnPct ? { sellOnPct: bid.sellOnPct } : {}),
              ...(bid.wageShare !== undefined ? { wageShare: bid.wageShare } : {}),
              ...(bid.until ? { until: bid.until } : {}),
              expires: bid.expires,
            });
          }
        }
        market = { ...market, talks: pruneTalks(market.talks, currentDate) };
        // A closed window ends the seat's open conversations (bans stay).
        if (!windows.seat(ds.seatId).today.open && market.talks) {
          market = {
            ...market,
            talks: Object.fromEntries(Object.entries(market.talks).filter(([, t]) => t.closedUntil && t.closedUntil >= currentDate)),
          };
        }
        for (const playerId of sellOnPaidOf.get(ds.seatId) ?? []) market = marketAfterSellOnPaid(market, playerId);
        // Competition for the seat's targets (`.claude/rules/game/negotiation.md` → "Disputa"): rivals
        // whose deadline is today buy the player; targets with a live rival may draw another one.
        if (market.rivalBids?.length) {
          const res = await resolveRivalDeadlines(saveService, saveId, ds.seatId, ds.meta, { market, date: currentDate, windows });
          market = res.market;
          ds.deferred.negotiation.push(...res.news);
          dayMoves.push(...res.moves);
          // Their in-memory copies are stale: they sit out the free-agent tick below.
          for (const m of res.moves) { sellOnPaidTo.add(m.from); sellOnPaidTo.add(m.to); }
          for (const id of new Set((market.rivalBids ?? []).map((r) => r.playerId))) {
            const first = liveRivals(market.rivalBids, id, currentDate)[0];
            if (!first) continue;
            const seller = allSquadsMarket.find((sq) => sq.id === first.fromClubId);
            const target = seller?.players.find((p) => p.id === id);
            if (!seller || !target) continue;
            const more = await rollRivalFor(saveService, saveId, {
              market, player: target, seller, humanId: ds.clubId, humanClubIds: humanClubs, date: currentDate, windows,
              top: (dayTop ??= worldTopIds(squadsNow)),
            });
            market = more.market;
            if (more.news) ds.deferred.negotiation.push(more.news);
          }
        }
        await saveService.saveSeatMarket(saveId, ds.seatId, splitMarket(market).seat);
      }

      // Offers between seats (multiplayer part 4): expired, the buyer's window closed, or the world moved on.
      // Their messages go out after any `clearInbox` of the day, with the seats' other negotiation news.
      await expireSeatOffers(
        saveService, saveId, currentDate,
        (seatId) => windows.seat(seatId).today.open,
        (seatId, args) => { daySeats.find((d) => d.seatId === seatId)?.deferred.negotiation.push(args); },
        seatOfferNudges,
      );

      // Free agents: a few AI clubs hire from the free pool (fee 0, wage-gated). Squads that
      // just traded today are skipped so their freshly saved rosters are never overwritten.
      const rawFreeAgents = await saveService.getFreeAgents(saveId);
      const freeAgentPool = pruneFreeAgents(rawFreeAgents, currentDate);
      if (freeAgentPool.length !== rawFreeAgents.length) await saveService.writeFreeAgents(saveId, freeAgentPool);
      if (freeAgentPool.length > 0) {
        const tradedToday = new Set([...completedTransfers.flatMap((tx) => [tx.buyerSquad.id, tx.sellerSquad.id]), ...sellOnPaidTo]);
        const hiringSquads = allSquadsMarket.filter((sq) => !tradedToday.has(sq.id));
        const fa = freeAgentTick({
          squads: hiringSquads,
          pool: freeAgentPool,
          date: currentDate,
          rng: defaultRng,
          excludeSquadIds: humanClubs,
          seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end ?? defaultSeasonEnd(currentDate),
        });
        if (fa.signedIds.size > 0) {
          for (const sq of fa.squads) {
            if (!fa.changedIds.has(sq.id)) continue;
            await saveService.saveSquadById(saveId, sq);
            for (const p of sq.players) {
              if (fa.signedIds.has(p.id)) dayMoves.push({ playerId: p.id, from: "", to: sq.id, fee: 0, kind: "free", date: currentDate });
            }
          }
          await saveService.writeFreeAgents(saveId, freeAgentPool.filter((f) => !fa.signedIds.has(f.player.id)));
        }
      }

      // Registration: AI clubs with an open deadline rebuild their lists when the squad changed (a signing on the
      // last day of the window is registered). Clubs that moved today are re-read; the rest are the market snapshot.
      const touched = new Set<string>([
        ...completedTransfers.flatMap((tx) => [tx.buyerSquad.id, tx.sellerSquad.id]), ...sellOnPaidTo,
      ]);
      for (const m of dayMoves) if (m.to) touched.add(m.to);
      const regSquads: { squad: Squad; leagueSlug: string }[] = [];
      for (const sq of allSquadsMarket) {
        const cur = touched.has(sq.id) ? await saveService.getSquadById(saveId, sq.id) : sq;
        const league = cur?.leagueSlug ?? index.byId(sq.id)?.leagueSlug;
        if (cur && league) regSquads.push({ squad: cur, leagueSlug: league });
      }
      for (const sq of await refreshAiRegistrations(regCtx, regSquads)) await saveService.saveSquadById(saveId, sq);
    }

    // ── Transfer windows: news for each seat's country (open / closing / closed) ──────────────
    for (const ds of daySeats) {
      if (!ds.clubId || options.marketFrozen) continue;
      const today = windows.seat(ds.seatId).today;
      const yesterday = windows.seat(ds.seatId).on(addDays(currentDate, -1));
      const country = windows.seat(ds.seatId).country;
      const base = { date: currentDate, playerId: "", playerName: "", clubName: country, country };
      if (today.open && !yesterday.open) ds.deferred.negotiation.push({ ...base, kind: "window_open", ...(today.until ? { until: today.until } : {}) });
      else if (today.open && daysToClose(today, currentDate) === WINDOWS.CLOSING_NOTICE_DAYS) {
        ds.deferred.negotiation.push({ ...base, kind: "window_closing", ...(today.until ? { until: today.until } : {}) });
      } else if (!today.open && yesterday.open) ds.deferred.negotiation.push({ ...base, kind: "window_closed", ...(today.opensOn ? { opensOn: today.opensOn } : {}) });
    }

    // ── AI managers: Monday review of every league, then today's hirings ──────────────────────
    if (aiDesk) {
      if (new Date(`${currentDate}T12:00:00Z`).getUTCDay() === 1) await aiDesk.mondayReview(activeLeagues);
      await aiDesk.hireDue(activeLeagues);
      await aiDesk.retire();
    }

    // ── Scouting (each seat's manager, `.claude/rules/game/scouting.md`) ────────
    // Opponents of today's matches are noticed; Mondays the missions work, the shortlist is checked
    // and the travel is charged (ledger lines added to the money block below); the 1st of the month
    // the chief recommends. Messages are deferred past any `clearInbox` like the rest.
    for (const ds of daySeats) {
      ds.scouting = await scoutingDay(saveService, saveId, ds.seatId, {
        date: currentDate, meta: ds.meta,
        matchEvents: dayEvents.filter((e): e is MatchEvent => e.kind === "match"),
      });
    }

    // ── Financial updates (each seat's club ledger) ──────────────────────────
    // Weekly commercial/wages/operational on Mondays, plus a gate entry for every home fixture
    // of the seat's club today across every competition (`DaySeat.homeFixtures`, filled by the
    // main match loop above). See computeAdvanceDayMoney / .claude/rules/game/finances.md.
    // The negative-balance message is QUEUED, not emitted immediately: a rollover later this same
    // function call may clearInbox() (see "Transfers + inbox are cleared" below) — emitting here
    // would have it wiped the same day it was raised. Flushed after that clear, like the
    // continental news (`DaySeat.deferred`).
    const dayOfWeek = new Date(currentDate + "T12:00:00").getDay();
    const isWeeklyTick = dayOfWeek === 1;
    // Facilities (`.claude/rules/game/facilities.md`): instalments and finished works can fall on
    // any day, so each seat's squad is read every day.
    for (const ds of daySeats) {
      const seatEntry = ds.entry;
      const seatClubId = ds.clubId;
      if (!seatEntry || !seatClubId) continue;
      const seatLeagueState = activeLeagues.find((l) => l.leagueSlug === ds.meta.leagueSlug);
      // Re-read the squad: it may have been updated by the match loop above (own fixture today).
      let playerSquad = await saveService.getSquad(saveId, seatEntry.leagueSlug, seatEntry.stem);
      // Facilities day: instalments / finished works, then today's home attendance.
      let facilityEntries: LedgerEntry[] = [];
      let attendanceToday: number[] | null = null;
      if (playerSquad?.facilities?.items) {
        // Today's wear (time, home games, training), then the 40% / 15% warnings.
        const session = restToday(ds) || teamsPlayingToday.has(seatClubId)
          ? null
          : resolveTrainingPolicy(ds.meta, seatEntry.stem, seatClubId).intensity;
        const worn = wearDay(playerSquad.facilities.items, {
          homeGames: ds.homeFixtures.filter((g) => !g.neutral).length,
          session,
          pitchWearMult: staffEffectsOf(playerSquad).pitchWearMult,
        });
        for (const c of worn.crossings) {
          ds.deferred.facility.push({ date: currentDate, kind: c.kind, item: c.item, condition: Math.round(c.condition) });
        }
        const day = advanceFacilities({ ...playerSquad.facilities, items: worn.items }, currentDate);
        facilityEntries = day.entries;
        for (const p of day.completed) {
          if (p.kind === "turf" && p.turf) {
            ds.deferred.facility.push({ date: currentDate, kind: "turf_changed", item: "stadiumPitch", turf: p.turf, condition: 100 });
            // Synthetic grass: the fans dislike it (spec 2026-10-16).
            if (p.turf === "synthetic" && ds.board) ds.board = applyPressEffect(ds.board, 0, FACILITIES.TURF.SYNTHETIC_FANS);
            continue;
          }
          if (p.item) {
            ds.deferred.facility.push({
              date: currentDate, kind: "repaired", facility: p.kind, item: p.item, condition: p.kind === "repair" ? p.to ?? 100 : 100,
              ...(p.kind === "upgrade" ? { level: day.facilities.items[p.item].level } : {}),
            });
            continue;
          }
          ds.deferred.facility.push({
            date: currentDate, kind: "completed", facility: p.kind,
            ...(p.stand ? { stand: p.stand, seats: p.seats } : {}), ...(p.level !== undefined ? { level: p.level } : {}),
          });
        }
        let next = day.facilities;
        if (ds.homeFixtures.length > 0) {
          const md = facilitiesMatchday(next, ds.homeFixtures, currentDate, {
            followers: playerSquad.finances?.followers ?? 0,
            tier: await leagueTierOf(seatEntry.leagueSlug),
            ...(ds.board ? { fans: ds.board.fans } : {}),
            ...(seatLeagueState ? { fraction: seasonFraction(currentDate, seatLeagueState.start, seatLeagueState.end) } : {}),
          });
          next = md.facilities;
          attendanceToday = md.attendance;
          if (md.recordBroken) {
            ds.deferred.facility.push({
              date: currentDate, kind: "attendance_record", attendance: Math.round(md.recordBroken.attendance),
              previous: md.recordBroken.previous, competition: md.recordBroken.competition,
            });
          }
        }
        if (next !== playerSquad.facilities) {
          playerSquad = withFacilities(playerSquad, next);
          await saveService.saveSquad(saveId, seatEntry.leagueSlug, seatEntry.stem, playerSquad);
        }
      }
      const scoutingEntries = ds.scouting?.entries ?? [];
      if (playerSquad && (isWeeklyTick || ds.homeFixtures.length > 0 || facilityEntries.length > 0 || scoutingEntries.length > 0)) {
        const catalogForFinance = await getLeagueData();
        const priceMult = playerSquad.facilities?.items ? comfortPriceMult(playerSquad.facilities) : 1;
        const homeFixturesToday: PlayerHomeFixtureToday[] = ds.homeFixtures.map((f, i) => ({
          competition: f.competition, kind: f.kind, ...(f.neutral ? { neutral: true } : {}),
          label: competitionName(f.competition, catalogForFinance as unknown as LeagueData[], "en"),
          ...(attendanceToday ? { attendance: attendanceToday[i]!, priceMult } : {}),
        }));
        const loanedOutWages = isWeeklyTick
          ? parentLoanWages((await saveService.getMarket(saveId, ds.seatId))?.loans, playerSquad.id)
          : 0;
        const moneyEntries = [
          ...computeAdvanceDayMoney({
            currentDate, playerSquad, homeFixturesToday, loanedOutWages,
            // The manager's own wage (`.claude/rules/game/jobs.md` → "Contrato do técnico").
            ...(ds.meta.managerContract?.squadId === playerSquad.id ? { managerWage: ds.meta.managerContract.wage } : {}),
            ...(ds.board ? { fillRate: stadiumFillRate(ds.board.fans) } : {}),
          }),
          ...facilityEntries,
          ...(playerSquad.id === seatClubId ? scoutingEntries : []),
        ];
        if (moneyEntries.length > 0) {
          const season = await ledgerSeasonOf(ds);
          const balanceBefore = playerSquad.finances?.budget ?? 0;
          let balanceAfter = balanceBefore;
          // Sequential, never parallel: each entry read-modify-writes the squad's budget, so the
          // next entry must observe the previous one's result (recordMoney is the only writer).
          for (const entry of moneyEntries) {
            const updated = await recordMoney(
              saveService, saveId, season,
              { leagueSlug: seatEntry.leagueSlug, clubSlug: seatEntry.stem },
              entry,
              ds.seatId,
            );
            balanceAfter = updated.finances?.budget ?? balanceAfter;
          }
          ds.managerEarned += moneyEntries.filter((e) => e.kind === "manager").reduce((t, e) => t - e.amount, 0);
          // Monday: the balance moves the board, then both meters drift towards 60.
          if (ds.board && isWeeklyTick) {
            ds.board = applyWeekly(ds.board, { balance: balanceAfter, weeklyRevenue: wageRevenueBasisOf(playerSquad) / 52 });
          }
          if (balanceBefore >= 0 && balanceAfter < 0) {
            ds.deferred.negativeBalance = {
              date: currentDate,
              kind: "negative_balance",
              leagueSlug: ds.meta.leagueSlug,
              leagueName: competitionName(ds.meta.leagueSlug, catalogForFinance as unknown as LeagueData[], "en"),
              seasonYear: season,
              balance: balanceAfter,
            };
          }
        }
      }
    }

    // ── Season rollover, per country ─────────────────────────────────────────
    // Pyramid countries roll all their leagues together once the last one has ended, moving
    // clubs between divisions in between; other leagues roll alone after their own end. The
    // date never jumps: leagues that ended early just have no games until their country rolls.
    // Idempotency: a rolled league carries next season's year/end in activeLeagues, so it is no
    // longer "ended"; the league meta's year on disk catches a roll whose save meta was lost.
    // Each seat's rollover (its season end, move, title, objective, followers, league prize, board bonus, board at
    // the season end) goes into `DaySeat.rollover`; its season messages into `DaySeat.deferred.season`.
    let freeAgentsRetiredYear: number | undefined;
    // club id → seat id (the reborn offer of a world-class retiree is his seat's).
    const seatIdByClub = new Map(daySeats.flatMap((d) => (d.clubId ? [[d.clubId, d.seatId] as const] : [])));

    const updatedActiveLeagues: LeagueSeasonState[] = [...activeLeagues];
    const stateIdx = (slug: string) => updatedActiveLeagues.findIndex((l) => l.leagueSlug === slug);

    const endedLeagues = activeLeagues.filter((l) => nextDate > l.end);
    const storedMeta = new Map<string, LeagueSeasonMeta | null>();
    for (const l of endedLeagues) storedMeta.set(l.leagueSlug, await saveService.getLeagueMeta(saveId, l.leagueSlug));
    const due = endedLeagues.length > 0
      ? findDueRollovers({
          date: currentDate,
          activeLeagues,
          pyramids: await getPyramids(),
          storedYear: Object.fromEntries([...storedMeta].map(([slug, lm]) => [slug, lm?.year])),
        })
      : { units: [], resync: [], waiting: [] };

    // Rolled on disk by an earlier attempt whose save meta was not persisted: only catch the state up.
    for (const slug of due.resync) {
      const lm = storedMeta.get(slug);
      const i = stateIdx(slug);
      if (!lm || i < 0) continue;
      logError("season", `save ${saveId}: ${slug} already rolled to ${lm.year} on disk — resyncing activeLeagues`);
      updatedActiveLeagues[i] = {
        ...updatedActiveLeagues[i]!, year: lm.year, start: lm.start, end: lm.end,
        totalRounds: lm.totalRounds, currentRound: 0,
      };
    }

    const transfersAtSeasonEnd = due.units.length > 0 ? await saveService.getTransfers(saveId) : [];
    // Every league's brand-new next-season fixtures (step 6 below), for the calendar-year vs.
    // continental clash check right after this loop.
    const rolledLeagueFixtures = new Map<string, Fixture[]>();
    // League display names (for the prize ledger label below) and continental finalists/champions
    // of the season that's ending (design spec §3 "IA" — a final counts as a good season and a
    // title unlocks ELITE, regardless of domestic position — see `clubSeasonOutcome`), both read
    // once for every unit.
    const nameOfLeagueForPrizes = due.units.length > 0 ? await leagueNameResolver(activeLeagues) : null;
    const continentalSeasonStatus = due.units.length > 0
      ? await continentalGoodClubsThisSeason(saveService, saveId)
      : { good: new Set<string>(), title: new Set<string>() };

    for (const unit of due.units) {
      if (unit.partial) {
        logError("season", `save ${saveId}: ${unit.country} partially rolled on disk — rolling the rest without promotion/relegation`);
      }
      logSeason("Season end reached — rolling over", {
        saveId, country: unit.country, leagues: unit.leagues, lastDay: currentDate,
      });

      // 1. Final tables on the OLD membership.
      const oldTeams = new Map<string, LeagueTeam[]>();
      const fixturesByLeague = new Map<string, Fixture[]>();
      const standings: Record<string, StandingRow[]> = {};
      for (const slug of unit.leagues) {
        const teams = index.inLeague(slug);
        const fixtures = await saveService.getAllFixturesForLeague(saveId, slug);
        oldTeams.set(slug, teams);
        fixturesByLeague.set(slug, fixtures);
        standings[slug] = teams.length > 0 ? computeStandings(teams, fixtures, slug) : [];
      }

      // 2. Plan the moves. Each seat whose club plays in the unit (old membership) gets its move and title.
      const plan = planCountryRollover(unit, standings, undefined);
      for (const ds of daySeats) {
        if (!ds.clubId || !unit.leagues.includes(index.byId(ds.clubId)?.leagueSlug ?? "")) continue;
        const outcome = clubRolloverOutcome(unit, standings, plan.moves, ds.clubId);
        ds.rollover.move = outcome.move;
        ds.rollover.championOf = outcome.championOf;
      }
      if (newsCollector) {
        for (const m of plan.moves) {
          newsCollector.moves.push({ ...m, fromTier: unit.pyramid ? tierOfLeague(unit.pyramid, m.from) : 1 });
        }
      }

      // Manager ranking: the country weight is taken now, before any league of the unit is reset
      // (cached per country per season in meta.managerWeights, `.claude/rules/game/managers.md`).
      const unitCountry = unit.country ?? (await managerTracker.countryOfLeague(unit.leagues[0]!));
      const unitState = updatedActiveLeagues[stateIdx(unit.leagues[0]!)]!;
      const unitWeight = await managerTracker.weightOf(unitCountry, seasonLabel(unitState.year, unitState.start, unitState.end));
      // Referees: the country's season stats go to the archive and its pool is renewed (`referees.md`).
      if (unitCountry) await rolloverReferees(saveService, saveId, unitCountry, currentDate, seasonLabel(unitState.year, unitState.start, unitState.end));

      // Cup + continental fixtures for the club-history records, read once for the unit.
      let unitCupFixtures: Fixture[] | undefined;

      // 3. Archive + reset every league with the OLD membership. Reset squads are saved where
      //    they live now, before any move; moved clubs get their new tier's income here.
      const closedYear = new Map<string, number>();
      // Last season's games/goals per player (the squad logs are reset by the transition).
      const closedLogs: Record<string, { appearances: number; goals: number }> = {};
      for (const slug of unit.leagues) {
        const state = updatedActiveLeagues[stateIdx(slug)]!;
        closedYear.set(slug, state.year);
        const leagueTeams = oldTeams.get(slug)!;
        if (leagueTeams.length === 0) continue;
        const transition = runSeasonTransition({
          endingSeason: { year: state.year, start: state.start, end: state.end, calendar: fixturesByLeague.get(slug)! },
          leagueSlug: slug,
          leagueTeams,
          squadsInLeague: await saveService.getSquadsInLeague(saveId, slug),
          humanClubIds: humanClubs,
        });
        await saveService.writeLeagueSeasonArchive(saveId, transition.archive);
        // History rows of the closed season (the squads are already reset: logs come from the archive).
        {
          const season = seasonLabel(state.year, state.start, state.end);
          const table = standings[slug] ?? [];
          const championId = table.length > 0 && table[0]!.mp > 0 ? table[0]!.squadId : null;
          if (championId) newsCollector?.champions.push({ competition: slug, squadId: championId });
          // Season awards (`.claude/rules/game/awards.md`): the managers who ran the season and the
          // board targets, taken before the rollover sackings below.
          const awardManagers = await managerTracker.list();
          const awardTargets = new Map(aiDesk ? await aiDesk.targets(slug, season) : []);
          for (const ds of daySeats) {
            if (ds.clubId && ds.board?.objective?.leagueSlug === slug) awardTargets.set(ds.clubId, ds.board.objective.target);
          }
          // Manager ranking: league title (tier × country weight), promotions out of this league, one more season.
          {
            const tier = unit.pyramid ? (tierOfLeague(unit.pyramid, slug) ?? 1) : 1;
            if (championId) {
              await managerTracker.credit({
                season, kind: "league", competition: slug, squadId: championId,
                points: leaguePoints(tier, unitWeight),
              });
            }
            for (const m of plan.moves) {
              const tc = plan.tierChanges[m.squadId];
              if (m.from !== slug || !tc || tc.to >= tc.from) continue;
              await managerTracker.credit({ season, kind: "promotion", competition: slug, squadId: m.squadId, points: promotionPoints() });
            }
            for (const ref of transition.squadsToSave) await managerTracker.countSeason(ref.squad.id, season);
            // AI managers: last finish of every manager, rollover sackings (relegated / failed objective).
            if (aiDesk) await aiDesk.rollover(slug, table, season, plan.tierChanges);
          }
          // Titles of every club of the league first, so a player sold to a rival of the same
          // league gets his old club's titles on his partial row too.
          const titlesByClub: Record<string, string[]> = {};
          for (const ref of transition.squadsToSave) {
            const titles = [
              ...(ref.squad.id === championId ? [`league:${slug}`] : []),
              ...(pendingTitles[ref.squad.id] ?? []),
            ];
            if (titles.length > 0) titlesByClub[ref.squad.id] = titles;
            if (pendingTitles[ref.squad.id]) {
              const { [ref.squad.id]: _, ...rest } = pendingTitles;
              pendingTitles = rest;
              pendingTitlesChanged = true;
            }
          }
          for (const ref of transition.squadsToSave) {
            ref.squad = {
              ...ref.squad,
              players: closeSeasonForPlayers(
                ref.squad.players, transition.archive.playerLogs,
                { squadId: ref.squad.id, clubName: ref.squad.name, league: slug }, season, titlesByClub,
              ),
            };
          }
          // Season awards on the closing rows (+ value boost, morale, manager, year file, inbox).
          {
            const leagueTier = unit.pyramid ? (tierOfLeague(unit.pyramid, slug) ?? 1) : 1;
            const res = await recordLeagueAwards(saveService, saveId, {
              league: slug, season, closedOn: currentDate, country: unitCountry, tier: leagueTier,
              weight: unitWeight * tierFactor(leagueTier), state, squads: transition.squadsToSave.map((r) => r.squad),
              table, managers: awardManagers, targets: awardTargets, tierChanges: plan.tierChanges,
              humanClubIds: humanClubs, leagueName: state.leagueName,
            });
            transition.squadsToSave.forEach((ref, i) => { ref.squad = res.squads[i]!; });
            newsCollector?.leagueAwards.push(res.awards);
            // A seat's manager named best manager of the league: before its passage closes (board block below).
            const bestSeatId = seatIdOfManager(res.awards.bestManager?.managerId ?? "");
            if (bestSeatId) {
              standingExtra(daySeats.find((d) => d.seatId === bestSeatId), { key: "best_manager", points: STANDINGS.BEST_MANAGER, detail: slug });
            }
            await managerTracker.apply(res.managers);
            for (const [clubId, msg] of Object.entries(res.messages)) seatOf.get(clubId)?.deferred.awards.push(msg);
          }
          // Club history: the season row, scorers and records of every club of the league.
          const records = await recordLeagueSeasonHistory(saveService, saveId, {
            league: slug, tier: unit.pyramid ? (tierOfLeague(unit.pyramid, slug) ?? 1) : 1, season,
            start: state.start, end: state.end, table,
            fixtures: [...fixturesByLeague.get(slug)!, ...(unitCupFixtures ??= await cupAndContinentalFixtures(saveService, saveId, unitCountry))],
            squads: transition.squadsToSave.map((r) => r.squad), titlesByClub, tierChanges: plan.tierChanges,
            nameOf: (id) => index.byId(id)?.name ?? id, watchSquadIds: humanClubs,
            ...(newsCollector ? { onBroken: (squadId: string, broken: ClubRecordBroken[]) => newsCollector.clubRecords.push({ squadId, broken }) } : {}),
          });
          for (const [clubId, broken] of Object.entries(records)) seatOf.get(clubId)?.deferred.clubRecords.push(...broken);
        }
        for (const [pid, log] of Object.entries(transition.archive.playerLogs)) {
          closedLogs[pid] = { appearances: log.appearances, goals: log.goals };
        }
        // The league's archive keeps the window of the season that closes (the world's log spans every season).
        await saveService.writeLeagueTransfersArchive(saveId, slug, transition.archive.year,
          transfersAtSeasonEnd.filter((t) => t.date >= state.start && t.date <= state.end));

        // Each human club's annual broadcasting goes onto its RESET squad (once: it is in one league).
        const refs = applyHumanBroadcastingCredit(transition.squadsToSave, transition.humanBroadcastingCredit);
        const table = standings[slug] ?? [];
        // Then every club reacts to its season: AI clubs get followers + financial tier + next
        // season's transfer budget; the human club only its followers. Every club with a final
        // table position also gets its league merit prize (design spec §3 "Liga") — the club's
        // own broadcasting THIS (ending) season, at the position it just finished.
        for (const { squad } of refs) {
          const tablePos = table.findIndex((r) => r.squadId === squad.id);
          const leaguePrizeAmount = tablePos >= 0
            ? leaguePrize(squad.finances?.broadcasting ?? 0, tablePos + 1, table.length)
            : 0;

          const tc = plan.tierChanges[squad.id];
          let next = tc ? applyTierFinanceChange(squad, tc.from, tc.to) : squad;
          const outcome = clubSeasonOutcome(standings[slug] ?? [], squad.id, plan.moves, continentalSeasonStatus);
          const ds = seatOf.get(squad.id);
          if (!ds) {
            next = applyAISeasonReaction(next, outcome);
            if (leaguePrizeAmount > 0) {
              // Prize is granted on top of the NEW season's budget applyAISeasonReaction just set —
              // it never accumulates on top of a stale one (`.claude/rules/AI-clubs/finance.md`).
              const seasonalGrant = seasonalTransferBudgetFor(
                next.financialTier ?? "LOW", popularityFromFollowers(next.finances?.followers ?? 0),
              );
              next = {
                ...next,
                aiTransferBudget: aiBudgetWithPrize(aiTransferBudgetOf(next), leaguePrizeAmount, seasonalGrant),
              };
            }
          } else {
            const human = applyHumanSeasonReaction(next, outcome);
            next = human.squad;
            // The fans' mood scales the followers gain (× 0.8..1.2, `.claude/rules/game/board-fans.md`).
            const followersAfter = ds.board
              ? followersAfterMood(human.followersBefore, human.followersAfter, ds.board.fans)
              : human.followersAfter;
            if (next.finances && followersAfter !== human.followersAfter) {
              next = { ...next, finances: { ...next.finances, followers: followersAfter } };
            }
            if (followersAfter !== human.followersBefore) {
              ds.rollover.followersChange = { before: human.followersBefore, after: followersAfter, leagueSlug: slug };
            }
            // The board judges the season: objective, league title, promotion/relegation; a happy
            // board pays a bonus, an angry one may sack the manager (sacking enabled only).
            if (ds.board) {
              const row = tablePos >= 0 ? table[tablePos]! : null;
              const position = row && row.mp > 0 ? tablePos + 1 : null;
              ds.rollover.objectiveMet = position !== null && !!ds.board.objective && position <= ds.board.objective.target;
              ds.board = evaluateSeason(ds.board, { position });
              if (position === 1) ds.board = applyCompetitionEvent(ds.board, { kind: "title", title: `league:${slug}` });
              if (ds.rollover.move?.kind === "promoted") ds.board = applyCompetitionEvent(ds.board, { kind: "promoted" });
              if (ds.rollover.move?.kind === "relegated") ds.board = applyCompetitionEvent(ds.board, { kind: "relegated" });
              const bonus = boardBonus(ds.board.board, wageRevenueBasisOf(next));
              if (bonus > 0) {
                ds.rollover.boardBonusEntry = {
                  date: currentDate, kind: "prize", amount: bonus, label: "Board bonus", ref: { stage: "board_bonus" },
                };
                next = applyMoney(next, ds.rollover.boardBonusEntry);
                ds.boardMessages.push({ date: currentDate, kind: "bonus", bonus, board: Math.round(ds.board.board) });
              }
              // Only the sacking is decided here; warnings/praise come from the daily review below,
              // on the carried-over meters of the new season.
              const review = reviewBoardStatus(ds.board, { sackingEnabled: ds.meta.sackingEnabled !== false, date: currentDate });
              if (review.sacked) ds.sackedReason = review.sacked;
            }
            // The seat's standings passage closes with the season (still the old objective). A passage of the NEW
            // season (opened today by an earlier try of this same day whose flush wrote the seat but not the meta)
            // is not closed: it stays the open passage.
            const closingSeason = seasonLabel(state.year, state.start, state.end);
            const reopened = !!ds.standing && ds.standing.from === currentDate
              && ds.standing.season !== "" && ds.standing.season !== closingSeason;
            if (standingsActive && reopened) ds.standingOpenedByRollover = true;
            if (standingsActive && ds.standing && !reopened) {
              const row = tablePos >= 0 ? table[tablePos]! : null;
              const position = row && row.mp > 0 ? tablePos + 1 : null;
              const closed = closePassage(ds.standing, {
                seatId: ds.seatId, closedOn: currentDate, reason: "rollover", position,
                leagueTitle: position === 1, move: ds.rollover.move?.kind ?? null,
              });
              standingRows.push(closed);
              ds.standingClosed = closed;
              ds.standing = undefined;
            }
            if (leaguePrizeAmount > 0) {
              next = applyMoney(next, {
                date: currentDate, kind: "prize", amount: leaguePrizeAmount,
                label: `${nameOfLeagueForPrizes!(slug)} · ${ordinalPosition(tablePos + 1)}`,
                ref: { competition: slug, position: tablePos + 1 },
              });
              ds.rollover.leaguePrize = leaguePrizeAmount;
            }
          }
          // Wage factor for the season ahead, now that this club's tier-adjusted revenue is
          // known (`.claude/rules/AI-clubs/finance.md` → wages). CARRIED FORWARD from last
          // season's factor + revenue basis (`carryForwardWageFactor`), not recomputed from
          // scratch — a fresh `clubWageFactor` every rollover would snap every club's bill back
          // to exactly 60% of revenue each season regardless of how it actually spent. Falls
          // back to a fresh computation only when the squad has no prior factor/basis to carry
          // forward from (its very first rollover). Uses the league's club count before any move
          // below — the same approximation the season's home-game count uses elsewhere in this
          // block.
          const homeGames = Math.max(0, leagueTeams.length - 1);
          const newRevenue = clubAnnualRevenue(next, homeGames);
          const targetWageFactor = clubWageFactor(newRevenue, squadCurveBill(next.players));
          const newWageFactor =
            typeof next.wageFactor === "number" && typeof next.wageRevenueBasis === "number"
              ? pullWageFactorToTarget(
                  carryForwardWageFactor(next.wageFactor, next.wageRevenueBasis, newRevenue), targetWageFactor,
                )
              : targetWageFactor;
          next = { ...next, wageFactor: newWageFactor, wageRevenueBasis: newRevenue };
          await saveService.saveSquadById(saveId, next);
          if (ds) {
            // The new season's ledger: closedYear.get(slug) is the OLD (just-archived) year, so
            // both entries go onto the NEW season's file — same "+1" the next-season calendar
            // below uses for cal.meta.year.
            const newSeasonEntries: LedgerEntry[] = [];
            const credit = transition.humanBroadcastingCredit[squad.id] ?? 0;
            if (credit > 0) {
              newSeasonEntries.push({
                date: currentDate, kind: "broadcasting", amount: credit,
                label: "Broadcasting revenue",
              });
            }
            if (leaguePrizeAmount > 0) {
              newSeasonEntries.push({
                date: currentDate, kind: "prize", amount: leaguePrizeAmount,
                label: `${nameOfLeagueForPrizes!(slug)} · ${ordinalPosition(tablePos + 1)}`,
                ref: { competition: slug, position: tablePos + 1 },
              });
            }
            if (ds.rollover.boardBonusEntry) newSeasonEntries.push(ds.rollover.boardBonusEntry);
            if (newSeasonEntries.length > 0) await saveService.appendLedger(saveId, closedYear.get(slug)! + 1, newSeasonEntries, ds.seatId);
          }
        }
      }

      // 4. Apply the moves.  5. Drop + re-read the index: the new membership.
      for (const m of plan.moves) await saveService.moveSquad(saveId, m.squadId, m.to);
      if (plan.moves.length > 0) {
        saveService.dropSquadIndex(saveId);
        index = await saveService.getSquadIndex(saveId);
      }

      // 6. Next season's calendar + zeroed standings from the NEW membership.  7. activeLeagues.
      for (const slug of unit.leagues) {
        const newTeams = index.inLeague(slug);
        const expected = plan.nextMembership[slug] ?? [];
        if (expected.length !== newTeams.length || expected.some((id) => index.byId(id)?.leagueSlug !== slug)) {
          logError("season", `save ${saveId}: ${slug} membership after moves differs from the plan`, {
            expected: expected.length, actual: newTeams.length,
          });
        }
        if (newTeams.length === 0) continue;
        const cal = buildNextSeasonCalendar({
          leagueSlug: slug,
          teamIds: newTeams.map((t) => t.squadId),
          year: closedYear.get(slug)! + 1,
          leagueConfig: LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === slug),
          country: (await getLeagueData()).find((l) => l.slug === slug)?.country ?? null,
        });
        rolledLeagueFixtures.set(slug, cal.rounds.flatMap((r) => r.fixtures));
        for (const round of cal.rounds) await saveService.writeRound(saveId, slug, round.round, round);
        await saveService.writeDateIndex(saveId, slug, cal.dateIndex);
        await saveService.writeLeagueMeta(saveId, cal.meta);
        await saveService.writeLeagueStandings(saveId, slug, newTeams.map((t) => ({
          ...t, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
        })));
        const i = stateIdx(slug);
        updatedActiveLeagues[i] = {
          ...updatedActiveLeagues[i]!,
          year: cal.meta.year,
          start: cal.meta.start,
          end: cal.meta.end,
          totalRounds: cal.meta.totalRounds,
          currentRound: 0,
        };
        // A seat whose club plays this league next season gets its seeded rest days.
        for (const ds of daySeats) {
          if (ds.clubId && index.byId(ds.clubId)?.leagueSlug === slug) ds.patch.restDays = cal.meta.restDays ?? [];
        }
      }

      // 7a. Loans held by clubs of this unit end with their season (`.claude/rules/game/negotiation.md`),
      //     with the contracts' grace window, before retirements and expiries touch those players.
      // Each seat's loans (its market) are checked.
      for (const ds of daySeats) {
        const mk = await saveService.getMarket(saveId, ds.seatId);
        if (mk?.loans?.length) {
          const unitIds = new Set<string>();
          for (const slug of unit.leagues) for (const sq of await saveService.getSquadsInLeague(saveId, slug)) unitIds.add(sq.id);
          const back = await returnDueLoans(saveService, saveId, ds.seatId, ds.meta, mk, currentDate, {
            graceDays: CONTRACT_CONFIG.ROLLOVER_GRACE_DAYS, onlyBorrowers: unitIds,
            // A loan of a rolling PARENT ends too when the contract does, so the expiry below sees him.
            parentUnit: unitIds, contractGraceDays: CONTRACT_CONFIG.ROLLOVER_GRACE_DAYS,
          });
          if (back.market !== mk) await saveService.saveMarket(saveId, back.market, ds.seatId);
          ds.deferred.negotiation.push(...back.news);
        }
      }

      // 7b. Retirement (.claude/rules/game/retirement.md): players >= 34 (squads and free agents) may
      //     retire before contracts expire. Pending reborn offers of the human club expire here.
      {
        const unitSquads: Squad[] = [];
        for (const slug of unit.leagues) unitSquads.push(...(await saveService.getSquadsInLeague(saveId, slug)));
        worldLevelsMemo ??= buildWorldLevels(await saveService.getAllSquads(saveId));
        const levels = worldLevelsMemo;
        const rYear = closedYear.get(unit.leagues[0]!)! + 1;
        const faDone = (freeAgentsRetiredYear ?? world.freeAgentsRetiredYear) === rYear;
        const res = processRetirements({
          saveId, year: rYear, processFreeAgents: !faDone, date: currentDate, squads: unitSquads,
          freeAgents: await saveService.getFreeAgents(saveId), levels, humanSeats: seatIdByClub, logs: closedLogs,
        });
        // The pending reborn offers of each seat whose club is in the unit expire (the new ones are added after).
        let retiredAll = await saveService.getRetired(saveId);
        for (const s of unitSquads) {
          const sid = seatIdByClub.get(s.id);
          if (sid) retiredAll = expireOffers(retiredAll, sid);
        }
        if (res.retired.length > 0 || retiredAll.length > 0) {
          await saveService.writeRetired(saveId, [...retiredAll, ...res.retired]);
        }
        const before = new Map(unitSquads.map((s) => [s.id, s]));
        for (const sq of res.squads) {
          if (sq === before.get(sq.id)) continue;
          await saveService.saveSquadById(saveId, sq);
        }
        if (!faDone) {
          await saveService.writeFreeAgents(saveId, res.freeAgents);
          freeAgentsRetiredYear = rYear;
        }
        // A seat's retirees leave its lineup and its sell list.
        for (const ds of daySeats) {
          const goneHuman = new Set(res.humanRetired.filter((r) => r.squadId === ds.clubId).map((r) => r.id));
          if (goneHuman.size === 0) continue;
          const tac = await saveService.getTactics(saveId, ds.seatId);
          if (tac && tac.lineup.some((id) => goneHuman.has(id))) {
            await saveService.saveTactics(saveId, { ...tac, lineup: tac.lineup.map((id) => (goneHuman.has(id) ? "" : id)) }, ds.seatId);
          }
          const mk = await saveService.getMarket(saveId, ds.seatId);
          if (mk?.playerSellList?.some((c) => goneHuman.has(c.playerId))) {
            await saveService.saveMarket(saveId, { ...mk, playerSellList: mk.playerSellList.filter((c) => !goneHuman.has(c.playerId)) }, ds.seatId);
          }
        }
        for (const ds of daySeats) await pruneSellOnHeld(saveService, saveId, ds.seatId, res.retired.map((r) => r.id));
        if (newsCollector) {
          for (const r of res.retired) if (levels.top.has(r.id) && !r.freeAgent) newsCollector.retired.push({ playerId: r.id, player: r.name, squadId: r.squadId });
        }
        for (const r of res.humanRetired) {
          seatOf.get(r.squadId)?.deferred.retirement.push({ date: currentDate, kind: r.rebornOffer === "pending" ? "reborn" : "retired", retired: r });
        }
      }

      // 8. Contracts ending with the season: the AI renews who fits (wage cap permitting) and
      //    releases the rest, the human club releases whoever it did not renew. Released players
      //    wait in freeAgents.json. Runs on the NEW membership with the new season's end dates.
      // 8a. Pre-contracts (D2, `.claude/rules/game/negotiation.md`): players of this unit who signed for
      //     the human club leave for free before the AI renewals see them.
      if (!options.marketFrozen) {
        const unitIds = new Set<string>();
        for (const slug of unit.leagues) for (const t of index.inLeague(slug)) unitIds.add(t.squadId);
        for (const ds of daySeats) {
          const pc = await applyDuePreContracts(saveService, saveId, ds.seatId, ds.meta, { unitIds, date: currentDate, humanClubId: ds.clubId ?? null });
          ds.deferred.negotiation.push(...pc.news);
          dayMoves.push(...pc.moves);
        }
      }
      const releasedNow: FreeAgent[] = [];
      const afterExpiry: { squad: Squad; nextEnd: string }[] = [];
      for (const slug of unit.leagues) {
        const nextEnd = updatedActiveLeagues[stateIdx(slug)]?.end;
        if (!nextEnd) continue;
        for (const sq of await saveService.getSquadsInLeague(saveId, slug)) {
          const ds = seatOf.get(sq.id);
          const isHuman = !!ds;
          const res = processContractExpiries({ squad: sq, date: currentDate, nextSeasonEnd: nextEnd, isHuman });
          afterExpiry.push({ squad: res.squad, nextEnd });
          if (res.squad === sq) continue;
          await saveService.saveSquadById(saveId, res.squad);
          for (const p of res.released) releasedNow.push(toFreeAgent(p, currentDate));
          if (ds && res.released.length > 0) {
            const gone = new Set(res.released.map((p) => p.id));
            const tac = await saveService.getTactics(saveId, ds.seatId);
            if (tac && tac.lineup.some((id) => gone.has(id))) {
              await saveService.saveTactics(saveId, { ...tac, lineup: tac.lineup.filter((id) => !gone.has(id)) }, ds.seatId);
            }
            const mk = await saveService.getMarket(saveId, ds.seatId);
            if (mk?.playerSellList?.some((c) => gone.has(c.playerId))) {
              await saveService.saveMarket(saveId, { ...mk, playerSellList: mk.playerSellList.filter((c) => !gone.has(c.playerId)) }, ds.seatId);
            }
            ds.deferred.contract.push({
              date: currentDate, kind: "released", players: res.released.map((p) => ({ id: p.id, name: p.name })),
            });
            // The manager keeps knowing who leaves (`.claude/rules/game/scouting.md`).
            await rememberPlayers(saveService, saveId, ds.seatId, res.released.map((p) => p.id), currentDate);
          }
        }
      }
      for (const ds of daySeats) await pruneSellOnHeld(saveService, saveId, ds.seatId, releasedNow.map((f) => f.player.id));
      if (releasedNow.length > 0 || due.units.length > 0) {
        const existing = await saveService.getFreeAgents(saveId);
        let pool = [...pruneFreeAgents(existing, currentDate), ...releasedNow];
        // Refill: AI clubs below the minimums sign the best free agents that fit the wage cap, then
        // filler youth; the human club only gets youth up to the per-role minimums.
        const trimmedIds: string[] = [];
        for (const { squad: sq, nextEnd } of afterExpiry) {
          const isHuman = humanClubs.has(sq.id);
          const r = refillSquad({ squad: sq, pool, nextSeasonEnd: nextEnd, isHuman, tagPrefix: `s${nextEnd.slice(0, 4)}` });
          if (r.squad === sq) continue;
          // A role minimum may take an AI club past 30: the weakest of the lines with a surplus leave.
          const trimmed = isHuman ? { squad: r.squad, released: [] } : trimSquadToCap(r.squad);
          await saveService.saveSquadById(saveId, trimmed.squad);
          if (r.signed.length > 0) {
            const ids = new Set(r.signed.map((p) => p.id));
            pool = pool.filter((f) => !ids.has(f.player.id));
            // Free signings in the day log (a released award winner re-signed today has no boost).
            for (const p of r.signed) dayMoves.push({ playerId: p.id, from: "", to: sq.id, fee: 0, kind: "free", date: currentDate });
          }
          pool = [...pool, ...trimmed.released.map((p) => toFreeAgent(p, currentDate))];
          trimmedIds.push(...trimmed.released.map((p) => p.id));
        }
        await saveService.writeFreeAgents(saveId, pool);
        for (const ds of daySeats) await pruneSellOnHeld(saveService, saveId, ds.seatId, trimmedIds);
      }

      // 9. Academy (.claude/rules/game/youth.md): every club gets a yearly intake of 16-17 year olds.
      //    The human club keeps them in `squad.youth` (ages and trains the old ones, releases who hit
      //    19); AI clubs promote the best 1-2 straight into the squad and discard the rest.
      let youthReleased: FreeAgent[] = [];
      for (const slug of unit.leagues) {
        const state = updatedActiveLeagues[stateIdx(slug)];
        if (!state) continue;
        const nextEnd = state.end;
        if (!nextEnd) continue;
        for (const sq of await saveService.getSquadsInLeague(saveId, slug)) {
          const ds = seatOf.get(sq.id);
          const res = processYouthRollover({ saveId, squad: sq, year: state.year, nextSeasonEnd: nextEnd, isHuman: !!ds });
          await saveService.saveSquadById(saveId, res.squad);
          if (!ds) continue;
          youthReleased = youthReleased.concat(res.autoReleased.map((p) => toFreeAgent(p, currentDate)));
          if (res.autoReleased.length > 0) {
            ds.deferred.youth.push({
              date: currentDate, kind: "released", players: res.autoReleased.map((p) => ({ id: p.id, name: p.name })),
            });
          }
          const best = [...res.intake].sort((a, b) => overallAvg(b) - overallAvg(a))[0];
          ds.deferred.youth.push({
            date: currentDate, kind: "intake", year: state.year, count: res.intake.length,
            best: best ? { id: best.id, name: best.name, position: best.positions[0] ?? "" } : undefined,
          });
        }
      }
      if (youthReleased.length > 0) {
        await saveService.writeFreeAgents(saveId, [...(await saveService.getFreeAgents(saveId)), ...youthReleased]);
      }

      // The season of each seat whose league is in the unit ended (an unemployed seat follows its last league).
      for (const ds of daySeats) {
        if (!unit.leagues.includes(ds.meta.leagueSlug)) continue;
        ds.rollover.seasonEnded = true;
        // New season objective (new membership, after the moves), meters carried half-way to 60.
        if (ds.board && !ds.sackedReason && ds.clubId) {
          const newLeague = index.byId(ds.clubId)?.leagueSlug ?? ds.meta.leagueSlug;
          const state = updatedActiveLeagues[stateIdx(newLeague)];
          const catalogForBoard = await getLeagueData();
          const objective = objectiveFromSquads({
            squads: await saveService.getSquadsInLeague(saveId, newLeague),
            playerSquadId: ds.clubId,
            leagueSlug: newLeague,
            zones: catalogForBoard.find((l) => l.slug === newLeague)?.zones ?? [],
            season: state ? seasonLabel(state.year, state.start, state.end) : "",
          });
          ds.rollover.boardAtSeasonEnd = ds.board.board;
          ds.board = carryIntoNewSeason(ds.board, objective);
          if (objective) {
            ds.boardMessages.push({
              date: currentDate, kind: "objective", objective,
              leagueName: competitionName(newLeague, catalogForBoard as unknown as LeagueData[], "en"),
            });
          }
        }
        // The new season's standings passage (the new objective); a sacking today opens none.
        if (standingsActive && !ds.sackedReason && ds.clubId && !ds.standing) {
          ds.standing = newPassage({
            date: currentDate, clubId: ds.clubId, clubName: ds.meta.clubName,
            leagueSlug: index.byId(ds.clubId)?.leagueSlug ?? ds.meta.leagueSlug, board: ds.board,
          });
          ds.standingOpenedByRollover = true;
        }
        const archiveYear = closedYear.get(ds.meta.leagueSlug)!;
        ds.rollover.archiveYear = archiveYear;
        ds.rollover.moves = plan.moves;
        const nameOf = await leagueNameResolver(activeLeagues);
        const { move, championOf, followersChange, leaguePrize: prizeNow } = ds.rollover;
        if (championOf) {
          ds.deferred.season.push({
            date: currentDate, kind: "champion", leagueSlug: championOf,
            leagueName: nameOf(championOf), seasonYear: archiveYear,
          });
        }
        if (move) {
          ds.deferred.season.push({
            date: currentDate, kind: move.kind, leagueSlug: move.to,
            leagueName: nameOf(move.to), fromLeagueSlug: move.from, seasonYear: archiveYear,
          });
        }
        if (followersChange) {
          ds.deferred.season.push({
            date: currentDate, kind: "followers", leagueSlug: followersChange.leagueSlug,
            leagueName: nameOf(followersChange.leagueSlug), seasonYear: archiveYear,
            followersBefore: followersChange.before, followersAfter: followersChange.after,
          });
        }
        // Always fires once per rollover, independent of champion/promoted/relegated/followers —
        // a mid-table finish still earns (and shows) its merit prize, and this never doubles up
        // with those messages (review fix: a club can be BOTH champion of its league AND promoted
        // the same season, which used to attach the same prize to two messages).
        if (prizeNow > 0) {
          ds.deferred.season.push({
            date: currentDate, kind: "league_prize", leagueSlug: ds.meta.leagueSlug,
            leagueName: nameOf(ds.meta.leagueSlug), seasonYear: archiveYear,
            prize: prizeNow,
          });
        }
        logDebug(LOG_NS_SEASON, "Season rollover complete", {
          seatId: ds.seatId,
          archivedSeasonYear: archiveYear,
          moves: plan.moves.length,
          playerMove: move,
        });
      }
    }

    // ── National cups: a country's cup is archived and regenerated once all its leagues rolled ──
    // Also runs on a resync-only day (a rollover already applied on disk, only activeLeagues was
    // stale) — the cup must still regenerate then, not just on a day that itself ran the rollover.
    if (due.units.length > 0 || due.resync.length > 0) {
      const catalog = await getLeagueData();
      const countryOf = countryByLeague(catalog);
      const cupYear: Record<string, number> = {};
      const oldCups = new Map<string, LeagueSeasonMeta>();
      for (const slug of await saveService.listCompetitionSlugs(saveId)) {
        if (!isCupSlug(slug)) continue;
        const cm = await saveService.getLeagueMeta(saveId, slug);
        if (cm?.cup) { cupYear[cm.cup.country] = cm.year; oldCups.set(cm.cup.country, cm); }
      }
      const states = updatedActiveLeagues
        .filter((l) => countryOf.has(l.leagueSlug))
        .map((l) => ({ leagueSlug: l.leagueSlug, country: countryOf.get(l.leagueSlug)!, year: l.year, start: l.start, end: l.end }));
      const pyramids = await getPyramids();
      for (const c of countriesToRegenerate(states, cupYear)) {
        const old = oldCups.get(c.country)!;
        const nameOf = (id: string) => {
          const e = index.byId(id);
          return { name: e?.name ?? id, coachId: null, coachName: "" };
        };
        await saveService.writeLeagueSeasonArchive(saveId, buildCupArchive(old, nameOf));
        await createCountryCup({
          service: saveService, saveId, country: c.country, year: c.year, window: c.window,
          index, countryOf, pyramids,
        });
      }
    }

    // ── Continental competitions: archived and regenerated once every season-defining tier-1
    // league of the continent has rolled to a season later than the competition's current year
    // (same "units or resync" trigger as national cups above; the tier-1 leagues' new-season
    // archives are already on disk by this point — written earlier in this same function, in the
    // `due.units` loop, before this block runs). ──────────────────────────────────────────────
    if (due.units.length > 0 || due.resync.length > 0) {
      const catalog = await getLeagueData();
      const pyramids = await getPyramids();
      const tier1States = await continentalTier1LeagueStates(updatedActiveLeagues, catalog, pyramids);
      const compYear: Partial<Record<"Europe" | "South America", number>> = {};

      // Each seat club's "qualified" + "group" news for a competition pair just (re)generated below —
      // queued into its deferred list (`DaySeat.deferred.continental`), never emitted directly here.
      const queueQualificationMessage = (result: Awaited<ReturnType<typeof createContinentalSeason>>) => {
        for (const ds of daySeats) {
          if (!ds.clubId) continue;
          const qual = continentalQualificationOf(ds.clubId, result);
          if (!qual) continue;
          const compName = competitionName(qual.slug, catalog as unknown as LeagueData[], "en");
          const opponentNames = qual.opponentIds.map((id) => index.byId(id)?.name ?? id);
          ds.deferred.continental.push({
            date: currentDate, kind: "qualified", competition: qual.slug, competitionName: compName, stage: "group",
          });
          ds.deferred.continental.push({
            date: currentDate, kind: "group", competition: qual.slug, competitionName: compName, stage: "group",
            group: qual.group, opponentNames,
          });
        }
      };
      for (const continent of ["Europe", "South America"] as const) {
        const primarySlug = competitionsOf(continent)[0]!.slug;
        const m = await saveService.getLeagueMeta(saveId, primarySlug);
        if (m) compYear[continent] = m.year;
      }

      // Self-heal: a continent with NO primary competition meta at all never went through
      // `createSave` successfully (its try/catch there swallowed the failure — see
      // `.claude/rules/game/continental.md`). `continentsToRegenerateContinental` below can never
      // pick it up (it requires an existing year to compare against), so without this it would
      // stay without a continental competition forever. Create it fresh for the current
      // season-defining year — no try/catch (matches the regenerate loop below): a failure here
      // fails the whole day, and the next rollover/resync day simply retries.
      for (const continent of ["Europe", "South America"] as const) {
        if (compYear[continent] !== undefined) continue;
        const year = await seasonDefiningYear(continent, updatedActiveLeagues, catalog);
        if (year === null) continue; // no season-defining league yet — nothing to build from
        logError(
          "continental",
          `save ${saveId}: ${continent} has no continental competition on disk — creating it now (self-heal) for ${year}`,
        );
        queueQualificationMessage(
          await createContinentalSeason({ service: saveService, saveId, continent, year, index, catalog, pyramids }),
        );
      }

      for (const c of continentsToRegenerateContinental(tier1States, compYear)) {
        // No try/catch here (matches the national-cups block above): a failure must fail the whole
        // day so it is never silently swallowed. Left un-regenerated, the trigger condition stays
        // true and the day's own buffered write never lands, so the next advance simply retries
        // the same regeneration rather than the continent being stuck for months with a stale
        // (already-archived-elsewhere) year.
        const nameOf = (id: string) => {
          const e = index.byId(id);
          return { name: e?.name ?? id, coachId: null, coachName: "" };
        };
        for (const comp of competitionsOf(c.continent)) {
          const old = await saveService.getLeagueMeta(saveId, comp.slug);
          if (!old) continue;
          await saveService.writeLeagueSeasonArchive(saveId, buildContinentalArchive(old, nameOf));
        }
        queueQualificationMessage(
          await createContinentalSeason({
            service: saveService, saveId, continent: c.continent, year: c.year, index, catalog, pyramids,
          }),
        );
      }
    }

    // ── Clashing league games, whole world: the new league calendars (a calendar-year European league rolls in
    // December with the UCL/UEL dates of the season in progress already fixed), cups and continental
    // competitions generated today. Before the youth competitions, which read the league dates. ──
    if (due.units.length > 0 || due.resync.length > 0) {
      const r = await rescheduleFixtureConflicts({
        service: saveService, saveId, minDate: addOneDay(currentDate), catalog: await getLeagueData(),
      });
      rescheduleMoves.push(...r.moves);
    }

    // Each seat club's seeded rest days (day before / after each match) follow its rescheduled games.
    for (const ds of rescheduleMoves.length > 0 ? daySeats : []) {
      if (!ds.clubId) continue;
      const leagueSlug = index.byId(ds.clubId)?.leagueSlug ?? ds.meta.leagueSlug;
      const restDays = await playerRestDaysAfterMoves({
        service: saveService, saveId, state: { leagueSlug, restDays: ds.patch.restDays ?? ds.meta.restDays ?? [] },
        clubId: ds.clubId, moves: rescheduleMoves,
      });
      if (restDays) ds.patch.restDays = restDays;
    }

    // ── Youth competitions: archived and regenerated when the country's tier-1 league rolled (same
    // trigger as the cups, after the continentals so the new continental dates are known). Fail-fast. ──
    if (due.units.length > 0 || due.resync.length > 0) {
      await regenerateYouthComps({
        service: saveService, saveId, today: currentDate, index,
        catalog: await getLeagueData(), pyramids: await getPyramids(), updatedActiveLeagues,
      });
    }

    // ── Board and fans: daily review (warning, ultimatum, praise, sacking) + today's snapshot ──
    // A sacking leaves the manager without a club (`.claude/rules/game/jobs.md`): the club becomes
    // an AI club today and the career goes on, with offers arriving every two weeks.
    for (const ds of daySeats) {
      let b = ds.board;
      if (!b) continue;
      if (!ds.sackedReason) {
        const review = reviewBoardStatus(b, { sackingEnabled: ds.meta.sackingEnabled !== false, date: currentDate });
        b = review.state;
        ds.sackedReason = review.sacked;
        for (const kind of review.messages) {
          if (kind === "sacked") continue;
          ds.boardMessages.push({
            date: currentDate, kind, board: Math.round(b.board),
            ...(kind === "ultimatum" && b.ultimatum
              ? { ultimatum: { matches: b.ultimatum.matchesLeft, points: b.ultimatum.pointsNeeded } }
              : {}),
          });
        }
      }
      b = snapshotBoard(b, currentDate);
      ds.board = b;
      if (ds.sackedReason) {
        const leagueNow = index.byId(ds.meta.clubId)?.leagueSlug ?? ds.meta.leagueSlug;
        const table = (await saveService.getLeagueStandings(saveId, leagueNow)) ?? [];
        const pos = table.findIndex((r) => r.squadId === ds.meta.clubId);
        ds.job.ended = {
          date: currentDate, reason: ds.sackedReason, clubName: ds.meta.clubName,
          leagueName: (await leagueNameResolver(updatedActiveLeagues))(leagueNow),
          position: pos >= 0 && table[pos]!.mp > 0 ? pos + 1 : null,
          board: Math.round(b.board), fans: Math.round(b.fans), record: b.record,
        };
        ds.boardMessages.push({ date: currentDate, kind: "sacked", reason: ds.sackedReason, board: Math.round(b.board) });
      }
    }
    // ── Per seat: the manager's contract end, the sacking (→ unemployed), job offers and the contract ──
    // No club with a seat ever offers a job (`.claude/rules/game/multiplayer.md`).
    for (const ds of daySeats) {
      const clubId = ds.clubId;
      // The manager's contract ends at his country's rollover without a renewal (D5): unemployed, not
      // sacked (`.claude/rules/game/jobs.md` → "Contrato do técnico").
      let contract = ds.job.contract;
      // A renewal the board offered and he never answered is taken at the end (4.41: a manager with titles lost
      // his club by not clicking). Refusing it on the card is how he leaves.
      if (!ds.job.ended && ds.board && clubId && ds.rollover.seasonEnded && contract && contract.until <= currentDate && ds.job.renewal) {
        const offer = ds.job.renewal;
        contract = renewedContract(contract, offer, currentDate);
        ds.job.renewal = undefined;
        ds.boardMessages.push({
          date: currentDate, kind: "contract_renewed", board: Math.round(ds.board.board),
          contract: { wage: contract.wage, seasons: offer.seasons, until: contract.until },
        });
      }
      if (!ds.job.ended && ds.board && clubId && ds.rollover.seasonEnded && contract && contract.until <= currentDate) {
        const leagueNow = index.byId(clubId)?.leagueSlug ?? ds.meta.leagueSlug;
        ds.job.ended = {
          date: currentDate, reason: "contract", clubName: ds.meta.clubName,
          leagueName: (await leagueNameResolver(updatedActiveLeagues))(leagueNow),
          position: null, board: Math.round(ds.board.board), fans: Math.round(ds.board.fans), record: ds.board.record,
        };
        ds.boardMessages.push({ date: currentDate, kind: "contract_ended", board: Math.round(ds.board.board) });
      }
      const ended = ds.job.ended;
      if (ended && ds.board && clubId) {
        // Sacked mid-contract: half the wage of the weeks left (max 52) to the manager, paid by the club
        // before its balance leaves the ledger (D9: display only).
        const severance = ended.reason !== "contract" && contract ? severancePay(contract, currentDate) : 0;
        if (severance > 0) {
          const entry = index.byId(clubId);
          if (entry) {
            await recordMoney(
              saveService, saveId, (await saveService.getLeagueMeta(saveId, entry.leagueSlug))?.year ?? parseInt(currentDate.slice(0, 4), 10),
              { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
              { date: currentDate, kind: "manager", amount: -severance, label: "Manager severance", ref: { stage: "severance" } },
              ds.seatId,
            );
            ds.managerEarned += severance;
          }
        }
        // Standings: the passage closes with the reason (sacked −5, contract end no penalty). A passage opened
        // today by the rollover is dropped without a row; a sacking on the rollover day adds −5 to that row. A
        // passage opened earlier (even today, by a club change or a join) closes normally.
        if (standingsActive) {
          const sacked = ended.reason !== "contract";
          if (ds.standing && !ds.standingOpenedByRollover) {
            standingRows.push(closePassage(ds.standing, {
              seatId: ds.seatId, closedOn: currentDate, reason: sacked ? "sacked" : "contract",
              position: await positionOf(saveService, saveId, ds.standing.leagueSlug, ds.standing.clubId),
            }));
          } else if (sacked && ds.standingClosed) {
            const before = ds.standingClosed;
            const items = [...before.items, { key: "sacked" as const, points: STANDINGS.SACKED }];
            const after: SeatSeasonRow = { ...before, items, total: sumItems(items) };
            standingRows[standingRows.indexOf(before)] = after;
            ds.standingClosed = after;
          }
          ds.standing = undefined;
        }
        // The other seats' "closed" messages are deferred past any `clearInbox` of the day, the nudges past the flush.
        await releaseHumanClub(
          saveService, saveId, ds.seatId, { squadId: clubId, date: currentDate },
          { sink: (seatId, args) => { daySeats.find((d) => d.seatId === seatId)?.deferred.negotiation.push(args); }, nudges: seatOfferNudges },
        );
        await managerTracker.apply((ms) => sackHumanManager(ms, {
          seatId: ds.seatId, date: currentDate, clubName: ds.meta.clubName, left: ended.reason === "contract" ? "contract" : "sacked",
        }));
        // The club hires by the AI rule (interim + vacancy).
        aiDesk?.openVacancy(clubId);
        ds.job.unemployed = {
          since: currentDate,
          lastClubId: clubId,
          lastClubName: ds.meta.clubName,
          lastLeagueSlug: index.byId(clubId)?.leagueSlug ?? ds.meta.leagueSlug,
          board: Math.round(ds.board.board),
          nextOfferDate: addDays(currentDate, JOBS.unemployed.FIRST_OFFER_DAYS),
          sacking: ended,
        };
      }

      // ── Job offers (`.claude/rules/game/jobs.md`): the seat's season end, one mid-season window,
      // every two weeks while unemployed. Messages are deferred like the rest (after `clearInbox`).
      ds.job.offers = pruneOffers(ds.job.offersBefore, nextDate);
      const newOffers: JobOffer[] = [];
      if (!ended && clubId && ds.board) {
        const seatState = updatedActiveLeagues.find((l) => l.leagueSlug === (index.byId(clubId)?.leagueSlug ?? ds.meta.leagueSlug));
        if (ds.rollover.seasonEnded && seatState) {
          // Valid until the eve of the club's first match of the new season.
          // After today's rescheduling (`.claude/rules/game/rescheduling.md`).
          const firstMatch = firstMatchAfterMoves(rolledLeagueFixtures.get(seatState.leagueSlug) ?? [], rescheduleMoves, clubId);
          newOffers.push(...await generateJobOffers(saveService, saveId, {
            seatId: ds.seatId, window: "season_end", date: currentDate, expires: seasonEndExpiry(currentDate, firstMatch),
            managers: await managerTracker.list(), board: ds.rollover.boardAtSeasonEnd ?? ds.board.board,
            humanSquadId: clubId, activeLeagues: updatedActiveLeagues, index, excludeClubs: humanClubs,
            ...(contract ? { contract } : {}),
          }));
        } else if (seatState) {
          const label = seasonLabel(seatState.year, seatState.start, seatState.end);
          if (ds.job.midSeason !== label) {
            const table = (await saveService.getLeagueStandings(saveId, seatState.leagueSlug)) ?? [];
            const mp = table.find((r) => r.squadId === clubId)?.mp ?? 0;
            if (seatState.totalRounds > 0 && mp >= seatState.totalRounds * JOBS.midSeason.PROGRESS) {
              ds.job.midSeason = label;
              newOffers.push(...await generateJobOffers(saveService, saveId, {
                seatId: ds.seatId, window: "mid_season", date: currentDate, expires: addDays(currentDate, JOBS.midSeason.VALID_DAYS),
                managers: await managerTracker.list(), board: ds.board.board,
                humanSquadId: clubId, activeLeagues: updatedActiveLeagues, index, excludeClubs: humanClubs,
                ...(contract ? { contract } : {}),
              }));
            }
          }
        }
      } else if (!ended && ds.job.unemployed && currentDate >= ds.job.unemployed.nextOfferDate) {
        const unemployed = ds.job.unemployed;
        const offers = await generateJobOffers(saveService, saveId, {
          seatId: ds.seatId, window: "unemployed", date: currentDate, expires: addDays(currentDate, JOBS.unemployed.VALID_DAYS),
          managers: await managerTracker.list(), board: unemployed.board, humanSquadId: null,
          unemployed: { lastClubId: unemployed.lastClubId, since: unemployed.since, lastOfferDate: unemployed.lastOfferDate },
          activeLeagues: updatedActiveLeagues, index, excludeClubs: humanClubs,
          // Offers while unemployed come from real vacancies first (× VACANCY_WEIGHT).
          vacant: new Set(Object.keys(aiDesk?.vacancies() ?? world.managerVacancies ?? {})),
        });
        newOffers.push(...offers);
        ds.job.unemployed = {
          ...unemployed,
          nextOfferDate: addDays(currentDate, JOBS.unemployed.EVERY_DAYS),
          ...(offers.length > 0 ? { lastOfferDate: currentDate } : {}),
        };
      }
      // ── The manager's contract (`.claude/rules/game/jobs.md` → "Contrato do técnico"): the board's
      // renewal at 85% of the last season, the warning a week before the end. Messages deferred.
      if (!ended && ds.board && clubId && contract) {
        const league = index.byId(clubId)?.leagueSlug ?? ds.meta.leagueSlug;
        const st = updatedActiveLeagues.find((l) => l.leagueSlug === league);
        // The country rolled: the contract follows the NEW league's season end (seasons left kept).
        const oldEnd = activeLeagues.find((l) => l.leagueSlug === ds.meta.leagueSlug)?.end;
        if (ds.rollover.seasonEnded && st && oldEnd) contract = reanchorContract(contract, oldEnd, st.end);
        if (st) {
          const mp = ((await saveService.getLeagueStandings(saveId, league)) ?? []).find((r) => r.squadId === clubId)?.mp ?? 0;
          const squad = await saveService.getSquadById(saveId, clubId);
          const rep = managerReputation(await managerTracker.list(), ds.board.board, parseInt(currentDate.slice(0, 4), 10), ds.seatId);
          const day = contractDay({
            date: currentDate, contract, ...(ds.job.renewal ? { renewal: ds.job.renewal } : {}),
            notices: ds.job.notices ?? [], board: ds.board.board, seasonEnd: st.end, played: mp, totalRounds: st.totalRounds,
            sackingEnabled: ds.meta.sackingEnabled !== false,
            reputationWage: managerWeeklyWage(squad ? wageRevenueBasisOf(squad) : 0, rep),
          });
          ds.job.renewal = day.renewal;
          ds.job.notices = day.notices;
          if (day.message) {
            ds.boardMessages.push({
              date: currentDate, kind: day.message.kind, board: Math.round(ds.board.board),
              ...(day.message.contract ? { contract: day.message.contract } : {}),
            });
          }
        }
      }
      ds.job.contract = contract;
      ds.job.kept = ds.job.offers;
      ds.job.newOffers = newOffers;
      if (newOffers.length > 0) ds.job.offers = mergeOffers(ds.job.offers, newOffers);
    }

    // ── World awards (`.claude/rules/game/awards.md` §5): January, once per year, after the rollovers ──
    {
      const msg = await runWorldCeremony(saveService, saveId, currentDate, {
        managers: () => managerTracker.list(),
        applyManagers: (fn) => managerTracker.apply(fn),
        humanClubIds: new Set(daySeats.flatMap((ds) => (ds.clubId && !ds.job.ended && !ds.job.unemployed ? [ds.clubId] : []))),
      });
      // The world ceremony is news for every seat.
      if (msg) for (const ds of daySeats) ds.deferred.awards.push(msg);
      const worldSeatId = seatIdOfManager(msg?.world?.manager[0]?.id ?? "");
      if (worldSeatId) {
        standingExtra(daySeats.find((d) => d.seatId === worldSeatId), { key: "world_manager", points: STANDINGS.WORLD_MANAGER });
      }
      if (msg?.world && newsCollector) newsCollector.worldAwards = msg.world;
    }

    // ── Morale of the human club (`.claude/rules/game/morale.md`): today's matches, bids, Monday ──
    // After the market and the rollover (the squad as it ends the day); news deferred past `clearInbox`.
    // The start-kit pre-simulation (`marketFrozen`) is the world before the career: no morale yet.
    // ── The director's Monday (contracts, `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`) ──
    // Before morale: a renewed player no longer asks for a contract talk, and the director answers
    // the others' talks with his decision. The summary is deferred past `clearInbox` like the rest.
    // A seat is active today when it still has its club (not sacked today, not unemployed) and the career runs.
    const seatActive = (ds: DaySeat) =>
      !ds.job.ended && !!ds.meta.clubId && !ds.job.unemployed
      && !options.marketFrozen;
    const directorInChargeOf = (ds: DaySeat) => seatActive(ds) && directorHandlesContracts(ds.meta.responsibilities);
    for (const ds of daySeats) {
      if (!directorInChargeOf(ds) || new Date(`${currentDate}T12:00:00Z`).getUTCDay() !== 1) continue;
      const homeSlug = index.byId(ds.meta.clubId)?.leagueSlug ?? ds.meta.leagueSlug;
      const d = await applyDirectorDay(saveService, saveId, {
        clubId: ds.meta.clubId, date: currentDate,
        league: updatedActiveLeagues.find((l) => l.leagueSlug === homeSlug),
        decided: ds.meta.directorDecisions ?? {},
      });
      ds.director.decided = d.decided;
      ds.director.outcomes = d.outcomes;
      ds.director.news.push(...d.news);
    }
    // ── Coaching-staff contracts (`.claude/rules/game/staff.md`) ──
    // Every day whoever is past his contract leaves (back to the pool; a field scout's missions end);
    // on Monday, contracts within 60 days get one decision (director renews or lets go; the manager
    // is warned). When the human club's country rolls the staff ages a year (the retirement age
    // retires) and the free pool is refreshed, once per rollover date. News deferred past `clearInbox`.
    for (const ds of daySeats) {
      if (!seatActive(ds)) continue;
      const humanForStaff = await saveService.getSquadById(saveId, ds.meta.clubId);
      if (humanForStaff?.staff) {
        const homeSlug = index.byId(ds.meta.clubId)?.leagueSlug ?? ds.meta.leagueSlug;
        const r = staffContractDay({
          staff: humanForStaff.staff,
          date: currentDate,
          monday: new Date(`${currentDate}T12:00:00Z`).getUTCDay() === 1,
          seasonEnd: updatedActiveLeagues.find((l) => l.leagueSlug === homeSlug)?.end ?? currentDate,
          directorHandles: directorInChargeOf(ds),
          impliedStars: impliedStars(humanForStaff),
          clubFactor: wageFactorOf(humanForStaff),
        });
        let staff = r.staff;
        ds.staffNews = r.news;
        if (ds.rollover.seasonEnded) {
          const aged = ageStaff(staff);
          staff = aged.staff;
          ds.staffNews = [...ds.staffNews, ...aged.news];
        }
        if (staff !== humanForStaff.staff) await saveService.saveSquadById(saveId, { ...humanForStaff, staff });
        if (r.left.length > 0) {
          let pool = await saveService.getStaffPool(saveId, currentDate);
          for (const m of r.left) pool = returnToPool(pool, m, currentDate);
          await saveService.writeStaffPool(saveId, pool);
          await cancelScoutMissions(saveService, saveId, ds.seatId, r.left.filter((m) => m.role === "fieldScout").map((m) => m.id));
        }
      }
    }
    // The free staff pool is refreshed once per rollover date (`refreshPool` is idempotent on the date).
    for (const ds of daySeats) {
      if (!ds.rollover.seasonEnded) continue;
      const homeState = updatedActiveLeagues.find((l) => l.leagueSlug === ds.meta.leagueSlug);
      if (homeState) {
        const pool = await saveService.getStaffPool(saveId, currentDate);
        const { getStaffNameBook } = await import("@/backend/staffNameBook");
        const next = refreshPool(pool, saveId, String(homeState.year), currentDate, await getStaffNameBook());
        if (next !== pool) await saveService.writeStaffPool(saveId, next);
      }
    }
    for (const ds of daySeats) {
      if (!seatActive(ds)) continue;
      const decidedNow = ds.director.decided ?? ds.meta.directorDecisions ?? {};
      ds.moraleNews = [...ds.director.news, ...await applyMoraleDay(saveService, saveId, ds.seatId, {
        clubId: ds.meta.clubId, date: currentDate,
        events: dayEvents.filter((e): e is MatchEvent => e.kind === "match"),
        bids: ds.moraleBids,
        unavailable: ds.moraleUnavailable,
        seasonRolled: ds.rollover.seasonEnded,
        ...(directorInChargeOf(ds) ? { directorContractTalk: (p: RosterPlayer) => decidedNow[p.id]?.renew === true } : {}),
      })];
    }

    // ── Press conferences (Etapa 42): after the board and morale; the invite goes out after any `clearInbox` ──
    for (const ds of daySeats) {
      if (!seatActive(ds) || !ds.board) continue;
      const homeSlug = index.byId(ds.meta.clubId)?.leagueSlug ?? ds.meta.leagueSlug;
      const rolled = ds.rollover.seasonEnded
        ? { objectiveMet: ds.rollover.objectiveMet, move: ds.rollover.move, championOf: ds.rollover.championOf }
        : null;
      const pressOut = await pressDay({
        saveId, seatId: ds.seatId, service: saveService, meta: ds.meta, date: currentDate, clubId: ds.meta.clubId,
        leagueSlug: homeSlug,
        leagueState: updatedActiveLeagues.find((l) => l.leagueSlug === homeSlug),
        leagueZones: (await getLeagueData()).find((l) => l.slug === homeSlug)?.zones ?? [],
        index, board: ds.board,
        myMatches: dayEvents.filter((e): e is MatchEvent =>
          e.kind === "match" && (e.home === ds.meta.clubId || e.away === ds.meta.clubId)),
        titlesToday: ds.press.titles,
        eliminatedToday: ds.press.eliminated,
        ...(rolled
          ? { rollover: { objectiveMet: rolled.objectiveMet, move: rolled.move ? { kind: rolled.move.kind, to: rolled.move.to } : null, championOf: rolled.championOf } }
          : {}),
        matchContext: ds.press.matchContext,
      });
      ds.board = pressOut.board;
      ds.pressOut = { state: pressOut.press, ...(pressOut.invite ? { invite: pressOut.invite } : {}), news: pressOut.news };
    }

    // The world's transfer log is never cleared: a rollover drops only what no running season still covers.
    if (due.units.length > 0) {
      await saveService.writeTransfers(saveId, pruneTransferLog(await saveService.getTransfers(saveId), updatedActiveLeagues.map((l) => l.start)));
    }
    // A seat's inbox is cleared when its country rolls; the season news goes in after.
    for (const ds of daySeats) {
      if (!ds.rollover.seasonEnded) continue;
      await saveService.clearInbox(saveId, ds.seatId);
      for (const msg of ds.deferred.season) await emitInboxMessage(saveId, buildSeasonMessage(msg), saveService, ds.seatId);
      // A press conference still pending keeps its invite (stable id); a fresh one is emitted below.
      const keptPress = ds.pressOut.state?.pending;
      if (keptPress && keptPress.id !== ds.pressOut.invite?.pressId) {
        await emitInboxMessage(saveId, buildPressInviteMessage(keptPress.date, {
          pressId: keptPress.id, trigger: keptPress.trigger, kind: keptPress.kind, expires: keptPress.expires,
          ...(keptPress.params.opponent ? { opponent: keptPress.params.opponent } : {}),
        }), saveService, ds.seatId);
      }
    }
    // Friends' league standings: each season closed today (rollover) goes to every seat, after any `clearInbox`,
    // with the manager's place counting today's rows and the seats' working passages. A redone day skips an id
    // already in the inbox.
    const closedToday = standingsActive
      ? daySeats.flatMap((ds) => (ds.standingClosed ? [{ ds, row: ds.standingClosed }] : []))
      : [];
    if (closedToday.length > 0) {
      const view = await standingsView(saveService, saveId, {
        extraRows: standingRows, passages: new Map(daySeats.map((d) => [d.seatId, d.standing])),
      });
      const of = view.entries.length;
      for (const { ds: owner, row } of closedToday) {
        const rank = rankOf(view.entries, owner.seatId);
        const msg = buildSeasonClosedMessage(currentDate, {
          seatId: owner.seatId, managerName: owner.meta.manager?.name ?? "", clubName: row.clubName,
          season: row.season, points: row.total, rank: rank > 0 ? rank : of, of,
        });
        for (const ds of daySeats) {
          const inbox = await saveService.getInbox(saveId, ds.seatId);
          if (!inbox.some((m) => m.id === msg.id)) await emitInboxMessage(saveId, msg, saveService, ds.seatId);
        }
      }
    }
    // Continental "qualified"/"group" news, queued above (self-heal / regeneration): always after
    // any `clearInbox` this same day, whether or not it was the player's own country that rolled.
    for (const ds of daySeats) {
      for (const msg of ds.deferred.continental) await emitInboxMessage(saveId, buildContinentalMessage(msg), saveService, ds.seatId);
    }
    // Each seat club's league games moved today (draws / rollover): one message, after any `clearInbox`.
    for (const ds of rescheduleMoves.length > 0 ? daySeats : []) {
      if (!ds.clubId || ds.job.ended) continue;
      const catalog = await getLeagueData();
      const games = rescheduledGamesOf(
        rescheduleMoves, ds.clubId,
        (id) => index.byId(id)?.name ?? id,
        (slug) => competitionName(slug, catalog as unknown as LeagueData[], "en"),
      );
      if (games.length > 0) await emitInboxMessage(saveId, buildScheduleMessage(currentDate, games), saveService, ds.seatId);
    }
    // Negative-balance news (queued above, same reason): always after any `clearInbox` this day.
    for (const ds of daySeats) {
      if (ds.deferred.negativeBalance) {
        await emitInboxMessage(saveId, buildSeasonMessage(ds.deferred.negativeBalance), saveService, ds.seatId);
      }
    }
    // Injury/return news (queued above, same reason): always after any `clearInbox` this day.
    for (const ds of daySeats) {
      for (const msg of ds.deferred.injury) await emitInboxMessage(saveId, buildInjuryMessage(msg), saveService, ds.seatId);
      for (const msg of ds.deferred.contract) await emitInboxMessage(saveId, buildContractMessage(msg), saveService, ds.seatId);
      for (const msg of buildStaffContractMessages(currentDate, ds.staffNews)) await emitInboxMessage(saveId, msg, saveService, ds.seatId);
      if (ds.director.outcomes.length > 0) {
        await emitInboxMessage(saveId, buildDirectorSummaryMessage({ date: currentDate, outcomes: ds.director.outcomes }), saveService, ds.seatId);
      }
    }
    for (const ds of daySeats) {
      for (const msg of ds.deferred.youth) await emitInboxMessage(saveId, buildYouthMessage(msg), saveService, ds.seatId);
    }
    // Each seat's national news: its club's call-ups and returns, its manager's national team.
    for (const ds of daySeats) {
      const nat = nationalDay.bySeat[ds.seatId];
      if (!nat) continue;
      for (const news of nat.news) await emitInboxMessage(saveId, buildNationalMessage(news), saveService, ds.seatId);
      for (const news of nat.coachNews) await emitInboxMessage(saveId, buildNationalCoachMessage(news), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      if (ds.registrationNotices.length === 0 || !ds.clubId || options.marketFrozen) continue;
      const humanNow = await saveService.getSquadById(saveId, ds.clubId);
      const nameOf = (id: string) => humanNow?.players.find((p) => p.id === id)?.name ?? id;
      const catalog = await getLeagueData();
      for (const notice of ds.registrationNotices) {
        await emitInboxMessage(saveId, buildRegistrationMessage({
          date: currentDate,
          notice,
          competitionName: competitionName(notice.competition, catalog as unknown as LeagueData[], "en"),
          ...(notice.playerIds ? { players: notice.playerIds.map((id) => ({ id, name: nameOf(id) })) } : {}),
        }), saveService, ds.seatId);
      }
    }
    for (const ds of daySeats) {
      for (const msg of ds.deferred.facility) await emitInboxMessage(saveId, buildFacilityMessage(msg), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      for (const msg of ds.deferred.retirement) await emitInboxMessage(saveId, buildRetirementMessage(msg), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      for (const msg of ds.scouting?.messages ?? []) await emitInboxMessage(saveId, buildScoutingMessage(msg), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      for (const msg of ds.deferred.negotiation) await emitInboxMessage(saveId, buildTransferNegotiationMessage(msg), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      for (const msg of ds.moraleNews) await emitInboxMessage(saveId, buildPlayerMessage(msg), saveService, ds.seatId);
    }
    // Talk requests still open when the inbox was cleared keep their message (stable id per talk).
    for (const ds of daySeats) {
      if (!ds.rollover.seasonEnded) continue;
      // Talk requests still open when the inbox was cleared keep their message (stable id per talk).
      if (ds.clubId && !ds.job.ended) {
        const humanT = await saveService.getSquadById(saveId, ds.clubId);
        const freshTalks = new Set(ds.moraleNews.map((n) => n.talkId).filter(Boolean));
        for (const talk of humanT?.moraleClub?.talks ?? []) {
          if (freshTalks.has(talk.id)) continue;
          await emitInboxMessage(saveId, buildPlayerMessage({
            date: talk.date, kind: "talk", playerId: talk.playerId, playerName: talk.playerName, reason: talk.reason,
            talkId: talk.id, ...(talk.clubName ? { clubName: talk.clubName } : {}),
          }), saveService, ds.seatId);
        }
      }
      // Bids still pending when the inbox was cleared keep their message (like job offers).
      const mkB = await saveService.getMarket(saveId, ds.seatId);
      const humanB = ds.meta.clubId ? await saveService.getSquadById(saveId, ds.meta.clubId) : null;
      const fresh = new Set(ds.deferred.negotiation.map((n) => n.bidId).filter(Boolean));
      for (const bid of liveBids(mkB?.pendingBids, currentDate, humanB)) {
        if (fresh.has(bid.id)) continue;
        await emitInboxMessage(saveId, buildTransferNegotiationMessage({
          date: bid.date, kind: bid.kind === "loan" ? "loan_bid" : "bid", bidId: bid.id,
          playerId: bid.playerId, playerName: bid.playerName, clubName: bid.clubName, fee: bid.fee,
          ...(bid.sellOnPct ? { sellOnPct: bid.sellOnPct } : {}),
          ...(bid.wageShare !== undefined ? { wageShare: bid.wageShare } : {}),
          ...(bid.until ? { until: bid.until } : {}),
          expires: bid.expires,
        }), saveService, ds.seatId);
      }
    }
    for (const ds of daySeats) {
      for (const msg of ds.boardMessages) await emitInboxMessage(saveId, buildBoardMessage(msg), saveService, ds.seatId);
      if (ds.managerBanGiven) await emitInboxMessage(saveId, buildManagerBanMessage(currentDate, ds.managerBanGiven), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      // Offers still pending when the inbox was cleared keep their message.
      if (ds.rollover.seasonEnded) {
        const fresh = new Set(ds.job.newOffers.map((o) => o.squadId));
        for (const offer of ds.job.kept) {
          if (!fresh.has(offer.squadId)) await emitInboxMessage(saveId, buildJobMessage({ date: offer.date, kind: "offer", offer }), saveService, ds.seatId);
        }
      }
      for (const offer of ds.job.newOffers) {
        await emitInboxMessage(saveId, buildJobMessage({ date: currentDate, kind: "offer", offer }), saveService, ds.seatId);
      }
    }
    for (const ds of daySeats) {
      for (const r of ds.deferred.clubRecords) await emitInboxMessage(saveId, buildClubRecordMessage(currentDate, r), saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      for (const msg of ds.deferred.awards) await emitInboxMessage(saveId, msg, saveService, ds.seatId);
    }
    for (const ds of daySeats) {
      if (ds.pressOut.invite) await emitInboxMessage(saveId, ds.pressOut.invite, saveService, ds.seatId);
    }
    // ── World news of the day (`press.md` → "Notícias"): one build + append, press news included ──
    if (newsCollector) {
      await writeDayNews(saveService, saveId, await collectDayNews({
        // Every seat's club and leagues count as near.
        service: saveService, saveId, date: currentDate, index,
        seats: daySeats.map((ds) => ({ clubId: ds.clubId, leagueSlug: ds.meta.leagueSlug, followedLeagues: ds.meta.followedLeagues })),
        catalog: await getLeagueData(), pyramids: await getPyramids(),
        events: dayEvents.filter((e): e is MatchEvent => e.kind === "match"),
        transfers: [...dayMoves, ...(routeLog?.transfers ?? [])],
        managers: aiDesk?.worldNews() ?? [],
        national: nationalDay.headlines,
        press: daySeats.flatMap((ds) => ds.pressOut.news),
        collector: newsCollector,
        squadOf: async (id) => squadWrites.get(id)?.squad ?? (await saveService.getSquadById(saveId, id)),
      }));
    }

    // ── Achievements of each seat's manager (`.claude/rules/game/achievements.md`): last, over the whole day ──
    for (const ds of options.marketFrozen ? [] : daySeats) {
      // The seat's national game of the day.
      const natDay = nationalDay.bySeat[ds.seatId];
      const national = natDay?.humanMatch
        ? await achievementNationalMatch(saveService, saveId, natDay.humanMatch, natDay.humanTeamId ?? natDay.humanMatch.home, ds.meta.manager?.nationalityIso)
        : null;
      const msg = await achievementsDay(saveService, saveId, ds.seatId, {
        date: currentDate,
        clubId: ds.clubId ?? "",
        events: dayEvents.filter((e): e is MatchEvent => e.kind === "match"),
        managers: await managerTracker.list(),
        index,
        squadOf: (id) => saveService.getSquadById(saveId, id),
        ...(ds.rollover.seasonEnded ? { rollover: { championOf: ds.rollover.championOf, moves: ds.rollover.moves, objectiveMet: ds.rollover.objectiveMet } } : {}),
        sacked: !!ds.job.ended && ds.job.ended.reason !== "contract",
        leftClub: !!ds.job.ended,
        ...(national ? { nationalMatch: national } : {}),
      });
      if (msg) {
        ds.achievementsUnlocked = msg.category === "achievement" ? msg.keys.length : 0;
        await emitInboxMessage(saveId, msg, saveService, ds.seatId);
      }
    }

    // Manager news of each seat's league (sackings / hirings), grouped in one message.
    for (const ds of daySeats) {
      const managerNews = aiDesk?.newsInLeague(ds.meta.leagueSlug) ?? [];
      if (managerNews.length > 0) await emitInboxMessage(saveId, buildManagerNewsMessage(currentDate, managerNews), saveService, ds.seatId);
    }

    await managerTracker.flush();
    // Tomorrow's referees, after today's matches (rest) and rollovers (renewed pools): the preview reads them.
    await ensureTomorrow(saveService, saveId, currentDate);
    await saveService.appendDayTransfers(saveId, currentDate, dayMoves);

    // World keys of the day; each seat's keys go into its `DaySeat.patch`.
    const metaPatch: Partial<SaveMeta> = {};
    if (freeAgentsRetiredYear !== undefined) metaPatch.freeAgentsRetiredYear = freeAgentsRetiredYear;

    // Old day logs lose the detail no screen reads any more (training lines, AI match player stats): the save no
    // longer grows ~130 MB a season (tester-report save analysis).
    {
      const target = addDays(currentDate, -DAY_LOG_KEEP_FULL_DAYS);
      let d = world.dayLogsCompactedTo ? addDays(world.dayLogsCompactedTo, 1) : addDays(currentDate, -DAY_LOG_COMPACT_LOOKBACK_DAYS);
      let done = 0, last: string | undefined;
      const humans = humanClubSet(daySeats);
      while (d <= target && done < DAY_LOG_COMPACT_PER_DAY) {
        const log = await saveService.getDayLog(saveId, d);
        if (log) {
          const compacted = compactDayLog(log, humans);
          if (compacted) { await saveService.writeDayLog(saveId, d, compacted); done += 1; }
        }
        last = d;
        d = addDays(d, 1);
      }
      if (last) metaPatch.dayLogsCompactedTo = last;
    }
    if (pendingTitlesChanged) metaPatch.pendingTitles = pendingTitles;
    if (managerTracker.weightsChanged()) metaPatch.managerWeights = managerTracker.weights();

    // Each seat's national-team wage (Mondays).
    for (const ds of daySeats) ds.managerEarned += nationalDay.bySeat[ds.seatId]?.earned ?? 0;
    if (aiDesk?.vacanciesChanged()) metaPatch.managerVacancies = aiDesk.vacancies();

    // Board, press, ban, earnings and the director's decisions, per seat.
    for (const ds of daySeats) {
      // Man-marking is chosen per match day (player instructions): the advance clears it.
      if (ds.meta.matchMarking) ds.patch.matchMarking = undefined;
      if (ds.board) ds.patch.board = ds.board;
      if (ds.pressOut.state) ds.patch.press = ds.pressOut.state;
      if (ds.managerBan !== ds.meta.managerBan) ds.patch.managerBan = ds.managerBan;
      if (ds.managerEarned > 0) ds.patch.managerEarnings = (ds.meta.managerEarnings ?? 0) + ds.managerEarned;
      if (ds.director.decided) ds.patch.directorDecisions = ds.director.decided;
    }
    // Youth call-ups used today, per seat (`.claude/rules/game/youth-competitions.md` → convocação).
    for (const ds of daySeats) {
      const yd = youthDay.bySeat[ds.seatId];
      if (!yd || yd.consumedCallUps.length === 0) continue;
      const callUps = { ...ds.meta.youthCallUps };
      const skipped = { ...ds.meta.youthCallUpsSkipped };
      const humanNow = ds.clubId
        ? (squadWrites.get(ds.clubId)?.squad ?? (await saveService.getSquadById(saveId, ds.clubId)))
        : null;
      for (const age of yd.consumedCallUps) {
        // Each call-up counts the game down by its duration (`youthComps/callUps.ts`).
        const ratings = yd.humanRatings[age];
        const left = humanNow
          ? advanceCallUps(callUps[age] ?? [], ratings ? new Map(Object.entries(ratings)) : null, callUpEligibleIds(humanNow, age))
          : [];
        if (left.length > 0) callUps[age] = left;
        else delete callUps[age];
        const ids = yd.skippedCallUps[age] ?? [];
        if (ids.length > 0) skipped[age] = { date: currentDate, players: ids };
        else delete skipped[age];
      }
      ds.patch.youthCallUps = callUps.u21?.length || callUps.u19?.length ? callUps : undefined;
      ds.patch.youthCallUpsSkipped = skipped.u21 || skipped.u19 ? skipped : undefined;
    }
    // The job of each seat: offers, mid-season window, unemployment, the contract; a sacking clears the club's keys.
    for (const ds of daySeats) {
      const job = ds.job;
      if (job.offers.length !== job.offersBefore.length || job.newOffers.length > 0) ds.patch.jobOffers = job.offers;
      if (job.midSeason !== ds.meta.jobsMidSeason) ds.patch.jobsMidSeason = job.midSeason;
      if (job.unemployed !== ds.meta.unemployed) ds.patch.unemployed = job.unemployed;
      if (job.renewal !== ds.meta.managerRenewal) ds.patch.managerRenewal = job.renewal;
      if (job.contract && job.contract !== ds.meta.managerContract) ds.patch.managerContract = job.contract;
      if (job.notices !== ds.meta.managerContractNotices) ds.patch.managerContractNotices = job.notices;
      if (job.ended) {
        ds.patch.managerContract = undefined;
        ds.patch.managerRenewal = undefined;
        ds.patch.managerContractNotices = undefined;
        // Without a club: the career follows nobody until an offer is accepted.
        ds.patch.clubId = "";
        ds.patch.board = undefined;
        ds.patch.press = undefined;
        ds.patch.rotationOverride = undefined;
        ds.patch.youthCallUps = undefined;
        ds.patch.youthCallUpsSkipped = undefined;
        continue;
      }
      // The career follows the club to its new league (also repairs a seat left stale by a partial flush).
      const seatHome = ds.clubId ? index.byId(ds.clubId)?.leagueSlug : undefined;
      if (seatHome && seatHome !== ds.meta.leagueSlug) {
        const catalog = await getLeagueData();
        ds.patch.leagueSlug = seatHome;
        ds.patch.leagueName = (await leagueNameResolver(updatedActiveLeagues))(seatHome);
        ds.patch.followedLeagues = sanitizeFollowedLeagues(
          ds.meta.followedLeagues ?? [], new Set(catalog.map((l) => l.slug)), seatHome,
        );
      }
    }

    // ── Next currentDate: always the next day (no season jump) ─────────────────
    // World and seats written apart (the seats in phase 1 of the flush, the world meta last).
    // The standings rows closed today (idempotent by id: a replayed day writes nothing new), then each passage.
    if (standingsActive) {
      await appendSeatSeasons(saveService, saveId, standingRows);
      for (const ds of daySeats) if (ds.standing !== ds.meta.standing) ds.patch.standing = ds.standing;
    }
    for (const ds of daySeats) {
      if (Object.keys(ds.patch).length > 0) await saveService.updateSeat(saveId, ds.seatId, ds.patch);
    }
    const updatedMeta = await saveService.updateMeta(saveId, {
      ...metaPatch,
      currentDate: nextDate,
      activeLeagues: updatedActiveLeagues.length > 0 ? updatedActiveLeagues : undefined,
    });

    const resolved = await saveService.resolveDayLog(saveId, currentDate);
    const transferEvents = (resolved?.events ?? []).filter((e) => e.kind === "transfer");
    const seats: Record<string, Record<string, unknown>> = {};
    for (const ds of daySeats) {
      // Club offers and national-team offers of the seat (the fast-forward stops).
      const offers = ds.job.newOffers.length + (nationalDay.bySeat[ds.seatId]?.offers ?? 0);
      seats[ds.seatId] = {
        ...(ds.rollover.seasonEnded
          ? { seasonEnded: true as const, archiveYear: ds.rollover.archiveYear, moves: ds.rollover.moves, playerMove: ds.rollover.move, playerChampionOf: ds.rollover.championOf }
          : {}),
        ...(ds.job.ended ? { sacked: true as const } : {}),
        ...(offers > 0 ? { jobOffers: offers } : {}),
        ...(ds.job.renewal && ds.job.renewal !== ds.meta.managerRenewal && !ds.job.ended ? { renewalOffer: true as const } : {}),
        ...(ds.achievementsUnlocked > 0 ? { achievements: ds.achievementsUnlocked } : {}),
        ...(ds.pressOut.invite ? { pressInvite: true as const } : {}),
      };
    }
    return {
      ok: true,
      payload: { ...dayLog, events: [...dayLog.events, ...transferEvents], newDate: updatedMeta.currentDate },
      seats,
      ...(seatOfferNudges.size > 0 ? { seatOfferNudges: [...seatOfferNudges] } : {}),
      ...(standingRows.length > 0 ? { standingsChanged: true } : {}),
    };
}

/**
 * The world's start (start kit, rescheduling, youth and national safety nets, the season-start news): once per world.
 * The caller holds the save lock (`.claude/rules/game/multiplayer.md`).
 */
export async function presimulateWorld(
  saveId: string, ownerSeatId: string | null,
): Promise<{ applied: boolean; kit?: string; reason?: string }> {
  if ((await saveService.getMeta(saveId))?.presimulated) return { applied: false, reason: "already presimulated" };
  // Apply a pre-computed start kit (instant). The live full-pipeline catch-up
  // (presimulatePreStart) is reserved for the offline kit generator — running it
  // here would block for minutes.
  const result = await applyRandomStartKit(saveId);

  // A kit's calendars come from its own pre-simulation (older kits never rescheduled clashing league games):
  // run the whole-world pass again from today (`.claude/rules/game/rescheduling.md`). Silent: the career starts now.
  if (result.applied) {
    const m = await saveService.getMeta(saveId);
    if (m?.currentDate) {
      try {
        const r = await rescheduleFixtureConflicts({ service: saveService, saveId, minDate: m.currentDate, catalog: await getLeagueData() });
        for (const { seatId } of await saveService.listSeats(saveId)) {
          await syncPlayerRestDays(saveService, saveId, seatId, r.moves);
        }
      } catch (e) {
        logError("calendar", `save ${saveId}: failed to reschedule clashing league games after the start kit`, e);
      }
    }
  }

  // Youth competitions safety net (`.claude/rules/game/youth-competitions.md` → "Criação"): an old
  // kit without them, or no kit with past rounds of the European ones, rebuilds them from tomorrow.
  {
    const m = await saveService.getMeta(saveId);
    if (m?.currentDate) {
      try {
        await ensureYouthCompetitions({
          service: saveService, saveId, today: m.currentDate, index: await saveService.getSquadIndex(saveId),
          catalog: await getLeagueData(), pyramids: await getPyramids(), activeLeagues: m.activeLeagues ?? [],
        });
      } catch (e) {
        logError("youthComps", `save ${saveId}: failed to ensure the youth competitions`, e);
      }
    }
  }

  // National teams safety net (`.claude/rules/game/national-teams.md`): no kit for a Brazilian career leaves the
  // world drawn from the world's start, with past games; it is drawn again from the career's day.
  {
    const m = await saveService.getMeta(saveId);
    if (m?.currentDate) {
      try {
        await ensureNationalWorld({ service: saveService, saveId, today: m.currentDate, index: await saveService.getSquadIndex(saveId) });
      } catch (e) {
        logError("national", `save ${saveId}: failed to ensure the national teams`, e);
      }
    }
  }

  // Continental season-start news, read from whatever is on disk AFTER the kit decision above
  // (see emitContinentalSeasonStartNews) — covers both the "kit applied" and "no kit" paths. Every seat gets its own.
  for (const { seatId, seat } of await saveService.listSeats(saveId)) {
    if (!seat.clubId || seat.unemployed) continue;
    const date = (await saveService.getMeta(saveId))?.currentDate;
    if (!date) continue;
    try {
      await emitContinentalSeasonStartNews(saveId, seatId, seat.clubId, date);
    } catch (e) {
      logError("continental", `save ${saveId}: failed to emit continental season-start news`, e);
    }
  }
  // The owner's first board objective (members get theirs from `addSeat`); the public world has no owner.
  const owner = ownerSeatId ? await saveService.getSeatMeta(saveId, ownerSeatId) : null;
  if (owner?.currentDate && owner.board?.objective) {
    const catalog = await getLeagueData();
    await emitInboxMessage(saveId, buildBoardMessage({
      date: owner.currentDate, kind: "objective", objective: owner.board.objective,
      leagueName: competitionName(owner.board.objective.leagueSlug, catalog as unknown as LeagueData[], "en"),
    }), saveService, ownerSeatId!);
  }

  // Friends' league standings (part 5a): every seat with a club opens its passage now, after the kit (it may move the
  // date and the board's objective). A member's lobby passage (`addSeat`) is opened again: nothing was played yet.
  if (await standingsOn(saveService, saveId)) {
    const date = (await saveService.getMeta(saveId))?.currentDate;
    for (const { seatId, seat } of date ? await saveService.listSeats(saveId) : []) {
      if (!seat.clubId || seat.unemployed) continue;
      await saveService.updateSeat(saveId, seatId, {
        standing: newPassage({ date: date!, clubId: seat.clubId, clubName: seat.clubName, leagueSlug: seat.leagueSlug, board: seat.board }),
      });
    }
  }

  await saveService.updateMeta(saveId, { presimulated: true });
  return result;
}

export const advanceDayRoutes = {
  "/api/saves/:saveId/presimulate": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const auth = requireSeat(req, req.params.saveId!);
    if (auth instanceof Response) return auth;
    const saveId = req.params.saveId!;
    // The world's start: the owner's, once (`.claude/rules/game/multiplayer.md`). A second call is a no-op.
    if (auth.role !== "owner") return Response.json({ error: "only the owner starts a world" }, { status: 403 });
    return withSaveLock(saveId, async () => {
      // A world of friends starts through `POST /api/worlds/:saveId/start` (part 2), which also opens it.
      if ((await saveService.getMeta(saveId))?.world?.phase === "lobby") {
        return Response.json({ error: "useWorldStart" }, { status: 409 });
      }
      return Response.json(await presimulateWorld(saveId, auth.seatId));
    });
  },

  "/api/advance-day/:saveId": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }

    const auth = requireSeat(req, req.params.saveId!);
    if (auth instanceof Response) return auth;
    // A world of friends in the lobby does not move until the owner starts it (multiplayer part 2).
    const worldMeta = await saveService.getMeta(req.params.saveId!);
    if (worldMeta?.world?.phase === "lobby") {
      return Response.json({ error: "lobby" }, { status: 409 });
    }
    // A group world advances by the ready marks (multiplayer part 3), never by one seat's request.
    if (worldMeta && isGroupWorld(worldMeta)) return Response.json({ error: "groupAdvance" }, { status: 409 });

    // ── Parse body ──────────────────────────────────────────────────────────
    let playedMatchOverride: PlayedMatchRecording | null = null;
    const rawBody = await req.text();
    if (rawBody) {
      let parsed: { playedMatch?: PlayedMatchRecording } | null = null;
      try {
        parsed = JSON.parse(rawBody) as { playedMatch?: PlayedMatchRecording };
      } catch {
        return Response.json({ error: "invalid JSON body" }, { status: 400 });
      }

      if (parsed?.playedMatch !== undefined) {
        const pm = validatePlayedMatch(parsed.playedMatch);
        if (!pm) {
          return Response.json(
            { error: "playedMatch payload failed validation — refusing to simulate headlessly" },
            { status: 400 },
          );
        }
        playedMatchOverride = pm;
      }
    }
    // A renewal offer of the board waits for an answer before the day moves (4.41.4); a match already played live
    // is still recorded.
    if (!playedMatchOverride && renewalPending((await saveService.getSeat(req.params.saveId!, auth.seatId))?.managerRenewal, worldMeta?.currentDate)) {
      return Response.json({ error: "renewalPending" }, { status: 409 });
    }

    // Serialise days per save: a second request for the same save waits until the
    // first has flushed, so it reads the advanced state instead of racing it.
    const saveId = req.params.saveId!;
    // The seat's live recording (a seat records only its own match).
    const recordings: Record<string, PlayedMatchRecording> = playedMatchOverride ? { [auth.seatId]: playedMatchOverride } : {};
    return withSaveLock(saveId, async () => {
      const outcome = await runBufferedDay(saveId, recordings);
      if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
      return Response.json(payloadForSeat(outcome, auth.seatId));
    });
  },

  "/api/saves/:saveId/days/:date": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const { saveId, date } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    const resolved = await saveService.resolveDayLog(saveId!, date!, auth.seatId);
    if (!resolved) return Response.json({ error: "day log not found" }, { status: 404 });
    return Response.json(resolved);
  },

  "/api/saves/:saveId/day-type/:date": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "PATCH") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const { saveId, date } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    const body = (await req.json()) as { type?: string };
    if (body.type !== "training" && body.type !== "rest") {
      return Response.json({ error: "type must be 'training' or 'rest'" }, { status: 400 });
    }
    // The seat's own rest days (`.claude/rules/game/multiplayer.md`).
    const seat = await saveService.getSeat(saveId!, auth.seatId);
    if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
    const current = new Set(seat.restDays ?? []);
    if (body.type === "rest") current.add(date!);
    else current.delete(date!);
    const restDays = Array.from(current).sort();
    await saveService.updateSeat(saveId!, auth.seatId, { restDays });
    return Response.json({ restDays });
  },
};

/** His national game of the day for the achievements (`nationalWins`, `against_homeland`). */
async function achievementNationalMatch(service: SaveService, saveId: string, event: MatchEvent, teamId: string, iso: string | undefined) {
  const teams = (await service.getNationalState(saveId))?.teams ?? {};
  return { event, teamId, homeland: managerNation(iso), nationOf: (id: string) => teams[id]?.nation ?? id };
}
