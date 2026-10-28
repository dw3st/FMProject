/**
 * The live match between two managers, as a plain object (multiplayer part 7, spec
 * 2026-10-27-multiplayer-h2h-live §2). `h2hWorker.ts` is a thin shell around it; tests drive it directly.
 *
 * It owns the engine globals of this match (`gameBus`, per-team tactic configs, `Statistics`, `PlayerRating`),
 * so one process (one Bun Worker) runs one match. Every method returns the messages to post (`WorkerOut[]`).
 *
 * Clock: real time × `speed` (1 in play), the same scaling the live pitch uses at 1× (`PixiPitch`:
 * `advanceSim(state, elapsedRealSeconds × gameSpeed, carry)`); `tickState` turns real seconds into game seconds
 * itself and drains the presentation countdowns (pre-match, half-time, extra-time break, shootout kicks) in real
 * seconds, so the match never waits for a screen.
 */
import { advanceSim, SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import {
  applyPlayerInstruction, changeFormation, fillInjuryVacancy, getBallPos, matchMinute, setManMarks,
  swapPlayerPositions, tickState,
} from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
// Statistics and PlayerRating subscribe to the gameBus when imported.
import { exportStatsState, getGoalLog, getTeamStats, initStats } from "@/GameEngine/Domain/Statistics";
import { exportRatings, initRatings } from "@/GameEngine/Domain/PlayerRating";
import { effectiveInstruction } from "@/GameEngine/Configs/RoleVariantConfig";
import type { GameState, TeamId } from "@/GameEngine/types";
import { buildLiveMatchState, type LiveMatchInput, type LiveSideTactics } from "@/Domain/match/liveMatchSetup";
import { applyLiveTactics } from "@/Domain/tactics/liveTactics";
import { sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { formationForSimId } from "@/Domain/matchFormations";
import { H2H } from "@/Domain/h2h/h2hConfig";
import type { H2HCommand, H2HSide, H2HStatsPayload, WorkerOut } from "@/types/h2hTypes";

/** gameBus events the match screen, its feed / summary and the pitch effects listen to. */
export const H2H_FORWARDED_EVENTS = [
  "goalScored", "goalDisallowed", "card", "foul", "freeKickAwarded", "cornerAwarded", "penaltyAwarded",
  "penaltyResolved", "offsideCalled", "injury", "injuryNeedsSub", "playerSubstituted", "positionsSwapped",
  "varCheck", "varReview", "refereeError", "halfTime", "extraTimeStart", "penaltyKick", "shootoutEnd",
  "matchStart", "matchEnd", "kickOff", "shot", "shotResolved", "header", "teamIntentChanged",
] as const satisfies readonly (keyof GameEvents)[];

/** Forwarded events that do not need an immediate full state (the next frame / periodic state covers them). */
const NO_STATE_AFTER = new Set<string>(["shot", "shotResolved", "header", "kickOff", "teamIntentChanged"]);

export interface H2HMatch {
  readonly state: GameState;
  readonly done: boolean;
  readonly paused: boolean;
  /** Advance by `realMs` of real time (× speed) and return the messages due. */
  tick(realMs: number): WorkerOut[];
  command(side: H2HSide, cmd: H2HCommand): WorkerOut[];
  setPaused(paused: boolean): WorkerOut[];
  setAuto(side: H2HSide, on: boolean): WorkerOut[];
  /** Real-time multiplier (tests only; 1 in play). */
  setSpeed(factor: number): void;
  /** Unsubscribes from the gameBus. */
  dispose(): void;
}

export function createH2HMatch(input: LiveMatchInput): H2HMatch {
  let state = buildLiveMatchState(input);
  initRatings(state.players.map((p) => p.id));
  initStats(state.players.map((p) => ({ id: p.id, team: p.team })));

  const tactics: Record<TeamId, LiveSideTactics> = { A: { ...input.A.tactics }, B: { ...input.B.tactics } };
  /** Sides whose manager picks injury replacements when the assistant is off (#140). */
  const manualByDefault: Record<TeamId, boolean> = {
    A: !!state.manualInjurySubs?.A, B: !!state.manualInjurySubs?.B,
  };

  let outbox: WorkerOut[] = [];
  let stateDue = false;
  let carry = 0;
  let speed = 1;
  let paused = false;
  let done = false;
  let clockMs = 0;
  let sinceFrame = 0;
  let sinceState = 0;

  const unsubs = H2H_FORWARDED_EVENTS.map((name) =>
    gameBus.on(name, (payload: unknown) => {
      outbox.push({ type: "event", name, payload });
      if (!NO_STATE_AFTER.has(name)) stateDue = true;
    }),
  );

  const stats = (): H2HStatsPayload => ({
    snapshot: exportStatsState(),
    ratings: exportRatings(),
    teams: { A: { ...getTeamStats("A") }, B: { ...getTeamStats("B") } },
    goals: getGoalLog().map((g) => ({ ...g })),
  });
  // The through-ball cell cache is engine bookkeeping (large, rebuilt on the next tick).
  const wireState = (): GameState => ({ ...state, throughBallCellsCache: null });
  const frame = (): WorkerOut => {
    const ball = getBallPos(state);
    return {
      type: "frame",
      t: clockMs,
      ball: [ball.x, ball.y],
      players: state.players.map((p) => [p.id, p.x, p.y] as [number, number, number]),
      minute: matchMinute(state),
      phase: state.matchPhase,
      score: { ...state.score },
    };
  };

  /** Drains the outbox, appending a full state when an event asked for one. */
  const flush = (): WorkerOut[] => {
    if (stateDue && !done) {
      outbox.push({ type: "state", state: wireState(), stats: stats() });
      sinceState = 0;
    }
    stateDue = false;
    const out = outbox;
    outbox = [];
    return out;
  };

  const finishIfOver = () => {
    if (done || state.matchPhase !== "matchEnd") return;
    done = true;
    stateDue = false;
    outbox.push(frame());
    outbox.push({ type: "done", state: wireState(), stats: stats() });
  };

  /** A tactics change re-runs a zero-dt tick, as the live pitch does on `tacticsChanged`. */
  const retick = () => {
    if (state.matchPhase === "matchEnd") return;
    state = tickState(state, 0).state;
  };

  /** Advances the match; returns how many sim steps ran (a frame goes out after each batch that moved). */
  const advance = (gameSeconds: number): number => {
    let ran = 0;
    let budget = carry + gameSeconds;
    carry = 0;
    // A goal or a phase change stops `advanceSim` early; keep going with what is left of the budget.
    while (budget > 0 && state.matchPhase !== "matchEnd") {
      const r = advanceSim(state, budget, 0);
      state = r.state;
      ran += r.steps;
      if (!r.stoppedBy) { carry = r.carry; break; }
      budget -= r.steps * SIM_STEP;
      if (r.steps === 0) break;
    }
    return ran;
  };

  const queueSub = (side: TeamId, outId: number, inId: number) => {
    const vacancy = state.injuryVacancies?.[side]?.find((v) => v.injuredId === outId);
    if (vacancy) { state = fillInjuryVacancy(state, side, outId, inId); return; }
    const key = side === "A" ? "pendingSubsA" : "pendingSubsB";
    const queue = state[key];
    const left = (side === "A" ? state.subsRemainingA : state.subsRemainingB) - queue.length;
    const onPitch = state.players.some((p) => p.id === outId && p.team === side);
    const bench = side === "A" ? state.benchA : state.benchB;
    if (left <= 0 || !onPitch || !bench.some((p) => p.id === inId)) return;
    if (queue.some((q) => q.outId === outId || q.inId === inId)) return;
    state = { ...state, [key]: [...queue, { outId, inId }] };
    stateDue = true;
  };

  return {
    get state() { return state; },
    get done() { return done; },
    get paused() { return paused; },

    tick(realMs: number): WorkerOut[] {
      if (done) return flush();
      clockMs += realMs;
      const ran = paused ? 0 : advance((realMs / 1000) * speed);
      finishIfOver();
      if (done) return flush();
      // Positions only change on a sim step: one frame per step that ran, never a duplicate in between.
      sinceFrame += realMs;
      sinceState += realMs;
      if (ran > 0 || sinceFrame >= H2H.STATE_MS) {
        sinceFrame = 0;
        outbox.push(frame());
      }
      if (sinceState >= H2H.STATE_MS) stateDue = true;
      return flush();
    },

    command(side: H2HSide, cmd: H2HCommand): WorkerOut[] {
      if (done) return [];
      switch (cmd.kind) {
        case "sub":
          queueSub(side, cmd.outId, cmd.inId);
          break;
        case "swap":
          state = swapPlayerPositions(state, side, cmd.aId, cmd.bId);
          break;
        case "mentality":
          tactics[side] = { ...tactics[side], mentality: cmd.mentality };
          applyLiveTactics(side, tactics[side], cmd.mentality, tactics[side].familiarity);
          retick();
          break;
        case "tactics":
          tactics[side] = { ...tactics[side], style: cmd.style, axesOverride: cmd.axesOverride };
          applyLiveTactics(side, tactics[side], tactics[side].mentality, tactics[side].familiarity);
          retick();
          break;
        case "formation": {
          const formation = formationForSimId(cmd.formation);
          state = changeFormation(state, side, formation);
          // A variant the new slot's role does not accept falls back to the default (the pressing stays).
          const list = sanitizeSlotInstructions(formation, state.slotInstructions?.[side]);
          state = { ...state, slotInstructions: { ...state.slotInstructions, [side]: list } };
          break;
        }
        case "instruction": {
          const formation = side === "A" ? state.formationA : state.formationB;
          const role = formation.attacking[cmd.slot]?.role;
          if (!role) break;
          state = applyPlayerInstruction(state, side, cmd.slot, effectiveInstruction(role, cmd.instruction) ?? null);
          break;
        }
        case "marks":
          state = setManMarks(state, side, cmd.marks);
          break;
      }
      stateDue = true;
      return flush();
    },

    setPaused(next: boolean): WorkerOut[] {
      if (done || paused === next) return [];
      paused = next;
      stateDue = true;
      return flush();
    },

    setAuto(side: H2HSide, on: boolean): WorkerOut[] {
      if (done) return [];
      const autoSubs = { ...state.autoSubs };
      const manual = { ...state.manualInjurySubs };
      if (on) {
        autoSubs[side] = true;
        delete manual[side];
      } else {
        delete autoSubs[side];
        if (manualByDefault[side]) manual[side] = true;
      }
      state = { ...state, autoSubs, manualInjurySubs: manual };
      // The assistant fills the injury vacancies left waiting for the manager.
      if (on) {
        for (const v of state.injuryVacancies?.[side] ?? []) {
          if (v.suggestedInId !== null) state = fillInjuryVacancy(state, side, v.injuredId, v.suggestedInId);
        }
      }
      stateDue = true;
      return flush();
    },

    setSpeed(factor: number) {
      if (Number.isFinite(factor) && factor > 0) speed = factor;
    },

    dispose() {
      for (const off of unsubs) off();
    },
  };
}
