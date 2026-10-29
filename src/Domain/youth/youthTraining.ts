/**
 * Academy training (`docs/superpowers/specs/2026-10-28-youth-training-design.md`): the human club's academy trains on
 * the club's training days, with an intensity, a group focus, and per player a focus and a training position. Pure.
 */
import rolesData from "@/Data/roles.json";
import {
  applyTrainingDevelopment, DEFAULT_DP_WEIGHTS, type AreaMults, DP_CATEGORIES, GROWTH_DP_SCALE, type RoleDPWeights,
} from "@/GameEngine/PlayerDevelopment";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { computeOverallAvg } from "@/Domain/playerRating";
import { daysBetween } from "@/Domain/dates";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { RosterPlayer } from "@/types/playerTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import type { YouthFocus, YouthTrainingPlan } from "@/types/youthTrainingTypes";

export type { YouthFocus, YouthTrainingPlan };

export const YOUTH_TRAINING = {
  /** Academy training days a year assumed for the pace (the old rollover block was `YOUTH.SESSIONS_PER_SEASON`). */
  SESSIONS_PER_YEAR: 200,
  /** Many small sessions lose a little to the 0.1 step against one big block: measured 7%, given back here. */
  PACE_CORRECTION: 1.08,
  /** DP of a session by intensity (× the normal one). */
  INTENSITY_DP: { light: 0.7, normal: 1, heavy: 1.3 } as Record<TrainingIntensity, number>,
  /** Fitness a session costs, scaled by the player's own fitness (like the first team). */
  INTENSITY_FITNESS: { light: -1, normal: -3, heavy: -6 } as Record<TrainingIntensity, number>,
  /** Below this fitness a youngster rests instead of training. */
  MIN_FITNESS: 40,
  /** Weight multiplier of the focused category (the weights are renormalized: the total DP stays). */
  FOCUS_MULT: 1.8,
  /** A focus the position does not use at all still gets this weight before the renormalization. */
  FOCUS_FLOOR: 0.25,
  /** Monday overall snapshots kept per player, and the trend gap in weeks. */
  TREND_KEEP: 5,
  TREND_WEEKS: 4,
} as const;

export const YOUTH_FOCI: readonly YouthFocus[] = ["balanced", ...DP_CATEGORIES];

export const DEFAULT_YOUTH_PLAN: YouthTrainingPlan = { intensity: "normal", focus: "balanced" };

const ROLES = rolesData as unknown as Record<string, { dpWeights?: RoleDPWeights }>;
export const TRAINING_POSITIONS: readonly string[] = Object.keys(ROLES).filter((r) => ROLES[r]?.dpWeights);

/**
 * DP weights of a player under an individual plan (academy and first team, 4.39): his own weights or those of his
 * training position, shifted to the focus (renormalized: the total stays).
 */
export function planDpWeights(player: RosterPlayer, focus: YouthFocus, position?: string): RoleDPWeights {
  const base = position && ROLES[position]?.dpWeights ? ROLES[position]!.dpWeights! : dpWeightsFor(player);
  if (focus === "balanced") return base;
  const shifted = { ...DEFAULT_DP_WEIGHTS, ...base } as RoleDPWeights;
  for (const k of DP_CATEGORIES) shifted[k] = base[k] ?? 0;
  shifted[focus] = Math.max(shifted[focus], YOUTH_TRAINING.FOCUS_FLOOR) * YOUTH_TRAINING.FOCUS_MULT;
  const sum = DP_CATEGORIES.reduce((s, k) => s + shifted[k], 0);
  const out = { ...shifted };
  for (const k of DP_CATEGORIES) out[k] = shifted[k] / sum;
  return out;
}

/** DP weights of one youngster: his focus (else the group's) and his training position. */
export function youthDpWeights(player: RosterPlayer, plan: YouthTrainingPlan): RoleDPWeights {
  const own = plan.players?.[player.id];
  return planDpWeights(player, own?.focus ?? plan.focus, own?.position);
}

/** One player's individual training (first team): `null` when invalid, `{}` clears it. */
export function parsePlayerTraining(body: unknown): { focus?: YouthFocus; position?: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: { focus?: YouthFocus; position?: string } = {};
  if (b.focus !== undefined && b.focus !== null) {
    if (typeof b.focus !== "string" || !YOUTH_FOCI.includes(b.focus as YouthFocus)) return null;
    if (b.focus !== "balanced") out.focus = b.focus as YouthFocus;
  }
  if (b.position !== undefined && b.position !== null) {
    if (typeof b.position !== "string" || !TRAINING_POSITIONS.includes(b.position)) return null;
    out.position = b.position;
  }
  return out;
}

/**
 * DP multiplier of one academy session at normal intensity: the old rollover block (240 sessions, with the
 * `GROWTH_DP_SCALE` divided back out because academy progress is never reset) spread over a year of training days.
 */
export function academySessionMult(): number {
  return (YOUTH.SESSIONS_PER_SEASON / YOUTH_TRAINING.SESSIONS_PER_YEAR) * YOUTH_TRAINING.PACE_CORRECTION / GROWTH_DP_SCALE;
}

/** One academy session: development (the multipliers of `developYouthSeason`), fitness cost. */
export function trainYouthSession(
  player: RosterPlayer, plan: YouthTrainingPlan, dpMult: number, areas: AreaMults,
): RosterPlayer {
  const mult = academySessionMult() * YOUTH_TRAINING.INTENSITY_DP[plan.intensity] * dpMult;
  const { updatedPlayer } = applyTrainingDevelopment(player, "normal", youthDpWeights(player, plan), mult, areas);
  const log = updatedPlayer.seasonLog;
  if (!log) return { ...updatedPlayer, overallAvg: undefined };
  const cost = YOUTH_TRAINING.INTENSITY_FITNESS[plan.intensity] * (log.fitness / 100);
  return { ...updatedPlayer, overallAvg: undefined, seasonLog: { ...log, fitness: Math.max(0, +(log.fitness + cost).toFixed(1)) } };
}

/** The Monday snapshot of the overall (once a week at most), kept for the trend column. */
export function withYouthTrend(player: RosterPlayer, date: string): RosterPlayer {
  const trend = player.youthTrend ?? [];
  const last = trend[trend.length - 1];
  if (last && daysBetween(last.date, date) < 7) return player;
  const overall = +computeOverallAvg(player).toFixed(2);
  return { ...player, youthTrend: [...trend, { date, overall }].slice(-YOUTH_TRAINING.TREND_KEEP) };
}

/** Overall gained over the last `TREND_WEEKS` weeks (null without a snapshot that old). */
export function youthTrendDelta(player: RosterPlayer): number | null {
  const trend = player.youthTrend ?? [];
  if (trend.length < 2) return null;
  const now = trend[trend.length - 1]!;
  const then = trend.find((s) => daysBetween(s.date, now.date) <= YOUTH_TRAINING.TREND_WEEKS * 7) ?? trend[0]!;
  return then === now ? null : +(now.overall - then.overall).toFixed(2);
}

/** Validates a plan sent by the client against the academy (unknown ids dropped). `null` when invalid. */
export function parseYouthPlan(body: unknown, youthIds: ReadonlySet<string>): YouthTrainingPlan | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.intensity !== "light" && b.intensity !== "normal" && b.intensity !== "heavy") return null;
  if (typeof b.focus !== "string" || !YOUTH_FOCI.includes(b.focus as YouthFocus)) return null;
  const plan: YouthTrainingPlan = { intensity: b.intensity, focus: b.focus as YouthFocus };
  if (b.players !== undefined) {
    if (!b.players || typeof b.players !== "object" || Array.isArray(b.players)) return null;
    const players: NonNullable<YouthTrainingPlan["players"]> = {};
    for (const [id, raw] of Object.entries(b.players as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const entry: { focus?: YouthFocus; position?: string } = {};
      if (r.focus !== undefined && r.focus !== null) {
        if (typeof r.focus !== "string" || !YOUTH_FOCI.includes(r.focus as YouthFocus)) return null;
        entry.focus = r.focus as YouthFocus;
      }
      if (r.position !== undefined && r.position !== null) {
        if (typeof r.position !== "string" || !TRAINING_POSITIONS.includes(r.position)) return null;
        entry.position = r.position;
      }
      if (youthIds.has(id) && (entry.focus || entry.position)) players[id] = entry;
    }
    if (Object.keys(players).length > 0) plan.players = players;
  }
  return plan;
}
