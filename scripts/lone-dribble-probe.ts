/**
 * Dribbles of a holder with no support (tester report, 10.7): how often they happen, how often they are won, and
 * the match volume next to it. Full engine, 4-3-3, balanced, fitness 88, seeded `Math.random`.
 *
 *   bun scripts/lone-dribble-probe.ts [matches=200] [league=premier_league] [seed=1]
 *   LONE_DRIBBLE_OVERRIDES='{"ENABLED":false}' bun scripts/lone-dribble-probe.ts ...
 *
 * Situation of a dribble = the holder's surroundings when it was resolved: `alone` = no outfield teammate within
 * `SUPPORT_RADIUS`; `crowd` = opponents (not recovering) within `CROWD_RADIUS`.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { LONE_DRIBBLE } from "@/GameEngine/Configs/CarryConfig";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { GameState } from "@/GameEngine/types";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

const [N = "200", LEAGUE = "premier_league", SEED = "1"] = process.argv.slice(2);
if (process.env.LONE_DRIBBLE_OVERRIDES) Object.assign(LONE_DRIBBLE as Record<string, unknown>, JSON.parse(process.env.LONE_DRIBBLE_OVERRIDES));
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

interface Row { tries: number; won: number; skilled: number }
const table = new Map<string, Row>();
let last: GameState | null = null;
let pending: { player: number; success: boolean }[] = [];
gameBus.on("dribble", (e) => { pending.push({ player: e.player, success: e.success }); });

function situation(s: GameState, id: number): { key: string; skill: number } | null {
  const h = s.players.find((p) => p.id === id);
  if (!h) return null;
  const d = (p: { x: number; y: number }) => Math.hypot(p.x - h.x, p.y - h.y);
  const mates = s.players.filter((p) => p.team === h.team && p.id !== h.id && p.role !== "GK" && d(p) <= LONE_DRIBBLE.SUPPORT_RADIUS).length;
  const crowd = s.players.filter((p) => p.team !== h.team && p.role !== "GK" && p.recoveryTime <= 0 && d(p) <= LONE_DRIBBLE.CROWD_RADIUS).length;
  return { key: `${mates === 0 ? "alone  " : "support"} vs ${crowd >= 2 ? "2+" : "1 "}`, skill: h.runtimeStats.withBall.dribbling };
}

let goals = 0, shots = 0, passes = 0, tackles = 0, fouls = 0, dribbles = 0;
for (let i = 0; i < n; i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  pending = [];
  last = null;
  const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => {
      // The dribble was resolved inside this tick: the surroundings are those of the tick before.
      for (const e of pending) {
        const sit = situation(last ?? s, e.player);
        if (!sit) continue;
        const r = table.get(sit.key) ?? { tries: 0, won: 0, skilled: 0 };
        r.tries++;
        if (e.success) r.won++;
        if (sit.skill >= LONE_DRIBBLE.SKILL_FULL) r.skilled++;
        table.set(sit.key, r);
        dribbles++;
      }
      pending = [];
      last = s;
    },
  });
  goals += m.score.A + m.score.B;
  for (const t of [m.teamStats.A, m.teamStats.B]) {
    shots += t.shots; passes += t.passesAttempted; tackles += t.tackles; fouls += t.fouls;
  }
}
const per = (v: number) => (v / n).toFixed(3);
console.log(`${LEAGUE} n=${n} lone dribble ${JSON.stringify(LONE_DRIBBLE)}`);
console.log(`goals ${per(goals)}  shots ${per(shots)}  passes ${per(passes)}  tackles ${per(tackles)}  fouls ${per(fouls)}  dribbles ${per(dribbles)}`);
for (const k of [...table.keys()].sort()) {
  const r = table.get(k)!;
  console.log(`${k}  dribbles/match ${per(r.tries).padStart(6)}  won ${((100 * r.won) / r.tries).toFixed(0).padStart(3)}%  by a skilful dribbler ${((100 * r.skilled) / r.tries).toFixed(0).padStart(3)}%`);
}
