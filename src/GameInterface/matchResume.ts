/**
 * Resume a live match after a page reload (#64).
 *
 * MatchScreen keeps the whole match in memory: the engine `GameState` (plain data), plus the
 * Statistics / PlayerRating counters that live in module-level Maps fed by gameBus listeners
 * (outside `GameState`). A reload used to throw all of that away and restart the match at 0–0.
 *
 * MatchScreen now writes a snapshot of everything needed to rebuild the screen into
 * `localStorage` every few seconds (and on `pagehide` / `visibilitychange` / `beforeunload`).
 * On load it restores the snapshot when it belongs to the same match (save + date + fixture),
 * otherwise it starts fresh and drops the stale snapshot. The snapshot is cleared once the match
 * is recorded, and whenever the day advances by any other route.
 *
 * Pure apart from the injectable `Storage`; the engine is unseeded, so a resumed match simply
 * continues from the saved state (no determinism needed).
 */
import type { GameState } from "@/GameEngine/types";
import type { StatsSnapshot } from "@/GameEngine/Domain/Statistics";
import type { Mentality, TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";
import type { MatchFeedItem } from "@/GameInterface/MatchSummaryPanel";

export const MATCH_SNAPSHOT_STORAGE_KEY = "fmproject:matchSnapshot";
export const MATCH_SNAPSHOT_VERSION = 1;
/** Hard cap on the serialized snapshot (UTF-16 chars ≈ 2 bytes each in most browsers). */
export const MAX_SNAPSHOT_CHARS = 1_500_000;
/** Real-time interval between periodic snapshots. */
export const SNAPSHOT_INTERVAL_MS = 2000;

type SnapshotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** One team's tactics as applied to the engine config (re-applied before resuming). */
export interface TeamTacticsSnapshot {
  style: TacticalStyle;
  mentality: Mentality;
  axesOverride?: TacticsSave["axesOverride"];
  familiarity?: FamiliarityLevels;
}

export interface MatchSnapshot {
  version: number;
  /** `matchKey(saveId, fixture)` — a snapshot is only ever restored into the same match. */
  key: string;
  savedAt: number;
  state: GameState;
  stats: StatsSnapshot;
  ratings: Array<[number, number]>;
  tactics: { A: TeamTacticsSnapshot; B: TeamTacticsSnapshot };
  ui: {
    gameSpeed: number;
    /** Goals / penalties / offsides feed (cards, subs and injuries come from `state`). */
    eventFeed: MatchFeedItem[];
    /** Game-seconds of possession per team. */
    possession: { A: number; B: number };
  };
}

/** Identity of a live match: save + match date + fixture. */
export function matchKey(saveId: string, fixture: { id: string; date: string }): string {
  return `${saveId}|${fixture.date}|${fixture.id}`;
}

function defaultStorage(): SnapshotStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Snapshot → JSON. Drops debug/perf caches that are rebuilt on the next tick. */
export function serializeMatchSnapshot(snap: MatchSnapshot): string {
  const state: GameState = { ...snap.state, throughBallCellsCache: null };
  return JSON.stringify({ ...snap, state });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON → snapshot, or `null` when the text is not a usable snapshot of this version. */
export function deserializeMatchSnapshot(raw: string | null): MatchSnapshot | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(v) || v.version !== MATCH_SNAPSHOT_VERSION || typeof v.key !== "string") return null;
  const state = v.state;
  if (!isObject(state) || !Array.isArray(state.players) || typeof state.matchPhase !== "string"
    || typeof state.matchTime !== "number" || !isObject(state.score)) return null;
  const stats = v.stats;
  if (!isObject(stats) || !Array.isArray(stats.players) || !Array.isArray(stats.teams)
    || !Array.isArray(stats.endEnergy) || !isObject(stats.teamFlags)) return null;
  if (!Array.isArray(v.ratings) || !isObject(v.tactics) || !isObject(v.ui)) return null;
  const ui = v.ui;
  if (!Array.isArray(ui.eventFeed) || !isObject(ui.possession)) return null;
  return v as unknown as MatchSnapshot;
}

/** Writes the snapshot. Never throws; `false` when it couldn't be stored (too big, quota, …). */
export function saveMatchSnapshot(snap: MatchSnapshot, storage: SnapshotStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    const raw = serializeMatchSnapshot(snap);
    if (raw.length > MAX_SNAPSHOT_CHARS) return false;
    storage.setItem(MATCH_SNAPSHOT_STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * The stored snapshot for `key`, or `null`. A snapshot of another match (another save, an earlier
 * day, another fixture), an unreadable one or a finished-and-recorded one is removed on the way.
 */
export function loadMatchSnapshot(key: string, storage: SnapshotStorage | null = defaultStorage()): MatchSnapshot | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(MATCH_SNAPSHOT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  const snap = deserializeMatchSnapshot(raw);
  if (!snap || snap.key !== key) {
    clearMatchSnapshot(storage);
    return null;
  }
  return snap;
}

/** Drops any stored snapshot (match recorded, abandoned, or the day advanced). Never throws. */
export function clearMatchSnapshot(storage: SnapshotStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(MATCH_SNAPSHOT_STORAGE_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
