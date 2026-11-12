/**
 * Corners in a row (tester report, 10.7; `set-pieces-play.md`): how often a team takes several corners back to back,
 * corners by source, and the match volume next to it. Full engine, 4-3-3, balanced, fitness 88, seeded `Math.random`.
 *
 *   bun scripts/corner-streak-probe.ts [matches=200] [league=premier_league] [seed=1]
 *   SETPIECE_OVERRIDES='{"CORNER_REPEAT_MULT":0.45}' bun scripts/corner-streak-probe.ts ...
 *
 * A corner continues a run when the same team got the previous one at most `RUN_GAP` game-seconds before.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { SET_PIECE_CONFIG } from "@/GameEngine/Configs/SetPieceConfig";
import { matchMinute } from "@/GameEngine/Domain/gameState";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

const RUN_GAP = 75;

const [N = "200", LEAGUE = "premier_league", SEED = "1"] = process.argv.slice(2);
if (process.env.SETPIECE_OVERRIDES) Object.assign(SET_PIECE_CONFIG as Record<string, unknown>, JSON.parse(process.env.SETPIECE_OVERRIDES));
Math.random = mulberry32(Number(SEED));
const rng = mulberry32(Number(SEED) + 99);
const dir = fileURLToPath(new URL(`../src/example_data/squads/${LEAGUE}/`, import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const squads = await Promise.all(files.map(async (f) => {
  const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
}));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

const n = Number(N);
let goals = 0, shots = 0, corners = 0, headerGoals = 0, setPieceGoals = 0, crosses = 0, crossesOk = 0, duels = 0, passes = 0;
const bySource = new Map<string, number>();
/** runs[k] = runs of exactly k corners; longest[k] = matches whose longest run was k. */
const runs = new Map<number, number>();
const longest = new Map<number, number>();
const bump = (m: Map<number, number> | Map<string, number>, k: never) => (m as Map<unknown, number>).set(k, ((m as Map<unknown, number>).get(k) ?? 0) + 1);

/** Game-seconds since kickoff of the match in progress (a continuous clock across the periods). */
let clock = 0;
let pending: { team: string; source: string }[] = [];
gameBus.on("cornerAwarded", (e) => { pending.push({ team: e.team, source: e.source }); });

for (let i = 0; i < n; i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  let run = 0, runTeam = "", lastAt = -1e9, best = 0;
  const close = () => { if (run > 0) { bump(runs, run as never); best = Math.max(best, run); } run = 0; };
  pending = [];
  const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => {
      clock = matchMinute(s) * 60 + (s.matchTime % 60);
      for (const c of pending) {
        bump(bySource, c.source as never);
        if (c.team === runTeam && clock - lastAt <= RUN_GAP) run++;
        else { close(); run = 1; runTeam = c.team; }
        lastAt = clock;
      }
      pending = [];
    },
  });
  close();
  bump(longest, best as never);
  goals += m.score.A + m.score.B;
  shots += m.teamStats.A.shots + m.teamStats.B.shots;
  corners += m.teamStats.A.corners + m.teamStats.B.corners;
  headerGoals += m.teamStats.A.headerGoals + m.teamStats.B.headerGoals;
  setPieceGoals += m.teamStats.A.setPieceGoals + m.teamStats.B.setPieceGoals;
  crosses += m.teamStats.A.crosses + m.teamStats.B.crosses;
  crossesOk += m.teamStats.A.crossesCompleted + m.teamStats.B.crossesCompleted;
  duels += m.teamStats.A.aerialDuels;
  passes += m.teamStats.A.passesAttempted + m.teamStats.B.passesAttempted;
}

const per = (v: number) => (v / n).toFixed(3);
console.log(`${LEAGUE} n=${n} repeat×${SET_PIECE_CONFIG.CORNER_REPEAT_MULT} clear ${SET_PIECE_CONFIG.CROSS_CLEAR_CORNER_CHANCE}`);
console.log(`goals ${per(goals)}  shots ${per(shots)}  corners ${per(corners)}  header goals ${per(headerGoals)}  set-piece goals ${per(setPieceGoals)}`);
console.log(`crosses ${per(crosses)} (completed ${per(crossesOk)})  aerial duels ${per(duels)}  passes ${per(passes)}`);
console.log(`by source: ${[...bySource].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${per(v)}`).join("  ")}`);
const keys = (m: Map<number, number>) => [...m.keys()].sort((a, b) => a - b);
console.log(`runs of k corners per match: ${keys(runs).map((k) => `${k}:${per(runs.get(k)!)}`).join("  ")}`);
const atLeast = (k: number) => [...longest].filter(([len]) => len >= k).reduce((s, [, v]) => s + v, 0);
console.log(`matches with a run of 3+ ${((100 * atLeast(3)) / n).toFixed(1)}%  4+ ${((100 * atLeast(4)) / n).toFixed(1)}%  5+ ${((100 * atLeast(5)) / n).toFixed(1)}%  longest seen ${Math.max(...longest.keys())}`);
