// Diagnostic: every gameBus event count and every team stat per match, simulateMatch at two steps.
// `bun scripts/step-diag.ts [matches=60] [dt list=0.2,0.0166667]`. Prints the ratio (second / first).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { Squad } from "@/types/playerTypes";

const n = Number(process.argv[2] ?? 60);
const dts = (process.argv[3] ?? "0.2,0.0166667").split(",").map(Number);
const squad = (stem: string): Squad =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../src/Data/squads/premier_league/${stem}.json`, import.meta.url)), "utf8"));
const home = squad("33"), away = squad("34");
const f = formationForSimId("4-3-3");
const la = autoLineupForFormation(home, f, "2026-08-15");
const lb = autoLineupForFormation(away, f, "2026-08-15");

let counts: Record<string, number> = {};
const bus = gameBus as unknown as { emit: (e: string, p: unknown) => void };
const orig = bus.emit.bind(bus);
bus.emit = (e: string, p: unknown) => {
  if (e !== "stateChanged") {
    counts[e] = (counts[e] ?? 0) + 1;
    const q = p as Record<string, unknown> | null;
    if (q && typeof q === "object") {
      if (e === "tackle") counts[`tackle.success=${q.success}`] = (counts[`tackle.success=${q.success}`] ?? 0) + 1;
      if (e === "dribble") counts[`dribble.success=${q.success}`] = (counts[`dribble.success=${q.success}`] ?? 0) + 1;
      if (e === "shotResolved") counts["shot.xgSum"] = (counts["shot.xgSum"] ?? 0) + Number(q.xg ?? 0);
      if (e === "shotResolved" && q.isGoal) counts["shot.isGoal"] = (counts["shot.isGoal"] ?? 0) + 1;
      if (e === "goalScored") counts[`goal.setPiece=${q.setPiece ?? "none"}`] = (counts[`goal.setPiece=${q.setPiece ?? "none"}`] ?? 0) + 1;
      if (e === "shotResolved") counts["shot.chanceSum"] = (counts["shot.chanceSum"] ?? 0) + Number(q.goalChance ?? 0);
    }
  }
  orig(e, p);
};

const results: Record<string, number>[] = [];
for (const dt of dts) {
  const tot: Record<string, number> = {};
  counts = {};
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, f, f, la, lb, { simDt: dt });
    for (const side of ["A", "B"] as const) {
      for (const [k, v] of Object.entries(r.teamStats[side])) if (typeof v === "number") tot[`ts.${k}`] = (tot[`ts.${k}`] ?? 0) + v;
    }
  }
  for (const [k, v] of Object.entries(counts)) tot[`ev.${k}`] = v;
  for (const k of Object.keys(tot)) tot[k] = (tot[k] ?? 0) / n;
  results.push(tot);
}
const keys = [...new Set(results.flatMap((r) => Object.keys(r)))].sort();
const [a, b] = results;
const rows = keys.map((k) => ({ k, a: a?.[k] ?? 0, b: b?.[k] ?? 0 })).filter((r) => r.a + r.b > 0.05);
rows.sort((x, y) => Math.abs(Math.log((y.b + 0.01) / (y.a + 0.01))) - Math.abs(Math.log((x.b + 0.01) / (x.a + 0.01))));
for (const r of rows) console.log(`${r.k.padEnd(42)} ${r.a.toFixed(2).padStart(9)} ${r.b.toFixed(2).padStart(9)}  x${((r.b + 0.01) / (r.a + 0.01)).toFixed(2)}`);
