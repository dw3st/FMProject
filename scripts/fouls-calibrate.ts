/**
 * Fouls / cards / penalties calibration (Etapa 12, `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §4).
 *
 * Runs N full engine matches (`simulateMatch`) per league with auto 4-3-3 lineups at a realistic
 * matchday fitness (88, load 0) and prints, per match (both teams summed): goals, shots, tackle
 * attempts, dribble resolutions, fouls, yellow / red cards, penalties awarded / scored, offsides.
 *
 * Targets (both teams): fouls 10–14, yellows ~3, reds 0.1–0.15, penalties 0.2–0.3, with goals and
 * shots within ±5% of the pre-fouls engine (`--compare <baseline.json>` prints the deltas).
 *
 * Usage:
 *   bun scripts/fouls-calibrate.ts [premier_league=400] [of_championship=150] [--out file.json] [--compare base.json]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { FOUL_CONFIG } from "@/GameEngine/Configs/FoulConfig";

const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const PLAN: Array<[string, number]> = [
  ["premier_league", Number(positional[0] ?? 400)],
  ["of_championship", Number(positional[1] ?? 150)],
];
const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = argVal("--out");
const COMPARE = argVal("--compare");

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

// FOUL_OVERRIDES='{"TACKLE_BASE":0.3}' patches FOUL_CONFIG in-process (it is `as const` for its
// types only), so candidate values can be compared without editing the config file.
if (process.env.FOUL_OVERRIDES) {
  const overrides = JSON.parse(process.env.FOUL_OVERRIDES) as Record<string, unknown>;
  Object.assign(FOUL_CONFIG as unknown as Record<string, unknown>, overrides);
  console.log("FOUL_CONFIG overrides:", overrides);
}

/** Team-stat keys summed over both teams (missing keys read as 0, so the script also runs on older engines). */
const TEAM_KEYS = [
  "goals", "shots", "xg", "tackles", "fouls", "yellowCards", "redCards",
  "penaltiesAwarded", "penaltyGoals", "offsides",
] as const;

const EXTRA_KEYS = ["tackleAttempts", "dribbles", "freeKicks", "dangerousFreeKicks", "foulsTackle", "foulsDribble", "foulsDuel", "secondYellows"] as const;
type Row = Record<(typeof TEAM_KEYS)[number] | (typeof EXTRA_KEYS)[number] | "matches", number>;

const extra: Record<(typeof EXTRA_KEYS)[number], number> = Object.fromEntries(EXTRA_KEYS.map((k) => [k, 0])) as never;
gameBus.on("tackle", () => { extra.tackleAttempts++; });
gameBus.on("dribble", () => { extra.dribbles++; });
gameBus.on("freeKickAwarded", (e) => { extra.freeKicks++; if (e.dangerous) extra.dangerousFreeKicks++; });
gameBus.on("foul", (e) => {
  if (e.kind === "tackle") extra.foulsTackle++;
  else if (e.kind === "dribble") extra.foulsDribble++;
  else extra.foulsDuel++;
});
gameBus.on("card", (e) => { if (e.secondYellow) extra.secondYellows++; });

async function loadLeague(league: string): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
  }));
}

async function measure(league: string, n: number): Promise<Row> {
  const squads = await loadLeague(league);
  const rng = mulberry32(2026);
  const row = Object.fromEntries([...TEAM_KEYS, ...EXTRA_KEYS, "matches"].map((k) => [k, 0])) as Row;
  for (const k of EXTRA_KEYS) extra[k] = 0;
  for (let i = 0; i < n; i++) {
    const home = squads[Math.floor(rng() * squads.length)]!;
    let away = squads[Math.floor(rng() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away));
    for (const team of ["A", "B"] as const) {
      const t = m.teamStats[team] as unknown as Record<string, number>;
      for (const k of TEAM_KEYS) row[k] += t[k] ?? 0;
    }
    row.matches++;
  }
  for (const k of EXTRA_KEYS) row[k] = extra[k];
  return row;
}

function perMatch(row: Row): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) if (k !== "matches") out[k] = v / row.matches;
  out.matches = row.matches;
  return out;
}

const results: Record<string, Record<string, number>> = {};
for (const [league, n] of PLAN) {
  if (n <= 0) continue;
  const t0 = performance.now();
  results[league] = perMatch(await measure(league, n));
  console.log(`\n${league} — ${n} matches (${((performance.now() - t0) / 1000).toFixed(0)} s), per match, both teams:`);
  for (const [k, v] of Object.entries(results[league]!)) {
    if (k === "matches") continue;
    console.log(`  ${k.padEnd(17)} ${v.toFixed(3)}`);
  }
}

if (COMPARE) {
  const base = (await Bun.file(COMPARE).json()) as Record<string, Record<string, number>>;
  console.log(`\nvs ${COMPARE}:`);
  for (const [league, r] of Object.entries(results)) {
    const b = base[league];
    if (!b) continue;
    for (const k of ["goals", "shots", "xg"]) {
      const d = b[k] ? ((r[k]! - b[k]!) / b[k]!) * 100 : 0;
      console.log(`  ${league} ${k.padEnd(6)} ${b[k]!.toFixed(3)} → ${r[k]!.toFixed(3)} (${d >= 0 ? "+" : ""}${d.toFixed(1)}%)`);
    }
  }
}

if (OUT) {
  await Bun.write(OUT, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT}`);
}
