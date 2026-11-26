/**
 * The penalty taker's run-up during the in-match penalty countdown (art preview, 4.41.17): he walks back from the
 * spot, waits, runs in, stops for a beat just short of the ball (the stutter) and strikes. Drawing only: the engine
 * keeps him on the spot and resolves the kick when the countdown ends.
 * `k` = share of the countdown gone (0..1); the result is how far behind the spot (yards, against his attack) and to
 * his side he is drawn.
 */
export const RUN_UP = {
  BACK_YDS: 3.5, SIDE_YDS: 1,
  /** Ends of the phases, as shares of the countdown: walk back, wait, run in, stutter, strike. */
  WALK: 0.4, WAIT: 0.55, RUN: 0.78, STUTTER: 0.9,
  STUTTER_YDS: 1.1,
} as const;

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export function penaltyRunUp(k: number): { back: number; side: number } {
  const R = RUN_UP;
  if (k <= 0) return { back: 0, side: 0 };
  if (k < R.WALK) {
    const t = smooth(k / R.WALK);
    return { back: R.BACK_YDS * t, side: R.SIDE_YDS * t };
  }
  if (k < R.WAIT) return { back: R.BACK_YDS, side: R.SIDE_YDS };
  if (k < R.RUN) {
    const t = smooth((k - R.WAIT) / (R.RUN - R.WAIT));
    return { back: R.BACK_YDS + (R.STUTTER_YDS - R.BACK_YDS) * t, side: R.SIDE_YDS * (1 - t * 0.6) };
  }
  if (k < R.STUTTER) return { back: R.STUTTER_YDS, side: R.SIDE_YDS * 0.4 };
  const t = smooth((k - R.STUTTER) / (1 - R.STUTTER));
  return { back: R.STUTTER_YDS * (1 - t) + 0.3 * t, side: R.SIDE_YDS * 0.4 * (1 - t) };
}

/**
 * The countdown as drawn: the engine drains it once per sim step, so read straight off the state the run-up moves in
 * jumps every 0.2 s and the figure flickers between walking and standing. Blended between the previous step and the
 * newest one by the same share as the drawn positions (`alpha`); a different restart before uses the newest one.
 */
export function drawnCountdown(
  prev: { type: string; takerId?: number; countdown: number } | null | undefined,
  cur: { type: string; takerId?: number; countdown: number },
  alpha: number,
): number {
  if (!prev || prev.type !== cur.type || prev.takerId !== cur.takerId || prev.countdown < cur.countdown) return cur.countdown;
  return prev.countdown + (cur.countdown - prev.countdown) * Math.max(0, Math.min(1, alpha));
}
