import type { Squad } from "@/types/playerTypes";
import type { TrainingEffect, TrainingEvent } from "@/types/dayLogTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import {
  DEFAULT_MIN_ENERGY_TO_TRAIN,
  DEFAULT_TRAINING_INTENSITY,
  GOALKEEPER_TRAINING_FATIGUE_MULTIPLIER,
  isGoalkeeperPlayer,
  trainingPointsRange,
  trainingFitnessCostRange,
  trainingAgeCostFactor,
} from "@/types/developmentTypes";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { isPlayerSquadId } from "@/Domain/clubLookup";
import { rollRestOutcome } from "@/Domain/advanceDay/dailyRest";
import {
  applyTrainingDevelopment,
  DEFAULT_DP_WEIGHTS,
  type RoleDPWeights,
} from "@/GameEngine/PlayerDevelopment";
import rolesData from "@/Data/roles.json";

const INELIGIBLE_RECOVERY_FRACTION = 0.4;

export const MAX_TRAINING_POINTS = 5;

/** Subset of save meta needed to resolve training for a club. */
export type TrainingMetaSlice = {
  clubId: string;
  min_energy_to_train?: number;
  training_intensity?: TrainingIntensity;
};

/**
 * @param resolvedClubSlug — from `clubSlugFromSquadId` (filesystem / URL slug).
 * @param standingsSquadId — optional `squadId` from league standings. When save `clubId`
 *   is the numeric squad id (e.g. `"124"`), it matches `standingsSquadId`, not the resolved slug.
 */
export function resolveTrainingPolicy(
  meta: TrainingMetaSlice,
  resolvedClubSlug: string,
  standingsSquadId?: string,
): {
  minEnergyToTrain: number;
  intensity: TrainingIntensity;
} {
  const userClub =
    (standingsSquadId != null && isPlayerSquadId(standingsSquadId, meta)) ||
    resolvedClubSlug === meta.clubId;
  if (!userClub) {
    return {
      minEnergyToTrain: DEFAULT_MIN_ENERGY_TO_TRAIN,
      intensity: DEFAULT_TRAINING_INTENSITY,
    };
  }
  return {
    minEnergyToTrain: meta.min_energy_to_train ?? DEFAULT_MIN_ENERGY_TO_TRAIN,
    intensity: meta.training_intensity ?? DEFAULT_TRAINING_INTENSITY,
  };
}

export interface TrainingResult {
  event: TrainingEvent;
  updatedSquad: Squad;
}

export interface TrainingOutcome {
  /** Always ≤ 0. Heavier sessions and older players pay more. */
  fitnessDelta: number;
  /** Points earned this session. Accumulated total is capped at MAX_TRAINING_POINTS. */
  trainingPoints: number;
}

/**
 * Rolls one training session outcome.
 * - `trainingPoints`: random draw within the intensity range [min, max].
 * - `fitnessDelta`: negative cost scaled by intensity and age.
 * Calls `rand` twice: once for points, once for fitness cost.
 */
export function rollTrainingOutcome(
  intensity: TrainingIntensity,
  age: number,
  rand: () => number = Math.random,
  isGoalkeeper = false,
): TrainingOutcome {
  const [pMin, pMax] = trainingPointsRange(intensity);
  const [cMin, cMax] = trainingFitnessCostRange(intensity);
  const ageFactor = trainingAgeCostFactor(age);

  const trainingPoints = +((pMin + rand() * (pMax - pMin)).toFixed(2));
  const baseCost = cMin + rand() * (cMax - cMin);
  let fitnessDelta = +(-(baseCost * ageFactor).toFixed(1));
  if (isGoalkeeper) {
    fitnessDelta = +(fitnessDelta * GOALKEEPER_TRAINING_FATIGUE_MULTIPLIER).toFixed(1);
  }

  return { fitnessDelta, trainingPoints };
}

export function buildTrainingEvent(
  squadId: string,
  squad: Squad,
  policy: { minEnergyToTrain: number; intensity: TrainingIntensity },
): TrainingResult {
  const eligibleIds = new Set(
    squad.players
      .filter((p) => (ensureSeasonLog(p).seasonLog?.fitness ?? 0) >= policy.minEnergyToTrain)
      .map((p) => String(p.id)),
  );

  const effects: TrainingEffect[] = squad.players.map((p) => {
    if (eligibleIds.has(String(p.id))) {
      const { fitnessDelta, trainingPoints } = rollTrainingOutcome(
        policy.intensity,
        p.age,
        Math.random,
        isGoalkeeperPlayer(p.positions),
      );
      return { playerId: String(p.id), name: p.name, fitnessDelta, trainingPoints };
    }
    // Ineligible players get partial rest recovery instead of training.
    const { fitnessDelta: restDelta } = rollRestOutcome(p.age);
    return {
      playerId: String(p.id),
      name: p.name,
      fitnessDelta: +(restDelta * INELIGIBLE_RECOVERY_FRACTION).toFixed(1),
      trainingPoints: 0,
    };
  });

  const effectMap = new Map(effects.map((e) => [e.playerId, e]));

  const updatedSquad: Squad = {
    ...squad,
    players: squad.players.map((p) => {
      const eff = effectMap.get(String(p.id));
      const trained = eff != null && eff.trainingPoints > 0;

      // Apply training-driven development first (only for players who actually trained).
      let next = p;
      if (trained) {
        const roleKey = p.positions[0] ?? "CM";
        const roleEntry = (rolesData as Record<string, { dpWeights?: RoleDPWeights }>)[roleKey];
        const weights = roleEntry?.dpWeights ?? DEFAULT_DP_WEIGHTS;
        const { updatedPlayer, levelChanges, dpGained } =
          applyTrainingDevelopment(p, policy.intensity, weights);
        next = updatedPlayer;
        if (dpGained > 0) {
          eff!.dpGained = +dpGained.toFixed(2);
          if (levelChanges) eff!.levelChanges = levelChanges.changes;
        }
      }

      // Then layer the season-log mutation (fitness + training session counter) on top.
      const pl = ensureSeasonLog(next);
      const log = { ...pl.seasonLog! };
      if (eff) {
        if (eff.trainingPoints > 0) {
          log.trainingSessions = Math.min(
            MAX_TRAINING_POINTS,
            +(log.trainingSessions + eff.trainingPoints).toFixed(2),
          );
        }
        log.fitness = Math.min(100, Math.max(0, +(log.fitness + eff.fitnessDelta).toFixed(1)));
      }
      return { ...pl, seasonLog: log };
    }),
  };

  return { event: { kind: "training", squadId, effects }, updatedSquad };
}
