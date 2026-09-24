import { fileURLToPath } from "node:url";
import { randomUUID } from "crypto";
import { saveService, SaveService } from "@/backend/SaveService";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { withSaveLock } from "@/backend/saveLock";
import { applyRandomStartKit } from "@/backend/startKits";
import { executeTransferFee } from "@/backend/FinancialService";
import type { LeagueTeam, Squad } from "@/types/playerTypes";
import type { StoredDayLog, TrainingEvent, RestEvent } from "@/types/dayLogTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { Fixture, LeagueSeasonState } from "@/types/calendarTypes";
import { findPlayerSquad, isPlayerSquadId } from "@/Domain/clubLookup";
import {
  emitInboxMessage,
  buildDevelopmentMessage,
  buildTransferInMessage,
  buildTransferOutMessage,
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
import { applyPlayerBroadcastingCredit, runSeasonTransition } from "@/Domain/season";
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

type AdvanceDayOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; payload: Record<string, unknown> };

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

  let days = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const current = (await service.getMeta(saveId))?.currentDate;
    if (!current || current >= playerStart) break;
    const outcome = await advanceOneDay(service, saveId);
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

    // Membership comes from the save's squad folders. Built once: membership does not
    // change within a day, and the buffered service overlays the day's own edits.
    const index = await saveService.getSquadIndex(saveId);

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

    const { updatedMarket, completedTransfers } = dailyMarketTick(
      marketForTick,
      allSquadsMarket,
      currentDate,
      defaultRng,
      {
        excludePlayerSquadId: resolvedPlayerSquadId,
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

    // ── Season transition check for all active leagues ───────────────────────
    let seasonEnded = false;
    let archiveYear: number | undefined;

    const updatedActiveLeagues: LeagueSeasonState[] = [...activeLeagues];

    for (let i = 0; i < updatedActiveLeagues.length; i++) {
      const leagueState = updatedActiveLeagues[i]!;
      if (nextDate <= leagueState.end) continue;

      logSeason("Season end reached — evaluating rollover", {
        saveId,
        leagueSlug: leagueState.leagueSlug,
        lastDay: currentDate,
        seasonEnd: leagueState.end,
      });

      const leagueTeams = index.inLeague(leagueState.leagueSlug);
      if (leagueTeams.length === 0) continue;

      const squadsInLeague = await saveService.getSquadsInLeague(saveId, leagueState.leagueSlug);
      const allFixturesForTransition = await saveService.getAllFixturesForLeague(saveId, leagueState.leagueSlug);

      // Build a synthetic SeasonData from what we have
      const endingSeason = {
        year: leagueState.year,
        start: leagueState.start,
        end: leagueState.end,
        calendar: allFixturesForTransition,
      };

      const leagueConfig = LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === leagueState.leagueSlug);
      const playerClubSquadId = playerSquadId ?? meta.clubId;

      const transition = runSeasonTransition({
        endingSeason,
        leagueSlug: leagueState.leagueSlug,
        leagueTeams,
        squadsInLeague,
        playerClubSquadId,
        leagueConfig,
      });

      // Archive: write per-league archive
      await saveService.writeLeagueSeasonArchive(saveId, transition.archive);
      const transfersAtSeasonEnd = await saveService.getTransfers(saveId);
      await saveService.writeLeagueTransfersArchive(saveId, leagueState.leagueSlug, transition.archive.year, transfersAtSeasonEnd);

      // Write new round files
      for (const round of transition.newLeagueCalendar.rounds) {
        await saveService.writeRound(saveId, leagueState.leagueSlug, round.round, round);
      }
      await saveService.writeDateIndex(saveId, leagueState.leagueSlug, transition.newLeagueCalendar.dateIndex);
      await saveService.writeLeagueMeta(saveId, transition.newLeagueCalendar.meta);

      // Write reset squads. The human club's annual broadcasting is credited onto its
      // RESET squad here, so the new-season write carries both.
      const squadsToSave = applyPlayerBroadcastingCredit(
        transition.squadsToSave,
        playerClubSquadId,
        transition.playerBroadcastingCredit,
      );
      for (const { leagueSlug: lg, clubSlug, squad } of squadsToSave) {
        await saveService.saveSquad(saveId, lg, clubSlug, squad);
      }

      // Reset standings
      const resetStandings = leagueTeams.map((t) => ({
        ...t,
        mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] as string[],
      }));
      await saveService.writeLeagueStandings(saveId, leagueState.leagueSlug, resetStandings);

      // Update the active league state
      const nm = transition.newLeagueCalendar.meta;
      updatedActiveLeagues[i] = {
        ...leagueState,
        year: nm.year,
        start: nm.start,
        end: nm.end,
        currentRound: 0,
        restDays: nm.restDays,
      };

      if (leagueState.leagueSlug === meta.leagueSlug) {
        seasonEnded = true;
        archiveYear = transition.archive.year;

        debugLog(LOG_NS_SEASON, "Season rollover complete", {
          archivedSeasonYear: transition.archive.year,
          newSeasonYear: nm.year,
          newSeasonStart: nm.start,
        });
      }
    }

    // Only clear transfers after all leagues that transitioned have archived them
    if (seasonEnded) {
      await saveService.writeTransfers(saveId, []);
      await saveService.clearInbox(saveId);
    }

    // ── Determine next currentDate ─────────────────────────────────────────────
    const playerLeagueNewState = updatedActiveLeagues.find((l) => l.leagueSlug === meta.leagueSlug);
    const newCurrentDate = seasonEnded ? (playerLeagueNewState?.start ?? nextDate) : nextDate;

    const updatedMeta = await saveService.updateMeta(saveId, {
      currentDate: newCurrentDate,
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
        ...(seasonEnded ? { seasonEnded: true as const, archiveYear } : {}),
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
      // One buffered unit of work per day: each squad is read at most once and written once.
      // A failed day (!outcome.ok) flushes nothing.
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const dayService = new SaveService(buffer);
      const outcome = await advanceOneDay(dayService, saveId, playedMatchOverride);
      if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
      try {
        await buffer.flush();
      } catch (err) {
        // flush() writes meta last, so on failure currentDate was not advanced.
        const errors = err instanceof AggregateError ? err.errors : [err];
        for (const e of errors) logError("advance-day", `failed to persist day for save ${saveId}`, e);
        return Response.json({ error: "failed to persist day" }, { status: 500 });
      }
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
