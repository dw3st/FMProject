/**
 * Morale effect (Etapa 23, `docs/superpowers/specs/2026-10-04-morale-talks-design.md` §6,
 * `.claude/rules/game/morale.md`).
 *
 * Plays N full-engine matches (`simulateMatch`) between random pairs of the same league, both
 * sides balanced, one side at morale HIGH and the other at LOW (`options.morale`, the whole side).
 * Every pair is played twice with the morale swapped (home/away kept), so squad strength and home
 * advantage cancel out. Reports the HIGH side's win / draw / loss rate, goals and shots per match.
 * Target (100 vs 65, 25 vs 65): about ±2..4 p.p.; 65 vs 65 is identical by construction (factor 0).
 *
 * `--engine-seed N` replaces Math.random with a seeded generator, so a 65-vs-65 run and a
 * `--baseline` run (no morale option at all) with the same seed must give the very same totals.
 * Without it the engine has no seed: run several processes with `--out` and add them with `--sum`.
 *
 * Usage:
 *   bun scripts/morale-measure.ts [league=premier_league] [matches=400] [--high 100] [--low 65]
 *       [--seed 1] [--engine-seed 7] [--baseline] [--quick] [--out file.json] [--sum a.json,b.json]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const LEAGUE = positional[0] ?? "premier_league";
const N = Number(positional[1] ?? 400);
const HIGH = Number(argVal("--high") ?? 100);
const LOW = Number(argVal("--low") ?? 65);
const ENGINE_SEED = argVal("--engine-seed");
const BASELINE = process.argv.includes("--baseline");
const SEED = Number(argVal("--seed") ?? 1);
const QUICK = process.argv.includes("--quick");
const OUT = argVal("--out");
const SUM = argVal("--sum");

interface Totals { matches: number; w: number; d: number; l: number; gf: number; ga: number; sf: number; sa: number }
const empty = (): Totals => ({ matches: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, sf: 0, sa: 0 });

function report(t: Totals, label: string): void {
  const pct = (v: number) => ((100 * v) / Math.max(1, t.matches)).toFixed(1);
  const per = (v: number) => (v / Math.max(1, t.matches)).toFixed(2);
  const se = 100 * Math.sqrt((t.w / t.matches) * (1 - t.w / t.matches) / t.matches);
  console.log(
    `${label}: n=${t.matches}  HIGH W/D/L ${pct(t.w)}/${pct(t.d)}/${pct(t.l)}%  (win − loss ${(+pct(t.w) - +pct(t.l)).toFixed(1)} p.p., ` +
    `se(win) ±${se.toFixed(1)})  goals ${per(t.gf)}–${per(t.ga)}  shots ${per(t.sf)}–${per(t.sa)}`,
  );
}

if (SUM) {
  const all = await Promise.all(SUM.split(",").map((f) => Bun.file(f.trim()).json() as Promise<Totals>));
  const t = empty();
  for (const r of all) for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += r[k];
  report(t, `sum of ${all.length}`);
  process.exit(0);
}

async function loadLeague(league: string): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
  }));
}

if (ENGINE_SEED !== undefined) Math.random = mulberry32(Number(ENGINE_SEED));

const squads = await loadLeague(LEAGUE);
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = formation.attacking.map((s) => s.role);
const rng = mulberry32(SEED);
const t = empty();

/** Plays home vs away; `highHome` = the home side is the HIGH-morale one. */
function play(home: Squad, away: Squad, highHome: boolean): void {
  const morHome = highHome ? HIGH : LOW;
  const morAway = highHome ? LOW : HIGH;
  const lineupH = autoLineupDefaultFormation(home);
  const lineupA = autoLineupDefaultFormation(away);
  let gH: number, gA: number, sH: number, sA: number;
  if (QUICK) {
    const r = quickSimMatch({
      fixtureId: `f${t.matches}`, home, away, homeLineup: lineupH, awayLineup: lineupA, homeRoles: roles, awayRoles: roles,
      ...(BASELINE ? {} : { homeMorale: morHome, awayMorale: morAway }),
    }, rng);
    [gH, gA] = [r.recording.score.home, r.recording.score.away];
    [sH, sA] = [r.recording.teamStats?.home.shots ?? 0, r.recording.teamStats?.away.shots ?? 0];
  } else {
    const m = simulateMatch(home, away, formation, formation, lineupH, lineupA, {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
      ...(BASELINE ? {} : { morale: { A: morHome, B: morAway } }),
    });
    [gH, gA, sH, sA] = [m.score.A, m.score.B, m.teamStats.A.shots, m.teamStats.B.shots];
  }
  const [gf, ga, sf, sa] = highHome ? [gH, gA, sH, sA] : [gA, gH, sA, sH];
  t.matches++;
  t.gf += gf; t.ga += ga; t.sf += sf; t.sa += sa;
  if (gf > ga) t.w++; else if (gf === ga) t.d++; else t.l++;
}

const start = performance.now();
for (let i = 0; i < N / 2; i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  play(home, away, true);
  play(home, away, false);
}
report(t, `${LEAGUE} ${BASELINE ? "baseline (no morale)" : `${HIGH} vs ${LOW}`}${QUICK ? " (quickSim)" : ""} [${((performance.now() - start) / 1000).toFixed(0)}s]`);
if (OUT) await Bun.write(OUT, JSON.stringify(t));
