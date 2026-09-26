import type { CupStageName } from "@/types/calendarTypes";

/** Stage key for a stage with `entrants` clubs (a power of two ≥ 2). */
export function stageNameFor(entrants: number): Exclude<CupStageName, "preliminary"> {
  if (entrants <= 2) return "final";
  if (entrants <= 4) return "sf";
  if (entrants <= 8) return "qf";
  if (entrants <= 16) return "r16";
  if (entrants <= 32) return "r32";
  if (entrants <= 64) return "r64";
  return "r128";
}

export interface StagePlan {
  /** Clubs (the lowest-tier ones) that play the preliminary stage; 0 = none. */
  preliminaryClubs: number;
  stageNames: CupStageName[];
}

/**
 * Knockout stages for `n` clubs. F = ceil(log2 n) stages. When n is not a power of two, stage 1 is a
 * preliminary with 2 × (n − 2^(F−1)) clubs; its winners plus the byes make 2^(F−1) for stage 2.
 */
export function planStages(n: number): StagePlan | null {
  if (n < 2) return null;
  const f = Math.ceil(Math.log2(n));
  const full = 2 ** f;
  const names: CupStageName[] = [];
  if (full === n) {
    for (let e = n; e >= 2; e /= 2) names.push(stageNameFor(e));
    return { preliminaryClubs: 0, stageNames: names };
  }
  const half = 2 ** (f - 1);
  names.push("preliminary");
  for (let e = half; e >= 2; e /= 2) names.push(stageNameFor(e));
  return { preliminaryClubs: 2 * (n - half), stageNames: names };
}
