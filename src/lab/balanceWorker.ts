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
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptySeasonLog } from "@/types/playerTypes";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { DEFAULT_MENTALITY } from "@/types/tacticsTypes";
import {
  applyMatchToSquad,
  applyRestDays,
  avgAppearanceEnergy,
  fullEngineAppearances,
  quickSimAppearances,
} from "@/lab/fitnessCarry";
import type { Formation } from "@/GameEngine/types";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type {
  CongestionMatchRaw,
  CongestionSpec,
  WorkerInput,
  TeamRawStats,
  PairRaw,
  RawAttributes,
  SquadSpec,
  Variant,
} from "@/lab/types";
import { fileURLToPath } from "node:url";

const FORMATIONS_DIR = fileURLToPath(new URL("../Data/formations/", import.meta.url));

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
    extraTimeMatches: 0, shootoutsWon: 0, penaltiesTaken: 0, penaltiesScored: 0,
    avgEndEnergySum: 0, fatigueSubstitutions: 0,
  };
}

/** Sum every field of `src` into `dst` (both single-match deltas or running totals). */
function addTeamRaw(dst: TeamRawStats, src: TeamRawStats): void {
  dst.wins                        += src.wins;
  dst.goals                       += src.goals;
  dst.shots                       += src.shots;
  dst.xg                          += src.xg;
  dst.assists                     += src.assists;
  dst.passesAttempted             += src.passesAttempted;
  dst.passesCompleted             += src.passesCompleted;
  dst.passesFailed                += src.passesFailed;
  dst.tackles                     += src.tackles;
  dst.interceptions               += src.interceptions;
  dst.dribblesWon                 += src.dribblesWon;
  dst.dribblesLost                += src.dribblesLost;
  dst.throughBallsAttempted       += src.throughBallsAttempted;
  dst.throughBallsCompleted       += src.throughBallsCompleted;
  dst.throughBallsLostInFlight    += src.throughBallsLostInFlight;
  dst.throughBallsLostInRace      += src.throughBallsLostInRace;
  dst.throughBallsLostInDuel      += src.throughBallsLostInDuel;
  dst.looseBallsWon               += src.looseBallsWon;
  dst.switchPlays                 += src.switchPlays;
  dst.extraTimeMatches            += src.extraTimeMatches;
  dst.shootoutsWon                += src.shootoutsWon;
  dst.penaltiesTaken              += src.penaltiesTaken;
  dst.penaltiesScored             += src.penaltiesScored;
  dst.avgEndEnergySum             += src.avgEndEnergySum;
  dst.fatigueSubstitutions        += src.fatigueSubstitutions;
}

async function loadFormation(id: string): Promise<Formation> {
  return Bun.file(`${FORMATIONS_DIR}${id}.json`).json() as Promise<Formation>;
}

/**
 * The lab's two squads share player ids (p0…p19). The full engine keys stats by a
 * fresh numeric GamePlayer id per team, so the collision never matters there — but
 * quickSim's playerStats/assists are keyed by the RosterPlayer id directly, so a
 * collision would merge Team A's and Team B's per-player stats. Prefix ids per side
 * so quickSim output stays attributable.
 */
function prefixIds(squad: Squad, side: "A" | "B"): Squad {
  return { ...squad, players: squad.players.map((p) => ({ ...p, id: `${side}-${p.id}` })) };
}

function squadIdOf(side: "A" | "B", playerId: string): boolean {
  return playerId.startsWith(`${side}-`);
}

/** One match's raw stat deltas for both teams — never accumulated across matches by itself. */
interface OneMatchResult {
  teamA: TeamRawStats;
  teamB: TeamRawStats;
  draw: boolean;
  /** Fitness/load carry-over inputs for the NEXT match in a congestion sequence. */
  appearancesA: ReturnType<typeof fullEngineAppearances>;
  appearancesB: ReturnType<typeof fullEngineAppearances>;
}

function runOneMatch(
  squadA: Squad,
  squadB: Squad,
  formationA: Formation,
  formationB: Formation,
  quickLineupA: string[],
  quickLineupB: string[],
  quickRolesA: string[],
  quickRolesB: string[],
  simEngine: "full" | "quick",
  knockout: boolean,
  matchSeed: number,
): OneMatchResult {
  const teamA = emptyTeamRaw();
  const teamB = emptyTeamRaw();

  if (simEngine === "quick") {
    const q = quickSimMatch({
      fixtureId: `lab-${matchSeed}`,
      home: squadA,
      away: squadB,
      homeLineup: quickLineupA,
      awayLineup: quickLineupB,
      homeRoles: quickRolesA,
      awayRoles: quickRolesB,
      knockout,
    });
    const hA = q.recording.teamStats.home;
    const hB = q.recording.teamStats.away;
    const assists = (side: "A" | "B") =>
      Object.entries(q.recording.playerStats)
        .filter(([id]) => squadIdOf(side, id))
        .reduce((acc, [, s]) => acc + s.assists, 0);
    teamA.goals += q.recording.score.home;   teamB.goals += q.recording.score.away;
    teamA.shots += hA.shots;                 teamB.shots += hB.shots;
    teamA.xg    += q.breakdown.xgHome;       teamB.xg    += q.breakdown.xgAway;
    teamA.assists += assists("A");           teamB.assists += assists("B");
    teamA.passesAttempted += hA.passesAttempted; teamB.passesAttempted += hB.passesAttempted;
    teamA.passesCompleted += hA.passesCompleted; teamB.passesCompleted += hB.passesCompleted;
    teamA.passesFailed += hA.passesAttempted - hA.passesCompleted;
    teamB.passesFailed += hB.passesAttempted - hB.passesCompleted;
    teamA.tackles += hA.tackles;             teamB.tackles += hB.tackles;
    teamA.interceptions += hA.interceptions; teamB.interceptions += hB.interceptions;
    // quickSim doesn't count individual shootout kicks — penaltiesTaken/Scored stay 0 for this engine.
    // quickSim never subs (no bench) — fatigueSubstitutions stays 0 for this engine.
    const qd = q.recording.decider;
    if (qd) { teamA.extraTimeMatches++; teamB.extraTimeMatches++; }
    const qpA = qd?.penalties?.home ?? 0, qpB = qd?.penalties?.away ?? 0;
    if (qd?.penalties) { if (qpA > qpB) teamA.shootoutsWon++; else teamB.shootoutsWon++; }
    const homeWon = q.recording.score.home > q.recording.score.away || (qd?.penalties !== undefined && qpA > qpB);
    const awayWon = q.recording.score.away > q.recording.score.home || (qd?.penalties !== undefined && qpB > qpA);
    if (homeWon) teamA.wins++;
    else if (awayWon) teamB.wins++;

    const appearancesA = quickSimAppearances(q.recording, (id) => squadIdOf("A", id));
    const appearancesB = quickSimAppearances(q.recording, (id) => squadIdOf("B", id));
    teamA.avgEndEnergySum = avgAppearanceEnergy(appearancesA);
    teamB.avgEndEnergySum = avgAppearanceEnergy(appearancesB);

    return { teamA, teamB, draw: !homeWon && !awayWon, appearancesA, appearancesB };
  }

  const r = simulateMatch(squadA, squadB, formationA, formationB, undefined, undefined, { knockout });
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
  teamA.extraTimeMatches += sA.extraTimePlayed;  teamB.extraTimeMatches += sB.extraTimePlayed;
  teamA.shootoutsWon     += sA.shootoutsWon;     teamB.shootoutsWon     += sB.shootoutsWon;
  teamA.penaltiesTaken   += sA.penaltiesTaken;   teamB.penaltiesTaken   += sB.penaltiesTaken;
  teamA.penaltiesScored  += sA.penaltiesScored;  teamB.penaltiesScored  += sB.penaltiesScored;
  teamA.avgEndEnergySum      += sA.avgEndEnergy;         teamB.avgEndEnergySum      += sB.avgEndEnergy;
  teamA.fatigueSubstitutions += sA.fatigueSubstitutions; teamB.fatigueSubstitutions += sB.fatigueSubstitutions;

  const winner = r.decider?.winner ?? (r.score.A > r.score.B ? "A" : r.score.B > r.score.A ? "B" : null);
  if (winner === "A") teamA.wins++;
  else if (winner === "B") teamB.wins++;

  const hadExtraTime = r.decider != null;
  const appearancesA = fullEngineAppearances(r.players, r.substitutions, "A", hadExtraTime);
  const appearancesB = fullEngineAppearances(r.players, r.substitutions, "B", hadExtraTime);

  return { teamA, teamB, draw: winner === null, appearancesA, appearancesB };
}

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  try {
    const { variantA, variantB, matches, simEngine = "full", knockout = false, congestion } = e.data;

    const [formationA, formationB] = await Promise.all([
      loadFormation(variantA.formation),
      loadFormation(variantB.formation),
    ]);

    const baseSquadA = prefixIds(buildSquad(variantA.squad, variantA.label), "A");
    const baseSquadB = prefixIds(buildSquad(variantB.squad, variantB.label), "B");

    // Apply per-team tactics ONCE — all matches use them.
    // `mentality` is optional (absent ⇒ "balanced", a no-op shift) — see lab/types.ts.
    applyTeamTacticsConfig("A", variantA.tacticalStyle, variantA.mentality ?? DEFAULT_MENTALITY);
    applyTeamAttackConfig("A", variantA.tacticalStyle, variantA.mentality ?? DEFAULT_MENTALITY);
    applyTeamTacticsConfig("B", variantB.tacticalStyle, variantB.mentality ?? DEFAULT_MENTALITY);
    applyTeamAttackConfig("B", variantB.tacticalStyle, variantB.mentality ?? DEFAULT_MENTALITY);

    // quickSim: each side plays its own formation — slot-ordered lineup + slot roles.
    // Computed once from the base (full-fitness) squad: the lineup ORDER doesn't depend on
    // fitness here (congestion never re-picks the XI — see fitnessCarry.ts doc comment),
    // only each named player's own seasonLog.fitness/.load (mutated between congestion games).
    const quickLineupA = autoLineupForFormation(baseSquadA, formationA);
    const quickLineupB = autoLineupForFormation(baseSquadB, formationB);
    const quickRolesA = slotRoles(formationA);
    const quickRolesB = slotRoles(formationB);

    const start = performance.now();

    if (congestion && congestion.matches >= 2) {
      // ── Congestion: each of the `matches` repetitions plays `congestion.matches` games
      // back-to-back, carrying fitness/load between them (no real day advance). ──
      const perIndex: TeamRawStats[][] = [[], []]; // [A, B][matchIndex] — pushed per repetition
      for (let i = 0; i < congestion.matches; i++) { perIndex[0]!.push(emptyTeamRaw()); perIndex[1]!.push(emptyTeamRaw()); }
      const perIndexDraws: number[] = new Array(congestion.matches).fill(0);
      const overallA = emptyTeamRaw();
      const overallB = emptyTeamRaw();
      let overallDraws = 0;

      for (let rep = 0; rep < matches; rep++) {
        let curSquadA = baseSquadA;
        let curSquadB = baseSquadB;

        for (let g = 0; g < congestion.matches; g++) {
          const one = runOneMatch(
            curSquadA, curSquadB, formationA, formationB,
            quickLineupA, quickLineupB, quickRolesA, quickRolesB,
            simEngine, knockout, rep * congestion.matches + g,
          );
          addTeamRaw(perIndex[0]![g]!, one.teamA);
          addTeamRaw(perIndex[1]![g]!, one.teamB);
          if (one.draw) perIndexDraws[g]!++;
          addTeamRaw(overallA, one.teamA);
          addTeamRaw(overallB, one.teamB);
          if (one.draw) overallDraws++;

          // Carry fitness/load into the next game of this repetition's sequence.
          curSquadA = applyMatchToSquad(curSquadA, one.appearancesA);
          curSquadB = applyMatchToSquad(curSquadB, one.appearancesB);
          if (g < congestion.matches - 1 && congestion.restDays > 0) {
            curSquadA = applyRestDays(curSquadA, congestion.restDays);
            curSquadB = applyRestDays(curSquadB, congestion.restDays);
          }
        }

        if ((rep + 1) % 10 === 0 || rep + 1 === matches) {
          postMessage({ type: "progress", variantAId: variantA.id, variantBId: variantB.id, done: rep + 1, total: matches });
        }
      }

      const congestionMatches: CongestionMatchRaw[] = perIndex[0]!.map((teamA, i) => ({
        matchIndex: i,
        matches,
        draws: perIndexDraws[i]!,
        teamA,
        teamB: perIndex[1]![i]!,
      }));

      const result: PairRaw = {
        variantAId: variantA.id,
        variantBId: variantB.id,
        matches: matches * congestion.matches,
        draws: overallDraws,
        durationMs: Math.round(performance.now() - start),
        teamA: overallA,
        teamB: overallB,
        congestionMatches,
      };

      postMessage({ type: "result", result });
      return;
    }

    // ── No congestion — one independent match per repetition (unchanged behaviour). ──
    const teamA = emptyTeamRaw();
    const teamB = emptyTeamRaw();
    let draws = 0;

    for (let m = 0; m < matches; m++) {
      const one = runOneMatch(
        baseSquadA, baseSquadB, formationA, formationB,
        quickLineupA, quickLineupB, quickRolesA, quickRolesB,
        simEngine, knockout, m,
      );
      addTeamRaw(teamA, one.teamA);
      addTeamRaw(teamB, one.teamB);
      if (one.draw) draws++;

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
export type _WorkerCongestion = CongestionSpec;
