import { addDays } from "@/Domain/dates";
import { matchesCountryQuery } from "@/Domain/world/labels";
import type { BetGame } from "@/types/betTypes";

/** Which games the list shows. `mine` = his league, cup and continental; a slug = that competition. */
export type BetScope = "mine" | "all" | string;
/** Games are open from tomorrow (bets close the day before): tomorrow, the next three days or the whole week. */
export type BetDays = "tomorrow" | "three" | "week";

export interface BetFilter {
  query: string;
  scope: BetScope;
  days: BetDays;
  /** The world's date. */
  today: string;
  mine: readonly string[];
}

export interface BetGameGroup {
  competition: string;
  days: { date: string; games: BetGame[] }[];
  count: number;
}

const LAST_DAY: Record<BetDays, number> = { tomorrow: 1, three: 3, week: 7 };

/** A club name search looks at every competition: the point is finding the game wherever it is. */
export function filterBetGames(games: readonly BetGame[], f: BetFilter): BetGame[] {
  const last = addDays(f.today, LAST_DAY[f.days]);
  const q = f.query.trim();
  return games.filter((g) => {
    if (g.date > last) return false;
    if (q) return matchesCountryQuery(q, [g.homeName, g.awayName]);
    if (f.scope === "mine") return f.mine.includes(g.competition);
    if (f.scope === "all") return true;
    return g.competition === f.scope;
  });
}

/**
 * By competition, then by day, then by kickoff. Competitions in `order` (his own first) come first, the rest by
 * how many games they have, then by slug.
 */
export function groupBetGames(games: readonly BetGame[], order: readonly string[] = []): BetGameGroup[] {
  const by = new Map<string, BetGame[]>();
  for (const g of games) {
    const list = by.get(g.competition) ?? [];
    list.push(g);
    by.set(g.competition, list);
  }
  const rank = (slug: string) => { const i = order.indexOf(slug); return i < 0 ? order.length : i; };
  return [...by.entries()]
    .sort(([a, ga], [b, gb]) => rank(a) - rank(b) || gb.length - ga.length || a.localeCompare(b))
    .map(([competition, list]) => {
      const days = new Map<string, BetGame[]>();
      for (const g of [...list].sort((x, y) => x.date.localeCompare(y.date) || (x.kickoff ?? "").localeCompare(y.kickoff ?? "") || x.homeName.localeCompare(y.homeName))) {
        days.set(g.date, [...(days.get(g.date) ?? []), g]);
      }
      return { competition, days: [...days.entries()].map(([date, g]) => ({ date, games: g })), count: list.length };
    });
}

/** The competitions that have games in the window, with how many, most games first (the competition selector). */
export function betCompetitions(games: readonly BetGame[]): { competition: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.competition, (counts.get(g.competition) ?? 0) + 1);
  return [...counts.entries()].map(([competition, count]) => ({ competition, count })).sort((a, b) => b.count - a.count || a.competition.localeCompare(b.competition));
}
