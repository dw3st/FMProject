/**
 * Development goals of academy players and the youth coach's promotion picks (report 2026-11-16,
 * `.claude/rules/game/youth.md` → "Metas e sugestões do treinador da base"). Pure.
 */
import { addDays, daysBetween } from "@/Domain/dates";
import { overallAvg } from "@/Domain/playerRating";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { starterLineAverages } from "@/Domain/scouting/missions";
import { potentialBand } from "@/Domain/youth/youth";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { YouthGoal } from "@/types/youthTrainingTypes";

export const YOUTH_GOAL = {
  /** Lengths the manager picks from, in months (30 days each). */
  MONTHS: [3, 6, 12] as const,
  /** A goal is at most this far above today's level (0-10 scale). */
  MAX_GAIN: 2,
  /** On track: within this of the straight line from the level when it was set to the target. */
  TRACK_SLACK: 0.05,
  /** Promotion pick: level at least the starters of his line minus this. */
  READY_GAP: 0.3,
  /** Promotion pick: from this age the academy is his last year (he leaves at 19). */
  LAST_YEAR_AGE: 18,
  /** At most this many picks. */
  MAX_PICKS: 3,
} as const;

export type GoalMonths = (typeof YOUTH_GOAL.MONTHS)[number];

export type { YouthGoal };

export type GoalStatus = "reached" | "missed" | "onTrack" | "behind";

/** A new goal from `{ level, months }`, or null when it is invalid (not above today, too far, unknown length). */
export function parseGoal(body: unknown, player: RosterPlayer, date: string): YouthGoal | null {
  if (!body || typeof body !== "object") return null;
  const { level, months } = body as { level?: unknown; months?: unknown };
  if (typeof level !== "number" || !Number.isFinite(level)) return null;
  if (!YOUTH_GOAL.MONTHS.includes(months as GoalMonths)) return null;
  const now = overallAvg(player);
  const target = Math.round(level * 10) / 10;
  if (target <= now || target > now + YOUTH_GOAL.MAX_GAIN || target > 10) return null;
  return { level: target, from: Math.round(now * 100) / 100, set: date, by: addDays(date, (months as number) * 30) };
}

/** Where a goal stands today. */
export function goalStatus(goal: YouthGoal, overall: number, date: string): GoalStatus {
  if (overall >= goal.level) return "reached";
  if (date >= goal.by) return "missed";
  const total = Math.max(1, daysBetween(goal.set, goal.by));
  const expected = goal.from + (goal.level - goal.from) * Math.min(1, daysBetween(goal.set, date) / total);
  return overall >= expected - YOUTH_GOAL.TRACK_SLACK ? "onTrack" : "behind";
}

export interface GoalOutcome { id: string; name: string; level: number; outcome: "reached" | "missed" }

/**
 * The goals that end today (reached or past the deadline) leave the record and become news; goals of players no
 * longer in the academy go silently. Returns the same object when nothing changes.
 */
export function settleGoals(
  goals: Record<string, YouthGoal> | undefined,
  youth: readonly RosterPlayer[],
  date: string,
): { goals: Record<string, YouthGoal> | undefined; outcomes: GoalOutcome[] } {
  if (!goals) return { goals, outcomes: [] };
  const byId = new Map(youth.map((p) => [p.id, p]));
  const next: Record<string, YouthGoal> = {};
  const outcomes: GoalOutcome[] = [];
  let changed = false;
  for (const [id, g] of Object.entries(goals)) {
    const p = byId.get(id);
    if (!p) { changed = true; continue; }
    const s = goalStatus(g, overallAvg(p), date);
    if (s === "reached" || s === "missed") {
      changed = true;
      outcomes.push({ id, name: p.name, level: g.level, outcome: s });
    } else next[id] = g;
  }
  if (!changed) return { goals, outcomes };
  return { goals: Object.keys(next).length > 0 ? next : undefined, outcomes };
}

export interface PromotionPick { id: string; reason: "ready" | "lastYear" }

/**
 * The youth coach's promotion picks: academy players at least as good as the first-team starters of their line minus
 * `READY_GAP` ("ready"), then those in their last academy year whose potential reaches the starters ("lastYear").
 * Best level first, at most `MAX_PICKS`.
 */
export function promotionPicks(squad: Squad): PromotionPick[] {
  const lines = starterLineAverages(squad);
  const lineOf = (p: RosterPlayer): MainRole => getMainRole(p.positions[0] ?? "CM");
  const scored = (squad.youth ?? []).map((p) => ({ p, ovr: overallAvg(p), line: lines[lineOf(p)] ?? 0 }));
  const ready = scored.filter((x) => x.line > 0 && x.ovr >= x.line - YOUTH_GOAL.READY_GAP);
  const readyIds = new Set(ready.map((x) => x.p.id));
  const lastYear = scored.filter((x) => !readyIds.has(x.p.id) && x.p.age >= YOUTH_GOAL.LAST_YEAR_AGE && x.line > 0
    && potentialBand(x.p)[1] >= x.line);
  const order = (a: { ovr: number; p: RosterPlayer }, b: { ovr: number; p: RosterPlayer }) => b.ovr - a.ovr || (a.p.id < b.p.id ? -1 : 1);
  return [
    ...ready.sort(order).map((x) => ({ id: x.p.id, reason: "ready" as const })),
    ...lastYear.sort(order).map((x) => ({ id: x.p.id, reason: "lastYear" as const })),
  ].slice(0, YOUTH_GOAL.MAX_PICKS);
}
