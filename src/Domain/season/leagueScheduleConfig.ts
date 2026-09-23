export interface LeagueScheduleConfig {
  slug:            string;
  /** "MM-DD" template for season start */
  seasonStartMMDD: string;
  /** "MM-DD" template for season end */
  seasonEndMMDD:   string;
  /** true = end date is in year+1 (European leagues); false = same year (Brazilian) */
  crossYear:       boolean;
  /** Days of week matches are played: 0=Sun, 1=Mon, ..., 6=Sat */
  matchDays:       number[];
  /** Days to offset from season start before placing round 1, staggers leagues so they don't all play on same day */
  baseWeekOffset:  number;
}

export const LEAGUE_SCHEDULE_CONFIGS: LeagueScheduleConfig[] = [
  { slug: "premier_league", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true,  matchDays: [6, 0],    baseWeekOffset: 0 },
  { slug: "bundesliga",     seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true,  matchDays: [6, 0],    baseWeekOffset: 1 },
  { slug: "la_liga",        seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true,  matchDays: [5, 6, 0], baseWeekOffset: 2 },
  { slug: "serie_a",        seasonStartMMDD: "08-16", seasonEndMMDD: "05-18", crossYear: true,  matchDays: [6, 0],    baseWeekOffset: 3 },
  { slug: "ligue_1",        seasonStartMMDD: "08-15", seasonEndMMDD: "05-16", crossYear: true,  matchDays: [5, 6, 0], baseWeekOffset: 4 },
  { slug: "brazil_serie_a", seasonStartMMDD: "02-05", seasonEndMMDD: "12-07", crossYear: false, matchDays: [3, 6, 0], baseWeekOffset: 0 },
  { slug: "brazil_serie_b", seasonStartMMDD: "02-05", seasonEndMMDD: "11-30", crossYear: false, matchDays: [3, 6, 0], baseWeekOffset: 1 },
  { slug: "brazil_serie_c", seasonStartMMDD: "02-05", seasonEndMMDD: "11-23", crossYear: false, matchDays: [3, 6, 0], baseWeekOffset: 2 },
];

/** Get start date string for a given calendar year */
export function leagueSeasonStart(config: LeagueScheduleConfig, year: number): string {
  return `${year}-${config.seasonStartMMDD}`;
}

/** Get end date string for a given calendar year */
export function leagueSeasonEnd(config: LeagueScheduleConfig, year: number): string {
  const endYear = config.crossYear ? year + 1 : year;
  return `${endYear}-${config.seasonEndMMDD}`;
}
