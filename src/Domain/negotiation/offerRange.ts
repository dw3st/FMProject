import { overallAvg } from "@/Domain/playerRating";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";
import type { RosterPlayer } from "@/types/playerTypes";

const FEE_STEP = 100_000;
/** The slider reaches this many times his value, so a cheap player's offer stays easy to set. */
const VALUE_CAP = 3;
const MIN_CAP = 10_000_000;

export interface OfferRange {
  canOffer: boolean;
  min: number;
  max: number;
  step: number;
  /** Where the slider opens: his estimated value, or as much as the club has. */
  start: number;
}

/** The fee a transfer offer can take: up to what the club has, opening at his estimated market value. */
export function transferOfferRange(budget: number, value: number): OfferRange {
  const max = Math.min(budget, Math.max(value * VALUE_CAP, MIN_CAP));
  if (budget <= 0 || max < FEE_STEP) return { canOffer: false, min: 0, max: 0, step: FEE_STEP, start: 0 };
  return { canOffer: true, min: FEE_STEP, max, step: FEE_STEP, start: Math.min(max, Math.max(FEE_STEP, roundFeeUp(value))) };
}

const STARTERS: Record<MainRole, number> = { GK: 1, Defender: 4, Midfielder: 3, Forward: 3 };

/** Average rating of the club's best players of a line, as many as start in a 4-3-3: what a signing is compared with. */
export function starterLineLevel(players: readonly RosterPlayer[], role: MainRole): number | null {
  const line = players
    .filter((p) => getMainRole(p.positions[0] ?? "") === role)
    .map(overallAvg)
    .sort((a, b) => b - a)
    .slice(0, STARTERS[role]);
  return line.length > 0 ? line.reduce((sum, v) => sum + v, 0) / line.length : null;
}
