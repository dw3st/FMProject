/**
 * Aerial play calibration (Etapa 13, `docs/superpowers/specs/2026-10-02-aerial-play-design.md` §7).
 *
 * Runs N full engine matches (`simulateMatch`) per league with auto 4-3-3 lineups at a realistic
 * matchday fitness (88, load 0) and records totals (both teams summed): goals, shots, xG, crosses,
 * aerial duels, headers, header goals, long balls, plus passes / through balls / fouls for context.
 *
 * Targets per match (both teams): crosses 10–20, aerial duels 15–30, header goals 10–15% of goals,
 * long balls 5–15 (more with `direct`), goals and shots within ±5% of the pre-aerial engine.
 *
 * The engine uses `Math.random` without a seed, so a single run of a few hundred matches moves
 * ±5% on its own. Write raw totals with `--out` from several runs (in parallel processes) and sum
 * them with `--sum a.json,b.json` / `--compare base1.json,base2.json`.
 *
 * Usage:
 *   bun scripts/aerial-calibrate.ts [premier_league=200] [of_championship=150]
 *       [--style direct_play] [--out file.json] [--sum a.json,b.json] [--compare base.json,base2.json]
 *   AERIAL_OVERRIDES='{"CROSS_STRONG_RAW":1.2}' patches AERIAL_CONFIG in memory.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import { mulberry32 } from "@/Domain/rng";

const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const PLAN: Array<[string, number]> = [
  ["premier_league", Number(positional[0] ?? 200)],
  ["of_championship", Number(positional[1] ?? 150)],
];
const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = argVal("--out");
const SUM = argVal("--sum");
const COMPARE = argVal("--compare");
const STYLE = argVal("--style") as TacticalStyle | undefined;

if (process.env.AERIAL_OVERRIDES) {
  // Loaded lazily so the script still runs (baseline) on an engine without AerialConfig.
  const { AERIAL_CONFIG } = await import("@/GameEngine/Configs/AerialConfig");
  const overrides = JSON.parse(process.env.AERIAL_OVERRIDES) as Record<string, unknown>;
  Object.assign(AERIAL_CONFIG as unknown as Record<string, unknown>, overrides);
  console.log("AERIAL_CONFIG overrides:", overrides);
}

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

/** Team-stat keys summed over both teams (missing keys read as 0, so the script also runs on older engines). */
const KEYS = [
  "goals", "shots", "xg", "passesAttempted", "throughBallsAttempted", "fouls", "penaltyGoals",
  "crosses", "crossesCompleted", "aerialDuels", "aerialDuelsWon", "headers", "headerGoals",
  "longBalls", "longBallsCompleted",
] as const;
type Totals = Record<(typeof KEYS)[number] | "matches", number>;
type Results = Record<string, Totals>;

async function loadLeague(league: string): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
  }));
}

async function measure(league: string, n: number): Promise<Totals> {
  const squads = await loadLeague(league);
  const rng = mulberry32(2026);
  const row = Object.fromEntries([...KEYS, "matches"].map((k) => [k, 0])) as Totals;
  const tactics = STYLE ? { A: { style: STYLE }, B: { style: STYLE } } : undefined;
  for (let i = 0; i < n; i++) {
    const home = squads[Math.floor(rng() * squads.length)]!;
    let away = squads[Math.floor(rng() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const m = simulateMatch(home, away, formation, formation,
      autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), tactics ? { tactics } : {});
    for (const team of ["A", "B"] as const) {
      const t = m.teamStats[team] as unknown as Record<string, number>;
      for (const k of KEYS) row[k] += t[k] ?? 0;
    }
    row.matches++;
  }
  return row;
}

function merge(files: string[]): Promise<Results> {
  return Promise.all(files.map((f) => Bun.file(f.trim()).json() as Promise<Results>)).then((all) => {
    const out: Results = {};
    for (const r of all) {
      for (const [league, t] of Object.entries(r)) {
        const dst = (out[league] ??= Object.fromEntries([...KEYS, "matches"].map((k) => [k, 0])) as Totals);
        for (const k of [...KEYS, "matches"] as const) dst[k] += t[k] ?? 0;
      }
    }
    return out;
  });
}

function perMatch(t: Totals): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of KEYS) out[k] = t.matches > 0 ? t[k] / t.matches : 0;
  out.headerGoalShare = t.goals > 0 ? t.headerGoals / t.goals : 0;
  out.matches = t.matches;
  return out;
}

function print(title: string, results: Results): void {
  for (const [league, t] of Object.entries(results)) {
    console.log(`\n${title} ${league} — ${t.matches} matches, per match, both teams:`);
    for (const [k, v] of Object.entries(perMatch(t))) {
      if (k === "matches") continue;
      console.log(`  ${k.padEnd(22)} ${v.toFixed(3)}`);
    }
  }
}

let results: Results;
if (SUM) {
  results = await merge(SUM.split(","));
} else {
  results = {};
  for (const [league, n] of PLAN) {
    if (n <= 0) continue;
    const t0 = performance.now();
    results[league] = await measure(league, n);
    console.log(`${league}: ${n} matches in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  }
}
print(STYLE ? `[${STYLE}]` : "", results);

if (COMPARE) {
  const base = await merge(COMPARE.split(","));
  console.log(`\nvs ${COMPARE}:`);
  for (const [league, t] of Object.entries(results)) {
    const b = base[league];
    if (!b) continue;
    const r = perMatch(t);
    const bb = perMatch(b);
    for (const k of ["goals", "shots", "xg", "passesAttempted", "throughBallsAttempted", "fouls"]) {
      const d = bb[k] ? ((r[k]! - bb[k]!) / bb[k]!) * 100 : 0;
      console.log(`  ${league.padEnd(16)} ${k.padEnd(22)} ${bb[k]!.toFixed(3)} → ${r[k]!.toFixed(3)} (${d >= 0 ? "+" : ""}${d.toFixed(1)}%)`);
    }
  }
}

if (OUT) {
  await Bun.write(OUT, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT}`);
}
