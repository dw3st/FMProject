/**
 * Statistics — per-player match statistics collector.
 *
 * Subscribes to game-bus events and accumulates counters for each player.
 * Team statistics are derived on demand by summing player stats.
 *
 * Import once (side-effect import) to activate subscriptions:
 *   import '@/GameEngine/Statistics';
 *
 * Call initStats(playerIds) at match start to reset all counters.
 * Read via getPlayerStats(id) or getTeamStats(teamId).
 */

import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import type { TeamId } from '@/GameEngine/types';

// ── Data structures ───────────────────────────────────────────────────────────

export interface PlayerStats {
  passesAttempted: number;
  passesCompleted: number;
  passesFailed:    number;
  shots:           number;
  goals:           number;
  assists:         number;
  interceptions:   number;
  tackles:         number;
  /** Accumulated expected goals from all shots taken. */
  xg:              number;
  dribblesWon:     number;
  dribblesLost:    number;
  // ── Through-ball family (kept distinct from passes — failure modes differ) ──
  /** Through balls played (counted on `throughBallStarted`). */
  throughBallsAttempted:    number;
  /** Through balls retained by the playing team (any same-team player picks up). */
  throughBallsCompleted:    number;
  /** Through balls intercepted by an opponent mid-flight. */
  throughBallsLostInFlight: number;
  /** Through balls won by a defender in the loose-ball race / arrival. */
  throughBallsLostInRace:   number;
  /** Through balls lost in a contested loose-ball duel (Phase 5). */
  throughBallsLostInDuel:   number;
  /** Loose balls won by this player (any winner — intended or otherwise — on any through ball). */
  looseBallsWon:            number;
  /** Switch-of-play passes played (chosen lane earned a far-flank descriptor bonus). */
  switchPlays:              number;
}

export type TeamStats = PlayerStats;

function emptyStats(): PlayerStats {
  return {
    passesAttempted: 0,
    passesCompleted: 0,
    passesFailed:    0,
    shots:           0,
    goals:           0,
    assists:         0,
    interceptions:   0,
    tackles:         0,
    xg:              0,
    dribblesWon:     0,
    dribblesLost:    0,
    throughBallsAttempted:    0,
    throughBallsCompleted:    0,
    throughBallsLostInFlight: 0,
    throughBallsLostInRace:   0,
    throughBallsLostInDuel:   0,
    looseBallsWon:            0,
    switchPlays:              0,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

/** Map from playerId → accumulated stats for this match. */
const store = new Map<number, PlayerStats>();

/** Map from playerId → teamId — needed to derive team stats. */
const playerTeam = new Map<number, TeamId>();

function get(id: number): PlayerStats {
  if (!store.has(id)) store.set(id, emptyStats());
  return store.get(id)!;
}

function notify(): void {
  gameBus.emit('statsUpdated', Object.fromEntries(store));
}

// ── Bus subscriptions ─────────────────────────────────────────────────────────

gameBus.on('playerSubstituted', e => {
  if (!store.has(e.inId)) store.set(e.inId, emptyStats());
  playerTeam.set(e.inId, e.team);
});

gameBus.on('passAttempted', e => { get(e.player).passesAttempted++; notify(); });
gameBus.on('passCompleted', e => { get(e.player).passesCompleted++; notify(); });
gameBus.on('passFailed',    e => { get(e.player).passesFailed++;    notify(); });
gameBus.on('shot',          e => { const s = get(e.player); s.shots++; s.xg += e.xg; notify(); });
gameBus.on('goalScored',    e => {
  get(e.scorerId).goals++;
  if (e.assistId != null) get(e.assistId).assists++;
  notify();
});

gameBus.on('tackle',       e => { if (e.success) { get(e.player).tackles++;       notify(); } });
gameBus.on('interception', e => { if (e.success) { get(e.player).interceptions++; notify(); } });
gameBus.on('dribble',      e => {
  if (e.success) { get(e.player).dribblesWon++;          }
  else           { get(e.player).dribblesLost++;         }
  notify();
});

// ── Through-ball stats ────────────────────────────────────────────────────────
gameBus.on('throughBallStarted', e => {
  get(e.player).throughBallsAttempted++;
  notify();
});
gameBus.on('throughBallCompleted', e => {
  get(e.player).throughBallsCompleted++;
  get(e.winnerId).looseBallsWon++;
  notify();
});
gameBus.on('throughBallLostInFlight', e => {
  get(e.player).throughBallsLostInFlight++;
  // The interceptor's `interceptions` counter is bumped by the existing
  // `interception` event subscription — don't double-count here.
  notify();
});
gameBus.on('throughBallLostInRace', e => {
  get(e.player).throughBallsLostInRace++;
  notify();
});
gameBus.on('throughBallLostInDuel', e => {
  get(e.player).throughBallsLostInDuel++;
  notify();
});
gameBus.on('looseBallWon', e => {
  get(e.winnerId).looseBallsWon++;
  notify();
});

// ── Switch-of-play stats ──────────────────────────────────────────────────────
gameBus.on('switchPlayPass', e => {
  get(e.player).switchPlays++;
  notify();
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reset all counters and register players for the current match.
 * Call once at match start with all player IDs and their team IDs.
 */
export function initStats(players: Array<{ id: number; team: TeamId }>): void {
  store.clear();
  playerTeam.clear();
  for (const { id, team } of players) {
    store.set(id, emptyStats());
    playerTeam.set(id, team);
  }
}

/** Stats snapshot for a single player. */
export function getPlayerStats(id: number): PlayerStats {
  return { ...get(id) };
}

/** Team stats derived from the sum of all player stats for that team. */
export function getTeamStats(team: TeamId): TeamStats {
  const result: TeamStats = emptyStats();
  for (const [id, stats] of store) {
    if (playerTeam.get(id) !== team) continue;
    result.passesAttempted += stats.passesAttempted;
    result.passesCompleted += stats.passesCompleted;
    result.passesFailed    += stats.passesFailed;
    result.shots           += stats.shots;
    result.goals           += stats.goals;
    result.assists         += stats.assists;
    result.interceptions   += stats.interceptions;
    result.tackles         += stats.tackles;
    result.xg              += stats.xg;
    result.dribblesWon     += stats.dribblesWon;
    result.dribblesLost    += stats.dribblesLost;
    result.throughBallsAttempted    += stats.throughBallsAttempted;
    result.throughBallsCompleted    += stats.throughBallsCompleted;
    result.throughBallsLostInFlight += stats.throughBallsLostInFlight;
    result.throughBallsLostInRace   += stats.throughBallsLostInRace;
    result.throughBallsLostInDuel   += stats.throughBallsLostInDuel;
    result.looseBallsWon            += stats.looseBallsWon;
    result.switchPlays              += stats.switchPlays;
  }
  return result;
}

/** Snapshot of all player stats — useful for end-of-match summaries. */
export function getAllPlayerStats(): Map<number, PlayerStats> {
  return new Map([...store].map(([id, s]) => [id, { ...s }]));
}
