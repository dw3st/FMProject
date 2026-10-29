import type { TrainingIntensity } from "@/types/developmentTypes";

/** Training area of an academy player: balanced or one of the 7 DP categories (`DP_CATEGORIES`). */
export type YouthFocus =
  | "balanced" | "goalkeeping" | "defending" | "shooting" | "technical" | "passing" | "physical" | "setPieces";

/** Academy training plan of the human club (`src/Domain/youth/youthTraining.ts`). */
export interface YouthTrainingPlan {
  intensity: TrainingIntensity;
  focus: YouthFocus;
  /** Per player: a focus (wins over the group's) and a training position (one of the 14). */
  players?: Record<string, { focus?: YouthFocus; position?: string }>;
}
