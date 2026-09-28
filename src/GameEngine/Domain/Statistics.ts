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
  /** Shootout kicks taken / scored (never counted as goals). */
  penaltiesTaken:           number;
  penaltiesScored:          number;
}

export interface TeamStats extends PlayerStats {
  /** 1 when the match went to extra time. */
  extraTimePlayed: number;
  /** 1 when this team won a penalty shootout. */
  shootoutsWon:    number;
  /**
   * Average end-of-match energy (0–100) across every player who appeared for this team — on the
   * pitch at full time, or substituted off (at their exit energy) — see `playerSubstituted` and
   * `matchEnd` in EventBus.ts. 0 if nobody appeared (should not happen in a real match).
   */
  avgEndEnergy: number;
  /** Count of substitutions this team made that were flagged `reason: 'fatigue'` by AiSubstitution. */
  fatigueSubstitutions: number;
}

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
    penaltiesTaken:           0,
    penaltiesScored:          0,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

/** Map from playerId → accumulated stats for this match. */
const store = new Map<number, PlayerStats>();

/** Map from playerId → teamId — needed to derive team stats. */
const playerTeam = new Map<number, TeamId>();

/** Team-level knockout flags (not derivable from player sums). */
const teamFlags: Record<TeamId, { extraTimePlayed: number; shootoutsWon: number; fatigueSubstitutions: number }> = {
  A: { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0 },
  B: { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0 },
};

/**
 * Every player's end-of-match energy — recorded once, either when they're substituted off
 * (`playerSubstituted`'s `outEnergy`) or, for anyone still on the pitch, at `matchEnd`. A player
 * who never appears (stayed on the bench all match) never gets an entry here, so `getTeamStats`'s
 * average is only over players who actually played — see `TeamStats.avgEndEnergy`.
 */
const endEnergy = new Map<number, { team: TeamId; energy: number }>();

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
  endEnergy.set(e.outId, { team: e.team, energy: e.outEnergy });
  if (e.reason === 'fatigue') teamFlags[e.team].fatigueSubstitutions++;
});

// Players still on the pitch at the final whistle — merged with the `playerSubstituted` exits
// above so `avgEndEnergy` covers everyone who appeared, not just the starting XI.
gameBus.on('matchEnd', e => {
  for (const p of e.finalEnergy) endEnergy.set(p.id, { team: p.team, energy: p.energy });
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

// ── Knockout stats ────────────────────────────────────────────────────────────
gameBus.on('extraTimeStart', () => {
  teamFlags.A.extraTimePlayed = 1;
  teamFlags.B.extraTimePlayed = 1;
  notify();
});
gameBus.on('penaltyKick', e => {
  const s = get(e.takerId);
  s.penaltiesTaken++;
  if (e.scored) s.penaltiesScored++;
  notify();
});
gameBus.on('shootoutEnd', e => {
  teamFlags[e.winner].shootoutsWon = 1;
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
  endEnergy.clear();
  teamFlags.A = { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0 };
  teamFlags.B = { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0 };
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
  const result: TeamStats = { ...emptyStats(), ...teamFlags[team], avgEndEnergy: 0 };
  let energySum = 0;
  let energyCount = 0;
  for (const [, e] of endEnergy) {
    if (e.team !== team) continue;
    energySum += e.energy;
    energyCount++;
  }
  result.avgEndEnergy = energyCount > 0 ? energySum / energyCount : 0;
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
    result.penaltiesTaken           += stats.penaltiesTaken;
    result.penaltiesScored          += stats.penaltiesScored;
  }
  return result;
}

/** Snapshot of all player stats — useful for end-of-match summaries. */
export function getAllPlayerStats(): Map<number, PlayerStats> {
  return new Map([...store].map(([id, s]) => [id, { ...s }]));
}
