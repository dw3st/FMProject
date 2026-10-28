/**
 * Pure helpers of the live match between two managers on the page (multiplayer part 7): the server's wire state
 * turned into a `GameState` the screen can read, and the parsing of the `h2h_*` socket events.
 */
import type { GamePlayer, GameState } from "@/GameEngine/types";
import type { H2HSide, H2HWireState } from "@/types/h2hTypes";
import type { ServerEvent } from "@/types/socialTypes";

/**
 * The wire state as a `GameState`. The engine-only player fields (`baseStats`, …) are absent and `fit` carries only
 * the position aptitudes (the natural position the screens show). Benches left out of the wire (unchanged) keep the
 * last ones.
 */
export function mergeWireState(prev: GameState | null, wire: H2HWireState): GameState {
  const { benchA, benchB, ...rest } = wire;
  return {
    ...rest,
    players: wire.players as unknown as GamePlayer[],
    benchA: (benchA ?? prev?.benchA ?? []) as unknown as GamePlayer[],
    benchB: (benchB ?? prev?.benchB ?? []) as unknown as GamePlayer[],
    pendingSubsA: rest.pendingSubsA ?? [],
    pendingSubsB: rest.pendingSubsB ?? [],
    throughBallCellsCache: null,
  } as GameState;
}

export type H2HServerEvent = Extract<ServerEvent, { type: `h2h_${string}` }>;

const H2H_TYPES = new Set([
  "h2h_room", "h2h_frame", "h2h_state", "h2h_event", "h2h_paused", "h2h_closed", "h2h_done", "h2h_penalty_result",
]);

/**
 * An `h2h_*` event of this game (`saveId`, `fixtureId`), or null (another game, another event, a malformed frame).
 * Only the shape the screen relies on is checked.
 */
export function parseH2HEvent(raw: unknown, saveId: string, fixtureId: string): H2HServerEvent | null {
  if (typeof raw !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (typeof e.type !== "string" || !H2H_TYPES.has(e.type)) return null;
  if (e.type === "h2h_room") {
    const room = e.room as Record<string, unknown> | undefined;
    if (!room || room.saveId !== saveId || room.fixtureId !== fixtureId) return null;
    if (e.mySide !== "A" && e.mySide !== "B") return null;
    return v as H2HServerEvent;
  }
  if (e.saveId !== saveId || e.fixtureId !== fixtureId) return null;
  switch (e.type) {
    case "h2h_frame":
      return Array.isArray(e.ball) && Array.isArray(e.players) ? (v as H2HServerEvent) : null;
    case "h2h_state":
      return e.state && typeof e.state === "object" && Array.isArray((e.state as { players?: unknown }).players) && e.stats
        ? (v as H2HServerEvent)
        : null;
    case "h2h_event":
      return typeof e.name === "string" ? (v as H2HServerEvent) : null;
    case "h2h_penalty_result":
      return e.outcome && typeof e.outcome === "object" && typeof (e.outcome as { scored?: unknown }).scored === "boolean"
        ? (v as H2HServerEvent)
        : null;
    default:
      return v as H2HServerEvent;
  }
}

/** "0:24" for the seconds left of a pause (never negative). */
export function pauseClock(untilMs: number, nowMs: number): string {
  const s = Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The other side. */
export function otherSide(side: H2HSide): H2HSide {
  return side === "A" ? "B" : "A";
}
