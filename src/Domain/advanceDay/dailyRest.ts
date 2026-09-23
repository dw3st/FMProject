import type { Squad } from "@/types/playerTypes";
import type { RestEvent } from "@/types/dayLogTypes";
import { trainingFitnessCostRange, restAgeRecoveryFactor } from "@/types/developmentTypes";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";

export const MAX_POINTS_LOST_PER_REST = 2;

export interface RestResult {
  event: RestEvent;
  updatedSquad: Squad;
}

export interface RestOutcome {
  /** Always ≥ 0. Recovery matches the same magnitude as a heavy training session. */
  fitnessDelta: number;
  /** Always ≤ 0. Up to MAX_POINTS_LOST_PER_REST training points are lost. */
  pointsDelta: number;
}

/**
 * Rolls one rest day outcome for a single player.
 * - `fitnessDelta`: positive recovery (same base roll as heavy training cost, age inverted so youth recovers faster).
 * - `pointsDelta`: negative — 0 to -MAX_POINTS_LOST_PER_REST training points lost.
 * Calls `rand` twice: once for points lost, once for fitness recovery magnitude.
 *
 * Position is not used: goalkeepers recover fitness here at the same rate as outfield players.
 * (GK-only fatigue reduction applies only in `rollTrainingOutcome`, not on rest.)
 */
export function rollRestOutcome(
  age: number,
  rand: () => number = Math.random,
): RestOutcome {
  const [cMin, cMax] = trainingFitnessCostRange("heavy");
  const recoveryFactor = restAgeRecoveryFactor(age);

  const pointsLost   = +(( rand() * MAX_POINTS_LOST_PER_REST).toFixed(2));
  const baseRecovery = cMin + rand() * (cMax - cMin);
  const fitnessDelta = +((baseRecovery * recoveryFactor).toFixed(1));

  return { fitnessDelta, pointsDelta: -pointsLost };
}

/**
 * Builds a rest event for the entire squad — all players rest regardless of fitness level.
 * - `fitness` is capped at 100.
 * - `trainingSessions` (points) never goes below 0.
 */
export function buildRestEvent(squadId: string, squad: Squad): RestResult {
  const effects = squad.players.map((p) => {
    const { fitnessDelta, pointsDelta } = rollRestOutcome(p.age);
    return { playerId: String(p.id), name: p.name, fitnessDelta, pointsDelta };
  });

  const effectMap = new Map(effects.map((e) => [e.playerId, e]));

  const updatedSquad: Squad = {
    ...squad,
    players: squad.players.map((p) => {
      const pl = ensureSeasonLog(p);
      const log = { ...pl.seasonLog! };
      const eff = effectMap.get(String(p.id));
      if (eff) {
        log.fitness = Math.min(100, Math.max(0, +(log.fitness + eff.fitnessDelta).toFixed(1)));
        log.trainingSessions = Math.max(0, +(log.trainingSessions + eff.pointsDelta).toFixed(2));
      }
      return { ...pl, seasonLog: log };
    }),
  };

  return { event: { kind: "rest", squadId, effects }, updatedSquad };
}
