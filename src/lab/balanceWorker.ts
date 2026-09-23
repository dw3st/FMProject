/**
 * Generic Balance Worker — runs N matches for ONE variant pair.
 *
 * Each worker has its own module registry, so per-team config mutations
 * (applyTeamTacticsConfig / applyTeamAttackConfig) never leak across pairs.
 *
 * Input  : WorkerInput  via postMessage
 * Output : { type: 'progress' | 'result' } via postMessage
 */

import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { emptySeasonLog } from "@/types/playerTypes";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import type { Formation } from "@/GameEngine/types";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type {
  WorkerInput,
  TeamRawStats,
  PairRaw,
  RawAttributes,
  SquadSpec,
  Variant,
} from "@/lab/types";

const FORMATIONS_DIR = new URL("../Data/formations/", import.meta.url).pathname;

const ROLE_SLOTS: Array<[string, string[]]> = [
  ["GK1",  ["GK"]],  ["LB1",  ["LB"]],  ["RB1",  ["RB"]],  ["LWB1", ["LWB"]], ["RWB1", ["RWB"]],
  ["CB1",  ["CB"]],  ["CB2",  ["CB"]],  ["CB3",  ["CB"]],
  ["CDM1", ["CDM"]], ["CDM2", ["CDM"]],
  ["CM1",  ["CM"]],  ["CM2",  ["CM"]],  ["CM3",  ["CM"]],
  ["LM1",  ["LM"]],  ["RM1",  ["RM"]],  ["CAM1", ["CAM"]],
  ["LW1",  ["LW"]],  ["RW1",  ["RW"]],  ["ST1",  ["ST"]],  ["ST2",  ["ST"]],
];

function uniformAttrs(level: number): RawAttributes {
  return {
    passing: level, vision: level, finishing: level, dribbling: level,
    speed: level, acceleration: level, tackling: level, pressing: level,
    stamina: level, heading: level, strength: level, reflex: level, jump: level,
  };
}

function attrsForRole(spec: SquadSpec, role: string): RawAttributes {
  const base = uniformAttrs(spec.statLevel);
  if (spec.kind === "uniform") return base;
  // custom: layer global overrides, then role overrides
  const globalOverrides = spec.attributes ?? {};
  const roleOverrides = spec.roleOverrides?.[role] ?? {};
  return { ...base, ...globalOverrides, ...roleOverrides };
}

function buildSquad(spec: SquadSpec, label: string): Squad {
  return {
    id: `lab-${label}`,
    name: `${label} (${spec.statLevel}/10)`,
    colors: ["#3b82f6", "#ffffff"],
    money: 0,
    players: ROLE_SLOTS.map(([name, positions], i): RosterPlayer => ({
      id: `p${i}`,
      name,
      age: 25,
      squadId: `lab-${label}`,
      preferredFoot: "right",
      positions,
      stats: attrsForRole(spec, positions[0] ?? ""),
      profile: { summary: "", archetype: "" },
      seasonLog: emptySeasonLog(),
    })),
  };
}

function emptyTeamRaw(): TeamRawStats {
  return {
    wins: 0, goals: 0, shots: 0, xg: 0, assists: 0,
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    tackles: 0, interceptions: 0, dribblesWon: 0, dribblesLost: 0,
    throughBallsAttempted: 0, throughBallsCompleted: 0,
    throughBallsLostInFlight: 0, throughBallsLostInRace: 0,
    throughBallsLostInDuel: 0, looseBallsWon: 0,
    switchPlays: 0,
  };
}

async function loadFormation(id: string): Promise<Formation> {
  return Bun.file(`${FORMATIONS_DIR}${id}.json`).json() as Promise<Formation>;
}

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  try {
    const { variantA, variantB, matches } = e.data;

    const [formationA, formationB] = await Promise.all([
      loadFormation(variantA.formation),
      loadFormation(variantB.formation),
    ]);

    const squadA = buildSquad(variantA.squad, variantA.label);
    const squadB = buildSquad(variantB.squad, variantB.label);

    // Apply per-team tactics ONCE — all N matches use them.
    applyTeamTacticsConfig("A", variantA.tacticalStyle);
    applyTeamAttackConfig("A", variantA.tacticalStyle);
    applyTeamTacticsConfig("B", variantB.tacticalStyle);
    applyTeamAttackConfig("B", variantB.tacticalStyle);

    const start = performance.now();
    const teamA = emptyTeamRaw();
    const teamB = emptyTeamRaw();
    let draws = 0;

    for (let m = 0; m < matches; m++) {
      const r = simulateMatch(squadA, squadB, formationA, formationB);
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
      teamA.throughBallsAttempted    += sA.throughBallsAttempted;    teamB.throughBallsAttempted    += sB.throughBallsAttempted;
      teamA.throughBallsCompleted    += sA.throughBallsCompleted;    teamB.throughBallsCompleted    += sB.throughBallsCompleted;
      teamA.throughBallsLostInFlight += sA.throughBallsLostInFlight; teamB.throughBallsLostInFlight += sB.throughBallsLostInFlight;
      teamA.throughBallsLostInRace   += sA.throughBallsLostInRace;   teamB.throughBallsLostInRace   += sB.throughBallsLostInRace;
      teamA.throughBallsLostInDuel   += sA.throughBallsLostInDuel;   teamB.throughBallsLostInDuel   += sB.throughBallsLostInDuel;
      teamA.looseBallsWon            += sA.looseBallsWon;            teamB.looseBallsWon            += sB.looseBallsWon;
      teamA.switchPlays              += sA.switchPlays;              teamB.switchPlays              += sB.switchPlays;

      if (r.score.A > r.score.B) teamA.wins++;
      else if (r.score.B > r.score.A) teamB.wins++;
      else draws++;

      if ((m + 1) % 10 === 0 || m + 1 === matches) {
        postMessage({
          type: "progress",
          variantAId: variantA.id,
          variantBId: variantB.id,
          done: m + 1,
          total: matches,
        });
      }
    }

    const result: PairRaw = {
      variantAId: variantA.id,
      variantBId: variantB.id,
      matches,
      draws,
      durationMs: Math.round(performance.now() - start),
      teamA,
      teamB,
    };

    postMessage({ type: "result", result });
  } catch (err) {
    postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

// Type-only export so the worker module typechecks the WorkerInput shape.
export type _WorkerVariant = Variant;
