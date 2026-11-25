/**
 * The race track's centre line in the painted image (1600 × 900, `build_games_hall.py`): a stadium with straights from
 * x 520 to 1080 at y 190 and 710 and half circles of radius 260. Cars run clockwise from the finish line at x 800 on the
 * top straight. Pure, so the drawing can be tested.
 */
export const TRACK = { W: 1600, H: 900, X0: 520, X1: 1080, CY: 450, R: 260, FINISH_X: 800, HALF: 90 } as const;

const STRAIGHT = TRACK.X1 - TRACK.X0;
const ARC = Math.PI * TRACK.R;
/** One lap along the centre line, in image pixels. */
export const LAP = 2 * STRAIGHT + 2 * ARC;

export interface TrackPoint { x: number; y: number; /** Heading in degrees, 0 = to the right, clockwise. */ angle: number }

/** Point `s` pixels along the centre line from the finish line, pushed `lane` pixels outward. */
export function trackPoint(s: number, lane = 0): TrackPoint {
  let u = ((s % LAP) + LAP) % LAP;
  const firstHalf = TRACK.X1 - TRACK.FINISH_X;
  let x: number, y: number, hx: number, hy: number;
  if (u < firstHalf) { x = TRACK.FINISH_X + u; y = TRACK.CY - TRACK.R; hx = 1; hy = 0; }
  else if ((u -= firstHalf) < ARC) {
    const th = -Math.PI / 2 + u / TRACK.R;
    x = TRACK.X1 + TRACK.R * Math.cos(th); y = TRACK.CY + TRACK.R * Math.sin(th); hx = -Math.sin(th); hy = Math.cos(th);
  } else if ((u -= ARC) < STRAIGHT) { x = TRACK.X1 - u; y = TRACK.CY + TRACK.R; hx = -1; hy = 0; }
  else if ((u -= STRAIGHT) < ARC) {
    const th = Math.PI / 2 + u / TRACK.R;
    x = TRACK.X0 + TRACK.R * Math.cos(th); y = TRACK.CY + TRACK.R * Math.sin(th); hx = -Math.sin(th); hy = Math.cos(th);
  } else { u -= ARC; x = TRACK.X0 + u; y = TRACK.CY - TRACK.R; hx = 1; hy = 0; }
  // Outward normal of a clockwise run: the heading turned a quarter to the left.
  return { x: x + hy * lane, y: y - hx * lane, angle: (Math.atan2(hy, hx) * 180) / Math.PI };
}

export const RACE_LAPS = 3;
/** Distance between two finishers at the line, in pixels. */
const GAP = 55;

/**
 * Distance covered by each car at time t (0..1) of the race, so the cars finish in `order` (car numbers, winner first):
 * the winner crosses after RACE_LAPS laps exactly at t = 1, the others GAP apart. A small wave per car makes them swap
 * places on the way and vanishes at both ends.
 */
export function racePositions(order: readonly number[], t: number): Map<number, number> {
  const out = new Map<number, number>();
  const ease = t < 0.12 ? (t / 0.12) ** 2 * 0.06 : 0.06 + (t - 0.12) / 0.88 * 0.94;
  order.forEach((car, rank) => {
    const end = RACE_LAPS * LAP - GAP * rank;
    const wave = Math.sin(Math.PI * t) * Math.sin(t * (3 + (car % 3)) * Math.PI + car) * 140;
    out.set(car, end * ease + wave * Math.min(1, t * 6));
  });
  return out;
}

/** Lane of car n (1..8) across the track, outward pixels from the centre line. */
export const laneOf = (n: number) => -66 + (n - 1) * (132 / 7);
