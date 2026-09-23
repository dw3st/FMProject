import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import type { Formation } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type {
  MatchEvent,
  MatchTeamStats,
  Scorer,
  MatchPlayerStats,
  PlayerDevelopmentChange,
} from "@/types/dayLogTypes";
import { applyDevelopment, DEFAULT_DP_WEIGHTS, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import rolesData from "@/Data/roles.json";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { quickSimMatch, type Rng } from "@/Domain/advanceDay/quickSim";
import { slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";

export interface MatchSimResult {
  event: MatchEvent;
  updatedHome: Squad;
  updatedAway: Squad;
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
  durationMs: number;
}

function finalizeSquadsAfterMatch(
  homeSquad: Squad,
  awaySquad: Squad,
  playerStats: Record<string, MatchPlayerStats>,
  playerRatings: Record<string, number>,
  playerEnergy: Record<string, number> | undefined,
): {
  updatedHome: Squad;
  updatedAway: Squad;
  homeDevChanges: PlayerDevelopmentChange[];
  awayDevChanges: PlayerDevelopmentChange[];
} {
  function applyMatchToSquad(squad: Squad): Squad {
    return {
      ...squad,
      players: squad.players.map((p) => {
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
          if (rating != null) {
            const prev = log.avgRating;
            log.avgRating =
              prev === 0
                ? rating
                : +((prev * (log.appearances - 1) + rating) / log.appearances).toFixed(2);
            log.recentRatings = [...(log.recentRatings ?? []), rating].slice(-5);
          }
          const endEnergy = playerEnergy?.[p.id];
          if (typeof endEnergy === "number" && Number.isFinite(endEnergy)) {
            // Give back 50% of energy spent during the match (post-match recovery).
            // e.g. started at 80, ended at 20 → spent 60 → recover 30 → final fitness 50.
            const startEnergy = log.fitness;
            const spent = Math.max(0, startEnergy - endEnergy);
            log.fitness = Math.max(0, Math.min(100, endEnergy + spent * 0.5));
          } else {
            log.fitness = Math.max(0, log.fitness - +(Math.random() * 5 + 3).toFixed(1));
          }
          log.morale = Math.min(100, log.morale + +(Math.random() * 2).toFixed(1));
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
): MatchSimResult {
  const { playerNames, playerTeams } = rosterNameAndTeamMaps(homeSquad, awaySquad);
  const scorers = buildScorers(recording.playerStats, playerNames, playerTeams);

  const { updatedHome, updatedAway, homeDevChanges, awayDevChanges } = finalizeSquadsAfterMatch(
    homeSquad,
    awaySquad,
    recording.playerStats,
    recording.playerRatings,
    recording.playerEnergy,
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
    developmentChanges: [...homeDevChanges, ...awayDevChanges],
    durationMs: recording.durationMs,
  };

  return { event, updatedHome, updatedAway };
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
): MatchSimResult {
  const result = simulateMatch(
    homeSquad,
    awaySquad,
    sim.homeFormation,
    sim.awayFormation,
    sim.homeLineup,
    sim.awayLineup,
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

  const { updatedHome: devHome, updatedAway: devAway, homeDevChanges, awayDevChanges } =
    finalizeSquadsAfterMatch(homeSquad, awaySquad, playerStats, playerRatings, playerEnergy);

  const substitutions: import("@/types/dayLogTypes").MatchSubstitution[] = result.substitutions.map((sub) => ({
    team: sub.team === "A" ? "home" : "away",
    playerOutId:   sub.playerOutRosterId,
    playerOutName: sub.playerOutName,
    playerInId:    sub.playerInRosterId,
    playerInName:  sub.playerInName,
    matchMinute:   sub.matchMinute,
  }));

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
    developmentChanges: [...homeDevChanges, ...awayDevChanges],
    durationMs: result.durationMs,
  };

  return { event, updatedHome: devHome, updatedAway: devAway };
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
    },
    rng,
  );
  const r = buildMatchEventFromRecording(fixture, homeSquad, awaySquad, recording);
  return { ...r, event: compactMatchEvent(r.event) };
}
