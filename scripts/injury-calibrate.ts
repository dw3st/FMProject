/**
 * Calibrates `INJURY.BASE` (per-minute risk) and `INJURY.CONTACT_BASE` (tackle / loose-ball duel
 * risk) against the full engine — Task 2 of `docs/superpowers/plans/2026-09-28-injuries.md`. See
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
 *   --apply  writes the calibrated BASE/CONTACT_BASE back into injuryConfig.ts.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";
import { INJURY } from "@/Domain/injury/injuryConfig";

const LEAGUES = ["premier_league", "of_championship"];
const MATCHES_PER_LEAGUE = Number(process.argv[2] ?? 150);
const APPLY = process.argv.includes("--apply");
const TARGET_PER_MATCH = 0.3;

// `INJURY` is `as const` for its TYPES only — the object itself isn't frozen, so BASE/CONTACT_BASE
// can be scaled in-process between iterations without re-running the (expensive) engine matches
// per candidate. Same trick as `scripts/fatigue-calibrate.ts`.
const C = INJURY as unknown as { BASE: number; CONTACT_BASE: number };

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

async function loadLeague(league: string): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) => {
      const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
      // Fresh fitness/load for every player — isolates age/strength as the only remaining injury
      // factors, so the measured rate reflects the baseline calibration target, not a squad's
      // current fatigue state (which the spec calibrates separately, via the engine's real minute
      // and contact-event volume anyway).
      return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100, load: 0 } })) };
    }),
  );
}

function pickPair(squads: Squad[], rng: () => number): [Squad, Squad] {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  return [home, away];
}

async function measureLeague(league: string, n: number, rng: () => number): Promise<{ matches: number; injuries: number }> {
  const squads = await loadLeague(league);
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

async function measureAll(): Promise<{ matches: number; injuries: number; perMatch: number }> {
  const rng = mulberry32(2026);
  let matches = 0;
  let injuries = 0;
  for (const league of LEAGUES) {
    const r = await measureLeague(league, MATCHES_PER_LEAGUE, rng);
    matches += r.matches;
    injuries += r.injuries;
    console.log(`  ${league}: ${r.injuries} injuries / ${r.matches} matches = ${(r.injuries / r.matches).toFixed(3)}/match`);
  }
  return { matches, injuries, perMatch: injuries / matches };
}

async function main() {
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

  if (APPLY) {
    const path = fileURLToPath(new URL("../src/Domain/injury/injuryConfig.ts", import.meta.url));
    let src = await Bun.file(path).text();
    src = src.replace(/BASE: 0\.3 \/ \(22 \* 90\),/, `BASE: ${C.BASE},`);
    src = src.replace(/CONTACT_BASE: 0\.004,/, `CONTACT_BASE: ${C.CONTACT_BASE},`);
    await Bun.write(path, src);
    console.log(`\nApplied to ${path}`);
  } else {
    console.log("\n(dry run — pass --apply to write injuryConfig.ts)");
  }
}

main();
