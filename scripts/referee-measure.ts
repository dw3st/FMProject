#!/usr/bin/env bun
/**
 * Referee measurements (`docs/superpowers/specs/2026-10-09-referees-design.md` §7, `.claude/rules/game/referees.md`).
 *
 *   world <league> <n> [--neutral] [--engine-seed s] [--seed s] [--out f]
 *       M1, engine: n matches (auto 4-3-3, both `balanced`, fitness 88), each with a referee drawn from the world's
 *       rigor distribution (`worldStrictness`), or `--neutral` (s = 0 = the engine before the referees).
 *   quick [n per league=400] [leagues,...]
 *       M1, quickSim: the same fixtures and seeds with a drawn rigor vs s = 0 (paired, exact).
 *   pair <league> <n> --strict a --lenient b [--engine-seed s] [--out f]
 *       M2: the SAME club on both sides; half the matches with s = a, half with s = b (same clubs, alternating).
 *   schedule
 *       M3: one season of appointments for the whole world (calendar only, no matches): matches per referee
 *       (p10/p50/p90), nobody twice a day, rest relaxations, longest run of one referee with one club, share of the
 *       top-flight matches refereed by the best quarter of the country.
 *   --sum a.json,b.json   adds the totals of several `world`/`pair` runs.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { strictnessOf } from "@/Domain/referees/strictness";
import { REFEREE } from "@/Domain/referees/refereeConfig";
import realReferees from "@/Data/referees.json";

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const MODE = positional[0] ?? "world";
const OUT = argVal("--out");
const SUM = argVal("--sum");
const SEED = Number(argVal("--seed") ?? 1);
const ENGINE_SEED = argVal("--engine-seed");
if (ENGINE_SEED !== undefined) Math.random = mulberry32(Number(ENGINE_SEED));
// REFEREE_OVERRIDES='{"CARD_NORM":1.01}' patches the config in-process (candidate values).
if (process.env.REFEREE_OVERRIDES) {
  const o = JSON.parse(process.env.REFEREE_OVERRIDES) as Record<string, unknown>;
  Object.assign(REFEREE as unknown as Record<string, unknown>, o);
  console.log("REFEREE overrides:", o);
}

/** Share of the world's referees with a real rigor (~240 of ~1 000 in the pool, 172 with the Transfermarkt record). */
const REAL_SHARE = 0.17;
const REAL_VALUES = (realReferees as { strictness?: number }[]).map((r) => r.strictness).filter((s): s is number => s !== undefined);

/** A referee of the world: a real rigor with REAL_SHARE, else the drawn (triangular) one. */
function worldStrictness(rng: () => number, i: number): number {
  if (REAL_VALUES.length > 0 && rng() < REAL_SHARE) return REAL_VALUES[Math.floor(rng() * REAL_VALUES.length)]!;
  return strictnessOf(`measure_${SEED}_${i}`);
}

async function loadLeague(league: string): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
  }));
}

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = formation.attacking.map((s) => s.role);
const ref = (strictness: number) => ({ id: "ref_measure", name: "Measure", country: "England", strictness });

interface Side { fouls: number; yellows: number; reds: number; penalties: number; goals: number; shots: number }
interface Totals { matches: number; a: Side; b: Side; label?: string }
const side = (): Side => ({ fouls: 0, yellows: 0, reds: 0, penalties: 0, goals: 0, shots: 0 });
const empty = (): Totals => ({ matches: 0, a: side(), b: side() });

function add(dst: Side, t: Record<string, number>, goals: number): void {
  dst.fouls += t.fouls ?? 0;
  dst.yellows += t.yellowCards ?? 0;
  dst.reds += t.redCards ?? 0;
  dst.penalties += t.penaltiesAwarded ?? 0;
  dst.goals += goals;
  dst.shots += t.shots ?? 0;
}
const keys: (keyof Side)[] = ["fouls", "yellows", "reds", "penalties", "goals", "shots"];

function report(t: Totals, label: string, sides: [string, string] | null): void {
  const n = Math.max(1, t.matches);
  const per = (v: number) => (v / n).toFixed(3);
  console.log(`${label}: n=${t.matches}  per match (both teams): ${keys.map((k) => `${k} ${per(t.a[k] + t.b[k])}`).join("  ")}`);
  if (sides) {
    // pair: a = matches with the strict referee, b = with the lenient one (each n/2): totals per match of each arm.
    const half = Math.max(1, t.matches / 2);
    for (const [name, s] of [[sides[0], t.a], [sides[1], t.b]] as const) {
      console.log(`  ${name.padEnd(12)} ${keys.map((k) => `${k} ${(s[k] / half).toFixed(3)}`).join("  ")}`);
    }
    console.log(`  ratio ${sides[0]}/${sides[1]}: ${keys.map((k) => `${k} ${t.b[k] > 0 ? (t.a[k] / t.b[k]).toFixed(2) : "-"}`).join("  ")}`);
  }
}

if (SUM) {
  const all = await Promise.all(SUM.split(",").map((f) => Bun.file(f.trim()).json() as Promise<Totals & { sides?: [string, string] | null }>));
  const t = empty();
  for (const r of all) {
    t.matches += r.matches;
    for (const k of keys) { t.a[k] += r.a[k]; t.b[k] += r.b[k]; }
  }
  report(t, `sum of ${all.length}`, all[0]?.sides ?? null);
  process.exit(0);
}

async function world(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 200);
  const neutral = process.argv.includes("--neutral");
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const t = empty();
  const start = performance.now();
  let sSum = 0;
  for (let i = 0; i < n; i++) {
    const home = squads[Math.floor(rng() * squads.length)]!;
    let away = squads[Math.floor(rng() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const s = neutral ? 0 : worldStrictness(rng, i);
    sSum += s;
    const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, referee: ref(s),
    });
    add(t.a, m.teamStats.A as unknown as Record<string, number>, m.score.A);
    add(t.b, m.teamStats.B as unknown as Record<string, number>, m.score.B);
    t.matches++;
  }
  report(t, `${league} ${neutral ? "neutral (s = 0)" : `world rigor (mean s ${(sSum / n).toFixed(3)})`} [${((performance.now() - start) / 1000).toFixed(0)}s]`, null);
  if (OUT) await Bun.write(OUT, JSON.stringify({ ...t, sides: null }));
}

async function pair(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 200);
  const strict = Number(argVal("--strict") ?? 0.75);
  const lenient = Number(argVal("--lenient") ?? -0.75);
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const t = empty();
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    const club = squads[Math.floor(rng() * squads.length)]!;
    const lineup = autoLineupDefaultFormation(club);
    const isStrict = i % 2 === 0;
    const m = simulateMatch(club, club, formation, formation, lineup, lineup, {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, referee: ref(isStrict ? strict : lenient),
    });
    const dst = isStrict ? t.a : t.b;
    add(dst, m.teamStats.A as unknown as Record<string, number>, m.score.A);
    add(dst, m.teamStats.B as unknown as Record<string, number>, m.score.B);
    t.matches++;
  }
  const sides: [string, string] = [`strict ${strict}`, `lenient ${lenient}`];
  report(t, `${league} same club both sides [${((performance.now() - start) / 1000).toFixed(0)}s]`, sides);
  if (OUT) await Bun.write(OUT, JSON.stringify({ ...t, sides }));
}

const QUICK_LEAGUES = [
  "premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1", "brazil_serie_a", "brazil_serie_b", "brazil_serie_c",
  "of_allsvenskan", "of_argentine_premier_division", "of_championship", "of_danish_superliga", "of_ekstraklasa",
  "of_eredivisie", "of_greek_super_league", "of_italian_serie_c_a", "of_j_league", "of_kenyan_premier_division",
  "of_liga_mx", "of_major_league_soccer", "of_portuguese_primeira_liga", "of_russian_second_division_b_group_2",
  "of_saudi_professional_league", "of_spanish_second_division", "of_turkish_super_league", "of_uzbek_super_league",
];

async function quick(): Promise<void> {
  const n = Number(positional[1] ?? 400);
  const leagues = positional[2] ? positional[2].split(",") : QUICK_LEAGUES;
  const ruled = empty();
  const neu = empty();
  const strictT = empty();
  const lenientT = empty();
  for (const league of leagues) {
    const squads = await loadLeague(league);
    const pick = mulberry32(SEED);
    for (let i = 0; i < n; i++) {
      const home = squads[Math.floor(pick() * squads.length)]!;
      let away = squads[Math.floor(pick() * squads.length)]!;
      if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
      const s = worldStrictness(pick, i);
      const base = {
        fixtureId: `q${i}`, home, away,
        homeLineup: autoLineupDefaultFormation(home), awayLineup: autoLineupDefaultFormation(away),
        homeRoles: roles, awayRoles: roles,
      };
      for (const [t, extra] of [[ruled, { refereeStrictness: s }], [neu, {}], [strictT, { refereeStrictness: 0.75 }], [lenientT, { refereeStrictness: -0.75 }]] as const) {
        const r = quickSimMatch({ ...base, ...extra }, mulberry32(SEED * 100_003 + i)).recording;
        add(t.a, r.teamStats.home as unknown as Record<string, number>, r.score.home);
        add(t.b, r.teamStats.away as unknown as Record<string, number>, r.score.away);
        t.matches++;
      }
    }
  }
  report(neu, `quickSim s = 0 (${leagues.length} leagues × ${n})`, null);
  report(ruled, `quickSim world rigor (${leagues.length} leagues × ${n})`, null);
  const d = (a: Totals, b: Totals, k: keyof Side) => {
    const x = a.a[k] + a.b[k], y = b.a[k] + b.b[k];
    return `${k} ${(((x - y) / Math.max(1, y)) * 100).toFixed(1)}%`;
  };
  console.log(`  world vs s = 0: ${keys.map((k) => d(ruled, neu, k)).join("  ")}`);
  const r = (k: keyof Side) => `${k} ${((strictT.a[k] + strictT.b[k]) / Math.max(1, lenientT.a[k] + lenientT.b[k])).toFixed(2)}`;
  console.log(`  +0.75 / −0.75: ${keys.map(r).join("  ")}`);
}

if (MODE === "world") await world();
else if (MODE === "pair") await pair();
else if (MODE === "quick") await quick();
// schedule (M3): added with the world I/O (Task 9).
else throw new Error(`modo desconhecido: ${MODE}`);
