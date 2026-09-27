#!/usr/bin/env bun
/**
 * Calibrates the wage curve + per-club factor (`src/Domain/finance/wageConfig.ts`) against the
 * real world.
 *
 * Design (curve + club factor — see `.claude/rules/AI-clubs/finance.md` and the design spec §1):
 * a single rating-only curve cannot make `wageBill / revenue` land near 0.60 for every club — a
 * "tier 1" (top flight) bucket alone pools the Premier League with Fiji's top flight, and those
 * clubs' REVENUE varies by orders of magnitude far more than their players' RATING does (see the
 * single-curve result documented in `wageConfig.ts`'s history / the design spec: tier medians
 * 0.20 / 0.72 / 1.51 against a 0.60 target, using a curve alone). So instead:
 *
 *   1. `weeklyWage(rating)` is a MILD relative-pay curve — it only sets the shape (how much more
 *      a higher-rated player costs) and the floor. GROWTH is chosen so the rating 6→7 step is a
 *      plausible ~2–2.5× pay rise (a design choice, not a fit target). SCALE is then solved so
 *      the big-5 leagues' (England/Spain/Italy/Germany/France top flight) median
 *      `52 × curveBill / revenue` ratio is exactly 0.60 — i.e. the curve alone is well-calibrated
 *      for the leagues it was designed around, needing the least correction.
 *   2. `clubWageFactor(revenue, curveBill)` is a per-club multiplier that corrects EVERY other
 *      club's actual wage bill to land at 60% of ITS OWN revenue, clamped to [0.25, 4] so neither
 *      a very rich nor a very poor club (relative to what the curve predicts for its roster) gets
 *      an absurd correction.
 *
 * For every club in `src/Data/squads/**`, this script computes the same annual revenue estimate
 * as before (`broadcasting + commercial + capacity × 0.65 × 25 × homeGames`,
 * `homeGames = clubs in the league − 1`), the curve's raw wage bill, the resulting factor, and
 * reports: per-tier and per-league bill/revenue median/p10/p90 (should sit near 0.60 except
 * clamped clubs), the fraction of clubs hitting the MIN/MAX clamp, and example wages for a
 * Premier League / Championship / Kenyan club.
 *
 * Usage: bun scripts/wage-calibrate.ts
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import { Player } from "@/Domain/Player";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { AI_FINANCE_CONFIG, FINANCIAL_TIERS } from "@/Domain/aiFinance/aiFinanceConfig";
import type { RosterPlayer, Squad, FinancialTier } from "@/types/playerTypes";
import type { Pyramids } from "@/types/pyramidTypes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SQUADS_DIR = join(ROOT, "src", "Data", "squads");
const LEAGUE_DATA_PATH = join(ROOT, "src", "Data", "leagueData.json");
const PYRAMIDS_PATH = join(ROOT, "src", "Data", "pyramids.json");

// Same numbers as src/backend/FinancialService.ts / src/Domain/finance/gate.ts.
const TICKET_PRICE = 25;
const HOME_FILL_RATE = 0.65;

// Mirrors src/Domain/finance/wageConfig.ts (kept local so this script is self-contained and can
// freely search candidate values before anything is written back to that file).
const TARGET_RATIO = 0.6;
const MIN_FACTOR = 0.08;
const MAX_FACTOR = 4;
const CLAMP_EPS = 1e-9;

// Old (pre-#12) curve — src/Domain/aiFinance/aiFinanceConfig.ts WAGE_EXPONENT/WAGE_SCALE.
const OLD_EXPONENT = 2.2;
const OLD_SCALE = 50;

const BIG5 = ["premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1"];
const EXAMPLE_LEAGUES: { slug: string; label: string }[] = [
  { slug: "premier_league", label: "Premier League" },
  { slug: "of_championship", label: "Championship" },
  { slug: "of_kenyan_premier_division", label: "Kenyan Premier Division" },
];

interface LeagueEntry {
  slug: string;
  name: string;
  country: string;
}

type TierBucket = "1" | "2" | "3+";
type Form = "exp" | "pow";

interface ClubSample {
  squadId: string;
  squadName: string;
  leagueSlug: string;
  tier: number;
  bucket: TierBucket;
  revenue: number;
  /** broadcasting + commercial only (no gate) — the basis `naturalFinancialTier` classifies on. */
  income: number;
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
        squadId: squad.id,
        squadName: squad.name,
        leagueSlug: league.slug,
        tier,
        bucket: tierBucketOf(tier),
        revenue,
        income: finances.broadcasting + finances.commercial,
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

/** GROWTH implied by wanting rating7/rating6 to cost `ratio67` times as much (design choice). */
function growthForStep(form: Form, ratio67: number): number {
  return form === "exp" ? Math.log(ratio67) : Math.log(ratio67) / Math.log(7 / 6);
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

function fmtEUR(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------------------------
// Fit: SCALE from the big-5 median, FLOOR from tier 3+ p10, then evaluate the whole world
// ---------------------------------------------------------------------------------------------

interface Curve {
  form: Form;
  scale: number;
  growth: number;
  floor: number;
  weekly(rating: number): number;
}

function fitCurve(form: Form, ratio67: number, clubs: ClubSample[]): Curve {
  const growth = growthForStep(form, ratio67);

  // SCALE: the big-5's median raw ratio (SCALE=1) tells us the multiplier that puts their
  // median bill/revenue exactly at TARGET_RATIO — i.e. the curve alone needs the LEAST
  // correction (factor ≈ 1) for the leagues it's designed around.
  const big5RawRatios = clubs
    .filter((c) => BIG5.includes(c.leagueSlug))
    .map((c) => (52 * squadRawWageBill(form, 1, growth, c.ratings)) / c.revenue);
  const scale = TARGET_RATIO / median(big5RawRatios);

  // FLOOR: p10 of individual (unfloored) player wages within tier 3+, so weak/young players
  // aren't paid next to nothing.
  const tier3Wages = clubs
    .filter((c) => c.bucket === "3+")
    .flatMap((c) => c.ratings.map((r) => rawWage(form, scale, growth, r)));
  const floor = tier3Wages.length > 0 ? Math.round(percentile(tier3Wages, 0.1)) : 0;

  return { form, scale, growth, floor, weekly: (r) => Math.round(Math.max(floor, rawWage(form, scale, growth, r))) };
}

function clubFactor(revenue: number, curveBill: number): number {
  if (curveBill <= 0) return MAX_FACTOR;
  const raw = (TARGET_RATIO * revenue) / (52 * curveBill);
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw));
}

interface ClubOutcome extends ClubSample {
  curveBill: number;
  factor: number;
  ratio: number; // post-factor bill/revenue
  clampedMin: boolean;
  clampedMax: boolean;
}

function evaluate(curve: Curve, clubs: ClubSample[]): ClubOutcome[] {
  return clubs.map((c) => {
    const curveBill = c.ratings.reduce((s, r) => s + curve.weekly(r), 0);
    const factor = clubFactor(c.revenue, curveBill);
    const ratio = (52 * curveBill * factor) / c.revenue;
    return {
      ...c,
      curveBill,
      factor,
      ratio,
      clampedMin: factor <= MIN_FACTOR + CLAMP_EPS,
      clampedMax: factor >= MAX_FACTOR - CLAMP_EPS,
    };
  });
}

function tierMedianError(outcomes: ClubOutcome[]): number {
  const byBucket: Record<TierBucket, number[]> = { "1": [], "2": [], "3+": [] };
  for (const o of outcomes) byBucket[o.bucket].push(o.ratio);
  let error = 0;
  for (const bucket of ["1", "2", "3+"] as const) {
    if (byBucket[bucket].length === 0) continue;
    error += (Math.log(median(byBucket[bucket])) - Math.log(TARGET_RATIO)) ** 2;
  }
  return error;
}

function clampedFraction(outcomes: ClubOutcome[]): number {
  return outcomes.filter((o) => o.clampedMin || o.clampedMax).length / outcomes.length;
}

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

function printTierTable(title: string, outcomes: ClubOutcome[]) {
  console.log(`\n${title}`);
  console.log("tier".padEnd(6) + "n".padEnd(6) + "median".padEnd(10) + "p10".padEnd(10) + "p90".padEnd(10) + "clampMin".padEnd(10) + "clampMax");
  for (const bucket of ["1", "2", "3+"] as const) {
    const rows = outcomes.filter((o) => o.bucket === bucket);
    if (rows.length === 0) continue;
    const ratios = rows.map((o) => o.ratio);
    console.log(
      bucket.padEnd(6) +
        String(rows.length).padEnd(6) +
        median(ratios).toFixed(2).padEnd(10) +
        percentile(ratios, 0.1).toFixed(2).padEnd(10) +
        percentile(ratios, 0.9).toFixed(2).padEnd(10) +
        String(rows.filter((o) => o.clampedMin).length).padEnd(10) +
        String(rows.filter((o) => o.clampedMax).length),
    );
  }
}

function printLeagueTable(title: string, outcomes: ClubOutcome[], oldWeekly: (r: number) => number) {
  console.log(`\n${title}`);
  console.log(
    "league".padEnd(38) +
      "tier".padEnd(6) +
      "n".padEnd(5) +
      "old med".padEnd(10) +
      "new med".padEnd(10) +
      "new p10".padEnd(10) +
      "new p90".padEnd(10) +
      "clampMin".padEnd(10) +
      "clampMax",
  );
  const byLeague = new Map<string, ClubOutcome[]>();
  for (const o of outcomes) {
    if (!byLeague.has(o.leagueSlug)) byLeague.set(o.leagueSlug, []);
    byLeague.get(o.leagueSlug)!.push(o);
  }
  const rows = [...byLeague.entries()].sort((a, b) => a[1][0]!.tier - b[1][0]!.tier || a[0].localeCompare(b[0]));
  for (const [slug, leagueClubs] of rows) {
    const oldRatios = leagueClubs.map((o) => (52 * o.ratings.reduce((s, r) => s + oldWeekly(r), 0)) / o.revenue);
    const newRatios = leagueClubs.map((o) => o.ratio);
    console.log(
      slug.slice(0, 37).padEnd(38) +
        String(leagueClubs[0]!.tier).padEnd(6) +
        String(leagueClubs.length).padEnd(5) +
        median(oldRatios).toFixed(2).padEnd(10) +
        median(newRatios).toFixed(2).padEnd(10) +
        percentile(newRatios, 0.1).toFixed(2).padEnd(10) +
        percentile(newRatios, 0.9).toFixed(2).padEnd(10) +
        String(leagueClubs.filter((o) => o.clampedMin).length).padEnd(10) +
        String(leagueClubs.filter((o) => o.clampedMax).length),
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
console.log(`  big-5: ${clubs.filter((c) => BIG5.includes(c.leagueSlug)).length} clubs`);

// Small grid over the design-allowed 6→7 step (2.0–2.5×) for each form — SCALE/FLOOR are fit
// analytically per candidate, so this is cheap. We pick, per form, the step minimizing clamped
// fraction (primary — fewest clubs needing a forced correction) then final tier-median error
// (secondary), then compare the two forms' best candidates.
const STEP_GRID = [2.0, 2.1, 2.2, 2.25, 2.3, 2.4, 2.5];

interface Candidate {
  form: Form;
  ratio67: number;
  curve: Curve;
  outcomes: ClubOutcome[];
  clamped: number;
  error: number;
}

const candidates: Candidate[] = [];
for (const form of ["exp", "pow"] as const) {
  console.log(`\n--- ${form} form, scanning 6→7 step ${STEP_GRID[0]}–${STEP_GRID.at(-1)} ---`);
  for (const ratio67 of STEP_GRID) {
    const curve = fitCurve(form, ratio67, clubs);
    const outcomes = evaluate(curve, clubs);
    const clamped = clampedFraction(outcomes);
    const error = tierMedianError(outcomes);
    candidates.push({ form, ratio67, curve, outcomes, clamped, error });
    console.log(
      `  step=${ratio67.toFixed(2)} growth=${curve.growth.toFixed(3)} scale=${curve.scale.toExponential(3)} ` +
        `floor=${fmtEUR(curve.floor)} clamped=${(clamped * 100).toFixed(1)}% error=${error.toFixed(5)}`,
    );
  }
}

// Best per form (fewest clamped, then smallest error), then the overall winner.
const bestByForm = (form: Form) =>
  candidates.filter((c) => c.form === form).reduce((a, b) => (b.clamped < a.clamped || (b.clamped === a.clamped && b.error < a.error) ? b : a));
const bestExp = bestByForm("exp");
const bestPow = bestByForm("pow");
const winner = bestExp.clamped < bestPow.clamped || (bestExp.clamped === bestPow.clamped && bestExp.error < bestPow.error) ? bestExp : bestPow;
const loser = winner === bestExp ? bestPow : bestExp;

console.log(
  `\n=== WINNER: ${winner.form} step=${winner.ratio67} (clamped ${(winner.clamped * 100).toFixed(1)}%, error ${winner.error.toFixed(5)}) ` +
    `vs ${loser.form} step=${loser.ratio67} (clamped ${(loser.clamped * 100).toFixed(1)}%, error ${loser.error.toFixed(5)}) ===`,
);
console.log(winner.form === "exp" ? `weekly € = max(FLOOR, SCALE × e^(GROWTH × rating))` : `weekly € = max(FLOOR, SCALE × rating^GROWTH)`);
console.log(`SCALE=${winner.curve.scale}`);
console.log(`GROWTH=${winner.curve.growth}`);
console.log(`FLOOR=${winner.curve.floor}`);
console.log(`TARGET_SHARE=${TARGET_RATIO} MIN_FACTOR=${MIN_FACTOR} MAX_FACTOR=${MAX_FACTOR}`);
console.log(`rating 6 → 7 step: ${(winner.curve.weekly(7) / winner.curve.weekly(6)).toFixed(3)}x`);

const oldWeekly = (r: number) => Math.round(Math.pow(r, OLD_EXPONENT) * OLD_SCALE);

printTierTable("Post-factor bill/revenue ratio by tier (winning curve)", winner.outcomes);
printLeagueTable("Post-factor bill/revenue ratio by league — old (curve-only) median vs new", winner.outcomes, oldWeekly);

const worstLeagues = [...new Set(winner.outcomes.map((o) => o.leagueSlug))]
  .map((slug) => {
    const rows = winner.outcomes.filter((o) => o.leagueSlug === slug);
    const dev = Math.abs(Math.log(median(rows.map((o) => o.ratio))) - Math.log(TARGET_RATIO));
    return { slug, dev, n: rows.length };
  })
  .sort((a, b) => b.dev - a.dev)
  .slice(0, 8);
console.log("\nWorst-fitting leagues (median ratio furthest from 0.60):");
for (const w of worstLeagues) console.log(`  ${w.slug} (n=${w.n})`);

console.log("\nExample weekly wages at rating 4/5/6/7, one representative club per league (factor closest to that league's median):");
for (const { slug, label } of EXAMPLE_LEAGUES) {
  const rows = winner.outcomes.filter((o) => o.leagueSlug === slug);
  if (rows.length === 0) {
    console.log(`  ${label} (${slug}): no data`);
    continue;
  }
  const medFactor = median(rows.map((o) => o.factor));
  const rep = rows.reduce((a, b) => (Math.abs(b.factor - medFactor) < Math.abs(a.factor - medFactor) ? b : a));
  console.log(`  ${label} — ${rep.squadName} (factor ${rep.factor.toFixed(2)}, revenue ${fmtEUR(rep.revenue)}):`);
  for (const rating of [4, 5, 6, 7]) {
    console.log(`    rating ${rating}: ${fmtEUR(Math.round(winner.curve.weekly(rating) * rep.factor))}`);
  }
}

// ---------------------------------------------------------------------------------------------
// AI wage-budget hiring distribution (#12 follow-up — maxWageBudget from revenue, not popularity)
// ---------------------------------------------------------------------------------------------
//
// `maxWageBudget = WAGE_REVENUE_SHARE × revenue / 52 × SOFT_BALANCE[tier]` — see
// `src/Domain/aiFinance/aiFinanceConfig.ts` / `aiClubFinance.ts`. Every club's ACTUAL wage bill
// (`curveBill × factor`, `winner.outcomes` above) is already computed with the real
// `clubWageFactor` / `weeklyWage` from `src/Domain/finance/wages.ts` (imported directly, not
// re-implemented) — this section only grid-searches WAGE_REVENUE_SHARE against that same data to
// find the value whose hiring-state split (open/tight/frozen) across the whole world lands near
// the design target ~92% / 5% / 3%.

interface HiringSample {
  tier: FinancialTier;
  weeklyBill: number; // curveBill × factor, same formula as squadWageBill
  revenue: number;
}

const hiringSamples: HiringSample[] = winner.outcomes.map((o) => ({
  tier: naturalFinancialTier({ broadcasting: o.income, commercial: 0, total: o.income, budget: 0, followers: 0 }),
  weeklyBill: o.curveBill * o.factor,
  revenue: o.revenue,
}));

console.log(`\nFinancial-tier split of the ${hiringSamples.length} sampled clubs (naturalFinancialTier, world start):`);
for (const t of FINANCIAL_TIERS) {
  const n = hiringSamples.filter((s) => s.tier === t).length;
  console.log(`  ${t.padEnd(7)} ${n} (${((n / hiringSamples.length) * 100).toFixed(1)}%)`);
}

function hiringStateLocal(bill: number, cap: number): "open" | "tight" | "frozen" {
  if (bill >= cap) return "frozen";
  if (bill >= cap * AI_FINANCE_CONFIG.NEAR_LIMIT_RATIO) return "tight";
  return "open";
}

function distributionFor(share: number): { open: number; tight: number; frozen: number } {
  let open = 0, tight = 0, frozen = 0;
  for (const s of hiringSamples) {
    const cap = share * (s.revenue / 52) * AI_FINANCE_CONFIG.SOFT_BALANCE[s.tier];
    const state = hiringStateLocal(s.weeklyBill, cap);
    if (state === "open") open++;
    else if (state === "tight") tight++;
    else frozen++;
  }
  const n = hiringSamples.length;
  return { open: (open / n) * 100, tight: (tight / n) * 100, frozen: (frozen / n) * 100 };
}

const TARGET_DIST = { open: 92, tight: 5, frozen: 3 };
const SHARE_GRID = [0.55, 0.58, 0.60, 0.62, 0.64, 0.65, 0.66, 0.67, 0.68, 0.69, 0.70, 0.72, 0.75, 0.78, 0.80, 0.85, 0.90, 1.0];

console.log("\nHiring-state distribution vs WAGE_REVENUE_SHARE (target ~92% open / 5% tight / 3% frozen):");
console.log("share".padEnd(8) + "open%".padEnd(9) + "tight%".padEnd(9) + "frozen%");
let bestShare = SHARE_GRID[0]!;
let bestErr = Infinity;
for (const share of SHARE_GRID) {
  const d = distributionFor(share);
  const err = (d.open - TARGET_DIST.open) ** 2 + (d.tight - TARGET_DIST.tight) ** 2 + (d.frozen - TARGET_DIST.frozen) ** 2;
  if (err < bestErr) { bestErr = err; bestShare = share; }
  console.log(share.toFixed(2).padEnd(8) + d.open.toFixed(1).padEnd(9) + d.tight.toFixed(1).padEnd(9) + d.frozen.toFixed(1));
}

console.log(`\n=== Closest WAGE_REVENUE_SHARE to the 92/5/3 target by SSE alone: ${bestShare.toFixed(2)} ===`);
const bestDist = distributionFor(bestShare);
console.log(`  open=${bestDist.open.toFixed(1)}% tight=${bestDist.tight.toFixed(1)}% frozen=${bestDist.frozen.toFixed(1)}%`);

function printByTier(share: number, label: string) {
  console.log(`\nBy financial tier, at share=${share.toFixed(2)} (${label}):`);
  console.log("tier".padEnd(8) + "n".padEnd(6) + "open%".padEnd(9) + "tight%".padEnd(9) + "frozen%");
  for (const t of FINANCIAL_TIERS) {
    const rows = hiringSamples.filter((s) => s.tier === t);
    if (rows.length === 0) continue;
    let open = 0, tight = 0, frozen = 0;
    for (const s of rows) {
      const cap = share * (s.revenue / 52) * AI_FINANCE_CONFIG.SOFT_BALANCE[s.tier];
      const state = hiringStateLocal(s.weeklyBill, cap);
      if (state === "open") open++;
      else if (state === "tight") tight++;
      else frozen++;
    }
    console.log(
      t.padEnd(8) + String(rows.length).padEnd(6) +
        ((open / rows.length) * 100).toFixed(1).padEnd(9) +
        ((tight / rows.length) * 100).toFixed(1).padEnd(9) +
        ((frozen / rows.length) * 100).toFixed(1),
    );
  }
}

printByTier(bestShare, "closest to 92/5/3 by SSE alone");

// The SSE-closest share above is NOT necessarily what's actually configured: bill/cap is a
// near-constant PER TIER (see the AI_FINANCE_CONFIG.WAGE_REVENUE_SHARE comment), so as the share
// rises past a tier's 0.9 NEAR_LIMIT_RATIO threshold, that whole tier flips open/tight at once —
// 0.67-0.70 puts ELITE (bill/cap 0.6/(share×0.95)) permanently at or above 0.9 (tight or worse).
// The production value trades a slightly worse SSE-to-92/5/3 fit for keeping every tier open at
// world start.
if (AI_FINANCE_CONFIG.WAGE_REVENUE_SHARE !== bestShare) {
  const prodDist = distributionFor(AI_FINANCE_CONFIG.WAGE_REVENUE_SHARE);
  console.log(
    `\n=== Production WAGE_REVENUE_SHARE (aiFinanceConfig.ts): ${AI_FINANCE_CONFIG.WAGE_REVENUE_SHARE.toFixed(2)} — ` +
      `open=${prodDist.open.toFixed(1)}% tight=${prodDist.tight.toFixed(1)}% frozen=${prodDist.frozen.toFixed(1)}% ===`,
  );
  printByTier(AI_FINANCE_CONFIG.WAGE_REVENUE_SHARE, "production value");
}
