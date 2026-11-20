/**
 * The highlights forecast (engine rebuild stage 19, mode B, `live-modes.md`): from a mid-match snapshot it simulates the
 * rest of the match as fast as it can and reports, for every highlight window once it is final, the snapshot at the
 * window's start. The live page jumps from lance to lance with those snapshots and plays each one at normal speed.
 *
 * Pure apart from the engine globals it owns (one forecast per thread: the Worker in the browser, a test in Bun).
 * `forecastWorker.ts` is the thin Worker shell; this file holds the logic so the tests can drive it.
 *
 * A window is final once a newer one exists, or once the clock passed its end by the reopen reach (a trigger can reopen a
 * closed window if its pre-roll reaches back to it: `MERGE_GAP_S` + `PRE_MAX_S`).
 *
 * The forecast stops at a frontier: full time (the snapshot one step before the final whistle, so the page plays the
 * whistle itself), a pending 2D penalty (the manager kicks or dives) or an injury the manager must replace by hand
 * (`injuryNeedsSub` of a human side): the page plays live from there and restarts the forecast after the decision.
 */
import { tickState } from '@/GameEngine/Domain/gameState';
import { SIM_STEP } from '@/GameEngine/Domain/advanceSim';
import { gameBus, type GameEvents } from '@/GameEngine/Infrastructure/EventBus';
import { closedHighlights, getHighlightLiveSeconds, getHighlights, openHighlight } from '@/GameEngine/Domain/HighlightTracker';
import { HIGHLIGHT_CONFIG } from '@/GameEngine/Configs/HighlightConfig';
import type { Highlight } from '@/GameEngine/Domain/Highlights';
import { captureLiveSnapshot, restoreLiveSnapshot, type LiveSnapshot } from '@/GameEngine/Support/LiveSnapshot';
import {
  createPossessionHeatmap, exportPossessionHeatmap, importPossessionHeatmap, samplePossessionHeatmap,
  type HeatmapSnapshot,
} from '@/Domain/match/possessionHeatmap';
import { accumulatePossession, createPossessionAcc, type PossessionAcc } from '@/Domain/match/possession';
import type { GameState, TeamId } from '@/GameEngine/types';

/** The page's possession accumulators at a snapshot (they ride along so a jump keeps them whole). */
export interface ForecastUi {
  possession: PossessionAcc;
  heatmap: HeatmapSnapshot;
}

export interface ForecastPoint {
  /** Live seconds of the highlight clock at the snapshot. */
  clock: number;
  snap: LiveSnapshot;
  ui: ForecastUi;
}

/** A final window; `at` null = it was already open when the forecast started (the page is inside it). */
export interface ForecastWindow extends Highlight {
  at: ForecastPoint | null;
}

/** Engine events the page needs from the stretches it skips (its feed, the friends' relays). */
export const FORECAST_EVENTS = ['shotResolved', 'offsideCalled', 'penaltyResolved', 'goalDisallowed', 'varReview', 'card'] as const;
export type ForecastEventName = typeof FORECAST_EVENTS[number];
export interface ForecastEvent {
  name: ForecastEventName;
  payload: GameEvents[ForecastEventName];
  /** Live seconds when the step that emitted it ended. */
  clock: number;
  /** Match minute (`matchMinute`) of the state after that step. */
  minute: number;
}

export type ForecastFrontierReason = 'end' | 'penalty' | 'injury';
export interface ForecastFrontier {
  reason: ForecastFrontierReason;
  at: ForecastPoint;
  /** The window open at the frontier (the page plays it from its start), or null. */
  open: ForecastWindow | null;
  /** `injury`: the engine event the page re-emits after jumping (opens the manager's panel). */
  injury?: GameEvents['injuryNeedsSub'];
}

export interface ForecastChunk {
  windows: ForecastWindow[];
  events: ForecastEvent[];
  frontier: ForecastFrontier | null;
  /** Live seconds the forecast reached. */
  clock: number;
}

export interface ForecastOptions {
  /** Sides whose manager replaces an injured player by hand (the forecast stops there). */
  humanTeams: TeamId[];
  /** Possession accumulators of the page at the start snapshot (absent = empty). */
  ui?: ForecastUi;
}

export interface Forecast {
  readonly done: boolean;
  /** Simulates up to `maxSteps` steps (or until `deadline`, performance-clock ms) and returns what became final. */
  run(maxSteps: number, deadline?: number): ForecastChunk;
  dispose(): void;
}

/** Seconds of live play after a window's end within which it may still reopen. */
export const REOPEN_REACH_S = HIGHLIGHT_CONFIG.MERGE_GAP_S + HIGHLIGHT_CONFIG.PRE_MAX_S + SIM_STEP;
const RING_S = HIGHLIGHT_CONFIG.PRE_MAX_S + HIGHLIGHT_CONFIG.SPELL_LEAD_S + 2;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const MINUTE_OFFSET: Partial<Record<GameState['matchPhase'], number>> = {
  secondHalf: 45, extraTimeBreak: 45, extraTimeFirst: 90, extraTimeSecond: 105, penalties: 105,
};
const minuteOf = (s: GameState) => Math.floor(s.matchTime / 60) + (MINUTE_OFFSET[s.matchPhase] ?? 0);

export function createForecast(start: LiveSnapshot, opts: ForecastOptions): Forecast {
  let state = restoreLiveSnapshot(start);
  const possession: PossessionAcc = opts.ui ? { ...opts.ui.possession } : createPossessionAcc(state);
  const heatmap = opts.ui ? importPossessionHeatmap(opts.ui.heatmap, state) : createPossessionHeatmap();
  const startOpen = openHighlight()?.id ?? null;
  const knownClosed = new Set(closedHighlights().map(h => h.id));
  const ring: ForecastPoint[] = [];
  const startOf = new Map<number, ForecastPoint | null>();
  const posted = new Set<number>(knownClosed);
  let events: ForecastEvent[] = [];
  let injury: GameEvents['injuryNeedsSub'] | null = null;
  let done = false;

  const offs = FORECAST_EVENTS.map(name => gameBus.on(name, ((payload: GameEvents[ForecastEventName]) => {
    events.push({ name, payload, clock: -1, minute: -1 });
  }) as never));
  const offInjury = gameBus.on('injuryNeedsSub', e => { if (opts.humanTeams.includes(e.team)) injury = e; });

  const point = (s: GameState): ForecastPoint => ({
    clock: getHighlightLiveSeconds(),
    snap: captureLiveSnapshot(s),
    ui: { possession: { ...possession }, heatmap: exportPossessionHeatmap(heatmap) },
  });
  /** Where a window that first showed up now starts: the ring frame at its start, or null (open at the start). */
  const noteStart = (h: Highlight) => {
    if (startOf.has(h.id)) return;
    if (h.id === startOpen) { startOf.set(h.id, null); return; }
    startOf.set(h.id, ring.find(f => f.clock >= h.start - 1e-6) ?? ring[0] ?? null);
  };
  const windowOf = (h: Highlight): ForecastWindow => ({ ...h, triggers: [...h.triggers], at: startOf.get(h.id) ?? null });

  /** Windows final now (in order), not posted yet. */
  const finals = (clock: number): ForecastWindow[] => {
    const out: ForecastWindow[] = [];
    const closed = closedHighlights();
    const open = openHighlight();
    for (let i = 0; i < closed.length; i++) {
      const h = closed[i]!;
      if (posted.has(h.id)) continue;
      noteStart(h);
      const newer = i < closed.length - 1 || (open !== null && open.id !== h.id);
      if (!newer && clock < h.end + REOPEN_REACH_S) break;
      posted.add(h.id);
      out.push(windowOf(h));
    }
    return out;
  };
  const openWindow = (): ForecastWindow | null => {
    if (!openHighlight()) return null;
    const h = getHighlights().at(-1)!;
    noteStart(h);
    return windowOf(h);
  };

  return {
    get done() { return done; },
    run(maxSteps, deadline) {
      const windows: ForecastWindow[] = [];
      let frontier: ForecastFrontier | null = null;
      for (let i = 0; i < maxSteps && !done; i++) {
        if (state.pendingPenalty) {
          frontier = { reason: 'penalty', at: point(state), open: openWindow() };
          done = true;
          break;
        }
        const before = point(state);
        ring.push(before);
        while (ring.length > 1 && ring[0]!.clock < before.clock - RING_S) ring.shift();
        const mark = events.length;
        state = tickState(state, SIM_STEP).state;
        accumulatePossession(possession, state);
        samplePossessionHeatmap(heatmap, state);
        const clock = getHighlightLiveSeconds();
        const minute = minuteOf(state);
        for (let k = mark; k < events.length; k++) { events[k]!.clock = clock; events[k]!.minute = minute; }
        const o = openHighlight();
        if (o) noteStart({ id: o.id, start: o.start } as Highlight);
        windows.push(...finals(clock));
        if (state.matchPhase === 'matchEnd') {
          // The page plays the final step itself (the whistle, the recording).
          frontier = { reason: 'end', at: before, open: null };
          events = events.slice(0, mark);
          done = true;
          break;
        }
        if (injury) {
          frontier = { reason: 'injury', at: point(state), open: openWindow(), injury };
          done = true;
          break;
        }
        if (deadline !== undefined && (i & 15) === 15 && now() >= deadline) break;
      }
      if (done) {
        // Everything closed before the frontier is final.
        for (const h of closedHighlights()) if (!posted.has(h.id)) { noteStart(h); posted.add(h.id); windows.push(windowOf(h)); }
      }
      const out: ForecastChunk = { windows, events, frontier, clock: getHighlightLiveSeconds() };
      events = [];
      return out;
    },
    dispose() {
      offs.forEach(off => off());
      offInjury();
    },
  };
}
