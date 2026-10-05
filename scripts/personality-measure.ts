#!/usr/bin/env bun
/**
 * Personality measurements (Etapa 26, `docs/superpowers/specs/2026-10-05-personality-design.md` §8,
 * `.claude/rules/game/personality.md`).
 *
 *   world <league> <n> [--neutral] [--engine-seed s] [--seed s] [--out f]
 *       M1, engine: n full matches (auto 4-3-3, both `balanced`, fitness 88) with every player at
 *       his own temperament, or `--neutral` (both sides overridden to 10.5 = the engine before the
 *       personality). Fouls, yellows, reds, goals, shots per match (both teams).
 *   quick [n per league=400] [leagues,...]
 *       M1, quickSim: the same fixtures and seeds with own temperaments vs neutral (paired, exact).
 *   discipline <league> <n> [--baseline] [--engine-seed s] [--seed s] [--out f]
 *       M2: the SAME club on both sides, one side at temperament 20 and the other at 1 (alternating
 *       home), or `--baseline` (10.5 × 10.5). Fouls / cards per side, goals and shots per match.
 *   dev [players=2000]
 *       M3: development model, 4 seasons (matches + training + age decay, the real DP functions):
 *       mean overall by age band with and without professionalism, and a young model professional
 *       vs a sloppy one.
 *   morale [clubs=20] [weeks=40]
 *       M5 proxy: a season of the human club's morale (`moraleDay`) on real squads, with own
 *       personalities vs all neutral: talk requests, transfer requests.
 *   --sum a.json,b.json   adds the totals of several `world`/`discipline` runs.
 *
 * The engine has no seed of its own: `--engine-seed` replaces Math.random (several processes with
 * different seeds + `--sum` for big samples).
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import { personalDpMult, professionalismDecayMult } from "@/Domain/personality/personality";
import { PERSONALITY } from "@/Domain/personality/personalityConfig";
import { overallAvg } from "@/Domain/playerRating";
import { moraleDay, suggestedStatuses, type ClubMatchSummary } from "@/Domain/morale/morale";
import { addDays } from "@/Domain/dates";
import rolesData from "@/Data/roles.json";

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
// PERSONALITY_OVERRIDES='{"FOUL_WEIGHT":0.45}' patches the config in-process (candidate values).
if (process.env.PERSONALITY_OVERRIDES) {
  const o = JSON.parse(process.env.PERSONALITY_OVERRIDES) as Record<string, unknown>;
  Object.assign(PERSONALITY as unknown as Record<string, unknown>, o);
  console.log("PERSONALITY overrides:", o);
}

const NEUTRAL = { ambition: 10.5, loyalty: 10.5, professionalism: 10.5, temperament: 10.5 };

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

// ── Totals of engine runs ──────────────────────────────────────────────────────
interface Side { fouls: number; yellows: number; reds: number; goals: number; shots: number }
interface Totals { matches: number; a: Side; b: Side }
const side = (): Side => ({ fouls: 0, yellows: 0, reds: 0, goals: 0, shots: 0 });
const empty = (): Totals => ({ matches: 0, a: side(), b: side() });

function add(dst: Side, t: Record<string, number>, goals: number): void {
  dst.fouls += t.fouls ?? 0;
  dst.yellows += t.yellowCards ?? 0;
  dst.reds += t.redCards ?? 0;
  dst.goals += goals;
  dst.shots += t.shots ?? 0;
}

function report(t: Totals, label: string, sides: [string, string] | null): void {
  const n = Math.max(1, t.matches);
  const per = (v: number) => (v / n).toFixed(3);
  const both = (k: keyof Side) => per(t.a[k] + t.b[k]);
  console.log(`${label}: n=${t.matches}  per match (both teams): fouls ${both("fouls")}  yellows ${both("yellows")}  reds ${both("reds")}  goals ${both("goals")}  shots ${both("shots")}`);
  if (sides) {
    for (const [name, s] of [[sides[0], t.a], [sides[1], t.b]] as const) {
      console.log(`  ${name.padEnd(8)} fouls ${per(s.fouls)}  yellows ${per(s.yellows)}  reds ${per(s.reds)}  goals ${per(s.goals)}  shots ${per(s.shots)}`);
    }
    const r = (k: keyof Side) => (t.b[k] > 0 ? (t.a[k] / t.b[k]).toFixed(2) : "-");
    console.log(`  ratio ${sides[0]}/${sides[1]}: fouls ${r("fouls")}  yellows ${r("yellows")}  reds ${r("reds")}`);
  }
}

if (SUM) {
  const all = await Promise.all(SUM.split(",").map((f) => Bun.file(f.trim()).json() as Promise<Totals & { sides?: [string, string] | null }>));
  const t = empty();
  for (const r of all) {
    t.matches += r.matches;
    for (const k of Object.keys(t.a) as (keyof Side)[]) { t.a[k] += r.a[k]; t.b[k] += r.b[k]; }
  }
  report(t, `sum of ${all.length}`, all[0]?.sides ?? null);
  process.exit(0);
}

// ── world (M1 engine) ──────────────────────────────────────────────────────────
async function world(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 200);
  const neutral = process.argv.includes("--neutral");
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const t = empty();
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    const home = squads[Math.floor(rng() * squads.length)]!;
    let away = squads[Math.floor(rng() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const m = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
      ...(neutral ? { temperament: { A: 10.5, B: 10.5 } } : {}),
    });
    add(t.a, m.teamStats.A as unknown as Record<string, number>, m.score.A);
    add(t.b, m.teamStats.B as unknown as Record<string, number>, m.score.B);
    t.matches++;
  }
  report(t, `${league} ${neutral ? "neutral (10.5)" : "own temperament"} [${((performance.now() - start) / 1000).toFixed(0)}s]`, null);
  if (OUT) await Bun.write(OUT, JSON.stringify({ ...t, sides: null }));
}

// ── discipline (M2) ────────────────────────────────────────────────────────────
async function discipline(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 200);
  const baseline = process.argv.includes("--baseline");
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const t = empty(); // a = the hot side (20), b = the calm side (1)
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    const club = squads[Math.floor(rng() * squads.length)]!;
    const lineup = autoLineupDefaultFormation(club);
    const hotHome = i % 2 === 0;
    const temp = baseline ? { A: 10.5, B: 10.5 } : hotHome ? { A: 20, B: 1 } : { A: 1, B: 20 };
    const m = simulateMatch(club, club, formation, formation, lineup, lineup, {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
      temperament: temp,
    });
    const [hot, calm] = hotHome ? (["A", "B"] as const) : (["B", "A"] as const);
    add(t.a, m.teamStats[hot] as unknown as Record<string, number>, m.score[hot]);
    add(t.b, m.teamStats[calm] as unknown as Record<string, number>, m.score[calm]);
    t.matches++;
  }
  const sides: [string, string] = baseline ? ["side 1", "side 2"] : ["hot 20", "calm 1"];
  report(t, `${league} ${baseline ? "baseline 10.5 × 10.5" : "20 × 1"} (same club both sides) [${((performance.now() - start) / 1000).toFixed(0)}s]`, sides);
  if (OUT) await Bun.write(OUT, JSON.stringify({ ...t, sides }));
}

// ── quick (M1 quickSim, paired) ────────────────────────────────────────────────
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
  const own = empty();
  const neu = empty();
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
      for (const [t, extra] of [[own, {}], [neu, { homeTemperament: 10.5, awayTemperament: 10.5 }]] as const) {
        const r = quickSimMatch({ ...base, ...extra }, mulberry32(SEED * 100_003 + i)).recording;
        add(t.a, r.teamStats.home as unknown as Record<string, number>, r.score.home);
        add(t.b, r.teamStats.away as unknown as Record<string, number>, r.score.away);
        t.matches++;
      }
    }
  }
  report(neu, `quickSim neutral (${leagues.length} leagues × ${n})`, null);
  report(own, `quickSim own temperament (${leagues.length} leagues × ${n})`, null);
  const d = (k: keyof Side) => {
    const a = own.a[k] + own.b[k], b = neu.a[k] + neu.b[k];
    return `${(((a - b) / Math.max(1, b)) * 100).toFixed(1)}%`;
  };
  console.log(`  own vs neutral: fouls ${d("fouls")}  yellows ${d("yellows")}  reds ${d("reds")}  goals ${d("goals")}  shots ${d("shots")}`);
}

// ── dev (M3) ───────────────────────────────────────────────────────────────────
function weightsOf(p: RosterPlayer): RoleDPWeights {
  const e = (rolesData as Record<string, { dpWeights?: RoleDPWeights }>)[p.positions[0] ?? "CM"];
  return e?.dpWeights ?? DEFAULT_DP_WEIGHTS;
}

/**
 * One season of development, the real DP functions: MATCHES club matches (he plays with
 * probability `playShare`, rating ~ N(6.6, 0.6); otherwise rating 0 = age decay only), TRAINING
 * normal sessions, then age + 1. `personal` = apply the professionalism multipliers.
 */
function season(p0: RosterPlayer, rng: () => number, personal: boolean): RosterPlayer {
  const MATCHES = 40, TRAINING = 120;
  const playShare = 0.6;
  let p = p0;
  const w = weightsOf(p);
  for (let i = 0; i < MATCHES; i++) {
    const u1 = rng(), u2 = rng(), u3 = rng();
    const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, u1))) * Math.cos(2 * Math.PI * u2);
    const rating = u3 < playShare ? Math.max(4, Math.min(9.5, 6.6 + 0.6 * g)) : 0;
    p = applyDevelopment(p, rating, w, personal ? personalDpMult(p) : 1, personal ? professionalismDecayMult(p) : 1).updatedPlayer;
  }
  for (let i = 0; i < TRAINING; i++) {
    p = applyTrainingDevelopment(p, "normal", w, personal ? personalDpMult(p) : 1).updatedPlayer;
  }
  return { ...p, age: p.age + 1, overallAvg: undefined };
}

async function dev(): Promise<void> {
  const nPlayers = Number(positional[1] ?? 2000);
  const pool: RosterPlayer[] = [];
  for (const league of QUICK_LEAGUES) for (const s of await loadLeague(league)) pool.push(...s.players);
  const pick = mulberry32(SEED);
  const sample = Array.from({ length: nPlayers }, () => pool[Math.floor(pick() * pool.length)]!);
  const SEASONS = 4;
  const bands: [string, (a: number) => boolean][] = [
    ["≤21", (a) => a <= 21], ["22–25", (a) => a >= 22 && a <= 25], ["26–29", (a) => a >= 26 && a <= 29],
    ["30–32", (a) => a >= 30 && a <= 32], ["33+", (a) => a >= 33],
  ];
  const acc = new Map(bands.map(([b]) => [b, { n: 0, with: 0, without: 0, start: 0 }]));
  let young = { n: 0, pro: 0, sloppy: 0, neutral: 0 };
  sample.forEach((p0, idx) => {
    const run = (p: RosterPlayer, personal: boolean) => {
      const rng = mulberry32(SEED * 7919 + idx);
      let p2 = p;
      for (let s = 0; s < SEASONS; s++) p2 = season(p2, rng, personal);
      return overallAvg(p2);
    };
    const band = bands.find(([, f]) => f(p0.age))![0];
    const a = acc.get(band)!;
    a.n++;
    a.start += overallAvg(p0);
    a.with += run(p0, true);
    a.without += run(p0, false);
    if (p0.age <= 21) {
      young.n++;
      // Band representatives: model professional (18) vs sloppy (3), and neutral.
      young.pro += run({ ...p0, personality: { ...NEUTRAL, professionalism: 18 } }, true);
      young.sloppy += run({ ...p0, personality: { ...NEUTRAL, professionalism: 3 } }, true);
      young.neutral += run({ ...p0, personality: NEUTRAL }, true);
    }
  });
  console.log(`dev: ${nPlayers} players, ${SEASONS} seasons (40 matches, 60% played, 120 normal sessions per season)`);
  console.log("age band (start) | n | overall start | after, with personality | after, without | Δ");
  for (const [b] of bands) {
    const a = acc.get(b)!;
    if (a.n === 0) continue;
    const w = a.with / a.n, wo = a.without / a.n;
    console.log(`  ${b.padEnd(6)} ${String(a.n).padStart(5)}  ${(a.start / a.n).toFixed(3)}  ${w.toFixed(3)}  ${wo.toFixed(3)}  ${(w - wo >= 0 ? "+" : "") + (w - wo).toFixed(3)}`);
  }
  if (young.n > 0) {
    const y = (v: number) => (v / young.n).toFixed(3);
    console.log(`young (≤21, n=${young.n}) after ${SEASONS} seasons: professional 18 ${y(young.pro)}  neutral ${y(young.neutral)}  sloppy 3 ${y(young.sloppy)}  gap pro − sloppy ${((young.pro - young.sloppy) / young.n).toFixed(3)}`);
  }
  young = { n: 0, pro: 0, sloppy: 0, neutral: 0 };
}

// ── morale (M5 proxy) ──────────────────────────────────────────────────────────
async function morale(): Promise<void> {
  const nClubs = Number(positional[1] ?? 20);
  const weeks = Number(positional[2] ?? 40);
  const clubs = (await loadLeague("premier_league")).concat(await loadLeague("of_championship")).slice(0, nClubs);
  const run = (neutral: boolean) => {
    let talks = 0, requests = 0, sum = 0, count = 0;
    clubs.forEach((club0, ci) => {
      const rng = mulberry32(SEED * 31 + ci);
      let squad: Squad = {
        ...club0,
        players: club0.players.map((p) => ({ ...p, morale: 65, ...(neutral ? { personality: NEUTRAL } : {}) })),
      };
      let ids = 0;
      let date = "2026-08-17"; // a Monday
      for (let w = 0; w < weeks; w++) {
        const status = suggestedStatuses(squad);
        const minutes: Record<string, number> = {};
        for (const p of squad.players) {
          const s = status[p.id];
          const play = s === "key" || s === "starter" ? 0.9 : s === "rotation" ? 0.45 : 0.12;
          minutes[p.id] = rng() < play ? (s === "key" || s === "starter" ? 90 : 30) : 0;
        }
        const r = rng();
        const match: ClubMatchSummary = { result: r < 0.45 ? "W" : r < 0.72 ? "D" : "L", minutes, goals: {}, ratings: {} };
        const mon = moraleDay({ squad, date, monday: true, matches: [], bids: [], sellList: [], newId: () => `t${++ids}` });
        const day = moraleDay({ squad: mon.squad, date: addDays(date, 5), monday: false, matches: [match], bids: [], sellList: [], newId: () => `t${++ids}` });
        talks += mon.news.filter((x) => x.kind === "talk").length;
        requests += mon.news.filter((x) => x.kind === "transfer_request").length;
        // Talks are left open; refused when they expire (as when ignored).
        squad = day.squad;
        date = addDays(date, 7);
      }
      for (const p of squad.players) { sum += p.morale ?? 65; count++; }
    });
    return { talks: talks / clubs.length, requests: requests / clubs.length, avgMorale: sum / Math.max(1, count) };
  };
  const own = run(false), neu = run(true);
  console.log(`morale proxy: ${clubs.length} clubs × ${weeks} weeks, per club and season`);
  console.log(`  neutral: talk requests ${neu.talks.toFixed(2)}  transfer requests ${neu.requests.toFixed(2)}  mean morale ${neu.avgMorale.toFixed(1)}`);
  console.log(`  own:     talk requests ${own.talks.toFixed(2)}  transfer requests ${own.requests.toFixed(2)}  mean morale ${own.avgMorale.toFixed(1)}`);
  console.log(`  ratio own/neutral talks: ${(own.talks / Math.max(1e-9, neu.talks)).toFixed(2)}`);
}

if (MODE === "world") await world();
else if (MODE === "discipline") await discipline();
else if (MODE === "quick") await quick();
else if (MODE === "dev") await dev();
else if (MODE === "morale") await morale();
else console.error(`unknown mode ${MODE}`);
