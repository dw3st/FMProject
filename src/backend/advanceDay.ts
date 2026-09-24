import { fileURLToPath } from "node:url";
import { randomUUID } from "crypto";
import { saveService, SaveService, type SaveMeta } from "@/backend/SaveService";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { withSaveLock } from "@/backend/saveLock";
import { applyRandomStartKit } from "@/backend/startKits";
import { executeTransferFee } from "@/backend/FinancialService";
import type { LeagueTeam, Squad, StandingRow } from "@/types/playerTypes";
import type { ClubMove, Pyramids } from "@/types/pyramidTypes";
import type { StoredDayLog, TrainingEvent, RestEvent } from "@/types/dayLogTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { Fixture, LeagueSeasonMeta, LeagueSeasonState } from "@/types/calendarTypes";
import { findPlayerSquad, isPlayerSquadId } from "@/Domain/clubLookup";
import {
  emitInboxMessage,
  buildDevelopmentMessage,
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
  computeAdvanceDayMoneyDelta,
  resolveSimMode,
  resolveTrainingPolicy,
  type PlayedMatchRecording,
} from "@/Domain/advanceDay";
import { computeMatchSimulationLineups } from "@/Domain/advanceDay/matchSimulationLineups";
import { defaultRng } from "@/Domain/transfer/transferNeeds";
import { dailyMarketTick, initMarketState } from "@/Domain/transfer/marketRotation";
import { applyPlayerBroadcastingCredit, buildNextSeasonCalendar, runSeasonTransition } from "@/Domain/season";
import { findDueRollovers, planCountryRollover } from "@/Domain/season/countryRollover";
import { applyTierFinanceChange } from "@/Domain/advanceDay/tierFinances";
import { applyAISeasonReaction, applyHumanSeasonReaction, clubSeasonOutcome } from "@/Domain/aiFinance/seasonReaction";
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { computeStandings } from "@/Domain/season/computeStandings";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import { debugLog, logError, logSeason, LOG_NS_SEASON } from "@/Logger";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

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

type LeagueDataEntry = {
  slug: string;
  name?: string;
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

  // Leagues that kick off on or after the player's start date are the ones a kit career
  // can pick: their clubs stay out of the transfer market so they start intact.
  const marketFrozenLeagues = new Set(
    activeLeagues.filter((l) => l.start >= playerStart).map((l) => l.leagueSlug),
  );

  let days = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const current = (await service.getMeta(saveId))?.currentDate;
    if (!current || current >= playerStart) break;
    const outcome = await advanceOneDay(service, saveId, null, { marketFrozenLeagues });
    if (!outcome.ok) break;
    days++;
  }

  await buffer.flush();

  return {
    days,
    leagues: activeLeagues.filter((l) => l.start < playerStart).map((l) => l.leagueSlug),
  };
}

export interface AdvanceOneDayOptions {
  /**
   * Leagues whose clubs sit out the transfer market today (no buying, no selling). Only the
   * start-kit pre-simulation sets it: clubs of leagues that have not kicked off can still be
   * picked for a career and must start with their real squad.
   */
  marketFrozenLeagues?: ReadonlySet<string>;
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
    const squadWrites: Array<{ league: string; club: string; squad: Squad }> = [];
    const teamsPlayingToday = new Set<string>(); // squadIds that have a match today

    const tactics = await saveService.getTactics(saveId);

    // Membership comes from the save's squad folders. Built once for the day's matches and
    // training; only the season rollover changes it, and it re-reads the index right after.
    let index = await saveService.getSquadIndex(saveId);

    // The player's squad: meta.clubId is the squadId.
    const playerEntry = index.byId(meta.clubId);
    const playerSquadId: string | undefined = playerEntry?.squadId;

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

        for (const fixture of todayFixtures) {
          const homeEntry = index.byId(fixture.home);
          const awayEntry = index.byId(fixture.away);
          if (!homeEntry || !awayEntry) continue;

          const [homeSquad, awaySquad] = await Promise.all([
            saveService.getSquadById(saveId, fixture.home),
            saveService.getSquadById(saveId, fixture.away),
          ]);
          if (!homeSquad || !awaySquad) continue;

          const useRecording =
            playedMatchOverride !== null &&
            playedMatchOverride.fixtureId === fixture.id &&
            leagueSlug === meta.leagueSlug;

          if (useRecording && playedMatchOverride) {
            const r = buildMatchEventFromRecording(fixture, homeSquad, awaySquad, playedMatchOverride);
            dayEvents.push(r.event);
            squadWrites.push({ league: homeEntry.leagueSlug, club: homeEntry.stem, squad: r.updatedHome });
            squadWrites.push({ league: awayEntry.leagueSlug, club: awayEntry.stem, squad: r.updatedAway });
            teamsPlayingToday.add(fixture.home);
            teamsPlayingToday.add(fixture.away);

            const idx = updatedFixtures.findIndex((f) => f.id === fixture.id);
            if (idx !== -1) updatedFixtures[idx] = { ...updatedFixtures[idx]!, played: true, result: r.event.score };
            playedMatchOverride = null;
          } else {
            const sim = computeMatchSimulationLineups(fixture, homeSquad, awaySquad, playerSquadId, tactics);
            const userPlays = fixture.home === playerSquadId || fixture.away === playerSquadId;
            const mode = userPlays ? "full" : resolveSimMode(leagueSlug, meta);
            const r = mode === "full"
              ? buildMatchEvent(fixture, homeSquad, awaySquad, sim)
              : buildQuickMatchEvent(fixture, homeSquad, awaySquad, sim);
            dayEvents.push(r.event);
            squadWrites.push({ league: homeEntry.leagueSlug, club: homeEntry.stem, squad: r.updatedHome });
            squadWrites.push({ league: awayEntry.leagueSlug, club: awayEntry.stem, squad: r.updatedAway });
            teamsPlayingToday.add(fixture.home);
            teamsPlayingToday.add(fixture.away);

            const idx = updatedFixtures.findIndex((f) => f.id === fixture.id);
            if (idx !== -1) updatedFixtures[idx] = { ...updatedFixtures[idx]!, played: true, result: r.event.score };
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
          const { event, updatedSquad } = buildRestEvent(row.squadId, squad);
          dayEvents.push(event);
          squadWrites.push({ league, club, squad: updatedSquad });
        } else {
          const policy = resolveTrainingPolicy(meta, club, row.squadId);
          const { event, updatedSquad } = buildTrainingEvent(row.squadId, squad, policy);
          dayEvents.push(event);
          squadWrites.push({ league, club, squad: updatedSquad });
        }
      }
    }

    // ── Write all squad updates in parallel ──────────────────────────────────
    await Promise.all(
      squadWrites.map((sw) => saveService.saveSquad(saveId, sw.league, sw.club, sw.squad)),
    );

    // ── Write updated round files + recompute standings per league ────────────
    for (const [leagueSlug, rounds] of roundUpdates.entries()) {
      const leagueTeams = index.inLeague(leagueSlug);

      for (const [roundNum, fixtures] of rounds.entries()) {
        await saveService.writeRound(saveId, leagueSlug, roundNum, { leagueSlug, round: roundNum, fixtures });
      }

      // Recompute standings from all rounds for accuracy
      const allFixtures = await saveService.getAllFixturesForLeague(saveId, leagueSlug);
      const updatedStandings = computeStandings(leagueTeams, allFixtures, leagueSlug);
      await saveService.writeLeagueStandings(saveId, leagueSlug, updatedStandings);
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
    let workingMeta = meta;
    const allSquadsMarket = await saveService.getAllSquads(saveId);
    const rawMarket = await saveService.getMarket(saveId);
    const marketForTick = rawMarket
      ? { ...rawMarket, playerSellList: rawMarket.playerSellList ?? [] }
      : initMarketState(allSquadsMarket);
    const playerSquadForMarket = findPlayerSquad(allSquadsMarket, meta);
    const resolvedPlayerSquadId = playerSquadForMarket?.id ?? null;
    let frozenSquadIds: Set<string> | undefined;
    if (options.marketFrozenLeagues?.size) {
      const index = await saveService.getSquadIndex(saveId);
      frozenSquadIds = new Set(
        [...options.marketFrozenLeagues].flatMap((slug) => index.inLeague(slug).map((t) => t.squadId)),
      );
    }

    const { updatedMarket, completedTransfers } = dailyMarketTick(
      marketForTick,
      allSquadsMarket,
      currentDate,
      defaultRng,
      {
        excludePlayerSquadId: resolvedPlayerSquadId,
        frozenSquadIds,
        playerSellList: marketForTick.playerSellList,
        playerSquad: playerSquadForMarket,
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

    // ── Financial updates ────────────────────────────────────────────────────
    // Load today's player league fixtures for ticket revenue
    const playerLeagueTodayFixtures: Fixture[] = [];
    const playerLeagueRounds = activeRoundsForDate.get(meta.leagueSlug);
    if (playerLeagueRounds) {
      for (const rNum of playerLeagueRounds) {
        const rd = await saveService.getRound(saveId, meta.leagueSlug, rNum);
        if (rd) playerLeagueTodayFixtures.push(...rd.fixtures.filter((f) => f.date === currentDate));
      }
    }

    const dayOfWeek = new Date(currentDate + "T12:00:00").getDay();
    const isWeeklyTick = dayOfWeek === 1;
    const needsPlayerSquad =
      isWeeklyTick ||
      Boolean(playerSquadId && playerLeagueTodayFixtures.some((f) => f.home === playerSquadId));
    const playerSquad = needsPlayerSquad && playerEntry
      ? await saveService.getSquad(saveId, playerEntry.leagueSlug, playerEntry.stem)
      : null;

    const moneyDelta = computeAdvanceDayMoneyDelta({
      currentDate,
      todayFixtures: playerLeagueTodayFixtures,
      playerSquadId,
      playerSquad,
    });

    // Apply money delta to player squad's budget
    if (moneyDelta !== 0 && playerEntry && playerSquad?.finances) {
      const budget = Math.max(0, (playerSquad.finances.budget ?? 0) + moneyDelta);
      await saveService.saveSquad(saveId, playerEntry.leagueSlug, playerEntry.stem, {
        ...playerSquad,
        finances: { ...playerSquad.finances, budget },
      });
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
        // Then every club reacts to its season: AI clubs get followers + financial tier + next
        // season's transfer budget; the human club only its followers.
        for (const { squad } of refs) {
          const tc = plan.tierChanges[squad.id];
          let next = tc ? applyTierFinanceChange(squad, tc.from, tc.to) : squad;
          const outcome = clubSeasonOutcome(standings[slug] ?? [], squad.id, plan.moves);
          if (squad.id !== playerClubSquadId) {
            next = applyAISeasonReaction(next, outcome);
          } else {
            const human = applyHumanSeasonReaction(next, outcome);
            next = human.squad;
            if (human.followersAfter !== human.followersBefore) {
              playerFollowersChange = { before: human.followersBefore, after: human.followersAfter, leagueSlug: slug };
            }
          }
          await saveService.saveSquadById(saveId, next);
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
        debugLog(LOG_NS_SEASON, "Season rollover complete", {
          archivedSeasonYear: archiveYear,
          moves: plan.moves.length,
          playerMove: plan.playerMove,
        });
      }
    }

    // Transfers + inbox are cleared when the PLAYER's country rolls; the season news goes in after.
    if (seasonEnded) {
      await saveService.writeTransfers(saveId, []);
      await saveService.clearInbox(saveId);
      for (const msg of seasonMessages) await emitInboxMessage(saveId, buildSeasonMessage(msg), saveService);
    }

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
    // Apply a pre-computed start kit (instant). The live full-pipeline catch-up
    // (presimulatePreStart) is reserved for the offline kit generator — running it
    // here would block for minutes.
    const result = await applyRandomStartKit(req.params.saveId!);
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
