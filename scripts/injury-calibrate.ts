/**
 * Calibrates `INJURY.BASE` (per-minute risk) and `INJURY.CONTACT_BASE` (tackle / loose-ball duel
 * risk) against the full engine — Task 2 of `docs/superpowers/archive/2026-09-28-injuries.md`. See
 * `docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Na partida".
 *
 * Runs N full engine matches (`simulateMatch`) across two leagues — the Premier League and one
 * mid-strength `of_*` league — with fresh squads (fitness 100, load 0, so age/strength are the
 * only remaining factors), counts `result.injuries.length` per match, and scales both constants
 * uniformly so the combined average lands on the ~0.3 injuries/match target from the spec (both
 * teams summed). A uniform scale is a reasonable simplification here: both constants enter the
 * respective probability formulas as a single linear multiplier (`injuryRatePerMinute` /
 * `contactInjuryChance` = BASE × energyFactor × loadFactor × ageFactor × strengthFactor), so for
 * the small probabilities involved the measured rate scales ~linearly in each constant — scaling
 * both by the same factor preserves their relative split (a couple of iterations converge on the
 * exact ratio needed since the correction only needs to close a small residual gap).
 *
 * Usage: bun scripts/injury-calibrate.ts [matchesPerLeague=150] [--apply]
 *   --apply      writes the calibrated BASE/CONTACT_BASE back into injuryConfig.ts.
 *   --quicksim   ALSO runs the same squads through quickSim (Task 3) and reports its injuries/match
 *                against the (possibly just-recalibrated) engine baseline, adjusting
 *                `INJURY.QUICKSIM_CONTACT_SCALE` to close the gap to within ±15%. Implies --apply
 *                writes that constant too.
 *   --realistic  ALSO runs the engine at realistic matchday fitness/load (88 / 100 — a typical
 *                congested-calendar starter, not the fresh-squad baseline used for the main
 *                calibration) and reports injuries/match. Report-only: never adjusts BASE/
 *                CONTACT_BASE — the main calibration intentionally isolates age/strength via a
 *                fresh squad; this is a sanity check that a realistic fatigue/load state doesn't
 *                blow the target up (the energy/load multipliers in `injuryRatePerMinute` can
 *                push per-minute risk up to ~3x — see `injury.ts`).
 *   --pitch <modes>  MEASURE ONLY (no calibration, nothing written): injuries/match by pitch
 *                condition (`docs/superpowers/specs/2026-10-08-living-facilities-design.md` §9, M1/M2).
 *                Modes, comma-separated: `none` (no pitch, the engine before), `ai` (the home club's
 *                AI pitch: tier × a season fraction drawn per match), or a fixed condition (`20`,
 *                `90`). Engine at matchday fitness 88 / load 0, the same pairs and the same
 *                Math.random stream per match in every mode (paired). With `--quicksim` also the
 *                quickSim over the 26 calibration leagues (paired, exact).
 *                e.g. `bun scripts/injury-calibrate.ts 150 --pitch none,ai,20,90 --quicksim`
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import {
  autoLineupDefaultFormation,
  slotRoles,
} from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { INJURY } from "@/Domain/injury/injuryConfig";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { aiPitchCondition } from "@/Domain/facilities/pitch";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";

const LEAGUES = ["premier_league", "of_championship"];
const MATCHES_PER_LEAGUE = Number(process.argv[2] ?? 150);
const APPLY = process.argv.includes("--apply");
const DO_QUICKSIM = process.argv.includes("--quicksim");
const DO_REALISTIC = process.argv.includes("--realistic");
const TARGET_PER_MATCH = 0.3;
/** Report-only sanity check — never retuned unless it blows well past this. */
const REALISTIC_WARN_THRESHOLD = 0.45;

// `INJURY` is `as const` for its TYPES only — the object itself isn't frozen, so BASE/CONTACT_BASE
// can be scaled in-process between iterations without re-running the (expensive) engine matches
// per candidate. Same trick as `scripts/fatigue-calibrate.ts`.
const C = INJURY as unknown as { BASE: number; CONTACT_BASE: number; QUICKSIM_CONTACT_SCALE: number };

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = slotRoles(formation);

async function loadLeague(league: string, fitness = 100, load = 0): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) => {
      const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
      // Fresh fitness/load (the default) isolates age/strength as the only remaining injury
      // factors, so the measured rate reflects the baseline calibration target, not a squad's
      // current fatigue state. `--realistic` overrides fitness/load to a typical matchday value
      // instead, as a report-only sanity check (see the module doc comment).
      return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness, load } })) };
    }),
  );
}

function pickPair(squads: Squad[], rng: () => number): [Squad, Squad] {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  return [home, away];
}

async function measureLeague(
  league: string,
  n: number,
  rng: () => number,
  fitness = 100,
  load = 0,
): Promise<{ matches: number; injuries: number }> {
  const squads = await loadLeague(league, fitness, load);
  let injuries = 0;
  for (let i = 0; i < n; i++) {
    const [home, away] = pickPair(squads, rng);
    const hl = autoLineupDefaultFormation(home);
    const al = autoLineupDefaultFormation(away);
    const m = simulateMatch(home, away, formation, formation, hl, al);
    injuries += m.injuries.length;
  }
  return { matches: n, injuries };
}

async function measureAll(fitness = 100, load = 0): Promise<{ matches: number; injuries: number; perMatch: number }> {
  const rng = mulberry32(2026);
  let matches = 0;
  let injuries = 0;
  for (const league of LEAGUES) {
    const r = await measureLeague(league, MATCHES_PER_LEAGUE, rng, fitness, load);
    matches += r.matches;
    injuries += r.injuries;
    console.log(`  ${league}: ${r.injuries} injuries / ${r.matches} matches = ${(r.injuries / r.matches).toFixed(3)}/match`);
  }
  return { matches, injuries, perMatch: injuries / matches };
}

// ── Pitch measurement (M1/M2 of the living facilities) ─────────────────────────

const PITCH_ARG = (() => {
  const i = process.argv.indexOf("--pitch");
  return i >= 0 ? (process.argv[i + 1] ?? "none,ai,20,90").split(",") : null;
})();

const QUICK_LEAGUES = [
  "premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1", "brazil_serie_a", "brazil_serie_b", "brazil_serie_c",
  "of_allsvenskan", "of_argentine_premier_division", "of_championship", "of_danish_superliga", "of_ekstraklasa",
  "of_eredivisie", "of_greek_super_league", "of_italian_serie_c_a", "of_j_league", "of_kenyan_premier_division",
  "of_liga_mx", "of_major_league_soccer", "of_portuguese_primeira_liga", "of_russian_second_division_b_group_2",
  "of_saudi_professional_league", "of_spanish_second_division", "of_turkish_super_league", "of_uzbek_super_league",
];

/** Pitch of one match in a mode (`fraction` drawn per match, the same in every mode). */
function pitchOf(mode: string, home: Squad, fraction: number): number | undefined {
  if (mode === "none") return undefined;
  if (mode === "ai") return aiPitchCondition(financialTierOf(home), fraction);
  return Number(mode);
}

interface Fixture { home: Squad; away: Squad; hl: string[]; al: string[]; fraction: number; seed: number }

async function fixturesOf(league: string, n: number, salt: number): Promise<Fixture[]> {
  const squads = await loadLeague(league, 88, 0);
  const rng = mulberry32(2026 + salt);
  return Array.from({ length: n }, (_, i) => {
    const [home, away] = pickPair(squads, rng);
    return { home, away, hl: autoLineupDefaultFormation(home), al: autoLineupDefaultFormation(away), fraction: rng(), seed: salt * 100_003 + i };
  });
}

async function measurePitch(modes: string[]): Promise<void> {
  console.log(`Pitch measurement — engine ${LEAGUES.join(", ")} × ${MATCHES_PER_LEAGUE}, fitness 88, paired; modes ${modes.join(", ")}\n`);
  const engine: Record<string, { matches: number; injuries: number; pitch: number; below40: number }> = {};
  for (const m of modes) engine[m] = { matches: 0, injuries: 0, pitch: 0, below40: 0 };
  const realRandom = Math.random;
  for (const [li, league] of LEAGUES.entries()) {
    const fixtures = await fixturesOf(league, MATCHES_PER_LEAGUE, li + 1);
    for (const f of fixtures) {
      for (const m of modes) {
        const pitch = pitchOf(m, f.home, f.fraction);
        Math.random = mulberry32(f.seed);
        const r = simulateMatch(f.home, f.away, formation, formation, f.hl, f.al, pitch === undefined ? {} : { pitchCondition: pitch });
        const e = engine[m]!;
        e.matches++;
        e.injuries += r.injuries.length;
        e.pitch += pitch ?? 90;
        if (pitch !== undefined && pitch < 40) e.below40++;
      }
    }
    console.log(`  ${league} done`);
  }
  Math.random = realRandom;
  const base = engine[modes[0]!]!;
  console.log("\nEngine (both teams, per match):");
  for (const m of modes) {
    const e = engine[m]!;
    const per = e.injuries / e.matches;
    console.log(`  ${m.padEnd(5)} ${per.toFixed(3)} injuries/match (${e.injuries}/${e.matches}) · ×${(per / (base.injuries / base.matches)).toFixed(3)} vs ${modes[0]} · mean pitch ${(e.pitch / e.matches).toFixed(1)} · below 40%: ${(100 * e.below40 / e.matches).toFixed(1)}%`);
  }

  if (!DO_QUICKSIM) return;
  const quick: Record<string, { matches: number; injuries: number }> = {};
  for (const m of modes) quick[m] = { matches: 0, injuries: 0 };
  for (const [li, league] of QUICK_LEAGUES.entries()) {
    const fixtures = await fixturesOf(league, MATCHES_PER_LEAGUE * 10, 100 + li);
    for (const [i, f] of fixtures.entries()) {
      for (const m of modes) {
        const pitch = pitchOf(m, f.home, f.fraction);
        const { recording } = quickSimMatch({
          fixtureId: `pitch-${league}-${i}`, home: f.home, away: f.away, homeLineup: f.hl, awayLineup: f.al,
          homeRoles: roles, awayRoles: roles, ...(pitch === undefined ? {} : { pitchCondition: pitch }),
        }, mulberry32(f.seed));
        quick[m]!.matches++;
        quick[m]!.injuries += recording.injuries?.length ?? 0;
      }
    }
  }
  const qb = quick[modes[0]!]!;
  console.log(`\nquickSim (${QUICK_LEAGUES.length} leagues × ${MATCHES_PER_LEAGUE * 10}, paired):`);
  for (const m of modes) {
    const q = quick[m]!;
    const per = q.injuries / q.matches;
    console.log(`  ${m.padEnd(5)} ${per.toFixed(3)} injuries/match · ×${(per / (qb.injuries / qb.matches)).toFixed(3)} vs ${modes[0]}`);
  }
}

async function main() {
  if (PITCH_ARG) return measurePitch(PITCH_ARG);
  console.log(`Injury calibration — ${LEAGUES.join(", ")}, ${MATCHES_PER_LEAGUE} matches/league (${LEAGUES.length * MATCHES_PER_LEAGUE} total)`);
  console.log(`Target: ${TARGET_PER_MATCH} injuries/match (both teams combined)\n`);

  console.log(`Baseline (BASE=${C.BASE.toExponential(4)}, CONTACT_BASE=${C.CONTACT_BASE.toExponential(4)}):`);
  let result = await measureAll();
  console.log(`  → ${result.perMatch.toFixed(3)}/match\n`);

  // Up to 3 correction rounds — the linear-scale assumption converges fast since we're scaling
  // the same two constants that directly multiply every probability, but a couple of extra
  // rounds absorb the residual nonlinearity from a small number of matches (finite-sample noise).
  for (let round = 1; round <= 3 && Math.abs(result.perMatch - TARGET_PER_MATCH) / TARGET_PER_MATCH > 0.1; round++) {
    const scale = result.perMatch > 0 ? TARGET_PER_MATCH / result.perMatch : 2;
    C.BASE *= scale;
    C.CONTACT_BASE *= scale;
    console.log(`Round ${round}: scaling by ${scale.toFixed(3)} → BASE=${C.BASE.toExponential(4)}, CONTACT_BASE=${C.CONTACT_BASE.toExponential(4)}`);
    result = await measureAll();
    console.log(`  → ${result.perMatch.toFixed(3)}/match\n`);
  }

  console.log("─".repeat(60));
  console.log(`Final: BASE=${C.BASE.toExponential(6)}, CONTACT_BASE=${C.CONTACT_BASE.toExponential(6)}`);
  console.log(`Measured: ${result.perMatch.toFixed(3)} injuries/match over ${result.matches} matches (target ${TARGET_PER_MATCH})`);

  // ── quickSim comparison (Task 3) ──────────────────────────────────────────
  if (DO_QUICKSIM) {
    console.log("\n" + "─".repeat(60));
    console.log("quickSim vs engine (Task 3, ±15% target):\n");
    let qResult = await measureAllQuickSim();
    console.log(`  → ${qResult.perMatch.toFixed(3)}/match (engine: ${result.perMatch.toFixed(3)}/match)\n`);

    for (
      let round = 1;
      round <= 3 && Math.abs(qResult.perMatch - result.perMatch) / result.perMatch > 0.15;
      round++
    ) {
      const scale = qResult.perMatch > 0 ? (result.perMatch / qResult.perMatch) : 2;
      // Only the contact component scales with QUICKSIM_CONTACT_SCALE — approximate the
      // correction by applying the full ratio to it anyway (a couple of rounds absorb the
      // residual, same reasoning as the BASE/CONTACT_BASE loop above).
      C.QUICKSIM_CONTACT_SCALE = Math.max(0, C.QUICKSIM_CONTACT_SCALE * scale);
      console.log(`Round ${round}: scaling QUICKSIM_CONTACT_SCALE by ${scale.toFixed(3)} → ${C.QUICKSIM_CONTACT_SCALE.toFixed(4)}`);
      qResult = await measureAllQuickSim();
      console.log(`  → ${qResult.perMatch.toFixed(3)}/match\n`);
    }

    const gap = result.perMatch > 0 ? ((qResult.perMatch - result.perMatch) / result.perMatch) * 100 : 0;
    console.log("─".repeat(60));
    console.log(`quickSim: ${qResult.perMatch.toFixed(3)} injuries/match over ${qResult.matches} matches`);
    console.log(`Engine:   ${result.perMatch.toFixed(3)} injuries/match over ${result.matches} matches`);
    console.log(`Gap: ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}% (target ±15%)`);
    console.log(`Final QUICKSIM_CONTACT_SCALE=${C.QUICKSIM_CONTACT_SCALE.toFixed(6)}`);
  }

  // ── Realistic matchday fitness/load sanity check (report-only) ───────────
  if (DO_REALISTIC) {
    console.log("\n" + "─".repeat(60));
    console.log("Realistic matchday fitness/load (fitness=88, load=100) — report only, no retuning:\n");
    const realistic = await measureAll(88, 100);
    console.log(`  → ${realistic.perMatch.toFixed(3)}/match (fresh baseline: ${result.perMatch.toFixed(3)}/match)`);
    if (realistic.perMatch > REALISTIC_WARN_THRESHOLD) {
      console.log(`  ⚠ exceeds the ${REALISTIC_WARN_THRESHOLD}/match warn threshold — consider retuning.`);
    } else {
      console.log(`  within the ${REALISTIC_WARN_THRESHOLD}/match warn threshold — BASE/CONTACT_BASE left as-is.`);
    }
  }

  if (APPLY) {
    const path = fileURLToPath(new URL("../src/Domain/injury/injuryConfig.ts", import.meta.url));
    let src = await Bun.file(path).text();
    src = src.replace(/BASE: [-0-9.eE/*() ]+,/, `BASE: ${C.BASE},`);
    src = src.replace(/CONTACT_BASE: [-0-9.eE]+,/, `CONTACT_BASE: ${C.CONTACT_BASE},`);
    if (DO_QUICKSIM) {
      src = src.replace(/QUICKSIM_CONTACT_SCALE: [-0-9.eE]+,/, `QUICKSIM_CONTACT_SCALE: ${C.QUICKSIM_CONTACT_SCALE},`);
    }
    await Bun.write(path, src);
    console.log(`\nApplied to ${path}`);
  } else {
    console.log("\n(dry run — pass --apply to write injuryConfig.ts)");
  }
}

/**
 * quickSim's injuries/match (Task 3) — same squads/pairs as the engine baseline
 * (`measureLeague`), same seed sequence per league so the pair selection matches, but resolved
 * with `quickSimMatch` (Poisson risk, no substitutions) instead of the full tick-by-tick engine.
 */
async function measureQuickSimLeague(
  league: string,
  n: number,
  rng: () => number,
): Promise<{ matches: number; injuries: number }> {
  const squads = await loadLeague(league);
  let injuries = 0;
  for (let i = 0; i < n; i++) {
    const [home, away] = pickPair(squads, rng);
    const hl = autoLineupDefaultFormation(home);
    const al = autoLineupDefaultFormation(away);
    const { recording } = quickSimMatch(
      {
        fixtureId: `calib-${league}-${i}`,
        home,
        away,
        homeLineup: hl,
        awayLineup: al,
        homeRoles: roles,
        awayRoles: roles,
      },
      rng,
    );
    injuries += recording.injuries?.length ?? 0;
  }
  return { matches: n, injuries };
}

async function measureAllQuickSim(): Promise<{ matches: number; injuries: number; perMatch: number }> {
  const rng = mulberry32(2026);
  let matches = 0;
  let injuries = 0;
  for (const league of LEAGUES) {
    const r = await measureQuickSimLeague(league, MATCHES_PER_LEAGUE, rng);
    matches += r.matches;
    injuries += r.injuries;
    console.log(`  ${league}: ${r.injuries} injuries / ${r.matches} matches = ${(r.injuries / r.matches).toFixed(3)}/match`);
  }
  return { matches, injuries, perMatch: injuries / matches };
}

main();
