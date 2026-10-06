import { YOUTH as Y } from "@/Domain/youth/youthConfig";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer } from "@/types/playerTypes";

/** Displayed "potential" band: current level + the expected growth by age (no hidden attribute). */
export function potentialBand(player: RosterPlayer): [number, number] {
  const now = overallAvg(player);
  let growth = 0;
  for (let a = player.age; a <= 23; a++) growth += Y.GROWTH_BY_AGE[a] ?? 0;
  return [now + growth * Y.POTENTIAL_BAND[0], now + growth * Y.POTENTIAL_BAND[1]];
}
