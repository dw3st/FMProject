/**
 * Ball cluster (#145): how many players of a team are bunched around the ball, and how big a
 * hole the defending team leaves between the ball and its own goal. Pure — used by the
 * statistics (`ballCluster` event → `Statistics.ts`, `/lab`), the `/test` energy panel and
 * `scripts/ball-cluster.ts`.
 */
import type { GamePlayer, TeamId } from '@/GameEngine/types';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';

export const BALL_CLUSTER_CONFIG = {
  /** A player within this many yards of the ball counts as "near the ball". */
  NEAR_RADIUS: 8,
  /** Grid used for the hole: 12 columns along the pitch, 8 across. */
  GRID_X: 12,
  GRID_Y: 8,
  /** A grid cell with no defending outfield player within this radius counts as open. */
  OPEN_CELL_RADIUS: 15,
  /** Defenders near the ball from which the team counts as "crowding" the ball. */
  CROWD_COUNT: 3,
} as const;

/** Outfield players of `team` within `radius` yards of the ball. */
export function outfieldNearBall(
  players: readonly GamePlayer[],
  team: TeamId,
  ball: { x: number; y: number },
  radius: number = BALL_CLUSTER_CONFIG.NEAR_RADIUS,
): GamePlayer[] {
  return players.filter(p => p.team === team && p.role !== 'GK' && Math.hypot(p.x - ball.x, p.y - ball.y) <= radius);
}

export interface DefensiveHole {
  /** Largest distance (yards) from a grid cell between the ball and the own goal to the nearest defending outfield player. */
  maxGap: number;
  /** Grid cells between the ball and the own goal with no defending outfield player within OPEN_CELL_RADIUS. */
  openCells: number;
  /** Grid cells considered (between the ball and the own goal). */
  cells: number;
}

/**
 * The hole the defending team (`team`, attacking toward `attackDir`) leaves on its side of the
 * ball: grid cells whose centre is goal-side of the ball (between the ball's x and the own goal
 * line), measured to the nearest outfield defender.
 */
export function defensiveHole(
  players: readonly GamePlayer[],
  team: TeamId,
  ball: { x: number; y: number },
): DefensiveHole {
  const { GRID_X, GRID_Y, OPEN_CELL_RADIUS } = BALL_CLUSTER_CONFIG;
  const defenders = players.filter(p => p.team === team && p.role !== 'GK');
  const dir = defenders[0]?.attackDir ?? 1;
  const cw = PITCH_LENGTH / GRID_X;
  const ch = PITCH_WIDTH / GRID_Y;
  let maxGap = 0, openCells = 0, cells = 0;
  if (defenders.length === 0) return { maxGap: 0, openCells: 0, cells: 0 };
  for (let i = 0; i < GRID_X; i++) {
    const cx = (i + 0.5) * cw;
    // Own goal is at x = 0 when attacking +x: the goal side of the ball is x < ball.x.
    if (dir === 1 ? cx > ball.x : cx < ball.x) continue;
    for (let j = 0; j < GRID_Y; j++) {
      const cy = (j + 0.5) * ch;
      let best = Infinity;
      for (const d of defenders) {
        const dist = Math.hypot(d.x - cx, d.y - cy);
        if (dist < best) best = dist;
      }
      cells++;
      if (best > maxGap) maxGap = best;
      if (best > OPEN_CELL_RADIUS) openCells++;
    }
  }
  return { maxGap, openCells, cells };
}
