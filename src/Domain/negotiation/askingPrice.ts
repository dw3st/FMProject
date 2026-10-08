/**
 * Asking price of a player the human club lists for sale (#88, `.claude/rules/game/negotiation.md`).
 * Pure: `r = asking / value` shapes how often AI clubs bid, from how wide a rating band, and the fee.
 * No asking price (or asking = value) behaves exactly like the plain listing.
 */
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { roundFeeDown, roundFeeUp } from "@/Domain/negotiation/negotiation";
import { playerValueModel } from "@/Domain/awards/awardValue";
import { playerOverallRating } from "@/Domain/transfer/transferNeeds";
import type { RosterPlayer } from "@/types/playerTypes";

const A = NEGOTIATION.ASKING;
const MIN_PRICE = 100_000;

/** Asking / value; 1 without a price or a value. */
export function askingRatio(asking: number | undefined, value: number): number {
  if (asking === undefined || !(asking > 0) || !(value > 0)) return 1;
  return asking / value;
}

/** Multiplier of the daily bid rate: > 1 below the value, < 1 above it, exactly 1 at r = 1. */
export function askingFreqMult(r: number): number {
  if (r === 1) return 1;
  if (r < 1) return Math.min(A.MAX_FREQ_MULT, 1 + A.DISCOUNT_FREQ_SLOPE * (1 - r));
  return Math.pow(r, -A.PREMIUM_FREQ_POWER);
}

/** Extra rating slack of the buyer's need band (only below the value). */
export function askingBandExtra(r: number): number {
  return r < 1 ? Math.min(A.BAND_MAX_EXTRA, A.BAND_PER_DISCOUNT * (1 - r)) : 0;
}

/**
 * The bid's opening fee before the sell-on discount, from the asking price; null at r = 1 (the
 * plain opening applies). `u` is a uniform draw.
 */
export function askingOpening(asking: number, value: number, u: number): number | null {
  const r = askingRatio(asking, value);
  if (r === 1) return null;
  if (r < 1) return asking * (A.DISCOUNT_FEE_MIN + u * A.DISCOUNT_FEE_SPREAD);
  return value + (asking - value) * (A.PREMIUM_FEE_MIN + u * A.PREMIUM_FEE_SPREAD);
}

/** Step of the asking-price field: €0,1M below €10M, €1M from there (same as fees). */
export function askingStep(price: number): number {
  return price < 10_000_000 ? 100_000 : 1_000_000;
}

/** Lowest asking price for a player of `value`: MIN_RATIO × value, never below €0,1M. */
export function askingFloor(value: number): number {
  return Math.max(MIN_PRICE, roundFeeUp(Math.max(0, value) * A.MIN_RATIO));
}

/** The default asking price: his value (at least €0,1M for a player valued at 0). */
export function defaultAskingPrice(value: number): number {
  return Math.max(MIN_PRICE, value);
}

/**
 * Validates and rounds a raw asking price: null when invalid (not a finite number, above
 * MAX_PRICE, or below the floor for `value`; without `value`, only > 0).
 */
export function parseAskingPrice(raw: unknown, value?: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > A.MAX_PRICE) return null;
  const price = roundFeeUp(raw);
  return value !== undefined && price < askingFloor(value) ? null : price;
}

/** One step up or down from `price`, on the field's grid; never below the smallest step. */
export function stepAskingPrice(price: number, dir: 1 | -1, floor = MIN_PRICE): number {
  if (dir > 0) return roundFeeUp(price + askingStep(price));
  const down = roundFeeDown(price - askingStep(Math.max(0, price - 1)));
  return Math.max(floor, MIN_PRICE, down);
}

/** Market value of a player, EUR — the reference of the asking price (same as the AI's fair price). */
export function playerMarketValue(player: RosterPlayer): number {
  return playerValueModel(player, playerOverallRating(player)).price;
}

/** How the asking price compares with the value, for the hint under the field. */
export function askingBand(asking: number, value: number): "below" | "fair" | "above" {
  const r = askingRatio(asking, value);
  return r < 0.995 ? "below" : r > 1.005 ? "above" : "fair";
}
