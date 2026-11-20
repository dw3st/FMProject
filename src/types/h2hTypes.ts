import type { GamePlayer, GameState, MatchPhase, PenaltyOutcome } from "@/GameEngine/types";
import type { LiveMatchInput } from "@/Domain/match/liveMatchSetup";
import type { CustomFormation, Mentality, SlotInstruction, TacticalAxes, TacticalStyle } from "@/types/tacticsTypes";
import type { StatsSnapshot, TeamStats, GoalLogEntry } from "@/GameEngine/Domain/Statistics";
import type { Highlight, HighlightLevel } from "@/GameEngine/Domain/Highlights";
import type { ForecastEvent } from "@/GameEngine/Support/ForecastCore";
import type { MatchPlayMode } from "@/Domain/match/liveModes";

/** Engine side of a live match between two managers: A = home. */
export type H2HSide = "A" | "B";

/** A manager in the match room: `away` (not in), `in` (in the room), `ready` (clicked Start). */
export type H2HSeatStatus = "away" | "in" | "ready";

export type H2HPhase = "lobby" | "live" | "done" | "closed";

/** Match speed a manager asks for (`H2H.SPEEDS`). */
export type H2HSpeed = 1 | 2 | 4;

export interface H2HSideView {
  seatId: string;
  nickname: string | null;
  clubId: string;
  clubName: string;
  status: H2HSeatStatus;
  pausesLeft: number;
  connected: boolean;
  /** The speed this manager asked for. */
  speed: H2HSpeed;
  /** How he wants the match to play (stage 22): the whole 90' sped up, or only the lances, and their level. */
  mode: MatchPlayMode;
  level: HighlightLevel;
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
  /** The speed the match runs at: the lower of the choices of the managers in the match. */
  speed: H2HSpeed;
  /** How the match plays: only the lances when both asked for them, at the more complete of the two levels. */
  mode: MatchPlayMode;
  level: HighlightLevel;
}

/** A manager's command on his own side (engine player ids, `GamePlayer.id`). */
export type H2HCommand =
  | { kind: "sub"; outId: number; inId: number }
  /** Takes a queued substitution back before it happens (by the player going off). */
  | { kind: "unsub"; outId: number }
  | { kind: "swap"; aId: number; bId: number }
  /** A starter moves to a slot nobody holds (after a red card or an injury). */
  | { kind: "move"; id: number; slot: number }
  | { kind: "mentality"; mentality: Mentality }
  | { kind: "tactics"; style: TacticalStyle; axesOverride?: Partial<TacticalAxes> }
  /**
   * A ready-made formation by id, or one of the manager's own (`user:free`, `user:A`…) with its slots in `custom`
   * (validated like the Formation screen's free formation).
   */
  | { kind: "formation"; formation: string; custom?: CustomFormation }
  | { kind: "instruction"; slot: number; instruction: SlotInstruction | null }
  | { kind: "marks"; marks: { markerSlot: number; targetId: number }[] }
  /** The manager complains about the last call against his side (9.6.5): the server decides the card. */
  | { kind: "complain" }
  /** Mode B: "next lance". The lance ends once every manager in charge of his side asked (stage 22). */
  | { kind: "skip" };

/** Main process → match worker. */
export type WorkerIn =
  | { type: "init"; input: LiveMatchInput; mode?: MatchPlayMode; level?: HighlightLevel }
  | { type: "cmd"; side: H2HSide; cmd: H2HCommand }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "auto"; side: H2HSide; on: boolean }
  /** A complaint that got the referee on the other side's back (`refereeBias`). */
  | { type: "bias"; team: H2HSide; amount: number }
  | { type: "speed"; factor: number }
  | { type: "penalty"; outcome: PenaltyOutcome };

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
      /**
       * Stage 22: frames go out at a fixed real rate (`H2H.FRAME_MS`), not one per sim step. `steps` = sim steps since
       * the frame before, `path` = the ball at each of those steps but the last (yards, 0.1), so the drawing follows the
       * ball's flight; `rate` = game-seconds per real second right now (the screen's clock); `jump` = mode B skipped to
       * another moment (no blend with the frame before).
       */
      steps?: number;
      path?: [number, number][];
      rate?: number;
      jump?: true;
    }
  | { type: "state"; state: GameState; stats: H2HStatsPayload }
  /** Mode B: the lances known so far and how far the forecast reached. */
  | { type: "highlights"; view: H2HHighlightsView }
  /** Mode B: the match jumped over a stretch; the news of that stretch (the feed). */
  | { type: "jump"; jump: H2HJump }
  /** A manager changed something (mode B forecasts again; the other manager is told). */
  | { type: "order"; side: H2HSide; kind: H2HCommand["kind"] }
  /** Mode B: who asked for the next lance (empty = nobody, the lance went on or ended). */
  | { type: "skipVotes"; sides: H2HSide[] }
  | { type: "event"; name: string; payload: unknown }
  | { type: "done"; state: GameState; stats: H2HStatsPayload };

/** Mode B on the server (stage 22): the windows without their snapshots. */
export interface H2HHighlightsView {
  level: HighlightLevel;
  windows: Highlight[];
  forecastClock: number;
  waiting: boolean;
  done: boolean;
}

export interface H2HJump {
  from: number;
  to: number;
  fromMinute: number;
  toMinute: number;
  events: ForecastEvent[];
}

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
