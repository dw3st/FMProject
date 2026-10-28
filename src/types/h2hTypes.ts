import type { GamePlayer, GameState, MatchPhase } from "@/GameEngine/types";
import type { LiveMatchInput } from "@/Domain/match/liveMatchSetup";
import type { Mentality, SlotInstruction, TacticalAxes, TacticalStyle } from "@/types/tacticsTypes";
import type { StatsSnapshot, TeamStats, GoalLogEntry } from "@/GameEngine/Domain/Statistics";

/** Engine side of a live match between two managers: A = home. */
export type H2HSide = "A" | "B";

/** A manager in the match room: `away` (not in), `in` (in the room), `ready` (clicked Start). */
export type H2HSeatStatus = "away" | "in" | "ready";

export type H2HPhase = "lobby" | "live" | "done" | "closed";

export interface H2HSideView {
  seatId: string;
  nickname: string | null;
  clubId: string;
  clubName: string;
  status: H2HSeatStatus;
  pausesLeft: number;
  connected: boolean;
}

/** What both managers see of the room (`h2h_room`). */
export interface H2HRoomView {
  saveId: string;
  fixtureId: string;
  date: string;
  phase: H2HPhase;
  sides: Record<H2HSide, H2HSideView>;
  /** Active pause: who paused and until when (epoch ms). */
  pause: { by: H2HSide; until: number } | null;
}

/** A manager's command on his own side (engine player ids, `GamePlayer.id`). */
export type H2HCommand =
  | { kind: "sub"; outId: number; inId: number }
  | { kind: "swap"; aId: number; bId: number }
  | { kind: "mentality"; mentality: Mentality }
  | { kind: "tactics"; style: TacticalStyle; axesOverride?: Partial<TacticalAxes> }
  | { kind: "formation"; formation: string }
  | { kind: "instruction"; slot: number; instruction: SlotInstruction | null }
  | { kind: "marks"; marks: { markerSlot: number; targetId: number }[] };

/** Main process → match worker. */
export type WorkerIn =
  | { type: "init"; input: LiveMatchInput }
  | { type: "cmd"; side: H2HSide; cmd: H2HCommand }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "auto"; side: H2HSide; on: boolean }
  | { type: "speed"; factor: number };

/** Match worker → main process. */
export type WorkerOut =
  | {
      type: "frame";
      t: number;
      ball: [number, number];
      /** [player id, x, y] in yards. */
      players: [number, number, number][];
      minute: number;
      phase: MatchPhase;
      score: { A: number; B: number };
    }
  | { type: "state"; state: GameState; stats: H2HStatsPayload }
  | { type: "event"; name: string; payload: unknown }
  | { type: "done"; state: GameState; stats: H2HStatsPayload };

/**
 * The worker's statistics and ratings as plain data. `snapshot` + `ratings` restore the stores exactly
 * (`importStatsState` / `importRatings`), which is all `buildPlayedMatchRecording` reads; `teams` and `goals` are
 * the same numbers ready to show.
 */
export interface H2HStatsPayload {
  snapshot: StatsSnapshot;
  ratings: [number, number][];
  teams: { A: TeamStats; B: TeamStats };
  goals: GoalLogEntry[];
}

// ── Socket (main process → browsers) ─────────────────────────────────────────

/**
 * A player as the browsers get him: the engine-only fields are left out (`fit`, `baseStats`, `decisionMemory`,
 * `engine`, `bounds`, `fatigueBaselineEnergy`) and the numbers rounded. `runtimeStats` stays (the bench rating).
 */
/**
 * A player on the wire: without the engine-only fields, but with his position aptitudes (`fit.aptitudes`, a few
 * bytes): the screens show each player's natural position from them (report: every bench player read ST / CM / CB).
 */
export type H2HWirePlayer = Omit<GamePlayer, "fit" | "baseStats" | "decisionMemory" | "engine" | "bounds" | "fatigueBaselineEnergy"> & {
  fit?: { aptitudes: NonNullable<GamePlayer["fit"]>["aptitudes"] };
};

/**
 * The match state as the browsers get it (`h2h_state`). `benchA` / `benchB` are absent when unchanged since the
 * last state this socket got (a join or a rejoin always gets them); `throughBallCellsCache` is never sent.
 */
export type H2HWireState = Omit<GameState, "players" | "benchA" | "benchB" | "throughBallCellsCache"> & {
  players: H2HWirePlayer[];
  benchA?: H2HWirePlayer[];
  benchB?: H2HWirePlayer[];
};

/**
 * Statistics for the browsers (`h2h_state`): `teams`, `goals` and `ratings` every time; `snapshot` (the whole store,
 * ~20 KB) only every few seconds, after an event and on a join (absent = keep the last one).
 */
export interface H2HWireStats {
  teams: { A: TeamStats; B: TeamStats };
  goals: GoalLogEntry[];
  ratings: [number, number][];
  snapshot?: StatsSnapshot;
}

/** Why a room closed (`h2h_closed`). */
export type H2HCloseReason = "simulated" | "left" | "lost" | "failed";

/** Position frame relayed to the browsers (`h2h_frame`). */
export type H2HFrame = Omit<Extract<WorkerOut, { type: "frame" }>, "type">;
