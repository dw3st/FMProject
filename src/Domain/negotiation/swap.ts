import { aiClubFinance, estimateWeeklyWage, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { wageFactorOf } from "@/Domain/finance/wages";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { roundFeeDown } from "@/Domain/negotiation/negotiation";
import { getMainRole } from "@/Domain/roles";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { TransferNeed } from "@/types/transferMarketTypes";

/**
 * Player swap in a purchase from an AI club (9.4, `.claude/rules/game/negotiation.md` → "Troca"): the human
 * offers one of his players plus (or minus) money. The AI counts the player at his market value, less
 * `UNNEEDED_DISCOUNT` when it has no need in his line, and decides on the total with the usual sale rule.
 */
export const SWAP = {
  UNNEEDED_DISCOUNT: 0.8,
} as const;

/** What the selling AI club counts the offered player for (EUR, on the fee grid). */
export function swapValue(swap: RosterPlayer, sellerNeeds: readonly TransferNeed[] | undefined): number {
  const line = getMainRole(swap.positions[0] ?? "CM");
  const needed = (sellerNeeds ?? []).some((n) => n.position === line);
  return roundFeeDown(playerMarketValue(swap) * (needed ? 1 : SWAP.UNNEEDED_DISCOUNT));
}

export type SwapRefusal = "swapInvalid" | "swapOnLoan" | "swapWage" | "swapBudget" | "invalidCash";

/**
 * Why the swap cannot be offered (null = it can): the player must be his own (not on loan either way),
 * the AI must fit his wage once the target leaves, and pay any cash it would owe from its budget.
 * `cash` < 0 = the AI club pays the human; the total (cash + swap value) must stay above zero.
 */
export function swapRefusal(args: {
  swap: RosterPlayer | undefined; target: RosterPlayer; seller: Squad; cash: number; value: number; sellerBudget: number;
}): SwapRefusal | null {
  const { swap, seller, cash, value } = args;
  if (!swap || swap.id === args.target.id) return "swapInvalid";
  if (swap.loan) return "swapOnLoan";
  if (!Number.isFinite(cash) || cash + value <= 0) return "invalidCash";
  const without = { ...seller, players: seller.players.filter((p) => p.id !== args.target.id) };
  const wage = estimateWeeklyWage(swap, wageFactorOf(seller));
  if (!passesWageGate(aiClubFinance(without), wage, 0)) return "swapWage";
  if (cash < 0 && args.sellerBudget < -cash) return "swapBudget";
  return null;
}
