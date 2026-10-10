/**
 * Which fixtures have VAR (`.claude/rules/game/var.md` §3, user decision 2026-10-10): the top division of the 10
 * main-league countries (the leagues of `scripts/faces/wikidata.ts` `LEAGUES`), the 4 continental competitions and
 * the national cups of those countries from the quarter-finals on. Youth competitions never.
 */
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import type { CupStageName } from "@/types/calendarTypes";

/** Top divisions with VAR (league slug → country of the cup). */
export const VAR_LEAGUES: Readonly<Record<string, string>> = {
  premier_league: "England",
  la_liga: "Spain",
  bundesliga: "Germany",
  serie_a: "Italy",
  ligue_1: "France",
  brazil_serie_a: "Brazil",
  of_portuguese_primeira_liga: "Portugal",
  of_eredivisie: "Netherlands",
  of_argentine_premier_division: "Argentina",
  of_major_league_soccer: "USA",
};

const VAR_CUPS = new Set(Object.values(VAR_LEAGUES).map(cupSlugOf));
const VAR_CUP_STAGES: ReadonlySet<CupStageName> = new Set(["qf", "sf", "final"]);

export interface VarFixture {
  competition: string;
  /** Stage of a national cup tie (`meta.cup.stages`), when the competition is a cup. */
  cupStage?: CupStageName | null;
}

export function hasVar(f: VarFixture): boolean {
  if (isContinentalSlug(f.competition)) return true;
  if (isCupSlug(f.competition)) return VAR_CUPS.has(f.competition) && !!f.cupStage && VAR_CUP_STAGES.has(f.cupStage);
  return f.competition in VAR_LEAGUES;
}
