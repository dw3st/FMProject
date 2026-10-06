import type { GamePlayer, GameState, Formation, MovementBounds, PlayerRole, TeamId, TeamIntent, MatchPhase, KnockoutDecider, InjuryRecord, CardRecord, SetPiece, PassState, LooseBallSource, SetPieceGoalKind, ManMarkPair } from '@/GameEngine/types';
import type { SlotInstruction } from '@/types/tacticsTypes';
import { effectiveInstruction, resolveSlotTuning } from '@/GameEngine/Configs/RoleVariantConfig';
import { isAerialKind } from '@/GameEngine/types';
import { AERIAL_CONFIG } from '@/GameEngine/Configs/AerialConfig';
import { aerialAbility, aerialDuelScore, headingOf, isInSmallBox, keeperComesFor } from '@/GameEngine/Domain/Aerial';
import { SET_PIECE_CONFIG } from '@/GameEngine/Configs/SetPieceConfig';
import {
  attackingBoxPositions, defendingBoxPositions, directFreeKickXG, distToGoalCentre, isDirectFreeKick, keepDistanceFromBall,
  pickSetPieceTaker, wallBlockChance, wallSize, wallSpots, type SetPieceDuty,
} from '@/GameEngine/Domain/SetPieces';
import type { CornerSource } from '@/GameEngine/Infrastructure/EventBus';
import { resolvePenaltyShootout, penaltyChance, type PenaltySide } from '@/GameEngine/Infrastructure/PenaltyShootout';
import { decide, COMMIT_TICKS, EMPTY_DECISION_MEMORY, isPlayerInRecovery } from '@/GameEngine/Domain/DecisionTree';
import type { PlayerDecision, DecisionPath } from '@/GameEngine/Domain/DecisionTree';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { roleEngine, type RoleEngineTuning } from '@/GameEngine/Domain/roleEngineData';
import { resolveBasePosition, slotBasePosition } from '@/GameEngine/FormationSlots';
import { attackingAnchor } from '@/GameEngine/Domain/AttackingPositioning';
import { computeTargetPosition } from '@/GameEngine/Domain/Positioning';
import { assignMarkTargets } from '@/GameEngine/Domain/DefensivePositioning';
import { teamLineup } from '@/GameEngine/Domain/TeamLineup';
import {
  applyContinuousFatigue,
  applyStaminaCost,
  consumeEnergy,
  getRuntimeLineup,
  normalizeGamePlayer,
  type StaminaAction,
} from '@/GameEngine/Domain/RuntimeLineup';
import { evaluatePassLanes } from '@/GameEngine/Domain/PassLanes';
import { PASS_CONFIG } from '@/GameEngine/Configs/PassConfig';
import {
  THROUGH_BALL_CONFIG,
  CHASE_LOOSE_BALL_WEIGHT_ATTACK,
  CHASE_LOOSE_BALL_WEIGHT_DEFEND,
} from '@/GameEngine/Configs/ThroughBallConfig';
import { isInGoalScoreArea } from '@/GameEngine/Domain/pitch';
import { debugLog, isDebugEnabled } from '@/GameEngine/Support/DebugLog';
import type { RosterPlayer } from '@/types/playerTypes';
import { emptySeasonLog } from '@/types/playerTypes';
import { Player } from '@/Domain/Player';
import { computeBuffedStats } from '@/Domain/PlayerBuffs';
import { factorFromAptitudes, positionAptitudes, positionFactor, scaleStats } from '@/Domain/positions/positionAptitude';
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from '@/GameEngine/Domain/pitch';
import {
  SHOT_SPEED, TACKLE_COOLDOWN, TACKLE_RANGE,
  DUEL_RECOVERY_SPEED_FACTOR,
  DUEL_TACKLE_WIN_RECOVERY, DUEL_TACKLE_LOSS_RECOVERY, DUEL_TACKLE_FAILED_RECOVERY,
  DUEL_DRIBBLE_WIN_RECOVERY, DUEL_DRIBBLE_LOSS_RECOVERY,
  DRIBBLE_RESOLUTION_RANGE,
  CARRY_ACCEL_SPEED_BOOST,
  MAX_INTERCEPTION_CORRIDOR, playerInterceptionCorridor,
  computeShotAim, computeXG, computeOpenAngle, computeWeightedPressure,
  resolveShot, resolveTackle, resolveInterception, resolveDribble, resolveLooseBallDuel,
  resolveAerialDuel, gkClaimChance,
} from '@/GameEngine/Infrastructure/ActionOutcomes';
import { getInterceptionPerpDist, tackleAngleModifier, type RelativePosition } from '@/GameEngine/Domain/PositionalAwareness';
import { foulChance, cardRoll, isClearChance, type FoulKind } from '@/GameEngine/Domain/Fouls';
import { FOUL_CONFIG } from '@/GameEngine/Configs/FoulConfig';
import { computeCrowdGrid } from '@/GameEngine/Infrastructure/CrowdGrid';
import { getDefenseConfig } from '@/GameEngine/Configs/DefenseConfig';
import { withTeamExecution } from '@/GameEngine/Configs/FamiliarityConfig';
import { matchMoraleOf } from '@/GameEngine/Configs/MoraleConfig';
import { matchTemperamentOf } from '@/GameEngine/Configs/PersonalityMatchConfig';
import { temperamentFoulMult } from '@/Domain/personality/personality';
import { withMoraleExecution } from '@/Domain/morale/morale';
import { computeOffsideLine } from '@/GameEngine/Domain/Offside';
import { enumerateCandidateCells } from '@/GameEngine/Domain/ThroughBallCells';
import { getOffBallBias } from '@/GameEngine/Domain/OffBallMovement';
import { OFF_BALL_CONFIG } from '@/GameEngine/Configs/OffBallConfig';
import { ATTACK_CONFIG, POSSESSION_PUSH_UP, PUSH_UP_ROLE_BIAS } from '@/GameEngine/Configs/AttackConfig';
import { resolveFormationSetPieces, generateKickoffLayout } from '@/GameEngine/Domain/SetPieceLayouts';
import type { FormationSetPieces, SetPieceLayout } from '@/GameEngine/Domain/SetPieceLayouts';
import { applySetPieceToTeam, enforceKickoffCircleRule } from '@/GameEngine/Domain/SetPiecePositioning';
import { evaluateAiSubstitutions, shouldCheckAiSubs, findBestBenchForRole } from '@/GameEngine/Domain/AiSubstitution';
import {
  injuryRatePerMinute, contactInjuryChance, rollSeverity,
  type InjuryFactors, type InjurySeverity,
} from '@/Domain/injury/injury';
import { detectTeamIntent } from '@/GameEngine/Domain/IntentDetection';
import { drainMultiplier as loadDrainMultiplier, matchStartEnergy } from '@/Domain/fitness/fitness';

// ── Offside config ────────────────────────────────────────────────────────────

const OFFSIDE_CONFIG = {
  /** Set to false to disable offside enforcement (useful for testing). */
  ENABLED: true,
} as const;

// ── Press intercept config ────────────────────────────────────────────────────
/**
 * Max yards to project the holder forward when computing a press intercept target.
 * Prevents extreme projections when the holder is very fast or the presser very slow.
 */
const PRESS_INTERCEPT_MAX_LOOKAHEAD = 14;

// ── Tune match duration here ──────────────────────────────────────────────────
/** Real-world seconds per half. 150 = 2.5 min/half → 5 min total match. */
const REAL_HALF_DURATION = 150;
// ─────────────────────────────────────────────────────────────────────────────

/** Game-seconds per real-second: 45 game-minutes / REAL_HALF_DURATION. */
const TIME_SCALE = 2700 / REAL_HALF_DURATION;
/** Yards off-ball targets keep from the touchlines (#37). */
const OFF_BALL_TOUCHLINE_MARGIN = 2.5;
/** Minimum yards an off-ball target keeps from a teammate's position (#37). */
const OFF_BALL_MIN_SEPARATION = 3;
/** Duration of one half in game-seconds (45 minutes). */
const HALF_DURATION = 2700;
/**
 * Real-seconds the pre-match / half-time / extra-time-break presentation freeze lasts,
 * counted in game-time via `presentationCountdown` — see `tickState`'s match-phase gating.
 * Exported so UI presentation (e.g. the half-time/extra-time overlay's progress bar) can
 * derive "how much of the pause is left" from the same total the engine drains against,
 * instead of duplicating the constant.
 */
export const PRESENTATION_DURATION = 4;

/** Game-seconds per extra-time half (15 min). */
const ET_HALF_DURATION = 900;
/** Real seconds between presented penalty kicks. */
const PENALTY_KICK_INTERVAL = 1.5;
/** Share of the half-time energy recovery granted in the break before extra time. */
const ET_BREAK_RECOVERY_SCALE = 0.5;

const LIVE_PHASES = new Set<MatchPhase>(['firstHalf', 'secondHalf', 'extraTimeFirst', 'extraTimeSecond']);
const MINUTE_OFFSET: Partial<Record<MatchPhase, number>> = {
  firstHalf: 0, secondHalf: 45, extraTimeBreak: 45, extraTimeFirst: 90, extraTimeSecond: 105, penalties: 105,
};

/** True while the ball can be in play (the four clock-running periods). */
export function isLivePhase(phase: MatchPhase): boolean {
  return LIVE_PHASES.has(phase);
}

/** Displayed match minute (0-based within the match, stoppage not capped). */
export function matchMinute(state: GameState): number {
  return Math.floor(state.matchTime / 60) + (MINUTE_OFFSET[state.matchPhase] ?? 0);
}

/**
 * Game-seconds between periodic team intent re-evaluations. Possession transfer
 * already triggers a recompute; this catches cases where the situation changes
 * mid-possession (opponent pushes forward, we lose a numerical advantage, etc.)
 * without churning every tick — 3 game-seconds is roughly 12 ticks at 0.25s dt.
 */
const INTENT_REEVAL_INTERVAL = 3;

// ── Team factory ─────────────────────────────────────────────────────────────

function mirrorBounds(b: MovementBounds): MovementBounds {
  return { minX: PITCH_LENGTH - b.maxX, maxX: PITCH_LENGTH - b.minX, minY: b.minY, maxY: b.maxY };
}

/** Preferred positions for each engine role, used when picking from a squad roster. */
const ROLE_POSITIONS: Partial<Record<PlayerRole, string[]>> = {
  GK:  ['GK'],
  LB:  ['LB', 'LWB', 'CB', 'RB'],
  RB:  ['RB', 'RWB', 'CB', 'LB'],
  CB:  ['CB', 'LB', 'RB'],
  LWB: ['LWB', 'LB', 'LM', 'CB'],
  RWB: ['RWB', 'RB', 'RM', 'CB'],
  CDM: ['CDM', 'CM', 'DM'],
  CM:  ['CM', 'CAM', 'AM', 'CDM'],
  CAM: ['CAM', 'AM', 'CM', 'LM', 'RM'],
  LM:  ['LM', 'LW', 'CM'],
  RM:  ['RM', 'RW', 'CM'],
  LW:  ['LW', 'LM', 'CM', 'ST'],
  RW:  ['RW', 'RM', 'CM', 'ST'],
  ST:  ['ST', 'CF', 'CAM', 'LW', 'RW'],
};

function pickForRole(players: RosterPlayer[], role: PlayerRole, used: Set<string>): RosterPlayer {
  const preferences = ROLE_POSITIONS[role] ?? [role];
  for (const pos of preferences) {
    const found = players.find(p => !used.has(p.id) && p.positions.includes(pos));
    if (found) return found;
  }
  return players.find(p => !used.has(p.id)) ?? players[0]!;
}

/**
 * Maps any position string (including abstract codes like "CF", "DM", "AM",
 * "Defender", "Midfielder", "Forward") to a valid engine PlayerRole.
 */
const POSITION_TO_ROLE: Record<string, PlayerRole> = {
  GK: 'GK',
  CB: 'CB', LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB',
  CDM: 'CDM', DM: 'CDM',
  CM: 'CM',
  CAM: 'CAM', AM: 'CAM',
  LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW',
  ST: 'ST', CF: 'ST',
  // Abstract labels from API Football pipeline
  Defender: 'CB', Midfielder: 'CM', Forward: 'ST', Attacker: 'ST',
};

function toValidPlayerRole(pos: string): PlayerRole {
  return POSITION_TO_ROLE[pos] ?? 'CM';
}

function buildGamePlayerForSlot(
  rp: RosterPlayer,
  slotDef: { role: PlayerRole; yRange?: number },
  slotIndex: number,
  formation: Formation,
  team: TeamId,
  engineId: number,
): GamePlayer {
  const attackDir = (team === 'A' ? 1 : -1) as 1 | -1;
  // Style familiarity (execution, `FamiliarityConfig.ts`) scales the team's attributes, and the
  // player's morale his own (`.claude/rules/game/morale.md`; 65 / absent = unchanged).
  const buffed = withMoraleExecution(withTeamExecution(computeBuffedStats(
    rp.stats,
    Player.trainingToStatus(rp.seasonLog?.trainingSessions ?? 0),
    Player.moraleToStatus(rp.seasonLog?.morale ?? 70),
    Player.formToStatus(rp.seasonLog?.recentRatings ?? []),
  ), team), matchMoraleOf(team, rp.morale));
  const roleEng  = roleEngine(slotDef.role);
  const startPos = resolveBasePosition(slotIndex, attackDir, formation, 'attacking');
  const yRange   = slotDef.yRange ?? roleEng.yRange;
  const slotY    = startPos.y;
  const xBoundsA = roleEng.bounds;
  const xBounds  = team === 'A' ? xBoundsA : mirrorBounds({ ...xBoundsA, minY: 0, maxY: 74 });
  const bounds   = {
    minX: xBounds.minX,
    maxX: xBounds.maxX,
    minY: Math.max(0,           slotY - yRange),
    maxY: Math.min(PITCH_WIDTH, slotY + yRange),
  };
  // Out-of-position penalty: attributes scaled by the player's aptitude for the slot's role.
  const baseStats = teamLineup(scaleStats(buffed, positionFactor(rp, slotDef.role)), slotDef.role);
  // Match start energy is persisted fitness compressed toward the reference matchday fitness
  // (`matchStartEnergy` — see `.claude/rules/non-player-games.md` → "Fadiga"), not raw fitness.
  // No persisted history (a save-game player before their first advance-day, or a hand-built
  // roster with no `seasonLog`) falls back to `emptySeasonLog().fitness` (75) — the SAME default
  // quickSim (`startFitness`) and the lineup selector (`fitnessAdjustedValue`) already use, so a
  // squad without history is valued consistently everywhere instead of starting at a full 100 here
  // only. `TestCases.ts` scenarios that want a genuinely fresh 100-energy match (most of them —
  // this default is for engine tuning, not fitness testing) give their roster an explicit
  // `seasonLog.fitness: 100` for that reason.
  const energy = matchStartEnergy(rp.seasonLog?.fitness ?? emptySeasonLog().fitness);
  return {
    id:               engineId,
    rosterId:         rp.id,
    name:             rp.name,
    team,
    role:             slotDef.role,
    attackDir,
    x:                startPos.x,
    y:                startPos.y,
    baseStats,
    fit:              { stats: buffed, aptitudes: positionAptitudes(rp) },
    runtimeStats:     getRuntimeLineup(baseStats, { energy }),
    energy,
    startEnergy:      energy,
    stamina:          buffed.stamina,
    drainMultiplier:      loadDrainMultiplier(rp.seasonLog?.load ?? 0),
    fatigueBaselineEnergy: energy,
    ballSupportScale: roleEng.ballSupportScale,
    slotIndex,
    basePosition:     startPos,
    targetPosition:   startPos,
    bounds,
    recoveryTime:     0,
    justReceivedTicks: 0,
    decisionMemory:   EMPTY_DECISION_MEMORY,
    age:              rp.age,
    strengthAttr:     buffed.strength,
    injuryLoad:       rp.seasonLog?.load ?? 0,
    morale:           matchMoraleOf(team, rp.morale),
    temperament:      matchTemperamentOf(team, rp),
  };
}

function buildTeam(
  players: RosterPlayer[],
  formation: Formation,
  team: TeamId,
  idOffset: number,
  lineup?: string[],
): { starters: GamePlayer[]; bench: GamePlayer[]; usedIds: Set<string> } {
  const used  = new Set<string>();
  const byId  = new Map(players.map(p => [p.id, p]));
  const starters = formation.attacking.map((slotDef, i) => {
    // Use explicit lineup slot if valid, otherwise fall back to role-based pick
    const lineupId = lineup?.[i];
    const rp = (lineupId && byId.has(lineupId) && !used.has(lineupId))
      ? byId.get(lineupId)!
      : pickForRole(players, slotDef.role, used);
    used.add(rp.id);
    return buildGamePlayerForSlot(rp, slotDef, i, formation, team, idOffset + i + 1);
  });

  // Build bench from remaining squad members in squad order
  const bench: GamePlayer[] = [];
  let benchIdOffset = idOffset + 100; // bench IDs start well above the 11 starters
  for (const rp of players) {
    if (used.has(rp.id)) continue;
    const naturalRole = toValidPlayerRole(rp.positions?.[0] ?? 'CM');
    const roleEng = roleEngine(naturalRole);
    const attackDir = (team === 'A' ? 1 : -1) as 1 | -1;
    const buffed = withMoraleExecution(withTeamExecution(computeBuffedStats(
      rp.stats,
      Player.trainingToStatus(rp.seasonLog?.trainingSessions ?? 0),
      Player.moraleToStatus(rp.seasonLog?.morale ?? 70),
      Player.formToStatus(rp.seasonLog?.recentRatings ?? []),
    ), team), matchMoraleOf(team, rp.morale));
    const baseStats = teamLineup(buffed, naturalRole);
    // See the starters' build above — same `matchStartEnergy` compression, same no-history fallback.
    const energy = matchStartEnergy(rp.seasonLog?.fitness ?? emptySeasonLog().fitness);
    // Bench players have placeholder positions — overwritten when they sub in
    const dummyPos = { x: 0, y: 0 };
    const dummyBounds = { minX: 0, maxX: PITCH_LENGTH, minY: 0, maxY: PITCH_WIDTH };
    bench.push({
      id:               benchIdOffset++,
      rosterId:         rp.id,
      name:             rp.name,
      team,
      role:             naturalRole,
      attackDir,
      x:                dummyPos.x,
      y:                dummyPos.y,
      baseStats,
      fit:              { stats: buffed, aptitudes: positionAptitudes(rp) },
      runtimeStats:     getRuntimeLineup(baseStats, { energy }),
      energy,
      startEnergy:      energy,
      stamina:          buffed.stamina,
      drainMultiplier:      loadDrainMultiplier(rp.seasonLog?.load ?? 0),
      fatigueBaselineEnergy: energy,
      ballSupportScale: roleEng.ballSupportScale,
      slotIndex:        -1,
      basePosition:     dummyPos,
      targetPosition:   dummyPos,
      bounds:           dummyBounds,
      recoveryTime:     0,
      justReceivedTicks: 0,
      decisionMemory:   EMPTY_DECISION_MEMORY,
      age:              rp.age,
      strengthAttr:     buffed.strength,
      injuryLoad:       rp.seasonLog?.load ?? 0,
      morale:           matchMoraleOf(team, rp.morale),
      temperament:      matchTemperamentOf(team, rp),
    });
  }

  return { starters, bench, usedIds: used };
}

/**
 * Create a live-match GameState from two squads and their formations.
 *
 * @param playersA    Roster of Team A (the user's club).
 * @param formationA  Formation object for Team A.
 * @param playersB    Roster of Team B (the opponent).
 * @param formationB  Formation object for Team B.
 * @param lineupA     Optional ordered player IDs for Team A (index = slot index).
 * @param lineupB     Optional ordered player IDs for Team B (index = slot index).
 * @param injuryMult  Fitness-coach injury multiplier per team (`Domain/staff`); default 1 each.
 */
export function createMatchState(
  playersA:   RosterPlayer[],
  formationA: Formation,
  playersB:   RosterPlayer[],
  formationB: Formation,
  lineupA?:   string[],
  lineupB?:   string[],
  injuryMult: { A?: number; B?: number } = {},
): GameState {
  const withMult = (r: ReturnType<typeof buildTeam>, m: number | undefined) =>
    m === undefined || m === 1
      ? r
      : {
          ...r,
          starters: r.starters.map(p => ({ ...p, injuryMult: m })),
          bench:    r.bench.map(p => ({ ...p, injuryMult: m })),
        };
  const teamAResult = withMult(buildTeam(playersA, formationA, 'A', 0, lineupA), injuryMult.A);
  const teamBResult = withMult(buildTeam(playersB, formationB, 'B', 200, lineupB), injuryMult.B);
  const teamA = teamAResult.starters;
  const teamB = teamBResult.starters;

  // Team A kicks off — apply kickOff to A, kickOffDefend to B
  const spA = resolveFormationSetPieces(formationA);
  const spB = resolveFormationSetPieces(formationB);
  const kickoffLayoutA     = spA?.kickOff        ?? generateKickoffLayout(formationA);
  const kickoffDefendLayoutB = spB?.kickOffDefend ?? generateKickoffLayout(formationB);
  let players = [...teamA, ...teamB];
  players = applySetPieceToTeam(players, 'A', kickoffLayoutA);
  players = applySetPieceToTeam(players, 'B', kickoffDefendLayoutB);
  players = enforceKickoffCircleRule(players, 'B');

  const kickoffHolder = players.find(p => p.team === 'A' && p.role === 'ST') ?? teamA[teamA.length - 1]!;

  return {
    players,
    benchA:                teamAResult.bench,
    benchB:                teamBResult.bench,
    substitutions:         [],
    injuries:              [],
    cards:                 [],
    subsRemainingA:        5,
    subsRemainingB:        5,
    pendingSubsA:          [],
    pendingSubsB:          [],
    formationA,
    formationB,
    ballHolderId:          kickoffHolder.id,
    pass:                  null,
    shot:                  null,
    looseBall:             null,
    score:                 { A: 0, B: 0 },
    tackleCooldown:        0,
    setPiece:              { type: 'kickoff', takerId: kickoffHolder.id, countdown: 2 },
    decisions:             {},
    matchPhase:            'preMatch',
    matchTime:             0,
    extraTimeFirst:        Math.floor(Math.random() * 6) * 60,
    extraTimeSecond:       Math.floor(Math.random() * 6) * 60,
    presentationCountdown: PRESENTATION_DURATION,
    possessionTime:        0,
    lastPasserId:          null,
    teamIntent:            { A: 'balanced', B: 'balanced' },
    throughBallCellsCache: null,
  };
}

// ── Substitution execution ────────────────────────────────────────────────────

/**
 * Immediately swap `outPlayerId` (on-pitch) for `inPlayerId` (bench).
 * The incoming player inherits the outgoing player's slot, role, position, and bounds.
 * Does NOT check `subsRemaining` — callers must validate that themselves.
 */
export function performSubstitution(
  state: GameState,
  team: TeamId,
  outPlayerId: number,
  inPlayerId: number,
  reason?: 'fatigue' | 'injury',
): GameState {
  const bench = team === 'A' ? state.benchA : state.benchB;
  const outPlayer = state.players.find(p => p.id === outPlayerId && p.team === team);
  const inPlayer  = bench.find(p => p.id === inPlayerId);
  if (!outPlayer || !inPlayer) return state;

  const formation = team === 'A' ? state.formationA : state.formationB;
  const slotDef   = formation.attacking[outPlayer.slotIndex];
  const role      = slotDef?.role ?? outPlayer.role;

  // Re-field the incoming player in the slot's role with the out-of-position penalty applied;
  // players without `fit` (hand-built test states) keep the stats built at lineup time.
  const newBaseStats = inPlayer.fit
    ? teamLineup(scaleStats(inPlayer.fit.stats, factorFromAptitudes(inPlayer.fit.aptitudes, role)), role)
    : inPlayer.baseStats;

  const incoming: GamePlayer = {
    ...inPlayer,
    role,
    slotIndex:      outPlayer.slotIndex,
    attackDir:      outPlayer.attackDir,
    x:              outPlayer.x,
    y:              outPlayer.y,
    basePosition:   outPlayer.basePosition,
    targetPosition: outPlayer.targetPosition,
    bounds:         outPlayer.bounds,
    // The slot's instruction (role variant / pressing / man-marking) belongs to the slot.
    engine:          outPlayer.engine,
    instruction:     outPlayer.instruction,
    manMarkTargetId: outPlayer.manMarkTargetId,
    ballSupportScale: roleEngine(role).ballSupportScale,
    baseStats:      newBaseStats,
    runtimeStats:   getRuntimeLineup(newBaseStats, { energy: inPlayer.energy }),
    fatigueBaselineEnergy: inPlayer.energy,
    decisionMemory: EMPTY_DECISION_MEMORY,
    recoveryTime:   0,
    justReceivedTicks: 0,
  };

  const minute = matchMinute(state);

  const record: import('../types').SubstitutionRecord = {
    team,
    playerOutId:       outPlayerId,
    playerOutName:     outPlayer.name,
    playerOutRosterId: outPlayer.rosterId,
    playerOutEnergy:   outPlayer.energy,
    playerInId:        inPlayerId,
    playerInName:      inPlayer.name,
    playerInRosterId:  inPlayer.rosterId,
    matchMinute: minute,
  };

  gameBus.emit('playerSubstituted', { outId: outPlayerId, inId: inPlayerId, team, outEnergy: outPlayer.energy, reason });

  // Transfer ball if outgoing player held it
  let ballHolderId = state.ballHolderId;
  if (ballHolderId === outPlayerId) {
    const nearest = state.players
      .filter(p => p.team === team && p.id !== outPlayerId)
      .sort((a, b) => distSq(a, outPlayer) - distSq(b, outPlayer));
    ballHolderId = nearest[0]?.id ?? ballHolderId;
  }

  const newPlayers = state.players.map(p => p.id === outPlayerId ? incoming : p);
  const newBench   = bench.filter(p => p.id !== inPlayerId);
  // A wall player subbed during a direct free kick: the incoming player takes his spot in the wall.
  const sp = state.setPiece;
  const setPiece = sp?.wallIds?.includes(outPlayerId)
    ? { ...sp, wallIds: sp.wallIds.map(id => (id === outPlayerId ? inPlayerId : id)) }
    : sp;

  return cleanupAfterPlayerLeft({
    ...state,
    players:         newPlayers,
    benchA:          team === 'A' ? newBench : state.benchA,
    benchB:          team === 'B' ? newBench : state.benchB,
    subsRemainingA:  team === 'A' ? state.subsRemainingA - 1 : state.subsRemainingA,
    subsRemainingB:  team === 'B' ? state.subsRemainingB - 1 : state.subsRemainingB,
    substitutions:   [...state.substitutions, record],
    ballHolderId,
    setPiece,
  }, outPlayerId);
}

/**
 * Process all pending substitutions for a team, capped by remaining subs.
 */
function flushPendingSubs(state: GameState, team: TeamId): GameState {
  const all = team === 'A' ? state.pendingSubsA : state.pendingSubsB;
  if (all.length === 0) return state;
  // The taker of a set piece being set up keeps his place until the ball is played: subbing him
  // during the freeze would hand the ball to whoever stands nearest, off the restart spot.
  const takerId = state.setPiece?.takerId;
  const deferred = all.filter(req => req.outId === takerId);
  const pending = all.filter(req => req.outId !== takerId);
  if (pending.length === 0) return state;

  let s = {
    ...state,
    pendingSubsA: team === 'A' ? deferred : state.pendingSubsA,
    pendingSubsB: team === 'B' ? deferred : state.pendingSubsB,
  };

  for (const req of pending) {
    const subsLeft = team === 'A' ? s.subsRemainingA : s.subsRemainingB;
    if (subsLeft <= 0) break;
    s = performSubstitution(s, team, req.outId, req.inId, req.reason);
  }

  return s;
}

// ── In-match injuries ─────────────────────────────────────────────────────────
// `docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Na partida". Pure risk math lives in
// `Domain/injury/injury.ts`; this file owns reading player condition and executing the outcome
// (forced substitution, or "play on with 10" when none is available).

function injuryFactorsOf(p: GamePlayer): InjuryFactors {
  return { energy: p.energy, load: p.injuryLoad, age: p.age, strength: p.strengthAttr, staffMult: p.injuryMult ?? 1 };
}

/**
 * Cleans up references to a player who just left the pitch (removed outright, or replaced by a
 * substitution) so no other piece of state dangles on their now-stale id:
 *  - `setPiece.takerId` — reassigned to the CURRENT `ballHolderId` (already correctly updated by
 *    the caller before this runs) if it was pointing at the player who left.
 *  - `pendingSubsA`/`B` — any queued sub with `outId === leftId` is now unfulfillable (that player
 *    is gone) and is dropped rather than left to silently no-op in `performSubstitution`.
 *  - `decisions[leftId]` — stale per-tick decision entry removed.
 * `looseBall` ids (`fromPasserId`/`intendedRunnerId`) are tolerated unresolved — they're purely
 * informational once the ball has moved on and nothing dereferences them as a live player lookup.
 */
function cleanupAfterPlayerLeft(state: GameState, leftId: number): GameState {
  let s = state;
  if (s.setPiece && s.setPiece.takerId === leftId) {
    s = { ...s, setPiece: { ...s.setPiece, takerId: s.ballHolderId } };
  }
  if (s.pendingSubsA.some(p => p.outId === leftId) || s.pendingSubsB.some(p => p.outId === leftId)) {
    s = {
      ...s,
      pendingSubsA: s.pendingSubsA.filter(p => p.outId !== leftId),
      pendingSubsB: s.pendingSubsB.filter(p => p.outId !== leftId),
    };
  }
  if (leftId in s.decisions) {
    const rest = { ...s.decisions };
    delete rest[leftId];
    s = { ...s, decisions: rest };
  }
  return refreshManMarks(s);
}

/** Removes a player from the pitch outright (no bench candidate / no subs left — "play on with 10"). */
function removeInjuredPlayer(state: GameState, player: GamePlayer): GameState {
  let ballHolderId = state.ballHolderId;
  if (ballHolderId === player.id) {
    const nearest = state.players
      .filter(p => p.team === player.team && p.id !== player.id)
      .sort((a, b) => distSq(a, player) - distSq(b, player));
    ballHolderId = nearest[0]?.id ?? ballHolderId;
  }
  return cleanupAfterPlayerLeft({
    ...state,
    players: state.players.filter(p => p.id !== player.id),
    ballHolderId,
  }, player.id);
}

/** Emergency-keeper stat floor — deliberately weak (a real GK's stats are built from role-specific
 *  attributes and land well above this), just enough that shots against a promoted outfielder
 *  aren't an automatic save-chance of exactly zero. 0..1 scale, same as `runtimeStats`. */
const GK_EMERGENCY_STAT_FLOOR = 0.2;

/** True when a GK-role player actually has GK-specific stats built (i.e. `teamLineup` built them
 *  as a real keeper) — false for an outfielder whose role got relabelled 'GK' by a substitution
 *  slot but whose `baseStats` were never recomputed for the position (see `performSubstitution`'s
 *  "we don't have their raw PlayerStatsRecord anymore" comment). */
function hasRealGkStats(p: GamePlayer): boolean {
  const s = p.baseStats.withoutBall;
  return s.gkPositioning > 0 || s.gkReflex > 0 || s.gkDiving > 0;
}

function withGkStatFloor(p: GamePlayer): GamePlayer {
  const floor = (v: number) => Math.max(v, GK_EMERGENCY_STAT_FLOOR);
  return {
    ...p,
    baseStats: {
      ...p.baseStats,
      withoutBall: {
        ...p.baseStats.withoutBall,
        gkPositioning: floor(p.baseStats.withoutBall.gkPositioning),
        gkReflex:      floor(p.baseStats.withoutBall.gkReflex),
        gkDiving:      floor(p.baseStats.withoutBall.gkDiving),
      },
    },
    runtimeStats: {
      ...p.runtimeStats,
      withoutBall: {
        ...p.runtimeStats.withoutBall,
        gkPositioning: floor(p.runtimeStats.withoutBall.gkPositioning),
        gkReflex:      floor(p.runtimeStats.withoutBall.gkReflex),
        gkDiving:      floor(p.runtimeStats.withoutBall.gkDiving),
      },
    },
  };
}

/**
 * Guarantees `team` has a goalkeeper capable of at least a baseline save chance, after an
 * injury-forced sub/removal. Two cases:
 *  - No GK-role player at all (the injured keeper was removed outright, no subs left/no bench) —
 *    promotes the outfield player closest to the team's own goal: role → GK, slot 0, bounds and
 *    position rebuilt from the GK role engine entry, plus the stat floor below.
 *  - A GK-role player exists but was never actually built as a keeper (bench had no GK, so
 *    `findBestBenchForRole` brought on an outfielder — `performSubstitution` forces the SLOT's
 *    role onto them but keeps their old outfield `baseStats`, all-zero GK stats) — patches the
 *    stat floor onto that SAME player in place; no repositioning needed, they're already on the
 *    GK slot/bounds from the substitution itself.
 */
function ensureCompetentGK(state: GameState, team: TeamId): GameState {
  const teamPlayers = state.players.filter(p => p.team === team);
  const gk = teamPlayers.find(p => p.role === 'GK');

  if (gk) {
    if (hasRealGkStats(gk)) return state;
    return { ...state, players: state.players.map(p => (p.id === gk.id ? withGkStatFloor(p) : p)) };
  }

  const outfield = teamPlayers.filter(p => p.role !== 'GK');
  if (outfield.length === 0) return state; // nobody left on the team at all — degenerate, nothing to promote

  const ownGoalX = outfield[0]!.attackDir === 1 ? 0 : PITCH_LENGTH;
  const deepest = outfield.reduce((best, p) =>
    Math.abs(p.x - ownGoalX) < Math.abs(best.x - ownGoalX) ? p : best,
  );

  const roleEng    = roleEngine('GK');
  const xBoundsBase = roleEng.bounds;
  // Mirroring follows the attack direction (correct after half-time too), not the team.
  const xBounds    = deepest.attackDir === 1 ? xBoundsBase : mirrorBounds({ ...xBoundsBase, minY: 0, maxY: PITCH_WIDTH });
  const goalY      = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
  const bounds: MovementBounds = {
    minX: xBounds.minX, maxX: xBounds.maxX,
    minY: Math.max(0, goalY - roleEng.yRange),
    maxY: Math.min(PITCH_WIDTH, goalY + roleEng.yRange),
  };
  const goalPos = { x: ownGoalX, y: goalY };

  const promoted = withGkStatFloor({
    ...deepest,
    role:              'GK' as PlayerRole,
    slotIndex:         0,
    x:                 goalPos.x,
    y:                 goalPos.y,
    basePosition:      goalPos,
    targetPosition:    goalPos,
    bounds,
    ballSupportScale:  roleEng.ballSupportScale,
  });
  // The emergency keeper plays the GK role: no outfield slot instruction, no man-marking.
  delete promoted.engine;
  delete promoted.instruction;
  delete promoted.manMarkTargetId;

  return refreshManMarks({ ...state, players: state.players.map(p => (p.id === deepest.id ? promoted : p)) });
}

/**
 * Records an injury, emits the `injury` event, and either forces a substitution (best bench
 * player for the injured player's slot — reuses `findBestBenchForRole`, same choice
 * `evaluateAiSubstitutions` would make) or, with no subs remaining / no bench candidate, removes
 * the player outright — the team plays on with 10 (or fewer). Either way, guarantees the team
 * still has a competent goalkeeper afterward (`ensureCompetentGK`).
 */
export function forceInjurySubstitution(
  state: GameState,
  player: GamePlayer,
  minute: number,
  severity: InjurySeverity,
): GameState {
  const team = player.team;
  const record: InjuryRecord = {
    team,
    playerId:       player.id,
    playerName:     player.name,
    playerRosterId: player.rosterId,
    severity,
    matchMinute:    minute,
    energy:         player.energy,
  };
  let s: GameState = { ...state, injuries: [...state.injuries, record] };
  gameBus.emit('injury', { playerId: player.id, playerName: player.name, team, minute, severity });
  debugLog('injury', `${player.name} (team ${team}) injured — ${severity}, minute ${minute}`, {
    playerId: player.id,
    data: { severity, minute, team, energy: player.energy },
  });

  const subsLeft = team === 'A' ? s.subsRemainingA : s.subsRemainingB;
  const bench    = team === 'A' ? s.benchA         : s.benchB;
  let result: GameState;
  if (subsLeft > 0 && bench.length > 0) {
    const best = findBestBenchForRole(bench, player.role);
    result = best ? performSubstitution(s, team, player.id, best.id, 'injury') : removeInjuredPlayer(s, player);
  } else {
    result = removeInjuredPlayer(s, player);
  }
  return ensureCompetentGK(result, team);
}

/** Per-tick, per-player injury roll: `injuryRatePerMinute` scaled to the game-minutes elapsed this tick. */
function rollInMatchInjuries(state: GameState, dt: number): GameState {
  const gameMinutes = (dt * TIME_SCALE) / 60;
  let s = state;
  for (const player of state.players) {
    // Guard against a player removed earlier THIS tick by a prior roll.
    if (!s.players.some(p => p.id === player.id)) continue;
    const prob = injuryRatePerMinute(injuryFactorsOf(player)) * gameMinutes;
    if (Math.random() < prob) {
      s = forceInjurySubstitution(s, player, matchMinute(s), rollSeverity());
    }
  }
  return s;
}

/**
 * Extra contact-event injury risk for the two players involved in a tackle or loose-ball duel —
 * rolled independently for each, regardless of who won. Looks players up by id on the CURRENT
 * state so it's safe to call after possession/recovery updates have already been applied.
 */
function rollContactInjuries(state: GameState, ids: [number, number], minute: number): GameState {
  let s = state;
  for (const id of ids) {
    const player = s.players.find(p => p.id === id);
    if (!player) continue; // already left the pitch this tick
    if (Math.random() < contactInjuryChance(injuryFactorsOf(player))) {
      s = forceInjurySubstitution(s, player, minute, rollSeverity());
    }
  }
  return s;
}

// ── Discipline: fouls, cards, free kicks, penalties ───────────────────────────
// `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §1–3, `.claude/rules/game-engine/fouls.md`.
// Pure probabilities live in `Domain/Fouls.ts`; this section reads the players involved and
// executes the outcome (card, sending-off, free-kick / penalty restart).

function yellowsOf(state: GameState, playerId: number): number {
  // `?? []`: debug snapshots captured before cards existed have no `cards` field.
  return (state.cards ?? []).filter(c => c.playerId === playerId && c.card === 'yellow').length;
}

function angleFromModifier(mod: number): RelativePosition {
  if (mod > 0.2) return 'front';
  if (mod < -0.2) return 'behind';
  return 'side';
}

/**
 * Records a card (and the red that a second yellow becomes), emits `card`, and sends the player
 * off on a red: removed outright, no substitute (same path as an injured player with no bench),
 * then the goalkeeper safety net (`ensureCompetentGK`).
 */
export function bookPlayer(state: GameState, player: GamePlayer, card: 'yellow' | 'red', minute: number): GameState {
  const record = (c: 'yellow' | 'red', secondYellow: boolean): CardRecord => ({
    team: player.team, playerId: player.id, playerName: player.name, playerRosterId: player.rosterId,
    card: c, secondYellow, matchMinute: minute, energy: player.energy,
  });
  const emit = (c: 'yellow' | 'red', secondYellow: boolean) => {
    gameBus.emit('card', { playerId: player.id, playerName: player.name, team: player.team, card: c, secondYellow, minute });
    const label = c === 'red' ? (secondYellow ? 'Second yellow -> RED' : 'RED card') : 'Yellow card';
    debugLog('card', `${label}: ${player.name} (team ${player.team}), minute ${minute}`, {
      playerId: player.id, data: { card: c, secondYellow, minute, tempMult: temperamentFoulMult(player.temperament ?? 0) },
    });
  };

  let s = state;
  let sentOff = card === 'red';
  if (card === 'yellow') {
    const secondYellow = yellowsOf(s, player.id) >= 1;
    s = { ...s, cards: [...(s.cards ?? []), record('yellow', false)] };
    emit('yellow', false);
    if (secondYellow) {
      s = { ...s, cards: [...(s.cards ?? []), record('red', true)] };
      emit('red', true);
      sentOff = true;
    }
  } else {
    s = { ...s, cards: [...(s.cards ?? []), record('red', false)] };
    emit('red', false);
  }
  if (!sentOff) return s;
  return ensureCompetentGK(removeInjuredPlayer(s, player), player.team);
}

/** Game-seconds past the period's end that a pending penalty / dangerous free kick may still use. */
const RESTART_HOLD_MAX = 60;

/**
 * True when the whistle must wait for a pending restart: a penalty (resolved at the end of its
 * freeze), a free kick within `DANGEROUS_FREE_KICK_DIST` of the goal still held by its taker, or a
 * shot already in flight (so a direct free kick is resolved too).
 * Capped at `RESTART_HOLD_MAX` game-seconds past `periodEnd` so a stuck restart never stops the clock.
 */
export function restartHoldsPeriod(state: GameState, newMatchTime: number, periodEnd: number): boolean {
  const sp = state.setPiece;
  if (state.shot && newMatchTime < periodEnd + RESTART_HOLD_MAX) return true;
  // A high ball from a set piece (free kick / goal kick) is played out before the whistle.
  if (state.pass?.fromSetPiece && isAerialKind(state.pass.kind) && newMatchTime < periodEnd + RESTART_HOLD_MAX) return true;
  if (!sp || newMatchTime >= periodEnd + RESTART_HOLD_MAX) return false;
  if (sp.type === 'penalty') return true;
  // A corner still with its taker is taken before the whistle (`set-pieces-play.md`).
  if (sp.type === 'corner' && state.ballHolderId === sp.takerId) return true;
  if (sp.type !== 'free_kick' || !sp.position || state.ballHolderId !== sp.takerId) return false;
  if (sp.variant) return true;
  const taker = state.players.find(p => p.id === sp.takerId);
  if (!taker) return false;
  const goalX = taker.attackDir === 1 ? PITCH_LENGTH : 0;
  return Math.abs(goalX - sp.position.x) <= FOUL_CONFIG.DANGEROUS_FREE_KICK_DIST;
}

/** Penalty spot of the goal whose goal line is at `goalX`. */
function penaltySpot(goalX: number): { x: number; y: number } {
  const d = FOUL_CONFIG.PENALTY_SPOT_DIST;
  return { x: goalX === 0 ? d : PITCH_LENGTH - d, y: (GOAL_Y_MIN + GOAL_Y_MAX) / 2 };
}

// ── Set-piece play (`.claude/rules/game-engine/set-pieces-play.md`) ──────────

/** Set-piece taker for `duty` among `team`'s players on the pitch (manager's choice, else automatic). */
function setPieceTakerOf(state: GameState, team: TeamId, duty: SetPieceDuty): GamePlayer | null {
  return pickSetPieceTaker(duty, state.players.filter(p => p.team === team), state.setPieceTakers?.[team]?.[duty]);
}

/** Opens a set-piece phase for `team`: a goal before it closes counts as a set-piece goal of `kind`. */
function openSetPiecePhase(state: GameState, team: TeamId, kind: SetPieceGoalKind, countdown: number): GameState {
  return {
    ...state,
    setPiecePhase: { team, kind, until: state.matchTime + countdown * TIME_SCALE + SET_PIECE_CONFIG.SET_PIECE_PHASE_SECONDS },
  };
}

/** The set-piece kind of a goal `team` scores right now, if a phase of theirs is open. */
function setPieceGoalOf(state: GameState, team: TeamId): SetPieceGoalKind | undefined {
  const ph = state.setPiecePhase;
  return ph && ph.team === team && state.matchTime <= ph.until ? ph.kind : undefined;
}

/**
 * Both teams into the box set-piece layout (corner / crossed free kick) with `taker` on `ball`:
 * `attackingBoxPositions` for his team, `defendingBoxPositions` for the other.
 */
function applyBoxSetPiece(
  players: GamePlayer[],
  taker: GamePlayer,
  ball: { x: number; y: number },
  kind: 'corner' | 'free_kick',
  rng: () => number,
): GamePlayer[] {
  const att = attackingBoxPositions(players.filter(p => p.team === taker.team), taker.id, ball, taker.attackDir, kind, rng);
  const goalX = taker.attackDir === 1 ? PITCH_LENGTH : 0;
  const def = defendingBoxPositions(players.filter(p => p.team !== taker.team), att, ball, goalX, kind);
  return players.map(p => {
    const pos = att.positions.get(p.id) ?? def.positions.get(p.id);
    return pos ? { ...p, x: pos.x, y: pos.y, targetPosition: { ...pos } } : p;
  });
}

/**
 * Direct free kick by `taker` at `pos`: the free-kick layouts, then the wall — `wallSize` defenders
 * (not the three best in the air, who stay in the box) moved onto `wallSpots`.
 */
function applyDirectFreeKick(
  state: GameState,
  players: GamePlayer[],
  taker: GamePlayer,
  pos: { x: number; y: number },
): { players: GamePlayer[]; wallIds: number[] } {
  const oppTeam: TeamId = taker.team === 'A' ? 'B' : 'A';
  const aLay = resolveFormationSetPieces(taker.team === 'A' ? state.formationA : state.formationB);
  const oLay = resolveFormationSetPieces(oppTeam === 'A' ? state.formationA : state.formationB);
  let out = players;
  if (aLay) out = applySetPieceToTeam(out, taker.team, aLay.freeKick_Attack);
  if (oLay) out = applySetPieceToTeam(out, oppTeam, oLay.freeKick_Defend);
  const goalX = taker.attackDir === 1 ? PITCH_LENGTH : 0;
  // The 10-yard rule for the defending layout.
  out = out.map(p => {
    if (p.team !== oppTeam) return p;
    const q = keepDistanceFromBall(p, pos, goalX);
    return q === p || (q.x === p.x && q.y === p.y) ? p : { ...p, x: q.x, y: q.y, targetPosition: { ...q } };
  });
  const spots = wallSpots(pos, goalX, wallSize(distToGoalCentre(pos, goalX), computeOpenAngle(pos.x, pos.y, goalX)));
  const defOut = out.filter(p => p.team === oppTeam && p.role !== 'GK');
  const aerialBest = new Set([...defOut].sort((a, b) => aerialAbility(b) - aerialAbility(a)).slice(0, 3).map(p => p.id));
  const pool = defOut.length - aerialBest.size >= spots.length ? defOut.filter(p => !aerialBest.has(p.id)) : defOut;
  const moved = new Map<number, { x: number; y: number }>();
  for (const spot of spots) {
    const cand = pool.filter(p => !moved.has(p.id));
    if (cand.length === 0) break;
    moved.set(nearestPlayerTo(cand, spot).id, spot);
  }
  out = out.map(p => {
    const m = moved.get(p.id);
    return m ? { ...p, x: m.x, y: m.y, targetPosition: { ...m } } : p;
  });
  return { players: out, wallIds: [...moved.keys()] };
}

/**
 * Direct free kick at goal (`set-pieces-play.md` §2–3): xG = `directFreeKickXG` (distance, angle);
 * the wall takes `wallBlockChance(n)` of it — the shot strikes the wall with that chance and drops
 * loose (rebound off a defender), else it flies with the unblocked xG. Counts as a shot either way.
 */
export function startDirectFreeKick(state: GameState, rng: () => number = Math.random): GameState {
  const sp = state.setPiece!;
  const taker = state.players.find(p => p.id === state.ballHolderId)!;
  const goalX = taker.attackDir === 1 ? PITCH_LENGTH : 0;
  const pos = { x: taker.x, y: taker.y };
  const base = directFreeKickXG(distToGoalCentre(pos, goalX), computeOpenAngle(pos.x, pos.y, goalX));
  const wall = (sp.wallIds ?? []).map(id => state.players.find(p => p.id === id)).filter((p): p is GamePlayer => !!p);
  const pBlock = wallBlockChance(wall.length);
  const xg = base * (1 - pBlock);
  const blocked = wall.length > 0 && rng() < pBlock;
  gameBus.emit('shot', { player: taker.id, xg });
  gameBus.emit('directFreeKick', { player: taker.id, xg, wallSize: wall.length, blocked });
  debugLog('setPiece', `${taker.name} shoots the free kick (xG ${xg.toFixed(3)}, wall ${wall.length})${blocked ? ' — hits the wall' : ''}`, {
    playerId: taker.id, data: { base, xg, wallSize: wall.length, blocked },
  });
  if (blocked) {
    const w = wall[Math.floor(rng() * wall.length)]!;
    const a = Math.atan2(taker.y - w.y, taker.x - w.x) + (rng() * 2 - 1) * SET_PIECE_CONFIG.WALL_REBOUND_SPREAD;
    const v = SET_PIECE_CONFIG.WALL_REBOUND_SPEED;
    const prevHolderId = state.ballHolderId;
    return onPossessionTransfer({
      ...state,
      setPiece:     null,
      ballHolderId: w.id,
      lastPasserId: null,
      looseBall: {
        x: w.x, y: w.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        startTime: state.matchTime,
        fromPasserId: w.id,
        fromTeamLastTouch: w.team,
        intendedRunnerId: null,
        receiverOffside: false,
        source: 'clearance',
      },
    }, prevHolderId);
  }
  const { toX, toY } = computeShotAim(taker);
  return {
    ...state,
    setPiece: null,
    shot: { shooterId: taker.id, fromX: taker.x, fromY: taker.y, toX, toY, t: 0, xg: base, freeKick: true },
  };
}

/**
 * Sets up the restart for a foul against `fouledTeam` at `spot`: a penalty when `inBox`, else a
 * free kick (layouts `freeKick_Attack`/`_Defend` only when the spot is within
 * `DANGEROUS_FREE_KICK_DIST` of the goal it attacks — elsewhere the players stay where they are
 * and the nearest player of the fouled team takes a quick free kick).
 */
function awardFoulRestart(
  state: GameState,
  fouledTeam: TeamId,
  spot: { x: number; y: number },
  inBox: boolean,
  offenderId: number,
  minute: number,
): GameState {
  const oppTeam: TeamId = fouledTeam === 'A' ? 'B' : 'A';
  const awarded = state.players.filter(p => p.team === fouledTeam);
  if (awarded.length === 0) return state;
  const outfield = awarded.filter(p => p.role !== 'GK');
  const pool = outfield.length > 0 ? outfield : awarded;
  const goalX = awarded[0]!.attackDir === 1 ? PITCH_LENGTH : 0;
  let players = state.players;
  let setPiece: SetPiece;

  if (inBox) {
    const pos = penaltySpot(goalX);
    const taker = setPieceTakerOf(state, fouledTeam, 'penalties') ?? pool[0]!;
    const edge = FOUL_CONFIG.PENALTY_SPOT_DIST + 8; // everyone else waits outside the box (~20 yds out)
    players = players.map(p => {
      if (p.id === taker.id) return { ...p, x: pos.x, y: pos.y, targetPosition: { ...pos } };
      if (p.team === oppTeam && p.role === 'GK') {
        const gx = goalX === 0 ? 0.5 : PITCH_LENGTH - 0.5;
        return { ...p, x: gx, y: pos.y, targetPosition: { x: gx, y: pos.y } };
      }
      if (Math.abs(p.x - goalX) < edge) {
        const nx = goalX === 0 ? edge : PITCH_LENGTH - edge;
        return { ...p, x: nx, targetPosition: { x: nx, y: p.y } };
      }
      return p;
    });
    setPiece = { type: 'penalty', takerId: taker.id, countdown: FOUL_CONFIG.PENALTY_COUNTDOWN, position: pos };
    gameBus.emit('penaltyAwarded', { team: fouledTeam, takerId: taker.id, offenderId, minute });
    debugLog('foul', `PENALTY to team ${fouledTeam} — ${taker.name} to take it`, { playerId: taker.id, data: { offenderId, minute } });
  } else {
    const pos = { x: Math.max(1, Math.min(PITCH_LENGTH - 1, spot.x)), y: Math.max(1, Math.min(PITCH_WIDTH - 1, spot.y)) };
    const distToLine = Math.abs(goalX - pos.x);
    const dangerous = distToLine <= FOUL_CONFIG.DANGEROUS_FREE_KICK_DIST;
    // `set-pieces-play.md` §2: direct shot over a wall when close and central; crossed into the box
    // (or short) within FK_CROSS_RANGE; elsewhere a quick free kick by the nearest player.
    const direct = isDirectFreeKick(pos, awarded[0]!.attackDir);
    const box = !direct && distToLine <= SET_PIECE_CONFIG.FK_CROSS_RANGE;
    const taker = direct || box ? (setPieceTakerOf(state, fouledTeam, 'freeKicks') ?? nearestPlayerTo(pool, pos)) : nearestPlayerTo(pool, pos);
    let wallIds: number[] | undefined;
    if (direct) ({ players, wallIds } = applyDirectFreeKick(state, players, taker, pos));
    else if (box) players = applyBoxSetPiece(players, taker, pos, 'free_kick', Math.random);
    players = players.map(p => (p.id === taker.id ? { ...p, x: pos.x, y: pos.y, targetPosition: { ...pos } } : p));
    setPiece = direct
      ? { type: 'free_kick', takerId: taker.id, countdown: SET_PIECE_CONFIG.DIRECT_FREE_KICK_COUNTDOWN, position: pos, variant: 'direct', wallIds }
      : box
        ? { type: 'free_kick', takerId: taker.id, countdown: SET_PIECE_CONFIG.BOX_FREE_KICK_COUNTDOWN, position: pos, variant: 'box' }
        : { type: 'free_kick', takerId: taker.id, countdown: FOUL_CONFIG.FREE_KICK_COUNTDOWN, position: pos };
    gameBus.emit('freeKickAwarded', { team: fouledTeam, takerId: taker.id, x: pos.x, y: pos.y, dangerous, minute });
    debugLog('foul', `Free kick to team ${fouledTeam}${dangerous ? ' (dangerous)' : ''} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) — ${taker.name}`, {
      playerId: taker.id, data: { offenderId, dangerous, minute },
    });
  }

  const prevHolderId = state.ballHolderId;
  const keptPossession = state.players.find(p => p.id === prevHolderId)?.team === fouledTeam;
  const phaseKind: SetPieceGoalKind | null =
    setPiece.type === 'penalty' ? 'penalty'
    : Math.abs(goalX - setPiece.position!.x) <= SET_PIECE_CONFIG.SET_PIECE_FK_ZONE ? 'free_kick'
    : null;
  const restarted = onPossessionTransfer({
    ...state,
    players,
    pass:           null,
    shot:           null,
    looseBall:      null,
    ballHolderId:   setPiece.takerId,
    possessionTime: keptPossession ? state.possessionTime : 0,
    lastPasserId:   null,
    // The taker can't be challenged right after the freeze (the dribble/duel foul paths don't set
    // a cooldown of their own, and the freeze doesn't drain it).
    tackleCooldown: TACKLE_COOLDOWN,
    setPiece,
  }, prevHolderId);
  return phaseKind ? openSetPiecePhase(restarted, fouledTeam, phaseKind, setPiece.countdown) : restarted;
}

/**
 * Rolls whether a resolved challenge was a foul. On a foul: emits `foul`, rolls the card
 * (`cardRoll`; a second yellow turns red and sends the player off), puts the offender into the
 * failed-tackle recovery and awards the restart (free kick or penalty) to the fouled team —
 * overturning the challenge's own outcome. Returns `null` when it was not a foul.
 */
export function maybeFoul(
  state: GameState,
  offender: GamePlayer,
  fouled: GamePlayer,
  kind: FoulKind,
  tackleWon: boolean,
  rng: () => number = Math.random,
): GameState | null {
  const ownGoalX = offender.attackDir === 1 ? 0 : PITCH_LENGTH;
  const inOwnBox = isInGoalScoreArea(fouled.x, fouled.y, ownGoalX);
  // Tackle: real approach angle. Dribble: head-on when the defender won it, from behind when he was
  // beaten and chases back (a cynical stop). Loose-ball duel: shoulder to shoulder.
  const angle: RelativePosition =
    kind === 'tackle'  ? angleFromModifier(tackleAngleModifier(offender, fouled)) :
    kind === 'dribble' ? (tackleWon ? 'front' : 'behind') :
                         'side';
  const onYellow = yellowsOf(state, offender.id) > 0;
  const temperament = offender.temperament ?? 0;
  const chance = foulChance({
    kind, angle, inOwnBox, tackleWon, onYellow, temperament,
    aggression: getDefenseConfig(offender.team).TACKLE_AGGRESSION,
    tackling:   offender.runtimeStats.withoutBall.tackling,
    energy:     offender.energy,
  });
  if (rng() >= chance) return null;

  const minute = matchMinute(state);
  const spot = { x: fouled.x, y: fouled.y };
  gameBus.emit('foul', {
    offenderId: offender.id, fouledId: fouled.id, team: offender.team, kind,
    x: spot.x, y: spot.y, inBox: inOwnBox, minute,
  });
  debugLog('foul', `Foul by ${offender.name} on ${fouled.name} (${kind}, ${angle}${inOwnBox ? ', IN THE BOX' : ''}) — chance ${(chance * 100).toFixed(0)}%`, {
    playerId: offender.id, data: { fouledId: fouled.id, kind, angle, chance, x: spot.x, y: spot.y, tempMult: temperamentFoulMult(temperament) },
  });

  let s: GameState = {
    ...state,
    players: state.players.map(p => (p.id === offender.id ? { ...p, recoveryTime: DUEL_TACKLE_FAILED_RECOVERY } : p)),
  };
  const opponents = s.players.filter(p => p.team === offender.team && p.id !== offender.id);
  const { card } = cardRoll({ angle, clearChance: isClearChance(fouled, opponents), onYellow, temperament }, rng);
  if (card !== 'none') s = bookPlayer(s, s.players.find(p => p.id === offender.id) ?? offender, card, minute);
  return awardFoulRestart(s, fouled.team, spot, inOwnBox, offender.id, minute);
}

/**
 * Resolves an in-match penalty once its freeze ends: `penaltyChance` for the taker against the
 * defending goalkeeper. Goal → kickoff for the conceding team; miss/save → the goalkeeper's goal kick.
 */
function resolveInMatchPenalty(state: GameState, rng: () => number = Math.random): TickResult {
  const sp = state.setPiece!;
  const taker = state.players.find(p => p.id === sp.takerId) ?? state.players.find(p => p.id === state.ballHolderId)!;
  const gk = state.players.find(p => p.team !== taker.team && p.role === 'GK') ?? null;
  const chance = penaltyChance(
    taker.runtimeStats.withBall.shootAccuracy,
    gk ? { id: gk.id, reflex: gk.runtimeStats.withoutBall.gkReflex, diving: gk.runtimeStats.withoutBall.gkDiving } : null,
  );
  const scored = rng() < chance;
  gameBus.emit('shot', { player: taker.id, xg: chance });
  gameBus.emit('penaltyResolved', { team: taker.team, takerId: taker.id, keeperId: gk?.id ?? null, scored, chance });
  debugLog('foul', `Penalty by ${taker.name}: ${scored ? 'GOAL' : 'saved/missed'} (chance ${(chance * 100).toFixed(0)}%)`, {
    playerId: taker.id, data: { chance, scored },
  });
  const s: GameState = { ...state, setPiece: null };
  if (scored) {
    const newScore = { ...s.score, [taker.team]: s.score[taker.team] + 1 };
    gameBus.emit('goalScored', { team: taker.team, score: newScore, scorerId: taker.id, setPiece: 'penalty' });
    const concedingTeam: TeamId = taker.team === 'A' ? 'B' : 'A';
    return { state: resetToKickoff({ ...s, score: newScore }, concedingTeam), passCompleted: false, tackled: false, goalScored: taker.team };
  }
  const defTeam: TeamId = taker.team === 'A' ? 'B' : 'A';
  const defenders = s.players.filter(p => p.team === defTeam);
  const keeper = gk ?? (defenders.length > 0 ? nearestPlayerTo(defenders, taker) : taker);
  const goalKick = resolveFormationSetPieces(defTeam === 'A' ? s.formationA : s.formationB).goalKick;
  const players = goalKick ? applySetPieceToTeam(s.players, defTeam, goalKick) : s.players;
  return {
    state: onPossessionTransfer({
      ...s,
      players,
      ballHolderId:   keeper.id,
      possessionTime: 0,
      lastPasserId:   null,
      setPiece:       { type: 'goal_kick', takerId: keeper.id, countdown: 1 },
    }, s.ballHolderId),
    passCompleted: false, tackled: false, goalScored: null,
  };
}

// ── Formation change mid-match ────────────────────────────────────────────────

/**
 * Swap one team's formation without substituting any players.
 * Each on-pitch player retains their current energy but gets a new role,
 * base position, bounds, and recomputed stats.
 */
export function changeFormation(
  state: GameState,
  team: TeamId,
  newFormation: Formation,
): GameState {
  const teamPlayers = state.players.filter(p => p.team === team);
  const instructions = state.slotInstructions?.[team];

  const updated = teamPlayers.map((p, arrIndex) => {
    const slotIndex = p.slotIndex >= 0 ? p.slotIndex : arrIndex;
    const slotDef   = newFormation.attacking[slotIndex];
    if (!slotDef) return p;
    const role     = slotDef.role;
    // The slot keeps its instruction; a variant the new role does not accept falls back to default.
    // Mirroring follows the player's attackDir (correct after half-time too).
    const setup = slotSetup(slotDef, slotIndex, p.attackDir, newFormation, instructions?.[slotIndex]);
    const next: GamePlayer = {
      ...p,
      role,
      slotIndex,
      basePosition:    setup.basePosition,
      bounds:          setup.bounds,
      ballSupportScale: roleEngine(role).ballSupportScale,
      runtimeStats:    getRuntimeLineup(p.baseStats, { energy: p.energy }),
      fatigueBaselineEnergy: p.energy,
    };
    // Keep existing baseStats — we no longer have the raw PlayerStatsRecord post-lineup.
    // The formation change adjusts movement bounds and base positions; stats stay as-is.
    delete next.engine;
    delete next.instruction;
    if (setup.engine) next.engine = setup.engine;
    if (setup.instruction) next.instruction = setup.instruction;
    return next;
  });

  const otherPlayers = state.players.filter(p => p.team !== team);
  return refreshManMarks({
    ...state,
    players:    [...otherPlayers, ...updated].sort((a, b) => a.id - b.id),
    formationA: team === 'A' ? newFormation : state.formationA,
    formationB: team === 'B' ? newFormation : state.formationB,
  });
}

// ── Player instructions (Etapa 27, `.claude/rules/game/player-instructions.md`) ──

/**
 * Tuning, anchor and bounds of a slot under an instruction. Without an instruction this is exactly
 * what `buildGamePlayerForSlot` computes (role tuning, formation slot, role bounds), and `engine` /
 * `instruction` come back `undefined` so the player stays identical to a freshly built one.
 */
function slotSetup(
  slotDef: { role: PlayerRole; yRange?: number },
  slotIndex: number,
  attackDir: 1 | -1,
  formation: Formation,
  instr: SlotInstruction | null | undefined,
): { engine?: RoleEngineTuning; instruction?: SlotInstruction; basePosition: { x: number; y: number }; bounds: MovementBounds } {
  const instruction  = effectiveInstruction(slotDef.role, instr);
  const engine       = resolveSlotTuning(slotDef.role, instruction);
  const basePosition = slotBasePosition({ slotIndex, attackDir, instruction }, formation, 'attacking');
  const yRange  = slotDef.yRange ?? engine.yRange;
  const xA      = engine.bounds;
  const xBounds = attackDir === 1 ? xA : mirrorBounds({ ...xA, minY: 0, maxY: PITCH_WIDTH });
  return {
    ...(instruction ? { engine, instruction } : {}),
    basePosition,
    bounds: {
      minX: xBounds.minX,
      maxX: xBounds.maxX,
      minY: Math.max(0,           basePosition.y - yRange),
      maxY: Math.min(PITCH_WIDTH, basePosition.y + yRange),
    },
  };
}

/**
 * Apply (or change, live) the instruction of one slot of `team`: rebuilds the slot player's tuning,
 * anchor and bounds without touching energy or attributes; effective from the next tick. `null` /
 * default = back to the role's tuning.
 */
export function applyPlayerInstruction(
  state: GameState,
  team: TeamId,
  slot: number,
  instruction: SlotInstruction | null | undefined,
): GameState {
  const formation = team === 'A' ? state.formationA : state.formationB;
  const slotDef = formation.attacking[slot];
  const list = [...(state.slotInstructions?.[team] ?? [])];
  while (list.length <= slot) list.push(null);
  list[slot] = instruction ?? null;
  const slotInstructions = { ...state.slotInstructions, [team]: list };
  if (!slotDef) return { ...state, slotInstructions };
  const players = state.players.map(p => {
    if (p.team !== team || p.slotIndex !== slot) return p;
    const setup = slotSetup(slotDef, slot, p.attackDir, formation, instruction);
    const next: GamePlayer = { ...p, basePosition: setup.basePosition, bounds: setup.bounds };
    delete next.engine;
    delete next.instruction;
    if (setup.engine) next.engine = setup.engine;
    if (setup.instruction) next.instruction = setup.instruction;
    debugLog('instruction', `${p.name}: ${setup.instruction?.variant ?? 'default'} / press ${setup.instruction?.press ?? 'normal'}`, {
      playerId: p.id, data: { slot, variant: setup.instruction?.variant ?? null, press: setup.instruction?.press ?? 'normal' },
    });
    return next;
  });
  return { ...state, players, slotInstructions };
}

/** Apply every slot instruction of a team (index = slot). */
export function applyTeamInstructions(
  state: GameState,
  team: TeamId,
  instructions: (SlotInstruction | null)[] | undefined,
): GameState {
  if (!instructions || instructions.length === 0) return state;
  let s = state;
  for (let i = 0; i < instructions.length; i++) {
    if (instructions[i]) s = applyPlayerInstruction(s, team, i, instructions[i]);
  }
  return { ...s, slotInstructions: { ...s.slotInstructions, [team]: [...instructions] } };
}

/** Maximum man-marking pairs per team and match. */
const MAX_MAN_MARKS = 2;

/**
 * Set (replace) a team's man-marking pairs: the outfield player in `markerSlot` marks the
 * opponent outfield player `targetId` (engine id). At most `MAX_MAN_MARKS`, one marker and one
 * target per pair; invalid pairs are skipped. Effective from the next tick.
 */
export function setManMarks(
  state: GameState,
  team: TeamId,
  marks: { markerSlot: number; targetId: number }[],
): GameState {
  const pairs: ManMarkPair[] = [];
  for (const m of marks) {
    if (pairs.length >= MAX_MAN_MARKS) break;
    const marker = state.players.find(p => p.team === team && p.slotIndex === m.markerSlot && p.role !== 'GK');
    const target = state.players.find(p => p.id === m.targetId && p.team !== team && p.role !== 'GK');
    if (!marker || !target) continue;
    if (pairs.some(p => p.markerId === marker.id || p.targetId === target.id)) continue;
    pairs.push({ markerSlot: m.markerSlot, markerId: marker.id, targetId: target.id });
    debugLog('instruction', `${marker.name} man-marks ${target.name}`, { playerId: marker.id, data: { targetId: target.id } });
  }
  return syncManMarkFlags({ ...state, manMarks: { ...state.manMarks, [team]: pairs } }, team);
}

/**
 * Man-marking from slot/roster terms (saves, the lab): the opponent target is named by roster id
 * (`targetRosterId`, the match marking of a save) or by the opponent's slot (`targetSlot`, the lab).
 */
export function setManMarksBySlot(
  state: GameState,
  team: TeamId,
  marks: { slot: number; targetRosterId?: string; targetSlot?: number }[] | undefined,
): GameState {
  if (!marks || (marks.length === 0 && !state.manMarks?.[team]?.length)) return state;
  const resolved: { markerSlot: number; targetId: number }[] = [];
  for (const m of marks) {
    const target = state.players.find(p => p.team !== team && (
      m.targetRosterId !== undefined ? p.rosterId === m.targetRosterId : p.slotIndex === m.targetSlot
    ));
    if (target) resolved.push({ markerSlot: m.slot, targetId: target.id });
  }
  return setManMarks(state, team, resolved);
}

/** Re-resolve every pair after a player left / came on: the marker follows its slot, a target off the pitch drops the pair. */
function refreshManMarks(state: GameState): GameState {
  if (!state.manMarks) return state;
  let s = state;
  for (const team of ['A', 'B'] as const) {
    const pairs = s.manMarks?.[team];
    if (!pairs || pairs.length === 0) continue;
    const next: ManMarkPair[] = [];
    for (const pair of pairs) {
      const marker = s.players.find(p => p.team === team && p.slotIndex === pair.markerSlot && p.role !== 'GK');
      const target = s.players.find(p => p.id === pair.targetId && p.team !== team && p.role !== 'GK');
      if (!marker || !target) {
        debugLog('instruction', `Man-marking pair dropped (slot ${pair.markerSlot}, target ${pair.targetId})`, { data: { ...pair } });
        continue;
      }
      next.push({ ...pair, markerId: marker.id });
    }
    s = syncManMarkFlags({ ...s, manMarks: { ...s.manMarks, [team]: next } }, team);
  }
  return s;
}

/** Writes `manMarkTargetId` on the team's markers (and clears it everywhere else on the team). */
function syncManMarkFlags(state: GameState, team: TeamId): GameState {
  const byMarker = new Map((state.manMarks?.[team] ?? []).map(p => [p.markerId, p.targetId]));
  let changed = false;
  const players = state.players.map(p => {
    if (p.team !== team) return p;
    const target = byMarker.get(p.id);
    if (target === p.manMarkTargetId) return p;
    changed = true;
    const next = { ...p };
    if (target === undefined) delete next.manMarkTargetId; else next.manMarkTargetId = target;
    return next;
  });
  return changed ? { ...state, players } : state;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function distSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/**
 * Apply intent detection on a possession transfer. Call this AFTER updating
 * `ballHolderId` to the new holder. When the team in possession changed,
 * recompute intent for BOTH teams — the new defender may also fire an intent
 * (e.g. counter_attack tactic going into high_press mode when their opponent
 * progresses with a numerical disadvantage).
 *
 * No-ops when possession stayed within the same team (e.g. a pass completion
 * to a teammate — periodic re-evaluation handles updates while possession
 * stays put; see `reevaluateTeamIntents`).
 */
function onPossessionTransfer(state: GameState, prevHolderId: number): GameState {
  if (state.ballHolderId === prevHolderId) return state;

  const prev = state.players.find(p => p.id === prevHolderId);
  const next = state.players.find(p => p.id === state.ballHolderId);
  if (!next) return state;
  if (prev && prev.team === next.team) return state; // same team — no recompute

  return reevaluateTeamIntents(state);
}

/**
 * Recompute team intent for both teams from current state and emit if changed.
 * Used by both possession transfer and the periodic in-tick re-evaluation —
 * intents are situational signals that can flip mid-possession (e.g. opponent
 * pushes into our half → defensive press intent fires).
 *
 * `lastIntentEvalTime` is bumped on every call so the periodic timer resets
 * even when nothing changed (cheap idempotency for the periodic tick path).
 *
 * `opts.includeSwitchPlay` (default true) controls whether switch_play may be
 * (re)assigned. The periodic in-tick re-eval passes false: a switch is a
 * per-possession commitment decided at possession-change / reception, so the
 * 3-second timer must neither newly trigger it nor clear an in-progress switch.
 * A team already on switch_play is therefore held untouched on the periodic path.
 */
function reevaluateTeamIntents(
  state: GameState,
  opts?: { includeSwitchPlay?: boolean },
): GameState {
  const includeSwitchPlay = opts?.includeSwitchPlay ?? true;

  const intentA = recomputeTeamIntent(state, 'A', includeSwitchPlay);
  const intentB = recomputeTeamIntent(state, 'B', includeSwitchPlay);

  const changed =
    state.teamIntent.A !== intentA ||
    state.teamIntent.B !== intentB;

  const teamIntent = changed
    ? { A: intentA, B: intentB }
    : state.teamIntent;

  if (changed) {
    gameBus.emit('teamIntentChanged', { teamIntent });
  }

  return { ...state, teamIntent, lastIntentEvalTime: state.matchTime };
}

/**
 * Resolve one team's intent for a re-eval pass. When switch_play is excluded
 * (periodic path) a team already switching holds that intent — the timer can't
 * clear an in-progress switch — and no team can newly acquire switch_play.
 */
function recomputeTeamIntent(
  state: GameState,
  team: TeamId,
  includeSwitchPlay: boolean,
): TeamIntent {
  if (!includeSwitchPlay && state.teamIntent[team] === 'switch_play') {
    return 'switch_play';
  }
  return detectTeamIntent(state, team, { allowSwitchPlay: includeSwitchPlay });
}

function teamHasBall(state: GameState, teamId: GamePlayer['team']): boolean {
  const holder = state.players.find(p => p.id === state.ballHolderId);
  if (!holder) return false;
  if (state.pass) {
    // Through ball — toId is null; possession during flight stays with the passer's team
    // until the loose ball is contested at landing.
    if (state.pass.kind === 'through' || state.pass.toId === null) {
      const passer = state.players.find(p => p.id === state.pass!.fromId);
      return passer?.team === teamId;
    }
    const receiver = state.players.find(p => p.id === state.pass!.toId);
    return receiver?.team === teamId;
  }
  // Loose ball — attribute "team with ball" to the team that played it
  // (so the off-ball / defensive paths still work; a chaser on the passer's
  // team is still in TEAM_WITH_BALL path during the wait, opposing chasers
  // stay in TEAM_WITHOUT_BALL).
  if (state.looseBall) {
    return state.looseBall.fromTeamLastTouch === teamId;
  }
  return holder.team === teamId;
}

function shouldDrainStamina(state: GameState): boolean {
  if (!isLivePhase(state.matchPhase)) return false;
  if (state.setPiece && state.setPiece.countdown > 0) return false;
  return true;
}

/** Tactic-driven stamina multiplier: a `press` under a high press costs `PRESS_STAMINA_MULT`. */
export function tacticDrainMult(team: TeamId, action: StaminaAction): number {
  return action === 'press' ? getDefenseConfig(team).PRESS_STAMINA_MULT : 1;
}

function resolveStaminaAction(
  p: GamePlayer,
  ballHolderId: number,
  holderTeam: TeamId,
  dec: PlayerDecision | undefined,
): StaminaAction {
  if (p.id === ballHolderId) {
    if (dec?.type === 'carry' || dec?.type === 'dribble') return 'carry';
    if (dec?.type === 'pass') return 'pass';
    if (dec?.type === 'shoot') return 'shot';
    return 'move';
  }
  if (p.team !== holderTeam && dec?.type === 'press') return 'press';
  return 'move';
}

function getTeammates(state: GameState, playerId: number): GamePlayer[] {
  const player = state.players.find(p => p.id === playerId)!;
  return state.players.filter(p => p.team === player.team && p.id !== playerId);
}

function resetToKickoff(state0: GameState, kickoffTeam: import('../types').TeamId): GameState {
  const state = clearAllChasers(state0);
  const resetPlayers = state.players.map(p => ({
    ...p,
    x: p.basePosition.x,
    y: p.basePosition.y,
    targetPosition: { ...p.basePosition },
  }));

  // Kicking team uses kickOff layout; defending team uses kickOffDefend layout.
  // Falls back to generating positions from defending slots for unsupported formations.
  let positioned = resetPlayers;
  const defendingTeam: import('../types').TeamId = kickoffTeam === 'A' ? 'B' : 'A';
  const spA = resolveFormationSetPieces(state.formationA);
  const spB = resolveFormationSetPieces(state.formationB);
  const attackLayoutA  = spA?.kickOff        ?? generateKickoffLayout(state.formationA);
  const attackLayoutB  = spB?.kickOff        ?? generateKickoffLayout(state.formationB);
  const defendLayoutA  = spA?.kickOffDefend  ?? generateKickoffLayout(state.formationA);
  const defendLayoutB  = spB?.kickOffDefend  ?? generateKickoffLayout(state.formationB);
  positioned = applySetPieceToTeam(positioned, 'A', kickoffTeam === 'A' ? attackLayoutA : defendLayoutA);
  positioned = applySetPieceToTeam(positioned, 'B', kickoffTeam === 'B' ? attackLayoutB : defendLayoutB);
  // Defending team must stay outside the centre circle
  positioned = enforceKickoffCircleRule(positioned, defendingTeam);

  const kickoffHolder =
    positioned.find(p => p.team === kickoffTeam && p.role === 'ST') ??
    positioned.find(p => p.team === kickoffTeam) ??
    positioned[0]!; // fallback: test scenarios may only have one team
  gameBus.emit('kickOff', { team: kickoffTeam, phase: 'afterGoal' });
  const prevHolderId = state.ballHolderId;
  return onPossessionTransfer({
    ...state,
    players:       positioned,
    ballHolderId:  kickoffHolder.id,
    pass:          null,
    shot:          null,
    looseBall:     null,
    setPiece:      { type: 'kickoff', takerId: kickoffHolder.id, countdown: 2 },
    setPiecePhase: null,
    possessionTime: 0,
    lastPasserId: null,
  }, prevHolderId);
}

/**
 * Mirror all player positions/bounds across the centre line and flip attackDir.
 * Called at the end of the half-time presentation freeze.
 * Team B kicks off the second half (Team A kicked off the first).
 */

function switchSides(
  state: GameState,
  nextPhase: 'secondHalf' | 'extraTimeFirst' | 'extraTimeSecond' = 'secondHalf',
  kickoffTeam: TeamId = 'B',
  recoveryScale = 1,
): GameState {
  state = clearAllChasers(state);
  const switched: GamePlayer[] = state.players.map(p => {
    const recoveryRate = (0.30 + (p.stamina / 10) * 0.30) * recoveryScale; // 30% at stamina 0 → 60% at stamina 10
    const recoveredEnergy = Math.min(p.startEnergy, p.energy + (p.startEnergy - p.energy) * recoveryRate);
    const energyChanged = recoveredEnergy !== p.energy;
    return {
      ...p,
      attackDir: (-p.attackDir) as 1 | -1,
      x:           PITCH_LENGTH - p.x,
      basePosition:   { x: PITCH_LENGTH - p.basePosition.x, y: p.basePosition.y },
      targetPosition: { x: PITCH_LENGTH - p.targetPosition.x, y: p.targetPosition.y },
      bounds: {
        minX: PITCH_LENGTH - p.bounds.maxX,
        maxX: PITCH_LENGTH - p.bounds.minX,
        minY: p.bounds.minY,
        maxY: p.bounds.maxY,
      },
      energy: recoveredEnergy,
      runtimeStats: energyChanged
        ? getRuntimeLineup(p.baseStats, { energy: recoveredEnergy })
        : p.runtimeStats,
      fatigueBaselineEnergy: recoveredEnergy,
    };
  });

  // The kicking team uses kickOff, the other kickOffDefend. attackDir is already flipped above,
  // so applySetPieceToTeam mirrors correctly.
  const defendingTeam: TeamId = kickoffTeam === 'A' ? 'B' : 'A';
  let positioned = switched;
  const spA2 = resolveFormationSetPieces(state.formationA);
  const spB2 = resolveFormationSetPieces(state.formationB);
  const layoutA = kickoffTeam === 'A'
    ? (spA2?.kickOff ?? generateKickoffLayout(state.formationA))
    : (spA2?.kickOffDefend ?? generateKickoffLayout(state.formationA));
  const layoutB = kickoffTeam === 'B'
    ? (spB2?.kickOff ?? generateKickoffLayout(state.formationB))
    : (spB2?.kickOffDefend ?? generateKickoffLayout(state.formationB));
  positioned = applySetPieceToTeam(positioned, 'A', layoutA);
  positioned = applySetPieceToTeam(positioned, 'B', layoutB);
  positioned = enforceKickoffCircleRule(positioned, defendingTeam);

  const kickoffHolder =
    positioned.find(p => p.team === kickoffTeam && p.role === 'ST') ??
    positioned.find(p => p.team === kickoffTeam)!;

  gameBus.emit('kickOff', { team: kickoffTeam, phase: nextPhase });

  const prevHolderId = state.ballHolderId;
  return onPossessionTransfer({
    ...state,
    players:               positioned,
    ballHolderId:          kickoffHolder.id,
    pass:                  null,
    shot:                  null,
    looseBall:             null,
    matchPhase:            nextPhase,
    matchTime:             0,
    presentationCountdown: 0,
    setPiece:              { type: 'kickoff', takerId: kickoffHolder.id, countdown: 2 },
    setPiecePhase:         null,
    possessionTime:        0,
    lastPasserId:          null,
  }, prevHolderId);
}

/** Knockout "level": today's score plus the first-leg aggregate (if any). */
function isLevelForKnockout(s: GameState): boolean {
  const agg = s.aggregate ?? { A: 0, B: 0 };
  return s.score.A + agg.A === s.score.B + agg.B;
}

/** Goals in extra time, shootout and winner of a knockout match; null when decided in 90'. */
export function knockoutDecider(state: GameState): KnockoutDecider | null {
  const reg = state.scoreAtRegulation;
  if (!state.knockout || !reg) return null;
  const extraTime = { A: state.score.A - reg.A, B: state.score.B - reg.B };
  const so = state.shootout ?? null;
  const agg = state.aggregate ?? { A: 0, B: 0 };
  const winner: TeamId = so ? so.winner : (state.score.A + agg.A > state.score.B + agg.B ? 'A' : 'B');
  return { extraTime, penalties: so ? { ...so.finalScore } : null, winner };
}

function finishMatch(state: GameState): GameState {
  const final: GameState = { ...state, matchPhase: 'matchEnd', pass: null, shot: null, looseBall: null };
  if (final.shootout) gameBus.emit('shootoutEnd', { winner: final.shootout.winner, score: { ...final.shootout.finalScore } });
  gameBus.emit('matchEnd', {
    score: final.score,
    decider: knockoutDecider(final),
    finalEnergy: final.players.map(p => ({ id: p.id, team: p.team, energy: p.energy })),
  });
  return final;
}

function penaltySide(state: GameState, team: TeamId): PenaltySide<number> {
  const onPitch = state.players.filter(p => p.team === team);
  const gk = onPitch.find(p => p.role === 'GK') ?? null;
  return {
    takers: onPitch.map(p => ({ id: p.id, accuracy: p.runtimeStats.withBall.shootAccuracy, isGK: p.role === 'GK' })),
    keeper: gk
      ? { id: gk.id, reflex: gk.runtimeStats.withoutBall.gkReflex, diving: gk.runtimeStats.withoutBall.gkDiving }
      : null,
  };
}

function startPenalties(state: GameState): GameState {
  const r = resolvePenaltyShootout(penaltySide(state, 'A'), penaltySide(state, 'B'), Math.random);
  return {
    ...state,
    matchPhase: 'penalties',
    presentationCountdown: PENALTY_KICK_INTERVAL,
    pass: null, shot: null, looseBall: null, setPiece: null,
    shootout: { kicks: r.kicks, score: { A: 0, B: 0 }, finalScore: r.score, winner: r.winner, shown: 0 },
  };
}

/**
 * End the running period now. Used by the clock (tickState) and by /test ("end period").
 * firstHalf → halfTime; secondHalf → matchEnd, or extraTimeBreak when a knockout match is
 * level; extraTimeFirst → extraTimeSecond; extraTimeSecond → matchEnd or penalties.
 */
export function endCurrentPeriod(state: GameState, newMatchTime: number = state.matchTime): GameState {
  const s = { ...state, matchTime: newMatchTime };
  switch (s.matchPhase) {
    case 'firstHalf':
      gameBus.emit('halfTime', { score: s.score, extraTime: Math.round(s.extraTimeSecond / 60) });
      return {
        ...s, matchPhase: 'halfTime', presentationCountdown: PRESENTATION_DURATION,
        pass: null, shot: null, looseBall: null,
      };
    case 'secondHalf':
      if (s.knockout && isLevelForKnockout(s)) {
        gameBus.emit('extraTimeStart', { score: s.score });
        return {
          ...s, matchPhase: 'extraTimeBreak', presentationCountdown: PRESENTATION_DURATION,
          pass: null, shot: null, looseBall: null,
          scoreAtRegulation: { ...s.score },
          etStoppageFirst:  Math.floor(Math.random() * 3) * 60,
          etStoppageSecond: Math.floor(Math.random() * 3) * 60,
        };
      }
      return finishMatch(s);
    case 'extraTimeFirst':
      return switchSides(s, 'extraTimeSecond', 'B', 0);
    case 'extraTimeSecond':
      return isLevelForKnockout(s) ? startPenalties(s) : finishMatch(s);
    default:
      return state;
  }
}

function startShot(state: GameState): GameState {
  if (state.setPiece?.variant === 'direct' && state.setPiece.takerId === state.ballHolderId) return startDirectFreeKick(state);
  const shooter = state.players.find(p => p.id === state.ballHolderId)!;
  const { toX, toY } = computeShotAim(shooter);

  // xG context: distance, open goal angle, and nearby defensive pressure
  const goalX     = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const dist      = Math.abs(goalX - shooter.x);
  const openAngle = computeOpenAngle(shooter.x, shooter.y, goalX);
  const defenders = state.players.filter(p => p.team !== shooter.team);
  const pressure  = computeWeightedPressure(shooter, defenders);
  const xg = computeXG(dist, openAngle, pressure);

  gameBus.emit('shot', { player: shooter.id, xg });

  return {
    ...state,
    shot: { shooterId: shooter.id, fromX: shooter.x, fromY: shooter.y, toX, toY, t: 0, xg },
    // Clear any active set piece — once the ball is struck, play is live
    setPiece: null,
  };
}

/**
 * Determine whether a pass receiver is in an offside position at the instant
 * the pass is played. All conditions (opponent half, ahead of ball, ahead of
 * second-last defender) are encoded in the effective offside line.
 */
function checkReceiverOffside(
  holder:     GamePlayer,
  receiver:   GamePlayer,
  allPlayers: GamePlayer[],
): boolean {
  if (!OFFSIDE_CONFIG.ENABLED) return false;

  const fwd  = holder.attackDir;
  const line = computeOffsideLine(fwd, allPlayers, holder.team, holder.x);
  if (line === null) return false;

  return fwd === 1 ? receiver.x > line : receiver.x < line;
}

function startPass(state: GameState): GameState {
  const holder    = state.players.find(p => p.id === state.ballHolderId)!;
  let teammates   = getTeammates(state, holder.id);
  if (teammates.length === 0) return state;
  // Set-piece restrictions (`set-pieces-play.md`): a throw-in only reaches THROW_IN_RANGE; the
  // short corner / free kick goes to the nearest outfield teammate.
  const sp = state.setPiece;
  if (sp && sp.takerId === holder.id) {
    const dist = (p: GamePlayer) => Math.hypot(p.x - holder.x, p.y - holder.y);
    const nearest = (pool: GamePlayer[]) => pool.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    if (sp.type === 'throw_in') {
      const inRange = teammates.filter(p => p.role !== 'GK' && dist(p) <= SET_PIECE_CONFIG.THROW_IN_RANGE);
      teammates = inRange.length > 0 ? inRange : [nearest(teammates)];
    } else if (sp.variant === 'box') {
      const outfield = teammates.filter(p => p.role !== 'GK');
      teammates = [nearest(outfield.length > 0 ? outfield : teammates)];
    }
  }

  const opponents = state.players.filter(p => p.team !== holder.team);
  const intent    = state.teamIntent[holder.team];
  const lanes     = evaluatePassLanes(holder, teammates, opponents, intent);

  // Proportional selection among top 3 lanes: score^k weighting.
  // Close scores (0.9/0.8/0.7) → competitive; large gap (0.9/0.4/0.3) → top dominates.
  const top3    = [...lanes].sort((a, b) => b.score - a.score).slice(0, 3);
  const k       = PASS_CONFIG.PASS_SELECTION_EXPONENT;
  const weights = top3.map(l => Math.pow(Math.max(0, l.score), k));
  const total   = weights.reduce((s, w) => s + w, 0);
  let chosen    = top3[0]!; // fallback: best lane (teammates non-empty ⇒ lanes non-empty)
  if (total > 0) {
    let roll = Math.random() * total;
    for (let i = 0; i < top3.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) { chosen = top3[i]!; break; }
    }
  }
  const to     = state.players.find(p => p.id === chosen.toId)!;

  // Snapshot offside position at the moment the pass is played (not at arrival)
  const receiverOffside = checkReceiverOffside(holder, to, state.players);

  const distance = Math.sqrt((to.x - holder.x) ** 2 + (to.y - holder.y) ** 2);

  gameBus.emit('passAttempted', { player: holder.id, toId: to.id, distance: distance });
  // Switch-of-play: the chosen lane earned a far-flank descriptor bonus. Detected
  // from the descriptor-derived flag on PassLaneInfo, never by naming the intent.
  if (chosen.switchPass) gameBus.emit('switchPlayPass', { player: holder.id, toId: to.id });
  // Clear any active set piece — once the pass leaves the taker's foot, play is live
  return {
    ...state,
    pass: {
      fromId: state.ballHolderId,
      toId: to.id,
      toX: to.x,
      toY: to.y,
      kind: 'regular',
      t: 0,
      distance,
      receiverOffside,
      intendedRunnerId: null,
    },
    setPiece: null,
  };
}

/**
 * Sprint speed for a chasing player (yards/second). Re-uses pressSpeed and
 * applies heavier acceleration / top-end boosts than press to model an all-out
 * sprint. Mirrors the formula in ThroughBallCells.effectiveSprintSpeed.
 */
function chaseSprintSpeed(p: GamePlayer): number {
  const wb = p.runtimeStats.withoutBall;
  return (
    wb.pressSpeed +
    wb.acceleration * THROUGH_BALL_CONFIG.SPRINT_ACCEL_BOOST +
    wb.speed        * THROUGH_BALL_CONFIG.SPRINT_TOP_BOOST
  );
}

/**
 * Override `state.decisions` for the top-N chasers from each team — they leave
 * their current decision (off-ball intent, defensive intent) to sprint to the
 * loose-ball landing point.
 *
 * Algorithm:
 *   1. Rank candidates by ETA (distance / sprint speed)
 *   2. Apply role weight (CHASE_LOOSE_BALL_WEIGHT_ATTACK/DEFEND) and ETA horizon gate
 *   3. Override the top MAX_CHASERS_PER_TEAM per team with `chase_loose_ball`
 *   4. Bump commitTicks so the chase doesn't flicker mid-sprint
 *
 * GK chase is permitted only when the landing point is inside that GK's own box.
 */
/** Resets the decision memory of the given (stale) chasers so they re-decide next tick. */
function clearChasers(state: GameState, ids: Set<number>): GameState {
  const decisions = { ...state.decisions };
  for (const id of ids) delete decisions[id];
  return {
    ...state,
    decisions,
    players: state.players.map(p => (ids.has(p.id) ? { ...p, decisionMemory: EMPTY_DECISION_MEMORY } : p)),
  };
}

/** Clears every chase_loose_ball memory (restarts: kickoff, half-time). */
function clearAllChasers(state: GameState): GameState {
  const ids = new Set(state.players.filter(p => p.decisionMemory?.decision?.type === 'chase_loose_ball').map(p => p.id));
  return ids.size > 0 ? clearChasers(state, ids) : state;
}

function commitLooseBallChasers(
  state:    GameState,
  passerId: number,
  toX:      number,
  toY:      number,
  passerTeamFallback?: TeamId,
  opts: {
    /** Chasers per team (default: through-ball MAX_CHASERS_PER_TEAM). */
    maxPerTeam?: number;
    /** ETA window behind the fastest of the team (seconds). */
    etaHorizon?: number;
    /** Keeper chases only when the point is in his small box (high balls) instead of the whole box. */
    keeperSmallBoxOnly?: boolean;
    /** Every outfielder may chase (set-piece delivery: the centre-backs who went up attack it too). */
    ignoreRoleWeights?: boolean;
  } = {},
): GameState {
  const maxPerTeam = opts.maxPerTeam ?? THROUGH_BALL_CONFIG.MAX_CHASERS_PER_TEAM;
  const etaHorizon = opts.etaHorizon ?? THROUGH_BALL_CONFIG.ETA_HORIZON;
  const passer = state.players.find(p => p.id === passerId);
  // The passer may have left the pitch (injury) while the ball was loose — fall back to the
  // team of the last touch so the re-commit still works (#36).
  const passerTeam = passer?.team ?? passerTeamFallback;
  if (!passerTeam) return state;

  type Cand = { id: number; team: TeamId; eta: number; role: PlayerRole };
  const collect = (team: TeamId, isAttacking: boolean): Cand[] => {
    const out: Cand[] = [];
    for (const p of state.players) {
      if (p.team !== team) continue;
      if (p.id === passerId) continue;
      if (isPlayerInRecovery(p)) continue;
      // Role weight gate
      const weights = isAttacking ? CHASE_LOOSE_BALL_WEIGHT_ATTACK : CHASE_LOOSE_BALL_WEIGHT_DEFEND;
      let weight = opts.ignoreRoleWeights && p.role !== 'GK' ? 1 : weights[p.role];
      // Sweeper-keeper: only chase if the cell is in our own box
      if (p.role === 'GK') {
        const ownGoalX = p.attackDir === 1 ? 0 : PITCH_LENGTH;
        const inReach = opts.keeperSmallBoxOnly ? isInSmallBox(toX, toY, ownGoalX) : isInGoalScoreArea(toX, toY, ownGoalX);
        weight = inReach ? 1.0 : 0;
      }
      if (weight < THROUGH_BALL_CONFIG.ROLE_CHASE_THRESHOLD) continue;
      const dist = Math.hypot(p.x - toX, p.y - toY);
      const speed = chaseSprintSpeed(p);
      const eta = speed > 0.01 ? dist / speed : Infinity;
      out.push({ id: p.id, team, eta, role: p.role });
    }
    out.sort((a, b) => a.eta - b.eta);
    return out;
  };

  const teamA = collect('A', passerTeam === 'A');
  const teamB = collect('B', passerTeam === 'B');

  const pickTop = (arr: Cand[]): Cand[] => {
    if (arr.length === 0) return [];
    const bestEta = arr[0]!.eta;
    return arr
      .filter(c => c.eta - bestEta <= etaHorizon)
      .slice(0, maxPerTeam);
  };

  const chasers = [...pickTop(teamA), ...pickTop(teamB)];
  // Anyone still chasing an earlier ball (chained clearances / punches) who is not re-selected
  // drops the chase — otherwise the pinned decision drags him across the pitch.
  const stale = state.players.filter(p =>
    p.decisionMemory?.decision?.type === 'chase_loose_ball' && !chasers.some(c => c.id === p.id));
  if (stale.length > 0) state = clearChasers(state, new Set(stale.map(p => p.id)));
  if (chasers.length === 0) return state;

  if (isDebugEnabled()) {
    gameBus.emit('chaseCommit', {
      toX, toY,
      chasers: chasers.map(c => ({ id: c.id, team: c.team, eta: c.eta })),
    });
  }

  const newDecisions = { ...state.decisions };
  const newPlayers = state.players.map(p => {
    const c = chasers.find(x => x.id === p.id);
    if (!c) return p;
    const chaseDecision: PlayerDecision = { type: 'chase_loose_ball', toX, toY };
    newDecisions[p.id] = chaseDecision;
    // Path must reflect the team relationship to the *passer* (current ballHolder)
    // so the next tick's commit-reuse path-check passes — without it pathChanged
    // would force a fresh decide() and lose the chase decision.
    const path: DecisionPath = p.team === passerTeam ? 'TEAM_WITH_BALL' : 'TEAM_WITHOUT_BALL';
    return {
      ...p,
      decisionMemory: {
        path,
        decision:    chaseDecision,
        commitTicks: COMMIT_TICKS.chase_loose_ball,
      },
    };
  });
  return { ...state, decisions: newDecisions, players: newPlayers };
}

/**
 * Start a through ball — pass into space at (cellX, cellY).
 *
 * The ball is in flight to a position, not a player. Phase 3: on landing the
 * nearest player picks it up. Phase 5 will replace this with a sprint race +
 * loose-ball duel.
 */
function startThroughBall(
  state:    GameState,
  decision: { cellX: number; cellY: number; intendedRunnerId: number | null },
): GameState {
  const holder = state.players.find(p => p.id === state.ballHolderId)!;

  // Pass-error model — Gaussian noise on landing point scaled by (1 − passingSkill).
  // Box-Muller approximation.
  const skill   = holder.runtimeStats.withBall.passingSkill;
  const sigma   = (1 - skill) * THROUGH_BALL_CONFIG.MAX_THROUGH_BALL_ERROR / 2;
  const u1      = Math.max(1e-6, Math.random());
  const u2      = Math.random();
  const z0      = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const z1      = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
  const landingX = decision.cellX + z0 * sigma;
  const landingY = decision.cellY + z1 * sigma;

  // Offside snapshot — for the intended runner, at kick time. Phase 3 v1: only
  // the intended runner's offside status is snapshotted. If a non-intended
  // teammate (who happened to be onside) ends up nearest at landing, no offside.
  const intendedRunner = decision.intendedRunnerId
    ? state.players.find(p => p.id === decision.intendedRunnerId) ?? null
    : null;
  const runnerOffside = intendedRunner
    ? checkReceiverOffside(holder, intendedRunner, state.players)
    : false;

  const distance = Math.sqrt((landingX - holder.x) ** 2 + (landingY - holder.y) ** 2);

  // Through balls are their own stat family (throughBallStarted → Completed / LostIn*) — they
  // never emit passAttempted, which only counts passes that end in passCompleted / passFailed.
  gameBus.emit('throughBallStarted', {
    player:           holder.id,
    toX:              landingX,
    toY:              landingY,
    intendedRunnerId: decision.intendedRunnerId,
  });
  debugLog('throughBall', `${holder.name} plays through ball to (${landingX.toFixed(0)}, ${landingY.toFixed(0)})`, {
    playerId: holder.id,
    data:     { intendedRunnerId: decision.intendedRunnerId, distance: Math.round(distance) },
  });

  const stateWithPass: GameState = {
    ...state,
    pass: {
      fromId:           state.ballHolderId,
      toId:             null,
      toX:              landingX,
      toY:              landingY,
      kind:             'through',
      t:                0,
      distance,
      receiverOffside:  runnerOffside,
      intendedRunnerId: decision.intendedRunnerId,
    },
    setPiece: null,
  };

  // Phase 4: commit chasers from both teams. Their decisions are overridden to
  // `chase_loose_ball` so they sprint at full pace toward the landing point
  // (no formation pull, only pitch bounds).
  return commitLooseBallChasers(stateWithPass, holder.id, landingX, landingY);
}

// ── Out-of-bounds set-piece helpers ─────────────────────────────────────────
// Used by handleLooseBall when the drifting ball crosses a pitch boundary.
// Resolves into a throw-in (touchline), goal kick (defending byline) or
// corner (attacking team's own byline — rare for forward through balls but
// kept for completeness).

type OOBKind = 'throw_in' | 'goal_kick' | 'corner';

function nearestPlayerTo(pool: GamePlayer[], pos: { x: number; y: number }): GamePlayer {
  return pool.reduce((best, p) => {
    const d  = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
    const bd = (best.x - pos.x) ** 2 + (best.y - pos.y) ** 2;
    return d < bd ? p : best;
  });
}

function oobLayoutFor(
  kind:    OOBKind,
  side:    'attack' | 'defend',
  layouts: FormationSetPieces,
): SetPieceLayout {
  if (kind === 'throw_in') return side === 'attack' ? layouts.throwIn_Attack : layouts.throwIn_Defend;
  if (kind === 'corner')   return side === 'attack' ? layouts.corner_Attack  : layouts.corner_Defend;
  // goal_kick: only an attacking layout (the GK's team). Defending team has no
  // dedicated goalKick_Defend — they hold their kickoff defending shape.
  return side === 'attack' ? layouts.goalKick : layouts.kickOffDefend;
}

function oobCountdownFor(kind: OOBKind): number {
  if (kind === 'throw_in') return 1.5;
  if (kind === 'corner')   return 2;
  return 1; // goal_kick — matches the value used after saves/missed shots
}

/**
 * Compute the actual ball-restart position on the pitch boundary.
 *
 * - throw_in: clamp X, snap Y to whichever touchline was crossed.
 * - corner:   snap to the corner flag of the line crossed, on the side the ball went out.
 * - goal_kick: 6-yard box edge of the awarded team's goal, centred.
 */
function computeOOBRestartPosition(
  kind:        OOBKind,
  exitX:       number,
  exitY:       number,
  awardedTeam: TeamId,
  players:     GamePlayer[],
): { x: number; y: number } {
  if (kind === 'throw_in') {
    const x = Math.max(0, Math.min(PITCH_LENGTH, exitX));
    const y = exitY < 0 ? 0 : PITCH_WIDTH;
    return { x, y };
  }
  if (kind === 'corner') {
    const x = exitX < 0 ? 0 : PITCH_LENGTH;
    const y = exitY < PITCH_WIDTH / 2 ? 0 : PITCH_WIDTH;
    return { x, y };
  }
  // goal_kick — own goal line of the awarded team, six yards out, centred.
  const someAwardedPlayer = players.find(p => p.team === awardedTeam);
  const attackDir         = someAwardedPlayer?.attackDir ?? 1;
  const ownGoalX          = attackDir === 1 ? 0 : PITCH_LENGTH;
  const x                 = ownGoalX === 0 ? 6 : PITCH_LENGTH - 6;
  return { x, y: 37 };
}

/**
 * Pick which player on the awarded team takes the restart.
 *
 * - goal_kick: GK always.
 * - corner:    nearest winger / wide player to the corner flag side.
 * - throw_in:  nearest outfield player to the throw-in spot.
 */
function pickOOBTaker(
  kind:        OOBKind,
  awardedTeam: TeamId,
  position:    { x: number; y: number },
  players:     GamePlayer[],
): GamePlayer {
  const team = players.filter(p => p.team === awardedTeam);
  if (kind === 'goal_kick') {
    return team.find(p => p.role === 'GK') ?? nearestPlayerTo(team, position);
  }
  if (kind === 'corner') {
    const isLeftSide = position.y === 0;
    const preferred  = isLeftSide ? ['LW', 'LM', 'LWB', 'LB'] : ['RW', 'RM', 'RWB', 'RB'];
    for (const role of preferred) {
      const found = team.find(p => p.role === role as PlayerRole);
      if (found) return found;
    }
    return nearestPlayerTo(team, position);
  }
  // throw_in — outfield only, nearest to throw point.
  const outfield = team.filter(p => p.role !== 'GK');
  return nearestPlayerTo(outfield.length > 0 ? outfield : team, position);
}

/**
 * Resolve a ball-out-of-bounds event into a set-piece freeze.
 *
 * Full sequence:
 *   1. Choose restart position (corner flag / touchline / six-yard line).
 *   2. Pick taker (winger / GK / closest outfield).
 *   3. Apply the awarded team into _Attack layout, opposite team into _Defend layout.
 *   4. Move the taker on top of the ball position (overrides their layout slot).
 *   5. Emit existing TB-lost stat events so /lab still tracks the failed pass.
 *   6. Set state.setPiece with kind + taker + countdown + position.
 */
function resolveOOBSetPiece(
  s:             GameState,
  kind:          OOBKind,
  awardedTeam:   TeamId,
  exitX:         number,
  exitY:         number,
  fromPasserId:  number,
  source:        LooseBallSource = 'through',
  cornerSource:  CornerSource = 'loose',
): TickResult {
  const oppositeTeam: TeamId = awardedTeam === 'A' ? 'B' : 'A';

  const position = computeOOBRestartPosition(kind, exitX, exitY, awardedTeam, s.players);
  if (kind === 'corner') return awardCorner(s, awardedTeam, position, fromPasserId, source, cornerSource);
  const taker    = pickOOBTaker(kind, awardedTeam, position, s.players);

  // Layouts — awarded team plays the _Attack shape, opposite team plays _Defend.
  const awFmt = awardedTeam === 'A' ? s.formationA : s.formationB;
  const opFmt = awardedTeam === 'A' ? s.formationB : s.formationA;
  const aLay  = resolveFormationSetPieces(awFmt);
  const oLay  = resolveFormationSetPieces(opFmt);

  let players = s.players;
  if (aLay) players = applySetPieceToTeam(players, awardedTeam,  oobLayoutFor(kind, 'attack', aLay));
  if (oLay) players = applySetPieceToTeam(players, oppositeTeam, oobLayoutFor(kind, 'defend', oLay));

  // Move the taker on top of the actual ball position so they're holding it.
  players = players.map(p =>
    p.id === taker.id
      ? { ...p, x: position.x, y: position.y, targetPosition: { x: position.x, y: position.y } }
      : p,
  );

  if (source === 'through') gameBus.emit('throughBallLostInRace', { player: fromPasserId, defenderWinnerId: taker.id });
  debugLog(source === 'through' ? 'throughBall' : 'aerial', `Ball OOB at (${exitX.toFixed(1)}, ${exitY.toFixed(1)}) → ${kind} for team ${awardedTeam} (taker ${taker.name})`, {
    playerId: taker.id,
    data:     { fromId: fromPasserId, kind, restart: position },
  });

  const prevHolderId = s.ballHolderId;
  return {
    state: onPossessionTransfer({
      ...s,
      players,
      looseBall:      null,
      ballHolderId:   taker.id,
      possessionTime: 0,
      lastPasserId:   null,
      setPiece: {
        type:      kind,
        takerId:   taker.id,
        countdown: oobCountdownFor(kind),
        position,
      },
    }, prevHolderId),
    passCompleted: false, tackled: false, goalScored: null,
  };
}

/**
 * Corner for `awardedTeam` from the flag at `position` (`set-pieces-play.md` §1): the corner taker
 * (manager's choice, else the best delivery) on the ball, both teams in the box layout, a
 * CORNER_COUNTDOWN freeze, and a set-piece phase for the goal attribution.
 */
export function awardCorner(
  s:            GameState,
  awardedTeam:  TeamId,
  position:     { x: number; y: number },
  fromPasserId: number,
  source:       LooseBallSource,
  cornerSource: CornerSource,
): TickResult {
  const s0 = clearAllChasers({ ...s, pass: null, shot: null, looseBall: null });
  const taker = setPieceTakerOf(s0, awardedTeam, 'corners')
    ?? pickOOBTaker('corner', awardedTeam, position, s0.players);
  const players = applyBoxSetPiece(s0.players, taker, position, 'corner', Math.random);
  // A through ball out for a corner to the other team was lost; one out for the passer's own team was not.
  const passer = s0.players.find(p => p.id === fromPasserId);
  if (source === 'through' && passer && passer.team !== awardedTeam) {
    gameBus.emit('throughBallLostInRace', { player: fromPasserId, defenderWinnerId: taker.id });
  }
  gameBus.emit('cornerAwarded', { team: awardedTeam, takerId: taker.id, source: cornerSource });
  debugLog('setPiece', `Corner to team ${awardedTeam} (${cornerSource}) — ${taker.name} to take it`, {
    playerId: taker.id, data: { fromId: fromPasserId, source: cornerSource, restart: position },
  });
  const prevHolderId = s0.ballHolderId;
  const countdown = SET_PIECE_CONFIG.CORNER_COUNTDOWN;
  const st = onPossessionTransfer({
    ...s0,
    players,
    ballHolderId:   taker.id,
    possessionTime: 0,
    lastPasserId:   null,
    tackleCooldown: TACKLE_COOLDOWN,
    setPiece: { type: 'corner', takerId: taker.id, countdown, position, variant: 'box' },
  }, prevHolderId);
  return { state: openSetPiecePhase(st, awardedTeam, 'corner', countdown), passCompleted: false, tackled: false, goalScored: null };
}

/**
 * Tick the loose-ball phase — the ball drifts in space at `state.looseBall.{x,y}`
 * after a through ball lands. Each tick we:
 *   1. Advance the ball by its current velocity.
 *   2. Decay velocity via LOOSE_BALL_DECELERATION (friction).
 *   3. If the ball crosses a pitch boundary → award to the opposing team.
 *   4. Otherwise check who's within LOOSE_BALL_TOUCH_RADIUS:
 *      • 0 players in touch → ball keeps drifting (or sits if velocity = 0).
 *      • 1 player in touch (or top-2 are same-team / gap > DUEL_GAP_TRIGGER) →
 *        clean pickup, possession transfers.
 *      • 2 opposing players within DUEL_RADIUS and gap ≤ DUEL_GAP_TRIGGER →
 *        contested duel (resolveLooseBallDuel), both enter recovery.
 *
 * Players continue sprinting because their `chase_loose_ball` decisions are
 * pinned by the decision loop with the *current* loose-ball position, so
 * chasers automatically track the drifting ball.
 *
 * Offside enforcement runs at pickup time only when the *intended runner* is
 * the one who collects. Out-of-bounds awards bypass offside entirely.
 */
function handleLooseBall(s: GameState, dt: number): TickResult {
  const cfg = THROUGH_BALL_CONFIG;
  let lb = s.looseBall!;
  // Only a through ball feeds the through-ball stats; a high ball nobody reached reports its
  // outcome as `aerialResolved` (`aerial.md`); a clearance / punch / block reports nothing.
  const source: LooseBallSource = lb.source ?? 'through';
  const isTB = source === 'through';
  const aerialOutcome = (winnerId: number | null, completed: boolean) => {
    if (source === 'cross' || source === 'long_ball') {
      gameBus.emit('aerialResolved', { kind: source, fromId: lb.fromPasserId, winnerId, completed, outcome: 'loose' });
    }
  };

  // ── 1. Advance ball + decay velocity ─────────────────────────────────────
  let { x, y, vx, vy } = lb;
  const speed = Math.hypot(vx, vy);
  if (speed > 0) {
    const newSpeed = Math.max(0, speed - cfg.LOOSE_BALL_DECELERATION * dt);
    const factor   = newSpeed / speed;
    vx *= factor;
    vy *= factor;
    x  += lb.vx * dt;
    y  += lb.vy * dt;
  }

  // ── 2. Out of bounds → throw-in / goal-kick / corner ──────────────────────
  // Touchline crossing → throw-in. Goal-line crossing → goal kick if the passer's
  // team played it over the OPPONENT'S goal line (normal forward through ball);
  // corner if (rare) it crossed the passer's OWN goal line.
  if (x < 0 || x > PITCH_LENGTH || y < 0 || y > PITCH_WIDTH) {
    const passer       = s.players.find(p => p.id === lb.fromPasserId);
    const passerDir    = passer?.attackDir ?? 1;
    const awardedTeam: TeamId = lb.fromTeamLastTouch === 'A' ? 'B' : 'A';

    let kind: OOBKind;
    if (y < 0 || y > PITCH_WIDTH) {
      kind = 'throw_in';
    } else {
      const overOpponentsGoal =
        (passerDir === 1 && x > PITCH_LENGTH) ||
        (passerDir === -1 && x < 0);
      kind = overOpponentsGoal ? 'goal_kick' : 'corner';
    }

    aerialOutcome(null, false);
    // Over the defending team's line with one of them on it: his touch put it out — corner.
    if (kind === 'goal_kick') {
      const exit = { x: Math.max(0, Math.min(PITCH_LENGTH, x)), y: Math.max(0, Math.min(PITCH_WIDTH, y)) };
      // The keeper letting it run out is a goal kick, not a corner.
      const touched = s.players.some(p => p.team === awardedTeam && p.role !== 'GK'
        && Math.hypot(p.x - exit.x, p.y - exit.y) <= SET_PIECE_CONFIG.LOOSE_CORNER_RADIUS);
      if (touched && Math.random() < SET_PIECE_CONFIG.LOOSE_CORNER_CHANCE) {
        return resolveOOBSetPiece(s, 'corner', lb.fromTeamLastTouch, x, y, lb.fromPasserId, source, 'loose');
      }
    }
    return resolveOOBSetPiece(s, kind, awardedTeam, x, y, lb.fromPasserId, source);
  }

  // ── 3. Persist the new ball position + velocity for downstream lookups ────
  s = { ...s, looseBall: { ...lb, x, y, vx, vy } };
  lb = s.looseBall!;
  const passer = s.players.find(p => p.id === lb.fromPasserId);

  // ── 3b. Nobody chasing? Re-commit chasers (#36) ─────────────────────────
  // Chasers can vanish mid-race: injury removal/substitution (the incoming player has no
  // chase memory), or nobody passed the role/recovery gate at landing. Without a chaser the
  // ball can sit forever in empty space.
  if (!s.players.some(p => p.decisionMemory?.decision?.type === 'chase_loose_ball')) {
    s = commitLooseBallChasers(s, lb.fromPasserId, lb.x, lb.y, lb.fromTeamLastTouch);
    debugLog('throughBall', `Loose ball had no chaser — re-committed at (${lb.x.toFixed(1)}, ${lb.y.toFixed(1)})`, {
      playerId: lb.fromPasserId,
    });
  }

  // Sort players by distance to the loose ball
  const ranked = s.players
    .filter(p => !isPlayerInRecovery(p))
    .map(p => ({ p, dist: Math.hypot(p.x - lb.x, p.y - lb.y) }))
    .sort((a, b) => a.dist - b.dist);

  // Players within touch radius — they can pick up
  let inTouch = ranked.filter(r => r.dist <= cfg.LOOSE_BALL_TOUCH_RADIUS);

  // ── Watchdog (#36): a loose ball can never outlive the timeout — award it to the nearest
  // player (recovering players included) so play always resumes.
  if (inTouch.length === 0 && s.matchTime - lb.startTime >= cfg.LOOSE_BALL_WATCHDOG_REAL_SECONDS * TIME_SCALE) {
    const nearest = s.players
      .map(p => ({ p, dist: Math.hypot(p.x - lb.x, p.y - lb.y) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (nearest) {
      debugLog('throughBall', `Loose-ball watchdog: awarded to nearest player ${nearest.p.name} (${nearest.dist.toFixed(1)} yds)`, {
        playerId: nearest.p.id, data: { fromId: lb.fromPasserId },
      });
      inTouch = [nearest];
    }
  }

  // ── 4. No one in reach yet — ball keeps drifting (or sits if v = 0) ──────
  if (inTouch.length === 0) {
    return { state: s, passCompleted: false, tackled: false, goalScored: null };
  }

  // ── Someone arrived — clean pickup OR contested duel ───────────────────
  let winner: GamePlayer;
  let duelLost = false;
  // Set only when a real contested duel happened this call — feeds the contact-injury roll
  // applied to the final outcome via `finishLooseBall` below.
  let duelParticipants: [number, number] | null = null;

  if (
    inTouch.length >= 2 &&
    inTouch[0]!.p.team !== inTouch[1]!.p.team &&
    inTouch[1]!.dist <= cfg.DUEL_RADIUS &&
    inTouch[1]!.dist - inTouch[0]!.dist <= cfg.DUEL_GAP_TRIGGER
  ) {
    const a = inTouch[0]!.p;
    const b = inTouch[1]!.p;
    const gap = inTouch[1]!.dist - inTouch[0]!.dist;
    const { winnerId, probA } = resolveLooseBallDuel(a, b, gap);
    winner = winnerId === a.id ? a : b;
    debugLog('throughBall', `Loose-ball duel: ${a.name} vs ${b.name} → ${winner.name} (probA=${probA.toFixed(2)})`, {
      playerId: winner.id, data: { fromId: lb.fromPasserId, gap: Math.round(gap * 10) / 10 },
    });
    s = {
      ...s,
      players: s.players.map(p => {
        if (p.id === a.id || p.id === b.id) return { ...p, recoveryTime: DUEL_TACKLE_WIN_RECOVERY };
        return p;
      }),
    };
    duelParticipants = [a.id, b.id];
  } else {
    winner = inTouch[0]!.p;
  }

  // Applies the contact-injury roll (only when `duelParticipants` was set above) to a finished
  // TickResult right before it's returned — safe to do last since `ballHolderId`/`players` are
  // already final in `result.state`, and both helpers correctly reassign `ballHolderId` if the
  // injured player happens to be the one just given possession.
  const finishLooseBall = (result: TickResult): TickResult => {
    if (!duelParticipants) return result;
    return { ...result, state: rollContactInjuries(result.state, duelParticipants, matchMinute(result.state)) };
  };

  // ── Offside enforcement — only if the intended runner is the one who collects
  const flaggedOffside =
    (lb.receiverOffside && lb.intendedRunnerId !== null && winner.id === lb.intendedRunnerId) ||
    (winner.team === lb.fromTeamLastTouch && (lb.offsideIds ?? []).includes(winner.id));

  if (flaggedOffside) {
    gameBus.emit('offsideCalled', { team: winner.team, receiverId: winner.id });
    if (isTB) gameBus.emit('throughBallLostInFlight', { player: lb.fromPasserId, interceptorId: winner.id });
    aerialOutcome(winner.id, false);
    const defenders = s.players.filter(p => p.team !== winner.team);
    const nearestDefender = defenders.reduce((best, p) => {
      const d  = (p.x - lb.x) ** 2 + (p.y - lb.y) ** 2;
      const bd = (best.x - lb.x) ** 2 + (best.y - lb.y) ** 2;
      return d < bd ? p : best;
    });
    const prevHolderId = s.ballHolderId;
    return finishLooseBall({
      state: onPossessionTransfer({
        ...s,
        looseBall: null,
        ballHolderId: nearestDefender.id,
        possessionTime: 0,
        lastPasserId: null,
        tackleCooldown: TACKLE_COOLDOWN,
        setPiece: { type: 'offside_fk', takerId: nearestDefender.id, countdown: 2, position: { x: lb.x, y: lb.y } },
      }, prevHolderId),
      passCompleted: false, tackled: false, goalScored: null,
    });
  }

  // ── Foul in a contested duel (`.claude/rules/game-engine/fouls.md`) — either player may be the
  // offender (50/50); the fouled side gets the restart, whoever won the duel.
  if (duelParticipants) {
    const [aId, bId] = duelParticipants;
    const pa = s.players.find(p => p.id === aId)!;
    const pb = s.players.find(p => p.id === bId)!;
    const [offender, victim] = Math.random() < 0.5 ? [pa, pb] : [pb, pa];
    const fouledState = maybeFoul(s, offender, victim, 'duel', false);
    if (fouledState) {
      if (victim.team === lb.fromTeamLastTouch) {
        if (isTB) gameBus.emit('throughBallCompleted', { player: lb.fromPasserId, winnerId: victim.id, intendedRunnerId: lb.intendedRunnerId });
      } else if (isTB) {
        gameBus.emit('throughBallLostInDuel', { player: lb.fromPasserId, defenderWinnerId: victim.id });
      }
      aerialOutcome(victim.id, victim.team === lb.fromTeamLastTouch);
      return finishLooseBall({ state: fouledState, passCompleted: false, tackled: false, goalScored: null });
    }
    if (winner.team !== lb.fromTeamLastTouch) {
      if (isTB) gameBus.emit('throughBallLostInDuel', { player: lb.fromPasserId, defenderWinnerId: winner.id });
      duelLost = true;
    }
  }

  const wonByTeam = winner.team === lb.fromTeamLastTouch;
  void passer;

  aerialOutcome(winner.id, wonByTeam);
  if (wonByTeam) {
    const isIntended = lb.intendedRunnerId === winner.id;
    if (isTB) gameBus.emit('throughBallCompleted', { player: lb.fromPasserId, winnerId: winner.id, intendedRunnerId: lb.intendedRunnerId });
    debugLog(isTB ? 'throughBall' : 'aerial', `Loose ball collected by ${winner.name}${isIntended ? ' (intended runner)' : ''}`, {
      playerId: winner.id, data: { fromId: lb.fromPasserId },
    });
    return finishLooseBall({
      state: {
        ...s,
        ballHolderId: winner.id,
        looseBall: null,
        lastPasserId: lb.fromPasserId,
        players: s.players.map(p => p.id === winner.id ? { ...p, justReceivedTicks: 4 } : p),
      },
      passCompleted: true, tackled: false, goalScored: null,
    });
  }

  // Defender wins
  if (!duelLost && isTB) {
    gameBus.emit('throughBallLostInRace', { player: lb.fromPasserId, defenderWinnerId: winner.id });
  }
  debugLog(isTB ? 'throughBall' : 'aerial', `Loose ball won by defender ${winner.name}`, {
    playerId: winner.id, data: { fromId: lb.fromPasserId },
  });
  const prevHolderId = s.ballHolderId;
  return finishLooseBall({
    state: onPossessionTransfer(
      { ...s, looseBall: null, ballHolderId: winner.id, possessionTime: 0, lastPasserId: null },
      prevHolderId,
    ),
    passCompleted: false, tackled: true, goalScored: null,
  });
}

// ── Aerial play: crosses, long balls, aerial duels, keeper claims, headers ───
// `.claude/rules/game-engine/aerial.md`. Pure evaluation in `Domain/Aerial.ts`, outcome rolls in
// `ActionOutcomes.ts` (`resolveAerialDuel`, `gkClaimChance`, `computeHeaderEffect`); this section
// executes them.

/** Standard normal pair (Box-Muller). */
function gaussianPair(rng: () => number): [number, number] {
  const u1 = Math.max(1e-6, rng());
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

/** Outfield attackers of `holder`'s team in an offside position right now. */
function offsideIdsAt(holder: GamePlayer, players: GamePlayer[]): number[] {
  if (!OFFSIDE_CONFIG.ENABLED) return [];
  const line = computeOffsideLine(holder.attackDir, players, holder.team, holder.x);
  if (line === null) return [];
  return players
    .filter(p => p.team === holder.team && p.id !== holder.id && p.role !== 'GK'
      && (holder.attackDir === 1 ? p.x > line : p.x < line))
    .map(p => p.id);
}

/**
 * Ball knocked away by `player` (defensive header, keeper punch, block): a short high ball
 * (kind `clearance`) from `origin`, `dist` yards away from his own goal with a random lateral
 * spread — the second ball, contested where it lands. The clearing player is the last toucher;
 * chasers of both teams are committed to the landing point.
 */
function clearanceBall(
  s: GameState,
  player: GamePlayer,
  origin: { x: number; y: number },
  dist: number,
  rng: () => number,
): GameState {
  const a = (rng() * 2 - 1) * AERIAL_CONFIG.CLEARANCE_SPREAD;
  const toX = Math.max(1, Math.min(PITCH_LENGTH - 1, origin.x + player.attackDir * Math.cos(a) * dist));
  const toY = Math.max(1, Math.min(PITCH_WIDTH - 1, origin.y + Math.sin(a) * dist));
  const prevHolderId = s.ballHolderId;
  // The clearing player is at the ball: the flight starts from him.
  const players = s.players.map(p => (p.id === player.id ? { ...p, x: origin.x, y: origin.y, targetPosition: { ...origin } } : p));
  const st = onPossessionTransfer({
    ...s,
    players,
    pass: {
      fromId: player.id, toId: null, toX, toY, kind: 'clearance', t: 0,
      distance: Math.hypot(toX - origin.x, toY - origin.y),
      receiverOffside: false, intendedRunnerId: null, aerialOffsideIds: [],
    },
    looseBall: null,
    setPiece: null,
    ballHolderId: player.id,
    possessionTime: 0,
    lastPasserId: null,
  }, prevHolderId);
  return commitLooseBallChasers(st, player.id, toX, toY, player.team, {
    maxPerTeam: AERIAL_CONFIG.MAX_CHASERS_PER_TEAM,
    etaHorizon: AERIAL_CONFIG.CHASE_ETA_HORIZON,
    keeperSmallBoxOnly: true,
  });
}

const uniform = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

/** Offside free kick for the team defending against `offender` at `at` (aerial path). */
function aerialOffsideFreeKick(s: GameState, offender: GamePlayer, at: { x: number; y: number }): GameState {
  gameBus.emit('offsideCalled', { team: offender.team, receiverId: offender.id });
  const defenders = s.players.filter(p => p.team !== offender.team);
  if (defenders.length === 0) return s;
  const taker = nearestPlayerTo(defenders, at);
  const layout = resolveFormationSetPieces(taker.team === 'A' ? s.formationA : s.formationB).offside_fk;
  let players = layout ? applySetPieceToTeam(s.players, taker.team, layout) : s.players;
  players = players.map(p => (p.id === taker.id ? { ...p, x: at.x, y: at.y, targetPosition: { ...at } } : p));
  const prevHolderId = s.ballHolderId;
  return onPossessionTransfer({
    ...s,
    pass: null,
    players,
    ballHolderId: taker.id,
    possessionTime: 0,
    lastPasserId: null,
    tackleCooldown: TACKLE_COOLDOWN,
    setPiece: { type: 'offside_fk', takerId: taker.id, countdown: 2, position: { ...at } },
  }, prevHolderId);
}

/**
 * Start a high ball (`cross` / `long_ball`) from the current holder toward `target`.
 * Landing error σ = (1 − passingSkill) × MAX_ERROR / 2. An opponent within BLOCK_RADIUS of the
 * passer may block it at the kick (the only way a high ball is stopped before it lands).
 * Exported for /test scenarios and engine tests.
 */
export function startAerialBall(
  state:  GameState,
  kind:   'cross' | 'long_ball',
  target: { x: number; y: number },
  intendedId: number | null,
  rng: () => number = Math.random,
): GameState {
  const C = AERIAL_CONFIG;
  const holder = state.players.find(p => p.id === state.ballHolderId)!;
  const maxErr = kind === 'cross' ? C.CROSS_MAX_ERROR : C.LONG_BALL_MAX_ERROR;
  const sigma = (1 - holder.runtimeStats.withBall.passingSkill) * maxErr / 2;
  const [z0, z1] = gaussianPair(rng);
  const toX = Math.max(1, Math.min(PITCH_LENGTH - 1, target.x + z0 * sigma));
  const toY = Math.max(1, Math.min(PITCH_WIDTH - 1, target.y + z1 * sigma));
  const distance = Math.hypot(toX - holder.x, toY - holder.y);

  if (kind === 'cross') gameBus.emit('crossStarted', { player: holder.id, toX, toY, intendedRunnerId: intendedId });
  else gameBus.emit('longBallStarted', { player: holder.id, toX, toY, targetId: intendedId });
  debugLog('aerial', `${holder.name} plays a ${kind === 'cross' ? 'cross' : 'long ball'} to (${toX.toFixed(0)}, ${toY.toFixed(0)})`, {
    playerId: holder.id, data: { intendedId, distance: Math.round(distance) },
  });

  // Block at the kick — the closest opponent within BLOCK_RADIUS.
  let blocker: GamePlayer | null = null;
  let blockDist: number = C.BLOCK_RADIUS;
  for (const p of state.players) {
    if (p.team === holder.team || isPlayerInRecovery(p)) continue;
    const d = Math.hypot(p.x - holder.x, p.y - holder.y);
    if (d <= blockDist) { blockDist = d; blocker = p; }
  }
  if (blocker && rng() < C.BLOCK_CHANCE) {
    gameBus.emit('aerialResolved', { kind, fromId: holder.id, winnerId: blocker.id, completed: false, outcome: 'blocked' });
    debugLog('aerial', `${blocker.name} blocks the ${kind === 'cross' ? 'cross' : 'long ball'}`, { playerId: blocker.id });
    const s0: GameState = { ...state, setPiece: null };
    const goalX = holder.attackDir === 1 ? PITCH_LENGTH : 0;
    const distToLine = (goalX - holder.x) * holder.attackDir;
    // Near the line a block goes behind for a corner (`set-pieces-play.md`): crosses more often.
    const behind = distToLine <= C.CLEARANCE_CORNER_DEPTH
      && rng() < (kind === 'cross' ? SET_PIECE_CONFIG.CROSS_BLOCK_CORNER_CHANCE : C.CLEARANCE_CORNER_CHANCE);
    if (behind) {
      const exitX = goalX === 0 ? -1 : PITCH_LENGTH + 1;
      return resolveOOBSetPiece(s0, 'corner', holder.team, exitX, holder.y, blocker.id, 'clearance', 'cross_block').state;
    }
    return clearanceBall(s0, blocker, { x: holder.x, y: holder.y }, uniform(rng, C.BLOCK_DIST_MIN, C.BLOCK_DIST_MAX), rng);
  }

  const pass: PassState = {
    fromId: holder.id,
    toId: null,
    toX, toY,
    kind,
    t: 0,
    distance,
    receiverOffside: false,
    intendedRunnerId: intendedId,
    aerialOffsideIds: offsideIdsAt(holder, state.players),
    ...(state.setPiece ? { fromSetPiece: true } : {}),
    ...(state.setPiece?.variant ? { setPieceVariant: state.setPiece.variant } : {}),
  };
  // A set-piece delivery into the box: everyone who went up attacks it (`set-pieces-play.md`).
  const boxDelivery = kind === 'cross' && state.setPiece?.variant === 'box';
  return commitLooseBallChasers({ ...state, pass, setPiece: null }, holder.id, toX, toY, holder.team, {
    maxPerTeam: boxDelivery ? SET_PIECE_CONFIG.SET_PIECE_CHASERS : C.MAX_CHASERS_PER_TEAM,
    etaHorizon: boxDelivery ? SET_PIECE_CONFIG.SET_PIECE_CHASE_ETA_HORIZON : C.CHASE_ETA_HORIZON,
    keeperSmallBoxOnly: true,
    ignoreRoleWeights: boxDelivery,
  });
}

/** Chance of controlling a high ball at first touch (else it drops loose): base + first touch. */
function highBallControlChance(p: GamePlayer): number {
  const C = AERIAL_CONFIG;
  return Math.max(0, Math.min(1, C.CONTROL_BASE + C.CONTROL_TOUCH * p.runtimeStats.withBall.firstTouch));
}

/** A header at goal by `headerId` (`aerial.md`): own xG (× HEADER_XG_MULT), aim from heading. */
function startHeader(state: GameState, headerId: number, pressureMult = 1): GameState {
  const p = state.players.find(pl => pl.id === headerId)!;
  const goalX = p.attackDir === 1 ? PITCH_LENGTH : 0;
  const dist = Math.abs(goalX - p.x);
  const openAngle = computeOpenAngle(p.x, p.y, goalX);
  const pressure = computeWeightedPressure(p, state.players.filter(o => o.team !== p.team)) * pressureMult;
  const xg = computeXG(dist, openAngle, pressure) * AERIAL_CONFIG.HEADER_XG_MULT;
  // Heading stands in for finishing in the aim spread.
  const aimAs: GamePlayer = {
    ...p,
    runtimeStats: { ...p.runtimeStats, withBall: { ...p.runtimeStats.withBall, shootAccuracy: Math.min(0.95, headingOf(p)) } },
  };
  const { toX, toY } = computeShotAim(aimAs);
  gameBus.emit('shot', { player: p.id, xg });
  gameBus.emit('header', { player: p.id, xg });
  debugLog('aerial', `${p.name} heads at goal (xG ${xg.toFixed(2)})`, { playerId: p.id, data: { xg, dist: Math.round(dist) } });
  return {
    ...state,
    ballHolderId: p.id,
    pass: null,
    setPiece: null,
    shot: { shooterId: p.id, fromX: p.x, fromY: p.y, toX, toY, t: 0, xg, header: true },
  };
}

/**
 * Resolve a high ball at its landing point (`aerial.md` §3): the defending keeper comes for it
 * (claim or punch) when it drops in his small box or he gets there first; otherwise the best
 * contestant of each team within AERIAL_RADIUS duel in the air (first contact when only one team
 * is there). Attacking winner near goal → header; else a headed lay-off to a teammate closer to
 * goal, else he controls it. Defending winner in his box or under challenge → clearance (behind for
 * a corner sometimes); uncontested elsewhere → he controls it. Nobody there → loose ball.
 */
export function resolveAerialLanding(state: GameState, rng: () => number = Math.random): TickResult {
  const C = AERIAL_CONFIG;
  const pass = state.pass!;
  const kind = pass.kind as 'cross' | 'long_ball' | 'clearance';
  const point = { x: pass.toX, y: pass.toY };
  const passer = state.players.find(p => p.id === pass.fromId);
  const passerTeam: TeamId = passer?.team ?? state.players.find(p => p.id === state.ballHolderId)?.team ?? 'A';
  const defTeam: TeamId = passerTeam === 'A' ? 'B' : 'A';
  const done = (st: GameState, passCompleted = false): TickResult => ({ state: st, passCompleted, tackled: false, goalScored: null });
  const resolved = (winnerId: number | null, completed: boolean, outcome: import('@/GameEngine/Infrastructure/EventBus').GameEvents['aerialResolved']['outcome']) => {
    // A clearance is not a pass: only crosses / long balls report their outcome.
    if (kind !== 'clearance') gameBus.emit('aerialResolved', { kind, fromId: pass.fromId, winnerId, completed, outcome });
  };
  const dist = (p: GamePlayer) => Math.hypot(p.x - point.x, p.y - point.y);

  let s: GameState = { ...state, pass: null };
  const active = s.players.filter(p => p.id !== pass.fromId && !isPlayerInRecovery(p));
  const near = active.filter(p => p.role !== 'GK' && dist(p) <= C.AERIAL_RADIUS);
  const attackers = near.filter(p => p.team === passerTeam);
  const defenders = near.filter(p => p.team === defTeam);

  // ── Keeper ────────────────────────────────────────────────────────────────
  const gk = active.find(p => p.team === defTeam && p.role === 'GK');
  if (gk) {
    const gkGoalX = gk.attackDir === 1 ? 0 : PITCH_LENGTH;
    const dGk = dist(gk);
    const nearestOther = active.filter(p => p.id !== gk.id).reduce((m, p) => Math.min(m, dist(p)), Infinity);
    const comes = keeperComesFor(dGk, isInSmallBox(point.x, point.y, gkGoalX), dGk < nearestOther);
    if (comes) {
      const chance = gkClaimChance(gk, attackers.length);
      const claimed = rng() < chance;
      gameBus.emit('gkClaim', { keeperId: gk.id, claimed, chance });
      debugLog('aerial', `${gk.name} comes for it — ${claimed ? 'claims' : 'punches'} (${(chance * 100).toFixed(0)}%)`, { playerId: gk.id, data: { chance } });
      if (claimed) {
        resolved(gk.id, false, 'claim');
        const goalKick = resolveFormationSetPieces(defTeam === 'A' ? s.formationA : s.formationB).goalKick;
        let players = applyStaminaCost(s.players, gk.id, 'gkSave');
        if (goalKick) players = applySetPieceToTeam(players, defTeam, goalKick);
        const prevHolderId = s.ballHolderId;
        return done(onPossessionTransfer({
          ...s,
          players,
          ballHolderId: gk.id,
          possessionTime: 0,
          lastPasserId: null,
          setPiece: { type: 'goal_kick', takerId: gk.id, countdown: 1 },
        }, prevHolderId));
      }
      resolved(gk.id, false, 'punch');
      return done(clearanceBall(s, gk, point, uniform(rng, C.PUNCH_DIST_MIN, C.PUNCH_DIST_MAX), rng));
    }
  }

  // ── Duel / first contact ──────────────────────────────────────────────────
  let winner: GamePlayer | null = null;
  let contested = false;
  if (attackers.length > 0 && defenders.length > 0) {
    const best = (pool: GamePlayer[]) => pool.reduce((a, b) => (aerialDuelScore(b, point) > aerialDuelScore(a, point) ? b : a));
    const a = best(attackers);
    const d = best(defenders);
    // An offside attacker challenging for it is flagged before any duel or foul (no penalty for him).
    if ((pass.aerialOffsideIds ?? []).includes(a.id)) {
      resolved(a.id, false, 'offside');
      return done(aerialOffsideFreeKick(s, a, { x: a.x, y: a.y }));
    }
    // A set-piece delivery: the defenders are set, goal-side of their man (`set-pieces-play.md`).
    const setPieceCross = pass.setPieceVariant === 'box' && kind === 'cross';
    const { winnerId, probA } = resolveAerialDuel(a, d, point, rng, setPieceCross ? SET_PIECE_CONFIG.SET_PIECE_DEFENDER_DUEL_MULT : 1);
    winner = winnerId === a.id ? a : d;
    const loser = winner.id === a.id ? d : a;
    contested = true;
    gameBus.emit('aerialDuel', {
      winnerId: winner.id, loserId: loser.id, x: point.x, y: point.y,
      probWinner: winner.id === a.id ? probA : 1 - probA,
      kind,
    });
    debugLog('aerial', `Aerial duel: ${a.name} vs ${d.name} → ${winner.name} (P(att)=${probA.toFixed(2)})`, {
      playerId: winner.id, data: { probA },
    });
    s = {
      ...s,
      players: s.players.map(p => (p.id === a.id || p.id === d.id ? { ...p, recoveryTime: DUEL_TACKLE_WIN_RECOVERY } : p)),
    };
    // Foul in the air (`fouls.md`, kind 'aerial') — either player may be the offender.
    const pa = s.players.find(p => p.id === a.id)!;
    const pd = s.players.find(p => p.id === d.id)!;
    // At a set piece most fouls in the air are the attacker's (pushing, blocking the keeper).
    const attackerFouls = rng() < (setPieceCross ? SET_PIECE_CONFIG.SET_PIECE_ATTACKER_FOUL_SHARE : 0.5);
    const [offender, victim] = attackerFouls ? [pa, pd] : [pd, pa];
    const fouled = maybeFoul(s, offender, victim, 'aerial', false, rng);
    if (fouled) {
      resolved(victim.id, victim.team === passerTeam, 'foul');
      return done(fouled);
    }
    winner = s.players.find(p => p.id === winner!.id)!;
  } else if (near.length > 0) {
    winner = near.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }

  // ── Nobody reached it: the ball drops and runs on ─────────────────────────
  if (!winner) {
    const len = pass.distance > 0.001 ? pass.distance : 1;
    const dirX = passer ? (point.x - passer.x) / len : 0;
    const dirY = passer ? (point.y - passer.y) / len : 0;
    const v = THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED;
    debugLog('aerial', `High ball lands untouched at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`, { playerId: pass.fromId });
    return done({
      ...s,
      looseBall: {
        x: point.x, y: point.y, vx: dirX * v, vy: dirY * v,
        startTime: s.matchTime,
        fromPasserId: pass.fromId,
        fromTeamLastTouch: passerTeam,
        intendedRunnerId: pass.intendedRunnerId,
        receiverOffside: pass.intendedRunnerId !== null && (pass.aerialOffsideIds ?? []).includes(pass.intendedRunnerId),
        source: kind,
        offsideIds: pass.aerialOffsideIds ?? [],
      },
    });
  }

  /**
   * Bad first touch: the ball bounces off `p` and drops loose next to him. Off an attacker it stays
   * the cross / long ball (reported on pickup, offside still checked); off a defender it is his
   * team's ball loose (a `clearance` — the high ball was not completed).
   */
  const dropLoose = (st: GameState, p: GamePlayer): GameState => {
    const a = rng() * 2 * Math.PI;
    const v = THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED;
    const attacking = p.team === passerTeam;
    debugLog('aerial', `${p.name} fails to control it — loose ball`, { playerId: p.id });
    if (!attacking) resolved(p.id, false, 'loose');
    const prevHolderId = st.ballHolderId;
    return onPossessionTransfer({
      ...st,
      ballHolderId: attacking ? st.ballHolderId : p.id,
      looseBall: {
        x: point.x, y: point.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        startTime: st.matchTime,
        fromPasserId: attacking ? pass.fromId : p.id,
        fromTeamLastTouch: p.team,
        intendedRunnerId: null,
        receiverOffside: false,
        source: attacking ? kind : 'clearance',
        ...(attacking ? { offsideIds: pass.aerialOffsideIds ?? [] } : {}),
      },
    }, prevHolderId);
  };

  // ── Second ball off a clearance: whoever wins it plays on ─────────────────
  if (kind === 'clearance') {
    debugLog('aerial', `Second ball won by ${winner.name}`, { playerId: winner.id });
    const prevHolderId = s.ballHolderId;
    return done(onPossessionTransfer({
      ...s,
      ballHolderId: winner.id,
      possessionTime: winner.team === passerTeam ? s.possessionTime : 0,
      lastPasserId: null,
      players: s.players.map(p => (p.id === winner!.id ? { ...p, justReceivedTicks: 4 } : p)),
    }, prevHolderId));
  }

  // ── Attacking team wins the first contact ─────────────────────────────────
  if (winner.team === passerTeam) {
    if ((pass.aerialOffsideIds ?? []).includes(winner.id)) {
      resolved(winner.id, false, 'offside');
      return done(aerialOffsideFreeKick(s, winner, { x: winner.x, y: winner.y }));
    }
    const goalX = winner.attackDir === 1 ? PITCH_LENGTH : 0;
    // The winner meets the ball at the landing point.
    s = { ...s, players: s.players.map(p => (p.id === winner!.id ? { ...p, x: point.x, y: point.y, targetPosition: { ...point } } : p)) };
    const w = s.players.find(p => p.id === winner!.id)!;
    const angle = computeOpenAngle(point.x, point.y, goalX);
    if (Math.abs(goalX - point.x) <= C.HEADER_RANGE && angle >= C.HEADER_MIN_ANGLE) {
      resolved(w.id, true, 'header');
      return done(startHeader({ ...s, ballHolderId: w.id, lastPasserId: pass.fromId }, w.id,
        pass.setPieceVariant === 'box' && kind === 'cross' ? SET_PIECE_CONFIG.SET_PIECE_HEADER_PRESSURE_MULT : 1));
    }
    // Headed lay-off to a teammate closer to goal.
    let mate: GamePlayer | null = null;
    for (const p of s.players) {
      if (p.team !== w.team || p.id === w.id || p.role === 'GK') continue;
      if (Math.hypot(p.x - point.x, p.y - point.y) > C.KNOCKDOWN_RANGE) continue;
      if ((p.x - point.x) * w.attackDir <= 0) continue;
      if (!mate || Math.abs(goalX - p.x) < Math.abs(goalX - mate.x)) mate = p;
    }
    if (mate) {
      resolved(w.id, true, 'knockdown');
      const distance = Math.hypot(mate.x - w.x, mate.y - w.y);
      gameBus.emit('passAttempted', { player: w.id, toId: mate.id, distance });
      debugLog('aerial', `${w.name} heads it down to ${mate.name}`, { playerId: w.id });
      return done({
        ...s,
        ballHolderId: w.id,
        lastPasserId: pass.fromId,
        pass: {
          fromId: w.id, toId: mate.id, toX: mate.x, toY: mate.y, kind: 'regular', t: 0, distance,
          receiverOffside: checkReceiverOffside(w, mate, s.players), intendedRunnerId: null,
        },
      });
    }
    if (rng() >= highBallControlChance(w)) return done(dropLoose(s, w));
    resolved(w.id, true, 'control');
    return done({
      ...s,
      ballHolderId: w.id,
      lastPasserId: pass.fromId,
      players: s.players.map(p => (p.id === w.id ? { ...p, justReceivedTicks: 4 } : p)),
    }, true);
  }

  // ── Defending team wins the first contact ─────────────────────────────────
  const ownGoalX = winner.attackDir === 1 ? 0 : PITCH_LENGTH;
  if (contested || isInGoalScoreArea(point.x, point.y, ownGoalX)) {
    resolved(winner.id, false, 'clearance');
    debugLog('aerial', `${winner.name} heads it clear`, { playerId: winner.id });
    // A cross headed clear in the box (or near the byline) goes behind for a corner sometimes.
    const deep = isInGoalScoreArea(point.x, point.y, ownGoalX) || Math.abs(point.x - ownGoalX) <= C.CLEARANCE_CORNER_DEPTH;
    if (kind === 'cross' && deep && rng() < SET_PIECE_CONFIG.CROSS_CLEAR_CORNER_CHANCE) {
      const exitX = ownGoalX === 0 ? -1 : PITCH_LENGTH + 1;
      return resolveOOBSetPiece(s, 'corner', passerTeam, exitX, point.y, winner.id, 'clearance', 'cross_clearance');
    }
    return done(clearanceBall(s, winner, point, uniform(rng, C.CLEARANCE_DIST_MIN, C.CLEARANCE_DIST_MAX), rng));
  }
  if (rng() >= highBallControlChance(winner)) return done(dropLoose(s, winner));
  resolved(winner.id, false, 'control');
  const prevHolderId = s.ballHolderId;
  return done(onPossessionTransfer({
    ...s,
    ballHolderId: winner.id,
    possessionTime: 0,
    lastPasserId: null,
    players: s.players.map(p => (p.id === winner!.id ? { ...p, justReceivedTicks: 4 } : p)),
  }, prevHolderId));
}

// ── Tick ─────────────────────────────────────────────────────────────────────

export type TickResult = {
  state:         GameState;
  passCompleted: boolean;
  tackled:       boolean;
  goalScored:    import('../types').TeamId | null;
};

/**
 * Advance the simulation by `dt` seconds.
 *
 * Order of operations each tick (ball-held frame only):
 *   1. Apply formation/press movement — GK sprints to intercept during a shot
 *   2. Tackle check — closest opponent within tackleRange gets a 50 % attempt
 *   3. Shoot or pass decision — holder decides based on distance to goal
 *
 * During a pass or shot in flight, only ball advancement runs (no pressing/tackling).
 */
export function tickState(state: GameState, dt: number, passSpeed = 0.85): TickResult {
  const noop = (s: GameState): TickResult =>
    ({ state: s, passCompleted: false, tackled: false, goalScored: null });

  // ── Match phase gating ────────────────────────────────────────────────────
  if (state.matchPhase === 'preMatch') {
    const countdown = state.presentationCountdown - dt;
    if (countdown <= 0) {
      gameBus.emit('matchStart', { extraTime: Math.round(state.extraTimeFirst / 60) });
      gameBus.emit('kickOff', { team: 'A', phase: 'firstHalf' });
      return noop({ ...state, matchPhase: 'firstHalf', presentationCountdown: 0 });
    }
    return noop({ ...state, presentationCountdown: countdown });
  }

  if (state.matchPhase === 'halfTime') {
    const countdown = state.presentationCountdown - dt;
    if (countdown <= 0) {
      return noop(switchSides(state));
    }
    // Flush pending subs during the half-time window before the second half starts
    let htState = { ...state, presentationCountdown: countdown };
    if (htState.pendingSubsA.length > 0 || htState.pendingSubsB.length > 0) {
      htState = flushPendingSubs(htState, 'A');
      htState = flushPendingSubs(htState, 'B');
    }
    return noop(htState);
  }

  if (state.matchPhase === 'extraTimeBreak') {
    const countdown = state.presentationCountdown - dt;
    if (countdown <= 0) {
      return noop(switchSides(state, 'extraTimeFirst', 'A', ET_BREAK_RECOVERY_SCALE));
    }
    let brk = { ...state, presentationCountdown: countdown };
    if (brk.pendingSubsA.length > 0 || brk.pendingSubsB.length > 0) {
      brk = flushPendingSubs(brk, 'A');
      brk = flushPendingSubs(brk, 'B');
    }
    return noop(brk);
  }

  if (state.matchPhase === 'penalties') {
    const so = state.shootout;
    if (!so) return noop(finishMatch(state));
    const countdown = state.presentationCountdown - dt;
    if (countdown > 0) return noop({ ...state, presentationCountdown: countdown });
    if (so.shown >= so.kicks.length) return noop(finishMatch({ ...state, presentationCountdown: 0 }));
    const kick = so.kicks[so.shown]!;
    const score = { ...so.score, [kick.team]: so.score[kick.team] + (kick.scored ? 1 : 0) };
    gameBus.emit('penaltyKick', {
      team: kick.team, takerId: kick.takerId, keeperId: kick.keeperId,
      scored: kick.scored, chance: kick.chance, score,
    });
    return noop({
      ...state,
      presentationCountdown: PENALTY_KICK_INTERVAL,
      shootout: { ...so, score, shown: so.shown + 1 },
    });
  }

  if (state.matchPhase === 'matchEnd') {
    return noop(state); // frozen — no further simulation
  }

  // ── Clock advancement (the four live periods) ─────────────────────────────
  const newMatchTime = state.matchTime + dt * TIME_SCALE;
  const periodEnd =
    state.matchPhase === 'firstHalf'       ? HALF_DURATION + state.extraTimeFirst :
    state.matchPhase === 'secondHalf'      ? HALF_DURATION + state.extraTimeSecond :
    state.matchPhase === 'extraTimeFirst'  ? ET_HALF_DURATION + (state.etStoppageFirst ?? 0) :
                                             ET_HALF_DURATION + (state.etStoppageSecond ?? 0);

  if (!state.testMode && newMatchTime >= periodEnd && !restartHoldsPeriod(state, newMatchTime, periodEnd)) {
    return noop(endCurrentPeriod(state, newMatchTime));
  }

  // Set-piece freeze (kickoff / goal kick / offside FK) — drain countdown,
  // hold all state; flush pending subs during the freeze. When countdown
  // reaches 0 the setPiece stays non-null (taker still cannot carry) until
  // the ball is played; it is cleared by startPass() / startShot().
  if (state.setPiece && state.setPiece.countdown > 0) {
    const nextCountdown = Math.max(0, state.setPiece.countdown - dt);
    let frozenState: GameState = {
      ...state,
      matchTime: newMatchTime,
      setPiece: { ...state.setPiece, countdown: nextCountdown },
    };
    if (frozenState.pendingSubsA.length > 0 || frozenState.pendingSubsB.length > 0) {
      frozenState = flushPendingSubs(frozenState, 'A');
      frozenState = flushPendingSubs(frozenState, 'B');
    }
    if (nextCountdown === 0 && frozenState.setPiece?.type === 'penalty') {
      return resolveInMatchPenalty(frozenState);
    }
    return noop(frozenState);
  }

  let s: GameState = {
    ...state,
    matchTime:      newMatchTime,
    tackleCooldown: Math.max(0, state.tackleCooldown - dt),
    // Drain per-player recovery debuffs
    players: state.players.map(p => {
      const updates: Partial<typeof p> = {};
      if (p.recoveryTime > 0) updates.recoveryTime = Math.max(0, p.recoveryTime - dt);
      if (p.justReceivedTicks > 0) updates.justReceivedTicks = p.justReceivedTicks - 1;
      return Object.keys(updates).length > 0 ? { ...p, ...updates } : p;
    }),
  };

  // ── Set-piece phase (`set-pieces-play.md`): expires, or closes once the other team has the ball.
  if (s.setPiecePhase) {
    const ph = s.setPiecePhase;
    const h = s.players.find(p => p.id === s.ballHolderId);
    if (s.matchTime > ph.until || (h && h.team !== ph.team && !s.looseBall && s.pass?.kind !== 'clearance')) {
      s = { ...s, setPiecePhase: null };
    }
  }

  // ── Per-minute injury risk (energy/load/age/strength) — every on-pitch player, every tick ──
  // Skipped while a pass/shot is in flight: `rollInMatchInjuries` can remove or substitute ANY
  // on-pitch player, including the passer/shooter/receiver a `PassState`/`ShotState` references
  // by id — doing that mid-flight would leave `state.pass.fromId`/`toId` (or `shot.shooterId`)
  // dangling and crash `getBallPos`/shot resolution. The skipped ticks are a negligible share of
  // match time (a pass/shot flight is a fraction of a second).
  if (s.pass === null && s.shot === null) {
    s = rollInMatchInjuries(s, dt);
  }

  // GK fake-stop: flush pending subs when GK holds the ball (not while a pass/shot is in flight)
  if (s.pendingSubsA.length > 0 || s.pendingSubsB.length > 0) {
    const currentHolder = s.players.find(p => p.id === s.ballHolderId);
    if (currentHolder?.role === 'GK' && s.pass === null && s.shot === null) {
      s = flushPendingSubs(s, 'A');
      s = flushPendingSubs(s, 'B');
    }
  }

  // ── AI substitution evaluation (second half / extra time only, periodic) ──
  // In live matches, only Team B (opponent) is AI-controlled; in headless mode,
  // SimulateMatch passes aiTeams = ['A', 'B'] via the optional parameter below.
  const inSubsWindow = s.matchPhase === 'secondHalf' || s.matchPhase === 'extraTimeFirst' || s.matchPhase === 'extraTimeSecond';
  if (inSubsWindow && shouldCheckAiSubs(s.matchTime, dt * TIME_SCALE)) {
    // Team B is always AI in live matches; `aiTeams` can override for headless sim
    const subsB = evaluateAiSubstitutions(s, 'B');
    if (subsB.length > 0) {
      s = { ...s, pendingSubsB: [...s.pendingSubsB, ...subsB] };
    }
  }

  const holder  = s.players.find(p => p.id === s.ballHolderId)!;
  const inFlight = s.pass !== null || s.shot !== null;

  // ── Possession timer ───────────────────────────────────────────────────
  // Always increment here. Individual possession-change handlers (tackle,
  // interception, dribble loss, offside, GK save) reset it to 0 when the
  // ball moves to the other team.
  s = { ...s, possessionTime: (state.possessionTime ?? 0) + dt };

  // ── Periodic team intent re-evaluation ────────────────────────────────
  // Possession-transfer recompute handles turnovers; this catches mid-possession
  // shifts (opponent advances, numbers change) without per-tick churn.
  const lastEval = s.lastIntentEvalTime ?? 0;
  if (s.matchTime - lastEval >= INTENT_REEVAL_INTERVAL) {
    // Periodic re-eval excludes switch_play — it is decided per-possession at
    // possession-change / reception, not re-judged on this timer (which would
    // flip it to balanced when the holder's wide-geometry goes momentarily stale).
    s = reevaluateTeamIntents(s, { includeSwitchPlay: false });
  }

  // ── Pre-compute shared values ──────────────────────────────────────────
  const ballPos       = getBallPos(s);
  const attackingTeam: TeamId = holder.team;
  const defendingTeam: TeamId = attackingTeam === 'A' ? 'B' : 'A';
  const offsideLine   = computeOffsideLine(
    holder.attackDir, s.players, attackingTeam, ballPos.x,
  );
  // One density grid per tick — passed into decide() so the carrier's clearness
  // check can fade role-fit/byline penalties when the path to goal is open.
  const crowdGrid     = computeCrowdGrid(s);

  // ── Through-ball cell cache (refresh every TB_CACHE_REFRESH_TICKS) ─────
  // The TB cell ranking is dominated by race-margin and path-clearness, both of
  // which shift slowly tick-to-tick. Recomputing the full 2560-cell grid every
  // tick is wasteful; reusing the previous tick's cells while the same player
  // holds the ball is safe. Cache invalidates on holder change.
  const TB_CACHE_REFRESH_TICKS = 2;
  let tbCachedCells: import('./ThroughBallCells').CandidateCell[] | null = null;
  // Loose `!= null` so a saved/loaded state without this field (`undefined`) is
  // treated identically to an explicit `null` — without it, accessing
  // `cache.holderId` on undefined crashes the tick.
  let nextTbCache = s.throughBallCellsCache ?? null;
  if (!inFlight && holder.role !== 'GK') {
    const cache = s.throughBallCellsCache;
    const sameHolder = cache != null && cache.holderId === s.ballHolderId;
    const fresh      = sameHolder && cache!.ticksSinceRefresh < TB_CACHE_REFRESH_TICKS;
    if (fresh) {
      tbCachedCells = cache!.cells;
      nextTbCache   = { ...cache!, ticksSinceRefresh: cache!.ticksSinceRefresh + 1 };
    } else {
      tbCachedCells = enumerateCandidateCells(holder, s.players, crowdGrid, offsideLine);
      nextTbCache   = {
        holderId:          s.ballHolderId,
        ticksSinceRefresh: 1,
        cells:             tbCachedCells,
      };
    }
  } else if (s.throughBallCellsCache != null) {
    // No valid TB context (in flight, or GK has the ball) — drop the cache so
    // the next holder gets a fresh enumeration.
    nextTbCache = null;
  }
  s = { ...s, throughBallCellsCache: nextTbCache };

  // ── Compute decisions with short-term memory ───────────────────────────
  // Each player has a DecisionPath (BALL_HOLDER | TEAM_WITH_BALL | TEAM_WITHOUT_BALL).
  // When the path is unchanged and commitTicks > 0, the previous decision is reused.
  // Path changes (e.g. possession switch) always force a fresh decision immediately.
  const newDecisions: Record<number, PlayerDecision> = {};
  const updatedMemory: Record<number, import('./DecisionTree').DecisionMemory> = {};

  // Through ball in flight OR loose ball sitting? Chasers stay PINNED to
  // chase_loose_ball — without this, decide() runs fresh next tick and replaces
  // the injected chase decision with a normal off-ball / defensive intent, so
  // the players never actually sprint and the duel resolves on whoever
  // happened to be near.
  const tbInFlight   = s.pass != null && (s.pass.kind === 'through' || isAerialKind(s.pass.kind));
  const looseBallSit = s.looseBall != null;
  const chaseTarget = tbInFlight
    ? { x: s.pass!.toX, y: s.pass!.toY }
    : looseBallSit
      ? { x: s.looseBall!.x, y: s.looseBall!.y }
      : null;

  for (const p of s.players) {
    const isBallHolder = p.id === s.ballHolderId;
    const currentPath: DecisionPath = isBallHolder
      ? 'BALL_HOLDER'
      : p.team === holder.team
        ? 'TEAM_WITH_BALL'
        : 'TEAM_WITHOUT_BALL';

    const mem = p.decisionMemory ?? EMPTY_DECISION_MEMORY;

    // ── Pin chasers during through-ball flight + loose-ball wait ──────────
    // Override anything else: if this player was committed to chase, refresh
    // their commitment with the (possibly updated) target so they keep running.
    if (chaseTarget && !isBallHolder && mem.decision?.type === 'chase_loose_ball') {
      const chaseDecision: PlayerDecision = {
        type: 'chase_loose_ball',
        toX:  chaseTarget.x,
        toY:  chaseTarget.y,
      };
      newDecisions[p.id] = chaseDecision;
      updatedMemory[p.id] = {
        path:        currentPath,
        decision:    chaseDecision,
        commitTicks: COMMIT_TICKS.chase_loose_ball,
      };
      continue;
    }

    const pathChanged = mem.path !== currentPath;

    // Reuse committed decision if path is stable and ticks remain.
    // Ball holder is always re-evaluated (carries, shoots, passes change quickly).
    if (!isBallHolder && !pathChanged && mem.commitTicks > 0 && mem.decision !== null) {
      newDecisions[p.id] = mem.decision;
      updatedMemory[p.id] = { ...mem, commitTicks: mem.commitTicks - 1 };
      continue;
    }

    // Fresh decision — only the holder uses tbCachedCells (no-op for everyone else)
    const fresh = decide(
      p, holder, isBallHolder, inFlight, s.players, offsideLine, s.possessionTime,
      s.setPiece, crowdGrid, s.teamIntent,
      isBallHolder ? tbCachedCells : null,
    );
    newDecisions[p.id] = fresh;
    updatedMemory[p.id] = { path: currentPath, decision: fresh, commitTicks: COMMIT_TICKS[fresh.type] };
  }

  // Apply new memory to player objects
  const playersWithMemory = s.players.map(p => ({
    ...p,
    decisionMemory: updatedMemory[p.id] ?? p.decisionMemory,
  }));

  s = { ...s, decisions: newDecisions, players: playersWithMemory };

  if (shouldDrainStamina(s)) {
    s = {
      ...s,
      players: s.players.map(p => {
        const pl = normalizeGamePlayer(p);
        if (pl.baseStats == null) return p;
        const dec = newDecisions[pl.id];
        const action = resolveStaminaAction(pl, s.ballHolderId, holder.team, dec);
        const energy = consumeEnergy(
          pl.energy, pl.stamina, action, dt * TIME_SCALE, (pl.drainMultiplier ?? 1) * tacticDrainMult(pl.team, action),
        );
        if (energy === pl.energy) return p;
        // Continuous fatigue (spec §1 "Na partida"): recompute runtimeStats once the energy has
        // moved at least FATIGUE_RECOMPUTE_THRESHOLD since the last recompute, instead of only
        // when it crosses a multiple of 10/20/40. Skips the expensive getRuntimeLineup spread
        // otherwise.
        const { runtimeStats, fatigueBaselineEnergy } = applyContinuousFatigue(
          pl.baseStats, pl.runtimeStats, energy, pl.fatigueBaselineEnergy ?? pl.energy,
        );
        return { ...pl, energy, runtimeStats, fatigueBaselineEnergy };
      }),
    };
  }

  // Man-marking time (player instructions): the marked targets, for the marked-target statistics.
  if (s.manMarks && isLivePhase(s.matchPhase)) {
    const targetIds = [...(s.manMarks.A ?? []), ...(s.manMarks.B ?? [])].map(p => p.targetId);
    gameBus.emit('manMarkTick', { targetIds, seconds: dt * TIME_SCALE });
  }

  // ── 1. Formation movement — runs every tick, including during passes/shots ──
  {
    const markAssignments = assignMarkTargets(s.players, defendingTeam);

    const movedPlayers = s.players.map(player => {
      if (player.id === s.ballHolderId) return player;

      // GK override: sprint to intercept the shot target
      if (s.shot !== null && player.role === 'GK') {
        const shooter = s.players.find(p => p.id === s.shot!.shooterId);
        if (shooter && player.team !== shooter.team) {
          const gkTarget = { x: s.shot.toX, y: s.shot.toY };
          const dx = gkTarget.x - player.x;
          const dy = gkTarget.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.01) return { ...player, targetPosition: gkTarget };
          const recoveryMult = player.recoveryTime > 0 ? DUEL_RECOVERY_SPEED_FACTOR : 1;
          const step = Math.min(player.runtimeStats.withoutBall.pressSpeed * recoveryMult * dt, dist);
          return {
            ...player,
            x: player.x + (dx / dist) * step,
            y: player.y + (dy / dist) * step,
            targetPosition: gkTarget,
          };
        }
      }

      const decision = s.decisions[player.id];
      const phase = teamHasBall(s, player.team) ? 'attacking' : 'defending';
      const isPressing = decision?.type === 'press';
      const isOffBallRun = phase === 'attacking'
        && (decision?.type === 'support_run' || decision?.type === 'create_space');
      const isChasingLooseBall = decision?.type === 'chase_loose_ball';
      const formation = player.team === 'A' ? s.formationA : s.formationB;

      let target: { x: number; y: number };
      // Chase-loose-ball — sprint to a fixed point, no formation pull, only pitch bounds.
      if (isChasingLooseBall && (decision.type === 'chase_loose_ball')) {
        const sprintSpeed =
            player.runtimeStats.withoutBall.pressSpeed
          + player.runtimeStats.withoutBall.acceleration * THROUGH_BALL_CONFIG.SPRINT_ACCEL_BOOST
          + player.runtimeStats.withoutBall.speed        * THROUGH_BALL_CONFIG.SPRINT_TOP_BOOST;
        const targetPt = {
          x: Math.max(0, Math.min(PITCH_LENGTH, decision.toX)),
          y: Math.max(0, Math.min(PITCH_WIDTH,  decision.toY)),
        };
        const cdx = targetPt.x - player.x;
        const cdy = targetPt.y - player.y;
        const cdist = Math.hypot(cdx, cdy);
        if (cdist < 0.01) return { ...player, targetPosition: targetPt };
        const recoveryMult = player.recoveryTime > 0 ? DUEL_RECOVERY_SPEED_FACTOR : 1;
        const step = Math.min(sprintSpeed * recoveryMult * dt, cdist);
        return {
          ...player,
          x: player.x + (cdx / cdist) * step,
          y: player.y + (cdy / cdist) * step,
          targetPosition: targetPt,
        };
      }
      if (isPressing) {
        const holderDecision = s.decisions[holder.id];
        if (holderDecision?.type === 'carry') {
          // Intercept-angle press: project holder forward along their carry direction
          // instead of chasing their current position. When the presser is behind the
          // carrier, aiming at the current position means the carrier is always ahead —
          // the presser needs to cut off the path.
          //
          // Lookahead = how far the holder travels while the presser closes the distance:
          //   lookahead = distToHolder × holderSpeed / (holderSpeed + presserSpeed)
          const { dx: cdx, dy: cdy } = holderDecision;
          const holderCarrySpeed = holder.runtimeStats.withBall.carrySpeed;
          const presserSpeed = player.runtimeStats.withoutBall.pressSpeed
            + player.runtimeStats.withoutBall.acceleration * getDefenseConfig(player.team).PRESS_ACCEL_SPEED_BOOST;
          const distToHolder = Math.hypot(holder.x - player.x, holder.y - player.y);
          const lookahead = Math.min(
            distToHolder * holderCarrySpeed / (holderCarrySpeed + presserSpeed),
            PRESS_INTERCEPT_MAX_LOOKAHEAD,
          );
          target = {
            x: Math.max(0, Math.min(PITCH_LENGTH, holder.x + cdx * lookahead)),
            y: Math.max(0, Math.min(PITCH_WIDTH,  holder.y + cdy * lookahead)),
          };
        } else {
          // Holder is not carrying (about to pass, shoot, or idle) — chase directly.
          target = { x: holder.x, y: holder.y };
        }
      } else if (isOffBallRun && (decision?.type === 'support_run' || decision?.type === 'create_space')) {
        const visionNorm = Math.min(1, player.runtimeStats.withBall.carryVision / 18);
        const roleBias   = getOffBallBias(player);
        const baseLookahead = OFF_BALL_CONFIG.BASE_LOOKAHEAD
          + (OFF_BALL_CONFIG.MAX_LOOKAHEAD - OFF_BALL_CONFIG.BASE_LOOKAHEAD) * visionNorm;
        const lookahead  = baseLookahead * roleBias;
        const rawX = player.x + decision.dx * lookahead;
        const rawY = player.y + decision.dy * lookahead;
        const base = attackingAnchor(slotBasePosition(player, formation, 'attacking'), player, ballPos);
        const pushUpT    = Math.min(1, s.possessionTime / POSSESSION_PUSH_UP.BASE_SECONDS);
        const pushUpBias = PUSH_UP_ROLE_BIAS[player.role] ?? 0;
        const pushedBaseX = base.x + player.attackDir * pushUpT * POSSESSION_PUSH_UP.MAX_YARDS * pushUpBias;
        const pull = 1 - OFF_BALL_CONFIG.FORMATION_PULL;
        let tx = pushedBaseX + (rawX - pushedBaseX) * pull;
        const ty = base.y + (rawY - base.y) * pull;

        // Clamp to stay onside
        if (offsideLine !== null) {
          const fwd   = player.attackDir;
          const safeX = offsideLine - fwd * ATTACK_CONFIG.OFFSIDE_MARGIN;
          if ((tx - safeX) * fwd > 0) {
            tx = safeX;
          }
        }

        // Only clamp to pitch boundary — bounds discipline is handled by getRoleFitPenalty
        // in scoring, so no hard wall here.
        target = {
          x: Math.max(0, Math.min(PITCH_LENGTH, tx)),
          y: Math.max(0, Math.min(PITCH_WIDTH,  ty)),
        };
      } else {
        const committedMarkId = decision?.type === 'track_mark' ? decision.markTargetId : undefined;
        const markTargetId = committedMarkId ?? markAssignments.get(player.id);
        target = computeTargetPosition(player, phase, ballPos, s.players, formation, s.ballHolderId, decision?.type, offsideLine, markTargetId, s.possessionTime);
      }

      // Man-marker tracking his target (player instructions): no separation from teammates, and he
      // gets the press acceleration burst to stay on his man.
      const tightMarking = phase === 'defending' && player.manMarkTargetId !== undefined && decision?.type === 'track_mark';

      // Keep off-ball targets off the touchline itself (#37): wide bounds (LB yRange 50) and
      // off-ball runs past the line clamp to y = 0 / 74, stacking teammates on the line.
      if (player.role !== 'GK' && !isPressing) {
        let ty = Math.max(OFF_BALL_TOUCHLINE_MARGIN, Math.min(PITCH_WIDTH - OFF_BALL_TOUCHLINE_MARGIN, target.y));
        let tx = target.x;
        // Light separation: don't settle on top of a teammate (they stacked on the line). A man-marker
        // tracking his target is exempt: he must stay on his man even when a zonal defender is close.
        for (const mate of tightMarking ? [] : s.players) {
          if (mate.id === player.id || mate.team !== player.team || mate.id === s.ballHolderId) continue;
          const sx = tx - mate.x;
          const sy = ty - mate.y;
          const d  = Math.hypot(sx, sy);
          if (d >= OFF_BALL_MIN_SEPARATION) continue;
          const push = OFF_BALL_MIN_SEPARATION - d;
          if (d > 0.01) { tx += (sx / d) * push; ty += (sy / d) * push; }
          else { ty += ty < PITCH_WIDTH / 2 ? push : -push; }
        }
        target = {
          x: Math.max(0, Math.min(PITCH_LENGTH, tx)),
          y: Math.max(OFF_BALL_TOUCHLINE_MARGIN, Math.min(PITCH_WIDTH - OFF_BALL_TOUCHLINE_MARGIN, ty)),
        };
      }

      const dx   = target.x - player.x;
      const dy   = target.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) return { ...player, targetPosition: target };

      const baseSpeed    = player.runtimeStats.withoutBall.pressSpeed;
      // Off-ball runners within 15 yards of a holder who just received get an
      // acceleration burst to model supporting players reading the reception.
      const holderJustReceived = holder.justReceivedTicks > 0
        && isOffBallRun
        && (holder.x - player.x) ** 2 + (holder.y - player.y) ** 2 < 225; // 15*15
      const accelBurst   = isPressing || tightMarking
        ? player.runtimeStats.withoutBall.acceleration * getDefenseConfig(player.team).PRESS_ACCEL_SPEED_BOOST
        : holderJustReceived
          ? player.runtimeStats.withoutBall.acceleration * CARRY_ACCEL_SPEED_BOOST
          : 0;
      const recoveryMult = player.recoveryTime > 0 ? DUEL_RECOVERY_SPEED_FACTOR : 1;
      const step = Math.min((baseSpeed + accelBurst) * recoveryMult * dt, dist);
      return {
        ...player,
        x: player.x + (dx / dist) * step,
        y: player.y + (dy / dist) * step,
        targetPosition: target,
      };
    });

    s = { ...s, players: movedPlayers };
  }

  // ── Shot in flight ─────────────────────────────────────────────────────────
  if (s.shot) {
    const newT = s.shot.t + dt * SHOT_SPEED;

    if (newT >= 1) {
      const { shooterId } = s.shot;
      const shooter     = s.players.find(p => p.id === shooterId)!;
      const defendingGK = s.players.find(p => p.team !== shooter.team && p.role === 'GK') ?? null;

      const { isGoal, inPosts, goalChance } = resolveShot(shooter, defendingGK, s.shot);
      gameBus.emit('shotResolved', { player: shooter.id, xg: s.shot.xg, goalChance, isGoal, inPosts });

      if (inPosts && isGoal) {
        const newScore = { ...s.score, [shooter.team]: s.score[shooter.team] + 1 };
        const assistId = s.lastPasserId !== null && s.lastPasserId !== shooter.id ? s.lastPasserId : undefined;
        const setPieceKind = s.shot.freeKick ? 'direct_free_kick' : setPieceGoalOf(s, shooter.team);
        gameBus.emit('goalScored', {
          team: shooter.team, score: newScore, scorerId: shooter.id, assistId, header: s.shot.header === true,
          ...(setPieceKind ? { setPiece: setPieceKind } : {}),
        });
        const concedingTeam = shooter.team === 'A' ? 'B' : 'A';
        return {
          state: resetToKickoff({ ...s, score: newScore }, concedingTeam),
          passCompleted: false, tackled: false, goalScored: shooter.team,
        };
      } else if (!inPosts && !defendingGK) {
        // No GK present and off target — give ball back to shooter (same team — no intent change)
        return {
          state: { ...s, shot: null, ballHolderId: shooter.id },
          passCompleted: false, tackled: false, goalScored: null,
        };
      } else {
        // Behind for a corner (`set-pieces-play.md`): a save parried wide, or an off-target shot
        // deflected by a defender close to the shooter.
        let cornerSource: CornerSource | null = null;
        if (inPosts && defendingGK) {
          if (Math.random() < SET_PIECE_CONFIG.SAVE_CORNER_CHANCE) cornerSource = 'save';
        } else if (!inPosts) {
          const deflector = s.players.some(p => p.team !== shooter.team && p.role !== 'GK'
            && Math.hypot(p.x - s.shot!.fromX, p.y - s.shot!.fromY) <= SET_PIECE_CONFIG.SHOT_DEFLECT_RADIUS);
          if (deflector && Math.random() < SET_PIECE_CONFIG.OFF_TARGET_CORNER_CHANCE) cornerSource = 'deflection';
        }
        if (cornerSource) {
          const goalLineX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
          const exitX = goalLineX === 0 ? -1 : PITCH_LENGTH + 1;
          const saved = defendingGK && inPosts ? { ...s, players: applyStaminaCost(s.players, defendingGK.id, 'gkSave') } : s;
          return resolveOOBSetPiece({ ...saved, shot: null }, 'corner', shooter.team, exitX, s.shot.toY,
            defendingGK?.id ?? shooter.id, 'clearance', cornerSource);
        }
        // GK save or shot off target — apply goal kick positioning for GK's team
        const gkOwner = defendingGK ?? shooter; // if no GK, shooter's team acts as "keeper"
        const gkFormation = gkOwner.team === 'A' ? s.formationA : s.formationB;
        const goalKickLayout = resolveFormationSetPieces(gkFormation).goalKick;
        let gkPlayers = s.players;
        if (defendingGK && inPosts && !isGoal) {
          gkPlayers = applyStaminaCost(gkPlayers, defendingGK.id, 'gkSave');
        }
        if (goalKickLayout && defendingGK) gkPlayers = applySetPieceToTeam(gkPlayers, defendingGK.team, goalKickLayout);
        const newHolder = defendingGK ?? shooter;
        const prevHolderId = s.ballHolderId;
        return {
          state: onPossessionTransfer({
            ...s,
            shot: null,
            ballHolderId: newHolder.id,
            possessionTime: 0,
            lastPasserId: null,
            players: gkPlayers,
            setPiece: { type: 'goal_kick', takerId: newHolder.id, countdown: 1 },
          }, prevHolderId),
          passCompleted: false, tackled: false, goalScored: null,
        };
      }
    }

    return {
      state: { ...s, shot: { ...s.shot, t: newT } },
      passCompleted: false, tackled: false, goalScored: null,
    };
  }

  // ── Loose-ball drift — ball trickles in space until someone arrives ─────
  // Replaces holder dispatch entirely while the through ball is uncollected.
  // Players' chase decisions are pinned by the decision loop above with the
  // current loose-ball position, so chasers track the drifting ball.
  if (s.looseBall) {
    return handleLooseBall(s, dt);
  }

  // Only evaluate press/tackle while the ball is held (not in flight)
  if (!s.pass) {
    // ── 2. Tackle check ───────────────────────────────────────────────────

    if (s.tackleCooldown === 0) {
      const updatedHolder = s.players.find(p => p.id === s.ballHolderId)!;

      let tackler: GamePlayer | null = null;
      let closestDist = Infinity;

      // When the carrier is actively dribbling at a specific defender, skip that
      // defender in the tackle check — resolveDribble() owns that 1v1 (attacker
      // initiative). Other nearby defenders can still tackle normally.
      const holderDec = s.decisions[s.ballHolderId];
      const dribbleTargetId = holderDec?.type === 'dribble' ? holderDec.targetId : null;

      for (const player of s.players) {
        if (player.team === updatedHolder.team) continue;
        if (player.id === dribbleTargetId) continue;
        if (isPlayerInRecovery(player)) continue; // still recovering from a duel — cannot tackle
        const d = distSq(player, updatedHolder);
        const dec = s.decisions[player.id]?.type;
        // A pressing defender that has closed to tackle range can tackle even while
        // their press decision is still committed (commit skips decide(), so 'tackle'
        // would never appear in decisions[] until the commit expires).
        const canTackle = dec === 'tackle' || (dec === 'press' && d <= TACKLE_RANGE * TACKLE_RANGE);
        if (canTackle && d < closestDist) {
          tackler = player;
          closestDist = d;
        }
      }

      if (tackler !== null) {
        s = {
          ...s,
          tackleCooldown: TACKLE_COOLDOWN,
          players: applyStaminaCost(s.players, tackler.id, 'tackle'),
        };
        const tacklerNow = s.players.find(p => p.id === tackler!.id)!;

        // Pressing load: nearby defenders (not the tackler) create crowd pressure.
        // Active pressers count fully; defenders holding shape/marking count at half
        // weight — they're close but not actively collapsing on the carrier.
        const PRESS_LOAD_RADIUS = 8; // yards — wide enough to capture compact blocks
        let pressingLoad = 0;
        for (const p of s.players) {
          if (p.team === updatedHolder.team) continue;
          if (p.id === tackler.id) continue;
          if (isPlayerInRecovery(p)) continue;
          const d = Math.sqrt((p.x - updatedHolder.x) ** 2 + (p.y - updatedHolder.y) ** 2);
          if (d >= PRESS_LOAD_RADIUS) continue;
          const decType = s.decisions[p.id]?.type;
          const weight = decType === 'press' ? 1.0 : 0.5; // shape/mark defenders count at half
          pressingLoad += weight * (1 - d / PRESS_LOAD_RADIUS); // linear falloff
        }
        pressingLoad = Math.min(1, pressingLoad); // cap at 1

        const { success, chance } = resolveTackle(tacklerNow, updatedHolder, pressingLoad);
        // Foul check (`.claude/rules/game-engine/fouls.md`): a foul overturns the challenge — the
        // holder's team gets a free kick / penalty even when the tackle itself won the ball.
        const fouled = maybeFoul(s, tacklerNow, updatedHolder, 'tackle', success);
        gameBus.emit('tackle', { player: tackler.id, targetId: updatedHolder.id, success: success && fouled === null, chance });
        if (fouled) {
          s = rollContactInjuries(fouled, [tackler.id, updatedHolder.id], matchMinute(fouled));
          return { state: s, passCompleted: false, tackled: false, goalScored: null };
        }
        if (success) {
          // Won near the byline, wide of the posts: the ball goes behind for a corner sometimes.
          const hGoalX = updatedHolder.attackDir === 1 ? PITCH_LENGTH : 0;
          if (Math.abs(hGoalX - updatedHolder.x) <= SET_PIECE_CONFIG.TACKLE_CORNER_DEPTH
            && (updatedHolder.y < GOAL_Y_MIN || updatedHolder.y > GOAL_Y_MAX)
            && Math.random() < SET_PIECE_CONFIG.TACKLE_CORNER_CHANCE) {
            const exitX = hGoalX === 0 ? -1 : PITCH_LENGTH + 1;
            const r = resolveOOBSetPiece(s, 'corner', updatedHolder.team, exitX, updatedHolder.y, tackler.id, 'clearance', 'tackle');
            return { ...r, state: rollContactInjuries(r.state, [tackler.id, updatedHolder.id], matchMinute(r.state)), tackled: true };
          }
          const prevHolderId = s.ballHolderId;
          s = onPossessionTransfer({
            ...s,
            ballHolderId: tackler.id,
            possessionTime: 0,
            lastPasserId: null,
            players: s.players.map(p => {
              if (p.id === tackler!.id)      return { ...p, recoveryTime: DUEL_TACKLE_WIN_RECOVERY };
              if (p.id === updatedHolder.id) return { ...p, recoveryTime: DUEL_TACKLE_LOSS_RECOVERY };
              return p;
            }),
          }, prevHolderId);
          s = rollContactInjuries(s, [tackler.id, updatedHolder.id], matchMinute(s));
          return { state: s, passCompleted: false, tackled: true, goalScored: null };
        } else {
          s = {
            ...s,
            players: s.players.map(p =>
              p.id === tackler!.id ? { ...p, recoveryTime: DUEL_TACKLE_FAILED_RECOVERY } : p,
            ),
          };
          s = rollContactInjuries(s, [tackler.id, updatedHolder.id], matchMinute(s));
        }
      }
    }
  }

  // ── 3. Execute holder decision (carry / shoot / pass) ────────────────────
  if (!s.pass) {
    const holderDecision = s.decisions[s.ballHolderId];

    if (holderDecision?.type === 'shoot') {
      return { state: startShot(s), passCompleted: false, tackled: false, goalScored: null };
    }

    // Through balls fire IMMEDIATELY — they're a release decision that doesn't
    // benefit from the post-reception burst (the burst exists to create space
    // before deciding what to play; TB has already decided to play into space).
    if (holderDecision?.type === 'through_ball') {
      return { state: startThroughBall(s, holderDecision), passCompleted: false, tackled: false, goalScored: null };
    }

    // High balls fire immediately too (`aerial.md`).
    if (holderDecision?.type === 'cross') {
      return {
        state: startAerialBall(s, 'cross', { x: holderDecision.toX, y: holderDecision.toY }, holderDecision.intendedRunnerId),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }
    if (holderDecision?.type === 'long_ball') {
      return {
        state: startAerialBall(s, 'long_ball', { x: holderDecision.toX, y: holderDecision.toY }, holderDecision.targetId),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }

    // ── Post-reception burst — "receive and turn" ─────────────────────────────
    // When a player just received a pass and has an opponent within 6 yards,
    // burst away from them to create the extra yard of space before deciding.
    {
      const carrier0 = s.players.find(p => p.id === s.ballHolderId)!;
      if (carrier0.justReceivedTicks > 0) {
        let nearestOpp: GamePlayer | null = null;
        let nearestDistSq = Infinity;
        for (const p of s.players) {
          if (p.team === carrier0.team) continue;
          const dSq = (p.x - carrier0.x) ** 2 + (p.y - carrier0.y) ** 2;
          if (dSq < nearestDistSq) { nearestDistSq = dSq; nearestOpp = p; }
        }

        if (nearestOpp && nearestDistSq < 36) { // 6*6 yards
          const odx = carrier0.x - nearestOpp.x;
          const ody = carrier0.y - nearestOpp.y;
          const olen = Math.sqrt(odx * odx + ody * ody);
          if (olen >= 0.01) {
            const burstSpeed = carrier0.runtimeStats.withBall.carrySpeed
              * (0.4 + carrier0.runtimeStats.withBall.dribbling * 0.6);
            const step = burstSpeed * dt;
            const newX = Math.max(0, Math.min(PITCH_LENGTH, carrier0.x + (odx / olen) * step));
            const newY = Math.max(0, Math.min(PITCH_WIDTH,  carrier0.y + (ody / olen) * step));
            const updated = { ...carrier0, x: newX, y: newY, targetPosition: { x: newX, y: newY } };
            s = { ...s, players: s.players.map(p => p.id === updated.id ? updated : p) };
            return { state: s, passCompleted: false, tackled: false, goalScored: null };
          }
        }
      }
    }

    if (holderDecision?.type === 'carry') {
      const carrier = s.players.find(p => p.id === s.ballHolderId)!;
      const wb      = carrier.runtimeStats.withBall;

      const isUnderPressure = s.players.some(p =>
        p.team !== carrier.team &&
        (s.decisions[p.id]?.type === 'press' || s.decisions[p.id]?.type === 'tackle'),
      );
      const accelBurst   = isUnderPressure ? wb.acceleration * CARRY_ACCEL_SPEED_BOOST : 0;
      const recoveryMult = carrier.recoveryTime > 0 ? DUEL_RECOVERY_SPEED_FACTOR : 1;
      const step = (wb.carrySpeed + accelBurst) * recoveryMult * dt;
      // Role bounds don't restrict the ball carrier — only the pitch boundary does.
      // Off-ball positioning is where bounds apply.
      const newX = Math.max(0, Math.min(PITCH_LENGTH, carrier.x + holderDecision.dx * step));
      const newY = Math.max(0, Math.min(PITCH_WIDTH,  carrier.y + holderDecision.dy * step));

      const updatedCarrier = { ...carrier, x: newX, y: newY, targetPosition: { x: newX, y: newY } };
      s = { ...s, players: s.players.map(p => p.id === updatedCarrier.id ? updatedCarrier : p) };
      return { state: s, passCompleted: false, tackled: false, goalScored: null };
    }

    // ── Dribble ───────────────────────────────────────────────────────────────
    if (holderDecision?.type === 'dribble') {
      const attacker = s.players.find(p => p.id === s.ballHolderId)!;
      const defender = s.players.find(p => p.id === holderDecision.targetId) ?? null;

      if (defender) {
        const ddx  = defender.x - attacker.x;
        const ddy  = defender.y - attacker.y;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);

        if (dist > DRIBBLE_RESOLUTION_RANGE) {
          // Approach phase: drive toward the defender with ball at feet
          const recoveryMult = attacker.recoveryTime > 0 ? DUEL_RECOVERY_SPEED_FACTOR : 1;
          const step = Math.min(attacker.runtimeStats.withBall.carrySpeed * recoveryMult * dt, dist);
          const newX = Math.max(0, Math.min(PITCH_LENGTH, attacker.x + (ddx / dist) * step));
          const newY = Math.max(0, Math.min(PITCH_WIDTH,  attacker.y + (ddy / dist) * step));
          const updatedAttacker = { ...attacker, x: newX, y: newY, targetPosition: { x: defender.x, y: defender.y } };
          s = { ...s, players: s.players.map(p => p.id === updatedAttacker.id ? updatedAttacker : p) };
          return { state: s, passCompleted: false, tackled: false, goalScored: null };
        }

        // Resolution phase: close enough — resolve the 1v1.
        // Compute crowd pressure from nearby defenders (not the dribble target).
        const DRIBBLE_CROWD_RADIUS = 8; // yards — same as tackle pressing load
        let dribblePressLoad = 0;
        for (const p of s.players) {
          if (p.team === attacker.team) continue;
          if (p.id === defender.id) continue;
          if (isPlayerInRecovery(p)) continue;
          const d = Math.sqrt((p.x - attacker.x) ** 2 + (p.y - attacker.y) ** 2);
          if (d >= DRIBBLE_CROWD_RADIUS) continue;
          const decType = s.decisions[p.id]?.type;
          const weight = decType === 'press' ? 1.0 : 0.5;
          dribblePressLoad += weight * (1 - d / DRIBBLE_CROWD_RADIUS);
        }
        dribblePressLoad = Math.min(1, dribblePressLoad);

        const { attackerWins, winProb } = resolveDribble(attacker, defender, dribblePressLoad);
        // Foul check (`.claude/rules/game-engine/fouls.md`): the defender may bring the dribbler
        // down — beaten (a cynical stop) or winning the ball unfairly; either way the attacker's
        // team gets the restart.
        const fouledDribble = maybeFoul(s, defender, attacker, 'dribble', !attackerWins);
        gameBus.emit('dribble', { player: attacker.id, targetId: defender.id, success: attackerWins || fouledDribble !== null, chance: winProb });
        if (fouledDribble) {
          return { state: fouledDribble, passCompleted: false, tackled: false, goalScored: null };
        }
        if (attackerWins) {
          // Attacker beats the defender — defender frozen, attacker keeps the ball
          s = {
            ...s,
            players: s.players.map(p => {
              if (p.id === defender.id) return { ...p, recoveryTime: DUEL_DRIBBLE_LOSS_RECOVERY };
              if (p.id === attacker.id) return { ...p, recoveryTime: DUEL_DRIBBLE_WIN_RECOVERY };
              return p;
            }),
          };
          return { state: s, passCompleted: false, tackled: false, goalScored: null };
        } else {
          // Defender wins — attacker stumbles and loses possession
          const prevHolderId = s.ballHolderId;
          s = onPossessionTransfer({
            ...s,
            ballHolderId: defender.id,
            possessionTime: 0,
            players: s.players.map(p =>
              p.id === attacker.id ? { ...p, recoveryTime: DUEL_DRIBBLE_LOSS_RECOVERY } : p,
            ),
          }, prevHolderId);
          return { state: s, passCompleted: false, tackled: true, goalScored: null };
        }
      }
    }

    return { state: startPass(s), passCompleted: false, tackled: false, goalScored: null };
  }

  // ── Pass in flight ─────────────────────────────────────────────────────────
  // (Control flow guarantees s.pass is non-null here — capture it once for TS)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const activePass = s.pass!;

  // Speed scales with distance so longer passes take proportionally more time.
  const PASS_YARDS_PER_SEC = 28;
  const aerialPass = isAerialKind(activePass.kind);
  const yardsPerSec = aerialPass ? AERIAL_CONFIG.AERIAL_YARDS_PER_SEC : PASS_YARDS_PER_SEC;
  const distanceSpeed = activePass.distance > 0
    ? yardsPerSec / activePass.distance
    : passSpeed;

  // Interception check — defender geometrically between ball and target gets a chance
  // scaled by how close they are to the passing lane (perpDist) and pass speed.
  // For through balls the "target" is the landing position, not a player.
  // High balls (cross / long ball) fly over everyone — contested only where they land.
  if (s.tackleCooldown === 0 && !aerialPass) {
    const ballPos      = getBallPos(s);
    const targetPos    = activePass.kind === 'through' || activePass.toId === null
      ? { x: activePass.toX, y: activePass.toY }
      : (s.players.find(p => p.id === activePass.toId) ?? { x: activePass.toX, y: activePass.toY });
    for (const player of s.players) {
      if (player.team === holder.team) continue;
      // Pre-filter: must be within the maximum possible corridor of the ball
      const d = Math.sqrt((player.x - ballPos.x) ** 2 + (player.y - ballPos.y) ** 2);
      if (d > MAX_INTERCEPTION_CORRIDOR) continue;

      const corridor = playerInterceptionCorridor(player);
      const perpDist = getInterceptionPerpDist(player, ballPos, targetPos, corridor);
      if (perpDist === null) continue; // outside this player's corridor or not on the pass line

      s = {
        ...s,
        tackleCooldown: TACKLE_COOLDOWN,
        players: applyStaminaCost(s.players, player.id, 'interception'),
      };
      const interceptorNow = s.players.find(p => p.id === player.id)!;
      const passer = s.players.find(p => p.id === activePass.fromId);
      const passerSkill = passer?.runtimeStats.withBall.passingSkill ?? 0;
      const { success, chance } = resolveInterception(interceptorNow, perpDist, corridor, passerSkill);
      gameBus.emit('interception', { player: player.id, success, chance });
      if (success) {
        if (activePass.kind === 'through') {
          gameBus.emit('throughBallLostInFlight', { player: activePass.fromId, interceptorId: player.id });
          debugLog('throughBall', `Through ball intercepted by ${interceptorNow.name}`, {
            playerId: player.id, data: { from: activePass.fromId },
          });
        } else {
          gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId ?? activePass.fromId });
        }
        const prevHolderId = s.ballHolderId;
        return {
          state: onPossessionTransfer(
            { ...s, pass: null, ballHolderId: player.id, possessionTime: 0, lastPasserId: null },
            prevHolderId,
          ),
          passCompleted: false, tackled: true, goalScored: null,
        };
      }
      break; // one attempt per cooldown window
    }
  }

  const newT = activePass.t + dt * distanceSpeed;
  if (newT >= 1 && aerialPass) {
    return resolveAerialLanding(s);
  }
  if (newT >= 1) {
    // ── Through-ball landing — convert pass to LooseBallState ────────────────
    // The ball SITS at the landing point. Players' chase decisions are pinned by
    // the decision loop, so they keep sprinting. handleLooseBall (called at the
    // top of subsequent ticks) resolves possession when someone is within touch.
    if (activePass.kind === 'through') {
      const landingX = activePass.toX;
      const landingY = activePass.toY;
      const passer   = s.players.find(p => p.id === activePass.fromId);
      const passerTeam = passer?.team ?? 'A';

      // Residual velocity: same direction the pass was travelling, scaled to a
      // slow trickle. The ball decelerates each tick (LOOSE_BALL_DECELERATION)
      // until it comes to rest — never frozen instantly at the landing point.
      const dx = landingX - (passer?.x ?? landingX);
      const dy = landingY - (passer?.y ?? landingY);
      const len = Math.hypot(dx, dy);
      const initSpeed = THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED;
      const vx = len > 0.001 ? (dx / len) * initSpeed : 0;
      const vy = len > 0.001 ? (dy / len) * initSpeed : 0;

      gameBus.emit('looseBallStarted', {
        x: landingX,
        y: landingY,
        fromPasserId: activePass.fromId,
      });
      debugLog('throughBall', `Through ball lands → loose ball at (${landingX.toFixed(1)}, ${landingY.toFixed(1)})`, {
        playerId: activePass.fromId,
      });

      return {
        state: {
          ...s,
          pass: null,
          looseBall: {
            x: landingX,
            y: landingY,
            vx, vy,
            startTime: s.matchTime,
            fromPasserId: activePass.fromId,
            fromTeamLastTouch: passerTeam,
            intendedRunnerId: activePass.intendedRunnerId,
            receiverOffside: activePass.receiverOffside,
          },
        },
        passCompleted: false, tackled: false, goalScored: null,
      };
    }

    // ── Regular pass landing ─────────────────────────────────────────────────
    const receiver = s.players.find(p => p.id === activePass.toId!)!;

    // ── Offside enforcement ─────────────────────────────────────────────────
    // The offside position was determined when the pass was played (at t=0).
    // Enforce only at the moment the receiver would touch the ball (t=1).
    if (activePass.receiverOffside) {
      gameBus.emit('offsideCalled', { team: receiver.team, receiverId: receiver.id });
      gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId! });
      // Award possession to the defending team's player nearest to the receiver
      const defenders = s.players.filter(p => p.team !== receiver.team);
      const nearestDefender = defenders.reduce((best, p) => {
        const d = (p.x - receiver.x) ** 2 + (p.y - receiver.y) ** 2;
        const bd = (best.x - receiver.x) ** 2 + (best.y - receiver.y) ** 2;
        return d < bd ? p : best;
      });
      // Apply offside_fk layout for the restarting team; fall back to no reposition
      // when a formation has no layout defined. The taker (nearestDefender) will
      // be spotted at the offside location — override their x/y after the layout.
      const defTeamFormation = nearestDefender.team === 'A' ? s.formationA : s.formationB;
      const offsideLayout = resolveFormationSetPieces(defTeamFormation).offside_fk;
      let players = s.players;
      if (offsideLayout) players = applySetPieceToTeam(players, nearestDefender.team, offsideLayout);
      // Move the taker to where offside was called (ball is spotted at the receiver's position)
      players = players.map(p =>
        p.id === nearestDefender.id
          ? { ...p, x: receiver.x, y: receiver.y, targetPosition: { x: receiver.x, y: receiver.y } }
          : p,
      );
      const prevHolderId = s.ballHolderId;
      return {
        state: onPossessionTransfer({
          ...s,
          pass: null,
          ballHolderId: nearestDefender.id,
          possessionTime: 0,
          lastPasserId: null,
          players,
          tackleCooldown: TACKLE_COOLDOWN,
          setPiece: {
            type: 'offside_fk',
            takerId: nearestDefender.id,
            countdown: 2,
            position: { x: receiver.x, y: receiver.y },
          },
        }, prevHolderId),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }

    gameBus.emit('passCompleted', { player: activePass.fromId, toId: activePass.toId! });
    // Pass complete is same-team, so onPossessionTransfer would no-op — but the
    // new receiver may now be in a switch_play position (wide, far flank open),
    // so re-evaluate intents for both teams on reception. The roll is seeded
    // per-possession, so this can only confirm/clear switch_play, not flicker it.
    return {
      state: reevaluateTeamIntents({
        ...s,
        ballHolderId: activePass.toId!,
        pass: null,
        lastPasserId: activePass.fromId,
        players: s.players.map(p =>
          p.id === activePass.toId ? { ...p, justReceivedTicks: 4 } : p,
        ),
      }),
      passCompleted: true, tackled: false, goalScored: null,
    };
  }

  return {
    state: { ...s, pass: { ...activePass, t: newT } },
    passCompleted: false, tackled: false, goalScored: null,
  };
}

// ── Ball position ─────────────────────────────────────────────────────────────

/** Current ball position in yards. */
export function getBallPos(state: GameState): { x: number; y: number } {
  if (state.shot) {
    const { fromX, fromY, toX, toY, t } = state.shot;
    const eased = t * t * (3 - 2 * t);
    return {
      x: fromX + (toX - fromX) * eased,
      y: fromY + (toY - fromY) * eased,
    };
  }
  // Loose ball — ball is sitting in space at the through-ball landing point.
  if (state.looseBall) {
    return { x: state.looseBall.x, y: state.looseBall.y };
  }
  if (!state.pass) {
    const holder = state.players.find(p => p.id === state.ballHolderId);
    return holder ? { x: holder.x, y: holder.y } : { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 };
  }
  const from  = state.players.find(p => p.id === state.pass!.fromId)!;
  const t     = state.pass.t;
  const eased = t * t * (3 - 2 * t);
  // Through balls track to a position; regular passes track to the receiver's
  // current position (so the ball follows a moving runner).
  const toX = state.pass.kind === 'through' || state.pass.toId === null
    ? state.pass.toX
    : (state.players.find(p => p.id === state.pass!.toId)?.x ?? state.pass.toX);
  const toY = state.pass.kind === 'through' || state.pass.toId === null
    ? state.pass.toY
    : (state.players.find(p => p.id === state.pass!.toId)?.y ?? state.pass.toY);
  return {
    x: from.x + (toX - from.x) * eased,
    y: from.y + (toY - from.y) * eased,
  };
}
