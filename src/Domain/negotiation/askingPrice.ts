/**
 * Asking price of a player the human club lists for sale (#88, `.claude/rules/game/negotiation.md`).
 * Pure: `r = asking / value` shapes how often AI clubs bid, from how wide a rating band, and the fee.
 * No asking price (or asking = value) behaves exactly like the plain listing.
 */
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";

const A = NEGOTIATION.ASKING;

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

/** Validates and rounds a raw asking price: null when invalid (not a finite number > 0 or too big). */
export function parseAskingPrice(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > A.MAX_PRICE) return null;
  return roundFeeUp(raw);
}
