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
  // ── Discipline (`.claude/rules/game-engine/fouls.md`) ──────────────────────
  /** Fouls committed. */
  fouls:                    number;
  /** Yellow cards (a second yellow counts here AND as a red). */
  yellowCards:              number;
  /** Red cards (straight or second yellow). */
  redCards:                 number;
  /** In-match penalties awarded to this player's team, credited to the taker. */
  penaltiesAwarded:         number;
  /** In-match penalties conceded (fouls in the own box). */
  penaltiesConceded:        number;
  /** In-match penalties scored (never shootout kicks). */
  penaltyGoals:             number;
  /** Times caught offside (the receiver). */
  offsides:                 number;
  // ── Aerial (`.claude/rules/game-engine/aerial.md`) ─────────────────────────
  /** Crosses played. */
  crosses:                  number;
  /** Crosses whose first contact was won by the crossing team (credited to the crosser). */
  crossesCompleted:         number;
  /** Aerial duels contested (the best contestant of each team takes part). */
  aerialDuels:              number;
  /** Aerial duels won. Team total over both teams = duels in the match. */
  aerialDuelsWon:           number;
  /** Headers at goal (also counted in `shots`). */
  headers:                  number;
  /** Goals scored with a header (also counted in `goals`). */
  headerGoals:              number;
  /** Long balls played over the line. */
  longBalls:                number;
  /** Long balls whose first contact was won by the passing team. */
  longBallsCompleted:       number;
  // ── Set pieces (`.claude/rules/game-engine/set-pieces-play.md`) ──────────────
  /** Corners won by the team, credited to the taker. */
  corners:                  number;
  /** Free kicks won from fouls (not offside), credited to the taker. */
  freeKicks:                number;
  /** Direct free kicks at goal (also counted in `shots`). */
  directFreeKickShots:      number;
  /** Goals scored straight from a direct free kick (also in `goals` and `setPieceGoals`). */
  directFreeKickGoals:      number;
  /** Goals from a set piece: corner, free kick in the attacking third, penalty (also in `goals`). */
  setPieceGoals:            number;
  // ── Man-marking (player instructions, `.claude/rules/game/player-instructions.md`) ──
  /** Game minutes this player spent man-marked by an opponent. */
  manMarked:                number;
  /** Passes this player received while man-marked. */
  markedTargetTouches:      number;
  /** Shots this player took while man-marked. */
  markedTargetShots:        number;
  /** Goals this player scored while man-marked. */
  markedTargetGoals:        number;
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
  /** Count of in-match injuries suffered by this team (`injury` event). */
  injuries: number;
}

/** Zeroed player stats — shared with UI tables that need a placeholder row. */
export function emptyPlayerStats(): PlayerStats {
  return emptyStats();
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
    fouls:                    0,
    yellowCards:              0,
    redCards:                 0,
    penaltiesAwarded:         0,
    penaltiesConceded:        0,
    penaltyGoals:             0,
    offsides:                 0,
    crosses:                  0,
    crossesCompleted:         0,
    aerialDuels:              0,
    aerialDuelsWon:           0,
    headers:                  0,
    headerGoals:              0,
    longBalls:                0,
    longBallsCompleted:       0,
    corners:                  0,
    freeKicks:                0,
    directFreeKickShots:      0,
    directFreeKickGoals:      0,
    setPieceGoals:            0,
    manMarked:                0,
    markedTargetTouches:      0,
    markedTargetShots:        0,
    markedTargetGoals:        0,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

/** Map from playerId → accumulated stats for this match. */
const store = new Map<number, PlayerStats>();

/** Map from playerId → teamId — needed to derive team stats. */
const playerTeam = new Map<number, TeamId>();

/** Team-level knockout flags (not derivable from player sums). */
const teamFlags: Record<TeamId, { extraTimePlayed: number; shootoutsWon: number; fatigueSubstitutions: number; injuries: number }> = {
  A: { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0, injuries: 0 },
  B: { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0, injuries: 0 },
};

/**
 * Every player's end-of-match energy — recorded once, either when they're substituted off
 * (`playerSubstituted`'s `outEnergy`) or, for anyone still on the pitch, at `matchEnd`. A player
 * who never appears (stayed on the bench all match) never gets an entry here, so `getTeamStats`'s
 * average is only over players who actually played — see `TeamStats.avgEndEnergy`.
 */
const endEnergy = new Map<number, { team: TeamId; energy: number }>();

/** Players currently man-marked (refreshed by every `manMarkTick`; cleared at `initStats`). */
let markedNow = new Set<number>();

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
gameBus.on('passCompleted', e => {
  get(e.player).passesCompleted++;
  if (markedNow.has(e.toId)) get(e.toId).markedTargetTouches++;
  notify();
});
gameBus.on('passFailed',    e => { get(e.player).passesFailed++;    notify(); });
gameBus.on('shot',          e => {
  const s = get(e.player); s.shots++; s.xg += e.xg;
  if (markedNow.has(e.player)) s.markedTargetShots++;
  notify();
});
gameBus.on('goalScored',    e => {
  get(e.scorerId).goals++;
  if (markedNow.has(e.scorerId)) get(e.scorerId).markedTargetGoals++;
  if (e.header) get(e.scorerId).headerGoals++;
  if (e.setPiece) get(e.scorerId).setPieceGoals++;
  if (e.setPiece === 'direct_free_kick') get(e.scorerId).directFreeKickGoals++;
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

// ── Injury stats ──────────────────────────────────────────────────────────────
gameBus.on('injury', e => {
  teamFlags[e.team].injuries++;
  notify();
});

// ── Discipline stats ──────────────────────────────────────────────────────────
gameBus.on('foul', e => { get(e.offenderId).fouls++; notify(); });
gameBus.on('card', e => {
  const s = get(e.playerId);
  if (e.card === 'yellow') s.yellowCards++; else s.redCards++;
  notify();
});
gameBus.on('penaltyAwarded', e => {
  get(e.takerId).penaltiesAwarded++;
  get(e.offenderId).penaltiesConceded++;
  notify();
});
gameBus.on('penaltyResolved', e => { if (e.scored) { get(e.takerId).penaltyGoals++; notify(); } });
gameBus.on('offsideCalled', e => { get(e.receiverId).offsides++; notify(); });

// ── Aerial stats ──────────────────────────────────────────────────────────────
gameBus.on('crossStarted',    e => { get(e.player).crosses++; notify(); });
gameBus.on('longBallStarted', e => { get(e.player).longBalls++; notify(); });
gameBus.on('aerialResolved',  e => {
  if (!e.completed) return;
  if (e.kind === 'cross') get(e.fromId).crossesCompleted++;
  else get(e.fromId).longBallsCompleted++;
  notify();
});
gameBus.on('aerialDuel', e => {
  get(e.winnerId).aerialDuels++;
  get(e.winnerId).aerialDuelsWon++;
  get(e.loserId).aerialDuels++;
  notify();
});
gameBus.on('header', e => { get(e.player).headers++; notify(); });

// ── Set-piece stats ───────────────────────────────────────────────────────────
gameBus.on('cornerAwarded',   e => { get(e.takerId).corners++; notify(); });
gameBus.on('freeKickAwarded', e => { get(e.takerId).freeKicks++; notify(); });
gameBus.on('directFreeKick',  e => { get(e.player).directFreeKickShots++; notify(); });

// ── Man-marking ───────────────────────────────────────────────────────────────
gameBus.on('manMarkTick', e => {
  markedNow = new Set(e.targetIds);
  const minutes = e.seconds / 60;
  for (const id of e.targetIds) get(id).manMarked += minutes;
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
  markedNow = new Set();
  teamFlags.A = { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0, injuries: 0 };
  teamFlags.B = { extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0, injuries: 0 };
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
    result.fouls                    += stats.fouls;
    result.yellowCards              += stats.yellowCards;
    result.redCards                 += stats.redCards;
    result.penaltiesAwarded         += stats.penaltiesAwarded;
    result.penaltiesConceded        += stats.penaltiesConceded;
    result.penaltyGoals             += stats.penaltyGoals;
    result.offsides                 += stats.offsides;
    result.crosses                  += stats.crosses;
    result.crossesCompleted         += stats.crossesCompleted;
    result.aerialDuels              += stats.aerialDuels;
    result.aerialDuelsWon           += stats.aerialDuelsWon;
    result.headers                  += stats.headers;
    result.headerGoals              += stats.headerGoals;
    result.longBalls                += stats.longBalls;
    result.longBallsCompleted       += stats.longBallsCompleted;
    result.corners                  += stats.corners;
    result.freeKicks                += stats.freeKicks;
    result.directFreeKickShots      += stats.directFreeKickShots;
    result.directFreeKickGoals      += stats.directFreeKickGoals;
    result.setPieceGoals            += stats.setPieceGoals;
    result.manMarked                += stats.manMarked;
    result.markedTargetTouches      += stats.markedTargetTouches;
    result.markedTargetShots        += stats.markedTargetShots;
    result.markedTargetGoals        += stats.markedTargetGoals;
  }
  return result;
}

/** Snapshot of all player stats — useful for end-of-match summaries. */
export function getAllPlayerStats(): Map<number, PlayerStats> {
  return new Map([...store].map(([id, s]) => [id, { ...s }]));
}

// ── Snapshot (resume a live match after a page reload, #64) ───────────────────

/** Plain-JSON copy of every counter this module holds (Maps flattened to entry arrays). */
export interface StatsSnapshot {
  players:   Array<[number, PlayerStats]>;
  teams:     Array<[number, TeamId]>;
  endEnergy: Array<[number, { team: TeamId; energy: number }]>;
  teamFlags: Record<TeamId, { extraTimePlayed: number; shootoutsWon: number; fatigueSubstitutions: number; injuries: number }>;
}

/** Everything accumulated so far, as plain data (no Maps). */
export function exportStatsState(): StatsSnapshot {
  return {
    players:   [...store].map(([id, s]) => [id, { ...s }]),
    teams:     [...playerTeam],
    endEnergy: [...endEnergy].map(([id, e]) => [id, { ...e }]),
    teamFlags: { A: { ...teamFlags.A }, B: { ...teamFlags.B } },
  };
}

/** Replaces every counter with a snapshot from `exportStatsState` (instead of `initStats`). */
export function importStatsState(snap: StatsSnapshot): void {
  store.clear();
  playerTeam.clear();
  endEnergy.clear();
  for (const [id, s] of snap.players) store.set(id, { ...emptyStats(), ...s });
  for (const [id, team] of snap.teams) playerTeam.set(id, team);
  for (const [id, e] of snap.endEnergy) endEnergy.set(id, { ...e });
  teamFlags.A = { ...teamFlags.A, ...snap.teamFlags.A };
  teamFlags.B = { ...teamFlags.B, ...snap.teamFlags.B };
  notify();
}
