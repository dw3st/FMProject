import type { TacticalAxes, TacticalStyle } from "@/types/tacticsTypes";

/**
 * The plan a human manager started one official club game with (`.claude/rules/game/study.md`).
 * Kept on the seat (`SeatState.tacticLog`), last `STUDY.GAMES` games.
 */
export interface TacticLogEntry {
  /** Match date, YYYY-MM-DD. */
  date: string;
  /** Fixture id (with `date`, the idempotency key). */
  fixtureId: string;
  /** Formation id; `"custom"` for the free formation. */
  formation: string;
  style: TacticalStyle;
  /** The four effective axes (`effectiveAxes(style, axesOverride)`). */
  axes: TacticalAxes;
}

/** How well an AI club read the manager: none = no plan. */
export type StudyLevel = "none" | "medium" | "high";

/** How predictable the manager is, shown on the Formation screen (the read without the club tier). */
export type PredictabilityLevel = "low" | "medium" | "high";

/** The game plan an AI club brings against a human club it studied. */
export interface StudyPlan {
  level: Exclude<StudyLevel, "none">;
  /** The read 0..1 after the club tier and the analyst. */
  read: number;
  /** What the AI expects from the manager. */
  expected: { formation: string; style: TacticalStyle };
  /** The style the AI plays (`STUDY.COUNTER[expected.style]`). */
  style: TacticalStyle;
  /** Level `high` only: the AI's `slot` man-marks the manager's player. */
  mark?: { slot: number; targetRosterId: string; targetName: string };
}

/** What the day log keeps of a plan (`MatchEvent.study`): the AI side of the match. */
export interface MatchStudy {
  side: "home" | "away";
  level: Exclude<StudyLevel, "none">;
  style: TacticalStyle;
  /** Name of the man-marked player (level `high`). */
  marked?: string;
}

/** What `match-setup` tells the manager's screens about the opponent's plan. */
export interface MatchSetupStudy {
  level: Exclude<StudyLevel, "none">;
  expected: { formation: string; style: TacticalStyle };
  /** The AI's plan: applied to team B by the live match. */
  style: TacticalStyle;
  mark?: { slot: number; targetRosterId: string; targetName: string };
  /** The manager's analyst is good enough (4 stars or more) to tell what the opponent will do. */
  analystHint: boolean;
}

/** Tactical knowledge card of the match preview (tester report 6dcd454e). Percentages 0..100. */
export interface MatchSetupKnowledge {
  /** What the AI opponent knows of the manager; null = it has no game of his to read yet. */
  theirs: {
    /** Its read of the manager's last games. */
    read: number;
    /** The read against the tactic saved now (lower when the saved tactic departs from what it expects). */
    now: number;
    expected: { formation: string; style: TacticalStyle };
    /** The saved tactic is not the one it expects. */
    surprise: boolean;
  } | null;
  /** What the manager's analyst knows of the opponent; null = no known game of the opponent. */
  yours: {
    low: number;
    high: number;
    /** The plan the analyst expects (a weak analyst can name the wrong formation). */
    expected: { formation: string; style: TacticalStyle };
    analystStars: number;
    /** The analyst can be wrong about the formation (under 5 stars). */
    mayMiss: boolean;
  } | null;
}
