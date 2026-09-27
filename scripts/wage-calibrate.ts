#!/usr/bin/env bun
/**
 * Calibrates the wage curve (`src/Domain/finance/wageConfig.ts`) against the real world.
 *
 * For every club in `src/Data/squads/**`, computes an estimated annual revenue
 * (`broadcasting + commercial + capacity × 0.65 × 25 × homeGames`, `homeGames = clubs in the
 * league − 1`) and the wage bill the curve would produce for the roster, and searches for curve
 * parameters that put the median `52 × wageBill / revenue` at ~0.60 for each financial tier
 * (1, 2, 3+ — read from `src/Data/pyramids.json`; a league absent from every pyramid is tier 1).
 *
 * Tries both an exponential form (`SCALE × e^(GROWTH × rating)`) and a power-law form
 * (`SCALE × rating^GROWTH`); reports per-league medians/p10/p90 for both, old vs new, and picks
 * the form with the smaller calibration error.
 *
 * Usage: bun scripts/wage-calibrate.ts
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import { Player } from "@/Domain/Player";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { Pyramids } from "@/types/pyramidTypes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SQUADS_DIR = join(ROOT, "src", "Data", "squads");
const LEAGUE_DATA_PATH = join(ROOT, "src", "Data", "leagueData.json");
const PYRAMIDS_PATH = join(ROOT, "src", "Data", "pyramids.json");

// Same numbers as src/backend/FinancialService.ts (TICKET_PRICE, HOME_FILL_RATE).
const TICKET_PRICE = 25;
const HOME_FILL_RATE = 0.65;
const TARGET_RATIO = 0.6;

/**
 * Sanity ceiling: no rating (0..10, the ceiling for a maxed-out player, well above the ~6.94
 * anyone reaches in the current world) may cost more than this per week. Real-world football's
 * best-paid player earns roughly €3.5–4M/week; €5M/week leaves headroom above that for this
 * world's theoretical best while still ruling out absurd (multi-hundred-million-per-week)
 * curves. Without this cap the bucket-median objective below is degenerate — see the comment on
 * `bestGrowth`: minimizing the spread of the three tier medians alone has NO interior optimum
 * over GROWTH, it strictly improves as GROWTH grows without bound (verified by grid sweep up to
 * GROWTH=3 for the exponential form), which produces multi-billion-euro weekly wages at the top
 * of the rating scale. This cap is the thing that actually stops the search.
 */
const MAX_WAGE_AT_RATING_10 = 5_000_000;

// Old (pre-calibration) curve — src/Domain/aiFinance/aiFinanceConfig.ts WAGE_EXPONENT/WAGE_SCALE.
const OLD_EXPONENT = 2.2;
const OLD_SCALE = 50;

interface LeagueEntry {
  slug: string;
  name: string;
  country: string;
}

type TierBucket = "1" | "2" | "3+";
type Form = "exp" | "pow";

interface ClubSample {
  leagueSlug: string;
  leagueName: string;
  tier: number;
  bucket: TierBucket;
  revenue: number;
  ratings: number[];
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function tierBucketOf(tier: number): TierBucket {
  if (tier <= 1) return "1";
  if (tier === 2) return "2";
  return "3+";
}

/** Tier (from the pyramid) of every league slug; absent from every pyramid = tier 1. */
function tierByLeague(leagues: LeagueEntry[], pyramids: Pyramids): Map<string, number> {
  const tiers = new Map<string, number>();
  for (const country of Object.values(pyramids)) {
    for (const level of country.levels) {
      for (const group of level.groups) tiers.set(group.leagueSlug, level.tier);
    }
  }
  const result = new Map<string, number>();
  for (const league of leagues) result.set(league.slug, tiers.get(league.slug) ?? 1);
  return result;
}

function loadClubs(leagues: LeagueEntry[], tiers: Map<string, number>): ClubSample[] {
  const out: ClubSample[] = [];
  for (const league of leagues) {
    const dir = join(SQUADS_DIR, league.slug);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      continue; // league has no squads folder (shouldn't happen in the real world, but be safe)
    }
    if (files.length === 0) continue;
    const homeGames = Math.max(0, files.length - 1);
    const tier = tiers.get(league.slug) ?? 1;
    for (const file of files) {
      const squad = loadJson<Squad & { venue?: { capacity?: number } }>(join(dir, file));
      const finances = squad.finances;
      if (!finances) continue;
      const capacity = squad.venue?.capacity ?? 0;
      const gate = capacity * HOME_FILL_RATE * TICKET_PRICE * homeGames;
      const revenue = finances.broadcasting + finances.commercial + gate;
      if (revenue <= 0) continue;
      const ratings = squad.players.map((p: RosterPlayer) => Player.overallAvg(p));
      out.push({
        leagueSlug: league.slug,
        leagueName: league.name,
        tier,
        bucket: tierBucketOf(tier),
        revenue,
        ratings,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Wage forms
// ---------------------------------------------------------------------------------------------

function rawWage(form: Form, scale: number, growth: number, rating: number): number {
  return form === "exp" ? scale * Math.exp(growth * rating) : scale * Math.pow(Math.max(rating, 0), growth);
}

function squadRawWageBill(form: Form, scale: number, growth: number, ratings: number[]): number {
  let sum = 0;
  for (const r of ratings) sum += rawWage(form, scale, growth, r);
  return sum;
}

// ---------------------------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx]!;
}

// ---------------------------------------------------------------------------------------------
// Growth search
//
// Ratio(club) = 52 × wageBill(club) / revenue(club) scales LINEARLY in SCALE (wageBill is a plain
// sum of SCALE × f(GROWTH, rating)), so for a fixed GROWTH we can compute a "base ratio" with
// SCALE = 1 and derive the SCALE that best centers all three tier-bucket medians on TARGET_RATIO
// in one shot: minimizing Σ_bucket (log(SCALE) + log(median_bucket) − log(TARGET))² over log(SCALE)
// gives log(SCALE) = log(TARGET) − mean(log(median_bucket)), and the residual error at that optimum
// is Σ_bucket (log(median_bucket) − mean(log(median_bucket)))² — i.e. how spread out the three
// bucket base-ratios are. We grid-search GROWTH to minimize that spread, then compute SCALE.
// ---------------------------------------------------------------------------------------------

function bucketBaseMedians(form: Form, growth: number, clubs: ClubSample[]): Partial<Record<TierBucket, number>> {
  const byBucket: Record<TierBucket, number[]> = { "1": [], "2": [], "3+": [] };
  for (const c of clubs) {
    const baseSum = squadRawWageBill(form, 1, growth, c.ratings);
    byBucket[c.bucket]!.push((52 * baseSum) / c.revenue);
  }
  const out: Partial<Record<TierBucket, number>> = {};
  for (const bucket of ["1", "2", "3+"] as const) {
    if (byBucket[bucket].length > 0) out[bucket] = median(byBucket[bucket]);
  }
  return out;
}

interface GrowthCandidate {
  growth: number;
  scale: number;
  spreadError: number; // Σ (log(median) − mean(log(median)))² — growth-only spread across buckets
  medians: Partial<Record<TierBucket, number>>;
}

function bestGrowth(form: Form, clubs: ClubSample[], growthRange: [number, number], step: number): GrowthCandidate {
  let best: GrowthCandidate | null = null;
  for (let growth = growthRange[0]; growth <= growthRange[1] + 1e-9; growth += step) {
    const medians = bucketBaseMedians(form, growth, clubs);
    const logs = Object.values(medians).filter((v): v is number => Number.isFinite(v) && v! > 0).map(Math.log);
    if (logs.length === 0) continue;
    const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;
    const spreadError = logs.reduce((s, l) => s + (l - meanLog) ** 2, 0);
    const scale = Math.exp(Math.log(TARGET_RATIO) - meanLog);

    // Sanity gate: reject any (scale, growth) whose wage at rating 10 blows past the cap. See the
    // MAX_WAGE_AT_RATING_10 comment — without this, spreadError keeps improving as growth grows
    // without bound, so the "best" candidate is whichever one this gate lets through the furthest.
    const wageAt10 = rawWage(form, scale, growth, 10);
    if (wageAt10 > MAX_WAGE_AT_RATING_10) continue;

    if (!best || spreadError < best.spreadError) best = { growth, scale, spreadError, medians };
  }
  if (!best) throw new Error(`bestGrowth(${form}): no viable growth found in range under the wage(10) cap`);
  return best;
}

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

interface CurveFn {
  weekly(rating: number): number;
}

function ratioFor(curve: CurveFn, club: ClubSample): number {
  const wageBill = club.ratings.reduce((s, r) => s + curve.weekly(r), 0);
  return (52 * wageBill) / club.revenue;
}

/** Final squared log error vs TARGET_RATIO, computed on the ACTUAL (post-floor) per-tier medians. */
function finalError(curve: CurveFn, clubs: ClubSample[]): number {
  const byBucket: Record<TierBucket, number[]> = { "1": [], "2": [], "3+": [] };
  for (const c of clubs) byBucket[c.bucket]!.push(ratioFor(curve, c));
  let error = 0;
  for (const bucket of ["1", "2", "3+"] as const) {
    if (byBucket[bucket].length === 0) continue;
    const m = median(byBucket[bucket]);
    error += (Math.log(m) - Math.log(TARGET_RATIO)) ** 2;
  }
  return error;
}

function fmtEUR(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

function printLeagueTable(title: string, clubs: ClubSample[], oldCurve: CurveFn, newCurve: CurveFn) {
  console.log(`\n${title}`);
  console.log(
    "league".padEnd(38) +
      "tier".padEnd(6) +
      "n".padEnd(5) +
      "old med".padEnd(10) +
      "old p10".padEnd(10) +
      "old p90".padEnd(10) +
      "new med".padEnd(10) +
      "new p10".padEnd(10) +
      "new p90",
  );
  const byLeague = new Map<string, ClubSample[]>();
  for (const c of clubs) {
    if (!byLeague.has(c.leagueSlug)) byLeague.set(c.leagueSlug, []);
    byLeague.get(c.leagueSlug)!.push(c);
  }
  const rows = [...byLeague.entries()].sort((a, b) => a[1][0]!.tier - b[1][0]!.tier || a[0].localeCompare(b[0]));
  for (const [slug, leagueClubs] of rows) {
    const oldRatios = leagueClubs.map((c) => ratioFor(oldCurve, c));
    const newRatios = leagueClubs.map((c) => ratioFor(newCurve, c));
    console.log(
      slug.slice(0, 37).padEnd(38) +
        String(leagueClubs[0]!.tier).padEnd(6) +
        String(leagueClubs.length).padEnd(5) +
        median(oldRatios).toFixed(2).padEnd(10) +
        percentile(oldRatios, 0.1).toFixed(2).padEnd(10) +
        percentile(oldRatios, 0.9).toFixed(2).padEnd(10) +
        median(newRatios).toFixed(2).padEnd(10) +
        percentile(newRatios, 0.1).toFixed(2).padEnd(10) +
        percentile(newRatios, 0.9).toFixed(2),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

const leagues = loadJson<LeagueEntry[]>(LEAGUE_DATA_PATH);
const pyramids = loadJson<Pyramids>(PYRAMIDS_PATH);
const tiers = tierByLeague(leagues, pyramids);
const clubs = loadClubs(leagues, tiers);

console.log(`Loaded ${clubs.length} clubs across ${new Set(clubs.map((c) => c.leagueSlug)).size} leagues.`);
for (const bucket of ["1", "2", "3+"] as const) {
  console.log(`  tier ${bucket}: ${clubs.filter((c) => c.bucket === bucket).length} clubs`);
}

const oldCurve: CurveFn = { weekly: (r) => Math.round(Math.pow(r, OLD_EXPONENT) * OLD_SCALE) };

const forms: { form: Form; range: [number, number]; step: number }[] = [
  { form: "exp", range: [0.05, 3.0], step: 0.01 },
  { form: "pow", range: [0.5, 12.0], step: 0.02 },
];

interface FormResult {
  form: Form;
  growth: number;
  scale: number;
  floor: number;
  finalError: number;
  medians: { "1": number; "2": number; "3+": number };
}

const results: FormResult[] = [];

for (const { form, range, step } of forms) {
  const best = bestGrowth(form, clubs, range, step);
  // Round to a clean grid value and recompute scale analytically at that exact growth — the
  // raw best.growth carries float step-accumulation noise (e.g. 6.3999999999999515).
  const growth = Math.round(best.growth / step) * step;
  const roundedMedians = bucketBaseMedians(form, growth, clubs);
  const roundedLogs = Object.values(roundedMedians).filter((v): v is number => Number.isFinite(v) && v! > 0).map(Math.log);
  const scale = Math.exp(Math.log(TARGET_RATIO) - roundedLogs.reduce((a, b) => a + b, 0) / roundedLogs.length);

  // Suggested FLOOR: p10 of individual (unfloored) player wages within tier 3+.
  const tier3Wages = clubs
    .filter((c) => c.bucket === "3+")
    .flatMap((c) => c.ratings.map((r) => rawWage(form, scale, growth, r)));
  const floor = tier3Wages.length > 0 ? Math.round(percentile(tier3Wages, 0.1)) : 0;

  const curve: CurveFn = { weekly: (r) => Math.round(Math.max(floor, rawWage(form, scale, growth, r))) };
  const err = finalError(curve, clubs);

  const byBucket: Record<TierBucket, number[]> = { "1": [], "2": [], "3+": [] };
  for (const c of clubs) byBucket[c.bucket]!.push(ratioFor(curve, c));

  results.push({
    form,
    growth,
    scale,
    floor,
    finalError: err,
    medians: { "1": median(byBucket["1"]), "2": median(byBucket["2"]), "3+": median(byBucket["3+"]) },
  });

  console.log(
    `\n[${form}] growth=${growth.toFixed(3)} scale=${scale.toFixed(3)} floor=${fmtEUR(floor)} ` +
      `finalError=${err.toFixed(5)}`,
  );
  console.log(
    `  medians by tier — 1: ${byBucket["1"].length ? median(byBucket["1"]).toFixed(3) : "n/a"}` +
      `  2: ${byBucket["2"].length ? median(byBucket["2"]).toFixed(3) : "n/a"}` +
      `  3+: ${byBucket["3+"].length ? median(byBucket["3+"]).toFixed(3) : "n/a"}`,
  );
}

const winner = results.reduce((a, b) => (b.finalError < a.finalError ? b : a));
console.log(`\n=== WINNER: ${winner.form} (finalError ${winner.finalError.toFixed(5)} vs ${
  results.find((r) => r.form !== winner.form)!.finalError.toFixed(5)
} for the other form) ===`);
console.log(
  winner.form === "exp"
    ? `weekly € = max(FLOOR, SCALE × e^(GROWTH × rating))`
    : `weekly € = max(FLOOR, SCALE × rating^GROWTH)`,
);
console.log(`SCALE=${winner.scale}`);
console.log(`GROWTH=${winner.growth}`);
console.log(`FLOOR=${winner.floor}`);
console.log(`medians by tier: 1=${winner.medians["1"].toFixed(3)} 2=${winner.medians["2"].toFixed(3)} 3+=${winner.medians["3+"].toFixed(3)}`);

const winnerCurve: CurveFn = {
  weekly: (r) => Math.round(Math.max(winner.floor, rawWage(winner.form, winner.scale, winner.growth, r))),
};

printLeagueTable("Per-league wageBill/revenue ratio — OLD vs NEW (winning form)", clubs, oldCurve, winnerCurve);

console.log("\nExample weekly wages (winning curve):");
for (const rating of [4, 5, 6, 7, 8]) {
  console.log(`  rating ${rating}: ${fmtEUR(winnerCurve.weekly(rating))}`);
}
