import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import type { Formation } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type {
  MatchEvent,
  MatchTeamStats,
  MatchSubstitution,
  MatchInjury,
  Scorer,
  MatchPlayerStats,
  PlayerDevelopmentChange,
} from "@/types/dayLogTypes";
import { applyDevelopment, DEFAULT_DP_WEIGHTS, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import rolesData from "@/Data/roles.json";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { quickSimMatch, type Rng } from "@/Domain/advanceDay/quickSim";
import { slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { applyMatchFitness } from "@/Domain/fitness/fitness";
import { clearHealed, returnDate as injuryReturnDate } from "@/Domain/injury/injury";

/**
 * An in-match injury after `player.injury` has been written (`returnDate` computed) — Task 3
 * (`docs/superpowers/plans/2026-09-28-injuries.md`). Callers (e.g. `advanceDay.ts`) use this to
 * build the "injured" inbox message for the human club without recomputing the return date.
 */
export interface AppliedInjury extends MatchInjury {
  returnDate: string;
}

/** `stats.stamina` (0–10) is required on the type, but fall back defensively — see fitness.md. */
const DEFAULT_STAMINA = 7;

/**
 * Full match length in minutes — 90, or 120 when a knockout decider is present (it only exists
 * once 90' ended level and extra time was played — see `.claude/rules/match-flow.md`). Stoppage
 * time is not modelled as a stretch of this total (a flat 90/120 is simpler and matches the design
 * doc) — see `computeMinutesPlayed` for how a stoppage-time substitution is still handled without
 * ever crediting 0 minutes to a player who genuinely came on.
 */
function totalMatchMinutes(decider: unknown): number {
  return decider ? 120 : 90;
}

/**
 * Minutes played per roster id, from the set of players who appeared in the match (typically
 * `Object.keys(playerStats)`) and the substitution log, in the order it was recorded — NEVER
 * re-sorted by `matchMinute`, which is not monotonic across halves/extra-time (each phase has its
 * own `MINUTE_OFFSET`, see `.claude/rules/match-flow.md`); the log's own order is what tells us
 * who is actually on the pitch when a later substitution happens. A player never substituted plays
 * the full `totalMinutes`; a substitute's minutes start at their sub-in minute. A player still on
 * the pitch at the final whistle who came on at or after `totalMinutes` (a stoppage-time
 * substitution) is credited at least 1 minute, never 0 — the substitution itself proves they
 * played. Works with an empty substitution list (quickSim: every player in `playerIds` plays
 * `totalMinutes`) and is robust to a player being subbed on and later subbed off again.
 */
export function computeMinutesPlayed(
  playerIds: string[],
  substitutions: Pick<MatchSubstitution, "playerOutId" | "playerInId" | "matchMinute">[],
  totalMinutes: number,
): Record<string, number> {
  const subbedIn = new Set(substitutions.map((s) => s.playerInId));
  // onSince: minute the player has been on the pitch since (absent = not on the pitch).
  const onSince = new Map<string, number>();
  const minutes: Record<string, number> = {};
  for (const id of playerIds) {
    minutes[id] = 0;
    if (!subbedIn.has(id)) onSince.set(id, 0);
  }
  for (const sub of substitutions) {
    const since = onSince.get(sub.playerOutId);
    if (since != null) {
      minutes[sub.playerOutId] = (minutes[sub.playerOutId] ?? 0) + Math.max(0, sub.matchMinute - since);
    }
    onSince.delete(sub.playerOutId);
    onSince.set(sub.playerInId, sub.matchMinute);
  }
  for (const [id, since] of onSince) {
    minutes[id] = (minutes[id] ?? 0) + Math.max(1, totalMinutes - since);
  }
  return minutes;
}

export interface MatchSimResult {
  event: MatchEvent;
  updatedHome: Squad;
  updatedAway: Squad;
  /** New injuries this match, with the return date already rolled. Empty when none occurred. */
  injuriesApplied: AppliedInjury[];
}

/** Payload from a live /match playthrough — advance-day uses this instead of simulating again. */
export interface PlayedMatchRecording {
  fixtureId: string;
  score: { home: number; away: number };
  teamStats: { home: MatchTeamStats; away: MatchTeamStats };
  playerStats: Record<string, MatchPlayerStats>;
  playerRatings: Record<string, number>;
  /** Roster id → engine energy 0–100 at full-time (persisted as `seasonLog.fitness`). */
  playerEnergy: Record<string, number>;
  /** Substitutions made during the match, in chronological order. */
  substitutions: import("@/types/dayLogTypes").MatchSubstitution[];
  /** In-match injuries, in chronological order. */
  injuries?: import("@/types/dayLogTypes").MatchInjury[];
  durationMs: number;
  /** Knockout only: extra-time goals and shootout, home/away. Absent when decided in 90'. */
  decider?: import("@/types/calendarTypes").MatchDecider;
}

function finalizeSquadsAfterMatch(
  homeSquad: Squad,
  awaySquad: Squad,
  playerStats: Record<string, MatchPlayerStats>,
  playerRatings: Record<string, number>,
  playerEnergy: Record<string, number> | undefined,
  substitutions: Pick<MatchSubstitution, "playerOutId" | "playerInId" | "matchMinute">[],
  totalMinutes: number,
  isCup: boolean,
  isContinental: boolean,
  matchDate: string,
  injuries: MatchInjury[] = [],
  rng: Rng = Math.random,
): {
  updatedHome: Squad;
  updatedAway: Squad;
  homeDevChanges: PlayerDevelopmentChange[];
  awayDevChanges: PlayerDevelopmentChange[];
  /** New injuries this match, with the return date already rolled — see `AppliedInjury`. */
  injuriesApplied: AppliedInjury[];
} {
  // Shared across both squads — `playerStats` already combines home + away.
  //
  // A player injured and removed outright (no bench candidate / no subs left) never appears as a
  // `playerOutId` in `substitutions` (that log only covers replaced players) — without a synthetic
  // entry here, `computeMinutesPlayed` would credit them the full match instead of stopping their
  // clock at the injury minute. `playerInId` is a placeholder that never matches a real roster id,
  // so it can't accidentally start tracking a bogus "player" — `computeMinutesPlayed` only reads
  // `minutes[id]` for ids it was given in `playerIds` (now includes injured-removed players — see
  // both collectors, `buildMatchEvent`/`buildPlayedMatchRecording.ts`).
  const subbedOutIds = new Set(substitutions.map((s) => s.playerOutId));
  const minutesSubstitutions = [
    ...substitutions,
    ...injuries
      .filter((inj) => !subbedOutIds.has(inj.playerId))
      .map((inj) => ({
        playerOutId: inj.playerId,
        playerInId: `__injured_out_${inj.playerId}`,
        matchMinute: inj.matchMinute,
      })),
  ];
  const minutesPlayed = computeMinutesPlayed(Object.keys(playerStats), minutesSubstitutions, totalMinutes);
  const injuryByPlayer = new Map(injuries.map((inj) => [inj.playerId, inj]));
  const injuriesApplied: AppliedInjury[] = [];

  function applyMatchToSquad(squad: Squad): Squad {
    return {
      ...squad,
      players: squad.players.map((p0) => {
        // Clear a healed injury BEFORE anything else — a player who returns today plays this
        // match with `injury` absent for the rest of the pipeline (`.claude/rules/game/injuries.md`
        // — Task 1's `clearHealed`, resets `seasonLog.fitness` to `INJURY.RETURN_FITNESS`, which
        // the fitness update below then further adjusts for the match itself).
        const p = clearHealed(p0, matchDate);
        const pl = ensureSeasonLog(p);
        const log = { ...pl.seasonLog! };
        const ps = playerStats[p.id];
        const rating = playerRatings[p.id];
        if (ps) {
          log.appearances += 1;
          log.goals += ps.goals;
          log.assists += ps.assists;
          log.shots += ps.shots;
          log.passesCompleted += ps.passesCompleted;
          log.passesAttempted += ps.passesAttempted;
          log.tackles += ps.tackles;
          log.interceptions += ps.interceptions;
          if (isCup) {
            const c = log.cup ?? { appearances: 0, goals: 0, assists: 0 };
            log.cup = {
              appearances: c.appearances + 1,
              goals: c.goals + ps.goals,
              assists: c.assists + ps.assists,
            };
          }
          if (isContinental) {
            const c = log.continental ?? { appearances: 0, goals: 0, assists: 0 };
            log.continental = {
              appearances: c.appearances + 1,
              goals: c.goals + ps.goals,
              assists: c.assists + ps.assists,
            };
          }
          if (rating != null) {
            const prev = log.avgRating;
            log.avgRating =
              prev === 0
                ? rating
                : +((prev * (log.appearances - 1) + rating) / log.appearances).toFixed(2);
            log.recentRatings = [...(log.recentRatings ?? []), rating].slice(-5);
          }
          // Post-match fitness/load, shared with `/lab`'s congestion carry-over
          // (`lab/fitnessCarry.ts`) via `applyMatchFitness` — see `.claude/rules/game/fitness.md`.
          const endEnergy = playerEnergy?.[p.id];
          const minutes = minutesPlayed[p.id] ?? 0;
          const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
          const updated = applyMatchFitness(log, { age: p.age, stamina }, { endEnergy, minutes });
          log.fitness = updated.fitness;
          log.load = updated.load;
          log.morale = Math.min(100, log.morale + +(Math.random() * 2).toFixed(1));
        } else {
          // Did not appear in this match (bench/reserve). The daily rest/training loop skips
          // this squad entirely today because it played a fixture — so this is this player's
          // only chance to recover fitness and decay load today, on the same curve as an actual
          // rest day (`.claude/rules/game/fitness.md`).
          const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
          const updated = applyMatchFitness(log, { age: p.age, stamina }, undefined);
          log.fitness = updated.fitness;
          log.load = updated.load;
        }
        const inj = injuryByPlayer.get(p.id);
        if (inj) {
          const rd = injuryReturnDate(matchDate, inj.severity, rng);
          injuriesApplied.push({ ...inj, returnDate: rd });
          return { ...pl, seasonLog: log, injury: { severity: inj.severity, returnDate: rd } };
        }
        return { ...pl, seasonLog: log };
      }),
    };
  }

  function applyDevelopmentToSquad(
    squad: Squad,
  ): { updatedSquad: Squad; changes: PlayerDevelopmentChange[] } {
    const allChanges: PlayerDevelopmentChange[] = [];
    const updatedPlayers = squad.players.map((p) => {
      const roleKey = p.positions[0] ?? "CM";
      const roleEntry = (rolesData as Record<string, { dpWeights?: RoleDPWeights }>)[roleKey];
      const weights = roleEntry?.dpWeights ?? DEFAULT_DP_WEIGHTS;
      const rating = playerRatings[p.id] ?? 0;
      const { updatedPlayer, levelChanges } = applyDevelopment(p, rating, weights);
      if (levelChanges) allChanges.push(levelChanges);
      return updatedPlayer;
    });
    return { updatedSquad: { ...squad, players: updatedPlayers }, changes: allChanges };
  }

  const { updatedSquad: devHome, changes: homeDevChanges } = applyDevelopmentToSquad(
    applyMatchToSquad(homeSquad),
  );
  const { updatedSquad: devAway, changes: awayDevChanges } = applyDevelopmentToSquad(
    applyMatchToSquad(awaySquad),
  );

  return {
    updatedHome: devHome,
    updatedAway: devAway,
    homeDevChanges,
    awayDevChanges,
    injuriesApplied,
  };
}

function buildScorers(
  playerStats: Record<string, MatchPlayerStats>,
  playerNames: Record<string, string>,
  playerTeams: Record<string, "home" | "away">,
): Scorer[] {
  const scorers: Scorer[] = [];
  for (const [rosterId, ps] of Object.entries(playerStats)) {
    if (ps.goals > 0) {
      scorers.push({
        playerId: rosterId,
        playerName: playerNames[rosterId] ?? rosterId,
        team: playerTeams[rosterId] ?? "home",
        goals: ps.goals,
      });
    }
  }
  scorers.sort((a, b) => b.goals - a.goals);
  return scorers;
}

function rosterNameAndTeamMaps(homeSquad: Squad, awaySquad: Squad): {
  playerNames: Record<string, string>;
  playerTeams: Record<string, "home" | "away">;
} {
  const playerNames: Record<string, string> = {};
  const playerTeams: Record<string, "home" | "away"> = {};
  for (const p of homeSquad.players) {
    playerNames[p.id] = p.name;
    playerTeams[p.id] = "home";
  }
  for (const p of awaySquad.players) {
    playerNames[p.id] = p.name;
    playerTeams[p.id] = "away";
  }
  return { playerNames, playerTeams };
}

/**
 * Build a day-log match event from stats recorded during a live Pixi match (no headless sim).
 */
export function buildMatchEventFromRecording(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  recording: PlayedMatchRecording,
  rng: Rng = Math.random,
): MatchSimResult {
  const { playerNames, playerTeams } = rosterNameAndTeamMaps(homeSquad, awaySquad);
  const scorers = buildScorers(recording.playerStats, playerNames, playerTeams);

  const { updatedHome, updatedAway, homeDevChanges, awayDevChanges, injuriesApplied } = finalizeSquadsAfterMatch(
    homeSquad,
    awaySquad,
    recording.playerStats,
    recording.playerRatings,
    recording.playerEnergy,
    recording.substitutions ?? [],
    totalMatchMinutes(recording.decider),
    isCupSlug(fixture.competition),
    isContinentalSlug(fixture.competition),
    fixture.date,
    recording.injuries ?? [],
    rng,
  );

  const event: MatchEvent = {
    kind: "match",
    fixtureId: fixture.id,
    competition: fixture.competition,
    round: fixture.round,
    home: fixture.home,
    away: fixture.away,
    score: recording.score,
    teamStats: recording.teamStats,
    playerStats: recording.playerStats,
    playerRatings: recording.playerRatings,
    playerNames,
    playerTeams,
    scorers,
    substitutions: recording.substitutions ?? [],
    injuries: recording.injuries ?? [],
    developmentChanges: [...homeDevChanges, ...awayDevChanges],
    durationMs: recording.durationMs,
    ...(recording.decider ? { decider: recording.decider } : {}),
  };

  return { event, updatedHome, updatedAway, injuriesApplied };
}

export function buildMatchEvent(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  sim: {
    homeFormation: Formation;
    homeLineup: string[];
    awayFormation: Formation;
    awayLineup: string[];
  },
  rng: Rng = Math.random,
): MatchSimResult {
  const result = simulateMatch(
    homeSquad,
    awaySquad,
    sim.homeFormation,
    sim.awayFormation,
    sim.homeLineup,
    sim.awayLineup,
    {
      knockout: fixture.knockout === true,
      ...(fixture.aggregate ? { aggregate: { A: fixture.aggregate.home, B: fixture.aggregate.away } } : {}),
    },
  );

  const nameToRosterId = new Map<string, string>();
  for (const rp of [...homeSquad.players, ...awaySquad.players]) {
    nameToRosterId.set(rp.name, rp.id);
  }
  const engineIdToRosterId = new Map<number, string>();
  // Map players still on pitch at full time
  for (const gp of result.players) {
    const rosterId = nameToRosterId.get(gp.name);
    if (rosterId) engineIdToRosterId.set(gp.id, rosterId);
  }
  // Also map subbed-off players so their stats and ratings are correctly attributed
  for (const sub of result.substitutions) {
    if (!engineIdToRosterId.has(sub.playerOutId)) {
      engineIdToRosterId.set(sub.playerOutId, sub.playerOutRosterId);
    }
  }
  // Also map players injured and removed outright (no bench candidate / no subs left) — they
  // never appear on the pitch at full time, nor in `substitutions` (that log only covers
  // replaced players), so without this their accumulated stats/rating (still held in the
  // Statistics/PlayerRating stores by engine id — never purged just because a player left the
  // pitch) would silently be dropped from the day-log event.
  for (const inj of result.injuries) {
    if (!engineIdToRosterId.has(inj.playerId)) {
      engineIdToRosterId.set(inj.playerId, inj.playerRosterId);
    }
  }

  const playerStats: Record<string, MatchPlayerStats> = {};
  for (const [id, stats] of result.playerStats) {
    const key = engineIdToRosterId.get(id);
    if (!key) continue;
    playerStats[key] = {
      passesAttempted: stats.passesAttempted,
      passesCompleted: stats.passesCompleted,
      passesFailed: stats.passesFailed,
      shots: stats.shots,
      goals: stats.goals,
      assists: stats.assists,
      interceptions: stats.interceptions,
      tackles: stats.tackles,
    };
  }

  const playerRatings: Record<string, number> = {};
  for (const [id, rating] of Object.entries(result.playerRatings)) {
    const key = engineIdToRosterId.get(Number(id));
    if (key) playerRatings[key] = rating;
  }

  const playerEnergy: Record<string, number> = {};
  // Players still on pitch at full time
  for (const gp of result.players) {
    const rosterId = engineIdToRosterId.get(gp.id);
    if (rosterId) playerEnergy[rosterId] = Math.max(0, Math.min(100, gp.energy));
  }
  // Subbed-off players — use their energy captured at substitution time
  for (const sub of result.substitutions) {
    const rosterId = sub.playerOutRosterId;
    if (rosterId && !playerEnergy[rosterId]) {
      playerEnergy[rosterId] = Math.max(0, Math.min(100, sub.playerOutEnergy));
    }
  }
  // Injured and removed outright — use their energy captured at the moment of injury.
  for (const inj of result.injuries) {
    const rosterId = inj.playerRosterId;
    if (rosterId && !(rosterId in playerEnergy)) {
      playerEnergy[rosterId] = Math.max(0, Math.min(100, inj.energy));
    }
  }

  const playerNames: Record<string, string> = {};
  const playerTeams: Record<string, "home" | "away"> = {};
  for (const [engId, rosterId] of engineIdToRosterId.entries()) {
    const gp = result.players.find((p) => p.id === engId);
    if (gp) {
      playerNames[rosterId] = gp.name;
      playerTeams[rosterId] = gp.team === "A" ? "home" : "away";
    }
  }
  // Fill names/teams for subbed-off players from substitution records
  for (const sub of result.substitutions) {
    const rosterId = sub.playerOutRosterId;
    if (rosterId && !playerNames[rosterId]) {
      playerNames[rosterId] = sub.playerOutName;
      playerTeams[rosterId] = sub.team === "A" ? "home" : "away";
    }
  }
  // Fill names/teams for injured-and-removed players from the injury log.
  for (const inj of result.injuries) {
    const rosterId = inj.playerRosterId;
    if (rosterId && !playerNames[rosterId]) {
      playerNames[rosterId] = inj.playerName;
      playerTeams[rosterId] = inj.team === "A" ? "home" : "away";
    }
  }

  const scorers: Scorer[] = [];
  // Check all tracked players (on pitch + subbed off) for goals
  for (const [engId, rosterId] of engineIdToRosterId.entries()) {
    const goals = result.playerStats.get(engId)?.goals ?? 0;
    if (goals > 0) {
      const gp = result.players.find((p) => p.id === engId);
      const name = gp?.name ?? (result.substitutions.find(s => s.playerOutId === engId)?.playerOutName ?? rosterId);
      const team = gp?.team ?? result.substitutions.find(s => s.playerOutId === engId)?.team ?? "A";
      scorers.push({
        playerId: rosterId,
        playerName: name,
        team: team === "A" ? "home" : "away",
        goals,
      });
    }
  }
  scorers.sort((a, b) => b.goals - a.goals);

  const substitutions: MatchSubstitution[] = result.substitutions.map((sub) => ({
    team: sub.team === "A" ? "home" : "away",
    playerOutId:   sub.playerOutRosterId,
    playerOutName: sub.playerOutName,
    playerInId:    sub.playerInRosterId,
    playerInName:  sub.playerInName,
    matchMinute:   sub.matchMinute,
  }));

  const injuries: import("@/types/dayLogTypes").MatchInjury[] = result.injuries.map((inj) => ({
    team:        inj.team === "A" ? "home" : "away",
    playerId:    inj.playerRosterId,
    playerName:  inj.playerName,
    severity:    inj.severity,
    matchMinute: inj.matchMinute,
    energy:      inj.energy,
  }));

  const { updatedHome: devHome, updatedAway: devAway, homeDevChanges, awayDevChanges, injuriesApplied } =
    finalizeSquadsAfterMatch(
      homeSquad, awaySquad, playerStats, playerRatings, playerEnergy,
      substitutions, totalMatchMinutes(result.decider),
      isCupSlug(fixture.competition), isContinentalSlug(fixture.competition),
      fixture.date, injuries, rng,
    );

  const event: MatchEvent = {
    kind: "match",
    fixtureId: fixture.id,
    competition: fixture.competition,
    round: fixture.round,
    home: fixture.home,
    away: fixture.away,
    score: { home: result.score.A, away: result.score.B },
    teamStats: {
      home: {
        shots: result.teamStats.A.shots,
        passesCompleted: result.teamStats.A.passesCompleted,
        passesAttempted: result.teamStats.A.passesAttempted,
        tackles: result.teamStats.A.tackles,
        interceptions: result.teamStats.A.interceptions,
      },
      away: {
        shots: result.teamStats.B.shots,
        passesCompleted: result.teamStats.B.passesCompleted,
        passesAttempted: result.teamStats.B.passesAttempted,
        tackles: result.teamStats.B.tackles,
        interceptions: result.teamStats.B.interceptions,
      },
    },
    playerStats,
    playerRatings,
    playerNames,
    playerTeams,
    scorers,
    substitutions,
    injuries,
    developmentChanges: [...homeDevChanges, ...awayDevChanges],
    durationMs: result.durationMs,
    ...(result.decider
      ? {
          decider: {
            extraTime: { home: result.decider.extraTime.A, away: result.decider.extraTime.B },
            ...(result.decider.penalties
              ? { penalties: { home: result.decider.penalties.A, away: result.decider.penalties.B } }
              : {}),
          },
        }
      : {}),
  };

  return { event, updatedHome: devHome, updatedAway: devAway, injuriesApplied };
}

/** Drops per-player detail from a match event (quickSim leagues) — scorers and team stats stay. */
export function compactMatchEvent(event: MatchEvent): MatchEvent {
  return {
    ...event,
    playerStats: {},
    playerRatings: {},
    playerNames: Object.fromEntries(event.scorers.map((s) => [s.playerId, s.playerName])),
    playerTeams: Object.fromEntries(event.scorers.map((s) => [s.playerId, s.team])),
    developmentChanges: [],
    compact: true,
  };
}

/** Resolve a fixture with quickSim; squads still get seasonLog/energy/development updates. */
export function buildQuickMatchEvent(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  sim: {
    homeLineup: string[];
    awayLineup: string[];
    /** When given, each lineup slot plays its formation slot role (as in the engine). */
    homeFormation?: Formation;
    awayFormation?: Formation;
  },
  rng: Rng = Math.random,
): MatchSimResult {
  const { recording } = quickSimMatch(
    {
      fixtureId: fixture.id,
      home: homeSquad,
      away: awaySquad,
      homeLineup: sim.homeLineup,
      awayLineup: sim.awayLineup,
      homeRoles: sim.homeFormation ? slotRoles(sim.homeFormation) : undefined,
      awayRoles: sim.awayFormation ? slotRoles(sim.awayFormation) : undefined,
      knockout: fixture.knockout === true,
      neutral: fixture.neutral === true,
      aggregate: fixture.aggregate,
    },
    rng,
  );
  const r = buildMatchEventFromRecording(fixture, homeSquad, awaySquad, recording, rng);
  return { ...r, event: compactMatchEvent(r.event) };
}
