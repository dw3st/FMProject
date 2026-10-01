import { RETIREMENT as R } from "@/Domain/retirement/retirementConfig";
import type { RosterPlayer } from "@/types/playerTypes";

/** DP multiplier of a reborn player while he is young (1 otherwise). */
export function rebornDpMult(p: RosterPlayer): number {
  return p.reborn && p.age < R.REBORN_UNTIL_AGE ? R.REBORN_DP_MULT : 1;
}
