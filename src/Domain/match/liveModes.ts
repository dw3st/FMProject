/**
 * The two ways a live match plays (engine rebuild stage 19, `.claude/rules/game-engine/live-modes.md`), shared by the
 * solo page and the match between two managers on the server (stage 22): "full" = mode A, the 90 physical minutes sped
 * up (`MODE_A_SPEED` game-seconds per real second at 1×, ~7 real minutes); "highlights" = mode B, only the lances at
 * normal speed, the rest skipped.
 */
export type MatchPlayMode = "full" | "highlights";
export const MATCH_PLAY_MODES: readonly MatchPlayMode[] = ["full", "highlights"];
/** Game-seconds per real second at 1× in mode A: 5400 s of play in ~7 minutes. */
export const MODE_A_SPEED = 13;

export function isMatchPlayMode(v: unknown): v is MatchPlayMode {
  return v === "full" || v === "highlights";
}
