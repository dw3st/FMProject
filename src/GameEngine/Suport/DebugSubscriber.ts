/**
 * DebugSubscriber — the only place that translates game-bus events into debug log entries.
 *
 * Keeps a reference to the latest GameState (via 'stateChanged') so it can resolve
 * player IDs → names for human-readable messages. Since stateChanged fires after
 * tickState returns, lastState is always from the previous tick — player names and
 * teams are tick-stable, so this is fine.
 *
 * Import this module once (side-effect import) to activate all subscriptions:
 *   import '@/GameEngine/DebugSubscriber';
 *
 * gameState.ts must NOT import debugLog — engine emits events, this subscriber logs them.
 */

import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { debugLog } from '@/GameEngine/Suport/DebugLog';
import { PITCH_LENGTH } from '@/GameEngine/Domain/pitch';
import type { GameState } from '@/GameEngine/types';

/** Format a 0..1 probability as a percentage string, e.g. 0.347 → "35%" */
function pct(v: number): string { return `${Math.round(v * 100)}%`; }

let lastState: GameState | null = null;

/** Resolve a player by ID from the last known state. */
function p(id: number) {
  return lastState?.players.find(pl => pl.id === id);
}

// ── State reference ───────────────────────────────────────────────────────────

gameBus.on('stateChanged', s => { lastState = s; });

// ── Match flow ────────────────────────────────────────────────────────────────

gameBus.on('kickOff', e => {
  debugLog('possession',
    `KICKOFF — Team ${e.team} (${e.phase})`,
    { data: { team: e.team, phase: e.phase } },
  );
});

// ── Pass events ───────────────────────────────────────────────────────────────

gameBus.on('passAttempted', e => {
  const passer   = p(e.player);
  const receiver = p(e.toId);
  debugLog('pass',
    `${passer?.name ?? e.player} → ${receiver?.name ?? e.toId}`,
    { playerId: e.player, data: { toId: e.toId } },
  );
});

gameBus.on('passCompleted', e => {
  const receiver = p(e.toId);
  debugLog('possession',
    `${receiver?.name ?? e.toId} (${receiver?.team ?? '?'}) receives pass`,
    { playerId: e.toId },
  );
});

gameBus.on('passFailed', e => {
  const passer = p(e.player);
  debugLog('pass',
    `${passer?.name ?? e.player}'s pass intercepted`,
    { playerId: e.player },
  );
});

// ── Shot events ───────────────────────────────────────────────────────────────

gameBus.on('shot', e => {
  const shooter = p(e.player);
  const dist = shooter
    ? (shooter.team === 'A' ? PITCH_LENGTH - shooter.x : shooter.x).toFixed(1)
    : '?';
  debugLog('shot',
    `${shooter?.name ?? e.player} shoots (dist ${dist} yds, xG ${pct(e.xg)})`,
    { playerId: e.player },
  );
});

gameBus.on('shotResolved', e => {
  const shooter = p(e.player);
  const outcome = !e.inPosts ? 'off target' : e.isGoal ? 'GOAL' : 'saved';
  debugLog('shot',
    `${shooter?.name ?? e.player} → ${outcome} (xG ${pct(e.xg)} × effects = ${pct(e.goalChance)})`,
    { playerId: e.player },
  );
});

gameBus.on('goalScored', e => {
  const scorer = p(e.scorerId);
  debugLog('shot',
    `GOAL! ${scorer?.name ?? e.scorerId} (${e.team}) — ${e.score.A}–${e.score.B}`,
    { playerId: e.scorerId, data: { score: e.score } },
  );
});

// ── Defensive events ──────────────────────────────────────────────────────────

gameBus.on('tackle', e => {
  const tackler = p(e.player);
  const target  = p(e.targetId);
  debugLog('tackle',
    `${tackler?.name ?? e.player} ${e.success ? 'wins' : 'loses'} tackle vs ${target?.name ?? e.targetId} (${pct(e.chance)})`,
    { playerId: e.player, data: { success: e.success } },
  );
  if (e.success) {
    debugLog('possession',
      `${tackler?.name ?? e.player} (${tackler?.team ?? '?'}) takes possession`,
      { playerId: e.player },
    );
  }
});

gameBus.on('interception', e => {
  const interceptor = p(e.player);
  debugLog('interception',
    `${interceptor?.name ?? e.player} ${e.success ? 'intercepts' : 'fails to intercept'} (${pct(e.chance)})`,
    { playerId: e.player, data: { success: e.success } },
  );
  if (e.success) {
    debugLog('possession',
      `${interceptor?.name ?? e.player} (${interceptor?.team ?? '?'}) takes possession via interception`,
      { playerId: e.player },
    );
  }
});

// ── Dribble events ────────────────────────────────────────────────────────────

gameBus.on('dribble', e => {
  const attacker = p(e.player);
  const defender = p(e.targetId);
  debugLog('dribble',
    `${attacker?.name ?? e.player} ${e.success ? 'dribbles' : 'fails to dribble'} ${defender?.name ?? e.targetId} (${pct(e.chance)})`,
    { playerId: e.player, data: { success: e.success } },
  );
  if (!e.success) {
    debugLog('possession',
      `${defender?.name ?? e.targetId} (${defender?.team ?? '?'}) takes possession via dribble win`,
      { playerId: e.targetId },
    );
  }
});

// ── Offside events ────────────────────────────────────────────────────────────

gameBus.on('offsideCalled', e => {
  const receiver = p(e.receiverId);
  debugLog('offside',
    `OFFSIDE — ${receiver?.name ?? e.receiverId} (${e.team})`,
    { playerId: e.receiverId },
  );
});
