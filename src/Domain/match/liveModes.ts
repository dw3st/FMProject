/**
 * The two ways a live match plays (engine rebuild stage 19, `.claude/rules/game-engine/live-modes.md`), shared by the
 * solo page and the match between two managers on the server (stage 22): "full" = mode A, the 90 physical minutes sped
 * up (`MODE_A_SPEED` game-seconds per real second at 1×, ~14 real minutes); "highlights" = mode B, only the lances at
 * normal speed, the rest skipped.
 */
export type MatchPlayMode = "full" | "highlights";
export const MATCH_PLAY_MODES: readonly MatchPlayMode[] = ["full", "highlights"];
/** Game-seconds per real second at 1× in mode A: 5400 s of play in ~14 minutes (13 until 12.31: 7 minutes, user report: too fast to watch). */
export const MODE_A_SPEED = 6.5;
/**
 * What the speed tabs mean (12.31.2, user report: even 1× was too fast): every tab plays at this share of its label, in
 * both modes, solo and between two managers (1× now plays as the 0.5× of before; the whole match takes ~28 minutes).
 */
export const LIVE_SPEED_BASE = 0.5;

export function isMatchPlayMode(v: unknown): v is MatchPlayMode {
  return v === "full" || v === "highlights";
}

