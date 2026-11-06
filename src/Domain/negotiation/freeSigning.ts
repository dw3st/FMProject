import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { preferenceScore, type PreferenceInput } from "@/Domain/negotiation/rivals";
import { contractDemand } from "@/Domain/contracts/contracts";
import { aiClubFinance, aiTransferBudgetOf, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { playerMatchesBand, playerOverallRating } from "@/Domain/transfer/transferNeeds";
import { breaksStarLimit } from "@/Domain/squad/starLimit";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { SquadMarketProfile } from "@/types/transferMarketTypes";

/**
 * A player who arrives without a fee (tester report, 4.47.9; `.claude/rules/game/negotiation.md`): a pre-contract or a
 * free agent asks a signing bonus (luvas), part of the fee his club does not get, and AI clubs with a need in his line
 * compete for him. Pure.
 */
const F = NEGOTIATION.FREE_SIGNING;
const BAND_SLACK = 0.5;

export type FreeSigningKind = "pre" | "free";

/** One AI club after him and what it offers. */
export interface FreeSigningRival {
  clubId: string;
  clubName: string;
  /** Weekly wage. */
  wage: number;
  /** Signing bonus, EUR. */
  bonus: number;
}

/** The signing bonus he asks, EUR (fee grid), more with clubs competing. */
export function signingBonusAsk(player: RosterPlayer, kind: FreeSigningKind, rivals: number): number {
  const share = kind === "pre" ? F.BONUS_SHARE_PRE : F.BONUS_SHARE_FREE;
  return roundFeeUp(playerMarketValue(player) * share * (1 + F.PER_RIVAL * rivals));
}

/** AI clubs whose market profile has a need for him (line and rating band): the squads a caller has to load. */
export function freeSigningProfileIds(player: RosterPlayer, profiles: Record<string, SquadMarketProfile>): string[] {
  const rating = playerOverallRating(player);
  return Object.entries(profiles)
    .filter(([, prof]) => prof.needs?.some((n) => playerMatchesBand(player, n.position)
      && rating >= n.targetMin - BAND_SLACK && rating <= n.targetMax + BAND_SLACK))
    .map(([id]) => id);
}

/** Monday of the week of `date` (rival set is stable for a week). */
function weekKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * The AI clubs competing for him this week: a need in his line and rating band, room in the squad and in the wage cap,
 * transfer budget for the bonus, under the world top-25 limit. Each enters with `RIVAL_CHANCE × urgency`, at most
 * `MAX_RIVALS`; offers drawn from a seed of player, kind and week, so asking again the same week meets the same clubs.
 */
export function freeSigningRivals(args: {
  player: RosterPlayer;
  kind: FreeSigningKind;
  date: string;
  /** His club (pre-contract) or last club (free agent); never a rival. */
  fromId: string | null;
  humanIds: ReadonlySet<string>;
  profiles: Record<string, SquadMarketProfile>;
  squadOf: (id: string) => Squad | null | undefined;
  top?: ReadonlySet<string>;
}): FreeSigningRival[] {
  const { player, kind } = args;
  const rating = playerOverallRating(player);
  const rng = mulberry32(seedFrom(`free-signing:${player.id}:${kind}:${weekKey(args.date)}`));
  const baseAsk = signingBonusAsk(player, kind, 0);
  const from = args.fromId ? args.squadOf(args.fromId) ?? null : null;
  const entered: { squad: Squad; urgency: number }[] = [];
  for (const [id, prof] of Object.entries(args.profiles).sort(([a], [b]) => a.localeCompare(b))) {
    if (id === args.fromId || args.humanIds.has(id)) continue;
    const need = prof.needs?.find((n) => playerMatchesBand(player, n.position)
      && rating >= n.targetMin - BAND_SLACK && rating <= n.targetMax + BAND_SLACK);
    if (!need) continue;
    const roll = rng();
    const squad = args.squadOf(id);
    if (!squad || squad.players.length >= MAX_SQUAD || breaksStarLimit(squad, player.id, args.top)) continue;
    if (aiTransferBudgetOf(squad) < baseAsk * F.BUDGET_RATIO) continue;
    if (!passesWageGate(aiClubFinance(squad), contractDemand(player, squad, args.date, { fromSquad: from, freeArrival: true }), 0)) continue;
    if (roll < F.RIVAL_CHANCE * need.urgency) entered.push({ squad, urgency: need.urgency });
  }
  const chosen = entered.sort((a, b) => b.urgency - a.urgency || a.squad.id.localeCompare(b.squad.id)).slice(0, F.MAX_RIVALS);
  const ask = signingBonusAsk(player, kind, chosen.length);
  return chosen.map(({ squad }) => ({
    clubId: squad.id,
    clubName: squad.name,
    wage: Math.round(contractDemand(player, squad, args.date, { fromSquad: from, freeArrival: true }) * (1 + rng() * F.WAGE_SPREAD)),
    bonus: roundFeeUp(ask * (F.BONUS_MIN + rng() * F.BONUS_SPREAD)),
  }));
}

/** His score for a club: the usual preference plus the bonus (offered / asked, capped at 1,5). */
export function freeSigningScore(pref: PreferenceInput, bonus: number, ask: number): number {
  const ratio = ask > 0 ? Math.min(1.5, bonus / ask) : 1.5;
  return preferenceScore(pref) + F.BONUS_WEIGHT * ratio;
}

/** The rival he would rather join than the human club, or null when the human club wins. */
export function preferredRival(args: {
  human: { pref: PreferenceInput; bonus: number };
  rivals: { rival: FreeSigningRival; pref: PreferenceInput }[];
  ask: number;
}): FreeSigningRival | null {
  const mine = freeSigningScore(args.human.pref, args.human.bonus, args.ask);
  let best: { rival: FreeSigningRival; score: number } | null = null;
  for (const r of args.rivals) {
    const score = freeSigningScore(r.pref, r.rival.bonus, args.ask);
    if (score > mine && (!best || score > best.score)) best = { rival: r.rival, score };
  }
  return best?.rival ?? null;
}
