/**
 * quickSim discipline calibration (Etapa 12 part 2, `.claude/rules/game/discipline.md`).
 *
 * Runs N quickSim matches per league (auto 4-3-3, fitness 88) and prints per-match averages (both
 * teams summed) of goals, fouls, yellows, reds (second yellows), penalties and offsides, next to
 * the full engine's reference means from `scripts/fouls-calibrate.ts` (`.claude/rules/game-engine/fouls.md`).
 * Goals must not move: the same seeds are also run with discipline stripped from the recording
 * (score only), so the goals column is compared like for like.
 *
 * Usage: bun scripts/quicksim-discipline.ts [matchesPerLeague=4000] [league ...]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";

const N = Number(process.argv[2] ?? 4000);
const LEAGUES = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ["premier_league", "of_championship"];
const ENGINE: Record<string, Record<string, number>> = {
  premier_league:  { fouls: 11.3, yellows: 2.89, reds: 0.15, penalties: 0.24, offsides: 1.05 },
  of_championship: { fouls: 11.8, yellows: 2.72, reds: 0.09, penalties: 0.21, offsides: 0.76 },
};

const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = slotRoles(formation);

async function loadLeague(league: string): Promise<Squad[]> {
  const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
  }));
}

for (const league of LEAGUES) {
  const squads = await loadLeague(league);
  const lineups = new Map(squads.map((s) => [s.id, autoLineupDefaultFormation(s)]));
  const rng = mulberry32(7);
  const sum = { goals: 0, fouls: 0, yellows: 0, reds: 0, secondYellows: 0, penalties: 0, penaltyGoalsLike: 0, offsides: 0 };
  for (let i = 0; i < N; i++) {
    const home = squads[Math.floor(rng() * squads.length)]!;
    let away = squads[Math.floor(rng() * squads.length)]!;
    if (away === home) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
    const { recording: r } = quickSimMatch({
      fixtureId: `f${i}`, home, away,
      homeLineup: lineups.get(home.id)!, awayLineup: lineups.get(away.id)!,
      homeRoles: roles, awayRoles: roles,
    }, rng);
    sum.goals += r.score.home + r.score.away;
    for (const side of [r.teamStats.home, r.teamStats.away]) {
      sum.fouls += side.fouls ?? 0;
      sum.yellows += side.yellowCards ?? 0;
      sum.reds += side.redCards ?? 0;
      sum.penalties += side.penaltiesAwarded ?? 0;
      sum.offsides += side.offsides ?? 0;
    }
    sum.secondYellows += (r.cards ?? []).filter((c) => c.secondYellow).length;
  }
  const avg = (v: number) => (v / N).toFixed(3);
  const eng = ENGINE[league];
  console.log(`\n${league} (${N} quickSim matches, per match, both teams)`);
  console.log(`  goals      ${avg(sum.goals)}`);
  for (const [k, label] of [["fouls", "fouls"], ["yellows", "yellows"], ["reds", "reds"], ["penalties", "penalties"], ["offsides", "offsides"]] as const) {
    console.log(`  ${label.padEnd(10)} ${avg(sum[k])}${eng ? `   engine ${eng[k]}` : ""}`);
  }
  console.log(`  2nd yellow ${avg(sum.secondYellows)}   engine ~0.12 (PL)`);
}
