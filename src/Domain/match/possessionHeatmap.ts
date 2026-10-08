/**
 * Possession heat map of the live match (Etapa 35, #108): where the ball was while each team had it.
 *
 * Drawing only — sampled from the states the pitch already emits, never read by the engine. Samples are
 * stored in a fixed frame where team A (the user) attacks towards +x, undoing the half-time side switch;
 * the screen mirrors on x when the user plays away (`mirrorX`, #98), like the pitch.
 *
 * Fixed arrays: the whole match plus a ring of `WINDOW_MINUTES` one-minute buckets of PLAYED time (a clock
 * of its own: the displayed minute repeats after half-time stoppage, this one never goes back).
 */
import type { GameState, TeamId } from "@/GameEngine/types";
import { getBallPos, isLivePhase } from "@/GameEngine/Domain/gameState";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

export const HEATMAP_COLS = 12;
export const HEATMAP_ROWS = 8;
export const HEATMAP_CELLS = HEATMAP_COLS * HEATMAP_ROWS;
export const WINDOW_MINUTES = 10;
const BUCKET_SECONDS = 60;
/** One emission never weighs more than this (a long hidden-tab pulse, a resumed match). */
const MAX_SAMPLE_SECONDS = 30;

export type HeatmapWindow = "recent" | "all";

export interface PossessionHeatmap {
  total: Record<TeamId, Float64Array>;
  /** `ring[team][slot]` = the cells of played minute `ringMinute[slot]`. */
  ring: Record<TeamId, Float64Array[]>;
  ringMinute: Int32Array;
  /** Live game-seconds played (continuous across periods). */
  played: number;
  lastTime: number;
  lastPhase: string;
}

function ringOf(): Float64Array[] {
  return Array.from({ length: WINDOW_MINUTES }, () => new Float64Array(HEATMAP_CELLS));
}

export function createPossessionHeatmap(): PossessionHeatmap {
  return {
    total: { A: new Float64Array(HEATMAP_CELLS), B: new Float64Array(HEATMAP_CELLS) },
    ring: { A: ringOf(), B: ringOf() },
    ringMinute: new Int32Array(WINDOW_MINUTES).fill(-1),
    played: 0,
    lastTime: 0,
    lastPhase: "",
  };
}

/** Grid cell of a point already in the A-attacks-right frame. */
export function cellOf(x: number, y: number): number {
  const col = Math.min(HEATMAP_COLS - 1, Math.max(0, Math.floor((x / PITCH_LENGTH) * HEATMAP_COLS)));
  const row = Math.min(HEATMAP_ROWS - 1, Math.max(0, Math.floor((y / PITCH_WIDTH) * HEATMAP_ROWS)));
  return row * HEATMAP_COLS + col;
}

/** Adds `seconds` of possession of `team` at the point (x, y), already in the A-attacks-right frame. */
export function addSample(acc: PossessionHeatmap, team: TeamId, x: number, y: number, seconds: number): void {
  if (!(seconds > 0)) return;
  const cell = cellOf(x, y);
  const minute = Math.floor(acc.played / BUCKET_SECONDS);
  const slot = minute % WINDOW_MINUTES;
  if (acc.ringMinute[slot] !== minute) {
    acc.ringMinute[slot] = minute;
    acc.ring.A[slot]!.fill(0);
    acc.ring.B[slot]!.fill(0);
  }
  acc.total[team][cell]! += seconds;
  acc.ring[team][slot]![cell]! += seconds;
  acc.played += seconds;
}

/** The team in possession: the holder, or the passer while a pass is in the air; null otherwise. */
export function possessingTeam(gs: GameState): TeamId | null {
  const id = gs.ballHolderId ?? gs.pass?.fromId ?? null;
  if (id == null) return null;
  return gs.players.find((p) => p.id === id)?.team ?? null;
}

/** Reads one emitted state: live phases only, weighted by the game-seconds since the previous emission. */
export function samplePossessionHeatmap(acc: PossessionHeatmap, gs: GameState): void {
  const phase = gs.matchPhase ?? "";
  const dt = phase === acc.lastPhase ? gs.matchTime - acc.lastTime : 0;
  acc.lastTime = gs.matchTime;
  acc.lastPhase = phase;
  if (!(dt > 0) || !isLivePhase(gs.matchPhase)) return;
  const team = possessingTeam(gs);
  if (!team) return;
  const dirA = gs.players.find((p) => p.team === "A")?.attackDir ?? 1;
  const ball = getBallPos(gs);
  const x = dirA === 1 ? ball.x : PITCH_LENGTH - ball.x;
  addSample(acc, team, x, ball.y, Math.min(dt, MAX_SAMPLE_SECONDS));
}

/** The cells of `team` in the window: whole match, or the last `WINDOW_MINUTES` played minutes (current one included). */
export function heatmapCells(acc: PossessionHeatmap, team: TeamId, window: HeatmapWindow): Float64Array {
  if (window === "all") return acc.total[team].slice();
  const out = new Float64Array(HEATMAP_CELLS);
  const current = Math.floor(acc.played / BUCKET_SECONDS);
  for (let slot = 0; slot < WINDOW_MINUTES; slot++) {
    const m = acc.ringMinute[slot]!;
    if (m < 0 || m <= current - WINDOW_MINUTES) continue;
    const cells = acc.ring[team][slot]!;
    for (let i = 0; i < HEATMAP_CELLS; i++) out[i]! += cells[i]!;
  }
  return out;
}

/** Display cell (col, row) of a stored cell; `mirror` = the user plays away (pitch drawn flipped on x). */
export function displayColRow(cell: number, mirror: boolean): { col: number; row: number } {
  const col = cell % HEATMAP_COLS;
  const row = Math.floor(cell / HEATMAP_COLS);
  return { col: mirror ? HEATMAP_COLS - 1 - col : col, row };
}

/** Drawn attacking direction of `team` (+1 = right). Stored frame: A right, B left; mirrored when away. */
export function displayAttackDir(team: TeamId, mirror: boolean): 1 | -1 {
  const stored = team === "A" ? 1 : -1;
  return (mirror ? -stored : stored) as 1 | -1;
}

export interface HeatmapSnapshot {
  total: Record<TeamId, number[]>;
  ring: Record<TeamId, number[][]>;
  ringMinute: number[];
  played: number;
}

export function exportPossessionHeatmap(acc: PossessionHeatmap): HeatmapSnapshot {
  return {
    total: { A: Array.from(acc.total.A), B: Array.from(acc.total.B) },
    ring: { A: acc.ring.A.map((c) => Array.from(c)), B: acc.ring.B.map((c) => Array.from(c)) },
    ringMinute: Array.from(acc.ringMinute),
    played: acc.played,
  };
}

/** Rebuilds an accumulator from a snapshot; a malformed snapshot gives an empty one. */
export function importPossessionHeatmap(snap: unknown, gs: Pick<GameState, "matchTime" | "matchPhase">): PossessionHeatmap {
  const acc = createPossessionHeatmap();
  acc.lastTime = gs.matchTime;
  acc.lastPhase = gs.matchPhase ?? "";
  const s = snap as Partial<HeatmapSnapshot> | null | undefined;
  const okCells = (v: unknown): v is number[] => Array.isArray(v) && v.length === HEATMAP_CELLS && v.every((n) => typeof n === "number");
  if (!s || !s.total || !s.ring || !Array.isArray(s.ringMinute) || s.ringMinute.length !== WINDOW_MINUTES || typeof s.played !== "number") return acc;
  for (const team of ["A", "B"] as const) {
    if (!okCells(s.total[team]) || !Array.isArray(s.ring[team]) || s.ring[team].length !== WINDOW_MINUTES || !s.ring[team].every(okCells)) {
      const empty = createPossessionHeatmap();
      empty.lastTime = acc.lastTime;
      empty.lastPhase = acc.lastPhase;
      return empty;
    }
    acc.total[team].set(s.total[team]);
    s.ring[team].forEach((c, i) => acc.ring[team][i]!.set(c));
  }
  acc.ringMinute.set(s.ringMinute);
  acc.played = s.played;
  return acc;
}
