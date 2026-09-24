/**
 * BroadcastSubscriber — translates game-bus events into natural-language commentary
 * (one line at a time for the ticker). UI layer: listens to the same bus as the engine.
 *
 * Side-effect import to activate:
 *   import '@/GameInterface/BroadcastSubscriber';
 *
 * ── Commentary voice (keep consistent) ─────────────────────────────────────
 * Never state raw engine numbers in the ticker: no yard distances, no xG,
 * no percentages. The audience gets plain football language only — short or
 * long, close or from distance, safe or dangerous, speculative or a real chance.
 * You may use thresholds in code to branch copy; do not print those values.
 * Match scorelines (e.g. 1–0) are fine when narrating goals.
 *
 * Commentary copy lives in i18n locales under `broadcast.*` so it follows the
 * active language. Variant arrays are pulled with `{ returnObjects: true }`.
 */

import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { setBroadcastLine } from '@/GameInterface/Broadcast/BroadcastLog';
import { PITCH_LENGTH } from '@/GameEngine/Domain/pitch';
import type { GamePlayer, GameState } from '@/GameEngine/types';
import i18n from '@/i18n/i18n';

/** Distance from shooter to the goal they attack — for internal wording only, never shown. */
function yardsToGoal(shooter: GamePlayer): number {
  const goalX = shooter.attackDir === 1 ? PITCH_LENGTH : 0;
  return Math.abs(goalX - shooter.x);
}

/** Pass length — internal only (see file header: no numbers on air). */
function isLongPass(distanceYds: number): boolean {
  return distanceYds >= 28;
}

/** How threatening the chance sounds — driven by xG internally, never quoted. */
function chanceTone(xg: number): 'golden' | 'dangerous' | 'halfChance' | 'speculative' {
  if (xg >= 0.28) return 'golden';
  if (xg >= 0.14) return 'dangerous';
  if (xg >= 0.07) return 'halfChance';
  return 'speculative';
}

/** Where the shot comes from — words only. */
function rangeTone(shooter: GamePlayer): 'closeIn' | 'edge' | 'distance' {
  const d = yardsToGoal(shooter);
  if (d <= 20) return 'closeIn';
  if (d <= 45) return 'edge';
  return 'distance';
}

/** Random line from a list — keeps commentary from feeling repetitive. */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Pull a translated array of variants and pick one with interpolation. */
function pickT(key: string, vars?: Record<string, string | number>): string {
  const arr = i18n.t(key, { returnObjects: true, ...(vars ?? {}) });
  if (Array.isArray(arr) && arr.length > 0) {
    return pick(arr);
  }
  return typeof arr === 'string' ? arr : key;
}

let lastState: GameState | null = null;

function pl(id: number) {
  return lastState?.players.find(p => p.id === id);
}

function teamLabel(team: 'A' | 'B'): string {
  return i18n.t('broadcast.teamLabel', { team, defaultValue: `Team ${team}` });
}

/** Clears when any new line is shown; pass-complete schedules a follow-up if nothing else fires. */
let possessionStaleTimer: ReturnType<typeof setTimeout> | null = null;
const POSSESSION_STALE_MS = 2_500;

const AFTER_GOAL_KICKOFF_BROADCAST_DELAY_MS = 2_800;
let kickoffAfterGoalTimer: ReturnType<typeof setTimeout> | null = null;

function clearKickoffAfterGoalTimer(): void {
  if (kickoffAfterGoalTimer !== null) {
    clearTimeout(kickoffAfterGoalTimer);
    kickoffAfterGoalTimer = null;
  }
}

function broadcastLine(line: string): void {
  clearKickoffAfterGoalTimer();
  if (possessionStaleTimer !== null) {
    clearTimeout(possessionStaleTimer);
    possessionStaleTimer = null;
  }
  setBroadcastLine(line);
}

function schedulePossessionStale(name: string): void {
  if (possessionStaleTimer !== null) {
    clearTimeout(possessionStaleTimer);
    possessionStaleTimer = null;
  }
  possessionStaleTimer = setTimeout(() => {
    possessionStaleTimer = null;
    broadcastLine(pickT('broadcast.possessionStale', { name }));
  }, POSSESSION_STALE_MS);
}

gameBus.on('stateChanged', s => { lastState = s; });

gameBus.on('kickOff', e => {
  const team = teamLabel(e.team);
  if (e.phase === 'firstHalf') {
    broadcastLine(pickT('broadcast.kickoff.firstHalf', { team }));
  } else if (e.phase === 'secondHalf') {
    broadcastLine(pickT('broadcast.kickoff.secondHalf', { team }));
  } else {
    clearKickoffAfterGoalTimer();
    kickoffAfterGoalTimer = setTimeout(() => {
      kickoffAfterGoalTimer = null;
      broadcastLine(pickT('broadcast.kickoff.afterGoal', { team }));
    }, AFTER_GOAL_KICKOFF_BROADCAST_DELAY_MS);
  }
});

gameBus.on('passAttempted', e => {
  const passer = pl(e.player);
  const receiver = pl(e.toId);
  const a = passer?.name ?? String(e.player);
  const b = receiver?.name ?? String(e.toId);
  if (isLongPass(e.distance)) {
    broadcastLine(pickT('broadcast.passAttempted.long', { passer: a, receiver: b }));
  } else {
    broadcastLine(pickT('broadcast.passAttempted.short', { passer: a, receiver: b }));
  }
});

gameBus.on('throughBallStarted', e => {
  const passer = pl(e.player)?.name ?? String(e.player);
  const runner = e.intendedRunnerId != null ? pl(e.intendedRunnerId)?.name : undefined;
  broadcastLine(runner
    ? pickT('broadcast.throughBall.toRunner', { passer, runner })
    : pickT('broadcast.throughBall.intoSpace', { passer }));
});

gameBus.on('passCompleted', e => {
  const receiver = pl(e.toId);
  const name = receiver?.name ?? String(e.toId);
  broadcastLine(pickT('broadcast.passCompleted', { name }));
  schedulePossessionStale(name);
});

gameBus.on('passFailed', e => {
  const passer = pl(e.player);
  const name = passer?.name ?? String(e.player);
  broadcastLine(pickT('broadcast.passFailed', { name }));
});

gameBus.on('shot', e => {
  const shooter = pl(e.player);
  const name = shooter?.name ?? String(e.player);
  const threat = chanceTone(e.xg);
  const where = shooter ? rangeTone(shooter) : 'edge';

  let key: string;
  if (where === 'closeIn') {
    key = (threat === 'golden' || threat === 'dangerous')
      ? 'broadcast.shot.closeIn.dangerous'
      : 'broadcast.shot.closeIn.speculative';
  } else if (where === 'edge') {
    if (threat === 'golden') key = 'broadcast.shot.edge.golden';
    else if (threat === 'speculative') key = 'broadcast.shot.edge.speculative';
    else key = 'broadcast.shot.edge.default';
  } else {
    if (threat === 'golden') key = 'broadcast.shot.distance.golden';
    else if (threat === 'speculative' || threat === 'halfChance') key = 'broadcast.shot.distance.speculative';
    else key = 'broadcast.shot.distance.dangerous';
  }

  broadcastLine(pickT(key, { name }));
});

gameBus.on('shotResolved', e => {
  const shooter = pl(e.player);
  const name = shooter?.name ?? String(e.player);
  if (!e.inPosts) {
    broadcastLine(pickT('broadcast.shotWide', { name }));
    return;
  }
  if (e.isGoal) return; // goalScored handles goal copy.

  broadcastLine(pickT('broadcast.shotSaved', { name }));
});

gameBus.on('goalScored', e => {
  const scorer = pl(e.scorerId);
  const name = scorer?.name ?? String(e.scorerId);
  const team = teamLabel(e.team);
  broadcastLine(pickT('broadcast.goal', {
    name,
    team,
    scoreA: e.score.A,
    scoreB: e.score.B,
  }));
});

gameBus.on('tackle', e => {
  const tackler = pl(e.player);
  const target = pl(e.targetId);
  const t = tackler?.name ?? String(e.player);
  const u = target?.name ?? String(e.targetId);
  const key = e.success ? 'broadcast.tackle.won' : 'broadcast.tackle.lost';
  broadcastLine(pickT(key, { tackler: t, target: u }));
});

gameBus.on('interception', e => {
  const interceptor = pl(e.player);
  const name = interceptor?.name ?? String(e.player);
  const key = e.success ? 'broadcast.interception.won' : 'broadcast.interception.lost';
  broadcastLine(pickT(key, { name }));
});

gameBus.on('dribble', e => {
  const attacker = pl(e.player);
  const defender = pl(e.targetId);
  const a = attacker?.name ?? String(e.player);
  const d = defender?.name ?? String(e.targetId);
  const key = e.success ? 'broadcast.dribble.won' : 'broadcast.dribble.lost';
  broadcastLine(pickT(key, { attacker: a, defender: d }));
});

gameBus.on('offsideCalled', e => {
  const receiver = pl(e.receiverId);
  const name = receiver?.name ?? String(e.receiverId);
  const team = teamLabel(e.team);
  broadcastLine(pickT('broadcast.offside', { name, team }));
});
