import type { SaveMeta } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { getLeagueData, getPyramids, type LeagueDataEntry } from "@/backend/advanceDay";
import { topLeagueOf } from "@/backend/continentalWorld";
import { humanWindowStatus, isDeadlineRush, windowStatus, type SeasonDates, type WindowStatus } from "@/Domain/market/windows";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { Pyramids } from "@/types/pyramidTypes";

/**
 * Transfer windows of the save (`.claude/rules/game/transfer-windows.md`): every country's window
 * from the season dates of its tier-1 league in `meta.activeLeagues`. Nothing is stored; statuses
 * are cached per country for the date the context was built.
 */
export interface WindowContext {
  date: string;
  /** Country of a league (leagueData), "" when unknown. */
  countryOfLeague: (leagueSlug: string) => string;
  /** Status of the window that governs a league's clubs (its country's). */
  ofLeague: (leagueSlug: string) => WindowStatus;
  /** Status for a club, from the squad index (open when the club is unknown). */
  ofSquad: (squadId: string) => WindowStatus;
  /** The human club: its country's window, plus the new-career arrival grace (D1). */
  human: () => WindowStatus;
  /** Same, on another day (window news compare with yesterday). */
  humanOn: (date: string) => WindowStatus;
  /** Country of the human club ("" when unknown or without a club). */
  humanCountry: () => string;
  /** Deadline rush for a league's clubs (last days of the window). */
  rush: (leagueSlug: string) => boolean;
  /** Every country with its tier-1 season, for the Windows tab. */
  countries: () => { country: string; status: WindowStatus }[];
}

function buildWindowContext(args: {
  date: string;
  activeLeagues: LeagueSeasonState[];
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  index?: SquadIndex | null;
  /** Human club and career start (arrival grace). */
  humanClubId?: string;
  careerStart?: string;
}): WindowContext {
  const { date } = args;
  const countryOf = new Map(args.catalog.map((l) => [l.slug, l.country ?? ""] as const));
  const states = new Map(args.activeLeagues.map((l) => [l.leagueSlug, l] as const));
  const seasonCache = new Map<string, SeasonDates | null>();
  const statusCache = new Map<string, WindowStatus>();

  const seasonOfCountry = (country: string, fallbackLeague: string): SeasonDates | null => {
    const key = country || `league:${fallbackLeague}`;
    if (seasonCache.has(key)) return seasonCache.get(key)!;
    const top = country ? topLeagueOf(country, args.catalog, args.pyramids) : null;
    const state = (top && states.get(top)) || states.get(fallbackLeague) || null;
    const season = state ? { start: state.start, end: state.end } : null;
    seasonCache.set(key, season);
    return season;
  };

  const ofLeague = (leagueSlug: string): WindowStatus => {
    const country = countryOf.get(leagueSlug) ?? "";
    const key = country || `league:${leagueSlug}`;
    const hit = statusCache.get(key);
    if (hit) return hit;
    const season = seasonOfCountry(country, leagueSlug);
    const st: WindowStatus = season ? windowStatus(season, date) : { open: true };
    statusCache.set(key, st);
    return st;
  };

  const ofSquad = (squadId: string): WindowStatus => {
    const league = args.index?.byId(squadId)?.leagueSlug;
    return league ? ofLeague(league) : { open: true };
  };

  const humanOn = (day: string): WindowStatus => {
    const league = args.humanClubId ? args.index?.byId(args.humanClubId)?.leagueSlug : undefined;
    if (!league) return { open: true };
    const country = countryOf.get(league) ?? "";
    return humanWindowStatus(seasonOfCountry(country, league), day, args.careerStart);
  };

  return {
    date,
    countryOfLeague: (slug) => countryOf.get(slug) ?? "",
    ofLeague,
    ofSquad,
    human: () => humanOn(date),
    humanOn,
    humanCountry: () => {
      const league = args.humanClubId ? args.index?.byId(args.humanClubId)?.leagueSlug : undefined;
      return league ? countryOf.get(league) ?? "" : "";
    },
    rush: (slug) => isDeadlineRush(ofLeague(slug), date),
    countries: () => {
      const seen = new Set<string>();
      const out: { country: string; status: WindowStatus }[] = [];
      for (const l of args.catalog) {
        const c = l.country ?? "";
        if (!c || seen.has(c) || !args.activeLeagues.some((s) => countryOf.get(s.leagueSlug) === c)) continue;
        seen.add(c);
        out.push({ country: c, status: ofLeague(l.slug) });
      }
      return out;
    },
  };
}

/** The window context of a save on its current date. */
export async function loadWindowContext(meta: SaveMeta, index: SquadIndex | null, date = meta.currentDate ?? ""): Promise<WindowContext> {
  return buildWindowContext({
    date,
    activeLeagues: meta.activeLeagues ?? [],
    catalog: await getLeagueData(),
    pyramids: await getPyramids(),
    index,
    humanClubId: meta.unemployed ? undefined : meta.clubId,
    careerStart: meta.careerStart,
  });
}

/** 409 body for an action that needs the window open. */
export function windowClosedResponse(status: WindowStatus): Response {
  return Response.json({ error: "windowClosed", ...(status.opensOn ? { opensOn: status.opensOn } : {}) }, { status: 409 });
}
