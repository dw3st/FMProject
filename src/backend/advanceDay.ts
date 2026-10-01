import { fileURLToPath } from "node:url";
import { randomUUID } from "crypto";
import { saveService, SaveService, type SaveMeta } from "@/backend/SaveService";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { withSaveLock } from "@/backend/saveLock";
import { applyRandomStartKit } from "@/backend/startKits";
import { executeTransferFee, recordMoney } from "@/backend/FinancialService";
import type { FreeAgent, LeagueData, LeagueTeam, Squad, StandingRow } from "@/types/playerTypes";
import { CONTRACT_CONFIG } from "@/Domain/contracts/contractConfig";
import { addDaysIso, addYearsIso } from "@/Domain/contracts/contracts";
import { processContractExpiries } from "@/Domain/contracts/expiry";
import type { ClubMove, Pyramids } from "@/types/pyramidTypes";
import type { StoredDayLog, TrainingEvent, RestEvent } from "@/types/dayLogTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { ContinentalSlug, Fixture, LeagueSeasonMeta, LeagueSeasonState } from "@/types/calendarTypes";
import { findPlayerSquad, isPlayerSquadId } from "@/Domain/clubLookup";
import {
  emitInboxMessage,
  buildContinentalMessage,
  buildCupMessage,
  buildDevelopmentMessage,
  buildInjuryMessage,
  buildContractMessage,
  buildTransferInMessage,
  buildTransferOutMessage,
  buildSeasonMessage,
} from "@/Domain/inbox/inboxEvents";
import {
  addOneDay,
  buildMatchEvent,
  buildMatchEventFromRecording,
  buildQuickMatchEvent,
  buildRestEvent,
  buildTrainingEvent,
  computeAdvanceDayMoney,
  resolveSimMode,
  resolveTrainingPolicy,
  type PlayedMatchRecording,
  type PlayerHomeFixtureToday,
} from "@/Domain/advanceDay";
import { computeMatchSimulationLineups } from "@/Domain/advanceDay/matchSimulationLineups";
import { defaultRng } from "@/Domain/transfer/transferNeeds";
import { dailyMarketTick, initMarketState } from "@/Domain/transfer/marketRotation";
import { freeAgentTick, refillSquad } from "@/Domain/contracts/freeAgents";
import { defaultSeasonEnd } from "@/Domain/contracts/contracts";
import { applyPlayerBroadcastingCredit, buildNextSeasonCalendar, runSeasonTransition } from "@/Domain/season";
import { findDueRollovers, planCountryRollover } from "@/Domain/season/countryRollover";
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
import { requireSaveOwner } from "@/backend/auth/middleware";
import { computeStandings } from "@/Domain/season/computeStandings";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import { debugLog, logError, logSeason, LOG_NS_SEASON } from "@/Logger";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import { countriesToRegenerate, buildCupArchive } from "@/Domain/cups/cupRollover";
import { advanceCupStages, countryByLeague, createCountryCup, cupPrizeBase, playerCupSlug } from "@/backend/cupWorld";
import { competitionName } from "@/Domain/world/labels";
import type { GateKind } from "@/Domain/finance/gate";
import { carryForwardWageFactor, clubAnnualRevenue, clubWageFactor, pullWageFactorToTarget, squadCurveBill } from "@/Domain/finance/wages";
import { isContinentalSlug, competitionsOf } from "@/Domain/continental/competitions";
import { withAggregate } from "@/Domain/continental/knockout";
import { continentsToRegenerate as continentsToRegenerateContinental, buildContinentalArchive } from "@/Domain/continental/continentalProgress";
import {
  advanceContinentalStages,
  createContinentalSeason,
  continentalClubStatus,
  continentalGoodClubsThisSeason,
  continentalQualificationOf,
  continentalTier1LeagueStates,
  logEuropeanCalendarClashes,
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
  | { ok: true; payload: Record<string, unknown> };

/**
 * One day as a unit of work: a fresh BufferingSaveDAL, `advanceOneDay` against it, then one
 * flush (meta last). A failed day (`!ok`) flushes nothing; a flush error is a 500 and, since meta
 * is written last, `currentDate` was not advanced. The caller holds `withSaveLock`.
 * Shared by `POST /api/advance-day/:saveId` and `POST /api/saves/:saveId/advance-until`.
 */
export async function runBufferedDay(
  saveId: string,
  playedMatchOverride: PlayedMatchRecording | null = null,
): Promise<AdvanceDayOutcome> {
  // Each squad is read at most once and written once.
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const dayService = new SaveService(buffer);
  const outcome = await advanceOneDay(dayService, saveId, playedMatchOverride);
  if (!outcome.ok) return outcome;
  try {
    await buffer.flush();
  } catch (err) {
    const errors = err instanceof AggregateError ? err.errors : [err];
    for (const e of errors) logError("advance-day", `failed to persist day for save ${saveId}`, e);
    return { ok: false, status: 500, error: "failed to persist day" };
  }
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
    const outcome = await advanceOneDay(service, saveId, null, { marketFrozen: true });
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
  }), saveService);

  if (status.kind === "group") {
    const opponentNames = status.opponentIds.map((id) => index.byId(id)?.name ?? id);
    await emitInboxMessage(saveId, buildContinentalMessage({
      date, kind: "group", competition: slug, competitionName: compName, stage: "group",
      group: status.group, opponentNames,
    }), saveService);
  } else if (status.kind === "eliminatedGroup") {
    await emitInboxMessage(saveId, buildContinentalMessage({
      date, kind: "eliminated", competition: slug, competitionName: compName, stage: "group",
    }), saveService);
  } else {
    const opponentName = index.byId(status.opponentId)?.name ?? status.opponentId;
    await emitInboxMessage(saveId, buildContinentalMessage({
      date, kind: "draw", competition: slug, competitionName: compName, stage: status.stage,
      opponentName, firstLegDate: status.firstLegDate, venue: status.venue,
    }), saveService);
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
  playedMatchOverride: PlayedMatchRecording | null = null,
  options: AdvanceOneDayOptions = {},
): Promise<AdvanceDayOutcome> {
    // ── Load core state ──────────────────────────────────────────────────────
    const meta = await saveService.getMeta(saveId);
    if (!meta) return { ok: false, status: 404, error: "save not found" };
    if (!meta.currentDate) return { ok: false, status: 400, error: "save has no currentDate" };

    const currentDate = meta.currentDate;
    const nextDate = addOneDay(currentDate);
    const activeLeagues = meta.activeLeagues ?? [];

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
    > = [];
    // The player's club home fixtures today, across every competition (league, cup, continental —
    // see computeAdvanceDayMoney / .claude/rules/game/finances.md). Filled while the main match
    // loop below processes each competition's rounds for the day.
    const playerHomeFixturesToday: Array<{ competition: string; kind: GateKind; neutral?: boolean }> = [];

    const tactics = await saveService.getTactics(saveId);

    // Membership comes from the save's squad folders. Built once for the day's matches and
    // training; only the season rollover changes it, and it re-reads the index right after.
    let index = await saveService.getSquadIndex(saveId);

    // The player's squad: meta.clubId is the squadId.
    const playerEntry = index.byId(meta.clubId);
    const playerSquadId: string | undefined = playerEntry?.squadId;

    // Cup ties run in the full engine only when a club of the player's league is involved.
    const playerLeagueClubs = new Set(index.inLeague(meta.leagueSlug).map((t) => t.squadId));

    // ── Get today's fixtures across all leagues ──────────────────────────────
    const activeRoundsForDate = await saveService.getActiveRoundsForDate(saveId, currentDate);

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

          const [homeSquad, awaySquad] = await Promise.all([
            squadWrites.has(rawFixture.home)
              ? Promise.resolve<Squad | null>(squadWrites.get(rawFixture.home)!.squad)
              : saveService.getSquadById(saveId, rawFixture.home),
            squadWrites.has(rawFixture.away)
              ? Promise.resolve<Squad | null>(squadWrites.get(rawFixture.away)!.squad)
              : saveService.getSquadById(saveId, rawFixture.away),
          ]);
          if (!homeSquad || !awaySquad) continue;

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

          const userPlaysThis = fixture.home === playerSquadId || fixture.away === playerSquadId;
          if (fixture.home === playerSquadId) {
            const gateKind: GateKind = isContinentalSlug(leagueSlug) ? "continental" : isCupSlug(leagueSlug) ? "cup" : "league";
            playerHomeFixturesToday.push({ competition: leagueSlug, kind: gateKind, neutral: fixture.neutral === true });
          }
          const useRecording =
            playedMatchOverride !== null &&
            playedMatchOverride.fixtureId === fixture.id &&
            userPlaysThis;

          if (useRecording && playedMatchOverride) {
            const result = playedMatchOverride.score;
            const level =
              result.home + (fixture.aggregate?.home ?? 0) === result.away + (fixture.aggregate?.away ?? 0);
            if (fixture.knockout && level) {
              const pens = playedMatchOverride.decider?.penalties;
              if (!pens || pens.home === pens.away) {
                return { ok: false, status: 400, error: "knockout recording without a winner" };
              }
            }
            const r = buildMatchEventFromRecording(fixture, homeSquad, awaySquad, playedMatchOverride);
            dayEvents.push(r.event);
            squadWrites.set(rawFixture.home, { league: homeEntry.leagueSlug, club: homeEntry.stem, squad: r.updatedHome });
            squadWrites.set(rawFixture.away, { league: awayEntry.leagueSlug, club: awayEntry.stem, squad: r.updatedAway });
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
            playedMatchOverride = null;
          } else {
            const sim = computeMatchSimulationLineups(fixture, homeSquad, awaySquad, playerSquadId, tactics, meta.rotationOverride);
            const userPlays = fixture.home === playerSquadId || fixture.away === playerSquadId;
            const mode = userPlays
              ? "full"
              : isKnockoutComp(leagueSlug)
                ? (playerLeagueClubs.has(fixture.home) || playerLeagueClubs.has(fixture.away) ? "full" : "fast")
                : resolveSimMode(leagueSlug, meta);
            const r = mode === "full"
              ? buildMatchEvent(fixture, homeSquad, awaySquad, sim)
              : buildQuickMatchEvent(fixture, homeSquad, awaySquad, sim);
            dayEvents.push(r.event);
            squadWrites.set(rawFixture.home, { league: homeEntry.leagueSlug, club: homeEntry.stem, squad: r.updatedHome });
            squadWrites.set(rawFixture.away, { league: awayEntry.leagueSlug, club: awayEntry.stem, squad: r.updatedAway });
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

    if (playedMatchOverride) {
      return {
        ok: false,
        status: 400,
        error: "playedMatch fixture does not match today's calendar or was already consumed",
      };
    }

    // ── Aggregate development messages for user's club ────────────────────────
    // One message per player per day, merging stat changes across multiple matches.
    if (playerSquadId) {
      const aggregated = new Map<
        string,
        { playerName: string; changes: Map<string, { from: number; to: number }> }
      >();

      for (const event of dayEvents) {
        if (event.kind !== "match") continue;
        const userSide =
          event.home === playerSquadId ? "home" :
          event.away === playerSquadId ? "away" : null;
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
              entry.changes.set(ch.stat, { from: ch.newValue - ch.delta, to: ch.newValue });
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
        );
      }
    }

    // ── Training / rest for non-playing teams in ALL active leagues ──────────
    // Determine if it's a rest day for the player's league
    const playerLeagueState = activeLeagues.find((l) => l.leagueSlug === meta.leagueSlug);
    const isRestDay = (playerLeagueState?.restDays ?? []).includes(currentDate);

    for (const leagueState of activeLeagues) {
      const league = leagueState.leagueSlug;
      for (const row of index.inLeague(league)) {
        if (teamsPlayingToday.has(row.squadId)) continue;
        const club = index.byId(row.squadId)!.stem;
        const squad = await saveService.getSquad(saveId, league, club);
        if (!squad) continue;

        if (isRestDay) {
          const { event, updatedSquad, healedPlayerIds } = buildRestEvent(row.squadId, squad, currentDate);
          dayEvents.push(event);
          squadWrites.set(row.squadId, { league, club, squad: updatedSquad });
          for (const playerId of healedPlayerIds) {
            const playerName = squad.players.find((p) => p.id === playerId)?.name ?? playerId;
            injuryInboxEvents.push({ kind: "returned", squadId: row.squadId, playerId, playerName });
          }
        } else {
          const policy = resolveTrainingPolicy(meta, club, row.squadId);
          const { event, updatedSquad, healedPlayerIds, newInjuries } =
            buildTrainingEvent(row.squadId, squad, policy, currentDate);
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

    // ── Injury news for the human club (match + training + return-to-play) ───
    // Not emitted yet — `clearInbox` (season rollover, further below) would wipe it if it landed
    // now. Queued into `deferredInjuryMessages` and flushed after `clearInbox`, same pattern as
    // `continentalMessages` / `negativeBalanceMessage`.
    const deferredInjuryMessages: Parameters<typeof buildInjuryMessage>[0][] = [];
    // Contract news (90-day warning, released at the rollover): same deferral, same reason.
    const deferredContractMessages: Parameters<typeof buildContractMessage>[0][] = [];
    if (playerSquadId) {
      const leagueEnd = activeLeagues.find((l) => l.leagueSlug === meta.leagueSlug)?.end;
      if (leagueEnd && currentDate === addDaysIso(leagueEnd, -CONTRACT_CONFIG.WARNING_DAYS_BEFORE)) {
        const humanSquad = await saveService.getSquadById(saveId, playerSquadId);
        const ending = (humanSquad?.players ?? []).filter((p) => p.contract && p.contract.until <= leagueEnd);
        if (ending.length > 0) {
          deferredContractMessages.push({
            date: currentDate, kind: "expiring", players: ending.map((p) => ({ id: p.id, name: p.name })),
          });
        }
      }
    }
    if (playerSquadId) {
      for (const inj of injuryInboxEvents) {
        if (inj.squadId !== playerSquadId) continue;
        deferredInjuryMessages.push(
          inj.kind === "injured"
            ? {
                date: currentDate, kind: "injured", playerId: inj.playerId, playerName: inj.playerName,
                severity: inj.severity, returnDate: inj.returnDate,
              }
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

    // ── Prize money: cup + continental (league prize is at rollover, further down) ───────────
    // Player's club → ledger `prize` entry; AI club → `aiTransferBudget`, capped
    // (`aiBudgetWithPrize` — see `.claude/rules/AI-clubs/finance.md`, design spec §3 "Premiação").
    // Read-then-write per club, sequential (never Promise.all): a club can receive more than one
    // prize the same day (e.g. continental participation + a group result), and this always runs
    // AFTER the day's match writes are flushed (`squadWrites`, above) — never races or clobbers
    // them, and any market-tick write later this same day (below) re-reads the squad fresh.
    let playerLedgerSeasonCache: number | null = null;
    const playerLedgerSeason = async (): Promise<number> => {
      if (playerLedgerSeasonCache !== null) return playerLedgerSeasonCache;
      const lm = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
      playerLedgerSeasonCache = lm?.year ?? new Date(currentDate).getFullYear();
      return playerLedgerSeasonCache;
    };
    const awardClubPrize = async (
      clubId: string, amount: number, label: string, ref?: LedgerEntry["ref"],
    ): Promise<number> => {
      if (amount <= 0) return 0;
      const entry = index.byId(clubId);
      if (!entry) return 0;
      if (clubId === playerSquadId) {
        const season = await playerLedgerSeason();
        await recordMoney(
          saveService, saveId, season,
          { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
          { date: currentDate, kind: "prize", amount, label, ...(ref ? { ref } : {}) },
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

        const winnerPrize = cupStagePrize(base, stage);
        const paidToWinner = await awardClubPrize(winnerId, winnerPrize, `${label} · ${stage}`, { competition: cSlug, stage });
        if (paidToWinner > 0) cupPrizeAwardedTo.set(winnerId, (cupPrizeAwardedTo.get(winnerId) ?? 0) + paidToWinner);

        if (stage === "final") {
          const loserPrize = cupRunnerUpPrize(base);
          const paidToLoser = await awardClubPrize(loserId, loserPrize, `${label} · runner-up`, { competition: cSlug, stage });
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
            const paid = await awardClubPrize(clubId, amount, `${label} · participation`, { competition: cSlug, stage: "group" });
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
                const paid = await awardClubPrize(clubId, amount, `${label} · group draw`, { competition: cSlug, stage: "group" });
                add(continentalPrizeAwardedTo, clubId, paid);
              }
            } else {
              const winnerId = f.result.home > f.result.away ? f.home : f.away;
              const amount = continentalPrize(compSlug, "groupWin");
              const paid = await awardClubPrize(winnerId, amount, `${label} · group win`, { competition: cSlug, stage: "group" });
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
        for (const award of continentalStagePrizesFromEvents(compSlug, events)) {
          const paid = await awardClubPrize(
            award.clubId, award.amount, `${label} · ${award.reason}`, { competition: cSlug, stage: award.reason },
          );
          add(continentalPrizeAwardedTo, award.clubId, paid);
          if (award.reason === "r16") add(continentalR16PrizeAwardedTo, award.clubId, paid);
        }
      }
    }

    // ── National cup inbox news for the human club ────────────────────────────
    // These messages are emitted on the same day the tie/draw happens, before the "Transfers +
    // inbox are cleared" block further down (only runs when `seasonEnded`). They never collide
    // with that clear because no cup tie can fall on the rollover day itself: every cup stage's
    // date window ends at least FINAL_BEFORE_END_DAYS (7) days before the league window end
    // (src/Domain/cups/cupDates.ts), so the final is always played and read well before the
    // season rolls.
    if (playerSquadId) {
      const myCup = await playerCupSlug(meta.leagueSlug);
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
          if (event.home !== playerSquadId && event.away !== playerSquadId) continue;
          const roundFixtures = roundUpdates.get(myCup)?.get(event.round) ?? [];
          const fixture = roundFixtures.find((f) => f.id === event.fixtureId);
          if (!fixture) continue;
          const winner = fixtureWinner(fixture);
          if (winner === null) continue;
          const stage = stageNameOf(event.round);
          if (stage === null) continue;

          if (winner === playerSquadId) {
            if (stage === "final") {
              await emitInboxMessage(
                saveId,
                buildCupMessage({
                  date: currentDate, kind: "champion", cupSlug: myCup, cupName: cupDisplayName, stage,
                  prize: cupPrizeAwardedTo.get(playerSquadId),
                }),
                saveService,
              );
            }
          } else {
            const opponentId = event.home === playerSquadId ? event.away : event.home;
            const opponentName = index.byId(opponentId)?.name ?? opponentId;
            await emitInboxMessage(
              saveId,
              buildCupMessage({
                date: currentDate, kind: "eliminated", cupSlug: myCup, cupName: cupDisplayName, stage, opponentName,
                prize: cupPrizeAwardedTo.get(playerSquadId),
              }),
              saveService,
            );
          }
        }

        // Draw: a new stage was drawn today and the player's club is in it.
        for (const change of cupChanges) {
          if (change.slug !== myCup || change.drawnRound === undefined) continue;
          const drawnStage = stageNameOf(change.drawnRound);
          if (drawnStage === null) continue;
          const round = await saveService.getRound(saveId, myCup, change.drawnRound);
          const fixture = round?.fixtures.find((f) => f.home === playerSquadId || f.away === playerSquadId);
          if (!fixture) continue;
          const opponentId = fixture.home === playerSquadId ? fixture.away : fixture.home;
          const opponentName = index.byId(opponentId)?.name ?? opponentId;
          const venue = fixture.neutral ? "neutral" : fixture.home === playerSquadId ? "home" : "away";
          await emitInboxMessage(
            saveId,
            buildCupMessage({
              date: currentDate, kind: "draw", cupSlug: myCup, cupName: cupDisplayName,
              stage: drawnStage, opponentName, tieDate: fixture.date, venue,
            }),
            saveService,
          );
        }
      }
    }

    // ── Continental competition inbox news for the human club ─────────────────
    // Unlike the national-cup block above, this is NEVER emitted directly — it is only QUEUED
    // into `continentalMessages`, flushed after the "Transfers + inbox are cleared" block further
    // down. A national cup's window always ends >= FINAL_BEFORE_END_DAYS before its own country's
    // league end, so a cup tie can never land on that country's own rollover day. A continental
    // competition has no such guarantee against a DIFFERENT country's rollover: the European
    // calendar-year leagues (Belarus, Finland, Georgia, Iceland, Norway, Sweden — see
    // .claude/rules/game/continental.md) roll over on their own December schedule while the UCL/UEL
    // group stage runs to 12-15, with no coordination between the two — so a group-stage draw/
    // elimination for a club in one of those leagues CAN fall on that same country's rollover day,
    // right before `clearInbox` runs later in this same function call.
    const continentalMessages: Array<Parameters<typeof buildContinentalMessage>[0]> = [];
    if (playerSquadId && continentalChanges.some(({ events }) => events.length > 0)) {
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
            const f = fixtures.find((x) => x.played && (x.home === playerSquadId || x.away === playerSquadId));
            if (f) return f.home === playerSquadId ? f.away : f.home;
          }
          return undefined;
        };

        for (const event of events) {
          if (event.kind === "eliminated" && event.clubId === playerSquadId) {
            const opponentId = event.stage === "group" ? undefined : opponentOfTodaysFixture();
            const opponentName = opponentId ? (index.byId(opponentId)?.name ?? opponentId) : undefined;
            // No prize field here — the design table has no continental runner-up/elimination
            // payout (unlike cups). A group-stage elimination happens the SAME day as that club's
            // round-6 result (win/draw), which DOES pay via `continentalPrizeAwardedTo` — but that
            // money is for the match result, not for being eliminated, so it must never be shown
            // on this message (review fix — see `.claude/rules/game/finances.md`).
            continentalMessages.push({
              date: currentDate, kind: "eliminated", competition: compSlug, competitionName: compDisplayName,
              stage: event.stage, opponentName,
            });
          } else if (event.kind === "champion" && event.clubId === playerSquadId) {
            continentalMessages.push({
              date: currentDate, kind: "champion", competition: compSlug, competitionName: compDisplayName, stage: "final",
              prize: continentalPrizeAwardedTo.get(playerSquadId),
            });
          } else if (event.kind === "drawn") {
            const myTie = event.ties.find((tie) => tie.home === playerSquadId || tie.away === playerSquadId);
            if (!myTie) continue;
            const opponentId = myTie.home === playerSquadId ? myTie.away : myTie.home;
            const opponentName = index.byId(opponentId)?.name ?? opponentId;
            const venue: "home" | "away" | "neutral" =
              !myTie.tieId ? "neutral" : myTie.home === playerSquadId ? "home" : "away";
            // Only the r16 draw (classificação às oitavas) carries a prize — see the separate
            // `continentalR16PrizeAwardedTo` map above (kept apart from group-stage match prizes
            // paid the same day).
            continentalMessages.push({
              date: currentDate, kind: "draw", competition: compSlug, competitionName: compDisplayName,
              stage: event.stage, opponentName, firstLegDate: myTie.firstLegDate, venue,
              ...(event.stage === "r16" ? { prize: continentalR16PrizeAwardedTo.get(playerSquadId) } : {}),
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
    const dayLog = { saveId, date: currentDate, events: dayEvents };
    await saveService.writeDayLog(saveId, currentDate, { saveId, date: currentDate, events: storedEvents });

    // ── Transfer market tick ─────────────────────────────────────────────────
    // When the whole market is frozen (start-kit pre-simulation), dailyMarketTick would be a
    // guaranteed no-op — skip loading every squad + the market file for it (~25 MB/day).
    if (!options.marketFrozen) {
      let workingMeta = meta;
      const allSquadsMarket = await saveService.getAllSquads(saveId);
      const rawMarket = await saveService.getMarket(saveId);
      const marketForTick = rawMarket
        ? { ...rawMarket, playerSellList: rawMarket.playerSellList ?? [] }
        : initMarketState(allSquadsMarket);
      const playerSquadForMarket = findPlayerSquad(allSquadsMarket, meta);
      const resolvedPlayerSquadId = playerSquadForMarket?.id ?? null;

      const { updatedMarket, completedTransfers } = dailyMarketTick(
        marketForTick,
        allSquadsMarket,
        currentDate,
        defaultRng,
        {
          excludePlayerSquadId: resolvedPlayerSquadId,
          playerSellList: marketForTick.playerSellList,
          playerSquad: playerSquadForMarket,
          // Contract end for every signing: the buyer's league season end.
          seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end,
        },
      );

      for (const tx of completedTransfers) {
        const buyerResolved = await saveService.resolveSquadId(saveId, tx.buyerSquad.id);
        const sellerResolved = await saveService.resolveSquadId(saveId, tx.sellerSquad.id);
        if (!buyerResolved || !sellerResolved) continue;

        const buying = withDefaultFinances(tx.updatedBuyer);
        const selling = withDefaultFinances(tx.updatedSeller);

        const isBuyerPlayer = isPlayerSquadId(tx.buyerSquad.id, meta);
        const isSellerPlayer = isPlayerSquadId(tx.sellerSquad.id, meta);

        workingMeta = await executeTransferFee(
          saveId,
          workingMeta,
          {
            squad: buying,
            leagueSlug: buyerResolved.leagueSlug,
            clubSlug: buyerResolved.clubSlug,
            isPlayerClub: isBuyerPlayer,
          },
          {
            squad: selling,
            leagueSlug: sellerResolved.leagueSlug,
            clubSlug: sellerResolved.clubSlug,
            isPlayerClub: isSellerPlayer,
          },
          tx.fee,
          saveService,
        );

        const transferId = randomUUID();
        const record: TransferRecord = {
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
          direction: isBuyerPlayer ? "in" : isSellerPlayer ? "out" : "in",
          status: "accepted",
          reason: "AI transfer",
        };
        await saveService.appendTransfer(saveId, record);
        await saveService.appendDayEvent(saveId, currentDate, {
          kind: "transfer_ref",
          transferId,
        });

        if (isBuyerPlayer) {
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
          );
        } else if (isSellerPlayer) {
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
          );
        }
      }

      await saveService.saveMarket(saveId, updatedMarket);

      // Free agents: a few AI clubs hire from the free pool (fee 0, wage-gated). Squads that
      // just traded today are skipped so their freshly saved rosters are never overwritten.
      const freeAgentPool = await saveService.getFreeAgents(saveId);
      if (freeAgentPool.length > 0) {
        const tradedToday = new Set(completedTransfers.flatMap((tx) => [tx.buyerSquad.id, tx.sellerSquad.id]));
        const hiringSquads = allSquadsMarket.filter((sq) => !tradedToday.has(sq.id));
        const fa = freeAgentTick({
          squads: hiringSquads,
          pool: freeAgentPool,
          date: currentDate,
          rng: defaultRng,
          excludeSquadId: resolvedPlayerSquadId,
          seasonEndOf: (sq) => activeLeagues.find((l) => l.leagueSlug === sq.leagueSlug)?.end ?? defaultSeasonEnd(currentDate),
        });
        if (fa.signedIds.size > 0) {
          for (const sq of fa.squads) {
            if (fa.changedIds.has(sq.id)) await saveService.saveSquadById(saveId, sq);
          }
          await saveService.writeFreeAgents(saveId, freeAgentPool.filter((f) => !fa.signedIds.has(f.player.id)));
        }
      }
    }

    // ── Financial updates (player's club ledger) ─────────────────────────────
    // Weekly commercial/wages/operational on Mondays, plus a gate entry for every home fixture
    // of the player's club today across every competition (playerHomeFixturesToday, filled by the
    // main match loop above). See computeAdvanceDayMoney / .claude/rules/game/finances.md.
    // The negative-balance message is QUEUED, not emitted immediately: a rollover later this same
    // function call may clearInbox() (see "Transfers + inbox are cleared" below) — emitting here
    // would have it wiped the same day it was raised. Flushed after that clear, like
    // `continentalMessages`.
    let negativeBalanceMessage: Parameters<typeof buildSeasonMessage>[0] | null = null;
    const dayOfWeek = new Date(currentDate + "T12:00:00").getDay();
    const isWeeklyTick = dayOfWeek === 1;
    const needsPlayerSquad = isWeeklyTick || playerHomeFixturesToday.length > 0;
    if (needsPlayerSquad && playerEntry && playerSquadId) {
      // Re-read the squad: it may have been updated by the match loop above (own fixture today).
      const playerSquad = await saveService.getSquad(saveId, playerEntry.leagueSlug, playerEntry.stem);
      if (playerSquad) {
        const catalogForFinance = await getLeagueData();
        const homeFixturesToday: PlayerHomeFixtureToday[] = playerHomeFixturesToday.map((f) => ({
          ...f,
          label: competitionName(f.competition, catalogForFinance as unknown as LeagueData[], "en"),
        }));
        const moneyEntries = computeAdvanceDayMoney({ currentDate, playerSquad, homeFixturesToday });
        if (moneyEntries.length > 0) {
          const playerLeagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
          const season = playerLeagueMeta?.year ?? new Date(currentDate).getFullYear();
          const balanceBefore = playerSquad.finances?.budget ?? 0;
          let balanceAfter = balanceBefore;
          // Sequential, never parallel: each entry read-modify-writes the squad's budget, so the
          // next entry must observe the previous one's result (recordMoney is the only writer).
          for (const entry of moneyEntries) {
            const updated = await recordMoney(
              saveService, saveId, season,
              { leagueSlug: playerEntry.leagueSlug, clubSlug: playerEntry.stem },
              entry,
            );
            balanceAfter = updated.finances?.budget ?? balanceAfter;
          }
          if (balanceBefore >= 0 && balanceAfter < 0) {
            negativeBalanceMessage = {
              date: currentDate,
              kind: "negative_balance",
              leagueSlug: meta.leagueSlug,
              leagueName: competitionName(meta.leagueSlug, catalogForFinance as unknown as LeagueData[], "en"),
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
    let seasonEnded = false;
    let archiveYear: number | undefined;
    let playerCountryMoves: ClubMove[] = [];
    let playerMove: ClubMove | null = null;
    let playerChampionOf: string | null = null;
    const seasonMessages: Array<Parameters<typeof buildSeasonMessage>[0]> = [];
    let playerFollowersChange: { before: number; after: number; leagueSlug: string } | null = null;
    // League prize paid to the player's club at this rollover (design spec §3 "Liga"), for the
    // champion/promoted/relegated season message below. 0 when no rollover happens this day.
    let playerLeaguePrizeThisRollover = 0;

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
        totalRounds: lm.totalRounds, currentRound: 0, restDays: lm.restDays,
      };
    }

    const playerClubSquadId = playerSquadId ?? meta.clubId;
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

      // 2. Plan the moves.
      const plan = planCountryRollover(unit, standings, playerSquadId);

      // 3. Archive + reset every league with the OLD membership. Reset squads are saved where
      //    they live now, before any move; moved clubs get their new tier's income here.
      const closedYear = new Map<string, number>();
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
          playerClubSquadId,
        });
        await saveService.writeLeagueSeasonArchive(saveId, transition.archive);
        await saveService.writeLeagueTransfersArchive(saveId, slug, transition.archive.year, transfersAtSeasonEnd);

        // The human club's annual broadcasting goes onto its RESET squad (once: it is in one league).
        const refs = applyPlayerBroadcastingCredit(transition.squadsToSave, playerClubSquadId, transition.playerBroadcastingCredit);
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
          if (squad.id !== playerClubSquadId) {
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
            if (human.followersAfter !== human.followersBefore) {
              playerFollowersChange = { before: human.followersBefore, after: human.followersAfter, leagueSlug: slug };
            }
            if (leaguePrizeAmount > 0) {
              next = applyMoney(next, {
                date: currentDate, kind: "prize", amount: leaguePrizeAmount,
                label: `${nameOfLeagueForPrizes!(slug)} · ${ordinalPosition(tablePos + 1)}`,
                ref: { competition: slug },
              });
              playerLeaguePrizeThisRollover = leaguePrizeAmount;
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
          if (squad.id === playerClubSquadId) {
            // The new season's ledger: closedYear.get(slug) is the OLD (just-archived) year, so
            // both entries go onto the NEW season's file — same "+1" the next-season calendar
            // below uses for cal.meta.year.
            const newSeasonEntries: LedgerEntry[] = [];
            if (transition.playerBroadcastingCredit > 0) {
              newSeasonEntries.push({
                date: currentDate, kind: "broadcasting", amount: transition.playerBroadcastingCredit,
                label: "Broadcasting revenue",
              });
            }
            if (leaguePrizeAmount > 0) {
              newSeasonEntries.push({
                date: currentDate, kind: "prize", amount: leaguePrizeAmount,
                label: `${nameOfLeagueForPrizes!(slug)} · ${ordinalPosition(tablePos + 1)}`,
                ref: { competition: slug },
              });
            }
            if (newSeasonEntries.length > 0) await saveService.appendLedger(saveId, closedYear.get(slug)! + 1, newSeasonEntries);
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
          restDays: cal.meta.restDays,
        };
      }

      // 8. Contracts ending with the season: the AI renews who fits (wage cap permitting) and
      //    releases the rest, the human club releases whoever it did not renew. Released players
      //    wait in freeAgents.json. Runs on the NEW membership with the new season's end dates.
      const releasedNow: FreeAgent[] = [];
      const afterExpiry: { squad: Squad; nextEnd: string }[] = [];
      for (const slug of unit.leagues) {
        const nextEnd = updatedActiveLeagues[stateIdx(slug)]?.end;
        if (!nextEnd) continue;
        for (const sq of await saveService.getSquadsInLeague(saveId, slug)) {
          const isHuman = sq.id === playerClubSquadId;
          const res = processContractExpiries({ squad: sq, date: currentDate, nextSeasonEnd: nextEnd, isHuman });
          afterExpiry.push({ squad: res.squad, nextEnd });
          if (res.squad === sq) continue;
          await saveService.saveSquadById(saveId, res.squad);
          for (const p of res.released) releasedNow.push({ player: { ...p, squadId: "", contract: undefined }, since: currentDate });
          if (isHuman && res.released.length > 0) {
            deferredContractMessages.push({
              date: currentDate, kind: "released", players: res.released.map((p) => ({ id: p.id, name: p.name })),
            });
          }
        }
      }
      if (releasedNow.length > 0 || due.units.length > 0) {
        const keepSince = addYearsIso(currentDate, -1);
        const existing = await saveService.getFreeAgents(saveId);
        let pool = [...existing.filter((f) => f.since > keepSince), ...releasedNow];
        // Refill: AI clubs below the minimums sign the best free agents that fit the wage cap, then
        // filler youth; the human club only gets youth up to the per-role minimums.
        for (const { squad: sq, nextEnd } of afterExpiry) {
          const isHuman = sq.id === playerClubSquadId;
          const r = refillSquad({ squad: sq, pool, nextSeasonEnd: nextEnd, isHuman, tagPrefix: `s${nextEnd.slice(0, 4)}` });
          if (r.squad === sq) continue;
          await saveService.saveSquadById(saveId, r.squad);
          if (r.signed.length > 0) {
            const ids = new Set(r.signed.map((p) => p.id));
            pool = pool.filter((f) => !ids.has(f.player.id));
          }
        }
        await saveService.writeFreeAgents(saveId, pool);
      }

      if (unit.leagues.includes(meta.leagueSlug)) {
        seasonEnded = true;
        archiveYear = closedYear.get(meta.leagueSlug);
        playerCountryMoves = plan.moves;
        playerMove = plan.playerMove;
        playerChampionOf = plan.playerChampionOf;
        const nameOf = await leagueNameResolver(activeLeagues);
        if (plan.playerChampionOf) {
          seasonMessages.push({
            date: currentDate, kind: "champion", leagueSlug: plan.playerChampionOf,
            leagueName: nameOf(plan.playerChampionOf), seasonYear: archiveYear!,
          });
        }
        if (plan.playerMove) {
          seasonMessages.push({
            date: currentDate, kind: plan.playerMove.kind, leagueSlug: plan.playerMove.to,
            leagueName: nameOf(plan.playerMove.to), fromLeagueSlug: plan.playerMove.from, seasonYear: archiveYear!,
          });
        }
        if (playerFollowersChange) {
          seasonMessages.push({
            date: currentDate, kind: "followers", leagueSlug: playerFollowersChange.leagueSlug,
            leagueName: nameOf(playerFollowersChange.leagueSlug), seasonYear: archiveYear!,
            followersBefore: playerFollowersChange.before, followersAfter: playerFollowersChange.after,
          });
        }
        // Always fires once per rollover, independent of champion/promoted/relegated/followers —
        // a mid-table finish still earns (and shows) its merit prize, and this never doubles up
        // with those messages (review fix: a club can be BOTH champion of its league AND promoted
        // the same season, which used to attach the same prize to two messages).
        if (playerLeaguePrizeThisRollover > 0) {
          seasonMessages.push({
            date: currentDate, kind: "league_prize", leagueSlug: meta.leagueSlug,
            leagueName: nameOf(meta.leagueSlug), seasonYear: archiveYear!,
            prize: playerLeaguePrizeThisRollover,
          });
        }
        debugLog(LOG_NS_SEASON, "Season rollover complete", {
          archivedSeasonYear: archiveYear,
          moves: plan.moves.length,
          playerMove: plan.playerMove,
        });
      }
    }

    // A calendar-year European league (Belarus, Finland, Georgia, Iceland, Norway, Sweden — see
    // .claude/rules/game/continental.md) rolls over on its own December schedule, independently of
    // the Europe-wide continental rollover below (which only tracks cross-year leagues) — so its
    // brand-new Y+1 calendar is generated with no knowledge of UCL/UEL dates already fixed for the
    // season in progress. Logged only, never rescheduled: see `logEuropeanCalendarClashes`.
    if (rolledLeagueFixtures.size > 0) {
      await logEuropeanCalendarClashes(saveService, saveId, rolledLeagueFixtures);
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

      // Player's-club "qualified" + "group" news for a competition pair just (re)generated below —
      // queued into the deferred `continentalMessages` array (see its declaration above), never
      // emitted directly here.
      const queueQualificationMessage = (result: Awaited<ReturnType<typeof createContinentalSeason>>) => {
        const qual = continentalQualificationOf(playerClubSquadId, result);
        if (!qual) return;
        const compName = competitionName(qual.slug, catalog as unknown as LeagueData[], "en");
        const opponentNames = qual.opponentIds.map((id) => index.byId(id)?.name ?? id);
        continentalMessages.push({
          date: currentDate, kind: "qualified", competition: qual.slug, competitionName: compName, stage: "group",
        });
        continentalMessages.push({
          date: currentDate, kind: "group", competition: qual.slug, competitionName: compName, stage: "group",
          group: qual.group, opponentNames,
        });
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

    // Transfers + inbox are cleared when the PLAYER's country rolls; the season news goes in after.
    if (seasonEnded) {
      await saveService.writeTransfers(saveId, []);
      await saveService.clearInbox(saveId);
      for (const msg of seasonMessages) await emitInboxMessage(saveId, buildSeasonMessage(msg), saveService);
    }
    // Continental "qualified"/"group" news, queued above (self-heal / regeneration): always after
    // any `clearInbox` this same day, whether or not it was the player's own country that rolled.
    for (const msg of continentalMessages) await emitInboxMessage(saveId, buildContinentalMessage(msg), saveService);
    // Negative-balance news (queued above, same reason): always after any `clearInbox` this day.
    if (negativeBalanceMessage) await emitInboxMessage(saveId, buildSeasonMessage(negativeBalanceMessage), saveService);
    // Injury/return news (queued above, same reason): always after any `clearInbox` this day.
    for (const msg of deferredInjuryMessages) await emitInboxMessage(saveId, buildInjuryMessage(msg), saveService);
    for (const msg of deferredContractMessages) await emitInboxMessage(saveId, buildContractMessage(msg), saveService);

    // The career follows the club to its new league (also repairs a meta left stale by a partial flush).
    const metaPatch: Partial<SaveMeta> = {};
    const playerHome = index.byId(meta.clubId)?.leagueSlug;
    if (playerHome && playerHome !== meta.leagueSlug) {
      const catalog = await getLeagueData();
      metaPatch.leagueSlug = playerHome;
      metaPatch.leagueName = (await leagueNameResolver(updatedActiveLeagues))(playerHome);
      metaPatch.followedLeagues = sanitizeFollowedLeagues(
        meta.followedLeagues ?? [], new Set(catalog.map((l) => l.slug)), playerHome,
      );
    }

    // ── Next currentDate: always the next day (no season jump) ─────────────────
    const updatedMeta = await saveService.updateMeta(saveId, {
      ...metaPatch,
      currentDate: nextDate,
      activeLeagues: updatedActiveLeagues.length > 0 ? updatedActiveLeagues : undefined,
    });

    const resolved = await saveService.resolveDayLog(saveId, currentDate);
    const transferEvents = (resolved?.events ?? []).filter((e) => e.kind === "transfer");
    return {
      ok: true,
      payload: {
        ...dayLog,
        events: [...dayLog.events, ...transferEvents],
        newDate: updatedMeta.currentDate,
        ...(seasonEnded
          ? { seasonEnded: true as const, archiveYear, moves: playerCountryMoves ?? [], playerMove, playerChampionOf }
          : {}),
      },
    };
}

export const advanceDayRoutes = {
  "/api/saves/:saveId/presimulate": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const auth = requireSaveOwner(req, req.params.saveId!);
    if (auth instanceof Response) return auth;
    const saveId = req.params.saveId!;
    // Apply a pre-computed start kit (instant). The live full-pipeline catch-up
    // (presimulatePreStart) is reserved for the offline kit generator — running it
    // here would block for minutes.
    const result = await applyRandomStartKit(saveId);

    // Continental season-start news, read from whatever is on disk AFTER the kit decision above
    // (see emitContinentalSeasonStartNews) — covers both the "kit applied" and "no kit" paths.
    const meta = await saveService.getMeta(saveId);
    if (meta?.clubId && meta.currentDate) {
      try {
        await emitContinentalSeasonStartNews(saveId, meta.clubId, meta.currentDate);
      } catch (e) {
        logError("continental", `save ${saveId}: failed to emit continental season-start news`, e);
      }
    }

    return Response.json(result);
  },

  "/api/advance-day/:saveId": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }

    const auth = requireSaveOwner(req, req.params.saveId!);
    if (auth instanceof Response) return auth;

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
        const pm = parsed.playedMatch;
        const pe = pm?.playerEnergy;
        const peOk =
          pe &&
          typeof pe === "object" &&
          pm?.playerStats &&
          Object.keys(pm.playerStats).every(
            (id) => typeof (pe as Record<string, unknown>)[id] === "number",
          );
        if (
          !pm ||
          typeof pm.fixtureId !== "string" ||
          !pm.score ||
          typeof pm.score.home !== "number" ||
          typeof pm.score.away !== "number" ||
          !pm.teamStats?.home ||
          !pm.teamStats?.away ||
          !pm.playerStats ||
          !pm.playerRatings ||
          !peOk ||
          typeof pm.durationMs !== "number"
        ) {
          return Response.json(
            { error: "playedMatch payload failed validation — refusing to simulate headlessly" },
            { status: 400 },
          );
        }
        playedMatchOverride = pm;
      }
    }

    // Serialise days per save: a second request for the same save waits until the
    // first has flushed, so it reads the advanced state instead of racing it.
    const saveId = req.params.saveId!;
    return withSaveLock(saveId, async () => {
      const outcome = await runBufferedDay(saveId, playedMatchOverride);
      if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
      return Response.json(outcome.payload);
    });
  },

  "/api/saves/:saveId/days/:date": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const { saveId, date } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const resolved = await saveService.resolveDayLog(saveId!, date!);
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
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    const body = (await req.json()) as { type?: string };
    if (body.type !== "training" && body.type !== "rest") {
      return Response.json({ error: "type must be 'training' or 'rest'" }, { status: 400 });
    }
    const meta = await saveService.getMeta(saveId!);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

    const activeLeagues = meta.activeLeagues ?? [];
    const playerLeagueState = activeLeagues.find((l) => l.leagueSlug === meta.leagueSlug);

    // New path: update restDays in meta.activeLeagues
    if (playerLeagueState) {
      const current = new Set(playerLeagueState.restDays ?? []);
      if (body.type === "rest") current.add(date!);
      else current.delete(date!);
      const restDays = Array.from(current).sort();

      const updatedLeagues = activeLeagues.map((l) =>
        l.leagueSlug === meta.leagueSlug ? { ...l, restDays } : l,
      );
      await saveService.updateMeta(saveId!, { activeLeagues: updatedLeagues });
      return Response.json({ restDays });
    }

    // Legacy fallback: update restDays in season.json
    const season = await saveService.getSeason(saveId!);
    if (!season) return Response.json({ error: "season not found" }, { status: 404 });

    const current = new Set(season.restDays ?? []);
    if (body.type === "rest") current.add(date!);
    else current.delete(date!);
    const restDays = Array.from(current).sort();
    await saveService.writeSeason(saveId!, { ...season, restDays });
    return Response.json({ restDays });
  },
};
