/**
 * Offside by a mistimed run (stage 13 of the engine rebuild, `.claude/rules/game-engine/game-rules/offside.md` →
 * "Mistimed runs"). Behind the `OFFSIDE_RUNS` flag (`DecisionConfig.ts`).
 *
 * An attacker no longer sees the true offside line every tick. He reads it every `τ` seconds of play (anticipation:
 * a good reader refreshes often) and holds that read in between, so a back line stepping up leaves him past it. Each
 * read carries an error in yards (decisions: a poor decision maker misjudges more), and now and then a lapse
 * (consistency) where he forgets the line for that read. Positive error = he stands past where he should.
 *
 * Nothing here is calibrated to a volume (stage 21 does that): the numbers are a first reading of "a run mistimed
 * by a yard or two now and then".
 */
import { applyEnvOverrides } from '@/GameEngine/Support/EnvOverrides';

export const OFFSIDE_RUNS = {
  /** Seconds of play between two reads of the line: τ = READ_BASE_S + READ_SPAN_S × (1 − anticipation on the world scale). */
  READ_BASE_S: 0.3,
  READ_SPAN_S: 1.0,
  /** Read error σ (yd) = ERR_SIGMA_YD × (ERR_FLOOR + 1 − decisions on the world scale). */
  ERR_SIGMA_YD: 3, // stage 21: 0.9 → 3
  ERR_FLOOR: 0.4,
  /** The error is clipped at ± this many σ. */
  ERR_CLIP: 2.5,
  /** A lapse per read with chance LAPSE_BASE × (1.5 − consistency): the run goes LAPSE_YD further. */
  LAPSE_BASE: 0.25, // stage 21: 0.05 → 0.25
  LAPSE_YD: 4, // stage 21: 2.5 → 4
  /** `lineMisread` (the statistic) only counts a misread spell of a player this close to the true line (yd). */
  MISREAD_NEAR_YD: 6,
} as const;

applyEnvOverrides(OFFSIDE_RUNS, 'OFFSIDE_RUNS_OVERRIDES');
