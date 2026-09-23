import { Player } from "@/Domain/Player";
import type { MainRole } from "@/GameInterface/positionHelpers";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type { SellCandidate, TransferBudgetTier } from "@/types/transferMarketTypes";
import { budgetTierFromBudget, playerOverallRating, teamAvgRating } from "@/Domain/transfer/transferNeeds";

const MAX_SELL_LIST = 5;
const SELL_ABOVE_AVG_PROTECTION = 0.5;
const SELL_BELOW_AVG_THRESHOLD = 0.5;
const SELL_AGE_THRESHOLD = 30;
const SELL_YOUNG_PROTECTION = 23;

/**
 * Minimum number of players that must remain in a band after a sale.
 * Scales with budget tier — wealthier clubs protect more of their depth.
 */
export function minBandDepth(band: MainRole, tier: TransferBudgetTier): number {
  const base: Record<MainRole, number> = {
    GK: 3,
    Defender: 7,
    Midfielder: 7,
    Forward: 4,
  };
  if (band === "GK") return base.GK;
  const bonus = tier === "high" ? 2 : tier === "mid" ? 1 : 0;
  return base[band] + bonus;
}

function playersInBand(squad: Squad, band: MainRole): RosterPlayer[] {
  return squad.players.filter((p) => getMainRole(p.positions[0] ?? "CM") === band);
}

/**
 * AI sell list generation. Returns players the club is actively willing to sell,
 * sorted by priority descending, capped at MAX_SELL_LIST.
 *
 * An empty list is valid — if no player qualifies after protections, nothing is returned.
 */
export function generateSellList(
  squad: Squad,
  rng: () => number = Math.random,
): SellCandidate[] {
  if (squad.players.length === 0) return [];

  const teamAvg = teamAvgRating(squad);
  const budget = squad.finances?.budget ?? 0;
  const tier = budgetTierFromBudget(budget);
  const financialBonus = tier === "low" ? 0.2 : tier === "mid" ? 0.1 : 0;

  const candidates: SellCandidate[] = [];

  const MAIN_BANDS: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

  for (const band of MAIN_BANDS) {
    const bandPlayers = playersInBand(squad, band);
    const minDepth = minBandDepth(band, tier);

    for (const player of bandPlayers) {
      const rating = playerOverallRating(player);

      // Protection: significantly above team average
      if (rating > teamAvg + SELL_ABOVE_AVG_PROTECTION) continue;

      // Protection: selling would breach minimum depth
      if (bandPlayers.length <= minDepth) continue;

      // Protection: only viable option for their detailed position
      const detailPos = player.positions[0] ?? "CM";
      const sameDetailedPos = squad.players.filter(
        (p) => p.id !== player.id && (p.positions[0] ?? "CM") === detailPos,
      );
      if (sameDetailedPos.length === 0) continue;

      // Evaluate sell criteria and accumulate priority score
      let priority = 0;

      // A. Squad excess: band count well above minimum AND player is in the bottom half of band by rating
      const excessThreshold = minDepth + 1;
      if (bandPlayers.length > excessThreshold) {
        const sorted = [...bandPlayers].sort((a, b) => playerOverallRating(b) - playerOverallRating(a));
        const rankIdx = sorted.findIndex((p) => p.id === player.id);
        const isBottomHalf = rankIdx >= Math.floor(sorted.length / 2);
        if (isBottomHalf) {
          const excessCount = bandPlayers.length - minDepth;
          priority += 0.3 + Math.min(excessCount * 0.05, 0.2);
        }
      }

      // B. Below team level (skip young players who are developing)
      if (player.age >= SELL_YOUNG_PROTECTION && rating < teamAvg - SELL_BELOW_AVG_THRESHOLD) {
        const gap = teamAvg - rating - SELL_BELOW_AVG_THRESHOLD;
        priority += 0.25 + Math.min(gap * 0.1, 0.2);
      }

      // C. Aging player below team level
      if (player.age > SELL_AGE_THRESHOLD && rating < teamAvg) {
        const ageFactor = Math.min((player.age - SELL_AGE_THRESHOLD) * 0.05, 0.3);
        priority += 0.2 + ageFactor;
      }

      // D. Financial pressure boost
      priority += financialBonus;

      // Small jitter to avoid identical priorities
      priority += (rng() - 0.5) * 0.05;

      // Only add if criteria were actually met (priority > just the financial bonus + noise)
      if (priority <= financialBonus + 0.03) continue;

      candidates.push({
        playerId: player.id,
        priority: Math.max(0, Math.min(1, priority)),
      });
    }
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_SELL_LIST);
}

/** Look up a player's sell priority from a sell list (null = not listed). */
export function getSellPriority(playerId: string, sellList: SellCandidate[]): number | null {
  const entry = sellList.find((c) => c.playerId === playerId);
  return entry ? entry.priority : null;
}
