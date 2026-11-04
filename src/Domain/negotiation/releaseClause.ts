import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";
import type { RosterPlayer } from "@/types/playerTypes";

export const RELEASE_CLAUSE = {
  /** The clause is this many times his market value: paying it is a rare, expensive decision. */
  VALUE_MULT: 3,
  MIN_FEE: 1_000_000,
} as const;

/** What the human pays an AI club to take a player it will not sell (`.claude/rules/game/negotiation.md`). */
export function releaseClause(player: RosterPlayer): number {
  return roundFeeUp(Math.max(RELEASE_CLAUSE.MIN_FEE, playerMarketValue(player) * RELEASE_CLAUSE.VALUE_MULT));
}
