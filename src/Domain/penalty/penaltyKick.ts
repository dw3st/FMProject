// A penalty kicked and saved in 2D (`docs/superpowers/specs/2026-10-28-penalty-2d-design.md`): the taker picks one of
// six areas of the goal (4.39.5: no aim nor power bar any more), the keeper dives to one of the same six. The taker's
// finishing decides how close to the area the ball goes, his strength how hard it is to save. Pure; the same
// resolution runs in the browser (solo live match) and on the server (live match between two managers).
//
// Goal space: x in [-1, 1] across the mouth (posts at ±1), y in [0, 1] up the mouth (bar at 1).
import { clamp } from "@/Domain/math";

export const PENALTY_2D = {
  /** Spread of the shot around the area's target (goal half-widths) for a taker of finishing 0; × (1.2 − finishing). */
  AIM_SPREAD: 0.22,
  /**
   * Where a kick at each area is aimed (goal space). The corners sit close to the woodwork (hard to save, but a wide
   * spread goes out); the middle is safe from missing and easy for a keeper who stays.
   */
  TARGET_X: 0.74,
  TARGET_LOW_Y: 0.2,
  TARGET_HIGH_Y: 0.74,
  /** Width of the woodwork, in goal units: a shot landing on it hits the post or the bar. */
  WOODWORK: 0.04,
  /** Keeper in the right area: base save chance, scaled by his reflex/diving (0.6..1.4 ×). */
  SAVE_BASE: 0.85,
  /** A shot near the corner is harder to reach: × (1 − corner × CORNER_PROTECT). */
  CORNER_PROTECT: 0.7,
  /** Taker's strength: save chance × (1 + (0.5 − strength) × POWER_SAVE): a strong shot is harder to stop. */
  POWER_SAVE: 0.5,
  /** Taker's finishing on the save: × (1 + (0.5 − finishing) × FINISH_SAVE): a cleaner strike is harder to reach. */
  FINISH_SAVE: 0.6,
  /** Keeper in the right column but the other row: this share of the save chance. */
  OTHER_ROW: 0.35,
  /**
   * A ball in the middle column against a keeper who dived to a side: he still reaches it with a leg this share of the
   * time (low more than high), so the middle is not a free goal against a keeper who always dives.
   */
  MID_REACH_LOW: 0.35,
  MID_REACH_HIGH: 0.15,
  MAX_SAVE: 0.95,
  /** Seconds the human keeper has to pick an area. */
  DIVE_WINDOW_S: 4,
  /** Seconds the human taker has to pick an area (none in time: the AI's pick). */
  KICK_WINDOW_S: 6,
  /** AI choices: where the AI shoots and where the AI keeper dives (weights per area). */
  AI_AIM: { "low-left": 0.27, "low-mid": 0.08, "low-right": 0.27, "high-left": 0.17, "high-mid": 0.04, "high-right": 0.17 },
  AI_DIVE: { "low-left": 0.32, "low-mid": 0.12, "low-right": 0.32, "high-left": 0.1, "high-mid": 0.04, "high-right": 0.1 },
} as const;

export type GoalArea = "low-left" | "low-mid" | "low-right" | "high-left" | "high-mid" | "high-right";
export const GOAL_AREAS: readonly GoalArea[] = ["high-left", "high-mid", "high-right", "low-left", "low-mid", "low-right"];

export interface KickInput {
  /** The area the taker shoots at. */
  area: GoalArea;
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
  /** Taker's strength, 0..1 (`runtimeStats.withBall.strength`); absent = 0.5. */
  strength?: number;
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

/** The point a kick at `area` is aimed at (goal space). */
export function areaTarget(area: GoalArea): { x: number; y: number } {
  const [row, col] = area.split("-") as ["low" | "high", "left" | "mid" | "right"];
  return {
    x: col === "left" ? -PENALTY_2D.TARGET_X : col === "right" ? PENALTY_2D.TARGET_X : 0,
    y: row === "high" ? PENALTY_2D.TARGET_HIGH_Y : PENALTY_2D.TARGET_LOW_Y,
  };
}

/** Where the ball goes: the area's target and a spread by the taker's finishing. */
export function ballPoint(input: KickInput, accuracy: number, rng: () => number): { x: number; y: number } {
  const sigma = PENALTY_2D.AIM_SPREAD * (1.2 - clamp(accuracy, 0, 0.95));
  const t = areaTarget(input.area);
  return { x: t.x + gaussian(rng) * sigma, y: Math.max(0, t.y + gaussian(rng) * sigma * 0.7) };
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
export function saveChance(
  ball: { x: number; y: number }, dive: GoalArea, keeper: KickPlayers["keeper"], strength = 0.5, accuracy = 0.5,
): number {
  if (!keeper) return 0;
  const shot = areaOf(ball);
  const sameCol = shot.split("-")[1] === dive.split("-")[1];
  const midBall = shot.endsWith("-mid") && !dive.endsWith("-mid");
  if (!sameCol && !midBall) return 0;
  const skill = 0.6 + 0.8 * ((keeper.reflex + keeper.diving) / 2);
  const corner = clamp((Math.abs(ball.x) - 0.3) / 0.7, 0, 1) * (0.6 + 0.4 * clamp(ball.y, 0, 1));
  const power = 1 + (0.5 - clamp(strength, 0, 1)) * PENALTY_2D.POWER_SAVE;
  const strike = 1 + (0.5 - clamp(accuracy, 0, 0.95)) * PENALTY_2D.FINISH_SAVE;
  const base = PENALTY_2D.SAVE_BASE * skill * (1 - corner * PENALTY_2D.CORNER_PROTECT) * power * strike;
  if (midBall) return clamp(base * (shot.startsWith("low") ? PENALTY_2D.MID_REACH_LOW : PENALTY_2D.MID_REACH_HIGH), 0, PENALTY_2D.MAX_SAVE);
  return clamp(shot === dive ? base : base * PENALTY_2D.OTHER_ROW, 0, PENALTY_2D.MAX_SAVE);
}

/** One kick: the ball point, the woodwork, then the keeper's dive. */
export function resolveKick(input: KickInput, dive: GoalArea, players: KickPlayers, rng: () => number): KickOutcome {
  const ball = ballPoint(input, players.accuracy, rng);
  const frame = frameOf(ball);
  // The dive is unknown to the taker: the chance averages the AI's dive weights.
  const chance = frame === "in"
    ? 1 - (Object.entries(PENALTY_2D.AI_DIVE) as [GoalArea, number][])
      .reduce((s, [a, w]) => s + w * saveChance(ball, a, players.keeper, players.strength, players.accuracy), 0)
    : 0;
  if (frame !== "in") return { result: frame, scored: false, ball, dive, chance };
  const saved = rng() < saveChance(ball, dive, players.keeper, players.strength, players.accuracy);
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

/** The AI taker's kick: an area by the weights. */
export function aiKick(rng: () => number): KickInput {
  return { area: pickWeighted(PENALTY_2D.AI_AIM, rng) };
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
  if (!k || typeof k !== "object" || Array.isArray(k) || Object.keys(k).length !== 1) return null;
  return typeof k.area === "string" && (GOAL_AREAS as readonly string[]).includes(k.area) ? { kick: { area: k.area as GoalArea } } : null;
}
