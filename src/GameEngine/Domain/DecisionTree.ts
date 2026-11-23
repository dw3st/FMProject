/**
 * DecisionTree — pure per-player decision evaluation.
 *
 * Imports types, CarryConfig, role data (`roleEngineData`), and configs — not
 * gameState — so there is no circular dependency with the match loop. All context needed for a
 * decision is passed as arguments.
 *
 * ALL player-level choices (shoot vs pass, tackle vs press, etc.) belong
 * here. The game loop in gameState.ts should never second-guess or override
 * a decision — it only *executes* whatever the tree returns.
 *
 * Adding a new decision:
 *   1. Add a new variant to PlayerDecision
 *   2. Add the evaluation condition inside decide()
 *   3. Handle the new decision type in gameState.ts tickState()
 *   4. Document it in game-engine.md
 */

import { captureDecision, decisionCaptureOn } from '@/GameEngine/Domain/DecisionTelemetry';
import { shotXg } from '@/GameEngine/Domain/ShotXg';
import { SHOT_GATE } from '@/GameEngine/Configs/ShotGateConfig';
import { distToGoalCentreM, shotGateFactor, shotCandidateValue } from '@/GameEngine/Domain/ShotGate';
import { DECISION_FLAGS, HOLDER_MIND } from '@/GameEngine/Configs/DecisionConfig';
import { holderPressure } from '@/GameEngine/Domain/Pressure';
import {
  DEFAULT_MENTAL, HOLDER_ACTIONS, argmaxIndex, distToGoalM, facingAwayWiden, flairBias, longShotRange,
  moodBand, normalisedPressure, perceiveScores, releaseFires, rollMindWindow, setHolderMind, simpleMinded,
} from '@/GameEngine/Domain/HolderMind';
import { effectiveMood } from '@/GameEngine/Domain/Confidence';
import type { GamePlayer, HolderMindState, SetPiece, SetPieceRoutine, TeamIntent } from '@/GameEngine/types';

const PITCH_CENTER_Y = PITCH_WIDTH / 2;

/** A player in recovery from a duel (tackle or dribble) cannot make defensive decisions. */
export function isPlayerInRecovery(player: GamePlayer): boolean {
  return player.recoveryTime > 0;
}
import { engineOf } from '@/GameEngine/Domain/roleEngineData';
import { getTeamBuildUp, getTeamCarryConfig, getTeamPassConfig } from '@/GameEngine/Configs/AttackConfig';
import { LONE_DRIBBLE } from '@/GameEngine/Configs/CarryConfig';
import { ONE_ON_ONE_CONFIG } from '@/GameEngine/Configs/PassConfig';
import { applyCarryIntent, getShootIntentBonus, getExtraCarryLanes } from '@/GameEngine/Configs/IntentConfig';
import { evaluateDefensiveDecision } from '@/GameEngine/Domain/DefensivePositioning';
import { evaluateCarryLaneBreakdown, rot } from '@/GameEngine/Domain/CarryLaneEval';
import type { CarryLaneBreakdown } from '@/GameEngine/Domain/CarryLaneEval';
import { evaluateOffBall } from '@/GameEngine/Domain/OffBallMovement';
import {
  getCellIndex, GRID_COLS, GRID_ROWS, type CrowdGrid, type GridMatrix,
} from '@/GameEngine/Infrastructure/CrowdGrid';
import {
  TACKLE_RANGE, DRIBBLE_ATTEMPT_RANGE, DRIBBLE_MIN_BIAS,
  computeXG, computeOpenAngle, computeWeightedPressure,
} from '@/GameEngine/Infrastructure/ActionOutcomes';
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from '@/GameEngine/Domain/pitch';
import { evaluatePassLanes, passLossEstimate, scorePassToReceiverBreakdown } from '@/GameEngine/Domain/PassLanes';
import type { PassBreakdown, PassLaneInfo } from '@/GameEngine/Domain/PassLanes';
import { enumerateCandidateCells } from '@/GameEngine/Domain/ThroughBallCells';
import { computeOffsideLine } from '@/GameEngine/Domain/Offside';
import { debugLog, isDebugEnabled } from '@/GameEngine/Support/DebugLog';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { evaluateCrossTargets, evaluateLongBall } from '@/GameEngine/Domain/Aerial';
import { AERIAL_CONFIG } from '@/GameEngine/Configs/AerialConfig';
import { evaluateBoxSetPiece, fmCornerPoint, goalKickLongPoint, goalKickShortSpot, routineOption } from '@/GameEngine/Domain/SetPieces';
import { FM_NUMBERS } from '@/GameEngine/Configs/FmNumbersConfig';
import { HOLDER_CHOICE } from '@/GameEngine/Configs/HolderChoiceConfig';
import { pickCandidate, qualityOf, riskOf, scoreCandidates, type HolderCandidate, type HolderCategory } from '@/GameEngine/Domain/HolderChoice';
import { matchRandom } from '@/GameEngine/Infrastructure/MatchRng';
import { INSTR, holderInstructionMult, instrDelta } from '@/GameEngine/Configs/InstructionConfig';
import { getMainRole } from '@/Domain/roles';
import { backToGoal, chipMove, cutInsideMove, layOffMove, roundKeeperMove, shieldMove, type HolderMove } from '@/GameEngine/Domain/HolderMoves';

export type PlayerDecision =
  | { type: 'carry'; dx: number; dy: number; move?: HolderMove; step?: HolderStep } // withBall → advancing with the ball (move: shield / cut inside; step: hold / turn (`fm-numbers.md`), sprint / byline / spin / flag (`holder-choice.md`))
  | { type: 'shoot'; move?: HolderMove }                // withBall  → will shoot (move: chip)
  | { type: 'pass'; targetId?: number; move?: HolderMove } // withBall → pass (targetId: forced receiver, one-on-one gate / lay-off)
  | { type: 'through_ball'; cellX: number; cellY: number; intendedRunnerId: number | null } // withBall → ball into space
  | { type: 'cross'; toX: number; toY: number; intendedRunnerId: number | null; delivery?: import('@/GameEngine/types').SetPieceDelivery } // withBall → high ball into the box (delivery: a set piece's)
  | { type: 'long_ball'; toX: number; toY: number; targetId: number } // withBall → high ball over the line
  | { type: 'dribble'; targetId: number; move?: HolderMove } // withBall → beat a close defender 1v1 (move: round the keeper)
  | { type: 'tackle'; targetId: number }                // withoutBall → close enough to attempt a tackle
  | { type: 'press';  targetId: number; standOff?: true } // withoutBall → toward the holder (standOff: second presser, stage 4)
  | { type: 'support_run';  dx: number; dy: number }   // offBall   → move into receiving position
  | { type: 'create_space'; dx: number; dy: number }   // offBall   → move away from pressure
  | { type: 'chase_loose_ball'; toX: number; toY: number; meet?: true; intercept?: true } // both → sprint to a contested loose ball (meet: the receiver of a physical pass going to meet it; intercept: a defender running to cut it, stage 5)
  | { type: 'hold_shape' }                              // defending → maintain formation shape
  | { type: 'track_mark'; markTargetId: number }        // defending → track assigned mark
  | { type: 'step_into_carry_lane' }                    // defending → block carry path to goal
  | { type: 'idle' }                                    // fallback  → no action

/** A holder carry with its own length and speed: hold, turn (stage 4b); sprint, byline run, spin past the marker,
 *  corner-flag hold (stage 8, `holder-choice.md`). */
export type HolderStep = 'hold' | 'turn' | 'sprint' | 'byline' | 'spin' | 'flag';

// ── Decision short-term memory ────────────────────────────────────────────────

/** Which high-level role a player is playing this tick. */
export type DecisionPath = 'BALL_HOLDER' | 'TEAM_WITH_BALL' | 'TEAM_WITHOUT_BALL';

/** Per-player memory: the path and decision made last tick, plus remaining commitment ticks. */
export interface DecisionMemory {
  path:        DecisionPath | null;
  decision:    PlayerDecision | null;
  commitTicks: number;
  /** Holder action cadence (stage 4b, `fm-numbers.md`): where the action began, and whether an opponent was already close. */
  from?: { x: number; y: number };
  nearD?: number;
}

export const EMPTY_DECISION_MEMORY: DecisionMemory = { path: null, decision: null, commitTicks: 0 };

/**
 * How many additional ticks a decision is held after it is made.
 * 0 = re-decide every tick. Higher values prevent flickering between decisions.
 */
export const COMMIT_TICKS: Record<PlayerDecision['type'], number> = {
  shoot:                0,
  carry:                5,
  pass:                 0,
  through_ball:         0,
  cross:                0,
  long_ball:            0,
  dribble:              4,
  tackle:               0,
  press:                8,
  support_run:          5,
  create_space:         5,
  chase_loose_ball:     6,
  hold_shape:           8,
  track_mark:           10,
  step_into_carry_lane: 6,
  idle:                 0,
};

// ── Action score compression ──────────────────────────────────────────────────

/**
 * Maps a raw action score [0, ∞) to (0, 1) with diminishing returns.
 * Score can never reach 1.0 — approaching it requires exponentially better
 * situations, so the decision space stays differentiated near the top.
 *
 * `strongRaw` is the raw value that represents "a strong action in this domain" —
 * at raw=strongRaw the score is always 0.632, regardless of domain.
 * This normalises action types with different raw ranges so they compete fairly.
 *
 * Per-action calibration (what raw=strongRaw means):
 *   SHOOT (1.6) — ST at xg/threshold=1.6 — a clear good chance (1.8 until #145, 4.19)
 *   CARRY (0.8) — clear lane with decent player — a solid advancing opportunity
 *   PASS  (0.8) — open lane to a good receiver — a quality passing option
 *   TB    (0.9) — a won race into open space with a clear path
 *
 * Reference points at each STRONG_RAW:
 *   shoot: xg/thr=0.5→0.27  1.0→0.46  1.6→0.63  2.5→0.79  3.8→0.91
 *   carry: lane=0.5→0.43    0.9→0.63  1.1→0.71  1.5→0.81
 *   pass:  score=0.5→0.46   0.8→0.63  1.0→0.71  1.4→0.83
 */
function compress(raw: number, strongRaw: number = 1.0): number {
  return 1 - Math.exp(-raw / strongRaw);
}

/**
 * 1.8 until #145 (4.19). Once the race losers of a loose ball stopped sprinting on to the holder and
 * went back to the shape, holders found fewer clear chances (−5% shots); 1.6 makes a holder shoot a
 * little earlier from the same chance and brings the world's shots back (`through-ball.md`).
 */
const SHOOT_STRONG_RAW   = 1.6;
const CARRY_STRONG_RAW   = 0.8;
/**
 * 0.8, not 1.0: a to-feet pass is structurally capped (lateral/short passes score
 * progress ≈ 0.5, no goal bonus, always some distance penalty), so a typical good
 * midfield pass sits at raw ≈ 0.75. At 1.0 that compressed to ~0.52 and lost to
 * carry (0.8) and through ball (0.9) on almost every tick — MIDs made ~0.15 regular
 * passes per match. See .claude/rules/game-engine/pass.md → "Action compression".
 */
const PASS_STRONG_RAW    = 0.8;
/**
 * Dribble raw = roleTendency×0.6 + forwardBlock×0.4, max 1.0.
 * A winger (carryBias≈0.7) with defender fully ahead → raw≈0.82 → score 0.632.
 */
const DRIBBLE_STRONG_RAW      = 0.8;
/** Through-ball raw scoring: a strong cell (race margin ≈1s, open, central, skilled passer) ≈ 0.9 → 0.632. */
const THROUGH_BALL_STRONG_RAW = 0.9;


/**
 * Evaluate three carry lanes (straight to goal, ±30°) and return the best
 * direction — or null if all lanes score below MIN_TOTAL_SCORE.
 */
/**
 * How much the role-fit penalty is reduced when the whole team is advanced.
 * At full team advance (everyone in opponent half): penalty × (1 - MAX_ADVANCE_SOFTENING).
 * Prevents punishing a CB for stepping up when the entire team is pressing high.
 */
const MAX_ADVANCE_SOFTENING = 0.75;

/**
 * Forward path clearness for the carrier, in [0, 1].
 *
 *   1 = no defending outfielders between the carrier and the goal (wide-open run)
 *   0 = path is choked with defenders
 *
 * Sums the defending team's outfield density (GK excluded) in the cells ahead
 * of the carrier's row band, normalised by `PATH_DENSITY_SATURATION`. Used to
 * fade the role-fit and byline penalties — both penalties exist to discourage
 * out-of-position carries that lose the ball or get forced wide. Neither
 * failure mode applies when nobody is in the way.
 *
 * Returns 0 when no grid is available so existing penalties stay full strength
 * for any caller that hasn't been wired up yet.
 */
function forwardPathClearness(player: GamePlayer, defendingOutfield: GridMatrix | null): number {
  if (defendingOutfield == null) return 0;
  const cfg = getTeamCarryConfig(player.team);
  const me = getCellIndex(player.x, player.y);
  const startCol = player.attackDir === 1 ? me.col + 1 : 0;
  const endCol   = player.attackDir === 1 ? GRID_COLS  : me.col;
  if (endCol <= startCol) return 1; // already at the endline column

  const rowBand = cfg.FORWARD_PATH_ROW_BAND;
  const r0 = Math.max(0, me.row - rowBand);
  const r1 = Math.min(GRID_ROWS - 1, me.row + rowBand);

  let total = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = startCol; c < endCol; c++) total += defendingOutfield[r]![c]!;
  }
  return 1 - Math.min(1, total / cfg.PATH_DENSITY_SATURATION);
}

/** Best-lane carry result, including the underlying breakdown for debug emission. */
/** One carry lane as an FM holder candidate (stage 8): direction, final lane score and clearance. */
interface CarryLaneOption { dx: number; dy: number; score: number; clearance: number }

interface BestCarryLane {
  dx: number;
  dy: number;
  score: number;
  /** Component breakdown of the chosen lane (clearance/progress/angle/crowd/role/vision/pressure). */
  breakdown: CarryLaneBreakdown;
  /** Role-fit penalty applied (out-of-zone target softened by team advance + path clearness). */
  rolePenalty: number;
  /** Byline penalty applied (faded by path clearness). */
  bylinePenalty: number;
  /** Flat additive bonus from an intent's extra carry lane (e.g. switch_play far_flank); 0 for forward lanes. */
  laneBonus: number;
  /** Score before penalties — equals breakdown.score. */
  rawScore: number;
}

function getBestCarryLane(
  player: GamePlayer,
  opponents: GamePlayer[],
  allPlayers: GamePlayer[],
  defendingOutfield: GridMatrix | null,
  intent: TeamIntent = 'balanced',
  all: CarryLaneOption[] | null = null,
): BestCarryLane | null {
  const baseCfg = getTeamCarryConfig(player.team);
  const cfg     = { ...baseCfg, ...applyCarryIntent(baseCfg, intent) };

  // How advanced is this team right now? Average outfield teammate X in attack direction,
  // normalised 0 (own goal) → 1 (opponent goal). Reduces role-fit penalty when pressing high.
  const teammates = allPlayers.filter(p => p.team === player.team && p.role !== 'GK');
  const avgX = teammates.length > 0
    ? teammates.reduce((s, p) => s + p.x, 0) / teammates.length
    : player.x;
  const teamAdvanceFactor = player.attackDir === 1
    ? Math.max(0, Math.min(1, (avgX - PITCH_LENGTH / 2) / (PITCH_LENGTH / 2)))
    : Math.max(0, Math.min(1, (PITCH_LENGTH / 2 - avgX) / (PITCH_LENGTH / 2)));
  const rolePenaltyScale = 1 - teamAdvanceFactor * MAX_ADVANCE_SOFTENING;
  const goalX       = player.attackDir === 1 ? PITCH_LENGTH : 0;
  const goalTargetY = Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, player.y));
  // #42: near the end line and wide of the posts, aiming at the post itself drives the carrier
  // into the goal line, where the pitch clamp turns every forward lane into a run along the line.
  // Aim at a point in front of the goal mouth instead (cut inside toward the 6-yd box).
  const distToLine0 = (goalX - player.x) * player.attackDir;
  const wideOfPosts = player.y < GOAL_Y_MIN || player.y > GOAL_Y_MAX;
  const aimX = wideOfPosts && distToLine0 < cfg.BYLINE_AIM_ZONE
    ? goalX - player.attackDir * cfg.BYLINE_AIM_DEPTH
    : goalX;
  const aimY = aimX !== goalX ? PITCH_CENTER_Y : goalTargetY;
  const tgDx        = aimX - player.x;
  const tgDy        = aimY - player.y;
  const tgDist      = Math.sqrt(tgDx * tgDx + tgDy * tgDy);
  if (tgDist < 0.01) return null;

  const baseDx = tgDx / tgDist;
  const baseDy = tgDy / tgDist;

  const lanes: { dx: number; dy: number; scoreBonus?: number }[] = [
    { dx: baseDx, dy: baseDy },
    rot(baseDx, baseDy, -Math.PI / 6),
    rot(baseDx, baseDy, +Math.PI / 6),
  ];

  // Additive carry lanes declared by the active intent (e.g. switch_play's far_flank).
  // Resolved generically here — the consumer turns each named primitive into a {dx,dy}
  // and carries the intent's flat scoreBonus so a soft-biased lateral lane can compete
  // with, but not always beat, the forward lanes.
  for (const extra of getExtraCarryLanes(intent)) {
    if (extra.dir === 'far_flank') {
      // Lateral lane across the pitch toward the opposite touchline at roughly the
      // holder's x. Minimal forward component so it reads as a switch, not a drive.
      const towardFar = player.y < PITCH_WIDTH / 2 ? 1 : -1;
      const fdx = player.attackDir * 0.2;
      const fdy = towardFar;
      const mag = Math.sqrt(fdx * fdx + fdy * fdy);
      lanes.push({ dx: fdx / mag, dy: fdy / mag, scoreBonus: extra.scoreBonus });
    }
  }

  let bestLane: BestCarryLane | null = null;
  let bestScore: number = cfg.MIN_TOTAL_SCORE;

  // Path clearness fades the role-fit and forward-byline penalties when no defender stands between
  // the carrier and goal — being out of zone or near the byline only matters when defenders can
  // punish it. Wide-open run → penalty fades to 0; choked path → penalty full strength.
  const clearness     = forwardPathClearness(player, defendingOutfield);
  const penaltyDamper = 1 - clearness;
  // #42: forwardPathClearness scans the columns ahead of the carrier — at the end line there are
  // none (it returns 1), so a carrier on the goal line looked "clear" and the in-box goal-line run
  // penalty faded to zero. `bylineDamper` keeps ONLY that penalty (BYLINE_RUN_PENALTY_IN_BOX) at
  // full strength wide of the posts. The forward byline penalty below keeps `penaltyDamper` on
  // purpose: dropping the damper there too killed carries in the last yards.
  const bylineDamper = wideOfPosts ? 1 : penaltyDamper;

  for (const lane of lanes) {
    const breakdown = evaluateCarryLaneBreakdown(player, lane.dx, lane.dy, goalTargetY, opponents, cfg);
    const rawScore  = breakdown.score;

    // Role-fit penalty — softened when the whole team is advanced (pressing high)
    // and faded when the forward path is clear (no defender to punish the gap).
    const targetX  = player.x + lane.dx * cfg.LOOKAHEAD_DISTANCE;
    const targetY  = player.y + lane.dy * cfg.LOOKAHEAD_DISTANCE;
    const xOverrun = Math.max(0, targetX - player.bounds.maxX, player.bounds.minX - targetX);
    const yOverrun = Math.max(0, targetY - player.bounds.maxY, player.bounds.minY - targetY);
    const rolePenalty = (xOverrun + yOverrun) * cfg.ROLE_FIT_PENALTY_SCALE * rolePenaltyScale * penaltyDamper;

    // Byline penalty: forward lanes lose score in the last BYLINE_PENALTY_START yards.
    // Faded by clearness — a clear run becomes a shot, not a forced cross.
    const endLineX        = player.attackDir === 1 ? PITCH_LENGTH : 0;
    const distToEndLine   = (endLineX - player.x) * player.attackDir;
    const forwardComp     = Math.max(0, lane.dx * player.attackDir);
    let bylinePenalty = 0;
    if (distToEndLine < cfg.BYLINE_PENALTY_START && forwardComp > 0) {
      const t = 1 - distToEndLine / cfg.BYLINE_PENALTY_START; // 0 at 5 yds, 1 at endline
      bylinePenalty = t * forwardComp * cfg.BYLINE_MAX_PENALTY * penaltyDamper;
    }

    // Byline run: a lane ending within BYLINE_RUN_ZONE of the end line, outside the box width,
    // is a run along the goal line — penalised; cutting inside (toward centre) is rewarded.
    const targetToEnd = (endLineX - targetX) * player.attackDir;
    const outsideBox  = Math.abs(targetY - PITCH_CENTER_Y) > cfg.BYLINE_RUN_BOX_HALF_WIDTH;
    let bylineRunAdj = 0;
    if (targetToEnd < cfg.BYLINE_RUN_ZONE && outsideBox) {
      bylineRunAdj -= cfg.BYLINE_RUN_PENALTY;
    }
    // Inside the box width (#37): a carrier already on the goal line running along it toward the
    // post (lateral lane, or a target still on the line) — near the post the right play is a
    // shot, a cut-back or a pass. Faded by clearness so a genuinely open run still works.
    const carrierInBoxWidth = Math.abs(player.y - PITCH_CENTER_Y) <= cfg.BYLINE_RUN_BOX_HALF_WIDTH;
    const alongLine = Math.abs(lane.dy) > 0.6 || targetToEnd < cfg.BYLINE_RUN_ZONE;
    if (carrierInBoxWidth && distToEndLine < cfg.BYLINE_RUN_ZONE + 2 && alongLine) {
      bylineRunAdj -= cfg.BYLINE_RUN_PENALTY_IN_BOX * bylineDamper;
    }
    // Touchline run (#37): a lane target hugging a touchline — the carrier gets pinned there.
    const edgeDist = Math.min(targetY, PITCH_WIDTH - targetY);
    if (edgeDist < cfg.TOUCHLINE_RUN_ZONE) {
      bylineRunAdj -= cfg.TOUCHLINE_RUN_PENALTY * (1 - Math.max(0, edgeDist) / cfg.TOUCHLINE_RUN_ZONE);
    }
    if (distToEndLine < cfg.BYLINE_RUN_ZONE * 2 && Math.abs(player.y - PITCH_CENTER_Y) > cfg.BYLINE_RUN_BOX_HALF_WIDTH) {
      const inward = Math.max(0, -Math.sign(player.y - PITCH_CENTER_Y) * lane.dy);
      bylineRunAdj += inward * cfg.BYLINE_CUT_INSIDE_BONUS;
    }

    const score = rawScore - rolePenalty - bylinePenalty + bylineRunAdj + (lane.scoreBonus ?? 0);
    if (all) all.push({ dx: lane.dx, dy: lane.dy, score, clearance: breakdown.clearanceScore });

    if (score > bestScore) {
      bestScore = score;
      bestLane  = { dx: lane.dx, dy: lane.dy, score, breakdown, rolePenalty, bylinePenalty: bylinePenalty - bylineRunAdj, laneBonus: lane.scoreBonus ?? 0, rawScore };
    }
  }

  return bestLane;
}

// ── Ball-holder unified scoring ───────────────────────────────────────────────

const MIN_ACTION_SCORE = 0.15;

/** Shoot breakdown — debug-only view of how the shoot ActionScore is produced. */
interface ShootBreakdown {
  dist:        number;
  openAngle:   number;
  pressure:    number;
  xg:          number;
  threshold:   number;
  roleScore:   number;
  xgFloor:     number;
  intentBonus: number;
  score:       number;
  /** FM xG model breakdown (stage 6, `xg.md`), present with `FM_XG` on. */
  fm?:         { model: string; features: Record<string, number>; availableM: number; coveredM: number; inTriangle: number };
  /** Stage 9 shot gate: FM's factor (null = beyond 30 m), the clean xG the value reads and the distance (m). */
  gate?:       { factor: number | null; cleanXg: number; distM: number };
}

/** Dribble breakdown — debug-only view of how the dribble ActionScore is produced. */
interface DribbleBreakdown {
  targetId:     number | null;
  roleTendency: number;
  forwardBlock: number;
  rawScore:     number;
  score:        number;
  /** Below 1 when he is alone against opponents and not skilful enough to take them on (`LONE_DRIBBLE`). */
  loneFactor?:  number;
}

/**
 * How much of his dribble score a holder keeps when he has nobody to play with (`LONE_DRIBBLE`): 1 with a teammate
 * close, too few opponents around or the rule off; otherwise his dribbling skill between `SKILL_FROM` and `SKILL_FULL`.
 */
export function loneDribbleFactor(player: GamePlayer, opponents: GamePlayer[], teammates: GamePlayer[]): number {
  const L = LONE_DRIBBLE;
  if (!L.ENABLED) return 1;
  const within = (p: GamePlayer, r: number) => Math.hypot(p.x - player.x, p.y - player.y) <= r;
  if (teammates.some(t => t.id !== player.id && t.role !== 'GK' && within(t, L.SUPPORT_RADIUS))) return 1;
  if (opponents.filter(o => o.recoveryTime <= 0 && within(o, L.CROWD_RADIUS)).length < L.MIN_CROWD) return 1;
  const skill = player.runtimeStats.withBall.dribbling;
  return Math.max(0, Math.min(1, (skill - L.SKILL_FROM) / (L.SKILL_FULL - L.SKILL_FROM)));
}

/** Carry breakdown attached to the carry ActionScore (best lane only). */
interface CarryActionBreakdown {
  dx:              number;
  dy:              number;
  clearanceScore:  number;
  progressScore:   number;
  angleScore:      number;
  crowdPenalty:    number;
  roleBias:        number;
  visionBonus:     number;
  pressurePenalty: number;
  baseScore:       number;
  playerModifier:  number;
  rolePenalty:     number;
  bylinePenalty:   number;
  laneBonus:       number;
  rawScore:        number;
  score:           number;
}

/** Pass breakdown attached to the pass ActionScore (best receiver only). */
interface PassActionBreakdown extends PassBreakdown {
  toId:     number | null;
  /** Holder role's pass tendency: roles.json passBias × PASS_CONFIG.ROLE_BIAS_WEIGHT. */
  roleBias: number;
  /** What the pass action compresses: max(0, quality + roleBias). */
  rawScore: number;
}

interface ActionScore {
  type: 'shoot' | 'pass' | 'carry' | 'dribble' | 'through_ball' | 'cross' | 'long_ball';
  score: number;
  targetId?: number;
  dx?: number;
  dy?: number;
  cellX?: number;
  cellY?: number;
  intendedRunnerId?: number | null;
  toX?: number;
  toY?: number;
  shootBreakdown?:   ShootBreakdown;
  passBreakdown?:    PassActionBreakdown;
  /** Pass: teammates with a pass score >= `HOLDER_MIND.OPEN_PASS` (the release gate's n). */
  openCount?: number;
  /** Pass: every receiver's lane (the FM holder chooser offers each one, stage 8). */
  lanes?: PassLaneInfo[];
  /** One of the holder's extra moves (`HolderMoves.ts`), executed by the action of `type`. */
  move?:           HolderMove;
  carryBreakdown?:   CarryActionBreakdown | null;
  dribbleBreakdown?: DribbleBreakdown;
}


/**
 * The xG value at which this role considers a shot "certain enough to take".
 * xG is divided by this threshold and clamped to 1 before quadratic scoring,
 * so ST will shoot eagerly at moderate xG while CB will only shoot at high xG.
 */
const SHOOT_THRESHOLD: Record<string, number> = {
  ST:  0.25,
  LW:  0.30, RW:  0.30,
  CAM: 0.29,
  LM:  0.42, RM:  0.42,
  CM:  0.50,
  CDM: 0.60,
  LWB: 0.65, RWB: 0.65,
  LB:  0.72, RB:  0.72,
  CB:  0.78,
  GK:  9.99, // effectively never
};

/** Shot score multiplier of a role's shooting level (stage 4b): defenders shoot "rarely", the rest "normal". */
export function shotLevelMult(role: string, level = 0): number {
  const base = getMainRole(role) === 'Defender' ? FM_NUMBERS.SHOT_RARELY_MULT : 1;
  return base * FM_NUMBERS.SHOT_LEVEL_STEP ** level;
}

function evalShoot(player: GamePlayer, opponents: GamePlayer[], intent: TeamIntent, allPlayers: GamePlayer[]): ActionScore {
  const goalX = player.attackDir === 1 ? PITCH_LENGTH : 0;
  const dist  = Math.abs(goalX - player.x);

  const openAngle = computeOpenAngle(player.x, player.y, goalX);
  const pressure  = computeWeightedPressure(player, opponents);
  // Stage 6 (`xg.md`): with FM_XG the FM logistic model over everyone on the pitch; off, the old spatial xG.
  const sx        = DECISION_FLAGS.FM_XG ? shotXg(player, allPlayers, 'ground') : null;
  const xg        = sx ? sx.xg : computeXG(dist, openAngle, pressure);

  // Compress xG relative to role eagerness.
  // SHOOT_STRONG_RAW=1.6: ST at xG=0.40 (threshold=0.25 → raw=1.6) scores 0.632.
  // ST at xG=0.80 → raw=3.2 → score≈0.88. ST at xG=0.25 → raw=1.0 → score≈0.49.
  const threshold = SHOOT_THRESHOLD[player.role] ?? 0.50;
  const roleScore = compress(xg / threshold, SHOOT_STRONG_RAW);
  // High-xG floor: at near-certain chances the role gate cannot suppress the shot.
  // xG² is gentle below ~0.7 (role still decides) but dominates above ~0.9.
  const xgFloor = xg * xg;
  // Intent flat bonus (small — never large enough to force a shot from nowhere)
  const intentBonus = getShootIntentBonus(intent);
  let score = Math.max(roleScore, xgFloor) + intentBonus;
  // Stage 9 (`holder-choice.md` → "Stage 9"): FM's shot gate (30 m from the goal centre, × 0.75 in the box, × 0.667
  // outside) on a value from the shooter's own geometry: the defenders in front block it physically (stage 7).
  let gate: ShootBreakdown['gate'];
  if (DECISION_FLAGS.LONG_SHOTS && DECISION_FLAGS.FM_XG) {
    const factor = shotGateFactor(player.x, player.y, player.attackDir);
    const cleanXg = factor === null ? 0 : shotXg(player, allPlayers.filter(p => p.id === player.id || (p.role === 'GK' && p.team !== player.team)), 'ground').xg;
    score = factor === null ? 0 : (shotCandidateValue(cleanXg, SHOT_GATE.XG_REF, factor) + intentBonus) * shotLevelMult(player.role);
    gate = { factor, cleanXg, distM: distToGoalCentreM(player.x, player.y, player.attackDir) };
  } else if (DECISION_FLAGS.SHOT_LIMIT) {
  // Shot limit (stage 4b, `fm-numbers.md`): no shot beyond SHOT_MAX_YD of the goal mouth; the shooting level of the
  // role (defenders "rarely") multiplies the score, never the limit.
    if (distToGoalMouth(player.x, player.y, player.attackDir) > FM_NUMBERS.SHOT_MAX_YD) score = 0;
    else score *= shotLevelMult(player.role);
  }
  return {
    type: 'shoot',
    score,
    shootBreakdown: {
      dist, openAngle, pressure, xg, threshold,
      roleScore, xgFloor, intentBonus, score,
      ...(gate ? { gate } : {}),
      ...(sx?.fm ? { fm: { model: sx.fm.model, features: { ...sx.fm.features }, availableM: sx.fm.availableM, coveredM: sx.fm.coveredM, inTriangle: sx.fm.inTriangle } } : {}),
    },
  };
}

function evalPass(
  player: GamePlayer, opponents: GamePlayer[], allPlayers: GamePlayer[], intent: TeamIntent,
  allow: ((receiver: GamePlayer) => boolean) | null = null,
): ActionScore {
  const teammates = allPlayers.filter(p => p.team === player.team && p.id !== player.id && (allow === null || allow(p)));
  if (teammates.length === 0) {
    return {
      type: 'pass', score: 0,
      passBreakdown: {
        toId: null, laneScore: 0, progressScore: 0, receiverSpaceScore: 0,
        distancePenalty: 0, goalProximityBonus: 0, visionRangePenalty: 0,
        passTargetBonus: 0, receiverRoleBonus: 0, quality: 0, roleBias: 0,
        baseScore: 0, playerModifier: 0, tacticalModifier: 0,
        rawScore: 0, score: 0,
      },
    };
  }

  const lanes = evaluatePassLanes(player, teammates, opponents, intent);
  const best  = lanes.reduce((a, b) => b.score > a.score ? b : a);
  const bestReceiver = teammates.find(p => p.id === best.toId);
  const breakdown = bestReceiver
    ? scorePassToReceiverBreakdown(player, bestReceiver, opponents, intent)
    : null;

  // PASS_STRONG_RAW=0.8: a clear lane to a good receiver (raw≈0.8) scores 0.632.
  // The receiver is picked by `score` (quality + receiver-role routing), but the
  // pass ACTION competes with carry / through ball on its quality plus the
  // holder role's pass tendency (roles.json passBias — the pass mirror of
  // carryBias): midfielders circulate, centre-backs recycle less.
  const roleBias = engineOf(player).passBias * getTeamPassConfig(player.team).ROLE_BIAS_WEIGHT;
  const raw      = Math.max(0, best.quality + roleBias);
  const score    = compress(raw, PASS_STRONG_RAW);
  let openCount = 0;
  for (const l of lanes) if (l.score >= HOLDER_MIND.OPEN_PASS) openCount++;
  return {
    type: 'pass', score, targetId: best.toId, openCount, lanes,
    passBreakdown: breakdown
      ? { toId: best.toId, roleBias, rawScore: raw, ...breakdown }
      : {
          toId: best.toId, laneScore: 0, progressScore: 0, receiverSpaceScore: 0,
          distancePenalty: 0, goalProximityBonus: 0, visionRangePenalty: 0,
          baseScore: 0, playerModifier: 0, tacticalModifier: 0, passTargetBonus: 0, receiverRoleBonus: 0,
          quality: best.quality, roleBias, rawScore: raw, score: best.score,
        },
  };
}

function evalCarry(
  player: GamePlayer,
  outfieldOpponents: GamePlayer[],
  allPlayers: GamePlayer[],
  defendingOutfield: GridMatrix | null,
  intent: TeamIntent,
  all: CarryLaneOption[] | null = null,
): ActionScore {
  // GK is already excluded by the caller — handled by the shoot decision (xG + GK effect).
  const lane = getBestCarryLane(player, outfieldOpponents, allPlayers, defendingOutfield, intent, all);
  if (!lane) return { type: 'carry', score: 0, carryBreakdown: null };

  // CARRY_STRONG_RAW=0.8: a clear lane with a solid player (raw≈0.9) scores 0.632.
  const score = compress(lane.score, CARRY_STRONG_RAW);
  const b = lane.breakdown;
  return {
    type: 'carry',
    score, dx: lane.dx, dy: lane.dy,
    carryBreakdown: {
      dx: lane.dx, dy: lane.dy,
      clearanceScore:  b.clearanceScore,
      progressScore:   b.progressScore,
      angleScore:      b.angleScore,
      crowdPenalty:    b.crowdPenalty,
      roleBias:        b.roleBias,
      visionBonus:     b.visionBonus,
      pressurePenalty: b.pressurePenalty,
      baseScore:       b.baseScore,
      playerModifier:  b.playerModifier,
      rolePenalty:     lane.rolePenalty,
      bylinePenalty:   lane.bylinePenalty,
      laneBonus:       lane.laneBonus,
      rawScore:        lane.rawScore,
      score:           lane.score,
    },
  };
}

/**
 * Evaluate through-ball candidates for the holder. Returns an ActionScore with
 * the best cell + intended runner, plus the full ranked cell list so the debug
 * emit can reuse it without re-scoring.
 *
 * `cachedCells` — if provided (the engine's per-tick TB cache), skip the grid
 * enumeration and use the cached cells. Safe because the dominant ranking
 * signals (race margin, path clearness) shift slowly, and the cache is
 * invalidated on holder change. See `tickState` in gameState.ts.
 */
function evalThroughBall(
  player:      GamePlayer,
  allPlayers:  GamePlayer[],
  crowdGrid:   CrowdGrid | null,
  cachedCells: ReturnType<typeof enumerateCandidateCells> | null = null,
  allow: ((x: number, y: number, runnerId: number | null) => boolean) | null = null,
): { action: ActionScore; cells: ReturnType<typeof enumerateCandidateCells> } {
  let cells: ReturnType<typeof enumerateCandidateCells>;
  if (cachedCells !== null) {
    cells = cachedCells;
  } else {
    const offsideLine = computeOffsideLine(player.attackDir, allPlayers, player.team, player.x);
    cells = enumerateCandidateCells(player, allPlayers, crowdGrid, offsideLine);
  }
  const best = allow === null ? cells[0] : cells.find(c => allow(c.x, c.y, c.components.bestAttackerId));
  return { action: throughBallAction(player, best), cells };
}

/** The through-ball ActionScore of one candidate cell (score 0 without one). */
function throughBallAction(player: GamePlayer, best: ReturnType<typeof enumerateCandidateCells>[number] | undefined): ActionScore {
  if (!best) return { type: 'through_ball', score: 0 };
  const score = compress(best.score + (best.score > 0 ? getTeamPassConfig(player.team).THROUGH_BALL_BONUS : 0), THROUGH_BALL_STRONG_RAW);
  return {
    type: 'through_ball',
    score,
    cellX: best.x,
    cellY: best.y,
    intendedRunnerId: best.components.bestAttackerId,
  };
}

/**
 * Cross (`aerial.md`): best of the three box targets (near post / penalty spot / far post) when
 * the holder is in a crossing position. Compressed with CROSS_STRONG_RAW like every other action.
 */
function evalCross(
  player: GamePlayer,
  allPlayers: GamePlayer[],
  allow: ((x: number, y: number, runnerId: number | null) => boolean) | null = null,
): { action: ActionScore; targets: ReturnType<typeof evaluateCrossTargets> } {
  const targets = evaluateCrossTargets(player, allPlayers);
  const best = allow === null ? targets[0] : targets.find(t => allow(t.x, t.y, t.bestAttackerId ?? null));
  return { action: crossAction(best), targets };
}

/** The cross ActionScore of one target (score 0 without one or with raw <= 0). */
function crossAction(best: ReturnType<typeof evaluateCrossTargets>[number] | undefined): ActionScore {
  if (!best || best.raw <= 0) return { type: 'cross', score: 0 };
  return {
    type: 'cross',
    // The chooser prices the risk of a cross like a pass's (stage 4b, `fm-numbers.md`): most are lost.
    score: compress(best.raw, AERIAL_CONFIG.CROSS_STRONG_RAW) * (DECISION_FLAGS.PASS_ERROR ? FM_NUMBERS.CROSS_RISK_MULT : 1),
    toX: best.x, toY: best.y, intendedRunnerId: best.bestAttackerId,
  };
}

/**
 * Long ball (`aerial.md`): a forward teammate over the line, weighted by the team's build_up
 * appetite (`TeamPassWeights.LONG_BALL_WEIGHT` — direct plays more of them).
 */
function evalLongBall(player: GamePlayer, allPlayers: GamePlayer[]): ActionScore {
  const offsideLine = computeOffsideLine(player.attackDir, allPlayers, player.team, player.x);
  const lb = evaluateLongBall(player, allPlayers, getTeamPassConfig(player.team).LONG_BALL_WEIGHT, offsideLine);
  if (!lb || lb.raw <= 0) return { type: 'long_ball', score: 0 };
  return {
    type: 'long_ball',
    score: compress(lb.raw, AERIAL_CONFIG.LONG_BALL_STRONG_RAW),
    toX: lb.x, toY: lb.y, targetId: lb.targetId,
  };
}

function evalDribble(player: GamePlayer, opponents: GamePlayer[], teammates: GamePlayer[] = []): ActionScore {
  const roleTendency = engineOf(player).carryBias;
  if (roleTendency < DRIBBLE_MIN_BIAS) {
    return {
      type: 'dribble', score: 0,
      dribbleBreakdown: { targetId: null, roleTendency, forwardBlock: 0, rawScore: 0, score: 0 },
    };
  }

  let closestDist = Infinity;
  let closest: GamePlayer | null = null;
  for (const opp of opponents) {
    if (opp.recoveryTime > 0) continue; // already beaten/stunned — don't target them
    const d = Math.sqrt((opp.x - player.x) ** 2 + (opp.y - player.y) ** 2);
    if (d < closestDist) { closestDist = d; closest = opp; }
  }

  if (!closest || closestDist > DRIBBLE_ATTEMPT_RANGE) {
    return {
      type: 'dribble', score: 0,
      dribbleBreakdown: {
        targetId: closest?.id ?? null,
        roleTendency, forwardBlock: 0, rawScore: 0, score: 0,
      },
    };
  }

  // How much the defender is blocking forward progress (0 = behind, 1 = directly ahead).
  // Only worth dribbling if the defender is actually in the way.
  const fwdDx        = (closest.x - player.x) * player.attackDir;
  const fwdDist      = Math.sqrt((closest.x - player.x) ** 2 + (closest.y - player.y) ** 2);
  const forwardBlock = fwdDist > 0 ? Math.max(0, fwdDx / fwdDist) : 0;

  // Score = role says "I like dribbling" AND the defender is actually blocking me.
  // No execution quality here — that belongs in resolveDribble (gameState.ts).
  const raw   = roleTendency * 0.6 + forwardBlock * 0.4;
  // Alone against them, only a skilful dribbler takes them on (`LONE_DRIBBLE`).
  const loneFactor = loneDribbleFactor(player, opponents, teammates);
  const score = compress(raw, DRIBBLE_STRONG_RAW) * loneFactor;
  return {
    type: 'dribble', score, targetId: closest.id,
    dribbleBreakdown: { targetId: closest.id, roleTendency, forwardBlock, rawScore: raw, score, ...(loneFactor < 1 ? { loneFactor } : {}) },
  };
}

/** Distance (yards) from (x, y) to the nearest point of the goal mouth the player attacks. */
function distToGoalMouth(x: number, y: number, attackDir: 1 | -1): number {
  const goalX = attackDir === 1 ? PITCH_LENGTH : 0;
  return Math.hypot(goalX - x, Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, y)) - y);
}

/**
 * One-on-one with the keeper (#156, `pass.md` → "One-on-one"). When the holder is within
 * `ONE_ON_ONE_CONFIG.RANGE` of the goal mouth and no outfield opponent stands ahead of him inside
 * the ±CORRIDOR lane (only the goalkeeper left), returns a filter for ball-to-teammate targets:
 * a target (pass receiver, through-ball cell, cross point) is allowed only when it is closer to
 * goal than the holder AND its xG (the target's own spatial xG, with the receiver's pressure there,
 * × `xgMult` for a header) beats the holder's shot by `XG_MARGIN`. Returns null otherwise (no gate).
 */
function oneOnOneGate(
  player: GamePlayer,
  opponents: GamePlayer[],
  outfieldOpponents: GamePlayer[],
  allPlayers: GamePlayer[],
  holderXg: number,
): ((x: number, y: number, receiverId: number | null, xgMult?: number) => boolean) | null {
  if (player.role === 'GK') return null;
  const holderDist = distToGoalMouth(player.x, player.y, player.attackDir);
  if (holderDist > ONE_ON_ONE_CONFIG.RANGE) return null;
  const blocked = outfieldOpponents.some(o =>
    (o.x - player.x) * player.attackDir > 0 && Math.abs(o.y - player.y) <= ONE_ON_ONE_CONFIG.CORRIDOR);
  if (blocked) return null;
  const goalX = player.attackDir === 1 ? PITCH_LENGTH : 0;
  return (x, y, receiverId, xgMult = 1) => {
    if (distToGoalMouth(x, y, player.attackDir) >= holderDist) return false;
    const receiver = (receiverId !== null ? allPlayers.find(p => p.id === receiverId) : undefined) ?? player;
    const xg = DECISION_FLAGS.FM_XG
      ? shotXg(receiver, allPlayers, xgMult === 1 ? 'ground' : 'header', { x, y }).xg
      : computeXG(Math.abs(goalX - x), computeOpenAngle(x, y, goalX),
        computeWeightedPressure({ ...receiver, x, y }, opponents)) * xgMult;
    return xg >= holderXg + ONE_ON_ONE_CONFIG.XG_MARGIN;
  };
}

/**
 * The holder's mind over the seven true action scores (`decisions.md` -> phase 3): the window's rolls (re-rolled when
 * `decisionNoise` ran out), the gates (release under pressure, simple-minded, long-shot range, facing away) and the
 * perceived scores. Returns the action the holder picks; hands the window and what happened to `setHolderMind`.
 */
function holderMind(
  player: GamePlayer,
  allPlayers: GamePlayer[],
  actions: ActionScore[],
  cells: ReturnType<typeof enumerateCandidateCells>,
  targets: ReturnType<typeof evaluateCrossTargets>,
  lb: ActionScore,
  matchTime: number,
  moves: ActionScore[] = [],
): { best: ActionScore; release: boolean } {
  const M = HOLDER_MIND;
  const mental = player.mental ?? DEFAULT_MENTAL;
  const prev = player.decisionNoise;
  const fresh = !prev || prev.ticks <= 0;
  const st = fresh ? rollMindWindow(mental, player.energy, matchTime) : prev;

  const pressure = holderPressure(player.x, player.y, allPlayers.filter(o => o.team !== player.team));
  const pN = normalisedPressure(pressure);
  const widen = facingAwayWiden(player, pN);
  const distM = distToGoalM(player.x, player.y, player.attackDir);
  const pass = actions[2]!;
  const release = releaseFires(pN, st.comp, distM, pass.openCount ?? 0, widen);
  const simple = simpleMinded(st);
  const range = longShotRange(st);
  const shotYd = distM / 0.9144;

  const options = actions.slice();
  const gated = options.map(a => a.score);
  if (shotYd > range) gated[0] = 0;
  // Released: escape with the ball or go long, rarely the short pass (FM27), never the dribble.
  if (release) {
    gated[1] = gated[1]! * M.RELEASE_CARRY_MULT;
    gated[3] = 0;
    gated[6] = gated[6]! * M.RELEASE_LONG_MULT;
    gated[2] = gated[2]! * M.RELEASE_PASS_MULT;
  }
  if (simple) {
    if (engineOf(player).carryBias < M.SIMPLE_DRIBBLE_BIAS) gated[3] = 0;
    const tb = throughBallAction(player, cells.find(c => c.components.raceMargin >= M.SIMPLE_RACE_S));
    options[4] = tb; gated[4] = tb.score;
    const maxYd = M.SIMPLE_MAX_AERIAL_M / 0.9144;
    const cr = crossAction(targets.find(t => Math.hypot(t.x - player.x, t.y - player.y) <= maxYd));
    options[5] = cr; gated[5] = cr.score;
    if (lb.score > 0 && Math.hypot((lb.toX ?? player.x) - player.x, (lb.toY ?? player.y) - player.y) > maxYd) gated[6] = 0;
  }
  if (widen > 0 && (pass.passBreakdown?.progressScore ?? 1) <= M.BACK_PASS_PROGRESS) gated[2] = gated[2]! * (1 + widen);
  const fb = flairBias(st);
  const bias = [shotYd > M.LONG_SHOT_FROM_YD ? fb : 0, 0, 0, fb, fb, 0, 0];
  const perceived = perceiveScores(gated, bias, st);
  const idx = argmaxIndex(perceived);
  let pick = { ...options[idx]!, score: perceived[idx]! };
  // The extra moves share the noise of the action that executes them; a simple-minded holder never chips.
  for (const mv of moves) {
    const bi = HOLDER_ACTIONS.indexOf(mv.type);
    const g = simple && mv.move === 'chip' ? 0 : mv.score;
    const b = mv.move === 'chip' || mv.move === 'round_keeper' || mv.move === 'cut_inside' ? fb : 0;
    const one = new Array(HOLDER_ACTIONS.length).fill(0) as number[];
    one[bi] = g;
    const bs = new Array(HOLDER_ACTIONS.length).fill(0) as number[];
    bs[bi] = b;
    const v = perceiveScores(one, bs, st)[bi]!;
    if (v > pick.score) pick = { ...mv, score: v };
  }

  setHolderMind({
    state: st, fresh, pressure, pN, release, openOptions: pass.openCount ?? 0, distM, simple, widen, longShotRange: range,
    mood: moodBand(effectiveMood(mental)),
    trueScores: Object.fromEntries(HOLDER_ACTIONS.map((k, i) => [k, actions[i]!.score])),
    perceived: Object.fromEntries(HOLDER_ACTIONS.map((k, i) => [k, perceived[i]!])),
    trueBest: HOLDER_ACTIONS[argmaxIndex(actions.map(a => a.score))]!,
    picked: HOLDER_ACTIONS[idx]!,
    ...(pick.move ? { move: pick.move } : {}),
  });
  return { best: pick, release };
}

/** The holder's extra moves as scored options (`HolderMoves.ts`); each flag off leaves its move out. */
function holderMoves(
  player: GamePlayer, allPlayers: GamePlayer[], opponents: GamePlayer[], outfieldOpponents: GamePlayer[], oneOnOne: boolean,
): ActionScore[] {
  if (player.role === 'GK') return [];
  const out: ActionScore[] = [];
  const keeper = opponents.find(o => o.role === 'GK') ?? null;
  const pN = normalisedPressure(holderPressure(player.x, player.y, allPlayers.filter(o => o.team !== player.team)));
  const sh = shieldMove(player, outfieldOpponents, pN);
  if (sh && sh.score > 0) out.push({ type: 'carry', score: sh.score, dx: sh.dx, dy: sh.dy, move: 'shield' });
  const cu = cutInsideMove(player, outfieldOpponents);
  if (cu && cu.score > 0) out.push({ type: 'carry', score: cu.score, dx: cu.dx, dy: cu.dy, move: 'cut_inside' });
  const lo = layOffMove(player, allPlayers.filter(p => p.team === player.team), outfieldOpponents);
  if (lo && lo.score > 0) out.push({ type: 'pass', score: lo.score, targetId: lo.targetId, move: 'lay_off' });
  const ch = chipMove(player, keeper, SHOOT_THRESHOLD[player.role] ?? 0.5, SHOOT_STRONG_RAW);
  if (ch && ch.score > 0) out.push({ type: 'shoot', score: ch.score, move: 'chip' });
  const rk = roundKeeperMove(player, keeper, oneOnOne);
  if (rk && rk.score > 0) out.push({ type: 'dribble', score: rk.score, targetId: rk.targetId, move: 'round_keeper' });
  return out;
}

/** Match situation the holder reads for the corner-flag hold (stage 8): his team's lead and the minute. */
export interface HolderSituation { lead: number; minute: number }

/**
 * The FM holder chooser (stage 8, `holder-choice.md`): every candidate with a value, a category multiplier and a risk
 * byte; vetoes at risk 100, compression above (100 − risk)³ / 10, hard argmax; noise only on a decisions lapse. The
 * holder's mind gates (release, simple-minded, long-shot range, facing away, flair) shape the values first. Returns
 * the decision; hands the window to `setHolderMind` and emits the candidate list.
 */
/** Where a holder candidate sends the ball (stage 20, the instructions' focus and back-pass tests); null = in place. */
function instructionTarget(d: PlayerDecision, all: GamePlayer[], p: GamePlayer): { x: number; y: number } | null {
  const any = d as { type: string; targetId?: number; toX?: number; toY?: number; dx?: number; dy?: number };
  if (any.targetId !== undefined) {
    const r = all.find(q => q.id === any.targetId);
    return r ? { x: r.x, y: r.y } : null;
  }
  if (typeof any.toX === 'number' && typeof any.toY === 'number') return { x: any.toX, y: any.toY };
  if (any.type === 'carry' && typeof any.dx === 'number' && typeof any.dy === 'number') return { x: p.x + any.dx * 8, y: p.y + any.dy * 8 };
  return null;
}

function fmHolderChoice(
  player: GamePlayer,
  allPlayers: GamePlayer[],
  outfieldOpponents: GamePlayer[],
  defendingOutfield: GridMatrix | null,
  intent: TeamIntent,
  a: {
    sh: ActionScore; ps: ActionScore; dr: ActionScore; lb: ActionScore;
    cells: ReturnType<typeof enumerateCandidateCells>;
    targets: ReturnType<typeof evaluateCrossTargets>;
    carryLanes: CarryLaneOption[];
    moves: ActionScore[];
  },
  gate: ((x: number, y: number, receiverId: number | null, xgMult?: number) => boolean) | null,
  mind: { matchTime: number; situ?: HolderSituation },
): PlayerDecision {
  const H = HOLDER_CHOICE;
  const M = HOLDER_MIND;
  // With the holder's mind off nothing is rolled nor read (a neutral window: no lapse, median rolls).
  const mindOn = DECISION_FLAGS.HOLDER;
  const mental = mindOn ? player.mental ?? DEFAULT_MENTAL : DEFAULT_MENTAL;
  const prev = player.decisionNoise;
  const fresh = !prev || prev.ticks <= 0;
  const st: HolderMindState = !mindOn
    ? { ticks: 0, dec: 100, comp: 100, flair: M.FLAIR_CENTER, lapse: false, sigma: 0, z: [], lapseMul: [] }
    : fresh ? rollMindWindow(mental, player.energy, mind.matchTime) : prev!;
  const opponents = allPlayers.filter(p => p.team !== player.team);
  const pressure = holderPressure(player.x, player.y, opponents);
  const pN = normalisedPressure(pressure);
  const widen = facingAwayWiden(player, pN);
  const distM = distToGoalM(player.x, player.y, player.attackDir);
  const minded = DECISION_FLAGS.HOLDER && !gate;
  const release = minded && releaseFires(pN, st.comp, distM, a.ps.openCount ?? 0, widen);
  const simple = minded && simpleMinded(st);
  const range = longShotRange(st);
  const fb = minded ? flairBias(st) : 0;
  const shotYd = distM / 0.9144;
  const wb = player.runtimeStats.withBall;
  const goalX = player.attackDir === 1 ? PITCH_LENGTH : 0;
  const goalTargetY = Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, player.y));
  const cfgCarry = getTeamCarryConfig(player.team);
  let near: GamePlayer | null = null; let nd = Infinity;
  for (const o of outfieldOpponents) { const d = Math.hypot(o.x - player.x, o.y - player.y); if (d < nd) { nd = d; near = o; } }
  const awayDir = (): { dx: number; dy: number } => near && nd > 0.01
    ? { dx: (player.x - near.x) / nd, dy: (player.y - near.y) / nd } : { dx: -player.attackDir, dy: 0 };
  const cands: HolderCandidate<PlayerDecision>[] = [];
  const add = (cat: HolderCategory, kind: string, label: string, value: number, risk: number, decision: PlayerDecision) => {
    // A carry with no direction (two players on the same spot) is not an option.
    if (decision.type === 'carry' && !(Number.isFinite(decision.dx) && Number.isFinite(decision.dy))) return;
    // FM's category multiplier (relative to a carry); the corner-flag hold is a type of its own, copied as it is.
    let mult = kind === 'flag' ? 1 : cat === 1 && DECISION_FLAGS.LONG_SHOTS ? SHOT_GATE.KICK_MULT : H.CAT_MULT[cat] ?? 1;
    // Stage 20 (4c-4/5): the team and player instructions move the category multiplier (1 at the template).
    if (DECISION_FLAGS.TEAM_INSTRUCTIONS && kind !== 'flag') {
      const tgt = instructionTarget(decision, allPlayers, player);
      mult *= holderInstructionMult(player, {
        cat, kind, targetY: tgt?.y ?? null, toEnd: Math.abs(goalX - player.x),
        backward: tgt !== null && cat === 0 && (tgt.x - player.x) * player.attackDir <= 0,
      });
    }
    cands.push({ cat, kind, label, value: Math.max(0, Math.min(1, value)), mult, risk, quality: qualityOf(value), decision });
  };

  // ── passes: one per teammate, plus the lay-off ──
  const offsideLine = computeOffsideLine(player.attackDir, allPlayers, player.team, player.x);
  const roleBias = engineOf(player).passBias * getTeamPassConfig(player.team).ROLE_BIAS_WEIGHT;
  for (const l of a.ps.lanes ?? []) {
    const r = allPlayers.find(p => p.id === l.toId);
    if (!r) continue;
    const d = Math.hypot(r.x - player.x, r.y - player.y);
    // Stage 21: the passer reads the line too, by eye — an error up to ± PASS_OFFSIDE_READ_YD × (1.2 − vision), so a
    // runner a yard past it is sometimes picked (FM's offsides come from passes, not only from through balls).
    const readErr = H.PASS_OFFSIDE_READ_YD > 0 && offsideLine !== null
      ? (matchRandom() * 2 - 1) * H.PASS_OFFSIDE_READ_YD * (1.2 - wb.vision) : 0;
    const offside = offsideLine !== null && (r.x - offsideLine) * player.attackDir > readErr;
    let v = compress(Math.max(0, l.quality + roleBias), PASS_STRONG_RAW);
    if (release) v *= M.RELEASE_PASS_MULT;
    if (widen > 0 && (l.progressScore ?? 1) <= M.BACK_PASS_PROGRESS) v *= 1 + widen;
    const lane = l.laneScore ?? 1;
    const loss = DECISION_FLAGS.PASS_ERROR ? passLossEstimate(player, r, pressure) : 0;
    // Risk byte: an interception chance read from the arrival margin, (1 − lane)², plus the launch-miss loss.
    const risk = offside || lane <= H.PASS_VETO_LANE ? 100 : riskOf((1 - lane) ** 2 + loss);
    add(0, d > FM_NUMBERS.LOFT_YD ? 'pass_lofted' : 'pass', r.name, v, risk, { type: 'pass', targetId: r.id });
  }
  for (const mv of a.moves) {
    if (mv.type === 'pass' && mv.targetId !== undefined) add(0, 'lay_off', 'lay-off', mv.score, 15, { type: 'pass', targetId: mv.targetId, move: mv.move! });
  }
  // ── through balls: the best cells ──
  let tbn = 0;
  for (const c of a.cells) {
    if (tbn >= H.TB_CANDIDATES) break;
    if (gate && !gate(c.x, c.y, c.components.bestAttackerId)) continue;
    if (simple && c.components.raceMargin < M.SIMPLE_RACE_S) continue;
    // FM plays the through ball to a runner (stage 21): the intended runner must already be running forward.
    if (H.TB_RUNNER_MIN_FWD > 0) {
      const runner = allPlayers.find(p => p.id === c.components.bestAttackerId);
      if (!runner || (runner.vel?.x ?? 0) * runner.attackDir < H.TB_RUNNER_MIN_FWD) continue;
    }
    tbn++;
    const t = throughBallAction(player, c);
    const race = c.components.raceMarginScore;
    const risk = race <= H.TB_VETO_RACE ? 100 : softRisk(1 - race * (1 - Math.max(0, Math.min(1, c.components.laneRiskPenalty))));
    add(0, 'through_ball', `cell ${c.x.toFixed(0)},${c.y.toFixed(0)}`, t.score + fb, risk,
      { type: 'through_ball', cellX: c.x, cellY: c.y, intendedRunnerId: c.components.bestAttackerId });
  }
  // ── crosses ──
  const maxAerialYd = M.SIMPLE_MAX_AERIAL_M / 0.9144;
  if (DECISION_FLAGS.FM_AERIAL && !gate && a.targets.length > 0) {
    // Stage 10 (`aerial.md`): the target is drawn from FM's zones at the kick, so the cross is one candidate worth the
    // expected value over the zones (FM's shares).
    let wsum = 0, val = 0, risk = 0;
    for (const t of a.targets) {
      if (simple && Math.hypot(t.x - player.x, t.y - player.y) > maxAerialYd) continue;
      const w = t.weight ?? 0;
      const cr = crossAction(t);
      const tot = t.attackers + t.defenders;
      wsum += w; val += w * cr.score; risk += w * (cr.score > 0 ? softRisk(tot > 0 ? t.defenders / tot : 1) : 100);
    }
    const best = a.targets[0]!;
    if (wsum > 0 && val > 0) {
      add(0, 'cross', 'FM zones', val / wsum, Math.min(100, risk / wsum),
        { type: 'cross', toX: best.x, toY: best.y, intendedRunnerId: best.bestAttackerId });
    }
  }
  for (const t of DECISION_FLAGS.FM_AERIAL && !gate ? [] : a.targets) {
    if (gate && !gate(t.x, t.y, t.bestAttackerId ?? null, AERIAL_CONFIG.HEADER_XG_MULT)) continue;
    if (simple && Math.hypot(t.x - player.x, t.y - player.y) > maxAerialYd) continue;
    const cr = crossAction(t);
    const tot = t.attackers + t.defenders;
    add(0, 'cross', t.kind, cr.score, cr.score > 0 ? softRisk(tot > 0 ? t.defenders / tot : 1) : 100,
      { type: 'cross', toX: t.x, toY: t.y, intendedRunnerId: t.bestAttackerId });
  }
  // ── long ball ──
  if (a.lb.score > 0 && a.lb.toX !== undefined && !(simple && Math.hypot(a.lb.toX - player.x, (a.lb.toY ?? player.y) - player.y) > maxAerialYd)) {
    add(0, 'long_ball', 'long ball', a.lb.score * (release ? M.RELEASE_LONG_MULT : 1), riskOf(1 - FM_NUMBERS.LOFT_KEEP),
      { type: 'long_ball', toX: a.lb.toX, toY: a.lb.toY!, targetId: a.lb.targetId! });
  }
  // ── shot and chip (category 1, kicks) ──
  // Stage 21: the holder decides every step (0.2 s), FM's far less often, so a holder in a shooting spot for a second
  // had five tries at the shot where FM's has one or two. The shot is in his options on a share of the decisions
  // (always in a one-on-one, the `gate` path).
  const looks = gate || SHOT_GATE.LOOK_CHANCE >= 1 || matchRandom() < SHOT_GATE.LOOK_CHANCE;
  if (looks && a.sh.score > 0 && !(minded && shotYd > range)) add(1, 'shot', `xG ${(a.sh.shootBreakdown?.xg ?? 0).toFixed(2)}`, a.sh.score + (shotYd > M.LONG_SHOT_FROM_YD ? fb : 0), 0, { type: 'shoot' });
  for (const mv of a.moves) if (looks && mv.type === 'shoot' && !simple) add(1, 'chip', 'chip', mv.score + fb, 0, { type: 'shoot', move: mv.move! });
  // ── carries (category 4): every lane, the sprint, the byline run, the dribble, cut inside, round the keeper ──
  const carryMult = release ? M.RELEASE_CARRY_MULT : 1;
  let bestLane: CarryLaneOption | null = null;
  for (const l of a.carryLanes) {
    if (!bestLane || l.score > bestLane.score) bestLane = l;
    if (!(l.score > 0)) continue;
    const risk = l.clearance <= H.CARRY_VETO_CLEARANCE ? 100 : softRisk(1 - l.clearance);
    add(4, 'carry', `lane ${Math.round((Math.atan2(l.dy, l.dx * player.attackDir) * 180) / Math.PI)}°`, compress(l.score, CARRY_STRONG_RAW) * carryMult, risk,
      { type: 'carry', dx: l.dx, dy: l.dy });
  }
  if (bestLane && bestLane.score > 0 && laneOpen(player, bestLane.dx, bestLane.dy, H.SPRINT_CLEAR_YD, H.SPRINT_LANE_R_YD, outfieldOpponents)) {
    add(4, 'sprint', 'sprint', compress(bestLane.score, CARRY_STRONG_RAW) * carryMult * (H.SPRINT_BASE + H.SPRINT_ACCEL * wb.acceleration), softRisk(1 - bestLane.clearance),
      { type: 'carry', dx: bestLane.dx, dy: bestLane.dy, step: 'sprint' });
  }
  const toEnd = (goalX - player.x) * player.attackDir;
  if (Math.abs(player.y - PITCH_CENTER_Y) >= H.BYLINE_WIDE_YD && toEnd <= H.BYLINE_ZONE_YD && toEnd > H.BYLINE_STOP_YD) {
    const b = evaluateCarryLaneBreakdown(player, player.attackDir, 0, goalTargetY, outfieldOpponents, cfgCarry);
    if (b.score > 0) {
      add(4, 'byline', 'to the byline', compress(b.score * (0.6 + 0.4 * wb.passingSkill), CARRY_STRONG_RAW) * carryMult,
        b.clearanceScore <= H.CARRY_VETO_CLEARANCE ? 100 : softRisk(1 - b.clearanceScore), { type: 'carry', dx: player.attackDir, dy: 0, step: 'byline' });
    }
  }
  if (a.dr.score > 0 && !release && !(simple && engineOf(player).carryBias < M.SIMPLE_DRIBBLE_BIAS) && a.dr.targetId !== undefined) {
    const target = allPlayers.find(p => p.id === a.dr.targetId);
    const win = target ? wb.dribbling / (wb.dribbling + target.runtimeStats.withoutBall.tackleChance * 0.85 + 1e-3) : 0.5;
    add(4, 'dribble', target?.name ?? 'dribble', a.dr.score + fb, riskOf(1 - win), { type: 'dribble', targetId: a.dr.targetId });
  }
  for (const mv of a.moves) {
    if (mv.type === 'carry' && mv.move === 'cut_inside') add(4, 'cut_inside', 'cut inside', mv.score * carryMult + fb, 20, { type: 'carry', dx: mv.dx!, dy: mv.dy!, move: mv.move });
    if (mv.type === 'dribble' && !release) add(4, 'round_keeper', 'round the keeper', mv.score + fb, 30, { type: 'dribble', targetId: mv.targetId!, move: mv.move! });
  }
  // ── turn (category 2): moving the wrong way, a short turn toward the best way forward ──
  const v = player.vel;
  const sp = v ? Math.hypot(v.x, v.y) : 0;
  const nearRisk = riskOf(Math.max(0, Math.min(1, (4 - nd) / 4)) * 0.6);
  if (v && sp >= H.TURN_MIN_SPEED) {
    const way = bestLane && bestLane.score > 0 ? bestLane : { dx: goalX - player.x, dy: PITCH_CENTER_Y - player.y, score: 0.5 };
    const wl = Math.hypot(way.dx, way.dy) || 1;
    const deg = (Math.acos(Math.max(-1, Math.min(1, (v.x * way.dx + v.y * way.dy) / (sp * wl)))) * 180) / Math.PI;
    if (deg > H.TURN_DEG) {
      const off = (deg - H.TURN_DEG) / (180 - H.TURN_DEG);
      add(2, 'turn', `${Math.round(deg)}°`, compress(Math.max(0.2, way.score), CARRY_STRONG_RAW) * (0.5 + 0.5 * off), nearRisk,
        { type: 'carry', dx: way.dx / wl, dy: way.dy / wl, step: 'turn' });
    }
  }
  // ── spin past the marker (category 2): back to goal, the marker tight on his goal side ──
  if (near && nd > 0.1 && nd <= H.SPIN_MARKER_YD && backToGoal(player, { o: near, d: nd })) {
    const px = -(near.y - player.y) / nd, py = (near.x - player.x) / nd;
    const side = (y: number) => outfieldOpponents.filter(o => o !== near && Math.hypot(o.x - (player.x + px * y * 4), o.y - (player.y + py * y * 4)) < 6).length;
    const s = side(1) <= side(-1) ? 1 : -1;
    const dx = px * s * 0.8 + player.attackDir * 0.6, dy = py * s * 0.8;
    const dl = Math.hypot(dx, dy);
    const flairN = Math.max(0, Math.min(1, st.flair / (2 * M.FLAIR_CENTER)));
    const win = wb.dribbling / (wb.dribbling + near.runtimeStats.withoutBall.tackleChance + 1e-3);
    add(2, 'spin', near.name, compress(0.5 * wb.dribbling + 0.3 * wb.acceleration + 0.2 * flairN, CARRY_STRONG_RAW) * (1 - 0.5 * pN), riskOf(1 - win),
      { type: 'carry', dx: dx / dl, dy: dy / dl, step: 'spin' });
  }
  // ── hold and shield (category 3) ──
  let arriving = 0;
  for (const t of allPlayers) {
    if (t.team !== player.team || t.id === player.id || t.role === 'GK' || !t.vel) continue;
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    if (d > H.HOLD_SUPPORT_YD || d < 0.5) continue;
    if ((t.vel.x * (player.x - t.x) + t.vel.y * (player.y - t.y)) / d > 0.5) arriving++;
  }
  const away = awayDir();
  add(3, 'hold', `${arriving} arriving`, (H.HOLD_BASE + H.HOLD_SUPPORT * arriving) * (1 - 0.5 * pN), nearRisk, { type: 'carry', dx: away.dx, dy: away.dy, step: 'hold' });
  for (const mv of a.moves) if (mv.type === 'carry' && mv.move === 'shield') add(3, 'shield', 'shield', mv.score, 10, { type: 'carry', dx: mv.dx!, dy: mv.dy!, move: mv.move });
  // ── corner-flag hold (category 3): leading late, near the opponents' corner flag ──
  const situ = mind.situ;
  if (situ && situ.lead > 0 && situ.minute >= H.FLAG_MINUTE) {
    const fy = player.y < PITCH_CENTER_Y ? 0 : PITCH_WIDTH;
    const fd = Math.hypot(goalX - player.x, fy - player.y);
    if (fd <= H.FLAG_ZONE_YD) {
      const dir = fd > 1.5 ? { dx: (goalX - player.x) / fd, dy: (fy - player.y) / fd } : away;
      add(3, 'flag', 'corner flag', H.FLAG_VALUE, riskOf(pN * 0.5), { type: 'carry', dx: dir.dx, dy: dir.dy, step: 'flag' });
    }
  }

  // ── pick: noise only on a lapse ──
  const noise = st.lapse ? cands.map(() => 1 + (matchRandom() * 2 - 1) * H.LAPSE_NOISE) : null;
  const scored = scoreCandidates(cands, i => (noise ? noise[i]! : 1));
  let idx = pickCandidate(scored);
  let decision: PlayerDecision;
  if (idx < 0) {
    decision = gate ? { type: 'shoot' } : { type: 'carry', dx: away.dx, dy: away.dy, step: 'hold' };
  } else decision = scored[idx]!.decision;

  // The mind side channel (trueScores / perceived per action slot) for the holderMind event and the /lab counters.
  const slotOf = (d: PlayerDecision): string => (d.type === 'carry' ? 'carry' : d.type);
  const trueBest: Record<string, number> = {}; const percBest: Record<string, number> = {};
  for (const k of HOLDER_ACTIONS) { trueBest[k] = 0; percBest[k] = 0; }
  scored.forEach((c, i) => {
    const k = slotOf(c.decision);
    if (k in trueBest) { trueBest[k] = Math.max(trueBest[k]!, cands[i]!.value); percBest[k] = Math.max(percBest[k]!, c.score / H.SCALE); }
  });
  const trueIdx = pickCandidate(scoreCandidates(cands));
  if (mindOn) setHolderMind({
    state: st, fresh, pressure, pN, release, openOptions: a.ps.openCount ?? 0, distM, simple, widen, longShotRange: range,
    mood: moodBand(effectiveMood(mental)), trueScores: trueBest, perceived: percBest,
    trueBest: trueIdx >= 0 ? slotOf(cands[trueIdx]!.decision) : 'carry',
    picked: slotOf(decision),
    ...('move' in decision && decision.move ? { move: decision.move } : {}),
  });

  const counts = { candidates: scored.length, vetoed: scored.filter(c => c.vetoed).length, compressed: scored.filter(c => c.compressed).length };
  const chosen = idx >= 0 ? scored[idx]! : null;
  gameBus.emit('holderChoice', {
    playerId: player.id, team: player.team, cat: chosen?.cat ?? 3, kind: chosen?.kind ?? 'hold', lapse: st.lapse, ...counts,
  });
  if (isDebugEnabled()) {
    gameBus.emit('holderCandidates', {
      playerId: player.id, playerName: player.name, lapse: st.lapse, chosen: idx,
      candidates: scored.map(c => ({ cat: c.cat, kind: c.kind, label: c.label, value: c.value, mult: c.mult, risk: c.risk, raw: c.raw, score: c.score, vetoed: c.vetoed, compressed: c.compressed })),
    });
    debugLog('decision', `${player.name}: ${chosen ? `${chosen.kind} (${chosen.label}) ${chosen.score}` : 'all vetoed → hold'} of ${counts.candidates} candidates, ${counts.vetoed} vetoed${st.lapse ? ' (lapse)' : ''}`, { playerId: player.id });
  }
  void intent; void defendingOutfield;
  return decision;
}

/**
 * Risk byte of a soft 0..1 "badness" (1 − lane clearance, 1 − race score, defenders' share): its square, so a narrow
 * margin is a modest risk and only a closed one reaches the cubic compression or the veto (stage 8).
 */
function softRisk(bad: number): number {
  return riskOf(Math.max(0, Math.min(1, bad)) ** 2);
}

/** Nobody of `opps` within `r` yd of the segment from the holder along (dx, dy) for `len` yd (ahead of his first yard). */
function laneOpen(p: GamePlayer, dx: number, dy: number, len: number, r: number, opps: readonly GamePlayer[]): boolean {
  for (const o of opps) {
    const along = (o.x - p.x) * dx + (o.y - p.y) * dy;
    if (along < 1) continue;
    const t = Math.min(along, len);
    if (Math.hypot(o.x - (p.x + dx * t), o.y - (p.y + dy * t)) < r) return false;
  }
  return true;
}

function decideBallHolder(
  player: GamePlayer,
  allPlayers: GamePlayer[],
  crowdGrid: CrowdGrid | null,
  intent: TeamIntent,
  tbCachedCells: ReturnType<typeof enumerateCandidateCells> | null = null,
  mind: { matchTime: number; situ?: HolderSituation } | null = null,
): PlayerDecision {
  // Exclude recovering opponents — they are stumbling and pose no real threat to the carrier.
  const opponents         = allPlayers.filter(p => p.team !== player.team && !isPlayerInRecovery(p));
  const outfieldOpponents = opponents.filter(p => p.role !== 'GK');
  // Defending team's outfield density grid — used by the carry path-clearness check.
  const defendingOutfield: GridMatrix | null = crowdGrid == null
    ? null
    : (player.team === 'A' ? crowdGrid.teamBOutfield : crowdGrid.teamAOutfield);

  const sh = evalShoot(player, opponents, intent, allPlayers);          // GK included — affects pressure calc
  // One-on-one with the keeper (#156): only give the ball to a clearly better-placed teammate.
  const gate = oneOnOneGate(player, opponents, outfieldOpponents, allPlayers, sh.shootBreakdown?.xg ?? 0);
  const ps = evalPass(player, opponents, allPlayers, intent, gate && (r => gate(r.x, r.y, r.id)));
  const fmChoice = !!mind && DECISION_FLAGS.FM_HOLDER && player.role !== 'GK';
  const carryLanes: CarryLaneOption[] = [];
  const ca = evalCarry(player, outfieldOpponents, allPlayers, defendingOutfield, intent, fmChoice ? carryLanes : null);  // GK excluded — handled by shoot decision
  const dr = evalDribble(player, outfieldOpponents, allPlayers.filter(p => p.team === player.team)); // GK excluded — don't dribble the GK
  const tbResult = evalThroughBall(player, allPlayers, crowdGrid, tbCachedCells, gate);
  const tb = tbResult.action;
  const crResult = evalCross(player, allPlayers, gate && ((x, y, id) => gate(x, y, id, AERIAL_CONFIG.HEADER_XG_MULT)));
  const cr = crResult.action;
  const lb = evalLongBall(player, allPlayers);
  const actions: ActionScore[] = [sh, ca, ps, dr, tb, cr, lb];
  const moves = mind ? holderMoves(player, allPlayers, opponents, outfieldOpponents, !!gate) : [];

  // Stage 8 (`holder-choice.md`): the FM chooser over every candidate (keeper and set-piece takers keep the old rules).
  const fmDecision = fmChoice
    ? fmHolderChoice(player, allPlayers, outfieldOpponents, defendingOutfield, intent,
      { sh, ps, dr, lb, cells: tbResult.cells, targets: crResult.targets, carryLanes, moves }, gate, mind!)
    : null;

  let best = actions.reduce((a, b) => b.score > a.score ? b : a);
  if (fmDecision) {
    // The debug panel's "best" is the FM pick's action.
    best = actions.find(x => x.type === fmDecision.type) ?? best;
  } else
  // The holder's mind (phase 3, `decisions.md`): rolls, gates and perceived scores. Off for the keeper, a set-piece
  // taker (`mind` null) and under the one-on-one gate, which keep their rules.
  if (mind && DECISION_FLAGS.HOLDER && player.role !== 'GK' && !gate) {
    const r = holderMind(player, allPlayers, actions, tbResult.cells, crResult.targets, lb, mind.matchTime, moves);
    best = r.best;
  } else {
    for (const mv of moves) if (mv.score > best.score) best = mv;
  }

  // Decision telemetry (`decisions.md`): the score vector, only while somebody listens.
  if (decisionCaptureOn()) {
    captureDecision('holder', {
      shoot: sh.score, carry: ca.score, pass: ps.score, dribble: dr.score,
      through_ball: tb.score, cross: cr.score, long_ball: lb.score,
    });
  }

  if (isDebugEnabled()) {
    if (gate) {
      debugLog('decision', `${player.name} one-on-one (xG ${(sh.shootBreakdown?.xg ?? 0).toFixed(2)}): only clearly better targets → ${best.type}`,
        { playerId: player.id, data: { pass: ps.score, throughBall: tb.score, cross: cr.score, shoot: sh.score, carry: ca.score } });
    }
    // Defaults guarantee every breakdown is present in the event payload, even when
    // an action returns 0 because of a hard cull (e.g. dribble bias too low, no teammates).
    const shootBd   = sh.shootBreakdown   ?? {
      dist: 0, openAngle: 0, pressure: 0, xg: 0, threshold: 0,
      roleScore: 0, xgFloor: 0, intentBonus: 0, score: 0,
    };
    const passBd    = ps.passBreakdown    ?? {
      toId: null, laneScore: 0, progressScore: 0, receiverSpaceScore: 0,
      distancePenalty: 0, goalProximityBonus: 0, visionRangePenalty: 0,
      passTargetBonus: 0, receiverRoleBonus: 0, quality: 0, roleBias: 0,
      baseScore: 0, playerModifier: 0, tacticalModifier: 0,
      rawScore: 0, score: 0,
    };
    const dribbleBd = dr.dribbleBreakdown ?? {
      targetId: null, roleTendency: 0, forwardBlock: 0, rawScore: 0, score: 0,
    };

    gameBus.emit('decisionScores', {
      playerName:  player.name,
      playerId:    player.id,
      shoot:       sh.score,
      pass:        ps.score,
      carry:       ca.score,
      dribble:     dr.score,
      throughBall: tb.score,
      cross:       cr.score,
      longBall:    lb.score,
      best:        best.type,
      breakdowns: {
        shoot:   shootBd,
        pass:    passBd,
        carry:   ca.carryBreakdown ?? null,
        dribble: dribbleBd,
      },
    });

    if (crResult.targets.length > 0) {
      gameBus.emit('crossScores', {
        playerId:   player.id,
        playerName: player.name,
        targets: crResult.targets.map(t => ({
          kind: t.kind, x: t.x, y: t.y, attackers: t.attackers, defenders: t.defenders,
          heading: t.heading, gkClaim: t.gkClaim, raw: t.raw,
          score: t.raw > 0 ? compress(t.raw, AERIAL_CONFIG.CROSS_STRONG_RAW) : 0,
          ...(t.weight !== undefined ? { weight: t.weight } : {}),
        })),
      });
    }

    // Emit through-ball candidate cells (re-uses the same cells already scored
    // by evalThroughBall — no double work).
    gameBus.emit('throughBallScores', {
      playerId:   player.id,
      playerName: player.name,
      bestScore:  tbResult.cells.length > 0 ? tbResult.cells[0]!.score : 0,
      cells: tbResult.cells.map(c => ({
        x:                  c.x,
        y:                  c.y,
        score:              c.score,
        raceMargin:         c.components.raceMargin,
        bestAttackerId:     c.components.bestAttackerId,
        bestAttackerEta:    c.components.bestAttackerEta,
        bestDefenderId:     c.components.bestDefenderId,
        bestDefenderEta:    c.components.bestDefenderEta,
        raceMarginScore:    c.components.raceMarginScore,
        spaceQualityScore:  c.components.spaceQualityScore,
        goalThreatScore:    c.components.goalThreatScore,
        passerSkillScore:   c.components.passerSkillScore,
        pathClearScore:     c.components.pathClearScore,
        laneRiskPenalty:    c.components.laneRiskPenalty,
        offsideRiskPenalty: c.components.offsideRiskPenalty,
      })),
    });
  }

  if (fmDecision) return fmDecision;

  // Hold and turn (stage 4b, `fm-numbers.md`): nothing better than a weak carry → keep the ball and wait for an option;
  // a carry against the way he was moving → a short turn first. Off for set-piece takers and the keeper.
  const cadence = mind && DECISION_FLAGS.ACTION_CADENCE && player.role !== 'GK' && !gate;
  if (cadence && (best.type === 'carry' || best.score < MIN_ACTION_SCORE) && !best.move) {
    const step = holderStepOf(player, opponents, ca, ps, best.score < MIN_ACTION_SCORE);
    if (step) return step;
  }

  if (best.score < MIN_ACTION_SCORE) {
    // One-on-one: never fall back to an ungated pass — shoot instead.
    if (gate) return { type: 'shoot' };
    const lane = getBestCarryLane(player, outfieldOpponents, allPlayers, defendingOutfield, intent);
    if (lane) return { type: 'carry', dx: lane.dx, dy: lane.dy };
    return { type: 'pass' };
  }

  switch (best.type) {
    case 'shoot':         return best.move ? { type: 'shoot', move: best.move } : { type: 'shoot' };
    // Under the one-on-one gate (and for a lay-off) the receiver is fixed (startPass must not pick another).
    case 'pass':          return best.move ? { type: 'pass', targetId: best.targetId!, move: best.move }
      : gate && best.targetId !== undefined ? { type: 'pass', targetId: best.targetId } : { type: 'pass' };
    case 'carry':         return best.move ? { type: 'carry', dx: best.dx!, dy: best.dy!, move: best.move } : { type: 'carry', dx: best.dx!, dy: best.dy! };
    case 'dribble':       return best.move ? { type: 'dribble', targetId: best.targetId!, move: best.move } : { type: 'dribble', targetId: best.targetId! };
    case 'through_ball':  return {
      type: 'through_ball',
      cellX:            best.cellX!,
      cellY:            best.cellY!,
      intendedRunnerId: best.intendedRunnerId ?? null,
    };
    case 'cross':         return { type: 'cross', toX: best.toX!, toY: best.toY!, intendedRunnerId: best.intendedRunnerId ?? null };
    case 'long_ball':     return { type: 'long_ball', toX: best.toX!, toY: best.toY!, targetId: best.targetId! };
  }
}

/**
 * Hold or turn instead of the plain carry (stage 4b, `fm-numbers.md`). Hold: the carry is weak (compressed score
 * below HOLD_CARRY_SCORE) and the best pass is not clearly better, or nothing scores at all — he edges away from the
 * nearest opponent. Turn: the carry goes more than TURN_DEG from where he was moving.
 */
function holderStepOf(player: GamePlayer, opponents: GamePlayer[], ca: ActionScore, ps: ActionScore, nothing: boolean): PlayerDecision | null {
  const F = FM_NUMBERS;
  let near: GamePlayer | null = null; let nd = Infinity;
  for (const o of opponents) { const d = Math.hypot(o.x - player.x, o.y - player.y); if (d < nd) { nd = d; near = o; } }
  // FM holds more deep in his own half (own third 14%, final third 6%).
  const fromOwn = player.attackDir === 1 ? player.x : PITCH_LENGTH - player.x;
  const holdBar = F.HOLD_CARRY_SCORE + F.HOLD_OWN_THIRD_EXTRA * Math.max(0, 1 - fromOwn / (PITCH_LENGTH / 2));
  if ((nothing || (ca.score < holdBar && ps.score < ca.score + F.HOLD_PASS_MARGIN)) && nd >= F.HOLD_MIN_OPP_YD) {
    let dx = -player.attackDir as number, dy = 0;
    if (near && nd > 0.01) { dx = (player.x - near.x) / nd; dy = (player.y - near.y) / nd; }
    return { type: 'carry', dx, dy, step: 'hold' };
  }
  const v = player.vel;
  if (v && ca.dx !== undefined && ca.dy !== undefined) {
    const sp = Math.hypot(v.x, v.y);
    if (sp >= F.TURN_MIN_SPEED) {
      const cos = (v.x * ca.dx + v.y * ca.dy) / sp;
      if (cos < Math.cos((F.TURN_DEG * Math.PI) / 180)) return { type: 'carry', dx: ca.dx, dy: ca.dy, step: 'turn' };
    }
  }
  return null;
}

/**
 * Corner / crossed free-kick taker (`set-pieces-play.md` §1–2): the best of `evaluateBoxSetPiece`
 * — a cross to the near post / penalty spot / far post, or the short pass (`pass`, which
 * `startPass` sends to the nearest teammate).
 */
function decideBoxSetPiece(player: GamePlayer, allPlayers: GamePlayer[], kind: 'corner' | 'free_kick', routine?: SetPieceRoutine, fmCorner?: SetPiece['fmCorner']): PlayerDecision {
  // Stage 12 (`set-pieces-play.md` → "Stage 12"): a corner goes to its decided FM target (drawn at the award), unless a
  // rehearsed routine names the delivery.
  if (fmCorner && (!routine || routine.target === 'auto')) {
    if (fmCorner === 'short') return { type: 'pass' };
    const t = fmCornerPoint(fmCorner, player, player.attackDir);
    const mates = allPlayers.filter(p => p.team === player.team && p.id !== player.id && p.role !== 'GK');
    const intended = mates.length > 0 ? mates.reduce((a, b) => (Math.hypot(b.x - t.x, b.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? b : a)).id : null;
    return { type: 'cross', toX: t.x, toY: t.y, intendedRunnerId: intended, delivery: fmCorner };
  }
  const options = evaluateBoxSetPiece(player, allPlayers, getTeamBuildUp(player.team), kind);
  // A rehearsed routine names the delivery; without one the taker plays his best option.
  const best = routineOption(options, routine);
  if (isDebugEnabled() && best) {
    gameBus.emit('setPieceScores', {
      playerId: player.id, playerName: player.name, kind, chosen: best.kind,
      options: options.map(o => ({ kind: o.kind, x: o.x, y: o.y, raw: o.raw, attackers: o.attackers, defenders: o.defenders })),
    });
  }
  if (!best || best.kind === 'short' || best.raw <= 0) return { type: 'pass' };
  // Stage 12: an automatic crossed free kick is aimed at FM's cross zones at the kick (`delivery: 'zone'`).
  const zone = DECISION_FLAGS.FM_SET_PIECES && DECISION_FLAGS.FM_AERIAL && kind === 'free_kick' && (!routine || routine.target === 'auto');
  return { type: 'cross', toX: best.x, toY: best.y, intendedRunnerId: best.targetId, delivery: zone ? 'zone' : best.kind === 'near_post' || best.kind === 'far_post' || best.kind === 'penalty_spot' ? best.kind : 'zone' };
}

// ── Public decision entry point ───────────────────────────────────────────────

/**
 * Evaluate what a single player should do this tick.
 *
 * @param player        The player being evaluated.
 * @param ballHolder    The player currently holding the ball (or last holder during flight).
 * @param hasBall       True if `player` is the ball holder.
 * @param ballInFlight  True if a pass or shot is currently in flight.
 * @param allPlayers    All players — used by the carry lane scan.
 * @param setPiece      Active set piece (kickoff / offside_fk / goal_kick) — forces the
 *                      taker to pass, never carry/dribble/shoot. Non-takers behave normally.
 * @param crowdGrid     Per-tick density grid; carry scoring uses the defending team's
 *                      outfield matrix to fade role-fit/byline penalties on a clear run.
 *                      Pass `null` to skip the clearness check (penalties stay full).
 */
export function decide(
  player: GamePlayer,
  ballHolder: GamePlayer,
  hasBall: boolean,
  ballInFlight: boolean,
  allPlayers: GamePlayer[],
  offsideLine: number | null,
  possessionTime: number,
  setPiece: SetPiece | null = null,
  crowdGrid: CrowdGrid | null = null,
  teamIntent: { A: TeamIntent; B: TeamIntent } = { A: 'balanced', B: 'balanced' },
  tbCachedCells: ReturnType<typeof enumerateCandidateCells> | null = null,
  matchTime = 0,
  situ?: HolderSituation,
): PlayerDecision {

  // ── With ball — unified scoring ─────────────────────────────────────────
  if (hasBall) {
    // Set-piece taker must play the ball — no carrying, no dribbling. A free-kick taker may also
    // shoot, cross or play a through ball when that is the normal best action (a direct free kick
    // near goal, a free kick from wide); a goal-kick taker may go long (`aerial.md`).
    if (setPiece && player.id === setPiece.takerId) {
      // Set-piece play (`set-pieces-play.md`): a direct free kick is shot at goal; a corner or a
      // crossed free kick is delivered to the best zone in the box, or played short.
      if (setPiece.variant === 'direct') return { type: 'shoot' };
      if (setPiece.variant === 'box') return decideBoxSetPiece(player, allPlayers, setPiece.type === 'corner' ? 'corner' : 'free_kick', setPiece.routine, setPiece.fmCorner);
      // Stage 12: a dead-ball goal kick follows its plan — short to the centre-back off the box, or long past half-way.
      if (setPiece.type === 'goal_kick' && setPiece.goalKick) {
        const ownGoalX = player.attackDir === 1 ? 0 : PITCH_LENGTH;
        const mates = allPlayers.filter(p => p.team === player.team && p.id !== player.id && p.role !== 'GK');
        if (mates.length > 0) {
          const t = setPiece.goalKick.kind === 'short' ? goalKickShortSpot(ownGoalX, setPiece.goalKick.side) : goalKickLongPoint(ownGoalX, setPiece.goalKick.side);
          const near = mates.reduce((a, b) => (Math.hypot(b.x - t.x, b.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? b : a));
          if (setPiece.goalKick.kind === 'short') return { type: 'pass', targetId: near.id };
          return { type: 'long_ball', toX: t.x, toY: t.y, targetId: near.id };
        }
      }
      if (setPiece.type === 'free_kick' || setPiece.type === 'goal_kick') {
        const d = decideBallHolder(player, allPlayers, crowdGrid, teamIntent[player.team], tbCachedCells);
        if (setPiece.type === 'free_kick' && (d.type === 'shoot' || d.type === 'through_ball' || d.type === 'cross')) return d;
        if (d.type === 'long_ball') return d;
      }
      return { type: 'pass' };
    }
    return decideBallHolder(player, allPlayers, crowdGrid, teamIntent[player.team], tbCachedCells, { matchTime, ...(situ ? { situ } : {}) });
  }

  // ── Attacking teammate (off-ball) ───────────────────────────────────────
  if (player.team === ballHolder.team) {
    if (player.role === 'GK') return { type: 'idle' };
    return evaluateOffBall(player, ballHolder, allPlayers, offsideLine, teamIntent[player.team], crowdGrid);
  }

  const dx   = ballHolder.x - player.x;
  const dy   = ballHolder.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Players recovering from a duel cannot press or tackle — they're still stumbling.
  if (isPlayerInRecovery(player)) {
    return { type: 'idle' };
  }

  // Tackle is always available regardless of press rank. Stage 20 (4c-2): getting stuck in reaches a little further,
  // staying on feet passes up a chance now and then (a draw only with that instruction).
  const tk = instrDelta(player.team, 'tackling');
  if (dist <= TACKLE_RANGE + (tk > 0 ? INSTR.TACKLE_REACH_YD * tk : 0)) {
    if (!(tk < 0 && matchRandom() < INSTR.TACKLE_SKIP * -tk)) return { type: 'tackle', targetId: ballHolder.id };
  }

  // GK never presses — always holds position.
  if (player.role === 'GK') {
    return { type: 'idle' };
  }

  // ── Defending decision (score-based, mirrors evaluateOffBall pattern) ────
  return evaluateDefensiveDecision(player, ballHolder, allPlayers, possessionTime, crowdGrid, teamIntent[player.team]);
}
