/**
 * Achievements of a career (`.claude/rules/game/achievements.md`): one file per save,
 * `saves/{id}/achievements.json`. Only the human manager; absent = nothing unlocked.
 */

export const ACHIEVEMENT_CATEGORIES = ["titles", "wins", "matches", "youth", "market", "finances", "career", "squad"] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const MANAGER_ATTRIBUTES = ["motivation", "tactics", "youth", "negotiation", "discipline"] as const;
export type ManagerAttribute = (typeof MANAGER_ATTRIBUTES)[number];
export type ManagerAttributes = Record<ManagerAttribute, number>;

export type AchievementTier = "bronze" | "silver" | "gold" | "secret";

export const TRACK_IDS = [
  "league_titles", "cup_titles", "continental_titles", "promotions",
  "wins", "win_streak", "unbeaten_run", "thrashings",
  "comebacks", "ten_men_wins", "shootout_wins", "derby_wins",
  "youth_promoted", "young_award",
  "sales_profit", "big_signing", "free_starter",
  "balance", "stadium", "facilities",
  "seasons", "clubs", "ranking", "manager_awards",
  "top_scorer", "league_unbeaten",
] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const SECRET_IDS = [
  "fortress", "cheapest_champion", "keeper_goal", "sacked_early", "double", "treble", "great_escape", "nine_men",
  "seven_up", "bounce_back", "last_gasp", "humbled", "perfect_month", "one_club", "wall",
] as const;
export type SecretId = (typeof SECRET_IDS)[number];

/** Unlock key: `<track>:<tier>` or `secret:<id>`. */
export type AchievementKey = `${TrackId}:${"bronze" | "silver" | "gold"}` | `secret:${SecretId}`;

export const FRAMES = ["none", "bronze", "silver", "gold", "legend"] as const;
export type Frame = (typeof FRAMES)[number];
/** One badge per category (a gold in it) plus `mystery` (any secret). */
export type Badge = AchievementCategory | "mystery";

export interface ManagerProfile {
  frame: Frame;
  badges: Badge[];
  /** A track whose gold gives the displayed title. */
  title: TrackId | null;
}

export interface StadiumDecor { banner: boolean; flag: boolean; mosaic: boolean }

/** Counters the day step accumulates (career-wide unless noted). */
export interface AchievementCounters {
  matches: number;
  wins: number;
  winStreak: number;
  bestWinStreak: number;
  unbeaten: number;
  bestUnbeaten: number;
  cleanStreak: number;
  bestCleanStreak: number;
  lossStreak: number;
  thrashings: number;
  comebacks: number;
  tenMenWins: number;
  shootoutWins: number;
  derbyWins: number;
  salesProfit: number;
  biggestSigning: number;
  /** League run without defeat in the current season (reset at the rollover / club change). */
  leagueUnbeaten: number;
  bestLeagueUnbeaten: number;
  bestRank: number | null;
  youngAwards: number;
  topScorers: number;
}

/** The current league season of the club (reset at the human club's rollover and at a club change). */
export interface SeasonTrack {
  squadId: string;
  played: number;
  lost: number;
  homeLost: number;
}

export interface ClubBaseline {
  baseCapacity: number;
  baseBalance: number;
  /** Facility item id → level on arrival. */
  baseFacilityLevels: Record<string, number>;
  seasons: number;
}

export interface AchievementsState {
  /** Last day counted (idempotency: a retried day adds nothing). */
  lastDay?: string;
  unlocked: Partial<Record<AchievementKey, string>>;
  counters: AchievementCounters;
  season?: SeasonTrack;
  /** Calendar month being tracked for `perfect_month` ("YYYY-MM"). */
  month?: { key: string; played: number; won: number };
  attributes: ManagerAttributes;
  /** Titles of the manager already turned into attribute points. */
  titlesSeen: number;
  /** Fee the manager paid for a player (sale profit). */
  paid: Record<string, number>;
  /** Free signings of the manager → starts for the club. */
  freeSignings: Record<string, number>;
  /** Players formed at a club seen in a first team. */
  promotedIds: string[];
  /** Awards already counted ("<league>:<season>:<kind>"). */
  awardsSeen: string[];
  /**
   * Per club, taken on the first day the manager is seen there (his arrival): stadium capacity, balance and the
   * level of each facility item — the finance tracks count only what he built on top. Seasons completed.
   */
  clubs: Record<string, ClubBaseline>;
  spent: number;
  bought: { created?: string; legend?: string };
  legendOptions?: { date: string; ids: string[] };
  profile: ManagerProfile;
  decor: StadiumDecor;
}

/** One line of the screen (`GET /achievements`). */
export interface TrackView {
  id: TrackId;
  category: AchievementCategory;
  attribute: ManagerAttribute;
  value: number;
  thresholds: [number, number, number];
  unlocked: Partial<Record<"bronze" | "silver" | "gold", string>>;
}

export interface SecretView {
  id: SecretId;
  attribute: ManagerAttribute;
  /** Absent while locked: the screen shows "???". */
  unlocked?: string;
}
