#!/usr/bin/env bun
/**
 * VAR measurements (`docs/superpowers/specs/2026-10-10-var-design.md` §7, `.claude/rules/game/var.md`).
 *
 *   engine <league> <n> --arm none|err|var [--quality q] [--seed s] [--engine-seed s] [--out f]
 *       M1/M2, engine: n matches (random pairs of the league, auto 4-3-3, both `balanced`, fitness 88), a neutral
 *       referee (rigor 0). `none` = no quality (the engine before the stage), `err` = errors (quality q, default 62.5)
 *       without VAR, `var` = errors with VAR.
 *   quick [n=2000] [league]
 *       quickSim paired: the same fixture and seed with a referee of quality 62.5 (+VAR) vs none — score identical.
 *   complaint [n=10000]
 *       M3: pure simulation of seasons of 38 matches, complaining c times a match (c = 0, 1, 2, 3).
 *   --sum a.json,b.json   adds the totals of several `engine` runs.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { VAR_CONFIG } from "@/GameEngine/Configs/VarConfig";
import { banMatches, resolveComplaint } from "@/GameEngine/Domain/Var";

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const MODE = positional[0] ?? "engine";
const OUT = argVal("--out");
const SUM = argVal("--sum");
const SEED = Number(argVal("--seed") ?? 1);
const ENGINE_SEED = argVal("--engine-seed");
if (ENGINE_SEED !== undefined) Math.random = mulberry32(Number(ENGINE_SEED));
// VAR_OVERRIDES='{"BASE":{"missed_offside":0.05,...}}' patches the config in-process (candidate values).
if (process.env.VAR_OVERRIDES) {
  const o = JSON.parse(process.env.VAR_OVERRIDES) as Record<string, unknown>;
  const cfg = VAR_CONFIG as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) cfg[k] = typeof v === "object" && v ? { ...(cfg[k] as object), ...v } : v;
  console.log("VAR overrides:", o);
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

interface Totals {
  label: string; matches: number;
  goals: number; shots: number; penalties: number; yellows: number; reds: number; fouls: number;
  errors: Record<string, number>; corrected: number; reviews: number; overturned: number; disallowed: number;
}
const empty = (label: string): Totals => ({
  label, matches: 0, goals: 0, shots: 0, penalties: 0, yellows: 0, reds: 0, fouls: 0,
  errors: {}, corrected: 0, reviews: 0, overturned: 0, disallowed: 0,
});

function print(t: Totals): void {
  const m = Math.max(1, t.matches);
  const f = (v: number) => (v / m).toFixed(3);
  const errs = Object.values(t.errors).reduce((a, b) => a + b, 0);
  console.log(`\n${t.label} — ${t.matches} matches`);
  console.log(`  goals ${f(t.goals)}  shots ${f(t.shots)}  penalties ${f(t.penalties)}  fouls ${f(t.fouls)}  yellows ${f(t.yellows)}  reds ${f(t.reds)}`);
  console.log(`  errors ${f(errs)} (${Object.entries(t.errors).map(([k, v]) => `${k} ${f(v)}`).join(", ")})`);
  console.log(`  corrected by VAR ${f(t.overturned)}  surviving ${f(errs - t.overturned)}  reviews ${f(t.reviews)}  goals disallowed ${f(t.disallowed)}`);
}

async function engine(): Promise<void> {
  const league = positional[1] ?? "premier_league";
  const n = Number(positional[2] ?? 100);
  const arm = argVal("--arm") ?? "err";
  const quality = Number(argVal("--quality") ?? 62.5);
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  const t = empty(`${league} ${arm}${arm !== "none" ? ` q${quality}` : ""}`);
  let current = t;
  gameBus.on("refereeError", (e) => { current.errors[e.kind] = (current.errors[e.kind] ?? 0) + 1; });
  gameBus.on("varReview", (e) => { current.reviews++; if (e.outcome === "overturned") current.overturned++; });
  gameBus.on("goalDisallowed", () => { current.disallowed++; });
  const referee = {
    id: "ref_measure", name: "Measure", country: "England", strictness: 0,
    ...(arm !== "none" ? { quality } : {}), ...(arm === "var" ? { var: true } : {}),
  };
  for (let i = 0; i < n; i++) {
    const a = Math.floor(rng() * squads.length);
    let b = Math.floor(rng() * (squads.length - 1));
    if (b >= a) b++;
    const home = squads[a]!;
    const away = squads[b]!;
    const r = simulateMatch(home, away, formation, formation, autoLineupDefaultFormation(home), autoLineupDefaultFormation(away), {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, referee,
    });
    current = t;
    t.matches++;
    t.goals += r.score.A + r.score.B;
    for (const s of [r.teamStats.A, r.teamStats.B]) {
      t.shots += s.shots; t.penalties += s.penaltiesAwarded; t.yellows += s.yellowCards; t.reds += s.redCards; t.fouls += s.fouls;
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${n}`);
  }
  print(t);
  if (OUT) await Bun.write(OUT, JSON.stringify(t));
}

async function sum(): Promise<void> {
  const files = SUM!.split(",");
  const all = await Promise.all(files.map(async (f) => (await Bun.file(f).json()) as Totals));
  const by = new Map<string, Totals>();
  for (const x of all) {
    const key = x.label.replace(/^\S+ /, "");
    const t = by.get(key) ?? empty(`all ${key}`);
    t.matches += x.matches; t.goals += x.goals; t.shots += x.shots; t.penalties += x.penalties; t.yellows += x.yellows;
    t.reds += x.reds; t.fouls += x.fouls; t.reviews += x.reviews; t.overturned += x.overturned; t.disallowed += x.disallowed;
    for (const [k, v] of Object.entries(x.errors)) t.errors[k] = (t.errors[k] ?? 0) + v;
    by.set(key, t);
    print(x);
  }
  for (const t of by.values()) print(t);
}

async function quick(): Promise<void> {
  const n = Number(positional[1] ?? 2000);
  const league = positional[2] ?? "premier_league";
  const squads = await loadLeague(league);
  const rng = mulberry32(SEED);
  let same = 0; let errors = 0; let reviews = 0; let overturned = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(rng() * squads.length);
    let b = Math.floor(rng() * (squads.length - 1));
    if (b >= a) b++;
    const input = {
      fixtureId: `q${i}`, home: squads[a]!, away: squads[b]!,
      homeLineup: autoLineupDefaultFormation(squads[a]!), awayLineup: autoLineupDefaultFormation(squads[b]!),
      homeRoles: roles, awayRoles: roles,
    };
    const plain = quickSimMatch(input, mulberry32(1000 + i)).recording;
    const withRef = quickSimMatch({ ...input, refereeQuality: 62.5, refereeVar: true }, mulberry32(1000 + i)).recording;
    if (plain.score.home === withRef.score.home && plain.score.away === withRef.score.away
      && JSON.stringify(plain.playerStats) === JSON.stringify(withRef.playerStats)) same++;
    errors += withRef.var?.errors ?? 0; reviews += withRef.var?.reviews ?? 0; overturned += withRef.var?.overturned ?? 0;
  }
  console.log(`quickSim ${league}: ${n} paired matches, identical score and player stats in ${same}`);
  console.log(`  errors ${(errors / n).toFixed(3)}  reviews ${(reviews / n).toFixed(3)}  overturned ${(overturned / n).toFixed(3)}`);
}

function complaint(): void {
  const seasons = Number(positional[1] ?? 10000);
  const rng = mulberry32(SEED);
  console.log(`M3 — ${seasons} seasons of 38 matches; complaints per match c; strictness drawn uniform −0.5..0.5`);
  for (const c of [0, 1, 2, 3]) {
    let yellows = 0; let reds = 0; let bans = 0; let banMatchesTotal = 0;
    for (let s = 0; s < seasons; s++) {
      let banned = 0;
      for (let m = 0; m < 38; m++) {
        if (banned > 0) { banned--; continue; }
        let onYellow = false;
        for (let k = 0; k < c; k++) {
          const o = resolveComplaint({ made: k, onYellow, strictness: rng() - 0.5 }, rng);
          if (o.card === "yellow") { yellows++; onYellow = true; }
          if (o.card === "red") { reds++; bans++; const b = banMatches(k + 1); banned = b; banMatchesTotal += b; break; }
        }
      }
    }
    console.log(`  c=${c}: per season yellows ${(yellows / seasons).toFixed(2)}, reds ${(reds / seasons).toFixed(2)}, bans ${(bans / seasons).toFixed(2)} (${(banMatchesTotal / seasons).toFixed(2)} matches)`);
  }
}

if (SUM) await sum();
else if (MODE === "engine") await engine();
else if (MODE === "quick") await quick();
else if (MODE === "complaint") complaint();
else console.log("unknown mode");
