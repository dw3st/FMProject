import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { legendAvailable, legendRarity } from "@/Domain/achievements/shop";
import type { RetiredPlayer } from "@/types/playerTypes";

/** The legend roulette (tester report, option B, 8.9.34): tiers, the draw and the reel. Pure. */

export type LegendTier = "normal" | "rare" | "epic" | "legend" | "super";
export const LEGEND_TIERS: readonly LegendTier[] = ["normal", "rare", "epic", "legend", "super"];

/**
 * Tier of a legend. A real one by his honours and fame (Wikipedia languages): a Ballon d'Or or fame 120+ is super,
 * fame 85+ or a World Cup with fame 60+ legendary, fame 62+ or a World Cup epic, fame 50+ rare. One of the world's own
 * retirees by the old rarity (super = legendary, rare = epic).
 */
export function legendTier(r: RetiredPlayer): LegendTier {
  const real = r.real;
  if (real) {
    const fame = real.fame ?? 0;
    const cups = real.worldCups.length;
    if (real.ballonDor > 0 || fame >= 120) return "super";
    if (fame >= 85 || (cups > 0 && fame >= 60)) return "legend";
    if (fame >= 62 || cups > 0) return "epic";
    if (fame >= 50) return "rare";
    return "normal";
  }
  const rarity = legendRarity(r);
  return rarity === "super" ? "legend" : rarity === "rare" ? "epic" : "normal";
}

/** A tier by the odds (`LEGEND_SPIN.ODDS`). */
export function drawTier(rng: () => number): LegendTier {
  let x = rng();
  for (const tier of LEGEND_TIERS) {
    x -= A.LEGEND_SPIN.ODDS[tier];
    if (x < 0) return tier;
  }
  return "normal";
}

/**
 * One spin: a tier by the odds, then a legend of that tier still available (not brought back by anyone). A tier with
 * nobody left falls to the next lower one, then to the higher ones. Null when nobody is left at all.
 */
export function spinLegend(pool: readonly RetiredPlayer[], rng: () => number): { retired: RetiredPlayer; tier: LegendTier } | null {
  const free = pool.filter(legendAvailable);
  if (free.length === 0) return null;
  const wanted = drawTier(rng);
  const at = LEGEND_TIERS.indexOf(wanted);
  const order = [...LEGEND_TIERS.slice(0, at + 1).reverse(), ...LEGEND_TIERS.slice(at + 1)];
  for (const tier of order) {
    const of = free.filter((r) => legendTier(r) === tier);
    if (of.length > 0) return { retired: of[Math.floor(rng() * of.length)]!, tier };
  }
  return null;
}

/** The reel the roulette slides through: random legends, the drawn one at `LEGEND_SPIN.REEL_AT`. */
export function spinReel(pool: readonly RetiredPlayer[], winner: RetiredPlayer, rng: () => number): RetiredPlayer[] {
  const others = pool.filter((r) => r.id !== winner.id);
  const reel: RetiredPlayer[] = [];
  for (let i = 0; i < A.LEGEND_SPIN.REEL && others.length > 0; i++) {
    reel.push(i === A.LEGEND_SPIN.REEL_AT ? winner : others[Math.floor(rng() * others.length)]!);
  }
  if (!reel.includes(winner)) reel.push(winner);
  return reel;
}
