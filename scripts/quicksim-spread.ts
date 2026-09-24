// scripts/quicksim-spread.ts
/**
 * Explains the full engine's goals/match spread across leagues, match by match, so quickSim can
 * follow it. Two subcommands:
 *
 *   bun scripts/quicksim-spread.ts collect <league> [pairs=200] [repeats=2] [out=<dir>/<league>.json]
 *     Runs the full engine (default 4-3-3 + autoFillLineup, same as AI league matches) on
 *     `pairs` random fixtures × `repeats` and stores every match (ids, score, shots, xG) in a
 *     per-match cache. Slow (~0.7 s/match) — run several leagues as parallel processes.
 *
 *   bun scripts/quicksim-spread.ts analyze <cacheDir> [--holdout a,b,c]
 *     Loads every cache in <cacheDir>, recomputes each XI's per-line attribute means from the
 *     current squads, and reports:
 *       1. per-league engine vs quickSim goals (current constants) and the residual;
 *       2. single-feature correlations of the per-side residual log(engine goals / quickSim xG)
 *          against every line × attribute feature (side and opponent), per league and per match;
 *       3. candidate one-term model extensions fitted on the non-holdout leagues, with in-sample
 *          and out-of-sample per-league errors.
 *     quickSim's own xG is analytic (mean of Binomial = xG, dominance factor is mean-1), so the
 *     quickSim side needs no sampling.
 *
 *   bun scripts/quicksim-spread.ts events <cacheDir> [--quick k=5] [--holdout a,b] [--apply]
 *     Per-slot event rates and per-line starter ratings (same caches — `collect` also stores each
 *     side's per-line totals: passes, shots, goals, assists, won/failed tackles, interceptions,
 *     starter / all ratings). Runs quickSim k times per cached fixture and reports:
 *       1. per league: engine vs quickSim events per starting slot and starter rating per line;
 *       2. pooled starter ratings and ≥8.5 share; 3. Poisson fits of tackles / interceptions /
 *       failed tackles per slot vs own / opponent level; 4. line shares of goals, shots and
 *       assists, shots per xG, assists per goal; 5. failed tackles per slot that zero each line's
 *       rating gap; 6. the suggested QuickSimConfig constants. `--apply` writes them into
 *       QuickSimConfig.ts — re-run until sections 4–5 settle (2–3 rounds).
 *
 * Re-run `collect` after any engine change (the caches describe one engine version), then
 * `analyze` to see whether quickSim still follows.
 */
import { mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { expectedGoals, lineGroupOfRole, quickSimMatch, teamStrength, type TeamStrength } from "@/Domain/advanceDay/quickSim";
import { RATING_WEIGHTS as W } from "@/GameEngine/Configs/PlayerRatingConfig";
import type { MatchPlayerStats } from "@/types/dayLogTypes";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad, type RosterPlayer } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { ATTACKING_MID_ROLES, DEFENSIVE_MID_ROLES, QUICK_SIM_CONFIG as C, type LineGroup } from "@/GameEngine/Configs/QuickSimConfig";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { MatchResult } from "@/GameEngine/Domain/SimulateMatch";

const SQUADS_DIR = fileURLToPath(new URL("../src/example_data/squads/", import.meta.url));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const ROLES = slotRoles(formation);

/**
 * Per-line event totals for one side of one engine match. `slots` = starting slots of that line
 * (quickSim has no subs, so its per-starter rates must equal line total / slots). Events count
 * everyone who played in the line (a sub takes the line of the slot he fills). Ratings are
 * split: `r*` = starters (incl. those later subbed off), `ra*` = everyone who played.
 */
export interface LineRecord {
  slots: number; apps: number;
  pa: number; pc: number; shots: number; goals: number; assists: number;
  tackles: number; tf: number; ints: number;
  rSum: number; rN: number; rHigh: number;
  raSum: number; raN: number; raHigh: number;
}
interface SideRecord { goals: number; shots: number; xg: number; lines?: Record<LineGroup, LineRecord> }
interface MatchRecord { home: string; away: string; h: SideRecord; a: SideRecord }
interface Cache { league: string; pairs: number; repeats: number; createdAt: string; matches: MatchRecord[] }

async function loadSquads(league: string): Promise<Squad[]> {
  const dir = `${SQUADS_DIR}${league}/`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: emptySeasonLog() })) };
  }));
}

// ── collect ──────────────────────────────────────────────────────────────────

async function collect(league: string, pairs: number, repeats: number, out: string) {
  const squads = await loadSquads(league);
  const pick = mulberry32(2026);
  const matches: MatchRecord[] = [];
  const t0 = performance.now();
  // Failed tackles aren't in the engine's player stats — count them straight off the bus.
  const failedTackles = new Map<number, number>();
  gameBus.on("tackle", (e) => { if (!e.success) failedTackles.set(e.player, (failedTackles.get(e.player) ?? 0) + 1); });
  for (let i = 0; i < pairs; i++) {
    const home = squads[Math.floor(pick() * squads.length)]!;
    let away = squads[Math.floor(pick() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const hl = autoLineupDefaultFormation(home);
    const al = autoLineupDefaultFormation(away);
    for (let r = 0; r < repeats; r++) {
      failedTackles.clear();
      const f = simulateMatch(home, away, formation, formation, hl, al);
      const lines = engineLines(f, { A: hl, B: al }, failedTackles);
      const side = (t: "A" | "B"): SideRecord => ({
        goals: f.score[t], shots: f.teamStats[t].shots, xg: +f.teamStats[t].xg.toFixed(3), lines: lines[t],
      });
      matches.push({ home: home.id, away: away.id, h: side("A"), a: side("B") });
    }
    if ((i + 1) % 20 === 0) {
      console.log(`${league}: ${i + 1}/${pairs} pares — ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    }
  }
  const cache: Cache = { league, pairs, repeats, createdAt: new Date().toISOString(), matches };
  await Bun.write(out, JSON.stringify(cache));
  console.log(`${league}: ${matches.length} jogos → ${out}`);
}

const GROUPS: LineGroup[] = ["GK", "DEF", "MID", "FWD"];
const emptyLine = (): LineRecord => ({ slots: 0, apps: 0, pa: 0, pc: 0, shots: 0, goals: 0, assists: 0,
  tackles: 0, tf: 0, ints: 0, rSum: 0, rN: 0, rHigh: 0, raSum: 0, raN: 0, raHigh: 0 });

/**
 * Per-side, per-line totals from one engine match. Starters take their lineup slot role; a sub
 * takes the role he plays at full time, or (if he was later subbed off himself) the role of the
 * slot he filled, by following the substitution chain from the starter he replaced.
 */
function engineLines(f: MatchResult, lineups: Record<"A" | "B", string[]>, failed: Map<number, number>) {
  const out = { A: {} as Record<LineGroup, LineRecord>, B: {} as Record<LineGroup, LineRecord> };
  for (const t of ["A", "B"] as const) for (const g of GROUPS) out[t][g] = emptyLine();
  const rosterOf = new Map<number, string>();
  const teamOf = new Map<number, "A" | "B">();
  for (const p of f.players) { rosterOf.set(p.id, p.rosterId); teamOf.set(p.id, p.team); }
  for (const s of f.substitutions) {
    rosterOf.set(s.playerOutId, s.playerOutRosterId);
    teamOf.set(s.playerOutId, s.team);
    teamOf.set(s.playerInId, s.team);
  }
  const slotRole = new Map<string, string>(); // `${team}:${rosterId}` → slot role for starters
  for (const t of ["A", "B"] as const) lineups[t].forEach((id, i) => slotRole.set(`${t}:${id}`, ROLES[i]!));
  const roleById = new Map<number, string>();
  const starters = new Set<number>();
  for (const [id, rid] of rosterOf) {
    const r = slotRole.get(`${teamOf.get(id)}:${rid}`);
    if (r && !f.substitutions.some((s) => s.playerInId === id)) { roleById.set(id, r); starters.add(id); }
  }
  for (const s of f.substitutions) { // chronological: the replaced player's role is known by now
    const r = roleById.get(s.playerOutId);
    if (r) roleById.set(s.playerInId, r);
  }
  for (const p of f.players) if (!roleById.has(p.id)) roleById.set(p.id, p.role);
  for (const t of ["A", "B"] as const) {
    for (const id of starters) if (teamOf.get(id) === t) out[t][lineGroupOfRole(roleById.get(id)!)].slots++;
  }
  for (const [idStr, rating] of Object.entries(f.playerRatings)) {
    const id = Number(idStr);
    const t = teamOf.get(id);
    const role = roleById.get(id);
    const st = f.playerStats.get(id);
    if (!t || !role || !st) continue;
    const L = out[t][lineGroupOfRole(role)];
    L.apps++;
    L.pa += st.passesAttempted; L.pc += st.passesCompleted; L.shots += st.shots; L.goals += st.goals;
    L.assists += st.assists; L.tackles += st.tackles; L.ints += st.interceptions; L.tf += failed.get(id) ?? 0;
    L.raSum += rating; L.raN++; if (rating >= 8.5) L.raHigh++;
    if (starters.has(id)) { L.rSum += rating; L.rN++; if (rating >= 8.5) L.rHigh++; }
  }
  return out;
}

// ── features ─────────────────────────────────────────────────────────────────

const ATTRS = ["passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump"] as const;
const LINES = ["GK", "DEF", "MID", "FWD"] as const;

interface XIProfile {
  strength: TeamStrength;
  players: RosterPlayer[];
  roles: string[];
  /** `${line}.${attr}` → mean over that line's XI players. */
  f: Record<string, number>;
}

function xiOf(squad: Squad): { players: RosterPlayer[]; roles: string[] } {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const players: RosterPlayer[] = [];
  const roles: string[] = [];
  autoLineupDefaultFormation(squad).forEach((id, i) => {
    const p = byId.get(id);
    if (p && !players.includes(p)) { players.push(p); roles.push(ROLES[i]!); }
  });
  return { players, roles };
}

function profileOf(squad: Squad): XIProfile {
  const { players, roles } = xiOf(squad);
  const f: Record<string, number> = {};
  for (const line of LINES) {
    const pool = players.filter((_, i) => lineGroupOfRole(roles[i]!) === line);
    for (const a of ATTRS) {
      f[`${line}.${a}`] = pool.length
        ? pool.reduce((s, p) => s + ((p.stats as unknown as Record<string, number>)[a] ?? 0), 0) / pool.length : 0;
    }
  }
  // Engine sprint speed ≈ 5 + 0.45·speed + 0.15·acceleration (yds/s, attributes 0–10):
  // pressSpeed 5 + 0.4·speed, plus the through-ball sprint boosts (1.5·accel + 0.5·speed on 0–1).
  for (const line of LINES) f[`${line}.pace`] = (3 * f[`${line}.speed`]! + f[`${line}.acceleration`]!) / 4;
  const strength = teamStrength(players, roles);
  f["S.attack"] = strength.attack;
  f["S.midfield"] = strength.midfield;
  f["S.defense"] = strength.defense;
  f["S.goalkeeper"] = strength.goalkeeper;
  f["S.level"] = (strength.attack + strength.midfield + strength.defense + strength.goalkeeper) / 4;
  // Composite "attack edge" candidates: attacker skill vs the opponent's matching skill is built
  // at the side level below; here only the raw means.
  return { strength, f, players, roles };
}

// ── stats helpers ────────────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// ── analyze ──────────────────────────────────────────────────────────────────

/** One team-side of one match: engine goals vs quickSim xG plus the features of both XIs. */
interface SideObs {
  league: string;
  goals: number; shots: number; engXg: number;
  qsXg: number;
  home: boolean;
  own: XIProfile; opp: XIProfile;
}

interface Model {
  name: string;
  /** Extra multiplicative term on xG: exp(k × feature(side)). `feature` returns 0 for the base model. */
  feature: (o: SideObs) => number;
}

async function analyze(cacheDir: string, holdout: Set<string>) {
  const files = (await readdir(cacheDir)).filter((f) => f.endsWith(".json")).sort();
  const sides: SideObs[] = [];
  const leagues: string[] = [];
  for (const file of files) {
    const cache = (await Bun.file(`${cacheDir}/${file}`).json()) as Cache;
    const squads = new Map((await loadSquads(cache.league)).map((s) => [s.id, s]));
    const prof = new Map<string, XIProfile>();
    const get = (id: string) => {
      if (!prof.has(id)) prof.set(id, profileOf(squads.get(id)!));
      return prof.get(id)!;
    };
    leagues.push(cache.league);
    for (const m of cache.matches) {
      const H = get(m.home), A = get(m.away);
      sides.push({ league: cache.league, goals: m.h.goals, shots: m.h.shots, engXg: m.h.xg,
        qsXg: expectedGoals(H.strength, A.strength, true), home: true, own: H, opp: A });
      sides.push({ league: cache.league, goals: m.a.goals, shots: m.a.shots, engXg: m.a.xg,
        qsXg: expectedGoals(A.strength, H.strength, false), home: false, own: A, opp: H });
    }
  }

  const byLeague = (xs: SideObs[]) => {
    const m = new Map<string, SideObs[]>();
    for (const s of xs) (m.get(s.league) ?? m.set(s.league, []).get(s.league)!).push(s);
    return m;
  };
  const L = byLeague(sides);

  // 1. per-league overview
  console.log("\n1. Por liga (gols/jogo = 2 × média por lado; conv = gols/chute)");
  const rows: Record<string, Record<string, number | string>> = {};
  for (const [lg, xs] of L) {
    const eng = 2 * mean(xs.map((s) => s.goals));
    const qs = 2 * mean(xs.map((s) => s.qsXg));
    rows[lg] = {
      jogos: xs.length / 2,
      "nível": +mean(xs.map((s) => s.own.f["S.level"]!)).toFixed(2),
      motor: +eng.toFixed(2), quick: +qs.toFixed(2),
      "erro %": +((qs / eng - 1) * 100).toFixed(1),
      "ruído ±%": +(100 / Math.sqrt(xs.reduce((a, s) => a + s.goals, 0))).toFixed(1),
      "chutes/lado": +mean(xs.map((s) => s.shots)).toFixed(2),
      conv: +(mean(xs.map((s) => s.goals)) / mean(xs.map((s) => s.shots))).toFixed(3),
      "xG motor/lado": +mean(xs.map((s) => s.engXg)).toFixed(2),
      holdout: holdout.has(lg) ? "sim" : "",
    };
  }
  console.table(rows);
  {
    // Engine-noise floor: with pure Poisson noise on the engine side, the per-league errors would
    // still have rms ≈ sqrt(mean(noise²)). Only the excess over it is model error.
    const errs = Object.values(rows).map((r) => (r["erro %"] as number) / 100);
    const noise = Object.values(rows).map((r) => (r["ruído ±%"] as number) / 100);
    const rms = Math.sqrt(mean(errs.map((e) => e * e)));
    const floor = Math.sqrt(mean(noise.map((n) => n * n)));
    console.log(`  rms do erro por liga ${(rms * 100).toFixed(1)}% — piso de ruído do motor ${(floor * 100).toFixed(1)}% — ` +
      `excesso ≈ ${(Math.sqrt(Math.max(0, rms * rms - floor * floor)) * 100).toFixed(1)}%; ` +
      `ligas além de 2σ: ${Object.entries(rows).filter(([, r]) => Math.abs(r["erro %"] as number) > 2 * (r["ruído ±%"] as number)).map(([lg, r]) => `${lg} ${r["erro %"]}`).join(", ") || "nenhuma"}`);
  }

  // 2. correlations of residual with features
  const featureNames = Object.keys(sides[0]!.own.f);
  const leagueResid = new Map<string, number>();
  for (const [lg, xs] of L) leagueResid.set(lg, Math.log(mean(xs.map((s) => s.goals)) / mean(xs.map((s) => s.qsXg))));
  const lgList = [...L.keys()];
  const lgMean = (lg: string, fn: (s: SideObs) => number) => mean(L.get(lg)!.map(fn));
  const corrRows: { f: string; rLeague: number; rMatch: number }[] = [];
  // Per-match residual: goals / qsXg is too noisy per side; use goals − qsXg (Poisson-ish), weighted.
  const matchResid = sides.map((s) => s.goals - s.qsXg);
  for (const name of featureNames) {
    for (const who of ["own", "opp"] as const) {
      const fn = (s: SideObs) => s[who].f[name]!;
      corrRows.push({
        f: `${who}.${name}`,
        rLeague: corr(lgList.map((lg) => lgMean(lg, fn)), lgList.map((lg) => leagueResid.get(lg)!)),
        rMatch: corr(sides.map(fn), matchResid),
      });
    }
  }
  corrRows.sort((a, b) => Math.abs(b.rLeague) - Math.abs(a.rLeague));
  console.log("\n2. Correlação do resíduo log(motor/quick) por liga (rLeague) e do resíduo gols−xG por lado (rMatch)");
  console.table(corrRows.slice(0, 30).map((r) => ({ feature: r.f, rLeague: +r.rLeague.toFixed(3), rMatch: +r.rMatch.toFixed(3) })));

  // 3. one-term models fitted on the training leagues
  const train = sides.filter((s) => !holdout.has(s.league));
  const models: Model[] = [{ name: "base (atual)", feature: () => 0 }];
  for (const r of corrRows.slice(0, 12)) {
    const [who, ...rest] = r.f.split(".");
    const name = rest.join(".");
    const mu = mean(train.map((s) => s[who as "own" | "opp"].f[name]!));
    models.push({ name: r.f, feature: (s) => s[who as "own" | "opp"].f[name]! - mu });
  }
  console.log("\n3. Modelos de um termo: xG × exp(k·(f − média)) × c, ajustados nas ligas de treino (Poisson ML)");
  for (const m of models) reportModel(m, train, L, holdout);

  // 4. forward stepwise Poisson regression, match level, on the training leagues
  stepwise(train, L, holdout);

  // 5. hand-picked, mechanism-motivated one-term candidates (raw attribute units, not z-scores)
  console.log("\n5. Candidatos com mecanismo (xG × exp(k·x) × c)");
  const edge = (a: string, b: string) => (s: SideObs) => s.own.f[a]! - s.opp.f[b]!;
  const cands: Model[] = [
    { name: "base (atual)", feature: () => 0 },
    { name: "pace FWD − pace DEF adv.", feature: edge("FWD.pace", "DEF.pace") },
    { name: "speed FWD − speed DEF adv.", feature: edge("FWD.speed", "DEF.speed") },
    { name: "pace FWD", feature: (s) => s.own.f["FWD.pace"]! },
    { name: "pace DEF adv.", feature: (s) => -s.opp.f["DEF.pace"]! },
  ];
  for (const m of cands) reportModel(m, train, L, holdout);
  {
    // Mechanism check: does the pace edge act on chance volume (shots, engine xG) or on conversion?
    const pe = sides.map(edge("FWD.pace", "DEF.pace"));
    const withShots = sides.map((s, i) => [s, pe[i]!] as const).filter(([s]) => s.shots > 0);
    console.log(`\n  pace edge × (por lado, todas as ligas): r(chutes)=${corr(pe, sides.map((s) => s.shots)).toFixed(3)}` +
      ` r(xG motor)=${corr(pe, sides.map((s) => s.engXg)).toFixed(3)} r(gols)=${corr(pe, sides.map((s) => s.goals)).toFixed(3)}` +
      ` r(gols/chute | chutes>0)=${corr(withShots.map(([, p]) => p), withShots.map(([s]) => s.goals / s.shots)).toFixed(3)}`);
  }

  // 6. same, but re-fitting the existing exponents (STRENGTH, LEVEL) jointly with the new term:
  // log xG gains β_r·log(ratio) + β_l·log(level/REF), i.e. exponent deltas.
  const logRatio = (s: SideObs) => Math.log((s.own.f["S.attack"]! * s.own.f["S.midfield"]!) / (s.opp.f["S.defense"]! * s.opp.f["S.goalkeeper"]!));
  const logLevel = (s: SideObs) => Math.log((s.own.f["S.level"]! + s.opp.f["S.level"]!) / 2 / 5);
  const paceEdge = edge("FWD.pace", "DEF.pace");
  console.log("\n6. Reajuste conjunto dos expoentes (Δ STRENGTH_EXPONENT, Δ LEVEL_EXPONENT) + termo novo");
  reportMulti("só expoentes", [logRatio, logLevel], ["Δratio", "Δlevel"], train, L, holdout);
  reportMulti("expoentes + pace edge", [logRatio, logLevel, paceEdge], ["Δratio", "Δlevel", "pace"], train, L, holdout);
  reportMulti("level + pace edge", [logLevel, paceEdge], ["Δlevel", "pace"], train, L, holdout);

  // 7. per-league feature means, for eyeballing
  console.log("\n7. Médias por liga");
  const fr: Record<string, Record<string, number>> = {};
  for (const [lg, xs] of L) {
    fr[lg] = {
      "resíduo %": +((mean(xs.map((s) => s.goals)) / mean(xs.map((s) => s.qsXg)) - 1) * 100).toFixed(1),
      "FWD.pace": +mean(xs.map((s) => s.own.f["FWD.pace"]!)).toFixed(2),
      "DEF.pace": +mean(xs.map((s) => s.own.f["DEF.pace"]!)).toFixed(2),
      "pace edge": +mean(xs.map(paceEdge)).toFixed(2),
      "|pace edge|": +mean(xs.map((s) => Math.abs(paceEdge(s)))).toFixed(2),
      "FWD.fin": +mean(xs.map((s) => s.own.f["FWD.finishing"]!)).toFixed(2),
      "GK": +mean(xs.map((s) => s.own.f["S.goalkeeper"]!)).toFixed(2),
      "atk": +mean(xs.map((s) => s.own.f["S.attack"]!)).toFixed(2),
      "def": +mean(xs.map((s) => s.own.f["S.defense"]!)).toFixed(2),
      "nível": +mean(xs.map((s) => s.own.f["S.level"]!)).toFixed(2),
    };
  }
  console.table(fr);

  // 8. free re-fit of the whole xG formula with alternative attribute key sets:
  //    log xG = c + h·home + a·log(atk·mid / (def·gk)) + l·log(level/5) [+ k·paceEdge]
  //    and a split variant (separate exponents per line) to check the GK weight doesn't collapse.
  console.log("\n8. Reajuste livre da fórmula com conjuntos de atributos alternativos");
  const variants: { name: string; keys: KeySet }[] = [
    { name: "chaves atuais", keys: CURRENT_KEYS },
    { name: "ataque com finishing (chaves até 2026-09-24)", keys: { ...CURRENT_KEYS, atk: ["finishing", "dribbling", "speed", "acceleration"] } },
    { name: "ataque sem speed/accel", keys: { ...CURRENT_KEYS, atk: ["finishing", "dribbling"] } },
    { name: "defesa sem heading", keys: { ...CURRENT_KEYS, def: ["tackling", "pressing", "strength"] } },
  ];
  for (const v of variants) {
    const cache = new Map<XIProfile, LineStrength>();
    const st = (p: XIProfile) => cache.get(p) ?? cache.set(p, strengthWith(p, v.keys)).get(p)!;
    const free = sides.map((s) => ({ ...s, qsXg: 1 }));
    const trainF = free.filter((s) => !holdout.has(s.league));
    const LF = byLeague(free);
    const home = (s: SideObs) => (s.home ? 1 : 0);
    const lr = (s: SideObs) => { const o = st(s.own), d = st(s.opp); return Math.log((o.attack * o.midfield) / (d.defense * d.goalkeeper)); };
    const ll = (s: SideObs) => { const o = st(s.own), d = st(s.opp); return Math.log((lvl(o) + lvl(d)) / 2 / 5); };
    const la = (s: SideObs) => Math.log(st(s.own).attack), lm = (s: SideObs) => Math.log(st(s.own).midfield);
    const ld = (s: SideObs) => -Math.log(st(s.opp).defense), lg = (s: SideObs) => -Math.log(st(s.opp).goalkeeper);
    console.log(`\n— ${v.name}`);
    reportMulti("  ratio+level", [home, lr, ll], ["home", "ratio", "level"], trainF, LF, holdout);
    reportMulti("  ratio+level+pace", [home, lr, ll, paceEdge], ["home", "ratio", "level", "pace"], trainF, LF, holdout);
    reportMulti("  por linha+level+pace", [home, la, lm, ld, lg, ll, paceEdge], ["home", "atk", "mid", "def", "gk", "level", "pace"], trainF, LF, holdout);
    reportMulti("  ratio+level+pace+finishing FWD", [home, lr, ll, paceEdge, (s) => s.own.f["FWD.finishing"]!], ["home", "ratio", "level", "pace", "fin"], trainF, LF, holdout);
  }

  // 9. Shape of the pace term and other mechanism candidates, judged by leave-one-league-out:
  //    each league is predicted by a fit on all the others (full formula re-fit, current keys).
  console.log("\n9. Forma do termo de pace — validação deixando uma liga de fora (LOLO), fórmula inteira reajustada");
  {
    const free = sides.map((s) => ({ ...s, qsXg: 1 }));
    const LF = byLeague(free);
    const home = (s: SideObs) => (s.home ? 1 : 0);
    const lr = (s: SideObs) => Math.log((s.own.f["S.attack"]! * s.own.f["S.midfield"]!) / (s.opp.f["S.defense"]! * s.opp.f["S.goalkeeper"]!));
    const ll = (s: SideObs) => Math.log((s.own.f["S.level"]! + s.opp.f["S.level"]!) / 2 / C.LEVEL_REF);
    const pe = paceEdge;
    const sat = (w: number) => (s: SideObs) => w * Math.tanh(pe(s) / w);
    const base = [home, lr, ll];
    const cands: { name: string; feats: ((o: SideObs) => number)[] }[] = [
      { name: "sem pace", feats: base },
      { name: "pace linear (atual)", feats: [...base, pe] },
      { name: "pace + pace²", feats: [...base, pe, (s) => pe(s) ** 2] },
      { name: "pace saturado w=1", feats: [...base, sat(1)] },
      { name: "pace saturado w=2", feats: [...base, sat(2)] },
      { name: "pace saturado w=3", feats: [...base, sat(3)] },
      { name: "pace+ e pace− separados", feats: [...base, (s) => Math.max(0, pe(s)), (s) => Math.min(0, pe(s))] },
      { name: "pace FWD e pace DEF adv. livres", feats: [...base, (s) => s.own.f["FWD.pace"]!, (s) => s.opp.f["DEF.pace"]!] },
      { name: "pace + |pace edge|", feats: [...base, pe, (s) => Math.abs(pe(s))] },
      { name: "pace + drible FWD − desarme DEF adv.", feats: [...base, pe, (s) => s.own.f["FWD.dribbling"]! - s.opp.f["DEF.tackling"]!] },
      { name: "pace + visão MID", feats: [...base, pe, (s) => s.own.f["MID.vision"]!] },
      { name: "pace + passe MID", feats: [...base, pe, (s) => s.own.f["MID.passing"]!] },
      { name: "pace + pace MID adv.", feats: [...base, pe, (s) => s.opp.f["MID.pace"]!] },
      { name: "pace + reflexo GK adv.", feats: [...base, pe, (s) => s.opp.f["GK.reflex"]!] },
      { name: "pace + nível²", feats: [...base, pe, (s) => ll(s) ** 2] },
    ];
    const lgs = [...LF.keys()];
    for (const c of cands) {
      const all = fitMulti(free, c.feats).beta;
      const predWith = (b: number[]) => (s: SideObs) => Math.exp(b[0]! + c.feats.reduce((a, f, j) => a + b[j + 1]! * f(s), 0));
      const inErr = leagueErrors(LF, predWith(all));
      const outErr: Record<string, number> = {};
      for (const lg of lgs) {
        const b = fitMulti(free.filter((s) => s.league !== lg), c.feats).beta;
        outErr[lg] = leagueErrors(new Map([[lg, LF.get(lg)!]]), predWith(b))[lg]!;
      }
      const rms = (o: Record<string, number>) => (Math.sqrt(mean(Object.values(o).map((e) => e * e))) * 100).toFixed(1);
      const worst = (o: Record<string, number>) => (Math.max(...Object.values(o).map(Math.abs)) * 100).toFixed(1);
      const show = ["premier_league", "of_allsvenskan", "of_ekstraklasa", "bundesliga"].filter((l) => l in outErr)
        .map((l) => `${l.replace(/^of_/, "")} ${(outErr[l]! * 100).toFixed(1)}`).join(", ");
      console.log(`  ${c.name.padEnd(38)} β=[${all.map((b) => b.toFixed(3)).join(", ")}] — dentro rms ${rms(inErr)}% (pior ${worst(inErr)}) | LOLO rms ${rms(outErr)}% (pior ${worst(outErr)}) | ${show}`);
    }
  }
}

type LineStrength = Omit<TeamStrength, "forwardPace" | "defensePace">;
type KeySet = { atk: readonly string[]; mid: readonly string[]; def: readonly string[]; gk: readonly string[] };
const CURRENT_KEYS: KeySet = { atk: C.ATTACK_KEYS, mid: C.MIDFIELD_KEYS, def: C.DEFENSE_KEYS, gk: C.GOALKEEPER_KEYS };
const lvl = (s: LineStrength) => (s.attack + s.midfield + s.defense + s.goalkeeper) / 4;

/** quickSim's strengthOf with alternative attribute keys (same line grouping, fitness and floor). */
function strengthWith(p: XIProfile, keys: KeySet): LineStrength {
  const xi = p.players.map((pl, i) => ({ pl, role: p.roles[i]!, g: lineGroupOfRole(p.roles[i]!) }));
  const ff = (pl: RosterPlayer) => 1 - C.FATIGUE_PENALTY * (1 - (pl.seasonLog?.fitness ?? 100) / 100);
  const val = (pool: typeof xi, k: readonly string[]) => {
    const use = pool.length ? pool : xi.filter((x) => x.g !== "GK");
    return mean(use.map(({ pl }) => mean(k.map((a) => (pl.stats as unknown as Record<string, number>)[a] ?? 0)) * ff(pl))) + C.STRENGTH_FLOOR;
  };
  const atkMid = new Set<string>(ATTACKING_MID_ROLES), defMid = new Set<string>(DEFENSIVE_MID_ROLES);
  const gks = xi.filter((x) => x.g === "GK");
  return {
    attack: val(xi.filter((x) => x.g === "FWD" || atkMid.has(x.role)), keys.atk),
    midfield: val(xi.filter((x) => x.g === "MID"), keys.mid),
    defense: val(xi.filter((x) => x.g === "DEF" || defMid.has(x.role)), keys.def),
    goalkeeper: gks.length ? val(gks, keys.gk) : C.STRENGTH_FLOOR,
  };
}

function reportMulti(name: string, feats: ((o: SideObs) => number)[], labels: string[], train: SideObs[], L: Map<string, SideObs[]>, holdout: Set<string>) {
  const { beta } = fitMulti(train, feats);
  const errs = leagueErrors(L, (s) => s.qsXg * Math.exp(beta[0]! + feats.reduce((a, f, j) => a + beta[j + 1]! * f(s), 0)));
  const pick = (h: boolean) => Object.entries(errs).filter(([lg]) => holdout.has(lg) === h).map(([, e]) => e);
  const rms = (xs: number[]) => xs.length ? (Math.sqrt(mean(xs.map((e) => e * e))) * 100).toFixed(1) : "-";
  const worst = (xs: number[]) => xs.length ? (Math.max(...xs.map(Math.abs)) * 100).toFixed(1) : "-";
  console.log(`\n${name}: c=${beta[0]!.toFixed(4)} ${labels.map((l, j) => `${l}=${beta[j + 1]!.toFixed(4)}`).join(" ")} — rms treino ${rms(pick(false))}% (pior ${worst(pick(false))}%), fora ${rms(pick(true))}% (pior ${worst(pick(true))}%)`);
  console.log("  " + Object.entries(errs).map(([lg, e]) => `${lg.replace(/^of_/, "")} ${e > 0 ? "+" : ""}${(e * 100).toFixed(1)}`).join(" | "));
}

/** Poisson deviance-optimal multi-feature fit: goals ~ qsXg × exp(c + Σ k_j x_j) (Newton). */
function fitMulti(xs: SideObs[], feats: ((o: SideObs) => number)[]): { beta: number[]; ll: number } {
  const p = feats.length + 1;
  const X = xs.map((s) => [1, ...feats.map((f) => f(s))]);
  let beta = new Array(p).fill(0);
  for (let it = 0; it < 30; it++) {
    const g = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    xs.forEach((s, i) => {
      const x = X[i]!;
      const mu = s.qsXg * Math.exp(x.reduce((a, v, j) => a + v * beta[j]!, 0));
      for (let a = 0; a < p; a++) {
        g[a] += (s.goals - mu) * x[a]!;
        for (let b = 0; b < p; b++) H[a]![b] += mu * x[a]! * x[b]!;
      }
    });
    const step = solve(H, g);
    beta = beta.map((v, j) => v + step[j]!);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  let ll = 0;
  xs.forEach((s, i) => {
    const mu = s.qsXg * Math.exp(X[i]!.reduce((a, v, j) => a + v * beta[j]!, 0));
    ll += s.goals * Math.log(mu) - mu;
  });
  return { beta, ll };
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) return new Array(n).fill(0);
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  return M.map((r, i) => r[n]! / r[i]!);
}

/** Standardised feature (z-score on the training set). */
function zFeature(train: SideObs[], who: "own" | "opp", name: string): (o: SideObs) => number {
  const vals = train.map((s) => s[who].f[name]!);
  const mu = mean(vals);
  const sd = Math.sqrt(mean(vals.map((v) => (v - mu) ** 2))) || 1;
  return (o) => (o[who].f[name]! - mu) / sd;
}

function leagueErrors(L: Map<string, SideObs[]>, pred: (s: SideObs) => number) {
  const out: Record<string, number> = {};
  for (const [lg, xs] of L) out[lg] = mean(xs.map(pred)) / mean(xs.map((s) => s.goals)) - 1;
  return out;
}

function stepwise(train: SideObs[], L: Map<string, SideObs[]>, holdout: Set<string>) {
  const names = Object.keys(train[0]!.own.f);
  const cands = names.flatMap((n) => (["own", "opp"] as const).map((w) => ({ label: `${w}.${n}`, f: zFeature(train, w, n) })));
  const chosen: typeof cands = [];
  let base = fitMulti(train, []);
  console.log(`\n4. Stepwise Poisson por jogo (treino: ${train.length} lados). logLik base ${base.ll.toFixed(1)}`);
  for (let step = 0; step < 4; step++) {
    const scored = cands
      .filter((c) => !chosen.includes(c))
      .map((c) => ({ c, r: fitMulti(train, [...chosen, c].map((x) => x.f)) }))
      .sort((a, b) => b.r.ll - a.r.ll);
    const best = scored[0]!;
    console.log(`  passo ${step + 1}: top 5 ganhos de logLik: ` +
      scored.slice(0, 5).map((s) => `${s.c.label} +${(s.r.ll - base.ll).toFixed(1)}`).join(", "));
    chosen.push(best.c);
    base = best.r;
    const feats = chosen.map((x) => x.f);
    const beta = base.beta;
    const errs = leagueErrors(L, (s) => s.qsXg * Math.exp(beta[0]! + feats.reduce((a, f, j) => a + beta[j + 1]! * f(s), 0)));
    const ins = Object.entries(errs).filter(([lg]) => !holdout.has(lg)).map(([, e]) => e);
    const outs = Object.entries(errs).filter(([lg]) => holdout.has(lg)).map(([, e]) => e);
    const rms = (xs: number[]) => xs.length ? (Math.sqrt(mean(xs.map((e) => e * e))) * 100).toFixed(1) : "-";
    console.log(`    modelo {${chosen.map((c) => c.label).join(", ")}} β(por dp)=[${beta.slice(1).map((b) => b.toFixed(3)).join(", ")}] — rms treino ${rms(ins)}%, fora ${rms(outs)}%`);
  }
}

/** Poisson maximum likelihood for goals ~ qsXg × exp(c + k·x), by Newton on (c, k). */
function fit(xs: SideObs[], feature: (o: SideObs) => number): { c: number; k: number } {
  let c = 0, k = 0;
  for (let it = 0; it < 50; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (const s of xs) {
      const x = feature(s);
      const mu = s.qsXg * Math.exp(c + k * x);
      g0 += s.goals - mu; g1 += (s.goals - mu) * x;
      h00 += mu; h01 += mu * x; h11 += mu * x * x;
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) { c += g0 / h00; continue; }
    c += (h11 * g0 - h01 * g1) / det;
    k += (h00 * g1 - h01 * g0) / det;
  }
  return { c, k };
}

function reportModel(m: Model, train: SideObs[], L: Map<string, SideObs[]>, holdout: Set<string>) {
  const { c, k } = fit(train, m.feature);
  const errs: Record<string, number> = {};
  const inErr: number[] = [], outErr: number[] = [];
  for (const [lg, xs] of L) {
    const eng = mean(xs.map((s) => s.goals));
    const pred = mean(xs.map((s) => s.qsXg * Math.exp(c + k * m.feature(s))));
    const e = pred / eng - 1;
    errs[lg] = +(e * 100).toFixed(1);
    (holdout.has(lg) ? outErr : inErr).push(e);
  }
  const rms = (xs: number[]) => xs.length ? Math.sqrt(mean(xs.map((e) => e * e))) * 100 : NaN;
  const worst = (xs: number[]) => xs.length ? Math.max(...xs.map(Math.abs)) * 100 : NaN;
  console.log(`\n${m.name}: k=${k.toFixed(4)} c=${c.toFixed(4)} (×${Math.exp(c).toFixed(3)}) — rms treino ${rms(inErr).toFixed(1)}% (pior ${worst(inErr).toFixed(1)}%), rms fora ${rms(outErr).toFixed(1)}% (pior ${worst(outErr).toFixed(1)}%)`);
  console.log("  " + Object.entries(errs).map(([lg, e]) => `${lg.replace(/^of_/, "")} ${e > 0 ? "+" : ""}${e}`).join(" | "));
}


// ── events (per-slot event rates + per-line ratings) ─────────────────────────

const EV = ["pa", "pc", "shots", "goals", "assists", "tackles", "tf", "ints"] as const;
type Ev = (typeof EV)[number];
const attr = (p: RosterPlayer, k: string) => (p.stats as unknown as Record<string, number>)[k] ?? 0;

/** One team-side of one engine match, with both XIs, for the event/ratings analysis. */
interface EvSide {
  league: string;
  homeId: string; awayId: string; isHome: boolean;
  own: XIProfile; opp: XIProfile;
  ownLevel: number; oppLevel: number;
  lines: Record<LineGroup, LineRecord>;
  goals: number; shots: number; qsXg: number;
}

type LineAcc = Record<Ev | "slots" | "rSum" | "rN" | "rHigh", number>;
const newLineAcc = (): LineAcc => ({ pa: 0, pc: 0, shots: 0, goals: 0, assists: 0, tackles: 0, tf: 0, ints: 0, slots: 0, rSum: 0, rN: 0, rHigh: 0 });
const perLine = <T>(f: () => T) => ({ GK: f(), DEF: f(), MID: f(), FWD: f() }) as Record<LineGroup, T>;
type LeagueAcc = Map<string, Record<LineGroup, LineAcc>>;

/**
 * Failed tackles aren't in MatchPlayerStats — recover them from the (0.1-rounded) quickSim rating.
 * Not clamped at 0, so the rounding error averages out instead of biasing upward.
 */
function impliedTf(s: MatchPlayerStats, rating: number): number {
  const known = W.BASELINE + s.goals * W.GOAL + s.assists * W.ASSIST + s.shots * W.SHOT
    + s.passesCompleted * W.PASS_COMPLETED + s.passesFailed * W.PASS_FAILED
    + s.tackles * W.TACKLE_WON + s.interceptions * W.INTERCEPTION;
  return (rating - known) / W.TACKLE_FAILED;
}

async function loadEvSides(cacheDir: string) {
  const files = (await readdir(cacheDir)).filter((f) => f.endsWith(".json")).sort();
  const sides: EvSide[] = [];
  const squadsOf = new Map<string, Map<string, Squad>>();
  for (const file of files) {
    const cache = (await Bun.file(`${cacheDir}/${file}`).json()) as Cache;
    if (!cache.matches[0]?.h.lines) { console.log(`(sem eventos por linha: ${file} — rode collect de novo)`); continue; }
    const squads = new Map((await loadSquads(cache.league)).map((s) => [s.id, s]));
    squadsOf.set(cache.league, squads);
    const prof = new Map<string, XIProfile>();
    const get = (id: string) => prof.get(id) ?? prof.set(id, profileOf(squads.get(id)!)).get(id)!;
    for (const m of cache.matches) {
      const H = get(m.home), A = get(m.away);
      const lh = H.f["S.level"]!, la = A.f["S.level"]!;
      const base = { league: cache.league, homeId: m.home, awayId: m.away };
      sides.push({ ...base, isHome: true, own: H, opp: A, ownLevel: lh, oppLevel: la, lines: m.h.lines!,
        goals: m.h.goals, shots: m.h.shots, qsXg: expectedGoals(H.strength, A.strength, true) });
      sides.push({ ...base, isHome: false, own: A, opp: H, ownLevel: la, oppLevel: lh, lines: m.a.lines!,
        goals: m.a.goals, shots: m.a.shots, qsXg: expectedGoals(A.strength, H.strength, false) });
    }
  }
  return { sides, squadsOf };
}

/** Runs quickSim `k` times on every cached fixture and accumulates per-line totals (every quick player is a starter). */
function quickLines(sides: EvSide[], squadsOf: Map<string, Map<string, Squad>>, k: number): LeagueAcc {
  const out: LeagueAcc = new Map();
  const rng = mulberry32(7);
  for (const s of sides) {
    if (!s.isHome) continue;
    const acc = out.get(s.league) ?? out.set(s.league, perLine(newLineAcc)).get(s.league)!;
    const squads = squadsOf.get(s.league)!;
    const group = new Map<string, LineGroup>();
    s.own.players.forEach((p, j) => group.set(p.id, lineGroupOfRole(s.own.roles[j]!)));
    s.opp.players.forEach((p, j) => group.set(p.id, lineGroupOfRole(s.opp.roles[j]!)));
    const input = {
      fixtureId: "e", home: squads.get(s.homeId)!, away: squads.get(s.awayId)!,
      homeLineup: s.own.players.map((p) => p.id), awayLineup: s.opp.players.map((p) => p.id),
      homeRoles: s.own.roles, awayRoles: s.opp.roles,
    };
    for (let r = 0; r < k; r++) {
      const q = quickSimMatch(input, rng);
      for (const [id, st] of Object.entries(q.recording.playerStats)) {
        const L = acc[group.get(id)!];
        const rating = q.recording.playerRatings[id]!;
        L.slots++; L.pa += st.passesAttempted; L.pc += st.passesCompleted; L.shots += st.shots; L.goals += st.goals;
        L.assists += st.assists; L.tackles += st.tackles; L.ints += st.interceptions; L.tf += impliedTf(st, rating);
        L.rSum += rating; L.rN++; if (rating >= 8.5) L.rHigh++;
      }
    }
  }
  return out;
}

function engineLineAcc(sides: EvSide[]): LeagueAcc {
  const out: LeagueAcc = new Map();
  for (const s of sides) {
    const acc = out.get(s.league) ?? out.set(s.league, perLine(newLineAcc)).get(s.league)!;
    for (const g of GROUPS) {
      const L = s.lines[g], A = acc[g];
      for (const e of EV) A[e] += L[e];
      A.slots += L.slots; A.rSum += L.rSum; A.rN += L.rN; A.rHigh += L.rHigh;
    }
  }
  return out;
}

function mergeAcc(m: LeagueAcc): Record<LineGroup, LineAcc> {
  const t = perLine(newLineAcc);
  for (const acc of m.values()) for (const g of GROUPS) for (const k of Object.keys(t[g]) as (keyof LineAcc)[]) t[g][k] += acc[g][k];
  return t;
}

/** Poisson GLM: y ~ exp(offset + c + Σ β x). Returns β (c first) and log-lik. */
function glm(rows: { y: number; off: number; x: number[] }[]): { beta: number[]; ll: number } {
  const p = (rows[0]?.x.length ?? 0) + 1;
  let beta = new Array(p).fill(0);
  const X = rows.map((r) => [1, ...r.x]);
  for (let it = 0; it < 40; it++) {
    const g = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    rows.forEach((r, i) => {
      const mu = Math.exp(r.off + X[i]!.reduce((a, v, j) => a + v * beta[j]!, 0));
      for (let a = 0; a < p; a++) {
        g[a] += (r.y - mu) * X[i]![a]!;
        for (let b = 0; b < p; b++) H[a]![b] += mu * X[i]![a]! * X[i]![b]!;
      }
    });
    const step = solve(H, g);
    beta = beta.map((v, j) => v + step[j]!);
    if (Math.max(...step.map(Math.abs)) < 1e-10) break;
  }
  let ll = 0;
  rows.forEach((r, i) => {
    const mu = Math.exp(r.off + X[i]!.reduce((a, v, j) => a + v * beta[j]!, 0));
    ll += r.y * Math.log(mu || 1e-300) - mu;
  });
  return { beta, ll };
}

/** Per-player multiplier quickSim applies to a line's event rate (`0.5 + attr/10`); none → per slot. */
const EVENT_ATTR: Partial<Record<Ev, string>> = { tackles: "tackling", ints: "pressing" };

function lineOffset(side: XIProfile, g: LineGroup, e: Ev): number {
  const a = EVENT_ATTR[e];
  const pool = side.players.filter((_, i) => lineGroupOfRole(side.roles[i]!) === g);
  const sum = a ? pool.reduce((t, p) => t + 0.5 + attr(p, a) / 10, 0) : pool.length;
  return Math.log(Math.max(1e-9, sum));
}

async function events(cacheDir: string, quickRepeats: number, holdout: Set<string>, apply = false) {
  const { sides, squadsOf } = await loadEvSides(cacheDir);
  const leagues = [...new Set(sides.map((s) => s.league))];
  const eng = engineLineAcc(sides);
  const quick = quickLines(sides, squadsOf, quickRepeats);
  const lvl = new Map(leagues.map((lg) => [lg, mean(sides.filter((s) => s.league === lg).map((s) => s.ownLevel))]));
  const per = (A: LineAcc, k: keyof LineAcc) => A[k] / Math.max(1, A.slots);
  const rMean = (A: LineAcc) => A.rSum / Math.max(1, A.rN);

  // 1. Per-slot rates and starter ratings, per league.
  console.log("\n1. Eventos por vaga de titular (total da linha ÷ titulares) e nota média dos titulares — motor | quick");
  for (const lg of [...leagues].sort((a, b) => lvl.get(b)! - lvl.get(a)!)) {
    const E = eng.get(lg)!, Q = quick.get(lg)!;
    const rows: Record<string, Record<string, string>> = {};
    for (const g of GROUPS) {
      const row: Record<string, string> = {};
      for (const k of ["tackles", "tf", "ints", "assists", "shots", "goals", "pa"] as const) row[k] = `${per(E[g], k).toFixed(2)} | ${per(Q[g], k).toFixed(2)}`;
      row["nota tit."] = `${rMean(E[g]).toFixed(2)} | ${rMean(Q[g]).toFixed(2)}`;
      row["≥8.5 %"] = `${(100 * E[g].rHigh / E[g].rN).toFixed(1)} | ${(100 * Q[g].rHigh / Q[g].rN).toFixed(1)}`;
      rows[g] = row;
    }
    console.log(`\n${lg} (nível ${lvl.get(lg)!.toFixed(2)})`);
    console.table(rows);
  }

  // 2. Pooled rating check + per-league spread.
  const E = mergeAcc(eng), Q = mergeAcc(quick);
  const ratingRow = (label: string, A: Record<LineGroup, LineAcc>) => ({
    label,
    ...Object.fromEntries(GROUPS.map((g) => [g, +rMean(A[g]).toFixed(3)])),
    "≥8.5 %": +(100 * GROUPS.reduce((t, g) => t + A[g].rHigh, 0) / GROUPS.reduce((t, g) => t + A[g].rN, 0)).toFixed(2),
  });
  console.log("\n2. Nota média dos titulares, todas as ligas");
  console.table([ratingRow("motor", E), ratingRow("quick", Q)]);
  const spread: Record<string, string> = {};
  for (const g of GROUPS) {
    const d = leagues.map((lg) => rMean(quick.get(lg)![g]) - rMean(eng.get(lg)![g]));
    spread[g] = `rms ${Math.sqrt(mean(d.map((x) => x * x))).toFixed(3)}, pior ${d.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0).toFixed(3)}`;
  }
  console.log("  quick − motor por liga:", spread);

  // 3. Rate fits: line total ~ R × (level/LEVEL_REF)^e × Σ_players (0.5 + attr/10)  (or × slots).
  const train = sides.filter((s) => !holdout.has(s.league));
  const L5 = (v: number) => Math.log(v / C.LEVEL_REF);
  console.log("\n3. Ajuste por vaga (Poisson, offset = Σ fator de atributo da linha, ou nº de vagas p/ tf)");
  console.log("   R = taxa por unidade de offset em LEVEL_REF; e_own/e_opp = expoente do nível do próprio time/do adversário");
  /** Own-level fits (the form quickSim uses): event → line → { R, e }. */
  const fitOwn: Record<string, Partial<Record<LineGroup, { R: number; e: number }>>> = { pa: {}, tackles: {}, ints: {}, tf: {} };
  for (const e of ["pa", "tackles", "ints", "tf"] as const) {
    for (const g of GROUPS) {
      if (g === "GK" && e !== "tf" && e !== "pa") continue;
      const rows = (xf: (s: EvSide) => number[]) => train.filter((s) => s.lines[g].slots > 0)
        .map((s) => ({ y: s.lines[g][e], off: lineOffset(s.own, g, e), x: xf(s) }));
      const f0 = glm(rows(() => []));
      const fo = glm(rows((s) => [L5(s.ownLevel)]));
      const fp = glm(rows((s) => [L5(s.oppLevel)]));
      const fb = glm(rows((s) => [L5(s.ownLevel), L5(s.oppLevel)]));
      const R = (b: number[]) => Math.exp(b[0]!).toFixed(3);
      fitOwn[e]![g] = { R: Math.exp(fo.beta[0]!), e: fo.beta[1]! };
      console.log(`  ${e.padEnd(7)} ${g.padEnd(3)} const R=${R(f0.beta)} | own R=${R(fo.beta)} e=${fo.beta[1]!.toFixed(2)} ΔLL=${(fo.ll - f0.ll).toFixed(1)}` +
        ` | opp R=${R(fp.beta)} e=${fp.beta[1]!.toFixed(2)} ΔLL=${(fp.ll - f0.ll).toFixed(1)}` +
        ` | ambos R=${R(fb.beta)} e_own=${fb.beta[1]!.toFixed(2)} e_opp=${fb.beta[2]!.toFixed(2)} ΔLL=${(fb.ll - f0.ll).toFixed(1)}`);
      if (EVENT_ATTR[e]) {
        // Is quickSim's per-player attribute factor right? Offset = slots, free power on the line's
        // mean factor (1 = the current proportional factor, 0 = the attribute doesn't matter).
        const slotRows = train.filter((s) => s.lines[g].slots > 0).map((s) => {
          const lo = lineOffset(s.own, g, e), n = s.lines[g].slots;
          return { y: s.lines[g][e], off: Math.log(n), x: [L5(s.ownLevel), lo - Math.log(n)] };
        });
        const fa = glm(slotRows);
        console.log(`          ${g.padEnd(3)} potência livre no fator de atributo: ${fa.beta[2]!.toFixed(2)} (e_own=${fa.beta[1]!.toFixed(2)}, ΔLL vs fator fixo=${(fa.ll - fo.ll).toFixed(1)})`);
      }
    }
  }

  // 3b. Pass completion = BASE + SKILL × passing/10, weighted least squares on line totals
  //     (x = the line's mean passing / 10, y = completed / attempted, weight = attempts).
  let passFit = { base: C.PASS_COMPLETION_BASE as number, skill: C.PASS_COMPLETION_SKILL as number };
  {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const s of train) for (const g of GROUPS) {
      const L = s.lines[g];
      if (L.pa <= 0) continue;
      const pool = s.own.players.filter((_, i) => lineGroupOfRole(s.own.roles[i]!) === g);
      const x = mean(pool.map((p) => attr(p, "passing"))) / 10;
      const w = L.pa, y = L.pc / L.pa;
      sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
    }
    const skill = (sw * sxy - sx * sy) / (sw * sxx - sx * sx);
    passFit = { base: (sy - skill * sx) / sw, skill };
    const eAcc = GROUPS.reduce((t, g) => t + E[g].pc, 0) / GROUPS.reduce((t, g) => t + E[g].pa, 0);
    const qAcc = GROUPS.reduce((t, g) => t + Q[g].pc, 0) / GROUPS.reduce((t, g) => t + Q[g].pa, 0);
    console.log(`
3b. Acerto de passe: motor ${(eAcc * 100).toFixed(1)}% | quick ${(qAcc * 100).toFixed(1)}% — ajuste BASE=${passFit.base.toFixed(3)} SKILL=${passFit.skill.toFixed(3)}`);
  }

  // 4. Team-level shares: who scores / shoots / assists, and assists per goal.
  const tot = (A: Record<LineGroup, LineAcc>, k: Ev) => GROUPS.reduce((t, g) => t + A[g][k], 0);
  console.log("\n4. Partilha por linha (motor | quick) e totais por lado");
  const share: Record<string, Record<string, string>> = {};
  for (const g of GROUPS) {
    share[g] = Object.fromEntries((["goals", "shots", "assists"] as const).map((k) =>
      [k, `${(E[g][k] / tot(E, k)).toFixed(3)} | ${(Q[g][k] / tot(Q, k)).toFixed(3)}`]));
    share[g]["chutes sem gol"] = `${((E[g].shots - E[g].goals) / (tot(E, "shots") - tot(E, "goals"))).toFixed(3)} | ${((Q[g].shots - Q[g].goals) / (tot(Q, "shots") - tot(Q, "goals"))).toFixed(3)}`;
  }
  console.table(share);
  const nE = sides.length, nQ = Q.GK.slots;
  const qsXgSum = sides.reduce((t, s) => t + s.qsXg, 0);
  console.log(`  por lado: gols ${(tot(E, "goals") / nE).toFixed(3)} | ${(tot(Q, "goals") / nQ).toFixed(3)}; chutes ${(tot(E, "shots") / nE).toFixed(3)} | ${(tot(Q, "shots") / nQ).toFixed(3)};` +
    ` assist./gol ${(tot(E, "assists") / tot(E, "goals")).toFixed(3)} | ${(tot(Q, "assists") / tot(Q, "goals")).toFixed(3)}; xG quick/lado ${(qsXgSum / nE).toFixed(3)}`);
  let shotFit: { spx: number; e: number } = { spx: C.SHOTS_PER_XG, e: C.SHOTS_LEVEL_EXPONENT };
  console.log(`  SHOTS_PER_XG implícito = (chutes − gols do motor) / xG quick = ${((tot(E, "shots") - tot(E, "goals")) / qsXgSum).toFixed(3)}`);
  {
    // Non-goal shots per side ~ SHOTS_PER_XG × qsXg × (matchLevel/LEVEL_REF)^e: weak leagues convert less.
    const rows = (x: (s: EvSide) => number[]) => sides.filter((s) => s.qsXg > 0)
      .map((s) => ({ y: s.shots - s.goals, off: Math.log(s.qsXg), x: x(s) }));
    const lvlOf = (s: EvSide) => Math.log((s.ownLevel + s.oppLevel) / 2 / C.LEVEL_REF);
    const f0 = glm(rows(() => [])), f1 = glm(rows((s) => [lvlOf(s)])), f2 = glm(rows((s) => [Math.log(s.qsXg)]));
    shotFit = { spx: Math.exp(f1.beta[0]!), e: f1.beta[1]! };
    console.log(`  chutes sem gol: const SPX=${Math.exp(f0.beta[0]!).toFixed(3)} | × nível^e: SPX=${Math.exp(f1.beta[0]!).toFixed(3)} e=${f1.beta[1]!.toFixed(3)} ΔLL=${(f1.ll - f0.ll).toFixed(1)}` +
      ` | × xG^b: SPX=${Math.exp(f2.beta[0]!).toFixed(3)} b=${f2.beta[1]!.toFixed(3)} ΔLL=${(f2.ll - f0.ll).toFixed(1)}`);
  }
  console.log(`  NO_ASSIST_RATE implícito = 1 − assist./gol do motor = ${(1 - tot(E, "assists") / tot(E, "goals")).toFixed(3)}`);
  const sug = (k: "goals" | "assists", w: Record<LineGroup, number>) => Object.fromEntries(GROUPS.map((g) =>
    [g, Q[g][k] > 0 ? +(w[g] * (E[g][k] / tot(E, k)) / (Q[g][k] / tot(Q, k))).toFixed(3) : w[g]]));
  console.log("  ROLE_GOAL_WEIGHT × (motor/quick):", sug("goals", C.ROLE_GOAL_WEIGHT));
  console.log("  ROLE_ASSIST_WEIGHT × (motor/quick):", sug("assists", C.ROLE_ASSIST_WEIGHT));

  // 5. Failed tackles needed so that each line's quick starter mean rating hits the engine's.
  console.log("\n5. tf por vaga que zera a diferença de nota dos titulares (por linha, todas as ligas)");
  const need: Record<string, Record<string, number>> = {};
  for (const g of GROUPS) {
    const d = rMean(Q[g]) - rMean(E[g]);
    need[g] = {
      "tf motor/vaga": +per(E[g], "tf").toFixed(3),
      "tf quick/vaga": +per(Q[g], "tf").toFixed(3),
      "quick − motor": +d.toFixed(3),
      "tf alvo/vaga": +(per(Q[g], "tf") + d / -W.TACKLE_FAILED).toFixed(3),
    };
  }
  console.table(need);

  // 6. Ready-to-paste constants. Rates/exponents come straight from the fits; the failed-tackle
  //    rates keep the engine's level exponents and are rescaled so each line's starter rating
  //    matches (one step — re-run `events` after pasting until section 5 shows ~0 and section 4
  //    shows equal shares; 2–3 rounds).
  const f3 = (x: number) => +x.toFixed(3);
  const f2 = (x: number) => +x.toFixed(2);
  const rec = (ev: "pa" | "tackles" | "ints", k: "R" | "e") => Object.fromEntries(GROUPS.map((g) => [g, fitOwn[ev]![g] ? (k === "R" ? f3(fitOwn[ev]![g]!.R) : f2(fitOwn[ev]![g]!.e)) : 0]));
  const tfRate = Object.fromEntries(GROUPS.map((g) => {
    const cur = C.TACKLES_FAILED_PER_MATCH[g];
    const target = Math.max(0, per(Q[g], "tf") + (rMean(Q[g]) - rMean(E[g])) / -W.TACKLE_FAILED);
    const realized = per(Q[g], "tf");
    return [g, g === "GK" || realized <= 0 ? f3(Math.max(0, cur + (target - realized))) : f3(cur * target / realized)];
  }));
  const tfExp = Object.fromEntries(GROUPS.map((g) => [g, g === "GK" ? 0 : f2(fitOwn.tf![g]!.e)]));
  console.log("\n6. Constantes sugeridas (QuickSimConfig)");
  const suggested = {
    ROLE_GOAL_WEIGHT: sug("goals", C.ROLE_GOAL_WEIGHT),
    ROLE_ASSIST_WEIGHT: sug("assists", C.ROLE_ASSIST_WEIGHT),
    NO_ASSIST_RATE: f3(1 - tot(E, "assists") / tot(E, "goals")),
    SHOTS_PER_XG: f3(shotFit.spx), SHOTS_LEVEL_EXPONENT: f2(shotFit.e),
    PASSES_PER_MATCH: rec("pa", "R"), PASS_LEVEL_EXPONENT: rec("pa", "e"),
    PASS_COMPLETION_BASE: f3(passFit.base), PASS_COMPLETION_SKILL: f3(passFit.skill),
    TACKLES_PER_MATCH: rec("tackles", "R"), TACKLE_LEVEL_EXPONENT: rec("tackles", "e"),
    INTERCEPTIONS_PER_MATCH: rec("ints", "R"), INTERCEPTION_LEVEL_EXPONENT: rec("ints", "e"),
    TACKLES_FAILED_PER_MATCH: tfRate, TACKLE_FAIL_LEVEL_EXPONENT: tfExp,
  };
  const literal = (v: unknown) => JSON.stringify(v).replaceAll(`"`, "").replaceAll(",", ", ").replaceAll(":", ": ").replace(/^\{/, "{ ").replace(/\}$/, " }");
  for (const [k, v] of Object.entries(suggested)) console.log(`  ${k}: ${literal(v)},`);
  if (apply) {
    // Rewrite the matching `KEY: value` lines of QuickSimConfig.ts in place (keeps comments / casts).
    const cfgPath = fileURLToPath(new URL("../src/GameEngine/Configs/QuickSimConfig.ts", import.meta.url));
    let cfg = await Bun.file(cfgPath).text();
    for (const [k, v] of Object.entries(suggested)) {
      const re = typeof v === "number"
        ? new RegExp(`^(\\s*${k}:\\s*)[-\\d.]+,`, "m")
        : new RegExp(`^(\\s*${k}:\\s*)\\{[^}]*\\}`, "m");
      if (!re.test(cfg)) throw new Error(`QuickSimConfig: ${k} não encontrado`);
      cfg = cfg.replace(re, (_, pre: string) => `${pre}${literal(v)}${typeof v === "number" ? "," : ""}`);
    }
    await Bun.write(cfgPath, cfg);
    console.log(`  → gravado em ${cfgPath}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "collect") {
  const league = args[0]!;
  const pairs = Number(args[1] ?? 200);
  const repeats = Number(args[2] ?? 2);
  const out = args[3] ?? `qs-spread-cache/${league}.json`;
  await mkdir(out.replace(/[\\/][^\\/]*$/, "") || ".", { recursive: true });
  await collect(league, pairs, repeats, out);
} else if (cmd === "analyze") {
  const dir = args[0]!;
  const hIdx = args.indexOf("--holdout");
  const holdout = new Set(hIdx >= 0 ? args[hIdx + 1]!.split(",") : []);
  await analyze(dir, holdout);
} else if (cmd === "events") {
  const dir = args[0]!;
  const hIdx = args.indexOf("--holdout");
  const kIdx = args.indexOf("--quick");
  await events(dir, kIdx >= 0 ? Number(args[kIdx + 1]) : 5, new Set(hIdx >= 0 ? args[hIdx + 1]!.split(",") : []), args.includes("--apply"));
} else {
  console.log("uso: bun scripts/quicksim-spread.ts collect <liga> [pares] [repetições] [saída] | analyze <dir> [--holdout a,b] | events <dir> [--quick k] [--holdout a,b]");
}
