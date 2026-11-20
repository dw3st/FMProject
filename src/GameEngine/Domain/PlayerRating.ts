/**
 * PlayerRating — live match rating tracker.
 *
 * Subscribes to the event bus and keeps two ratings per player:
 *   - the legacy one (BASELINE 6.0 and a delta per event, `RATING_WEIGHTS`), clamped at each step;
 *   - stage 17 (`player-scores.md` → "Stage 17"): FM's hooks counted in a per-player tally and turned into the rating
 *     by `ratingFromTally` (`FM_RATING`).
 * `DECISION_FLAGS.FM_RATINGS` picks which one the getters return.
 *
 * Call initRatings(players) at match start to reset and register players (ids, or { id, team } so the "mistake that
 * led to a goal" hook knows the sides). Read ratings via getPlayerRating(id) or getAllRatings().
 */

import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { FM_RATING, RATING_WEIGHTS } from '@/GameEngine/Configs/PlayerRatingConfig';
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import { emptyTally, ratingFromTally, type RatingTally } from '@/GameEngine/Domain/RatingModel';
import { clamp } from '@/Domain/math';
import type { TeamId } from '@/GameEngine/types';
import { debugLog, isDebugEnabled } from '@/GameEngine/Support/DebugLog';

const legacy = new Map<number, number>();
const tallies = new Map<number, RatingTally>();
/** Residual added to the tally rating after a plain-number import (a remote client resynced to the server). */
const residual = new Map<number, number>();
const teamOf = new Map<number, TeamId>();

// ── Stage 17 trackers ────────────────────────────────────────────────────────
/** Last shot xG per player (goal quality). */
const lastShot = new Map<number, number>();
/** The ball one side lost (its player) and the opponent's completed passes since: the "mistake" behind a goal. */
const mistake: Record<TeamId, { playerId: number; passes: number } | null> = { A: null, B: null };
/** What each goal added, so a goal ruled out (VAR) can be undone. */
interface GoalRecord { scorerId: number; assistId?: number; good: boolean; great: boolean; decisive: boolean; np: boolean; mistakeId?: number }
const goals: GoalRecord[] = [];
/** Player of the last `interceptionTouch` (its `interception` echo is not counted twice). */
let lastTouch: number | null = null;

const useFm = (): boolean => DECISION_FLAGS.FM_RATINGS;

function tallyOf(id: number): RatingTally {
  let t = tallies.get(id);
  if (!t) { t = emptyTally(); tallies.set(id, t); }
  return t;
}

function current(id: number): number {
  if (!useFm()) return legacy.get(id) ?? RATING_WEIGHTS.BASELINE;
  const t = tallies.get(id);
  const base = t ? ratingFromTally(t) : FM_RATING.BASELINE;
  return clamp(base + (residual.get(id) ?? 0), 0, 10);
}

function snapshot(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of new Set([...legacy.keys(), ...tallies.keys()])) out[id] = current(id);
  return out;
}

function notify(): void { gameBus.emit('ratingsUpdated', snapshot()); }

function adjust(playerId: number, delta: number): void {
  const cur = legacy.get(playerId) ?? RATING_WEIGHTS.BASELINE;
  legacy.set(playerId, clamp(cur + delta, 0, 10));
}

/** Bumps one FM hook of one player. */
function hook(playerId: number | undefined | null, key: keyof RatingTally, by = 1): void {
  if (playerId === undefined || playerId === null) return;
  tallyOf(playerId)[key] += by;
}

const other = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');

/** The ball was lost by `playerId`: a mistake if the opponent scores before his side wins it back. */
function lostBall(playerId: number): void {
  const t = teamOf.get(playerId);
  if (t) mistake[t] = { playerId, passes: 0 };
}
/** `playerId`'s side has the ball again: its pending mistake is gone. */
function regained(playerId: number | null | undefined): void {
  if (playerId === undefined || playerId === null) return;
  const t = teamOf.get(playerId);
  if (t) mistake[t] = null;
}

// ── Bus subscriptions ─────────────────────────────────────────────────────────

gameBus.on('playerSubstituted', e => {
  if (!legacy.has(e.inId)) legacy.set(e.inId, RATING_WEIGHTS.BASELINE);
  tallyOf(e.inId);
  teamOf.set(e.inId, e.team);
});

gameBus.on('kickOff', () => { mistake.A = null; mistake.B = null; });
// Sides learnt from the engine step when the caller registered ids only (`/test`).
gameBus.on('simStep', e => { if (teamOf.size < e.state.players.length) for (const p of e.state.players) teamOf.set(p.id, p.team); });

gameBus.on('goalScored', e => {
  adjust(e.scorerId, RATING_WEIGHTS.GOAL);
  if (e.assistId != null) adjust(e.assistId, RATING_WEIGHTS.ASSIST);
  const penalty = e.setPiece === 'penalty';
  const xg = lastShot.get(e.scorerId) ?? 1;
  const great = !penalty && xg < FM_RATING.GREAT_GOAL_XG;
  const good = !penalty && !great && xg < FM_RATING.GOOD_GOAL_XG;
  const diff = e.score[e.team] - e.score[other(e.team)];
  const decisive = e.minute >= FM_RATING.DECISIVE_MINUTE && (diff === 0 || diff === 1);
  const m = mistake[other(e.team)];
  goals.push({ scorerId: e.scorerId, assistId: e.assistId, good, great, decisive, np: !penalty, mistakeId: m?.playerId });
  hook(e.scorerId, 'goals');
  if (good) hook(e.scorerId, 'goodGoals');
  if (great) hook(e.scorerId, 'greatGoals');
  if (decisive) hook(e.scorerId, 'decisiveGoals');
  if (!penalty) hook(e.scorerId, 'npGoals');
  hook(e.assistId, 'assists');
  if (m) hook(m.playerId, 'mistakesToGoal');
  mistake.A = null; mistake.B = null;
  if (isDebugEnabled()) {
    const tags = [great ? 'great goal' : good ? 'good goal' : '', decisive ? 'decisive' : '', m ? `mistake by #${m.playerId}` : ''].filter(Boolean);
    debugLog('rating', `Goal by #${e.scorerId} (shot xG ${xg.toFixed(2)})${tags.length ? ': ' + tags.join(', ') : ''}`, { playerId: e.scorerId, data: { xg, good, great, decisive, mistakeId: m?.playerId } });
  }
  notify();
});
gameBus.on('shot', e => {
  adjust(e.player, RATING_WEIGHTS.SHOT);
  lastShot.set(e.player, e.xg);
  hook(e.player, 'shots');
  if (!e.penalty) hook(e.player, 'npxg', e.xg);
  if (e.passerId !== undefined) {
    hook(e.passerId, 'keyPasses');
    if (!e.setPiece) hook(e.passerId, 'xa', e.xg);
    if (isDebugEnabled()) debugLog('rating', `Chance created by #${e.passerId} for #${e.player} (xG ${e.xg.toFixed(2)}${e.setPiece ? ', set piece: no xA' : ''})`, { playerId: e.passerId });
  }
  notify();
});
gameBus.on('shotResolved', e => { if (e.inPosts) { hook(e.player, 'shotsOnTarget'); notify(); } });
gameBus.on('shotBlocked', e => { hook(e.blockerId, 'blocks'); notify(); });
gameBus.on('passCompleted', e => {
  adjust(e.player, RATING_WEIGHTS.PASS_COMPLETED);
  hook(e.player, 'passesCompleted');
  regained(e.player);
  const t = teamOf.get(e.player);
  if (t) {
    const m = mistake[other(t)];
    if (m && ++m.passes >= FM_RATING.MISTAKE_PASS_WINDOW) mistake[other(t)] = null;
  }
  notify();
});
gameBus.on('passFailed', e => {
  adjust(e.player, RATING_WEIGHTS.PASS_FAILED);
  hook(e.player, 'passesIncomplete');
  lostBall(e.player);
  notify();
});
gameBus.on('throughBallCompleted', e => { hook(e.player, 'passesCompleted'); regained(e.winnerId); notify(); });
const throughLost = (player: number) => { hook(player, 'passesIncomplete'); lostBall(player); notify(); };
gameBus.on('throughBallLostInFlight', e => throughLost(e.player));
gameBus.on('throughBallLostInRace', e => throughLost(e.player));
gameBus.on('throughBallLostInDuel', e => throughLost(e.player));
gameBus.on('tackle', e => {
  adjust(e.player, e.success ? RATING_WEIGHTS.TACKLE_WON : RATING_WEIGHTS.TACKLE_FAILED);
  hook(e.player, e.success ? 'tacklesWon' : 'tacklesLost');
  if (e.success) { lostBall(e.targetId); regained(e.player); }
  notify();
});
gameBus.on('dribble', e => {
  hook(e.player, e.success ? 'dribblesWon' : 'dribblesLost');
  if (!e.success) lostBall(e.player);
  notify();
});
gameBus.on('interceptionTouch', e => {
  lastTouch = e.player;
  if (e.outcome === 'control' || e.outcome === 'deflect') hook(e.player, 'interceptions');
  else if (e.outcome === 'clear') hook(e.player, 'clearances');
  if (e.outcome === 'control') regained(e.player);
  notify();
});
gameBus.on('interception', e => {
  if (e.success) adjust(e.player, RATING_WEIGHTS.INTERCEPTION);
  if (lastTouch === e.player) lastTouch = null;
  else if (e.success) { hook(e.player, 'interceptions'); regained(e.player); }
  notify();
});
gameBus.on('looseBallWon', e => { hook(e.winnerId, 'possessionWon'); regained(e.winnerId); notify(); });
gameBus.on('aerialResolved', e => {
  if (e.kind === 'cross' && e.completed) hook(e.fromId, 'crossesCompleted');
  if (e.outcome === 'clearance' && e.winnerId !== null && teamOf.get(e.winnerId) !== teamOf.get(e.fromId)) hook(e.winnerId, 'clearances');
  if (e.outcome === 'blocked' && e.winnerId !== null) hook(e.winnerId, 'blocks');
  notify();
});
gameBus.on('aerialDuel', e => {
  adjust(e.winnerId, RATING_WEIGHTS.AERIAL_DUEL_WON);
  hook(e.winnerId, 'aerialWon');
  hook(e.loserId, 'aerialLost');
  regained(e.winnerId);
  notify();
});
gameBus.on('keeperSave', e => {
  hook(e.keeperId, 'saves');
  if (e.grade === 'good') hook(e.keeperId, 'goodSaves');
  else if (e.grade === 'difficult') hook(e.keeperId, 'greatSaves');
  if (e.grade && e.grade !== 'routine' && isDebugEnabled()) debugLog('rating', `${e.grade === 'difficult' ? 'Great' : 'Good'} save by #${e.keeperId}`, { playerId: e.keeperId });
  if (e.kind === 'hold') regained(e.keeperId);
  notify();
});
gameBus.on('gkClaim', e => { if (e.claimed) regained(e.keeperId); });
gameBus.on('foul', e => { hook(e.offenderId, 'fouls'); notify(); });
gameBus.on('card', e => {
  adjust(e.playerId, e.card === 'yellow' ? RATING_WEIGHTS.YELLOW_CARD : RATING_WEIGHTS.RED_CARD);
  hook(e.playerId, e.card === 'yellow' ? 'yellow' : 'red');
  notify();
});
gameBus.on('penaltyAwarded', e => {
  adjust(e.offenderId, RATING_WEIGHTS.PENALTY_CONCEDED);
  hook(e.offenderId, 'penaltiesConceded');
  notify();
});
// VAR (`.claude/rules/game/var.md`): a goal ruled out / a penalty ruled out no longer counts.
gameBus.on('goalDisallowed', e => {
  adjust(e.scorerId, -RATING_WEIGHTS.GOAL);
  if (e.assistId != null) adjust(e.assistId, -RATING_WEIGHTS.ASSIST);
  for (let i = goals.length - 1; i >= 0; i--) {
    const g = goals[i]!;
    if (g.scorerId !== e.scorerId) continue;
    goals.splice(i, 1);
    hook(g.scorerId, 'goals', -1);
    if (g.good) hook(g.scorerId, 'goodGoals', -1);
    if (g.great) hook(g.scorerId, 'greatGoals', -1);
    if (g.decisive) hook(g.scorerId, 'decisiveGoals', -1);
    if (g.np) hook(g.scorerId, 'npGoals', -1);
    hook(g.assistId, 'assists', -1);
    hook(g.mistakeId, 'mistakesToGoal', -1);
    break;
  }
  notify();
});
gameBus.on('varReview', e => {
  if (e.kind === 'penalty' && e.outcome === 'overturned' && e.offenderId !== undefined) {
    adjust(e.offenderId, -RATING_WEIGHTS.PENALTY_CONCEDED);
    hook(e.offenderId, 'penaltiesConceded', -1);
    notify();
  }
});

// ── Public API ────────────────────────────────────────────────────────────────

/** Reset all ratings and register the players for the current match (with their side, for the mistake hook). */
export function initRatings(players: ReadonlyArray<number | { id: number; team: TeamId }>): void {
  legacy.clear(); tallies.clear(); residual.clear(); teamOf.clear(); lastShot.clear();
  goals.length = 0; mistake.A = null; mistake.B = null; lastTouch = null;
  for (const p of players) {
    const id = typeof p === 'number' ? p : p.id;
    legacy.set(id, RATING_WEIGHTS.BASELINE);
    tallies.set(id, emptyTally());
    if (typeof p !== 'number') teamOf.set(id, p.team);
  }
}

/** Current rating for a single player (falls back to BASELINE if not registered). */
export function getPlayerRating(id: number): number {
  return current(id);
}

/** Snapshot of all current ratings. */
export function getAllRatings(): Record<number, number> {
  return snapshot();
}

/** The legacy event-weight ratings, whichever model is active (stage 17 measurements, /lab). */
export function getAllLegacyRatings(): Record<number, number> {
  return Object.fromEntries(legacy);
}

/** Stage 17 hook tally of one player (the /test breakdown), or null. */
export function getRatingTally(id: number): RatingTally | null {
  return tallies.get(id) ?? null;
}

/** Every player's hook tally (measurements). */
export function getAllRatingTallies(): Record<number, RatingTally> {
  return Object.fromEntries([...tallies].map(([id, t]) => [id, { ...t }]));
}

/** Plain-JSON copy of every rating (resume a live match after a page reload, #64; the wire to the browsers). */
export function exportRatings(): Array<[number, number]> {
  return Object.entries(snapshot()).map(([id, r]) => [Number(id), r]);
}

/**
 * Replaces every rating with a snapshot from `exportRatings` (instead of `initRatings`). The tallies are kept (a
 * client that re-emits the server's events keeps counting) and a residual makes the shown number the imported one.
 */
export function importRatings(entries: Array<[number, number]>): void {
  legacy.clear();
  residual.clear();
  for (const [id, r] of entries) {
    const v = clamp(r, 0, 10);
    legacy.set(id, v);
    const t = tallies.get(id);
    residual.set(id, v - (t ? ratingFromTally(t) : FM_RATING.BASELINE));
  }
  notify();
}

/** Everything the tracker holds (in-process rewind: `HighlightSkip`), tallies included. */
export interface RatingState {
  legacy: Array<[number, number]>;
  tallies: Array<[number, RatingTally]>;
  residual: Array<[number, number]>;
  teams: Array<[number, TeamId]>;
  /** Cross-event trackers (a snapshot taken mid-match goes on scoring the same); absent in older snapshots. */
  carry?: { lastShot: Array<[number, number]>; mistake: Record<TeamId, { playerId: number; passes: number } | null>; goals: GoalRecord[]; lastTouch: number | null };
}

export function exportRatingState(): RatingState {
  return {
    legacy: [...legacy],
    tallies: [...tallies].map(([id, t]) => [id, { ...t }]),
    residual: [...residual],
    teams: [...teamOf],
    carry: { lastShot: [...lastShot], mistake: structuredClone(mistake), goals: structuredClone(goals), lastTouch },
  };
}

export function importRatingState(st: RatingState): void {
  legacy.clear(); tallies.clear(); residual.clear(); teamOf.clear();
  for (const [id, r] of st.legacy) legacy.set(id, r);
  for (const [id, t] of st.tallies) tallies.set(id, { ...t });
  for (const [id, r] of st.residual) residual.set(id, r);
  for (const [id, t] of st.teams) teamOf.set(id, t);
  lastShot.clear(); goals.length = 0;
  mistake.A = st.carry?.mistake.A ?? null; mistake.B = st.carry?.mistake.B ?? null; lastTouch = st.carry?.lastTouch ?? null;
  for (const [id, x] of st.carry?.lastShot ?? []) lastShot.set(id, x);
  goals.push(...structuredClone(st.carry?.goals ?? []));
  notify();
}
