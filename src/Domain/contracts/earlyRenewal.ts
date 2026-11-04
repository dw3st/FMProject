import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";
import { CONTRACT_CONFIG as C } from "@/Domain/contracts/contractConfig";
import { addYearsIso, aiRenewalYears, aiShouldRenew, renewalContract } from "@/Domain/contracts/contracts";
import { addDays, daysBetween } from "@/Domain/dates";
import { overallAvg } from "@/Domain/playerRating";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * AI clubs tie their key players down before the last year, so a star does not reach the
 * pre-contract window by default (`.claude/rules/game/contracts.md`). Pure and deterministic.
 */

/** Whether this club looks at its contracts today: each club once per cycle, on its own day. */
export function earlyRenewalDue(squadId: string, date: string): boolean {
  const day = daysBetween("2000-01-01", date);
  return (seedFrom(`early:${squadId}`) + day) % C.EARLY_RENEW_CYCLE_DAYS === 0;
}

/** One roll per contract: a player who says no this time runs this contract down. */
function signsEarly(player: RosterPlayer): boolean {
  return mulberry32(seedFrom(`early:${player.id}:${player.contract?.until}`))() < C.EARLY_RENEW_CHANCE;
}

export function earlyRenewals(squad: Squad, date: string, skipPlayerIds?: ReadonlySet<string>): { squad: Squad; renewed: RosterPlayer[] } {
  const key = [...squad.players].sort((a, b) => overallAvg(b) - overallAvg(a)).slice(0, C.EARLY_RENEW_KEY_PLAYERS);
  const lastDay = addDays(date, C.EARLY_RENEW_DAYS);
  const due = key.filter((p) => p.contract && !p.loan && p.contract.until >= date && p.contract.until <= lastDay && !skipPlayerIds?.has(p.id) && signsEarly(p));
  if (due.length === 0) return { squad, renewed: [] };

  const cap = aiClubFinance(squad).maxWageBudget;
  let bill = squad.players.reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
  const byId = new Map<string, RosterPlayer>();
  for (const p of due) {
    const old = p.contract!;
    const fresh = renewalContract(p, squad, old.until, 1);
    if (!aiShouldRenew(p, squad, fresh.wage, bill - old.wage, cap)) continue;
    bill += fresh.wage - old.wage;
    byId.set(p.id, { ...p, contract: { ...old, wage: fresh.wage, until: addYearsIso(old.until, aiRenewalYears(p)) } });
  }
  if (byId.size === 0) return { squad, renewed: [] };
  return { squad: { ...squad, players: squad.players.map((p) => byId.get(p.id) ?? p) }, renewed: [...byId.values()] };
}
