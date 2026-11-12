/**
 * The goal standing up (10.7): with the side-view figures the goals are drawn upright (posts, crossbar, a net falling
 * behind) and with a mouth wider than the real one, so they read next to figures much bigger than a real player.
 * Pure geometry and the drawing-only stretch of what happens near a goal. Nothing reaches the engine.
 */
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH } from "@/GameEngine/Domain/pitch";

export const STANDING_GOAL = {
  /** The drawn mouth is this many times the real one. */
  MOUTH: 1.5,
  /** The stretch fades in over this many yards from the goal line. */
  REACH_YDS: 9,
  /** Beyond this lateral distance from the middle of the goal (yards) nothing moves. */
  OUTER_YDS: 11,
  /** The crossbar is this many times the height of a standing figure. */
  HEIGHT: 1.28,
  /** How far the net reaches behind the line (yards) and how high it still is there (share of the height). */
  DEPTH_YDS: 3.2,
  ROOF: 0.5,
  /** The posts lean back from the pitch by this share of the height. */
  LEAN: 0.08,
  /** Side of a net cell in marker radii, and the look of the net. */
  MESH_CELL: 0.55,
  MESH_ALPHA: 0.42,
  FRONT_MESH_ALPHA: 0.6,
  NET_FILL: 0.1,
  /** Posts and bars, in marker radii; colours. */
  POST_W: 0.22,
  BAR_W: 0.1,
  POST: 0xf6f6f6,
  BAR: 0xd6dade,
  OUTLINE: 0x22242c,
  SHADOW_ALPHA: 0.26,
} as const;

const CENTRE = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
const HALF = (GOAL_Y_MAX - GOAL_Y_MIN) / 2;

/**
 * Where something at (x, y) yards is drawn across the pitch when the goals are the wide standing ones: near a goal
 * line the real mouth is stretched onto the drawn one (a shot inside the post is drawn inside the drawn post, one just
 * wide stays outside it), the band next to it is squeezed, and from `OUTER_YDS` out nothing moves. The stretch fades
 * with the distance from the line. Continuous and increasing in y; the same at both ends and on both sides.
 */
export function goalWarpY(x: number, y: number): number {
  const G = STANDING_GOAL;
  const fromLine = Math.max(0, Math.min(x, PITCH_LENGTH - x));
  const k = Math.max(0, 1 - fromLine / G.REACH_YDS);
  if (k === 0) return y;
  const d = y - CENTRE, a = Math.abs(d);
  if (a >= G.OUTER_YDS) return y;
  const wide = HALF * G.MOUTH;
  const full = a <= HALF ? a * G.MOUTH : wide + ((a - HALF) * (G.OUTER_YDS - wide)) / (G.OUTER_YDS - HALF);
  return CENTRE + Math.sign(d) * (a + (full - a) * k);
}

export interface Pt { x: number; y: number }

export interface StandingGoalShape {
  /** On the ground: far post, near post (the near one is lower on the screen), and the net's feet behind them. */
  farFoot: Pt; nearFoot: Pt; farBack: Pt; nearBack: Pt;
  /** Up in the air: the tops of the posts and of the back bars. */
  farTop: Pt; nearTop: Pt; farBackTop: Pt; nearBackTop: Pt;
}

/**
 * The corners of a standing goal in canvas px. `lineX` is the goal line, `centreY` the middle of the mouth, `away` the
 * side the net falls to (−1 = left end, 1 = right end), `scale` px per yard, `height` the crossbar's height in px.
 */
export function standingGoalShape(lineX: number, centreY: number, away: 1 | -1, scale: number, height: number): StandingGoalShape {
  const G = STANDING_GOAL;
  const half = HALF * G.MOUTH * scale;
  const up = { x: away * G.LEAN * height, y: -height };
  const depth = away * G.DEPTH_YDS * scale;
  const farFoot = { x: lineX, y: centreY - half }, nearFoot = { x: lineX, y: centreY + half };
  const farBack = { x: lineX + depth, y: farFoot.y }, nearBack = { x: lineX + depth, y: nearFoot.y };
  const lift = (p: Pt, k: number): Pt => ({ x: p.x + up.x * k, y: p.y + up.y * k });
  return {
    farFoot, nearFoot, farBack, nearBack,
    farTop: lift(farFoot, 1), nearTop: lift(nearFoot, 1), farBackTop: lift(farBack, G.ROOF), nearBackTop: lift(nearBack, G.ROOF),
  };
}

/** A net panel between four corners (a→b→c→d around it): the line segments of its mesh, `n` × `m` cells. */
export function meshLines(a: Pt, b: Pt, c: Pt, d: Pt, n: number, m: number): [Pt, Pt][] {
  const mix = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const out: [Pt, Pt][] = [];
  for (let i = 1; i < n; i++) out.push([mix(a, b, i / n), mix(d, c, i / n)]);
  for (let j = 1; j < m; j++) out.push([mix(a, d, j / m), mix(b, c, j / m)]);
  return out;
}
