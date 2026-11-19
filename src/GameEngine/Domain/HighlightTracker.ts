/**
 * Wiring of the highlight layer (`Highlights.ts`, `.claude/rules/game-engine/highlights.md`): gameBus events → triggers,
 * and every `simStep` (the end of each `tickState`) → one `HighlightSample`. One tracker per process (like
 * `Statistics.ts`, which resets it in `initStats` and exposes its numbers in `getTeamStats`). Runs the same live and in
 * `simulateMatch`.
 */
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { debugLog, isDebugEnabled } from '@/GameEngine/Support/DebugLog';
import { HIGHLIGHT_CONFIG } from '@/GameEngine/Configs/HighlightConfig';
import { isClearChance } from '@/GameEngine/Domain/FmXg';
import {
  createHighlightState, cloneHighlightState, highlightEvent, highlightTick, highlightsOf, summarizeHighlights,
  HIGHLIGHT_LEVELS, type Highlight, type HighlightState, type HighlightTrigger, type HighlightLevel,
} from '@/GameEngine/Domain/Highlights';
import type { GameState, MatchPhase, TeamId } from '@/GameEngine/types';

const LIVE: ReadonlySet<MatchPhase> = new Set<MatchPhase>(['firstHalf', 'secondHalf', 'extraTimeFirst', 'extraTimeSecond']);
const MINUTE_OFFSET: Partial<Record<MatchPhase, number>> = { secondHalf: 45, extraTimeFirst: 90, extraTimeSecond: 105 };

let state: HighlightState = createHighlightState();
const teamOf = new Map<number, TeamId>();
let attackDirA: 1 | -1 = 1;
let lastShot: { team: TeamId; xg: number } | null = null;
let loggedOpen = 0;

/** Resets the tracker for a new match (`initStats`). */
export function resetHighlights(players: ReadonlyArray<{ id: number; team: TeamId }>): void {
  state = createHighlightState();
  teamOf.clear();
  for (const p of players) teamOf.set(p.id, p.team);
  attackDirA = 1;
  lastShot = null;
  loggedOpen = 0;
}

/** Windows so far (the open one closed at the current clock). */
export function getHighlights(): Highlight[] {
  return highlightsOf(state);
}

/** Live sim seconds counted so far. */
export function getHighlightLiveSeconds(): number {
  return state.liveSeconds;
}

/** Plain-data copy (resume, stage 19's replay). */
export function exportHighlightState(): HighlightState {
  return cloneHighlightState(state);
}
export function importHighlightState(s: HighlightState): void {
  state = cloneHighlightState(s);
}

export interface HighlightTeamStats {
  /** Lances about this team shown at each level (cumulative: extended ⊇ main, full ⊇ extended). */
  highlightsMain: number;
  highlightsExtended: number;
  highlightsFull: number;
  /** Sim seconds of those windows. */
  highlightSecondsMain: number;
  highlightSecondsExtended: number;
  highlightSecondsFull: number;
  /** Live sim seconds of the match (the same on both sides; the share = seconds / live seconds). */
  highlightLiveSeconds: number;
}

const KEYS: Record<HighlightLevel, ['highlightsMain' | 'highlightsExtended' | 'highlightsFull', 'highlightSecondsMain' | 'highlightSecondsExtended' | 'highlightSecondsFull']> = {
  main: ['highlightsMain', 'highlightSecondsMain'],
  extended: ['highlightsExtended', 'highlightSecondsExtended'],
  full: ['highlightsFull', 'highlightSecondsFull'],
};

/** This team's share of the windows (a window about nobody counts half for each side). */
export function highlightTeamStats(team: TeamId): HighlightTeamStats {
  const list = highlightsOf(state);
  const out: HighlightTeamStats = {
    highlightsMain: 0, highlightsExtended: 0, highlightsFull: 0,
    highlightSecondsMain: 0, highlightSecondsExtended: 0, highlightSecondsFull: 0,
    highlightLiveSeconds: state.liveSeconds,
  };
  for (const level of HIGHLIGHT_LEVELS) {
    const mine = list.filter(h => h.team === team);
    const none = list.filter(h => h.team === null);
    const sum = summarizeHighlights(mine, 1)[level];
    const half = summarizeHighlights(none, 1)[level];
    const [c, s] = KEYS[level];
    out[c] = sum.count + half.count / 2;
    out[s] = sum.seconds + half.seconds / 2;
  }
  return out;
}

const fire = (t: HighlightTrigger, team: TeamId | null | undefined) => highlightEvent(state, t, team ?? null);
const other = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');
const teamFor = (id: number | null | undefined): TeamId | null => (id === null || id === undefined ? null : teamOf.get(id) ?? null);

gameBus.on('goalScored', e => fire('goal', e.team));
gameBus.on('shot', e => {
  const team = teamFor(e.player);
  if (team) lastShot = { team, xg: e.xg };
  fire(isClearChance(e.xg) ? 'clear_chance' : 'shot', team);
});
gameBus.on('keeperSave', () => {
  if (lastShot && lastShot.xg >= HIGHLIGHT_CONFIG.BIG_SAVE_XG) fire('big_save', lastShot.team);
});
gameBus.on('penaltyAwarded', e => fire('penalty', e.team));
gameBus.on('card', e => fire(e.card === 'red' ? 'red_card' : 'yellow_card', e.team));
gameBus.on('cornerAwarded', e => fire('corner', e.team));
gameBus.on('freeKickAwarded', e => { if (e.dangerous) fire('free_kick', e.team); });
gameBus.on('crossStarted', e => {
  const team = teamFor(e.player);
  if (!team) return;
  const dir = team === 'A' ? attackDirA : -attackDirA;
  const depth = dir === 1 ? 115 - e.toX : e.toX;
  if (depth <= HIGHLIGHT_CONFIG.BOX_DEPTH_YD && Math.abs(e.toY - 37) <= HIGHLIGHT_CONFIG.BOX_HALF_WIDTH_YD) fire('cross', team);
});
gameBus.on('offsideCalled', e => fire('offside', teamFor(e.receiverId) ?? other(e.team)));
gameBus.on('varCheck', () => fire('var', null));
gameBus.on('goalDisallowed', e => fire('goal_disallowed', e.team));
gameBus.on('injury', e => fire('injury', e.team));

gameBus.on('simStep', ({ state: s, dt, ball }) => {
  const a = s.players.find(p => p.team === 'A');
  if (a) attackDirA = a.attackDir;
  for (const p of s.players) if (!teamOf.has(p.id)) teamOf.set(p.id, p.team);
  highlightTick(state, {
    dt,
    live: LIVE.has(s.matchPhase),
    minute: Math.floor(s.matchTime / 60) + (MINUTE_OFFSET[s.matchPhase] ?? 0),
    possession: possessionOf(s),
    ballX: ball.x,
    ballY: ball.y,
    attackDirA,
    deadBall: s.setPiece !== null || !!s.varReview,
  });
  const o = state.open;
  if (o && o.id !== loggedOpen && isDebugEnabled()) {
    loggedOpen = o.id;
    debugLog('highlight', `Lance ${o.minute}': ${o.kind} (${o.level}) from ${o.start.toFixed(1)} s`, { data: { id: o.id, kind: o.kind, level: o.level, team: o.team, start: o.start } });
  }
});

function possessionOf(s: GameState): TeamId | null {
  if (s.shot) return teamFor(s.shot.shooterId);
  if (s.setPiece) return teamFor(s.setPiece.takerId);
  if (s.pass) return teamFor(s.pass.fromId);
  if (s.looseBall) return null;
  return teamFor(s.ballHolderId);
}
