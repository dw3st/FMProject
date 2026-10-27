import type { GameState, MatchPhase } from "@/GameEngine/types";
import type { LiveMatchInput } from "@/Domain/match/liveMatchSetup";
import type { Mentality, SlotInstruction, TacticalAxes, TacticalStyle } from "@/types/tacticsTypes";

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
  | { type: "state"; state: GameState }
  | { type: "event"; name: string; payload: unknown }
  | { type: "done"; state: GameState; stats: unknown };
