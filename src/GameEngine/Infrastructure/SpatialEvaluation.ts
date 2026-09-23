/**
 * Spatial point evaluation — Layer 2 of the spatial infrastructure.
 *
 * Given a pitch coordinate `(x, y)` and a config, sum the weighted contributions
 * of nearby players using real (Euclidean) distances and a falloff curve.
 *
 * Storage is team-agnostic — `teamADensity` / `teamBDensity`. Consumers that
 * care about "attack vs defense" derive that from the ball holder.
 *
 * Pure module — no engine state mutation, no events.
 */

import type { GameState } from '@/GameEngine/types';

export type Falloff = 'linear' | 'exp';

export interface EvaluationConfig {
  /** Maximum distance (yards) for a player to contribute to the density sum. */
  radius: number;
  /** Falloff curve for the contribution weight. */
  falloff: Falloff;
  /** Include Team A players in `teamADensity`. */
  includeTeamA: boolean;
  /** Include Team B players in `teamBDensity`. */
  includeTeamB: boolean;
}

export interface EvaluationResult {
  /** Weighted Team A contribution sum (0 when `includeTeamA` is false). */
  teamADensity: number;
  /** Weighted Team B contribution sum (0 when `includeTeamB` is false). */
  teamBDensity: number;
  /** `teamADensity + teamBDensity`. */
  totalDensity: number;
  /** Distance to the nearest Team A player. `Infinity` if none on the pitch. */
  nearestTeamADist: number;
  /** Distance to the nearest Team B player. `Infinity` if none on the pitch. */
  nearestTeamBDist: number;
}

export const DEFAULT_RADIUS = 10;
export const DEFAULT_FALLOFF: Falloff = 'exp';

export const DEFAULT_EVAL_CONFIG: EvaluationConfig = {
  radius: DEFAULT_RADIUS,
  falloff: DEFAULT_FALLOFF,
  includeTeamA: true,
  includeTeamB: true,
};

/**
 * Weight of a player's contribution at distance `dist` from the evaluation point.
 * Returns 0 outside the radius.
 *
 * - `linear`: `max(0, 1 - dist / radius)` — straight ramp from 1 (at point) to 0 (at edge).
 * - `exp`:    `exp(-dist / (radius / 3))` — soft falloff; ≈ 0.05 at the radius edge.
 */
export function falloffWeight(dist: number, radius: number, falloff: Falloff): number {
  if (dist > radius) return 0;
  if (falloff === 'linear') return Math.max(0, 1 - dist / radius);
  const k = radius / 3;
  return Math.exp(-dist / k);
}

/**
 * Evaluate the density of players around a pitch point.
 *
 * Densities respect `includeTeamA`/`includeTeamB`. Nearest distances are always
 * reported across all players regardless of include flags — they're informational
 * and useful when tuning radius.
 */
export function evaluatePoint(
  state: GameState,
  x: number,
  y: number,
  config: EvaluationConfig,
): EvaluationResult {
  let teamADensity = 0;
  let teamBDensity = 0;
  let nearestTeamADist = Infinity;
  let nearestTeamBDist = Infinity;

  for (const p of state.players) {
    const dx = p.x - x;
    const dy = p.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (p.team === 'A') {
      if (dist < nearestTeamADist) nearestTeamADist = dist;
    } else {
      if (dist < nearestTeamBDist) nearestTeamBDist = dist;
    }

    if (dist > config.radius) continue;
    const w = falloffWeight(dist, config.radius, config.falloff);
    if (p.team === 'A' && config.includeTeamA) teamADensity += w;
    else if (p.team === 'B' && config.includeTeamB) teamBDensity += w;
  }

  return {
    teamADensity,
    teamBDensity,
    totalDensity: teamADensity + teamBDensity,
    nearestTeamADist,
    nearestTeamBDist,
  };
}
