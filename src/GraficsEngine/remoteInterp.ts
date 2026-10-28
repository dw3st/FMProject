/**
 * Drawing a match the server runs (multiplayer part 7, live match between two managers).
 *
 * The browser never simulates: it gets a position frame every `H2H.FRAME_MS` (`h2h_frame`) and draws
 * `lerp(prev, last, (now − last.at) / step)` — the last two frames blended by the real time since the newest one
 * arrived, limited to 1 (a late frame freezes on the last one instead of extrapolating). One frame of delay buys a
 * smooth drawing whatever the network jitter. Drawing only: nothing here reaches a `GameState` the engine reads.
 */
import { clamp } from "@/Domain/math";
import type { GameState } from "@/GameEngine/types";
import { arcHeight } from "@/GraficsEngine/ballHeight";
import { BALL_HEIGHT } from "@/GraficsEngine/pitchStyle";
import { lerpPos, type DrawnBall, type Pos } from "@/GraficsEngine/renderInterp";

/** A position frame as the pitch keeps it: when it arrived (local ms), the ball and every player by id. */
export interface RemoteFrame {
  at: number;
  ball: Pos;
  players: Map<number, Pos>;
}

/** The two frames the drawing blends between (`seq` grows with every frame, so readers can spot a new one). */
export interface RemoteFrames {
  prev: RemoteFrame | null;
  last: RemoteFrame | null;
  seq: number;
}

export const EMPTY_REMOTE_FRAMES: RemoteFrames = { prev: null, last: null, seq: 0 };

/** What the pitch reads in remote mode: the frames, filled by the match screen from the socket. */
export interface RemoteFeed {
  frames: { current: RemoteFrames };
  /** Real ms between two frames (the blend step). */
  stepMs: number;
}

/** A frame off the wire (`[id, x, y]` players, `[x, y]` ball) received at `at`. */
export function toRemoteFrame(wire: { ball: [number, number]; players: [number, number, number][] }, at: number): RemoteFrame {
  const players = new Map<number, Pos>();
  for (const [id, x, y] of wire.players) players.set(id, { x, y });
  return { at, ball: { x: wire.ball[0], y: wire.ball[1] }, players };
}

/** The pair after a new frame: the newest becomes `last`, the old `last` becomes `prev`. */
export function pushRemoteFrame(frames: RemoteFrames, frame: RemoteFrame): RemoteFrames {
  return { prev: frames.last, last: frame, seq: frames.seq + 1 };
}

/** `(now − lastAt) / step`, limited to 0..1. */
export function remoteAlpha(now: number, lastAt: number, step: number): number {
  return step > 0 ? clamp((now - lastAt) / step, 0, 1) : 1;
}

/**
 * Drawn positions at `now`: every player of the last frame blended from the frame before (a player new in the last
 * frame, a substitute, is drawn as is; a jump bigger than `maxStep` yards too). Null before the first frame.
 */
export function remotePositions(
  frames: RemoteFrames,
  now: number,
  step: number,
  maxStep: number,
  ballMaxStep: number = maxStep,
): { players: Map<number, Pos>; ball: Pos } | null {
  const last = frames.last;
  if (!last) return null;
  const prev = frames.prev;
  if (!prev) return { players: new Map(last.players), ball: { ...last.ball } };
  const alpha = remoteAlpha(now, last.at, step);
  const players = new Map<number, Pos>();
  for (const [id, cur] of last.players) {
    const was = prev.players.get(id);
    players.set(id, was ? lerpPos(was, cur, alpha, maxStep) : { x: cur.x, y: cur.y });
  }
  return { players, ball: lerpPos(prev.ball, last.ball, alpha, ballMaxStep) };
}

/** How far from the flight line (yards) a drawn ball may be and still be on that flight. */
const ON_FLIGHT_YDS = 3;

function progressOnSegment(ax: number, ay: number, bx: number, by: number, p: Pos): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) return null;
  const t = ((p.x - ax) * dx + (p.y - ay) * dy) / len2;
  if (t < -0.05 || t > 1.05) return null;
  const qx = ax + dx * t - p.x;
  const qy = ay + dy * t - p.y;
  return qx * qx + qy * qy <= ON_FLIGHT_YDS * ON_FLIGHT_YDS ? clamp(t, 0, 1) : null;
}

/**
 * Illustrative ball height for a remote ball: the flight progress comes from where the drawn ball is on the flight
 * line of the last state (a shot from `from` to `to`; a high pass ending at `to`, `distance` long), not from the
 * state's `t`, which is up to a second old. A ball off that line (the flight already ended) is on the ground.
 */
export function remoteBallHeight(state: Pick<GameState, "pass" | "shot">, ball: Pos): number {
  const s = state.shot;
  if (s) {
    const t = progressOnSegment(s.fromX, s.fromY, s.toX, s.toY, ball);
    return t === null ? 0 : arcHeight(s.header ? BALL_HEIGHT.HEADER : BALL_HEIGHT.SHOT, t);
  }
  const p = state.pass;
  if (!p) return 0;
  const peak =
    p.kind === "cross" ? BALL_HEIGHT.CROSS
      : p.kind === "long_ball" ? BALL_HEIGHT.LONG_BALL
        : p.kind === "clearance" ? BALL_HEIGHT.CLEARANCE
          : 0;
  if (peak === 0 || !(p.distance > 0)) return 0;
  const left = Math.hypot(p.toX - ball.x, p.toY - ball.y);
  if (left > p.distance + ON_FLIGHT_YDS) return 0;
  return arcHeight(peak, 1 - left / p.distance);
}

/** The drawn ball of a remote match: position from the frames, height from the flight of the last state. */
export function remoteDrawnBall(state: Pick<GameState, "pass" | "shot">, ball: Pos): DrawnBall {
  return { x: ball.x, y: ball.y, h: remoteBallHeight(state, ball) };
}

/**
 * The state with the positions of the newest frame (a player missing from the frame keeps his own): officials,
 * clicks and overlays read `stateRef`, so it follows the frames between two full states. Same object when nothing
 * moved.
 */
export function withFramePositions<S extends Pick<GameState, "players">>(state: S, frame: RemoteFrame): S {
  let changed = false;
  const players = state.players.map((p) => {
    const at = frame.players.get(p.id);
    if (!at || (at.x === p.x && at.y === p.y)) return p;
    changed = true;
    return { ...p, x: at.x, y: at.y };
  });
  return changed ? { ...state, players } : state;
}
