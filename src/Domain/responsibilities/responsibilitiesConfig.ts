import { MORALE } from "@/Domain/morale/moraleConfig";

/** Constants of the human club's responsibilities (`.claude/rules/game/responsibilities.md`). */
export const RESPONSIBILITIES = {
  /** The director decides on a contract ending within this many days. */
  DIRECTOR_DECIDE_DAYS: 120,
  /**
   * Key players and starters would ask for a contract talk this early (`morale.md`): the director
   * decides on them as soon as that talk could come, so he can answer it with a real decision.
   */
  DIRECTOR_TALK_DAYS: MORALE.CONTRACT_TALK_DAYS,
} as const;

export const DIRECTOR_DECIDE_DAYS = RESPONSIBILITIES.DIRECTOR_DECIDE_DAYS;
