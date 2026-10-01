/**
 * Wage curve + club factor, calibrated by `scripts/wage-calibrate.ts` on the real world
 * (`src/Data/squads/**`, `leagueData.json`, `pyramids.json`) on 2026-09-27, MIN_FACTOR lowered
 * 2026-09-27 (same day, follow-up pass — see below).
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
 * 0.1) with SCALE solved analytically per step from the big-5 median, minimizing clamped-club
 * fraction (primary) then tier-median error (secondary). Power-law wins in both passes below —
 * its naturally steeper shape (`rating^GROWTH` vs `e^(GROWTH×rating)` at the same 6→7 step)
 * differentiates a squad's high- and low-rated players' revenue-worthiness much more than the
 * exponential form does over the 0–7ish rating range actually seen in the world, which is exactly
 * what lets the per-club factor correct less often.
 *
 * **MIN_FACTOR lowered from 0.25 to 0.08.** At 0.25, 93 of 137 tier-3+ clubs (3rd division and
 * below) hit the MIN clamp, leaving that tier's post-factor bill/revenue at median 0.80 / p90
 * 1.86 against the 0.60 target — a human career started at one of those clubs would bleed money
 * every week no matter how frugal, because the clamp itself was the bottleneck, not the curve.
 * 0.08 gives lower-division clubs enough room to actually reach their real (very low) affordable
 * wage level instead of being floored above it. Re-running the SAME search with MIN_FACTOR=0.08:
 * power-law still wins (2.5% clamped, error ~0 vs exponential's 3.7%, error ~0 — MOST clubs now
 * land exactly on 0.60, clamping only matters for genuine outliers), and the winning step moved
 * to the low end of the allowed band (2.0×, the previous winner was 2.1×) — SCALE/GROWTH/FLOOR
 * changed accordingly.
 *
 * Result at the winning (form=pow, step=2.00×) — 1273 clubs, 83 leagues:
 *   - tier 1 (918 clubs, top flight): post-factor median/p10/p90 = 0.60 / 0.60 / 0.60, 0 clamped
 *     at MIN, 4 at MAX (small-population countries whose revenue-to-squad-quality ratio is off
 *     the curve's chart even at 4×).
 *   - tier 2 (218 clubs, 2nd division): 0.60 / 0.60 / 0.60, 0 at MIN, 0 at MAX.
 *   - tier 3+ (137 clubs, 3rd+ division): 0.60 / 0.60 / 0.67, 21 at MIN, 7 at MAX — far tighter
 *     than the 0.80/0.60/1.86 the old floor produced; the clubs still at MIN are ones whose
 *     revenue genuinely can't support even an 8%-of-curve wage bill.
 *   - Still an outlier regardless of the floor: `of_argentine_second_division_group_b` (median
 *     ratio 0.76, all 16 clubs at MIN — a pre-existing finance-data oddity, unrelated to this
 *     curve; see the calibration script's "worst-fitting leagues" output).
 */
export const WAGE_CONFIG = {
  /** weekly € = max(FLOOR, SCALE × rating^GROWTH) — relative pay shape only; `clubWageFactor`
   *  corrects the absolute level per club. Rating 6 → 7 costs 2.00× as much. */
  SCALE: 54.0721,
  GROWTH: 4.4966,
  FLOOR: 639,
  /** Target wage bill as a share of annual revenue (`clubWageFactor`). */
  TARGET_SHARE: 0.6,
  /** `clubWageFactor` clamp bounds — a club is never forced below 8% or above 4× what the curve
   *  alone predicts for its roster. MIN_FACTOR is deliberately asymmetric (a much smaller floor
   *  than the 1/MAX_FACTOR you'd get from a symmetric clamp) — a poor lower-division club needs
   *  real headroom to reach its actual (very low) affordable wage, not to be floored above it. */
  MIN_FACTOR: 0.08,
  MAX_FACTOR: 4,
  /**
   * Each rollover the carried-forward factor moves this share of the way back to the factor that
   * would put the club exactly at `TARGET_SHARE` (`pullWageFactorToTarget`, issue #23). Without
   * it a club that overspends keeps its inflated factor forever and stays `tight`/`frozen`.
   */
  TARGET_PULL: 0.3,
} as const;
