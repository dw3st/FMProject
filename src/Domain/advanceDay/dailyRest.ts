import type { Squad } from "@/types/playerTypes";
import type { RestEvent } from "@/types/dayLogTypes";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { decayLoad, recoverDay } from "@/Domain/fitness/fitness";
import { clearHealed } from "@/Domain/injury/injury";
import { staffEffectsOf } from "@/Domain/staff/staff";

export const MAX_POINTS_LOST_PER_REST = 2;

/** `stats.stamina` (0–10) is required on the type, but fall back defensively — see fitness.md. */
const DEFAULT_STAMINA = 7;

export interface RestResult {
  event: RestEvent;
  updatedSquad: Squad;
  /** Players whose injury cleared today (`clearHealed`) — for the "return" inbox message. */
  healedPlayerIds: string[];
}

export interface RestOutcome {
  /** Always ≥ 0 (never exceeds what `recoverDay` would add). A full rest-day recovery. */
  fitnessDelta: number;
  /** Always ≤ 0. Up to MAX_POINTS_LOST_PER_REST training points are lost. */
  pointsDelta: number;
}

/**
 * Rolls one rest day outcome for a single player.
 * - `fitnessDelta`: `recoverDay(fitness, {age, load, stamina})` minus the starting `fitness` — the
 *   same recovery curve driving training (`.claude/rules/game/fitness.md`), not a random roll.
 * - `pointsDelta`: negative — 0 to -MAX_POINTS_LOST_PER_REST training points lost. Unchanged from
 *   before — this is the weekly training-points counter, not the DP/development system.
 * Calls `rand` once, for points lost only (fitness recovery is now deterministic given its inputs).
 *
 * Position is not used: goalkeepers recover fitness here at the same rate as outfield players.
 * (GK-only fatigue reduction applies only in `rollTrainingOutcome`, not on rest.)
 */
export function rollRestOutcome(
  age: number,
  fitness: number,
  load: number,
  stamina: number,
  rand: () => number = Math.random,
  recoveryMult = 1,
): RestOutcome {
  const pointsLost = +(rand() * MAX_POINTS_LOST_PER_REST).toFixed(2);
  const nextFitness = recoverDay(fitness, { age, load, stamina, recoveryMult });
  const fitnessDelta = +(nextFitness - fitness).toFixed(1);

  return { fitnessDelta, pointsDelta: -pointsLost };
}

/**
 * Builds a rest event for the entire squad — all players rest regardless of fitness level.
 * - `fitness` recovers via `recoverDay` (age/load/stamina factors) and is capped at 100.
 * - `load` decays by one day's half-life (`decayLoad`) — a rest day is a low-intensity day.
 * - `trainingSessions` (points) never goes below 0.
 */
export function buildRestEvent(squadId: string, squad: Squad, date: string): RestResult {
  const { recoveryMult } = staffEffectsOf(squad);
  // Clear a healed injury before anything else, same as `matches.ts` / `dailyTraining.ts`.
  const healedPlayerIds: string[] = [];
  const players = squad.players.map((p) => {
    if (p.injury && !clearHealed(p, date).injury) healedPlayerIds.push(String(p.id));
    return clearHealed(p, date);
  });

  const effects = players.map((p) => {
    const log = ensureSeasonLog(p).seasonLog!;
    const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
    const { fitnessDelta, pointsDelta } = rollRestOutcome(p.age, log.fitness, log.load ?? 0, stamina, Math.random, recoveryMult);
    return { playerId: String(p.id), name: p.name, fitnessDelta, pointsDelta };
  });

  const effectMap = new Map(effects.map((e) => [e.playerId, e]));

  const updatedSquad: Squad = {
    ...squad,
    players: players.map((p) => {
      const pl = ensureSeasonLog(p);
      const log = { ...pl.seasonLog! };
      const eff = effectMap.get(String(p.id));
      if (eff) {
        log.fitness = Math.min(100, Math.max(0, +(log.fitness + eff.fitnessDelta).toFixed(1)));
        log.trainingSessions = Math.max(0, +(log.trainingSessions + eff.pointsDelta).toFixed(2));
        log.load = decayLoad(log.load ?? 0);
      }
      return { ...pl, seasonLog: log };
    }),
  };

  return { event: { kind: "rest", squadId, effects }, updatedSquad, healedPlayerIds };
}
