/**
 * Crowd grid — Layer 1 of the spatial infrastructure.
 *
 * Discrete density grid over the pitch. Each player contributes a concentric
 * "footprint" centred on the 2×2 grid intersection nearest to their position:
 *
 *   • 2×2 core   → +SCORE_CORE   (4 cells)
 *   • 4×4 ring   → +SCORE_MID    (12 cells, 4×4 minus core)
 *   • 6×6 ring   → +SCORE_OUTER  (20 cells, 6×6 minus 4×4)
 *
 * The 2×2 core is anchored on the grid intersection closest to (x, y) — see
 * `getInfluenceAnchor` — so a player sitting near a cell boundary gets a
 * symmetrical heat blob rather than one biased to a single cell.
 *
 * Storage is team-agnostic (`teamA` / `teamB`). Consumers that care about
 * "attack vs defense" derive that from the ball holder via `attackingTeam(state)`.
 *
 * Pure module — no Pixi, React, or DOM imports. Safe to call from anywhere.
 */

import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import type { GameState, TeamId } from '@/GameEngine/types';

export const GRID_COLS = 64;
export const GRID_ROWS = 40;

/** Score added to each cell of the 2×2 core (centred on the player). */
export const SCORE_CORE  = 2;
/** Score added to each cell of the 4×4 ring around the core. */
export const SCORE_MID   = 1;
/** Score added to each cell of the 6×6 ring around the mid ring. */
export const SCORE_OUTER = 0.5;

/** @deprecated kept for any external reader — equals SCORE_CORE. */
export const SCORE_SELF = SCORE_CORE;
/** @deprecated kept for any external reader — equals SCORE_OUTER. */
export const SCORE_NEAR = SCORE_OUTER;

export const CELL_W = PITCH_LENGTH / GRID_COLS; // ~1.80 yd at 64 cols
export const CELL_H = PITCH_WIDTH / GRID_ROWS;  // ~1.85 yd at 40 rows

/** 2D matrix indexed as `grid[row][col]`. */
export type GridMatrix = number[][];

export interface CrowdGrid {
  /** Team A density (all roles). */
  teamA: GridMatrix;
  /** Team B density (all roles). */
  teamB: GridMatrix;
  /** Combined density: `teamA + teamB` cell-by-cell. */
  crowd: GridMatrix;
  /** Team A density excluding the goalkeeper — for "outfield path is clear" checks. */
  teamAOutfield: GridMatrix;
  /** Team B density excluding the goalkeeper — for "outfield path is clear" checks. */
  teamBOutfield: GridMatrix;
}

export function createMatrix(): GridMatrix {
  const m: GridMatrix = new Array(GRID_ROWS);
  for (let r = 0; r < GRID_ROWS; r++) m[r] = new Array<number>(GRID_COLS).fill(0);
  return m;
}

export function getCellIndex(x: number, y: number): { col: number; row: number } {
  const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / CELL_W)));
  const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / CELL_H)));
  return { col, row };
}

/**
 * Top-left corner of the 2×2 core for a player at (x, y). The core is
 * positioned so the grid intersection at the centre of the 2×2 sits as close
 * as possible to the player's actual position — keeps the heat blob
 * symmetrical regardless of where in a cell the player stands.
 *
 * Anchor cells are NOT clamped here — `applyInfluence` filters out-of-bounds
 * cells per-step, so partial footprints near the touchline still draw the
 * portion of the blob that falls inside the pitch.
 */
export function getInfluenceAnchor(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.round(x / CELL_W) - 1,
    row: Math.round(y / CELL_H) - 1,
  };
}

/**
 * Apply a player's concentric footprint to `grid`, anchored on the 2×2 whose
 * top-left cell is (anchorCol, anchorRow). Cells outside the grid are skipped.
 *
 * Layout:
 *   dr / dc ∈ [ 0,  1] → core   (+SCORE_CORE)
 *   dr / dc ∈ [-1,  2] → mid    (+SCORE_MID)   — minus the core square
 *   dr / dc ∈ [-2,  3] → outer  (+SCORE_OUTER) — minus the mid square
 */
export function applyInfluence(grid: GridMatrix, anchorCol: number, anchorRow: number): void {
  for (let dr = -2; dr <= 3; dr++) {
    for (let dc = -2; dc <= 3; dc++) {
      const r = anchorRow + dr;
      const c = anchorCol + dc;
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
      const inCore = dr >= 0 && dr <= 1 && dc >= 0 && dc <= 1;
      const inMid  = dr >= -1 && dr <= 2 && dc >= -1 && dc <= 2;
      const v = inCore ? SCORE_CORE : inMid ? SCORE_MID : SCORE_OUTER;
      grid[r]![c]! += v;
    }
  }
}

export function computeCrowdGrid(state: GameState): CrowdGrid {
  const teamA = createMatrix();
  const teamB = createMatrix();
  const teamAOutfield = createMatrix();
  const teamBOutfield = createMatrix();
  for (const p of state.players) {
    const { col, row } = getInfluenceAnchor(p.x, p.y);
    if (p.team === 'A') {
      applyInfluence(teamA, col, row);
      if (p.role !== 'GK') applyInfluence(teamAOutfield, col, row);
    } else {
      applyInfluence(teamB, col, row);
      if (p.role !== 'GK') applyInfluence(teamBOutfield, col, row);
    }
  }
  const crowd = createMatrix();
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      crowd[r]![c] = teamA[r]![c]! + teamB[r]![c]!;
    }
  }
  return { teamA, teamB, crowd, teamAOutfield, teamBOutfield };
}

/**
 * Sum density inside a `(2·radius + 1)²` cell window around (x, y).
 *
 * One player contributes ≈ 17 to a 3×3 sample taken at their own position
 * (8 from the 2×2 core overlapped + ~9 from mid ring). So `sampleCellSum / 17`
 * approximates the count of nearby players regardless of subcell offset.
 */
export function sampleCellSum(grid: GridMatrix, x: number, y: number, radius = 1): number {
  const { col, row } = getCellIndex(x, y);
  let total = 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
      total += grid[r]![c]!;
    }
  }
  return total;
}

/** Approximate "single player contribution" to a 3×3 sample — see sampleCellSum. */
export const SAMPLE_PER_PLAYER_3x3 = 17;

/**
 * Exact contribution that a player at (selfX, selfY) makes to a `(2·radius+1)²`
 * cell window centred on (sampleX, sampleY). Computed by intersecting the
 * sample window with the player's 6×6 concentric footprint — cells outside
 * the footprint contribute 0; otherwise they contribute the matching ring
 * score (CORE / MID / OUTER).
 *
 * Use when a player is sampling a grid they themselves contribute to (own
 * teammate density, own pressing load) — subtracting this value gives the
 * "everyone else" density. O(radius²) per call.
 */
export function selfFootprintContribution(
  sampleX: number, sampleY: number,
  selfX:   number, selfY:   number,
  radius = 1,
): number {
  const { col: sCol, row: sRow } = getCellIndex(sampleX, sampleY);
  const { col: aCol, row: aRow } = getInfluenceAnchor(selfX, selfY);
  let total = 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = sRow + dr;
      const c = sCol + dc;
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
      const drP = r - aRow;
      const dcP = c - aCol;
      // Outside the 6×6 footprint → no contribution at this cell.
      if (drP < -2 || drP > 3 || dcP < -2 || dcP > 3) continue;
      const inCore = drP >= 0 && drP <= 1 && dcP >= 0 && dcP <= 1;
      const inMid  = drP >= -1 && drP <= 2 && dcP >= -1 && dcP <= 2;
      total += inCore ? SCORE_CORE : inMid ? SCORE_MID : SCORE_OUTER;
    }
  }
  return total;
}

/**
 * Like `sampleCellSum` but subtracts the contribution of the player at
 * (selfX, selfY). The result is clamped at 0 to guard against rounding.
 *
 * Use when a player is evaluating grid density for itself (e.g. an off-ball
 * runner sampling teammate density to decide where to move) so the player's
 * own footprint doesn't inflate the "crowding" signal.
 */
export function sampleCellSumExcluding(
  grid:    GridMatrix,
  sampleX: number, sampleY: number,
  selfX:   number, selfY:   number,
  radius = 1,
): number {
  const sum  = sampleCellSum(grid, sampleX, sampleY, radius);
  const self = selfFootprintContribution(sampleX, sampleY, selfX, selfY, radius);
  return Math.max(0, sum - self);
}

export function maxValue(grid: GridMatrix): number {
  let max = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const v = grid[r]![c]!;
      if (v > max) max = v;
    }
  }
  return max;
}

/**
 * Team currently holding the ball, or `null` if the holder cannot be resolved.
 * Consumers use this to label `teamA` / `teamB` matrices as attack / defense.
 */
export function attackingTeam(state: GameState): TeamId | null {
  return state.players.find(p => p.id === state.ballHolderId)?.team ?? null;
}
