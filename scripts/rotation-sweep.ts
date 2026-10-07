/**
 * Rotation sweep for the fitness-aware AI lineup selector (`autoFillLineupWithFitness`,
 * `src/Domain/lineupHelpers.ts`) — see `.claude/rules/game/fitness.md` → "Escalação da IA".
 *
 * Every club of a league plays N matches (quickSim, default formation, fitness-aware XI on both
 * sides, like an AI × AI match) with `gap` days between them; between matches the squad rests
 * (`applyRestDays`, the production recovery). Each match counts how many starters the fitness-aware
 * XI rests compared with the plain stat-only XI (`autoFillLineup`). Congested run = a match every
 * 3 days; normal week = every 7 days.
 *
 * Diagnostics: per match, average fitness of the plain XI, how many plain starters are under the
 * tired threshold, and the distribution of best-bench / tired-starter value ratios (the number
 * `BENCH_SWAP_RATIO` is compared with).
 *
 *   bun scripts/rotation-sweep.ts [leagues=premier_league,of_championship] [matches=8] [ratio]
 *
 * `ratio` overrides `ROTATION.BENCH_SWAP_RATIO` for the run (sweep). Reads `src/example_data/squads`
 * (`SQUADS_DIR=<dir>` reads another copy, e.g. an older world exported with `git show`).
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, autoLineupDefaultFormationWithFitness, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { fitnessAdjustedValue, ROTATION } from "@/Domain/lineupHelpers";
import { applyMatchToSquad, applyRestDays, quickSimAppearances } from "@/lab/fitnessCarry";
import { getMainRole } from "@/Domain/roles";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";

const leagues = (process.argv[2] ?? "premier_league,of_championship").split(",");
const MATCHES = Number(process.argv[3] ?? 8);
if (process.argv[4]) (ROTATION as { BENCH_SWAP_RATIO: number }).BENCH_SWAP_RATIO = Number(process.argv[4]);

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = slotRoles(formation);

async function loadLeague(league: string): Promise<Squad[]> {
  const root = process.env.SQUADS_DIR ?? fileURLToPath(new URL("../src/example_data/squads/", import.meta.url));
  const dir = `${root.replace(/[\/]$/, "")}/${league}/`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) => {
      const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
      // A normal, uncongested matchday start (FITNESS_REF ≈ 88), no accumulated load.
      return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90, load: 0 } })) };
    }),
  );
}

type Stats = { rotatedLater: number[]; rotated: number[]; fitness: number[]; tired: number[]; ratios: number[] };

function ratiosOf(squad: Squad, plain: string[], out: number[]) {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const used = new Set(plain);
  plain.forEach((id, i) => {
    const role = roles[i]!;
    if (role === "GK") return;
    const s = byId.get(id);
    if (!s || (s.seasonLog?.fitness ?? 75) >= 75) return;
    const main = getMainRole(role);
    let best = -Infinity;
    for (const p of squad.players) {
      if (used.has(p.id)) continue;
      if (!(p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === main)) continue;
      best = Math.max(best, fitnessAdjustedValue(p, role));
    }
    if (best > -Infinity) out.push(best / fitnessAdjustedValue(s, role));
  });
}

function run(squads: Squad[], gap: number): Stats {
  const st: Stats = { rotatedLater: [], rotated: [], fitness: [], tired: [], ratios: [] };
  const rng = mulberry32(2026);
  let current = squads.slice();
  for (let m = 0; m < MATCHES; m++) {
    const order = current.map((_, i) => i).sort(() => rng() - 0.5);
    for (let k = 0; k + 1 < order.length; k += 2) {
      const hi = order[k]!, ai = order[k + 1]!;
      const home = current[hi]!, away = current[ai]!;
      const lineups: string[][] = [];
      for (const sq of [home, away]) {
        const plain = autoLineupDefaultFormation(sq);
        const fit = autoLineupDefaultFormationWithFitness(sq);
        const byId = new Map(sq.players.map((p) => [p.id, p]));
        const n = plain.filter((id, i) => id !== fit[i]).length;
        st.rotated.push(n);
        if (m > 0) st.rotatedLater.push(n);
        st.fitness.push(plain.reduce((s, id) => s + (byId.get(id)?.seasonLog?.fitness ?? 75), 0) / plain.length);
        st.tired.push(plain.filter((id, i) => roles[i]! !== "GK" && (byId.get(id)?.seasonLog?.fitness ?? 75) < 75).length);
        ratiosOf(sq, plain, st.ratios);
        lineups.push(fit);
      }
      const r = quickSimMatch({ fixtureId: `s${m}_${k}`, home, away, homeLineup: lineups[0]!, awayLineup: lineups[1]!, homeRoles: roles, awayRoles: roles }, rng);
      const homeIds = new Set(home.players.map((p) => p.id));
      current[hi] = applyMatchToSquad(home, quickSimAppearances(r.recording, (id) => homeIds.has(id)));
      current[ai] = applyMatchToSquad(away, quickSimAppearances(r.recording, (id) => !homeIds.has(id)));
    }
    current = current.map((s) => applyRestDays(s, gap - 1));
  }
  return st;
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const q = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

console.log(`BENCH_SWAP_RATIO = ${ROTATION.BENCH_SWAP_RATIO}, ${MATCHES} matches`);
for (const league of leagues) {
  const squads = await loadLeague(league);
  for (const [label, gap] of [["congested (3 days)", 3], ["normal week (7 days)", 7]] as const) {
    const s = run(squads, gap);
    console.log(
      `${league.padEnd(18)} ${label.padEnd(22)} rotated/match ${avg(s.rotated).toFixed(2)} (from match 2: ${avg(s.rotatedLater).toFixed(2)})` +
        `  XI fitness ${avg(s.fitness).toFixed(1)}  tired starters ${avg(s.tired).toFixed(2)}` +
        `  ratio p25/p50/p75/p90 ${[0.25, 0.5, 0.75, 0.9].map((p) => q(s.ratios, p).toFixed(3)).join("/")} (n=${s.ratios.length})`,
    );
  }
}
