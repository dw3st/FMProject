import type { SeatMeta, WorldMeta } from "@/backend/SaveService";
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
  /**
   * A seat's club: its country's window (today and on any day), plus the new-career arrival grace (D1).
   * Open with country "" for a seat without a club or not given to the context.
   */
  seat: (seatId: string) => SeatWindows;
  /** Deadline rush for a league's clubs (last days of the window). */
  rush: (leagueSlug: string) => boolean;
  /** Every country with its tier-1 season, for the Windows tab. */
  countries: () => { country: string; status: WindowStatus }[];
}

/** A seat's club and career start, for its transfer window (`.claude/rules/game/transfer-windows.md`). */
export interface SeatWindowRef {
  seatId: string;
  /** Absent while the seat is unemployed. */
  clubId?: string;
  careerStart?: string;
}

/** The window of one seat's club: today, any day, and its country. */
export interface SeatWindows {
  today: WindowStatus;
  on: (day: string) => WindowStatus;
  country: string;
}

export function seatWindowRef(meta: SeatMeta): SeatWindowRef {
  return {
    seatId: meta.seatId,
    ...(meta.unemployed || !meta.clubId ? {} : { clubId: meta.clubId }),
    ...(meta.careerStart ? { careerStart: meta.careerStart } : {}),
  };
}

function buildWindowContext(args: {
  date: string;
  activeLeagues: LeagueSeasonState[];
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  index?: SquadIndex | null;
  /** The seats (club and career start, for the arrival grace). */
  seats?: SeatWindowRef[];
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

  const seatRefs = new Map((args.seats ?? []).map((s) => [s.seatId, s] as const));
  const seat = (seatId: string): SeatWindows => {
    const ref = seatRefs.get(seatId);
    const league = ref?.clubId ? args.index?.byId(ref.clubId)?.leagueSlug : undefined;
    if (!league) return { today: { open: true }, on: () => ({ open: true }), country: "" };
    const country = countryOf.get(league) ?? "";
    const on = (day: string): WindowStatus => humanWindowStatus(seasonOfCountry(country, league), day, ref?.careerStart);
    return { today: on(date), on, country };
  };

  return {
    date,
    countryOfLeague: (slug) => countryOf.get(slug) ?? "",
    ofLeague,
    ofSquad,
    seat,
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

/** The window context of a world on `date`, with the windows of the given seats. */
export async function loadWindowContext(
  world: Pick<WorldMeta, "activeLeagues" | "currentDate">,
  index: SquadIndex | null,
  date = world.currentDate ?? "",
  seats: SeatWindowRef[] = [],
): Promise<WindowContext> {
  return buildWindowContext({
    date,
    activeLeagues: world.activeLeagues ?? [],
    catalog: await getLeagueData(),
    pyramids: await getPyramids(),
    index,
    seats,
  });
}

/** 409 body for an action that needs the window open. */
export function windowClosedResponse(status: WindowStatus): Response {
  return Response.json({ error: "windowClosed", ...(status.opensOn ? { opensOn: status.opensOn } : {}) }, { status: 409 });
}
