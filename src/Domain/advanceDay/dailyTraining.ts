import { moraleDpMult } from "@/Domain/morale/morale";
import { personalDpMult } from "@/Domain/personality/personality";
import { rebornDpMult } from "@/Domain/retirement/rebornMult";
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
import { addTrainingLoad, decayLoad, recoverDay } from "@/Domain/fitness/fitness";
import {
  applyTrainingDevelopment,
  DEFAULT_DP_WEIGHTS,
  type RoleDPWeights,
} from "@/GameEngine/PlayerDevelopment";
import rolesData from "@/Data/roles.json";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { trainingGroundEffectsOf } from "@/Domain/facilities/facilities";
import { trainFamiliarity } from "@/Domain/familiarity/familiarity";
import { FAMILIARITY } from "@/Domain/familiarity/familiarityConfig";
import type { FamiliarityKey } from "@/types/familiarityTypes";
import {
  clearHealed,
  isInjured,
  mergeInjury,
  returnDate as injuryReturnDate,
  rollSeverity,
  trainingInjuryChance,
  type InjurySeverity,
} from "@/Domain/injury/injury";

/** `stats.stamina` (0–10) is required on the type, but fall back defensively — see fitness.md. */
const DEFAULT_STAMINA = 7;

export const MAX_TRAINING_POINTS = 5;

/** Subset of save meta needed to resolve training for a club. */
export type TrainingMetaSlice = {
  clubId: string;
  min_energy_to_train?: number;
  training_intensity?: TrainingIntensity;
  /** Style the human club drills (`src/Domain/familiarity`). */
  style_focus?: FamiliarityKey;
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
): TrainingPolicy {
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
    ...(meta.style_focus ? { styleFocus: meta.style_focus } : {}),
  };
}

export interface TrainingPolicy {
  minEnergyToTrain: number;
  intensity: TrainingIntensity;
  /** Human club only: the familiarity key this session drills (absent = every key decays). */
  styleFocus?: FamiliarityKey;
}

/** One training-caused injury (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Treino"). */
interface NewTrainingInjury {
  playerId:   string;
  playerName: string;
  severity:   InjurySeverity;
  returnDate: string;
}

export interface TrainingResult {
  event: TrainingEvent;
  updatedSquad: Squad;
  /** Players whose injury cleared today (`clearHealed`) — for the "return" inbox message. */
  healedPlayerIds: string[];
  /** Players newly injured by a heavy session today — for the "injured" inbox message. */
  newInjuries: NewTrainingInjury[];
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

/**
 * @param policy.intensity — used for both eligible players' session AND the load a heavy
 *   session adds (`addTrainingLoad`); ineligible players below `minEnergyToTrain`, or currently
 *   injured, never train (`.claude/rules/game/fitness.md`, `.claude/rules/game/injuries.md`) —
 *   they get a full rest-day recovery (`recoverDay`) instead.
 * @param date — today's ISO date. Clears a healed injury (`clearHealed`) before anything else, and
 *   is the day a new heavy-training injury (`trainingInjuryChance`) starts counting from.
 */
export function buildTrainingEvent(
  squadId: string,
  squad: Squad,
  policy: TrainingPolicy,
  date: string,
  rng: () => number = Math.random,
): TrainingResult {
  const staffFx = staffEffectsOf(squad);
  // Training ground (`.claude/rules/game/facilities.md`): stacks with the staff, training only.
  const ground = trainingGroundEffectsOf(squad);
  const devMult = staffFx.devMult;
  const recoveryMult = staffFx.recoveryMult * ground.recoveryMult;
  const injuryMult = staffFx.injuryMult * ground.injuryMult;
  // Clear a healed injury BEFORE eligibility/training is decided — a player who returns today can
  // train (or be ineligible on fitness) the same day, same as `matches.ts`.
  const healedPlayerIds: string[] = [];
  const players = squad.players.map((p) => {
    if (p.injury && !clearHealed(p, date).injury) healedPlayerIds.push(String(p.id));
    return clearHealed(p, date);
  });

  const eligibleIds = new Set(
    players
      .filter((p) => (ensureSeasonLog(p).seasonLog?.fitness ?? 0) >= policy.minEnergyToTrain)
      .filter((p) => !isInjured(p, date))
      .map((p) => String(p.id)),
  );

  const newInjuries: NewTrainingInjury[] = [];
  const injuryByPlayer = new Map<string, NewTrainingInjury>();

  const effects: TrainingEffect[] = players.map((p) => {
    const log = ensureSeasonLog(p).seasonLog!;
    if (eligibleIds.has(String(p.id))) {
      const { fitnessDelta, trainingPoints } = rollTrainingOutcome(
        policy.intensity,
        p.age,
        Math.random,
        isGoalkeeperPlayer(p.positions),
      );
      // The raw session cost scales down with how tired the player already is (a worn-down
      // player has less fitness left to lose) — see `.claude/rules/game/fitness.md`.
      const scaledFitnessDelta = +(fitnessDelta * (log.fitness / 100)).toFixed(1);
      // Heavy training's small flat chance of a light injury — light/normal training never rolls.
      if (rng() < trainingInjuryChance(policy.intensity, injuryMult)) {
        const severity = rollSeverity(rng);
        const injury: NewTrainingInjury = {
          playerId: String(p.id),
          playerName: p.name,
          severity,
          returnDate: injuryReturnDate(date, severity, rng),
        };
        newInjuries.push(injury);
        injuryByPlayer.set(String(p.id), injury);
      }
      return { playerId: String(p.id), name: p.name, fitnessDelta: scaledFitnessDelta, trainingPoints };
    }
    // Ineligible players skip training entirely and get a full rest-day recovery instead.
    const stamina = p.stats.stamina ?? DEFAULT_STAMINA;
    const nextFitness = recoverDay(log.fitness, { age: p.age, load: log.load ?? 0, stamina, recoveryMult });
    return {
      playerId: String(p.id),
      name: p.name,
      fitnessDelta: +(nextFitness - log.fitness).toFixed(1),
      trainingPoints: 0,
    };
  });

  const effectMap = new Map(effects.map((e) => [e.playerId, e]));

  const updatedSquad: Squad = {
    ...squad,
    // Style familiarity: only a club that stores it (the human club) trains it — AI clubs follow
    // the implicit rule (`src/Domain/familiarity`).
    ...(squad.styleFamiliarity
      ? {
          // Gain only when somebody actually trained today; scaled by the assistant and the intensity.
          styleFamiliarity: trainFamiliarity(
            squad.styleFamiliarity,
            eligibleIds.size > 0 ? policy.styleFocus : undefined,
            devMult * FAMILIARITY.INTENSITY_GAIN[policy.intensity],
          ),
        }
      : {}),
    players: players.map((p) => {
      const didTrain = eligibleIds.has(String(p.id));
      const eff = effectMap.get(String(p.id));
      const trained = eff != null && eff.trainingPoints > 0;

      // Apply training-driven development first (only for players who actually trained).
      let next = p;
      if (trained) {
        const roleKey = p.positions[0] ?? "CM";
        const roleEntry = (rolesData as Record<string, { dpWeights?: RoleDPWeights }>)[roleKey];
        const weights = roleEntry?.dpWeights ?? DEFAULT_DP_WEIGHTS;
        const { updatedPlayer, levelChanges, dpGained } =
          applyTrainingDevelopment(p, policy.intensity, weights, devMult * ground.devMult * rebornDpMult(p) * personalDpMult(p, moraleDpMult(p)));
        next = updatedPlayer;
        if (dpGained > 0) {
          eff!.dpGained = +dpGained.toFixed(2);
          if (levelChanges) eff!.levelChanges = levelChanges.changes;
        }
      }

      // Then layer the season-log mutation (fitness + training session counter + load) on top.
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
        const decayed = decayLoad(log.load ?? 0);
        log.load = didTrain ? addTrainingLoad(decayed, policy.intensity) : decayed;
      }
      const newInjury = injuryByPlayer.get(String(p.id));
      return {
        ...pl,
        seasonLog: log,
        ...(newInjury
          ? { injury: mergeInjury(pl.injury, { severity: newInjury.severity, returnDate: newInjury.returnDate }) }
          : {}),
      };
    }),
  };

  return { event: { kind: "training", squadId, effects }, updatedSquad, healedPlayerIds, newInjuries };
}
