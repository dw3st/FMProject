// The reactions shop (Fabio's idea, user approved 2026-11-17): reactions bought with the manager's own money or
// unlocked by an achievement. The five base reactions are free for everyone.
import type { AchievementKey } from "@/types/achievementTypes";
import type { ReactionId } from "@/types/rivalsTypes";

export const FREE_REACTIONS = ["applause", "fire", "laugh", "sorry", "horn"] as const satisfies readonly ReactionId[];

export type ShopReactionId = Exclude<ReactionId, (typeof FREE_REACTIONS)[number]>;

export type ShopReaction = { price: number; unlock?: undefined } | { price?: undefined; unlock: AchievementKey };

/** In shop order: the bought ones by price, then the achievement ones. */
export const SHOP_REACTIONS: Record<ShopReactionId, ShopReaction> = {
  popcorn: { price: 200_000 },
  dryer: { price: 300_000 },
  cry: { price: 300_000 },
  chicken: { price: 500_000 },
  redcard: { price: 500_000 },
  vuvuzela: { price: 1_000_000 },
  drum: { price: 2_000_000 },
  trophy: { price: 5_000_000 },
  crown: { unlock: "league_titles:gold" },
  wall: { unlock: "unbeaten_run:gold" },
  safe: { unlock: "career_earnings:gold" },
  dice: { unlock: "secret:bet_longshot" },
};

export const SHOP_REACTION_IDS = Object.keys(SHOP_REACTIONS) as ShopReactionId[];

export function isShopReaction(id: unknown): id is ShopReactionId {
  return typeof id === "string" && Object.hasOwn(SHOP_REACTIONS, id);
}

/** Every reaction this manager may send: the free ones, the bought ones and the ones his achievements unlocked. */
export function ownedReactions(bought: readonly string[] | undefined, unlocked: Partial<Record<AchievementKey, string>> | undefined): ReactionId[] {
  const have = new Set(bought ?? []);
  return [
    ...FREE_REACTIONS,
    ...SHOP_REACTION_IDS.filter((id) => {
      const r = SHOP_REACTIONS[id];
      return r.unlock ? Boolean(unlocked?.[r.unlock]) : have.has(id);
    }),
  ];
}

export type ReactionRefusal = "owned" | "notForSale" | "noMoney";

export function reactionRefusal(bought: readonly string[] | undefined, id: ShopReactionId, wallet: number): ReactionRefusal | null {
  const r = SHOP_REACTIONS[id];
  if (r.price === undefined) return "notForSale";
  if ((bought ?? []).includes(id)) return "owned";
  return wallet < r.price ? "noMoney" : null;
}
