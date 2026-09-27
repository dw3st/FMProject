/**
 * Calibrates quickSim's in-match energy drain against the full engine, per line
 * (GK/DEF/MID/FWD) — Task 4 of `docs/superpowers/plans/2026-09-27-stamina.md`. See
 * `docs/superpowers/specs/2026-09-27-stamina-design.md` §1 "Motor × quickSim".
 *
 * Part 1 — for three leagues (one strong, one mid `of_*`, one weak `of_*`), runs N engine
 * matches with both XIs at fitness 100 / load 0 and measures the average 90' energy loss per
 * line for players who played the full match (never substituted in or out). Converts each
 * loss into an implied `ENERGY_DRAIN_BY_LINE` constant (`loss / staminaFactor(stamina)`, the
 * same shape quickSim already applies) so the mean doesn't depend on the sample's stamina mix,
 * then pools across the three leagues.
 *
 * Part 2 — one side kicks off at fitness 70 with load = FITNESS.LOAD_HIGH ("tired"), the other
 * at fitness 100 / load 0 ("fresh"); win/draw/loss and goals for the fresh side, engine vs
 * quickSim (many repeats). Sweeps a few FATIGUE_PENALTY candidates against the fixed engine
 * baseline to see whether the current constant still tracks the engine's tired-vs-fresh gap.
 *
 * Usage: bun scripts/fatigue-calibrate.ts [pairs=40] [repeats=2] [scenarioPairs=15] [scenarioRepeats=3]
 * Env: QS_QUICK_REPEATS (default 200) — quickSim repeats per scenario fixture.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { ROLE_GROUP, QUICK_SIM_CONFIG, type LineGroup } from "@/GameEngine/Configs/QuickSimConfig";
import { FITNESS } from "@/Domain/fitness/fitnessConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import {
  FATIGUE_MAX_REDUCTION_PHYSICAL,
  FATIGUE_MAX_REDUCTION_SEMI,
  FATIGUE_MAX_REDUCTION_TECH,
  FATIGUE_CURVE_POWER,
} from "@/GameEngine/Domain/RuntimeLineup";

/** Skips the (comparatively expensive) Parts 1–2 for fast iteration while tuning the curve in Part 3. */
const ONLY_PART3 = process.env.FC_ONLY_PART3 === "1";

// QUICK_SIM_CONFIG is `as const` for its TYPES only — the object itself isn't frozen, so the
// FATIGUE_PENALTY sweep below can mutate it in-process to compare candidates against the same
// fixed engine baseline without re-running the (expensive) engine side per candidate.
const C = QUICK_SIM_CONFIG as unknown as { FATIGUE_PENALTY: number; ENERGY_DRAIN_BY_LINE: Record<LineGroup, number> };

const LEAGUES = ["premier_league", "of_allsvenskan", "of_kenyan_premier_division"];
const PAIRS = Number(process.argv[2] ?? 40);
const REPEATS = Number(process.argv[3] ?? 2);
const SCEN_PAIRS = Number(process.argv[4] ?? 15);
const SCEN_REPEATS = Number(process.argv[5] ?? 3);
const QUICK_REPEATS = Number(process.env.QS_QUICK_REPEATS ?? 200);

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = slotRoles(formation);
const GROUPS: LineGroup[] = ["GK", "DEF", "MID", "FWD"];

async function loadLeague(league: string, fitness: number, load: number): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) => {
      const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
      return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness, load } })) };
    }),
  );
}

/** Same shape as quickSim's stamina factor on the drain (quickSim.ts). */
function staminaFactor(stamina: number): number {
  return 1.2 - 0.4 * (stamina / 10);
}

function pickPair(squads: Squad[], rng: () => number): [Squad, Squad] {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  return [home, away];
}

// ── Part 1: per-line drain ───────────────────────────────────────────────────────────────────

type DrainAcc = Record<LineGroup, { lossSum: number; impliedSum: number; n: number }>;
const newDrainAcc = (): DrainAcc =>
  Object.fromEntries(GROUPS.map((g) => [g, { lossSum: 0, impliedSum: 0, n: 0 }])) as DrainAcc;

function addDrainAcc(target: DrainAcc, src: DrainAcc) {
  for (const g of GROUPS) {
    target[g].lossSum += src[g].lossSum;
    target[g].impliedSum += src[g].impliedSum;
    target[g].n += src[g].n;
  }
}

async function measureLeagueDrain(league: string): Promise<DrainAcc> {
  const squads = await loadLeague(league, 100, 0);
  const rng = mulberry32(2026);
  const acc = newDrainAcc();
  for (let i = 0; i < PAIRS; i++) {
    const [home, away] = pickPair(squads, rng);
    const hl = autoLineupDefaultFormation(home);
    const al = autoLineupDefaultFormation(away);
    for (let r = 0; r < REPEATS; r++) {
      const m = simulateMatch(home, away, formation, formation, hl, al);
      const subOut = new Set(m.substitutions.map((s) => s.playerOutId));
      const subIn = new Set(m.substitutions.map((s) => s.playerInId));
      for (const gp of m.players) {
        if (subOut.has(gp.id) || subIn.has(gp.id)) continue; // only players who played the full 90
        const g = ROLE_GROUP[gp.role];
        if (!g) continue;
        const loss = gp.startEnergy - gp.energy;
        acc[g].lossSum += loss;
        acc[g].impliedSum += loss / staminaFactor(gp.stamina);
        acc[g].n++;
      }
    }
  }
  return acc;
}

if (!ONLY_PART3) {
console.log(`=== Parte 1 — desgaste médio por linha (fitness 100, carga 0), ${PAIRS} pares × ${REPEATS} por liga ===`);
const pooled = newDrainAcc();
for (const league of LEAGUES) {
  const acc = await measureLeagueDrain(league);
  addDrainAcc(pooled, acc);
  console.log(league);
  console.table(
    Object.fromEntries(
      GROUPS.map((g) => [
        g,
        {
          "perda média (90')": +(acc[g].lossSum / Math.max(1, acc[g].n)).toFixed(2),
          "ENERGY_DRAIN implícito": +(acc[g].impliedSum / Math.max(1, acc[g].n)).toFixed(2),
          n: acc[g].n,
        },
      ]),
    ),
  );
}
console.log("Pooled (3 ligas):");
const impliedByLine = {} as Record<LineGroup, number>;
console.table(
  Object.fromEntries(
    GROUPS.map((g) => {
      const v = +(pooled[g].impliedSum / Math.max(1, pooled[g].n)).toFixed(2);
      impliedByLine[g] = v;
      return [
        g,
        {
          "perda média (90')": +(pooled[g].lossSum / Math.max(1, pooled[g].n)).toFixed(2),
          "ENERGY_DRAIN implícito": v,
          n: pooled[g].n,
        },
      ];
    }),
  ),
);
console.log("Constantes implícitas (ENERGY_DRAIN_BY_LINE):", impliedByLine);
console.log(
  "Constantes atuais em QuickSimConfig.ts:",
  Object.fromEntries(GROUPS.map((g) => [g, C.ENERGY_DRAIN_BY_LINE[g]])),
);
console.log(
  "Dentro de ±10%:",
  Object.fromEntries(
    GROUPS.map((g) => {
      const cur = C.ENERGY_DRAIN_BY_LINE[g];
      const target = impliedByLine[g]!;
      return [g, Math.abs(cur - target) <= Math.abs(target) * 0.1];
    }),
  ),
);
} // ONLY_PART3

// ── Part 2: descansado × cansado ─────────────────────────────────────────────────────────────

type WDL = { w: number; d: number; l: number; goalsFor: number; goalsAgainst: number; n: number };
const newWDL = (): WDL => ({ w: 0, d: 0, l: 0, goalsFor: 0, goalsAgainst: 0, n: 0 });
function addWDL(t: WDL, gf: number, ga: number) {
  t.n++;
  t.goalsFor += gf;
  t.goalsAgainst += ga;
  if (gf > ga) t.w++;
  else if (gf === ga) t.d++;
  else t.l++;
}
function fmtWDL(t: WDL) {
  return {
    "vitória fresco %": +((t.w / t.n) * 100).toFixed(1),
    "empate %": +((t.d / t.n) * 100).toFixed(1),
    "vitória cansado %": +((t.l / t.n) * 100).toFixed(1),
    "gols fresco/jogo": +(t.goalsFor / t.n).toFixed(2),
    "gols cansado/jogo": +(t.goalsAgainst / t.n).toFixed(2),
  };
}

function quickWDLFor(fixtures: { home: Squad; away: Squad; hl: string[]; al: string[] }[], fatiguePenalty: number): WDL {
  const prev = C.FATIGUE_PENALTY;
  C.FATIGUE_PENALTY = fatiguePenalty;
  const acc = newWDL();
  let qSeed = 99;
  for (const fx of fixtures) {
    for (let r = 0; r < QUICK_REPEATS; r++) {
      const { recording } = quickSimMatch(
        { fixtureId: "t", home: fx.home, away: fx.away, homeLineup: fx.hl, awayLineup: fx.al, homeRoles: roles, awayRoles: roles },
        mulberry32(qSeed++),
      );
      addWDL(acc, recording.score.home, recording.score.away);
    }
  }
  C.FATIGUE_PENALTY = prev;
  return acc;
}

if (!ONLY_PART3) {
console.log(
  `\n=== Parte 2 — descansado × cansado (premier_league; fresco fitness 100/carga 0 × cansado fitness 70/carga ${FITNESS.LOAD_HIGH}) ===`,
);
const freshLeague = await loadLeague("premier_league", 100, 0);
const tiredLeague = await loadLeague("premier_league", 70, FITNESS.LOAD_HIGH);
const tiredById = new Map(tiredLeague.map((s) => [s.id, s]));

// Each drawn pair (X, Y) plays BOTH orientations — X fresh vs Y tired, and Y fresh vs X tired
// — with the fresh side always at home. This cancels out any systematic strength gap between
// the two clubs (and the engine's lack of home advantage / quickSim's small HOME_ADVANTAGE)
// when the fresh-side stats are pooled across the whole sample: each club appears as "fresh"
// exactly as often as it appears as "tired".
const scenRng = mulberry32(4242);
const fixtures: { home: Squad; away: Squad; hl: string[]; al: string[] }[] = [];
for (let i = 0; i < SCEN_PAIRS; i++) {
  const [x, y] = pickPair(freshLeague, scenRng);
  const tiredX = tiredById.get(x.id)!;
  const tiredY = tiredById.get(y.id)!;
  const xl = autoLineupDefaultFormation(x);
  const yl = autoLineupDefaultFormation(y);
  fixtures.push({ home: x, away: tiredY, hl: xl, al: autoLineupDefaultFormation(tiredY) });
  fixtures.push({ home: y, away: tiredX, hl: yl, al: autoLineupDefaultFormation(tiredX) });
}

const engineWDL = newWDL();
for (const fx of fixtures) {
  for (let r = 0; r < SCEN_REPEATS; r++) {
    const m = simulateMatch(fx.home, fx.away, formation, formation, fx.hl, fx.al);
    addWDL(engineWDL, m.score.A, m.score.B);
  }
}
console.log("Motor (fixo, não muda com FATIGUE_PENALTY):");
console.table({ motor: fmtWDL(engineWDL) });

const CANDIDATES = [0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 1.8];
console.log(`quickSim, ${QUICK_REPEATS} repetições por confronto, varrendo FATIGUE_PENALTY:`);
console.table(
  Object.fromEntries(CANDIDATES.map((fp) => [`FATIGUE_PENALTY=${fp}`, fmtWDL(quickWDLFor(fixtures, fp))])),
);
console.log(`FATIGUE_PENALTY atual em QuickSimConfig.ts: ${C.FATIGUE_PENALTY}`);
} // ONLY_PART3

// ── Part 3: engine goal-difference impact per scenario (soften + recalibrate, Task 1) ─────────
//
// Measures the average goal difference (fresh − tired) the engine's fatigue curve produces for
// a handful of (fitness/load) scenarios, pooled over premier_league + a mid `of_*` league, both
// orientations (each pair plays fresh-home/tired-away AND tired-home/fresh-away, so team-quality
// and any home-advantage bias cancel out when pooling — see Part 2's fixture construction). A
// control of fitness 90/load 0 vs fitness 90/load 0 is architecturally GD ≈ 0 (both sides
// identical) — included with the same N as a sanity check that nothing else biases the pooling.
//
// Usage: bun scripts/fatigue-calibrate.ts [pairs] [repeats] [scenPairs] [scenRepeats] [scen3Pairs] [scen3Repeats]
// Env: FC_ONLY_PART3=1 skips Parts 1–2 for fast iteration while tuning the curve.

type FatigueScenario = { name: string; fresh: { fitness: number; load: number }; tired: { fitness: number; load: number } };
const FATIGUE_SCENARIOS: FatigueScenario[] = [
  { name: "95/0 vs 80/90 (target GD +0.2 to +0.35)", fresh: { fitness: 95, load: 0 }, tired: { fitness: 80, load: 90 } },
  { name: "90/0 vs 70/0 (target GD +0.4 to +0.6)", fresh: { fitness: 90, load: 0 }, tired: { fitness: 70, load: 0 } },
  { name: "90/0 vs 50/200 (target GD +1.0 to +1.5)", fresh: { fitness: 90, load: 0 }, tired: { fitness: 50, load: 200 } },
  { name: "control 90/0 vs 90/0 (target GD ≈ 0)", fresh: { fitness: 90, load: 0 }, tired: { fitness: 90, load: 0 } },
];
const SCENARIO_LEAGUES = ["premier_league", "of_championship"];
const SCEN3_PAIRS = Number(process.argv[6] ?? 60);
const SCEN3_REPEATS = Number(process.argv[7] ?? 2);

type GDAcc = { gdSum: number; n: number; freshW: number; draws: number; tiredW: number };
const newGDAcc = (): GDAcc => ({ gdSum: 0, n: 0, freshW: 0, draws: 0, tiredW: 0 });
function addGD(acc: GDAcc, gf: number, ga: number) {
  acc.gdSum += gf - ga;
  acc.n++;
  if (gf > ga) acc.freshW++;
  else if (gf === ga) acc.draws++;
  else acc.tiredW++;
}
function fmtGD(acc: GDAcc) {
  return {
    "GD médio (fresco − cansado)": +(acc.gdSum / acc.n).toFixed(3),
    "vitória fresco %": +((acc.freshW / acc.n) * 100).toFixed(1),
    "empate %": +((acc.draws / acc.n) * 100).toFixed(1),
    "vitória cansado %": +((acc.tiredW / acc.n) * 100).toFixed(1),
    n: acc.n,
  };
}

async function measureScenarioGD(
  league: string,
  scenario: FatigueScenario,
  pairs: number,
  repeats: number,
  seed: number,
): Promise<GDAcc> {
  const freshLeague = await loadLeague(league, scenario.fresh.fitness, scenario.fresh.load);
  const tiredLeague = await loadLeague(league, scenario.tired.fitness, scenario.tired.load);
  const tiredById = new Map(tiredLeague.map((s) => [s.id, s]));
  const rng = mulberry32(seed);
  const acc = newGDAcc();
  for (let i = 0; i < pairs; i++) {
    const [x, y] = pickPair(freshLeague, rng);
    const tiredX = tiredById.get(x.id)!;
    const tiredY = tiredById.get(y.id)!;
    const xl = autoLineupDefaultFormation(x);
    const yl = autoLineupDefaultFormation(y);
    const fixtures = [
      { home: x, away: tiredY, hl: xl, al: autoLineupDefaultFormation(tiredY) },
      { home: y, away: tiredX, hl: yl, al: autoLineupDefaultFormation(tiredX) },
    ];
    for (const fx of fixtures) {
      for (let r = 0; r < repeats; r++) {
        const m = simulateMatch(fx.home, fx.away, formation, formation, fx.hl, fx.al);
        addGD(acc, m.score.A, m.score.B);
      }
    }
  }
  return acc;
}

console.log(
  `\n=== Parte 3 — impacto no GD por cenário (${SCEN3_PAIRS} pares × 2 orientações × ${SCEN3_REPEATS} repetições por liga; ligas: ${SCENARIO_LEAGUES.join(", ")}) ===`,
);
let seed3 = 5000;
for (const scenario of FATIGUE_SCENARIOS) {
  console.log(scenario.name);
  const pooled3 = newGDAcc();
  for (const league of SCENARIO_LEAGUES) {
    const acc = await measureScenarioGD(league, scenario, SCEN3_PAIRS, SCEN3_REPEATS, seed3++);
    pooled3.gdSum += acc.gdSum;
    pooled3.n += acc.n;
    pooled3.freshW += acc.freshW;
    pooled3.draws += acc.draws;
    pooled3.tiredW += acc.tiredW;
    console.log(`  ${league}:`, fmtGD(acc));
  }
  console.log("  pooled:", fmtGD(pooled3));
}
console.log(
  `Curva atual: PHYSICAL=${FATIGUE_MAX_REDUCTION_PHYSICAL} SEMI=${FATIGUE_MAX_REDUCTION_SEMI} TECH=${FATIGUE_MAX_REDUCTION_TECH} POWER=${FATIGUE_CURVE_POWER}`,
);
