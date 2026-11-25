import type { RosterPlayer } from "@/types/playerTypes";

/** Youth trials of the human club (`.claude/rules/game/youth.md` → "Peneira de jovens"). */
export type TrialSize = "small" | "medium" | "large";
export type TrialAge = 15 | 16 | 17;
export type TrialReveal = "first_team" | "world_top" | "sold";

export interface TrialScheduled {
  id: string;
  /** Day of the trial (14–28 days after `scheduledOn`). */
  date: string;
  age: TrialAge;
  size: TrialSize;
  /** What it cost (charged when scheduled). */
  cost: number;
  scheduledOn: string;
}

/** The youngsters of a finished trial, real attributes (the route blurs them). */
export interface TrialResult {
  id: string;
  date: string;
  /** Last day they can be signed. */
  expires: string;
  age: TrialAge;
  players: RosterPlayer[];
}

export interface YouthTrialsState {
  scheduled?: TrialScheduled;
  results?: TrialResult;
  /** Trials scheduled per league season (a cancelled one still counts). */
  seasons: { season: string; count: number }[];
}

/** Where a player was found: kept on him for good. */
export interface TrialOrigin {
  clubId: string;
  clubName: string;
  date: string;
  seatId: string;
}

export interface TrialPlayerView {
  player: RosterPlayer;
  overall: [number, number];
  potential: [number, number];
  gem: boolean;
}

export interface YouthTrialsView {
  scheduled: TrialScheduled | null;
  results: { id: string; date: string; expires: string; age: TrialAge; players: TrialPlayerView[] } | null;
  costs: Record<TrialSize, number>;
  counts: Record<TrialSize, number>;
  left: number;
  perSeason: number;
  /** Earliest and latest day a trial can be scheduled for. */
  window: { from: string; to: string };
  academy: { size: number; max: number };
  reveals: { count: number; top: number };
  fame: number;
}
