/**
 * Managers on the touchline (pure, drawing only): technical-area spots in drawn px and the short
 * gestures (spec 2026-10-08-match-visual §4). They never switch sides at half time, like real benches.
 */
import type { PitchMetrics } from "@/GraficsEngine/pitchMetrics";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

export type CoachGestureKind = "attack" | "defend" | "balanced" | "celebrate";

/** Seconds of a gesture (real time, on the effects clock). */
export const GESTURE_DURATION = 1.2;
/** Coach spots along the drawn pitch length (left coach, right coach). */
export const COACH_X_FRAC = { left: 0.4, right: 0.6 } as const;
/** Fraction of the side run-off below the touchline where the coach stands. */
const RUNOFF_FRAC = 0.55;
/** Minimum distance from the canvas edge without a stadium (px). */
const EDGE_PX = 6;

export interface CoachPose {
  /** Arm angles away from the body at rest (rad); see coachGesture for each kind. */
  armL: number; armR: number;
  /** Jump height (px). */
  jumpPx: number;
}

const REST: CoachPose = { armL: 0, armR: 0, jumpPx: 0 };

/**
 * Technical areas (px): below the bottom touchline, in the run-off, at 40% and 60% of the drawn
 * pitch length; the coach of the team drawn on the left stands at 40%. Without a stadium the spot
 * is kept EDGE_PX inside the canvas (`canvasH`).
 */
export function coachSlots(m: PitchMetrics, canvasH?: number): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const bottom = m.stand ? m.stand.outer.y + m.stand.outer.h : canvasH;
  let y = m.marginY + m.height + STADIUM.RUNOFF_YDS * m.scale * RUNOFF_FRAC;
  if (bottom !== undefined) y = Math.min(y, bottom - EDGE_PX);
  return {
    left: { x: m.marginX + COACH_X_FRAC.left * m.width, y },
    right: { x: m.marginX + COACH_X_FRAC.right * m.width, y },
  };
}

/**
 * Pose `t` real seconds into a gesture; exactly at rest at 0 and at GESTURE_DURATION.
 * - attack: the right arm points forward (towards the attack), the left half-raised;
 * - defend: both arms pushed down twice ("calm down, drop back");
 * - balanced: arms opened once;
 * - celebrate: arms up and two short jumps.
 */
export function coachGesture(kind: CoachGestureKind, t: number): CoachPose {
  const p = t / GESTURE_DURATION;
  if (!(p > 0 && p < 1)) return { ...REST };
  const once = Math.sin(Math.PI * p);
  const twice = Math.abs(Math.sin(2 * Math.PI * p));
  switch (kind) {
    case "attack": return { armL: 0.6 * once, armR: 1.5 * once, jumpPx: 0 };
    case "defend": return { armL: 0.8 * twice, armR: 0.8 * twice, jumpPx: 0 };
    case "balanced": return { armL: 1.2 * once, armR: 1.2 * once, jumpPx: 0 };
    case "celebrate": return { armL: 2.6 * once, armR: 2.6 * once, jumpPx: 6 * twice };
  }
}
