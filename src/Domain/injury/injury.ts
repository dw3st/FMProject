import { INJURY } from "@/Domain/injury/injuryConfig";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * Pure injury model (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1). No I/O — every
 * function here takes plain values (and an injected `rng` where randomness is needed) and returns
 * plain values. Callers (the engine, quickSim, `advanceDay`, training) own reading/writing
 * `player.injury` and `seasonLog.fitness`.
 */

export type InjurySeverity = "light" | "medium" | "severe";

export interface InjuryFactors {
  /** Current match/day energy, 0..100 (see `Domain/fitness`). */
  energy: number;
  /** Accumulated fatigue load, minutes-equivalent (see `Domain/fitness`). */
  load: number;
  age: number;
  /** Strength attribute, 0..10 scale. */
  strength: number;
}

/** Energy (0..100) → injury-rate multiplier: 1 at 100, up to `ENERGY_MAX_MULT` at 0, linear. */
export function energyInjuryFactor(energy: number): number {
  const clamped = Math.min(100, Math.max(0, energy));
  return 1 + (INJURY.ENERGY_MAX_MULT - 1) * (1 - clamped / 100);
}

/** Load → injury-rate multiplier: 1 at load 0, up to `1 + LOAD_MAX_BONUS` at `LOAD_HIGH`, linear (clamped beyond). */
export function loadInjuryFactor(load: number): number {
  return 1 + INJURY.LOAD_MAX_BONUS * Math.min(1, Math.max(0, load) / INJURY.LOAD_HIGH);
}

/** Age → injury-rate multiplier: 1 up to `AGE_REF`, up to `AGE_MAX_MULT` at `AGE_SATURATION`, linear between. */
export function ageInjuryFactor(age: number): number {
  if (age <= INJURY.AGE_REF) return 1;
  const t = Math.min(1, (age - INJURY.AGE_REF) / (INJURY.AGE_SATURATION - INJURY.AGE_REF));
  return 1 + (INJURY.AGE_MAX_MULT - 1) * t;
}

/** Strength (0..10) → injury-rate multiplier: 1 at/below `STRENGTH_REF`, down to `1 − STRENGTH_MAX_REDUCTION` at 10, linear. */
export function strengthInjuryFactor(strength: number): number {
  const clamped = Math.min(10, Math.max(0, strength));
  if (clamped <= INJURY.STRENGTH_REF) return 1;
  const span = 10 - INJURY.STRENGTH_REF;
  const t = (clamped - INJURY.STRENGTH_REF) / span;
  return 1 - INJURY.STRENGTH_MAX_REDUCTION * t;
}

/** Combined injury-rate multiplier from the four factors. */
function combinedFactor(p: InjuryFactors): number {
  return (
    energyInjuryFactor(p.energy) *
    loadInjuryFactor(p.load) *
    ageInjuryFactor(p.age) *
    strengthInjuryFactor(p.strength)
  );
}

/**
 * Per-minute injury probability for a player under the given conditions. `BASE` is a placeholder
 * (see `injuryConfig.ts`) — at every baseline factor (full energy, low load, ≤30yo, avg strength)
 * this equals `INJURY.BASE` exactly.
 */
export function injuryRatePerMinute(p: InjuryFactors): number {
  return INJURY.BASE * combinedFactor(p);
}

/**
 * Extra injury probability for a single contact event (a tackle or a loose-ball duel), for one of
 * the two players involved. Same factor scaling as `injuryRatePerMinute`, different base rate.
 */
export function contactInjuryChance(p: InjuryFactors): number {
  return INJURY.CONTACT_BASE * combinedFactor(p);
}

/** Heavy training's small flat chance of a light injury. Light/normal training never injures. */
export function trainingInjuryChance(intensity: "light" | "normal" | "heavy"): number {
  return intensity === "heavy" ? INJURY.HEAVY_TRAINING_CHANCE : 0;
}

/** Rolls a severity from `INJURY.SEVERITY_WEIGHTS` (60% light / 30% medium / 10% severe). */
export function rollSeverity(rng: () => number = Math.random): InjurySeverity {
  const roll = rng();
  const { light, medium } = INJURY.SEVERITY_WEIGHTS;
  if (roll < light) return "light";
  if (roll < light + medium) return "medium";
  return "severe";
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days out for a severity: uniform integer in `INJURY.DURATION_DAYS[severity]` (inclusive). */
export function injuryDurationDays(severity: InjurySeverity, rng: () => number = Math.random): number {
  const [min, max] = INJURY.DURATION_DAYS[severity];
  return min + Math.floor(rng() * (max - min + 1));
}

/** ISO return date: `date` plus a random duration for `severity` (`INJURY.DURATION_DAYS`). */
export function returnDate(
  date: string,
  severity: InjurySeverity,
  rng: () => number = Math.random,
): string {
  return addDays(date, injuryDurationDays(severity, rng));
}

/** True when the player is currently sidelined by an injury on `date` (strictly before `returnDate`). */
export function isInjured(player: Pick<RosterPlayer, "injury">, date: string): boolean {
  return !!player.injury && date < player.injury.returnDate;
}

/**
 * Clears a healed injury: when `player.injury` exists and `date >= returnDate`, returns a new
 * player object with `injury` removed and `seasonLog.fitness` set to `INJURY.RETURN_FITNESS`
 * (spec: "volta com fôlego ~70"). Otherwise returns `player` unchanged (same reference). Pure —
 * never mutates the input.
 */
export function clearHealed(player: RosterPlayer, date: string): RosterPlayer {
  if (!player.injury || date < player.injury.returnDate) return player;
  const { injury: _injury, ...rest } = player;
  return {
    ...rest,
    ...(player.seasonLog
      ? { seasonLog: { ...player.seasonLog, fitness: INJURY.RETURN_FITNESS } }
      : {}),
  };
}
