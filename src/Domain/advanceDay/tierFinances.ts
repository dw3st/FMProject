import type { Squad } from "@/types/playerTypes";

/**
 * Relative broadcasting/commercial income per pyramid tier (tier 1 = 1). A club that changes
 * division has both income lines scaled by `MULT[newTier] / MULT[oldTier]`. Tiers deeper than the
 * table use the deepest entry.
 */
export const TIER_BROADCAST_MULT: Record<number, number> = { 1: 1, 2: 0.35, 3: 0.12, 4: 0.05 };

function multFor(tier: number): number {
  if (TIER_BROADCAST_MULT[tier] !== undefined) return TIER_BROADCAST_MULT[tier]!;
  const deepest = Math.max(...Object.keys(TIER_BROADCAST_MULT).map(Number));
  return tier > deepest ? TIER_BROADCAST_MULT[deepest]! : 1;
}

export function tierIncomeRatio(oldTier: number, newTier: number): number {
  return multFor(newTier) / multFor(oldTier);
}

/**
 * Scale a moved club's `finances.broadcasting` and `finances.commercial` for its new tier
 * (`total` is kept as their sum). `budget` and `followers` are untouched. Pure; a squad with
 * no finances or an unchanged tier is returned as is.
 */
export function applyTierFinanceChange(squad: Squad, oldTier: number, newTier: number): Squad {
  if (!squad.finances || oldTier === newTier) return squad;
  const r = tierIncomeRatio(oldTier, newTier);
  const broadcasting = Math.round(squad.finances.broadcasting * r);
  const commercial = Math.round(squad.finances.commercial * r);
  return { ...squad, finances: { ...squad.finances, broadcasting, commercial, total: broadcasting + commercial } };
}
