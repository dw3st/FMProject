import { Player } from "@/Domain/Player";
import { overallAvg } from "@/Domain/playerRating";
import { standingValueMult } from "@/Domain/standing/standing";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * Market multiplier of a player beyond rating and age: the season award (`.claude/rules/game/awards.md`)
 * times the standing bars (`.claude/rules/game/standing.md`); 1 without either.
 */
export function awardValueMult(p: Pick<RosterPlayer, "awardBoost" | "standing">): number {
  return (p.awardBoost?.mult ?? 1) * standingValueMult(p);
}

/**
 * The value model of a roster player (rating, age, award and standing): the one place a
 * `RosterPlayer` becomes a `Player` for its market value. The engine never reads value.
 */
export function playerValueModel(p: RosterPlayer, rating: number = overallAvg(p)): Player {
  return new Player(rating, p.age, awardValueMult(p));
}
