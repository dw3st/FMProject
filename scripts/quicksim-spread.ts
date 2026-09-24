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
 * Re-run `collect` after any engine change (the caches describe one engine version), then
 * `analyze` to see whether quickSim still follows.
 */
import { mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { expectedGoals, lineGroupOfRole, teamStrength, type TeamStrength } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad, type RosterPlayer } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { ATTACKING_MID_ROLES, DEFENSIVE_MID_ROLES, QUICK_SIM_CONFIG as C } from "@/GameEngine/Configs/QuickSimConfig";

const SQUADS_DIR = fileURLToPath(new URL("../src/example_data/squads/", import.meta.url));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const ROLES = slotRoles(formation);

interface SideRecord { goals: number; shots: number; xg: number }
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
  for (let i = 0; i < pairs; i++) {
    const home = squads[Math.floor(pick() * squads.length)]!;
    let away = squads[Math.floor(pick() * squads.length)]!;
    if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const hl = autoLineupDefaultFormation(home);
    const al = autoLineupDefaultFormation(away);
    for (let r = 0; r < repeats; r++) {
      const f = simulateMatch(home, away, formation, formation, hl, al);
      const side = (t: "A" | "B"): SideRecord => ({
        goals: f.score[t], shots: f.teamStats[t].shots, xg: +f.teamStats[t].xg.toFixed(3),
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
} else {
  console.log("uso: bun scripts/quicksim-spread.ts collect <liga> [pares] [repetições] [saída] | analyze <dir> [--holdout a,b]");
}
