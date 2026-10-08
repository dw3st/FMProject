import {
  addYearsIso, aiRenewalYears, aiShouldRenew, contractDemand, evaluateContractOffer, renewalContract, renewalWithinLimits,
} from "@/Domain/contracts/contracts";
import { daysBetween } from "@/Domain/dates";
import { afterRenewal, refusesRenewal, statusOf, suggestedStatuses, type PlayerNews } from "@/Domain/morale/morale";
import { overallAvg } from "@/Domain/playerRating";
import { RESPONSIBILITIES as R } from "@/Domain/responsibilities/responsibilitiesConfig";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

export interface DirectorOutcome {
  playerId: string;
  name: string;
  outcome: "renewed" | "leaving" | "refused";
  years?: number;
  wage?: number;
}

export interface DirectorDecision {
  season: string;
  renew: boolean;
}

/** Days before the end of his contract the director decides on `p` (key players and starters earlier). */
function decideWithin(p: RosterPlayer, suggested: ReturnType<typeof suggestedStatuses>): number {
  const status = statusOf(p, suggested);
  return status === "key" || status === "starter" ? Math.max(R.DIRECTOR_TALK_DAYS, R.DIRECTOR_DECIDE_DAYS) : R.DIRECTOR_DECIDE_DAYS;
}

/** Longest renewal (AI years by age, down to 1) inside the contract limits; null = none fits. */
function renewalYears(p: RosterPlayer, date: string, seasonEnd: string): number | null {
  for (let y = aiRenewalYears(p); y >= 1; y--) if (renewalWithinLimits(p, date, seasonEnd, y)) return y;
  return null;
}

/**
 * The director's contract decisions for the human club (spec
 * `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`, section 1), once per
 * player and season: every player of the squad (not one borrowed from another club) whose contract
 * ends within `DIRECTOR_DECIDE_DAYS` (key players and starters within the contract-talk window,
 * so the director can answer that talk) and without a decision this season.
 *
 * Renews when the AI rule does (`aiShouldRenew`: rating, age, the wage under `maxWageBudget`),
 * paying what the player asks (at least the AI curve), for the AI's years by age; the player judges
 * it like a renewal of the manager — a furious one (`refusesRenewal`) or one the offer does not
 * satisfy refuses. A renewal applies at once like the renew route (`until` moved `years` seasons
 * past its end, the new wage, +6 morale). Best players first, the bill updated as he goes.
 */
export function directorDecisions(args: {
  squad: Squad;
  date: string;
  seasonEnd: string;
  seasonKey: string;
  decided: Record<string, { season: string }>;
  maxWageBudget: number;
}): { squad: Squad; outcomes: DirectorOutcome[]; decided: Record<string, DirectorDecision>; news: PlayerNews[] } {
  const { date, seasonEnd, seasonKey, decided, maxWageBudget } = args;
  const suggested = suggestedStatuses(args.squad);
  const due = args.squad.players
    .filter((p) => !p.loan && p.contract)
    .filter((p) => decided[p.id]?.season !== seasonKey)
    .filter((p) => daysBetween(date, p.contract!.until) <= decideWithin(p, suggested))
    .sort((a, b) => overallAvg(b) - overallAvg(a));
  if (due.length === 0) return { squad: args.squad, outcomes: [], decided: {}, news: [] };

  let squad = args.squad;
  const outcomes: DirectorOutcome[] = [];
  const out: Record<string, DirectorDecision> = {};
  const news: PlayerNews[] = [];
  const billWithout = (id: string) => squad.players.reduce((s, p) => s + (p.id === id ? 0 : p.contract?.wage ?? 0), 0);

  for (const p0 of due) {
    const p = squad.players.find((x) => x.id === p0.id)!;
    const years = renewalYears(p, date, seasonEnd);
    const wage = Math.max(
      renewalContract(p, squad, seasonEnd, years ?? 1).wage,
      contractDemand(p, squad, date, { renewal: true }),
    );
    if (years === null || !aiShouldRenew(p, squad, wage, billWithout(p.id), maxWageBudget)) {
      outcomes.push({ playerId: p.id, name: p.name, outcome: "leaving" });
      out[p.id] = { season: seasonKey, renew: false };
      continue;
    }
    const check = evaluateContractOffer({ wage, years }, p, squad, date, { renewal: true });
    if (refusesRenewal(squad, p) || !check.accepted) {
      outcomes.push({ playerId: p.id, name: p.name, outcome: "refused" });
      out[p.id] = { season: seasonKey, renew: false };
      continue;
    }
    const contract = { until: addYearsIso(p.contract!.until, years), wage };
    const renewed = afterRenewal(
      { ...squad, players: squad.players.map((x) => (x.id === p.id ? { ...x, contract } : x)) },
      p.id,
      date,
    );
    squad = renewed.squad;
    news.push(...renewed.news);
    outcomes.push({ playerId: p.id, name: p.name, outcome: "renewed", years, wage });
    out[p.id] = { season: seasonKey, renew: true };
  }
  return { squad, outcomes, decided: out, news };
}

/** Who handles the human club's contracts (`SaveMeta.responsibilities`); absent = the director. */
export interface Responsibilities {
  contracts: "director" | "manager";
}

export function directorHandlesContracts(r: Responsibilities | undefined): boolean {
  return r?.contracts !== "manager";
}

export function isResponsibilities(v: unknown): v is Responsibilities {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  const c = (v as { contracts?: unknown }).contracts;
  return keys.length === 1 && keys[0] === "contracts" && (c === "director" || c === "manager");
}
