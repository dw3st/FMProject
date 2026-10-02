/**
 * Off-field discipline (Etapa 12 part 2, `.claude/rules/game/discipline.md`): suspensions from
 * cards. All constants live here.
 */
export const DISCIPLINE = {
  /** Matches banned for a red card (direct or second yellow). */
  RED_BAN_MATCHES: 1,
  /** Every this many accumulated yellow cards in the season → a ban. */
  YELLOW_ACCUMULATION: 5,
  /** Matches banned when the yellow accumulation threshold is crossed. */
  YELLOW_BAN_MATCHES: 1,
} as const;
