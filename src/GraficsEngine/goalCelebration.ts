/**
 * Goal celebration on the pitch (drawing only). After a goal the engine puts both teams straight back into the kickoff
 * layout; the drawing instead holds the match for a few real seconds: the scorer runs off (to the corner flag, to the
 * crowd at the touchline, or stops for the team to pile on him), the nearest team-mates run to him, the other side
 * stands still, then everyone walks back to the kickoff. Pure: positions in engine yards from the plan and the time.
 */
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import type { Pos } from "@/GraficsEngine/renderInterp";

export const CELEBRATION = {
  /** Real seconds of the celebration at 1×, and the longest one (both ÷ √speed at higher speeds). */
  SECONDS: 3.4,
  MAX_SECONDS: 5,
  /** The scorer and the team-mates hold together this long once the last one arrives. */
  HOLD_S: 0.8,
  /** Real seconds of the walk back to the kickoff. */
  WALK_BACK_S: 1.1,
  /** Scorer's run (yards per real second) and team-mates' (a little slower, they start late). */
  SCORER_SPEED: 9,
  MATE_SPEED: 8.5,
  /** Team-mates within this distance of the scorer join him (at most MAX_MATES, nearest first). */
  JOIN_YDS: 45,
  MAX_MATES: 5,
  /** Ring of the team-mates around the scorer once there (yards). */
  RING_YDS: 1.6,
  /** Delay before a team-mate starts running, per yard of distance (they react, then run). */
  MATE_DELAY_PER_YD: 0.012,
  /** Inset of the corner and touchline targets from the lines (yards). */
  INSET: 2.5,
  /** The run "to the crowd" heads this far back toward the halfway line along the touchline. */
  CROWD_BACK_YDS: 8,
  /** Pile-on: the scorer runs only this far and stops. */
  PILE_RUN_YDS: 5,
} as const;

export type CelebrationKind = "corner" | "crowd" | "pile";

interface Runner {
  id: number;
  from: Pos;
  /** Starts running at this time (seconds from the goal). */
  delay: number;
  /** Slot on the ring around the scorer (radians). */
  slot: number;
}

export interface CelebrationPlan {
  kind: CelebrationKind;
  scorerId: number;
  /** The scorer's path: from where he scored to his target. */
  from: Pos;
  to: Pos;
  /** Arrival time of the scorer (seconds from the goal). */
  arrival: number;
  /** Knee slide at the end of the run (corner and crowd only). */
  slide: boolean;
  mates: Runner[];
  /** Everyone else, frozen where they were drawn at the goal. */
  still: Map<number, Pos>;
  /** Celebration length (real seconds) and walk back. */
  duration: number;
  walkBack: number;
}

export interface CelebrationInput {
  scorerId: number;
  /** Drawn positions at the goal, engine yards. */
  positions: ReadonlyMap<number, Pos>;
  /** Team of every player on the pitch and whether he is the keeper. */
  players: readonly { id: number; team: "A" | "B"; keeper: boolean }[];
  /** +1 when the scoring team attacks toward x = PITCH_LENGTH. */
  attackDir: number;
  seed: string;
  gameSpeed: number;
}

const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.y - b.y);

/** The celebration for a goal, or null when the scorer is not on the drawn pitch. */
export function planCelebration(input: CelebrationInput): CelebrationPlan | null {
  const C = CELEBRATION;
  const from = input.positions.get(input.scorerId);
  const scorer = input.players.find((p) => p.id === input.scorerId);
  if (!from || !scorer) return null;
  const rng = mulberry32(seedFrom(`celebrate:${input.seed}`));
  const roll = rng();
  const kind: CelebrationKind = roll < 0.45 ? "corner" : roll < 0.75 ? "crowd" : "pile";
  const goalX = input.attackDir > 0 ? PITCH_LENGTH : 0;
  const side = from.y < PITCH_WIDTH / 2 ? 0 : PITCH_WIDTH;
  const inY = side === 0 ? C.INSET : PITCH_WIDTH - C.INSET;
  let to: Pos;
  if (kind === "corner") to = { x: goalX - input.attackDir * C.INSET, y: inY };
  else if (kind === "crowd") to = { x: clamp(from.x - input.attackDir * C.CROWD_BACK_YDS, C.INSET, PITCH_LENGTH - C.INSET), y: inY };
  else {
    const back = { x: -input.attackDir, y: 0 };
    to = { x: clamp(from.x + back.x * C.PILE_RUN_YDS, C.INSET, PITCH_LENGTH - C.INSET), y: from.y };
  }
  const arrival = dist(from, to) / C.SCORER_SPEED;
  const speed = Math.max(1, input.gameSpeed);
  const cap = Math.max(arrival + C.HOLD_S, C.MAX_SECONDS / Math.sqrt(speed));

  const mates: Runner[] = [];
  const still = new Map<number, Pos>();
  const candidates = input.players
    .filter((p) => p.team === scorer.team && p.id !== scorer.id && !p.keeper)
    .map((p) => ({ id: p.id, pos: input.positions.get(p.id) }))
    .filter((c): c is { id: number; pos: Pos } => !!c.pos)
    .map((c) => ({ ...c, d: dist(c.pos, to) }))
    .filter((c) => c.d <= C.JOIN_YDS)
    .sort((a, b) => a.d - b.d || a.id - b.id)
    .slice(0, C.MAX_MATES)
    .map((c) => ({ ...c, delay: 0.15 + c.d * C.MATE_DELAY_PER_YD + rng() * 0.2 }))
    // Only who gets there in time joins (a long run at a high game speed leaves the far ones in place).
    .filter((c) => c.delay + c.d / C.MATE_SPEED + C.HOLD_S <= cap);
  const joining = new Set(candidates.map((c) => c.id));
  candidates.forEach((c, i) => {
    const slot = (i / Math.max(1, candidates.length)) * 2 * Math.PI + rng() * 0.4;
    mates.push({ id: c.id, from: c.pos, delay: c.delay, slot });
  });
  const lastIn = Math.max(arrival, ...candidates.map((c) => c.delay + c.d / C.MATE_SPEED));
  const duration = Math.min(cap, Math.max(C.SECONDS / Math.sqrt(speed), lastIn + C.HOLD_S));
  for (const p of input.players) {
    if (p.id === scorer.id || joining.has(p.id)) continue;
    const pos = input.positions.get(p.id);
    if (pos) still.set(p.id, pos);
  }
  return {
    kind, scorerId: scorer.id, from, to, arrival,
    slide: kind !== "pile" && rng() < 0.5,
    mates, still, duration, walkBack: C.WALK_BACK_S,
  };
}

/** Ease out: fast start, soft arrival. */
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function moveToward(from: Pos, to: Pos, travelled: number): Pos {
  const d = dist(from, to);
  if (d <= travelled || d === 0) return { ...to };
  const k = travelled / d;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

/** The scorer's drawn position `t` seconds after the goal. */
export function scorerAt(plan: CelebrationPlan, t: number): Pos {
  if (plan.arrival <= 0) return { ...plan.to };
  const k = clamp(t / plan.arrival, 0, 1);
  const e = easeOut(k);
  return { x: plan.from.x + (plan.to.x - plan.from.x) * e, y: plan.from.y + (plan.to.y - plan.from.y) * e };
}

/** Every player's drawn position `t` seconds into the celebration (engine yards). */
export function celebrationPositions(plan: CelebrationPlan, t: number): Map<number, Pos> {
  const C = CELEBRATION;
  const out = new Map(plan.still);
  const s = scorerAt(plan, t);
  out.set(plan.scorerId, s);
  for (const m of plan.mates) {
    const run = Math.max(0, t - m.delay) * C.MATE_SPEED;
    // Aim at his slot around where the scorer is now; once close, settle on it.
    const slot = { x: s.x + Math.cos(m.slot) * C.RING_YDS, y: s.y + Math.sin(m.slot) * C.RING_YDS };
    const straight = moveToward(m.from, slot, run);
    out.set(m.id, {
      x: clamp(straight.x, 0.5, PITCH_LENGTH - 0.5),
      y: clamp(straight.y, 0.5, PITCH_WIDTH - 0.5),
    });
  }
  return out;
}

/** Team-mates that reached the scorer by `t` (they start their celebrating pose then). */
export function arrivedMates(plan: CelebrationPlan, t: number): number[] {
  const s = scorerAt(plan, t);
  const pos = celebrationPositions(plan, t);
  return plan.mates.filter((m) => {
    const p = pos.get(m.id);
    return !!p && dist(p, s) <= CELEBRATION.RING_YDS + 0.4;
  }).map((m) => m.id);
}

/** Blend from the celebration's last positions to the kickoff layout, `k` 0..1 (eased in-out). */
export function walkBackPositions(from: ReadonlyMap<number, Pos>, to: ReadonlyMap<number, Pos>, k: number): Map<number, Pos> {
  const x = clamp(k, 0, 1);
  const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const out = new Map<number, Pos>();
  for (const [id, b] of to) {
    const a = from.get(id) ?? b;
    out.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
  }
  return out;
}
