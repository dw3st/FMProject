import { INSTR, playerDelta, setPossessionClock, resetInstructionState, stepAiInstructions } from '@/GameEngine/Configs/InstructionConfig';
import { attributeReduce } from '@/Domain/achievements/managerAttributes';
import { reorganizedSlots } from "@/Domain/formation/reorganize";
import type { GamePlayer, GameState, Formation, MovementBounds, PlayerRole, TeamId, TeamIntent, MatchPhase, KnockoutDecider, InjuryRecord, CardRecord, SetPiece, PassState, LooseBallSource, SetPieceGoalKind, SetPieceRoutine, ManMarkPair, InjuryVacancy, PenaltyOutcome, InterceptRun, ShotState, ShotPhysicsState, ShotBlockRun, ShotTechnique } from '@/GameEngine/types';
import type { SlotInstruction } from '@/types/tacticsTypes';
import { effectiveInstruction, resolveSlotTuning, ROLE_VARIANTS } from '@/GameEngine/Configs/RoleVariantConfig';
import { isAerialKind } from '@/GameEngine/types';
import { AERIAL_CONFIG } from '@/GameEngine/Configs/AerialConfig';
import { LONG_SHOT_DISTANCE, weatherEffectOf, type WeatherEffect } from '@/GameEngine/Configs/WeatherConfig';
import { aerialAbility, aerialDuelScore, headingOf, isInSmallBox, keeperComesFor } from '@/GameEngine/Domain/Aerial';
import { aerialCatchers, contestantsOf, drawCrossZone, findAerialContact, headerLine, meetPoint, type AerialCatcher, type AerialContactHit } from '@/GameEngine/Domain/AerialContact';
import { FM_AERIAL } from '@/GameEngine/Configs/FmAerialConfig';
import { RESTART_DEAD_S, SET_PIECE_CONFIG } from '@/GameEngine/Configs/SetPieceConfig';
import { FM_SET_PIECES, SP_YD_PER_M } from '@/GameEngine/Configs/FmSetPieceConfig';
import {
  drawFmCornerTarget, drawGoalKickPlan, goalKickBackSpots, inBoxCount, outsideBox, throwInPool, throwInPositions,
} from '@/GameEngine/Domain/SetPieces';
import type { SetPieceDelivery } from '@/GameEngine/types';
import {
  attackingBoxPositions, pickRoutine, defendingBoxPositions, directFreeKickXG, distToGoalCentre, isDirectFreeKick, keepDistanceFromBall,
  pickSetPieceTaker, wallBlockChance, wallSize, wallSpots, type SetPieceDuty,
} from '@/GameEngine/Domain/SetPieces';
import type { CornerSource } from '@/GameEngine/Infrastructure/EventBus';
import { kickOrder, resolvePenaltyShootout, penaltyChance, shootoutDecided, type PenaltySide } from '@/GameEngine/Infrastructure/PenaltyShootout';
import { holderPressure } from '@/GameEngine/Domain/Pressure';
import { takeHolderMind } from '@/GameEngine/Domain/HolderMind';
import { matchMentalOf } from '@/GameEngine/Configs/MentalMatchConfig';
import { argmaxAndMargin, setDecisionCapture, situationBucket, takeCapture, type CapturedDecision } from '@/GameEngine/Domain/DecisionTelemetry';
import { decide, COMMIT_TICKS, EMPTY_DECISION_MEMORY, isPlayerInRecovery } from '@/GameEngine/Domain/DecisionTree';
import { outfieldNearBall } from '@/GameEngine/Domain/BallCluster';
import type { PlayerDecision, DecisionPath, HolderStep } from '@/GameEngine/Domain/DecisionTree';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { roleEngine, type RoleEngineTuning } from '@/GameEngine/Domain/roleEngineData';
import { resolveBasePosition, slotBasePosition } from '@/GameEngine/FormationSlots';
import { attackingAnchor } from '@/GameEngine/Domain/AttackingPositioning';
import { computeTargetPosition } from '@/GameEngine/Domain/Positioning';
import { assignMarkTargets, resetDefensiveIntentCache, stayHomeTarget } from '@/GameEngine/Domain/DefensivePositioning';
import { resetOffBallIntentCache } from '@/GameEngine/Domain/OffBallMovement';
import { advanceActionClock, resetActionHold } from '@/GameEngine/Domain/ActionHold';
import { assignZoneCover, passShadowPoint, pressStateOf, setShapeFormations, setZoneCover, zonesOf, type ShapeZone } from '@/GameEngine/Domain/TeamShape';
import { registerEngineMemory } from '@/GameEngine/Support/EngineMemory';
import { resetShoulderRuns, shoulderRunGoing } from '@/GameEngine/Domain/ShoulderRuns';
import { TEAM_SHAPE } from '@/GameEngine/Configs/ShapeConfig';
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
import { PASS_CONFIG, PASS_YARDS_PER_SEC } from '@/GameEngine/Configs/PassConfig';
import { predictBallPoint } from '@/GameEngine/Domain/BallPrediction';
import { advanceLooseBall, advancePassBall, ballEnv, ballWithinReach, passKey, shotKey, syncBall, type PassCatcher } from '@/GameEngine/Domain/BallSync';
import { buildAerialLaunch, buildGroundLaunch, loftVzYd, passTypeOf, vzForPeak, weightedSpeed } from '@/GameEngine/Domain/PassPhysics';
import { PASS_PHYSICS, YD_PER_M_PASS } from '@/GameEngine/Configs/PassPhysicsConfig';
import { BALL_PHYSICS } from '@/GameEngine/Configs/BallPhysicsConfig';
import { predictPath, reachHeight, stepFree, type Ball3D as Ball3DState, type BallEnv as BallEnvState } from '@/GameEngine/Domain/Ball3D';
import { SHOT_PHYSICS } from '@/GameEngine/Configs/ShotPhysicsConfig';
import {
  aimPoint, applyShotError, blockChances, blockReach as shotBlockReach, chooseTechnique, classifyCrossing, dipLaunch, directLaunch,
  keeperDiveSpeed, keeperHandReach, keeperReaction, lineCrossing, onFrame, saveChances, shotErrorFactor, shotSpeedMs,
  YD_PER_M as SHOT_YD_PER_M, type KeeperSkill as ShotKeeperSkill,
} from '@/GameEngine/Domain/ShotPhysics';
import { interceptPoint, interceptReachOf, resolveTouch, touchChances, type PathPoint } from '@/GameEngine/Domain/PhysicalInterception';
import { INTERCEPT } from '@/GameEngine/Configs/InterceptConfig';
import {
  THROUGH_BALL_CONFIG,
  CHASE_LOOSE_BALL_WEIGHT_ATTACK,
  CHASE_LOOSE_BALL_WEIGHT_DEFEND,
} from '@/GameEngine/Configs/ThroughBallConfig';
import { isInGoalScoreArea } from '@/GameEngine/Domain/pitch';
import { ballMeetsKeeper, defenderCovers, saveOutcomeChances, shotStoppingSkill, depthFrom, keeperReachesShot, isWideClaimZone, fmKeeperComesForHigh, keeperComesWide, keeperTakesLoose, shotInterceptPoint, sweeperChases, wideClaimFactor } from '@/GameEngine/Domain/Keeper';
import { KEEPER_CONFIG } from '@/GameEngine/Configs/KeeperConfig';
import { debugLog, isDebugEnabled } from '@/GameEngine/Support/DebugLog';
import { distToGoalCentreM, inBoxLane } from '@/GameEngine/Domain/ShotGate';
import { shotXg, XG_PENALTY } from '@/GameEngine/Domain/ShotXg';
import type { FmXgResult } from '@/GameEngine/Domain/FmXg';
import type { PlayerStatsRecord, RosterPlayer } from '@/types/playerTypes';
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
  resolveAerialDuel, resolveFmAerialDuel, gkClaimChance, resolveChip, resolveRoundKeeper,
  resolveHeavyTouch, resolveDeflection, resolveShotBlock, reboundSpeed, scatterDirection, gaussianDraw,
} from '@/GameEngine/Infrastructure/ActionOutcomes';
import { HOLDER_MOVES, DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import { HOLDER_CHOICE } from '@/GameEngine/Configs/HolderChoiceConfig';
import { FM_NUMBERS } from '@/GameEngine/Configs/FmNumbersConfig';
import { getMainRole } from '@/Domain/roles';
import { passErrorFactor, passLaunch } from '@/GameEngine/Domain/PassError';
import { MOVEMENT } from '@/GameEngine/Configs/MovementConfig';
import {
  shotBlocker, passLengthFactor, standOffPoint, robustMean, stepBackLine,
  anticipationLookahead, anticipationInterceptMult,
} from '@/GameEngine/Domain/Movement';
import { COHESION_LINE_ROLES } from '@/GameEngine/Configs/CohesionConfig';
import { computeDefensiveShapeAnchor, setBackLineX } from '@/GameEngine/Domain/DefensivePositioning';
import type { LooseBallCause, BackLineState } from '@/GameEngine/types';
import { chipMove, chipTargetY, roundKeeperSkill } from '@/GameEngine/Domain/HolderMoves';
import { getInterceptionPerpDist, tackleAngleModifier, type RelativePosition } from '@/GameEngine/Domain/PositionalAwareness';
import { foulChance, cardRoll, isClearChance, isPromisingAttack, foulThird, type FoulKind, type FoulContextKind } from '@/GameEngine/Domain/Fouls';
import { FOUL_CONFIG } from '@/GameEngine/Configs/FoulConfig';
import { computeCrowdGrid } from '@/GameEngine/Infrastructure/CrowdGrid';
import { getDefenseConfig } from '@/GameEngine/Configs/DefenseConfig';
import { withTeamExecution } from '@/GameEngine/Configs/FamiliarityConfig';
import { matchMoraleOf } from '@/GameEngine/Configs/MoraleConfig';
import { matchTemperamentOf } from '@/GameEngine/Configs/PersonalityMatchConfig';
import { temperamentFoulMult } from '@/Domain/personality/personality';
import { refereeFoulMult, refereeRedMult, refereeYellowMult } from '@/Domain/referees/strictness';
import type { EngineReferee } from '@/types/refereeTypes';
import { rollError, varChecksCorrect, varCorrects, type RefereeErrorKind } from '@/GameEngine/Domain/Var';
import { VAR_CONFIG } from '@/GameEngine/Configs/VarConfig';
import type { VarApply, VarReviewState } from '@/GameEngine/types';
import { withMoraleExecution } from '@/Domain/morale/morale';
import { settlingMult, withSettlingExecution } from '@/Domain/settling/settling';
import { computeOffsideLine } from '@/GameEngine/Domain/Offside';
import { refreshLineRead, perceivedLine } from '@/GameEngine/Domain/OffsideRuns';
import { refreshMindRolls } from '@/GameEngine/Domain/DefensiveMind';
import { capStatModifiers } from '@/GameEngine/Domain/ConsistencyCap';
import { OFFSIDE_RUNS } from '@/GameEngine/Configs/OffsideRunsConfig';
import { KINEMATICS_CONFIG } from '@/GameEngine/Configs/KinematicsConfig';
import { etaTo as kinEta, stepAlong, stepToward, type KinStep } from '@/GameEngine/Domain/Kinematics';
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
import { drainMultiplier as loadDrainMultiplier, matchStartCondition, matchStartEnergy } from '@/Domain/fitness/fitness';
import { conditionDrainMult, halfTimeCondition, outfieldMedianCondition } from '@/GameEngine/Domain/Condition';
import { matchRandom, loadMatchRng, matchRngState, newMatchSeed } from '@/GameEngine/Infrastructure/MatchRng';

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

// ── Match clock ──────────────────────────────────────────────────────────────
/**
 * Game-seconds per physical second of the clock compressed before the engine rebuild (stage 2): 45 game minutes in
 * 150 s of physics. The engine plays the 90 minutes in real physics (`GameState.clockScale` absent = 1); this scale is
 * only for comparison runs and, provisionally, the live match (`buildLiveMatchState`) until stage 19 adapts it.
 */
export const LEGACY_CLOCK_SCALE = 18;

/** Game-seconds the match clock advances per physical second of simulation (1 = real time, the default). */
/** Kick-off condition from the persisted fitness: FM's scale under `FM_CONDITION` (stage 14), else `matchStartEnergy`. */
function startConditionOf(fitness: number): number {
  return DECISION_FLAGS.FM_CONDITION ? matchStartCondition(fitness) : matchStartEnergy(fitness);
}

export function clockScaleOf(state: Pick<GameState, 'clockScale'>): number {
  return state.clockScale ?? 1;
}

/**
 * Physical freeze of a restart that takes `deadS` game-seconds of dead ball (`SetPiece.countdown` is drained by the
 * physical step while the clock runs `clockScale` × faster): the dead time is game time, the freeze shrinks with a
 * compressed clock. Stage 2: every restart keeps the game time it took before (old physical value × 18).
 */
export function restartFreeze(state: Pick<GameState, 'clockScale'>, deadS: number): number {
  return deadS / clockScaleOf(state);
}

/**
 * Sets the match clock scale (`GameState.clockScale`) on a fresh state, rescaling the pending kickoff freeze
 * (built at scale 1 by `createMatchState`). 1 removes the field.
 */
export function withClockScale(state: GameState, scale: number): GameState {
  const { clockScale: _old, ...rest } = state;
  const base: GameState = scale === 1 ? rest : { ...rest, clockScale: scale };
  const ratio = clockScaleOf(state) / scale;
  return state.setPiece && ratio !== 1
    ? { ...base, setPiece: { ...state.setPiece, countdown: state.setPiece.countdown * ratio } }
    : base;
}
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

/**
 * `/test` debug line for a lance the weather changed (`weather.md`): the lever and its multiplier (`weatherMult`).
 * Nothing when the lever is 1 or debug is off. The per-tick levers (drain, carry speed, injury risk) are not logged.
 */
function logWeather(state: GameState, lever: keyof WeatherEffect, message: string, playerId?: number): void {
  if (!isDebugEnabled()) return;
  const weatherMult = weatherEffectOf(state.weather)[lever];
  if (weatherMult === 1) return;
  debugLog('weather', `${message} — ${lever} ×${weatherMult}`, { playerId, data: { weather: state.weather, lever, weatherMult } });
}

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
 * without churning every tick — 3 s of play, 15 ticks of 0.2 s (stage 2; on the compressed clock every tick).
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

/** The day's attributes with the consistency cap on their modifiers (stage 16, `ConsistencyCap.ts`); flag off = as is. */
function consistencyCapped(rp: RosterPlayer, buffed: PlayerStatsRecord, consistency: number): PlayerStatsRecord {
  return DECISION_FLAGS.CONSISTENCY_CAP ? capStatModifiers(rp.stats, buffed, consistency) : buffed;
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
  const mental = matchMentalOf(team, rp);
  const buffed = consistencyCapped(rp, withSettlingExecution(withMoraleExecution(withTeamExecution(computeBuffedStats(
    rp.stats,
    Player.trainingToStatus(rp.seasonLog?.trainingSessions ?? 0),
    Player.moraleToStatus(rp.seasonLog?.morale ?? 70),
    Player.formToStatus(rp.seasonLog?.recentRatings ?? []),
    matchRandom,
  ), team), matchMoraleOf(team, rp.morale)), settlingMult(rp)), mental.consistency);
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
  const energy = startConditionOf(rp.seasonLog?.fitness ?? emptySeasonLog().fitness);
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
    seasonYellows:    rp.seasonLog?.yellowCards ?? 0,
    morale:           matchMoraleOf(team, rp.morale),
    ...(rp.settling ? { settlingMult: settlingMult(rp) } : {}),
    temperament:      matchTemperamentOf(team, rp),
    mental,
    foot:             rp.preferredFoot,
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
    const mental = matchMentalOf(team, rp);
    const buffed = consistencyCapped(rp, withSettlingExecution(withMoraleExecution(withTeamExecution(computeBuffedStats(
      rp.stats,
      Player.trainingToStatus(rp.seasonLog?.trainingSessions ?? 0),
      Player.moraleToStatus(rp.seasonLog?.morale ?? 70),
      Player.formToStatus(rp.seasonLog?.recentRatings ?? []),
    matchRandom,
    ), team), matchMoraleOf(team, rp.morale)), settlingMult(rp)), mental.consistency);
    const baseStats = teamLineup(buffed, naturalRole);
    // See the starters' build above — same `matchStartEnergy` compression, same no-history fallback.
    const energy = startConditionOf(rp.seasonLog?.fitness ?? emptySeasonLog().fitness);
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
      seasonYellows:    rp.seasonLog?.yellowCards ?? 0,
      morale:           matchMoraleOf(team, rp.morale),
      ...(rp.settling ? { settlingMult: settlingMult(rp) } : {}),
      temperament:      matchTemperamentOf(team, rp),
      mental,
      foot:             rp.preferredFoot,
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
  seed: number = newMatchSeed(),
): GameState {
  loadMatchRng(seed);
  resetInstructionState();
  resetDefensiveIntentCache();
  resetOffBallIntentCache();
  resetActionHold();
  resetShoulderRuns();
  _lastCover.A = undefined; _lastCover.B = undefined; _lastShadow = '';
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
  const extraTimeFirst  = Math.floor(matchRandom() * 6) * 60;
  const extraTimeSecond = Math.floor(matchRandom() * 6) * 60;

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
    setPiece:              { type: 'kickoff', takerId: kickoffHolder.id, countdown: RESTART_DEAD_S.KICKOFF },
    decisions:             {},
    matchPhase:            'preMatch',
    matchTime:             0,
    extraTimeFirst,
    extraTimeSecond,
    presentationCountdown: PRESENTATION_DURATION,
    possessionTime:        0,
    lastPasserId:          null,
    teamIntent:            { A: 'balanced', B: 'balanced' },
    throughBallCellsCache: null,
    seed:                  seed >>> 0,
    rng:                   matchRngState(),
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
  reason?: import('../types').SubstitutionReason,
  why?: string,
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
    ...(reason ? { reason } : {}),
    ...(why ? { why } : {}),
  };

  gameBus.emit('playerSubstituted', { outId: outPlayerId, inId: inPlayerId, team, outEnergy: outPlayer.energy, reason, minute });
  if (reason === 'fatigue' || reason === 'tactical') {
    debugLog('condition', `AI sub ${team}: ${inPlayer.name} for ${outPlayer.name} (${reason}${why ? `, ${why}` : ''})`, { playerId: outPlayerId, data: { minute, outEnergy: Math.round(outPlayer.energy), inEnergy: Math.round(inPlayer.energy) } });
  }

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
    s = performSubstitution(s, team, req.outId, req.inId, req.reason, req.why);
  }

  return s;
}

// ── In-match injuries ─────────────────────────────────────────────────────────
// `docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Na partida". Pure risk math lives in
// `Domain/injury/injury.ts`; this file owns reading player condition and executing the outcome
// (forced substitution, or "play on with 10" when none is available).

function injuryFactorsOf(p: GamePlayer, weatherMult = 1): InjuryFactors {
  return { energy: p.energy, load: p.injuryLoad, age: p.age, strength: p.strengthAttr, staffMult: (p.injuryMult ?? 1) * weatherMult };
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

/** True when every keeper stat of a GK-role player is at least the emergency floor. An outfielder
 *  put in goal by a substitution slot can come out with some keeper stats above zero and others at
 *  zero (positioning from pressing, no jump → diving 0), so "any stat above zero" is not enough. */
function hasRealGkStats(p: GamePlayer): boolean {
  const s = p.baseStats.withoutBall;
  return s.gkPositioning >= GK_EMERGENCY_STAT_FLOOR && s.gkReflex >= GK_EMERGENCY_STAT_FLOOR
    && s.gkDiving >= GK_EMERGENCY_STAT_FLOOR;
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
    // injuryMult: staff × the match pitch (`matchInjuryMults`), 1 when neither applies.
    data: { severity, minute, team, energy: player.energy, injuryMult: player.injuryMult ?? 1 },
  });

  const subsLeft = team === 'A' ? s.subsRemainingA : s.subsRemainingB;
  const bench    = team === 'A' ? s.benchA         : s.benchB;
  // #140: the manager picks the replacement. The injured player leaves now (the team plays with
  // one fewer meanwhile, a keeper replaced in goal by `ensureCompetentGK`) and the slot waits.
  // Open vacancies already hold a substitution and a bench player each: beyond that the team plays
  // on one short, as without the option.
  const openVacancies = s.injuryVacancies?.[team]?.length ?? 0;
  if (s.manualInjurySubs?.[team]) {
    if (subsLeft > openVacancies && bench.length > openVacancies) return leaveInjuryVacancy(s, player, bench);
    return ensureCompetentGK(removeInjuredPlayer(s, player), team);
  }
  let result: GameState;
  if (subsLeft > 0 && bench.length > 0) {
    const best = findBestBenchForRole(bench, player.role);
    result = best ? performSubstitution(s, team, player.id, best.id, 'injury') : removeInjuredPlayer(s, player);
  } else {
    result = removeInjuredPlayer(s, player);
  }
  return ensureCompetentGK(result, team);
}

/**
 * #140: the injured player of a `manualInjurySubs` team leaves without a replacement; the slot goes
 * to `injuryVacancies` and `injuryNeedsSub` is emitted (the live match pauses and opens the panel).
 * An injured keeper is replaced in goal by an outfielder meanwhile (`ensureCompetentGK`); the empty
 * slot is then the one that outfielder came from.
 */
function leaveInjuryVacancy(state: GameState, player: GamePlayer, bench: GamePlayer[]): GameState {
  const team = player.team;
  const before = new Map(state.players.filter(p => p.team === team).map(p => [p.id, p] as const));
  const s = ensureCompetentGK(removeInjuredPlayer(state, player), team);
  const promoted = player.role === 'GK'
    ? s.players.find(p => p.team === team && p.role === 'GK' && before.get(p.id)?.role !== 'GK')
    : undefined;
  const best = findBestBenchForRole(bench, player.role);
  const vacancy: InjuryVacancy = {
    injuredId:       player.id,
    injuredName:     player.name,
    injuredRosterId: player.rosterId,
    injuredEnergy:   player.energy,
    injuredRole:     player.role,
    slotIndex:       promoted ? before.get(promoted.id)!.slotIndex : player.slotIndex,
    suggestedInId:   best?.id ?? null,
    ...(promoted ? { promotedId: promoted.id } : {}),
  };
  gameBus.emit('injuryNeedsSub', {
    team, injuredId: player.id, injuredName: player.name, slotIndex: vacancy.slotIndex, suggestedInId: vacancy.suggestedInId,
  });
  debugLog('injury', `${player.name} (team ${team}) off injured — the manager picks the replacement`, {
    playerId: player.id, data: { slot: vacancy.slotIndex, suggested: vacancy.suggestedInId, promoted: promoted?.id ?? null },
  });
  const vacancies = s.injuryVacancies?.[team] ?? [];
  return { ...s, injuryVacancies: { ...s.injuryVacancies, [team]: [...vacancies, vacancy] } };
}

/**
 * #140: brings bench player `inId` on for the injury vacancy of `injuredId` (uses a substitution).
 * The newcomer takes the empty slot; a keeper coming on for an injured keeper goes in goal and the
 * emergency keeper goes back to his slot. Refused (state unchanged) without the vacancy, the bench
 * player or a substitution left.
 */
export function fillInjuryVacancy(state: GameState, team: TeamId, injuredId: number, inId: number): GameState {
  const vacancies = state.injuryVacancies?.[team] ?? [];
  const vacancy = vacancies.find(v => v.injuredId === injuredId);
  const bench = team === 'A' ? state.benchA : state.benchB;
  const inPlayer = bench.find(p => p.id === inId);
  const subsLeft = team === 'A' ? state.subsRemainingA : state.subsRemainingB;
  if (!vacancy || !inPlayer || subsLeft <= 0) return state;

  const formation = team === 'A' ? state.formationA : state.formationB;
  const instructions = state.slotInstructions?.[team];
  const teammates = state.players.filter(p => p.team === team);
  const attackDir = teammates[0]?.attackDir ?? inPlayer.attackDir;
  const promoted = vacancy.promotedId !== undefined
    ? teammates.find(p => p.id === vacancy.promotedId && p.role === 'GK')
    : undefined;

  let players = state.players;
  let targetSlot = vacancy.slotIndex;
  if (promoted && inPlayer.role === 'GK') {
    // The keeper goes in goal; the emergency keeper back to the slot he left.
    targetSlot = promoted.slotIndex;
    const back = placeInSlot(promoted, vacancy.slotIndex, formation, instructions);
    players = players.map(p => (p.id === promoted.id ? back : p));
  }
  const used = new Set(players.filter(p => p.team === team).map(p => p.slotIndex));
  if (used.has(targetSlot)) {
    const free = formation.attacking.findIndex((_, i) => !used.has(i));
    if (free < 0) return state;
    targetSlot = free;
  }
  const placed = placeInSlot({ ...inPlayer, team, attackDir }, targetSlot, formation, instructions);
  const incoming: GamePlayer = {
    ...placed,
    x:              placed.basePosition.x,
    y:              placed.basePosition.y,
    targetPosition: placed.basePosition,
    recoveryTime:   0,
    justReceivedTicks: 0,
  };

  const record: import('../types').SubstitutionRecord = {
    team,
    playerOutId:       vacancy.injuredId,
    playerOutName:     vacancy.injuredName,
    playerOutRosterId: vacancy.injuredRosterId,
    playerOutEnergy:   vacancy.injuredEnergy,
    playerInId:        inPlayer.id,
    playerInName:      inPlayer.name,
    playerInRosterId:  inPlayer.rosterId,
    matchMinute:       matchMinute(state),
  };
  gameBus.emit('playerSubstituted', { outId: vacancy.injuredId, inId: inPlayer.id, team, outEnergy: vacancy.injuredEnergy, reason: 'injury' });
  debugLog('injury', `${inPlayer.name} on for the injured ${vacancy.injuredName} (team ${team})`, {
    playerId: inPlayer.id, data: { slot: targetSlot },
  });

  const newBench = bench.filter(p => p.id !== inId);
  return ensureCompetentGK(refreshManMarks({
    ...state,
    players:        [...players, incoming].sort((a, b) => a.id - b.id),
    benchA:         team === 'A' ? newBench : state.benchA,
    benchB:         team === 'B' ? newBench : state.benchB,
    subsRemainingA: team === 'A' ? state.subsRemainingA - 1 : state.subsRemainingA,
    subsRemainingB: team === 'B' ? state.subsRemainingB - 1 : state.subsRemainingB,
    substitutions:  [...state.substitutions, record],
    injuryVacancies: { ...state.injuryVacancies, [team]: vacancies.filter(v => v !== vacancy) },
  }), team);
}

/** The side in possession for an injury stoppage: the holder's, else the last touch of a loose ball. */
function sideWithBall(state: GameState): TeamId | null {
  const holder = state.players.find(p => p.id === state.ballHolderId);
  if (holder) return holder.team;
  return state.looseBall?.fromTeamLastTouch ?? null;
}

/**
 * The referee stops play for an injury (12.1, `.claude/rules/game/injuries.md` → "Jogo parado na lesão"): the side
 * that had the ball restarts where the ball was, as a quick free kick (nearest player, nobody else moves). Nothing
 * happens when play is already stopped (a restart given in the same tick, a VAR review, a dead phase) or while a pass
 * or shot is in the air. `team` and `spot` are read BEFORE the injured player leaves.
 */
export function stopForInjury(state: GameState, team: TeamId | null, spot: { x: number; y: number }, minute: number): GameState {
  if (!team || state.setPiece || state.pass || state.shot || state.varReview || state.pendingPenalty) return state;
  if (!isLivePhase(state.matchPhase)) return state;
  const pool = state.players.filter(p => p.team === team);
  if (pool.length === 0) return state;
  const pos = { x: Math.max(1, Math.min(PITCH_LENGTH - 1, spot.x)), y: Math.max(1, Math.min(PITCH_WIDTH - 1, spot.y)) };
  const taker = nearestPlayerTo(pool, pos);
  const prevHolderId = state.ballHolderId;
  gameBus.emit('injuryStoppage', { team, takerId: taker.id, x: pos.x, y: pos.y, minute });
  debugLog('injury', `Play stopped for the injury: team ${team} restarts at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) with ${taker.name}`, {
    playerId: taker.id, data: { team, minute },
  });
  return onPossessionTransfer({
    ...state,
    players:        state.players.map(p => (p.id === taker.id ? { ...p, x: pos.x, y: pos.y, targetPosition: { ...pos } } : p)),
    looseBall:      null,
    missedOffside:  null,
    ballHolderId:   taker.id,
    lastPasserId:   null,
    tackleCooldown: TACKLE_COOLDOWN,
    setPiece:       { type: 'free_kick', takerId: taker.id, countdown: restartFreeze(state, FOUL_CONFIG.FREE_KICK_COUNTDOWN), position: pos },
  }, prevHolderId);
}

/** Per-tick, per-player injury roll: `injuryRatePerMinute` scaled to the game-minutes elapsed this tick. */
function rollInMatchInjuries(state: GameState, dt: number): GameState {
  const gameMinutes = (dt * clockScaleOf(state)) / 60;
  const side = sideWithBall(state);
  const spot = getBallPos(state);
  let s = state;
  for (const player of state.players) {
    // Guard against a player removed earlier THIS tick by a prior roll.
    if (!s.players.some(p => p.id === player.id)) continue;
    const prob = injuryRatePerMinute(injuryFactorsOf(player, weatherEffectOf(state.weather).injury)) * gameMinutes;
    if (matchRandom() < prob) {
      s = forceInjurySubstitution(s, player, matchMinute(s), rollSeverity(matchRandom));
    }
  }
  return s.injuries.length > state.injuries.length ? stopForInjury(s, side, spot, matchMinute(s)) : s;
}

/**
 * Extra contact-event injury risk for the two players involved in a tackle or loose-ball duel —
 * rolled independently for each, regardless of who won. Looks players up by id on the CURRENT
 * state so it's safe to call after possession/recovery updates have already been applied.
 */
function rollContactInjuries(state: GameState, ids: [number, number], minute: number): GameState {
  const side = sideWithBall(state);
  const spot = side ? getBallPos(state) : { x: 0, y: 0 };
  let s = state;
  for (const id of ids) {
    const player = s.players.find(p => p.id === id);
    if (!player) continue; // already left the pitch this tick
    if (matchRandom() < contactInjuryChance(injuryFactorsOf(player, weatherEffectOf(state.weather).injury))) {
      s = forceInjurySubstitution(s, player, minute, rollSeverity(matchRandom));
    }
  }
  return s.injuries.length > state.injuries.length ? stopForInjury(s, side, spot, minute) : s;
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

/** Puts the match referee on the state (his rigor scales fouls and cards); `null` removes him. */
export function withReferee(state: GameState, referee: EngineReferee | null | undefined): GameState {
  if (!referee) {
    const { referee: _r, ...rest } = state;
    return rest;
  }
  return {
    ...state,
    referee: {
      id: referee.id, name: referee.name, country: referee.country, strictness: referee.strictness,
      ...(typeof referee.quality === 'number' ? { quality: referee.quality } : {}),
      ...(referee.var ? { var: true } : {}),
    },
  };
}

// ── Referee errors and VAR (`.claude/rules/game/var.md`) ──────────────────────
// Pure chances in `Domain/Var.ts`. Without a referee (or without his quality) no roll ever draws a
// number, so the match is exactly the one before this stage.

/** Referee rigor on the fouls/cards of `team`: his own plus a complaint's bias against that team. */
function strictnessFor(state: GameState, team: TeamId): number | undefined {
  const s = state.referee?.strictness;
  const bias = state.refereeBias && state.refereeBias.team === team ? state.refereeBias.amount : 0;
  if (!bias) return s;
  return (s ?? 0) + bias;
}

/** An error roll at an opportunity (`rollError`), honouring the `/test` forced error. */
function refereeErrs(state: GameState, kind: RefereeErrorKind, rng: () => number): boolean {
  return rollError(kind, state.referee, rng, state.forcedRefError);
}

/** VAR correction of an error: a forced error (`/test`) is always corrected when the match has VAR. */
function varFixes(state: GameState, kind: RefereeErrorKind, rng: () => number): boolean {
  if (state.forcedRefError === kind) return state.referee?.var === true;
  return varCorrects(state.referee, rng);
}

/** Records and emits a referee error (and clears a forced error of that kind). */
function recordRefereeError(
  state: GameState, kind: RefereeErrorKind, harmed: TeamId, playerId: number, corrected: boolean, minute: number,
): GameState {
  gameBus.emit('refereeError', { kind, team: harmed, playerId, corrected, minute });
  debugLog('var', `Referee error: ${kind} (hurts team ${harmed})${corrected ? ' — the VAR will correct it' : ''}`, {
    playerId, data: { kind, harmed, corrected, quality: state.referee?.quality },
  });
  return {
    ...state,
    refereeErrors: [...(state.refereeErrors ?? []), { kind, team: harmed, playerId, minute, corrected }],
    ...(state.forcedRefError === kind ? { forcedRefError: null } : {}),
  };
}

/** Starts a VAR check: play stops for `REVIEW_SECONDS` real seconds (no game time), then `endVarReview`. */
export function startVarReview(state: GameState, review: Omit<VarReviewState, 'countdown'>): GameState {
  if (state.varReview) return state; // one check at a time — the first stands
  gameBus.emit('varCheck', { kind: review.kind, minute: matchMinute(state) });
  debugLog('var', `VAR check: ${review.kind} (${review.outcome})`, { playerId: review.playerId, data: { ...review } });
  return { ...state, varReview: { ...review, countdown: VAR_CONFIG.REVIEW_SECONDS } };
}

/** Ends the VAR check: emits the decision and applies it (`VarApply`). */
export function endVarReview(state: GameState): GameState {
  const r = state.varReview;
  if (!r) return state;
  const minute = matchMinute(state);
  gameBus.emit('varReview', {
    kind: r.kind, outcome: r.outcome, against: r.against, playerId: r.playerId,
    ...(r.offenderId !== undefined ? { offenderId: r.offenderId } : {}), minute,
  });
  let s: GameState = {
    ...state,
    varReview: null,
    varReviews: [...(state.varReviews ?? []), { kind: r.kind, outcome: r.outcome, against: r.against, playerId: r.playerId, minute }],
  };
  const a: VarApply = r.apply;
  if (a.type === 'cancel_penalty') {
    // Indirect free kick to the defending side where the challenge happened.
    s = awardFoulRestart({ ...s, setPiece: null }, a.defendingTeam, { x: a.x, y: a.y }, false, a.attackerId, minute);
  } else if (a.type === 'disallow_goal') {
    const score = { ...s.score, [a.team]: Math.max(0, s.score[a.team] - 1) };
    gameBus.emit('goalDisallowed', {
      team: a.team, scorerId: a.scorerId, score, minute,
      ...(a.assistId !== undefined ? { assistId: a.assistId } : {}),
      ...(a.header ? { header: true } : {}),
      ...(a.setPiece ? { setPiece: a.setPiece } : {}),
    });
    s = { ...s, score };
    const offender = s.players.find(p => p.id === a.offenderId);
    if (offender) s = aerialOffsideFreeKick(s, offender, { x: a.x, y: a.y }, a.lineX);
  }
  return s;
}

/** The assistant misses an offside: the error is logged, play goes on, a goal of that side soon after is checked. */
function missOffside(state: GameState, receiver: GamePlayer, at: { x: number; y: number }, lineX?: number): GameState {
  const harmed: TeamId = receiver.team === 'A' ? 'B' : 'A';
  const s = recordRefereeError(state, 'missed_offside', harmed, receiver.id, false, matchMinute(state));
  return {
    ...s,
    missedOffside: {
      team: receiver.team, playerId: receiver.id, until: state.matchTime + VAR_CONFIG.GOAL_CHAIN_SECONDS,
      x: at.x, y: at.y, ...(lineX !== undefined ? { lineX } : {}),
    },
  };
}

/**
 * After a goal (state already reset to the kickoff): a goal of the side of a missed offside, still inside the chain,
 * is checked and ruled out by the VAR (`varCorrects`). The chain is consumed either way.
 */
function checkGoalForOffside(
  stateBefore: GameState, after: GameState,
  goal: { team: TeamId; scorerId: number; assistId?: number; header?: boolean; setPiece?: import('@/GameEngine/types').SetPieceGoalKind },
  rng: () => number = matchRandom,
): GameState {
  const chain = stateBefore.missedOffside;
  if (!chain) return after;
  let s: GameState = { ...after, missedOffside: null };
  if (chain.team !== goal.team || stateBefore.matchTime > chain.until) return s;
  if (!varCorrects(s.referee, rng)) return s;
  const errors = [...(s.refereeErrors ?? [])];
  for (let i = errors.length - 1; i >= 0; i--) {
    if (errors[i]!.kind === 'missed_offside' && errors[i]!.playerId === chain.playerId) { errors[i] = { ...errors[i]!, corrected: true }; break; }
  }
  s = { ...s, refereeErrors: errors };
  return startVarReview(s, {
    kind: 'goal', outcome: 'overturned', against: goal.team, playerId: goal.scorerId, offenderId: chain.playerId,
    apply: {
      type: 'disallow_goal', team: goal.team, scorerId: goal.scorerId, offenderId: chain.playerId,
      x: chain.x, y: chain.y,
      ...(goal.assistId !== undefined ? { assistId: goal.assistId } : {}),
      ...(goal.header ? { header: true } : {}),
      ...(goal.setPiece ? { setPiece: goal.setPiece } : {}),
      ...(chain.lineX !== undefined ? { lineX: chain.lineX } : {}),
    },
  });
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
      playerId: player.id, data: { card: c, secondYellow, minute, tempMult: temperamentFoulMult(player.temperament ?? 0), refMult: c === 'red' ? refereeRedMult(state.referee?.strictness) : refereeYellowMult(state.referee?.strictness), discMult: attributeReduce(state.managerDiscipline?.[player.team]) },
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

/**
 * Game-seconds past the period's end that a pending penalty / dangerous free kick may still use. Stage 2: kept (it
 * holds a penalty's 36 s of dead ball plus the kick).
 */
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

/** How close to the goal line it attacks (yards) the ball has to be for the whistle to wait, and for how long (game-seconds). */
const ATTACK_HOLD_DIST = 30;
/** Stage 2: 45 game-s was ~2.5 s of play on the compressed clock; an attack in the last 30 yards ends within ~10 s. */
const ATTACK_HOLD_MAX = 10;

/**
 * True when the whistle must wait for an attack in progress (tester report, 10.7: periods ended with a player
 * through on goal): the ball is with the attacking side (held, passed, or loose from its own pass) within
 * `ATTACK_HOLD_DIST` yards of the goal line that side attacks. It stops holding as soon as the ball is lost, goes
 * away from the goal or a restart is given (restarts have `restartHoldsPeriod`), and at most `ATTACK_HOLD_MAX`
 * game-seconds past `periodEnd` (shorter than `RESTART_HOLD_MAX`, so a shot taken at the end is still resolved).
 */
export function attackHoldsPeriod(state: GameState, newMatchTime: number, periodEnd: number): boolean {
  if (newMatchTime >= periodEnd + ATTACK_HOLD_MAX || state.setPiece) return false;
  const near = (dir: number, x: number) => (dir === 1 ? PITCH_LENGTH - x : x) <= ATTACK_HOLD_DIST;
  if (state.pass) {
    const from = state.players.find(p => p.id === state.pass!.fromId);
    return !!from && near(from.attackDir, state.pass.toX);
  }
  if (state.looseBall) {
    const side = state.players.find(p => p.team === state.looseBall!.fromTeamLastTouch);
    return !!side && near(side.attackDir, state.looseBall.x);
  }
  if (state.shot) return false;
  const holder = state.players.find(p => p.id === state.ballHolderId);
  return !!holder && near(holder.attackDir, holder.x);
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
    setPiecePhase: { team, kind, until: state.matchTime + countdown * clockScaleOf(state) + SET_PIECE_CONFIG.SET_PIECE_PHASE_SECONDS },
  };
}

/** The set-piece kind of a goal `team` scores right now, if a phase of theirs is open. */
function setPieceGoalOf(state: GameState, team: TeamId): SetPieceGoalKind | undefined {
  const ph = state.setPiecePhase;
  return ph && ph.team === team && state.matchTime <= ph.until ? ph.kind : undefined;
}

/** Stage 12 (`set-pieces-play.md` → "Stage 12"): FM's set pieces on. */
function fmSetPiecesOn(): boolean {
  return DECISION_FLAGS.FM_SET_PIECES;
}

/** Stage 12: a throw-in, a dead-ball goal kick or a corner being taken — no offside from it (the law). */
function noOffsideRestart(s: GameState): boolean {
  const t = s.setPiece?.type;
  return fmSetPiecesOn() && (t === 'throw_in' || t === 'corner' || (t === 'goal_kick' && !!s.setPiece?.position));
}

/** Stage 12: a set-piece delivery's launch-error factor relative to a pass (FM's base 90 against 95). */
function setPieceErrorScale(): number {
  return FM_SET_PIECES.BASE_SET_PIECE_PASS / FM_SET_PIECES.BASE_PASS;
}

/**
 * Stage 12: `setPieceTaken` for the restart `holder` is taking now toward `target` (nothing for a kick-off, a penalty
 * or a keeper's ball in hand — a goal kick only from a dead ball, with its `position`).
 */
function emitSetPieceTaken(s: GameState, holder: GamePlayer, delivery: SetPieceDelivery, target: { x: number; y: number }): void {
  const sp = s.setPiece;
  if (!sp || sp.takerId !== holder.id) return;
  const kind = sp.type === 'corner' ? 'corner' : sp.type === 'throw_in' ? 'throw_in'
    : sp.type === 'goal_kick' ? (sp.position ? 'goal_kick' : null)
    : sp.type === 'free_kick' || sp.type === 'offside_fk' ? 'free_kick' : null;
  if (!kind) return;
  const distance = Math.hypot(target.x - holder.x, target.y - holder.y);
  const goalX = holder.attackDir === 1 ? PITCH_LENGTH : 0;
  gameBus.emit('setPieceTaken', {
    team: holder.team, takerId: holder.id, kind, delivery, distance,
    ...(kind === 'throw_in' ? { backward: (target.x - holder.x) * holder.attackDir < 0 } : {}),
    ...(kind === 'corner' ? {
      attInBox: inBoxCount(s.players.filter(p => p.team === holder.team), goalX),
      defInBox: inBoxCount(s.players.filter(p => p.team !== holder.team), goalX),
    } : {}),
  });
}

/** The routine `team` plays at this corner / crossed free kick (one of the manager's, drawn), announced when there is one. */
function drawRoutine(state: GameState, team: TeamId, kind: 'corner' | 'free_kick', takerId: number): SetPieceRoutine | undefined {
  const routine = pickRoutine(state.setPieceTakers?.[team]?.routines?.[kind === 'corner' ? 'corners' : 'freeKicks'], matchRandom);
  if (routine) {
    gameBus.emit('setPieceRoutine', { team, takerId, kind, target: routine.target, attackers: routine.attackers });
    debugLog('setPiece', `Routine for team ${team} (${kind}): ${routine.target}, ${routine.attackers} in the box`, { data: { ...routine } });
  }
  return routine;
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
  routine?: SetPieceRoutine,
): GamePlayer[] {
  const att = attackingBoxPositions(players.filter(p => p.team === taker.team), taker.id, ball, taker.attackDir, kind, rng, routine?.attackers);
  const goalX = taker.attackDir === 1 ? PITCH_LENGTH : 0;
  const def = defendingBoxPositions(players.filter(p => p.team !== taker.team), att, ball, goalX, kind, fmSetPiecesOn());
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
export function startDirectFreeKick(state: GameState, rng: () => number = matchRandom): GameState {
  const sp = state.setPiece!;
  const taker = state.players.find(p => p.id === state.ballHolderId)!;
  const goalX = taker.attackDir === 1 ? PITCH_LENGTH : 0;
  const pos = { x: taker.x, y: taker.y };
  const wall = (sp.wallIds ?? []).map(id => state.players.find(p => p.id === id)).filter((p): p is GamePlayer => !!p);
  const pBlock = wallBlockChance(wall.length);
  // Stage 6 (`xg.md`): the FM free-kick model (the wall is in its blocker features); the wall roll below still decides
  // a block and the flight rolls on this xG.
  const fmBase = DECISION_FLAGS.FM_XG ? shotXg(taker, state.players, 'free_kick').xg : null;
  const base = fmBase ?? directFreeKickXG(distToGoalCentre(pos, goalX), computeOpenAngle(pos.x, pos.y, goalX));
  const xg = fmBase ?? base * (1 - pBlock);
  // Stage 7: the free kick dips over the wall by its flight; the wall blocks it only if the ball goes into it.
  if (fmSetPiecesOn()) emitSetPieceTaken(state, taker, 'shot', { x: goalX, y: PITCH_WIDTH / 2 });
  if (DECISION_FLAGS.SHOT_PHYSICS && DECISION_FLAGS.BALL_3D) {
    const shot = physicalShot(state, taker, { technique: 'free_kick', skill: Math.min(1, taker.runtimeStats.withBall.shootAccuracy / 0.95), setPiece: true }, { xg: base, freeKick: true });
    if (shot) {
      gameBus.emit('shot', { player: taker.id, xg, setPiece: true });
      gameBus.emit('directFreeKick', { player: taker.id, xg, wallSize: wall.length, blocked: false });
      debugLog('setPiece', `${taker.name} shoots the free kick over a wall of ${wall.length} (xG ${xg.toFixed(3)})`, { playerId: taker.id, data: { base, xg, wallSize: wall.length } });
      return { ...state, setPiece: null, shot };
    }
  }
  const blocked = wall.length > 0 && rng() < pBlock;
  gameBus.emit('shot', { player: taker.id, xg, setPiece: true });
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
  const { toX, toY } = computeShotAim(taker, { fixedRange: true });
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
  // A restart ends a missed offside's chain (`var.md`).
  if (state.missedOffside) state = { ...state, missedOffside: null };
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
    setPiece = { type: 'penalty', takerId: taker.id, countdown: restartFreeze(state, FOUL_CONFIG.PENALTY_COUNTDOWN), position: pos };
    gameBus.emit('penaltyAwarded', { team: fouledTeam, takerId: taker.id, offenderId, minute });
    debugLog('foul', `PENALTY to team ${fouledTeam} — ${taker.name} to take it`, { playerId: taker.id, data: { offenderId, minute } });
  } else {
    const pos = { x: Math.max(1, Math.min(PITCH_LENGTH - 1, spot.x)), y: Math.max(1, Math.min(PITCH_WIDTH - 1, spot.y)) };
    const distToLine = Math.abs(goalX - pos.x);
    const dangerous = distToLine <= FOUL_CONFIG.DANGEROUS_FREE_KICK_DIST;
    // `set-pieces-play.md` §2: direct shot over a wall when close and central; crossed into the box
    // (or short) within FK_CROSS_RANGE; elsewhere a quick free kick by the nearest player.
    // Stage 12: FM shoots direct free kicks from up to 29 m.
    const direct = fmSetPiecesOn()
      ? isDirectFreeKick(pos, awarded[0]!.attackDir, FM_SET_PIECES.DIRECT_FK_RANGE_M * SP_YD_PER_M)
      : isDirectFreeKick(pos, awarded[0]!.attackDir);
    const box = !direct && distToLine <= SET_PIECE_CONFIG.FK_CROSS_RANGE;
    const taker = direct || box ? (setPieceTakerOf(state, fouledTeam, 'freeKicks') ?? nearestPlayerTo(pool, pos)) : nearestPlayerTo(pool, pos);
    let wallIds: number[] | undefined;
    const routine = box ? drawRoutine(state, fouledTeam, 'free_kick', taker.id) : undefined;
    if (direct) ({ players, wallIds } = applyDirectFreeKick(state, players, taker, pos));
    else if (box) players = applyBoxSetPiece(players, taker, pos, 'free_kick', matchRandom, routine);
    players = players.map(p => (p.id === taker.id ? { ...p, x: pos.x, y: pos.y, targetPosition: { ...pos } } : p));
    setPiece = direct
      ? { type: 'free_kick', takerId: taker.id, countdown: restartFreeze(state, SET_PIECE_CONFIG.DIRECT_FREE_KICK_COUNTDOWN), position: pos, variant: 'direct', wallIds }
      : box
        ? { type: 'free_kick', takerId: taker.id, countdown: restartFreeze(state, SET_PIECE_CONFIG.BOX_FREE_KICK_COUNTDOWN), position: pos, variant: 'box', ...(routine ? { routine } : {}) }
        : { type: 'free_kick', takerId: taker.id, countdown: restartFreeze(state, FOUL_CONFIG.FREE_KICK_COUNTDOWN), position: pos };
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
  rng: () => number = matchRandom,
): GameState | null {
  return foulCheck(state, offender, fouled, kind, tackleWon, rng).foul;
}

/**
 * Stage 13 (`FOUL_CONFIG.FM`): an opponent within `CONTACT_RANGE` of the holder (out of recovery, not a set-piece
 * taker) leans on him. Contact moments come at `CONTACT_RATE` per second of play (× what the holder is doing); each
 * is a foul check of kind `contact`, the holder himself the offender `HOLDER_OFFENDER_SHARE` of the time. Returns the
 * restart state on a foul, null otherwise. No dice when nobody is that close.
 */
function contactFoul(s: GameState, holder: GamePlayer, dt: number): GameState | null {
  if (!isLivePhase(s.matchPhase) || s.setPiece || s.shot || s.looseBall || s.varReview) return null;
  if (holder.role === 'GK') return null;
  const F = FOUL_CONFIG.FM;
  let near: GamePlayer | null = null;
  let best = F.CONTACT_RANGE * F.CONTACT_RANGE;
  for (const p of s.players) {
    if (p.team === holder.team || p.role === 'GK' || isPlayerInRecovery(p)) continue;
    const d = distSq(p, holder);
    if (d <= best) { best = d; near = p; }
  }
  if (!near) return null;
  const dec = s.decisions[holder.id];
  const ctx: 'carry' | 'reception' | 'hold' = holder.justReceivedTicks > 0 ? 'reception'
    : (dec?.type === 'dribble' || (dec?.type === 'carry' && dec.move !== 'shield' && !dec.step)) ? 'carry' : 'hold';
  const rate = F.CONTACT_RATE * F.CONTEXT_MULT[ctx];
  if (matchRandom() >= 1 - Math.exp(-rate * dt)) return null;
  const holderFouls = matchRandom() < F.HOLDER_OFFENDER_SHARE;
  const [offender, fouled] = holderFouls ? [holder, near] : [near, holder];
  const fc = foulCheck(s, offender, fouled, 'contact', false);
  if (!fc.foul) return null;
  gameBus.emit('contactFoul', { offenderId: offender.id, fouledId: fouled.id, team: offender.team, context: holderFouls ? 'off_ball' : ctx });
  return { ...fc.foul, tackleCooldown: TACKLE_COOLDOWN };
}

/** What the fouled player was doing when fouled (stage 13; FM's "last action before the foul"). */
function foulContextOf(state: GameState, offender: GamePlayer, fouled: GamePlayer, kind: FoulKind): FoulContextKind {
  if (kind === 'duel') return 'loose';
  if (kind === 'aerial') return 'aerial';
  if (fouled.id !== state.ballHolderId || offender.id === state.ballHolderId) return 'off_ball';
  if (fouled.justReceivedTicks > 0) return 'reception';
  const dec = state.decisions[fouled.id];
  if (kind === 'dribble' || dec?.type === 'dribble' || (dec?.type === 'carry' && dec.move !== 'shield' && !dec.step)) return 'carry';
  return 'hold';
}

/**
 * `maybeFoul` with the state of a challenge that was not whistled: `foul` = the restart state (a foul, or a
 * phantom penalty), else `null` and `state` carries what changed anyway (a missed penalty is logged as a referee
 * error, `var.md`). Without a referee `state` is the input object itself.
 */
export function foulCheck(
  state: GameState,
  offender: GamePlayer,
  fouled: GamePlayer,
  kind: FoulKind,
  tackleWon: boolean,
  rng: () => number = matchRandom,
): { foul: GameState | null; state: GameState } {
  const ownGoalX = offender.attackDir === 1 ? 0 : PITCH_LENGTH;
  const inOwnBox = isInGoalScoreArea(fouled.x, fouled.y, ownGoalX);
  // Tackle: real approach angle. Dribble: head-on when the defender won it, from behind when he was
  // beaten and chases back (a cynical stop). Loose-ball duel: shoulder to shoulder.
  const angle: RelativePosition =
    kind === 'tackle' || kind === 'contact' ? angleFromModifier(tackleAngleModifier(offender, fouled)) :
    kind === 'dribble' ? (tackleWon ? 'front' : 'behind') :
                         'side';
  const onYellow = yellowsOf(state, offender.id) > 0;
  const temperament = offender.temperament ?? 0;
  const strictness = strictnessFor(state, offender.team);
  const discipline = state.managerDiscipline?.[offender.team];
  // Kinematics (`kinematics.md`): × the foul compensation while the layer is on (× 1 off: the old chance bit for bit).
  // A shielding holder (`HolderMoves.ts`) draws more fouls from the challenge.
  const fouledDec = state.decisions[fouled.id];
  const shieldMult = kind === 'tackle' && fouledDec?.type === 'carry' && fouledDec.move === 'shield' ? HOLDER_MOVES.SHIELD_FOUL_MULT : 1;
  const chance = shieldMult * (KINEMATICS_CONFIG.ENABLED ? KINEMATICS_CONFIG.FOUL_MULT : 1) * foulChance({
    kind, angle, inOwnBox, tackleWon, onYellow, temperament, strictness, discipline,
    aggression: getDefenseConfig(offender.team).TACKLE_AGGRESSION,
    // A keeper's challenge reads his positioning as technique and fouls less (`Keeper.ts`).
    tackling:   offender.role === 'GK' ? offender.runtimeStats.withoutBall.gkPositioning : offender.runtimeStats.withoutBall.tackling,
    energy:     offender.energy,
    keeperMult: offender.role === 'GK' ? KEEPER_CONFIG.SMOTHER_FOUL_MULT : undefined,
  });
  const minute = matchMinute(state);
  const spot = { x: fouled.x, y: fouled.y };
  const third = foulThird(spot.x, fouled.attackDir);
  const context = foulContextOf(state, offender, fouled, kind);
  if (rng() >= chance) {
    // Not a foul — but a challenge in the box can still be whistled as a penalty (`var.md` §2).
    if (!inOwnBox || !refereeErrs(state, 'phantom_penalty', rng)) return { foul: null, state };
    const ph = phantomPenalty(state, offender, fouled, kind, spot, minute, rng);
    return { foul: ph, state: ph };
  }

  // A foul in the box the referee does not see: play goes on (`missed_penalty`), unless the VAR steps in.
  let review: Omit<VarReviewState, 'countdown'> | null = null;
  let errState: GameState = state;
  if (inOwnBox && refereeErrs(state, 'missed_penalty', rng)) {
    const corrected = varFixes(state, 'missed_penalty', rng);
    errState = recordRefereeError(state, 'missed_penalty', fouled.team, fouled.id, corrected, minute);
    if (!corrected) return { foul: null, state: errState };
    review = { kind: 'missed_penalty', outcome: 'overturned', against: offender.team, playerId: fouled.id, offenderId: offender.id, apply: { type: 'none' } };
  } else if (inOwnBox && varChecksCorrect(state.referee, rng)) {
    review = { kind: 'penalty', outcome: 'confirmed', against: offender.team, playerId: fouled.id, offenderId: offender.id, apply: { type: 'none' } };
  }
  state = errState;
  gameBus.emit('foul', {
    offenderId: offender.id, fouledId: fouled.id, team: offender.team, kind,
    x: spot.x, y: spot.y, inBox: inOwnBox, minute, third, context,
  });
  debugLog('foul', `Foul by ${offender.name} on ${fouled.name} (${kind}, ${angle}, ${context}, third ${third}${inOwnBox ? ', IN THE BOX' : ''}) — chance ${(chance * 100).toFixed(0)}%`, {
    playerId: offender.id, data: { fouledId: fouled.id, kind, angle, context, third, chance, x: spot.x, y: spot.y, tempMult: temperamentFoulMult(temperament), refMult: refereeFoulMult(strictness), discMult: attributeReduce(discipline) },
  });

  let s: GameState = {
    ...state,
    players: state.players.map(p => (p.id === offender.id ? { ...p, recoveryTime: DUEL_TACKLE_FAILED_RECOVERY } : p)),
  };
  const opponents = s.players.filter(p => p.team === offender.team && p.id !== offender.id);
  const fm = DECISION_FLAGS.FM_FOULS;
  const promising = fm && isPromisingAttack(fouled, offender, context === 'carry' || context === 'reception' || context === 'hold');
  let { card } = cardRoll({ angle, clearChance: isClearChance(fouled, opponents), onYellow, temperament, strictness, discipline, fm, promising }, rng);
  // Wrong card (`var.md` §2): a yellow shown as a straight red, a straight red shown as a yellow.
  if (card === 'yellow' && !onYellow && refereeErrs(s, 'wrong_red', rng)) {
    const corrected = varFixes(s, 'wrong_red', rng);
    s = recordRefereeError(s, 'wrong_red', offender.team, offender.id, corrected, minute);
    if (corrected) review ??= { kind: 'red_card', outcome: 'overturned', against: fouled.team, playerId: offender.id, apply: { type: 'none' } };
    else card = 'red';
  } else if (card === 'red' && !onYellow && refereeErrs(s, 'missed_red', rng)) {
    const corrected = varFixes(s, 'missed_red', rng);
    s = recordRefereeError(s, 'missed_red', fouled.team, offender.id, corrected, minute);
    if (corrected) review ??= { kind: 'missed_red', outcome: 'overturned', against: offender.team, playerId: offender.id, apply: { type: 'none' } };
    else card = 'yellow';
  } else if (card === 'red' && !review && varChecksCorrect(s.referee, rng)) {
    review = { kind: 'red_card', outcome: 'confirmed', against: offender.team, playerId: offender.id, apply: { type: 'none' } };
  }
  if (card !== 'none') s = bookPlayer(s, s.players.find(p => p.id === offender.id) ?? offender, card, minute);
  const restarted = awardFoulRestart(s, fouled.team, spot, inOwnBox, offender.id, minute);
  const out = review ? startVarReview(restarted, review) : restarted;
  return { foul: out, state: out };
}

/**
 * A penalty for a challenge that was not a foul (`phantom_penalty`): whistled like a foul (no card). With the VAR
 * correcting it, a check follows and rules it out (indirect free kick to the defending side).
 */
function phantomPenalty(
  state: GameState, offender: GamePlayer, fouled: GamePlayer, kind: FoulKind,
  spot: { x: number; y: number }, minute: number, rng: () => number,
): GameState {
  const corrected = varFixes(state, 'phantom_penalty', rng);
  let s = recordRefereeError(state, 'phantom_penalty', offender.team, offender.id, corrected, minute);
  gameBus.emit('foul', {
    offenderId: offender.id, fouledId: fouled.id, team: offender.team, kind,
    x: spot.x, y: spot.y, inBox: true, minute, third: foulThird(spot.x, fouled.attackDir), context: foulContextOf(state, offender, fouled, kind),
  });
  s = {
    ...s,
    players: s.players.map(p => (p.id === offender.id ? { ...p, recoveryTime: DUEL_TACKLE_FAILED_RECOVERY } : p)),
  };
  s = awardFoulRestart(s, fouled.team, spot, true, offender.id, minute);
  if (!corrected) return s;
  const takerId = s.setPiece?.takerId ?? fouled.id;
  return startVarReview(s, {
    kind: 'penalty', outcome: 'overturned', against: fouled.team, playerId: takerId, offenderId: offender.id,
    apply: { type: 'cancel_penalty', defendingTeam: offender.team, x: spot.x, y: spot.y, attackerId: fouled.id },
  });
}

/**
 * Resolves an in-match penalty once its freeze ends: `penaltyChance` for the taker against the
 * defending goalkeeper. Goal → kickoff for the conceding team; miss/save → the goalkeeper's goal kick.
 */
function resolveInMatchPenalty(state: GameState, rng: () => number = matchRandom): TickResult {
  const sp = state.setPiece!;
  const taker = state.players.find(p => p.id === sp.takerId) ?? state.players.find(p => p.id === state.ballHolderId)!;
  const gk = state.players.find(p => p.team !== taker.team && p.role === 'GK') ?? null;
  if (state.penaltyInteractive?.length) {
    // 2D penalties: the match holds until the screen (or the server) answers (`applyPenaltyOutcome`).
    const pending = { kind: 'match' as const, team: taker.team, takerId: taker.id, keeperId: gk?.id ?? null };
    gameBus.emit('penaltyPending', pending);
    return { state: { ...state, pendingPenalty: pending }, passCompleted: false, tackled: false, goalScored: null };
  }
  const chance = penaltyChance(
    taker.runtimeStats.withBall.shootAccuracy,
    gk ? { id: gk.id, reflex: gk.runtimeStats.withoutBall.gkReflex, diving: gk.runtimeStats.withoutBall.gkDiving } : null,
  );
  return finishInMatchPenalty(state, taker, gk, rng() < chance, chance);
}

/**
 * Answers the pending penalty (2D screen in the browser, or the server between two managers): a shootout kick
 * is added and the shootout moves on; a match penalty ends as an automatic one would. No pending penalty: unchanged.
 */
export function applyPenaltyOutcome(state: GameState, outcome: PenaltyOutcome): GameState {
  const pending = state.pendingPenalty;
  if (!pending) return state;
  const taker = state.players.find(p => p.id === pending.takerId) ?? null;
  debugLog('foul', `2D penalty (${pending.kind}) by ${taker?.name ?? pending.takerId}: ${outcome.result} (chance ${(outcome.chance * 100).toFixed(0)}%)`, {
    playerId: pending.takerId, data: { ...outcome },
  });
  if (pending.kind === 'match') {
    if (!taker) return { ...state, pendingPenalty: null };
    const gk = pending.keeperId === null ? null : state.players.find(p => p.id === pending.keeperId) ?? null;
    return finishInMatchPenalty({ ...state, pendingPenalty: null }, taker, gk, outcome.scored, outcome.chance).state;
  }
  const so = state.shootout;
  if (!so?.live) return { ...state, pendingPenalty: null };
  const team = pending.team;
  const score = { ...so.score, [team]: so.score[team] + (outcome.scored ? 1 : 0) };
  const taken = { ...so.live.taken, [team]: so.live.taken[team] + 1 };
  gameBus.emit('penaltyKick', {
    team, takerId: pending.takerId, keeperId: pending.keeperId, scored: outcome.scored, chance: outcome.chance, score, result: outcome.result,
  });
  const done = shootoutDecided(score, taken);
  return {
    ...state,
    pendingPenalty: null,
    presentationCountdown: PENALTY_KICK_INTERVAL,
    shootout: {
      ...so,
      kicks: [...so.kicks, { team, takerId: pending.takerId, keeperId: pending.keeperId, scored: outcome.scored, chance: outcome.chance }],
      score,
      shown: so.shown + 1,
      ...(done ? { finalScore: score, winner: score.A > score.B ? 'A' as const : 'B' as const } : {}),
      live: { ...so.live, taken, next: team === 'A' ? 'B' : 'A', done },
    },
  };
}

/** The end of a penalty in the match, once its outcome is known (automatic or 2D). */
function finishInMatchPenalty(state: GameState, taker: GamePlayer, gk: GamePlayer | null, scored: boolean, chance: number): TickResult {
  gameBus.emit('shot', { player: taker.id, xg: DECISION_FLAGS.FM_XG ? XG_PENALTY : chance, penalty: true });
  gameBus.emit('penaltyResolved', { team: taker.team, takerId: taker.id, keeperId: gk?.id ?? null, scored, chance });
  debugLog('foul', `Penalty by ${taker.name}: ${scored ? 'GOAL' : 'saved/missed'} (chance ${(chance * 100).toFixed(0)}%)`, {
    playerId: taker.id, data: { chance, scored },
  });
  const s: GameState = { ...state, setPiece: null };
  if (scored) {
    const newScore = { ...s.score, [taker.team]: s.score[taker.team] + 1 };
    gameBus.emit('goalScored', {
      team: taker.team, score: newScore, scorerId: taker.id, setPiece: 'penalty',
      fromX: taker.x, fromY: taker.y, goalX: taker.attackDir === 1 ? PITCH_LENGTH : 0, minute: matchMinute(s),
    });
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
      setPiece:       { type: 'goal_kick', takerId: keeper.id, countdown: restartFreeze(state, RESTART_DEAD_S.GOAL_KICK) },
    }, s.ballHolderId),
    passCompleted: false, tackled: false, goalScored: null,
  };
}

// ── Formation change mid-match ────────────────────────────────────────────────

/**
 * Swap one team's formation without substituting any players. The team reorganises: each player goes
 * to the slot of the new shape that suits him (`reorganizedSlots`), keeping his energy and pitch
 * position, with the role, anchor, bounds and engine stats of that slot. Instructions stay with the
 * slot; a man-marker keeps his target wherever he lands.
 */
export function changeFormation(
  state: GameState,
  team: TeamId,
  newFormation: Formation,
): GameState {
  const teamPlayers = state.players.filter(p => p.team === team);
  const instructions = state.slotInstructions?.[team];
  const current = team === 'A' ? state.formationA : state.formationB;
  const slotOf = reorganizedSlots(
    teamPlayers.map((p, i) => ({ id: p.id, role: p.role, slotIndex: p.slotIndex >= 0 ? p.slotIndex : i, aptitudes: p.fit?.aptitudes })),
    current.attacking,
    newFormation.attacking,
    (state.injuryVacancies?.[team] ?? []).map(v => v.slotIndex),
  );
  const updated = teamPlayers.map((p, arrIndex) =>
    placeInSlot(p, slotOf.get(p.id) ?? (p.slotIndex >= 0 ? p.slotIndex : arrIndex), newFormation, instructions));

  const otherPlayers = state.players.filter(p => p.team !== team);
  const pairs = state.manMarks?.[team];
  return refreshManMarks({
    ...state,
    players:    [...otherPlayers, ...updated].sort((a, b) => a.id - b.id),
    formationA: team === 'A' ? newFormation : state.formationA,
    formationB: team === 'B' ? newFormation : state.formationB,
    ...(pairs?.length
      ? { manMarks: { ...state.manMarks, [team]: pairs.map(m => ({ ...m, markerSlot: slotOf.get(m.markerId) ?? m.markerSlot })) } }
      : {}),
  });
}

/**
 * `p` re-built for `slotIndex` of `formation`: the slot's role, anchor, bounds and instruction, and
 * the engine stats for that role with the out-of-position factor (players without `fit` keep
 * theirs). Energy and pitch position stay. Shared by the position swap (#115) and the injury
 * vacancy (#140).
 */
function placeInSlot(
  p: GamePlayer,
  slotIndex: number,
  formation: Formation,
  instructions: (SlotInstruction | null)[] | undefined,
): GamePlayer {
  const slotDef = formation.attacking[slotIndex];
  if (!slotDef) return p;
  const role = slotDef.role;
  const setup = slotSetup(slotDef, slotIndex, p.attackDir, formation, instructions?.[slotIndex]);
  const baseStats = p.fit
    ? teamLineup(scaleStats(p.fit.stats, factorFromAptitudes(p.fit.aptitudes, role)), role)
    : p.baseStats;
  const next: GamePlayer = {
    ...p,
    role,
    slotIndex,
    basePosition:    setup.basePosition,
    bounds:          setup.bounds,
    ballSupportScale: roleEngine(role).ballSupportScale,
    baseStats,
    runtimeStats:    getRuntimeLineup(baseStats, { energy: p.energy }),
    fatigueBaselineEnergy: p.energy,
    decisionMemory:  EMPTY_DECISION_MEMORY,
  };
  delete next.engine;
  delete next.instruction;
  delete next.manMarkTargetId;
  if (setup.engine) next.engine = setup.engine;
  if (setup.instruction) next.instruction = setup.instruction;
  return next;
}

// ── Swap two starters' positions mid-match (#115) ─────────────────────────────

/**
 * Two outfield starters of `team` swap slots (e.g. invert the wingers) without using a
 * substitution. Each takes the other's slot index, role, anchor and bounds, as on a formation
 * change; the slot keeps its instruction and man-marking (they belong to the slot). Energy, pitch
 * position and attributes stay — the engine stats are rebuilt for the new role with the
 * out-of-position factor, as for a substitute entering that slot. Goalkeepers, the same player,
 * players not on the pitch or of another team are refused (the state comes back unchanged).
 */
export function swapPlayerPositions(state: GameState, team: TeamId, idA: number, idB: number): GameState {
  if (idA === idB) return state;
  const a = state.players.find(p => p.id === idA && p.team === team);
  const b = state.players.find(p => p.id === idB && p.team === team);
  if (!a || !b || a.role === 'GK' || b.role === 'GK' || a.slotIndex < 0 || b.slotIndex < 0) return state;
  const formation = team === 'A' ? state.formationA : state.formationB;
  const instructions = state.slotInstructions?.[team];

  const moveTo = (p: GamePlayer, slotIndex: number): GamePlayer => placeInSlot(p, slotIndex, formation, instructions);

  const nextA = moveTo(a, b.slotIndex);
  const nextB = moveTo(b, a.slotIndex);
  debugLog('instruction', `${a.name} (${a.role}) <-> ${b.name} (${b.role})`, {
    playerId: a.id, data: { swappedWith: b.id, slots: [a.slotIndex, b.slotIndex] },
  });
  gameBus.emit('positionsSwapped', { team, aId: a.id, bId: b.id });
  const players = state.players.map(p => (p.id === a.id ? nextA : p.id === b.id ? nextB : p));
  // The marking pairs follow the slot: re-resolve the marker ids and the `manMarkTargetId` flags.
  return refreshManMarks({ ...state, players });
}

/**
 * A starter moves to a slot nobody holds (one of ten after a red card, or an injury's empty slot), without using a
 * substitution; the slot he left becomes the empty one. Goalkeepers stay in goal and the goalkeeper's slot is never a target.
 */
export function moveToEmptySlot(state: GameState, team: TeamId, id: number, slot: number): GameState {
  const player = state.players.find(p => p.id === id && p.team === team);
  const formation = team === 'A' ? state.formationA : state.formationB;
  const def = formation.attacking[slot];
  if (!player || player.role === 'GK' || player.slotIndex < 0 || !def || def.role === 'GK') return state;
  if (state.players.some(p => p.team === team && p.slotIndex === slot)) return state;
  const moved = placeInSlot(player, slot, formation, state.slotInstructions?.[team]);
  debugLog('instruction', `${player.name} (${player.role}) -> empty ${def.role}`, { playerId: player.id, data: { from: player.slotIndex, to: slot } });
  gameBus.emit('positionsSwapped', { team, aId: player.id, bId: player.id });
  const vacancies = state.injuryVacancies?.[team];
  return refreshManMarks({
    ...state,
    players: state.players.map(p => (p.id === id ? moved : p)),
    ...(vacancies?.some(v => v.slotIndex === slot)
      ? { injuryVacancies: { ...state.injuryVacancies, [team]: vacancies.map(v => (v.slotIndex === slot ? { ...v, slotIndex: player.slotIndex } : v)) } }
      : {}),
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

/**
 * `studyPlan` for every side that came with a game plan (`GameState.study`, `.claude/rules/game/study.md`).
 * Called once at kickoff (the live match's `matchStart`; `simulateMatch` after it resets the statistics).
 */
export function emitStudyPlans(state: GameState): void {
  for (const team of ['A', 'B'] as const) {
    const st = state.study?.[team];
    if (!st) continue;
    gameBus.emit('studyPlan', { team, level: st.level, style: st.style });
    debugLog('instruction', `Team ${team} came prepared: ${st.style} (${st.level} read)`, { data: { ...st } });
  }
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

  // A missed offside's chain ends when the other side has the ball (`var.md`).
  return reevaluateTeamIntents(state.missedOffside ? { ...state, missedOffside: null } : state);
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
    setPiece:      { type: 'kickoff', takerId: kickoffHolder.id, countdown: restartFreeze(state, RESTART_DEAD_S.KICKOFF) },
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
    // FM: +2 at the break (stage 14, `Condition.ts`); flag off: 30–60% of the gap to the kick-off value.
    const recoveredEnergy = halfTimeCondition(p, recoveryScale);
    const energyChanged = recoveredEnergy !== p.energy;
    return {
      ...p,
      attackDir: (-p.attackDir) as 1 | -1,
      // Turned 180° (x and y, #142): the left winger keeps playing on his team's left.
      x:           PITCH_LENGTH - p.x,
      y:           PITCH_WIDTH - p.y,
      basePosition:   { x: PITCH_LENGTH - p.basePosition.x, y: PITCH_WIDTH - p.basePosition.y },
      targetPosition: { x: PITCH_LENGTH - p.targetPosition.x, y: PITCH_WIDTH - p.targetPosition.y },
      bounds: {
        minX: PITCH_LENGTH - p.bounds.maxX,
        maxX: PITCH_LENGTH - p.bounds.minX,
        minY: PITCH_WIDTH - p.bounds.maxY,
        maxY: PITCH_WIDTH - p.bounds.minY,
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
    missedOffside:         null,
    players:               positioned,
    ballHolderId:          kickoffHolder.id,
    pass:                  null,
    shot:                  null,
    looseBall:             null,
    matchPhase:            nextPhase,
    matchTime:             0,
    presentationCountdown: 0,
    setPiece:              { type: 'kickoff', takerId: kickoffHolder.id, countdown: restartFreeze(state, RESTART_DEAD_S.KICKOFF) },
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
  if (state.penaltyInteractive?.length) {
    // 2D penalties: no kick is resolved up front; each one waits for its answer (`applyPenaltyOutcome`).
    const a = penaltySide(state, 'A');
    const b = penaltySide(state, 'B');
    return {
      ...state,
      matchPhase: 'penalties',
      presentationCountdown: PENALTY_KICK_INTERVAL,
      pass: null, shot: null, looseBall: null, setPiece: null, pendingPenalty: null,
      shootout: {
        kicks: [], score: { A: 0, B: 0 }, finalScore: { A: 0, B: 0 }, winner: 'A', shown: 0,
        live: { order: { A: kickOrder(a.takers).map(t => t.id), B: kickOrder(b.takers).map(t => t.id) }, taken: { A: 0, B: 0 }, next: 'A', done: false },
      },
    };
  }
  const r = resolvePenaltyShootout(penaltySide(state, 'A'), penaltySide(state, 'B'), matchRandom);
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
          etStoppageFirst:  Math.floor(matchRandom() * 3) * 60,
          etStoppageSecond: Math.floor(matchRandom() * 3) * 60,
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

/** Debug line of a shot's FM xG (stage 6): model, the seven features, visible goal. */
function logShotXg(shooter: GamePlayer, fm: FmXgResult): void {
  if (!isDebugEnabled()) return;
  const f = fm.features;
  debugLog('shot', `${shooter.name} xG ${fm.xg.toFixed(3)} (${fm.model}): dist ${f.distance.toFixed(2)} · occl ${f.occluding.toFixed(2)} · between ${fm.inTriangle} · angle ${f.angleLocation.toFixed(2)} · facing ${f.angleFacing.toFixed(2)} · height ${f.height.toFixed(2)} · visible ${(f.fraction * 100).toFixed(0)}%`, {
    playerId: shooter.id, data: { xg: fm.xg, model: fm.model, ...f },
  });
}

// ── Stage 7: the shot by its trajectory (`shot-and-save.md` → "Stage 7") ──────────────────────────────────────────

const M_PER_YD_SHOT = 1 / SHOT_YD_PER_M;

function teamOfId(s: GameState, id: number): TeamId | null {
  return s.players.find(p => p.id === id)?.team ?? null;
}

/** The keeper's shot-stopping skills (0..1). */
function keeperSkillOf(gk: GamePlayer): ShotKeeperSkill {
  const w = gk.runtimeStats.withoutBall;
  return { reflex: w.gkReflex, diving: w.gkDiving, positioning: w.gkPositioning };
}

/** /test (stage 7): a physical shot by `shooterId` with a chosen technique, struck now (null without the 3D ball). */
export function testPhysicalShot(state: GameState, shooterId: number, technique: ShotTechnique): GameState {
  const shooter = state.players.find(p => p.id === shooterId);
  if (!shooter) return state;
  const skill = technique === 'header' ? Math.min(1, headingOf(shooter)) : Math.min(1, shooter.runtimeStats.withBall.shootAccuracy / 0.95);
  const shot = physicalShot(state, shooter, { technique, skill }, { xg: 0.1, chip: technique === 'chip' || undefined });
  return shot ? { ...state, ballHolderId: shooterId, shot, setPiece: null } : state;
}

interface PhysicalStrike {
  technique: ShotTechnique;
  /** Skill driving the error (finishing 0..1, heading for a header). */
  skill: number;
  /** A set piece: FM's set-piece base, no pressure. */
  setPiece?: boolean;
}

/**
 * The physical launch of a shot (stage 7): technique, aim (corner and height), launch vector to the aim, FM's launch
 * error with the shot base, the predicted crossing and the defenders who can lunge at the path. Null without the 3D
 * ball (the old dice path stays).
 */
function physicalShot(state: GameState, shooter: GamePlayer, strike: PhysicalStrike, extra: Partial<ShotState> = {}): ShotState | null {
  if (!DECISION_FLAGS.SHOT_PHYSICS || !DECISION_FLAGS.BALL_3D) return null;
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const keeper = state.players.find(p => p.team !== shooter.team && p.role === 'GK') ?? null;
  const opps = state.players.filter(p => p.team !== shooter.team);
  const header = strike.technique === 'header';
  const z0 = header ? BALL_PHYSICS.HEAD_Z : Math.max(BALL_PHYSICS.FOOT_Z, state.ball?.z ?? 0);
  const from = { x: shooter.x, y: shooter.y, z: z0 };
  const technique = strike.technique;
  const aim = aimPoint({ fromX: shooter.x, fromY: shooter.y, goalX, keeper, technique, skill: strike.skill }, matchRandom);
  const aim3 = { x: goalX, y: aim.y, z: aim.z };
  const dist = Math.hypot(goalX - shooter.x, aim.y - shooter.y);
  const dirX = (goalX - shooter.x) / Math.max(1e-6, dist);
  let base: { vx: number; vy: number; vz: number } | null = null;
  if (technique === 'lob' || technique === 'chip') {
    const along = keeper ? Math.max(1, (keeper.x - shooter.x) * dirX) : dist / 2;
    base = dipLaunch(from, { d: along, z: SHOT_PHYSICS.HAND_MAX_Z + SHOT_PHYSICS.LOB_CLEAR_YD }, aim3);
  } else if (technique === 'free_kick') {
    const wall = (state.setPiece?.wallIds ?? []).map(id => state.players.find(p => p.id === id)).filter((p): p is GamePlayer => !!p);
    // Stage 12: the wall's distance from the ball along the shot (it stands on the ball → goal line), not along x only.
    const along = wall.length === 0 ? SET_PIECE_CONFIG.WALL_DISTANCE
      : Math.min(...wall.map(w => (fmSetPiecesOn() ? Math.hypot(w.x - shooter.x, w.y - shooter.y) : Math.abs(w.x - shooter.x))));
    base = dipLaunch(from, { d: along, z: SHOT_PHYSICS.BLOCK_MAX_Z + 0.25 }, aim3);
  }
  const speedMs0 = shotSpeedMs(technique === 'free_kick' || technique === 'lob' || technique === 'chip' ? 'placed' : technique, strike.skill);
  if (!base) base = directLaunch(from, aim3, speedMs0 * SHOT_YD_PER_M);
  const speedMs = Math.hypot(base.vx, base.vy, base.vz) * M_PER_YD_SHOT;
  const pressure = strike.setPiece ? 0 : holderPressure(shooter.x, shooter.y, opps);
  const factor = shotErrorFactor(strike.skill, dist, pressure, speedMs, technique === 'volley' ? SHOT_PHYSICS.VOLLEY_MARGIN : 0,
    strike.setPiece ? SHOT_PHYSICS.BASE_SET_PIECE : SHOT_PHYSICS.BASE_SHOT);
  const longShot = !header && dist > LONG_SHOT_DISTANCE ? weatherEffectOf(state.weather).longShot : 1;
  const v = applyShotError(base, factor, gaussianDraw(), gaussianDraw(), gaussianDraw(), longShot > 0 ? 1 / longShot : 1);
  const vh = Math.max(1, Math.hypot(v.vx, v.vy));
  const T = dist / vh;
  // Where it would cross the line by free flight (no one touching it).
  const env = ballEnv(state.weather);
  const launched = { x: from.x, y: from.y, z: z0, vx: v.vx, vy: v.vy, vz: v.vz };
  const cross = predictCrossing(launched, goalX, env);
  const onTarget = !!cross && onFrame(cross.y, cross.z);
  const blocks = planShotBlocks(state, shooter, launched, Math.min(SHOT_PHYSICS.MAX_FLIGHT_S, T + 0.1), env);
  const physics: ShotPhysicsState = {
    technique, z0, vx: v.vx, vy: v.vy, vz: v.vz, speedMs, aimY: aim.y, aimZ: aim.z, errDeg: v.errDeg,
    elapsed: 0, T, blocks, touched: [], onTarget,
  };
  gameBus.emit('shotLaunched', {
    player: shooter.id, team: shooter.team, technique, speedMs, vzMs: v.vz * M_PER_YD_SHOT,
    aimY: aim.y, aimZ: aim.z, errDeg: v.errDeg, distance: dist, onTarget, blockers: blocks.length,
    fromM: distToGoalCentreM(shooter.x, shooter.y, shooter.attackDir), outsideBox: !inBoxLane(shooter.x, shooter.y, shooter.attackDir),
  });
  if (isDebugEnabled()) {
    debugLog('shot', `${shooter.name} ${technique} shot: ${speedMs.toFixed(1)} m/s, aim y ${aim.y.toFixed(1)} z ${(aim.z * M_PER_YD_SHOT).toFixed(2)} m, error ${v.errDeg.toFixed(1)}° (factor ${factor.toFixed(2)}), ${onTarget ? 'on target' : 'off target'}${cross ? ` (crosses y ${cross.y.toFixed(1)} z ${(cross.z * M_PER_YD_SHOT).toFixed(2)} m)` : ''}, ${blocks.length} blocker(s)`, {
      playerId: shooter.id, data: { technique, speedMs, factor, errDeg: v.errDeg, onTarget, blocks: blocks.length },
    });
  }
  return { shooterId: shooter.id, fromX: shooter.x, fromY: shooter.y, toX: goalX, toY: aim.y, t: 0, xg: 0, ...extra, physics };
}

/** Where a free ball crosses the goal line x = goalX within the flight limit (null: it never does). */
function predictCrossing(ball: Ball3DState, goalX: number, env: BallEnvState): { y: number; z: number; t: number } | null {
  let b = { ...ball };
  let t = 0;
  const h = SHOT_PHYSICS.SUBSTEP;
  while (t < SHOT_PHYSICS.MAX_FLIGHT_S) {
    const nb = stepFree(b, h, env).ball;
    const c = lineCrossing(b, nb, goalX);
    if (c) return { y: c.y, z: c.z, t: t + h * c.f };
    if (nb.y < -2 || nb.y > PITCH_WIDTH + 2) return null;
    if (nb.z <= 1e-6 && Math.hypot(nb.vx, nb.vy) < PASS_PHYSICS.STOP_SPEED_YD) return null;
    b = nb; t += h;
  }
  return null;
}

/** The ball's path to the line every SUBSTEP (for the blockers' and the keeper's plans). */
function shotPath(ball: Ball3DState, seconds: number, env: BallEnvState, goalX: number): PathPoint[] {
  const out: PathPoint[] = [];
  let b = { ...ball };
  const h = SHOT_PHYSICS.SUBSTEP;
  for (let t = h; t <= seconds + 1e-9; t += h) {
    const nb = stepFree(b, h, env).ball;
    if (lineCrossing(b, nb, goalX)) { out.push({ x: nb.x, y: nb.y, z: nb.z, t }); break; }
    out.push({ x: nb.x, y: nb.y, z: nb.z, t });
    b = nb;
  }
  return out;
}

/** The outfield defenders who can get a body to the shot's path in time (the earliest MAX_BLOCKERS lunge at it). */
function planShotBlocks(state: GameState, shooter: GamePlayer, ball: Ball3DState, seconds: number, env: BallEnvState): ShotBlockRun[] {
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const path = shotPath(ball, seconds, env, goalX);
  if (path.length === 0) return [];
  const runs: ShotBlockRun[] = [];
  for (const p of state.players) {
    if (p.team === shooter.team || p.role === 'GK' || isPlayerInRecovery(p)) continue;
    const plan = interceptPoint(path, {
      x: p.x, y: p.y, speed: SHOT_PHYSICS.LUNGE_SPEED, reach: shotBlockReach(p.runtimeStats.withoutBall.tackling ?? 0.5),
      reaction: SHOT_PHYSICS.BLOCK_REACTION_S, maxZ: SHOT_PHYSICS.BLOCK_MAX_Z,
    });
    if (plan) runs.push({ id: p.id, x: plan.x, y: plan.y, t: plan.t });
  }
  runs.sort((a, b) => a.t - b.t);
  return runs.slice(0, SHOT_PHYSICS.MAX_BLOCKERS);
}

/** Closest point of the segment a → b to (px, py): the distance and the fraction along it. */
function segmentApproach(ax: number, ay: number, bx: number, by: number, px: number, py: number): { d: number; f: number } {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const f = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { d: Math.hypot(ax + dx * f - px, ay + dy * f - py), f };
}

/** Rotates (vx, vy) by `deg` degrees and scales it by `k`. */
function turnVelocity(vx: number, vy: number, deg: number, k: number): { vx: number; vy: number } {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return { vx: (vx * c - vy * s) * k, vy: (vx * s + vy * c) * k };
}

/** The keeper holds the ball after a save: his ball, the goal-kick shape (as the old save did). */
function keeperHoldsShot(s: GameState, gk: GamePlayer): TickResult {
  const gkFormation = gk.team === 'A' ? s.formationA : s.formationB;
  const goalKickLayout = resolveFormationSetPieces(gkFormation).goalKick;
  let players = applyStaminaCost(s.players, gk.id, 'gkSave');
  if (goalKickLayout) players = applySetPieceToTeam(players, gk.team, goalKickLayout);
  const prevHolderId = s.ballHolderId;
  return {
    state: onPossessionTransfer({
      ...s, shot: null, ballHolderId: gk.id, possessionTime: 0, lastPasserId: null, players,
      setPiece: { type: 'goal_kick', takerId: gk.id, countdown: restartFreeze(s, RESTART_DEAD_S.GOAL_KICK) },
    }, prevHolderId),
    passCompleted: false, tackled: false, goalScored: null,
  };
}

/** A goal from a shot in flight (both shot paths): the score, the event, the kick-off, the VAR check on a missed offside. */
function scoreShotGoal(s: GameState, shooter: GamePlayer, flying: ShotState): TickResult {
  if (flying.chip && flying.physics) gameBus.emit('holderMove', { playerId: shooter.id, team: shooter.team, move: 'chip', phase: 'success', counted: true });
  const newScore = { ...s.score, [shooter.team]: s.score[shooter.team] + 1 };
  const assistId = s.lastPasserId !== null && s.lastPasserId !== shooter.id ? s.lastPasserId : undefined;
  const setPieceKind = flying.freeKick ? 'direct_free_kick' : setPieceGoalOf(s, shooter.team);
  gameBus.emit('goalScored', {
    team: shooter.team, score: newScore, scorerId: shooter.id, assistId, header: flying.header === true,
    ...(setPieceKind ? { setPiece: setPieceKind } : {}),
    fromX: flying.fromX, fromY: flying.fromY, goalX: shooter.attackDir === 1 ? PITCH_LENGTH : 0, minute: matchMinute(s),
  });
  const concedingTeam = shooter.team === 'A' ? 'B' : 'A';
  const kicked = resetToKickoff({ ...s, score: newScore }, concedingTeam);
  return {
    state: s.missedOffside
      ? checkGoalForOffside(s, kicked, {
        team: shooter.team, scorerId: shooter.id, ...(assistId !== undefined ? { assistId } : {}),
        header: flying.header === true, ...(setPieceKind ? { setPiece: setPieceKind } : {}),
      })
      : kicked,
    passCompleted: false, tackled: false, goalScored: shooter.team,
  };
}

/** Writes the physical shot's ball back on the state (the core moved it; `syncBall` keeps it). */
function withShotBall(s: GameState, b: Ball3DState, extra: { peak: number; air: number; bounces: number; dt: number }): GameState {
  const prev = s.ball;
  if (!prev || prev.phase !== 'shot') return s;
  return {
    ...s,
    ball: {
      ...prev, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, ended: undefined,
      peak: Math.max(prev.peak, extra.peak), air: prev.air + extra.air, bounces: prev.bounces + extra.bounces,
      elapsed: prev.elapsed + extra.dt,
    },
  };
}

/**
 * One tick of a physical shot (stage 7): the ball flies on free physics in sub-steps; the keeper (after his reaction)
 * dives to the point of the path he can reach, the planned blockers lunge at theirs. The first body the ball passes
 * within reach of touches it; crossing the line decides goal, woodwork, wide or over. No goal dice.
 */
function tickPhysicalShot(s: GameState, dt: number): TickResult {
  const shot = s.shot!;
  let ph = shot.physics!;
  const shooter = s.players.find(p => p.id === shot.shooterId)!;
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const gk0 = s.players.find(p => p.team !== shooter.team && p.role === 'GK') ?? null;
  const env = ballEnv(s.weather);
  const sb = s.ball && s.ball.phase === 'shot' && s.ball.key === shotKey(shot) ? s.ball : null;
  let b: Ball3DState = sb
    ? { x: sb.x, y: sb.y, z: sb.z, vx: sb.vx, vy: sb.vy, vz: sb.vz }
    : { x: shot.fromX, y: shot.fromY, z: ph.z0, vx: ph.vx, vy: ph.vy, vz: ph.vz };
  // Positions this tick (the keeper and the blockers move here, in sub-steps).
  const pos = new Map<number, { x: number; y: number }>(s.players.map(p => [p.id, { x: p.x, y: p.y }]));
  const moved = new Set<number>();
  const skill = gk0 ? keeperSkillOf(gk0) : null;
  const reactAt = (ph.reactFrom ?? 0) + (skill ? keeperReaction(skill) : 0);
  // The keeper's plan from where the ball is now: the earliest point he reaches; none for a ball going wide.
  let keeperTarget: { x: number; y: number } | null = null;
  if (gk0 && skill && !ph.keeperBeaten && !ph.touched.includes(gk0.id)) {
    const cross = predictCrossing(b, goalX, env);
    if (cross && onFrame(cross.y, cross.z, SHOT_PHYSICS.LEAVE_MARGIN)) {
      const path = shotPath(b, cross.t + 0.05, env, goalX);
      const plan = interceptPoint(path, {
        x: gk0.x, y: gk0.y, speed: keeperDiveSpeed(skill), reach: keeperHandReach(skill),
        reaction: Math.max(0, reactAt - ph.elapsed), maxZ: SHOT_PHYSICS.HAND_MAX_Z,
      });
      keeperTarget = plan ? { x: plan.x, y: plan.y } : { x: goalX - shooter.attackDir * 0.5, y: Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, cross.y)) };
    }
  }
  const h = SHOT_PHYSICS.SUBSTEP;
  let left = dt, peak = b.z, air = 0, bounces = 0, used = 0;
  const finish = (state: GameState): GameState => {
    // Movement of the keeper and the blockers this tick, through the kinematic bookkeeping.
    const log = newMoveLog();
    const players = state.players.map(p => {
      if (!moved.has(p.id)) return p;
      const q = pos.get(p.id)!;
      const vx = (q.x - p.x) / dt, vy = (q.y - p.y) / dt;
      return finishMove(p, state, dt, q.x, q.y, vx, vy, 1, p.runtimeStats.withoutBall.pressSpeed, log);
    });
    emitMoveLog(log);
    return { ...state, players };
  };
  const done = (state: GameState) => withShotBall(state, b, { peak, air, bounces, dt: used });
  while (left > 1e-9) {
    const step = Math.min(h, left);
    const t0 = ph.elapsed;
    ph = { ...ph, elapsed: t0 + step };
    // Bodies move.
    if (gk0 && keeperTarget && ph.elapsed >= reactAt) {
      const q = pos.get(gk0.id)!;
      const d = Math.hypot(keeperTarget.x - q.x, keeperTarget.y - q.y);
      if (d > 1e-3) {
        const k = Math.min(1, (keeperDiveSpeed(skill!) * step) / d);
        pos.set(gk0.id, { x: q.x + (keeperTarget.x - q.x) * k, y: q.y + (keeperTarget.y - q.y) * k });
        moved.add(gk0.id);
      }
    }
    if (ph.elapsed >= SHOT_PHYSICS.BLOCK_REACTION_S) {
      for (const r of ph.blocks) {
        if (ph.touched.includes(r.id)) continue;
        const q = pos.get(r.id);
        if (!q) continue;
        const d = Math.hypot(r.x - q.x, r.y - q.y);
        if (d < 1e-3) continue;
        const k = Math.min(1, (SHOT_PHYSICS.LUNGE_SPEED * step) / d);
        pos.set(r.id, { x: q.x + (r.x - q.x) * k, y: q.y + (r.y - q.y) * k });
        moved.add(r.id);
      }
    }
    // The ball flies.
    const prev = b;
    const st = stepFree(b, step, env);
    b = st.ball; peak = Math.max(peak, st.peak); air += st.air; bounces += st.bounces;
    left -= step; used += step;
    // A body in the way (outfield defenders), then the keeper's hands. `close` books the movement when it ends here.
    const unfinished = (): GameState => done({ ...s, shot: { ...shot, physics: ph } });
    let touch: ShotTouchResult | null = null;
    for (const p of s.players) {
      if (p.team === shooter.team || p.role === 'GK' || ph.touched.includes(p.id) || isPlayerInRecovery(p)) continue;
      const q = pos.get(p.id)!;
      const ap = segmentApproach(prev.x, prev.y, b.x, b.y, q.x, q.y);
      const z = prev.z + (b.z - prev.z) * ap.f;
      if (z > SHOT_PHYSICS.BLOCK_MAX_Z || ap.d > shotBlockReach(p.runtimeStats.withoutBall.tackling ?? 0.5)) continue;
      b = { ...b, x: prev.x + (b.x - prev.x) * ap.f, y: prev.y + (b.y - prev.y) * ap.f, z };
      touch = shotBlockTouch(unfinished(), finish, shooter, p, b);
      break;
    }
    if (!touch && gk0 && skill && !ph.keeperBeaten && !ph.touched.includes(gk0.id)) {
      const q = pos.get(gk0.id)!;
      const ap = segmentApproach(prev.x, prev.y, b.x, b.y, q.x, q.y);
      const z = prev.z + (b.z - prev.z) * ap.f;
      const reach = keeperHandReach(skill);
      if (z <= SHOT_PHYSICS.HAND_MAX_Z && ap.d <= reach) {
        b = { ...b, x: prev.x + (b.x - prev.x) * ap.f, y: prev.y + (b.y - prev.y) * ap.f, z };
        touch = keeperShotTouch(unfinished(), finish, shooter, gk0, b, ap.d / reach, skill, goalX, env);
      }
    }
    if (touch) {
      if (touch.kind === 'end') return touch.result;
      ph = touch.physics; b = touch.ball;
      if (gk0 && ph.reactFrom !== undefined && ph.reactFrom === ph.elapsed) keeperTarget = null;
      continue;
    }
    // The goal line.
    const c = lineCrossing(prev, b, goalX);
    if (c) {
      b = { ...b, x: goalX, y: c.y, z: c.z };
      return shotCrossesLine(finish(done({ ...s, shot: { ...shot, physics: ph } })), shooter, gk0, c.y, c.z);
    }
    const outSide = b.y < 0 || b.y > PITCH_WIDTH || b.x < 0 || b.x > PITCH_LENGTH;
    const dead = b.z <= 1e-6 && Math.hypot(b.vx, b.vy) < PASS_PHYSICS.STOP_SPEED_YD;
    if (outSide || dead || ph.elapsed >= SHOT_PHYSICS.MAX_FLIGHT_S) {
      const st2 = finish(done({ ...s, shot: { ...shot, physics: ph } }));
      if (outSide) {
        const lastTeam = ph.deflectedBy !== undefined ? (st2.players.find(p => p.id === ph.deflectedBy)?.team ?? shooter.team) : shooter.team;
        const award: TeamId = lastTeam === 'A' ? 'B' : 'A';
        gameBus.emit('shotResolved', { player: shooter.id, xg: shot.xg, danger: 0, isGoal: false, inPosts: false, fromX: shot.fromX, fromY: shot.fromY, toX: b.x, toY: b.y, outcome: 'wide' });
        return resolveOOBSetPiece({ ...st2, shot: null }, 'throw_in', award, b.x, b.y, shooter.id, 'clearance');
      }
      const toucher = ph.deflectedBy !== undefined ? (st2.players.find(p => p.id === ph.deflectedBy) ?? shooter) : shooter;
      return { state: runLoose(st2, toucher, b.x, b.y, b.vx, b.vy, 'block', true), passCompleted: false, tackled: false, goalScored: null };
    }
  }
  const next = finish(done({ ...s, shot: { ...shot, t: Math.min(0.99, ph.elapsed / Math.max(0.05, ph.T)), physics: ph } }));
  return { state: next, passCompleted: false, tackled: false, goalScored: null };
}

type ShotTouchResult =
  | { kind: 'on'; physics: ShotPhysicsState; ball: Ball3DState }
  | { kind: 'end'; result: TickResult };

/** A defender's body in the shot's way: he controls it (rare), sends it on, or it rebounds loose off him. */
function shotBlockTouch(s: GameState, close: (st: GameState) => GameState, shooter: GamePlayer, d: GamePlayer, b: Ball3DState): ShotTouchResult {
  const shot = s.shot!;
  const ph = shot.physics!;
  const speedMs = Math.hypot(b.vx, b.vy) * M_PER_YD_SHOT;
  const c = blockChances(d.runtimeStats.withBall.firstTouch, speedMs);
  const r = matchRandom();
  if (r >= c.control && r < c.control + c.deflectOn) {
    const turned = turnVelocity(b.vx, b.vy, (matchRandom() * 2 - 1) * SHOT_PHYSICS.DEFLECT_DEG, SHOT_PHYSICS.DEFLECT_KEEP);
    gameBus.emit('shotDeflected', { player: shooter.id, blockerId: d.id });
    debugLog('shot', `${d.name} deflects ${shooter.name}'s shot on (${speedMs.toFixed(1)} m/s)`, { playerId: d.id });
    return {
      kind: 'on',
      physics: { ...ph, touched: [...ph.touched, d.id], deflectedBy: d.id, reactFrom: ph.elapsed },
      ball: { ...b, vx: turned.vx, vy: turned.vy, vz: b.vz * SHOT_PHYSICS.DEFLECT_KEEP },
    };
  }
  s = close(s);
  gameBus.emit('shotBlocked', { player: shooter.id, blockerId: d.id });
  s = { ...s, players: applyStaminaCost(s.players, d.id, 'interception') };
  if (r < c.control) {
    debugLog('shot', `${d.name} blocks and keeps ${shooter.name}'s shot`, { playerId: d.id });
    const prevHolderId = s.ballHolderId;
    return {
      kind: 'end',
      result: { state: onPossessionTransfer({ ...s, shot: null, ballHolderId: d.id, possessionTime: 0, lastPasserId: null }, prevHolderId), passCompleted: false, tackled: false, goalScored: null },
    };
  }
  const dir = scatterDirection(-b.vx, -b.vy, SHOT_PHYSICS.REBOUND_DEG);
  const k = SHOT_PHYSICS.REBOUND_KEEP_MIN + matchRandom() * (SHOT_PHYSICS.REBOUND_KEEP_MAX - SHOT_PHYSICS.REBOUND_KEEP_MIN);
  const v = Math.hypot(b.vx, b.vy) * k;
  debugLog('shot', `${d.name} blocks ${shooter.name}'s shot (${speedMs.toFixed(1)} m/s): it rebounds loose`, { playerId: d.id });
  const st = s.ball ? { ...s, ball: { ...s.ball, vz: Math.abs(b.vz) * 0.3 } } : s;
  return { kind: 'end', result: { state: runLoose(st, d, b.x, b.y, dir.x * v, dir.y * v, 'block', true), passCompleted: false, tackled: false, goalScored: null } };
}

/** The keeper gets his hands to the shot: he stops it (held, spilled or parried behind) or it goes on past his fingertips. */
function keeperShotTouch(
  s: GameState, close: (st: GameState) => GameState, shooter: GamePlayer, gk: GamePlayer, b: Ball3DState, offset: number, skill: ShotKeeperSkill, goalX: number, env: BallEnvState,
): ShotTouchResult {
  const shot = s.shot!;
  const ph = shot.physics!;
  const speedMs = Math.hypot(b.vx, b.vy, b.vz) * M_PER_YD_SHOT;
  const sc = saveChances(skill, offset, speedMs);
  const cross = predictCrossing(b, goalX, env);
  const wasOnTarget = !!cross && onFrame(cross.y, cross.z);
  if (matchRandom() >= sc.stop) {
    const turned = turnVelocity(b.vx, b.vy, (matchRandom() * 2 - 1) * SHOT_PHYSICS.FINGERTIP_DEG, SHOT_PHYSICS.FINGERTIP_KEEP);
    debugLog('keeper', `${gk.name} gets a hand to it but can't keep it out (stop ${(sc.stop * 100).toFixed(0)}%, offset ${offset.toFixed(2)}, ${speedMs.toFixed(1)} m/s)`, { playerId: gk.id });
    return {
      kind: 'on',
      physics: { ...ph, touched: [...ph.touched, gk.id], deflectedBy: gk.id, keeperBeaten: true },
      ball: { ...b, vx: turned.vx, vy: turned.vy, vz: b.vz * SHOT_PHYSICS.FINGERTIP_KEEP },
    };
  }
  s = close(s);
  const odds = saveOutcomeChances(shotStoppingSkill(gk), sc.difficulty);
  const roll = matchRandom();
  const kind = roll < odds.parry ? 'parry' : roll < odds.parry + odds.spill ? 'spill' : 'hold';
  gameBus.emit('shotResolved', {
    player: shooter.id, xg: shot.xg, danger: 1 - sc.stop, isGoal: false, inPosts: wasOnTarget,
    fromX: shot.fromX, fromY: shot.fromY, toX: b.x, toY: b.y, outcome: 'saved',
  });
  gameBus.emit('keeperSave', { keeperId: gk.id, kind, grade: sc.grade, x: b.x, y: b.y, z: b.z });
  debugLog('keeper', `${gk.name} ${kind === 'hold' ? 'holds' : kind === 'spill' ? 'spills' : 'parries'} the shot — ${sc.grade} save (stop ${(sc.stop * 100).toFixed(0)}%, offset ${offset.toFixed(2)}, ${speedMs.toFixed(1)} m/s)`, {
    playerId: gk.id, data: { ...odds, stop: sc.stop, offset, speedMs, grade: sc.grade },
  });
  if (kind === 'hold') return { kind: 'end', result: keeperHoldsShot(s, gk) };
  if (kind === 'spill') {
    const point = {
      x: Math.max(0, Math.min(PITCH_LENGTH, b.x - shooter.attackDir * KEEPER_CONFIG.SAVE.SPILL_DIST)),
      y: Math.max(0, Math.min(PITCH_WIDTH, b.y)),
    };
    const players = applyStaminaCost(s.players, gk.id, 'gkSave');
    return { kind: 'end', result: { state: dropLooseAt({ ...s, shot: null, players }, gk, point), passCompleted: false, tackled: false, goalScored: null } };
  }
  const exitX = goalX === 0 ? -1 : PITCH_LENGTH + 1;
  const saved = { ...s, players: applyStaminaCost(s.players, gk.id, 'gkSave'), shot: null };
  return { kind: 'end', result: resolveOOBSetPiece(saved, 'corner', shooter.team, exitX, b.y, gk.id, 'clearance', 'save') };
}

/** The ball reaches the goal line: in, off the woodwork, wide or over. */
function shotCrossesLine(s: GameState, shooter: GamePlayer, gk: GamePlayer | null, y: number, z: number): TickResult {
  const shot = s.shot!;
  const ph = shot.physics!;
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const kind = classifyCrossing(y, z);
  const base = { player: shooter.id, xg: shot.xg, fromX: shot.fromX, fromY: shot.fromY, toX: goalX, toY: y };
  if (kind === 'goal') {
    gameBus.emit('shotResolved', { ...base, danger: 1, isGoal: true, inPosts: true, outcome: 'goal' });
    if (gk && !ph.touched.includes(gk.id)) debugLog('keeper', `${gk.name} beaten: the shot never came within his reach`, { playerId: gk.id });
    return scoreShotGoal({ ...s, shot: null }, shooter, shot);
  }
  if (kind === 'post' || kind === 'bar') {
    gameBus.emit('shotResolved', { ...base, danger: 0.8, isGoal: false, inPosts: false, outcome: 'woodwork' });
    gameBus.emit('shotWoodwork', { player: shooter.id, team: shooter.team, part: kind });
    debugLog('shot', `${shooter.name}'s shot hits the ${kind}`, { playerId: shooter.id });
    const b = s.ball!;
    const k = SHOT_PHYSICS.WOODWORK_KEEP;
    const dir = scatterDirection(-b.vx, kind === 'post' ? -b.vy : b.vy, 35);
    const v = Math.hypot(b.vx, b.vy) * k;
    const x = goalX === 0 ? 0.4 : PITCH_LENGTH - 0.4;
    const st = { ...s, ball: { ...b, x, vz: kind === 'bar' ? -Math.abs(b.vz) * k : b.vz * k } };
    return { state: runLoose(st, shooter, x, y, dir.x * v, dir.y * v, 'woodwork', true), passCompleted: false, tackled: false, goalScored: null };
  }
  // Wide or over: how far from the frame it went (0 at 2 yd or more).
  const wideBy = kind === 'wide' ? Math.min(Math.abs(y - GOAL_Y_MIN), Math.abs(y - GOAL_Y_MAX)) : Math.max(0, z - BALL_PHYSICS.CROSSBAR_Z);
  gameBus.emit('shotResolved', { ...base, danger: Math.max(0, 0.6 * (1 - wideBy / 2)), isGoal: false, inPosts: false, outcome: kind });
  const exitX = goalX === 0 ? -1 : PITCH_LENGTH + 1;
  const toucher = ph.deflectedBy !== undefined ? s.players.find(p => p.id === ph.deflectedBy) : undefined;
  if (toucher && toucher.team !== shooter.team) {
    return resolveOOBSetPiece({ ...s, shot: null }, 'corner', shooter.team, exitX, y, toucher.id, 'clearance', toucher.role === 'GK' ? 'save' : 'deflection');
  }
  const defTeam: TeamId = shooter.team === 'A' ? 'B' : 'A';
  return resolveOOBSetPiece({ ...s, shot: null }, 'goal_kick', defTeam, exitX, y, shooter.id, 'clearance');
}

/** Stage 17 (ratings): who set the shot up (`lastPasserId`) and whether a set piece is still on, for the `shot` event. */
function shotOrigin(state: GameState, shooterId: number): { passerId?: number; setPiece?: true } {
  const passerId = state.lastPasserId !== null && state.lastPasserId !== shooterId ? state.lastPasserId : undefined;
  return { ...(passerId !== undefined ? { passerId } : {}), ...(state.setPiecePhase ? { setPiece: true as const } : {}) };
}

function startShot(state: GameState): GameState {
  if (state.setPiece?.variant === 'direct' && state.setPiece.takerId === state.ballHolderId) return startDirectFreeKick(state);
  const shooter = state.players.find(p => p.id === state.ballHolderId)!;
  const shotKeeper = state.players.find((p) => p.team !== shooter.team && p.role === 'GK');

  // xG context: distance, open goal angle, and nearby defensive pressure
  const goalX     = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const dist      = Math.abs(goalX - shooter.x);
  const openAngle = computeOpenAngle(shooter.x, shooter.y, goalX);
  const defenders = state.players.filter(p => p.team !== shooter.team);
  const pressure  = computeWeightedPressure(shooter, defenders);
  // Stage 6 (`xg.md`): the FM xG is the shot's number; the resolution below still rolls on it (stage 7 replaces that).
  const fmXg = DECISION_FLAGS.FM_XG ? shotXg(shooter, state.players, 'ground') : null;
  const xg = fmXg ? fmXg.xg : computeXG(dist, openAngle, pressure);
  if (fmXg?.fm) logShotXg(shooter, fmXg.fm);

  gameBus.emit('shot', { player: shooter.id, xg, ...shotOrigin(state, shooter.id) });

  // Stage 7: a physical strike; the blocks, the keeper and the line decide it in flight (`tickPhysicalShot`).
  if (DECISION_FLAGS.SHOT_PHYSICS && DECISION_FLAGS.BALL_3D) {
    const skill = Math.min(1, shooter.runtimeStats.withBall.shootAccuracy / 0.95);
    const kDepth = shotKeeper ? Math.abs(shotKeeper.x - goalX) : Infinity;
    const sDepth = Math.abs(shooter.x - goalX);
    const lineY = shotKeeper ? shooter.y + ((GOAL_Y_MIN + GOAL_Y_MAX) / 2 - shooter.y) * ((sDepth - kDepth) / Math.max(1, sDepth)) : 0;
    const keeperAhead = !!shotKeeper && kDepth < sDepth - 1 && Math.abs(shotKeeper.y - lineY) < 4;
    const technique = chooseTechnique({
      distYd: Math.hypot(goalX - shooter.x, (GOAL_Y_MIN + GOAL_Y_MAX) / 2 - shooter.y), keeperOffLine: kDepth, keeperAhead,
      keeperGap: shotKeeper ? Math.hypot(shotKeeper.x - shooter.x, shotKeeper.y - shooter.y) : 0, ballZ: state.ball?.z ?? 0, skill,
    }, matchRandom);
    const shot = physicalShot(state, shooter, { technique, skill }, { xg });
    if (shot) return { ...state, shot, setPiece: null };
  }

  const { toX, toY } = computeShotAim(shooter, {
    keeperOut: !shotKeeper || !keeperReachesShot(shotKeeper, shooter.x, shooter.y, goalX),
  });

  // Blocked on its line (stage 4, `movement.md`): the ball rebounds loose off the defender's body.
  if (DECISION_FLAGS.SHOT_BLOCKS) {
    const b = shotBlocker(shooter, toX, toY, state.players);
    if (b && resolveShotBlock(b.perp)) {
      const dir = scatterDirection(shooter.x - b.player.x, shooter.y - b.player.y, MOVEMENT.SHOT_REBOUND_MAX_DEG);
      const v = reboundSpeed();
      gameBus.emit('shotBlocked', { player: shooter.id, blockerId: b.player.id });
      debugLog('movement', `${b.player.name} blocks ${shooter.name}'s shot (${b.perp.toFixed(1)} yd off the line)`, { playerId: b.player.id });
      return runLoose({ ...state, setPiece: null }, b.player, b.player.x, b.player.y, dir.x * v, dir.y * v, 'block');
    }
  }

  return {
    ...state,
    shot: { shooterId: shooter.id, fromX: shooter.x, fromY: shooter.y, toX, toY, t: 0, xg },
    // Clear any active set piece — once the ball is struck, play is live
    setPiece: null,
  };
}

/**
 * A chip over an advanced keeper (`HolderMoves.ts`): decided at the strike (the ball goes over him, so the keeper never
 * meets it). A goal flies into the net, a miss lands wide of the post.
 */
function startChip(state: GameState): GameState {
  const shooter = state.players.find(p => p.id === state.ballHolderId)!;
  const keeper = state.players.find(p => p.team !== shooter.team && p.role === 'GK') ?? null;
  const chance = chipMove(shooter, keeper, 0.5, 1.6)?.chance ?? 0;
  if (chance <= 0) return startShot(state);
  // Stage 7: the chip is a physical lob over him; whether it goes in is the ball's flight against his hands.
  if (DECISION_FLAGS.SHOT_PHYSICS && DECISION_FLAGS.BALL_3D) {
    const xg = DECISION_FLAGS.FM_XG ? shotXg(shooter, state.players, 'ground').xg : chance;
    const shot = physicalShot(state, shooter, { technique: 'chip', skill: Math.min(1, shooter.runtimeStats.withBall.shootAccuracy / 0.95) }, { xg, chip: true });
    if (shot) {
      gameBus.emit('shot', { player: shooter.id, xg, ...shotOrigin(state, shooter.id) });
      gameBus.emit('holderMove', { playerId: shooter.id, team: shooter.team, move: 'chip', phase: 'fail' });
      return { ...state, shot, setPiece: null };
    }
  }
  const isGoal = resolveChip(chance);
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  // Stage 6: the statistic is the FM xG of the shot; the chip's own chance still decides it.
  gameBus.emit('shot', { player: shooter.id, xg: DECISION_FLAGS.FM_XG ? shotXg(shooter, state.players, 'ground').xg : chance, ...shotOrigin(state, shooter.id) });
  gameBus.emit('holderMove', { playerId: shooter.id, team: shooter.team, move: 'chip', phase: isGoal ? 'success' : 'fail' });
  debugLog('keeper', `${shooter.name} chips ${keeper?.name ?? 'the keeper'} (${(chance * 100).toFixed(0)}%)`, { playerId: shooter.id });
  return {
    ...state,
    shot: {
      shooterId: shooter.id, fromX: shooter.x, fromY: shooter.y, toX: goalX, toY: chipTargetY(shooter, isGoal), t: 0, xg: chance,
      chip: true, ...(isGoal ? { outcome: { isGoal: true, goalChance: chance } } : {}),
    },
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

function startPass(state: GameState, forcedTargetId?: number): GameState {
  const holder    = state.players.find(p => p.id === state.ballHolderId)!;
  let teammates   = getTeammates(state, holder.id);
  if (teammates.length === 0) return state;
  // Set-piece restrictions (`set-pieces-play.md`): a throw-in only reaches THROW_IN_RANGE; the
  // short corner / free kick goes to the nearest outfield teammate.
  const sp = state.setPiece;
  if (sp && sp.takerId === holder.id) {
    const dist = (p: GamePlayer) => Math.hypot(p.x - holder.x, p.y - holder.y);
    const nearest = (pool: GamePlayer[]) => pool.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    if (sp.type === 'throw_in' && fmSetPiecesOn()) {
      // Stage 12: FM's short throw — within 20 m, backward 40 % of the time.
      teammates = throwInPool(holder, teammates, matchRandom()).pool;
    } else if (sp.type === 'throw_in') {
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
  // A receiver fixed by the decision (one-on-one gate, `pass.md`) skips the weighted pick.
  const forced  = forcedTargetId !== undefined ? lanes.find(l => l.toId === forcedTargetId) : undefined;
  if (forced) chosen = forced;
  else if (total > 0) {
    let roll = matchRandom() * total;
    for (let i = 0; i < top3.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) { chosen = top3[i]!; break; }
    }
  }
  const to     = state.players.find(p => p.id === chosen.toId)!;

  // Snapshot offside position at the moment the pass is played (not at arrival)
  // Stage 12: no offside from a throw-in, a goal kick or a corner (the law).
  const receiverOffside = noOffsideRestart(state) ? false : checkReceiverOffside(holder, to, state.players);

  const distance = Math.sqrt((to.x - holder.x) ** 2 + (to.y - holder.y) ** 2);

  // Launch error (stage 4b, `fm-numbers.md`): a long pass is lofted (a high ball contested where it lands); a pass to
  // feet lands off target by an error growing with distance and pressure, shrinking with passing.
  let miss: { x: number; y: number; vx: number; vy: number } | null = null;
  let physics: PassState['physics'];
  if ((DECISION_FLAGS.PASS_ERROR || passPhysicsOn()) && !state.setPiece && distance > 0.5) {
    if (distance > FM_NUMBERS.LOFT_YD) {
      debugLog('pass', `${holder.name} lofts a ${distance.toFixed(0)}-yd pass to ${to.name}`, { playerId: holder.id });
      return startAerialBall({ ...state, setPiece: null }, 'long_ball', { x: to.x, y: to.y }, to.id, matchRandom, true);
    }
  }
  if (passPhysicsOn() && distance > 0.5) {
    // Stage 4 (`pass-physics.md`): FM's launch (speed and loft by distance), the passer's error on the vector; the
    // ball arrives where the physics takes it. Set pieces are exempt from the error (as in 4b).
    // Stage 12: a restart pass has FM's set-piece error (base 90, no pressure).
    const factor = state.setPiece
      ? (fmSetPiecesOn() ? passErrorFactor(holder.runtimeStats.withBall.passingSkill, distance, 0) * setPieceErrorScale() : 0)
      : passErrorFactor(holder.runtimeStats.withBall.passingSkill, distance, holderPressure(holder.x, holder.y, opponents));
    const z0 = state.setPiece?.type === 'throw_in' ? BALL_PHYSICS.HEAD_Z : BALL_PHYSICS.FOOT_Z;
    physics = buildGroundLaunch({ x: holder.x, y: holder.y }, { x: to.x, y: to.y }, z0, ballEnv(state.weather), factor,
      launchNormals(matchRandom), vz => passTypeOf('regular', vz)).launch;
  } else if (DECISION_FLAGS.PASS_ERROR && !state.setPiece && distance > 0.5) {
    const pressure = holderPressure(holder.x, holder.y, opponents);
    const [z0, z1] = gaussianPair(matchRandom);
    const l = passLaunch(holder.runtimeStats.withBall.passingSkill, distance, pressure, to.runtimeStats.withBall.firstTouch, z0, z1);
    if (l.miss) {
      const ux = (to.x - holder.x) / distance, uy = (to.y - holder.y) / distance;
      const x = Math.max(0.5, Math.min(PITCH_LENGTH - 0.5, to.x + ux * l.along - uy * l.side));
      const y = Math.max(0.5, Math.min(PITCH_WIDTH - 0.5, to.y + uy * l.along + ux * l.side));
      const v = FM_NUMBERS.MISS_ROLL_SPEED + Math.max(0, l.along);
      miss = { x, y, vx: ux * v, vy: uy * v };
      debugLog('pass', `${holder.name}'s pass to ${to.name} is off target (${l.along.toFixed(1)} / ${l.side.toFixed(1)} yd, P ${pressure.toFixed(0)})`, { playerId: holder.id });
    }
  }

  if (fmSetPiecesOn()) emitSetPieceTaken(state, holder, state.setPiece?.type === 'corner' || state.setPiece?.variant === 'box' || state.setPiece?.type === 'goal_kick' ? 'short' : 'pass', to);
  gameBus.emit('passAttempted', { player: holder.id, toId: to.id, distance: distance });
  // Switch-of-play: the chosen lane earned a far-flank descriptor bonus. Detected
  // from the descriptor-derived flag on PassLaneInfo, never by naming the intent.
  if (chosen.switchPass) gameBus.emit('switchPlayPass', { player: holder.id, toId: to.id });
  // Clear any active set piece — once the pass leaves the taker's foot, play is live
  const pass: PassState = {
      fromId: state.ballHolderId,
      toId: to.id,
      toX: miss ? miss.x : to.x,
      toY: miss ? miss.y : to.y,
      kind: 'regular',
      t: 0,
      distance,
      ...(miss ? { miss: { vx: miss.vx, vy: miss.vy } } : {}),
      ...(physics ? { physics } : {}),
      receiverOffside,
      offsideLineX: offsideLineAt(holder, state.players),
      intendedRunnerId: null,
      // A restart pass (throw-in, short corner) is never rolled to run out for a throw-in on arrival.
      ...(state.setPiece ? { fromSetPiece: true } : {}),
  };
  emitPassLaunched(holder, pass);
  return { ...state, pass, setPiece: null };
}

/**
 * Sprint speed for a chasing player (yards/second). Re-uses pressSpeed and
 * applies heavier acceleration / top-end boosts than press to model an all-out
 * sprint. Mirrors the formula in ThroughBallCells.effectiveSprintSpeed.
 */
/** Distance to (x, y) of the nearest outfield player other than `exceptId` (either team). */
function nearestOutfieldTo(players: readonly GamePlayer[], exceptId: number, x: number, y: number): number {
  let best = Infinity;
  for (const q of players) {
    if (q.id === exceptId || q.role === 'GK') continue;
    best = Math.min(best, Math.hypot(q.x - x, q.y - y));
  }
  return best;
}

/**
 * A loose ball inside a keeper's penalty area, with him faster to it than everyone else: he chases it, every tick
 * (the ball drifts and the commit at the start of the race may have left him out — e.g. the ball he flapped).
 */
function keeperClaimsLooseBall(s: GameState, lb: NonNullable<GameState['looseBall']>): GameState {
  const etaTo = (p: GamePlayer) => raceEta(p, lb.x, lb.y, chaseSprintSpeed(p));
  for (const gk of s.players) {
    if (gk.role !== 'GK' || isPlayerInRecovery(gk)) continue;
    const inBox = isInGoalScoreArea(lb.x, lb.y, gk.attackDir === 1 ? 0 : PITCH_LENGTH);
    if (!inBox || defenderCovers(gk, lb, s.players)) continue;
    const gkEta = etaTo(gk);
    const bestOther = s.players.reduce((m, p) => (p.id === gk.id || isPlayerInRecovery(p) ? m : Math.min(m, etaTo(p))), Infinity);
    if (!keeperTakesLoose(inBox, gkEta, bestOther)) continue;
    if (gk.decisionMemory?.decision?.type === 'chase_loose_ball') return s;
    gameBus.emit('keeperComeOut', { keeperId: gk.id, kind: 'loose', depth: depthFrom(gk.attackDir === 1 ? 0 : PITCH_LENGTH, lb.x) });
    debugLog('keeper', `${gk.name} comes for the loose ball in his box`, { playerId: gk.id });
    const chase: PlayerDecision = { type: 'chase_loose_ball', toX: lb.x, toY: lb.y };
    const path: DecisionPath = gk.team === lb.fromTeamLastTouch ? 'TEAM_WITH_BALL' : 'TEAM_WITHOUT_BALL';
    return {
      ...s,
      decisions: { ...s.decisions, [gk.id]: chase },
      players: s.players.map(p => (p.id === gk.id
        ? { ...p, decisionMemory: { path, decision: chase, commitTicks: COMMIT_TICKS.chase_loose_ball } }
        : p)),
    };
  }
  return s;
}

/** The ball is loose and `p`, a keeper, was the last to touch it (spilled save, flapped cross). */
function looseKeeper(s: GameState, p: GamePlayer): boolean {
  return s.looseBall !== null && p.role === 'GK' && s.looseBall.fromPasserId === p.id;
}

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

/** Movement multiplier of a player in recovery (duel default, or the race-loser one, #145); 1 otherwise. */
function recoverySpeedMult(p: GamePlayer): number {
  return p.recoveryTime > 0 ? (p.recoverySpeed ?? DUEL_RECOVERY_SPEED_FACTOR) : 1;
}

// ── Kinematics (`.claude/rules/game-engine/kinematics.md`) ───────────────────

/** Distance and sprints of one movement pass, emitted as one `playerMoved` event. */
interface MoveLog { moves: Array<[number, number]>; sprints: number[] }
const newMoveLog = (): MoveLog => ({ moves: [], sprints: [] });
function emitMoveLog(log: MoveLog): void {
  if (log.moves.length > 0 || log.sprints.length > 0) gameBus.emit('playerMoved', log);
}

const STANDING = { x: 0, y: 0 } as const;

/**
 * The velocity a player carries into this step: only when his last kinematic step was the previous step (matchTime
 * moved by one step) and ended where he stands. A teleport (set piece, kick-off, swap), a freeze or a step he did not
 * move in (holder passing, standing) starts him from standstill.
 */
function carriedVelocity(p: GamePlayer, s: GameState, dt: number): { x: number; y: number } {
  const k = p.kin;
  if (!k || !p.vel || k.x !== p.x || k.y !== p.y) return STANDING;
  const gap = s.matchTime - k.t;
  return gap >= 0 && gap <= 1.5 * dt * clockScaleOf(s) ? p.vel : STANDING;
}

/**
 * Ends a movement step: position, velocity, the kinematic memo, sprint tracking and the distance log. `topRef` is the
 * player's top running speed for the sprint threshold (pressSpeed off the ball, carrySpeed with it).
 */
function finishMove(
  p: GamePlayer, s: GameState, dt: number, x: number, y: number, vx: number, vy: number, turn: number, topRef: number,
  log: MoveLog,
): GamePlayer {
  const yards = Math.hypot(x - p.x, y - p.y);
  const speed = yards / dt;
  if (yards > 0) log.moves.push([p.id, yards]);
  const prev = p.sprint ?? { secs: 0, counted: false };
  let sprint = prev;
  if (speed >= KINEMATICS_CONFIG.SPRINT_FRACTION * topRef && topRef > 0) {
    const secs = prev.secs + dt;
    const counts = !prev.counted && secs >= KINEMATICS_CONFIG.SPRINT_SECONDS - 1e-9;
    if (counts) log.sprints.push(p.id);
    sprint = { secs, counted: prev.counted || counts };
  } else if (prev.secs > 0 || prev.counted) {
    sprint = { secs: 0, counted: false };
  }
  return { ...p, x, y, vel: { x: vx, y: vy }, kin: { x, y, t: s.matchTime, turn }, sprint };
}

/**
 * Moves `p` toward `target` at top speed `vTop` (yd/s) with the kinematic layer, or to `legacy` (the position the engine
 * before kinematics computed, bit for bit) with the layer off.
 */
function moveToward(
  p: GamePlayer, s: GameState, dt: number, target: { x: number; y: number }, vTop: number,
  legacy: { x: number; y: number }, log: MoveLog,
): GamePlayer {
  const topRef = p.runtimeStats.withoutBall.pressSpeed;
  if (!KINEMATICS_CONFIG.ENABLED) {
    return finishMove(p, s, dt, legacy.x, legacy.y, (legacy.x - p.x) / dt, (legacy.y - p.y) / dt, 1, topRef, log);
  }
  const v = carriedVelocity(p, s, dt);
  const r: KinStep = stepToward(
    { x: p.x, y: p.y, vx: v.x, vy: v.y, accel: p.runtimeStats.withoutBall.acceleration }, target.x, target.y, vTop, dt,
    { dropToTop: p.recoveryTime > 0 },
  );
  return finishMove(p, s, dt, r.x, r.y, r.vx, r.vy, r.turn, topRef, log);
}

/** The carrier's step along a direction (no arrival), clamped to the pitch; `legacy` with the layer off. */
function carryAlong(
  p: GamePlayer, s: GameState, dt: number, dirX: number, dirY: number, vTop: number,
  legacy: { x: number; y: number }, log: MoveLog,
): GamePlayer {
  const wb = p.runtimeStats.withBall;
  if (!KINEMATICS_CONFIG.ENABLED) {
    return finishMove(p, s, dt, legacy.x, legacy.y, (legacy.x - p.x) / dt, (legacy.y - p.y) / dt, 1, wb.carrySpeed, log);
  }
  const v = carriedVelocity(p, s, dt);
  const r = stepAlong({ x: p.x, y: p.y, vx: v.x, vy: v.y, accel: wb.acceleration }, dirX, dirY, vTop, dt,
    { dropToTop: p.recoveryTime > 0, carryDribbling: wb.dribbling });
  const x = Math.max(0, Math.min(PITCH_LENGTH, r.x));
  const y = Math.max(0, Math.min(PITCH_WIDTH, r.y));
  // Stopped by the touchline / goal line: the blocked part of the velocity goes.
  const vx = x === r.x ? r.vx : 0;
  const vy = y === r.y ? r.vy : 0;
  return finishMove(p, s, dt, x, y, vx, vy, r.turn, wb.carrySpeed, log);
}

/** A step without movement (at the target): standing, the kinematic memo kept current. */
function standStill(p: GamePlayer, s: GameState, dt: number, log: MoveLog): GamePlayer {
  return finishMove(p, s, dt, p.x, p.y, 0, 0, 1, p.runtimeStats.withoutBall.pressSpeed, log);
}

/** Race estimate (seconds) to (tx, ty) at top speed `vTop`, from the player's current velocity (`kinematics.md`). */
function raceEta(p: GamePlayer, tx: number, ty: number, vTop: number): number {
  return kinEta(p, p.runtimeStats.withoutBall.acceleration, tx, ty, Math.hypot(p.x - tx, p.y - ty), vTop);
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
    /** Stage 11: the ball's flight time (s) to the point, for the keeper's claim decision. */
    flightS?: number;
  } = {},
): GameState {
  const maxPerTeam = opts.maxPerTeam ?? THROUGH_BALL_CONFIG.MAX_CHASERS_PER_TEAM;
  const etaHorizon = opts.etaHorizon ?? THROUGH_BALL_CONFIG.ETA_HORIZON;
  const passer = state.players.find(p => p.id === passerId);
  // The passer may have left the pitch (injury) while the ball was loose — fall back to the
  // team of the last touch so the re-commit still works (#36).
  const passerTeam = passer?.team ?? passerTeamFallback;
  if (!passerTeam) return state;

  type Cand = { id: number; team: TeamId; eta: number; raw: number; role: PlayerRole };
  const etaOf = (p: GamePlayer) => raceEta(p, toX, toY, chaseSprintSpeed(p));
  // Fastest attacker to the point (the passer's side): the sweeper keeper must beat him (`Keeper.ts`).
  const bestAttackerEta = state.players
    .filter(p => p.team === passerTeam && p.id !== passerId && p.role !== 'GK' && !isPlayerInRecovery(p))
    .reduce((m, p) => Math.min(m, etaOf(p)), Infinity);
  const sweepers = new Set<number>();
  // Stage 11 (`keeper.md` → "Stage 11"): FM's keeper comes for a high ball only when he gets there first (both teams'
  // outfield players), within his claim depth; no sweeper chase outside his box.
  const fmKeeper = DECISION_FLAGS.FM_KEEPER;
  const bestOutfieldEta = fmKeeper && opts.keeperSmallBoxOnly
    ? state.players
      .filter(p => p.id !== passerId && p.role !== 'GK' && !isPlayerInRecovery(p))
      .reduce((m, p) => Math.min(m, etaOf(p)), Infinity)
    : Infinity;
  const highComers = new Set<number>();
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
        // High balls: his small box, or the wide claim zone up to the penalty spot. Ground balls: his box, or
        // further up as a sweeper when he wins the race to it (`Keeper.ts`).
        const covered = !isAttacking && defenderCovers(p, { x: toX, y: toY }, state.players);
        if (fmKeeper) {
          const comes = isAttacking ? false
            : opts.keeperSmallBoxOnly
              ? fmKeeperComesForHigh(p, toX, toY, etaOf(p), bestOutfieldEta, opts.flightS)
              : isInGoalScoreArea(toX, toY, ownGoalX) && !covered;
          if (comes && opts.keeperSmallBoxOnly) highComers.add(p.id);
          weight = comes ? 1.0 : 0;
        }
        let inReach = fmKeeper ? weight > 0 : opts.keeperSmallBoxOnly
          ? isInSmallBox(toX, toY, ownGoalX) || (!isAttacking && !covered && keeperComesWide(
              Math.hypot(p.x - toX, p.y - toY), isWideClaimZone(toX, toY, ownGoalX), nearestOutfieldTo(state.players, p.id, toX, toY)))
          : isInGoalScoreArea(toX, toY, ownGoalX) && !covered;
        if (!fmKeeper && !inReach && !covered && !opts.keeperSmallBoxOnly && !isAttacking && sweeperChases(p, toX, toY, etaOf(p), bestAttackerEta)) {
          inReach = true;
          sweepers.add(p.id);
        }
        weight = inReach ? 1.0 : 0;
      }
      if (weight < THROUGH_BALL_CONFIG.ROLE_CHASE_THRESHOLD) continue;
      const raw = etaOf(p);
      // Anticipation (stage 4, `movement.md`): who reads the ball earlier gets to the race first.
      const eta = DECISION_FLAGS.ANTICIPATION_PRESS ? raw - MOVEMENT.ANTICIPATION_CHASE * anticipationLookahead(p) : raw;
      out.push({ id: p.id, team, eta, raw, role: p.role });
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
  for (const arr of [teamA, teamB]) {
    const first = arr[0];
    if (first && arr.some(c => c.raw < first.raw - 1e-6)) {
      const p = state.players.find(q => q.id === first.id);
      if (p) gameBus.emit('anticipationRead', { playerId: p.id, team: p.team, kind: 'chase', lookahead: anticipationLookahead(p) });
    }
  }
  for (const c of chasers) {
    if (!sweepers.has(c.id) && !highComers.has(c.id)) continue;
    const gk = state.players.find(p => p.id === c.id);
    const already = gk?.decisionMemory?.decision?.type === 'chase_loose_ball';
    if (!already && gk) {
      const depth = depthFrom(gk.attackDir === 1 ? 0 : PITCH_LENGTH, toX);
      if (highComers.has(c.id)) {
        gameBus.emit('keeperComeOut', { keeperId: c.id, kind: 'high', depth });
        debugLog('keeper', `${gk.name} comes for the high ball ${depth.toFixed(1)} yds out (first to it)`, { playerId: c.id, data: { depth } });
      } else {
        gameBus.emit('keeperComeOut', { keeperId: c.id, kind: 'sweep', depth });
        debugLog('keeper', `Keeper ${c.id} sweeps out to (${toX.toFixed(0)}, ${toY.toFixed(0)})`, { playerId: c.id });
      }
    }
  }
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
export function startThroughBall(
  state:    GameState,
  decision: { cellX: number; cellY: number; intendedRunnerId: number | null },
): GameState {
  const holder = state.players.find(p => p.id === state.ballHolderId)!;

  // Pass-error model — Gaussian noise on landing point scaled by (1 − passingSkill).
  // Box-Muller approximation.
  const skill   = holder.runtimeStats.withBall.passingSkill;
  let landingX: number, landingY: number;
  let physics: PassState['physics'];
  if (passPhysicsOn()) {
    // Stage 4 (`pass-physics.md`): FM's launch toward the cell (low or high by its distance), the error on the
    // vector; the ball runs on through the cell at the pace it has and the runner meets it.
    const d0 = Math.hypot(decision.cellX - holder.x, decision.cellY - holder.y);
    const opps = state.players.filter(p => p.team !== holder.team);
    const factor = passErrorFactor(skill, d0, holderPressure(holder.x, holder.y, opps));
    // Weighted for the runner: it reaches the cell when he does (never faster than FM's launch for the distance).
    const runner = decision.intendedRunnerId !== null ? state.players.find(p => p.id === decision.intendedRunnerId) : undefined;
    const env = ballEnv(state.weather);
    const tRun = runner ? raceEta(runner, decision.cellX, decision.cellY, chaseSprintSpeed(runner)) : 0;
    const b = buildGroundLaunch({ x: holder.x, y: holder.y }, { x: decision.cellX, y: decision.cellY }, BALL_PHYSICS.FOOT_Z,
      env, factor, launchNormals(matchRandom), vz => passTypeOf('through', vz), weightedSpeed(d0, tRun, env.rollDecel));
    landingX = Math.max(0.5, Math.min(PITCH_LENGTH - 0.5, b.point.x));
    landingY = Math.max(0.5, Math.min(PITCH_WIDTH - 0.5, b.point.y));
    physics = b.launch;
  } else {
    const sigma   = (1 - skill) * THROUGH_BALL_CONFIG.MAX_THROUGH_BALL_ERROR / 2;
    const u1      = Math.max(1e-6, matchRandom());
    const u2      = matchRandom();
    const z0      = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1      = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    landingX = decision.cellX + z0 * sigma;
    landingY = decision.cellY + z1 * sigma;
  }

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
  // Overhit (stage 4): how far the landing point is beyond the aimed cell along the pass.
  const aimLen = Math.hypot(decision.cellX - holder.x, decision.cellY - holder.y);
  const overhit = aimLen > 0.01
    ? ((landingX - decision.cellX) * (decision.cellX - holder.x) + (landingY - decision.cellY) * (decision.cellY - holder.y)) / aimLen
    : 0;

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
      offsideLineX:     offsideLineAt(holder, state.players),
      intendedRunnerId: decision.intendedRunnerId,
      overhit,
      ...(physics ? { physics } : {}),
    },
    setPiece: null,
  };
  emitPassLaunched(holder, stateWithPass.pass!);

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
  if (kind === 'throw_in') return RESTART_DEAD_S.THROW_IN;
  if (kind === 'corner')   return RESTART_DEAD_S.OOB_CORNER;
  return RESTART_DEAD_S.GOAL_KICK; // goal_kick — matches the value used after saves/missed shots
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
  // A restart ends a missed offside's chain (`var.md`).
  if (s.missedOffside) s = { ...s, missedOffside: null };

  const position = computeOOBRestartPosition(kind, exitX, exitY, awardedTeam, s.players);
  if (kind === 'corner') return awardCorner(s, awardedTeam, position, fromPasserId, source, cornerSource);
  const taker    = pickOOBTaker(kind, awardedTeam, position, s.players);
  if (kind === 'throw_in') gameBus.emit('throwInAwarded', { team: awardedTeam, takerId: taker.id });

  // Layouts — awarded team plays the _Attack shape, opposite team plays _Defend.
  const awFmt = awardedTeam === 'A' ? s.formationA : s.formationB;
  const opFmt = awardedTeam === 'A' ? s.formationB : s.formationA;
  const aLay  = resolveFormationSetPieces(awFmt);
  const oLay  = resolveFormationSetPieces(opFmt);

  let players = s.players;
  const fm = fmSetPiecesOn();
  let goalKick: SetPiece['goalKick'];
  if (fm && kind === 'throw_in') {
    // Stage 12: no layout — the short options come to the thrower, the rest stays where play stopped.
    const moved = throwInPositions(players, taker.id, position);
    players = players.map(p => { const m = moved.get(p.id); return m ? { ...p, x: m.x, y: m.y, targetPosition: { ...m } } : p; });
  } else {
    if (aLay) players = applySetPieceToTeam(players, awardedTeam,  oobLayoutFor(kind, 'attack', aLay));
    if (oLay) players = applySetPieceToTeam(players, oppositeTeam, oobLayoutFor(kind, 'defend', oLay));
  }
  if (fm && kind === 'goal_kick') {
    // Stage 12: the centre-backs split to the box corners for the short kick; the opponents wait outside the box.
    goalKick = drawGoalKickPlan(matchRandom);
    const ownGoalX = taker.attackDir === 1 ? 0 : PITCH_LENGTH;
    const spots = goalKickBackSpots(players, awardedTeam, ownGoalX);
    players = players.map(p => {
      const m = spots.get(p.id) ?? (p.team === oppositeTeam ? outsideBox(p, ownGoalX) : null);
      return m && (m.x !== p.x || m.y !== p.y) ? { ...p, x: m.x, y: m.y, targetPosition: { ...m } } : p;
    });
    debugLog('setPiece', `Goal kick for team ${awardedTeam}: ${goalKick.kind}`, { playerId: taker.id, data: { ...goalKick } });
  }

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
        countdown: restartFreeze(s, oobCountdownFor(kind)),
        position,
        ...(goalKick ? { goalKick } : {}),
      },
    }, prevHolderId),
    passCompleted: false, tackled: false, goalScored: null,
  };
}

/** /test and tests (stage 12): the ball out of play at (exitX, exitY) — a throw-in or a dead-ball goal kick for `awardedTeam`. */
export function testOutOfPlay(s: GameState, kind: 'throw_in' | 'goal_kick', awardedTeam: TeamId, exitX: number, exitY: number): GameState {
  const other = s.players.find(p => p.team !== awardedTeam);
  return resolveOOBSetPiece({ ...s, setPiece: null, pass: null, shot: null, looseBall: null }, kind, awardedTeam, exitX, exitY, other?.id ?? s.ballHolderId, 'clearance').state;
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
  const routine = drawRoutine(s0, awardedTeam, 'corner', taker.id);
  const players = applyBoxSetPiece(s0.players, taker, position, 'corner', matchRandom, routine);
  // Stage 12: FM's decided target (six-yard line centre / posts / short), drawn now.
  const fmCorner = fmSetPiecesOn() ? drawFmCornerTarget(matchRandom) : undefined;
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
  const countdown = restartFreeze(s, SET_PIECE_CONFIG.CORNER_COUNTDOWN);
  const st = onPossessionTransfer({
    ...s0,
    players,
    ballHolderId:   taker.id,
    possessionTime: 0,
    lastPasserId:   null,
    tackleCooldown: TACKLE_COOLDOWN,
    setPiece: { type: 'corner', takerId: taker.id, countdown, position, variant: 'box', ...(routine ? { routine } : {}), ...(fmCorner ? { fmCorner } : {}) },
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
  const prevX = lb.x, prevY = lb.y;
  // Stage 3 (`ball-3d.md`): the 3D ball rolls, flies and bounces (on the ground the same rolling as below).
  const ball3d = DECISION_FLAGS.BALL_3D ? advanceLooseBall(s, lb, dt) : undefined;
  if (ball3d) {
    ({ x, y, vx, vy } = ball3d);
    s = { ...s, ball: ball3d };
  } else if (speed > 0) {
    const newSpeed = Math.max(0, speed - cfg.LOOSE_BALL_DECELERATION * weatherEffectOf(s.weather).looseDecel * dt);
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
    gameBus.emit('ballOutOfPlay', { team: lb.fromTeamLastTouch, cause: lb.cause ?? (isTB ? 'through' : 'other'), kind });
    // Over the defending team's line with one of them on it: his touch put it out — corner.
    if (kind === 'goal_kick') {
      const exit = { x: Math.max(0, Math.min(PITCH_LENGTH, x)), y: Math.max(0, Math.min(PITCH_WIDTH, y)) };
      // The keeper letting it run out is a goal kick, not a corner.
      const touched = s.players.some(p => p.team === awardedTeam && p.role !== 'GK'
        && Math.hypot(p.x - exit.x, p.y - exit.y) <= SET_PIECE_CONFIG.LOOSE_CORNER_RADIUS);
      if (touched && matchRandom() < SET_PIECE_CONFIG.LOOSE_CORNER_CHANCE) {
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

  // ── 3c. A loose ball in a keeper's box is his when he gets there first (tester report) ──
  s = keeperClaimsLooseBall(s, lb);

  // Sort players by distance to the loose ball
  // A fast ball (stage 4, `pass-physics.md`) is played by whoever it passes within reach of during the tick.
  const moving = passPhysicsOn() && speed > PASS_PHYSICS.MOVING_SPEED_YD;
  const ranked = s.players
    .filter(p => !isPlayerInRecovery(p))
    // A ball above his reach flies over him (stage 3, `ball-3d.md`).
    .filter(p => !ball3d || ballWithinReach(s.ball, p.role === 'GK'))
    .map(p => ({ p, dist: moving ? segmentDist(p, prevX, prevY, lb.x, lb.y) : Math.hypot(p.x - lb.x, p.y - lb.y) }))
    .sort((a, b) => a.dist - b.dist);

  // Players within touch radius — they can pick up
  let inTouch = ranked.filter(r => r.dist <= (moving ? PASS_PHYSICS.MOVING_TOUCH_YD : cfg.LOOSE_BALL_TOUCH_RADIUS));

  // ── Watchdog (#36): a loose ball can never outlive the timeout — award it to the nearest
  // player (recovering players included) so play always resumes.
  if (inTouch.length === 0 && s.matchTime - lb.startTime >= cfg.LOOSE_BALL_WATCHDOG_REAL_SECONDS * clockScaleOf(s)) {
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
  let flaggedOffside =
    (lb.receiverOffside && lb.intendedRunnerId !== null && winner.id === lb.intendedRunnerId) ||
    (winner.team === lb.fromTeamLastTouch && (lb.offsideIds ?? []).includes(winner.id));
  // The assistant may miss it (`var.md`): play goes on, a goal soon after is checked by the VAR.
  if (flaggedOffside && refereeErrs(s, 'missed_offside', matchRandom)) {
    s = missOffside(s, winner, { x: lb.x, y: lb.y }, lb.offsideLineX);
    flaggedOffside = false;
  }

  if (flaggedOffside) {
    gameBus.emit('offsideCalled', { team: winner.team, receiverId: winner.id, lineX: lb.offsideLineX });
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
        setPiece: { type: 'offside_fk', takerId: nearestDefender.id, countdown: restartFreeze(s, RESTART_DEAD_S.OFFSIDE_FK), position: { x: lb.x, y: lb.y } },
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
    const [offender, victim] = matchRandom() < 0.5 ? [pa, pb] : [pb, pa];
    const fc = foulCheck(s, offender, victim, 'duel', false);
    s = fc.state;
    const fouledState = fc.foul;
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
  // The keeper collects a loose ball; outside his box he plays it with his feet (`Keeper.ts`).
  if (winner.role === 'GK') {
    const inBox = isInGoalScoreArea(lb.x, lb.y, winner.attackDir === 1 ? 0 : PITCH_LENGTH);
    gameBus.emit('keeperCollect', { keeperId: winner.id, inBox });
    if (!inBox) debugLog('keeper', `${winner.name} sweeps the ball up outside his box`, { playerId: winner.id });
  }
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

/** Distance (yd) from a player to the segment (x0, y0) → (x1, y1). */
function segmentDist(p: { x: number; y: number }, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / l2)) : 0;
  return Math.hypot(p.x - (x0 + dx * t), p.y - (y0 + dy * t));
}

/** How far from himself a receiver plays a physical pass (yd): 4b's reach across the pass + first touch. */
function receiveReach(p: GamePlayer): number {
  return FM_NUMBERS.REACH_SIDE_YD + FM_NUMBERS.REACH_TOUCH_YD * Math.max(0, Math.min(1, p.runtimeStats.withBall.firstTouch));
}

/** Stage 4 (`pass-physics.md`): passes are physical launches (needs the 3D ball). */
function passPhysicsOn(): boolean {
  return DECISION_FLAGS.PASS_PHYSICS && DECISION_FLAGS.BALL_3D;
}

/** Stage 10 (`aerial.md` -> "Stage 10"): FM's crosses and the contact in the air (needs the physical pass). */
function fmAerialOn(): boolean {
  return DECISION_FLAGS.FM_AERIAL && passPhysicsOn();
}

/** Three standard normals for a launch error (direction, speed, height). */
function launchNormals(rng: () => number): [number, number, number] {
  const [a, b] = gaussianPair(rng);
  const [c] = gaussianPair(rng);
  return [a, b, c];
}

/** The pass is a physical ground pass / through ball whose 3D ball the core moves (`advancePassBall`). */
function isPhysicalGroundPass(s: GameState, p: PassState): boolean {
  return passPhysicsOn() && !!p.physics && !isAerialKind(p.kind)
    && !!s.ball && s.ball.phase === 'pass' && s.ball.key === passKey(p) && !!s.ball.free;
}

function passerTeamOf(s: GameState, p: PassState): TeamId | undefined {
  return s.players.find(q => q.id === p.fromId)?.team;
}

// ── Stage 5: physical interception (`interception.md` → "Stage 5") ────────────

/** Stage 5: physical passes are cut by defenders reaching their path (needs the physical pass). */
function physicalInterceptionOn(): boolean {
  return DECISION_FLAGS.PHYSICAL_INTERCEPTION && passPhysicsOn();
}

/** How far across the ball a defender gets a foot to it (yd): his body + a leg put in by his tackling. */
function interceptReach(p: GamePlayer): number {
  return interceptReachOf(p.runtimeStats.withoutBall.tackling ?? 0.5);
}

const ownGoalXOf = (p: GamePlayer) => (p.attackDir === 1 ? 0 : PITCH_LENGTH);

/** The predicted path of the ball of a physical pass from now (times from now), until it stops or leaves the pitch. */
function physicalPassPath(s: GameState): PathPoint[] {
  const b = s.ball!;
  const pts = predictPath({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz }, INTERCEPT.PLAN_HORIZON_S, INTERCEPT.PLAN_STEP_S, ballEnv(s.weather));
  const out: PathPoint[] = [];
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i]!;
    if (q.x < 0 || q.x > PITCH_LENGTH || q.y < 0 || q.y > PITCH_WIDTH) break;
    out.push({ x: q.x, y: q.y, z: q.z, t: i * INTERCEPT.PLAN_STEP_S });
    if (q.z <= 1e-6 && Math.hypot(q.vx, q.vy) < PASS_PHYSICS.STOP_SPEED_YD) break;
  }
  return out;
}

/**
 * The defenders of a physical pass's flight who reach a point of its path in time (before the receiver or the runner
 * takes it): the earliest INTERCEPT.MAX_RUNNERS run there. A keeper only inside his own box.
 */
function planInterceptRuns(s: GameState, pass: PassState): InterceptRun[] {
  const passerTeam = passerTeamOf(s, pass);
  if (!passerTeam || !s.ball) return [];
  const path = physicalPassPath(s);
  if (path.length === 0) return [];
  const mateId = pass.kind === 'through' ? pass.intendedRunnerId : pass.toId;
  const mate = mateId !== null ? s.players.find(p => p.id === mateId) : undefined;
  let cutoff = Infinity;
  if (mate) {
    const reach = pass.kind === 'through' ? PASS_PHYSICS.MOVING_TOUCH_YD : receiveReach(mate);
    const m = interceptPoint(path, { x: mate.x, y: mate.y, speed: chaseSprintSpeed(mate), reach, reaction: 0, maxZ: reachHeight(mate.role === 'GK') });
    if (m) cutoff = m.t;
  }
  const beaten = new Set(pass.beaten ?? []);
  const runs: InterceptRun[] = [];
  for (const p of s.players) {
    if (p.team === passerTeam || beaten.has(p.id) || isPlayerInRecovery(p)) continue;
    const dec = p.decisionMemory?.decision;
    const running = dec?.type === 'chase_loose_ball' && !!dec.intercept;
    const antMult = DECISION_FLAGS.ANTICIPATION_PRESS ? anticipationInterceptMult(p) : 1;
    const plan = interceptPoint(path, {
      x: p.x, y: p.y, speed: chaseSprintSpeed(p), reach: interceptReach(p),
      reaction: running ? 0 : INTERCEPT.REACTION_S / antMult, maxZ: reachHeight(p.role === 'GK'),
    }, cutoff);
    if (!plan) continue;
    if (p.role === 'GK' && !isInGoalScoreArea(plan.x, plan.y, ownGoalXOf(p))) continue;
    runs.push({ playerId: p.id, team: p.team, x: plan.x, y: plan.y, z: plan.z, t: plan.t, margin: plan.margin });
  }
  runs.sort((a, b) => a.t - b.t || b.margin - a.margin);
  return runs.slice(0, INTERCEPT.MAX_RUNNERS);
}

/**
 * A defender touched a physical pass on its way (no dice for the touch to happen, only for what it does): he controls
 * it, clears it, deflects it, or it runs past him.
 */
function resolveInterceptTouch(s: GameState, pass: PassState, d: GamePlayer): TickResult {
  const b = s.ball!;
  const speedYd = Math.hypot(b.vx, b.vy);
  const reach = interceptReach(d);
  // How far from his body the ball passes: its closest approach on its line, not where it entered his reach.
  const across = speedYd > 1e-3 ? Math.abs(((d.x - b.x) * b.vy - (d.y - b.y) * b.vx) / speedYd) : Math.hypot(b.x - d.x, b.y - d.y);
  const offset = Math.min(1, across / Math.max(0.1, reach));
  const keeperHands = d.role === 'GK' && isInGoalScoreArea(b.x, b.y, ownGoalXOf(d));
  const fromOwnGoal = Math.abs(b.x - ownGoalXOf(d));
  const chances = touchChances({
    touch: d.runtimeStats.withBall.firstTouch, offset, speedMs: speedYd / YD_PER_M_PASS, z: b.z, keeperHands, fromOwnGoal,
  });
  const outcome = resolveTouch(chances, matchRandom);
  const kind: 'regular' | 'through' = pass.kind === 'through' ? 'through' : 'regular';
  s = { ...s, players: applyStaminaCost(s.players, d.id, 'interception') };
  const dNow = s.players.find(p => p.id === d.id) ?? d;
  gameBus.emit('interceptionTouch', {
    player: d.id, team: d.team, passerId: pass.fromId, kind, outcome,
    speedMs: speedYd / YD_PER_M_PASS, zM: b.z / YD_PER_M_PASS, offset, control: chances.control, flight: b.elapsed,
  });
  gameBus.emit('interception', { player: d.id, success: outcome !== 'miss', chance: chances.control });
  if (isDebugEnabled()) {
    const verb = outcome === 'control' ? 'cuts out' : outcome === 'clear' ? 'clears' : outcome === 'deflect' ? 'deflects' : 'misses';
    debugLog('interception', `${d.name} ${verb} the pass (${(speedYd / YD_PER_M_PASS).toFixed(1)} m/s, ${(b.z / YD_PER_M_PASS).toFixed(1)} m, offset ${offset.toFixed(2)}, control ${(chances.control * 100).toFixed(0)}%)`, { playerId: d.id });
  }
  if (outcome === 'miss') {
    // The ball runs past him: he can't touch it again; it flies on.
    const ph = pass.physics!;
    const next: PassState = { ...pass, beaten: [...(pass.beaten ?? []), d.id], t: Math.min(0.99, b.elapsed / Math.max(0.05, ph.T)) };
    return { state: { ...s, pass: next }, passCompleted: false, tackled: false, goalScored: null };
  }
  if (kind === 'through') gameBus.emit('throughBallLostInFlight', { player: pass.fromId, interceptorId: d.id });
  else gameBus.emit('passFailed', { player: pass.fromId, toId: pass.toId ?? pass.fromId });
  if (outcome === 'deflect') {
    const dir = scatterDirection(b.vx, b.vy, INTERCEPT.DEFLECT_MAX_DEG);
    const v = speedYd * INTERCEPT.DEFLECT_KEEP;
    return { state: runLoose(s, dNow, b.x, b.y, dir.x * v, dir.y * v, 'deflection', true), passCompleted: false, tackled: true, goalScored: null };
  }
  if (outcome === 'clear') {
    const dist = INTERCEPT.CLEAR_MIN_YD + matchRandom() * INTERCEPT.CLEAR_SPAN_YD;
    return { state: clearanceBall({ ...s, pass: null }, dNow, { x: b.x, y: b.y }, dist, matchRandom), passCompleted: false, tackled: true, goalScored: null };
  }
  const prevHolderId = s.ballHolderId;
  const players = s.players.map(p => (p.id === d.id ? { ...p, x: b.x, y: b.y } : p));
  return {
    state: onPossessionTransfer({ ...s, players, pass: null, ballHolderId: d.id, possessionTime: 0, lastPasserId: null }, prevHolderId),
    passCompleted: false, tackled: true, goalScored: null,
  };
}

/** Report a physical launch (`Statistics.ts` per type, `/lab`, `fmTargets.ts`). */
function emitPassLaunched(holder: GamePlayer, p: PassState): void {
  const ph = p.physics;
  if (!ph) return;
  gameBus.emit('passLaunched', {
    player: holder.id, team: holder.team, type: ph.type, distance: p.distance,
    speed: ph.speed, vz: ph.vz, aimX: ph.aimX, aimY: ph.aimY, toX: p.toX, toY: p.toY, T: ph.T,
  });
  if (isDebugEnabled()) {
    debugLog('pass', `${holder.name}: ${ph.type} pass, ${(ph.speed / YD_PER_M_PASS).toFixed(1)} m/s, vz ${(ph.vz / YD_PER_M_PASS).toFixed(1)} m/s, ${(p.distance / YD_PER_M_PASS).toFixed(0)} m, ~${ph.T.toFixed(2)} s`, { playerId: holder.id });
  }
}

/** Offside line (x) for a ball played by `holder` right now; undefined when offside doesn't apply. */
function offsideLineAt(holder: GamePlayer, players: GamePlayer[]): number | undefined {
  if (!OFFSIDE_CONFIG.ENABLED) return undefined;
  return computeOffsideLine(holder.attackDir, players, holder.team, holder.x) ?? undefined;
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
  const rawY = origin.y + Math.sin(a) * dist;
  // Sliced over the touchline: a throw-in to the other side.
  if (rawY < 0 || rawY > PITCH_WIDTH) {
    const other: TeamId = player.team === 'A' ? 'B' : 'A';
    return resolveOOBSetPiece({ ...s, pass: null, looseBall: null }, 'throw_in', other, toX, rawY < 0 ? -1 : PITCH_WIDTH + 1, player.id, 'clearance').state;
  }
  let toY = Math.max(1, Math.min(PITCH_WIDTH - 1, rawY));
  let toXp = toX;
  let physics: PassState['physics'];
  if (passPhysicsOn()) {
    // Stage 4 (`pass-physics.md`): FM's clearance height (4.4 m), from the head after a high ball; the random aim above
    // is its error.
    const z0 = s.ball && s.ball.phase === 'pass' && (s.ball.kind === 'cross' || s.ball.kind === 'corner' || s.ball.kind === 'long_ball' || s.ball.kind === 'clearance')
      ? BALL_PHYSICS.HEAD_Z : BALL_PHYSICS.FOOT_Z;
    const vz = vzForPeak(z0, PASS_PHYSICS.PEAK_CLEARANCE_M * YD_PER_M_PASS);
    const b = buildAerialLaunch(origin, { x: toX, y: toY }, z0, vz, ballEnv(s.weather), 0, [0, 0, 0], 'clearance');
    toXp = Math.max(1, Math.min(PITCH_LENGTH - 1, b.point.x));
    toY = Math.max(1, Math.min(PITCH_WIDTH - 1, b.point.y));
    physics = b.launch;
  }
  const prevHolderId = s.ballHolderId;
  // The clearing player is at the ball: the flight starts from him.
  const players = s.players.map(p => (p.id === player.id ? { ...p, x: origin.x, y: origin.y, targetPosition: { ...origin } } : p));
  const st = onPossessionTransfer({
    ...s,
    players,
    pass: {
      fromId: player.id, toId: null, toX: toXp, toY, kind: 'clearance', t: 0,
      distance: Math.hypot(toXp - origin.x, toY - origin.y),
      receiverOffside: false, intendedRunnerId: null, aerialOffsideIds: [],
      ...(physics ? { physics } : {}),
    },
    looseBall: null,
    setPiece: null,
    ballHolderId: player.id,
    possessionTime: 0,
    lastPasserId: null,
  }, prevHolderId);
  if (st.pass) emitPassLaunched(player, st.pass);
  // Stage 10: the second ball is attacked where it comes down through head height.
  const meet = fmAerialOn() && physics ? meetPoint(physics, FM_AERIAL.MEET_Z_YD, BALL_PHYSICS.GRAVITY) : null;
  return commitLooseBallChasers(st, player.id, meet?.x ?? toXp, meet?.y ?? toY, player.team, {
    maxPerTeam: AERIAL_CONFIG.MAX_CHASERS_PER_TEAM,
    etaHorizon: AERIAL_CONFIG.CHASE_ETA_HORIZON,
    keeperSmallBoxOnly: true,
    ...(meet ? { flightS: meet.t } : {}),
  });
}

const uniform = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

/**
 * A keeper who came for a high ball and failed to hold it (`Keeper.ts`): the ball drops loose at the point,
 * his team's touch (a `clearance`), slow and in a random direction.
 */
function dropLooseAt(s: GameState, gk: GamePlayer, point: { x: number; y: number }): GameState {
  const a = matchRandom() * 2 * Math.PI;
  const v = THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED * 0.5 * weatherEffectOf(s.weather).looseSpeed;
  const prevHolderId = s.ballHolderId;
  return onPossessionTransfer({
    ...s,
    ballHolderId: gk.id,
    looseBall: {
      x: point.x, y: point.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      startTime: s.matchTime,
      fromPasserId: gk.id,
      fromTeamLastTouch: gk.team,
      intendedRunnerId: null,
      receiverOffside: false,
      source: 'clearance',
    },
  }, prevHolderId);
}

/**
 * Stage 4 (`movement.md`): the defending side's back line, one robust-mean x of its back-liners' own shape targets,
 * moved by the hold / step-up / drop state machine (`stepBackLine`). The attacking side has none. Hands the line to
 * `DefensivePositioning` for this tick.
 */
function updateBackLine(s: GameState, defendingTeam: TeamId, shapeBallPos: { x: number; y: number }, dt: number): GameState {
  const attackingTeam: TeamId = defendingTeam === 'A' ? 'B' : 'A';
  setBackLineX(attackingTeam, null);
  if (!DECISION_FLAGS.BACK_LINE || !isLivePhase(s.matchPhase)) {
    setBackLineX(defendingTeam, null);
    return s.backLine ? { ...s, backLine: undefined } : s;
  }
  const formation = defendingTeam === 'A' ? s.formationA : s.formationB;
  const cfg = getDefenseConfig(defendingTeam);
  const line = s.players.filter(p => p.team === defendingTeam && COHESION_LINE_ROLES.has(p.role));
  if (line.length < 2) { setBackLineX(defendingTeam, null); return s; }
  const wanted = robustMean(line.map(p => computeDefensiveShapeAnchor(p, shapeBallPos, formation, cfg).x));
  const prev: BackLineState | undefined = s.backLine?.[defendingTeam];
  const next = stepBackLine(prev, wanted, line[0]!.attackDir, dt);
  if (prev && prev.mode !== next.mode) {
    gameBus.emit('backLineState', { team: defendingTeam, mode: next.mode, x: next.x });
    debugLog('movement', `Team ${defendingTeam} back line: ${next.mode} at x ${next.x.toFixed(1)}`, {});
  }
  setBackLineX(defendingTeam, next.x);
  return { ...s, backLine: { [defendingTeam]: next } };
}

/** Last shadow press (holder:presser) announced: `shadowPress` once per pair. */
let _lastShadow = '';
let _lastShapeMatchTime = 0;
let _lastShapePhase = '';
function noteShadowPress(presser: GamePlayer, holder: GamePlayer, receiverId: number): void {
  const key = `${holder.id}:${presser.id}`;
  if (_lastShadow === key) return;
  _lastShadow = key;
  gameBus.emit('shadowPress', { playerId: presser.id, team: presser.team, holderId: holder.id, receiverId });
  debugLog('movement', `${presser.name} presses in the pass shadow`, { playerId: presser.id });
}

/** Zone covers of the last tick per side (`zoneCover` is emitted once per spell). */
const _lastCover: Partial<Record<TeamId, Map<number, number>>> = {};
// Stage 19 (`live-modes.md`): the shape clock and the zone covers travel with a mid-match snapshot.
registerEngineMemory('gameState.shape', {
  export: () => ({ t: _lastShapeMatchTime, phase: _lastShapePhase, cover: { A: _lastCover.A ? [..._lastCover.A] : null, B: _lastCover.B ? [..._lastCover.B] : null } }),
  import: (v) => {
    const m = v as { t: number; phase: string; cover: Record<TeamId, Array<[number, number]> | null> };
    _lastShapeMatchTime = m.t; _lastShapePhase = m.phase;
    _lastCover.A = m.cover.A ? new Map(m.cover.A) : undefined; _lastCover.B = m.cover.B ? new Map(m.cover.B) : undefined;
  },
});

/**
 * Stage 15 (`team-shape.md`): the defending side's out-of-possession zones (its shape anchors) and who covers a
 * vacated one (`assignZoneCover`), handed to `DefensivePositioning` for this tick; the pressing state (the predicted
 * ball in FM's 3×3 grid) counted per second.
 */
function updateTeamShape(s: GameState, defendingTeam: TeamId, shapeBallPos: { x: number; y: number }, dt: number): GameState {
  const attackingTeam: TeamId = defendingTeam === 'A' ? 'B' : 'A';
  setZoneCover(attackingTeam, null);
  if (!isLivePhase(s.matchPhase) || s.setPiece) { setZoneCover(defendingTeam, null); return s; }
  const side = s.players.filter(p => p.team === defendingTeam);
  if (side.length === 0) return s;
  const dir = side[0]!.attackDir;
  gameBus.emit('pressState', { team: defendingTeam, state: pressStateOf(shapeBallPos, dir), seconds: dt });
  if (!DECISION_FLAGS.OOP_ZONES) { setZoneCover(defendingTeam, null); return s; }
  const formation = defendingTeam === 'A' ? s.formationA : s.formationB;
  const cfg = getDefenseConfig(defendingTeam);
  const anchors = new Map<number, { x: number; y: number }>();
  for (const p of side) if (p.role !== 'GK') anchors.set(p.id, computeDefensiveShapeAnchor(p, shapeBallPos, formation, cfg));
  const zones = zonesOf(side, anchors);
  const holding = (p: GamePlayer) => s.decisions[p.id]?.type === 'hold_shape' && p.recoveryTime <= 0 && p.manMarkTargetId === undefined;
  const prev = _lastCover[defendingTeam] ?? new Map<number, number>();
  const cover = assignZoneCover(side, zones, holding, shapeBallPos, dir, prev);
  setZoneCover(defendingTeam, cover);
  const next = new Map<number, number>();
  for (const [id, z] of cover as Map<number, ShapeZone>) {
    next.set(id, z.ownerId);
    if (prev.get(id) !== z.ownerId) {
      gameBus.emit('zoneCover', { playerId: id, team: defendingTeam, zoneOwnerId: z.ownerId });
      debugLog('movement', `Team ${defendingTeam}: ${s.players.find(p => p.id === id)?.name ?? id} covers ${s.players.find(p => p.id === z.ownerId)?.name ?? z.ownerId}'s zone`, { playerId: id });
    }
  }
  _lastCover[defendingTeam] = next;
  return s;
}

/**
 * Stage 4 (`movement.md`): the ball runs loose off `toucher` (a deflection, a blocked shot, a heavy touch) from (x, y)
 * at (vx, vy) yd/s. His team made the last touch; chasers of both sides are committed to where it will stop.
 */
function runLoose(s: GameState, toucher: GamePlayer, x: number, y: number, vx: number, vy: number, cause: LooseBallCause, physical = false): GameState {
  // A physical ball (stage 4) keeps the pace it has; the others get the weather's loose-ball speed.
  const w = physical ? 1 : weatherEffectOf(s.weather).looseSpeed;
  vx *= w; vy *= w;
  gameBus.emit('ballRunsLoose', { playerId: toucher.id, team: toucher.team, cause, x, y, vx, vy });
  const prevHolderId = s.ballHolderId;
  const st = onPossessionTransfer({
    ...s,
    pass: null,
    shot: null,
    ballHolderId: toucher.id,
    lastPasserId: null,
    looseBall: {
      x, y, vx, vy,
      startTime: s.matchTime,
      fromPasserId: toucher.id,
      fromTeamLastTouch: toucher.team,
      intendedRunnerId: null,
      receiverOffside: false,
      source: 'clearance',
      cause,
    },
  }, prevHolderId);
  const a = THROUGH_BALL_CONFIG.LOOSE_BALL_DECELERATION * weatherEffectOf(s.weather).looseDecel;
  const v = Math.hypot(vx, vy);
  const roll = a > 0 ? (v * v) / (2 * a) : 0;
  const stopX = Math.max(0, Math.min(PITCH_LENGTH, x + (v > 0 ? (vx / v) * roll : 0)));
  const stopY = Math.max(0, Math.min(PITCH_WIDTH, y + (v > 0 ? (vy / v) * roll : 0)));
  // A misplaced pass (stage 4b) is a short loose ball: one chaser per side, not a crowd.
  return commitLooseBallChasers(st, toucher.id, stopX, stopY, toucher.team, cause === 'misplaced' ? { maxPerTeam: 1 } : undefined);
}

/** Offside free kick for the team defending against `offender` at `at` (aerial path). */
function aerialOffsideFreeKick(s: GameState, offender: GamePlayer, at: { x: number; y: number }, lineX?: number): GameState {
  gameBus.emit('offsideCalled', { team: offender.team, receiverId: offender.id, lineX });
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
    setPiece: { type: 'offside_fk', takerId: taker.id, countdown: restartFreeze(s, RESTART_DEAD_S.OFFSIDE_FK), position: { ...at } },
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
  rng: () => number = matchRandom,
  lofted = false,
): GameState {
  const C = AERIAL_CONFIG;
  const holder = state.players.find(p => p.id === state.ballHolderId)!;
  let toX: number, toY: number;
  let physics: PassState['physics'];
  if (passPhysicsOn()) {
    // Stage 4 (`pass-physics.md`): the type's height (FM's peaks: cross 4.0 m, corner 5.6 m, long ball 4.4 m; a lofted
    // pass to feet the vz of its distance), the horizontal speed to land on the target, the passer's error on the
    // vector (wind × aerialError); it is contested where it really lands.
    const corner = kind === 'cross' && state.setPiece?.type === 'corner';
    const d0 = Math.hypot(target.x - holder.x, target.y - holder.y);
    const z0 = BALL_PHYSICS.FOOT_Z;
    const vz = kind === 'cross' ? vzForPeak(z0, (corner ? PASS_PHYSICS.PEAK_CORNER_M : PASS_PHYSICS.PEAK_CROSS_M) * YD_PER_M_PASS)
      : lofted ? loftVzYd(d0) : vzForPeak(z0, PASS_PHYSICS.PEAK_LONG_M * YD_PER_M_PASS);
    const opps = state.players.filter(p => p.team !== holder.team);
    const pressure = state.setPiece ? 0 : holderPressure(holder.x, holder.y, opps);
    const factor = passErrorFactor(holder.runtimeStats.withBall.passingSkill, d0, pressure) * (state.setPiece && fmSetPiecesOn() ? setPieceErrorScale() : 1);
    const wErr = weatherEffectOf(state.weather).aerialError;
    logWeather(state, 'aerialError', `${holder.name}'s ${kind === 'cross' ? 'cross' : 'long ball'} lands less precisely`, holder.id);
    const b = buildAerialLaunch({ x: holder.x, y: holder.y }, target, z0, vz, ballEnv(state.weather), factor,
      launchNormals(rng), passTypeOf(kind, vz, { corner, lofted }), wErr);
    toX = Math.max(1, Math.min(PITCH_LENGTH - 1, b.point.x));
    toY = Math.max(1, Math.min(PITCH_WIDTH - 1, b.point.y));
    physics = b.launch;
  } else {
    const maxErr = kind === 'cross' ? C.CROSS_MAX_ERROR : C.LONG_BALL_MAX_ERROR;
    const sigma = (1 - holder.runtimeStats.withBall.passingSkill) * maxErr / 2 * weatherEffectOf(state.weather).aerialError;
    logWeather(state, 'aerialError', `${holder.name}'s ${kind === 'cross' ? 'cross' : 'long ball'} lands less precisely (σ ${sigma.toFixed(1)} yd)`, holder.id);
    const [z0, z1] = gaussianPair(rng);
    toX = Math.max(1, Math.min(PITCH_LENGTH - 1, target.x + z0 * sigma));
    toY = Math.max(1, Math.min(PITCH_WIDTH - 1, target.y + z1 * sigma));
  }
  const distance = Math.hypot(toX - holder.x, toY - holder.y);

  if (kind === 'cross') gameBus.emit('crossStarted', { player: holder.id, toX, toY, intendedRunnerId: intendedId });
  else gameBus.emit('longBallStarted', { player: holder.id, toX, toY, targetId: intendedId, ...(lofted ? { lofted: true } : {}) });
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
    aerialOffsideIds: noOffsideRestart(state) ? [] : offsideIdsAt(holder, state.players),
    offsideLineX: offsideLineAt(holder, state.players),
    ...(lofted ? { lofted: true } : {}),
    ...(physics ? { physics } : {}),
    ...(state.setPiece ? { fromSetPiece: true } : {}),
    ...(state.setPiece?.variant ? { setPieceVariant: state.setPiece.variant } : {}),
  };
  emitPassLaunched(holder, pass);
  // A set-piece delivery into the box: everyone who went up attacks it (`set-pieces-play.md`).
  const boxDelivery = kind === 'cross' && state.setPiece?.variant === 'box';
  // Stage 10: the chasers attack the spot where the ball comes down through head height, to meet it in the air.
  const meet = fmAerialOn() && physics ? meetPoint(physics, FM_AERIAL.MEET_Z_YD, BALL_PHYSICS.GRAVITY) : null;
  return commitLooseBallChasers({ ...state, pass, setPiece: null }, holder.id, meet?.x ?? toX, meet?.y ?? toY, holder.team, {
    // A lofted pass to feet (stage 4b) is the receiver against his marker, not a crowd under the ball.
    maxPerTeam: boxDelivery ? SET_PIECE_CONFIG.SET_PIECE_CHASERS : lofted ? FM_NUMBERS.LOFT_CHASERS : C.MAX_CHASERS_PER_TEAM,
    etaHorizon: boxDelivery ? SET_PIECE_CONFIG.SET_PIECE_CHASE_ETA_HORIZON : C.CHASE_ETA_HORIZON,
    keeperSmallBoxOnly: true,
    ignoreRoleWeights: boxDelivery,
    ...(meet ? { flightS: meet.t } : {}),
  });
}

/** A headed lay-off (knock-down) from `w` to `mate`; with the physical pass (stage 4) launched from the head. */
function headerLayOff(s: GameState, w: GamePlayer, mate: GamePlayer, distance: number): PassState {
  const pass: PassState = {
    fromId: w.id, toId: mate.id, toX: mate.x, toY: mate.y, kind: 'regular', t: 0, distance,
    receiverOffside: checkReceiverOffside(w, mate, s.players), intendedRunnerId: null,
    offsideLineX: offsideLineAt(w, s.players), header: true,
  };
  if (passPhysicsOn() && distance > 0.5) {
    const opps = s.players.filter(p => p.team !== w.team);
    const factor = passErrorFactor(headingOf(w), distance, holderPressure(w.x, w.y, opps));
    pass.physics = buildGroundLaunch({ x: w.x, y: w.y }, { x: mate.x, y: mate.y }, BALL_PHYSICS.HEAD_Z, ballEnv(s.weather),
      factor, launchNormals(matchRandom), () => 'header').launch;
    emitPassLaunched(w, pass);
  }
  return pass;
}

/** Chance of controlling a high ball at first touch (else it drops loose): base + first touch. */
function highBallControlChance(p: GamePlayer, weatherMult = 1): number {
  const C = AERIAL_CONFIG;
  return Math.max(0, Math.min(1, (C.CONTROL_BASE + C.CONTROL_TOUCH * p.runtimeStats.withBall.firstTouch) * weatherMult));
}

/** A header at goal by `headerId` (`aerial.md`): own xG (× HEADER_XG_MULT), aim from heading. */
function startHeader(state: GameState, headerId: number, pressureMult = 1): GameState {
  const p = state.players.find(pl => pl.id === headerId)!;
  const goalX = p.attackDir === 1 ? PITCH_LENGTH : 0;
  const dist = Math.abs(goalX - p.x);
  const openAngle = computeOpenAngle(p.x, p.y, goalX);
  const pressure = computeWeightedPressure(p, state.players.filter(o => o.team !== p.team)) * pressureMult;
  // Stage 6 (`xg.md`): the FM header models (ball height a placeholder until the 3D ball).
  const fmXg = DECISION_FLAGS.FM_XG ? shotXg(p, state.players, 'header') : null;
  const xg = fmXg ? fmXg.xg : computeXG(dist, openAngle, pressure) * AERIAL_CONFIG.HEADER_XG_MULT;
  if (fmXg?.fm) logShotXg(p, fmXg.fm);
  // Stage 7: a physical header (from the head, heading as the skill).
  if (DECISION_FLAGS.SHOT_PHYSICS && DECISION_FLAGS.BALL_3D) {
    const shot = physicalShot(state, p, { technique: 'header', skill: Math.min(1, headingOf(p)) }, { xg, header: true });
    if (shot) {
      gameBus.emit('shot', { player: p.id, xg, ...shotOrigin(state, p.id) });
      gameBus.emit('header', { player: p.id, xg });
      debugLog('aerial', `${p.name} heads at goal (xG ${xg.toFixed(2)})`, { playerId: p.id, data: { xg, dist: Math.round(dist) } });
      return { ...state, ballHolderId: p.id, pass: null, setPiece: null, shot };
    }
  }
  // Heading stands in for finishing in the aim spread.
  const aimAs: GamePlayer = {
    ...p,
    runtimeStats: { ...p.runtimeStats, withBall: { ...p.runtimeStats.withBall, shootAccuracy: Math.min(0.95, headingOf(p)) } },
  };
  const { toX, toY } = computeShotAim(aimAs);
  gameBus.emit('shot', { player: p.id, xg, ...shotOrigin(state, p.id) });
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
/** The contact found in flight (stage 10), handed to `resolveAerialLanding`. */
export interface AerialContactAt {
  point: { x: number; y: number };
  z: number;
  toucherId: number;
  contestantIds: number[];
  flightS: number;
}

/**
 * Stage 10 (`aerial.md` -> "Stage 10"): the high ball met `hit` along its flight. The ball stops there (its height is the
 * contact's); the contestants are the toucher and whoever reaches the same ball within `CONTEST_YD`; the rest is the
 * landing resolution at the contact point.
 */
export function resolveAerialContact(s: GameState, hit: AerialContactHit, catchers: readonly AerialCatcher[], rng: () => number = matchRandom): TickResult {
  const ball = s.ball!;
  const st: GameState = { ...s, ball: { ...ball, ...hit.ball, elapsed: ball.elapsed + hit.at, metZ: hit.z } };
  const contestants = contestantsOf(hit, catchers);
  return resolveAerialLanding(st, rng, {
    point: hit.point, z: hit.z, toucherId: hit.id, contestantIds: contestants.map(c => c.id), flightS: ball.elapsed + hit.at,
  });
}

export function resolveAerialLanding(state: GameState, rng: () => number = matchRandom, contact?: AerialContactAt): TickResult {
  const C = AERIAL_CONFIG;
  const pass = state.pass!;
  const kind = pass.kind as 'cross' | 'long_ball' | 'clearance';
  const fm = fmAerialOn();
  const point = contact ? { ...contact.point } : { x: pass.toX, y: pass.toY };
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
  // Stage 10: at a contact in flight only its contestants; a landing nobody met in flight is nobody's.
  const inContest = (p: GamePlayer) => (contact ? contact.contestantIds.includes(p.id) : !fm && dist(p) <= C.AERIAL_RADIUS);
  const near = active.filter(p => p.role !== 'GK' && inContest(p));
  const attackers = near.filter(p => p.team === passerTeam);
  const defenders = near.filter(p => p.team === defTeam);
  const passerSide = s.players.find(p => p.team === passerTeam);
  const attackGoalX = (passerSide?.attackDir ?? 1) === 1 ? PITCH_LENGTH : 0;
  const contactZ = contact?.z ?? 0;
  const inAir = contactZ > FM_AERIAL.AIR_Z_YD;
  /** Stage 10: the contact event (who went for it, who won); with no contact (`winner` null) nobody met it. */
  const reportContact = (winner: GamePlayer | null, goers: GamePlayer[]) => {
    if (!fm) return;
    gameBus.emit('aerialContact', {
      kind, corner: pass.fromSetPiece === true && pass.setPieceVariant === 'box', passerTeam,
      toucherId: winner?.id ?? null, toucherTeam: winner?.team ?? null, keeper: winner?.role === 'GK',
      x: point.x, y: point.y, z: contactZ, air: winner !== null && inAir, contested: goers.length > 1,
      flightS: contact?.flightS ?? 0, inBox: isInGoalScoreArea(point.x, point.y, attackGoalX),
      contestants: goers.map(p => ({ id: p.id, team: p.team, line: headerLine(p.role), won: p.id === winner?.id })),
    });
    if (winner) {
      debugLog('aerial', `${winner.name} meets the ${kind.replace('_', ' ')} at ${(contactZ / 1.0936).toFixed(1)} m${goers.length > 1 ? ` against ${goers.length - 1}` : ''}`, {
        playerId: winner.id, data: { z: Math.round((contactZ / 1.0936) * 10) / 10, x: Math.round(point.x), y: Math.round(point.y) },
      });
    }
  };

  // ── Keeper ────────────────────────────────────────────────────────────────
  const gk = active.find(p => p.team === defTeam && p.role === 'GK');
  // Stage 10: the keeper comes into it only when he reaches the ball in flight (a contestant).
  if (gk && (!fm || (contact !== undefined && contact.contestantIds.includes(gk.id)))) {
    const gkGoalX = gk.attackDir === 1 ? 0 : PITCH_LENGTH;
    const dGk = dist(gk);
    const nearestOther = active.filter(p => p.id !== gk.id).reduce((m, p) => Math.min(m, dist(p)), Infinity);
    const inSmall = isInSmallBox(point.x, point.y, gkGoalX);
    // A defender near the ball and not beaten (goal-side or level) plays it instead (`defenderCovers`).
    const covered = defenderCovers(gk, point, active);
    // Stage 10: a keeper at the ball in flight goes for it with his hands.
    const comesNear = fm || (keeperComesFor(dGk, inSmall, dGk < nearestOther) && !covered);
    // Beyond the small box, anywhere in the box: harder to catch, a miss drops loose (`Keeper.ts`).
    const wide = !comesNear && !inSmall && !covered && keeperComesWide(dGk, isWideClaimZone(point.x, point.y, gkGoalX), nearestOther);
    if (comesNear || wide) {
      const depth = depthFrom(gkGoalX, point.x);
      if (wide) {
        gameBus.emit('keeperComeOut', { keeperId: gk.id, kind: 'high', depth });
        debugLog('keeper', `${gk.name} comes off his line for a high ball ${depth.toFixed(0)} yds out`, { playerId: gk.id });
      }
      // Beyond the small box a catch gets harder with the depth, whichever rule brought him out.
      const deep = !inSmall;
      const chance = gkClaimChance(gk, attackers.length, weatherEffectOf(s.weather).gkClaim) * (deep ? wideClaimFactor(depth) : 1);
      logWeather(s, 'gkClaim', `${gk.name}'s claim chance ${(chance * 100).toFixed(0)}%`, gk.id);
      const claimed = rng() < chance;
      reportContact(gk, [gk, ...near]);
      gameBus.emit('gkClaim', { keeperId: gk.id, claimed, chance, x: point.x, y: point.y });
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
          setPiece: { type: 'goal_kick', takerId: gk.id, countdown: restartFreeze(state, RESTART_DEAD_S.GOAL_KICK) },
        }, prevHolderId));
      }
      if (deep && rng() < KEEPER_CONFIG.HIGH_FLAP_SHARE) {
        // He gets a hand to it but drops it: the ball sits loose in the box.
        resolved(gk.id, false, 'loose');
        debugLog('keeper', `${gk.name} flaps at it — loose in the box`, { playerId: gk.id });
        return done(dropLooseAt(s, gk, point));
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
      return done(aerialOffsideFreeKick(s, a, { x: a.x, y: a.y }, pass.offsideLineX));
    }
    // A set-piece delivery: the defenders are set, goal-side of their man (`set-pieces-play.md`).
    const setPieceCross = pass.setPieceVariant === 'box' && kind === 'cross';
    // Stage 10: FM's duel at the contact (jumping, standing still, goal-side) replaces the set defender's x 7.
    const { winnerId, probA } = contact
      ? resolveFmAerialDuel(a, d, attackGoalX, rng)
      : resolveAerialDuel(a, d, point, rng, setPieceCross ? SET_PIECE_CONFIG.SET_PIECE_DEFENDER_DUEL_MULT : 1);
    winner = winnerId === a.id ? a : d;
    const loser = winner.id === a.id ? d : a;
    contested = true;
    reportContact(winner, [a, d]);
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
    const fc = foulCheck(s, offender, victim, 'aerial', false, rng);
    s = fc.state;
    const fouled = fc.foul;
    if (fouled) {
      resolved(victim.id, victim.team === passerTeam, 'foul');
      return done(fouled);
    }
    winner = s.players.find(p => p.id === winner!.id)!;
  } else if (near.length > 0) {
    winner = contact ? (near.find(p => p.id === contact.toucherId) ?? near.reduce((a, b) => (dist(b) < dist(a) ? b : a)))
      : near.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    // An offside attacker meeting it alone (stage 10: met in flight) is flagged like a challenger.
    if (contact && winner.team === passerTeam && (pass.aerialOffsideIds ?? []).includes(winner.id)) {
      resolved(winner.id, false, 'offside');
      return done(aerialOffsideFreeKick(s, winner, { x: winner.x, y: winner.y }, pass.offsideLineX));
    }
    reportContact(winner, [winner]);
  }

  // ── Nobody reached it: the ball drops and runs on ─────────────────────────
  if (!winner) {
    reportContact(null, []);
    const len = pass.distance > 0.001 ? pass.distance : 1;
    const dirX = passer ? (point.x - passer.x) / len : 0;
    const dirY = passer ? (point.y - passer.y) / len : 0;
    const v = THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED * weatherEffectOf(s.weather).looseSpeed;
    // Stage 10: the physical ball lands and bounces on at its own pace.
    const phys = fm && s.ball && s.ball.phase === 'pass' ? s.ball : null;
    if (phys) {
      point.x = Math.max(0.5, Math.min(PITCH_LENGTH - 0.5, phys.x));
      point.y = Math.max(0.5, Math.min(PITCH_WIDTH - 0.5, phys.y));
    }
    debugLog('aerial', `High ball lands untouched at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`, { playerId: pass.fromId });
    logWeather(s, 'looseSpeed', 'Loose ball off the high ball', pass.fromId);
    logWeather(s, 'looseDecel', 'Loose ball off the high ball', pass.fromId);
    return done({
      ...s,
      looseBall: {
        x: point.x, y: point.y, vx: phys ? phys.vx : dirX * v, vy: phys ? phys.vy : dirY * v,
        startTime: s.matchTime,
        fromPasserId: pass.fromId,
        fromTeamLastTouch: passerTeam,
        intendedRunnerId: pass.intendedRunnerId,
        receiverOffside: pass.intendedRunnerId !== null && (pass.aerialOffsideIds ?? []).includes(pass.intendedRunnerId),
        source: kind,
        offsideIds: pass.aerialOffsideIds ?? [],
        offsideLineX: pass.offsideLineX,
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
    const v = THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED * weatherEffectOf(s.weather).looseSpeed;
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
        ...(attacking ? { offsideIds: pass.aerialOffsideIds ?? [], offsideLineX: pass.offsideLineX } : {}),
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
      return done(aerialOffsideFreeKick(s, winner, { x: winner.x, y: winner.y }, pass.offsideLineX));
    }
    const goalX = winner.attackDir === 1 ? PITCH_LENGTH : 0;
    // The winner meets the ball at the landing point.
    s = { ...s, players: s.players.map(p => (p.id === winner!.id ? { ...p, x: point.x, y: point.y, targetPosition: { ...point } } : p)) };
    const w = s.players.find(p => p.id === winner!.id)!;
    const angle = computeOpenAngle(point.x, point.y, goalX);
    // Stage 10: a header needs the ball in the air (met above 1.2 m); lower, he plays it on the ground.
    if (Math.abs(goalX - point.x) <= C.HEADER_RANGE && angle >= C.HEADER_MIN_ANGLE && (!contact || inAir)) {
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
        pass: headerLayOff(s, w, mate, distance),
      });
    }
    logWeather(s, 'control', `${w.name} controls a high ball`, w.id);
    if (rng() >= highBallControlChance(w, weatherEffectOf(s.weather).control)) return done(dropLoose(s, w));
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
    const again = pass.fromSetPiece && pass.setPieceVariant === 'box' ? SET_PIECE_CONFIG.CORNER_REPEAT_MULT : 1;
    if (kind === 'cross' && deep && rng() < SET_PIECE_CONFIG.CROSS_CLEAR_CORNER_CHANCE * again) {
      const exitX = ownGoalX === 0 ? -1 : PITCH_LENGTH + 1;
      return resolveOOBSetPiece(s, 'corner', passerTeam, exitX, point.y, winner.id, 'clearance', 'cross_clearance');
    }
    return done(clearanceBall(s, winner, point, uniform(rng, C.CLEARANCE_DIST_MIN, C.CLEARANCE_DIST_MAX), rng));
  }
  logWeather(s, 'control', `${winner.name} controls a high ball`, winner.id);
  if (rng() >= highBallControlChance(winner, weatherEffectOf(s.weather).control)) return done(dropLoose(s, winner));
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
/** Emits one decision telemetry event (`decisions.md`). */
function emitDecisionTelemetry(
  p: GamePlayer, cap: CapturedDecision, decisionType: string, ballPos: { x: number; y: number }, pressure: number, t: number,
): void {
  const { argmax, margin } = argmaxAndMargin(cap.scores);
  const event = cap.family === 'holder' ? 'holderDecision' : cap.family === 'offBall' ? 'offBallDecision' : 'defensiveDecision';
  if (!gameBus.has(event)) return;
  gameBus.emit(event, {
    playerId: p.id, team: p.team, family: cap.family,
    chosen: cap.chosen ?? decisionType, decision: decisionType,
    scores: cap.scores, argmax, margin,
    bucket: situationBucket(ballPos.x, ballPos.y, p.attackDir, pressure),
    pressure, t,
  });
}

/**
 * Real-seconds per "tick" that the tick-counted timers were tuned for (`COMMIT_TICKS`, `justReceivedTicks`, the
 * through-ball cell cache): `simulateMatch`'s 0.2 s step, which every calibration (goals, quickSim, formations) used.
 * Those counters go down by `dt / DECISION_REF_DT` per call, so they last the same real time at any step: exactly 1
 * per tick at 0.2 s (the simulation is unchanged), 1/12 per tick at the live match's 1/60 s (`advanceSim`). Before,
 * they went down by 1 per tick: at 1/60 every commitment and the post-reception burst lasted 12 times less, and the
 * live match had ~20–30% more shots and goals than the calibrated simulation.
 */
export const DECISION_REF_DT = 0.2;

/** Distance (yd) from `p` to the nearest opponent on the pitch. */
function nearestOpponentDist(players: readonly GamePlayer[], p: GamePlayer): number {
  let best = Infinity;
  for (const o of players) if (o.team !== p.team) best = Math.min(best, Math.hypot(o.x - p.x, o.y - p.y));
  return best;
}

/** Carry speed share of a holder step (stage 4b hold / turn; stage 8 spin / flag, `holder-choice.md`). */
function holderStepSpeed(step: HolderStep | undefined): number {
  const fm = DECISION_FLAGS.FM_HOLDER;
  switch (step) {
    case 'hold': return fm ? HOLDER_CHOICE.HOLD_SPEED : FM_NUMBERS.HOLD_SPEED;
    case 'turn': return fm ? HOLDER_CHOICE.TURN_SPEED : FM_NUMBERS.TURN_SPEED;
    case 'spin': return HOLDER_CHOICE.SPIN_SPEED;
    case 'flag': return HOLDER_CHOICE.FLAG_SPEED;
    default: return 1;
  }
}

/** How long (ticks of 0.2 s) a holder action lasts before he re-decides (stage 4b, `fm-numbers.md`). */
function holderActionTicks(d: PlayerDecision): number {
  if (d.type === 'carry') {
    const H = HOLDER_CHOICE;
    const fm = DECISION_FLAGS.FM_HOLDER;
    const sec = d.step === 'hold' ? (fm ? H.HOLD_S : FM_NUMBERS.HOLD_S)
      : d.step === 'turn' ? (fm ? H.TURN_S : FM_NUMBERS.TURN_S)
      : d.step === 'spin' ? H.SPIN_S
      : d.step === 'flag' ? H.FLAG_S
      : d.step === 'sprint' ? H.SPRINT_MAX_S
      : FM_NUMBERS.CARRY_STEP_MAX_S;
    return sec / DECISION_REF_DT;
  }
  if (d.type === 'dribble') return COMMIT_TICKS.dribble;
  return 0;
}

/**
 * One engine tick. The match generator (`MatchRng.ts`) is loaded from `state.rng` first and its advanced state is
 * written into the returned state, so every draw of the tick is reproducible from the state.
 */
export function tickState(state: GameState, dt: number, passSpeed = 0.85): TickResult {
  if (state.rng !== undefined) loadMatchRng(state.rng);
  const r = tickStateCore(state, dt, passSpeed);
  // Stage 3 (`ball-3d.md`): the 3D ball follows the play (passes, shots, loose balls, held).
  const ball = DECISION_FLAGS.BALL_3D ? syncBall(state, r.state, dt, passSpeed) : undefined;
  const next = { ...r.state, rng: matchRngState(), ball };
  // Stage 18 (`highlights.md`): the highlight layer reads every step (observation only).
  if (DECISION_FLAGS.HIGHLIGHTS) gameBus.emit('simStep', { state: next, dt, ball: getBallPos(next) });
  return { ...r, state: next };
}

function tickStateCore(state: GameState, dt: number, passSpeed = 0.85): TickResult {
  const noop = (s: GameState): TickResult =>
    ({ state: s, passCompleted: false, tackled: false, goalScored: null });

  // ── Match phase gating ────────────────────────────────────────────────────
  if (state.matchPhase === 'preMatch') {
    const countdown = state.presentationCountdown - dt;
    if (countdown <= 0) {
      gameBus.emit('matchStart', { extraTime: Math.round(state.extraTimeFirst / 60) });
      emitStudyPlans(state);
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
    if (so.live) {
      // Interactive shootout: hold while a kick waits for its 2D answer.
      if (state.pendingPenalty) return noop(state);
      const left = state.presentationCountdown - dt;
      if (left > 0) return noop({ ...state, presentationCountdown: left });
      if (so.live.done) return noop(finishMatch({ ...state, presentationCountdown: 0 }));
      const team = so.live.next;
      const list = so.live.order[team];
      const takerId = list.length > 0 ? list[so.live.taken[team] % list.length]! : -1;
      const gk = state.players.find(p => p.team !== team && p.role === 'GK') ?? null;
      const pending = { kind: 'shootout' as const, team, takerId, keeperId: gk?.id ?? null };
      gameBus.emit('penaltyPending', pending);
      return noop({ ...state, presentationCountdown: 0, pendingPenalty: pending });
    }
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

  // A penalty waiting for its 2D answer (`pendingPenalty`): everything holds, the clock included.
  if (state.pendingPenalty) return noop(state);

  // ── VAR check (`var.md`): play frozen for real seconds, no game time; the decision is applied at the end.
  if (state.varReview) {
    const countdown = state.varReview.countdown - dt;
    if (countdown > 0) return noop({ ...state, varReview: { ...state.varReview, countdown } });
    return noop(endVarReview(state));
  }

  // ── Clock advancement (the four live periods) ─────────────────────────────
  const newMatchTime = state.matchTime + dt * clockScaleOf(state);
  const periodEnd =
    state.matchPhase === 'firstHalf'       ? HALF_DURATION + state.extraTimeFirst :
    state.matchPhase === 'secondHalf'      ? HALF_DURATION + state.extraTimeSecond :
    state.matchPhase === 'extraTimeFirst'  ? ET_HALF_DURATION + (state.etStoppageFirst ?? 0) :
                                             ET_HALF_DURATION + (state.etStoppageSecond ?? 0);

  if (!state.testMode && newMatchTime >= periodEnd && !restartHoldsPeriod(state, newMatchTime, periodEnd) && !attackHoldsPeriod(state, newMatchTime, periodEnd)) {
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
      if (p.recoveryTime > 0) {
        updates.recoveryTime = Math.max(0, p.recoveryTime - dt);
        if (updates.recoveryTime === 0 && p.recoverySpeed !== undefined) updates.recoverySpeed = undefined;
      }
      if (p.justReceivedTicks > 0) updates.justReceivedTicks = Math.max(0, p.justReceivedTicks - dt / DECISION_REF_DT);
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
  if (inSubsWindow && shouldCheckAiSubs(s.matchTime, dt * clockScaleOf(s))) {
    // Team B is always AI in live matches; `aiTeams` can override for headless sim
    const subsB = evaluateAiSubstitutions(s, 'B', matchMinute(s));
    if (subsB.length > 0) {
      s = { ...s, pendingSubsB: [...s.pendingSubsB, ...subsB] };
    }
    // The human side's assistant (manager banned or sent off, `var.md` §4) makes the changes by the same rule.
    if (s.autoSubs?.A) {
      const subsA = evaluateAiSubstitutions(s, 'A', matchMinute(s));
      if (subsA.length > 0) s = { ...s, pendingSubsA: [...s.pendingSubsA, ...subsA] };
    }
  }

  const holder  = s.players.find(p => p.id === s.ballHolderId)!;
  const inFlight = s.pass !== null || s.shot !== null;

  // ── Possession timer ───────────────────────────────────────────────────
  // Always increment here. Individual possession-change handlers (tackle,
  // interception, dribble loss, offside, GK save) reset it to 0 when the
  // ball moves to the other team.
  s = { ...s, possessionTime: (state.possessionTime ?? 0) + dt };
  // Stage 20 (4c-3): the transition windows of the instructions read this clock.
  {
    const passer = s.pass ? s.players.find(p => p.id === s.pass!.fromId) : undefined;
    const change = setPossessionClock(holder?.team ?? passer?.team ?? null, s.possessionTime, s.matchTime);
    if (change) gameBus.emit('possessionWon', { team: change.won, sinceLost: change.sinceLost });
    // Stage 20 (4c-7): an AI side re-picks its instructions when the score or the late-game band changes.
    const minute = matchMinute(s);
    for (const t of ['A', 'B'] as const) {
      const lead = s.score[t] - s.score[t === 'A' ? 'B' : 'A'];
      if (stepAiInstructions(t, lead, minute)) debugLog('instruction', `team ${t} AI instructions for lead ${lead} at ${minute}'`);
    }
  }

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
      nextTbCache   = { ...cache!, ticksSinceRefresh: cache!.ticksSinceRefresh + dt / DECISION_REF_DT };
    } else {
      tbCachedCells = enumerateCandidateCells(holder, s.players, crowdGrid, offsideLine);
      nextTbCache   = {
        holderId:          s.ballHolderId,
        ticksSinceRefresh: dt / DECISION_REF_DT,
        cells:             tbCachedCells,
      };
    }
  } else if (s.throughBallCellsCache != null) {
    // No valid TB context (in flight, or GK has the ball) — drop the cache so
    // the next holder gets a fresh enumeration.
    nextTbCache = null;
  }
  s = { ...s, throughBallCellsCache: nextTbCache };

  // ── Team shape and held actions (stage 15, `team-shape.md`) ──────────────
  setShapeFormations(s.formationA, s.formationB);
  // A state that did not come from createMatchState (a /test scenario, a new period's clock): the held actions and
  // shoulder runs of a previous match (the same player ids) must not carry over.
  if (s.matchTime + 1 < _lastShapeMatchTime || s.matchPhase !== _lastShapePhase) { resetActionHold(); resetShoulderRuns(); }
  _lastShapeMatchTime = s.matchTime; _lastShapePhase = s.matchPhase;
  if (isLivePhase(s.matchPhase)) advanceActionClock(dt);

  // ── Offside line reads (stage 13, `OffsideRuns.ts`) ──────────────────────
  // An attacker reads the line every few tenths of a second with an error; his own movement and off-ball choices use
  // that read (`lineFor`), so a stepping-up line or a misread leaves him past it. The call itself uses the true line.
  if (DECISION_FLAGS.OFFSIDE_RUNS && isLivePhase(s.matchPhase)) {
    let changed = false;
    const players = s.players.map(p => {
      if (p.team !== attackingTeam || p.role === 'GK') return p.lineRead ? (changed = true, { ...p, lineRead: undefined }) : p;
      const read = refreshLineRead(p, offsideLine, s.matchTime, clockScaleOf(s));
      if (read === p.lineRead) return p;
      changed = true;
      // Counted once per misjudged spell: a misread read after a good one (or his first read).
      const bad = (r: typeof read) => !!r && (r.err > ATTACK_CONFIG.OFFSIDE_MARGIN || r.lapse);
      // Only near the line, where a misread can be offside (within MISREAD_NEAR_YD of it).
      if (read && offsideLine !== null && bad(read) && !bad(p.lineRead)
        && Math.abs(p.x - offsideLine) <= OFFSIDE_RUNS.MISREAD_NEAR_YD) {
        gameBus.emit('lineMisread', { playerId: p.id, team: p.team, err: read.err, lapse: read.lapse });
        debugLog('offside', `${p.name} misreads the line by ${read.err.toFixed(1)} yd${read.lapse ? ' (lapse)' : ''}`, { playerId: p.id, data: { lineX: read.lineX, err: read.err } });
      }
      return { ...p, lineRead: read };
    });
    if (changed) s = { ...s, players };
  }
  // ── Mind off the ball and in defence (stage 16, `DefensiveMind.ts`) ──────
  // Every outfield player without the ball rolls decisions, anticipation, concentration and aggression per window; the
  // defensive and off-ball evaluators read the rolls as modifiers on their intent scores.
  if (DECISION_FLAGS.DEFENSIVE_MIND && isLivePhase(s.matchPhase)) {
    let changed = false;
    const players = s.players.map(p => {
      if (p.role === 'GK' || p.id === holder.id) return p.mind ? (changed = true, { ...p, mind: undefined }) : p;
      const mind = refreshMindRolls(p, s.matchTime, clockScaleOf(s));
      if (mind === p.mind) return p;
      changed = true;
      if (mind.lapse && !p.mind?.lapse) {
        const kind = p.team === attackingTeam ? 'offball' : 'defence';
        gameBus.emit('mindLapse', { playerId: p.id, team: p.team, kind });
        debugLog('mind', `${p.name} loses concentration (${kind})`, { playerId: p.id, data: { conc: mind.conc, energy: Math.round(p.energy) } });
      }
      return { ...p, mind };
    });
    if (changed) s = { ...s, players };
  }
  const lineFor = (p: GamePlayer): number | null => (DECISION_FLAGS.OFFSIDE_RUNS && p.team === attackingTeam && p.lineRead
    ? perceivedLine(p.lineRead, p.attackDir, s.matchTime)
    : offsideLine);

  // ── Compute decisions with short-term memory ───────────────────────────
  // Each player has a DecisionPath (BALL_HOLDER | TEAM_WITH_BALL | TEAM_WITHOUT_BALL).
  // When the path is unchanged and commitTicks > 0, the previous decision is reused.
  // Path changes (e.g. possession switch) always force a fresh decision immediately.
  const newDecisions: Record<number, PlayerDecision> = {};
  const updatedMemory: Record<number, import('./DecisionTree').DecisionMemory> = {};
  const updatedNoise = new Map<number, import('@/GameEngine/types').HolderMindState>();

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
  // The contested ball was just collected: every chaser re-decides below (#145). The ones of the
  // team that lost the race are beaten — a short recovery (no challenge, slowed) as they turn back
  // to the shape, the time advantage the engine gives any lost duel (`dribbling.md`).
  if (!chaseTarget && THROUGH_BALL_CONFIG.RACE_LOSS_RECOVERY > 0) {
    const losers = s.players.filter(p => {
      const d = p.decisionMemory?.decision;
      return p.team !== holder.team && d?.type === 'chase_loose_ball' && !d.meet && !d.intercept;
    });
    if (losers.length > 0) {
      const ids = new Set(losers.map(p => p.id));
      s = { ...s, players: s.players.map(p => (ids.has(p.id)
        ? {
          ...p,
          recoveryTime: Math.max(p.recoveryTime, THROUGH_BALL_CONFIG.RACE_LOSS_RECOVERY),
          recoverySpeed: THROUGH_BALL_CONFIG.RACE_LOSS_SPEED_FACTOR,
        }
        : p)) };
    }
  }

  // The receiver of a physical pass (stage 4, `pass-physics.md`) goes to meet the ball: the nearest point of its path
  // ahead of it (the ball no longer follows him).
  const meetPass = PASS_PHYSICS.MEET && s.pass && s.pass.kind === 'regular' && s.pass.toId !== null && isPhysicalGroundPass(s, s.pass) ? s.pass : null;
  const meetPointFor = (p: GamePlayer): { x: number; y: number } => {
    const b = s.ball!;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 1e-3) return { x: b.x, y: b.y };
    const ux = b.vx / sp, uy = b.vy / sp;
    const a = Math.max(0, (p.x - b.x) * ux + (p.y - b.y) * uy);
    return { x: b.x + ux * a, y: b.y + uy * a };
  };

  // Stage 5 (`interception.md`): the defenders who reach a point of a physical pass's path in time run to it.
  const interceptRuns = s.pass && physicalInterceptionOn() && isPhysicalGroundPass(s, s.pass) ? planInterceptRuns(s, s.pass) : [];
  const runOf = new Map(interceptRuns.map(r => [r.playerId, r]));

  // Decision telemetry (`decisions.md`): only while somebody listens. The situation (the ball's third and channel, the
  // holder's pressure) is computed once per tick; no dice, nothing here feeds back into a decision.
  const telemetry = gameBus.has('holderDecision') || gameBus.has('offBallDecision') || gameBus.has('defensiveDecision');
  let telemetryPressure = 0;
  if (telemetry) {
    telemetryPressure = holderPressure(ballPos.x, ballPos.y, s.players.filter(o => o.team !== holder.team));
  }
  setDecisionCapture(telemetry);

  for (const p of s.players) {
    // A keeper who spilled a save or flapped a cross is the last touch of the loose ball: he decides and runs like
    // the others (report 2026-11-18: he stood still until someone else took it).
    const isBallHolder = p.id === s.ballHolderId && !looseKeeper(s, p);
    const currentPath: DecisionPath = isBallHolder
      ? 'BALL_HOLDER'
      : p.team === holder.team
        ? 'TEAM_WITH_BALL'
        : 'TEAM_WITHOUT_BALL';

    const mem = p.decisionMemory ?? EMPTY_DECISION_MEMORY;

    const run = runOf.get(p.id);
    if (run && !isBallHolder) {
      const cut: PlayerDecision = { type: 'chase_loose_ball', toX: run.x, toY: run.y, intercept: true };
      newDecisions[p.id] = cut;
      updatedMemory[p.id] = { path: currentPath, decision: cut, commitTicks: COMMIT_TICKS.chase_loose_ball };
      continue;
    }

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

    if (meetPass && p.id === meetPass.toId && !isBallHolder) {
      const m = meetPointFor(p);
      const meet: PlayerDecision = { type: 'chase_loose_ball', toX: m.x, toY: m.y, meet: true };
      newDecisions[p.id] = meet;
      updatedMemory[p.id] = { path: currentPath, decision: meet, commitTicks: COMMIT_TICKS.chase_loose_ball };
      continue;
    }

    // A chase only lives while its ball is contested (through / high ball in flight, loose ball).
    // Once somebody collects it the chase is stale: without this the committed chasers of both
    // teams kept sprinting to the old landing point (next to the new holder) for up to
    // COMMIT_TICKS.chase_loose_ball more ticks, bunching 3–4 players on the ball (#145).
    const staleChase = !chaseTarget && mem.decision?.type === 'chase_loose_ball';
    const pathChanged = mem.path !== currentPath || staleChase;

    // Reuse committed decision if path is stable and ticks remain.
    // Ball holder is always re-evaluated (carries, shoots, passes change quickly).
    if (!isBallHolder && !pathChanged && mem.commitTicks > 0 && mem.decision !== null) {
      newDecisions[p.id] = mem.decision;
      updatedMemory[p.id] = { ...mem, commitTicks: mem.commitTicks - dt / DECISION_REF_DT };
      continue;
    }
    // Action cadence (stage 4b, `fm-numbers.md`): the holder decides when he receives and when his action ends — a
    // carry step of CARRY_STEP_YD, a hold or a turn, a dribble until it is resolved — not every tick.
    if (isBallHolder && DECISION_FLAGS.ACTION_CADENCE && !pathChanged && mem.commitTicks > 0 && mem.decision !== null
      && (mem.decision.type === 'carry' || mem.decision.type === 'dribble')
      && !s.pass && !s.looseBall && !s.shot && !(s.setPiece && s.setPiece.takerId === p.id)) {
      const d = mem.decision;
      const moved = mem.from ? Math.hypot(p.x - mem.from.x, p.y - mem.from.y) : 0;
      const stepLen = d.type !== 'carry' ? Infinity
        : !d.step || d.step === 'byline' ? FM_NUMBERS.CARRY_STEP_YD
        : d.step === 'sprint' ? HOLDER_CHOICE.SPRINT_STEP_YD : Infinity;
      const stepDone = moved >= stepLen;
      const nd = nearestOpponentDist(s.players, p);
      // Stage 8 (`holder-choice.md`): FM decides when the action ends — only a challenge coming in (an opponent inside
      // CHALLENGE_YD who was farther at the start) cuts it short. Stage 4b: a new threat closing in, any challenge and the
      // shooting zone (read every tick) all re-decide at once.
      const interrupt = DECISION_FLAGS.FM_HOLDER
        ? nd <= HOLDER_CHOICE.CHALLENGE_YD && (mem.nearD ?? Infinity) > HOLDER_CHOICE.CHALLENGE_YD
        : (nd <= FM_NUMBERS.INTERRUPT_YD && nd < (mem.nearD ?? Infinity) - FM_NUMBERS.INTERRUPT_CLOSE_YD)
          || nd <= FM_NUMBERS.CHALLENGE_YD
          // In the shooting zone a chance opens in a tick: he reads it every tick there.
          || Math.hypot((p.attackDir === 1 ? PITCH_LENGTH : 0) - p.x, PITCH_WIDTH / 2 - p.y) <= FM_NUMBERS.CADENCE_FREE_YD;
      if (!stepDone && !interrupt) {
        newDecisions[p.id] = d;
        updatedMemory[p.id] = { ...mem, commitTicks: mem.commitTicks - dt / DECISION_REF_DT };
        if (p.decisionNoise) updatedNoise.set(p.id, p.decisionNoise);
        continue;
      }
    }

    // Fresh decision — only the holder uses tbCachedCells (no-op for everyone else)
    const fresh = decide(
      p, holder, isBallHolder, inFlight, s.players, lineFor(p), s.possessionTime,
      s.setPiece, crowdGrid, s.teamIntent,
      isBallHolder ? tbCachedCells : null,
      s.matchTime,
      isBallHolder ? { lead: p.team === 'A' ? s.score.A - s.score.B : s.score.B - s.score.A, minute: matchMinute(s) } : undefined,
    );
    newDecisions[p.id] = fresh;
    // A holder move starting (`HolderMoves.ts`): counted once, not every tick it is held.
    if (isBallHolder && 'move' in fresh && fresh.move) {
      const prevMove = mem.decision && 'move' in mem.decision ? mem.decision.move : undefined;
      if (prevMove !== fresh.move) {
        gameBus.emit('holderMove', { playerId: p.id, team: p.team, move: fresh.move, phase: 'start' });
        debugLog('decision', `${p.name}: ${fresh.move.replace('_', ' ')}`, { playerId: p.id });
      }
    }
    if (isBallHolder) {
      // The holder's mind window (phase 3, `decisions.md`): kept while he keeps the ball, one tick spent per decision.
      const m = takeHolderMind();
      if (m) {
        updatedNoise.set(p.id, { ...m.state, ticks: m.state.ticks - dt / DECISION_REF_DT });
        if (gameBus.has('holderMind')) {
          gameBus.emit('holderMind', {
            playerId: p.id, team: p.team, fresh: m.fresh, lapse: m.state.lapse, release: m.release, openOptions: m.openOptions, distM: m.distM, simple: m.simple,
            widen: m.widen, longShotRange: m.longShotRange, mood: m.mood, pressure: m.pressure, pN: m.pN,
            rolls: { decisions: m.state.dec, composure: m.state.comp, flair: m.state.flair }, sigma: m.state.sigma,
            trueScores: m.trueScores, perceived: m.perceived, trueBest: m.trueBest, picked: m.picked,
            offArgmax: m.picked !== m.trueBest,
          });
        }
      }
    }
    updatedMemory[p.id] = isBallHolder && DECISION_FLAGS.ACTION_CADENCE
      ? {
        path: currentPath, decision: fresh, commitTicks: holderActionTicks(fresh),
        from: { x: p.x, y: p.y }, nearD: nearestOpponentDist(s.players, p),
      }
      : { path: currentPath, decision: fresh, commitTicks: COMMIT_TICKS[fresh.type] };
    if (isBallHolder && fresh.type === 'carry' && fresh.step) {
      gameBus.emit('holderStep', { playerId: p.id, team: p.team, step: fresh.step });
      const what = { hold: 'holds the ball', turn: 'turns', sprint: 'sprints with the ball', byline: 'runs at the byline', spin: 'spins past his marker', flag: 'shields it at the corner flag' }[fresh.step];
      debugLog('decision', `${p.name} ${what}`, { playerId: p.id });
    }
    if (telemetry) {
      const cap = takeCapture();
      // Set-piece takers play a forced restart: their score vector is not the decision they take.
      const forced = isBallHolder && s.setPiece != null && s.setPiece.takerId === p.id;
      if (cap && !forced) emitDecisionTelemetry(p, cap, fresh.type, ballPos, telemetryPressure, s.matchTime);
    }
  }
  if (telemetry) setDecisionCapture(false);

  // Apply new memory to player objects
  const playersWithMemory = s.players.map(p => {
    const next = { ...p, decisionMemory: updatedMemory[p.id] ?? p.decisionMemory };
    const noise = updatedNoise.get(p.id);
    if (noise) next.decisionNoise = noise;
    else if (next.decisionNoise) delete next.decisionNoise; // a new holder (or a set-piece taker) starts a fresh window
    return next;
  });

  s = { ...s, decisions: newDecisions, players: playersWithMemory };
  if (interceptRuns.length > 0) s = { ...s, interceptRuns };
  else if (s.interceptRuns) s = { ...s, interceptRuns: undefined };

  if (shouldDrainStamina(s)) {
    const weatherDrain = weatherEffectOf(s.weather).drain;
    s = {
      ...s,
      players: s.players.map(p => {
        const pl = normalizeGamePlayer(p);
        if (pl.baseStats == null) return p;
        const dec = newDecisions[pl.id];
        const action = resolveStaminaAction(pl, s.ballHolderId, holder.team, dec);
        const energy = consumeEnergy(
          pl.energy, pl.stamina, action, dt * clockScaleOf(s),
          (pl.drainMultiplier ?? 1) * tacticDrainMult(pl.team, action) * weatherDrain * conditionDrainMult(pl),
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

  // Condition by minute (stage 14, `Condition.ts`): one sample per team at every new match minute of live play.
  if (isLivePhase(s.matchPhase) && (matchMinute(s) !== matchMinute(state) || s.matchPhase !== state.matchPhase)) {
    const minute = matchMinute(s);
    for (const team of ['A', 'B'] as const) {
      const mine = s.players.filter(p => p.team === team);
      if (mine.length === 0) continue;
      const keeper = mine.find(p => p.role === 'GK');
      gameBus.emit('conditionSample', { minute, team, median: outfieldMedianCondition(mine), keeper: keeper ? keeper.energy : null });
    }
  }

  // Man-marking time (player instructions): the marked targets, for the marked-target statistics.
  if (s.manMarks && isLivePhase(s.matchPhase)) {
    const targetIds = [...(s.manMarks.A ?? []), ...(s.manMarks.B ?? [])].map(p => p.targetId);
    gameBus.emit('manMarkTick', { targetIds, seconds: dt * clockScaleOf(s) });
  }

  // Ball cluster statistics (#145): players of each side bunched within 8 yards of the ball.
  if (isLivePhase(s.matchPhase) && !s.setPiece && !s.varReview && !s.shot) {
    const ball = getBallPos(s);
    const clusterDef: TeamId = holder.team === 'A' ? 'B' : 'A';
    gameBus.emit('ballCluster', {
      defendingTeam: clusterDef,
      defendersNear: outfieldNearBall(s.players, clusterDef, ball).length,
      attackersNear: outfieldNearBall(s.players, holder.team, ball).length,
    });
  }

  // ── 1. Formation movement — runs every tick, including during passes/shots ──
  {
    const markAssignments = assignMarkTargets(s.players, defendingTeam);
    const moveLog = newMoveLog();
    // The defending shape reads where the ball is going (`BallPrediction.ts`, `COHESION.PREDICT_S`).
    const shapeBallPos = predictBallPoint(s, ballPos);
    s = updateBackLine(s, defendingTeam, shapeBallPos, dt);
    s = updateTeamShape(s, defendingTeam, shapeBallPos, dt);
    const pressState = pressStateOf(shapeBallPos, s.players.find(p => p.team === defendingTeam)?.attackDir ?? 1);

    const movedPlayers = s.players.map(player => {
      if (player.id === s.ballHolderId && !looseKeeper(s, player)) return player;

      // Stage 7: the keeper and the planned blockers of a physical shot are moved by the shot itself (`tickPhysicalShot`).
      if (s.shot?.physics && player.team !== teamOfId(s, s.shot.shooterId)
        && (player.role === 'GK' || s.shot.physics.blocks.some(r => r.id === player.id))) return player;
      // GK override: sprint to the ball's path (an advanced keeper does not run back to the line)
      if (s.shot !== null && player.role === 'GK') {
        const shooter = s.players.find(p => p.id === s.shot!.shooterId);
        if (shooter && player.team !== shooter.team) {
          const gkTarget = shotInterceptPoint(player, s.shot);
          const dx = gkTarget.x - player.x;
          const dy = gkTarget.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.01) return { ...standStill(player, s, dt, moveLog), targetPosition: gkTarget };
          const recoveryMult = recoverySpeedMult(player);
          const step = Math.min(player.runtimeStats.withoutBall.pressSpeed * recoveryMult * dt, dist);
          // The keeper's reaction to a shot is a dive, not a run: no acceleration ramp (`kinematics.md`).
          const nx = player.x + (dx / dist) * step;
          const ny = player.y + (dy / dist) * step;
          return {
            ...finishMove(player, s, dt, nx, ny, (nx - player.x) / dt, (ny - player.y) / dt, 1, player.runtimeStats.withoutBall.pressSpeed, moveLog),
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
        if (cdist < 0.01) return { ...standStill(player, s, dt, moveLog), targetPosition: targetPt };
        const recoveryMult = recoverySpeedMult(player);
        const step = Math.min(sprintSpeed * recoveryMult * dt, cdist);
        const legacy = { x: player.x + (cdx / cdist) * step, y: player.y + (cdy / cdist) * step };
        return { ...moveToward(player, s, dt, targetPt, sprintSpeed * recoveryMult, legacy, moveLog), targetPosition: targetPt };
      }
      const shadow = isPressing && decision.type === 'press' && !decision.standOff && DECISION_FLAGS.PASS_SHADOW
        && pressState >= TEAM_SHAPE.SHADOW_FROM_STATE && getMainRole(player.role) === 'Forward'
        ? passShadowPoint(player, holder, s.players) : null;
      if (isPressing && decision.type === 'press' && decision.standOff) {
        // Second presser (stage 4, `movement.md`): stands off the holder, covering the inside route.
        target = standOffPoint(player, holder);
      } else if (shadow) {
        // Pass shadow (stage 15, `team-shape.md`): a forward presses on the lane between the holder and a receiver.
        target = { x: shadow.x, y: shadow.y };
        noteShadowPress(player, holder, shadow.receiverId);
      } else if (isPressing) {
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
        const pushedBaseX = DECISION_FLAGS.FM_SHAPE && TEAM_SHAPE.APPLY_IN ? base.x : base.x + player.attackDir * pushUpT * POSSESSION_PUSH_UP.MAX_YARDS * pushUpBias;
        const pull = 1 - OFF_BALL_CONFIG.FORMATION_PULL * Math.max(0, 1 - INSTR.FREEDOM * playerDelta(player, 'freedom'));
        let tx = pushedBaseX + (rawX - pushedBaseX) * pull;
        const ty = base.y + (rawY - base.y) * pull;

        // Clamp to stay onside — on his read of the line (stage 13), not the true one.
        const ownLine = lineFor(player);
        // A run on the shoulder (stage 15, `ShoulderRuns.ts`): going on the pass (or early) he is not held on the line.
        const going = DECISION_FLAGS.SHOULDER_RUNS
          && shoulderRunGoing(player, holder, s.decisions[holder.id]?.type, ownLine, s.players, dt);
        if (going) {
          tx = Math.max(tx * player.attackDir, (player.x + player.attackDir * TEAM_SHAPE.GO_AHEAD_YD) * player.attackDir) * player.attackDir;
        } else if (ownLine !== null) {
          const fwd   = player.attackDir;
          const safeX = ownLine - fwd * ATTACK_CONFIG.OFFSIDE_MARGIN;
          if ((tx - safeX) * fwd > 0) {
            tx = safeX;
          }
        }

        // A role variant that sets how far up he goes (e.g. full-back "stays") is a wall for his runs, not just a
        // penalty in the scoring: without it the stay-back full-back still overlapped (tester report, 8.8.9).
        // Default players keep the penalty only (the world's calibration).
        const variant = player.instruction?.variant;
        if (variant && ROLE_VARIANTS[variant]?.engine.bounds) {
          tx = Math.max(player.bounds.minX, Math.min(player.bounds.maxX, tx));
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
        target = computeTargetPosition(player, phase, ballPos, s.players, formation, s.ballHolderId, decision?.type, lineFor(player), markTargetId, s.possessionTime, shapeBallPos);
      }

      // Man-marker with his team on the ball: he stays home on his man (`stayHomeTarget`).
      if (phase === 'attacking' && player.manMarkTargetId !== undefined) {
        const mark = s.players.find(p => p.id === player.manMarkTargetId);
        if (mark) target = stayHomeTarget(target, player, mark);
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

      // Short steps (stage 4b, `fm-numbers.md`): the movement target he carries is a step of STEP_YD by line toward
      // where he wants to be, re-issued every tick while he moves (FM's setters: DEF 4.4, MID 6, FWD 7 yd). He keeps
      // running toward the full point (a capped point would brake him to arrive on every step).
      let stepTarget = target;
      if (DECISION_FLAGS.SHORT_STEPS && !isPressing && player.role !== 'GK') {
        const sx = target.x - player.x, sy = target.y - player.y;
        const sd = Math.hypot(sx, sy);
        const main = getMainRole(player.role);
        const cap = main === 'Defender' ? FM_NUMBERS.STEP_YD.DEF : main === 'Forward' ? FM_NUMBERS.STEP_YD.FWD : FM_NUMBERS.STEP_YD.MID;
        if (sd > cap) stepTarget = { x: player.x + (sx / sd) * cap, y: player.y + (sy / sd) * cap };
      }

      const dx   = target.x - player.x;
      const dy   = target.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) return { ...standStill(player, s, dt, moveLog), targetPosition: stepTarget };

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
      const recoveryMult = recoverySpeedMult(player);
      const step = Math.min((baseSpeed + accelBurst) * recoveryMult * dt, dist);
      const legacy = { x: player.x + (dx / dist) * step, y: player.y + (dy / dist) * step };
      return { ...moveToward(player, s, dt, target, (baseSpeed + accelBurst) * recoveryMult, legacy, moveLog), targetPosition: stepTarget };
    });

    s = { ...s, players: movedPlayers };
    emitMoveLog(moveLog);
  }

  // ── Shot in flight ─────────────────────────────────────────────────────────
  if (s.shot?.physics) return tickPhysicalShot(s, dt);
  if (s.shot) {
    let flying = s.shot;
    const newT = flying.t + dt * SHOT_SPEED;
    const { shooterId } = flying;
    const shooter     = s.players.find(p => p.id === shooterId)!;
    const defendingGK = s.players.find(p => p.team !== shooter.team && p.role === 'GK') ?? null;
    const onTarget    = flying.toY >= GOAL_Y_MIN && flying.toY <= GOAL_Y_MAX;
    const longShot    = weatherEffectOf(s.weather).longShot;

    // The keeper decides it where the ball reaches him: a save stops it there, a goal flies on past him.
    if (!flying.outcome && onTarget && defendingGK && ballMeetsKeeper(defendingGK, s.shot, flying.t, newT)) {
      const { isGoal, goalChance } = resolveShot(shooter, defendingGK, flying, longShot);
      flying = { ...flying, outcome: { isGoal, goalChance } };
      s = { ...s, shot: flying };
    }
    const savedByKeeper = flying.outcome?.isGoal === false;

    if (newT >= 1 || savedByKeeper) {
      // On target and never within his reach: the keeper is beaten.
      const beaten = onTarget && !!defendingGK && !flying.outcome;
      if (beaten) debugLog('keeper', `${defendingGK!.name} beaten: the shot never came within his reach`, { playerId: defendingGK!.id });
      const { isGoal, inPosts, goalChance } = flying.outcome
        ? { ...flying.outcome, inPosts: true }
        : beaten ? { isGoal: true, goalChance: 1, inPosts: true }
        : resolveShot(shooter, defendingGK, flying, longShot);
      if (!flying.header && Math.abs(flying.toX - flying.fromX) > LONG_SHOT_DISTANCE) {
        logWeather(s, 'longShot', `${shooter.name}'s long shot (${(goalChance * 100).toFixed(0)}%)`, shooter.id);
      }
      // A save ends where the ball met the keeper, so the pitch effects draw there and not on the goal line behind him.
      const endAt = savedByKeeper ? shotInterceptPoint(defendingGK!, flying) : { x: flying.toX, y: flying.toY };
      gameBus.emit('shotResolved', { player: shooter.id, xg: flying.xg, danger: goalChance, isGoal, inPosts, fromX: flying.fromX, fromY: flying.fromY, toX: endAt.x, toY: endAt.y });

      if (inPosts && isGoal) {
        const newScore = { ...s.score, [shooter.team]: s.score[shooter.team] + 1 };
        const assistId = s.lastPasserId !== null && s.lastPasserId !== shooter.id ? s.lastPasserId : undefined;
        const setPieceKind = flying.freeKick ? 'direct_free_kick' : setPieceGoalOf(s, shooter.team);
        gameBus.emit('goalScored', {
          team: shooter.team, score: newScore, scorerId: shooter.id, assistId, header: flying.header === true,
          ...(setPieceKind ? { setPiece: setPieceKind } : {}),
          fromX: flying.fromX, fromY: flying.fromY, goalX: shooter.attackDir === 1 ? PITCH_LENGTH : 0, minute: matchMinute(s),
        });
        const concedingTeam = shooter.team === 'A' ? 'B' : 'A';
        const kicked = resetToKickoff({ ...s, score: newScore }, concedingTeam);
        return {
          state: s.missedOffside
            ? checkGoalForOffside(s, kicked, {
              team: shooter.team, scorerId: shooter.id, ...(assistId !== undefined ? { assistId } : {}),
              header: flying.header === true, ...(setPieceKind ? { setPiece: setPieceKind } : {}),
            })
            : kicked,
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
          // Held, spilled loose or parried behind, by his skill and how hard the shot was (12.10).
          const odds = saveOutcomeChances(shotStoppingSkill(defendingGK), goalChance);
          const roll = matchRandom();
          const kind = roll < odds.parry ? 'parry' : roll < odds.parry + odds.spill ? 'spill' : 'hold';
          gameBus.emit('keeperSave', { keeperId: defendingGK.id, kind });
          debugLog('keeper', `${defendingGK.name} ${kind === 'hold' ? 'holds' : kind === 'spill' ? 'spills' : 'parries'} the shot (hold ${(odds.hold * 100).toFixed(0)}%, spill ${(odds.spill * 100).toFixed(0)}%)`, {
            playerId: defendingGK.id, data: { ...odds, goalChance },
          });
          if (kind === 'parry') cornerSource = 'save';
          if (kind === 'spill') {
            const point = {
              x: Math.max(0, Math.min(PITCH_LENGTH, endAt.x - shooter.attackDir * KEEPER_CONFIG.SAVE.SPILL_DIST)),
              y: Math.max(0, Math.min(PITCH_WIDTH, endAt.y)),
            };
            const players = applyStaminaCost(s.players, defendingGK.id, 'gkSave');
            return {
              state: dropLooseAt({ ...s, shot: null, players }, defendingGK, point),
              passCompleted: false, tackled: false, goalScored: null,
            };
          }
        } else if (!inPosts) {
          const deflector = s.players.some(p => p.team !== shooter.team && p.role !== 'GK'
            && Math.hypot(p.x - flying.fromX, p.y - flying.fromY) <= SET_PIECE_CONFIG.SHOT_DEFLECT_RADIUS);
          if (deflector && matchRandom() < SET_PIECE_CONFIG.OFF_TARGET_CORNER_CHANCE) cornerSource = 'deflection';
        }
        if (cornerSource) {
          const goalLineX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
          const exitX = goalLineX === 0 ? -1 : PITCH_LENGTH + 1;
          const saved = defendingGK && inPosts ? { ...s, players: applyStaminaCost(s.players, defendingGK.id, 'gkSave') } : s;
          return resolveOOBSetPiece({ ...saved, shot: null }, 'corner', shooter.team, exitX, flying.toY,
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
            setPiece: { type: 'goal_kick', takerId: newHolder.id, countdown: restartFreeze(s, RESTART_DEAD_S.GOAL_KICK) },
          }, prevHolderId),
          passCompleted: false, tackled: false, goalScored: null,
        };
      }
    }

    return {
      state: { ...s, shot: { ...flying, t: newT } },
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

        const holderDec = s.decisions[updatedHolder.id];
        const shielding = holderDec?.type === 'carry' && holderDec.move === 'shield';
        const { success, chance } = resolveTackle(tacklerNow, updatedHolder, pressingLoad, shielding ? HOLDER_MOVES.SHIELD_TACKLE_RESIST : 0);
        if (shielding) gameBus.emit('holderMove', { playerId: updatedHolder.id, team: updatedHolder.team, move: 'shield', phase: success ? 'fail' : 'success' });
        if (tacklerNow.role === 'GK' && !DECISION_FLAGS.FM_KEEPER) {
          gameBus.emit('keeperComeOut', { keeperId: tacklerNow.id, kind: 'rush', depth: depthFrom(tacklerNow.attackDir === 1 ? 0 : PITCH_LENGTH, tacklerNow.x) });
          debugLog('keeper', `${tacklerNow.name} rushes out at ${updatedHolder.name} (${(chance * 100).toFixed(0)}%)`, { playerId: tacklerNow.id });
        }
        // Foul check (`.claude/rules/game-engine/fouls.md`): a foul overturns the challenge — the
        // holder's team gets a free kick / penalty even when the tackle itself won the ball.
        const fc = foulCheck(s, tacklerNow, updatedHolder, 'tackle', success);
        s = fc.state;
        const fouled = fc.foul;
        gameBus.emit('tackle', { player: tackler.id, targetId: updatedHolder.id, success: success && fouled === null, chance });
        if (fouled) {
          s = rollContactInjuries(fouled, [tackler.id, updatedHolder.id], matchMinute(fouled));
          return { state: s, passCompleted: false, tackled: false, goalScored: null };
        }
        if (tacklerNow.role === 'GK') gameBus.emit('keeperFeet', { keeperId: tacklerNow.id, won: success });
        if (success) {
          // Won near the byline, wide of the posts: the ball goes behind for a corner sometimes.
          const hGoalX = updatedHolder.attackDir === 1 ? PITCH_LENGTH : 0;
          if (Math.abs(hGoalX - updatedHolder.x) <= SET_PIECE_CONFIG.TACKLE_CORNER_DEPTH
            && (updatedHolder.y < GOAL_Y_MIN || updatedHolder.y > GOAL_Y_MAX)
            && matchRandom() < SET_PIECE_CONFIG.TACKLE_CORNER_CHANCE) {
            const exitX = hGoalX === 0 ? -1 : PITCH_LENGTH + 1;
            const r = resolveOOBSetPiece(s, 'corner', updatedHolder.team, exitX, updatedHolder.y, tackler.id, 'clearance', 'tackle');
            return { ...r, state: rollContactInjuries(r.state, [tackler.id, updatedHolder.id], matchMinute(r.state)), tackled: true };
          }
          // Won by the touchline: it goes off the tackler for a throw-in sometimes.
          const edge = Math.min(updatedHolder.y, PITCH_WIDTH - updatedHolder.y);
          if (edge <= SET_PIECE_CONFIG.TACKLE_THROW_DEPTH && matchRandom() < SET_PIECE_CONFIG.TACKLE_THROW_CHANCE) {
            const exitY = updatedHolder.y < PITCH_WIDTH / 2 ? -1 : PITCH_WIDTH + 1;
            const r = resolveOOBSetPiece(s, 'throw_in', updatedHolder.team, updatedHolder.x, exitY, tackler.id, 'clearance');
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
    // ── Contact foul (stage 13, `fouls.md` → "FM fouls"): no tackle this tick, somebody leaning on the holder ──
    if (DECISION_FLAGS.FM_FOULS) {
      const contact = contactFoul(s, s.players.find(p => p.id === s.ballHolderId)!, dt);
      if (contact) return { state: contact, passCompleted: false, tackled: false, goalScored: null };
    }
  }

  // ── 3. Execute holder decision (carry / shoot / pass) ────────────────────
  if (!s.pass) {
    const holderDecision = s.decisions[s.ballHolderId];

    if (holderDecision?.type === 'shoot') {
      return { state: holderDecision.move === 'chip' ? startChip(s) : startShot(s), passCompleted: false, tackled: false, goalScored: null };
    }

    // Through balls fire IMMEDIATELY — they're a release decision that doesn't
    // benefit from the post-reception burst (the burst exists to create space
    // before deciding what to play; TB has already decided to play into space).
    if (holderDecision?.type === 'through_ball') {
      return { state: startThroughBall(s, holderDecision), passCompleted: false, tackled: false, goalScored: null };
    }

    // High balls fire immediately too (`aerial.md`).
    if (holderDecision?.type === 'cross') {
      // Stage 10: an open-play cross goes to a point of FM's target zones, drawn at the kick, with no named receiver.
      // Stage 12: an automatic crossed free kick is aimed at the same zones.
      const zone = fmAerialOn() && (!s.setPiece || holderDecision.delivery === 'zone') ? drawCrossZone(holder, matchRandom) : null;
      if (s.setPiece && fmSetPiecesOn()) emitSetPieceTaken(s, holder, holderDecision.delivery ?? 'zone', zone ?? { x: holderDecision.toX, y: holderDecision.toY });
      if (zone) debugLog('aerial', `${holder.name} aims his cross at the ${zone.kind.replace('_', ' ')} zone`, { playerId: holder.id, data: { x: Math.round(zone.x), y: Math.round(zone.y) } });
      return {
        state: startAerialBall(s, 'cross', zone ?? { x: holderDecision.toX, y: holderDecision.toY }, zone ? null : holderDecision.intendedRunnerId),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }
    if (holderDecision?.type === 'long_ball') {
      if (s.setPiece && fmSetPiecesOn()) emitSetPieceTaken(s, holder, 'long', { x: holderDecision.toX, y: holderDecision.toY });
      return {
        state: startAerialBall(s, 'long_ball', { x: holderDecision.toX, y: holderDecision.toY }, holderDecision.targetId),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }

    // First-time lay-off (`HolderMoves.ts`): one touch to the arriving teammate, no burst nor carry.
    if (holderDecision?.type === 'pass' && holderDecision.move === 'lay_off') {
      return { state: startPass(s, holderDecision.targetId), passCompleted: false, tackled: false, goalScored: null };
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
            const burstLog = newMoveLog();
            const moved = carryAlong(carrier0, s, dt, odx / olen, ody / olen, burstSpeed, { x: newX, y: newY }, burstLog);
            emitMoveLog(burstLog);
            const updated = { ...moved, targetPosition: { x: moved.x, y: moved.y } };
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
      // A sprint carry (stage 8) runs flat out: the acceleration boost always on.
      const accelBurst   = holderDecision.step === 'sprint' ? wb.acceleration * HOLDER_CHOICE.SPRINT_ACCEL_BOOST
        : isUnderPressure ? wb.acceleration * CARRY_ACCEL_SPEED_BOOST : 0;
      const recoveryMult = carrier.recoveryTime > 0 ? DUEL_RECOVERY_SPEED_FACTOR : 1;
      // Shielding (`HolderMoves.ts`): he edges away from the presser, ball kept on the far foot.
      const shieldMult = (holderDecision.move === 'shield' ? HOLDER_MOVES.SHIELD_SPEED_MULT : 1)
        * holderStepSpeed(holderDecision.step);
      const step = (wb.carrySpeed + accelBurst) * recoveryMult * shieldMult * dt * weatherEffectOf(s.weather).carrySpeed;
      // Role bounds don't restrict the ball carrier — only the pitch boundary does.
      // Off-ball positioning is where bounds apply.
      const newX = Math.max(0, Math.min(PITCH_LENGTH, carrier.x + holderDecision.dx * step));
      const newY = Math.max(0, Math.min(PITCH_WIDTH,  carrier.y + holderDecision.dy * step));

      const carryLog = newMoveLog();
      const carried = carryAlong(carrier, s, dt, holderDecision.dx, holderDecision.dy,
        (wb.carrySpeed + accelBurst) * recoveryMult * shieldMult * weatherEffectOf(s.weather).carrySpeed, { x: newX, y: newY }, carryLog);
      emitMoveLog(carryLog);
      const updatedCarrier = { ...carried, targetPosition: { x: carried.x, y: carried.y } };
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
          const step = Math.min(attacker.runtimeStats.withBall.carrySpeed * recoveryMult * dt * weatherEffectOf(s.weather).carrySpeed, dist);
          const newX = Math.max(0, Math.min(PITCH_LENGTH, attacker.x + (ddx / dist) * step));
          const newY = Math.max(0, Math.min(PITCH_WIDTH,  attacker.y + (ddy / dist) * step));
          const approachLog = newMoveLog();
          // Driving at the defender at full tilt: no braking to arrive (`kinematics.md`).
          const approached = carryAlong(attacker, s, dt, ddx / dist, ddy / dist,
            attacker.runtimeStats.withBall.carrySpeed * recoveryMult * weatherEffectOf(s.weather).carrySpeed, { x: newX, y: newY }, approachLog);
          emitMoveLog(approachLog);
          const updatedAttacker = { ...approached, targetPosition: { x: defender.x, y: defender.y } };
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

        // Round the keeper (`HolderMoves.ts`): skill against his smother, not the outfield 1v1.
        const rounding = holderDecision.move === 'round_keeper' && defender.role === 'GK';
        let attackerWins: boolean;
        let winProb: number;
        if (rounding) {
          const rk = resolveRoundKeeper(roundKeeperSkill(attacker), defender, HOLDER_MOVES.ROUND_BASE);
          attackerWins = rk.wins; winProb = rk.winProb;
          gameBus.emit('holderMove', { playerId: attacker.id, team: attacker.team, move: 'round_keeper', phase: attackerWins ? 'success' : 'fail' });
        } else {
          ({ attackerWins, winProb } = resolveDribble(attacker, defender, dribblePressLoad));
        }
        // Foul check (`.claude/rules/game-engine/fouls.md`): the defender may bring the dribbler
        // down — beaten (a cynical stop) or winning the ball unfairly; either way the attacker's
        // team gets the restart.
        const fcD = foulCheck(s, defender, attacker, 'dribble', !attackerWins);
        s = fcD.state;
        const fouledDribble = fcD.foul;
        gameBus.emit('dribble', { player: attacker.id, targetId: defender.id, success: attackerWins || fouledDribble !== null, chance: winProb });
        if (fouledDribble) {
          return { state: fouledDribble, passCompleted: false, tackled: false, goalScored: null };
        }
        if (attackerWins) {
          // Attacker beats the defender — defender frozen, attacker keeps the ball
          s = {
            ...s,
            players: s.players.map(p => {
              if (p.id === defender.id) return { ...p, recoveryTime: rounding ? HOLDER_MOVES.ROUND_KEEPER_RECOVERY : DUEL_DRIBBLE_LOSS_RECOVERY };
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

    return { state: startPass(s, holderDecision?.type === 'pass' ? holderDecision.targetId : undefined), passCompleted: false, tackled: false, goalScored: null };
  }

  // ── Pass in flight ─────────────────────────────────────────────────────────
  // (Control flow guarantees s.pass is non-null here — capture it once for TS)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const activePass = s.pass!;

  // Speed scales with distance so longer passes take proportionally more time.
  const aerialPass = isAerialKind(activePass.kind);
  const yardsPerSec = aerialPass ? AERIAL_CONFIG.AERIAL_YARDS_PER_SEC : PASS_YARDS_PER_SEC;
  const distanceSpeed = activePass.physics && passPhysicsOn()
    ? 1 / Math.max(0.05, activePass.physics.T)
    : activePass.distance > 0
      ? yardsPerSec / activePass.distance
      : passSpeed;
  // Stage 4 (`pass-physics.md`): a physical ground pass is moved here by its own physics; a ball above a player's
  // reach flies over the defenders on the way.
  const physGround = isPhysicalGroundPass(s, activePass);
  const overHeads = passPhysicsOn() && !!s.ball && s.ball.phase === 'pass' && s.ball.z > reachHeight(false);

  // Interception check — defender geometrically between ball and target gets a chance
  // scaled by how close they are to the passing lane (perpDist) and pass speed.
  // For through balls the "target" is the landing position, not a player.
  // High balls (cross / long ball) fly over everyone — contested only where they land.
  // Stage 5: a physical ground pass has no interception dice — defenders touch the ball on its path (below).
  const physCut = physGround && physicalInterceptionOn();
  if (s.tackleCooldown === 0 && !aerialPass && !overHeads && !physCut) {
    const ballPos      = getBallPos(s);
    const targetPos    = activePass.kind === 'through' || activePass.toId === null || activePass.miss
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
      const antMult = DECISION_FLAGS.ANTICIPATION_PRESS ? anticipationInterceptMult(interceptorNow) : 1;
      const { success, chance } = resolveInterception(interceptorNow, perpDist, corridor, passerSkill, antMult);
      gameBus.emit('interception', { player: player.id, success, chance });
      if (success && antMult > 1.05) {
        gameBus.emit('anticipationRead', { playerId: player.id, team: player.team, kind: 'intercept', lookahead: anticipationLookahead(interceptorNow) });
      }
      if (success && DECISION_FLAGS.DEFLECTIONS && resolveDeflection()) {
        // Deflected (stage 4, `movement.md`): the pass bounces off him, nobody has it.
        if (activePass.kind === 'through') {
          gameBus.emit('throughBallLostInFlight', { player: activePass.fromId, interceptorId: player.id });
        } else {
          gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId ?? activePass.fromId });
        }
        const pdx = targetPos.x - ballPos.x, pdy = targetPos.y - ballPos.y;
        const dir = scatterDirection(pdx, pdy, MOVEMENT.DEFLECT_MAX_DEG);
        const v = PASS_YARDS_PER_SEC * MOVEMENT.DEFLECT_SPEED_SHARE;
        debugLog('movement', `${interceptorNow.name} deflects the pass`, { playerId: player.id });
        return {
          state: runLoose(s, interceptorNow, interceptorNow.x, interceptorNow.y, dir.x * v, dir.y * v, 'deflection'),
          passCompleted: false, tackled: true, goalScored: null,
        };
      }
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

  let physArrived = false;
  let physContact: number | null = null;
  if (physGround) {
    const ph = activePass.physics!;
    const through = activePass.kind === 'through';
    const receiver = !through && activePass.toId !== null ? s.players.find(p => p.id === activePass.toId) : undefined;
    const catchers: PassCatcher[] = [];
    if (receiver) {
      catchers.push({ id: receiver.id, x: receiver.x, y: receiver.y, reach: receiveReach(receiver), keeper: receiver.role === 'GK' });
    }
    if (through) {
      // Into space: the first player whose reach the ball passes through ends the flight (it runs loose to him).
      for (const p of s.players) {
        if (p.id === activePass.fromId || isPlayerInRecovery(p)) continue;
        // The passer's team only: a defender on the way is still the interception roll (physical contact is stage 5).
        if (p.team !== passerTeamOf(s, activePass)) continue;
        if (p.id !== activePass.intendedRunnerId && p.decisionMemory?.decision?.type !== 'chase_loose_ball') continue;
        catchers.push({ id: p.id, x: p.x, y: p.y, reach: PASS_PHYSICS.MOVING_TOUCH_YD, keeper: p.role === 'GK' });
      }
    }
    if (physCut) {
      // Stage 5 (`interception.md`): every defender the ball passes within reach of touches it.
      const passerTeam = passerTeamOf(s, activePass);
      const beaten = new Set(activePass.beaten ?? []);
      for (const p of s.players) {
        if (p.team === passerTeam || beaten.has(p.id) || isPlayerInRecovery(p)) continue;
        catchers.push({ id: p.id, x: p.x, y: p.y, reach: interceptReach(p), keeper: p.role === 'GK' });
      }
    }
    const st = advancePassBall(s, dt, catchers);
    s = { ...s, ball: st.ball };
    physContact = st.contactId;
    const toucher = physCut && st.contactId !== null ? s.players.find(p => p.id === st.contactId) : undefined;
    if (toucher && toucher.team !== passerTeamOf(s, activePass)) {
      return resolveInterceptTouch(s, activePass, toucher);
    }
    const b = st.ball;
    if (through) {
      const h = Math.hypot(ph.vx, ph.vy) || 1;
      const along = ((b.x - ph.ox) * ph.vx + (b.y - ph.oy) * ph.vy) / h;
      if (st.contactId !== null || st.stopped || along >= activePass.distance) physArrived = true;
    } else if (st.contactId !== null) {
      physArrived = true;
    } else {
      const R = receiver ? receiveReach(receiver) : 0;
      const sp = Math.hypot(b.vx, b.vy);
      const ux = sp > 1e-3 ? b.vx / sp : Math.cos(Math.atan2(ph.vy, ph.vx));
      const uy = sp > 1e-3 ? b.vy / sp : Math.sin(Math.atan2(ph.vy, ph.vx));
      const passedHim = !receiver || ((b.x - receiver.x) * ux + (b.y - receiver.y) * uy > R);
      if (st.stopped || passedHim) {
        // Off target: the ball ran past him (or stopped short): it runs loose at the pace it has.
        const passer = s.players.find(p => p.id === activePass.fromId) ?? receiver ?? s.players.find(p => p.id === s.ballHolderId)!;
        gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId! });
        gameBus.emit('passMissed', { player: activePass.fromId, toId: activePass.toId!, distance: activePass.distance });
        debugLog('pass', `The ball runs past ${receiver?.name ?? 'the receiver'} (${st.stopped ? 'stopped short' : 'off target'})`, { playerId: activePass.fromId });
        return {
          state: runLoose(s, passer, b.x, b.y, b.vx, b.vy, 'misplaced', true),
          passCompleted: false, tackled: false, goalScored: null,
        };
      }
    }
    if (!physArrived) {
      return {
        state: { ...s, pass: { ...activePass, t: Math.min(0.99, b.elapsed / Math.max(0.05, ph.T)) } },
        passCompleted: false, tackled: false, goalScored: null,
      };
    }
  }

  const newT = physArrived ? 1 : activePass.t + dt * distanceSpeed;
  // Stage 10 (`aerial.md`): a high ball is met where it first comes within a player's reach along its flight.
  if (aerialPass && fmAerialOn() && s.ball && s.ball.phase === 'pass' && s.ball.free && s.ball.profile === 'air') {
    // The passing side's keeper never comes for his own team's ball.
    const pTeam = passerTeamOf(s, activePass);
    const catchers = aerialCatchers(s.players.filter(p => !(p.role === 'GK' && p.team === pTeam)), activePass.fromId, isPlayerInRecovery);
    const found = findAerialContact(s.ball, ballEnv(s.weather), dt, s.ball.elapsed, catchers);
    if (found.hit) return resolveAerialContact(s, found.hit, catchers);
    if (newT >= 1) return resolveAerialLanding({ ...s, ball: { ...s.ball, ...found.ball } });
  }
  if (newT >= 1 && aerialPass) {
    return resolveAerialLanding(s);
  }
  if (newT >= 1) {
    // ── Through-ball landing — convert pass to LooseBallState ────────────────
    // The ball SITS at the landing point. Players' chase decisions are pinned by
    // the decision loop, so they keep sprinting. handleLooseBall (called at the
    // top of subsequent ticks) resolves possession when someone is within touch.
    if (activePass.kind === 'through') {
      // A physical through ball (stage 4) runs loose from where it is, at the pace it has.
      const physBall = physGround && s.ball ? s.ball : null;
      const landingX = physBall ? physBall.x : activePass.toX;
      const landingY = physBall ? physBall.y : activePass.toY;
      const passer   = s.players.find(p => p.id === activePass.fromId);
      const passerTeam = passer?.team ?? 'A';

      // Residual velocity: same direction the pass was travelling, scaled to a
      // slow trickle. The ball decelerates each tick (LOOSE_BALL_DECELERATION)
      // until it comes to rest — never frozen instantly at the landing point.
      const dx = landingX - (passer?.x ?? landingX);
      const dy = landingY - (passer?.y ?? landingY);
      const len = Math.hypot(dx, dy);
      // An overhit ball keeps its pace and rolls on (stage 4, `movement.md`): nobody reaching it, it runs out of play.
      const overhit = DECISION_FLAGS.ROLLING_BALL ? Math.max(0, activePass.overhit ?? 0) : 0;
      const baseSpeed = Math.min(MOVEMENT.OVERHIT_MAX_SPEED,
        THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED + overhit * MOVEMENT.OVERHIT_SPEED_PER_YD);
      const initSpeed = baseSpeed * weatherEffectOf(s.weather).looseSpeed;
      logWeather(s, 'looseSpeed', 'Through ball runs loose', passer?.id);
      logWeather(s, 'looseDecel', 'Through ball runs loose', passer?.id);
      const vx = physBall ? physBall.vx : len > 0.001 ? (dx / len) * initSpeed : 0;
      const vy = physBall ? physBall.vy : len > 0.001 ? (dy / len) * initSpeed : 0;

      gameBus.emit('looseBallStarted', {
        x: landingX,
        y: landingY,
        fromPasserId: activePass.fromId,
      });
      debugLog('throughBall', `Through ball lands → loose ball at (${landingX.toFixed(1)}, ${landingY.toFixed(1)})`, {
        playerId: activePass.fromId,
      });

      const landed: GameState = {
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
          offsideLineX: activePass.offsideLineX,
          ...(overhit >= 1 ? { cause: 'overhit' as const } : {}),
        },
      };
      // Physical (stage 4): the ball reached a player on its way: he plays it now (the loose-ball pickup, duel and
      // offside rules), before it runs on past him.
      if (physContact !== null) return handleLooseBall(landed, 0);
      return { state: landed, passCompleted: false, tackled: false, goalScored: null };
    }

    // ── Regular pass landing ─────────────────────────────────────────────────
    const receiver = s.players.find(p => p.id === activePass.toId!)!;

    // Off target (stage 4b, `fm-numbers.md`): the ball passes the receiver and runs loose from where it lands.
    if (activePass.miss) {
      const passer = s.players.find(p => p.id === activePass.fromId) ?? receiver;
      gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId! });
      gameBus.emit('passMissed', { player: activePass.fromId, toId: activePass.toId!, distance: activePass.distance });
      return {
        state: runLoose(s, passer, activePass.toX, activePass.toY, activePass.miss.vx, activePass.miss.vy, 'misplaced'),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }

    // ── Offside enforcement ─────────────────────────────────────────────────
    // The offside position was determined when the pass was played (at t=0).
    // Enforce only at the moment the receiver would touch the ball (t=1).
    // The assistant may miss it (`var.md`): play goes on, a goal soon after is checked by the VAR.
    let flagged = activePass.receiverOffside;
    if (flagged && refereeErrs(s, 'missed_offside', matchRandom)) {
      s = missOffside(s, receiver, { x: receiver.x, y: receiver.y }, activePass.offsideLineX);
      flagged = false;
    }
    if (flagged) {
      gameBus.emit('offsideCalled', { team: receiver.team, receiverId: receiver.id, lineX: activePass.offsideLineX });
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
            countdown: restartFreeze(s, RESTART_DEAD_S.OFFSIDE_FK),
            position: { x: receiver.x, y: receiver.y },
          },
        }, prevHolderId),
        passCompleted: false, tackled: false, goalScored: null,
      };
    }

    // Played to the feet by the touchline: a heavy touch runs out for a throw-in to the other side.
    const passEdge = Math.min(receiver.y, PITCH_WIDTH - receiver.y);
    if (!activePass.fromSetPiece && passEdge <= SET_PIECE_CONFIG.PASS_OUT_EDGE
      && matchRandom() < SET_PIECE_CONFIG.PASS_OUT_CHANCE * (1 - SET_PIECE_CONFIG.PASS_OUT_TOUCH * receiver.runtimeStats.withBall.firstTouch)) {
      gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId! });
      const exitY = receiver.y < PITCH_WIDTH / 2 ? -1 : PITCH_WIDTH + 1;
      return resolveOOBSetPiece({ ...s, pass: null }, 'throw_in', receiver.team === 'A' ? 'B' : 'A', receiver.x, exitY, receiver.id, 'clearance');
    }
    // A long ball to feet miscontrolled (stage 4, `movement.md`): it runs on in the pass direction.
    if (DECISION_FLAGS.ROLLING_BALL && !activePass.fromSetPiece && activePass.distance > 0
      && resolveHeavyTouch(passLengthFactor(activePass.distance), receiver.runtimeStats.withBall.firstTouch)) {
      const passer = s.players.find(p => p.id === activePass.fromId);
      const dx = receiver.x - (passer?.x ?? receiver.x), dy = receiver.y - (passer?.y ?? receiver.y);
      const d = Math.hypot(dx, dy) || 1;
      gameBus.emit('passFailed', { player: activePass.fromId, toId: activePass.toId! });
      debugLog('movement', `${receiver.name} miscontrols a ${activePass.distance.toFixed(0)}-yd pass`, { playerId: receiver.id });
      return {
        state: runLoose(s, receiver, receiver.x, receiver.y, (dx / d) * MOVEMENT.HEAVY_TOUCH_SPEED, (dy / d) * MOVEMENT.HEAVY_TOUCH_SPEED, 'heavy_touch'),
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
  // The 3D ball of the flight in the air (stage 3, `ball-3d.md`); a flight started this tick has none yet.
  const b = state.ball;
  if (b && DECISION_FLAGS.BALL_3D) {
    if (state.shot && b.phase === 'shot' && b.key === shotKey(state.shot)) return { x: b.x, y: b.y };
    if (!state.shot && state.pass && b.phase === 'pass' && b.key === passKey(state.pass)) return { x: b.x, y: b.y };
  }
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
  const toX = state.pass.kind === 'through' || state.pass.toId === null || state.pass.miss
    ? state.pass.toX
    : (state.players.find(p => p.id === state.pass!.toId)?.x ?? state.pass.toX);
  const toY = state.pass.kind === 'through' || state.pass.toId === null || state.pass.miss
    ? state.pass.toY
    : (state.players.find(p => p.id === state.pass!.toId)?.y ?? state.pass.toY);
  return {
    x: from.x + (toX - from.x) * eased,
    y: from.y + (toY - from.y) * eased,
  };
}
