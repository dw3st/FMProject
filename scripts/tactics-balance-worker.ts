/**
 * Tactics Balance Worker — runs N matches for ONE tactical-style pair and
 * posts the raw totals back to the main thread.
 *
 * Each worker has its own module registry (isolated per Worker), so
 * applyTeamTacticsConfig / applyTeamAttackConfig calls in one worker do not
 * leak into others running in parallel.
 *
 * Both teams use the same formation (4-3-3) and the same 10/10 squad. The only
 * variable is the tactical style applied to each side.
 *
 * Input (via postMessage):
 *   { styleA: TacticalStyle, styleB: TacticalStyle, matches: number }
 *
 * Output (via postMessage):
 *   BatchRaw — raw sums, main thread aggregates across workers.
 */

import { simulateMatch }              from '@/GameEngine/Domain/SimulateMatch';
import { emptySeasonLog }             from '@/types/playerTypes';
import { applyTeamTacticsConfig }     from '@/GameEngine/Configs/DefenseConfig';
import { applyTeamAttackConfig }      from '@/GameEngine/Configs/AttackConfig';
import type { Formation }             from '@/GameEngine/types';
import type { Squad, RosterPlayer }   from '@/types/playerTypes';
import type { TacticalStyle }         from '@/types/tacticsTypes';

interface WorkerInput {
  styleA:    TacticalStyle;
  styleB:    TacticalStyle;
  matches:   number;
  /** Attribute level 1..10 applied to every stat in the squad. */
  statLevel: number;
}

/** Raw sums across all N matches for one team — mirrors engine TeamStats + wins. */
export interface TeamRawStats {
  wins:            number;
  goals:           number;
  shots:           number;
  xg:              number;
  assists:         number;
  passesAttempted: number;
  passesCompleted: number;
  passesFailed:    number;
  tackles:         number;
  interceptions:   number;
  dribblesWon:     number;
  dribblesLost:    number;
}

export interface BatchRaw {
  styleA:     TacticalStyle;
  styleB:     TacticalStyle;
  matches:    number;
  draws:      number;
  durationMs: number;
  teamA:      TeamRawStats;
  teamB:      TeamRawStats;
}

const FORMATION_PATH = new URL('../src/Data/formations/4-3-3.json', import.meta.url).pathname;

const roleSlots: Array<[string, string[]]> = [
  ['GK1',  ['GK']],  ['LB1',  ['LB']],  ['RB1',  ['RB']],  ['LWB1', ['LWB']], ['RWB1', ['RWB']],
  ['CB1',  ['CB']],  ['CB2',  ['CB']],  ['CB3',  ['CB']],
  ['CDM1', ['CDM']], ['CDM2', ['CDM']],
  ['CM1',  ['CM']],  ['CM2',  ['CM']],  ['CM3',  ['CM']],
  ['LM1',  ['LM']],  ['RM1',  ['RM']],  ['CAM1', ['CAM']],
  ['LW1',  ['LW']],  ['RW1',  ['RW']],  ['ST1',  ['ST']],  ['ST2',  ['ST']],
];

function buildSquad(statLevel: number): Squad {
  const v = statLevel;
  const flatStats = {
    passing: v, vision: v, finishing: v, dribbling: v,
    speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
  return {
    id: 'uniform', name: `Uniform XI (${v}/10)`, colors: ['#3b82f6', '#ffffff'], money: 0,
    players: roleSlots.map(([name, positions], i): RosterPlayer => ({
      id: `p${i}`, name, age: 25, squadId: 'uniform', preferredFoot: 'right',
      positions, stats: { ...flatStats },
      profile: { summary: '', archetype: '' }, seasonLog: emptySeasonLog(),
    })),
  };
}

function emptyTeamRaw(): TeamRawStats {
  return {
    wins: 0, goals: 0, shots: 0, xg: 0, assists: 0,
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    tackles: 0, interceptions: 0, dribblesWon: 0, dribblesLost: 0,
  };
}

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const { styleA, styleB, matches, statLevel } = e.data;

  const formation = await (Bun.file(FORMATION_PATH).json() as Promise<Formation>);
  const squad     = buildSquad(statLevel);

  // Apply per-team tactics ONCE for this worker — all N matches use them.
  // Each worker has its own module registry, so these calls never leak.
  applyTeamTacticsConfig('A', styleA);
  applyTeamAttackConfig('A',  styleA);
  applyTeamTacticsConfig('B', styleB);
  applyTeamAttackConfig('B',  styleB);

  const start = performance.now();
  const teamA = emptyTeamRaw();
  const teamB = emptyTeamRaw();
  let draws = 0;

  for (let m = 0; m < matches; m++) {
    const r  = simulateMatch(squad, squad, formation, formation);
    const sA = r.teamStats.A;
    const sB = r.teamStats.B;

    teamA.goals           += r.score.A;          teamB.goals           += r.score.B;
    teamA.shots           += sA.shots;           teamB.shots           += sB.shots;
    teamA.xg              += sA.xg;              teamB.xg              += sB.xg;
    teamA.assists         += sA.assists;         teamB.assists         += sB.assists;
    teamA.passesAttempted += sA.passesAttempted; teamB.passesAttempted += sB.passesAttempted;
    teamA.passesCompleted += sA.passesCompleted; teamB.passesCompleted += sB.passesCompleted;
    teamA.passesFailed    += sA.passesFailed;    teamB.passesFailed    += sB.passesFailed;
    teamA.tackles         += sA.tackles;         teamB.tackles         += sB.tackles;
    teamA.interceptions   += sA.interceptions;   teamB.interceptions   += sB.interceptions;
    teamA.dribblesWon     += sA.dribblesWon;     teamB.dribblesWon     += sB.dribblesWon;
    teamA.dribblesLost    += sA.dribblesLost;    teamB.dribblesLost    += sB.dribblesLost;

    if      (r.score.A > r.score.B) teamA.wins++;
    else if (r.score.B > r.score.A) teamB.wins++;
    else                            draws++;

    if ((m + 1) % 25 === 0 || m + 1 === matches) {
      postMessage({ type: 'progress', styleA, styleB, done: m + 1, total: matches });
    }
  }

  const result: BatchRaw = {
    styleA, styleB, matches, draws,
    durationMs: Math.round(performance.now() - start),
    teamA, teamB,
  };

  postMessage({ type: 'result', result });
};
