/**
 * The xG of a shot in the engine (stage 6, `.claude/rules/game-engine/xg.md`). With `DECISION_FLAGS.FM_XG` on it is the
 * FM logistic model (`FmXg.ts`) over the pitch geometry; off, the old hand-made `computeXG` (distance, angle, pressure).
 * The same number is the shot's statistic, the shot score of the decision and the resolution's input.
 */
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import { XG_CONFIG } from '@/GameEngine/Configs/XgConfig';
import { AERIAL_CONFIG } from '@/GameEngine/Configs/AerialConfig';
import { computeOpenAngle, computeWeightedPressure, computeXG } from '@/GameEngine/Infrastructure/ActionOutcomes';
import { fmShotXG, type FmShotKind, type FmXgResult } from '@/GameEngine/Domain/FmXg';
import { facingAngleDeg } from '@/GameEngine/Domain/HolderMoves';
import { PITCH_LENGTH } from '@/GameEngine/Domain/pitch';
import type { GamePlayer } from '@/GameEngine/types';

export interface EngineShotXg {
  xg: number;
  /** The FM model's breakdown (flag on). */
  fm: FmXgResult | null;
}

export interface ShotXgOptions {
  /** Ball height at contact (m). Until the 3D ball (stage 3) a ground shot is 0 and a header XG_CONFIG.HEADER_HEIGHT_M. */
  ballHeightM?: number;
  /** Old model only: pressure × this (a header's defender just lost the duel). */
  pressureMult?: number;
}

/**
 * xG of `shooter` shooting from (x, y) (his own position by default) with everyone in `players` on the pitch.
 * `kind`: ground (volley when the ball is high), header, free kick, penalty.
 */
export function shotXg(
  shooter: GamePlayer, players: readonly GamePlayer[], kind: FmShotKind,
  at: { x: number; y: number } = shooter, opts: ShotXgOptions = {},
): EngineShotXg {
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  if (!DECISION_FLAGS.FM_XG) {
    if (kind === 'penalty') return { xg: XG_PENALTY, fm: null };
    const opponents = players.filter(p => p.team !== shooter.team) as GamePlayer[];
    const pressure = computeWeightedPressure({ ...shooter, x: at.x, y: at.y }, opponents) * (opts.pressureMult ?? 1);
    const base = computeXG(Math.abs(goalX - at.x), computeOpenAngle(at.x, at.y, goalX), pressure);
    return { xg: kind === 'header' ? base * AERIAL_CONFIG.HEADER_XG_MULT : base, fm: null };
  }
  const others = [];
  for (const p of players) if (p.id !== shooter.id) others.push({ x: p.x, y: p.y, keeper: p.role === 'GK' });
  const ballHeightM = opts.ballHeightM ?? (kind === 'header' ? XG_CONFIG.HEADER_HEIGHT_M : 0);
  const facingDeg = kind === 'header' || kind === 'penalty' ? null : facingAngleDeg({ ...shooter, x: at.x, y: at.y });
  const fm = fmShotXG({ x: at.x, y: at.y, attackDir: shooter.attackDir, others, facingDeg, ballHeightM, kind });
  return { xg: fm.xg, fm };
}

/** The penalty model's value (intercept only). */
export const XG_PENALTY = 1 / (1 + Math.exp(-1.5629492));
