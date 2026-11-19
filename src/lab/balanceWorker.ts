/**
 * Generic Balance Worker — runs N matches for ONE variant pair.
 *
 * Each worker has its own module registry, so per-team config mutations
 * (applyTeamTacticsConfig / applyTeamAttackConfig) never leak across pairs.
 *
 * Input  : WorkerInput  via postMessage
 * Output : { type: 'progress' | 'result' } via postMessage
 */

import { personalityOf } from "@/Domain/personality/personality";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { withNewcomers } from "@/Domain/settling/settling";
import { simulateMatch, type TeamInstructions } from "@/GameEngine/Domain/SimulateMatch";
import { counterStyle, pickMarkTarget, pickMarkerSlot } from "@/Domain/study/study";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import type { TeamStudy } from "@/GameEngine/types";
import { addSlotRaws, createSlotCollector } from "@/lab/slotStats";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { lineOrderLineup, poorFitStarters } from "@/Domain/positions/positionLineup";
import { emptySeasonLog } from "@/types/playerTypes";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { DEFAULT_MENTALITY } from "@/types/tacticsTypes";
import { withFitnessCoach } from "@/Domain/staff/staff";
import {
  applyMatchToSquad,
  applyRestDays,
  avgAppearanceEnergy,
  fullEngineAppearances,
  quickSimAppearances,
} from "@/lab/fitnessCarry";
import { addDayLogDiscipline } from "@/lab/disciplineStats";
import { addDayLogAerial } from "@/lab/aerialStats";
import { addDayLogSetPieces } from "@/lab/setPieceStats";
import type { Formation } from "@/GameEngine/types";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";
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
import { turfInjuryMult } from "@/Domain/facilities/turf";
import type { TurfType } from "@/types/facilityTypes";
import { isNeutralWeather, type EngineWeather } from "@/GameEngine/Configs/WeatherConfig";
import { fileURLToPath } from "node:url";
import { customToFormation } from "@/Domain/formation/zones";
import { KINEMATICS_CONFIG } from "@/GameEngine/Configs/KinematicsConfig";

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

function uniformMental(level: number) {
  return { decisions: level, composure: level, flair: level, anticipation: level };
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
      // Mental keys at the squad level: nothing in the engine reads them yet (`.claude/rules/game/mental.md`).
      stats: { ...attrsForRole(spec, positions[0] ?? ""), ...uniformMental(spec.statLevel) },
      profile: { summary: "", archetype: "" },
      seasonLog: emptySeasonLog(),
    })),
  };
}

function emptyTeamRaw(): TeamRawStats {
  return {
    wins: 0, goals: 0, shots: 0, shotsOnTarget: 0, xg: 0, assists: 0,
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    tackles: 0, interceptions: 0, dribblesWon: 0, dribblesLost: 0,
    throughBallsAttempted: 0, throughBallsCompleted: 0,
    throughBallsLostInFlight: 0, throughBallsLostInRace: 0,
    throughBallsLostInDuel: 0, looseBallsWon: 0,
    switchPlays: 0,
    extraTimeMatches: 0, shootoutsWon: 0, penaltiesTaken: 0, penaltiesScored: 0,
    newcomers: 0, avgEndEnergySum: 0, fatigueSubstitutions: 0, injuries: 0, injuryStoppages: 0, ballNearTicks: 0, ballNearSum: 0, ballCrowdTicks: 0, outOfPosition: 0, morale: 0, temperament: 0, managerDiscipline: 0, pitchCondition: 0, turfInjuryMult: 0, weatherActive: 0, preparedAgainst: 0, refereeStrictness: 0, refereeErrors: 0, varReviews: 0, varOverturned: 0,
    fouls: 0, yellowCards: 0, redCards: 0, penaltiesAwarded: 0, penaltyGoals: 0, offsides: 0,
    crosses: 0, crossesCompleted: 0, aerialDuels: 0, aerialDuelsWon: 0, headerGoals: 0, longBalls: 0, longBallsCompleted: 0, keeperSorties: 0, keeperSweeps: 0, keeperSmothers: 0, keeperHolds: 0, keeperSpills: 0, distanceCovered: 0, sprints: 0,
    holderDecisions: 0, offBallDecisions: 0, defenseDecisions: 0, holderNearTies: 0, offBallNearTies: 0, defenseNearTies: 0, holderEntropySum: 0, offBallEntropySum: 0, defenseEntropySum: 0, holderPressureSum: 0, holderMindDecisions: 0, holderOffArgmax: 0, holderWindows: 0, holderLapses: 0, holderReleases: 0, holderHighPressure: 0, holderReleasesHigh: 0, moveShield: 0, moveShieldHeld: 0, moveCutInside: 0, moveLayOff: 0, moveChip: 0, moveChipGoals: 0, moveRound: 0, moveRoundWon: 0, ballsOutOfPlay: 0, deflections: 0, shotsBlocked: 0, heavyTouches: 0, lineStepUps: 0, lineDrops: 0, pressStandOffs: 0, supportShort: 0, anticipationReads: 0, passesMissed: 0, passesLofted: 0, holderHolds: 0, holderTurns: 0, highBalls: 0, ballAirSeconds: 0, crossPeakSum: 0, crossPeakN: 0, cornerPeakSum: 0, cornerPeakN: 0, longPeakSum: 0, longPeakN: 0, passGround: 0, passDriven: 0, passChip: 0, passHigh: 0, passThroughLow: 0, passThroughHigh: 0, passHeader: 0, passLaunchSpeedSum: 0, passLaunchN: 0,
    corners: 0, throwIns: 0, setPieceRoutines: 0, freeKicks: 0, directFreeKickShots: 0, directFreeKickGoals: 0, setPieceGoals: 0,
    markedTargetShots: 0, markedTargetGoals: 0, manMarkedMinutes: 0, slotStats: [],
  };
}

/** Sum every field of `src` into `dst` (both single-match deltas or running totals). */
function addTeamRaw(dst: TeamRawStats, src: TeamRawStats): void {
  dst.wins                        += src.wins;
  dst.goals                       += src.goals;
  dst.shots                       += src.shots;
  dst.shotsOnTarget               += src.shotsOnTarget;
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
  dst.injuries                    += src.injuries;
  dst.injuryStoppages             += src.injuryStoppages;
  dst.ballNearTicks               += src.ballNearTicks;
  dst.ballNearSum                 += src.ballNearSum;
  dst.ballCrowdTicks              += src.ballCrowdTicks;
  dst.outOfPosition               += src.outOfPosition;
  dst.morale                      += src.morale;
  dst.newcomers                   += src.newcomers;
  dst.temperament                 += src.temperament;
  dst.managerDiscipline           += src.managerDiscipline;
  dst.pitchCondition              += src.pitchCondition;
  dst.turfInjuryMult              += src.turfInjuryMult;
  dst.weatherActive               += src.weatherActive;
  dst.preparedAgainst             += src.preparedAgainst;
  dst.refereeStrictness           += src.refereeStrictness;
  dst.refereeErrors += src.refereeErrors;
  dst.varReviews += src.varReviews;
  dst.varOverturned += src.varOverturned;
  dst.fouls                       += src.fouls;
  dst.yellowCards                 += src.yellowCards;
  dst.redCards                    += src.redCards;
  dst.penaltiesAwarded            += src.penaltiesAwarded;
  dst.penaltyGoals                += src.penaltyGoals;
  dst.offsides                    += src.offsides;
  dst.crosses                     += src.crosses;
  dst.crossesCompleted            += src.crossesCompleted;
  dst.aerialDuels                 += src.aerialDuels;
  dst.aerialDuelsWon              += src.aerialDuelsWon;
  dst.headerGoals                 += src.headerGoals;
  dst.longBalls                   += src.longBalls;
  dst.longBallsCompleted          += src.longBallsCompleted;
  dst.keeperSorties               += src.keeperSorties;
  dst.keeperSweeps                += src.keeperSweeps;
  dst.keeperSmothers              += src.keeperSmothers;
  dst.keeperHolds                 += src.keeperHolds;
  dst.keeperSpills                += src.keeperSpills;
  dst.distanceCovered             += src.distanceCovered;
  dst.sprints                     += src.sprints;
  dst.holderDecisions += src.holderDecisions;
  dst.offBallDecisions += src.offBallDecisions;
  dst.defenseDecisions += src.defenseDecisions;
  dst.holderNearTies += src.holderNearTies;
  dst.offBallNearTies += src.offBallNearTies;
  dst.defenseNearTies += src.defenseNearTies;
  dst.holderEntropySum += src.holderEntropySum;
  dst.offBallEntropySum += src.offBallEntropySum;
  dst.defenseEntropySum += src.defenseEntropySum;
  dst.holderPressureSum += src.holderPressureSum;
  dst.holderMindDecisions += src.holderMindDecisions;
  dst.holderOffArgmax += src.holderOffArgmax;
  dst.holderWindows += src.holderWindows;
  dst.holderLapses += src.holderLapses;
  dst.holderReleases += src.holderReleases;
  dst.holderHighPressure += src.holderHighPressure;
  dst.holderReleasesHigh += src.holderReleasesHigh;
  dst.moveShield += src.moveShield;
  dst.moveShieldHeld += src.moveShieldHeld;
  dst.moveCutInside += src.moveCutInside;
  dst.moveLayOff += src.moveLayOff;
  dst.moveChip += src.moveChip;
  dst.moveChipGoals += src.moveChipGoals;
  dst.moveRound += src.moveRound;
  dst.moveRoundWon += src.moveRoundWon;
  dst.ballsOutOfPlay += src.ballsOutOfPlay;
  dst.deflections += src.deflections;
  dst.shotsBlocked += src.shotsBlocked;
  dst.heavyTouches += src.heavyTouches;
  dst.lineStepUps += src.lineStepUps;
  dst.lineDrops += src.lineDrops;
  dst.pressStandOffs += src.pressStandOffs;
  dst.supportShort += src.supportShort;
  dst.anticipationReads += src.anticipationReads;
  dst.passesMissed += src.passesMissed;
  dst.passesLofted += src.passesLofted;
  dst.highBalls += src.highBalls;
  dst.ballAirSeconds += src.ballAirSeconds;
  dst.crossPeakSum += src.crossPeakSum;
  dst.crossPeakN += src.crossPeakN;
  dst.cornerPeakSum += src.cornerPeakSum;
  dst.cornerPeakN += src.cornerPeakN;
  dst.longPeakSum += src.longPeakSum;
  dst.longPeakN += src.longPeakN;
  dst.passGround += src.passGround;
  dst.passDriven += src.passDriven;
  dst.passChip += src.passChip;
  dst.passHigh += src.passHigh;
  dst.passThroughLow += src.passThroughLow;
  dst.passThroughHigh += src.passThroughHigh;
  dst.passHeader += src.passHeader;
  dst.passLaunchSpeedSum += src.passLaunchSpeedSum;
  dst.passLaunchN += src.passLaunchN;
  dst.holderHolds += src.holderHolds;
  dst.holderTurns += src.holderTurns;
  dst.corners                     += src.corners;
  dst.throwIns                    += src.throwIns;
  dst.setPieceRoutines                    += src.setPieceRoutines;
  dst.freeKicks                   += src.freeKicks;
  dst.directFreeKickShots         += src.directFreeKickShots;
  dst.directFreeKickGoals         += src.directFreeKickGoals;
  dst.setPieceGoals               += src.setPieceGoals;
  dst.markedTargetShots           += src.markedTargetShots;
  dst.markedTargetGoals           += src.markedTargetGoals;
  dst.manMarkedMinutes            += src.manMarkedMinutes;
  dst.slotStats                    = addSlotRaws(dst.slotStats, src.slotStats);
}

async function loadFormation(id: string): Promise<Formation> {
  return Bun.file(`${FORMATIONS_DIR}${id}.json`).json() as Promise<Formation>;
}

/** A variant's formation: the free formation when set, otherwise the ready-made one by id. */
function loadVariantFormation(v: Variant): Promise<Formation> {
  return v.customFormation ? Promise.resolve(customToFormation(v.customFormation)) : loadFormation(v.formation);
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

/** Per-pair lineup-fit info: explicit lineups for the full engine (only when `outOfPosition`) and poor-fit counts. */
interface LineupFit {
  fullLineupA?: string[];
  fullLineupB?: string[];
  poorA: number;
  poorB: number;
}

/** Familiarity of each side with its own style (set per worker message): quickSim strength + engine execution. */
let sideFamiliarity: { A?: number; B?: number } = {};
/** Morale of each whole side (set per worker message): engine execution + quickSim strength. Absent = 65. */
let sideMorale: { A?: number; B?: number } = {};
let sideNewcomers: { A?: number; B?: number } = {};
/** Temperament override (1..20) of each whole side (set per worker message). Absent = each player's own. */
let sideTemperament: { A?: number; B?: number } = {};
let sideMental: { A?: number; B?: number } = {};
let matchHolder: boolean | undefined;
let sideMgrDiscipline: { A?: number; B?: number } = {};
/** Pitch condition of the match (variant A, the home side; set per worker message). Absent = 90. */
let matchPitch: number | undefined;
let matchTurf: TurfType | undefined;
let matchWeather: EngineWeather | undefined;
/** Referee rigor of the match (variant A sets it, like the pitch). */
let matchReferee: number | undefined;
/** Referee quality (errors) and VAR of the match (variant A, `var.md`). */
let matchRefQuality: number | undefined;
let matchVar = false;
/** Player instructions of each side (set per worker message): full engine only. */
let sideInstructions: { A?: TeamInstructions; B?: TeamInstructions } = {};
/** The side that plays a game plan against a studied opponent (`Variant.studied` of the OTHER variant). */
let sideStudy: { A?: TeamStudy; B?: TeamStudy } = {};
let sideRoutines: { A?: import("@/types/tacticsTypes").SetPieceRoutines; B?: import("@/types/tacticsTypes").SetPieceRoutines } = {};

function variantFamiliarity(v: Variant): FamiliarityLevels | undefined {
  return v.familiarity === undefined ? undefined : { [v.tacticalStyle]: v.familiarity };
}

/** Mean temperament (1..20) of a lineup: the side override, else each player's own. */
function xiTemperament(squad: Squad, lineup: string[] | undefined, override: number | undefined): number {
  if (override !== undefined) return override;
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi = (lineup ?? []).map((id) => byId.get(id)).filter((p): p is Squad["players"][number] => !!p);
  const list = xi.length > 0 ? xi : squad.players.slice(0, 11);
  return list.length ? list.reduce((a, p) => a + personalityOf(p).temperament, 0) / list.length : 10.5;
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
  fit: LineupFit,
): OneMatchResult {
  const teamA = emptyTeamRaw();
  const teamB = emptyTeamRaw();
  teamA.outOfPosition = fit.poorA;
  teamB.outOfPosition = fit.poorB;
  squadA = withNewcomers(squadA, (simEngine === "quick" ? quickLineupA : fit.fullLineupA) ?? [], sideNewcomers.A);
  squadB = withNewcomers(squadB, (simEngine === "quick" ? quickLineupB : fit.fullLineupB) ?? [], sideNewcomers.B);
  teamA.newcomers = sideNewcomers.A ?? 0;
  teamB.newcomers = sideNewcomers.B ?? 0;
  teamA.morale = sideMorale.A ?? MORALE.NEUTRAL;
  teamB.morale = sideMorale.B ?? MORALE.NEUTRAL;
  teamA.temperament = xiTemperament(squadA, simEngine === "quick" ? quickLineupA : fit.fullLineupA, sideTemperament.A);
  teamB.temperament = xiTemperament(squadB, simEngine === "quick" ? quickLineupB : fit.fullLineupB, sideTemperament.B);
  teamA.managerDiscipline = sideMgrDiscipline.A ?? 10;
  teamB.managerDiscipline = sideMgrDiscipline.B ?? 10;
  teamA.pitchCondition = matchPitch ?? 90;
  teamB.pitchCondition = matchPitch ?? 90;
  teamA.turfInjuryMult = turfInjuryMult(matchTurf);
  teamB.turfInjuryMult = turfInjuryMult(matchTurf);
  teamA.weatherActive = teamB.weatherActive = isNeutralWeather(matchWeather) ? 0 : 1;
  teamA.refereeStrictness = matchReferee ?? 0;
  teamB.refereeStrictness = matchReferee ?? 0;

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
      homeFamiliarity: sideFamiliarity.A,
      awayFamiliarity: sideFamiliarity.B,
      homeMorale: sideMorale.A,
      awayMorale: sideMorale.B,
      homeTemperament: sideTemperament.A,
      awayTemperament: sideTemperament.B,
      ...(sideMgrDiscipline.A !== undefined ? { homeManagerDiscipline: sideMgrDiscipline.A } : {}),
      ...(sideMgrDiscipline.B !== undefined ? { awayManagerDiscipline: sideMgrDiscipline.B } : {}),
      ...(matchPitch !== undefined ? { pitchCondition: matchPitch } : {}),
      ...(matchTurf ? { turf: matchTurf } : {}),
      ...(matchWeather ? { weather: matchWeather } : {}),
      ...(matchReferee !== undefined ? { refereeStrictness: matchReferee } : {}),
      ...(matchRefQuality !== undefined ? { refereeQuality: matchRefQuality, refereeVar: matchVar } : {}),
    });
    const qv = q.recording.var;
    if (qv) {
      for (const t of [teamA, teamB]) { t.refereeErrors += qv.errors; t.varReviews += qv.reviews; t.varOverturned += qv.overturned; }
    }
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
    for (const inj of q.recording.injuries ?? []) {
      if (inj.team === "home") teamA.injuries++; else teamB.injuries++;
    }
    // Discipline: optional on the day-log team stats (quickSim fills them, see rollDiscipline).
    addDayLogDiscipline(teamA, hA);
    addDayLogDiscipline(teamB, hB);
    addDayLogAerial(teamA, hA);
    addDayLogAerial(teamB, hB);
    addDayLogSetPieces(teamA, hA);
    addDayLogSetPieces(teamB, hB);
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

  const slotCollector = createSlotCollector();
  const r = simulateMatch(squadA, squadB, formationA, formationB, fit.fullLineupA, fit.fullLineupB, {
    knockout,
    executionFamiliarity: sideFamiliarity,
    morale: sideMorale,
    temperament: sideTemperament,
    mental: sideMental,
    ...(matchHolder !== undefined ? { decisions: { HOLDER: matchHolder } } : {}),
    managerDiscipline: sideMgrDiscipline,
    instructions: sideInstructions,
    setPieceRoutines: sideRoutines,
    study: sideStudy,
    ...(matchPitch !== undefined ? { pitchCondition: matchPitch } : {}),
    ...(matchTurf ? { turf: matchTurf } : {}),
      ...(matchWeather ? { weather: matchWeather } : {}),
    ...(matchReferee !== undefined || matchRefQuality !== undefined
      ? { referee: {
          id: "ref_lab", name: "Lab referee", country: "England", strictness: matchReferee ?? 0,
          ...(matchRefQuality !== undefined ? { quality: matchRefQuality, ...(matchVar ? { var: true } : {}) } : {}),
        } }
      : {}),
    onTick: slotCollector.onTick,
  });
  const slotRaws = slotCollector.finish(r);
  teamA.slotStats = slotRaws.A;
  teamB.slotStats = slotRaws.B;
  const sA = r.teamStats.A;
  const sB = r.teamStats.B;

  teamA.goals           += r.score.A;          teamB.goals           += r.score.B;
  teamA.shots           += sA.shots;           teamB.shots           += sB.shots;
  teamA.shotsOnTarget   += sA.shotsOnTarget;   teamB.shotsOnTarget   += sB.shotsOnTarget;
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
  teamA.injuries += sA.injuries; teamB.injuries += sB.injuries;
  teamA.injuryStoppages += sA.injuryStoppages; teamB.injuryStoppages += sB.injuryStoppages;
  teamA.ballNearTicks += sA.ballNearTicks; teamB.ballNearTicks += sB.ballNearTicks;
  teamA.ballNearSum += sA.ballNearSum; teamB.ballNearSum += sB.ballNearSum;
  teamA.ballCrowdTicks += sA.ballCrowdTicks; teamB.ballCrowdTicks += sB.ballCrowdTicks;
  // Referee errors / VAR (`var.md`): match totals on both sides (a match property, like the rigor).
  for (const t of [teamA, teamB]) {
    t.refereeErrors += sA.refereeErrors + sB.refereeErrors;
    t.varReviews += sA.varReviews + sB.varReviews;
    t.varOverturned += sA.varOverturned + sB.varOverturned;
  }
  teamA.fouls            += sA.fouls;            teamB.fouls            += sB.fouls;
  teamA.yellowCards      += sA.yellowCards;      teamB.yellowCards      += sB.yellowCards;
  teamA.redCards         += sA.redCards;         teamB.redCards         += sB.redCards;
  teamA.penaltiesAwarded += sA.penaltiesAwarded; teamB.penaltiesAwarded += sB.penaltiesAwarded;
  teamA.penaltyGoals     += sA.penaltyGoals;     teamB.penaltyGoals     += sB.penaltyGoals;
  teamA.offsides         += sA.offsides;         teamB.offsides         += sB.offsides;
  teamA.crosses            += sA.crosses;            teamB.crosses            += sB.crosses;
  teamA.crossesCompleted   += sA.crossesCompleted;   teamB.crossesCompleted   += sB.crossesCompleted;
  teamA.aerialDuels        += sA.aerialDuels;        teamB.aerialDuels        += sB.aerialDuels;
  teamA.aerialDuelsWon     += sA.aerialDuelsWon;     teamB.aerialDuelsWon     += sB.aerialDuelsWon;
  teamA.headerGoals        += sA.headerGoals;        teamB.headerGoals        += sB.headerGoals;
  teamA.longBalls          += sA.longBalls;          teamB.longBalls          += sB.longBalls;
  teamA.longBallsCompleted += sA.longBallsCompleted; teamB.longBallsCompleted += sB.longBallsCompleted;
  teamA.keeperSorties      += sA.keeperSorties;      teamB.keeperSorties      += sB.keeperSorties;
  teamA.keeperSweeps       += sA.keeperSweeps;       teamB.keeperSweeps       += sB.keeperSweeps;
  teamA.keeperSmothers     += sA.keeperSmothers;     teamB.keeperSmothers     += sB.keeperSmothers;
  teamA.keeperHolds        += sA.keeperHolds;        teamB.keeperHolds        += sB.keeperHolds;
  teamA.keeperSpills       += sA.keeperSpills;       teamB.keeperSpills       += sB.keeperSpills;
  teamA.distanceCovered    += sA.distanceCovered ?? 0; teamB.distanceCovered  += sB.distanceCovered ?? 0;
  teamA.sprints            += sA.sprints ?? 0;       teamB.sprints            += sB.sprints ?? 0;
  // Decision telemetry (`decisions.md`); absent in the quickSim stats.
  teamA.holderDecisions += sA.holderDecisions ?? 0; teamB.holderDecisions += sB.holderDecisions ?? 0;
  teamA.offBallDecisions += sA.offBallDecisions ?? 0; teamB.offBallDecisions += sB.offBallDecisions ?? 0;
  teamA.defenseDecisions += sA.defenseDecisions ?? 0; teamB.defenseDecisions += sB.defenseDecisions ?? 0;
  teamA.holderNearTies += sA.holderNearTies ?? 0; teamB.holderNearTies += sB.holderNearTies ?? 0;
  teamA.offBallNearTies += sA.offBallNearTies ?? 0; teamB.offBallNearTies += sB.offBallNearTies ?? 0;
  teamA.defenseNearTies += sA.defenseNearTies ?? 0; teamB.defenseNearTies += sB.defenseNearTies ?? 0;
  teamA.holderEntropySum += sA.holderEntropy ?? 0; teamB.holderEntropySum += sB.holderEntropy ?? 0;
  teamA.offBallEntropySum += sA.offBallEntropy ?? 0; teamB.offBallEntropySum += sB.offBallEntropy ?? 0;
  teamA.defenseEntropySum += sA.defenseEntropy ?? 0; teamB.defenseEntropySum += sB.defenseEntropy ?? 0;
  teamA.holderPressureSum += sA.holderPressureSum ?? 0; teamB.holderPressureSum += sB.holderPressureSum ?? 0;
  teamA.holderMindDecisions += sA.holderMindDecisions ?? 0; teamB.holderMindDecisions += sB.holderMindDecisions ?? 0;
  teamA.holderOffArgmax += sA.holderOffArgmax ?? 0; teamB.holderOffArgmax += sB.holderOffArgmax ?? 0;
  teamA.holderWindows += sA.holderWindows ?? 0; teamB.holderWindows += sB.holderWindows ?? 0;
  teamA.holderLapses += sA.holderLapses ?? 0; teamB.holderLapses += sB.holderLapses ?? 0;
  teamA.holderReleases += sA.holderReleases ?? 0; teamB.holderReleases += sB.holderReleases ?? 0;
  teamA.holderHighPressure += sA.holderHighPressure ?? 0; teamB.holderHighPressure += sB.holderHighPressure ?? 0;
  teamA.holderReleasesHigh += sA.holderReleasesHigh ?? 0; teamB.holderReleasesHigh += sB.holderReleasesHigh ?? 0;
  teamA.moveShield += sA.moveShield ?? 0; teamB.moveShield += sB.moveShield ?? 0;
  teamA.moveShieldHeld += sA.moveShieldHeld ?? 0; teamB.moveShieldHeld += sB.moveShieldHeld ?? 0;
  teamA.moveCutInside += sA.moveCutInside ?? 0; teamB.moveCutInside += sB.moveCutInside ?? 0;
  teamA.moveLayOff += sA.moveLayOff ?? 0; teamB.moveLayOff += sB.moveLayOff ?? 0;
  teamA.moveChip += sA.moveChip ?? 0; teamB.moveChip += sB.moveChip ?? 0;
  teamA.moveChipGoals += sA.moveChipGoals ?? 0; teamB.moveChipGoals += sB.moveChipGoals ?? 0;
  teamA.moveRound += sA.moveRound ?? 0; teamB.moveRound += sB.moveRound ?? 0;
  teamA.moveRoundWon += sA.moveRoundWon ?? 0; teamB.moveRoundWon += sB.moveRoundWon ?? 0;
  teamA.ballsOutOfPlay += sA.ballsOutOfPlay ?? 0; teamB.ballsOutOfPlay += sB.ballsOutOfPlay ?? 0;
  teamA.deflections += sA.deflections ?? 0; teamB.deflections += sB.deflections ?? 0;
  teamA.shotsBlocked += sA.shotsBlocked ?? 0; teamB.shotsBlocked += sB.shotsBlocked ?? 0;
  teamA.heavyTouches += sA.heavyTouches ?? 0; teamB.heavyTouches += sB.heavyTouches ?? 0;
  teamA.lineStepUps += sA.lineStepUps ?? 0; teamB.lineStepUps += sB.lineStepUps ?? 0;
  teamA.lineDrops += sA.lineDrops ?? 0; teamB.lineDrops += sB.lineDrops ?? 0;
  teamA.pressStandOffs += sA.pressStandOffs ?? 0; teamB.pressStandOffs += sB.pressStandOffs ?? 0;
  teamA.supportShort += sA.supportShort ?? 0; teamB.supportShort += sB.supportShort ?? 0;
  teamA.anticipationReads += sA.anticipationReads ?? 0; teamB.anticipationReads += sB.anticipationReads ?? 0;
  teamA.passesMissed += sA.passesMissed ?? 0; teamB.passesMissed += sB.passesMissed ?? 0;
  teamA.passesLofted += sA.passesLofted ?? 0; teamB.passesLofted += sB.passesLofted ?? 0;
  teamA.highBalls += sA.highBalls ?? 0; teamB.highBalls += sB.highBalls ?? 0;
  teamA.ballAirSeconds += sA.ballAirSeconds ?? 0; teamB.ballAirSeconds += sB.ballAirSeconds ?? 0;
  teamA.crossPeakSum += sA.crossPeakSum ?? 0; teamB.crossPeakSum += sB.crossPeakSum ?? 0;
  teamA.crossPeakN += sA.crossPeakN ?? 0; teamB.crossPeakN += sB.crossPeakN ?? 0;
  teamA.cornerPeakSum += sA.cornerPeakSum ?? 0; teamB.cornerPeakSum += sB.cornerPeakSum ?? 0;
  teamA.cornerPeakN += sA.cornerPeakN ?? 0; teamB.cornerPeakN += sB.cornerPeakN ?? 0;
  teamA.longPeakSum += sA.longPeakSum ?? 0; teamB.longPeakSum += sB.longPeakSum ?? 0;
  teamA.longPeakN += sA.longPeakN ?? 0; teamB.longPeakN += sB.longPeakN ?? 0;
  teamA.passGround += sA.passGround ?? 0; teamB.passGround += sB.passGround ?? 0;
  teamA.passDriven += sA.passDriven ?? 0; teamB.passDriven += sB.passDriven ?? 0;
  teamA.passChip += sA.passChip ?? 0; teamB.passChip += sB.passChip ?? 0;
  teamA.passHigh += sA.passHigh ?? 0; teamB.passHigh += sB.passHigh ?? 0;
  teamA.passThroughLow += sA.passThroughLow ?? 0; teamB.passThroughLow += sB.passThroughLow ?? 0;
  teamA.passThroughHigh += sA.passThroughHigh ?? 0; teamB.passThroughHigh += sB.passThroughHigh ?? 0;
  teamA.passHeader += sA.passHeader ?? 0; teamB.passHeader += sB.passHeader ?? 0;
  teamA.passLaunchSpeedSum += sA.passLaunchSpeedSum ?? 0; teamB.passLaunchSpeedSum += sB.passLaunchSpeedSum ?? 0;
  teamA.passLaunchN += sA.passLaunchN ?? 0; teamB.passLaunchN += sB.passLaunchN ?? 0;
  teamA.holderHolds += sA.holderHolds ?? 0; teamB.holderHolds += sB.holderHolds ?? 0;
  teamA.holderTurns += sA.holderTurns ?? 0; teamB.holderTurns += sB.holderTurns ?? 0;
  teamA.corners             += sA.corners;             teamB.corners             += sB.corners;
  teamA.throwIns            += sA.throwIns ?? 0;       teamB.throwIns            += sB.throwIns ?? 0;
  teamA.setPieceRoutines            += sA.setPieceRoutines ?? 0;       teamB.setPieceRoutines            += sB.setPieceRoutines ?? 0;
  // The opponent's plan against this side (`studyPlan`, a team counter of the side that brought it).
  teamA.preparedAgainst             += sB.studyPlans ?? 0;             teamB.preparedAgainst             += sA.studyPlans ?? 0;
  teamA.freeKicks           += sA.freeKicks;           teamB.freeKicks           += sB.freeKicks;
  teamA.directFreeKickShots += sA.directFreeKickShots; teamB.directFreeKickShots += sB.directFreeKickShots;
  teamA.directFreeKickGoals += sA.directFreeKickGoals; teamB.directFreeKickGoals += sB.directFreeKickGoals;
  teamA.setPieceGoals       += sA.setPieceGoals;       teamB.setPieceGoals       += sB.setPieceGoals;
  teamA.markedTargetShots   += sA.markedTargetShots;   teamB.markedTargetShots   += sB.markedTargetShots;
  teamA.markedTargetGoals   += sA.markedTargetGoals;   teamB.markedTargetGoals   += sB.markedTargetGoals;
  teamA.manMarkedMinutes    += sA.manMarked;           teamB.manMarkedMinutes    += sB.manMarked;

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
      loadVariantFormation(variantA),
      loadVariantFormation(variantB),
    ]);

    const baseSquadA = withFitnessCoach(prefixIds(buildSquad(variantA.squad, variantA.label), "A"), variantA.fitnessCoachStars);
    const baseSquadB = withFitnessCoach(prefixIds(buildSquad(variantB.squad, variantB.label), "B"), variantB.fitnessCoachStars);

    // Apply per-team tactics ONCE — all matches use them.
    // `mentality` is optional (absent ⇒ "balanced", a no-op shift) — see lab/types.ts.
    // `familiarity` (absent = neutral): the side's familiarity with its own style.
    // A studied side (`Variant.studied`, full engine only): the OTHER side plays the plan against it — the counter
    // style at the AI's familiarity rule (no axes of its own) instead of its own style.
    const planOf = (studied: Variant): TeamStudy | undefined =>
      studied.studied && simEngine === "full" ? { level: studied.studied, style: counterStyle(studied.tacticalStyle) } : undefined;
    sideStudy = { A: planOf(variantB), B: planOf(variantA) };
    const styleA = sideStudy.A?.style ?? variantA.tacticalStyle;
    const styleB = sideStudy.B?.style ?? variantB.tacticalStyle;
    const famA = sideStudy.A ? aiFamiliarity(styleA) : variantFamiliarity(variantA);
    const famB = sideStudy.B ? aiFamiliarity(styleB) : variantFamiliarity(variantB);
    applyTeamTacticsConfig("A", styleA, variantA.mentality ?? DEFAULT_MENTALITY, sideStudy.A ? undefined : variantA.axesOverride, famA);
    applyTeamAttackConfig("A", styleA, variantA.mentality ?? DEFAULT_MENTALITY, sideStudy.A ? undefined : variantA.axesOverride, famA);
    applyTeamTacticsConfig("B", styleB, variantB.mentality ?? DEFAULT_MENTALITY, sideStudy.B ? undefined : variantB.axesOverride, famB);
    applyTeamAttackConfig("B", styleB, variantB.mentality ?? DEFAULT_MENTALITY, sideStudy.B ? undefined : variantB.axesOverride, famB);
    sideFamiliarity = {
      A: sideStudy.A ? famA?.[styleA] : variantA.familiarity,
      B: sideStudy.B ? famB?.[styleB] : variantB.familiarity,
    };
    sideMorale = { A: variantA.morale, B: variantB.morale };
    sideNewcomers = { A: variantA.newcomers, B: variantB.newcomers };
    sideTemperament = { A: variantA.temperament, B: variantB.temperament };
    sideMental = { A: variantA.decisions?.mental, B: variantB.decisions?.mental };
    matchHolder = variantA.decisions?.holder;
    sideMgrDiscipline = { A: variantA.managerDiscipline, B: variantB.managerDiscipline };
    matchPitch = variantA.pitchCondition;
    matchTurf = variantA.turf;
    matchWeather = variantA.weather;
    matchReferee = variantA.refereeStrictness;
    matchRefQuality = variantA.refereeQuality;
    matchVar = variantA.var === true;
    // Player kinematics (`kinematics.md`): the match property comes from variant A (one engine per worker thread).
    KINEMATICS_CONFIG.ENABLED = variantA.kinematics !== "off";
    sideInstructions = {
      A: { slotInstructions: variantA.slotInstructions, manMarks: variantA.manMarks },
      B: { slotInstructions: variantB.slotInstructions, manMarks: variantB.manMarks },
    };
    const routinesOf = (r: typeof variantA.setPieceRoutine) => (r ? { corners: [r], freeKicks: [r] } : undefined);
    sideRoutines = { A: routinesOf(variantA.setPieceRoutine), B: routinesOf(variantB.setPieceRoutine) };

    // quickSim: each side plays its own formation — slot-ordered lineup + slot roles.
    // Computed once from the base (full-fitness) squad: the lineup ORDER doesn't depend on
    // fitness here (congestion never re-picks the XI — see fitnessCarry.ts doc comment),
    // only each named player's own seasonLog.fitness/.load (mutated between congestion games).
    const quickRolesA = slotRoles(formationA);
    const quickRolesB = slotRoles(formationB);
    const quickLineupA = variantA.outOfPosition ? lineOrderLineup(quickRolesA, baseSquadA.players) : autoLineupForFormation(baseSquadA, formationA);
    const quickLineupB = variantB.outOfPosition ? lineOrderLineup(quickRolesB, baseSquadB.players) : autoLineupForFormation(baseSquadB, formationB);
    // A `high` plan also man-marks the studied side's best attacker (by slot: the lab's own XI picker runs).
    const planMark = (side: "A" | "B") => {
      if (sideStudy[side]?.level !== "high") return;
      const mine = side === "A" ? { roles: quickRolesA, lineup: quickLineupA, players: baseSquadA.players } : { roles: quickRolesB, lineup: quickLineupB, players: baseSquadB.players };
      const theirs = side === "A" ? { roles: quickRolesB, lineup: quickLineupB, players: baseSquadB.players } : { roles: quickRolesA, lineup: quickLineupA, players: baseSquadA.players };
      const slot = pickMarkerSlot(mine);
      const target = pickMarkTarget(theirs);
      const targetSlot = target ? theirs.lineup.indexOf(target.rosterId) : -1;
      if (slot === null || targetSlot < 0) return;
      sideInstructions = { ...sideInstructions, [side]: { ...sideInstructions[side], manMarks: [{ slot, targetSlot }] } };
    };
    planMark("A");
    planMark("B");
    // The full engine only gets explicit lineups for out-of-position variants (otherwise its own
    // role picker runs, unchanged); the poor-fit count uses the lineup the quickSim would field.
    const fit: LineupFit = {
      fullLineupA: variantA.outOfPosition ? quickLineupA : undefined,
      fullLineupB: variantB.outOfPosition ? quickLineupB : undefined,
      poorA: poorFitStarters(baseSquadA.players, quickLineupA, quickRolesA),
      poorB: poorFitStarters(baseSquadB.players, quickLineupB, quickRolesB),
    };

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
            simEngine, knockout, rep * congestion.matches + g, fit,
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
        simEngine, knockout, m, fit,
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
