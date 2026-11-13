/**
 * Social-media thermometer (11.2, tester report): every club's followers, ranked, with the trend of the running
 * season. Nothing new is simulated: the trend is the season reaction a club would get at the rollover if the table
 * ended today (`followersChange`, the same rule that moves the followers of every club, human and AI).
 *
 * For a human club the thermometer also has two small effects: the fans meter warms or cools a little every week,
 * and at the rollover the commercial income follows the followers (`commercialAfterFollowers`).
 */
import { followersChange } from "@/Domain/aiFinance/seasonReaction";
import type { FinancialTier } from "@/types/playerTypes";

export const FANBASE = {
  /** Trend from which a club is "hot" / at or below which it is "cold" (share of the followers a season). */
  HOT: 0.04,
  COLD: -0.01,
  /** League games before a season has a trend (the table means little before). */
  MIN_GAMES: 5,
  /** Human club at the rollover: commercial income moves by this share of the followers' change, within the cap. */
  COMMERCIAL_SHARE: 0.5,
  COMMERCIAL_CAP: 0.06,
  /** Human club, every Monday: the fans meter moves with the mood on the networks. */
  FANS_HOT: 0.2,
  FANS_COLD: -0.4,
} as const;

export type FanbaseHeat = "hot" | "warm" | "cold";

export interface TablePlace {
  /** 1 = leader. */
  rank: number;
  leagueSize: number;
  /** League games played by the club. */
  played: number;
}

/** The followers change this season is heading for (0.06 = +6%); null before the table means anything. */
export function seasonTrend(place: TablePlace | null, tier: FinancialTier): number | null {
  if (!place || place.played < FANBASE.MIN_GAMES || place.leagueSize < 2) return null;
  return followersChange({ rank: place.rank, leagueSize: place.leagueSize, played: true, move: null }, tier);
}

export function heatOf(trend: number | null): FanbaseHeat {
  if (trend === null) return "warm";
  if (trend >= FANBASE.HOT) return "hot";
  if (trend <= FANBASE.COLD) return "cold";
  return "warm";
}

/** Weekly move of a human club's fans meter by the mood on the networks. */
export function fansDeltaOf(heat: FanbaseHeat): number {
  return heat === "hot" ? FANBASE.FANS_HOT : heat === "cold" ? FANBASE.FANS_COLD : 0;
}

/** Commercial income of a human club after the season's followers change (half of it, within ±`COMMERCIAL_CAP`). */
export function commercialAfterFollowers(commercial: number, followersBefore: number, followersAfter: number): number {
  if (followersBefore <= 0 || commercial <= 0) return commercial;
  const change = (followersAfter - followersBefore) / followersBefore;
  const move = Math.max(-FANBASE.COMMERCIAL_CAP, Math.min(FANBASE.COMMERCIAL_CAP, change * FANBASE.COMMERCIAL_SHARE));
  return Math.round(commercial * (1 + move));
}

export interface FanbaseClub {
  squadId: string;
  name: string;
  leagueSlug: string;
  country: string | null;
  followers: number;
  tier: FinancialTier;
  place: TablePlace | null;
  /** Run by a human manager. */
  human: boolean;
}

export interface FanbaseRow {
  /** Position in the list it was ranked in (1 = most followers). */
  rank: number;
  squadId: string;
  name: string;
  leagueSlug: string;
  country: string | null;
  followers: number;
  /** Null before the season has a trend. */
  trend: number | null;
  heat: FanbaseHeat;
  human: boolean;
}

/** Clubs by followers (then name, then id), numbered from 1. */
export function fanbaseRanking(clubs: readonly FanbaseClub[]): FanbaseRow[] {
  return [...clubs]
    .sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name) || a.squadId.localeCompare(b.squadId))
    .map((c, i) => {
      const trend = seasonTrend(c.place, c.tier);
      return {
        rank: i + 1, squadId: c.squadId, name: c.name, leagueSlug: c.leagueSlug, country: c.country,
        followers: c.followers, trend, heat: heatOf(trend), human: c.human,
      };
    });
}

export type FanbaseScope = "world" | "country" | "league";
export const FANBASE_SCOPES: readonly FanbaseScope[] = ["world", "country", "league"];

export interface FanbaseView {
  scope: FanbaseScope;
  total: number;
  /** The viewer's club in this list (null without a club). */
  mine: FanbaseRow | null;
  items: FanbaseRow[];
}

/** One page of a scope, re-numbered inside it. */
export function fanbasePage(
  clubs: readonly FanbaseClub[],
  opts: { scope: FanbaseScope; myClubId: string | null; offset: number; limit: number },
): FanbaseView {
  const me = opts.myClubId ? clubs.find((c) => c.squadId === opts.myClubId) : undefined;
  const inScope = opts.scope === "world" || !me
    ? clubs
    : clubs.filter((c) => (opts.scope === "league" ? c.leagueSlug === me.leagueSlug : c.country !== null && c.country === me.country));
  const rows = fanbaseRanking(inScope);
  return {
    scope: opts.scope,
    total: rows.length,
    mine: me ? rows.find((r) => r.squadId === me.squadId) ?? null : null,
    items: rows.slice(opts.offset, opts.offset + opts.limit),
  };
}
