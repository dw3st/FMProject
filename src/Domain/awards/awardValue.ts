import { Player } from "@/Domain/Player";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer } from "@/types/playerTypes";

/** Market multiplier of a season award (`.claude/rules/game/awards.md`); 1 without one. */
export function awardValueMult(p: Pick<RosterPlayer, "awardBoost">): number {
  return p.awardBoost?.mult ?? 1;
}

/**
 * The value model of a roster player (rating, age and the award boost): the one place a
 * `RosterPlayer` becomes a `Player` for its market value. The engine never reads value.
 */
export function playerValueModel(p: RosterPlayer, rating: number = overallAvg(p)): Player {
  return new Player(rating, p.age, awardValueMult(p));
}
