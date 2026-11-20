/**
 * Possession of the live match: game-seconds with the ball per team, read on every simulated state (the match screen,
 * the highlights worker of stage 19, which hands its totals over at each jump).
 */
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import type { GameState } from "@/GameEngine/types";

export interface PossessionAcc { A: number; B: number; lastTime: number; lastPhase: string }

export function createPossessionAcc(gs?: Pick<GameState, "matchTime" | "matchPhase">): PossessionAcc {
  return { A: 0, B: 0, lastTime: gs?.matchTime ?? 0, lastPhase: gs?.matchPhase ?? "" };
}

/** Possession: game-seconds with the ball per team, only while the ball is in play (read on every emission). */
export function accumulatePossession(
  acc: PossessionAcc,
  gs: GameState,
): void {
  const phase = gs.matchPhase ?? "";
  const dtGame = phase === acc.lastPhase ? gs.matchTime - acc.lastTime : 0;
  if (dtGame > 0 && isLivePhase(gs.matchPhase) && gs.ballHolderId != null) {
    const holder = gs.players.find((p) => p.id === gs.ballHolderId);
    if (holder) acc[holder.team] += dtGame;
  }
  acc.lastTime = gs.matchTime;
  acc.lastPhase = phase;
}

