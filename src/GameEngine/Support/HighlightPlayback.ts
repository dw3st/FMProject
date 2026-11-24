/**
 * Playback of the highlights mode (engine rebuild stage 19, mode B, `live-modes.md`): the page plays the lances of the
 * chosen level at normal speed and jumps over the rest with the snapshots the forecast (`ForecastCore`, in a Worker)
 * sends. Any order of the manager (a substitution, the mentality, the tactics, the formation, an instruction, a
 * man-marking) changes the state outside a tick: the pitch calls `invalidate`, the playback freezes, drops what was
 * forecast after now and forecasts again from the new state (the generator is in the state, so the same order at the
 * same minute gives the same match).
 *
 * The rule (`decidePlayback`) is pure; `HighlightPlayback` owns the forecast (a Worker in the page, `ForecastCore` run
 * inline in the tests) and the lists. `PixiPitch` calls `step` at every pump that has time to spend and applies the
 * jumps (`restoreLiveSnapshot`); the match screen listens (`subscribe`) for the timeline and the skipped stretches.
 */
import type { GameState, TeamId } from '@/GameEngine/types';
import { highlightsAtLevel, type HighlightLevel } from '@/GameEngine/Domain/Highlights';
import { getHighlightLiveSeconds } from '@/GameEngine/Domain/HighlightTracker';
import { captureLiveSnapshot } from '@/GameEngine/Support/LiveSnapshot';
import type {
  ForecastChunk, ForecastEvent, ForecastFrontier, ForecastOptions, ForecastPoint, ForecastUi, ForecastWindow,
} from '@/GameEngine/Support/ForecastCore';

/** Phases the page plays as they come (the kick-off show, the shootout). */
const PLAY_PHASES: ReadonlySet<GameState['matchPhase']> = new Set(['preMatch', 'penalties', 'matchEnd']);
const EPS = 1e-6;

export type PlaybackAction =
  | { kind: 'play'; reached?: true }
  | { kind: 'freeze' }
  | { kind: 'jump'; point: ForecastPoint; live: boolean };

export interface PlaybackInput {
  clock: number;
  phase: GameState['matchPhase'];
  /** Final windows of the level shown, in order. */
  windows: readonly ForecastWindow[];
  frontier: ForecastFrontier | null;
  /** The window the manager asked to skip ("next lance"). */
  skipId: number | null;
  /** Past the frontier: the page plays live. */
  live: boolean;
}

/** What the page does now: play the lance it is in, jump to the next one (or the frontier), or wait for the forecast. */
export function decidePlayback(x: PlaybackInput): PlaybackAction {
  if (x.live || PLAY_PHASES.has(x.phase)) return { kind: 'play' };
  const current = x.windows.find(w => w.start <= x.clock + EPS && x.clock < w.end - EPS);
  if (current && current.id !== x.skipId) return { kind: 'play' };
  const next = x.windows.find(w => w.at !== null && w.start > x.clock + EPS && w.id !== x.skipId);
  if (next && next.at) {
    // The frontier comes first only when no lance is left before it.
    if (!x.frontier || next.start <= x.frontier.at.clock) return { kind: 'jump', point: next.at, live: false };
  }
  const f = x.frontier;
  if (f) {
    const open = f.open?.at && f.open.at.clock > x.clock + EPS ? f.open.at : null;
    if (open) return { kind: 'jump', point: open, live: true };
    if (f.open && !f.open.at) return { kind: 'play' }; // inside the lance that reaches the frontier
    if (f.at.clock > x.clock + EPS) return { kind: 'jump', point: f.at, live: true };
    // The page got there by itself (it played the lance with the injury or the penalty): go live, no jump back.
    return { kind: 'play', reached: true };
  }
  return { kind: 'freeze' };
}

/** The forecast behind the playback: a Worker in the page, `ForecastCore` inline in the tests. */
export interface ForecastPort {
  start(gen: number, snap: ForecastPoint['snap'], opts: ForecastOptions): void;
  stop(): void;
  onChunk: ((gen: number, chunk: ForecastChunk) => void) | null;
}

export interface PlaybackJump {
  from: number;
  to: number;
  point: ForecastPoint;
  /** Engine events of the stretch skipped (the feed, the friends' relays). */
  events: ForecastEvent[];
}

export interface PlaybackView {
  level: HighlightLevel;
  /** Windows of the level shown (final ones), for the timeline. */
  windows: readonly ForecastWindow[];
  /** Live seconds the forecast reached. */
  forecastClock: number;
  waiting: boolean;
  done: boolean;
  /** Real ms from the last restart to its first answer (the time to the first lance). */
  lastLatencyMs: number | null;
}

export interface PlaybackOptions {
  humanTeams: TeamId[];
  /** The page's possession accumulators now (they go with the snapshot to the forecast). */
  ui: () => ForecastUi | undefined;
  now?: () => number;
}

export class HighlightPlayback {
  private gen = 0;
  private all: ForecastWindow[] = [];
  private events: ForecastEvent[] = [];
  private frontier: ForecastFrontier | null = null;
  private forecastClock = 0;
  private live: false | 'end' | 'penalty' | 'injury' = false;
  private skipId: number | null = null;
  private waiting = false;
  private startedAt = 0;
  private latency: number | null = null;
  private measuring = false;
  private done = false;
  private listeners = new Set<(v: PlaybackView) => void>();
  private jumpListeners = new Set<(j: PlaybackJump) => void>();
  private shown: ForecastWindow[] = [];

  constructor(private port: ForecastPort, public level: HighlightLevel, private opts: PlaybackOptions) {
    port.onChunk = (gen, chunk) => this.onChunk(gen, chunk);
  }

  private now(): number { return (this.opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now())))(); }

  /** Forecasts again from `state` (taken with the engine globals as they are now). */
  invalidate(state: GameState): void {
    if (state.matchPhase === 'matchEnd') { this.port.stop(); return; }
    this.gen++;
    this.all = [];
    this.shown = [];
    this.events = [];
    this.frontier = null;
    this.live = false;
    this.skipId = null;
    this.waiting = true;
    this.done = false;
    this.forecastClock = getHighlightLiveSeconds();
    this.startedAt = this.now();
    this.measuring = true;
    this.port.start(this.gen, captureLiveSnapshot(state), { humanTeams: this.opts.humanTeams, ui: this.opts.ui() });
    this.emit();
  }

  setLevel(level: HighlightLevel): void {
    this.level = level;
    this.shown = highlightsAtLevel(this.all, level) as ForecastWindow[];
    this.emit();
  }

  /** "Next lance": the lance playing now ends here. */
  skip(): void {
    const clock = getHighlightLiveSeconds();
    const cur = this.shown.find(w => w.start <= clock + EPS && clock < w.end - EPS);
    this.skipId = cur?.id ?? null;
  }

  /** Called by the pitch at every pump that has time to spend (never while paused). */
  step(state: GameState): PlaybackAction {
    // Past a frontier the manager had to decide (a penalty kicked, an injured player replaced or left out): forecast on.
    if ((this.live === 'penalty' && !state.pendingPenalty && state.matchPhase !== 'penalties')
      || this.live === 'injury') {
      this.invalidate(state);
      return { kind: 'freeze' };
    }
    const clock = getHighlightLiveSeconds();
    const act = decidePlayback({
      clock, phase: state.matchPhase, windows: this.shown, frontier: this.frontier, skipId: this.skipId, live: this.live !== false,
    });
    if (act.kind === 'play' && act.reached && this.frontier) this.live = this.frontier.reason;
    if (act.kind === 'jump') {
      const from = clock;
      const to = act.point.clock;
      const events = this.events.filter(e => e.clock > from + EPS && e.clock <= to + EPS);
      if (act.live && this.frontier) this.live = this.frontier.reason;
      this.skipId = null;
      for (const l of this.jumpListeners) l({ from, to, point: act.point, events });
    }
    if (act.kind === 'freeze' !== this.waiting) { this.waiting = act.kind === 'freeze'; this.emit(); }
    return act;
  }

  /** The injury the manager must answer after a jump to an `injury` frontier (the pitch re-emits it). */
  pendingInjury(): ForecastFrontier['injury'] | null {
    return this.live === 'injury' ? this.frontier?.injury ?? null : null;
  }

  subscribe(fn: (v: PlaybackView) => void): () => void {
    this.listeners.add(fn);
    fn(this.view());
    return () => { this.listeners.delete(fn); };
  }
  onJump(fn: (j: PlaybackJump) => void): () => void {
    this.jumpListeners.add(fn);
    return () => { this.jumpListeners.delete(fn); };
  }

  dispose(): void {
    this.port.stop();
    this.port.onChunk = null;
    this.listeners.clear();
    this.jumpListeners.clear();
  }

  view(): PlaybackView {
    return { level: this.level, windows: this.shown, forecastClock: this.forecastClock, waiting: this.waiting, done: this.done, lastLatencyMs: this.latency };
  }

  private onChunk(gen: number, chunk: ForecastChunk): void {
    if (gen !== this.gen) return;
    if (chunk.windows.length) {
      this.all.push(...chunk.windows);
      this.shown = highlightsAtLevel(this.all, this.level) as ForecastWindow[];
    }
    this.events.push(...chunk.events);
    this.forecastClock = chunk.clock;
    if (chunk.frontier) { this.frontier = chunk.frontier; this.done = true; }
    if (this.measuring && (chunk.windows.length || chunk.frontier)) {
      this.latency = this.now() - this.startedAt;
      this.measuring = false;
    }
    this.emit();
  }

  private emit(): void {
    const v = this.view();
    for (const l of this.listeners) l(v);
  }
}

/** The page's forecast: the Worker bundled by the server. */
export function workerForecastPort(url: string): ForecastPort {
  let worker: Worker | null = null;
  const port: ForecastPort = {
    onChunk: null,
    start(gen, snap, opts) {
      if (!worker) {
        worker = new Worker(url, { type: 'module' });
        worker.onmessage = (e: MessageEvent<{ type: string; gen: number; chunk?: ForecastChunk; message?: string }>) => {
          const m = e.data;
          if (m.type === 'chunk' && m.chunk) port.onChunk?.(m.gen, m.chunk);
          else if (m.type === 'error') console.error('highlights forecast:', m.message);
        };
      }
      worker.postMessage({ type: 'start', gen, snap, opts });
    },
    stop() {
      worker?.terminate();
      worker = null;
    },
  };
  return port;
}
