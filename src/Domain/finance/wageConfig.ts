/**
 * Wage curve parameters, calibrated by `scripts/wage-calibrate.ts` on the real world
 * (`src/Data/squads/**`, `leagueData.json`, `pyramids.json`) on 2026-09-27.
 *
 * Both an exponential (`SCALE × e^(GROWTH × rating)`) and a power-law (`SCALE × rating^GROWTH`)
 * form were tried, each grid-searched over GROWTH (SCALE solved analytically per GROWTH — see
 * `bestGrowth` in the calibration script) to minimize the spread, in log space, of the median
 * `52 × wageBill / annualRevenue` ratio across the three financial tiers (1 = top flight,
 * 2 = second division, 3+ = third division and below; a league absent from every pyramid counts
 * as tier 1). The search is capped so no rating (0..10) costs more than €5M/week — without that
 * cap the objective has no interior optimum and GROWTH runs away to absurd (multi-billion-euro)
 * wages; see the cap's comment in the calibration script for the full explanation. Power-law won
 * (smaller final error: 2.078 vs 2.443 for the exponential form).
 *
 * Result (post-floor, actual per-tier medians of the ratio, target 0.60):
 *   tier 1 (918 clubs): 0.20 · tier 2 (218 clubs): 0.72 · tier 3+ (137 clubs): 1.51
 *
 * The fit is far from perfect — tier 1 pools everything from the Premier League to Fiji's top
 * flight under one "top division" label, and those clubs' REVENUE varies by orders of magnitude
 * far more than their players' RATING does, so no single rating-only curve can hit 0.60 evenly
 * across such a heterogeneous bucket without blowing past the sanity cap. Tier 2/3+ overshoot in
 * the other direction (lower-division revenue collapses faster than player rating does). See the
 * calibration script's printed per-league table for the full before/after breakdown.
 */
export const WAGE_CONFIG = {
  /** weekly € = max(FLOOR, SCALE × rating^GROWTH) */
  SCALE: 1.9443,
  GROWTH: 6.4,
  FLOOR: 65,
} as const;
