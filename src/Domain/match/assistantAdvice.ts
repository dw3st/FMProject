import { findBestBenchForRole } from "@/GameEngine/Domain/AiSubstitution";
import type { GamePlayer, GameState, TeamId } from "@/GameEngine/types";
import type { Mentality } from "@/types/tacticsTypes";

/**
 * The assistant's advice during the live match (tester report 31dd5a2d): what he would change now. Pure; the match
 * screen re-reads it once a game minute and the manager applies or dismisses each tip. Advice only: nothing is
 * changed by itself.
 */
export const ASSISTANT_ADVICE = {
  MAX_TIPS: 3,
  /** Outfield energy under which a starter is worth taking off (FM condition scale). */
  TIRED_ENERGY: 68,
  TIRED_FROM_MINUTE: 55,
  BOOKED_FROM_MINUTE: 60,
  CHASE_FROM_MINUTE: 70,
  PROTECT_FROM_MINUTE: 80,
  MARK_FROM_MINUTE: 20,
  /** An opponent this dangerous today (shots, goals count as 2) is worth man-marking. */
  MARK_THREAT: 3,
};

export type AdviceTip =
  | { kind: "tired"; id: string; playerId: number; name: string; energy: number; sub?: PlannedSub }
  | { kind: "booked"; id: string; playerId: number; name: string; sub?: PlannedSub }
  | { kind: "attack"; id: string }
  | { kind: "protect"; id: string }
  | { kind: "mark"; id: string; playerId: number; name: string; shots: number; goals: number; marker?: PlannedMarker };

/** What "Aplicar" does on a substitution tip (report be8dd622): the reserve the assistant would bring on. */
export interface PlannedSub { inId: number; inName: string }
/** What "Aplicar" does on a marking tip: the slot of the player who would mark the threat. */
export interface PlannedMarker { slot: number; name: string }

/** The bench player the assistant would bring on for `out` (none already queued to come on). */
function plannedSub(out: GamePlayer, bench: GamePlayer[], queuedIn: Set<number>): PlannedSub | undefined {
  const free = bench.filter((p) => !queuedIn.has(p.id));
  const pick = findBestBenchForRole([...free], out.role);
  return pick ? { inId: pick.id, inName: pick.name } : undefined;
}

/** The marker: a defensive outfield player not marking anyone, the best tackler, the nearest on a tie. */
function plannedMarker(mine: GamePlayer[], target: GamePlayer, busy: Set<number>): PlannedMarker | undefined {
  const pick = mine
    .filter((p) => p.role !== "GK" && DEFENSIVE_ROLES.has(p.role) && !busy.has(p.id))
    .map((p) => ({ p, tackle: p.runtimeStats?.withoutBall.tackleChance ?? 0, dist: Math.hypot(p.x - target.x, p.y - target.y) }))
    .sort((a, b) => b.tackle - a.tackle || a.dist - b.dist || a.p.id - b.p.id)[0];
  return pick ? { slot: pick.p.slotIndex, name: pick.p.name } : undefined;
}

const DEFENSIVE_ROLES = new Set(["CB", "LB", "RB", "LWB", "RWB", "CDM"]);
const isLive = (p: GameState["matchPhase"]) =>
  p === "firstHalf" || p === "secondHalf" || p === "extraTimeFirst" || p === "extraTimeSecond";

export function assistantAdvice(
  state: GameState,
  side: TeamId,
  minute: number,
  mentality: Mentality,
  /** Shots and goals of an opponent player in this match (the live Statistics). */
  statsOf: (playerId: number) => { shots: number; goals: number },
): AdviceTip[] {
  if (!isLive(state.matchPhase)) return [];
  const other: TeamId = side === "A" ? "B" : "A";
  const tips: AdviceTip[] = [];
  const mine = state.players.filter((p) => p.team === side);
  const subsLeft = side === "A" ? state.subsRemainingA : state.subsRemainingB;
  const bench = side === "A" ? state.benchA : state.benchB;
  const queued = side === "A" ? state.pendingSubsA : state.pendingSubsB;
  const pending = new Set(queued.map((s) => s.outId));
  const queuedIn = new Set(queued.map((s) => s.inId));
  // Free changes: the ones left minus those already queued and those an open injury vacancy will take.
  const vacancies = state.injuryVacancies?.[side]?.length ?? 0;
  let freeSubs = Math.max(0, subsLeft - queued.length - vacancies);
  const canSub = () => freeSubs > 0 && bench.some((p) => !queuedIn.has(p.id));
  const my = state.score[side];
  const their = state.score[other];
  const agg = state.aggregate ?? { A: 0, B: 0 };
  const diff = my + agg[side] - (their + agg[other]);

  if (diff < 0 && minute >= ASSISTANT_ADVICE.CHASE_FROM_MINUTE && mentality !== "attacking") tips.push({ kind: "attack", id: "attack" });
  if (diff === 1 && minute >= ASSISTANT_ADVICE.PROTECT_FROM_MINUTE && mentality !== "defensive") tips.push({ kind: "protect", id: "protect" });

  if (canSub() && minute >= ASSISTANT_ADVICE.TIRED_FROM_MINUTE) {
    const tired = mine
      .filter((p) => p.role !== "GK" && !pending.has(p.id) && p.energy < ASSISTANT_ADVICE.TIRED_ENERGY)
      .sort((a, b) => a.energy - b.energy)[0];
    if (tired) {
      const sub = plannedSub(tired, bench, queuedIn);
      if (sub) queuedIn.add(sub.inId);
      freeSubs -= 1;
      tips.push({ kind: "tired", id: `tired:${tired.id}`, playerId: tired.id, name: tired.name, energy: Math.round(tired.energy), sub });
    }
  }

  if (canSub() && minute >= ASSISTANT_ADVICE.BOOKED_FROM_MINUTE) {
    const reds = new Set(state.cards.filter((c) => c.card === "red").map((c) => c.playerId));
    const booked = state.cards
      .filter((c) => c.team === side && c.card === "yellow" && !reds.has(c.playerId) && !pending.has(c.playerId))
      .map((c) => mine.find((p) => p.id === c.playerId))
      .find((p) => p && DEFENSIVE_ROLES.has(p.role) && !tips.some((t) => t.kind === "tired" && t.playerId === p.id));
    if (booked) tips.push({ kind: "booked", id: `booked:${booked.id}`, playerId: booked.id, name: booked.name, sub: plannedSub(booked, bench, queuedIn) });
  }

  if (minute >= ASSISTANT_ADVICE.MARK_FROM_MINUTE) {
    const pairs = state.manMarks?.[side] ?? [];
    const marked = new Set(pairs.map((m) => m.targetId));
    const threat = state.players
      .filter((p) => p.team === other && p.role !== "GK" && !marked.has(p.id))
      .map((p) => ({ p, ...statsOf(p.id) }))
      .map((r) => ({ ...r, threat: r.shots + r.goals * 2 }))
      .filter((r) => r.threat >= ASSISTANT_ADVICE.MARK_THREAT)
      .sort((a, b) => b.threat - a.threat || a.p.id - b.p.id)[0];
    if (threat) tips.push({ kind: "mark", id: `mark:${threat.p.id}`, playerId: threat.p.id, name: threat.p.name, shots: threat.shots, goals: threat.goals,
      marker: pairs.length < 2 ? plannedMarker(mine, threat.p, new Set(pairs.map((m) => m.markerId))) : undefined });
  }

  return tips.slice(0, ASSISTANT_ADVICE.MAX_TIPS);
}
