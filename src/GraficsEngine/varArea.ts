/**
 * VAR review area (tester report, mock option A): a painted white zone at the halfway line of the drawn top touchline,
 * a pitchside monitor in it, and the referee running to it during a VAR review. Pure, drawing only: the review still
 * lasts VAR_CONFIG.REVIEW_SECONDS, nothing in the GameState changes.
 */
import { PITCH_LENGTH, PITCH_MID_X, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { OFFICIALS, type YdPos } from "@/GraficsEngine/officials";

export const VAR_AREA = {
  /** Zone in drawn yards (y 0 = the drawn top touchline, negative = the run-off): ±HALF_W around the halfway line. */
  HALF_W: 4,
  TOP: -3.3,
  BOTTOM: 2.6,
  /** Monitor centre (drawn yards off the touchline) and width; the painted monitor is 192 × 137. */
  MONITOR_Y: -1.9,
  MONITOR_W: 3.6,
  MONITOR_ASPECT: 137 / 192,
  /** Where the referee stands to watch, inside the pitch. */
  STAND_Y: 1.5,
  /** He arrives with this much of the review left to look at the monitor (real seconds). */
  LOOK_S: 1.4,
  /** Running back to the play after the review: no jump, at least this fast (yd per game second). */
  BACK_SPEED: 16,
  /** How long the run back may take before the normal referee movement takes over (real seconds). */
  BACK_S: 2.5,
} as const;

/** The zone in drawn yards (screen space: always at the top, like the LED boards). */
export function varZone(): { x0: number; y0: number; x1: number; y1: number } {
  const A = VAR_AREA;
  return { x0: PITCH_MID_X - A.HALF_W, y0: A.TOP, x1: PITCH_MID_X + A.HALF_W, y1: A.BOTTOM };
}

/** A drawn point in ENGINE yards (the pitch is turned 180° when mirrored). */
function engineOf(x: number, y: number, mirror: boolean): YdPos {
  return mirror ? { x: PITCH_LENGTH - x, y: PITCH_WIDTH - y } : { x, y };
}

/** Where the referee stands at the monitor, in engine yards. */
export function varStandSpot(mirror: boolean): YdPos {
  return engineOf(PITCH_MID_X, VAR_AREA.STAND_Y, mirror);
}

/** The monitor, in engine yards (the referee looks at it). */
export function varMonitorSpot(mirror: boolean): YdPos {
  return engineOf(PITCH_MID_X, VAR_AREA.MONITOR_Y, mirror);
}

/**
 * One step of the referee's run to the monitor: fast enough to arrive with LOOK_S of the review left
 * (`countdown` = review seconds left), never slower than his normal top speed, never a jump.
 */
export function reviewRunStep(pos: YdPos, target: YdPos, dtGame: number, countdown: number): YdPos {
  const speed = Math.max(OFFICIALS.REF_SPEED, Math.hypot(target.x - pos.x, target.y - pos.y) / Math.max(0.05, countdown - VAR_AREA.LOOK_S));
  return runStep(pos, target, dtGame, speed);
}

/** Straight at `speed` (yd per game second), no smoothing and no jump. */
export function runStep(pos: YdPos, target: YdPos, dtGame: number, speed: number): YdPos {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || dtGame <= 0) return pos;
  const step = Math.min(d, speed * dtGame);
  return { x: pos.x + (dx / d) * step, y: pos.y + (dy / d) * step };
}
