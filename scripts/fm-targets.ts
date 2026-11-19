/**
 * FM27 target metrics next to ours (`.claude/rules/game-engine/fm-numbers.md`): seeded full-engine matches (mulberry32
 * per match), AI formations, balanced, fitness 88. Prints pass completion by FM band, loft and pressure, the holder
 * decision mix by third, time on ball, pressers, opponents near the holder, the team shape in and out of possession,
 * off-ball steps and hold times, shot distances, and the world volume.
 *
 *   bun scripts/fm-targets.ts [matches=120] [league=premier_league] [--chunks 3] [--seed 9000] [--out f.json]
 *
 * `DECISION_OVERRIDES='{"PASS_ERROR":false}'` turns a stage-4b mechanic off (flags in `DecisionConfig.ts`).
 */
import { writeFileSync } from "node:fs";
import type { FmWorkerOut } from "@/../scripts/fm-targets-worker";
import { BAND_LABELS, HOLDER_CATS, LINES, PRESSURE_LABELS, SHOT_LABELS, emptyFmTargets, median, mergeFmTargets, pct, type Outcome3 } from "@/lab/fmTargets";

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
let ms = 0;
for (const p of parts) { mergeFmTargets(fm, p.fm); for (const [k, v] of Object.entries(p.world)) world[k] = (world[k] ?? 0) + v; ms += p.ms; }
if (out) writeFileSync(out, JSON.stringify({ fm, world, ms }));

const n = fm.matches;
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const share = (o: Outcome3) => { const t = o[0] + o[1] + o[2]; return t ? `${f1(pct(o))}% (n ${t}, opp ${f1((100 * o[2]) / t)}%)` : "—"; };
console.log(`\n${league}: ${n} matches, ${f1(ms / n)} ms/match, ${f1(fm.realSeconds / n)} live s/match`);
console.log("\n── Passes to the intended receiver (FM target) ──");
const FM_BAND = ["94", "92", "90", "85", "87", "79", "36", "21", "29"];
BAND_LABELS.forEach((l, i) => console.log(`  ${l.padEnd(6)} m  ${share(fm.passBand[i]!).padEnd(34)} FM ${FM_BAND[i]}%`));
BAND_LABELS.forEach((l, i) => console.log(`  regular ${l.padEnd(6)} m  ${share(fm.passBandRegular[i]!)}`));
for (const [k, v] of Object.entries(fm.passKind)) console.log(`  kind ${k.padEnd(10)} ${share(v)}`);
console.log(`  overall   ${share(fm.passAll).padEnd(34)} FM 82% (opp 13.5%)`);
console.log(`  ground    ${share(fm.passLoft.ground).padEnd(34)} FM 92%`);
console.log(`  lofted    ${share(fm.passLoft.lofted).padEnd(34)} FM 31%`);
const FM_PR = ["74*", "91", "85", "79", "67"];
PRESSURE_LABELS.forEach((l, i) => console.log(`  pr ${l.padEnd(6)} ${share(fm.passPressure[i]!).padEnd(34)} FM ${FM_PR[i]}%`));
const passesPerMatch = (fm.passAll[0] + fm.passAll[1] + fm.passAll[2]) / n;
console.log(`  passes / match ${f1(passesPerMatch)} (${f2(passesPerMatch / (fm.realSeconds / n))} per live s; FM ~0.21)`);

console.log("\n── Holder decisions ──");
const mix = (r: Record<string, number>) => { const t = HOLDER_CATS.reduce((a, k) => a + r[k]!, 0) || 1; return HOLDER_CATS.map(k => `${k} ${f1((100 * r[k]!) / t)}`).join(" · "); };
console.log(`  all     ${mix(fm.holderCat)}   FM carry 44 · pass 34 · turn 12 · hold 9 · kick 1`);
console.log(`  own     ${mix(fm.holderCatByThird[0]!)}   FM carry 26 · pass 37 · turn 23 · hold 14`);
console.log(`  middle  ${mix(fm.holderCatByThird[1]!)}   FM carry 50 · pass 33 · turn 10 · hold 7`);
console.log(`  final   ${mix(fm.holderCatByThird[2]!)}   FM carry 51 · pass 32 · turn 7 · hold 6 · kick 4`);
console.log(`  decisions / live s ${f2(fm.holderDecisions / fm.realSeconds)} (FM 0.65)  per possession ${f2(fm.possessionDecisions / Math.max(1, fm.possessions))} (FM 2.5–3)`);
{
  const h = fm.possessionHist; const tot = h.reduce((a, b) => a + b, 0);
  const q = (p: number) => { let c = 0; for (let i = 0; i < h.length; i++) { c += h[i]!; if (c >= p * tot) return i * 0.2; } return h.length * 0.2; };
  console.log(`  time on ball median ${f1(q(0.5))} s · p90 ${f1(q(0.9))} s   FM 0.7–1.0 · p90 2–3.4`);
}
console.log("\n── Pressing ──");
const ps = fm.pressSamples || 1;
console.log(`  dedicated pressers (target ≤ 3 m): 0 ${f1((100 * fm.pressers[0]) / ps)}% · 1 ${f1((100 * fm.pressers[1]) / ps)}% · 2+ ${f1((100 * fm.pressers[2]) / ps)}%   FM 75 · 20 · 5`);
const nb = fm.nearByThird.map(t => f2(t.sum / Math.max(1, t.n)));
console.log(`  opponents ≤ 10 m of the holder by his third: own ${nb[0]} · middle ${nb[1]} · final ${nb[2]}   FM 0.85 · 1.8 · 3.1`);
console.log("\n── Shape (yd) ──");
const FM_SHAPE = [[58, 39, 40, 19, 10, 87], [24, 35, 37, 14, 12.5, 50]];
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
console.log("  " + Object.entries(world).map(([k, v]) => `${k} ${f2(v / n)}`).join(" · "));
