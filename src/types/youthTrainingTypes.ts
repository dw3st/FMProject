import type { TrainingIntensity } from "@/types/developmentTypes";

/** Training area of an academy player: balanced or one of the 7 DP categories (`DP_CATEGORIES`). */
export type YouthFocus =
  | "balanced" | "goalkeeping" | "defending" | "shooting" | "technical" | "passing" | "physical" | "setPieces";

/** Academy training plan of the human club (`src/Domain/youth/youthTraining.ts`). */
export interface YouthTrainingPlan {
  intensity: TrainingIntensity;
  /** The intensity was set by the youth coach (`src/Domain/youth/youthCoach.ts`); gone once the manager changes it. */
  intensityByCoach?: true;
  focus: YouthFocus;
  /**
   * Per player: a focus (wins over the group's) and a training position (one of the 14). `byCoach`: written by the
   * youth coach, who only rewrites his own entries.
   */
  players?: Record<string, { focus?: YouthFocus; position?: string; byCoach?: true }>;
}
