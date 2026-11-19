/**
 * Seeded random numbers of the match engine (engine rebuild stage 0). Every draw of a match (outcomes, decisions,
 * fouls, VAR, injuries, set pieces, stoppage time, pre-match buffs) goes through `matchRandom()`, never
 * `Math.random`, so the same match with the same seed plays the same way.
 *
 * The generator is mulberry32; its whole state is one uint32, kept on `GameState.rng` (plain data, cloneable,
 * serialisable). `tickState` loads it at the start of a tick and writes the advanced value back into the state it
 * returns, so ticks of different matches can interleave in one thread. A draw made outside a tick (a `/test`
 * command, a substitution from the UI) reads the generator as the last tick left it: still deterministic, but not
 * saved into the state.
 *
 * `Math.random` is used in one place only: `newMatchSeed()`, the default seed when the caller gives none (so the
 * scripts that replace `Math.random` with a seeded one stay reproducible).
 */

let a = 0x9e3779b9 >>> 0;
let forced: (() => number) | null = null;

/** One uniform draw in [0, 1) from the match generator (mulberry32, same as `@/Domain/rng`). */
export function matchRandom(): number {
  if (forced) return forced();
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Puts the generator at `state` (a seed or a saved `GameState.rng`). */
export function loadMatchRng(state: number): void {
  a = state >>> 0;
}

/** The generator's current state (to store in `GameState.rng`). */
export function matchRngState(): number {
  return a;
}

/** A fresh seed when the caller gives none. */
export function newMatchSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Tests only: every draw returns `fn()` until called with `null`. */
export function forceMatchRandom(fn: (() => number) | null): void {
  forced = fn;
}
