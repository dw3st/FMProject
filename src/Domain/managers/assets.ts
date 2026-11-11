import { TRACKS } from "@/Domain/achievements/catalog";

/**
 * The manager's own money (`.claude/rules/game/jobs.md` → "Dinheiro do técnico"): wages and severance earned over the
 * career buy personal assets, and earning goals are an achievement track. Prestige only: nothing here touches the club.
 */
export const ASSET_KINDS = ["home", "car", "watch", "boat", "plane", "suit", "art"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Price of each level, EUR; a level is bought after the one below it. */
export const ASSET_PRICES: Record<AssetKind, readonly number[]> = {
  home: [300_000, 1_500_000, 6_000_000, 25_000_000],
  car: [50_000, 250_000, 1_000_000, 4_000_000],
  watch: [10_000, 100_000, 500_000, 2_000_000],
  // More places to spend it (user request, 8.9.36): up to ~€60M at the top.
  boat: [400_000, 3_000_000, 15_000_000, 60_000_000],
  plane: [600_000, 4_000_000, 18_000_000, 50_000_000],
  suit: [3_000, 20_000, 120_000, 1_000_000],
  art: [50_000, 800_000, 6_000_000, 40_000_000],
};

export type ManagerAssets = Partial<Record<AssetKind, number>>;

export function isAssetKind(k: unknown): k is AssetKind {
  return (ASSET_KINDS as readonly unknown[]).includes(k);
}

/** What he can still spend: everything earned, minus the assets, plus the result of his bets, minus the open ones. */
export function managerWallet(earned: number | undefined, spent: number | undefined, betNet = 0, openBets = 0): number {
  return Math.max(0, (earned ?? 0) - (spent ?? 0) + (betNet ?? 0) - openBets);
}

/** Price of the next level of an asset; null at the top. */
export function nextAssetPrice(assets: ManagerAssets | undefined, kind: AssetKind): number | null {
  return ASSET_PRICES[kind][assets?.[kind] ?? 0] ?? null;
}

export type AssetRefusal = "maxLevel" | "noMoney";

export function assetRefusal(assets: ManagerAssets | undefined, kind: AssetKind, wallet: number): AssetRefusal | null {
  const price = nextAssetPrice(assets, kind);
  if (price === null) return "maxLevel";
  return price > wallet ? "noMoney" : null;
}

/**
 * Fame from the belongings (user decision, option B, 8.9.39): what he owns is seen by the football world. The value of
 * every level owned gives up to `MAX_REPUTATION` reputation points with a shrinking gain (`SCALE`: €20M ≈ 3,2 points,
 * €60M ≈ 4,8), and the most ambitious players ask a little less to join a famous manager.
 */
export const FAME = {
  MAX_REPUTATION: 5,
  SCALE: 20_000_000,
  /** At full fame a player with ambition 20 asks this much less (signings only); scaled by his ambition above 10,5. */
  DEMAND_DISCOUNT: 0.04,
  /** Fame bands shown on the pages, by the reputation points: 0 none, then low, medium, high, star. */
  BANDS: [0.5, 2, 3.5, 4.5],
} as const;

/** What his belongings are worth: every level owned at its price. */
export function assetsValue(assets: ManagerAssets | undefined): number {
  let total = 0;
  for (const kind of ASSET_KINDS) {
    const level = assets?.[kind] ?? 0;
    for (let i = 0; i < level; i++) total += ASSET_PRICES[kind][i] ?? 0;
  }
  return total;
}

/** Reputation points from the belongings, 0..`MAX_REPUTATION`. */
export function fameReputation(assets: ManagerAssets | undefined): number {
  const value = assetsValue(assets);
  return value <= 0 ? 0 : FAME.MAX_REPUTATION * (1 - Math.exp(-value / FAME.SCALE));
}

/** 0..1 share of the full fame. */
export function fameShare(assets: ManagerAssets | undefined): number {
  return fameReputation(assets) / FAME.MAX_REPUTATION;
}

export type FameBand = 0 | 1 | 2 | 3 | 4;

export function fameBand(assets: ManagerAssets | undefined): FameBand {
  const r = fameReputation(assets);
  return FAME.BANDS.filter((b) => r >= b).length as FameBand;
}

/** The career earnings goals: the thresholds of the achievement track. */
export const EARNING_GOALS = TRACKS.career_earnings.thresholds;

/**
 * The next earnings goal seen from a job offer: how much is missing and how many seasons this wage takes to get there.
 * Null once every goal is reached or without a wage.
 */
export function nextEarningGoal(earned: number, weeklyWage: number): { goal: number; missing: number; seasons: number } | null {
  const goal = EARNING_GOALS.find((g) => g > earned);
  if (goal === undefined || weeklyWage <= 0) return null;
  const missing = goal - earned;
  return { goal, missing, seasons: Math.ceil(missing / (weeklyWage * 52)) };
}
