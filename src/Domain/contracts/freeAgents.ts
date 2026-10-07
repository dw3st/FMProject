import { stripPlayerMorale } from "@/Domain/morale/morale";
import { aiClubFinance, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";
import { AI_SIGN_MAX_AGE, CONTRACT_CONFIG as C } from "@/Domain/contracts/contractConfig";
import { addYearsIso, aiRenewalYears, contractEndFor, renewalContract } from "@/Domain/contracts/contracts";
import { roundAttr } from "@/Domain/attributes";
import { overallAvg } from "@/Domain/playerRating";
import { generateTransferNeeds, scoreCandidate, teamAvgRating } from "@/Domain/transfer/transferNeeds";
import { getMainRole } from "@/Domain/roles";
import type { MainRole } from "@/Domain/roles";
import type { FreeAgent, RosterPlayer, Squad } from "@/types/playerTypes";
import { seedFrom } from "@/Domain/rng";

const ROLES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

export const MIN_BY_ROLE: Record<MainRole, number> = { GK: 3, Defender: 7, Midfielder: 7, Forward: 4 };
export const MAX_SQUAD = 30;
/** The human club's cap: most clubs start the world at 30, so the human gets room to sign before selling. */
export const HUMAN_MAX_SQUAD = 36;

export const roleOf = (p: RosterPlayer): MainRole => getMainRole(p.positions[0] ?? "CM");

function unit(key: string): number {
  return seedFrom(key) / 4294967296;
}

function countByRole(players: RosterPlayer[]): Record<MainRole, number> {
  const c: Record<MainRole, number> = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 };
  for (const p of players) c[roleOf(p)]++;
  return c;
}

/**
 * Filler youngster (17-19) for `role`, deterministic from the squad id + `tag`: a copy of the
 * squad's weakest player of that role (any player if none), name built from the squad's own name
 * tokens. Same idea as the importer's filler youth (`scripts/openfootball/roster.ts`).
 */
function makeYouthPlayer(squad: Squad, role: MainRole, tag: string): RosterPlayer {
  const key = `${squad.id}:${tag}`;
  const inRole = squad.players.filter((p) => roleOf(p) === role);
  const pool = inRole.length > 0 ? inRole : squad.players;
  const template = [...pool].sort((a, b) => overallAvg(a) - overallAvg(b))[0];
  const pick = (salt: string) => squad.players[Math.floor(unit(`${key}:${salt}`) * squad.players.length)];
  const initial = pick("f")?.name.trim()[0] ?? "J";
  const lastParts = pick("l")?.name.trim().split(" ") ?? ["Silva"];
  const name = `${initial}. ${lastParts[lastParts.length - 1]}`;
  const stats = template
    ? Object.fromEntries(Object.entries(template.stats).map(([k, v]) => [k, roundAttr((v as number) - 1)]))
    : {
        passing: 2, vision: 2, finishing: 2, dribbling: 2, speed: 3, acceleration: 3, tackling: 2,
        pressing: 2, stamina: 3, heading: 2, strength: 2, reflex: 0, jump: 0,
      };
  return {
    id: `youth_${squad.id}_${tag}`,
    name,
    age: 17 + Math.floor(unit(`${key}:a`) * 3),
    squadId: squad.id,
    preferredFoot: unit(`${key}:p`) < 0.5 ? "left" : "right",
    positions: [role],
    stats: stats as unknown as RosterPlayer["stats"],
    profile: template?.profile ?? { summary: "Young prospect from the academy.", archetype: "Prospect" },
    nationality: squad.country ?? null,
  };
}

export interface RefillResult {
  squad: Squad;
  /** Free agents signed (to be removed from the pool). */
  signed: RosterPlayer[];
  /** Filler youngsters created. */
  youth: RosterPlayer[];
}

/**
 * Season-rollover refill after contract expiries. AI club: while any role is under its minimum or
 * the squad under `MIN_SQUAD_AI`, sign the best free agent of the neediest role that fits the wage
 * cap, else create a youngster (3-year contract). Human club: only the per-role minimums, always
 * with youngsters (it never gets players it did not choose).
 */
export function refillSquad(args: {
  squad: Squad;
  pool: FreeAgent[];
  nextSeasonEnd: string;
  isHuman: boolean;
  tagPrefix: string;
}): RefillResult {
  const { pool, nextSeasonEnd, isHuman, tagPrefix } = args;
  let squad = args.squad;
  const signed: RosterPlayer[] = [];
  const youth: RosterPlayer[] = [];
  const taken = new Set<string>();
  const minTotal = isHuman ? 0 : C.MIN_SQUAD_AI;

  for (let guard = 0; guard < MAX_SQUAD + 8; guard++) {
    const counts = countByRole(squad.players);
    const ratio = (r: MainRole) => counts[r] / MIN_BY_ROLE[r];
    const deficits = ROLES.filter((r) => counts[r] < MIN_BY_ROLE[r]);
    let role: MainRole | null = null;
    if (deficits.length > 0) role = [...deficits].sort((a, b) => ratio(a) - ratio(b))[0]!;
    else if (squad.players.length < minTotal) role = [...ROLES].sort((a, b) => ratio(a) - ratio(b))[0]!;
    // The 30-player cap never blocks a role minimum (a lopsided full squad still gets its missing GK).
    if (!role || (deficits.length === 0 && squad.players.length >= MAX_SQUAD)) break;

    let added: RosterPlayer | null = null;
    if (!isHuman) {
      const fin = aiClubFinance(squad);
      const candidates = pool
        .filter((f) => !taken.has(f.player.id) && roleOf(f.player) === role && f.player.age < AI_SIGN_MAX_AGE)
        .map((f) => f.player)
        .sort((a, b) => overallAvg(b) - overallAvg(a));
      for (const p of candidates) {
        const contract = renewalContract(p, squad, nextSeasonEnd, aiRenewalYears(p));
        // Headroom: stay clear of the "tight" threshold so the refill never tips a club into it.
        if (fin.wageBill + contract.wage > fin.maxWageBudget * (AI_FINANCE_CONFIG.NEAR_LIMIT_RATIO - C.REFILL_HEADROOM)) continue;
        if (!passesWageGate(fin, contract.wage, 0)) continue;
        added = { ...p, squadId: squad.id, contract };
        taken.add(p.id);
        signed.push(added);
        break;
      }
    }
    if (!added) {
      const y = makeYouthPlayer(squad, role, `${tagPrefix}_${squad.players.length}`);
      added = { ...y, contract: renewalContract(y, squad, nextSeasonEnd, C.YOUTH_CONTRACT_YEARS) };
      youth.push(added);
    }
    squad = { ...squad, players: [...squad.players, added] };
  }
  return { squad, signed, youth };
}

export interface FreeAgentTickResult {
  squads: Squad[];
  /** Ids of squads that changed. */
  changedIds: Set<string>;
  signedIds: Set<string>;
}

/**
 * Daily AI hiring from the free pool: a handful of random AI clubs each run their own needs
 * (`generateTransferNeeds`) and sign the best free agent of the most urgent fitting need, fee 0,
 * wage-gated, contract by age from the club's season end.
 */
export function freeAgentTick(args: {
  squads: Squad[];
  pool: FreeAgent[];
  date: string;
  rng: () => number;
  excludeSquadId?: string | null;
  seasonEndOf: (squad: Squad) => string;
  clubsPerDay?: number;
}): FreeAgentTickResult {
  const { pool, date, rng, excludeSquadId, seasonEndOf } = args;
  const squads = [...args.squads];
  const changedIds = new Set<string>();
  const signedIds = new Set<string>();
  if (pool.length === 0) return { squads, changedIds, signedIds };

  const eligible = squads.map((_, i) => i).filter((i) => squads[i]!.id !== excludeSquadId);
  const n = Math.min(args.clubsPerDay ?? C.FREE_AGENT_CLUBS_PER_DAY, eligible.length);
  for (let k = 0; k < n; k++) {
    const idx = eligible.splice(Math.floor(rng() * eligible.length), 1)[0]!;
    const squad = squads[idx]!;
    if (squad.players.length >= MAX_SQUAD) continue;
    const finance = aiClubFinance(squad);
    if (finance.hiring === "frozen") continue;
    const profile = generateTransferNeeds(squad, date, rng);
    const needs = (finance.hiring === "tight" ? profile.needs.filter((x) => x.intentType === "cover_need") : profile.needs)
      .sort((a, b) => b.urgency - a.urgency);
    const avg = teamAvgRating(squad);
    for (const need of needs) {
      let best: { player: RosterPlayer; score: number } | null = null;
      for (const f of pool) {
        const p = f.player;
        if (signedIds.has(p.id) || roleOf(p) !== need.position || p.age >= AI_SIGN_MAX_AGE) continue;
        const rating = overallAvg(p);
        if (rating < need.targetMin || rating > need.targetMax) continue;
        if (need.intentType === "future_investment" && p.age > 23) continue;
        const contract = renewalContract(p, squad, seasonEndOf(squad), aiRenewalYears(p));
        contract.until = contractEndFor(date, seasonEndOf(squad), aiRenewalYears(p));
        if (finance.wageBill + contract.wage > finance.maxWageBudget * (AI_FINANCE_CONFIG.NEAR_LIMIT_RATIO - C.REFILL_HEADROOM)) continue;
        if (!passesWageGate(finance, contract.wage, 0)) continue;
        const score = scoreCandidate(p, need, 0, 1, rng, [], avg);
        if (!best || score > best.score) best = { player: p, score };
      }
      if (!best) continue;
      const contract = renewalContract(best.player, squad, seasonEndOf(squad), aiRenewalYears(best.player));
      contract.until = contractEndFor(date, seasonEndOf(squad), aiRenewalYears(best.player));
      squads[idx] = { ...squad, players: [...squad.players, { ...best.player, squadId: squad.id, contract }] };
      signedIds.add(best.player.id);
      changedIds.add(squad.id);
      break;
    }
  }
  return { squads, changedIds, signedIds };
}

/** Drops free agents released more than a year before `date`. */
export function pruneFreeAgents(pool: FreeAgent[], date: string): FreeAgent[] {
  const keepSince = addYearsIso(date, -1);
  return pool.filter((f) => f.since > keepSince);
}

/** A released player enters the pool healthy and with no club/contract. */
export function toFreeAgent(player: RosterPlayer, date: string): FreeAgent {
  // A sell-on clause or a loan ends with the contract (`.claude/rules/game/negotiation.md`).
  // Morale is the human club's only (`.claude/rules/game/morale.md`).
  return { player: { ...stripPlayerMorale(player), squadId: "", contract: undefined, injury: undefined, sellOn: undefined, loan: undefined }, since: date };
}
