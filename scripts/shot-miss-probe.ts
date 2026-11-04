/**
 * Shots off target by distance and by whether the keeper can reach the shot line (`keeper.md`).
 * Full engine, AI-less 4-3-3, balanced, fitness 88, seeded `Math.random`.
 *
 *   bun scripts/shot-miss-probe.ts [matches=200] [league=premier_league] [seed=1]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { GOAL_Y_MAX, GOAL_Y_MIN } from "@/GameEngine/Domain/pitch";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { keeperReachesShot } from "@/GameEngine/Domain/Keeper";
import { SHOT_AIM } from "@/GameEngine/Infrastructure/ActionOutcomes";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

const [N = "200", LEAGUE = "premier_league", SEED = "1"] = process.argv.slice(2);
if (process.env.SHOT_CONVERSION) SHOT_AIM.CONVERSION = Number(process.env.SHOT_CONVERSION);
Math.random = mulberry32(Number(SEED));
const rng = mulberry32(Number(SEED) + 99);
const dir = fileURLToPath(new URL(`../src/example_data/squads/${LEAGUE}/`, import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const squads = await Promise.all(files.map(async (f) => {
  const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
}));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

interface Row { shots: number; off: number; goals: number }
const table = new Map<string, Row>();
const add = (k: string, off: boolean) => {
  const r = table.get(k) ?? { shots: 0, off: 0, goals: 0 };
  r.shots++; if (off) r.off++;
  table.set(k, r);
};
const band = (d: number) => (d <= 6 ? "00-06" : d <= 10 ? "06-10" : d <= 14 ? "10-14" : d <= 18 ? "14-18" : d <= 25 ? "18-25" : "25+");

let goals = 0;
let shots = 0;
let throwIns = 0;
let corners = 0;
for (let i = 0; i < Number(N); i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  let last: unknown = null;
  const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => {
      if (!s.shot || s.shot === last || s.shot.t > 0 || s.shot.freeKick) { if (s.shot) last = s.shot; return; }
      last = s.shot;
      const shooter = s.players.find((p) => p.id === s.shot!.shooterId)!;
      const gk = s.players.find((p) => p.team !== shooter.team && p.role === "GK") ?? null;
      const dist = Math.hypot(s.shot.toX - s.shot.fromX, 37 - s.shot.fromY);
      const off = s.shot.toY < GOAL_Y_MIN || s.shot.toY > GOAL_Y_MAX;
      const reach = gk ? keeperReachesShot(gk, s.shot.fromX, s.shot.fromY, s.shot.toX) : false;
      add(`${reach ? "keeper" : "EMPTY "} ${band(dist)}`, off);
      add(`${reach ? "keeper" : "EMPTY "} all`, off);
    },
  });
  goals += m.score.A + m.score.B;
  shots += m.teamStats.A.shots + m.teamStats.B.shots;
  throwIns += m.teamStats.A.throwIns + m.teamStats.B.throwIns;
  corners += m.teamStats.A.corners + m.teamStats.B.corners;
}
console.log(`${LEAGUE} n=${N} goals/match ${(goals / Number(N)).toFixed(3)} shots/match ${(shots / Number(N)).toFixed(2)} throw-ins/match ${(throwIns / Number(N)).toFixed(2)} corners/match ${(corners / Number(N)).toFixed(2)}`);
for (const k of [...table.keys()].sort()) {
  const r = table.get(k)!;
  console.log(`${k.padEnd(14)} shots/match ${(r.shots / Number(N)).toFixed(2).padStart(5)}  off target ${((100 * r.off) / r.shots).toFixed(0).padStart(3)}%`);
}
