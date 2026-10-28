// A penalty kicked and saved in 2D (`docs/superpowers/specs/2026-10-28-penalty-2d-design.md`): the taker aims at a
// point of the goal and releases a power bar, the keeper dives to one of six areas. Pure; the same resolution runs in
// the browser (solo live match) and on the server (live match between two managers).
//
// Goal space: x in [-1, 1] across the mouth (posts at ±1), y in [0, 1] up the mouth (bar at 1).
import { clamp } from "@/Domain/math";

export const PENALTY_2D = {
  /** Spread of the shot around the aim (goal half-widths) for a taker of finishing 0; × (1.2 − finishing). */
  AIM_SPREAD: 0.2,
  /** Green zone of the power bar: inside it the shot keeps its height and pace. */
  POWER_GREEN: [0.55, 0.8] as const,
  /** Height added per unit of power above the green zone (a full bar adds 0.6: over the bar from mid-height). */
  POWER_LIFT: 3,
  /** Width of the woodwork, in goal units: a shot landing on it hits the post or the bar. */
  WOODWORK: 0.04,
  /** Keeper in the right area: base save chance, scaled by his reflex/diving (0.6..1.4 ×). */
  SAVE_BASE: 0.95,
  /** A shot near the corner is harder to reach: × (1 − corner × CORNER_PROTECT). */
  CORNER_PROTECT: 0.7,
  /** A weak shot (power below the green zone) is easier: × (1 + weakness × WEAK_BONUS). */
  WEAK_BONUS: 0.8,
  /** Keeper in the right column but the other row: this share of the save chance. */
  OTHER_ROW: 0.35,
  MAX_SAVE: 0.95,
  /** Power bar: seconds for a full up-and-down cycle. */
  POWER_CYCLE_S: 1.4,
  /** Seconds the human keeper has to pick an area. */
  DIVE_WINDOW_S: 4,
  /** AI choices: where the AI shoots and where the AI keeper dives (weights per area). */
  AI_AIM: { "low-left": 0.27, "low-mid": 0.08, "low-right": 0.27, "high-left": 0.17, "high-mid": 0.04, "high-right": 0.17 },
  AI_DIVE: { "low-left": 0.32, "low-mid": 0.12, "low-right": 0.32, "high-left": 0.1, "high-mid": 0.04, "high-right": 0.1 },
  /** AI power: normal around the middle of the green zone. */
  AI_POWER_MEAN: 0.67,
  AI_POWER_SD: 0.06,
} as const;

export type GoalArea = "low-left" | "low-mid" | "low-right" | "high-left" | "high-mid" | "high-right";
export const GOAL_AREAS: readonly GoalArea[] = ["high-left", "high-mid", "high-right", "low-left", "low-mid", "low-right"];

export interface KickInput {
  /** Aim point in goal space. */
  aim: { x: number; y: number };
  /** Power bar value at release, 0..1. */
  power: number;
}

export type KickResult = "goal" | "saved" | "miss" | "post";

export interface KickOutcome {
  result: KickResult;
  scored: boolean;
  /** Where the ball went (goal space, may be outside the mouth). */
  ball: { x: number; y: number };
  dive: GoalArea;
  /** Chance of a goal had the dive been unknown: shown in debug and stored as the kick's `chance`. */
  chance: number;
}

export interface KickPlayers {
  /** Taker's finishing, 0..0.95 (`runtimeStats.withBall.shootAccuracy`). */
  accuracy: number;
  /** Keeper's reflex and diving, 0..1 (null: empty goal). */
  keeper: { reflex: number; diving: number } | null;
}

/** Area of a point of the goal (columns at ±1/3, rows at mid-height). */
export function areaOf(p: { x: number; y: number }): GoalArea {
  const col = p.x < -1 / 3 ? "left" : p.x > 1 / 3 ? "right" : "mid";
  return `${p.y >= 0.5 ? "high" : "low"}-${col}` as GoalArea;
}

/** Centre of an area (goal space). */
export function areaCentre(a: GoalArea): { x: number; y: number } {
  const [row, col] = a.split("-") as ["low" | "high", "left" | "mid" | "right"];
  return { x: col === "left" ? -2 / 3 : col === "right" ? 2 / 3 : 0, y: row === "high" ? 0.75 : 0.25 };
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Where the ball goes: the aim, a spread by the taker's finishing, the height a too-strong shot adds. */
export function ballPoint(input: KickInput, accuracy: number, rng: () => number): { x: number; y: number } {
  const sigma = PENALTY_2D.AIM_SPREAD * (1.2 - clamp(accuracy, 0, 0.95));
  const over = Math.max(0, input.power - PENALTY_2D.POWER_GREEN[1]);
  return {
    x: input.aim.x + gaussian(rng) * sigma,
    y: Math.max(0, input.aim.y + gaussian(rng) * sigma * 0.7 + over * PENALTY_2D.POWER_LIFT),
  };
}

/** Out (wide or over), on the woodwork, or in the mouth. */
function frameOf(ball: { x: number; y: number }): "in" | "post" | "miss" {
  const w = PENALTY_2D.WOODWORK;
  const ax = Math.abs(ball.x);
  if (ax > 1 + w || ball.y > 1 + w) return "miss";
  if (ax > 1 - w || ball.y > 1 - w) return "post";
  return "in";
}

/** Save chance of a keeper diving to `dive` against a ball at `ball` (0 when he is in the wrong column). */
export function saveChance(ball: { x: number; y: number }, dive: GoalArea, keeper: KickPlayers["keeper"], power: number): number {
  if (!keeper) return 0;
  const shot = areaOf(ball);
  const sameCol = shot.split("-")[1] === dive.split("-")[1];
  if (!sameCol) return 0;
  const skill = 0.6 + 0.8 * ((keeper.reflex + keeper.diving) / 2);
  const corner = clamp((Math.abs(ball.x) - 0.3) / 0.7, 0, 1) * (0.6 + 0.4 * clamp(ball.y, 0, 1));
  const weakness = Math.max(0, PENALTY_2D.POWER_GREEN[0] - power) / PENALTY_2D.POWER_GREEN[0];
  const base = PENALTY_2D.SAVE_BASE * skill * (1 - corner * PENALTY_2D.CORNER_PROTECT) * (1 + weakness * PENALTY_2D.WEAK_BONUS);
  return clamp(shot === dive ? base : base * PENALTY_2D.OTHER_ROW, 0, PENALTY_2D.MAX_SAVE);
}

/** One kick: the ball point, the woodwork, then the keeper's dive. */
export function resolveKick(input: KickInput, dive: GoalArea, players: KickPlayers, rng: () => number): KickOutcome {
  const ball = ballPoint(input, players.accuracy, rng);
  const frame = frameOf(ball);
  // The dive is unknown to the taker: the chance averages the AI's dive weights.
  const chance = frame === "in"
    ? 1 - (Object.entries(PENALTY_2D.AI_DIVE) as [GoalArea, number][])
      .reduce((s, [a, w]) => s + w * saveChance(ball, a, players.keeper, input.power), 0)
    : 0;
  if (frame !== "in") return { result: frame, scored: false, ball, dive, chance };
  const saved = rng() < saveChance(ball, dive, players.keeper, input.power);
  return { result: saved ? "saved" : "goal", scored: !saved, ball, dive, chance };
}

function pickWeighted<K extends string>(weights: Record<K, number>, rng: () => number): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

/** Where the AI keeper dives. */
export function aiDive(rng: () => number): GoalArea {
  return pickWeighted(PENALTY_2D.AI_DIVE, rng);
}

/** The AI taker's kick: an area by the weights, a point inside it away from the woodwork, a normal power. */
export function aiKick(rng: () => number): KickInput {
  const c = areaCentre(pickWeighted(PENALTY_2D.AI_AIM, rng));
  return {
    aim: { x: c.x + (rng() - 0.5) * 0.35, y: clamp(c.y + (rng() - 0.5) * 0.3, 0.05, 0.9) },
    power: clamp(PENALTY_2D.AI_POWER_MEAN + gaussian(rng) * PENALTY_2D.AI_POWER_SD, 0, 1),
  };
}

/** A manager's answer to a pending penalty: the kick (taker's side) or the dive (keeper's side). */
export type PenaltyChoice = { kick: KickInput } | { dive: GoalArea };

/** A choice from the socket, or null (unknown shape, out of range). */
export function parsePenaltyChoice(v: unknown): PenaltyChoice | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1) return null;
  if (typeof o.dive === "string") return (GOAL_AREAS as readonly string[]).includes(o.dive) ? { dive: o.dive as GoalArea } : null;
  const k = o.kick as Record<string, unknown> | undefined;
  if (!k || typeof k !== "object" || Object.keys(k).some((x) => x !== "aim" && x !== "power")) return null;
  const aim = k.aim as Record<string, unknown> | undefined;
  const num = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  if (!aim || typeof aim !== "object" || Object.keys(aim).some((x) => x !== "x" && x !== "y")) return null;
  if (!num(aim.x, -1.5, 1.5) || !num(aim.y, 0, 1.5) || !num(k.power, 0, 1)) return null;
  return { kick: { aim: { x: aim.x as number, y: aim.y as number }, power: k.power as number } };
}

/** Power bar value at `t` seconds after it started (a triangle wave 0 → 1 → 0). */
export function powerAt(t: number): number {
  const p = (t / PENALTY_2D.POWER_CYCLE_S) % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}
