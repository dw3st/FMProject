import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";
import { CONTRACT_CONFIG as C } from "@/Domain/contracts/contractConfig";
import { aiRenewalYears, aiShouldRenew, isExpired, renewalContract } from "@/Domain/contracts/contracts";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

export interface ExpiryResult {
  squad: Squad;
  renewed: RosterPlayer[];
  released: RosterPlayer[];
}

/**
 * Season-rollover contract expiry for one club. Contracts ending within `ROLLOVER_GRACE_DAYS` of
 * `date` expire (calendar drift between seasons). Human club: everything expiring leaves (a
 * renewal the human agreed beforehand already moved `until`). AI club: best players first, a
 * player is renewed while he fits (`aiShouldRenew`: rating, age, wage cap) at a fresh contract of
 * 1-3 years from `nextSeasonEnd`; a club that would drop under `MIN_SQUAD_AFTER_EXPIRY` keeps its
 * best leavers regardless of the cap.
 */
export function processContractExpiries(args: {
  squad: Squad;
  date: string;
  nextSeasonEnd: string;
  isHuman: boolean;
}): ExpiryResult {
  const { squad, date, nextSeasonEnd, isHuman } = args;
  const expiring = squad.players.filter((p) => isExpired(p.contract, date, C.ROLLOVER_GRACE_DAYS));
  if (expiring.length === 0) return { squad, renewed: [], released: [] };

  const expiringIds = new Set(expiring.map((p) => p.id));
  const staying = squad.players.filter((p) => !expiringIds.has(p.id));

  if (isHuman) {
    return { squad: { ...squad, players: staying }, renewed: [], released: expiring };
  }

  const maxWage = aiClubFinance(squad).maxWageBudget;
  let bill = staying.reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  const renewed: RosterPlayer[] = [];
  const released: RosterPlayer[] = [];
  const byRating = [...expiring].sort((a, b) => overallAvg(b) - overallAvg(a));

  const renew = (p: RosterPlayer): RosterPlayer => {
    const contract = renewalContract(p, squad, nextSeasonEnd, aiRenewalYears(p));
    bill += contract.wage;
    return { ...p, contract };
  };

  for (const p of byRating) {
    const next = renewalContract(p, squad, nextSeasonEnd, aiRenewalYears(p));
    if (aiShouldRenew(p, squad, next.wage, bill, maxWage)) renewed.push(renew(p));
    else released.push(p);
  }

  // Never empty the squad: the best leavers stay when too few remain.
  while (staying.length + renewed.length < C.MIN_SQUAD_AFTER_EXPIRY && released.length > 0) {
    renewed.push(renew(released.shift()!));
  }
  return { squad: { ...squad, players: [...staying, ...renewed] }, renewed, released };
}
