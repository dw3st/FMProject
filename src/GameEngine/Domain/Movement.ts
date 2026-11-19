/**
 * Movement rules of the engine rebuild, stage 4 (`.claude/rules/game-engine/movement.md`). Pure: no dice, no state
 * writes. `gameState.ts` executes, the dice live in `ActionOutcomes.ts`, constants in `MovementConfig.ts`.
 */
import type { BackLineMode, BackLineState, GamePlayer } from '@/GameEngine/types';
import { MOVEMENT as M, YD_PER_M, YDS_PER_MPH } from '@/GameEngine/Configs/MovementConfig';
import { HOLDER_MIND } from '@/GameEngine/Configs/DecisionConfig';
import { DEFAULT_MENTAL } from '@/GameEngine/Domain/HolderMind';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import { clamp } from '@/Domain/math';

type Pt = { x: number; y: number };

// ── 1. Shot block geometry ─────────────────────────────────────────────────────

/**
 * The defender (not a keeper, not recovering) on the line from the shooter to (toX, toY) closest to the shooter, within
 * `SHOT_BLOCK_WIDTH` of it and in its first `SHOT_BLOCK_DEPTH` yards. `null` = the line is clear.
 */
export function shotBlocker(shooter: GamePlayer, toX: number, toY: number, players: readonly GamePlayer[]): { player: GamePlayer; perp: number; along: number } | null {
  const dx = toX - shooter.x, dy = toY - shooter.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  const ux = dx / len, uy = dy / len;
  let best: { player: GamePlayer; perp: number; along: number } | null = null;
  for (const p of players) {
    if (p.team === shooter.team || p.role === 'GK' || p.recoveryTime > 0) continue;
    const rx = p.x - shooter.x, ry = p.y - shooter.y;
    const along = rx * ux + ry * uy;
    if (along < 0.5 || along > Math.min(M.SHOT_BLOCK_DEPTH, len)) continue;
    const perp = Math.abs(rx * uy - ry * ux);
    if (perp > M.SHOT_BLOCK_WIDTH) continue;
    if (!best || along < best.along) best = { player: p, perp, along };
  }
  return best;
}

/** 0..1: how long a pass is between FM's short (9 m) and long (31 m) bands. */
export function passLengthFactor(yards: number): number {
  const m = yards / YD_PER_M;
  return clamp((m - 9) / (31 - 9), 0, 1);
}

// ── 2. The back line ───────────────────────────────────────────────────────────

/** Robust mean: each value clamped to ±clamp of the median, then averaged. NaN for an empty list. */
export function robustMean(xs: readonly number[], clampYd: number = M.LINE_CLAMP_M * YD_PER_M): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  let sum = 0;
  for (const x of xs) sum += clamp(x, median - clampYd, median + clampYd);
  return sum / xs.length;
}

/**
 * One tick of the line state machine. `wantedX` is the robust mean of the back-liners' own targets. While holding the
 * line stays put until the wanted rate (gap / reaction) passes LINE_MOVE_MPH; moving, it travels toward the wanted x at
 * up to LINE_MAX_MPH and holds again below LINE_HOLD_MPH (hysteresis). `attackDir` is the defending side's attack
 * direction: moving toward it is a step up.
 */
export function stepBackLine(prev: BackLineState | undefined, wantedX: number, attackDir: 1 | -1, dt: number): BackLineState {
  if (!prev || !Number.isFinite(prev.x)) return { x: wantedX, mode: 'hold' };
  const gap = wantedX - prev.x;
  const rateMph = Math.abs(gap) / M.LINE_REACTION_S / YDS_PER_MPH;
  let mode: BackLineMode = prev.mode;
  if (mode === 'hold' && rateMph > M.LINE_MOVE_MPH) mode = gap * attackDir > 0 ? 'step_up' : 'drop';
  else if (mode !== 'hold' && rateMph < M.LINE_HOLD_MPH) mode = 'hold';
  else if (mode !== 'hold') mode = gap * attackDir > 0 ? 'step_up' : 'drop';
  if (mode === 'hold') return { x: prev.x, mode };
  const maxStep = M.LINE_MAX_MPH * YDS_PER_MPH * dt;
  return { x: prev.x + clamp(gap, -maxStep, maxStep), mode };
}

/** A back-liner's target x blended with the line and the ball-relative depth. */
export function blendLineX(ownX: number, lineX: number, ballRelX: number): number {
  return M.LINE_OWN_W * ownX + M.LINE_LINE_W * lineX + M.LINE_BALL_W * ballRelX;
}

// ── 3. Second presser ──────────────────────────────────────────────────────────

/**
 * A teammate of `player` already on the holder: closer to him than `player`, within FIRST_PRESSER_YD, not recovering.
 */
export function firstPresserOf(player: GamePlayer, holder: GamePlayer, players: readonly GamePlayer[]): GamePlayer | null {
  const myD = Math.hypot(player.x - holder.x, player.y - holder.y);
  let best: GamePlayer | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.id === player.id || p.team !== player.team || p.role === 'GK' || p.recoveryTime > 0) continue;
    const d = Math.hypot(p.x - holder.x, p.y - holder.y);
    if (d <= M.FIRST_PRESSER_YD && d < myD && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/**
 * Where the second presser stands: STAND_OFF_YD from the holder on the line to his own goal centre, shifted
 * STAND_OFF_INSIDE_YD toward the middle of the pitch (cutting the inside route and the pass back inside).
 */
export function standOffPoint(defender: GamePlayer, holder: GamePlayer): Pt {
  const ownGoalX = defender.attackDir === 1 ? 0 : PITCH_LENGTH;
  const gx = ownGoalX - holder.x, gy = 37 - holder.y;
  const g = Math.hypot(gx, gy) || 1;
  const inside = Math.sign(37 - holder.y) * M.STAND_OFF_INSIDE_YD;
  return {
    x: clamp(holder.x + (gx / g) * M.STAND_OFF_YD, 0, PITCH_LENGTH),
    y: clamp(holder.y + (gy / g) * M.STAND_OFF_YD + inside, 0, PITCH_WIDTH),
  };
}

// ── 4. Support comes short ─────────────────────────────────────────────────────

/** The outfield defender / midfielder of the holder's team nearest to him within SUPPORT_RANGE_YD (`null` = none). */
export function shortSupportOf(holder: GamePlayer, players: readonly GamePlayer[], mainRoleOf: (p: GamePlayer) => string): GamePlayer | null {
  let best: GamePlayer | null = null;
  let bestD = M.SUPPORT_RANGE_YD;
  for (const p of players) {
    if (p.id === holder.id || p.team !== holder.team || p.role === 'GK') continue;
    const main = mainRoleOf(p);
    if (main !== 'Defender' && main !== 'Midfielder') continue;
    const d = Math.hypot(p.x - holder.x, p.y - holder.y);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** Support anchor: SUPPORT_SHORT_YD from the holder toward the supporter, never ahead of the holder. */
export function shortSupportAnchor(supporter: GamePlayer, holder: GamePlayer): Pt {
  let dx = supporter.x - holder.x, dy = supporter.y - holder.y;
  if (dx * holder.attackDir > 0) dx = 0;
  const d = Math.hypot(dx, dy) || 1;
  return {
    x: clamp(holder.x + (dx / d) * M.SUPPORT_SHORT_YD, 1, PITCH_LENGTH - 1),
    y: clamp(holder.y + (dy / d) * M.SUPPORT_SHORT_YD, 1, PITCH_WIDTH - 1),
  };
}

// ── 5. Anticipation ────────────────────────────────────────────────────────────

/** Anticipation on the world scale 0..1 (1 = the world's top, `HOLDER_MIND.MENTAL_TOP`). */
export function anticipationScale(player: GamePlayer): number {
  const a = player.mental?.anticipation ?? DEFAULT_MENTAL.anticipation;
  return clamp(a / HOLDER_MIND.MENTAL_TOP, 0, 1);
}

/** Seconds of play a player reads ahead. */
export function anticipationLookahead(player: GamePlayer): number {
  return M.ANTICIPATION_BASE_S + M.ANTICIPATION_SPAN_S * anticipationScale(player);
}

/** Where `p` will be `seconds` from now on his current velocity (his position without one). */
export function predictedPoint(p: GamePlayer, seconds: number): Pt {
  const v = p.vel;
  if (!v || seconds <= 0) return { x: p.x, y: p.y };
  return { x: clamp(p.x + v.x * seconds, 0, PITCH_LENGTH), y: clamp(p.y + v.y * seconds, 0, PITCH_WIDTH) };
}

/** × on an interception chance by anticipation (1 at the world mean). */
export function anticipationInterceptMult(player: GamePlayer): number {
  const a = player.mental?.anticipation ?? DEFAULT_MENTAL.anticipation;
  return clamp(1 + M.ANTICIPATION_INTERCEPT * (a - M.ANTICIPATION_MEAN), 0.6, 1.5);
}
