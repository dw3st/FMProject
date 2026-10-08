/** Season awards (`.claude/rules/game/awards.md`). */
export const LEAGUE_AWARD_KINDS = ["best_player", "young_player", "top_scorer", "best_goalkeeper", "team_of_season", "best_manager", "goal_of_season"] as const;
export type LeagueAwardKind = (typeof LEAGUE_AWARD_KINDS)[number];
export const AWARD_KINDS = [...LEAGUE_AWARD_KINDS, "world_player", "world_manager"] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

/** On a history row: `league` for league awards, `year` for the world ones. */
export interface PlayerAward { kind: AwardKind; league?: string; year?: number }
export interface ManagerAward { season: string; kind: "best_manager" | "world_manager"; competition: string; squadId: string; year?: number }

export interface AwardedPlayer {
  playerId: string; name: string; squadId: string; clubName: string;
  /** Average rating (goals for the top scorer). */
  value: number;
  leagueApps: number;
  /** Team of the season: slot role ("GK", "LB", …). */
  slot?: string;
}
export interface ShortlistPlayer extends AwardedPlayer { seasonScore: number }
export interface AwardedManager {
  managerId: string; name: string; squadId: string; clubName: string;
  position: number; target: number; score: number;
}
export interface GoalOfSeasonCandidate {
  key: string; fixtureId: string; date: string;
  playerId: string; playerName: string; squadId: string; opponentId: string;
  minute: number; header: boolean; distance: number;
  setPiece?: "corner" | "free_kick" | "direct_free_kick";
}
export interface LeagueSeasonAwards {
  league: string; season: string; closedOn: string; country: string | null; tier: number;
  /** countryWeight × tier factor (world awards). */
  weight: number;
  bestPlayer?: AwardedPlayer; youngPlayer?: AwardedPlayer; topScorer?: AwardedPlayer; bestGoalkeeper?: AwardedPlayer;
  teamOfSeason: AwardedPlayer[];
  bestManager?: AwardedManager;
  goalOfSeason?: GoalOfSeasonCandidate;
  shortlist: { players: ShortlistPlayer[]; managers: AwardedManager[] };
}
export interface WorldAwardEntry { id: string; name: string; squadId: string; clubName: string; league: string; score: number }
export interface WorldAwards { year: number; on: string; player: WorldAwardEntry[]; manager: WorldAwardEntry[] }
/** `saves/{id}/awards/{year}.json`: league seasons closed in `year` + the world awards for `year` (given in January of year + 1). */
export interface AwardsYear { year: number; leagues: LeagueSeasonAwards[]; world?: WorldAwards }
/** `saves/{id}/seasonGoals/{league}-{year}.json`. */
export interface SeasonGoals { league: string; year: number; goals: GoalOfSeasonCandidate[] }
