import type { CareerEnded, SeasonObjective } from "@/types/boardTypes";

/**
 * Job offers to the human manager (`.claude/rules/game/jobs.md`, Etapa 20). Stored in
 * `SaveMeta.jobOffers`; answered through `POST /api/saves/:id/jobs/:offerId`.
 */

/** When the offer arrived: the player's country rollover, the mid-season window, or unemployed. */
export type JobWindow = "season_end" | "mid_season" | "unemployed";

export interface JobOffer {
  id: string;
  squadId: string;
  clubName: string;
  leagueSlug: string;
  /** English fallback; the screen uses `competitionName`. */
  leagueName: string;
  window: JobWindow;
  /** Day the offer arrived. */
  date: string;
  /** Last `currentDate` on which it can still be accepted (inclusive). */
  expires: string;
  /** What the board would ask for (null when the club's league could not be read). */
  objective: SeasonObjective | null;
  /** Starting balance at the club (its AI seasonal transfer budget), euros. */
  budget: number;
  /** Expected league position from squad strength (1-based) and the league size. */
  expectedPosition: number;
  leagueSize: number;
  /** Club prestige 0..1 (world percentile of strength + financial tier). */
  prestige: number;
  /** The manager's contract on offer (Etapa 25): weekly wage, seasons. */
  wage?: number;
  seasons?: number;
  /** Compensation the new club pays the current one (D3), deducted from `budget` on arrival. */
  compensation?: number;
}

/** The manager was sacked and has no club (`SaveMeta.unemployed`). */
export interface Unemployment {
  since: string;
  lastClubId: string;
  lastClubName: string;
  /** League he was in (offers prefer its country). */
  lastLeagueSlug: string;
  /** Board confidence on the day of the sacking (the reputation's "current season" term). */
  board: number;
  /** Day the next batch of offers is drawn. */
  nextOfferDate: string;
  /** Last day any offer arrived (the guaranteed offer comes after GUARANTEED_AFTER_DAYS without one). */
  lastOfferDate?: string;
  /** The sacking itself, for the news screen (`/fired`). */
  sacking: CareerEnded;
}
