/**
 * Shot diagnostic — empirically measures where low-rated teams lose goals.
 *
 * Runs N matches per scenario (low-vs-low, high-vs-high, low-vs-high) and
 * aggregates per-team: shots, on-target%, off-target%, avg goalChance, goals,
 * sum xG. Subscribes to `shotResolved` to separate off-target (inPosts=false)
 * from on-target shots.
 *
 * Run: bun scripts/shotDiagnostic.ts
 */

import { simulateMatch } from '@/GameEngine/Domain/SimulateMatch';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { Player } from '@/Domain/Player';
import type { Squad } from '@/types/playerTypes';

const DATA = new URL('../src/Data/squads', import.meta.url).pathname;

async function loadSquad(league: string, id: string): Promise<Squad> {
  return (await Bun.file(`${DATA}/${league}/${id}.json`).json()) as Squad;
}

function teamAvg(sq: Squad): number {
  const rs = sq.players.map(p => Player.overallAvg(p));
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

// ── Shot aggregation via shotResolved ───────────────────────────────────────
// We can't map shooter.id → team from the event alone across matches cleanly,
// so we capture per-match: the shooter id set per team comes from result.players.
interface ShotAgg {
  shots: number;
  onTarget: number;
  offTarget: number;
  goals: number;
  sumGoalChance: number;   // only counts on-target shots (off-target has gc=0)
  sumXg: number;
  sumAcc: number;          // sum of shooter shootAccuracy (all shots)
}
function emptyAgg(): ShotAgg {
  return { shots: 0, onTarget: 0, offTarget: 0, goals: 0, sumGoalChance: 0, sumXg: 0, sumAcc: 0 };
}

// On-target rate bucketed by shooter accuracy (shared across all scenarios)
const accLow  = { shots: 0, onTarget: 0 };  // acc < 0.3
const accMid  = { shots: 0, onTarget: 0 };  // 0.3 <= acc < 0.6
const accHigh = { shots: 0, onTarget: 0 };  // acc >= 0.6

// Per-match capture buffer keyed by shooter id
let shotBuffer: Array<{ player: number; xg: number; goalChance: number; isGoal: boolean; inPosts: boolean }> = [];
gameBus.on('shotResolved', e => { shotBuffer.push({ ...e }); });

function runScenario(name: string, a: Squad, b: Squad, matches: number) {
  const aggA = emptyAgg();
  const aggB = emptyAgg();
  let goalsA = 0, goalsB = 0;

  for (let i = 0; i < matches; i++) {
    shotBuffer = [];
    const res = simulateMatch(a, b);
    goalsA += res.score.A;
    goalsB += res.score.B;

    const teamOf = new Map<number, 'A' | 'B'>();
    const accOf  = new Map<number, number>();
    for (const p of res.players) {
      teamOf.set(p.id, p.team);
      accOf.set(p.id, p.baseStats.withBall.shootAccuracy);
    }

    for (const s of shotBuffer) {
      const agg = teamOf.get(s.player) === 'B' ? aggB : aggA;
      agg.shots++;
      agg.sumXg += s.xg;
      agg.sumAcc += accOf.get(s.player) ?? 0;
      // Bucket on-target rate by shooter accuracy
      const acc = accOf.get(s.player) ?? 0;
      const bucket = acc < 0.3 ? accLow : acc < 0.6 ? accMid : accHigh;
      bucket.shots++;
      if (s.inPosts) bucket.onTarget++;
      if (s.inPosts) {
        agg.onTarget++;
        agg.sumGoalChance += s.goalChance;
        if (s.isGoal) agg.goals++;
      } else {
        agg.offTarget++;
      }
    }
  }

  const fmt = (agg: ShotAgg, goals: number, label: string) => {
    const shotsPer = (agg.shots / matches).toFixed(1);
    const onPct = agg.shots ? ((agg.onTarget / agg.shots) * 100).toFixed(0) : '0';
    const avgGc = agg.onTarget ? (agg.sumGoalChance / agg.onTarget).toFixed(3) : '0';
    const avgXg = agg.shots ? (agg.sumXg / agg.shots).toFixed(3) : '0';
    const avgAcc = agg.shots ? (agg.sumAcc / agg.shots).toFixed(2) : '0';
    const goalsPer = (goals / matches).toFixed(2);
    const convOn = agg.onTarget ? ((agg.goals / agg.onTarget) * 100).toFixed(0) : '0';
    console.log(
      `  ${label.padEnd(18)} goals/m=${goalsPer}  shots/m=${shotsPer}  onTarget=${onPct}%  ` +
      `avgGoalChance(on)=${avgGc}  avgXg=${avgXg}  conv(on)=${convOn}%  avgShooterAcc=${avgAcc}`,
    );
  };

  console.log(`\n=== ${name}  (avgA=${teamAvg(a).toFixed(2)} vs avgB=${teamAvg(b).toFixed(2)}, ${matches} matches) ===`);
  fmt(aggA, goalsA, 'Team A');
  fmt(aggB, goalsB, 'Team B');
}

const MATCHES = 80;

// Low-rated: brazil_serie_c
const lowA = await loadSquad('brazil_serie_c', '10862');
const lowB = await loadSquad('brazil_serie_c', '1197');
// High-rated: premier_league
const hiA = await loadSquad('premier_league', '33');
const hiB = await loadSquad('premier_league', '34');

runScenario('LOW vs LOW',   lowA, lowB, MATCHES);
runScenario('HIGH vs HIGH', hiA,  hiB,  MATCHES);
runScenario('LOW vs HIGH',  lowA, hiB,  MATCHES);

// ── On-target rate by shooter accuracy (across ALL scenarios) ───────────────
console.log('\n=== ON-TARGET% BY SHOOTER ACCURACY (all shots pooled) ===');
const bucketRow = (label: string, b: { shots: number; onTarget: number }) => {
  const pct = b.shots ? ((b.onTarget / b.shots) * 100).toFixed(0) : '0';
  console.log(`  ${label.padEnd(22)} shots=${String(b.shots).padStart(4)}  onTarget=${pct}%`);
};
bucketRow('acc < 0.30',        accLow);
bucketRow('0.30 <= acc < 0.60', accMid);
bucketRow('acc >= 0.60',       accHigh);
