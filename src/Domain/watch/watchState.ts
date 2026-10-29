// Pure helpers of watching a friend's live match.
import type { H2HWireState } from "@/types/h2hTypes";
import type { WatchInfo, WatchTeam } from "@/types/watchTypes";
import type { LiveScoreView } from "@/types/rivalsTypes";

/** The relayed state with the benches of the previous one when it left them out (unchanged). */
export function withBenches(prev: H2HWireState | undefined, next: H2HWireState): H2HWireState {
  if (next.benchA && next.benchB) return next;
  return { ...next, benchA: next.benchA ?? prev?.benchA ?? [], benchB: next.benchB ?? prev?.benchB ?? [] };
}

/**
 * Who is who: in a solo match engine team A is always the friend's club; in a match between two managers the server
 * runs (`h2h`) A is the home side. The drawing is turned so the home side is on the left.
 */
export function watchInfoOf(
  live: LiveScoreView, kind: WatchInfo["kind"], club: WatchTeam, opponent: WatchTeam,
): WatchInfo {
  const friendIsA = kind === "solo" || live.home;
  return {
    seatId: live.seatId,
    nickname: live.nickname,
    live,
    teams: friendIsA ? { A: club, B: opponent } : { A: opponent, B: club },
    friendSide: friendIsA ? "A" : "B",
    mirror: kind === "solo" && !live.home,
    kind,
  };
}
