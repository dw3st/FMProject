/**
 * The live match between two managers, as a plain object (multiplayer part 7, spec
 * 2026-10-27-multiplayer-h2h-live §2). `h2hWorker.ts` is a thin shell around it; tests drive it directly.
 *
 * It owns the engine globals of this match (`gameBus`, per-team tactic configs, `Statistics`, `PlayerRating`),
 * so one process (one Bun Worker) runs one match. Every method returns the messages to post (`WorkerOut[]`).
 *
 * Clock (stage 22): the 90 physical minutes (`clockScale` 1). Mode A ("full") runs real time × `speed` ×
 * `MODE_A_SPEED`, the pace of the solo page's mode A, the same for both managers (the speed is the lower of their two
 * choices); mode B ("highlights") plays the lances at real time × `speed` and jumps over the rest with the snapshots
 * of a forecast run ahead in another thread (`HighlightPlayback` + `ForecastCore`, the same rule as the solo page).
 * The presentation pauses (pre-match, half time, the extra-time break, shootout kicks, a VAR check) run in real
 * seconds in both modes.
 *
 * Frames go out at a fixed real rate (`H2H.FRAME_MS`) with the ball at every step in between (`path`), never one per
 * step: at 13× a step-per-frame stream would be 65 frames a second.
 */
import { advanceSim, SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import {
  applyPenaltyOutcome, applyPlayerInstruction, changeFormation, clockScaleOf, fillInjuryVacancy, getBallPos, matchMinute,
  setManMarks, moveToEmptySlot, swapPlayerPositions, tickState,
} from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
// Statistics and PlayerRating subscribe to the gameBus when imported.
import { exportStatsState, getGoalLog, getTeamStats, initStats } from "@/GameEngine/Domain/Statistics";
import { exportRatings, initRatings } from "@/GameEngine/Domain/PlayerRating";
import { effectiveInstruction } from "@/GameEngine/Configs/RoleVariantConfig";
import { HighlightPlayback, workerForecastPort, type ForecastPort, type PlaybackView } from "@/GameEngine/Support/HighlightPlayback";
import { createForecast, type ForecastChunk } from "@/GameEngine/Support/ForecastCore";
import { captureLiveSnapshot, restoreLiveSnapshot } from "@/GameEngine/Support/LiveSnapshot";
import type { HighlightLevel } from "@/GameEngine/Domain/Highlights";
import type { GameState, PenaltyOutcome, TeamId } from "@/GameEngine/types";
import { buildLiveMatchState, type LiveMatchInput, type LiveSideTactics } from "@/Domain/match/liveMatchSetup";
import { MODE_A_SPEED, type MatchPlayMode } from "@/Domain/match/liveModes";
import { applyLiveTactics } from "@/Domain/tactics/liveTactics";
import { sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { customToFormation } from "@/Domain/formation/zones";
import { formationForSimId } from "@/Domain/matchFormations";
import { H2H } from "@/Domain/h2h/h2hConfig";
import type { H2HCommand, H2HHighlightsView, H2HSide, H2HStatsPayload, WorkerOut } from "@/types/h2hTypes";

/** gameBus events the match screen, its feed / summary and the pitch effects listen to. */
export const H2H_FORWARDED_EVENTS = [
  "goalScored", "goalDisallowed", "card", "foul", "freeKickAwarded", "cornerAwarded", "penaltyAwarded",
  "penaltyResolved", "offsideCalled", "injury", "injuryNeedsSub", "playerSubstituted", "positionsSwapped",
  "varCheck", "varReview", "refereeError", "halfTime", "extraTimeStart", "penaltyKick", "shootoutEnd",
  "matchStart", "matchEnd", "kickOff", "shot", "shotResolved", "header", "teamIntentChanged", "penaltyPending",
  "passAttempted", "passCompleted", "crossStarted", "longBallStarted", "throughBallStarted", "tackle", "gkClaim", "holderMove", "momentumPoints",
] as const satisfies readonly (keyof GameEvents)[];

/** Forwarded events that do not need an immediate full state (the next frame / periodic state covers them). */
const NO_STATE_AFTER = new Set<string>([
  "shot", "shotResolved", "header", "kickOff", "teamIntentChanged",
  "passAttempted", "passCompleted", "crossStarted", "longBallStarted", "throughBallStarted", "tackle", "gkClaim", "holderMove", "momentumPoints",
]);

/** Phases whose countdown is a presentation pause: real seconds whatever the pace (as `PixiPitch`). */
const PRESENTATION_PHASES: ReadonlySet<GameState["matchPhase"]> = new Set(["preMatch", "halfTime", "extraTimeBreak", "penalties"]);
/** Most ball points one frame carries (a 4× mode A frame covers ~52 steps). */
export const PATH_MAX = 64;
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Sim seconds per `advanceSim` call inside one tick (10 s = 50 steps). */
const CHUNK_S = 10;
const SIDES: readonly TeamId[] = ["A", "B"];

export interface H2HMatchOptions {
  mode?: MatchPlayMode;
  level?: HighlightLevel;
  /**
   * Mode B's forecast: "worker" (default) = a nested Bun Worker running `forecastWorker.ts` (its own engine globals);
   * "inline" = the whole forecast synchronously in this thread (tests), the forwarded events muted meanwhile; or a port.
   */
  forecast?: "worker" | "inline" | ForecastPort;
}

export interface H2HMatch {
  readonly state: GameState;
  readonly done: boolean;
  readonly paused: boolean;
  readonly mode: MatchPlayMode;
  /** Advance by `realMs` of real time (× speed, × the mode's pace) and return the messages due. */
  tick(realMs: number): WorkerOut[];
  command(side: H2HSide, cmd: H2HCommand): WorkerOut[];
  setPaused(paused: boolean): WorkerOut[];
  setAuto(side: H2HSide, on: boolean): WorkerOut[];
  /** The referee leans on `team` for the rest of the match (a complaint, 9.6.5). */
  setBias(team: H2HSide, amount: number): WorkerOut[];
  /** Answers the pending 2D penalty (the server resolved both managers' choices). */
  penalty(outcome: PenaltyOutcome): WorkerOut[];
  /** The managers' speed (1, 2 or 4; any factor in the measures). */
  setSpeed(factor: number): void;
  /** Unsubscribes from the gameBus and stops mode B's forecast. */
  dispose(): void;
}

export function createH2HMatch(input: LiveMatchInput, opts: H2HMatchOptions = {}): H2HMatch {
  const mode: MatchPlayMode = opts.mode ?? "full";
  let state = buildLiveMatchState(input);
  initRatings(state.players.map((p) => ({ id: p.id, team: p.team })));
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
  /** Since the last frame: the ball at each step, the steps, the game-seconds of play, a mode B jump. */
  let path: [number, number][] = [];
  let stepsSinceFrame = 0;
  let playSinceFrame = 0;
  let jumped = false;
  /** The inline forecast (tests) runs in this thread: its events are not this match's. */
  let muted = 0;

  const unsubs = H2H_FORWARDED_EVENTS.map((name) =>
    gameBus.on(name, (payload: unknown) => {
      if (muted > 0) return;
      outbox.push({ type: "event", name, payload });
      if (!NO_STATE_AFTER.has(name)) stateDue = true;
    }),
  );

  // ── Mode B: the playback of the lances (the solo page's rule, `HighlightPlayback`) ──
  const inlinePort = (): ForecastPort => {
    const port: ForecastPort = {
      onChunk: null,
      start(gen, snap, fopts) {
        const keep = captureLiveSnapshot(state);
        const chunks: ForecastChunk[] = [];
        muted++;
        try {
          const fc = createForecast(structuredClone(snap), fopts);
          while (!fc.done) chunks.push(fc.run(5000));
          fc.dispose();
        } finally {
          state = restoreLiveSnapshot(keep);
          muted--;
        }
        for (const c of chunks) port.onChunk?.(gen, c);
      },
      stop() {},
    };
    return port;
  };
  const forecastPort = (): ForecastPort => {
    const f = opts.forecast ?? "worker";
    if (f === "inline") return inlinePort();
    if (f === "worker") return workerForecastPort(new URL("../../GameEngine/Support/forecastWorker.ts", import.meta.url).href);
    return f;
  };
  const playback = mode === "highlights"
    ? new HighlightPlayback(forecastPort(), opts.level ?? "extended", {
      humanTeams: SIDES.filter((t) => manualByDefault[t]),
      ui: () => undefined,
    })
    : null;
  const viewOf = (v: PlaybackView): H2HHighlightsView => ({
    level: v.level,
    windows: v.windows.map(({ at: _at, ...w }) => ({ ...w, triggers: [...w.triggers] })),
    forecastClock: Math.round(v.forecastClock),
    waiting: v.waiting,
    done: v.done,
  });
  let lastViewSig = "";
  let lastViewClock = -Infinity;
  playback?.subscribe((v) => {
    const sig = `${v.windows.length}|${v.waiting}|${v.done}|${v.level}`;
    // The reach moves with every chunk: sent with a change of the list, or every 10 s of play reached.
    if (sig === lastViewSig && v.forecastClock - lastViewClock < 10) return;
    lastViewSig = sig;
    lastViewClock = v.forecastClock;
    outbox.push({ type: "highlights", view: viewOf(v) });
  });
  playback?.onJump((j) => {
    outbox.push({
      type: "jump",
      jump: {
        from: j.from, to: j.to, fromMinute: matchMinute(state), toMinute: matchMinute(j.point.snap.state),
        events: j.events.map((e) => ({ ...e })),
      },
    });
  });
  /** Mode B: who asked for the next lance. */
  let skipVotes = new Set<H2HSide>();
  const clearSkipVotes = () => {
    if (skipVotes.size === 0) return;
    skipVotes = new Set();
    outbox.push({ type: "skipVotes", sides: [] });
  };
  /** Mode B: an order changed the state outside a tick: forecast again from now (same order, same match). */
  const reforecast = () => {
    if (!playback || state.matchPhase === "matchEnd") return;
    clearSkipVotes();
    playback.invalidate(state);
  };

  const stats = (): H2HStatsPayload => ({
    snapshot: exportStatsState(),
    ratings: exportRatings(),
    teams: { A: { ...getTeamStats("A") }, B: { ...getTeamStats("B") } },
    goals: getGoalLog().map((g) => ({ ...g })),
  });
  // The through-ball cell cache is engine bookkeeping (large, rebuilt on the next tick).
  const wireState = (): GameState => ({ ...state, throughBallCellsCache: null });
  const frame = (realMs: number): WorkerOut => {
    const ball = getBallPos(state);
    // The ball points but the last (the frame's own ball), at most PATH_MAX evenly picked.
    const all = path.slice(0, -1);
    const pts = all.length > PATH_MAX
      ? Array.from({ length: PATH_MAX }, (_, i) => all[Math.floor((i * all.length) / PATH_MAX)]!)
      : all;
    const out: WorkerOut = {
      type: "frame",
      t: clockMs,
      ball: [ball.x, ball.y],
      players: state.players.map((p) => [p.id, p.x, p.y] as [number, number, number]),
      minute: matchMinute(state),
      phase: state.matchPhase,
      score: { ...state.score },
      steps: stepsSinceFrame,
      ...(pts.length > 0 && !jumped ? { path: pts } : {}),
      rate: realMs > 0 ? Math.round((playSinceFrame / (realMs / 1000)) * 10) / 10 : 0,
      ...(jumped ? { jump: true as const } : {}),
    };
    path = [];
    stepsSinceFrame = 0;
    playSinceFrame = 0;
    jumped = false;
    return out;
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
    outbox.push(frame(sinceFrame));
    outbox.push({ type: "done", state: wireState(), stats: stats() });
  };

  /** A tactics change re-runs a zero-dt tick, as the live pitch does on `tacticsChanged`. */
  const retick = () => {
    if (state.matchPhase === "matchEnd") return;
    state = tickState(state, 0).state;
  };

  /** One sim step, with the ball recorded for the next frame's path. */
  const recordStep = (s: GameState, dt: number) => {
    const r = tickState(s, dt);
    const b = getBallPos(r.state);
    path.push([round1(b.x), round1(b.y)]);
    stepsSinceFrame++;
    if (!PRESENTATION_PHASES.has(s.matchPhase) && s.varReview == null) playSinceFrame += dt * clockScaleOf(s);
    return r;
  };

  /** Advances the match by `seconds` of sim time. */
  const advance = (seconds: number): void => {
    // A 2D penalty holds the match until both managers answered: no step would move (at 13× a tick is ~65 of them).
    if (state.pendingPenalty) { carry = 0; return; }
    let budget = carry + seconds;
    carry = 0;
    // A goal or a phase change stops `advanceSim` early; keep going with what is left of the budget.
    // In slices of CHUNK_S, so a 2D penalty that comes up mid-batch stops it (the held steps would all be no-ops). A goal
    // or a phase change ends a slice early; the loop goes on with what is left.
    while (state.matchPhase !== "matchEnd" && !state.pendingPenalty) {
      if (budget < SIM_STEP - 1e-9) { carry = Math.max(0, budget); break; }
      const r = advanceSim(state, Math.min(budget, CHUNK_S), 0, SIM_STEP, recordStep);
      state = r.state;
      budget -= r.steps * SIM_STEP;
      if (r.steps === 0) { carry = Math.max(0, budget); break; }
    }
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

  playback?.invalidate(state);

  return {
    get state() { return state; },
    get done() { return done; },
    get paused() { return paused; },
    get mode() { return mode; },

    tick(realMs: number): WorkerOut[] {
      if (done) return flush();
      clockMs += realMs;
      if (!paused) {
        // Presentation pauses run in real seconds; the play at the mode's pace.
        const presenting = state.varReview != null || PRESENTATION_PHASES.has(state.matchPhase);
        const pace = presenting ? 1 : speed * (mode === "full" ? MODE_A_SPEED : 1);
        const act = playback ? playback.step(state) : { kind: "play" as const };
        if (act.kind === "jump") {
          state = restoreLiveSnapshot(structuredClone(act.point.snap));
          carry = 0;
          jumped = true;
          clearSkipVotes();
          // What the skipped stretch left open: a 2D penalty to take, an injured player to replace by hand.
          if (state.pendingPenalty) outbox.push({ type: "event", name: "penaltyPending", payload: { ...state.pendingPenalty } });
          const injury = playback?.pendingInjury();
          if (injury) outbox.push({ type: "event", name: "injuryNeedsSub", payload: { ...injury } });
          stateDue = true;
        } else if (act.kind === "play") {
          advance((realMs / 1000) * pace);
        }
      }
      finishIfOver();
      if (done) return flush();
      // A frame every FRAME_MS of real time while the match moves (once a second when it does not).
      sinceFrame += realMs;
      sinceState += realMs;
      if ((sinceFrame >= H2H.FRAME_MS && (stepsSinceFrame > 0 || jumped)) || sinceFrame >= H2H.STATE_MS) {
        outbox.push(frame(sinceFrame));
        sinceFrame = 0;
      }
      if (sinceState >= H2H.STATE_MS) stateDue = true;
      return flush();
    },

    command(side: H2HSide, cmd: H2HCommand): WorkerOut[] {
      if (done) return [];
      if (cmd.kind === "skip") {
        if (!playback) return [];
        skipVotes.add(side);
        // Every manager in charge of his side (not on the assistant) must ask.
        const needed = SIDES.filter((t) => !state.autoSubs?.[t]);
        if (needed.every((t) => skipVotes.has(t))) {
          playback.skip();
          skipVotes = new Set();
        }
        outbox.push({ type: "skipVotes", sides: [...skipVotes] });
        return flush();
      }
      switch (cmd.kind) {
        case "sub":
          queueSub(side, cmd.outId, cmd.inId);
          break;
        case "unsub": {
          const key = side === "A" ? "pendingSubsA" : "pendingSubsB";
          state = { ...state, [key]: state[key].filter((q) => q.outId !== cmd.outId) };
          stateDue = true;
          break;
        }
        case "swap":
          state = swapPlayerPositions(state, side, cmd.aId, cmd.bId);
          break;
        case "move":
          state = moveToEmptySlot(state, side, cmd.id, cmd.slot);
          break;
        case "mentality":
          tactics[side] = { ...tactics[side], mentality: cmd.mentality };
          applyLiveTactics(side, tactics[side], cmd.mentality, tactics[side].familiarity);
          retick();
          break;
        case "tactics":
          tactics[side] = { ...tactics[side], style: cmd.style, axesOverride: cmd.axesOverride, instructions: cmd.instructions, mentalityLevel: cmd.mentalityLevel };
          applyLiveTactics(side, { style: tactics[side].style, axesOverride: tactics[side].axesOverride, instructions: tactics[side].instructions, mentalityLevel: tactics[side].mentalityLevel }, tactics[side].mentality, tactics[side].familiarity);
          retick();
          break;
        case "formation": {
          const formation = cmd.custom
            ? { ...customToFormation(cmd.custom), id: cmd.formation }
            : formationForSimId(cmd.formation);
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
      outbox.push({ type: "order", side, kind: cmd.kind });
      reforecast();
      return flush();
    },

    setPaused(next: boolean): WorkerOut[] {
      if (done || paused === next) return [];
      paused = next;
      stateDue = true;
      return flush();
    },

    setBias(team: H2HSide, amount: number): WorkerOut[] {
      if (!done && !state.refereeBias) {
        state = { ...state, refereeBias: { team, amount } };
        reforecast();
      }
      return flush();
    },

    setAuto(side: H2HSide, on: boolean): WorkerOut[] {
      if (done) return [];
      const changed = !!state.autoSubs?.[side] !== on;
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
      // The assistant makes other substitutions than the manager would: what was forecast is stale.
      if (changed) reforecast();
      return flush();
    },

    penalty(outcome: PenaltyOutcome): WorkerOut[] {
      if (done || !state.pendingPenalty) return [];
      state = applyPenaltyOutcome(state, outcome);
      stateDue = true;
      finishIfOver();
      return flush();
    },

    setSpeed(factor: number) {
      if (Number.isFinite(factor) && factor > 0) speed = factor;
    },

    dispose() {
      for (const off of unsubs) off();
      playback?.dispose();
    },
  };
}
