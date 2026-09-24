/**
 * Chance-creation diagnostic — empirically locates WHERE low-rated teams lose
 * the possession chain before it becomes a shot.
 *
 * For each scenario (low-vs-low, high-vs-high, low-vs-high) it sums per-team
 * teamStats across N matches and reports the funnel:
 *   passes (att/comp/fail → completion%)
 *   dribbles (won/lost → success%)
 *   through balls (att/comp → completion%)
 *   turnovers (failed passes + lost dribbles) per match
 *   defensive wins conceded (opponent interceptions + tackles) per match
 *   shots/match and SHOT EFFICIENCY (shots per 100 completed passes)
 *
 * The question this answers: do low teams shoot less because they (a) complete
 * fewer passes, (b) lose more dribbles, (c) get dispossessed more, or (d) move
 * the ball fine but never convert possession into a shot?
 *
 * Run: bun scripts/chanceCreationDiagnostic.ts
 */

import { simulateMatch } from '@/GameEngine/Domain/SimulateMatch';
import { Player } from '@/Domain/Player';
import type { Squad } from '@/types/playerTypes';
import type { TeamStats } from '@/GameEngine/Domain/Statistics';
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL('../src/Data/squads', import.meta.url));

async function loadSquad(league: string, id: string): Promise<Squad> {
  return (await Bun.file(`${DATA}/${league}/${id}.json`).json()) as Squad;
}

function teamAvg(sq: Squad): number {
  const rs = sq.players.map(p => Player.overallAvg(p));
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

function emptyTeam(): TeamStats {
  return {
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0, xg: 0,
    dribblesWon: 0, dribblesLost: 0,
    throughBallsAttempted: 0, throughBallsCompleted: 0,
    throughBallsLostInFlight: 0, throughBallsLostInRace: 0,
    throughBallsLostInDuel: 0, looseBallsWon: 0,
    switchPlays: 0,
  };
}

function addInto(acc: TeamStats, s: TeamStats): void {
  for (const k of Object.keys(acc) as (keyof TeamStats)[]) acc[k] += s[k];
}

function runScenario(name: string, a: Squad, b: Squad, matches: number) {
  const aggA = emptyTeam();
  const aggB = emptyTeam();

  for (let i = 0; i < matches; i++) {
    const res = simulateMatch(a, b);
    addInto(aggA, res.teamStats.A);
    addInto(aggB, res.teamStats.B);
  }

  const fmt = (t: TeamStats, opp: TeamStats, label: string) => {
    const m       = matches;
    const passAtt = t.passesAttempted;
    const comp    = passAtt ? ((t.passesCompleted / passAtt) * 100).toFixed(0) : '0';
    const dribTot = t.dribblesWon + t.dribblesLost;
    const dribPct = dribTot ? ((t.dribblesWon / dribTot) * 100).toFixed(0) : '0';
    const tbPct   = t.throughBallsAttempted
      ? ((t.throughBallsCompleted / t.throughBallsAttempted) * 100).toFixed(0) : '0';
    const turnovers = (t.passesFailed + t.dribblesLost) / m;
    const concededWins = (opp.interceptions + opp.tackles) / m; // opp won ball off us
    const shotsPer  = (t.shots / m).toFixed(1);
    // chance-creation efficiency: shots per 100 completed passes
    const shotEff   = t.passesCompleted ? ((t.shots / t.passesCompleted) * 100).toFixed(1) : '0';
    console.log(
      `  ${label.padEnd(10)} ` +
      `passComp/m=${(t.passesCompleted / m).toFixed(0).padStart(3)} (${comp}%)  ` +
      `drib=${dribPct}%(${(dribTot / m).toFixed(1)}/m)  ` +
      `TB=${tbPct}%(${(t.throughBallsAttempted / m).toFixed(1)}/m)  ` +
      `turnovers/m=${turnovers.toFixed(1)}  ` +
      `lostToDef/m=${concededWins.toFixed(1)}  ` +
      `shots/m=${shotsPer}  shots/100cmp=${shotEff}`,
    );
    // TB-loss breakdown: where do through balls die?
    const flight = (t.throughBallsLostInFlight / m).toFixed(2);
    const race   = (t.throughBallsLostInRace   / m).toFixed(2);
    const duel   = (t.throughBallsLostInDuel    / m).toFixed(2);
    console.log(
      `             TB att/m=${(t.throughBallsAttempted / m).toFixed(2)}  comp/m=${(t.throughBallsCompleted / m).toFixed(2)}  ` +
      `lostFlight/m=${flight}  lostRace/m=${race}  lostDuel/m=${duel}`,
    );
  };

  console.log(`\n=== ${name}  (avgA=${teamAvg(a).toFixed(2)} vs avgB=${teamAvg(b).toFixed(2)}, ${matches} matches) ===`);
  fmt(aggA, aggB, 'Team A');
  fmt(aggB, aggA, 'Team B');
}

const MATCHES = 80;

const lowA = await loadSquad('brazil_serie_c', '10862');
const lowB = await loadSquad('brazil_serie_c', '1197');
const hiA  = await loadSquad('premier_league', '33');
const hiB  = await loadSquad('premier_league', '34');

runScenario('LOW vs LOW',   lowA, lowB, MATCHES);
runScenario('HIGH vs HIGH', hiA,  hiB,  MATCHES);
runScenario('LOW vs HIGH',  lowA, hiB,  MATCHES);
