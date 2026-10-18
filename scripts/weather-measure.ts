#!/usr/bin/env bun
/**
 * Weather measurements (`docs/superpowers/specs/2026-10-18-weather-effects-design.md` §5, `.claude/rules/game/weather.md`).
 *
 *   engine <league> <n> --weather none|rain|snow|wind|hot|cold [--seed s] [--engine-seed s] [--out f]
 *       n full-engine matches (deterministic pairs of the league, AI formations, both `balanced`, fitness 88) with the
 *       weather forced (`simulateMatch(..., { weather })`). Before match i: `Math.random = mulberry32(base + i)`, so two
 *       runs with the same `--engine-seed` and `--seed` play the same pairs on the same random sequence: a weather run
 *       is paired with the `none` run match by match. Per-match records go to `--out`.
 *   world <league> <n> [--seed s] [--engine-seed s] [--out f]
 *       each match with the weather of `matchWeatherOf` (synthetic fixture on a random date of the season, the home
 *       club's stadium) vs the same match neutral, same `Math.random` per pair. A match whose effective weather is
 *       neutral is played once (the golden rule: identical, checked on the first ones).
 *   quick <league> <n> [--seed s]
 *       quickSim paired per weather (same seed with and without weather): goals, crosses / long balls completed,
 *       end energy, injuries — ratios vs none.
 *   --sum a.json,b.json,...   engine files: per weather (and per league, and both leagues), value and ratio vs `none`,
 *                             with the paired standard error of the ratio.
 *
 *   WEATHER_OVERRIDES='{"rain":{"control":0.9}}' patches `WEATHER_EFFECTS` in process.
 */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { aiMatchFormation, autoLineupForFormationWithFitness, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { WEATHER_EFFECTS, isNeutralWeather, type EngineWeather } from "@/GameEngine/Configs/WeatherConfig";
import { matchWeatherOf } from "@/backend/stadiumData";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import type { Squad } from "@/types/playerTypes";

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const MODE = positional[0] ?? "engine";
const OUT = argVal("--out");
const SUM = argVal("--sum");
const SEED = Number(argVal("--seed") ?? 0);
const ENGINE_SEED = Number(argVal("--engine-seed") ?? 11);

if (process.env.WEATHER_OVERRIDES) {
  const o = JSON.parse(process.env.WEATHER_OVERRIDES) as Record<string, Record<string, number>>;
  const tbl = WEATHER_EFFECTS as Record<string, Record<string, number> | undefined>;
  for (const [w, v] of Object.entries(o)) tbl[w] = { ...(tbl[w] ?? {}), ...v };
  console.log("Weather overrides:", o);
}

/** One match, both teams summed (end energy = mean of the two sides). */
interface Rec {
  goals: number; shots: number; crosses: number; crossesC: number; longBalls: number; longBallsC: number;
  loose: number; energy: number; injuries: number;
  /** High balls (cross / long ball) controlled by the winner vs dropped loose (`aerialResolved`). Absent in quickSim. */
  hbControl?: number; hbLoose?: number;
}
const KEYS: (keyof Rec)[] = ["goals", "shots", "crosses", "crossesC", "longBalls", "longBallsC", "loose", "energy", "injuries"];
interface RunFile { league: string; weather: string; seed: number; engineSeed: number; overrides?: string; recs: Rec[] }

const aerial = { control: 0, loose: 0 };
gameBus.on("aerialResolved", (e) => {
  if (e.outcome === "control") aerial.control++;
  else if (e.outcome === "loose") aerial.loose++;
});

function playEngine(home: Squad, away: Squad, date: string, weather: EngineWeather | undefined, rand: number): Rec {
  Math.random = mulberry32(rand);
  aerial.control = 0; aerial.loose = 0;
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const r = simulateMatch(home, away, fH, fA,
    autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date),
    { tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, ...(weather ? { weather } : {}) });
  const A = r.teamStats.A; const B = r.teamStats.B;
  return {
    goals: r.score.A + r.score.B, shots: A.shots + B.shots,
    crosses: A.crosses + B.crosses, crossesC: A.crossesCompleted + B.crossesCompleted,
    longBalls: A.longBalls + B.longBalls, longBallsC: A.longBallsCompleted + B.longBallsCompleted,
    loose: A.looseBallsWon + B.looseBallsWon, energy: (A.avgEndEnergy + B.avgEndEnergy) / 2,
    injuries: A.injuries + B.injuries,
    hbControl: aerial.control, hbLoose: aerial.loose,
  };
}

const randBase = (i: number) => ENGINE_SEED * 1_000_003 + SEED * 7919 + i;

async function engine(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 100);
  const w = argVal("--weather") ?? "none";
  const weather = w === "none" ? undefined : (w as EngineWeather);
  const squads = loadLeagueAt88(league);
  const recs: Rec[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const { home, away, date } = pairAt(squads, SEED + i);
    recs.push(playEngine(home, away, date, weather, randBase(i)));
    if ((i + 1) % 50 === 0) console.log(`  ${league} ${w} ${i + 1}/${n} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const file: RunFile = { league, weather: w, seed: SEED, engineSeed: ENGINE_SEED, overrides: process.env.WEATHER_OVERRIDES, recs };
  printMeans(`${league} ${w}`, recs);
  if (OUT) await Bun.write(OUT, JSON.stringify(file));
}

function means(recs: Rec[]): Rec {
  const m = Object.fromEntries(KEYS.map((k) => [k, 0])) as unknown as Rec;
  for (const r of recs) for (const k of KEYS) m[k] += r[k] ?? 0;
  for (const k of KEYS) m[k] = (m[k] ?? 0) / Math.max(1, recs.length);
  return m;
}
function printMeans(label: string, recs: Rec[]): void {
  const m = means(recs);
  console.log(`${label} — ${recs.length} matches: goals ${m.goals.toFixed(3)} shots ${m.shots.toFixed(2)} crosses ${m.crosses.toFixed(2)} (${pctOf(m.crossesC, m.crosses)}) long ${m.longBalls.toFixed(2)} (${pctOf(m.longBallsC, m.longBalls)}) loose ${m.loose.toFixed(2)} energy ${m.energy.toFixed(2)} injuries ${m.injuries.toFixed(3)}`);
}
const pctOf = (a: number, b: number) => `${((100 * a) / Math.max(1e-9, b)).toFixed(1)}%`;

/** Ratio of means x/y and its paired standard error (delta method on the per-match pairs). */
function pairedRatio(xs: number[], ys: number[]): { r: number; se: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const r = mx / my;
  // Residual d_i = x_i − r·y_i; se(r) = sd(d) / (√n · my).
  let s = 0;
  for (let i = 0; i < n; i++) { const d = xs[i]! - r * ys[i]!; s += d * d; }
  const sd = Math.sqrt(s / Math.max(1, n - 1));
  return { r, se: sd / (Math.sqrt(n) * my) };
}

/** Metric extractors for the table: per-match value used for the paired ratio. */
const METRICS: { name: string; num: (r: Rec) => number; den?: (r: Rec) => number; fmt: (v: number) => string }[] = [
  { name: "goals", num: (r) => r.goals, fmt: (v) => v.toFixed(3) },
  { name: "shots", num: (r) => r.shots, fmt: (v) => v.toFixed(2) },
  { name: "crosses", num: (r) => r.crosses, fmt: (v) => v.toFixed(2) },
  { name: "crosses compl. %", num: (r) => r.crossesC, den: (r) => r.crosses, fmt: (v) => `${(100 * v).toFixed(1)}%` },
  { name: "long balls", num: (r) => r.longBalls, fmt: (v) => v.toFixed(2) },
  { name: "long balls compl. %", num: (r) => r.longBallsC, den: (r) => r.longBalls, fmt: (v) => `${(100 * v).toFixed(1)}%` },
  { name: "high-ball control %", num: (r) => r.hbControl ?? 0, den: (r) => (r.hbControl ?? 0) + (r.hbLoose ?? 0), fmt: (v) => `${(100 * v).toFixed(1)}%` },
  { name: "loose balls won", num: (r) => r.loose, fmt: (v) => v.toFixed(2) },
  { name: "end energy", num: (r) => r.energy, fmt: (v) => v.toFixed(2) },
  { name: "88 − end energy", num: (r) => 88 - r.energy, fmt: (v) => v.toFixed(2) },
  { name: "injuries", num: (r) => r.injuries, fmt: (v) => v.toFixed(3) },
];

function value(recs: Rec[], m: (typeof METRICS)[number]): number {
  const a = recs.reduce((s, r) => s + m.num(r), 0);
  const b = m.den ? recs.reduce((s, r) => s + m.den!(r), 0) : recs.length;
  return a / b;
}
/** Ratio of a proportion metric (num/den) between two paired runs, with its se (bootstrap-free delta method). */
function compare(w: Rec[], base: Rec[], m: (typeof METRICS)[number]): { r: number; se: number } {
  if (!m.den) return pairedRatio(w.map(m.num), base.map(m.num));
  // (Σnum_w/Σden_w) / (Σnum_b/Σden_b): delta method via linearisation per match.
  const n = w.length;
  const Nw = w.reduce((s, r) => s + m.num(r), 0) / n; const Dw = w.reduce((s, r) => s + m.den!(r), 0) / n;
  const Nb = base.reduce((s, r) => s + m.num(r), 0) / n; const Db = base.reduce((s, r) => s + m.den!(r), 0) / n;
  const r = (Nw / Dw) / (Nb / Db);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const z = (m.num(w[i]!) / Nw - m.den!(w[i]!) / Dw) - (m.num(base[i]!) / Nb - m.den!(base[i]!) / Db);
    s += z * z;
  }
  return { r, se: r * Math.sqrt(s / Math.max(1, n - 1)) / Math.sqrt(n) };
}

async function sum(): Promise<void> {
  const files = await Promise.all(SUM!.split(",").map(async (f) => (await Bun.file(f).json()) as RunFile));
  const leagues = [...new Set(files.map((f) => f.league))];
  const weathers = [...new Set(files.map((f) => f.weather))].filter((w) => w !== "none");
  const groups: { label: string; leagues: string[] }[] = [
    ...leagues.map((l) => ({ label: l, leagues: [l] })),
    ...(leagues.length > 1 ? [{ label: "both leagues", leagues }] : []),
  ];
  for (const g of groups) {
    const pick = (w: string) => g.leagues.flatMap((l) => {
      const f = files.find((x) => x.league === l && x.weather === w);
      return f ? f.recs : [];
    });
    const base = pick("none");
    if (base.length === 0) continue;
    const M = METRICS.filter((m) => Number.isFinite(value(base, m)));
    console.log(`\n### ${g.label} (none: ${base.length} matches)\n`);
    console.log(`| Clima | jogos | ${M.map((m) => m.name).join(" | ")} |`);
    console.log(`|---|---|${M.map(() => "---").join("|")}|`);
    console.log(`| none | ${base.length} | ${M.map((m) => m.fmt(value(base, m))).join(" | ")} |`);
    for (const w of weathers) {
      const recs = pick(w);
      if (recs.length !== base.length) { console.log(`| ${w} | ${recs.length} | (not paired with none) |`); continue; }
      const cells = M.map((m) => {
        const c = compare(recs, base, m);
        return `${m.fmt(value(recs, m))} (×${c.r.toFixed(3)} ±${c.se.toFixed(3)})`;
      });
      console.log(`| ${w} | ${recs.length} | ${cells.join(" | ")} |`);
    }
  }
  console.log("\n(± = paired standard error of the ratio vs none)");
}

/** A random date of the 2026-27 season (Aug 15 .. May 20) for match i. */
function seasonDate(i: number): string {
  const start = Date.UTC(2026, 7, 15);
  const end = Date.UTC(2027, 4, 20);
  const day = seedFrom(`wdate:${SEED}:${i}`) % Math.round((end - start) / 86_400_000);
  return new Date(start + day * 86_400_000).toISOString().slice(0, 10);
}

async function world(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 100);
  const squads = loadLeagueAt88(league);
  const drawn: Record<string, number> = {};
  const effective: Record<string, number> = {};
  let covered = 0;
  const withW: Rec[] = []; const neutral: Rec[] = [];
  let identicalChecks = 0; let identicalOk = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const { home, away } = pairAt(squads, SEED + i);
    const date = seasonDate(i);
    const fixture = { id: `w${SEED}_${i}`, date, home: home.id, away: away.id, competition: league };
    const wx = matchWeatherOf(fixture, home);
    drawn[wx.weather] = (drawn[wx.weather] ?? 0) + 1;
    effective[wx.effective] = (effective[wx.effective] ?? 0) + 1;
    if (wx.covered) covered++;
    const rand = randBase(i);
    const neu = playEngine(home, away, date, undefined, rand);
    neutral.push(neu);
    if (isNeutralWeather(wx.effective as MatchWeather)) {
      if (identicalChecks < 5) {
        identicalChecks++;
        const again = playEngine(home, away, date, wx.effective as MatchWeather, rand);
        if (JSON.stringify(again) === JSON.stringify(neu)) identicalOk++;
      }
      withW.push(neu);
    } else {
      withW.push(playEngine(home, away, date, wx.effective as MatchWeather, rand));
    }
    if ((i + 1) % 50 === 0) console.log(`  world ${league} ${i + 1}/${n} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log(`\nworld ${league} — ${n} pairs; neutral-weather identity check ${identicalOk}/${identicalChecks}`);
  console.log(`drawn: ${JSON.stringify(drawn)}  effective: ${JSON.stringify(effective)}  covered: ${covered}`);
  for (const m of METRICS.slice(0, 2)) {
    const c = compare(withW, neutral, m);
    console.log(`  ${m.name}: weather ${m.fmt(value(withW, m))} neutral ${m.fmt(value(neutral, m))} ×${c.r.toFixed(4)} ±${c.se.toFixed(4)}`);
  }
  if (OUT) await Bun.write(OUT, JSON.stringify({ league, n, drawn, effective, covered, withW, neutral }));
}

async function quick(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 4000);
  const squads = loadLeagueAt88(league);
  const inputs = Array.from({ length: n }, (_, k) => {
    const { home, away, date } = pairAt(squads, SEED + k);
    const fH = aiMatchFormation(home, away, date).formation;
    const fA = aiMatchFormation(away, home, date).formation;
    return {
      fixtureId: `q${k}`, home, away,
      homeLineup: autoLineupForFormationWithFitness(home, fH, date), awayLineup: autoLineupForFormationWithFitness(away, fA, date),
      homeRoles: slotRoles(fH), awayRoles: slotRoles(fA),
    };
  });
  const run = (w: EngineWeather | undefined): Rec[] => inputs.map((input, k) => {
    const r = quickSimMatch({ ...input, ...(w ? { weather: w } : {}) }, mulberry32(1000 + SEED + k)).recording;
    const h = r.teamStats.home; const a = r.teamStats.away;
    const energies = Object.values(r.playerEnergy);
    let shots = 0;
    for (const s of Object.values(r.playerStats)) shots += s.shots;
    return {
      goals: r.score.home + r.score.away, shots,
      crosses: (h.crosses ?? 0) + (a.crosses ?? 0), crossesC: (h.crossesCompleted ?? 0) + (a.crossesCompleted ?? 0),
      longBalls: (h.longBalls ?? 0) + (a.longBalls ?? 0), longBallsC: (h.longBallsCompleted ?? 0) + (a.longBallsCompleted ?? 0),
      loose: 0, energy: energies.reduce((s, e) => s + e, 0) / Math.max(1, energies.length),
      injuries: r.injuries?.length ?? 0,
    };
  });
  const base = run(undefined);
  const shown = METRICS.filter((m) => ["goals", "crosses compl. %", "long balls compl. %", "88 − end energy", "injuries"].includes(m.name));
  console.log(`\nquickSim ${league} — ${n} paired matches per weather\n`);
  console.log(`| Clima | ${shown.map((m) => m.name).join(" | ")} |`);
  console.log(`|---|${shown.map(() => "---").join("|")}|`);
  console.log(`| none | ${shown.map((m) => m.fmt(value(base, m))).join(" | ")} |`);
  for (const w of ["rain", "snow", "wind", "hot", "cold"] as EngineWeather[]) {
    const recs = run(w);
    console.log(`| ${w} | ${shown.map((m) => `${m.fmt(value(recs, m))} (×${compare(recs, base, m).r.toFixed(3)})`).join(" | ")} |`);
  }
}

if (SUM) await sum();
else if (MODE === "engine") await engine();
else if (MODE === "world") await world();
else if (MODE === "quick") await quick();
else console.log("unknown mode");
