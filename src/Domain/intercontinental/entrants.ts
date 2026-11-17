import type { IccConfed, IccEntrant } from "@/types/calendarTypes";
import { ICC_CONFEDS } from "@/Domain/intercontinental/iccConfig";

/** UEFA / CONMEBOL: the continental competition's final order (champion first, then the runner-up when known). */
export interface IccContinentalCandidate {
  confed:      "UEFA" | "CONMEBOL";
  competition: string;
  order:       string[];
}

/** AFC / CAF / CONCACAF / OFC: one tier-1 league of the confederation. */
export interface IccLeagueCandidate {
  confed:      Exclude<IccConfed, "UEFA" | "CONMEBOL">;
  league:      string;
  /** Mean club level of the league (the continental slot coefficient). */
  coefficient: number;
  /** Final table of its last closed season (squad ids, 1st first); null when no season closed yet. */
  table:       string[] | null;
}

const BYE: IccEntrant = { clubId: null, source: null };

/**
 * The six entrants. The two continental champions are picked first; each other confederation takes its strongest
 * tier-1 league (by coefficient) that has a closed season, and that league's champion. A club already in the cup
 * never takes a second slot (the next one in line does); nobody left = a bye.
 */
export function pickIccEntrants(args: {
  continental: IccContinentalCandidate[];
  leagues: IccLeagueCandidate[];
}): Record<IccConfed, IccEntrant> {
  const taken = new Set<string>();
  const out = {} as Record<IccConfed, IccEntrant>;
  const firstFree = (order: string[]): number => order.findIndex((id) => !taken.has(id));

  for (const confed of ICC_CONFEDS) {
    if (confed === "UEFA" || confed === "CONMEBOL") {
      const c = args.continental.find((x) => x.confed === confed);
      const i = c ? firstFree(c.order) : -1;
      if (!c || i < 0) { out[confed] = BYE; continue; }
      taken.add(c.order[i]!);
      out[confed] = { clubId: c.order[i]!, source: c.competition, position: i + 1 };
      continue;
    }
    const leagues = args.leagues
      .filter((l) => l.confed === confed && l.table && l.table.length > 0)
      .sort((a, b) => b.coefficient - a.coefficient || a.league.localeCompare(b.league));
    const league = leagues[0];
    const i = league ? firstFree(league.table!) : -1;
    if (!league || i < 0) { out[confed] = BYE; continue; }
    taken.add(league.table![i]!);
    out[confed] = { clubId: league.table![i]!, source: league.league, position: i + 1 };
  }
  return out;
}
