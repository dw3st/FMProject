/**
 * Club facilities (`.claude/rules/game/facilities.md`): stadium stands and comfort, training ground
 * and academy. Only the human club stores them (`Squad.facilities`); AI clubs use an implied level by
 * financial tier.
 */

export type StandId = "north" | "south" | "east" | "west";

/** What a project builds. One project per kind at a time. */
export type FacilityKind = "stand" | "comfort" | "training" | "academy";

export interface StadiumStand {
  id: StandId;
  seats: number;
}

export interface FacilityProject {
  id: string;
  kind: FacilityKind;
  /** Stand projects: which stand and how many seats it adds. */
  stand?: StandId;
  seats?: number;
  /** Level projects (comfort, training, academy): the level reached on completion. */
  level?: number;
  /** Day the board approved it (first instalment due). */
  start: string;
  /** Completion day: the effect applies from this day on. */
  end: string;
  /** Total cost (EUR). */
  cost: number;
  /** Share of the cost the board pays from its own funds (0, or 0.25..0.5 with a board >= 85). */
  boardShare: number;
  /** Monthly instalments in total and already charged. */
  instalments: number;
  paid: number;
}

/** A finished project, kept for the dashboard card ("finished in the last 7 days"). */
export interface CompletedFacilityProject {
  id: string;
  kind: FacilityKind;
  stand?: StandId;
  seats?: number;
  level?: number;
  date: string;
}

/** One home game of the human club. */
export interface AttendanceRow {
  date: string;
  competition: string;
  opponentId: string;
  attendance: number;
  /** Seats available that day (a stand under works counts half). */
  capacity: number;
  /** Estimated demand that day (may exceed the capacity). */
  demand: number;
}

export interface ClubFacilities {
  stands: StadiumStand[];
  /** Comfort 1..5: +6% ticket price per level above 1. */
  comfort: number;
  /** Training ground 1..5 (3 = neutral). */
  training: number;
  /** Academy 1..5 (3 = neutral). */
  academy: number;
  projects: FacilityProject[];
  completed: CompletedFacilityProject[];
  /**
   * Demand anchor: the stadium, followers and league tier when the club's facilities were set up.
   * Demand = anchor capacity × fans fill × (followers / anchor followers)^k × league tier ratio ×
   * season phase, so a club with default facilities sells exactly what it sold before.
   */
  anchor: { capacity: number; followers: number; tier: number };
  /** Home games, oldest first (bounded). */
  attendance: AttendanceRow[];
  /** Best home attendance since the facilities were set up. */
  record?: { date: string; attendance: number; competition: string; opponentId: string };
}

/** Body of `POST /api/saves/:id/facilities/request`. */
export type FacilityRequest =
  | { kind: "stand"; stand: StandId; seats: number }
  | { kind: "comfort" | "training" | "academy" };

export type BoardRefusal = "board_low" | "negative_balance" | "too_big" | "no_money";
