import { squadFileStemFromClubParam } from "@/backend/squadIdResolve";
import type { StandingLike } from "@/backend/squadIdResolve";

/** File stem for /api/club-profile: accepts squadId or slug; null when unknown. */
export function clubProfileStem(standings: StandingLike[] | undefined, clubParam: string): string | null {
  return squadFileStemFromClubParam(standings, clubParam);
}
