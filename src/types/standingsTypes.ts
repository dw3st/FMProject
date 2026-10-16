// src/types/standingsTypes.ts
import type { ManagerFace } from "@/Domain/faces/managerFace";

/** Friends' league standings (multiplayer part 5a, `.claude/rules/game/multiplayer.md`). */
export type StandingItemKey =
  | "objective_met" | "above_target" | "below_target" | "league_title" | "promoted" | "relegated"
  | "cup" | "continental" | "best_manager" | "world_manager" | "national_title" | "national_objective"
  | "half" | "sacked";

export interface StandingItem { key: StandingItemKey; points: number; detail?: string }

/** The seat's open passage at a club in a season. */
export interface SeatStanding {
  from: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
  /** Season label of the club's league ("2026-27" / "2027"). */
  season: string;
  /** Board target (worst position that still meets the objective); null without an objective. */
  target: number | null;
  /** Points already won in the passage that the table can't rebuild (cup, continental, awards, national team). */
  extras: StandingItem[];
}

export type PassageEnd = "rollover" | "club_change" | "sacked" | "contract";

export interface SeatSeasonRow {
  id: string;
  seatId: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
  season: string;
  from: string;
  closedOn: string;
  reason: PassageEnd;
  position: number | null;
  target: number | null;
  items: StandingItem[];
  total: number;
}

export interface StandingsEntry {
  seatId: string;
  nickname: string | null;
  managerName: string;
  face: ManagerFace | null;
  nationalityIso: string | null;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  partial: { total: number; items: StandingItem[]; position: number | null; target: number | null } | null;
  closedTotal: number;
  total: number;
  seasons: number;
}

export interface StandingsView { entries: StandingsEntry[]; rows: SeatSeasonRow[] }
