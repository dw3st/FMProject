/**
 * Stage 18 (`.claude/rules/game-engine/highlights.md`): lances per match and the time each level covers, on seeded
 * full-engine matches (AI formations, balanced, fitness 88). Runs on the 90-minute physics (the default since stage 2).
 *
 *   bun scripts/highlights-measure.ts [matches=20] [league=premier_league] [--seed 9000] [--out f.json]
 */
import { writeFileSync } from "node:fs";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { HIGHLIGHT_LEVELS, summarizeHighlights, type Highlight } from "@/GameEngine/Domain/Highlights";
const FULL_DURATION = true; // stage 2: the 90 physical minutes are the default

const args = process.argv.slice(2);
const flag = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
const matches = Number(positional[0] ?? "20");
const league = positional[1] ?? "premier_league";
const seed = Number(flag("--seed", "9000"));
const out = flag("--out", "");

const squads = loadLeagueAt88(league);
const per = Object.fromEntries(HIGHLIGHT_LEVELS.map(l => [l, { count: 0, seconds: 0, share: 0, durations: [] as number[] }]));
const kinds: Record<string, number> = {};
let live = 0, ms = 0, goals = 0, goalsInMain = 0;
const all: Highlight[][] = [];
for (let m = 0; m < matches; m++) {
  const { home, away, date } = pairAt(squads, m);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const lH = autoLineupForFormationWithFitness(home, fH, date);
  const lA = autoLineupForFormationWithFitness(away, fA, date);
  const r = simulateMatch(home, away, fH, fA, lH, lA, { seed: (seed + m) >>> 0, tactics: { A: { style: "balanced" }, B: { style: "balanced" } } });
  ms += r.durationMs;
  live += r.liveSeconds;
  all.push(r.highlights);
  const sum = summarizeHighlights(r.highlights, r.liveSeconds);
  for (const l of HIGHLIGHT_LEVELS) {
    per[l]!.count += sum[l].count; per[l]!.seconds += sum[l].seconds; per[l]!.share += sum[l].share;
  }
  for (const h of r.highlights) {
    kinds[`${h.level}:${h.kind}`] = (kinds[`${h.level}:${h.kind}`] ?? 0) + 1;
    for (const l of HIGHLIGHT_LEVELS) if (HIGHLIGHT_LEVELS.indexOf(h.level) <= HIGHLIGHT_LEVELS.indexOf(l)) per[l]!.durations.push(h.end - h.start);
  }
  goals += r.score.A + r.score.B;
  goalsInMain += r.highlights.filter(h => h.triggers.includes("goal")).reduce((a, h) => a + h.triggers.filter(t => t === "goal").length, 0);
  process.stdout.write(`.`);
}
const f1 = (x: number) => x.toFixed(1);
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
console.log(`\n${league}, ${matches} matches, FULL_DURATION=${FULL_DURATION ? 1 : 0}, ${f1(ms / matches)} ms/match, ${f1(live / matches)} live sim s/match`);
for (const l of HIGHLIGHT_LEVELS) {
  const p = per[l]!;
  console.log(`  ${l.padEnd(9)} ${f1(p.count / matches).padStart(6)} lances  ${f1(p.seconds / matches).padStart(7)} s (${f1(p.seconds / matches / 60)} min real at 1×)  ${f1((100 * p.share) / matches)}% of the play  median ${f1(med(p.durations))} s`);
}
console.log(`  goals ${goals} · goal triggers inside lances ${goalsInMain}`);
console.log("  by kind: " + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f1(v / matches)}`).join(" · "));
if (out) writeFileSync(out, JSON.stringify({ league, matches, fullDuration: FULL_DURATION, per, kinds, live, all }));
