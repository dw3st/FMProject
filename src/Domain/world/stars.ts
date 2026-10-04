import { Player } from "@/Domain/Player";
import type { Squad } from "@/types/playerTypes";

export type StarKind = "gold" | "blue" | "green";

const GOLD_STARS = 25;
const GREEN_STARS = 30;
const PRODIGY_MAX_AGE = 19;
const FORM_MIN_RATING = 7.2;
const FORM_MIN_GAMES = 8;

/**
 * One star per player (gold > blue > green), across every squad. Pure, deterministic (ties by id).
 * - gold: top 25 of the world by `Player.computeOverallAvg`.
 * - blue (great form): season average rating >= 7.2 with >= 8 games.
 * - green (prodigy): age <= 19 and among the 30 best players of that age group.
 */
export function computeStars(squads: Squad[]): Record<string, StarKind> {
  const all = squads
    .flatMap((s) => s.players)
    .map((p) => ({ p, overall: Player.computeOverallAvg(p) }))
    .sort((a, b) => b.overall - a.overall || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0));

  const out: Record<string, StarKind> = {};
  for (const { p } of all.slice(0, GOLD_STARS)) out[p.id] = "gold";
  for (const { p } of all) {
    const log = p.seasonLog;
    if (log && log.avgRating >= FORM_MIN_RATING && log.appearances >= FORM_MIN_GAMES && !out[p.id]) out[p.id] = "blue";
  }
  let greens = 0;
  for (const { p } of all) {
    if (greens >= GREEN_STARS) break;
    if (p.age > PRODIGY_MAX_AGE) continue;
    greens++;
    if (!out[p.id]) out[p.id] = "green";
  }
  return out;
}
