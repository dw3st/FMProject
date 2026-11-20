/**
 * Stage 17 (`player-scores.md` → "Stage 17"): the starters' match ratings by line, legacy weights and the FM hooks,
 * from seeded full-engine matches (AI formations, balanced, fitness 88). Every starter's hook tally is saved, so the
 * FM weights can be re-evaluated without re-simulating.
 *
 *   bun scripts/rating-distribution.ts [matches=12] [league=premier_league] [--seed 9000] [--legacy] [--out f.json]
 *   bun scripts/rating-distribution.ts --eval f.json [--target t.json] [--fm-scale] [--weights '{"GOAL":1.2}']
 *
 * `--eval` recomputes the FM ratings from the saved tallies (`--weights` overrides `FM_RATING` keys). `--fm-scale`
 * first scales each hook count by FM's per-match volume over ours (R9: goals, shots, passes, tackles, fouls…), the
 * weights' design point while our volumes are uncalibrated (stage 21).
 *
 * `--legacy` plays the compressed clock (`LEGACY_CLOCK_SCALE`, the event volume of the engine before stage 2): its
 * legacy ratings are "today's" distribution, the shape target.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { getAllLegacyRatings, getAllRatingTallies } from "@/GameEngine/Domain/PlayerRating";
import { RATING_TALLY_KEYS, ratingFromTally, ratingParts, type RatingTally } from "@/GameEngine/Domain/RatingModel";
import { FM_RATING } from "@/GameEngine/Configs/PlayerRatingConfig";
import { getMainRole } from "@/Domain/roles";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { addRating, emptyRatingLines, lineOfRole, RATING_LINES, summarizeRatingLine, type RatingLine } from "@/lab/ratingDistribution";

interface Row { line: RatingLine; legacy: number; tally: RatingTally }

const args = process.argv.slice(2);
const flag = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));

/** FM per-match totals (both teams; R9) each hook's count follows (null = unscaled). */
const FM_VOLUME: Partial<Record<keyof RatingTally, { fm: number; with?: keyof RatingTally }>> = {
  goals: { fm: 1.5 }, goodGoals: { fm: 1.5, with: "goals" }, greatGoals: { fm: 1.5, with: "goals" }, decisiveGoals: { fm: 1.5, with: "goals" },
  npGoals: { fm: 1.5, with: "goals" }, assists: { fm: 1.5, with: "goals" }, mistakesToGoal: { fm: 1.5, with: "goals" },
  shots: { fm: 21.5 }, keyPasses: { fm: 21.5, with: "shots" }, shotsOnTarget: { fm: 7.5 }, npxg: { fm: 3.3 }, xa: { fm: 3.3, with: "npxg" },
  passesCompleted: { fm: 841 }, passesIncomplete: { fm: 137 }, dribblesWon: { fm: 20 }, dribblesLost: { fm: 20, with: "dribblesWon" },
  crossesCompleted: { fm: 12 }, tacklesWon: { fm: 17 }, tacklesLost: { fm: 17, with: "tacklesWon" }, interceptions: { fm: 59 },
  blocks: { fm: 8.2 }, aerialWon: { fm: 27 }, aerialLost: { fm: 27, with: "aerialWon" }, fouls: { fm: 19 },
  saves: { fm: 6 }, goodSaves: { fm: 6, with: "saves" }, greatSaves: { fm: 6, with: "saves" }, yellow: { fm: 3 }, red: { fm: 0.1 },
  penaltiesConceded: { fm: 0.2 },
};

function fmScaled(rows: Row[]): Row[] {
  const matches = rows.length / 22;
  const total = (k: keyof RatingTally) => rows.reduce((a, r) => a + r.tally[k], 0) / matches;
  const ratio: Partial<Record<keyof RatingTally, number>> = {};
  for (const k of RATING_TALLY_KEYS) {
    const v = FM_VOLUME[k];
    if (!v) continue;
    const ours = total(v.with ?? k);
    ratio[k] = ours > 0 ? v.fm / ours : 1;
  }
  console.log("\nFM volume scale per hook: " + Object.entries(ratio).map(([k, v]) => `${k} ×${v!.toFixed(2)}`).join(", "));
  // Counts are thinned (binomial) or topped up (Poisson) at random, so a rare hook keeps its all-or-nothing shape (a
  // goal stays a goal); the sub-hooks of a goal follow the goals kept; xG / xA are scaled.
  const rng = mulberry32(seedFrom("rating-fm-scale"));
  const thin = (k: number, r: number): number => {
    if (r <= 1) { let out = 0; for (let i = 0; i < Math.round(k); i++) if (rng() < r) out++; return out; }
    const mean = k * (r - 1);
    let extra = 0, p = Math.exp(-mean), c = p; const u = rng();
    while (u > c && extra < 1000) { extra++; p *= mean / extra; c += p; }
    return k + extra;
  };
  const GOAL_SUBS: (keyof RatingTally)[] = ["goodGoals", "greatGoals", "decisiveGoals", "npGoals"];
  return rows.map(r => {
    const t = { ...r.tally };
    for (const k of RATING_TALLY_KEYS) {
      if (GOAL_SUBS.includes(k) || ratio[k] === undefined) continue;
      t[k] = k === "npxg" || k === "xa" ? r.tally[k] * ratio[k]! : thin(r.tally[k], ratio[k]!);
    }
    const kept = r.tally.goals > 0 ? t.goals / r.tally.goals : 0;
    for (const k of GOAL_SUBS) t[k] = thin(r.tally[k], kept);
    return { ...r, tally: t };
  });
}

function report(title: string, rows: Row[], pick: (r: Row) => number): void {
  const t = emptyRatingLines();
  for (const r of rows) addRating(t, r.line, pick(r));
  console.log(`\n${title}`);
  console.log("  line    n   mean    sd    p10   p50   p90   ≥8%   ≥8.5%  <5.5%");
  for (const l of RATING_LINES) {
    const s = summarizeRatingLine(t[l]);
    console.log(`  ${l.padEnd(4)} ${String(s.n).padStart(4)}  ${s.mean.toFixed(2)}  ${s.sd.toFixed(2)}  ${s.p10.toFixed(2)}  ${s.p50.toFixed(2)}  ${s.p90.toFixed(2)}  ${s.over8Pct.toFixed(1).padStart(4)}  ${s.over85Pct.toFixed(1).padStart(5)}  ${s.under55Pct.toFixed(1).padStart(5)}`);
  }
}

function tallyMeans(rows: Row[], w: typeof FM_RATING = FM_RATING): void {
  console.log("\nHook counts per starter per match (mean by line)");
  console.log("  " + "hook".padEnd(18) + RATING_LINES.map(l => l.padStart(8)).join(""));
  for (const k of RATING_TALLY_KEYS) {
    const vals = RATING_LINES.map(l => { const rs = rows.filter(r => r.line === l); return rs.length ? rs.reduce((a, r) => a + r.tally[k], 0) / rs.length : 0; });
    console.log("  " + k.padEnd(18) + vals.map(v => v.toFixed(2).padStart(8)).join(""));
  }
  console.log("\nRating parts per starter (mean by line, FM weights)");
  const parts = Object.keys(ratingParts(rows[0]!.tally));
  for (const p of parts) {
    const vals = RATING_LINES.map(l => { const rs = rows.filter(r => r.line === l); return rs.length ? rs.reduce((a, r) => a + ratingParts(r.tally, w)[p]!, 0) / rs.length : 0; });
    console.log("  " + p.padEnd(18) + vals.map(v => v.toFixed(3).padStart(8)).join(""));
  }
}

const evalFile = flag("--eval", "");
if (evalFile) {
  const raw = JSON.parse(readFileSync(evalFile, "utf8")) as Row[];
  const rows = args.includes("--fm-scale") ? fmScaled(raw) : raw;
  const w = { ...FM_RATING, ...(JSON.parse(flag("--weights", "{}")) as Partial<typeof FM_RATING>) } as typeof FM_RATING;
  const target = flag("--target", "");
  if (target) report(`Target (legacy ratings of ${target})`, JSON.parse(readFileSync(target, "utf8")) as Row[], r => r.legacy);
  report(`Legacy weights on ${evalFile}`, rows, r => r.legacy);
  report(`FM hooks on ${evalFile}`, rows, r => ratingFromTally(r.tally, w));
  tallyMeans(rows, w);
  process.exit(0);
}

const matches = Number(positional[0] ?? "12");
const league = positional[1] ?? "premier_league";
const seed = Number(flag("--seed", "9000"));
const out = flag("--out", "");
const legacyClock = args.includes("--legacy");
const squads = loadLeagueAt88(league);
const rows: Row[] = [];
const momentum = { points: 0, shots: 0, leader: 0 };
const t0 = performance.now();
for (let m = 0; m < matches; m++) {
  const { home, away, date } = pairAt(squads, m);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const lH = autoLineupForFormationWithFitness(home, fH, date);
  const lA = autoLineupForFormationWithFitness(away, fA, date);
  let starters: Array<{ id: number; line: RatingLine }> | null = null;
  const r = simulateMatch(home, away, fH, fA, lH, lA, {
    seed: (seed + m) >>> 0, tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    ...(legacyClock ? { clockScale: LEGACY_CLOCK_SCALE } : {}),
    onTick: s => { if (!starters) starters = s.players.map(p => ({ id: p.id, line: lineOfRole(getMainRole(p.role)) })); },
  });
  momentum.points += r.teamStats.A.momentumPoints + r.teamStats.B.momentumPoints;
  momentum.shots += r.teamStats.A.momentumShotPoints + r.teamStats.B.momentumShotPoints;
  momentum.leader += Math.max(r.teamStats.A.momentumPoints, r.teamStats.B.momentumPoints) / Math.max(1, r.teamStats.A.momentumPoints + r.teamStats.B.momentumPoints);
  const leg = getAllLegacyRatings();
  const tal = getAllRatingTallies();
  for (const p of (starters as Array<{ id: number; line: RatingLine }> | null) ?? []) if (tal[p.id]) rows.push({ line: p.line, legacy: leg[p.id] ?? 6, tally: tal[p.id]! });
  process.stdout.write(`\r${m + 1}/${matches} (${((performance.now() - t0) / 1000 / (m + 1)).toFixed(1)} s/match)`);
}
console.log("");
console.log(`Momentum per match (both teams): ${(momentum.points / matches).toFixed(0)} points, ${(momentum.shots / matches).toFixed(0)} from shots; the side with more has ${((100 * momentum.leader) / matches).toFixed(0)}% of them`);
if (out) writeFileSync(out, JSON.stringify(rows));
report(`Legacy weights (${legacyClock ? "legacy clock" : "90 min"})`, rows, r => r.legacy);
report("FM hooks (FM_RATING)", rows, r => ratingFromTally(r.tally));
tallyMeans(rows);
