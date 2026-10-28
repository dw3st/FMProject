// Geometry and motion of the 2D penalty scene (4.39), pure: the goal drawn in a 400 × 300 box seen from behind the
// taker, the ball's curve, the keeper's dive and the net's bulge. `PenaltyPitch.tsx` draws it.
import { areaCentre, type GoalArea } from "@/Domain/penalty/penaltyKick";
import { mulberry32, seedFrom } from "@/Domain/rng";

export const SCENE = {
  W: 400, H: 300,
  GX: 200, LINE_Y: 168, HALF_W: 118, GOAL_H: 76, NET_DEPTH: 16,
  HORIZON: 136,
  BALL_START: { x: 200, y: 268 },
  /** Milliseconds: the taker's run-up, the ball's flight (shortened by power), the result after the flight. */
  RUNUP_MS: 420, FLIGHT_MS: 520, FLIGHT_POWER_MS: 160, REBOUND_MS: 450, DIVE_MS: 380,
  /** Net mesh: columns, rows. */
  NET_X: 16, NET_Y: 7,
} as const;

export interface Pt { x: number; y: number }

/** Goal space (x −1..1 post to post, y 0..1 line to bar) → scene px. */
export const goalToPx = (p: Pt): Pt => ({ x: SCENE.GX + p.x * SCENE.HALF_W, y: SCENE.LINE_Y - p.y * SCENE.GOAL_H });
export const pxToGoal = (x: number, y: number): Pt => ({ x: (x - SCENE.GX) / SCENE.HALF_W, y: (SCENE.LINE_Y - y) / SCENE.GOAL_H });

/** Point at `t` (0..1) on the quadratic curve from → ctrl → to. */
export function curveAt(from: Pt, ctrl: Pt, to: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x, y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y };
}

/** Control point of the shot: above the straight line, higher with power. */
export function shotControl(from: Pt, to: Pt, power: number): Pt {
  return { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 30 - power * 20 };
}

export const shotDuration = (power: number): number => SCENE.FLIGHT_MS - power * SCENE.FLIGHT_POWER_MS;

/** Height (px) of the ball above its ground shadow at `t` of the shot: the shadow runs along the ground to the line. */
export function ballHeight(from: Pt, to: Pt, pos: Pt, t: number): number {
  const groundY = from.y + (Math.max(to.y, SCENE.LINE_Y + 2) - from.y) * t;
  return Math.max(0, groundY - pos.y);
}

/** Keeper's dive to an area: where he ends, his tilt (degrees) and how high he jumps on the way. */
export function keeperDive(area: GoalArea): { x: number; y: number; rot: number; lift: number } {
  const c = goalToPx(areaCentre(area));
  const [row, col] = area.split("-") as ["low" | "high", "left" | "mid" | "right"];
  const side = col === "left" ? -1 : col === "right" ? 1 : 0;
  const x = side === 0 ? SCENE.GX : c.x - side * 10;
  const y = row === "high" ? SCENE.LINE_Y - 14 : SCENE.LINE_Y + 2;
  return { x, y, rot: side * (row === "high" ? 70 : 82), lift: row === "high" ? 26 : side === 0 ? 0 : 12 };
}

/** Ease out (cubic). */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Net mesh point (i column, j row) with the bulge of a goal at `bulge` (px), `age` seconds after it. */
export function netPoint(i: number, j: number, bulge: (Pt & { strength: number }) | null, age: number): Pt {
  const left = SCENE.GX - SCENE.HALF_W + 6, right = SCENE.GX + SCENE.HALF_W - 6;
  const bottom = SCENE.LINE_Y - SCENE.NET_DEPTH * 0.4, top = SCENE.LINE_Y - SCENE.GOAL_H + 6;
  const x = left + (i / SCENE.NET_X) * (right - left);
  const y = bottom - (j / SCENE.NET_Y) * (bottom - top);
  if (!bulge || age < 0) return { x, y };
  const d2 = ((x - bulge.x) ** 2 + (y - bulge.y) ** 2) / 900;
  const amp = bulge.strength * Math.exp(-d2) * Math.exp(-age * 2.4) * Math.cos(age * 11);
  return { x: x + (x - bulge.x) * amp * 0.012, y: y - amp * 0.6 + (y - bulge.y) * amp * 0.01 };
}

/** The net drawn as polylines (rows then columns). */
export function netPaths(bulge: (Pt & { strength: number }) | null, age: number): string[] {
  const out: string[] = [];
  const f = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  for (let j = 0; j <= SCENE.NET_Y; j++) {
    out.push(Array.from({ length: SCENE.NET_X + 1 }, (_, i) => (i ? "L" : "M") + f(netPoint(i, j, bulge, age))).join(""));
  }
  for (let i = 0; i <= SCENE.NET_X; i++) {
    out.push(Array.from({ length: SCENE.NET_Y + 1 }, (_, j) => (j ? "L" : "M") + f(netPoint(i, j, bulge, age))).join(""));
  }
  return out;
}

export interface Fan { x: number; y: number; team: "taker" | "keeper" | "neutral"; shade: number }

/** Crowd behind the goal: rows of fans, most in the two clubs' colours, the same for the same seed. */
export function crowdFans(seed: string): Fan[] {
  const rng = mulberry32(seedFrom(`penalty-crowd:${seed}`));
  const out: Fan[] = [];
  for (let row = 0; row < 9; row++) {
    for (let x = 2; x < SCENE.W; x += 5.5) {
      const r = rng();
      out.push({
        x: x + (row % 2) * 2.7, y: 50 + row * 9 + rng() * 2,
        team: r < 0.45 ? "taker" : r < 0.8 ? "keeper" : "neutral",
        shade: rng(),
      });
    }
  }
  return out;
}

/** Phone lights in the crowd at night. */
export function crowdPhones(seed: string, n = 70): { x: number; y: number; dur: number; delay: number }[] {
  const rng = mulberry32(seedFrom(`penalty-phones:${seed}`));
  return Array.from({ length: n }, () => ({ x: rng() * SCENE.W, y: 50 + rng() * 76, dur: 2 + rng() * 2.5, delay: rng() * 2 }));
}

/** Grass stripes in perspective: wider near the camera. */
export function grassStripes(n = 9): { y: number; h: number }[] {
  const span = SCENE.H - SCENE.HORIZON;
  return Array.from({ length: n }, (_, i) => {
    const y0 = SCENE.HORIZON + span * (i / n) ** 1.6;
    const y1 = SCENE.HORIZON + span * ((i + 1) / n) ** 1.6;
    return { y: y0, h: y1 - y0 + 0.5 };
  });
}
