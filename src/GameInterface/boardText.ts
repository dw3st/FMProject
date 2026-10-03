import type { SeasonObjective } from "@/types/boardTypes";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** "ser campeão", "metade de cima (até 10º)"… — the season objective in words. */
export function objectiveText(objective: SeasonObjective, t: T): string {
  return t(`board.objective.${objective.kind}`, { target: objective.target });
}
