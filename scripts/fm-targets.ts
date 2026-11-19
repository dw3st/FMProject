/**
 * FM27 target metrics next to ours (`.claude/rules/game-engine/fm-numbers.md`): seeded full-engine matches (mulberry32
 * per match, `simulateMatch(..., { seed })`), AI formations, balanced, fitness 88. Prints the FM volume targets (R9:
 * shots, corners, passes, fouls… per match, both teams) next to ours, the condition by minute, pass completion by FM band, loft and pressure, the holder
 * decision mix by third, time on ball, pressers, opponents near the holder, the team shape in and out of possession,
 * off-ball steps and hold times, shot distances, and the world volume.
 *
 *   bun scripts/fm-targets.ts [matches=120] [league=premier_league] [--chunks 3] [--seed 9000] [--out f.json]
 *
 * `DECISION_OVERRIDES='{"PASS_ERROR":false}'` turns a stage-4b mechanic off (flags in `DecisionConfig.ts`).
 */
import { writeFileSync } from "node:fs";
import type { FmWorkerOut } from "@/../scripts/fm-targets-worker";
import {
  BALL_GROUPS, BAND_LABELS, CONDITION_MINUTES, FM_BALL, FM_CONDITION, FM_COUNT_KEYS, FM_HOLDER_MIX, FM_KEEPER_END, FM_NEAR_HOLDER, FM_PASS_BAND,
  FM_PASS_OVERALL, FM_PASS_PRESSURE, FM_PRESSERS, FM_SHAPE, FM_TIMING, HOLDER_CATS, LINES, PRESSURE_LABELS, SHOT_LABELS,
  FLIGHT_LABELS, FM_FLIGHT_S, FM_LANDING, FM_LAUNCH, FM_PASS_VZ, LANDING_GROUPS, LAUNCH_LABELS, VZ_LABELS,
  emptyFmTargets, fmTargetRows, longShotsOf, median, mergeFmTargets, pct, perMatchCounts, type FmMatchCounts, type Outcome3,
} from "@/lab/fmTargets";

const args = process.argv.slice(2);
const flag = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
const matches = Number(positional[0] ?? "120");
const league = positional[1] ?? "premier_league";
const chunks = Number(flag("--chunks", "3"));
const seed = Number(flag("--seed", "9000"));
const out = flag("--out", "");

const WORKER = new URL("./fm-targets-worker.ts", import.meta.url).href;
const per = Math.ceil(matches / chunks);
const parts = await Promise.all(Array.from({ length: chunks }, (_, c) => new Promise<FmWorkerOut>((resolve, reject) => {
  const w = new Worker(WORKER, { type: "module" });
  w.onmessage = (e: MessageEvent<FmWorkerOut>) => { w.terminate(); resolve(e.data); };
  w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
  w.postMessage({ league, matches: Math.max(0, Math.min(per, matches - c * per)), offset: c * per, seed });
})));
const fm = emptyFmTargets();
const world: Record<string, number> = {};
const counts = Object.fromEntries(FM_COUNT_KEYS.map(k => [k, 0])) as unknown as FmMatchCounts;
let ms = 0;
for (const p of parts) {
  mergeFmTargets(fm, p.fm);
  for (const [k, v] of Object.entries(p.world)) world[k] = (world[k] ?? 0) + v;
  for (const k of FM_COUNT_KEYS) counts[k] += p.counts[k];
  ms += p.ms;
}
if (out) writeFileSync(out, JSON.stringify({ fm, world, counts, ms }));

const n = fm.matches;
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const share = (o: Outcome3) => { const t = o[0] + o[1] + o[2]; return t ? `${f1(pct(o))}% (n ${t}, opp ${f1((100 * o[2]) / t)}%)` : "—"; };
console.log(`\n${league}: ${n} matches, ${f1(ms / n)} ms/match, ${f1(fm.realSeconds / n)} live s/match`);
console.log("\n── FM targets per match, both teams (ours × FM; R9 official stats) ──");
for (const r of fmTargetRows({ ...perMatchCounts(counts, n), longShots: longShotsOf(fm) / n })) {
  const ratio = r.ratio === null ? "" : `  ×${r.ratio.toFixed(2)}`;
  console.log(`  ${r.target.label.padEnd(24)} ${r.ours.padStart(8)}   FM ${r.fm.padStart(7)} (${r.target.confidence})${ratio}`);
}
console.log("\n── Condition (outfield median energy) by minute ──");
console.log("  " + CONDITION_MINUTES.map((m, i) => `${m}' ${f1(fm.condition[i]!.sum / Math.max(1, fm.condition[i]!.n))} (FM ${FM_CONDITION[i]})`).join(" · "));
console.log(`  keepers at the end ${f1(fm.keeperEnd.sum / Math.max(1, fm.keeperEnd.n))} (FM ${FM_KEEPER_END})`);
console.log("\n── The 3D ball (stage 3; R9 §3: median peak / contact height, m) ──");
for (const g of BALL_GROUPS) {
  const pk = fm.ballPeak?.[g] ?? [], ct = fm.ballContact?.[g] ?? [];
  console.log(`  ${g.padEnd(7)} n ${String(pk.length).padStart(5)}  peak ${f2(median(pk))} m (FM ${FM_BALL[g].peak})  contact ${f2(median(ct))} m (FM ${FM_BALL[g].contact})`);
}
console.log(`  ball in the air ${f1((fm.ballAirSeconds ?? 0) / Math.max(1, n))} s per match`);
console.log("\n── Passes to the intended receiver (FM target, R7) ──");
BAND_LABELS.forEach((l, i) => console.log(`  ${l.padEnd(6)} m  ${share(fm.passBand[i]!).padEnd(34)} FM ${FM_PASS_BAND[i]}%`));
BAND_LABELS.forEach((l, i) => console.log(`  regular ${l.padEnd(6)} m  ${share(fm.passBandRegular[i]!)}`));
for (const [k, v] of Object.entries(fm.passKind)) console.log(`  kind ${k.padEnd(10)} ${share(v)}`);
console.log(`  overall   ${share(fm.passAll).padEnd(34)} FM ${FM_PASS_OVERALL.all}% (opp 13.5%)`);
console.log(`  ground    ${share(fm.passLoft.ground).padEnd(34)} FM ${FM_PASS_OVERALL.ground}%`);
console.log(`  lofted    ${share(fm.passLoft.lofted).padEnd(34)} FM ${FM_PASS_OVERALL.lofted}%`);
PRESSURE_LABELS.forEach((l, i) => console.log(`  pr ${l.padEnd(6)} ${share(fm.passPressure[i]!).padEnd(34)} FM ${FM_PASS_PRESSURE[i]}%${i === 0 ? "*" : ""}`));
const passesPerMatch = (fm.passAll[0] + fm.passAll[1] + fm.passAll[2]) / n;
console.log(`  passes / match ${f1(passesPerMatch)} (${f2(passesPerMatch / (fm.realSeconds / n))} per live s; FM ~0.21)`);

console.log("\n── The physical pass (stage 4; R6 launch, R7 flight and vz bands, R9 §3 landing) ──");
const pctl = (a: number[], q: number) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]!; };
LAUNCH_LABELS.forEach((l, i) => console.log(`  launch ${l.padEnd(6)} m  n ${String(fm.launchSpeed?.[i]?.length ?? 0).padStart(5)}  |v| ${f1(median(fm.launchSpeed?.[i] ?? []))} m/s (FM ${FM_LAUNCH.speed[i]})  vz ${f2(median(fm.launchVz?.[i] ?? []))} (FM ${FM_LAUNCH.vz[i]})`));
VZ_LABELS.forEach((l, i) => console.log(`  vz ${l.padEnd(5)} m/s  ${share(fm.passVz?.[i] ?? [0, 0, 0]).padEnd(34)} FM ${FM_PASS_VZ[i]}%`));
FLIGHT_LABELS.forEach((l, i) => console.log(`  flight ${l.padEnd(6)} m  n ${String(fm.flight?.[i]?.length ?? 0).padStart(5)}  ${f2(median(fm.flight?.[i] ?? []))} s (FM ~${FM_FLIGHT_S[i]})`));
for (const g of LANDING_GROUPS) {
  const a = fm.landingErr?.[g] ?? [];
  console.log(`  landing vs aim ${g.padEnd(7)} n ${String(a.length).padStart(5)}  median ${f1(median(a))} m, p90 ${f1(pctl(a, 0.9))} (FM ${FM_LANDING[g][0]}, ${FM_LANDING[g][1]})`);
}

console.log("\n── Holder decisions ──");
const mix = (r: Record<string, number>) => { const t = HOLDER_CATS.reduce((a, k) => a + r[k]!, 0) || 1; return HOLDER_CATS.map(k => `${k} ${f1((100 * r[k]!) / t)}`).join(" · "); };
const fmMix = (r: Partial<Record<string, number>>) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(" · ");
console.log(`  all     ${mix(fm.holderCat)}   FM ${fmMix(FM_HOLDER_MIX.all)}`);
console.log(`  own     ${mix(fm.holderCatByThird[0]!)}   FM ${fmMix(FM_HOLDER_MIX.own)}`);
console.log(`  middle  ${mix(fm.holderCatByThird[1]!)}   FM ${fmMix(FM_HOLDER_MIX.middle)}`);
console.log(`  final   ${mix(fm.holderCatByThird[2]!)}   FM ${fmMix(FM_HOLDER_MIX.final)}`);
console.log(`  decisions / live s ${f2(fm.holderDecisions / fm.realSeconds)} (FM ${FM_TIMING.perSecond})  per possession ${f2(fm.possessionDecisions / Math.max(1, fm.possessions))} (FM ${FM_TIMING.perPossession})`);
{
  const h = fm.possessionHist; const tot = h.reduce((a, b) => a + b, 0);
  const q = (p: number) => { let c = 0; for (let i = 0; i < h.length; i++) { c += h[i]!; if (c >= p * tot) return i * 0.2; } return h.length * 0.2; };
  console.log(`  time on ball median ${f1(q(0.5))} s · p90 ${f1(q(0.9))} s   FM ${FM_TIMING.onBallMedian} · p90 ${FM_TIMING.onBallP90}`);
}
console.log("\n── Pressing ──");
const ps = fm.pressSamples || 1;
console.log(`  dedicated pressers (target ≤ 3 m): 0 ${f1((100 * fm.pressers[0]) / ps)}% · 1 ${f1((100 * fm.pressers[1]) / ps)}% · 2+ ${f1((100 * fm.pressers[2]) / ps)}%   FM ${FM_PRESSERS.join(" · ")}`);
const nb = fm.nearByThird.map(t => f2(t.sum / Math.max(1, t.n)));
console.log(`  opponents ≤ 10 m of the holder by his third: own ${nb[0]} · middle ${nb[1]} · final ${nb[2]}   FM ${FM_NEAR_HOLDER.join(" · ")}`);
console.log("\n── Shape (yd) ──");
fm.shape.forEach((sh, i) => {
  const k = Math.max(1, sh.n); const fmr = FM_SHAPE[i]!;
  console.log(`  ${i === 0 ? "in poss " : "out poss"}  back ${f1(sh.back / k)} (FM ${fmr[0]}) · length ${f1(sh.length / k)} (${fmr[1]}) · width ${f1(sh.width / k)} (${fmr[2]}) · back→mid ${f1(sh.gapBM / k)} (${fmr[3]}) · mid→front ${f1(sh.gapMF / k)} (${fmr[4]}) · front ${f1(sh.front / k)} (${fmr[5]})`);
});
console.log("\n── Off-ball ──");
for (const l of LINES) {
  const s = fm.step[l];
  console.log(`  ${l.padEnd(3)}  step in ${f1(s[0]!.sum / Math.max(1, s[0]!.n))} · out ${f1(s[1]!.sum / Math.max(1, s[1]!.n))} yd   hold default ${f1(median(fm.holdDefault[l]))} s · short ${f1(median(fm.holdShort[l]))} s`);
}
console.log("  FM step DEF 4.4 · MID 6 · FWD 7 yd (target − position: in 9.8/7.7/9.8, out 5.5/7.7/10.9); hold default DEF 19 · MID 10 · FWD 12 s, short ~5 s");
console.log("\n── Shots (distance to the goal mouth, yd) ──");
console.log("  " + SHOT_LABELS.map((l, i) => `${l} ${f1((100 * fm.shotDist[i]!) / Math.max(1, fm.shots))}%`).join(" · ") + "   FM: none beyond ~33 yd");
console.log("\n── World / match ──");
console.log("  " + Object.entries(world).filter(([k]) => !k.startsWith("ball")).map(([k, v]) => `${k} ${f2(v / n)}`).join(" · "));
// Ball crowding (`ball-cluster.ts`'s measure): 3+ outfield defenders within 8 yd of the ball, share of defending ticks.
if (world.ballNearTicks) console.log(`  crowd 3+ defenders ≤ 8 yd: ${(100 * world.ballCrowdTicks! / world.ballNearTicks).toFixed(1)}% of live ticks (main ~5.4–5.8%)`);
