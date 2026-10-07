import type { TeamId } from "@/GameEngine/types";

/**
 * Home on the left (#98). In the engine the user's club is always team A; the live match and the
 * result screen show the home side on the left, like a TV broadcast. `awayView` is the single flag:
 * true when the user plays away in a fixture with a home side (a neutral venue keeps the user left).
 */
export function isAwayView(
  fixture: { home: string; away: string; neutral?: boolean } | null | undefined,
  mySquadId: string | null | undefined,
): boolean {
  if (!fixture || !mySquadId || fixture.neutral) return false;
  return fixture.away === mySquadId && fixture.home !== mySquadId;
}

/** Engine team shown on the left / right. */
export function displaySides(awayView: boolean): { left: TeamId; right: TeamId } {
  return awayView ? { left: "B", right: "A" } : { left: "A", right: "B" };
}

/** A per-team pair in display order: `A` = left, `B` = right. */
export function toDisplayPair<T>(pair: { A: T; B: T }, awayView: boolean): { A: T; B: T } {
  return awayView ? { A: pair.B, B: pair.A } : pair;
}

/** Display slot (A = left, B = right) of an engine team. Its own inverse. */
export function displayTeam(team: TeamId, awayView: boolean): TeamId {
  if (!awayView) return team;
  return team === "A" ? "B" : "A";
}
