/**
 * Match sound (leva 3): which cue an engine event plays and how loud the crowd is. Pure; the browser side synthesises
 * the sounds (`GameInterface/MatchAudio/matchAudio.ts`). Sound never touches the simulation.
 */
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

export type SoundCue =
  | "kick" | "pass" | "whistleShort" | "whistleLong" | "whistleEnd" | "goal" | "net" | "nearMiss" | "save" | "card";

/** Least time between two plays of the same cue (real seconds): a 4× match fires passes very fast. */
export const CUE_GAP_S: Record<SoundCue, number> = {
  kick: 0.08, pass: 0.18, whistleShort: 0.4, whistleLong: 0.8, whistleEnd: 2, goal: 2, net: 1, nearMiss: 1.2, save: 0.6, card: 0.8,
};

/** Crowd excitement 0..1 from where the ball is: quiet in midfield, loud near either goal. */
export function crowdExcitement(ball: { x: number; y: number }): number {
  const toGoal = Math.min(ball.x, PITCH_LENGTH - ball.x);
  const central = 1 - Math.min(1, Math.abs(ball.y - PITCH_WIDTH / 2) / (PITCH_WIDTH / 2));
  const near = Math.max(0, 1 - toGoal / 35);
  return Math.min(1, near * (0.6 + 0.4 * central));
}

/** Throttle: true when `cue` may play at `now` given the last play times (and records it). */
export function cueAllowed(last: Map<SoundCue, number>, cue: SoundCue, now: number): boolean {
  const t = last.get(cue);
  if (t !== undefined && now - t < CUE_GAP_S[cue]) return false;
  last.set(cue, now);
  return true;
}
