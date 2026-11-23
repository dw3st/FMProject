/**
 * Variable pace of mode A (`MODE_A_PACE`, `src/Domain/match/liveModes.ts`): over full-engine matches, the real time a
 * whole match takes at 1× with the variable pace, next to the fixed pace (5400 / MODE_A_SPEED), and how the real time
 * splits by zone. Prints the SLOW / FAST scale that keeps the length at the fixed pace's.
 *
 *   bun scripts/pace-measure.ts [matches=20] [league=premier_league] [seed=1]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { MODE_A_SPEED } from "@/Domain/match/liveModes";
import { MODE_A_PACE, modeAPaceFactor, paceViewOf } from "@/Domain/match/livePace";
import { mulberry32 } from "@/Domain/rng";
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

const [N = "20", LEAGUE = "premier_league", SEED = "1"] = process.argv.slice(2);
Math.random = mulberry32(Number(SEED));
const rng = mulberry32(Number(SEED) + 99);
const dir = fileURLToPath(new URL(`../src/example_data/squads/${LEAGUE}/`, import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const squads = await Promise.all(files.map(async (f) => {
  const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
}));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
let ticks = 0, inv = 0, slowTicks = 0, fastTicks = 0;
for (let i = 0; i < Number(N); i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  let last = -1;
  simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => {
      if (!isLivePhase(s.matchPhase) && !s.setPiece) return;
      const f = modeAPaceFactor(paceViewOf(s));
      ticks++; inv += 1 / f;
      if (f < 0.7) slowTicks++; else if (f > 1.5) fastTicks++;
      last = s.matchTime;
    },
  });
  void last;
}
const meanInv = inv / ticks;
console.log(`ticks ${ticks}  mean 1/f ${meanInv.toFixed(3)}  (1 = same length as the fixed pace, ${(5400 / MODE_A_SPEED / 60).toFixed(1)} min)`);
console.log(`real minutes at 1x ~ ${(5400 / MODE_A_SPEED / 60 * meanInv).toFixed(1)}`);
console.log(`game time slow (f<0.7) ${(100 * slowTicks / ticks).toFixed(1)}%  fast (f>1.5) ${(100 * fastTicks / ticks).toFixed(1)}%`);
console.log(`real-time share slow ~ ${(100 * (slowTicks / MODE_A_PACE.SLOW) / (inv)).toFixed(0)}%`);
console.log(`scale both SLOW and FAST by ${meanInv.toFixed(3)} to keep the length`);
