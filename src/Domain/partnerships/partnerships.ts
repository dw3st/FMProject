import { PARTNER } from "@/Domain/partnerships/partnershipConfig";
import { starterLineAverages } from "@/Domain/scouting/missions";
import { overallAvg } from "@/Domain/playerRating";
import { getMainRole } from "@/Domain/roles";
import type { FinancialTier, RosterPlayer, Squad } from "@/types/playerTypes";
import type { PartnershipKind, SeatPartnerships } from "@/types/partnershipTypes";

const TIER_RANK: Record<FinancialTier, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, ELITE: 3 };

/** Where a club stands: its division (1 = top) and its natural financial tier. */
export interface ClubStanding {
  division: number;
  tier: FinancialTier;
}

/** -1: `a` is below `b`; 1: above; 0: the same level. A lower division always counts first. */
export function compareStanding(a: ClubStanding, b: ClubStanding): -1 | 0 | 1 {
  if (a.division !== b.division) return a.division > b.division ? -1 : 1;
  const d = TIER_RANK[a.tier] - TIER_RANK[b.tier];
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

export type PartnershipRefusal = "self" | "slotFull" | "taken" | "sameLevel" | "wrongSide" | "human";

/**
 * The AI club's answer to a partnership proposal: a satellite must stand below the human club, a parent above it;
 * the human has one of each at most; an AI club partners one human manager at most.
 */
export function answerPartnership(args: {
  kind: PartnershipKind;
  human: ClubStanding & { id: string };
  target: ClubStanding & { id: string };
  current: SeatPartnerships | undefined;
  /** The target is a human club. */
  targetHuman: boolean;
  /** The target already partners another manager. */
  takenElsewhere: boolean;
}): PartnershipRefusal | null {
  if (args.target.id === args.human.id) return "self";
  if (args.targetHuman) return "human";
  if (args.current?.[args.kind]) return "slotFull";
  const other = args.kind === "satellite" ? "parent" : "satellite";
  if (args.current?.[other]?.clubId === args.target.id) return "taken";
  if (args.takenElsewhere) return "taken";
  const cmp = compareStanding(args.target, args.human);
  if (cmp === 0) return "sameLevel";
  if (args.kind === "satellite" ? cmp > 0 : cmp < 0) return "wrongSide";
  return null;
}

const lineOf = (p: RosterPlayer) => getMainRole(p.positions[0] ?? "CM");

/** The satellite takes a player who would start there: rated at least its line's starters' mean − margin. */
export function satelliteTakes(player: RosterPlayer, satellite: Squad): boolean {
  const avg = starterLineAverages(satellite)[lineOf(player)];
  return overallAvg(player) >= avg - PARTNER.STARTER_MARGIN;
}

export type SatelliteLoanBlock = "noSatellite" | "loanLimit" | "notStarter" | "invalidShare";

/** Whether the human can lend this player to the satellite with this wage share (0..1). */
export function satelliteLoanBlock(args: {
  player: RosterPlayer;
  satellite: Squad | undefined;
  lentNow: number;
  wageShare: number;
}): SatelliteLoanBlock | null {
  if (!args.satellite) return "noSatellite";
  if (!Number.isFinite(args.wageShare) || args.wageShare < 0 || args.wageShare > PARTNER.MAX_SATELLITE_SHARE + 1e-9) {
    return "invalidShare";
  }
  if (args.lentNow >= PARTNER.MAX_LOANS) return "loanLimit";
  if (!satelliteTakes(args.player, args.satellite)) return "notStarter";
  return null;
}

/**
 * The parent's pick for a loan offer to the human satellite: a young player it does not start, in a line the
 * satellite needs, rated above the satellite's line − margin; the best of them. `available` filters what the parent
 * lets go (`loanAvailability`).
 */
export function parentOfferCandidate(args: {
  parent: Squad;
  satellite: Squad;
  neededLines: ReadonlySet<string>;
  available: (p: RosterPlayer) => boolean;
  excluded: ReadonlySet<string>;
}): RosterPlayer | null {
  const avg = starterLineAverages(args.satellite);
  let best: RosterPlayer | null = null;
  for (const p of args.parent.players) {
    if (p.age > PARTNER.OFFER_MAX_AGE || p.loan || args.excluded.has(p.id)) continue;
    const line = lineOf(p);
    if (!args.neededLines.has(line)) continue;
    if (overallAvg(p) < avg[line] - PARTNER.STARTER_MARGIN) continue;
    if (!args.available(p)) continue;
    if (!best || overallAvg(p) > overallAvg(best)) best = p;
  }
  return best;
}

/** Window key of the parent's offers: one counter per window opening. */
export function offerWindowKey(windowUntil: string | undefined): string {
  return windowUntil ?? "";
}
