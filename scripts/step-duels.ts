// Diagnostic: how tackles and dribbles happen at two steps. `bun scripts/step-duels.ts [matches] [dt list]`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { tackleAngleModifier } from "@/GameEngine/Domain/PositionalAwareness";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

const n = Number(process.argv[2] ?? 40);
const dts = (process.argv[3] ?? "0.2,0.0166667").split(",").map(Number);
const squad = (stem: string): Squad =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../src/Data/squads/premier_league/${stem}.json`, import.meta.url)), "utf8"));
const home = squad("33"), away = squad("34");
const f = formationForSimId("4-3-3");
const la = autoLineupForFormation(home, f, "2026-08-15");
const lb = autoLineupForFormation(away, f, "2026-08-15");

let pending: { e: string; q: Record<string, number | boolean> }[] = [];
function score(st: GameState) {
  for (const { e, q } of pending) {
    const atk = st.players.find((x) => x.id === (e === "tackle" ? q.targetId : q.player));
    const def = st.players.find((x) => x.id === (e === "tackle" ? q.player : q.targetId));
    add(e); if (q.success) add(`${e}.won`);
    add(`${e}.chance`, Number(q.chance));
    if (!atk || !def) continue;
    const m = tackleAngleModifier(def, atk);
    const a = m > 0.2 ? "front" : m > -0.2 ? "side" : "behind";
    add(`${e}.${a}`); if (q.success) add(`${e}.${a}.won`);
    add(`${e}.${a}.chance`, Number(q.chance));
    add(`${e}.dist`, Math.hypot(atk.x - def.x, atk.y - def.y));
    let near = 0;
    for (const o of st.players) if (o.team === def.team && o.id !== def.id && Math.hypot(o.x - atk.x, o.y - atk.y) < 8) near++;
    add(`${e}.nearDefs`, near);
  }
  pending = [];
}
let c: Record<string, number> = {};
const add = (k: string, v = 1) => { c[k] = (c[k] ?? 0) + v; };
const bus = gameBus as unknown as { emit: (e: string, p: unknown) => void };
const orig = bus.emit.bind(bus);
bus.emit = (e: string, p: unknown) => {
  const q = p as Record<string, number | boolean>;
  if (e === "tackle" || e === "dribble") pending.push({ e, q });
  orig(e, p);
};

for (const dt of dts) {
  c = {};
  for (let i = 0; i < n; i++) {
    simulateMatch(home, away, f, f, la, lb, {
      simDt: dt,
      onTick: (s) => {
        score(s);
        if (s.ballHolderId == null || s.pass || s.shot || s.looseBall) return;
        const d = s.decisions[s.ballHolderId];
        if (d?.type) add(`holderSec.${d.type}`, dt);
      },
    });
  }
  const out = Object.entries(c).map(([k, v]) => {
    if (k.endsWith(".chance") || k.endsWith(".dist") || k.endsWith(".nearDefs")) {
      const base = k.split(".").slice(0, -1).join(".");
      return `${k}=${(v / (c[base] ?? 1)).toFixed(3)}`;
    }
    return `${k}=${(v / n).toFixed(2)}`;
  }).sort();
  console.log(`dt ${dt}`); for (const l of out) console.log("  " + l);
}
