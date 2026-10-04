import type { CardRecord } from "@/GameEngine/types";

/** What one player did in the live match, for the markers in the lineup list (#69). */
export interface PlayerMatchEvents {
  goals: number;
  assists: number;
  /** Yellow cards shown (a second yellow counts here too, alongside `red`). */
  yellows: number;
  red: boolean;
}

/**
 * Per-player markers from the live match: goals/assists from the match statistics, cards from
 * `GameState.cards`. Players with nothing to show are left out.
 */
export function playerMatchEvents(
  cards: readonly CardRecord[],
  stats: ReadonlyMap<number, { goals: number; assists: number }>,
): Map<number, PlayerMatchEvents> {
  const out = new Map<number, PlayerMatchEvents>();
  const entry = (id: number): PlayerMatchEvents => {
    let e = out.get(id);
    if (!e) {
      e = { goals: 0, assists: 0, yellows: 0, red: false };
      out.set(id, e);
    }
    return e;
  };
  for (const [id, s] of stats) {
    if (s.goals > 0) entry(id).goals = s.goals;
    if (s.assists > 0) entry(id).assists = s.assists;
  }
  for (const c of cards) {
    if (c.card === "yellow") entry(c.playerId).yellows++;
    else entry(c.playerId).red = true;
  }
  return out;
}
