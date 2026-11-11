import { loanAvailability } from "@/Domain/negotiation/loans";
import { preContractEligible } from "@/Domain/negotiation/preContract";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { PlayerAvailability } from "@/types/scoutingTypes";

export type { PlayerAvailability };

/** Tester report, 9.8: the rules of the routes, real values, only for AI clubs. */
export function playerAvailability(
  player: RosterPlayer,
  squad: Squad | null,
  ctx: { date: string; listed: boolean; starterIds: ReadonlySet<string>; humanClub: boolean },
): PlayerAvailability {
  if (!squad) return { free: true };
  if (ctx.humanClub || player.loan) return ctx.listed ? { sale: true } : {};
  const out: PlayerAvailability = {};
  if (ctx.listed) out.sale = true;
  if (loanAvailability(player, squad, { starterIds: ctx.starterIds, listed: ctx.listed }) === null) out.loan = true;
  if (preContractEligible(player, ctx.date)) out.preContract = true;
  return out;
}
