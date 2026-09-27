/**
 * Engine vs quickSim on CROSS-league matches (continental ties): for every pair of clubs
 * (top `n` of league A × top `n` of league B, both venues), `repeats` engine matches and
 * `quickRepeats` quickSim matches. Prints, per engine: stronger-side (higher teamLevel) win /
 * draw / loss rates and goals per match, and the gap between the engines.
 *
 *   bun scripts/quicksim-crossleague.ts <leagueA> <leagueB> [n=6] [repeats=4] [quickRepeats=50]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { quickSimMatch, teamLevel, teamStrength } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32 } from "@/Domain/rng";

const [leagueA, leagueB, nArg, repArg, qArg] = process.argv.slice(2);
if (!leagueA || !leagueB) throw new Error("usage: quicksim-crossleague <leagueA> <leagueB> [n] [repeats] [quickRepeats]");
const N = Number(nArg ?? 6), REPEATS = Number(repArg ?? 4), QUICK = Number(qArg ?? 50);

const SQUADS = fileURLToPath(new URL("../src/Data/squads/", import.meta.url));
const FORMATION = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const ROLES = slotRoles(FORMATION);

function load(league: string): Squad[] {
  return readdirSync(join(SQUADS, league)).filter((f) => f.endsWith(".json")).map((f) => {
    const s = JSON.parse(readFileSync(join(SQUADS, league, f), "utf8")) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: p.seasonLog ?? emptySeasonLog() })) };
  });
}
const level = (s: Squad) => {
  // teamStrength expects the XI in slot order, aligned with ROLES.
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const xi = autoLineupDefaultFormation(s).map((id) => byId.get(id)).filter((p) => p !== undefined);
  return teamLevel(teamStrength(xi, ROLES));
};
const top = (league: string) => load(league).map((s) => ({ s, lv: level(s) })).sort((a, b) => b.lv - a.lv).slice(0, N);

type Tally = { w: number; d: number; l: number; goals: number; n: number };
const empty = (): Tally => ({ w: 0, d: 0, l: 0, goals: 0, n: 0 });
const add = (t: Tally, strongGoals: number, weakGoals: number) => {
  t.n++; t.goals += strongGoals + weakGoals;
  if (strongGoals > weakGoals) t.w++; else if (strongGoals < weakGoals) t.l++; else t.d++;
};

const engine = empty(), quick = empty();
let seed = 1;
for (const a of top(leagueA)) for (const b of top(leagueB)) for (const [home, away] of [[a, b], [b, a]] as const) {
  const strongIsHome = home.lv >= away.lv;
  const lh = autoLineupDefaultFormation(home.s), la = autoLineupDefaultFormation(away.s);
  for (let r = 0; r < REPEATS; r++) {
    const m = simulateMatch(home.s, away.s, FORMATION, FORMATION, lh, la);
    strongIsHome ? add(engine, m.score.A, m.score.B) : add(engine, m.score.B, m.score.A);
  }
  for (let r = 0; r < QUICK; r++) {
    const { recording } = quickSimMatch(
      { fixtureId: "x", home: home.s, away: away.s, homeLineup: lh, awayLineup: la, homeRoles: ROLES, awayRoles: ROLES },
      mulberry32(seed++),
    );
    strongIsHome ? add(quick, recording.score.home, recording.score.away) : add(quick, recording.score.away, recording.score.home);
  }
}

const row = (name: string, t: Tally) =>
  `${name.padEnd(9)} n=${String(t.n).padStart(5)}  strong W ${(100 * t.w / t.n).toFixed(1)}%  D ${(100 * t.d / t.n).toFixed(1)}%  L ${(100 * t.l / t.n).toFixed(1)}%  goals ${(t.goals / t.n).toFixed(2)}`;
console.log(`${leagueA} × ${leagueB} (top ${N} each, both venues)`);
console.log(row("engine", engine));
console.log(row("quickSim", quick));
console.log(`gap: strong-win ${(100 * (quick.w / quick.n - engine.w / engine.n)).toFixed(1)} pp, goals ${((quick.goals / quick.n) / (engine.goals / engine.n) * 100 - 100).toFixed(1)}%`);
