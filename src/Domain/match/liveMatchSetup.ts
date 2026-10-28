/**
 * The fresh `GameState` of a live match (multiplayer part 7, spec 2026-10-27-multiplayer-h2h-live §2).
 *
 * Shared by the live match page (`MatchScreen`, the user is side A) and the H2H worker (both sides human).
 * The input is plain data (no functions, no squads): it can be posted to a Bun `Worker`. The staff part of the
 * injury multiplier is precomputed by the caller (`staffEffectsOf(squad).injuryMult`) so the squad itself never
 * has to travel; the pitch part is applied here.
 */
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { setTeamMoraleOverride } from "@/GameEngine/Configs/MoraleConfig";
import type { EngineWeather } from "@/GameEngine/Configs/WeatherConfig";
import { applyTeamInstructions, createMatchState, setManMarksBySlot } from "@/GameEngine/Domain/gameState";
import type { Formation, GameState, SetPieceTakers, TeamId } from "@/GameEngine/types";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { pitchInjury } from "@/Domain/facilities/turf";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import type { RosterPlayer } from "@/types/playerTypes";
import type { Mentality, SlotInstruction, TacticalAxes, TacticalStyle } from "@/types/tacticsTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";
import type { TurfType } from "@/types/facilityTypes";
import type { EngineReferee } from "@/types/refereeTypes";

export interface LiveSideTactics {
  style: TacticalStyle;
  mentality: Mentality;
  axesOverride?: Partial<TacticalAxes>;
  familiarity?: FamiliarityLevels;
}

export interface LiveSideInput {
  /** Players who may play this match (starters and bench): `eligibleLivePlayers`. */
  players: RosterPlayer[];
  /** The resolved formation (ready-made or free). */
  formation: Formation;
  /** Saved XI (human). Absent = automatic, fitness-aware XI of the formation (AI side). */
  lineup?: string[];
  tactics: LiveSideTactics;
  /** `staffEffectsOf(squad).injuryMult`; absent = no injury multiplier on this side at all (no own squad). */
  staffInjuryMult?: number;
  /** "own": each player at his stored morale; "neutral": the team at `MORALE.NEUTRAL` (no own squad). */
  morale: "own" | "neutral";
  /** A human manager: slot instructions, man-marking, set-piece takers, manual injury subs. */
  human: boolean;
  slotInstructions?: (SlotInstruction | null)[];
  marks?: { slot: number; targetRosterId: string }[];
  setPieceTakers?: SetPieceTakers;
  /** Touchline ban: the assistant makes every change by the AI rule (`var.md` §4). */
  managerBanned?: boolean;
  /** The manager's Discipline attribute (`achievements.md`). */
  managerDiscipline?: number;
  /** The manager kicks and saves his penalties in 2D (`GameState.penaltyInteractive`); absent = automatic. */
  penalty2d?: boolean;
}

export interface LiveMatchInput {
  A: LiveSideInput;
  B: LiveSideInput;
  /** Match date (YYYY-MM-DD): fitness of the automatic XI. */
  date: string;
  knockout: boolean;
  /** First-leg goals of each engine side (two-legged ties). */
  aggregate?: { A: number; B: number };
  pitch?: { condition: number; turf?: TurfType };
  /** The weather that plays (a closed roof: neutral). */
  weather?: EngineWeather;
  referee?: EngineReferee;
}

const SIDES: TeamId[] = ["A", "B"];

/** The players who may play a match: not injured or suspended, and registered when a list is given. */
export function eligibleLivePlayers(players: RosterPlayer[], date: string, registered: Set<string> | null): RosterPlayer[] {
  return players.filter((p) => !isUnavailable(p, date) && (!registered || registered.has(p.id)));
}

/** Per-team engine configs of a live match: tactics (style, mentality, axes, familiarity) and morale overrides. */
export function applyLiveSideConfigs(sides: Record<TeamId, Pick<LiveSideInput, "tactics" | "morale">>): void {
  for (const team of SIDES) {
    const t = sides[team].tactics;
    applyTeamTacticsConfig(team, t.style, t.mentality, t.axesOverride, t.familiarity);
    applyTeamAttackConfig(team, t.style, t.mentality, t.axesOverride, t.familiarity);
  }
  for (const team of SIDES) setTeamMoraleOverride(team, sides[team].morale === "neutral" ? MORALE.NEUTRAL : undefined);
}

/**
 * Applies the per-team engine configs (tactics, morale overrides) and returns the fresh GameState.
 * Side effects on the engine globals: call it where those globals belong to this match (the client page or the
 * H2H worker).
 */
export function buildLiveMatchState(input: LiveMatchInput): GameState {
  applyLiveSideConfigs(input);
  const lineupOf = (side: LiveSideInput) =>
    side.lineup ?? autoFillLineupWithFitness(
      getFormationSlots(side.formation as unknown as FormationShape, "attacking"), side.players, input.date,
    );
  const lineupA = lineupOf(input.A);
  const lineupB = lineupOf(input.B);
  const pitchMult = pitchInjury(input.pitch?.condition ?? 90, input.pitch?.turf);
  const injuryMult: { A?: number; B?: number } = {};
  for (const team of SIDES) {
    const m = input[team].staffInjuryMult;
    if (m !== undefined) injuryMult[team] = m * pitchMult;
  }

  const autoSubs: Partial<Record<TeamId, true>> = {};
  const manualInjurySubs: Partial<Record<TeamId, true>> = {};
  const setPieceTakers: Partial<Record<TeamId, SetPieceTakers>> = {};
  const managerDiscipline: Partial<Record<TeamId, number>> = {};
  for (const team of SIDES) {
    const side = input[team];
    // #140: a human picks the replacement of an injured player; a banned manager watches from the stands and his
    // assistant makes every change by the AI rule.
    if (side.managerBanned) autoSubs[team] = true;
    else if (side.human) manualInjurySubs[team] = true;
    if (side.human && side.setPieceTakers) setPieceTakers[team] = side.setPieceTakers;
    if (side.managerDiscipline !== undefined) managerDiscipline[team] = side.managerDiscipline;
  }
  const some = (o: object) => Object.keys(o).length > 0;

  let state: GameState = {
    ...createMatchState(input.A.players, input.A.formation, input.B.players, input.B.formation, lineupA, lineupB, injuryMult),
    knockout: input.knockout,
    ...(input.weather ? { weather: input.weather } : {}),
    ...(input.referee ? { referee: input.referee } : {}),
    ...(some(autoSubs) ? { autoSubs } : {}),
    ...(some(manualInjurySubs) ? { manualInjurySubs } : {}),
    ...(some(setPieceTakers) ? { setPieceTakers } : {}),
    ...(some(managerDiscipline) ? { managerDiscipline } : {}),
    ...(input.aggregate ? { aggregate: input.aggregate } : {}),
    ...(SIDES.some((t) => input[t].penalty2d) ? { penaltyInteractive: SIDES.filter((t) => input[t].penalty2d) } : {}),
  };
  // Player instructions of each human side: the saved slot instructions and this match's man-marking.
  for (const team of SIDES) {
    const side = input[team];
    if (!side.human) continue;
    state = setManMarksBySlot(applyTeamInstructions(state, team, side.slotInstructions), team, side.marks ?? []);
  }
  return state;
}
