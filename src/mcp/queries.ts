/**
 * queries — pure functions that wrap engine APIs for MCP tool calls.
 *
 * Each query takes a GameState (loaded from a debug snapshot) plus query-specific
 * params, and returns a structured result with full breakdowns. No randomness:
 * every function returns deterministic numeric scores, never rolls outcomes.
 */

import type { GamePlayer, GameState, TeamId } from '@/GameEngine/types';
import { evaluatePassLanes, scorePassToReceiver } from '@/GameEngine/Domain/PassLanes';
import { evaluateCarryLane, rot } from '@/GameEngine/Domain/CarryLaneEval';
import { evaluateDefensiveDecision } from '@/GameEngine/Domain/DefensivePositioning';
import { evaluateOffBall } from '@/GameEngine/Domain/OffBallMovement';
import { computeOffsideLine } from '@/GameEngine/Domain/Offside';
import { computeCrowdGrid } from '@/GameEngine/Infrastructure/CrowdGrid';
import { getThroughBallCells } from '@/GameEngine/Domain/ThroughBallCells';
import { THROUGH_BALL_CONFIG } from '@/GameEngine/Configs/ThroughBallConfig';
import { getTeamCarryConfig, getTeamPassConfig, getTeamWidth, getTeamBuildUp } from '@/GameEngine/Configs/AttackConfig';
import {
  computeXG,
  computeWeightedPressure,
  computeShooterEffect,
  computeGKEffect,
  computeGKPositionQuality,
  computeOpenAngle,
  XG_PRESS_RADIUS,
  playerInterceptionCorridor,
  GOAL_Y_MIN,
  GOAL_Y_MAX,
  PITCH_LENGTH,
} from '@/GameEngine/Infrastructure/ActionOutcomes';
import { getPlayer, getBallHolder, teammates, opponents, type StoredScores } from '@/mcp/loadState';

// ── Pass scoring ──────────────────────────────────────────────────────────────

export function queryAllPasses(state: GameState): {
  holder: { id: number; name: string; team: TeamId };
  buildUp: string;
  width: string;
  minPassScore: number;
  passes: Array<{
    receiverId: number;
    receiverName: string;
    role: string;
    distance: number;
    score: number;
    open: boolean;
  }>;
} {
  const holder = getBallHolder(state);
  const tm     = teammates(state, holder.team, holder.id);
  const opps   = opponents(state, holder.team);
  const cfg    = getTeamPassConfig(holder.team);
  const lanes  = evaluatePassLanes(holder, tm, opps);

  const idToPlayer = new Map(tm.map(p => [p.id, p]));

  return {
    holder:  { id: holder.id, name: holder.name, team: holder.team },
    buildUp: getTeamBuildUp(holder.team),
    width:   getTeamWidth(holder.team),
    minPassScore: cfg.MIN_PASS_SCORE,
    passes: lanes
      .map(l => {
        const p = idToPlayer.get(l.toId)!;
        const distance = Math.hypot(p.x - holder.x, p.y - holder.y);
        return {
          receiverId:   l.toId,
          receiverName: p.name,
          role:         p.role,
          distance:     +distance.toFixed(2),
          score:        +l.score.toFixed(4),
          open:         l.open,
        };
      })
      .sort((a, b) => b.score - a.score),
  };
}

export function queryPass(state: GameState, receiverId: number): {
  holder:   { id: number; name: string };
  receiver: { id: number; name: string; role: string; x: number; y: number };
  distance: number;
  score:    number;
  open:     boolean;
  minPassScore: number;
} {
  const holder = getBallHolder(state);
  const receiver = getPlayer(state, receiverId);
  if (receiver.team !== holder.team) {
    throw new Error(`receiver ${receiverId} (${receiver.name}) is on team ${receiver.team}; holder is on team ${holder.team}`);
  }
  const opps = opponents(state, holder.team);
  const cfg  = getTeamPassConfig(holder.team);
  const score = scorePassToReceiver(holder, receiver, opps);
  return {
    holder:   { id: holder.id, name: holder.name },
    receiver: { id: receiver.id, name: receiver.name, role: receiver.role, x: receiver.x, y: receiver.y },
    distance: +Math.hypot(receiver.x - holder.x, receiver.y - holder.y).toFixed(2),
    score:    +score.toFixed(4),
    open:     score >= cfg.MIN_PASS_SCORE,
    minPassScore: cfg.MIN_PASS_SCORE,
  };
}

// ── Carry lane scoring ────────────────────────────────────────────────────────

export function queryCarryLanes(state: GameState): {
  holder:   { id: number; name: string; team: TeamId; role: string; x: number; y: number };
  buildUp:  string;
  minTotalScore: number;
  lanes: Array<{
    label: string;
    angleDeg: number;
    dirX: number;
    dirY: number;
    targetX: number;
    targetY: number;
    score: number;
  }>;
} {
  const holder = getBallHolder(state);
  const opps   = opponents(state, holder.team);
  const cfg    = getTeamCarryConfig(holder.team);

  const goalX       = holder.attackDir === 1 ? PITCH_LENGTH : 0;
  const goalCenterY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
  const dx = goalX - holder.x;
  const dy = goalCenterY - holder.y;
  const len = Math.hypot(dx, dy) || 1;
  const fwdX = dx / len;
  const fwdY = dy / len;

  const lanes = [
    { label: 'forward',       angle:  0 },
    { label: 'forward-left',  angle: -Math.PI / 6 },
    { label: 'forward-right', angle:  Math.PI / 6 },
  ].map(({ label, angle }) => {
    const { dx: dirX, dy: dirY } = rot(fwdX, fwdY, angle);
    const score = evaluateCarryLane(holder, dirX, dirY, goalCenterY, opps, cfg);
    return {
      label,
      angleDeg: +(angle * 180 / Math.PI).toFixed(1),
      dirX:     +dirX.toFixed(4),
      dirY:     +dirY.toFixed(4),
      targetX:  +(holder.x + dirX * cfg.LOOKAHEAD_DISTANCE).toFixed(2),
      targetY:  +(holder.y + dirY * cfg.LOOKAHEAD_DISTANCE).toFixed(2),
      score:    +score.toFixed(4),
    };
  });

  return {
    holder:  { id: holder.id, name: holder.name, team: holder.team, role: holder.role, x: holder.x, y: holder.y },
    buildUp: getTeamBuildUp(holder.team),
    minTotalScore: cfg.MIN_TOTAL_SCORE,
    lanes:   lanes.sort((a, b) => b.score - a.score),
  };
}

// ── Through-ball cell scoring ───────────────────────────────────────────────────

export function queryThroughBallCells(state: GameState, limit = 15): {
  holder: { id: number; name: string; team: TeamId; role: string; x: number; y: number } | null;
  weights: {
    W_RACE: number; W_SPACE: number; W_SKILL: number;
    W_PATH: number; W_LANE_RISK: number; W_OFFSIDE: number; GOAL_THREAT_BUFF: number;
  };
  cellCount: number;
  cells: Array<{
    col: number;
    row: number;
    x: number;
    y: number;
    score: number;
    race: number;
    space: number;
    goal: number;
    skill: number;
    path: number;
    laneRisk: number;
    offsideRisk: number;
    raceMargin: number;
    bestAttackerId: number | null;
    bestAttackerName: string | null;
    bestAttackerEta: number;
    bestDefenderId: number | null;
    bestDefenderName: string | null;
    bestDefenderEta: number;
  }>;
} {
  const holder = state.ballHolderId != null ? state.players.find(p => p.id === state.ballHolderId) : null;
  const nameOf = (id: number | null) => (id != null ? state.players.find(p => p.id === id)?.name ?? null : null);

  const cells = getThroughBallCells(state);

  return {
    holder: holder
      ? { id: holder.id, name: holder.name, team: holder.team, role: holder.role, x: +holder.x.toFixed(2), y: +holder.y.toFixed(2) }
      : null,
    weights: {
      W_RACE:           THROUGH_BALL_CONFIG.W_RACE,
      W_SPACE:          THROUGH_BALL_CONFIG.W_SPACE,
      W_SKILL:          THROUGH_BALL_CONFIG.W_SKILL,
      W_PATH:           THROUGH_BALL_CONFIG.W_PATH,
      W_LANE_RISK:      THROUGH_BALL_CONFIG.W_LANE_RISK,
      W_OFFSIDE:        THROUGH_BALL_CONFIG.W_OFFSIDE,
      GOAL_THREAT_BUFF: THROUGH_BALL_CONFIG.GOAL_THREAT_BUFF,
    },
    cellCount: cells.length,
    cells: cells
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(c => ({
        col: c.col,
        row: c.row,
        x:   +c.x.toFixed(2),
        y:   +c.y.toFixed(2),
        score:       +c.score.toFixed(4),
        race:        +c.components.raceMarginScore.toFixed(4),
        space:       +c.components.spaceQualityScore.toFixed(4),
        goal:        +c.components.goalThreatScore.toFixed(4),
        skill:       +c.components.passerSkillScore.toFixed(4),
        path:        +c.components.pathClearScore.toFixed(4),
        laneRisk:    +c.components.laneRiskPenalty.toFixed(4),
        offsideRisk: +c.components.offsideRiskPenalty.toFixed(4),
        raceMargin:  +c.components.raceMargin.toFixed(4),
        bestAttackerId:   c.components.bestAttackerId,
        bestAttackerName: nameOf(c.components.bestAttackerId),
        bestAttackerEta:  +c.components.bestAttackerEta.toFixed(4),
        bestDefenderId:   c.components.bestDefenderId,
        bestDefenderName: nameOf(c.components.bestDefenderId),
        bestDefenderEta:  +c.components.bestDefenderEta.toFixed(4),
      })),
  };
}

// ── Defensive intent scoring ──────────────────────────────────────────────────

export function queryDefensiveIntent(
  state: GameState,
  defenderId: number,
  storedScoresMap?: Map<number, StoredScores>,
): {
  defender:   { id: number; name: string; team: TeamId; role: string };
  ballHolder: { id: number; name: string; team: TeamId };
  decision:   unknown;
  recomputed: { decisionType: string };
  storedScores: unknown;
} {
  const defender = getPlayer(state, defenderId);
  const holder   = getBallHolder(state);
  if (defender.team === holder.team) {
    throw new Error(`player ${defenderId} (${defender.name}) is a teammate of the ball holder, not a defender`);
  }

  const decision = evaluateDefensiveDecision(defender, holder, state.players, state.possessionTime, null, state.teamIntent?.[defender.team] ?? 'balanced');

  const storedScores = storedScoresMap?.get(defenderId)?.defensiveScores ?? null;

  return {
    defender:   { id: defender.id, name: defender.name, team: defender.team, role: defender.role },
    ballHolder: { id: holder.id,   name: holder.name,   team: holder.team },
    decision,
    recomputed: { decisionType: (decision as { type: string }).type },
    storedScores,
  };
}

// ── Off-ball movement ─────────────────────────────────────────────────────────

export function queryOffBall(
  state: GameState,
  playerId: number,
  storedScoresMap?: Map<number, StoredScores>,
): {
  player:     { id: number; name: string; team: TeamId; role: string; x: number; y: number };
  ballHolder: { id: number; name: string; team: TeamId };
  offsideLine: number | null;
  decision:   unknown;
  storedScores: unknown;
} {
  const player = getPlayer(state, playerId);
  const holder = getBallHolder(state);
  if (player.team !== holder.team) {
    throw new Error(`player ${playerId} (${player.name}) is on the defending team; off-ball is for attackers only`);
  }
  if (player.id === holder.id) {
    throw new Error(`player ${playerId} is the ball holder; off-ball is for non-holders`);
  }

  const offsideLine = computeOffsideLine(player.attackDir, state.players, player.team, holder.x);
  const crowdGrid   = computeCrowdGrid(state);
  const decision = evaluateOffBall(player, holder, state.players, offsideLine, 'balanced', crowdGrid);

  const storedScores = storedScoresMap?.get(playerId)?.offBallScores ?? null;

  return {
    player:     { id: player.id, name: player.name, team: player.team, role: player.role, x: player.x, y: player.y },
    ballHolder: { id: holder.id, name: holder.name, team: holder.team },
    offsideLine,
    decision,
    storedScores,
  };
}

// ── Shot / xG ─────────────────────────────────────────────────────────────────

export function queryShot(
  state: GameState,
  shooterId: number,
  opts?: { fromX?: number; fromY?: number },
): {
  shooter:    { id: number; name: string; team: TeamId; role: string };
  position:   { x: number; y: number };
  goal:       { x: number };
  distance:   number;
  openAngle:  number;
  openAngleDeg: number;
  pressure:   number;
  pressingDefenders: Array<{ id: number; name: string; distance: number }>;
  xg:         number;
  shooterEffect: number;
  gkPresent:  boolean;
  gkEffect:   number;
  goalChance: number;
} {
  const shooter = getPlayer(state, shooterId);
  // Allow a hypothetical position via opts; default to the shooter's current position.
  const sx = opts?.fromX ?? shooter.x;
  const sy = opts?.fromY ?? shooter.y;

  // Build a virtual shooter at (sx, sy) so the engine helpers see the right coords.
  const virtualShooter: GamePlayer = { ...shooter, x: sx, y: sy };

  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  const dist  = Math.hypot(sx - goalX, sy - (GOAL_Y_MIN + GOAL_Y_MAX) / 2);
  const openAngle = computeOpenAngle(sx, sy, goalX);

  const opps     = opponents(state, shooter.team);
  const nearby   = opps.filter(o => Math.hypot(o.x - sx, o.y - sy) < XG_PRESS_RADIUS);
  const pressure = computeWeightedPressure(virtualShooter, opps);
  const xg       = computeXG(dist, openAngle, pressure);
  const shooterEffect = computeShooterEffect(virtualShooter);

  const gk = opps.find(p => p.role === 'GK') ?? null;
  const gkEffect = gk
    ? computeGKEffect(gk, Math.hypot(virtualShooter.x - goalX, virtualShooter.y - (GOAL_Y_MIN + GOAL_Y_MAX) / 2), { x: virtualShooter.x, y: virtualShooter.y })
    : 1.0;

  return {
    shooter:  { id: shooter.id, name: shooter.name, team: shooter.team, role: shooter.role },
    position: { x: +sx.toFixed(2), y: +sy.toFixed(2) },
    goal:     { x: goalX },
    distance: +dist.toFixed(2),
    openAngle:    +openAngle.toFixed(4),
    openAngleDeg: +(openAngle * 180 / Math.PI).toFixed(1),
    pressure: +pressure.toFixed(4),
    pressingDefenders: nearby
      .map(d => ({ id: d.id, name: d.name, distance: +Math.hypot(d.x - sx, d.y - sy).toFixed(2) }))
      .sort((a, b) => a.distance - b.distance),
    xg:            +xg.toFixed(4),
    shooterEffect: +shooterEffect.toFixed(4),
    gkPresent:     !!gk,
    gkEffect:      +gkEffect.toFixed(4),
    goalChance:    +Math.max(0, Math.min(1, xg * shooterEffect * gkEffect)).toFixed(4),
  };
}

export function queryGKQuality(state: GameState, gkId: number): {
  gk: { id: number; name: string; team: TeamId; x: number; y: number };
  ballPosition: { x: number; y: number };
  positionQuality: number;
} {
  const gk = getPlayer(state, gkId);
  if (gk.role !== 'GK') {
    throw new Error(`player ${gkId} (${gk.name}) is not a GK (role=${gk.role})`);
  }
  const holder  = state.ballHolderId != null ? state.players.find(p => p.id === state.ballHolderId) : null;
  const ballPos = holder ? { x: holder.x, y: holder.y } : { x: 0, y: 0 };
  const quality = computeGKPositionQuality(gk, ballPos);
  return {
    gk:           { id: gk.id, name: gk.name, team: gk.team, x: gk.x, y: gk.y },
    ballPosition: ballPos,
    positionQuality: +quality.toFixed(4),
  };
}

// ── Interception corridors ────────────────────────────────────────────────────

export function queryInterceptionCorridors(state: GameState): {
  defenders: Array<{
    id: number;
    name: string;
    role: string;
    team: TeamId;
    speed: number;
    acceleration: number;
    corridor: number;
    baseInterceptionChance: number;
  }>;
} {
  const holder = state.ballHolderId != null ? state.players.find(p => p.id === state.ballHolderId) : null;
  const defendingTeam: TeamId | null = holder ? (holder.team === 'A' ? 'B' : 'A') : null;
  const defenders = state.players.filter(p => defendingTeam == null || p.team === defendingTeam);
  return {
    defenders: defenders
      .map(p => ({
        id: p.id, name: p.name, role: p.role, team: p.team,
        speed:                  +p.runtimeStats.withoutBall.speed.toFixed(2),
        acceleration:           +p.runtimeStats.withoutBall.acceleration.toFixed(2),
        corridor:               +playerInterceptionCorridor(p).toFixed(2),
        baseInterceptionChance: +p.runtimeStats.withoutBall.interceptionChance.toFixed(4),
      }))
      .sort((a, b) => b.corridor - a.corridor),
  };
}

// ── Snapshot summary ──────────────────────────────────────────────────────────

export function querySummary(state: GameState): {
  matchTime: number;
  matchPhase: string;
  score: { A: number; B: number };
  ballHolder: { id: number; name: string; team: TeamId; role: string } | null;
  passInFlight: boolean;
  shotInFlight: boolean;
  setPiece: string | null;
  players: Array<{ id: number; name: string; team: TeamId; role: string; x: number; y: number }>;
} {
  const holder = state.ballHolderId != null ? state.players.find(p => p.id === state.ballHolderId) : null;
  return {
    matchTime: +state.matchTime.toFixed(1),
    matchPhase: state.matchPhase,
    score: state.score,
    ballHolder: holder ? { id: holder.id, name: holder.name, team: holder.team, role: holder.role } : null,
    passInFlight: !!state.pass,
    shotInFlight: !!state.shot,
    setPiece: state.setPiece?.type ?? null,
    players: state.players
      .map(p => ({ id: p.id, name: p.name, team: p.team, role: p.role, x: +p.x.toFixed(2), y: +p.y.toFixed(2) }))
      .sort((a, b) => a.id - b.id),
  };
}
