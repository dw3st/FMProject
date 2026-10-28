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
  RUNUP_MS: 420, FLIGHT_MS: 520, FLIGHT_POWER_MS: 160, REBOUND_MS: 450, DIVE_MS: 520,
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

// ── Limbs (4.38.3): two-segment arms drawn as round-capped strokes, in each figure's own frame (feet at y 0) ──

export interface ArmPose { shoulder: Pt; elbow: Pt; hand: Pt }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const mirror = (p: Pt): Pt => ({ x: -p.x, y: p.y });

/** Keeper's left arm (the right one is its mirror) at a reach: −1 hands low (crouch), 0 ready stance, 1 over the head. */
const KEEPER_ARM = {
  shoulder: { x: -11, y: -42 },
  low: { elbow: { x: -16, y: -31 }, hand: { x: -17, y: -21 } },
  ready: { elbow: { x: -19, y: -34 }, hand: { x: -24, y: -27 } },
  up: { elbow: { x: -14, y: -56 }, hand: { x: -10, y: -71 } },
} as const;

export function keeperArms(reach: number, bob = 0): { left: ArmPose; right: ArmPose } {
  const r = Math.max(-1, Math.min(1, reach));
  const A = KEEPER_ARM;
  const elbow = r < 0 ? lerpPt(A.ready.elbow, A.low.elbow, -r) : lerpPt(A.ready.elbow, A.up.elbow, r);
  const hand = r < 0 ? lerpPt(A.ready.hand, A.low.hand, -r) : lerpPt(A.ready.hand, A.up.hand, r);
  const left = { shoulder: A.shoulder, elbow: { x: elbow.x, y: elbow.y + bob * 0.5 }, hand: { x: hand.x, y: hand.y + bob } };
  return { left, right: { shoulder: mirror(left.shoulder), elbow: mirror(left.elbow), hand: { x: -left.hand.x, y: hand.y - bob } } };
}

/** How far the keeper's arms reach on a dive to an area. */
export function diveReach(area: GoalArea): number {
  const [row, col] = area.split("-");
  if (row === "high") return 1;
  return col === "mid" ? 0.15 : 0.8;
}

/**
 * Taker seen from behind at `run` (0 on the spot … 1 at the ball): arms swing with the steps, legs lift in turn, and
 * at the ball the kicking (right) leg swings through and the arms open for balance.
 */
export function takerPose(run: number): { left: ArmPose; right: ArmPose; legL: number; legR: number; kick: number } {
  const swing = run < 1 ? Math.sin(run * Math.PI * 3) : 0;
  const kick = run >= 0.85 ? (run - 0.85) / 0.15 : 0;
  const sh = { x: -13, y: -54 };
  const hangL = { elbow: { x: -16, y: -42 - 3 * swing }, hand: { x: -17, y: -31 - 5 * swing } };
  const hangR = { elbow: { x: 16, y: -42 + 3 * swing }, hand: { x: 17, y: -31 + 5 * swing } };
  const openL = { elbow: { x: -22, y: -46 }, hand: { x: -28, y: -40 } };
  const openR = { elbow: { x: 18, y: -40 }, hand: { x: 16, y: -30 } };
  return {
    left: { shoulder: sh, elbow: lerpPt(hangL.elbow, openL.elbow, kick), hand: lerpPt(hangL.hand, openL.hand, kick) },
    right: { shoulder: mirror(sh), elbow: lerpPt(hangR.elbow, openR.elbow, kick), hand: lerpPt(hangR.hand, openR.hand, kick) },
    legL: Math.max(0, swing) * 3,
    legR: Math.max(0, -swing) * 3 + kick * 6,
    kick,
  };
}

/** SVG path of an arm: shoulder → elbow → hand. */
export const armPath = (a: ArmPose): string =>
  `M${a.shoulder.x.toFixed(1)},${a.shoulder.y.toFixed(1)} L${a.elbow.x.toFixed(1)},${a.elbow.y.toFixed(1)} L${a.hand.x.toFixed(1)},${a.hand.y.toFixed(1)}`;

/** Where the taker stands: from the start of the run-up to beside the ball (his right foot at the ball). */
export function takerSpot(run: number): Pt {
  const from = { x: SCENE.BALL_START.x - 30, y: SCENE.BALL_START.y + 30 };
  const to = { x: SCENE.BALL_START.x - 14, y: SCENE.BALL_START.y + 6 };
  return lerpPt(from, to, Math.max(0, Math.min(1, run)));
}

// ── Keeper's dive, body by body part (4.38.4): legs, torso, head and arms in phases ──

export interface LegPose { hip: Pt; knee: Pt; foot: Pt }
export interface KeeperPose {
  /** Whole-body tilt (degrees) and lift (px, up) on top of the travel `keeperDive` gives. */
  rot: number;
  lift: number;
  /** Torso lean relative to the hips (degrees), head tilt relative to the torso. */
  lean: number;
  tilt: number;
  /** Arms reach (see `keeperArms`). */
  reach: number;
  legL: LegPose;
  legR: LegPose;
  /** 0..1: how far the body has travelled toward the end of the dive (eased). */
  travel: number;
}

const HIP_L = { x: -3.5, y: -16 }, HIP_R = { x: 3.5, y: -16 };
type LegKey = { knee: Pt; foot: Pt };
interface Key { at: number; rot: number; lift: number; lean: number; tilt: number; reach: number; travel: number; l: LegKey; r: LegKey }

/**
 * Keyframes of a dive to `side` (−1 left, 1 right, 0 middle) and `high`. The far leg pushes off and the near one
 * lifts; in the air the legs trail together, bent; on landing they curl. A middle dive is a jump (high) or a squat.
 */
export function diveKeys(side: -1 | 0 | 1, high: boolean): Key[] {
  const s = side;
  const ready: LegKey[] = [{ knee: { x: -5, y: -8 }, foot: { x: -7, y: 0 } }, { knee: { x: 5, y: -8 }, foot: { x: 7, y: 0 } }];
  const crouch: LegKey[] = [{ knee: { x: -7, y: -6 }, foot: { x: -8, y: 0 } }, { knee: { x: 7, y: -6 }, foot: { x: 8, y: 0 } }];
  if (s === 0) {
    const tuck: LegKey[] = high
      ? [{ knee: { x: -5, y: -12 }, foot: { x: -6, y: -5 } }, { knee: { x: 5, y: -12 }, foot: { x: 6, y: -5 } }]
      : [{ knee: { x: -9, y: -5 }, foot: { x: -9, y: 0 } }, { knee: { x: 9, y: -5 }, foot: { x: 9, y: 0 } }];
    return [
      { at: 0, rot: 0, lift: 0, lean: 0, tilt: 0, reach: 0, travel: 0, l: ready[0]!, r: ready[1]! },
      { at: 0.2, rot: 0, lift: -3, lean: 8, tilt: 6, reach: -1, travel: 0, l: crouch[0]!, r: crouch[1]! },
      { at: 0.55, rot: 0, lift: high ? 22 : -4, lean: 0, tilt: high ? -8 : 10, reach: high ? 1 : 0.15, travel: 1, l: tuck[0]!, r: tuck[1]! },
      { at: 1, rot: 0, lift: high ? 4 : -4, lean: 0, tilt: 0, reach: high ? 0.4 : 0.1, travel: 1, l: ready[0]!, r: ready[1]! },
    ];
  }
  const push = { knee: { x: -s * 6, y: -7 }, foot: { x: -s * 11, y: 1 } };
  const lead = { knee: { x: s * 9, y: -12 }, foot: { x: s * 12, y: -6 } };
  const trailFar = { knee: { x: -s * 2, y: -9 }, foot: { x: -s * 1, y: 0 } };
  const trailNear = { knee: { x: s * 3, y: -9 }, foot: { x: s * 4, y: -1 } };
  const curlFar = { knee: { x: -s * 1, y: -10 }, foot: { x: s * 3, y: -4 } };
  const curlNear = { knee: { x: s * 5, y: -10 }, foot: { x: s * 7, y: -5 } };
  // Left/right legs: the far leg is the one on the side away from the dive.
  const asLR = (far: LegKey, near: LegKey) => (s > 0 ? { l: far, r: near } : { l: near, r: far });
  const tilt = high ? 70 : 82;
  return [
    { at: 0, rot: 0, lift: 0, lean: 0, tilt: 0, reach: 0, travel: 0, l: ready[0]!, r: ready[1]! },
    { at: 0.18, rot: s * 6, lift: -3, lean: s * 6, tilt: s * 4, reach: -1, travel: 0.02, l: crouch[0]!, r: crouch[1]! },
    { at: 0.42, rot: s * tilt * 0.45, lift: high ? 16 : 8, lean: s * 18, tilt: s * 12, reach: 0.5, travel: 0.4, ...asLR(push, lead) },
    { at: 0.8, rot: s * tilt, lift: high ? 18 : 6, lean: s * 6, tilt: s * 8, reach: high ? 1 : 0.8, travel: 1, ...asLR(trailFar, trailNear) },
    { at: 1, rot: s * (tilt + 6), lift: 0, lean: 0, tilt: s * 4, reach: high ? 0.75 : 0.6, travel: 1, ...asLR(curlFar, curlNear) },
  ];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** The keeper's pose at `t` (0..1) of a dive to `area`. */
export function keeperPose(area: GoalArea, t: number): KeeperPose {
  const [row, col] = area.split("-");
  const side = (col === "left" ? -1 : col === "right" ? 1 : 0) as -1 | 0 | 1;
  const keys = diveKeys(side, row === "high");
  const u = Math.max(0, Math.min(1, t));
  let k = 0;
  while (k < keys.length - 2 && u > keys[k + 1]!.at) k++;
  const a = keys[k]!, b = keys[k + 1]!;
  const f = smooth(b.at > a.at ? (u - a.at) / (b.at - a.at) : 1);
  const leg = (x: LegKey, y: LegKey, hip: Pt): LegPose => ({ hip, knee: lerpPt(x.knee, y.knee, f), foot: lerpPt(x.foot, y.foot, f) });
  return {
    rot: lerp(a.rot, b.rot, f), lift: lerp(a.lift, b.lift, f), lean: lerp(a.lean, b.lean, f), tilt: lerp(a.tilt, b.tilt, f),
    reach: lerp(a.reach, b.reach, f), travel: lerp(a.travel, b.travel, f),
    legL: leg(a.l, b.l, HIP_L), legR: leg(a.r, b.r, HIP_R),
  };
}

/** Standing pose (before the kick): `bob` −1..1 sways the knees a little. */
export function keeperStance(bob: number): KeeperPose {
  const p = keeperPose("low-mid", 0);
  const d = bob * 0.6;
  return { ...p, legL: { ...p.legL, knee: { x: p.legL.knee.x - d, y: p.legL.knee.y } }, legR: { ...p.legR, knee: { x: p.legR.knee.x + d, y: p.legR.knee.y } } };
}

export const legPath = (l: LegPose): string =>
  `M${l.hip.x.toFixed(1)},${l.hip.y.toFixed(1)} L${l.knee.x.toFixed(1)},${l.knee.y.toFixed(1)} L${l.foot.x.toFixed(1)},${l.foot.y.toFixed(1)}`;
