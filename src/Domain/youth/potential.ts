import { YOUTH as Y } from "@/Domain/youth/youthConfig";
import { overallAvg } from "@/Domain/playerRating";
import { eliteBrake } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * Displayed "potential" band: current level + the expected growth by age (no hidden attribute). Each year's growth
 * is braked like the real one near the top of the scale (`eliteBrake`, 11.1), so the band of a good youngster no
 * longer reads past the best players of the world.
 */
export function potentialBand(player: RosterPlayer): [number, number] {
  const now = overallAvg(player);
  const grown = (share: number): number => {
    let level = now;
    for (let a = player.age; a <= 23; a++) level += (Y.GROWTH_BY_AGE[a] ?? 0) * share * eliteBrake(level);
    return level;
  };
  return [grown(Y.POTENTIAL_BAND[0]), grown(Y.POTENTIAL_BAND[1])];
}
