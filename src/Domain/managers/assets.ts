import { TRACKS } from "@/Domain/achievements/catalog";

/**
 * The manager's own money (`.claude/rules/game/jobs.md` → "Dinheiro do técnico"): wages and severance earned over the
 * career buy personal assets, and earning goals are an achievement track. Prestige only: nothing here touches the club.
 */
export const ASSET_KINDS = ["home", "car", "watch"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Price of each level, EUR; a level is bought after the one below it. */
export const ASSET_PRICES: Record<AssetKind, readonly number[]> = {
  home: [300_000, 1_500_000, 6_000_000, 25_000_000],
  car: [50_000, 250_000, 1_000_000, 4_000_000],
  watch: [10_000, 100_000, 500_000, 2_000_000],
};

export type ManagerAssets = Partial<Record<AssetKind, number>>;

export function isAssetKind(k: unknown): k is AssetKind {
  return (ASSET_KINDS as readonly unknown[]).includes(k);
}

/** What he can still spend: everything earned minus what the assets cost. */
export function managerWallet(earned: number | undefined, spent: number | undefined): number {
  return Math.max(0, (earned ?? 0) - (spent ?? 0));
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
