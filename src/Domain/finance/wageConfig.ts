/**
 * Wage curve + club factor, calibrated by `scripts/wage-calibrate.ts` on the real world
 * (`src/Data/squads/**`, `leagueData.json`, `pyramids.json`) on 2026-09-27.
 *
 * A single rating-only curve cannot make `wageBill / revenue` land near 0.60 across the world:
 * fit that way (see the git history of this file / the design spec §1), the best curve (power-
 * law, GROWTH 6.4) still landed tier medians at 0.20 / 0.72 / 1.51 against a 0.60 target, because
 * a "top flight" bucket alone pools the Premier League with Fiji's top flight, and revenue varies
 * by orders of magnitude more than rating does within that bucket. So the design is CURVE + PER-
 * CLUB FACTOR instead:
 *
 *   - `weeklyWage(rating)` (power-law: `SCALE × rating^GROWTH`, floored) only sets the SHAPE —
 *     GROWTH is chosen so rating 6 → 7 is a plausible ~2–2.5× pay rise (a design choice, grid-
 *     searched in that band for the fewest clubs needing a forced correction — see below), not
 *     fit to any tier target. SCALE is then solved so the median `52 × curveBill / revenue` ratio
 *     across the big-5 leagues (England/Spain/Italy/Germany/France top flight, 96 clubs) is
 *     exactly 0.60 — i.e. the curve alone needs the least correction for the leagues it's
 *     designed around.
 *   - `clubWageFactor(revenue, curveBill)` then corrects EVERY club's actual bill to exactly 60%
 *     of ITS OWN revenue (when unclamped — this is exact by construction, not a further fit),
 *     clamped to [MIN_FACTOR, MAX_FACTOR] so a very rich or very poor club (relative to what the
 *     curve alone predicts for its roster) doesn't get an absurd correction.
 *
 * Both an exponential and a power-law curve were grid-searched over the 6→7 step (2.0–2.5×, step
 * 0.1) with SCALE solved analytically per step from the big-5 median; power-law won on both
 * metrics (fewest clubs clamped: 11.0% vs 13.7%; smaller tier-median error: 0.081 vs 0.373) —
 * power-law's naturally steeper curve shape (`rating^GROWTH` vs `e^(GROWTH×rating)` at the same
 * 6→7 step) differentiates a squad's high- and low-rated players' revenue-worthiness much more
 * than the exponential form does over the 0–7ish rating range actually seen in the world, which
 * is exactly what lets the per-club factor correct less often.
 *
 * Result at the winning (form=pow, step=2.10×) — 1273 clubs, 83 leagues:
 *   - tier 1 (918 clubs, top flight): post-factor median/p10/p90 = 0.60 / 0.60 / 0.60, 0 clamped
 *     at MIN, 12 at MAX (a handful of small-population countries whose revenue-to-squad-quality
 *     ratio is off the curve's chart even at 4×).
 *   - tier 2 (218 clubs, 2nd division): 0.60 / 0.60 / 0.63, 26 at MIN, 0 at MAX.
 *   - tier 3+ (137 clubs, 3rd+ division): 0.80 / 0.60 / 1.86, 93 at MIN, 9 at MAX — the weakest
 *     fit: most 3rd-tier clubs can't afford even a 0.25×-discounted curve wage relative to their
 *     (already tiny) revenue, a real data property this wage system cannot paper over.
 *   - Known outlier leagues clamping heavily in the wrong direction regardless: the Argentine and
 *     Russian lower-division groups (pre-existing, unrelated finance-data oddities — see the
 *     calibration script's "worst-fitting leagues" output).
 */
export const WAGE_CONFIG = {
  /** weekly € = max(FLOOR, SCALE × rating^GROWTH) — relative pay shape only; `clubWageFactor`
   *  corrects the absolute level per club. Rating 6 → 7 costs 2.10× as much. */
  SCALE: 31.8208,
  GROWTH: 4.8131,
  FLOOR: 448,
  /** Target wage bill as a share of annual revenue (`clubWageFactor`). */
  TARGET_SHARE: 0.6,
  /** `clubWageFactor` clamp bounds — a club is never forced below a quarter or above 4× what the
   *  curve alone predicts for its roster. */
  MIN_FACTOR: 0.25,
  MAX_FACTOR: 4,
} as const;
