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
import type { SetPieceGoalKind, TeamId } from '@/GameEngine/types';
import { BALL_CLUSTER_CONFIG } from '@/GameEngine/Domain/BallCluster';
import { BALL_PHYSICS } from '@/GameEngine/Configs/BallPhysicsConfig';
import type { DecisionTelemetryEvent, HolderMindEvent } from '@/GameEngine/Infrastructure/EventBus';
import { HOLDER_MIND } from '@/GameEngine/Configs/DecisionConfig';
import { BUCKET_COUNT, entropyBits } from '@/GameEngine/Domain/DecisionTelemetry';
import { DECISION_TELEMETRY } from '@/GameEngine/Configs/DecisionConfig';
import { isChance, isClearChance } from '@/GameEngine/Domain/FmXg';
import { resetHighlights, highlightTeamStats, exportHighlightState, importHighlightState, type HighlightTeamStats } from '@/GameEngine/Domain/HighlightTracker';
import type { HighlightState } from '@/GameEngine/Domain/Highlights';

/** One goal of the match, as emitted (engine ids). Data for the season awards; nothing reads it in-match. */
export interface GoalLogEntry {
  scorerId: number;
  assistId?: number;
  team: TeamId;
  /** `matchMinute` at the goal (0-based, the screen shows +1). */
  minute: number;
  header: boolean;
  setPiece?: SetPieceGoalKind;
  fromX: number;
  fromY: number;
  goalX: number;
}

// ── Data structures ───────────────────────────────────────────────────────────

export interface PlayerStats {
  passesAttempted: number;
  passesCompleted: number;
  passesFailed:    number;
  shots:           number;
  /** Shots that ended inside the posts (goal or save), in-match penalty goals included. */
  shotsOnTarget:   number;
  goals:           number;
  assists:         number;
  interceptions:   number;
  tackles:         number;
  /** Accumulated expected goals from all shots taken. */
  xg:              number;
  /** Stage 6 (`xg.md`): shots with xG ≥ 0.15 (chance) and ≥ 0.30 (clear-cut chance). */
  chances:         number;
  clearChances:    number;
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
  /** Keeper came off his line: sweeper chase, 1v1 rush, wide high ball (`Keeper.ts`). */
  keeperSorties:            number;
  /** Loose balls won by the keeper outside his box. */
  keeperSweeps:             number;
  /** Balls won by the keeper at a holder's feet. */
  keeperSmothers:           number;
  /** Saves held (12.10). */
  keeperHolds:              number;
  /** Saves spilled loose in front of goal (12.10). */
  keeperSpills:             number;
  // ── Kinematics (`.claude/rules/game-engine/kinematics.md`) ─────────────────
  /** Yards covered in the live periods. */
  distanceCovered:          number;
  /** Runs at ≥ 85% of the player's top speed lasting ≥ 1 s. */
  sprints:                  number;
  // ── Set pieces (`.claude/rules/game-engine/set-pieces-play.md`) ──────────────
  /** Corners won by the team, credited to the taker. */
  corners:                  number;
  throwIns:                 number;
  setPieceRoutines:                 number;
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
  // ── Decision telemetry (`.claude/rules/game-engine/decisions.md`) ───────────
  /** Fresh scored decisions with the ball (one per holder tick). */
  holderDecisions:          number;
  /** Fresh scored off-ball decisions (committed ones are not re-counted). */
  offBallDecisions:         number;
  /** Fresh scored defensive decisions. */
  defenseDecisions:         number;
}

export interface TeamStats extends PlayerStats, HighlightTeamStats {
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
  /** Injury stoppages after which this team restarted play (`injuryStoppage`). */
  injuryStoppages: number;
  /** 1 when this team came with a game plan against a studied manager (`studyPlan`, `study.md`). */
  studyPlans: number;
  /** Referee errors that hurt this team (`refereeError`, `.claude/rules/game/var.md`). Match total = A + B. */
  refereeErrors: number;
  /**
   * Ball cluster (#145): live ticks this team spent defending (ball held, passed or loose, by the
   * other side), the sum of its outfield players within 8 yards of the ball over those ticks, and
   * the ticks with 3+ of them there (`ballCluster` event, `Domain/BallCluster.ts`).
   */
  ballNearTicks: number;
  ballNearSum: number;
  ballCrowdTicks: number;
  /** VAR checks whose final decision went against this team. Match total = A + B. */
  varReviews: number;
  /** Of those, overturned calls (the original call favoured this team). */
  varOverturned: number;
  /** Decisions whose top two scores were within `DECISION_TELEMETRY.NEAR_TIE` (`decisions.md`). */
  holderNearTies: number;
  offBallNearTies: number;
  defenseNearTies: number;
  /**
   * Shannon entropy (bits) of the decision mix within each situation bucket, averaged over the buckets weighted by their
   * decisions (this match). 0 = the same choice every time in a given situation.
   */
  holderEntropy: number;
  offBallEntropy: number;
  defenseEntropy: number;
  /** Sum of the FM pressure scalar at the holder's decisions (mean = / `holderDecisions`). */
  holderPressureSum: number;
  /** Sum of the pressure at the holder's last decision before each shot, and how many shots had one. */
  shotPressureSum: number;
  shotPressureCount: number;
  /**
   * The holder's mind (`decisions.md` → phase 3, `holderMind`): decisions it ran on, picks away from the true argmax,
   * windows rolled, windows with a lapse, decisions under the release gate, decisions at high pressure
   * (pN ≥ `HOLDER_MIND.HIGH_PRESSURE`) and the releases among them, panics (a lapse window rolled at high pressure),
   * simple-minded decisions.
   */
  holderMindDecisions: number;
  holderOffArgmax: number;
  holderWindows: number;
  holderLapses: number;
  holderReleases: number;
  holderHighPressure: number;
  holderReleasesHigh: number;
  holderPanics: number;
  holderSimple: number;
  /**
   * Holder moves (`HolderMoves.ts`): shields started and the challenges held off, cut-ins, lay-offs, chips and chip
   * goals, attempts to round the keeper and the ones that beat him.
   */
  moveShield: number;
  moveShieldHeld: number;
  moveCutInside: number;
  moveLayOff: number;
  moveChip: number;
  moveChipGoals: number;
  moveRound: number;
  moveRoundWon: number;
  /**
   * Stage 4 (`movement.md`), team counters: loose balls that rolled out of play, passes deflected loose, open-play shots
   * blocked (by this team's shots), heavy touches, back-line step-ups and drops (this team defending), second pressers
   * standing off, short supports offered, anticipation reads.
   */
  ballsOutOfPlay: number;
  deflections: number;
  shotsBlocked: number;
  heavyTouches: number;
  lineStepUps: number;
  lineDrops: number;
  pressStandOffs: number;
  supportShort: number;
  anticipationReads: number;
  /**
   * Stage 4b (`fm-numbers.md`): passes whose launch error missed the receiver (run loose), passes played lofted (a
   * long pass to feet turned into a high ball), holder holds and turns.
   */
  passesMissed: number;
  passesLofted: number;
  holderHolds: number;
  holderTurns: number;
  /**
   * Stage 3 (`ball-3d.md`), by the team that played the ball: flights peaking above 1.2 m, seconds the ball spent in
   * the air, and the peak heights (yd, summed, with the counts) of crosses, corners and long balls / clearances.
   */
  highBalls: number;
  ballAirSeconds: number;
  crossPeakSum: number; crossPeakN: number;
  cornerPeakSum: number; cornerPeakN: number;
  longPeakSum: number; longPeakN: number;
  /** Stage 4 (`pass-physics.md`): passes by launch type, and the launch speeds (yd/s, summed) of all physical passes. */
  passGround: number; passDriven: number; passChip: number; passHigh: number;
  passThroughLow: number; passThroughHigh: number; passHeader: number;
  passLaunchSpeedSum: number; passLaunchN: number;
  /**
   * Stage 5 (`interception.md`), by the defending team: touches on a physical pass in flight and what they did
   * (controlled, cleared, deflected, ran past him), and the summed ball speed (m/s) at the touches.
   */
  cutTouches: number; cutControls: number; cutClears: number; cutDeflects: number; cutMisses: number; cutSpeedSum: number;
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
    shotsOnTarget:   0,
    goals:           0,
    assists:         0,
    interceptions:   0,
    tackles:         0,
    xg:              0,
    chances:         0,
    clearChances:    0,
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
    keeperSorties:            0,
    keeperSweeps:             0,
    keeperSmothers:           0,
    distanceCovered:          0,
    sprints:                  0,
    keeperHolds:              0,
    keeperSpills:             0,
    corners:                  0,
    throwIns:                 0,
    setPieceRoutines:                 0,
    freeKicks:                0,
    directFreeKickShots:      0,
    directFreeKickGoals:      0,
    setPieceGoals:            0,
    manMarked:                0,
    markedTargetTouches:      0,
    markedTargetShots:        0,
    markedTargetGoals:        0,
    holderDecisions:          0,
    offBallDecisions:         0,
    defenseDecisions:         0,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

/** Map from playerId → accumulated stats for this match. */
const store = new Map<number, PlayerStats>();

/** Map from playerId → teamId — needed to derive team stats. */
const playerTeam = new Map<number, TeamId>();

/** Team-level counters (not derivable from player sums). */
type TeamFlags = {
  extraTimePlayed: number; shootoutsWon: number; fatigueSubstitutions: number; injuries: number; injuryStoppages: number;
  refereeErrors: number; varReviews: number; varOverturned: number;
  ballNearTicks: number; ballNearSum: number; ballCrowdTicks: number;
  studyPlans: number;
  holderNearTies: number; offBallNearTies: number; defenseNearTies: number;
  holderPressureSum: number; shotPressureSum: number; shotPressureCount: number;
  holderMindDecisions: number; holderOffArgmax: number; holderWindows: number; holderLapses: number;
  holderReleases: number; holderHighPressure: number; holderReleasesHigh: number; holderPanics: number; holderSimple: number;
  moveShield: number; moveShieldHeld: number; moveCutInside: number; moveLayOff: number; moveChip: number; moveChipGoals: number; moveRound: number; moveRoundWon: number;
  ballsOutOfPlay: number; deflections: number; shotsBlocked: number; heavyTouches: number; lineStepUps: number; lineDrops: number;
  pressStandOffs: number; supportShort: number; anticipationReads: number;
  passesMissed: number; passesLofted: number; holderHolds: number; holderTurns: number;
  highBalls: number; ballAirSeconds: number; crossPeakSum: number; crossPeakN: number;
  cornerPeakSum: number; cornerPeakN: number; longPeakSum: number; longPeakN: number;
  passGround: number; passDriven: number; passChip: number; passHigh: number; passThroughLow: number; passThroughHigh: number; passHeader: number;
  passLaunchSpeedSum: number; passLaunchN: number;
  cutTouches: number; cutControls: number; cutClears: number; cutDeflects: number; cutMisses: number; cutSpeedSum: number;
};
const emptyTeamFlags = (): TeamFlags => ({
  extraTimePlayed: 0, shootoutsWon: 0, fatigueSubstitutions: 0, injuries: 0, injuryStoppages: 0, refereeErrors: 0, varReviews: 0, varOverturned: 0,
  ballNearTicks: 0, ballNearSum: 0, ballCrowdTicks: 0, studyPlans: 0,
  holderNearTies: 0, offBallNearTies: 0, defenseNearTies: 0,
  holderPressureSum: 0, shotPressureSum: 0, shotPressureCount: 0,
  holderMindDecisions: 0, holderOffArgmax: 0, holderWindows: 0, holderLapses: 0,
  holderReleases: 0, holderHighPressure: 0, holderReleasesHigh: 0, holderPanics: 0, holderSimple: 0,
  moveShield: 0, moveShieldHeld: 0, moveCutInside: 0, moveLayOff: 0, moveChip: 0, moveChipGoals: 0, moveRound: 0, moveRoundWon: 0,
  ballsOutOfPlay: 0, deflections: 0, shotsBlocked: 0, heavyTouches: 0, lineStepUps: 0, lineDrops: 0,
  pressStandOffs: 0, supportShort: 0, anticipationReads: 0,
  passesMissed: 0, passesLofted: 0, holderHolds: 0, holderTurns: 0,
  highBalls: 0, ballAirSeconds: 0, crossPeakSum: 0, crossPeakN: 0, cornerPeakSum: 0, cornerPeakN: 0, longPeakSum: 0, longPeakN: 0,
  passGround: 0, passDriven: 0, passChip: 0, passHigh: 0, passThroughLow: 0, passThroughHigh: 0, passHeader: 0, passLaunchSpeedSum: 0, passLaunchN: 0,
  cutTouches: 0, cutControls: 0, cutClears: 0, cutDeflects: 0, cutMisses: 0, cutSpeedSum: 0,
});
const teamFlags: Record<TeamId, TeamFlags> = { A: emptyTeamFlags(), B: emptyTeamFlags() };

/**
 * Every player's end-of-match energy — recorded once, either when they're substituted off
 * (`playerSubstituted`'s `outEnergy`) or, for anyone still on the pitch, at `matchEnd`. A player
 * who never appears (stayed on the bench all match) never gets an entry here, so `getTeamStats`'s
 * average is only over players who actually played — see `TeamStats.avgEndEnergy`.
 */
const endEnergy = new Map<number, { team: TeamId; energy: number }>();
/** Goals of the match in order (`getGoalLog`). */
let goalLog: GoalLogEntry[] = [];

// ── Decision telemetry store (`decisions.md`) ────────────────────────────────
type Family = DecisionTelemetryEvent['family'];
const FAMILIES: readonly Family[] = ['holder', 'offBall', 'defense'];
/** Per team, family, bucket: action → count (entropy). */
type BucketMix = Map<string, number>[];
const emptyBuckets = (): BucketMix => Array.from({ length: BUCKET_COUNT }, () => new Map<string, number>());
function emptyFamilyBuckets(): Record<Family, BucketMix> {
  return { holder: emptyBuckets(), offBall: emptyBuckets(), defense: emptyBuckets() };
}
let bucketMix: Record<TeamId, Record<Family, BucketMix>> = { A: emptyFamilyBuckets(), B: emptyFamilyBuckets() };
/** Per player, family: action → count (decision mix). */
const playerMix = new Map<number, Record<Family, Map<string, number>>>();
/** The pressure of the last holder decision (the shot that follows it reads it). */
let lastHolder: { playerId: number; pressure: number } | null = null;
/** Last decision event of each player (`/test` DebugPanel). */
const lastDecision = new Map<number, DecisionTelemetryEvent>();
const lastMind = new Map<number, HolderMindEvent>();

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
  if (isChance(e.xg)) s.chances++;
  if (isClearChance(e.xg)) s.clearChances++;
  if (lastHolder && lastHolder.playerId === e.player) {
    const team = playerTeam.get(e.player);
    if (team) { teamFlags[team].shotPressureSum += lastHolder.pressure; teamFlags[team].shotPressureCount++; }
  }
  lastHolder = null;
  if (markedNow.has(e.player)) s.markedTargetShots++;
  notify();
});
gameBus.on('shotResolved',  e => { if (e.inPosts) { get(e.player).shotsOnTarget++; notify(); } });
gameBus.on('goalScored',    e => {
  get(e.scorerId).goals++;
  if (markedNow.has(e.scorerId)) get(e.scorerId).markedTargetGoals++;
  if (e.header) get(e.scorerId).headerGoals++;
  if (e.setPiece) get(e.scorerId).setPieceGoals++;
  if (e.setPiece === 'direct_free_kick') get(e.scorerId).directFreeKickGoals++;
  if (e.assistId != null) get(e.assistId).assists++;
  goalLog.push({
    scorerId: e.scorerId, team: e.team, minute: e.minute, header: e.header === true,
    fromX: e.fromX, fromY: e.fromY, goalX: e.goalX,
    ...(e.assistId != null ? { assistId: e.assistId } : {}),
    ...(e.setPiece ? { setPiece: e.setPiece } : {}),
  });
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

// ── Study plan (`.claude/rules/game/study.md`) ───────────────────────────────
gameBus.on('studyPlan', e => {
  teamFlags[e.team].studyPlans++;
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
gameBus.on('injuryStoppage', e => {
  teamFlags[e.team].injuryStoppages++;
  notify();
});

// ── Ball cluster (#145) ───────────────────────────────────────────────────────
// Counted every live tick, no notify (the panels refresh on the other events).
gameBus.on('ballCluster', e => {
  const f = teamFlags[e.defendingTeam];
  f.ballNearTicks++;
  f.ballNearSum += e.defendersNear;
  if (e.defendersNear >= BALL_CLUSTER_CONFIG.CROWD_COUNT) f.ballCrowdTicks++;
});

// ── Discipline stats ──────────────────────────────────────────────────────────
gameBus.on('foul', e => { get(e.offenderId).fouls++; lastHolder = null; notify(); });
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
gameBus.on('penaltyResolved', e => { if (e.scored) { const s = get(e.takerId); s.penaltyGoals++; s.shotsOnTarget++; notify(); } });
gameBus.on('offsideCalled', e => { get(e.receiverId).offsides++; notify(); });

// ── Referee errors and VAR (`.claude/rules/game/var.md`) ──────────────────────
gameBus.on('refereeError', e => { teamFlags[e.team].refereeErrors++; notify(); });
gameBus.on('varReview', e => {
  teamFlags[e.against].varReviews++;
  if (e.outcome === 'overturned') {
    teamFlags[e.against].varOverturned++;
    // A penalty ruled out: no longer awarded / conceded.
    if (e.kind === 'penalty') {
      get(e.playerId).penaltiesAwarded = Math.max(0, get(e.playerId).penaltiesAwarded - 1);
      if (e.offenderId !== undefined) get(e.offenderId).penaltiesConceded = Math.max(0, get(e.offenderId).penaltiesConceded - 1);
    }
  }
  notify();
});
gameBus.on('goalDisallowed', e => {
  const s = get(e.scorerId);
  s.goals = Math.max(0, s.goals - 1);
  if (e.header) s.headerGoals = Math.max(0, s.headerGoals - 1);
  if (e.setPiece) s.setPieceGoals = Math.max(0, s.setPieceGoals - 1);
  if (e.setPiece === 'direct_free_kick') s.directFreeKickGoals = Math.max(0, s.directFreeKickGoals - 1);
  if (e.assistId != null) get(e.assistId).assists = Math.max(0, get(e.assistId).assists - 1);
  for (let i = goalLog.length - 1; i >= 0; i--) {
    if (goalLog[i]!.scorerId === e.scorerId && goalLog[i]!.team === e.team) { goalLog.splice(i, 1); break; }
  }
  notify();
});

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

// ── Active keeper stats ───────────────────────────────────────────────────────
gameBus.on('keeperSortie',  e => { get(e.keeperId).keeperSorties++; notify(); });
gameBus.on('keeperSweep',   e => { get(e.keeperId).keeperSweeps++; notify(); });
gameBus.on('keeperSmother', e => { get(e.keeperId).keeperSmothers++; notify(); });

// ── Kinematics: distance covered and sprints (`kinematics.md`). No notify: it fires every step; the next counted
// event (or the end of the match) refreshes the live panel.
gameBus.on('playerMoved', e => {
  for (const [id, yards] of e.moves) { const s = store.get(id); if (s) s.distanceCovered += yards; }
  for (const id of e.sprints) { const s = store.get(id); if (s) s.sprints++; }
});
gameBus.on('keeperSave', e => {
  if (e.kind === 'hold') get(e.keeperId).keeperHolds++;
  if (e.kind === 'spill') get(e.keeperId).keeperSpills++;
  notify();
});

// ── Set-piece stats ───────────────────────────────────────────────────────────
gameBus.on('cornerAwarded',   e => { get(e.takerId).corners++; notify(); });
gameBus.on('setPieceRoutine', e => { get(e.takerId).setPieceRoutines++; notify(); });
gameBus.on('throwInAwarded',  e => { get(e.takerId).throwIns++; notify(); });
gameBus.on('freeKickAwarded', e => { get(e.takerId).freeKicks++; notify(); });
gameBus.on('directFreeKick',  e => { get(e.player).directFreeKickShots++; notify(); });

// ── Man-marking ───────────────────────────────────────────────────────────────
gameBus.on('manMarkTick', e => {
  markedNow = new Set(e.targetIds);
  const minutes = e.seconds / 60;
  for (const id of e.targetIds) get(id).manMarked += minutes;
});

// ── Decision telemetry (`decisions.md`) ───────────────────────────────────────
// Counted on every fresh decision, no notify (it fires every tick; the next counted event refreshes the panels).
function onDecision(e: DecisionTelemetryEvent): void {
  const s = get(e.playerId);
  const f = teamFlags[e.team];
  const nearTie = e.margin < DECISION_TELEMETRY.NEAR_TIE;
  if (e.family === 'holder') {
    s.holderDecisions++;
    f.holderPressureSum += e.pressure;
    lastHolder = { playerId: e.playerId, pressure: e.pressure };
    if (nearTie) f.holderNearTies++;
  } else if (e.family === 'offBall') {
    s.offBallDecisions++;
    if (nearTie) f.offBallNearTies++;
  } else {
    s.defenseDecisions++;
    if (nearTie) f.defenseNearTies++;
  }
  const cell = bucketMix[e.team][e.family][e.bucket];
  if (cell) cell.set(e.chosen, (cell.get(e.chosen) ?? 0) + 1);
  let pm = playerMix.get(e.playerId);
  if (!pm) { pm = { holder: new Map(), offBall: new Map(), defense: new Map() }; playerMix.set(e.playerId, pm); }
  pm[e.family].set(e.chosen, (pm[e.family].get(e.chosen) ?? 0) + 1);
  lastDecision.set(e.playerId, e);
}

// ── Holder mind (`decisions.md` → phase 3) ─────────────────────────────────────
gameBus.on('holderMind', e => {
  const f = teamFlags[e.team];
  f.holderMindDecisions++;
  if (e.offArgmax) f.holderOffArgmax++;
  if (e.release) f.holderReleases++;
  if (e.simple) f.holderSimple++;
  const high = e.pN >= HOLDER_MIND.HIGH_PRESSURE;
  if (high) { f.holderHighPressure++; if (e.release) f.holderReleasesHigh++; }
  if (e.fresh) {
    f.holderWindows++;
    if (e.lapse) { f.holderLapses++; if (high) f.holderPanics++; }
  }
  lastMind.set(e.playerId, e);
});

// ── Holder moves (`HolderMoves.ts`) ────────────────────────────────────────────
gameBus.on('holderMove', e => {
  const f = teamFlags[e.team];
  if (e.phase === 'start') {
    if (e.move === 'shield') f.moveShield++;
    else if (e.move === 'cut_inside') f.moveCutInside++;
    else if (e.move === 'lay_off') f.moveLayOff++;
  } else if (e.move === 'shield') {
    if (e.phase === 'success') f.moveShieldHeld++;
  } else if (e.move === 'chip') {
    f.moveChip++; if (e.phase === 'success') f.moveChipGoals++;
  } else if (e.move === 'round_keeper') {
    f.moveRound++; if (e.phase === 'success') f.moveRoundWon++;
  }
});

// ── Stage 4: movement and ball physics (`movement.md`) ───────────────────────────
gameBus.on('ballOutOfPlay', e => { teamFlags[e.team].ballsOutOfPlay++; });
gameBus.on('ballRunsLoose', e => {
  if (e.cause === 'deflection') teamFlags[e.team].deflections++;
  else if (e.cause === 'heavy_touch') teamFlags[e.team].heavyTouches++;
});
gameBus.on('shotBlocked', e => { const t = playerTeam.get(e.player); if (t) teamFlags[t].shotsBlocked++; });
gameBus.on('backLineState', e => {
  if (e.mode === 'step_up') teamFlags[e.team].lineStepUps++;
  else if (e.mode === 'drop') teamFlags[e.team].lineDrops++;
});
gameBus.on('pressStandOff', e => { teamFlags[e.team].pressStandOffs++; });
gameBus.on('supportShort', e => { teamFlags[e.team].supportShort++; });
gameBus.on('anticipationRead', e => { teamFlags[e.team].anticipationReads++; });

// ── Stage 3 of the rebuild: the 3D ball (`ball-3d.md`) ───────────────────────────
gameBus.on('ballFlight', e => {
  if (!e.team) return;
  const f = teamFlags[e.team];
  f.ballAirSeconds += e.air;
  if (e.kind === 'loose') return;
  if (e.peak >= BALL_PHYSICS.HIGH_BALL_Z) f.highBalls++;
  if (e.kind === 'cross') { f.crossPeakSum += e.peak; f.crossPeakN++; }
  else if (e.kind === 'corner') { f.cornerPeakSum += e.peak; f.cornerPeakN++; }
  else if (e.kind === 'long_ball' || e.kind === 'clearance') { f.longPeakSum += e.peak; f.longPeakN++; }
});

// ── Stage 4 of the rebuild: the physical pass (`pass-physics.md`) ───────────────────
const PASS_TYPE_FIELD: Partial<Record<import('@/GameEngine/types').PassType, keyof TeamFlags>> = {
  ground: 'passGround', driven: 'passDriven', chip: 'passChip', high: 'passHigh',
  through_low: 'passThroughLow', through_high: 'passThroughHigh', header: 'passHeader',
};
gameBus.on('passLaunched', e => {
  const f = teamFlags[e.team];
  const k = PASS_TYPE_FIELD[e.type];
  if (k) f[k]++;
  f.passLaunchSpeedSum += e.speed; f.passLaunchN++;
});

// ── Stage 4b: FM numbers (`fm-numbers.md`) ────────────────────────────────────────
// ── Stage 5: physical interception (`interception.md`) ───────────────────────────
gameBus.on('interceptionTouch', e => {
  const f = teamFlags[e.team];
  f.cutTouches++; f.cutSpeedSum += e.speedMs;
  if (e.outcome === 'control') f.cutControls++;
  else if (e.outcome === 'clear') f.cutClears++;
  else if (e.outcome === 'deflect') f.cutDeflects++;
  else f.cutMisses++;
});
gameBus.on('passMissed', e => { const t = playerTeam.get(e.player); if (t) teamFlags[t].passesMissed++; });
gameBus.on('longBallStarted', e => { if (e.lofted) { const t = playerTeam.get(e.player); if (t) teamFlags[t].passesLofted++; } });
gameBus.on('holderStep', e => {
  if (e.step === 'hold') teamFlags[e.team].holderHolds++;
  else if (e.step === 'turn') teamFlags[e.team].holderTurns++;
});

/** The last holder-mind event of a player this match (`/test`). */
export function getLastHolderMind(playerId: number): HolderMindEvent | undefined {
  return lastMind.get(playerId);
}

let decisionUnsubs: (() => void)[] = [];
/**
 * Decision telemetry listeners on (default) or off. Off = the engine emits no decision event at all (nobody listens),
 * which is how `DecisionTelemetry.engine.test.ts` proves the telemetry changes nothing.
 */
export function setDecisionTelemetry(on: boolean): void {
  for (const u of decisionUnsubs) u();
  decisionUnsubs = [];
  if (!on) return;
  decisionUnsubs = [
    gameBus.on('holderDecision', onDecision),
    gameBus.on('offBallDecision', onDecision),
    gameBus.on('defensiveDecision', onDecision),
  ];
}
setDecisionTelemetry(true);

/** Entropy per family of one team: per-bucket Shannon entropy weighted by the bucket's decisions. */
function teamEntropy(team: TeamId, family: Family): number {
  let weighted = 0;
  let total = 0;
  for (const cell of bucketMix[team][family]) {
    let n = 0;
    for (const c of cell.values()) n += c;
    if (n === 0) continue;
    weighted += entropyBits(cell.values()) * n;
    total += n;
  }
  return total > 0 ? weighted / total : 0;
}

/** Decision mix (action → count) of one player per family. */
export function getDecisionMix(playerId: number): Record<Family, Record<string, number>> {
  const pm = playerMix.get(playerId);
  const out = { holder: {}, offBall: {}, defense: {} } as Record<Family, Record<string, number>>;
  if (!pm) return out;
  for (const f of FAMILIES) out[f] = Object.fromEntries(pm[f]);
  return out;
}

/** Decision mix of one team per family: all buckets and per bucket. */
export function getTeamDecisionMix(team: TeamId): Record<Family, { total: Record<string, number>; buckets: Record<string, number>[] }> {
  const out = {} as Record<Family, { total: Record<string, number>; buckets: Record<string, number>[] }>;
  for (const f of FAMILIES) {
    const total: Record<string, number> = {};
    const buckets = bucketMix[team][f].map((cell) => {
      for (const [k, v] of cell) total[k] = (total[k] ?? 0) + v;
      return Object.fromEntries(cell);
    });
    out[f] = { total, buckets };
  }
  return out;
}

/** The last decision event of a player this match (`/test`). */
export function getLastDecision(playerId: number): DecisionTelemetryEvent | undefined {
  return lastDecision.get(playerId);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reset all counters and register players for the current match.
 * Call once at match start with all player IDs and their team IDs.
 */
export function initStats(players: Array<{ id: number; team: TeamId }>): void {
  store.clear();
  playerTeam.clear();
  endEnergy.clear();
  goalLog = [];
  markedNow = new Set();
  teamFlags.A = emptyTeamFlags();
  teamFlags.B = emptyTeamFlags();
  resetHighlights(players);
  bucketMix = { A: emptyFamilyBuckets(), B: emptyFamilyBuckets() };
  playerMix.clear();
  lastDecision.clear();
  lastMind.clear();
  lastHolder = null;
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
  const result: TeamStats = {
    ...emptyStats(), ...teamFlags[team], ...highlightTeamStats(team), avgEndEnergy: 0,
    holderEntropy: teamEntropy(team, 'holder'), offBallEntropy: teamEntropy(team, 'offBall'), defenseEntropy: teamEntropy(team, 'defense'),
  };
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
    result.shotsOnTarget   += stats.shotsOnTarget;
    result.goals           += stats.goals;
    result.assists         += stats.assists;
    result.interceptions   += stats.interceptions;
    result.tackles         += stats.tackles;
    result.xg              += stats.xg;
    result.chances         += stats.chances;
    result.clearChances    += stats.clearChances;
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
    result.keeperSorties            += stats.keeperSorties;
    result.keeperSweeps             += stats.keeperSweeps;
    result.keeperSmothers           += stats.keeperSmothers;
    result.distanceCovered          += stats.distanceCovered;
    result.sprints                  += stats.sprints;
    result.keeperHolds              += stats.keeperHolds;
    result.keeperSpills             += stats.keeperSpills;
    result.corners                  += stats.corners;
    result.throwIns                 += stats.throwIns;
    result.setPieceRoutines                 += stats.setPieceRoutines;
    result.freeKicks                += stats.freeKicks;
    result.directFreeKickShots      += stats.directFreeKickShots;
    result.directFreeKickGoals      += stats.directFreeKickGoals;
    result.setPieceGoals            += stats.setPieceGoals;
    result.manMarked                += stats.manMarked;
    result.markedTargetTouches      += stats.markedTargetTouches;
    result.markedTargetShots        += stats.markedTargetShots;
    result.markedTargetGoals        += stats.markedTargetGoals;
    result.holderDecisions          += stats.holderDecisions;
    result.offBallDecisions         += stats.offBallDecisions;
    result.defenseDecisions         += stats.defenseDecisions;
  }
  return result;
}

/** Goals of the match so far, in order (a copy). */
export function getGoalLog(): GoalLogEntry[] {
  return goalLog.map((g) => ({ ...g }));
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
  teamFlags: Record<TeamId, Partial<TeamFlags>>;
  /** Goals so far (absent in snapshots taken before the goal log existed). */
  goals?: GoalLogEntry[];
  /** Highlight layer (`highlights.md`); absent in older snapshots. */
  highlights?: HighlightState;
}

/** Everything accumulated so far, as plain data (no Maps). */
export function exportStatsState(): StatsSnapshot {
  return {
    players:   [...store].map(([id, s]) => [id, { ...s }]),
    teams:     [...playerTeam],
    endEnergy: [...endEnergy].map(([id, e]) => [id, { ...e }]),
    teamFlags: { A: { ...teamFlags.A }, B: { ...teamFlags.B } },
    goals:     goalLog.map((g) => ({ ...g })),
    highlights: exportHighlightState(),
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
  goalLog = (snap.goals ?? []).map((g) => ({ ...g }));
  if (snap.highlights) importHighlightState(snap.highlights);
  teamFlags.A = { ...emptyTeamFlags(), ...snap.teamFlags.A };
  teamFlags.B = { ...emptyTeamFlags(), ...snap.teamFlags.B };
  notify();
}
