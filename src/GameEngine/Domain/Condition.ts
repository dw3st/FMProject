/**
 * FM condition (engine rebuild stage 14, `.claude/rules/game/fitness.md` → "FM condition"): pure helpers for the
 * in-match drain multiplier, the half-time recovery and the outfield median. Constants in `Configs/ConditionConfig.ts`.
 */
import type { GamePlayer } from '@/GameEngine/types';
import { CONDITION } from '@/GameEngine/Configs/ConditionConfig';
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';

/**
 * Multiplier on `consumeEnergy`'s cost under the FM curve: `DRAIN_SCALE` × the headroom above `FLOOR`, keepers ×
 * `GK_DRAIN_SCALE`. 1 with the flag off (the drain of before).
 */
export function conditionDrainMult(p: Pick<GamePlayer, 'energy' | 'role'>): number {
  if (!DECISION_FLAGS.FM_CONDITION) return 1;
  const headroom = Math.max(0, Math.min(1, (p.energy - CONDITION.FLOOR) / (100 - CONDITION.FLOOR)));
  return CONDITION.DRAIN_SCALE * headroom * (p.role === 'GK' ? CONDITION.GK_DRAIN_SCALE : 1);
}

/**
 * Condition after the break. FM: +`HALF_TIME_RECOVERY` points (stamina scales it ±25%), never above the kick-off
 * value. Off: 30–60% of the gap to the kick-off value (stamina 0 → 10), as before. `scale` 1 at half time, 0.5 before
 * extra time, 0 between the extra-time halves.
 */
export function halfTimeCondition(p: Pick<GamePlayer, 'energy' | 'startEnergy' | 'stamina'>, scale: number): number {
  const cap = Math.max(p.energy, p.startEnergy);
  if (DECISION_FLAGS.FM_CONDITION) {
    const span = CONDITION.HALF_TIME_STAMINA_SPAN;
    const gain = CONDITION.HALF_TIME_RECOVERY * (1 - span / 2 + span * p.stamina / 10) * scale;
    return Math.min(cap, p.energy + gain);
  }
  const rate = (0.30 + (p.stamina / 10) * 0.30) * scale;
  return Math.min(p.startEnergy, p.energy + (p.startEnergy - p.energy) * rate);
}

/** Median of the outfield players' condition (FM's measure, report 9 §6); NaN with nobody. */
export function outfieldMedianCondition(players: readonly Pick<GamePlayer, 'energy' | 'role'>[]): number {
  const v = players.filter(p => p.role !== 'GK').map(p => p.energy).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
