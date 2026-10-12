#!/usr/bin/env bun
/**
 * Achievements measurements (`docs/superpowers/specs/2026-10-11-achievements-design.md` §9,
 * `.claude/rules/game/achievements.md`): the manager attributes that touch a match or the squad.
 *
 *   pair <league> <n> [--disc 20] [--seed s] [--engine-seed s] [--out f]
 *       M1, engine: the SAME club on both sides; one side (alternating home/away) has the manager's Discipline
 *       `--disc`, the other none (= 10, the AI). Fouls, cards and penalties of each side per match.
 *   world <league> <n> [--seed s]
 *       M2, engine: n matches with no attribute vs both sides at 10, the same `Math.random` per match: how many
 *       matches come out identical (score, fouls, cards, shots).
 *   quick [n per league=400] [leagues,...]
 *       M2/M1, quickSim (paired, exact): 10 vs none identical; the home side at 20 and at 1 vs none.
 *   motivation [seasons=20]
 *       M3: a Premier League squad through a synthetic 38-match season (50% wins, 25% draws), one match a week,
 *       Mondays included: mean morale of the squad with Motivation 20 vs 10.
 *   --sum a.json,b.json   adds the totals of several `pair` runs.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { moraleDay } from "@/Domain/morale/morale";
import { addDays } from "@/Domain/dates";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { ACHIEVEMENTS } from "@/Domain/achievements/achievementsConfig";

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const MODE = positional[0] ?? "pair";
const OUT = argVal("--out");
const SUM = argVal("--sum");
const SEED = Number(argVal("--seed") ?? 1);
const ENGINE_SEED = argVal("--engine-seed");
if (ENGINE_SEED !== undefined) Math.random = mulberry32(Number(ENGINE_SEED));
// ACH_OVERRIDES='{"EFFECT":0.5}' patches the config in-process (to check the pathway with a large effect).
if (process.env.ACH_OVERRIDES) {
  const o = JSON.parse(process.env.ACH_OVERRIDES) as Record<string, unknown>;
  Object.assign(ACHIEVEMENTS as unknown as Record<string, unknown>, o);
  console.log("ACHIEVEMENTS overrides:", o);
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

interface Side { fouls: number; yellows: number; reds: number; penalties: number; goals: number; shots: number }
interface Totals { matches: number; a: Side; b: Side }
const side = (): Side => ({ fouls: 0, yellows: 0, reds: 0, penalties: 0, goals: 0, shots: 0 });
const keys: (keyof Side)[] = ["fouls", "yellows", "reds", "penalties", "goals", "shots"];

/** Adds a team's line; `conceded` = penalties given away (the opponent's `penaltiesAwarded`). */
function add(dst: Side, t: Record<string, number>, goals: number, conceded: number): void {
  dst.fouls += t.fouls ?? 0;
  dst.yellows += t.yellowCards ?? 0;
  dst.reds += t.redCards ?? 0;
  dst.penalties += conceded;
  dst.goals += goals;
  dst.shots += t.shots ?? 0;
}

function report(t: Totals, label: string, names: [string, string]): void {
  const n = Math.max(1, t.matches);
  console.log(`${label}: n=${t.matches}`);
  for (const [name, s] of [[names[0], t.a], [names[1], t.b]] as const) {
    console.log(`  ${name.padEnd(14)} ${keys.map((k) => `${k} ${(s[k] / n).toFixed(3)}`).join("  ")}`);
  }
  console.log(`  ratio ${names[0]}/${names[1]}: ${keys.map((k) => `${k} ${t.b[k] > 0 ? (t.a[k] / t.b[k]).toFixed(3) : "-"}`).join("  ")}`);
}

if (SUM) {
  const all = await Promise.all(SUM.split(",").map((f) => Bun.file(f.trim()).json() as Promise<Totals & { names: [string, string] }>));
  const t: Totals = { matches: 0, a: side(), b: side() };
  for (const r of all) {
    t.matches += r.matches;
    for (const k of keys) { t.a[k] += r.a[k]; t.b[k] += r.b[k]; }
  }
  report(t, `sum of ${all.length}`, all[0]!.names);
  process.exit(0);
}

/** Penalties a team gave away = the other team's penalties awarded. */
const pens = (t: Record<string, number>) => t.penaltiesAwarded ?? 0;

async function pair(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 200);
  const disc = Number(argVal("--disc") ?? 20);
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const t: Totals = { matches: 0, a: side(), b: side() };
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    const club = squads[Math.floor(rng() * squads.length)]!;
    const lineup = autoLineupDefaultFormation(club);
    const mineA = i % 2 === 0;
    const m = simulateMatch(club, club, formation, formation, lineup, lineup, {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
      managerDiscipline: mineA ? { A: disc } : { B: disc },
    });
    const A = m.teamStats.A as unknown as Record<string, number>;
    const B = m.teamStats.B as unknown as Record<string, number>;
    add(t.a, mineA ? A : B, mineA ? m.score.A : m.score.B, pens(mineA ? B : A));
    add(t.b, mineA ? B : A, mineA ? m.score.B : m.score.A, pens(mineA ? A : B));
    t.matches++;
  }
  const names: [string, string] = [`discipline ${disc}`, "none (10)"];
  report(t, `${league} same club both sides [${((performance.now() - start) / 1000).toFixed(0)}s]`, names);
  if (OUT) await Bun.write(OUT, JSON.stringify({ ...t, names }));
}

async function world(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 50);
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  let identical = 0;
  for (let i = 0; i < n; i++) {
    const home = squads[Math.floor(rng() * squads.length)]!;
    let away = squads[Math.floor(rng() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const run = (opts: { managerDiscipline?: { A?: number; B?: number } }) => {
      Math.random = mulberry32(SEED * 7919 + i);
      const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
        tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, ...opts,
      });
      return JSON.stringify([m.score, m.teamStats.A.fouls, m.teamStats.B.fouls, m.teamStats.A.yellowCards, m.teamStats.B.yellowCards, m.teamStats.A.shots, m.teamStats.B.shots]);
    };
    if (run({}) === run({ managerDiscipline: { A: 10, B: 10 } })) identical++;
  }
  console.log(`${league}: ${identical}/${n} matches identical with both managers at 10 and with no attribute`);
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
  const arms = { none: { matches: 0, a: side(), b: side() } as Totals, ten: { matches: 0, a: side(), b: side() } as Totals, high: { matches: 0, a: side(), b: side() } as Totals, low: { matches: 0, a: side(), b: side() } as Totals };
  let identical = 0;
  let total = 0;
  for (const league of leagues) {
    const squads = await loadLeague(league);
    const pick = mulberry32(SEED);
    for (let i = 0; i < n; i++) {
      const home = squads[Math.floor(pick() * squads.length)]!;
      let away = squads[Math.floor(pick() * squads.length)]!;
      if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
      const base = {
        fixtureId: `q${i}`, home, away,
        homeLineup: autoLineupDefaultFormation(home), awayLineup: autoLineupDefaultFormation(away),
        homeRoles: roles, awayRoles: roles,
      };
      const out: Record<string, string> = {};
      for (const [key, extra] of [["none", {}], ["ten", { homeManagerDiscipline: 10, awayManagerDiscipline: 10 }], ["high", { homeManagerDiscipline: 20 }], ["low", { homeManagerDiscipline: 1 }]] as const) {
        const r = quickSimMatch({ ...base, ...extra }, mulberry32(SEED * 100_003 + i)).recording;
        const H = r.teamStats.home as unknown as Record<string, number>;
        const A = r.teamStats.away as unknown as Record<string, number>;
        const t = arms[key];
        add(t.a, H, r.score.home, pens(A));
        add(t.b, A, r.score.away, pens(H));
        t.matches++;
        out[key] = JSON.stringify({ ...r, durationMs: 0 });
      }
      total++;
      if (out.none === out.ten) identical++;
    }
  }
  console.log(`quickSim (${leagues.length} leagues × ${n}): ${identical}/${total} matches identical with both at 10 and with none`);
  const ratio = (x: Totals, k: keyof Side) => (x.a[k] / Math.max(1, arms.none.a[k])).toFixed(3);
  for (const [name, x] of [["home at 20", arms.high], ["home at 1", arms.low]] as const) {
    console.log(`  ${name} / none (home side): ${keys.map((k) => `${k} ${ratio(x, k)}`).join("  ")}`);
  }
  const world = (x: Totals, k: keyof Side) => (((x.a[k] + x.b[k]) / Math.max(1, arms.none.a[k] + arms.none.b[k]) - 1) * 100).toFixed(2);
  console.log(`  both at 10 vs none (world): ${keys.map((k) => `${k} ${world(arms.ten, k)}%`).join("  ")}`);
}

async function motivation(): Promise<void> {
  const seasons = Number(positional[1] ?? 20);
  const squads = await loadLeague("premier_league");
  const results: { m10: number[]; m20: number[]; m1: number[] } = { m10: [], m20: [], m1: [] };
  for (let s = 0; s < seasons; s++) {
    const club = squads[s % squads.length]!;
    const rng = mulberry32(SEED * 31 + s);
    const plan = Array.from({ length: 38 }, () => { const x = rng(); return x < 0.5 ? "W" as const : x < 0.75 ? "D" as const : "L" as const; });
    for (const [key, mot] of [["m10", 10], ["m20", 20], ["m1", 1]] as const) {
      let squad: Squad = club;
      const xi = new Set(autoLineupDefaultFormation(club));
      let sum = 0;
      let date = "2027-08-14"; // a Saturday
      let ids = 0;
      for (const result of plan) {
        const minutes = Object.fromEntries(squad.players.map((p) => [p.id, xi.has(p.id) ? 90 : 0]));
        squad = moraleDay({ squad, date, monday: false, matches: [{ result, minutes, goals: {}, ratings: {} }], bids: [], sellList: [], motivation: mot, newId: () => `t${++ids}` }).squad;
        date = addDays(date, 2); // Monday
        squad = moraleDay({ squad, date, monday: true, matches: [], bids: [], sellList: [], motivation: mot, newId: () => `t${++ids}` }).squad;
        date = addDays(date, 5);
        sum += squad.players.reduce((a, p) => a + (p.morale ?? 65), 0) / squad.players.length;
      }
      results[key].push(sum / plan.length);
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`M3, ${seasons} seasons: mean squad morale over the season — Motivation 10 ${mean(results.m10).toFixed(2)}, 20 ${mean(results.m20).toFixed(2)}, 1 ${mean(results.m1).toFixed(2)}`);
}

if (MODE === "pair") await pair();
else if (MODE === "world") await world();
else if (MODE === "quick") await quick();
else if (MODE === "motivation") await motivation();
else throw new Error(`modo desconhecido: ${MODE}`);
