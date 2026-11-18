import {
  ageDecayPerMatch, ageGrowthMultiplier, decayDpScale, eliteBrake, trainingAgeFactor, TRAINING_DP_RATIO,
  type DPCategory,
} from "@/GameEngine/PlayerDevelopment";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { youthAttributeMult } from "@/Domain/achievements/managerAttributes";
import { trainingGroundEffectsOf } from "@/Domain/facilities/facilities";
import { moraleDpMult } from "@/Domain/morale/morale";
import { professionalismDecayMult, professionalismDpMult, shieldedMoraleDpMult } from "@/Domain/personality/personality";
import { overallAvg } from "@/Domain/playerRating";
import { rebornDpMult } from "@/Domain/retirement/rebornMult";
import { areaMultsOf, areaStars, effectiveStars, staffEffectsOf } from "@/Domain/staff/staff";
import type { TrainingIntensity } from "@/types/developmentTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * What drives a player's growth and decline, read from the same functions the day advance uses
 * (`matches.ts`, `dailyTraining.ts`, `PlayerDevelopment.ts`). Pure: the development screen shows it, nothing stores it.
 */

/** Where a factor acts: every growth DP, only matches, only training, or the age decline. */
export type DevFactorScope = "all" | "match" | "training" | "decay";

export type DevFactorId =
  | "assistant" | "area" | "trainingGround" | "matchGround" | "professionalism" | "morale"
  | "reborn" | "managerYouth" | "eliteBrake" | "intensity" | "trainingAge" | "professionalismDecay";

export interface DevFactor {
  id: DevFactorId;
  /** Multiplier against a neutral club and player (1 = no effect). */
  mult: number;
  scope: DevFactorScope;
  /** Staff stars behind it (assistant, area coach); null = vacant. */
  stars?: number | null;
  /** Training area (area factor). */
  area?: DPCategory;
}

/** Growing (no age decline yet), at peak (little growth, a little decline) or declining (no growth left). */
export type GrowthPhase = "growing" | "peak" | "declining";

export interface DevelopmentFactors {
  phase: GrowthPhase;
  /** The age growth multiplier against the youngest (1 = the fastest pace), 0..1. */
  ageGrowthShare: number;
  /** Age decline DP per match after the scale and professionalism (0 = none). */
  ageDecay: number;
  factors: DevFactor[];
  /** The factor that moves his growth the most (the age decline when declining); null when all are neutral. */
  main: DevFactor | { id: "age" } | null;
}

/** The two training areas that carry most of the player's DP (weight above 0). */
export function mainAreas(player: RosterPlayer): DPCategory[] {
  const w = dpWeightsFor(player);
  return (Object.entries(w) as [DPCategory, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => c);
}

export function growthPhase(age: number): GrowthPhase {
  if (ageDecayPerMatch(age) === 0) return "growing";
  return ageGrowthMultiplier(age) > 0 ? "peak" : "declining";
}

const NEUTRAL = 1e-9;
const isNeutral = (m: number) => Math.abs(m - 1) < NEUTRAL;

/**
 * The factors of one player of the human club (`squad`) under `intensity`. Staff, area and intensity are always
 * listed (they are the levers the manager has); the rest only when they move the DP.
 */
export function developmentFactors(
  player: RosterPlayer,
  squad: Squad,
  intensity: TrainingIntensity,
): DevelopmentFactors {
  const age = player.age;
  const youngest = ageGrowthMultiplier(16);
  const ageGrowthShare = youngest > 0 ? ageGrowthMultiplier(age) / youngest : 0;
  const decayMult = professionalismDecayMult(player);
  const ageDecay = ageDecayPerMatch(age) * decayDpScale(age) * decayMult;
  const phase = growthPhase(age);

  const factors: DevFactor[] = [];
  const staff = staffEffectsOf(squad);
  factors.push({ id: "assistant", mult: staff.devMult, scope: "all", stars: effectiveStars(squad, "assistant") });

  const areaMult = areaMultsOf(squad);
  const stars = areaStars(squad);
  for (const area of mainAreas(player)) {
    factors.push({ id: "area", area, mult: areaMult[area], scope: "all", stars: stars[area] });
  }

  const ground = trainingGroundEffectsOf(squad);
  if (!isNeutral(ground.devMult)) factors.push({ id: "trainingGround", mult: ground.devMult, scope: "training" });
  if (!isNeutral(ground.matchDevMult)) factors.push({ id: "matchGround", mult: ground.matchDevMult, scope: "match" });

  const pro = professionalismDpMult(player);
  if (!isNeutral(pro)) factors.push({ id: "professionalism", mult: pro, scope: "all" });
  const morale = shieldedMoraleDpMult(player, moraleDpMult(player));
  if (!isNeutral(morale)) factors.push({ id: "morale", mult: morale, scope: "all" });
  const reborn = rebornDpMult(player);
  if (!isNeutral(reborn)) factors.push({ id: "reborn", mult: reborn, scope: "all" });
  const youth = youthAttributeMult(squad.managerAttributes, age);
  if (!isNeutral(youth)) factors.push({ id: "managerYouth", mult: youth, scope: "all" });
  const brake = eliteBrake(overallAvg(player));
  if (!isNeutral(brake)) factors.push({ id: "eliteBrake", mult: brake, scope: "all" });

  factors.push({ id: "intensity", mult: TRAINING_DP_RATIO[intensity] / TRAINING_DP_RATIO.normal, scope: "training" });
  const trainAge = trainingAgeFactor(age);
  if (!isNeutral(trainAge)) factors.push({ id: "trainingAge", mult: trainAge, scope: "training" });
  if (ageDecay > 0 && !isNeutral(decayMult)) factors.push({ id: "professionalismDecay", mult: decayMult, scope: "decay" });

  return { phase, ageGrowthShare, ageDecay, factors, main: mainFactor(phase, factors) };
}

/** The growth factor farthest from neutral (log scale); the age decline wins once he no longer grows. */
function mainFactor(phase: GrowthPhase, factors: readonly DevFactor[]): DevelopmentFactors["main"] {
  if (phase === "declining") return { id: "age" };
  let best: DevFactor | null = null;
  for (const f of factors) {
    if (f.scope === "decay" || f.id === "trainingAge" || isNeutral(f.mult)) continue;
    if (!best || Math.abs(Math.log(f.mult)) > Math.abs(Math.log(best.mult))) best = f;
  }
  return best;
}

/** A multiplier as a signed whole percent against neutral (1.08 → 8, 0.9 → -10). */
export function factorPercent(mult: number): number {
  return Math.round((mult - 1) * 100);
}
