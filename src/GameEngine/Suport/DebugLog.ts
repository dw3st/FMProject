/**
 * DebugLog — central debug logging for the game engine.
 *
 * Usage anywhere in GameEngine or GraficsEngine:
 *   import { debugLog } from './DebugLog';
 *   debugLog('tackle', 'Silva attempts tackle on Ronaldo', { chance: 0.55 });
 *
 * Adding a new category:
 *   1. Add the string literal to DebugCategory
 *   2. Call debugLog() at the relevant point in the engine
 *   3. Document it in project-structure.md under "Debug log categories"
 */

export type DebugCategory =
  | 'decision'      // per-player AI decision changes
  | 'tackle'        // tackle attempts and outcomes
  | 'interception'  // pass interception attempts and outcomes
  | 'pass'          // pass start and completion
  | 'shot'          // shot attempts and outcomes (goal / save / miss)
  | 'possession'    // ball ownership changes
  | 'offside'       // offside violations
  | 'dribble'       // dribble attempt outcomes
  | 'throughBall';  // through-ball lifecycle (started, race, contested, won)

export interface DebugEntry {
  id:        number;
  time:      number; // Date.now()
  category:  DebugCategory;
  message:   string;
  playerId?: number;
  data?:     Record<string, unknown>;
}

const MAX_ENTRIES = 150; // ring buffer cap — oldest entries are dropped
let nextId       = 0;
let enabled      = false;
const log: DebugEntry[]                           = [];
const listeners  = new Set<(log: DebugEntry[]) => void>();

/** Enable or disable debug mode globally. Clears the log when turned off. */
export function setDebugMode(on: boolean): void {
  enabled = on;
  if (!on) { log.length = 0; nextId = 0; }
  notify();
}

/** Clear all log entries without changing debug mode. */
export function clearDebugLog(): void {
  log.length = 0;
  nextId = 0;
  notify();
}

export function isDebugEnabled(): boolean {
  return enabled;
}

/**
 * Append an entry to the debug log.
 * No-op when debug mode is off — zero cost in production paths.
 */
export function debugLog(
  category: DebugCategory,
  message: string,
  extra?: { playerId?: number; data?: Record<string, unknown> },
): void {
  if (!enabled) return;
  log.push({ id: nextId++, time: Date.now(), category, message, ...extra });
  if (log.length > MAX_ENTRIES) log.shift();
  notify();
}

/** Subscribe to log updates. Returns an unsubscribe function. */
export function onDebugLog(fn: (log: DebugEntry[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Snapshot of current log entries. */
export function getDebugLog(): DebugEntry[] {
  return [...log];
}

function notify(): void {
  const snapshot = [...log];
  listeners.forEach(fn => fn(snapshot));
}
