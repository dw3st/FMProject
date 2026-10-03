/**
 * Attacking width axis check (Etapa 19): goals, shots and crosses per match with both teams on
 * `narrow`, `normal` or `wide` (balanced style otherwise, 4-3-3, different real clubs, data
 * fitness). The engine isn't seeded — numbers move ±3–4% between runs of 200.
 *
 *   bun scripts/width-measure.ts [--matches 200] [--league premier_league]
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import type { TeamWidth } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const matches = Number(arg("--matches", "200"));
const league = arg("--league", "premier_league");

const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as Squad);
const f433 = formationForSimId("4-3-3");

console.log(`| Largura | jogos | gols/jogo | chutes/jogo | cruzamentos/jogo | entradas pelas pontas (% das posses no terço final) |`);
console.log(`|---|---|---|---|---|---|`);
for (const width of ["narrow", "normal", "wide"] as TeamWidth[]) {
  let goals = 0, shots = 0, crosses = 0, wideTicks = 0, finalTicks = 0;
  for (let k = 0; k < matches; k++) {
    const home = squads[k % squads.length]!;
    const away = squads[(k * 7 + 3) % squads.length]!;
    const r = simulateMatch(home, away, f433, f433, autoLineupForFormation(home, f433), autoLineupForFormation(away, f433), {
      tactics: { A: { style: "balanced", axesOverride: { width } }, B: { style: "balanced", axesOverride: { width } } },
      onTick: (s) => {
        if (s.pass || s.shot || s.looseBall || s.setPiece) return;
        const h = s.players.find((p) => p.id === s.ballHolderId);
        if (!h) return;
        const rel = h.attackDir === 1 ? h.x : 115 - h.x;
        if (rel < 115 * (2 / 3)) return;
        finalTicks++;
        if (h.y < 22 || h.y > 52) wideTicks++;
      },
    });
    goals += r.score.A + r.score.B;
    shots += r.teamStats.A.shots + r.teamStats.B.shots;
    crosses += r.teamStats.A.crosses + r.teamStats.B.crosses;
  }
  console.log(`| ${width} | ${matches} | ${(goals / matches).toFixed(2)} | ${(shots / matches).toFixed(2)} | ${(crosses / matches).toFixed(1)} | ${((100 * wideTicks) / Math.max(1, finalTicks)).toFixed(0)}% |`);
}
