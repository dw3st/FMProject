/**
 * Fouls — pure foul / card math (Etapa 12, `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §1, §3).
 *
 * No state, no events: `gameState.ts` reads the players involved, calls these and executes the
 * outcome (free kick / penalty restart, card, sending-off). Randomness is injected (`rng`) so the
 * card roll is testable; `foulChance` is a plain probability the caller rolls.
 */
import { FOUL_CONFIG as C } from '@/GameEngine/Configs/FoulConfig';
import type { RelativePosition } from '@/GameEngine/Domain/PositionalAwareness';
import { PITCH_LENGTH, GOAL_Y_MIN, GOAL_Y_MAX } from '@/GameEngine/Domain/pitch';

/** `tackle` = tackle attempt, `dribble` = 1v1 dribble duel, `duel` = contested loose ball, `aerial` = aerial duel. */
export type FoulKind = 'tackle' | 'dribble' | 'duel' | 'aerial';
export type CardColour = 'yellow' | 'red';

export interface FoulContext {
  kind: FoulKind;
  /** Offender's approach angle relative to the fouled player (`classifyPosition`). Duels use 'side'. */
  angle: RelativePosition;
  /** Offender team's `TACKLE_AGGRESSION` (pressing style), 0..1. */
  aggression: number;
  /** Offender's floorless tackling skill, 0..1 (`runtimeStats.withoutBall.tackling`). */
  tackling: number;
  /** Offender's current energy, 0..100. */
  energy: number;
  /** Offender is already on a yellow card. */
  onYellow: boolean;
  /** The challenge itself won the ball (a foul then overturns it). Always false for loose-ball duels. */
  tackleWon: boolean;
  /** The challenge happens inside the offender's own penalty area. */
  inOwnBox: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Probability that a resolved tackle / loose-ball duel is a foul. */
export function foulChance(ctx: FoulContext): number {
  const base     = ctx.kind === 'tackle' ? C.TACKLE_BASE
    : ctx.kind === 'dribble' ? C.DRIBBLE_BASE
    : ctx.kind === 'aerial' ? C.AERIAL_BASE
    : C.DUEL_BASE;
  const angle    = C.ANGLE_MULT[ctx.angle];
  const aggr     = Math.max(0, 1 + C.AGGRESSION_WEIGHT * (ctx.aggression - C.AGGRESSION_REF));
  const skill    = Math.max(0, 1 + C.LOW_TACKLING_WEIGHT * (0.5 - ctx.tackling));
  const tired    = 1 + C.LOW_ENERGY_WEIGHT * Math.max(0, (C.ENERGY_REF - ctx.energy) / C.ENERGY_REF);
  const yellow   = ctx.onYellow ? C.ON_YELLOW_MULT : 1;
  const won      = ctx.tackleWon ? C.TACKLE_WON_MULT : 1;
  const box      = ctx.inOwnBox ? C.IN_BOX_MULT : 1;
  return clamp(base * angle * aggr * skill * tired * yellow * won * box, 0, C.MAX_CHANCE);
}

export interface CardContext {
  angle: RelativePosition;
  /** The fouled player had a clear run on goal (`isClearChance`). */
  clearChance: boolean;
  /** Offender is already on a yellow card (a second yellow becomes a red — the caller handles that). */
  onYellow: boolean;
}

export interface CardRollResult {
  card: CardColour | 'none';
  yellowChance: number;
  redChance: number;
}

/** Card for a foul: straight red rolled first (one `rng()` draw), then yellow (a second draw). */
export function cardRoll(ctx: CardContext, rng: () => number = Math.random): CardRollResult {
  const behind = ctx.angle === 'behind';
  const yellowChance = clamp(
    C.YELLOW_BASE
      * (behind ? C.BEHIND_YELLOW_MULT : 1)
      * (ctx.clearChance ? C.CLEAR_CHANCE_YELLOW_MULT : 1)
      * (ctx.onYellow ? C.ON_YELLOW_YELLOW_MULT : 1),
    0, C.MAX_YELLOW,
  );
  const redChance = clamp(
    C.RED_BASE
      * (behind ? C.BEHIND_RED_MULT : 1)
      * (ctx.clearChance ? C.CLEAR_CHANCE_RED_MULT : 1)
      * (ctx.onYellow ? C.ON_YELLOW_RED_MULT : 1),
    0, C.MAX_RED,
  );
  if (rng() < redChance) return { card: 'red', yellowChance, redChance };
  if (rng() < yellowChance) return { card: 'yellow', yellowChance, redChance };
  return { card: 'none', yellowChance, redChance };
}

interface Pos { x: number; y: number }

/**
 * True when the fouled player was through on goal: within `CLEAR_CHANCE_MAX_DIST` of the goal he
 * attacks and no outfield opponent ahead of him inside a `CLEAR_CHANCE_CORRIDOR` corridor (the
 * goalkeeper never blocks it). `opponents` should exclude the offender.
 */
export function isClearChance(
  fouled: Pos & { attackDir: 1 | -1 },
  opponents: Array<Pos & { role: string }>,
): boolean {
  const goalX = fouled.attackDir === 1 ? PITCH_LENGTH : 0;
  const goalY = Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, fouled.y));
  if (Math.hypot(goalX - fouled.x, goalY - fouled.y) > C.CLEAR_CHANCE_MAX_DIST) return false;
  return !opponents.some(o =>
    o.role !== 'GK'
    && (o.x - fouled.x) * fouled.attackDir > 0
    && Math.abs(o.y - fouled.y) <= C.CLEAR_CHANCE_CORRIDOR,
  );
}
