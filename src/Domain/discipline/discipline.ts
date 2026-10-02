import type { RosterPlayer, PlayerSeasonLog } from "@/types/playerTypes";
import type { MatchCard } from "@/types/dayLogTypes";
import { isInjured } from "@/Domain/injury/injury";
import { DISCIPLINE } from "@/Domain/discipline/disciplineConfig";

/** True while the player still has a match ban to serve. */
export function isSuspended(player: Pick<RosterPlayer, "suspension">): boolean {
  return (player.suspension?.matches ?? 0) > 0;
}

/** Not selectable on `date`: injured or suspended. */
export function isUnavailable(player: Pick<RosterPlayer, "injury" | "suspension">, date: string): boolean {
  return isInjured(player, date) || isSuspended(player);
}

/**
 * Serves one match of a ban (the club played an official match the player could not play).
 * Removes `suspension` when it reaches 0. Same reference when there is nothing to serve.
 */
export function serveSuspension<P extends Pick<RosterPlayer, "suspension">>(player: P): P {
  if (!isSuspended(player)) return player;
  const left = player.suspension!.matches - 1;
  if (left > 0) return { ...player, suspension: { matches: left } };
  const { suspension: _drop, ...rest } = player;
  return rest as P;
}

/**
 * Matches banned for the cards this player got in one match, given the season's yellow count
 * BEFORE the match. Red = `RED_BAN_MATCHES`; crossing a multiple of `YELLOW_ACCUMULATION`
 * yellows = `YELLOW_BAN_MATCHES`. A second yellow is a yellow plus a red record: the yellow
 * counts toward the accumulation too (rarely both apply in the same match; they stack).
 */
export function banFromCards(yellowsBefore: number, cards: Pick<MatchCard, "card">[]): number {
  const yellows = cards.filter((c) => c.card === "yellow").length;
  const reds = cards.filter((c) => c.card === "red").length;
  const step = DISCIPLINE.YELLOW_ACCUMULATION;
  const crossed = Math.floor((yellowsBefore + yellows) / step) - Math.floor(yellowsBefore / step);
  return reds * DISCIPLINE.RED_BAN_MATCHES + crossed * DISCIPLINE.YELLOW_BAN_MATCHES;
}

/**
 * Books this match's cards into the season log and adds any new ban to `suspension`.
 * Returns the updated player/log and the matches newly banned (0 when none).
 */
export function applyMatchCards<P extends Pick<RosterPlayer, "suspension">>(
  player: P,
  log: PlayerSeasonLog,
  cards: Pick<MatchCard, "card">[],
): { player: P; log: PlayerSeasonLog; banned: number } {
  if (cards.length === 0) return { player, log, banned: 0 };
  const yellowsBefore = log.yellowCards ?? 0;
  const banned = banFromCards(yellowsBefore, cards);
  const nextLog: PlayerSeasonLog = {
    ...log,
    yellowCards: yellowsBefore + cards.filter((c) => c.card === "yellow").length,
    redCards: (log.redCards ?? 0) + cards.filter((c) => c.card === "red").length,
  };
  const next = banned > 0
    ? { ...player, suspension: { matches: (player.suspension?.matches ?? 0) + banned } }
    : player;
  return { player: next, log: nextLog, banned };
}
