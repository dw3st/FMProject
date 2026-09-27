import { FITNESS } from "@/Domain/fitness/fitnessConfig";

/**
 * Pure fitness/fatigue model (`docs/superpowers/specs/2026-09-27-stamina-design.md` §1). No I/O —
 * every function here takes plain numbers and returns plain numbers. Callers (the engine, quickSim,
 * `advanceDay`) own reading/writing `seasonLog.fitness` / `seasonLog.load`.
 */

/** Age → recovery multiplier, from `FITNESS.AGE_FACTOR` (ascending thresholds, last is the catch-all). */
export function ageRecoveryFactor(age: number): number {
  for (const [threshold, factor] of FITNESS.AGE_FACTOR) {
    if (age <= threshold) return factor;
  }
  // Unreachable — the last threshold is Infinity — but keeps the function total for TS.
  return FITNESS.AGE_FACTOR[FITNESS.AGE_FACTOR.length - 1]![1];
}

/** Load → recovery multiplier: 1 at load 0, down to `1 − LOAD_RECOVERY_PENALTY` at `LOAD_HIGH`, linear between (clamped beyond). */
export function loadRecoveryFactor(load: number): number {
  return 1 - FITNESS.LOAD_RECOVERY_PENALTY * Math.min(1, Math.max(0, load) / FITNESS.LOAD_HIGH);
}

/** Stamina attribute (0..10) → recovery multiplier: `base + span × stamina/10`. */
export function staminaRecoveryFactor(stamina: number): number {
  const { base, span } = FITNESS.STAMINA_RECOVERY;
  return base + span * (stamina / 10);
}

/**
 * One rest/training day's recovery: `fitness += (100 − fitness) × rate`, where `rate` combines age,
 * load and stamina factors on top of `RECOVERY_BASE`. Never exceeds 100. Monotonically non-decreasing
 * in `fitness` (a player who plays today should not call this for that day — see spec §1 "Dia de
 * jogo do time").
 */
export function recoverDay(
  fitness: number,
  p: { age: number; load: number; stamina: number },
): number {
  const rate =
    FITNESS.RECOVERY_BASE *
    ageRecoveryFactor(p.age) *
    loadRecoveryFactor(p.load) *
    staminaRecoveryFactor(p.stamina);
  return Math.min(100, fitness + (100 - fitness) * rate);
}

/** Load half-life decay over `days` (default 1), half-life = `FITNESS.LOAD_HALF_LIFE_DAYS`. */
export function decayLoad(load: number, days = 1): number {
  const decayRate = Math.LN2 / FITNESS.LOAD_HALF_LIFE_DAYS;
  return load * Math.exp(-decayRate * days);
}

/** A match adds its played minutes (90/120, or less on a sub) straight onto the load. */
export function addMatchLoad(load: number, minutes: number): number {
  return load + minutes;
}

/** Only a heavy training session adds load (`FITNESS.HEAVY_TRAINING_LOAD`); light/normal add none. */
export function addTrainingLoad(load: number, intensity: "light" | "normal" | "heavy"): number {
  return load + (intensity === "heavy" ? FITNESS.HEAVY_TRAINING_LOAD : 0);
}

/** In-match energy-cost multiplier from load: 1 at load 0, up to `1 + LOAD_DRAIN_BONUS` at `LOAD_HIGH`, linear between. */
export function drainMultiplier(load: number): number {
  return 1 + FITNESS.LOAD_DRAIN_BONUS * Math.min(1, Math.max(0, load) / FITNESS.LOAD_HIGH);
}

/** Post-match fitness is simply the end-of-match energy, rounded and clamped to 0..100. */
export function postMatchFitness(endEnergy: number): number {
  return Math.min(100, Math.max(0, Math.round(endEnergy)));
}
