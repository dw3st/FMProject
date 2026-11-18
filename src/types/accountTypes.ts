// Account profile (`docs/superpowers/specs/2026-11-18-account-profile-design.md`): one snapshot per career of the
// account, kept in SQLite after the save is gone. No user id or e-mail ever goes to the client.
import type { ManagerFace } from "@/Domain/faces/managerFace";
import type { ManagerLeftReason } from "@/types/managerTypes";

export type CareerMode = "solo" | "friends" | "public";

export interface CareerPassage {
  squadId: string;
  clubName: string;
  from: string;
  to?: string;
  left?: ManagerLeftReason;
  /** A national team spell (`nat_<nação>`). */
  national?: true;
}

export interface CareerTitle {
  kind: "league" | "cup" | "continental" | "promotion" | "national";
  competition: string;
  season: string;
  squadId: string;
  on?: string;
  /** Country of the league (league titles only), as in `leagueData`. */
  country?: string;
}

export interface CareerAward {
  kind: "best_manager" | "world_manager";
  season: string;
  competition: string;
}

export interface AccountCareer {
  saveId: string;
  seatId: string;
  managerName: string;
  nationalityIso?: string;
  face?: ManagerFace;
  mode: CareerMode;
  /** Game date of the snapshot. */
  date: string;
  /** Current club (empty when unemployed) and its name. */
  clubId: string;
  clubName: string;
  clubColors?: [string, string];
  passages: CareerPassage[];
  titles: CareerTitle[];
  awards: CareerAward[];
  seasons: number;
  matches: number;
  wins: number;
  cards: { yellow: number; red: number };
}

/** A stored career: the snapshot plus whether its save (or seat) is gone. */
export interface StoredCareer extends AccountCareer {
  deleted: boolean;
}

export interface AccountSummary {
  careers: number;
  friendsCareers: number;
  /** `total` leaves the promotions out (they have their own count). */
  titles: { total: number; league: number; cup: number; continental: number; national: number; promotion: number };
  seasons: number;
  clubs: number;
  matches: number;
  wins: number;
  /** Wins / matches, 0..100 (0 with no matches). */
  winPct: number;
  awards: { total: number; league: number; world: number };
  sackings: number;
  cards: { yellow: number; red: number };
}

export type AccountTrackId =
  | "league_titles" | "cups" | "continentals" | "title_countries" | "title_saves"
  | "seasons" | "clubs" | "wins" | "manager_awards" | "promotions";

export type AccountSingleId = "world_best" | "national_title" | "world_cup" | "friends_champion" | "up_and_champion";

export type AccountSecretId = "treble" | "two_continents" | "short_fuse" | "wanderer" | "phoenix";

export type AccountTier = "bronze" | "silver" | "gold";

export interface AccountTrackView {
  id: AccountTrackId;
  value: number;
  thresholds: [number, number, number];
  /** Highest tier reached, or null. */
  tier: AccountTier | null;
}

export interface AccountAchievementsView {
  tracks: AccountTrackView[];
  singles: { id: AccountSingleId; unlocked: boolean }[];
  /** Locked secrets carry no id: the screen shows "???". */
  secrets: ({ id: AccountSecretId; unlocked: true } | { unlocked: false })[];
  unlocked: number;
  total: number;
}

export interface AccountCareerView {
  saveId: string;
  managerName: string;
  mode: CareerMode;
  date: string;
  clubName: string;
  clubs: { squadId: string; clubName: string }[];
  seasons: number;
  titles: number;
  deleted: boolean;
}

export interface AccountProfileView {
  nickname: string;
  /** Account creation, ISO date. */
  since: string;
  /** Face of the most recent career (null: no career yet). */
  face: { managerId: string; face?: ManagerFace; nationalityIso?: string; clubColors?: [string, string]; saveId: string } | null;
  summary: AccountSummary;
  achievements: AccountAchievementsView;
  /** Tracks whose gold the player shows at the top (up to 3). */
  badges: AccountTrackId[];
  careers: AccountCareerView[];
  /** True for the player's own profile. */
  mine: boolean;
}
