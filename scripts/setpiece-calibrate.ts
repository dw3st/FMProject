/**
 * Set-piece calibration (Etapa 14, `docs/superpowers/specs/2026-10-02-set-pieces-design.md` §7,
 * `.claude/rules/game-engine/set-pieces-play.md`).
 *
 * Runs N full engine matches (`simulateMatch`) per league with auto 4-3-3 lineups at a realistic
 * matchday fitness (88, load 0) and records totals (both teams summed): goals, shots, xG, corners,
 * free kicks, direct free-kick shots / goals, set-piece goals, plus crosses / headers / penalties
 * for context.
 *
 * Targets per match (both teams): corners 6–10, set-piece goals 20–30% of the goals, direct
 * free-kick goals 2–5% of the goals, goals and shots within ±5% of the pre-set-piece engine.
 *
 * The engine uses `Math.random` without a seed, so a single run of a few hundred matches moves
 * ±5% on its own. Write raw totals with `--out` from several runs (in parallel processes) and sum
 * them with `--sum a.json,b.json` / `--compare base1.json,base2.json`.
 *
 * Usage:
 *   bun scripts/setpiece-calibrate.ts [premier_league=200] [of_championship=150]
 *       [--style direct_play] [--seed n] [--out file.json] [--sum a.json,b.json] [--compare base.json,base2.json]
 *   SETPIECE_OVERRIDES='{"WALL_BLOCK_FACTOR":0.1}' / AERIAL_OVERRIDES / FOUL_OVERRIDES patch the configs in memory.
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
/** Fixture-draw seed (vary it between parallel runs so they don't replay the same pairs). */
const SEED = Number(argVal("--seed") ?? 2026);

async function patch(env: string, path: string, name: string): Promise<void> {
  if (!process.env[env]) return;
  // Loaded lazily so the script still runs (baseline) on an engine without the config.
  const mod = (await import(path)) as Record<string, Record<string, unknown>>;
  const overrides = JSON.parse(process.env[env]!) as Record<string, unknown>;
  Object.assign(mod[name]!, overrides);
  console.log(`${name} overrides:`, overrides);
}
await patch("SETPIECE_OVERRIDES", "@/GameEngine/Configs/SetPieceConfig", "SET_PIECE_CONFIG");
await patch("AERIAL_OVERRIDES", "@/GameEngine/Configs/AerialConfig", "AERIAL_CONFIG");
await patch("FOUL_OVERRIDES", "@/GameEngine/Configs/FoulConfig", "FOUL_CONFIG");

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

/** Team-stat keys summed over both teams (missing keys read as 0, so the script also runs on older engines). */
const KEYS = [
  "goals", "shots", "xg", "passesAttempted", "throughBallsAttempted", "fouls",
  "penaltiesAwarded", "penaltyGoals", "crosses", "crossesCompleted", "aerialDuels", "aerialDuelsWon",
  "headers", "headerGoals", "longBalls",
  "corners", "freeKicks", "directFreeKickShots", "directFreeKickGoals", "setPieceGoals",
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

const zero = (): Totals => Object.fromEntries([...KEYS, "matches"].map((k) => [k, 0])) as unknown as Totals;

async function measure(league: string, n: number): Promise<Totals> {
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const row = zero();
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

async function merge(files: string[]): Promise<Results> {
  const all = await Promise.all(files.map((f) => Bun.file(f.trim()).json() as Promise<Results>));
  const out: Results = {};
  for (const r of all) {
    for (const [league, t] of Object.entries(r)) {
      const dst = (out[league] ??= zero());
      for (const k of [...KEYS, "matches"] as const) dst[k] += t[k] ?? 0;
    }
  }
  return out;
}

function perMatch(t: Totals): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of KEYS) out[k] = t.matches > 0 ? t[k] / t.matches : 0;
  out.setPieceGoalShare = t.goals > 0 ? t.setPieceGoals / t.goals : 0;
  out.directFreeKickGoalShare = t.goals > 0 ? t.directFreeKickGoals / t.goals : 0;
  out.headerGoalShare = t.goals > 0 ? t.headerGoals / t.goals : 0;
  out.matches = t.matches;
  return out;
}

function print(title: string, results: Results): void {
  for (const [league, t] of Object.entries(results)) {
    console.log(`\n${title} ${league} — ${t.matches} matches, per match, both teams:`);
    for (const [k, v] of Object.entries(perMatch(t))) {
      if (k === "matches") continue;
      console.log(`  ${k.padEnd(24)} ${v.toFixed(3)}`);
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
    for (const k of ["goals", "shots", "xg", "passesAttempted", "crosses", "fouls", "penaltyGoals"]) {
      const d = bb[k] ? ((r[k]! - bb[k]!) / bb[k]!) * 100 : 0;
      console.log(`  ${league.padEnd(16)} ${k.padEnd(22)} ${bb[k]!.toFixed(3)} → ${r[k]!.toFixed(3)} (${d >= 0 ? "+" : ""}${d.toFixed(1)}%)`);
    }
  }
}

if (OUT) {
  await Bun.write(OUT, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT}`);
}
