// A live match state on the wire (multiplayer part 7 and watching a friend's match): the engine-only fields left out,
// numbers rounded. Used by the server's worker relay and by the browser that relays its own match.
import type { GamePlayer, GameState } from "@/GameEngine/types";
import type { H2HWirePlayer, H2HWireState } from "@/types/h2hTypes";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function roundStats<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "number" ? r3(v) : v;
  return out as T;
}

/** A player without the engine-only fields, numbers rounded (a player goes from ~2.2 KB to ~0.9 KB). */
export function wirePlayer(p: GamePlayer): H2HWirePlayer {
  const { fit: _f, baseStats: _b, decisionMemory: _d, engine: _e, bounds: _bo, fatigueBaselineEnergy: _fb, ...rest } = p;
  return {
    ...rest,
    ...(p.fit ? { fit: { aptitudes: p.fit.aptitudes } } : {}),
    x: r2(p.x),
    y: r2(p.y),
    energy: r2(p.energy),
    startEnergy: r2(p.startEnergy),
    targetPosition: { x: r2(p.targetPosition.x), y: r2(p.targetPosition.y) },
    runtimeStats: { withBall: roundStats(p.runtimeStats.withBall), withoutBall: roundStats(p.runtimeStats.withoutBall) },
  };
}

/** The wire state; `benches` false leaves the benches out (unchanged since the last state). */
export function wireState(state: GameState, benches: boolean): H2HWireState {
  const { players, benchA, benchB, throughBallCellsCache: _c, ...rest } = state;
  return {
    ...rest,
    players: players.map(wirePlayer),
    ...(benches ? { benchA: benchA.map(wirePlayer), benchB: benchB.map(wirePlayer) } : {}),
  };
}

