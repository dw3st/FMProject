/**
 * The director's Monday (spec `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`
 * §1): with the director in charge of contracts, he decides once per player and season on the human
 * club's contracts about to end and renews the ones he keeps. The decision itself is pure
 * (`src/Domain/responsibilities/director.ts`); this is the I/O around it.
 */
import type { SaveService } from "@/backend/SaveService";
import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";
import { defaultSeasonEnd } from "@/Domain/contracts/contracts";
import type { PlayerNews } from "@/Domain/morale/morale";
import { directorDecisions, type DirectorDecision, type DirectorOutcome } from "@/Domain/responsibilities/director";
import type { LeagueSeasonState } from "@/types/calendarTypes";

/** The season a decision belongs to: the year of the club's league season. */
export function directorSeasonKey(league: Pick<LeagueSeasonState, "year"> | undefined, date: string): string {
  return league ? String(league.year) : date.slice(0, 4);
}

export async function applyDirectorDay(
  service: SaveService,
  saveId: string,
  args: {
    clubId: string;
    date: string;
    /** The human club's league season (after any rollover today). */
    league: LeagueSeasonState | undefined;
    decided: Record<string, DirectorDecision>;
  },
): Promise<{ outcomes: DirectorOutcome[]; news: PlayerNews[]; decided: Record<string, DirectorDecision> }> {
  const seasonKey = directorSeasonKey(args.league, args.date);
  // Only this season's decisions are kept (older ones belong to contracts already gone or renewed).
  const kept = Object.fromEntries(Object.entries(args.decided).filter(([, d]) => d.season === seasonKey));
  const squad = await service.getSquadById(saveId, args.clubId);
  if (!squad) return { outcomes: [], news: [], decided: kept };
  const r = directorDecisions({
    squad,
    date: args.date,
    seasonEnd: args.league?.end ?? defaultSeasonEnd(args.date),
    seasonKey,
    decided: kept,
    maxWageBudget: aiClubFinance(squad).maxWageBudget,
  });
  if (r.outcomes.some((o) => o.outcome === "renewed")) await service.saveSquadById(saveId, r.squad);
  return { outcomes: r.outcomes, news: r.news, decided: { ...kept, ...r.decided } };
}
