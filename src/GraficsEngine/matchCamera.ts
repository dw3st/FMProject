/**
 * Match camera and goal replay (art plan phase 5, from the art preview): an optional zoom that follows the ball, and
 * a short slow-motion replay of the seconds before a goal. Drawing only: the replay draws recorded positions while the
 * page holds the simulation; nothing reaches the engine. Pure.
 */
import { clamp } from "@/Domain/math";

export const CAMERA = {
  /** Zoom when following the ball, and during a replay. */
  FOLLOW_ZOOM: 1.6,
  REPLAY_ZOOM: 1.9,
  /** Exponential smoothing per real second of the zoom and of the centre. */
  ZOOM_RATE: 3,
  CENTRE_RATE: 4,
} as const;

export const REPLAY = {
  /** Real seconds kept before the goal. */
  WINDOW_S: 4.2,
  /** Real seconds after the goal before the replay starts (the celebration shows first). */
  DELAY_S: 1.6,
  /** Playback speed. */
  SPEED: 0.55,
  /** At most one recorded frame per this many seconds. */
  SAMPLE_S: 1 / 30,
  /** A replay needs at least this much recorded (seconds). */
  MIN_S: 1.5,
} as const;

export interface CameraView { zoom: number; x: number; y: number }

/** The camera after a frame: zoom toward `want`, centre toward `target`, kept inside the canvas. */
export function stepCamera(cam: CameraView, want: number, target: { x: number; y: number }, w: number, h: number, dt: number): CameraView {
  const zoom = cam.zoom + (want - cam.zoom) * Math.min(1, dt * CAMERA.ZOOM_RATE);
  // At zoom 1 the view is the whole canvas: the centre goes back to the middle.
  const k = Math.min(1, dt * CAMERA.CENTRE_RATE);
  const tx = zoom <= 1.001 ? w / 2 : target.x, ty = zoom <= 1.001 ? h / 2 : target.y;
  const hw = w / (2 * zoom), hh = h / (2 * zoom);
  return {
    zoom,
    x: clamp(cam.x + (tx - cam.x) * k, hw, w - hw),
    y: clamp(cam.y + (ty - cam.y) * k, hh, h - hh),
  };
}

/** One recorded frame: drawn positions (yards), ball drawn position and height. */
export interface ReplayFrame<P, B> { t: number; players: ReadonlyMap<number, P>; ball: B }

/** Adds a frame (real time `t`), keeping the last WINDOW_S + DELAY_S seconds. */
export function recordFrame<P, B>(buf: ReplayFrame<P, B>[], f: ReplayFrame<P, B>): ReplayFrame<P, B>[] {
  const last = buf[buf.length - 1];
  if (last && f.t - last.t < REPLAY.SAMPLE_S) return buf;
  const from = f.t - (REPLAY.WINDOW_S + REPLAY.DELAY_S + 0.5);
  const kept = buf.filter((x) => x.t >= from);
  kept.push(f);
  return kept;
}

/** The frames of a replay of a goal scored at `goalAt`: the window before it and a moment after. */
export function replayClip<P, B>(buf: readonly ReplayFrame<P, B>[], goalAt: number): ReplayFrame<P, B>[] | null {
  const clip = buf.filter((x) => x.t >= goalAt - REPLAY.WINDOW_S && x.t <= goalAt + 0.6);
  if (clip.length < 2 || clip[clip.length - 1]!.t - clip[0]!.t < REPLAY.MIN_S) return null;
  return clip;
}

/** The two frames around clip time `elapsed` (real seconds since the replay began, played at SPEED) and the blend. */
export function replayAt<P, B>(clip: readonly ReplayFrame<P, B>[], elapsed: number): { a: ReplayFrame<P, B>; b: ReplayFrame<P, B>; k: number } | null {
  const t = clip[0]!.t + elapsed * REPLAY.SPEED;
  if (t > clip[clip.length - 1]!.t) return null;
  let i = 0;
  while (i < clip.length - 2 && clip[i + 1]!.t < t) i++;
  const a = clip[i]!, b = clip[i + 1]!;
  return { a, b, k: clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1) };
}
