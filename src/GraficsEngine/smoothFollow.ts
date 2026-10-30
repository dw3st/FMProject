/**
 * Critically damped follow (drawing only): a drawn position chases its target with continuous velocity, so a figure
 * eases into a run and brakes to a stop instead of starting and stopping at full speed (tester report: the assistants
 * and the players looked stiff). Same idea as Unity's SmoothDamp. Pure.
 */
export interface Follow { x: number; y: number; vx: number; vy: number }

/**
 * One step of `f` toward `target`: reaches it in about `smoothTime` (seconds of the clock `dt` is in), never faster
 * than `maxSpeed` (units per second; Infinity = no cap). Never overshoots.
 */
export function smoothDamp(f: Follow, target: { x: number; y: number }, smoothTime: number, dt: number, maxSpeed = Infinity): Follow {
  if (dt <= 0) return f;
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let cx = f.x - target.x, cy = f.y - target.y;
  const maxLen = maxSpeed * st;
  const len = Math.hypot(cx, cy);
  if (len > maxLen) { cx *= maxLen / len; cy *= maxLen / len; }
  const tx = f.x - cx, ty = f.y - cy;
  const tempX = (f.vx + omega * cx) * dt, tempY = (f.vy + omega * cy) * dt;
  let vx = (f.vx - omega * tempX) * k, vy = (f.vy - omega * tempY) * k;
  let nx = tx + (cx + tempX) * k, ny = ty + (cy + tempY) * k;
  // No overshoot past the target.
  const ox = target.x - f.x, oy = target.y - f.y;
  if (ox * (nx - target.x) + oy * (ny - target.y) > 0) { nx = target.x; ny = target.y; vx = 0; vy = 0; }
  return { x: nx, y: ny, vx, vy };
}

export function followAt(p: { x: number; y: number }): Follow {
  return { x: p.x, y: p.y, vx: 0, vy: 0 };
}

/**
 * The players drawn through `smoothDamp` (real seconds): a jump past `teleport` (yards) or a new player snaps. The
 * smoothing follows the game speed so a 4× match lags no more on the pitch than a 1× one.
 */
export function smoothPlayers(
  state: Map<number, Follow>,
  targets: Map<number, { x: number; y: number }>,
  dtReal: number,
  gameSpeed: number,
  teleport: number,
  smoothTime = SMOOTH_PLAYERS_S,
): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const st = smoothTime / Math.max(1, gameSpeed);
  for (const [id, t] of targets) {
    const prev = state.get(id);
    const next = !prev || Math.hypot(t.x - prev.x, t.y - prev.y) > teleport ? followAt(t) : smoothDamp(prev, t, st, dtReal);
    state.set(id, next);
    out.set(id, { x: next.x, y: next.y });
  }
  for (const id of [...state.keys()]) if (!targets.has(id)) state.delete(id);
  return out;
}

/** Players: about 1/14 s of easing on top of the step interpolation (removes the kink at each 0.2 s sim step). */
export const SMOOTH_PLAYERS_S = 0.07;
/** Assistants: ease into the run and brake at the offside line (game seconds). */
export const SMOOTH_ASSISTANT_S = 0.45;
