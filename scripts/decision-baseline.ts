/**
 * Decision telemetry baseline (`.claude/rules/game-engine/decisions.md`): seeded full-engine matches (mulberry32 per
 * match), AI formations, balanced style, fitness 88, with the decision events listening. Prints the action mix per
 * family, the entropy per situation bucket, the near-tie share, the holder pressure (p10/50/90) at decisions and at
 * shots, goals and shots, and the time per match.
 *
 *   bun scripts/decision-baseline.ts [matches=200] [league=premier_league] [--chunks 4] [--seed 9000] [--off] [--out f.json]
 *
 * `--off` runs the same matches with the telemetry listeners off (cost comparison: nothing else differs).
 */
import { writeFileSync } from "node:fs";
import type { BaselineTotals, FamilyTally } from "@/../scripts/decision-baseline-worker";
import { HIST_BIN, HIST_BINS } from "@/../scripts/decision-baseline-worker";
import { bucketName, entropyBits } from "@/GameEngine/Domain/DecisionTelemetry";

const args = process.argv.slice(2);
const flag = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--") && args[i - 1] !== "--off"));
const matches = Number(positional[0] ?? "200");
const league = positional[1] ?? "premier_league";
const chunks = Number(flag("--chunks", "4"));
const seed = Number(flag("--seed", "9000"));
const off = args.includes("--off");
const out = flag("--out", "");

const WORKER = new URL("./decision-baseline-worker.ts", import.meta.url).href;
const per = Math.ceil(matches / chunks);
const parts = await Promise.all(Array.from({ length: chunks }, (_, c) => new Promise<BaselineTotals>((resolve, reject) => {
  const w = new Worker(WORKER, { type: "module" });
  w.onmessage = (e: MessageEvent<BaselineTotals>) => { w.terminate(); resolve(e.data); };
  w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
  w.postMessage({ league, matches: Math.max(0, Math.min(per, matches - c * per)), offset: c * per, seed, off });
})));

function mergeFamily(a: FamilyTally, b: FamilyTally): FamilyTally {
  const mix = { ...a.mix };
  for (const [k, v] of Object.entries(b.mix)) mix[k] = (mix[k] ?? 0) + v;
  const buckets = a.buckets.map((cell, i) => {
    const c = { ...cell };
    for (const [k, v] of Object.entries(b.buckets[i] ?? {})) c[k] = (c[k] ?? 0) + v;
    return c;
  });
  return { n: a.n + b.n, nearTies: a.nearTies + b.nearTies, offArgmax: a.offArgmax + b.offArgmax, mix, buckets };
}
const tot = parts.reduce((a, b) => ({
  n: a.n + b.n, goals: a.goals + b.goals, shots: a.shots + b.shots, ms: a.ms + b.ms,
  families: {
    holder: mergeFamily(a.families.holder, b.families.holder),
    offBall: mergeFamily(a.families.offBall, b.families.offBall),
    defense: mergeFamily(a.families.defense, b.families.defense),
  },
  holderHist: a.holderHist.map((v, i) => v + b.holderHist[i]!),
  shotHist: a.shotHist.map((v, i) => v + b.shotHist[i]!),
  statEntropy: {
    holder: a.statEntropy.holder + b.statEntropy.holder,
    offBall: a.statEntropy.offBall + b.statEntropy.offBall,
    defense: a.statEntropy.defense + b.statEntropy.defense,
  },
  teams: a.teams + b.teams,
}));
if (out) writeFileSync(out, JSON.stringify({ league, seed, off, ...tot }));

const pct = (h: number[], q: number) => {
  const n = h.reduce((a, b) => a + b, 0);
  if (n === 0) return NaN;
  let acc = 0;
  for (let i = 0; i < h.length; i++) { acc += h[i]!; if (acc >= q * n) return i === HIST_BINS ? Infinity : (i + 0.5) * HIST_BIN; }
  return NaN;
};
const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

console.log(`${league}  matches ${tot.n}  seed ${seed}${off ? "  (telemetry OFF)" : ""}`);
console.log(`goals/match ${fmt(tot.goals / tot.n, 3)}  shots/match ${fmt(tot.shots / tot.n, 2)}  ms/match ${fmt(tot.ms / tot.n, 1)}`);
if (!off) {
  for (const fam of ["holder", "offBall", "defense"] as const) {
    const f = tot.families[fam];
    console.log(`\n── ${fam}: ${fmt(f.n / tot.n, 1)} decisions/match  near-ties ${fmt((100 * f.nearTies) / f.n, 1)}%  off-argmax ${fmt((100 * f.offArgmax) / f.n, 2)}%`
      + `  entropy (Statistics, per team-match) ${fmt(tot.statEntropy[fam] / tot.teams, 3)} bits`);
    const mix = Object.entries(f.mix).sort((a, b) => b[1] - a[1]);
    console.log("  mix  " + mix.map(([k, v]) => `${k} ${fmt((100 * v) / f.n, 1)}%`).join(" · "));
    let wEnt = 0;
    for (let b = 0; b < 12; b++) {
      const cell = f.buckets[b]!;
      const n = Object.values(cell).reduce((a, c) => a + c, 0);
      if (n === 0) continue;
      const h = entropyBits(Object.values(cell));
      wEnt += h * n;
      const top = Object.entries(cell).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${fmt((100 * v) / n, 0)}%`).join(", ");
      console.log(`  ${String(b).padStart(2)} ${bucketName(b).padEnd(20)} share ${fmt((100 * n) / f.n, 1).padStart(5)}%  H ${fmt(h, 3)}  ${top}`);
    }
    console.log(`  pooled entropy (weighted by bucket) ${fmt(wEnt / f.n, 3)} bits`);
  }
  console.log(`\nholder pressure at decisions p10/p50/p90  ${fmt(pct(tot.holderHist, 0.1))} / ${fmt(pct(tot.holderHist, 0.5))} / ${fmt(pct(tot.holderHist, 0.9))}`
    + `   share <0.5: ${fmt((100 * tot.holderHist[0]!) / tot.holderHist.reduce((a, b) => a + b, 0), 1)}%`);
  console.log(`holder pressure at shots      p10/p50/p90  ${fmt(pct(tot.shotHist, 0.1))} / ${fmt(pct(tot.shotHist, 0.5))} / ${fmt(pct(tot.shotHist, 0.9))}`
    + `   (${tot.shotHist.reduce((a, b) => a + b, 0)} shots with a decision)`);
}
process.exit(0);
