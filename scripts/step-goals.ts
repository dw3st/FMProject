// Goals per match by simulation step: `simulateMatch` at its default 0.2 real-s step vs the live match's 1/60
// (advanceSim). Same two clubs, formation, XIs. `bun scripts/step-goals.ts [matches=150] [home=33] [away=34] [dt list]`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import type { Squad } from "@/types/playerTypes";

const n = Number(process.argv[2] ?? 150);
const squad = (stem: string): Squad =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../src/Data/squads/premier_league/${stem}.json`, import.meta.url)), "utf8"));
const home = squad(process.argv[3] ?? "33");
const away = squad(process.argv[4] ?? "34");
const dts = (process.argv[5] ?? "0.2,0.0166667").split(",").map(Number);
const f = formationForSimId("4-3-3");
const la = autoLineupForFormation(home, f, "2026-08-15");
const lb = autoLineupForFormation(away, f, "2026-08-15");
for (const dt of dts) {
  let goals = 0, shots = 0, sq = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, f, f, la, lb, { simDt: dt });
    const g = r.score.A + r.score.B;
    goals += g; sq += g * g;
    shots += (r.teamStats.A.shots ?? 0) + (r.teamStats.B.shots ?? 0);
  }
  const mean = goals / n;
  const se = Math.sqrt((sq / n - mean * mean) / n);
  console.log(`dt ${dt.toFixed(4)}  goals ${mean.toFixed(2)} ± ${se.toFixed(2)}  shots ${(shots / n).toFixed(2)}  ${((performance.now() - t0) / n).toFixed(0)} ms/match`);
}
