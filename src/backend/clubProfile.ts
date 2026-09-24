import { squadFileStemFromClubParam } from "@/backend/squadIdResolve";
import type { StandingLike } from "@/backend/squadIdResolve";
import { Player } from "@/Domain/Player";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { RosterPlayer } from "@/types/playerTypes";

/** File stem for /api/club-profile: accepts squadId or slug; null when unknown. */
export function clubProfileStem(standings: StandingLike[] | undefined, clubParam: string): string | null {
  return squadFileStemFromClubParam(standings, clubParam);
}

type OutfieldLine = "Defender" | "Midfielder" | "Forward";

/** Starting slots per line (4-3-3) — a line is rated on its best N, not the whole depth chart. */
const LINE_STARTERS: Record<OutfieldLine, number> = { Defender: 4, Midfielder: 3, Forward: 3 };

/**
 * Line rating shown in the new-game wizard: mean overall of the line's best starters × 10
 * (same 0–100 scale as a player's OVR). Averaging the whole squad let reserves and fill-in
 * youths drag every club down to ~30–50.
 */
export function clubLineRating(players: RosterPlayer[], line: OutfieldLine): number {
  const best = players
    .filter((p) => getMainRole(p.positions[0] ?? "CM") === line)
    .map((p) => Player.overallAvg(p))
    .sort((a, b) => b - a)
    .slice(0, LINE_STARTERS[line]);
  if (best.length === 0) return 0;
  return Math.round((best.reduce((s, v) => s + v, 0) / best.length) * 10);
}

/** Popularity (0–100, from followers — see aiClubFinance) at which each star level starts. */
const REPUTATION_STAR_FLOORS = [42, 52, 65, 80] as const;

/**
 * Reputation stars (1–5) from club popularity — fame, not squad strength. The old cut-offs on
 * the squad's mean attribute (5★ ≥ 7.5 … 2★ ≥ 5.2) sat above every club in the world (max ≈ 5),
 * so all clubs showed 1★. At world start: Real Madrid/Man City 5★, Flamengo 4★, median club 2★.
 */
export function reputationStars(popularity: number): number {
  return 1 + REPUTATION_STAR_FLOORS.filter((floor) => popularity >= floor).length;
}
