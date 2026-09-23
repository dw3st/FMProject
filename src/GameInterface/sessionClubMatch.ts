import type { Squad } from "@/types/playerTypes";
import type { GameSession } from "@/GameInterface/gameSession";

/** True when the route's `club` segment refers to the user's club (slug or numeric squad id). */
export function sessionMatchesClubRoute(
  session: GameSession,
  league: string,
  club: string,
  mySquad: Squad | null,
): boolean {
  if (league !== session.leagueSlug) return false;
  if (club === session.clubId) return true;
  if (mySquad && (club === mySquad.id || club === mySquad.slug)) return true;
  return false;
}
